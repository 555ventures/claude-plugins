export const meta = {
  name: 'spec-review',
  description: 'Independent shape+correctness review of a spec implementation with a refutation filter',
  whenToUse: 'Invoked by /spec:review after /spec:build completes',
  phases: [
    { title: 'Review', detail: 'blind reviewers: shape + correctness vs spec' },
    { title: 'Refute', detail: 'claim-only refuters; hard findings die only on 2/2 refutes' },
  ],
}

// args: {
//   specPath: string,
//   tier: 'T2' | 'T3',
//   base: string,            // git diff base (originating branch or main)
//   patterns: string,        // output of the host's pattern-sweep script (config patternsScript)
//   hasDriftScript: boolean, // host config declares driftScript? when false, the reviewer's
//                            // AC ↔ test coverage check IS the drift gate (missing test = hard)
// }

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['hard', 'medium', 'soft'] },
          claim: { type: 'string', description: 'self-contained one-paragraph claim, verifiable from code + spec alone' },
          rule: { type: 'string', description: 'rule file § or spec section violated' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'line', 'severity', 'claim', 'rule'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
}

const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string', description: 'concrete evidence (file:line, rule §, spec §) for the verdict' },
  },
  required: ['refuted', 'reason'],
}

const DRIFT_NOTE = args.hasDriftScript
  ? ''
  : ' (this repo has no AC-drift script — THIS check is the drift gate; a missing test is hard)'

const EMPHASES = [
  'Primary emphasis: design integrity — root-cause fixes vs duct tape, shortcut shapes (backward-compat shims, suppression markers, test-expectation abuse, defensive fallbacks that mask shape bugs instead of fixing the shape, half-done implementations, deferred-work comments), and spec drift (the diff doing things the spec never said).',
  `Primary emphasis: rule compliance and correctness — every File Plan entry present and matching, Contracts implemented as written, Decisions table honored, every AC covered by a real test${DRIFT_NOTE}, wiring complete (new surfaces reachable from their entry points; registrations, exports, and routes match the spec's public surface), and the host's architectural boundaries and managed/generated surfaces respected (per .claude/rules/).`,
]

function reviewerPrompt(i) {
  return `You are independently reviewing a spec implementation. Severity calibration:
"hard" = violates an explicit project rule (CLAUDE.md / .claude/rules / the host's standards docs) or contradicts the spec;
"medium" = bends a rule's intent without breaking it; "soft" = hygiene only.

${EMPHASES[i]}
Cover BOTH shape and correctness regardless of emphasis.

Method:
1. Read the spec at ${args.specPath} (File Plan, Contracts, UI, Decisions, Acceptance Criteria).
2. Run: git diff ${args.base} -- <directories from the spec's File Plan>. Read any new files the diff adds.
3. Check the implementation against the spec and against the project rules you inherit via CLAUDE.md and .claude/rules/.
4. Cross-check the mechanical pattern sweep below — confirm or dismiss each non-zero row.

## Mechanical pattern sweep (pre-computed)
${args.patterns}

Report only what you find — an empty findings list is a valid outcome for a clean implementation.
Every finding needs a file:line you actually verified and a self-contained "claim" paragraph that
someone can verify without your reasoning. Do not report scope/over-engineering opinions (the
user's call), do not report things the spec explicitly decided (Decisions table), and do not
report visual/styling choices on components approved via /spec:design (designed: in frontmatter).
You are read-only: never edit any file.`
}

const REFUTER_LENSES = [
  'Check the claim against the actual code: is the cited line real, does it do what the claim says, is the claim misreading control flow or types?',
  'Check the claim against the rules and spec: is this a sanctioned exception (the host\'s rule files list several), something the spec\'s Decisions table explicitly chose or /spec:design approved, or a rule misapplied out of context?',
]

function refuterPrompt(f, i) {
  return `Independent verification of a single review claim. You see ONLY the claim, not the
reviewer's reasoning — judge it from primary sources.

Claim (severity: ${f.severity}, cited rule: ${f.rule}):
"${f.claim}"
Location: ${f.file}:${f.line}

${REFUTER_LENSES[i % REFUTER_LENSES.length]}
Also read the spec at ${args.specPath} where relevant.

Return refuted=true ONLY if you can demonstrate with concrete evidence (file:line, rule §, spec §)
that the claim is incorrect, misread, or sanctioned. If the claim stands or you are uncertain,
return refuted=false. You are read-only: never edit any file.`
}

// ---- Phase: blind review panel ----
phase('Review')
const n = args.tier === 'T3' ? 2 : 1
const panels = await parallel(Array.from({ length: n }, (_, i) => () =>
  agent(reviewerPrompt(i), {
    label: `review:${i + 1}`, phase: 'Review', schema: FINDINGS, model: 'sonnet',
    agentType: 'spec:spec-reviewer',
  })))

const seen = new Set()
const findings = []
for (const p of panels.filter(Boolean)) {
  for (const f of p.findings) {
    const key = `${f.file}:${f.line}:${f.severity}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(f)
  }
}
log(`${findings.length} unique findings from ${n} reviewer(s)`)

if (!findings.length) {
  return { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: n }
}

// ---- Phase: refutation filter (claim-only, severity-calibrated kill rules) ----
phase('Refute')
const judged = await parallel(findings.map(f => () => {
  const k = f.severity === 'hard' ? 2 : 1
  return parallel(Array.from({ length: k }, (_, i) => () =>
    agent(refuterPrompt(f, i), {
      label: `refute:${f.file.split('/').pop()}:${f.line}:${i + 1}`,
      phase: 'Refute', schema: VERDICT, model: 'sonnet',
    })))
    .then(votes => {
      const valid = votes.filter(Boolean)
      const refutes = valid.filter(v => v.refuted)
      // Kill rule: ALL refuters must refute (hard: 2/2, medium/soft: 1/1).
      const killed = valid.length > 0 && refutes.length === valid.length
      return { ...f, killed, refuteReasons: refutes.map(v => v.reason) }
    })
}))

const survivors = judged.filter(Boolean).filter(f => !f.killed)
const killed = judged.filter(Boolean).filter(f => f.killed)
log(`${survivors.length} findings survived, ${killed.length} killed by refutation`)

return {
  verdict: survivors.some(f => f.severity === 'hard') ? 'HARD_FINDINGS'
    : survivors.length ? 'FINDINGS' : 'CLEAN',
  survivors,
  killed,
  reviewerCount: n,
}
