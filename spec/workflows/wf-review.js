export const meta = {
  name: 'wf-review',
  description: 'Independent shape+correctness review of a spec implementation with a refutation filter',
  whenToUse: 'Invoked by /spec:review after /spec:build completes',
  phases: [
    { title: 'Review', detail: 'blind reviewers: shape + correctness vs spec' },
    { title: 'Refute', detail: 'claim-only refuters; hard findings die only on 2/2 refutes' },
    { title: 'Audit', detail: 'execution audit of kills — a demonstrated defect overturns the vote' },
  ],
}

// Normalize `args` before any use. The harness convention has varied: some versions deliver the
// object verbatim, others JSON-encode it as a string on the scriptPath channel. We accept both,
// tolerate accidental double-encoding, and on failure throw a message that shows what actually
// arrived (length + preview) instead of a bare "Unable to parse JSON string" at the call site.
function normalizeArgs(raw) {
  let v = raw
  // Unwrap up to 2 layers of JSON-string encoding (single = older harness; double = caller bug).
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    const s = v.trim()
    if (s === '[object Object]') {
      throw new Error('wf-review: args arrived String()-coerced to "[object Object]" — the ' +
        'caller stringified the object with String()/template interpolation instead of passing a ' +
        'real JSON object (or JSON.stringify). Pass `args` as a plain object in the Workflow call.')
    }
    try {
      v = JSON.parse(s)
    } catch (e) {
      throw new Error('wf-review: args was a string but not valid JSON (' + s.length +
        ' chars). This is structural corruption — free text / a non-scalar reached `args`, which ' +
        'must carry only paths, ids, enums, booleans, and command strings; prose lives on disk in ' +
        'the artifact the agents Read (spec / brief / rule docs). First 160 chars: ' +
        JSON.stringify(s.slice(0, 160)) + ' — parse error: ' + e.message)
    }
  }
  return v
}
args = normalizeArgs(args)
if (!args || typeof args !== 'object' || typeof args.specPath !== 'string') {
  throw new Error('wf-review: malformed args (expected the object documented below with a ' +
    'string `specPath`, got ' + (args === undefined ? 'undefined' : typeof args) +
    ') — pass the full args object to the Workflow call')
}

// args: {
//   specPath: string,
//   tier: 'T2' | 'T3',
//   base: string,            // git diff base (originating branch or main)
//   patternsPath: string,    // path to a file holding the host pattern-sweep output (config
//                            // patternsScript); reviewers READ it (args is a control channel)
//   hasDriftScript: boolean, // host config declares driftScript? when false, the reviewer's
//                            // AC ↔ test coverage check IS the drift gate (missing test = hard)
//   reproCommand: string,    // host's test-runner prefix (config testCommand — repro file
//                            // path is appended); '' = audit agents discover the runner
//                            // from package.json / CLAUDE.md
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

const AUDIT = {
  type: 'object',
  properties: {
    result: { type: 'string', enum: ['DEMONSTRATED', 'NOT_DEMONSTRABLE', 'NOT_EXECUTABLE'] },
    evidence: { type: 'string', description: 'the command run and the 1-3 observed output lines that justify the verdict (or why the claim is not executable)' },
  },
  required: ['result', 'evidence'],
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
Read ${args.patternsPath} — the host's mechanical shortcut-sweep output. Confirm or dismiss each non-zero row against the actual diff.

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
The claim cites "${f.rule}". In the spec at ${args.specPath}, read that cited section plus the
"Decisions" table (the host's sanctioned exceptions and the choices /spec:design approved are
recorded there) — that is normally all you need to judge it. If the cited section is missing,
ambiguous, or points elsewhere, widen your read until you can judge — never return a verdict on a
section you have not read.

Return refuted=true ONLY if you can demonstrate with concrete evidence (file:line, rule §, spec §)
that the claim is incorrect, misread, or sanctioned. If the claim stands or you are uncertain,
return refuted=false. You are read-only: never edit any file.`
}

function auditPrompt(f) {
  return `A review finding was killed by unanimous claim-only refutation. You are the execution
audit: the refuters argued from READING; you decide by RUNNING code. Your job is to try to
demonstrate the claimed defect — a successful repro overturns the kill, because ground truth
beats a vote.

Claim (severity: ${f.severity}, cited rule: ${f.rule}):
"${f.claim}"
Location: ${f.file}:${f.line}
Spec: ${args.specPath} (read the cited section + Decisions table for context; a behavior the
Decisions table explicitly sanctions is NOT a defect even if you can reproduce it).

Method:
1. If the claim cannot in principle be demonstrated by running code (naming conventions,
   layering/boundary rules, style) → result="NOT_EXECUTABLE". Do not force it.
2. Otherwise write a MINIMAL repro — one new test file or script inside the repo, nothing
   else — and run it. Host test command: ${args.reproCommand
    ? args.reproCommand + ' <path to your repro file>'
    : '(none declared — discover the single-file runner from package.json / CLAUDE.md)'}
3. result="DEMONSTRATED" if the run exhibits the claimed defect as described.
   result="NOT_DEMONSTRABLE" if your best good-faith repro fails to exhibit it.
4. Cleanup is MANDATORY and unconditional: delete every file you created and verify with
   git status --porcelain that no path you introduced remains, before returning.

evidence = the exact command you ran plus the 1-3 observed output lines that justify the
verdict. Never edit existing files; never run git commands other than status.`
}

// ---- Phase: blind review panel ----
phase('Review')
const n = args.tier === 'T3' ? 2 : 1
const panels = await parallel(Array.from({ length: n }, (_, i) => () =>
  agent(reviewerPrompt(i), {
    label: `review:${i + 1}`, phase: 'Review', schema: FINDINGS, model: 'sonnet',
    agentType: 'spec:reviewer',
  })))

// FAIL CLOSED: a reviewer that died (null result) is NOT a clean review. Without this, a
// crashed sole T2 reviewer filters to zero findings and the run returns CLEAN — the exact
// false-green this gate exists to prevent. The orchestrator re-invokes (journal-cached).
const failedReviewers = panels.filter(p => !p).length
if (failedReviewers) {
  return {
    verdict: 'REVIEWER_FAILED', failedReviewers, reviewerCount: n,
    survivors: [], killed: [], tokens: budget.spent(),
  }
}

const seen = new Set()
const findings = []
for (const p of panels) {
  for (const f of p.findings) {
    // Claim is part of the identity: two reviewers flagging the same line for DIFFERENT
    // defects are two findings, not a duplicate.
    const key = `${f.file}:${f.line}:${f.severity}:${f.claim}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(f)
  }
}
log(`${findings.length} unique findings from ${n} reviewer(s)`)

if (!findings.length) {
  return { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: n, tokens: budget.spent() }
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
      const refutes = votes.filter(Boolean).filter(v => v.refuted)
      // Kill rule: ALL DISPATCHED refuters must refute (hard: 2/2, medium/soft: 1/1). A refuter
      // that died is a missing vote, never an implicit refute — the finding survives it. (The old
      // valid.length comparison let a hard finding die 1/1 when its second refuter crashed.)
      const killed = refutes.length === k
      return { ...f, killed, refuteReasons: refutes.map(v => v.reason) }
    })
}))

const survivors = judged.filter(Boolean).filter(f => !f.killed)
const killed = judged.filter(Boolean).filter(f => f.killed)
log(`${survivors.length} findings survived, ${killed.length} killed by refutation`)

// ---- Phase: execution audit of kills ----
// Measured (2026-07 ledgers, two hosts): 42% of findings die in refutation, with no ground
// truth behind any kill. A killed-and-real finding is the worst outcome this gate can produce
// — a reviewer found a defect and the process un-found it, under a CLEAN stamp. So every
// non-soft kill gets one execution auditor that tries to DEMONSTRATE the claim; a successful
// repro overturns the vote. A crashed auditor leaves the kill standing but visibly counted in
// `audit.failed` (resurrect-on-crash would convert flaky sandboxes into survivor noise).
const MAX_KILL_AUDITS = 6
const auditableAll = killed.filter(f => f.severity !== 'soft')
const auditable = auditableAll.slice(0, MAX_KILL_AUDITS)
const cappedOut = auditableAll.slice(MAX_KILL_AUDITS)
const softKills = killed.filter(f => f.severity === 'soft')
let overturned = []
const stillKilled = [...softKills, ...cappedOut]
const audit = { audited: 0, overturned: 0, confirmed: 0, notExecutable: 0, failed: 0, capSkipped: cappedOut.length }
if (auditable.length) {
  phase('Audit')
  if (cappedOut.length) log(`kill audit capped at ${MAX_KILL_AUDITS} — ${cappedOut.length} non-soft kill(s) NOT audited`)
  const verdicts = await parallel(auditable.map(f => () =>
    agent(auditPrompt(f), {
      label: `audit:${f.file.split('/').pop()}:${f.line}`,
      phase: 'Audit', schema: AUDIT, model: 'sonnet',
    })))
  auditable.forEach((f, i) => {
    const a = verdicts[i]
    if (!a) { audit.failed++; stillKilled.push(f); return }
    audit.audited++
    if (a.result === 'DEMONSTRATED') {
      audit.overturned++
      overturned.push({ ...f, killed: false, overturnedKill: true, reproEvidence: a.evidence })
    } else if (a.result === 'NOT_EXECUTABLE') {
      audit.notExecutable++
      stillKilled.push(f)
    } else {
      audit.confirmed++
      stillKilled.push({ ...f, executionConfirmed: true, auditEvidence: a.evidence })
    }
  })
  log(`${audit.overturned} kill(s) overturned by execution, ${audit.confirmed} confirmed, ${audit.notExecutable} not executable, ${audit.failed} audit failure(s)`)
}

const finalSurvivors = [...survivors, ...overturned]

return {
  verdict: finalSurvivors.some(f => f.severity === 'hard') ? 'HARD_FINDINGS'
    : finalSurvivors.length ? 'FINDINGS' : 'CLEAN',
  survivors: finalSurvivors,
  killed: stillKilled,
  audit,
  reviewerCount: n,
  tokens: budget.spent(),
}
