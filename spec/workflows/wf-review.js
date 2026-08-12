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
//   reconcilePath: string,    // path to scope-reconcile.js --json output (Phase 0); '' when
//                             // scope==='fix-delta' — the diff IS the fix, no File Plan to
//                             // reconcile against. Full scope: out-of-plan files are already a
//                             // mechanical finding, reviewers only judge their CONTENT.
//   hasDriftScript: boolean,  // host config declares driftScript? when false, the DRIFT_NOTE
//                             // tells the reviewer the Phase 0 grep matrix is the drift gate
//                             // and their AC ↔ test check is the semantic backstop
//   reproCommand: string,     // host's test-runner prefix (config testCommand — repro file
//                             // path is appended); '' = verifier agents discover the runner
//                             // from package.json / CLAUDE.md
//   frozenRoot: string,       // '' when root HEAD is still the spec's last commit. When the
//                             // review waited (e.g. on CI) and later specs landed, HEAD has
//                             // moved and a naive diff sweeps their files in (UPWELL-20260810-02:
//                             // 27 files, 26 from other specs); the orchestrator detaches a
//                             // frozen worktree at the spec's last commit and passes its path —
//                             // reviewers read and diff THERE, so the panel sees exactly this
//                             // spec's change. Verifier repros still run at the project root:
//                             // executed evidence must come from the tree that ships.
// }

// Reviewers diff in the frozen worktree when the orchestrator supplied one ('' = HEAD never moved).
const REVIEW_ROOT = args.frozenRoot || '.'

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

// Smell lens: cross-file semantic duplication + error masking, advisory-only by construction
// (D2). `counterpart` is REQUIRED for the duplication class in practice — the code filter after
// the lens returns drops any duplication smell lacking one (D6); the schema leaves it optional
// because a schema `if/then` may not be honored by the harness validator.
const LENS = {
  type: 'object',
  properties: {
    smells: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          class: { type: 'string', enum: ['duplication', 'error-masking'] },
          claim: { type: 'string', description: 'self-contained one-paragraph claim, verifiable from code alone' },
          counterpart: { type: 'string', description: 'file:line of the existing symbol whose job the diff symbol re-does (duplication: REQUIRED — findings without it are dropped after return) or of the masked contract/shape source (error-masking: when identifiable)' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'line', 'class', 'claim'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['smells', 'summary'],
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
  : ' (this repo has no AC-drift script — the Phase 0 grep matrix is the deterministic drift gate; your AC↔test check is the semantic backstop — a test that names an AC-ID without testing the behavior is still hard)'

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
2. Run: git -C ${REVIEW_ROOT} diff ${args.base}. This is the WHOLE change, unscoped from the
   File Plan — read any new files the diff adds, including any outside the plan's directories.${args.frozenRoot ? `
   Work inside ${args.frozenRoot} for ALL reads and diffs: it is a frozen worktree detached at
   this spec's last commit, because later specs have since landed on the branch — files outside
   it may show other specs' unreviewed changes.` : ''}
3. Check the implementation against the spec and against the project rules you inherit via CLAUDE.md and .claude/rules/.
4. Cross-check the mechanical pattern sweep below — confirm or dismiss each non-zero row.
5. Read ${args.reconcilePath} — the scope reconciliation (out-of-plan / unrealized / renamed
   files vs the File Plan). Its \`outOfPlan\` entries are ALREADY a mechanical hard finding —
   do not re-report their mere existence. Instead review THEIR CONTENT against spec intent and
   repo rules, same as any planned file, and report only substantive defects you find in them.

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
2. Run: git -C ${REVIEW_ROOT} diff ${args.base} — this diff is exactly the fix work since that review.
3. For each prior finding: verify the fix actually resolves the claim (read the changed code,
   not the commit message). An unresolved or partially resolved finding goes back into your
   findings output unchanged (same file/line/severity/claim/rule).
4. Review the changed lines themselves for NEW defects the fixes introduced — the spec is at
   ${args.specPath}; your agent doctrine (system prompt) carries the severity calibration,
   finding requirements, and sanctioned-exception checks, same as any review.

Do NOT re-review unchanged code — this pass is scoped to the fix diff and the prior findings.
You are read-only: never edit any file.`
}

// Advisory smell lens: two research-backed AI-signature smell classes the deterministic ratchet
// layer cannot see. Runs only on full-scope reviews (D5) — a fix diff is already a response to
// findings, so re-paying the lens per fix-delta iteration is the cost pattern fix-delta exists
// to delete. Output travels ONLY on the `smells` field (D2) — never into `findings`, never into
// the verify loop.
function lensPrompt() {
  return `You are scanning a spec implementation diff for exactly two advisory smell classes.
You report ONLY these two classes — never correctness, style, or scope opinions; those are the
review panel's job, not yours.

1. Read the spec at ${args.specPath} for context (what the diff is meant to do).
2. Run: git -C ${REVIEW_ROOT} diff ${args.base}.${args.frozenRoot ? ` Work inside
   ${args.frozenRoot} for ALL reads and diffs: it is a frozen worktree detached at this spec's
   last commit.` : ''}
3. For each added/changed symbol, run targeted repo lookups (grep for same-purpose helpers by
   name fragments and by behavior-adjacent tokens) to check for the two classes below.

Classes (closed set — report nothing else):
- **duplication**: a diff symbol re-implements a job an existing repo symbol already does. You
  MUST cite both locations — \`counterpart\` is the existing symbol's file:line. A finding
  without \`counterpart\` will be dropped; do not report duplication you cannot pin to a
  specific existing symbol.
- **error-masking**: a catch/fallback/default in the diff converts a shape or contract bug into
  wrong-but-green behavior, AND adjudicating that requires cross-file context — the masked
  shape/contract lives outside the diff. Legitimate defensive coding at a trust boundary is not
  a finding. A masking pattern fully visible in-diff (the masked contract is in the same diff)
  is the review panel's existing defensive-fallback check — skip it, do not double-report it
  here.

An empty \`smells\` list is the expected outcome for most diffs — do not strain for findings.
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
   A wrong line number alone is never a miscitation: before ruling MISCITED, grep the WHOLE file
   for the claimed content, not just the cited line. If it exists elsewhere in the file, treat the
   citation as a line typo, use the real location, and move on to the next step.
   If your ruling would rest on a file or directory not existing, first prove your working tree is
   the review's actual target — run \`git log -1\` from the repo root and sanity-check it against
   the diff under review. Agent CWDs can land in a stale .claude/worktrees checkout instead of the
   review target, and a nonexistence kill from an unverified (possibly stale) worktree is invalid.
   Self-consistency is mandatory: if the evidence you quote confirms the claim's substance, MISCITED is forbidden — your structured result must agree with your own evidence, and
   uncertainty resolves toward the finding standing.
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
const panelThunks = Array.from({ length: n }, (_, i) => () =>
  agent(fixDelta ? fixDeltaPrompt() : reviewerPrompt(i), {
    label: fixDelta ? 'review:fix-delta' : `review:${i + 1}`,
    phase: 'Review', schema: FINDINGS, model: 'sonnet',
    agentType: 'spec:reviewer',
  }))
// Lens thunk appended to the SAME parallel() barrier as the panel (D1) — never launched on
// fix-delta (D5). No `agentType`: this is the verify-phase pattern, not the panel's — copying
// the panel's `agentType: 'spec:reviewer'` would load reviewer.md, including this spec's own
// "reviewers do not stretch for cross-file smells" carve-out, as the lens's own system prompt.
if (!fixDelta) {
  panelThunks.push(() => agent(lensPrompt(), {
    label: 'review:smell-lens',
    phase: 'Review', schema: LENS, model: 'sonnet',
  }))
}
const barrier = await parallel(panelThunks)
const panels = barrier.slice(0, n)
const lensResult = fixDelta ? null : barrier[n]

// FAIL CLOSED: a reviewer that died (null result) is NOT a clean review. Without this, a
// crashed sole reviewer filters to zero findings and the run returns CLEAN — the exact
// false-green this gate exists to prevent. The orchestrator re-invokes (journal-cached).
// The lens NEVER counts toward this — it fails open (D4), computed from the panel slice only.
const failedReviewers = panels.filter(p => !p).length

// FAIL OPEN: the lens's only failure cost is missed advisory recall, never a gate stop — a
// null lens result yields an empty, visibly-flagged smells list (D4). D6's code filter drops
// any duplication smell lacking a non-empty counterpart (schema `if/then` support unverified).
const lensOutcome = fixDelta ? { smells: [], lensFailed: false }
  : !lensResult ? { smells: [], lensFailed: true }
  : (() => {
      const rawSmells = lensResult.smells || []
      const droppedForCounterpart = rawSmells.filter(s => s.class === 'duplication' && !s.counterpart)
      if (droppedForCounterpart.length) {
        log(`smell lens: dropped ${droppedForCounterpart.length} duplication finding(s) missing counterpart`)
      }
      return { smells: rawSmells.filter(s => !(s.class === 'duplication' && !s.counterpart)), lensFailed: false }
    })()
const { smells, lensFailed } = lensOutcome

if (failedReviewers) {
  return {
    verdict: 'REVIEWER_FAILED', failedReviewers, reviewerCount: n,
    survivors: [], killed: [], scope: fixDelta ? 'fix-delta' : 'full', tokens: budget.spent(),
    smells, lensFailed,
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
    smells, lensFailed,
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
  smells,
  lensFailed,
}
