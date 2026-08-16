'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, tmpdir, runNode } = require('../helpers')
const fs = require('fs')
const path = require('path')

// 2026-08-12 spec 20260812/01-review-smell-lens: pins the advisory-only smell lens (semantic
// duplication + error masking) that wf-review launches in the panel `parallel()` barrier and
// that must never touch the verification kill loop, verdict.js, or the ledger row. Modes used:
// (1) source-shape regex/brace pins over wf-review.body.js (workflow bodies can't be require()d
// — see tests/helpers.js extractFn commentary), (2) exec-a-script checks against verdict.js in
// a tmpdir via runNode, (3) doctrine regex pins over review.md/reviewer.md/init.md/
// spec-pipeline.md. AC-20260812-01-1..7 below; AC-8 is satisfied by the pre-existing
// tests/consistency/drift-reconcile.test.js and tests/workflow-guards.test.js staying green
// (no new test — File Plan deliberately omits a row for them).
//
// 2026-08-15 spec 20260815/01-recurrence-carriers D3 (colliding-pin Gotcha): two AC-20260812-01-6
// pin halves and AC-20260813-07-7's literal are retargeted IN PLACE, never weakened — the batched
// keep/drop AskUserQuestion is deleted in favor of a `spec-paths advisory-append` invocation
// (AC-20260815-01-7), and "{M} accepted" becomes "{M} recorded" now that audit, not review,
// decides a row's fate (AC-20260815-01-8). The return-shape pin and the never-enters-verdict pin
// are untouched but retagged as this spec's regression pin (AC-20260815-01-9). AC-20260815-01-15
// is net-new: scaffold-ledger.md's Review smell lens row and its two new sibling rows (D4).

// ---------------------------------------------------------------------------
// helpers: brace/paren-balanced extraction, mirroring tests/helpers.js extractFn's approach
// ---------------------------------------------------------------------------

// Extract every top-level `return {...}` block from a source string via brace counting
// (a plain non-greedy regex breaks on the CLEAN return's nested `verify: {...}` literal).
function extractReturnBlocks(src) {
  const blocks = []
  const re = /return\s*\{/g
  let m
  while ((m = re.exec(src))) {
    const openBrace = src.indexOf('{', m.index)
    let depth = 0
    for (let i = openBrace; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) {
        blocks.push(src.slice(m.index, i + 1))
        re.lastIndex = i + 1
        break
      }
    }
  }
  return blocks
}

// Extract one paren-balanced call starting at the index of its opening '(' character.
function extractParenBalanced(src, openParenIdx) {
  let depth = 0
  for (let i = openParenIdx; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(openParenIdx, i + 1)
  }
  throw new Error('unbalanced parens starting at ' + openParenIdx)
}

// Full green manifest for verdict.js's `full`-scope required leg set (REVIEW_LEGS).
//
// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-9, self-application, CONTINUE TO):
// `at-risk` joins REVIEW_LEGS as a required-but-non-blocking leg — this spec's own adversarial
// pass named this fixture as one of the four suites its own required-leg extension would redden.
// The row is added here so the two tests below CONTINUE TO derive the same verdict words they
// already assert.
function greenManifest() {
  return [
    { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
    { leg: 'smoke', exit: 0, observed: 'pass' },
    { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
    { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
    { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
    { leg: 'ci', exit: 0, observed: 'unavailable' },
    { leg: 'at-risk', exit: 0, observed: 'files=0' },
  ].map(r => JSON.stringify(r)).join('\n') + '\n'
}

function writeVerdictFixture(dir, workflow) {
  const manifestPath = path.join(dir, 'manifest.jsonl')
  const workflowPath = path.join(dir, 'workflow.json')
  fs.writeFileSync(manifestPath, greenManifest())
  fs.writeFileSync(workflowPath, JSON.stringify(workflow))
  return { manifestPath, workflowPath }
}

// ---------------------------------------------------------------------------
// AC-20260812-01-1 — smells + lensFailed present in all three return-object sites; lens
// results never pushed into `findings`
// ---------------------------------------------------------------------------

test('AC-20260812-01-1: every workflow-return site in wf-review.body.js carries both smells and lensFailed', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  // Workflow-return sites are the blocks carrying a `verdict:` key — the caller-facing
  // returns D2 governs. Helper-internal returns (e.g. auditKilled's {kept, resurrected},
  // added 2026-08-13 by spec 20260813/01) are not caller-facing and are out of this pin's
  // scope; an unfiltered scan tripped on them (2026-08-13 review of spec 20260813/02).
  const blocks = extractReturnBlocks(src).filter(b => /\bverdict:/.test(b))
  assert.ok(blocks.length >= 3,
    `wf-review.body.js must have at least the three return sites (REVIEWER_FAILED, ` +
    `zero-findings CLEAN, final) — found ${blocks.length}, so the AC's "every return{} block" ` +
    `pin has nothing to check`)
  blocks.forEach((b, i) => {
    assert.match(b, /\bsmells\b/,
      `return-object site #${i + 1} in wf-review.body.js is missing the smells field — a ` +
      `caller reading this return would get undefined smells on this path instead of the D2 ` +
      `additive field present on all three sites`)
    assert.match(b, /\blensFailed\b/,
      `return-object site #${i + 1} in wf-review.body.js is missing the lensFailed field — a ` +
      `caller cannot tell this path's lens run failed open, breaking D2's "present in all ` +
      `three" requirement`)
  })
})

test('AC-20260812-01-1: lens results are never pushed into the findings array — findings.push has exactly one call site (the panel-merge loop)', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  const pushMatches = src.match(/findings\.push/g) || []
  assert.strictEqual(pushMatches.length, 1,
    `wf-review.body.js must have exactly one findings.push call site (the panel-merge loop) — ` +
    `found ${pushMatches.length}; a second call site is the exact bypass-by-construction ` +
    `violation D2 forbids (lens output landing in the gate-feeding findings channel)`)
})

// ---------------------------------------------------------------------------
// AC-20260812-01-2 — the verify work list is derived solely from panel findings; no lens
// identifier appears between phase('Verify') and the final return{} token
// ---------------------------------------------------------------------------

test('AC-20260812-01-2: the verify work list is byte-derived from panel findings only (verifiableAll filter line is present)', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  assert.match(src, /const verifiableAll = findings\.filter\(f => f\.severity !== 'soft'\)/,
    'wf-review.body.js must keep the literal `const verifiableAll = findings.filter(f => ' +
    'f.severity !== \'soft\')` line byte-present — the spec requires the verify-phase work ' +
    'list to derive solely from panel findings, never from lens output')
})

test('AC-20260812-01-2: no lens identifier appears in the source between phase(\'Verify\') and the final return{} token', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  const verifyIdx = src.indexOf("phase('Verify')")
  assert.notStrictEqual(verifyIdx, -1,
    'wf-review.body.js must still contain phase(\'Verify\') — the anchor this AC scans from is missing')
  const blocks = extractReturnBlocks(src)
  assert.ok(blocks.length > 0, 'no return{} blocks found to anchor the final-return exclusion on')
  const finalBlock = blocks[blocks.length - 1]
  const finalReturnIdx = src.lastIndexOf(finalBlock)
  assert.ok(finalReturnIdx > verifyIdx,
    'the final return{} block must appear after phase(\'Verify\') in source order')
  const verifyPhaseBody = src.slice(verifyIdx, finalReturnIdx)
  for (const id of ['smells', 'LENS', 'lensPrompt', 'lensFailed']) {
    assert.doesNotMatch(verifyPhaseBody, new RegExp('\\b' + id + '\\b'),
      `the Verify-phase body (between phase('Verify') and the final return{} token, exclusive) ` +
      `must not reference "${id}" — the verification phase must never see lens output (D2); ` +
      `the final return object legitimately carries smells/lensFailed but nothing before it should`)
  }
})

// ---------------------------------------------------------------------------
// AC-20260812-01-3 — lens launched only outside fix-delta scope; failedReviewers from panel
// only; fail-open on null lens result; no agentType on the lens agent() call; duplication
// smells lacking counterpart are filtered
// ---------------------------------------------------------------------------

test('AC-20260812-01-3: failedReviewers is computed from the panel results only, not the lens', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  assert.match(src, /const failedReviewers = panels\.filter\(p => !p\)\.length/,
    'wf-review.body.js must keep failedReviewers derived only from `panels` (the reviewer ' +
    'panel results) — folding the lens result into this count would make a fail-open lens ' +
    'crash trigger REVIEWER_FAILED, contradicting D4\'s deliberate fail-open inversion')
})

test('AC-20260812-01-3: the lens schema LENS is defined with the closed class enum [duplication, error-masking]', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  assert.match(src, /const LENS\s*=\s*\{/,
    'wf-review.body.js must define a top-level `const LENS = {...}` schema per the spec ' +
    'Contracts block — its absence means the lens agent has no schema to launch with')
  const lensIdx = src.indexOf('const LENS')
  const lensSchemaChunk = src.slice(lensIdx, lensIdx + 1200)
  assert.match(lensSchemaChunk, /enum:\s*\[\s*'duplication'\s*,\s*'error-masking'\s*\]/,
    'the LENS schema\'s class property must be the closed two-value enum [\'duplication\', ' +
    '\'error-masking\'] (D6) — any other class value reopens general taste review, which the ' +
    'lens is scoped away from')
})

test('AC-20260812-01-3: the lens agent() call passes no agentType (D1 — copying the panel\'s agentType would load reviewer.md as the lens\'s own carve-out-disclaiming system prompt)', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  const schemaRefIdx = src.indexOf('schema: LENS')
  assert.notStrictEqual(schemaRefIdx, -1,
    'no `schema: LENS` reference found — the lens agent() call must pass the LENS schema to ' +
    'get structured smell output')
  const agentCallStart = src.lastIndexOf('agent(', schemaRefIdx)
  assert.notStrictEqual(agentCallStart, -1,
    'could not find the enclosing agent(...) call for the schema: LENS reference')
  const openParenIdx = agentCallStart + 'agent'.length
  const call = extractParenBalanced(src, openParenIdx)
  assert.doesNotMatch(call, /agentType/,
    'the lens agent() call (the one passing schema: LENS) must not include an `agentType` ' +
    'option (D1) — the verify-phase pattern omits it; copying the panel\'s `agentType: ' +
    '\'spec:reviewer\'` would load reviewer.md, including this very spec\'s "reviewers do not ' +
    'stretch for cross-file smells" carve-out, as the lens\'s own system prompt')
})

test('AC-20260812-01-3: a null lens agent result fails open — smells: [] and lensFailed: true, never counted toward failedReviewers or REVIEWER_FAILED', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  assert.match(src, /smells:\s*\[\][\s\S]{0,120}lensFailed:\s*true|lensFailed:\s*true[\s\S]{0,120}smells:\s*\[\]/,
    'wf-review.body.js must contain a fail-open branch producing `smells: []` and ' +
    '`lensFailed: true` together (D4) for a null lens result — without it a crashed lens has ' +
    'no defined output shape and downstream consumers of `smells`/`lensFailed` break')
})

test('AC-20260812-01-3: returned duplication smells lacking a non-empty counterpart are filtered out (D6 — code filter, not a prompt-only requirement)', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  const duplicationCount = (src.match(/duplication/g) || []).length
  assert.ok(duplicationCount >= 2,
    `wf-review.body.js must reference "duplication" at least twice — once in the LENS schema's ` +
    `enum and once again in the code filter dropping duplication smells without a counterpart ` +
    `(D6); found ${duplicationCount} occurrence(s), so no filter logic exists beyond the schema`)
  const counterpartCount = (src.match(/counterpart/g) || []).length
  assert.ok(counterpartCount >= 2,
    `wf-review.body.js must reference "counterpart" at least twice — once in the LENS schema's ` +
    `property description and once again in the code filter's condition (D6); found ` +
    `${counterpartCount} occurrence(s), so the counterpart-required rule is prompt-only, which ` +
    `the spec explicitly rejects (schema if/then support is unverified in the harness validator)`)
})

// ---------------------------------------------------------------------------
// AC-20260812-01-4 / AC-20260812-01-5 — verdict.js ignores smells/lensFailed: identical
// CLEAN/exit 0 on an all-green manifest with a non-empty smells array; identical
// HARD_FINDINGS/exit 1 with and without the fields on a survivor manifest
// ---------------------------------------------------------------------------

test('AC-20260812-01-4 (CONTINUE TO AC-20260815-02-9): verdict.js prints CLEAN and exits 0 against an all-green manifest and a zero-survivor workflow return carrying a non-empty smells array — advisory never gates, executed not argued', () => {
  const dir = tmpdir('smell-lens-verdict-clean')
  const { manifestPath, workflowPath } = writeVerdictFixture(dir, {
    verdict: 'CLEAN', survivors: [], killed: [],
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0, miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1, scope: 'full', tokens: 100,
    smells: [{ file: 'src/a.js', line: 1, class: 'duplication', claim: 'reimplements formatDate', counterpart: 'src/lib/date.js:40' }],
    lensFailed: false,
  })
  const r = runNode('scripts/verdict.js', ['--manifest', manifestPath, '--workflow', workflowPath,
    '--waived', '0', '--rejected', '0', '--fixDispatched', '0'])
  assert.match(r.stdout, /^CLEAN/,
    `verdict.js must print CLEAN when the workflow return has zero survivors even though ` +
    `smells is non-empty — a lens finding must never gate the verdict; got stdout: ${r.stdout} stderr: ${r.stderr}`)
  assert.strictEqual(r.status, 0,
    `verdict.js must exit 0 on a CLEAN derivation regardless of a non-empty smells array — ` +
    `exit ${r.status} means the additive advisory field changed the exit code, breaking "advisory ` +
    `never gates" (stderr: ${r.stderr})`)
})

test('AC-20260812-01-5 (CONTINUE TO AC-20260815-02-9): verdict.js prints the identical HARD_FINDINGS/exit-1 verdict with and without the smells/lensFailed fields on a survivor workflow return', () => {
  const dir = tmpdir('smell-lens-verdict-parity')
  const baseWorkflow = {
    verdict: 'HARD_FINDINGS',
    survivors: [{ file: 'src/b.js', line: 5, severity: 'hard', claim: 'x', rule: 'y', verification: 'demonstrated' }],
    killed: [],
    verify: { verified: 1, demonstrated: 1, killedByExecution: 0, sanctioned: 0, miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1, scope: 'full', tokens: 100,
  }
  const withFieldsDir = path.join(dir, 'with')
  fs.mkdirSync(withFieldsDir, { recursive: true })
  const withFields = writeVerdictFixture(withFieldsDir, { ...baseWorkflow, smells: [], lensFailed: false })
  const withoutDir = path.join(dir, 'without')
  fs.mkdirSync(withoutDir, { recursive: true })
  const without = writeVerdictFixture(withoutDir, baseWorkflow)

  const rWithout = runNode('scripts/verdict.js', ['--manifest', without.manifestPath, '--workflow', without.workflowPath,
    '--waived', '0', '--rejected', '0', '--fixDispatched', '0'])
  const rWith = runNode('scripts/verdict.js', ['--manifest', withFields.manifestPath, '--workflow', withFields.workflowPath,
    '--waived', '0', '--rejected', '0', '--fixDispatched', '0'])

  assert.match(rWithout.stdout, /^HARD_FINDINGS/,
    `baseline run (no smells/lensFailed fields) must print HARD_FINDINGS for one undispositioned ` +
    `hard survivor; got: ${rWithout.stdout} stderr: ${rWithout.stderr}`)
  assert.strictEqual(rWithout.status, 1, 'baseline run must exit 1 on HARD_FINDINGS')
  assert.strictEqual(rWith.stdout, rWithout.stdout,
    `verdict.js must print the identical verdict word with smells/lensFailed present as without ` +
    `— got "${rWith.stdout.trim()}" with the fields vs "${rWithout.stdout.trim()}" without; a ` +
    `divergence means the additive field changed derivation, breaking "never gates" (D7)`)
  assert.strictEqual(rWith.status, rWithout.status,
    `verdict.js must exit identically (both 1) with and without smells/lensFailed — got ` +
    `${rWith.status} with vs ${rWithout.status} without`)
})

// ---------------------------------------------------------------------------
// AC-20260812-01-6 — review.md documents the extended return shape, the never-ledgered
// sentence, the advisory presentation group, and the report lines
// ---------------------------------------------------------------------------

test('AC-20260812-01-6 / AC-20260815-01-9 (regression): review.md documents the return shape with smells appended after tokens, in both locations, while the pinned prefix substring stays intact', () => {
  const doc = read('spec/commands/review.md')
  const pinnedPrefix = 'verdict, survivors, killed, verify, reviewerCount, scope, tokens'
  const occurrences = doc.split(pinnedPrefix).length - 1
  assert.ok(occurrences >= 2,
    `review.md must still contain the pinned prefix "${pinnedPrefix}" (tests/workflow-guards.test.js:112) ` +
    `in both documented locations (Phase 1 "What the script does" and Rules) — found ${occurrences}`)
  const withSmells = (doc.match(new RegExp(pinnedPrefix + ', smells, lensFailed', 'g')) || []).length
  assert.ok(withSmells >= 2,
    `review.md must extend BOTH documented return-shape locations to end in ` +
    `"..., tokens, smells, lensFailed" (D11) — found ${withSmells} location(s) already extended; ` +
    `a location left at the old shape would document a return object the workflow no longer sends`)
})

test('AC-20260812-01-6 / AC-20260815-01-9 (regression): review.md states smells never enters verdict.js or the ledger row', () => {
  const doc = read('spec/commands/review.md')
  assert.match(doc, /smells[\s\S]{0,80}never[\s\S]{0,40}(verdict\.js|ledger)/i,
    'review.md must carry an explicit sentence that `smells` never enters verdict.js or the ' +
    'ledger row (D11) — without it a future habit-edit could start asserting on smells inside ' +
    'the ledger row expectations')
})

// 2026-08-15 spec 20260815/01-recurrence-carriers D1/D3: the batched keep/drop
// AskUserQuestion bounced the question-style judge three times (review.md itself declares the
// fork consequence-free) and is deleted outright — the session now derives-and-announces through
// `spec-paths advisory-append`. This retargets AC-20260812-01-6's advisory-presentation-group
// pin (which asserted the now-deleted question existed) to the opposite assertion.
test('AC-20260815-01-7: review.md\'s advisory smell paragraph names the spec-paths advisory-append invocation with --smells, contains no AskUserQuestion between its opening bold phrase and Phase 3, and drops the retired keep/drop literals', () => {
  const doc = read('spec/commands/review.md')
  const startIdx = doc.indexOf('**Advisory smell presentation')
  assert.notStrictEqual(startIdx, -1,
    'review.md must still contain the "Advisory smell presentation" paragraph\'s opening bold ' +
    'phrase — the anchor this AC scans from is missing')
  const endIdx = doc.indexOf('## Phase 3', startIdx)
  assert.ok(endIdx > startIdx,
    'review.md must contain a "## Phase 3" heading after the advisory smell paragraph — the ' +
    'anchor this AC scans to is missing')
  const paragraph = doc.slice(startIdx, endIdx)
  assert.doesNotMatch(paragraph, /AskUserQuestion/,
    'the advisory smell paragraph must contain no AskUserQuestion (D1) — the keep/drop ask was ' +
    'deleted because review.md itself declares the fork consequence-free, which is exactly what ' +
    'the question-style judge correctly blocked three times')
  assert.match(paragraph, /spec-paths advisory-append/,
    'the advisory smell paragraph must invoke `spec-paths advisory-append` (D1) — the session ' +
    'now derives-and-announces through the script instead of asking a keep/drop question')
  assert.match(paragraph, /--smells/,
    'the advisory smell paragraph\'s advisory-append invocation must pass --smells (D1) — ' +
    'without it the script has no findings to append')
  assert.doesNotMatch(doc, /drop — no record kept/,
    'review.md must not contain the retired literal "drop — no record kept" (D1) anywhere — the ' +
    'keep/drop question option sentences were deleted along with the question itself')
  assert.doesNotMatch(doc, /Dismissed findings get no record/,
    'review.md must not contain the retired literal "Dismissed findings get no record" (D1) — ' +
    'dismissal no longer exists once keep is the derived, announced default')
})

// 2026-08-14 spec 20260813/07-command-report-conformance D8 (build-time ruling, user-approved):
// the fixed report anchor set (✅⚠️🚫📌📦✨) closed over review.md's report template, retiring
// the bespoke 🔍 glyph this pin originally asserted. The smells summary moved into the 📦
// `artifacts` slot description instead of a dedicated 🔍-anchored line. This test retargets the
// first half of the pin to the new home and pins the retirement itself; the lensFailed half
// (originally AC-20260812-01-6) is unchanged and untouched below.
// 2026-08-15 spec 20260815/01-recurrence-carriers D3/D8: "accepted" implied an adjudication that
// no longer happens at review time (audit now decides fate) — the literal retargets to
// "{M} recorded", retagged AC-20260815-01-8.
test('AC-20260813-07-7 / AC-20260815-01-8: review.md\'s Phase 3 artifacts slot description and report template carry "{M} recorded", never "{M} accepted", and the lensFailed ⚠️ line survives unchanged', () => {
  const doc = read('spec/commands/review.md')
  assert.match(doc, /`artifacts`[\s\S]{0,300}smells:\s*\{N\}\s*advisory\s*—\s*\{M\}\s*recorded\s*→\s*docs\/audit\/advisory-findings\.md/,
    'review.md\'s Phase 3 `artifacts` slot description must carry "smells: {N} advisory — {M} ' +
    'recorded → docs/audit/advisory-findings.md" (D8/AC-20260815-01-8) — "accepted" implied an ' +
    'adjudication that no longer happens at review; audit is where fate is decided now')
  assert.match(doc, /📦 smells:\s*\{N\}\s*advisory\s*—\s*\{M\}\s*recorded\s*→\s*docs\/audit\/advisory-findings\.md/,
    'review.md\'s report template line must also carry "{M} recorded" (D8/AC-20260815-01-8) — ' +
    'both documented locations must move together or the template and the slot description ' +
    'would disagree with each other')
  assert.doesNotMatch(doc, /\{M\}\s*accepted/,
    'review.md must not contain the retired literal "{M} accepted" anywhere (D8/AC-20260815-01-8) ' +
    '— a location left at the old wording would document a report the workflow no longer emits')
  assert.doesNotMatch(doc, /^\s*🔍/m,
    'review.md must contain no line that opens with the 🔍 glyph (D8: the fixed report anchor ' +
    'set ✅⚠️🚫📌📦✨ is closed) — a reappearing 🔍-anchored smells line would resurrect the retired ' +
    'bespoke anchor this spec deliberately removed (the sentence naming the retired glyph in ' +
    'prose, mid-line, is fine and is not what this pins)')
  assert.match(doc, /⚠️[\s\S]{0,60}smell lens failed/i,
    'review.md must document the "⚠️ smell lens failed — no advisory findings this run" line ' +
    'for lensFailed: true')
})

// ---------------------------------------------------------------------------
// AC-20260812-01-7 — reviewer.md / init.md / spec-pipeline.md carve-outs, each duty in its
// actual home (per the adversarial-check fix logged in Rationale point 1)
// ---------------------------------------------------------------------------

test('AC-20260812-01-7: reviewer.md carries the lens-ownership carve-out naming both smell classes as advisory and non-blocking, while keeping its pre-existing duties byte-present', () => {
  const reviewer = read('spec/agents/reviewer.md')
  assert.match(reviewer, /duplication/i,
    'reviewer.md must name semantic duplication in the carve-out paragraph (D10)')
  assert.match(reviewer, /error.masking/i,
    'reviewer.md must name error masking (error-masking) in the carve-out paragraph (D10)')
  assert.match(reviewer, /do not stretch/i,
    'reviewer.md\'s carve-out must state that panel reviewers do not stretch for cross-file ' +
    'smells (D10) — this is the exact ownership boundary the lens exists to draw')
  assert.match(reviewer, /never block/i,
    'reviewer.md\'s carve-out must state the two classes never block as reviewer findings (D10)')
  // Pre-existing duties must stay in their actual home, untouched by the new carve-out.
  assert.match(reviewer, /Defensive fallbacks that mask shape bugs/,
    'reviewer.md must keep its existing defensive-fallback medium check byte-present — the ' +
    'carve-out narrows only the two new lens classes, never this pre-existing duty')
  assert.match(reviewer, /Do not report scope\/over-engineering opinions/,
    'reviewer.md must keep its existing taste prohibition byte-present')
  assert.doesNotMatch(reviewer, /three or more near-identical/,
    'reviewer.md must NOT gain the three-near-identical-blocks duplication calibration — that ' +
    'duty lives only in init.md\'s § Review Checks template and this host\'s ' +
    '.claude/rules/spec-pipeline.md (it has never been in reviewer.md); the adversarial check ' +
    'caught exactly this misattribution and AC-7 forbids reintroducing it')
})

test('AC-20260812-01-7: init.md § Review Checks template states the two smell classes as plugin-owned advisory lens output, never a blocking reviewer finding, while keeping the duplication calibration bullet', () => {
  const init = read('spec/commands/init.md')
  assert.match(init, /plugin-owned/i,
    'init.md § Review Checks template must state the two smell classes are plugin-owned ' +
    'advisory lens output (D10)')
  assert.match(init, /never[\s\S]{0,40}blocking/i,
    'init.md must state the two classes are never a blocking reviewer finding (D10)')
  assert.match(init, /duplication/i, 'init.md carve-out sentence must name duplication')
  assert.match(init, /error.masking/i, 'init.md carve-out sentence must name error-masking')
  assert.match(init, /three or more near-identical/,
    'init.md must keep the pre-existing duplication-calibration bullet ("three or more ' +
    'near-identical blocks...") byte-present — this AC only adds one sentence beside it')
})

test('AC-20260812-01-7: this host\'s .claude/rules/spec-pipeline.md § Review Checks carries the same smell-lens carve-out sentence, and its duplication-calibration bullet stays byte-present', () => {
  const rules = read('.claude/rules/spec-pipeline.md')
  assert.match(rules, /plugin-owned/i,
    'spec-pipeline.md § Review Checks must state the two smell classes are plugin-owned ' +
    'advisory lens output (D10) — this host is already initialized, so it picks the sentence ' +
    'up directly rather than at the next /spec:init')
  assert.match(rules, /never[\s\S]{0,40}blocking/i,
    'spec-pipeline.md must state the two classes are never a blocking reviewer finding (D10)')
  assert.match(rules, /three or more near-identical/,
    'spec-pipeline.md must keep the pre-existing duplication-calibration bullet byte-present ' +
    '(it is one of this host\'s two sanctioned homes for that duty, alongside init.md)')
})

// ---------------------------------------------------------------------------
// AC-20260815-01-15 — scaffold-ledger.md's Review smell lens row is rewritten in place (D4):
// mechanism names advisory-append.js, RETIRE re-anchors off "zero accepted findings" to
// emission volume + audit-side fate, and two new rows (advisory-append.js, config-read
// closure pin) each carry a promote/retire condition.
// ---------------------------------------------------------------------------

test('AC-20260815-01-15: scaffold-ledger.md\'s Review smell lens row names advisory-append.js in its mechanism text and drops the retired "zero accepted findings" RETIRE clause', () => {
  const doc = read('spec/doctrine/scaffold-ledger.md')
  const rowIdx = doc.indexOf('Review smell lens')
  assert.notStrictEqual(rowIdx, -1,
    'scaffold-ledger.md must still contain a "Review smell lens" row — the anchor this AC scans ' +
    'from is missing')
  const rowEnd = doc.indexOf('\n', rowIdx)
  const row = doc.slice(rowIdx, rowEnd === -1 ? doc.length : rowEnd)
  assert.match(row, /advisory-append/,
    'the Review smell lens row\'s mechanism text must name advisory-append.js (D4) — the row ' +
    'still describes the retired keep/drop-question mechanism otherwise, mismatching the actual ' +
    'derive-and-announce implementation')
  assert.doesNotMatch(row, /zero accepted findings/,
    'the Review smell lens row must not carry the literal "zero accepted findings" RETIRE clause ' +
    '(D4) — auto-keep makes acceptance automatic, so that clause measures nothing once it no ' +
    'longer gates on a model adjudication')
})

test('AC-20260815-01-15: scaffold-ledger.md carries a table row for advisory-append.js and a table row for the config-read closure pin, each with a promote or retire condition', () => {
  const doc = read('spec/doctrine/scaffold-ledger.md')
  const lines = doc.split('\n').filter(l => l.startsWith('|'))
  const appendRow = lines.find(l => l.includes('advisory-append.js'))
  assert.ok(appendRow,
    'scaffold-ledger.md must carry a table row for advisory-append.js itself (structural; D4) — ' +
    'every new mechanism owes a ledger row (doctor check 13; hard review check), and the append ' +
    'script is a new mechanism')
  assert.match(appendRow, /promote|retire/i,
    'the advisory-append.js row must name a promote or retire condition (D4) — a row with no ' +
    'promote/retire condition is a mechanism nobody has agreed to ever remove or upgrade')
  const closureRow = lines.find(l => /config-read closure|readConfigStrict/i.test(l))
  assert.ok(closureRow,
    'scaffold-ledger.md must carry a table row naming the config-read closure pin (D4) — the ' +
    'gate that makes a fifth private-config-read recurrence a red suite instead of a fifth ' +
    'ledger row is itself a new mechanism owed a row (doctor check 13)')
  assert.match(closureRow, /promote|retire/i,
    'the config-read closure pin row must name a promote or retire condition (D4)')
})
