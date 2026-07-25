export const meta = {
  name: 'wf-review',
  description: 'Independent shape+correctness review of a spec implementation with execution-grounded verification',
  whenToUse: 'Invoked by /spec:review after /spec:build completes',
  phases: [
    { title: 'Review', detail: 'blind reviewers: shape + correctness vs spec (diff-scaled panel)' },
    { title: 'Verify', detail: 'one execution-grounded verifier per finding — kills need a repro contradiction, a quoted sanction, or a miscitation, never an argument' },
  ],
}

// Normalize `args` before any use. The harness convention has varied: some versions deliver the
// object verbatim, others JSON-encode it as a string on the scriptPath channel. We accept both,
// tolerate accidental double-encoding, and on failure throw a message that shows what actually
// arrived (length + preview) instead of a bare "Unable to parse JSON string" at the call site.
// @fragment:normalize-args
args = normalizeArgs(args)
if (!args || typeof args !== 'object' || typeof args.specPath !== 'string') {
  throw new Error('wf-review: malformed args (expected the object documented below with a ' +
    'string `specPath`, got ' + (args === undefined ? 'undefined' : typeof args) +
    ') — pass the full args object to the Workflow call')
}

// args: {
//   specPath: string,
//   tier: 'T2' | 'T3',
//   base: string,             // git diff base. Full scope: the originating branch/commit the
//                             // build started from. fix-delta scope: the commit the PREVIOUS
//                             // review iteration ran at — only the fixes get re-reviewed.
//   scope: 'full' | 'fix-delta',  // fix-delta = re-review after fix dispatches: one reviewer
//                             // reads only the fix diff + the surviving-findings file; a full
//                             // re-review is paid only when fixes touched files outside the
//                             // prior finding set (the orchestrator decides that, not this script)
//   prevFindingsPath: string, // fix-delta only: path to a JSON file the orchestrator wrote
//                             // holding the prior iteration's surviving findings ('' on full) —
//                             // findings travel as a path, args stays a control channel
//   diffLoc: integer,         // insertions+deletions of the diff under review (git shortstat);
//                             // scales the panel: small diffs never pay a 2-reviewer panel.
//                             // 0/absent = unknown → fall back to the tier rule.
//   patternsPath: string,     // path to a file holding the host pattern-sweep output (config
//                             // patternsScript); reviewers READ it (args is a control channel)
//   hasDriftScript: boolean,  // host config declares driftScript? when false, the reviewer's
//                             // AC ↔ test coverage check IS the drift gate (missing test = hard)
//   reproCommand: string,     // host's test-runner prefix (config testCommand — repro file
//                             // path is appended); '' = verifier agents discover the runner
//                             // from package.json / CLAUDE.md
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

const VERIFY = {
  type: 'object',
  properties: {
    result: {
      type: 'string',
      enum: ['DEMONSTRATED', 'NOT_DEMONSTRABLE', 'NOT_EXECUTABLE', 'SANCTIONED', 'MISCITED'],
    },
    evidence: {
      type: 'string',
      description: 'DEMONSTRATED/NOT_DEMONSTRABLE: the command run + 1-3 observed output lines. SANCTIONED: the spec Decisions/design row quoted verbatim. MISCITED: the actual content at the cited location, quoted. NOT_EXECUTABLE: why no repro can decide this claim.',
    },
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
  return `You are independently reviewing a spec implementation. Your agent doctrine (system
prompt) carries the severity calibration, finding requirements, and sanctioned-exception
checks — apply them as written.

${EMPHASES[i]}
Cover BOTH shape and correctness regardless of emphasis.

Method:
1. Read the spec at ${args.specPath} (File Plan, Contracts, UI, Decisions, Acceptance Criteria).
2. Run: git diff ${args.base} -- <directories from the spec's File Plan>. Read any new files the diff adds.
3. Check the implementation against the spec and against the project rules you inherit via CLAUDE.md and .claude/rules/.
4. Cross-check the mechanical pattern sweep below — confirm or dismiss each non-zero row.

## Mechanical pattern sweep (pre-computed)
Read ${args.patternsPath} — the host's mechanical shortcut-sweep output. Confirm or dismiss each non-zero row against the actual diff.

Do not report review-stage-owned artifacts as missing: the spec's Canonical Delta (applied to
docs/canonical/) and the frontmatter status flip are applied by /spec:review AFTER your verdict —
their absence from the diff is the expected precondition, never a finding.
You are read-only: never edit any file.`
}

// fix-delta: the cheap re-review after fix dispatches. One reviewer, scoped to the fix diff +
// the prior survivors — a full panel re-read of an unchanged codebase is the cost this mode
// deletes (measured: fix→re-review loops paying a full panel per iteration were the single
// most expensive review pattern in the 2026-07 ledgers).
function fixDeltaPrompt() {
  return `You are re-reviewing ONLY the fixes applied after a prior review of a spec implementation.

Method:
1. Read ${args.prevFindingsPath} — the prior iteration's surviving findings (JSON).
2. Run: git diff ${args.base} — this diff is exactly the fix work since that review.
3. For each prior finding: verify the fix actually resolves the claim (read the changed code,
   not the commit message). An unresolved or partially resolved finding goes back into your
   findings output unchanged (same file/line/severity/claim/rule).
4. Review the changed lines themselves for NEW defects the fixes introduced — the spec is at
   ${args.specPath}; your agent doctrine (system prompt) carries the severity calibration,
   finding requirements, and sanctioned-exception checks, same as any review.

Do NOT re-review unchanged code — this pass is scoped to the fix diff and the prior findings.
You are read-only: never edit any file.`
}

// One verifier per non-soft finding. Kills are GROUNDED or they don't happen: a kill requires
// (a) a good-faith repro that contradicts the claim, (b) a verbatim-quoted spec sanction, or
// (c) a plain miscitation — never a reasoning chain. Measured basis (2026-07 ledgers): the old
// claim-only refutation layer killed almost nothing (4 findings across two hosts' full windows)
// and, when its kills were execution-audited, 2 of 3 were overturned — argument-based kills ran
// a false-kill rate the pipeline could not afford. This phase replaces refute+audit outright.
function verifyPrompt(f) {
  return `A review finding needs verification. You decide by EVIDENCE — running code and quoting
primary sources — never by argument. Uncertainty always resolves toward the finding standing.

Claim (severity: ${f.severity}, cited rule: ${f.rule}):
"${f.claim}"
Location: ${f.file}:${f.line}

Work through these in order and return the FIRST result that applies:

1. MISCITED — Read ${f.file} around line ${f.line}. If the cited location does not exist or
   plainly does not contain what the claim asserts about it, return result="MISCITED" with the
   actual content at that location quoted verbatim as evidence. This is a fact check, not a
   judgment call — when the code is there and merely arguable, move on.
2. SANCTIONED — In the spec at ${args.specPath}, read the section the claim cites plus the
   "Decisions" table (sanctioned exceptions and /spec:design-approved choices are recorded
   there). If an explicit Decision or approval sanctions exactly this behavior, return
   result="SANCTIONED" with that row quoted verbatim as evidence. An inference from a related
   decision is NOT a sanction.
3. If the claim cannot in principle be decided by running code (naming conventions,
   layering/boundary rules, style) → result="NOT_EXECUTABLE" with a one-line reason. Do not
   force a repro; the orchestrating session adjudicates these.
4. Otherwise write a MINIMAL repro — one new test file or script inside the repo, nothing
   else — and run it. Host test command: ${args.reproCommand
    ? args.reproCommand + ' <path to your repro file>'
    : '(none declared — discover the single-file runner from package.json / CLAUDE.md)'}
   result="DEMONSTRATED" if the run exhibits the claimed defect as described.
   result="NOT_DEMONSTRABLE" if your best good-faith repro fails to exhibit it.
   evidence = the exact command you ran plus the 1-3 observed output lines.
   Cleanup is MANDATORY and unconditional: delete every file you created and verify with
   git status --porcelain that no path you introduced remains, before returning.

Never edit existing files; never run git commands other than status.`
}

// ---- Phase: blind review panel (diff-scaled) ----
phase('Review')
const fixDelta = args.scope === 'fix-delta'
// Panel size: fix-delta always 1. Full scope: 2 reviewers only where the stakes justify a
// panel — T3 AND a non-small diff. diffLoc 0/absent = unknown → tier rule alone (fail toward
// the old behavior, not toward a thinner panel on missing data).
const n = fixDelta ? 1
  : (args.tier === 'T3' && (!args.diffLoc || args.diffLoc >= 300) ? 2 : 1)
const panels = await parallel(Array.from({ length: n }, (_, i) => () =>
  agent(fixDelta ? fixDeltaPrompt() : reviewerPrompt(i), {
    label: fixDelta ? 'review:fix-delta' : `review:${i + 1}`,
    phase: 'Review', schema: FINDINGS, model: 'sonnet',
    agentType: 'spec:reviewer',
  })))

// FAIL CLOSED: a reviewer that died (null result) is NOT a clean review. Without this, a
// crashed sole reviewer filters to zero findings and the run returns CLEAN — the exact
// false-green this gate exists to prevent. The orchestrator re-invokes (journal-cached).
const failedReviewers = panels.filter(p => !p).length
if (failedReviewers) {
  return {
    verdict: 'REVIEWER_FAILED', failedReviewers, reviewerCount: n,
    survivors: [], killed: [], scope: fixDelta ? 'fix-delta' : 'full', tokens: budget.spent(),
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
  return {
    verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: n,
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0, miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    scope: fixDelta ? 'fix-delta' : 'full', tokens: budget.spent(),
  }
}

// ---- Phase: execution-grounded verification, one verifier per non-soft finding ----
// Soft findings skip verification entirely: hygiene claims are cheap to adjudicate in-session
// and a repro can't decide them — they pass through flagged as advisory.
phase('Verify')
const MAX_VERIFIES = 12
const verifiableAll = findings.filter(f => f.severity !== 'soft')
const verifiable = verifiableAll.slice(0, MAX_VERIFIES)
const capped = verifiableAll.slice(MAX_VERIFIES)
const soft = findings.filter(f => f.severity === 'soft')

const survivors = soft.map(f => ({ ...f, verification: 'advisory' }))
// FAIL CLOSED: findings past the cap survive UNVERIFIED and visibly flagged — a cap must
// never quietly kill or quietly confirm.
for (const f of capped) survivors.push({ ...f, verification: 'cap-skipped' })
const killed = []
const verify = { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0, miscited: 0, unverifiable: 0, failed: 0, capSkipped: capped.length }

if (verifiable.length) {
  if (capped.length) log(`verification capped at ${MAX_VERIFIES} — ${capped.length} finding(s) survive unverified`)
  const verdicts = await parallel(verifiable.map(f => () =>
    agent(verifyPrompt(f), {
      label: `verify:${f.file.split('/').pop()}:${f.line}`,
      phase: 'Verify', schema: VERIFY, model: 'sonnet',
    })))
  verifiable.forEach((f, i) => {
    const v = verdicts[i]
    // FAIL CLOSED: a crashed verifier is a missing verdict, never a kill and never a silent
    // confirm — the finding survives, flagged, for session adjudication.
    if (!v) { verify.failed++; survivors.push({ ...f, verification: 'verifier-failed' }); return }
    verify.verified++
    if (v.result === 'DEMONSTRATED') {
      verify.demonstrated++
      survivors.push({ ...f, verification: 'demonstrated', evidence: v.evidence })
    } else if (v.result === 'NOT_EXECUTABLE') {
      verify.unverifiable++
      survivors.push({ ...f, verification: 'unverifiable', evidence: v.evidence })
    } else if (v.result === 'SANCTIONED') {
      verify.sanctioned++
      killed.push({ ...f, killedBy: 'sanction', evidence: v.evidence })
    } else if (v.result === 'MISCITED') {
      verify.miscited++
      killed.push({ ...f, killedBy: 'miscitation', evidence: v.evidence })
    } else {
      verify.killedByExecution++
      killed.push({ ...f, killedBy: 'execution', evidence: v.evidence })
    }
  })
  log(`${verify.demonstrated} demonstrated, ${verify.killedByExecution} killed by execution, ` +
    `${verify.sanctioned} sanctioned, ${verify.miscited} miscited, ${verify.unverifiable} unverifiable, ` +
    `${verify.failed} verifier failure(s)`)
}

return {
  verdict: survivors.some(f => f.severity === 'hard') ? 'HARD_FINDINGS'
    : survivors.length ? 'FINDINGS' : 'CLEAN',
  survivors,
  killed,
  verify,
  reviewerCount: n,
  scope: fixDelta ? 'fix-delta' : 'full',
  tokens: budget.spent(),
}
