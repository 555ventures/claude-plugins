'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260810/07-per-sha-ci-legs.md (D3/D4, 2026-08-10, Prax stale-CI-review incident): ci
// stays a REVIEW_BLOCKING leg (a completed red run on the exact reviewed commit must still
// derive GATE_RED), and RELEASE_LEGS grows to include `ci` — release gains the authoritative
// per-SHA CI check the review leg's re-key (D2) intentionally does not carry across to
// unpushed/stale-branch evidence. This file's release-profile tests below are updated in place
// per the spec's refuter-demonstrated fixture regression (a six-leg release fixture goes stale
// the moment RELEASE_LEGS grows to seven).
//
// v7.0.0 (2026-08-17): CLEAN-with-qualifier and the sanctionedReds suffix are retired with the
// sanctioned-red baseline apparatus — the verdict enum is CLEAN|FINDINGS|HARD_FINDINGS|
// REVIEWER_FAILED|UNVERIFIED|GATE_RED, an `unavailable` observation leg derives plain CLEAN
// (recorded in the leg row, never a distinct word), and ledger legs rows are always {leg,exit}.
//
// specs/20260805/02-review-evidence-manifest.md (D1-D3): today /spec:review can say CLEAN with
// nothing executed — a zero-findings panel returns CLEAN from the workflow, and the CLEAN
// definition is prose a model applies, not a value a script computes. verdict.js makes the
// verdict word a DERIVED value: a fresh per-iteration manifest of executed-leg rows +
// the workflow's return + disposition counts feed one derivation (D3's first-match-wins
// order). This file pins verdict.js's derivation contract directly by execution; review.md's
// wiring of the script is pinned in verdict-doctrine.test.js.

const SCRIPT = 'scripts/verdict.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

function writeWorkflow(dir, obj) {
  const p = path.join(dir, 'workflow.json')
  fs.writeFileSync(p, JSON.stringify(obj))
  return p
}

// specs/20260813/10-host-capabilities.md D4: the ci row carries a real `conclusion=` observation,
// not `unavailable`. Every test below that reuses this fixture pins a subject OTHER than the
// qualifier word (leg presence, disposition counting, ledger row shape) and states "every leg is
// green" — since D4, an `unavailable` ci leg is no longer a plain-CLEAN input, so leaving it here
// would silently turn all of them into qualifier tests asserting the wrong subject. The
// unavailable-ci case has its own dedicated pin below.
//
// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-9, self-application): `at-risk` joins
// REVIEW_LEGS as a required-but-non-blocking leg, and this spec's own adversarial pass named
// this fixture as one of the four suites its own required-leg extension would redden. The row is
// added here so every existing test below that reuses SIX_GREEN CONTINUES TO derive the same
// verdict words and ledger fields it already asserts — the fixture gains the row, the assertions
// stay unweakened.
const SIX_GREEN = [
  { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
  { leg: 'smoke', exit: 4, observed: 'inert' },
  { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
  { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
  { leg: 'ci', exit: 0, observed: 'conclusion=success' },
  { leg: 'at-risk', exit: 0, observed: 'files=0' },
]

// The same six legs with ci structurally unobservable — the qualifier fixture (D4).
const SIX_GREEN_CI_UNAVAILABLE = SIX_GREEN.map(
  r => (r.leg === 'ci' ? { leg: 'ci', exit: 0, observed: 'unavailable' } : r))

function cleanWorkflow(survivors) {
  return {
    verdict: 'CLEAN',
    survivors: survivors || [],
    killed: 0,
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0,
      miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1,
    scope: 'full',
    tokens: { workflow: 100 },
  }
}

const VERDICT_WORDS = /^(CLEAN|FINDINGS|HARD_FINDINGS|REVIEWER_FAILED|UNVERIFIED|GATE_RED)$/

test('AC-20260805-02-1: a manifest missing required legs derives UNVERIFIED and exits 1, never CLEAN', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'a manifest carrying only the gate leg is missing smoke/reconcile/ac-matrix/skip-reconcile/ci — ' +
    'the run has no evidence those legs ever executed, so the derivation must be UNVERIFIED, never CLEAN, ' +
    'even though the workflow return itself is zero-findings CLEAN: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260805-02-2 / AC-20260813-03-10 (regression pin: --workflow-present derivation stays byte-unchanged by the D3 no-workflow relax) / AC-20260816-02-8 (no sanctionedReds suffix anywhere continues to derive plain CLEAN): six green legs (smoke exit 4 counts green-inert) with a CLEAN workflow return derive CLEAN and exit 0', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'every required leg is present and green (smoke exit 4 is the sanctioned inert-green case) and the ' +
    'workflow returned zero survivors — the derivation must reach CLEAN: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'derived CLEAN must exit 0: ' + r.stderr)
})

test('AC-20260805-02-3 / AC-20260810-07-8: a red ci leg derives GATE_RED and exits 1 even with a CLEAN workflow return (review profile CONTINUES to block on ci per D3)', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 1, observed: 'conclusion=failure' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'ci is a blocking leg (D3) — a red ci row must override an otherwise-CLEAN workflow return: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'GATE_RED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

// v7.0.0 retag: the SUBSTANCE — an unavailable ci leg must never BLOCK, since exit 0 satisfies
// the leg requirement — survives byte-for-byte. The qualifier word is retired: an unavailable
// observation derives plain CLEAN with the observation recorded in the leg row.
test('AC-20260813-10-8 (retag of AC-20260813-02-8): a review-profile run whose ci leg is observed unavailable derives plain CLEAN and exit 0 — the leg never blocks the close', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN_CI_UNAVAILABLE)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'v7: ci "unavailable" (no CI to consult) derives plain CLEAN — the qualifier word is retired and the ' +
    'observation lives in the leg row: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0,
    'the retained substance of AC-20260813-02-8: an unavailable ci leg is exit 0 and satisfies the ci leg ' +
    'requirement, so it must never block the close — a non-zero exit here would make every no-CI host ' +
    'unable to ever close a review: ' + r.stderr)
})

test('AC-20260805-02-3: a non-zero ac-matrix exit (findings emitted) counts as executed-green and CLEAN is reachable once those findings are waived', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'ac-matrix' ? { leg: 'ac-matrix', exit: 1, observed: 'uncovered=1' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-20260805-02-99' }]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'ac-matrix is a findings-producing leg (D3) — its non-zero exit must count as executed-green for leg ' +
    'purposes, and its one finding is fully waived, so the derivation must still reach CLEAN, not get stuck ' +
    'unable to ever return to CLEAN: ' + r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-4: undispositioned survivors of medium+soft severity derive FINDINGS', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'medium', id: 'AC-a' }, { severity: 'soft', id: 'AC-b' }, { severity: 'medium', id: 'AC-c' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'FINDINGS',
    '3 survivors, 1 waived, and no hard severity among them — undispositioned medium/soft findings must ' +
    'derive FINDINGS, never CLEAN and never the harder HARD_FINDINGS word: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'FINDINGS is a non-CLEAN word and must still exit 1: ' + r.stderr)
})

test('AC-20260805-02-4: undispositioned survivors including a hard severity derive HARD_FINDINGS', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'hard', id: 'AC-a' }, { severity: 'medium', id: 'AC-b' }, { severity: 'soft', id: 'AC-c' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'HARD_FINDINGS',
    'a hard-severity survivor among the undispositioned set must derive the stronger HARD_FINDINGS word, ' +
    'not the FINDINGS word medium/soft alone would get: ' + r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-4: a non-zero fixDispatched derives FINDINGS even when it equals the survivor count, because a dispatched fix is non-terminal', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-a' }]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--fixDispatched', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'FINDINGS',
    'fixDispatched fully accounting for the one survivor must NOT derive CLEAN — a dispatched fix is ' +
    'non-terminal by design (D3): CLEAN is only reachable from the NEXT iteration\'s fresh derivation: ' +
    r.stdout + ' / ' + r.stderr)
})

test('AC-20260805-02-5 / AC-20260816-02-8 (legs stay exactly {leg,exit} — no sanctionedReds key — when no observed carries the suffix): --ledger prints a row whose verdict matches line 1 and whose legs mirror the manifest name+exit pairs exactly', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--spec', 'specs/20260805/02-review-evidence-manifest.md', '--tier', 'T2',
    '--diff-loc', '42', '--iteration', '1'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN', 'line 1 must still be the bare verdict word: ' + r.stdout + ' / ' + r.stderr)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    '--ledger must print a parseable JSON row on line 2, never prose: ' + r.stdout)
  assert.strictEqual(row.verdict, 'CLEAN',
    'the ledger row\'s verdict field must equal the word printed on line 1 — a mismatch means the ledger ' +
    'and the console can disagree about what happened: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.legs, SIX_GREEN.map(({ leg, exit }) => ({ leg, exit })),
    'the row\'s legs must mirror the manifest\'s name+exit pairs exactly, in order — anything else means the ' +
    'ledger record diverges from the evidence that actually produced the verdict: ' + JSON.stringify(row.legs))
})

// 2026-08-06 review-fix findings (prev-findings.json): verdict.js's --ledger row was missing
// runId/smoke/testsSkipped entirely and flattened the disposition counts, contradicting D2's
// "smoke and testsSkipped are derived FROM manifest rows" and review.md:229's documented
// runId/findings-nested shape; the release profile's row carried only {ts,stage,verdict,legs},
// contradicting release.md:127's milestone/briefs/staging/e2e/journeys/substrate/production
// template. These tests pin the corrected contract by execution so a future regression fails
// npm test instead of shipping silently behind doctrine-text-only pins (as run-ledger.test.js's
// existing checks did here).

test('AC-20260805-02-5: --ledger carries row.runId only when --run-id is passed, and omits the key entirely otherwise', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const withFlag = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--spec', 'x.md', '--tier', 'T2', '--diff-loc', '1', '--iteration', '1', '--run-id', 'wf_abc123'])
  const rowWith = JSON.parse(withFlag.stdout.trim().split('\n')[1])
  assert.strictEqual(rowWith.runId, 'wf_abc123',
    'orchestrator passes --run-id so /spec:escape can later point reviewRunId back at this exact review ' +
    'invocation (review.md: "runId is the Workflow invocation\'s run id") — a mismatch or missing value ' +
    'breaks that backlink: ' + JSON.stringify(rowWith))
  const withoutFlag = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger',
    '--spec', 'x.md', '--tier', 'T2', '--diff-loc', '1', '--iteration', '1'])
  const rowWithout = JSON.parse(withoutFlag.stdout.trim().split('\n')[1])
  assert.ok(!('runId' in rowWithout),
    'when the orchestrator omits --run-id the row must omit the key entirely rather than writing null or ' +
    'an empty string — a present-but-empty runId would look like a real (if blank) backlink to a consumer: ' +
    JSON.stringify(rowWithout))
})

test('AC-20260805-02-5: --ledger derives row.smoke from the manifest smoke row exit code, never from prose', () => {
  const dir = tmpdir('verdict')
  const workflow = writeWorkflow(dir, cleanWorkflow([]))

  const passRows = SIX_GREEN.map(r => (r.leg === 'smoke' ? { leg: 'smoke', exit: 0, observed: 'pass' } : r))
  const passManifest = writeManifest(dir, passRows)
  const passRun = runNode(SCRIPT, ['--manifest', passManifest, '--workflow', workflow, '--ledger'])
  const passRow = JSON.parse(passRun.stdout.trim().split('\n')[1])
  assert.strictEqual(passRow.smoke, 'pass',
    'a smoke row with exit 0 and observed "pass" must derive row.smoke "pass" — D2 requires smoke be ' +
    'derived FROM the manifest row, not hardcoded: ' + JSON.stringify(passRow))

  const inertManifest = writeManifest(dir, SIX_GREEN) // smoke row: exit 4, observed "inert"
  const inertRun = runNode(SCRIPT, ['--manifest', inertManifest, '--workflow', workflow, '--ledger'])
  const inertRow = JSON.parse(inertRun.stdout.trim().split('\n')[1])
  assert.strictEqual(inertRow.smoke, 'inert',
    'a smoke row with exit 4 (the sanctioned inert-green case) must derive row.smoke "inert" regardless of ' +
    'its observed text — exit 4 is the authority, per D3\'s "exit 4 = inert counts green": ' +
    JSON.stringify(inertRow))

  const failRows = SIX_GREEN.map(r => (r.leg === 'smoke' ? { leg: 'smoke', exit: 2, observed: 'boot-crash' } : r))
  const failManifest = writeManifest(dir, failRows)
  const failRun = runNode(SCRIPT, ['--manifest', failManifest, '--workflow', workflow, '--ledger'])
  const failRow = JSON.parse(failRun.stdout.trim().split('\n')[1])
  assert.strictEqual(failRow.smoke, 'fail',
    'a smoke row with a non-0, non-4 exit must derive row.smoke "fail" — the row must still print (GATE_RED ' +
    'is a non-CLEAN word, not a reason to withhold the ledger row) so the failure is visible in the ledger ' +
    'history, not just on stderr: ' + JSON.stringify(failRow))
})

test('AC-20260813-02-7 (updates AC-20260805-02-5) / AC-20260816-01-7 (CONTINUES TO hold post-D6): --ledger derives row.testsSkipped.total as skips+todos from the gate row\'s pinned "skips=N todos=M" observed format — the total-summing claim survives the D2 object-shape change and the D6 suffix-tolerance change', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'gate' ? { leg: 'gate', exit: 0, observed: 'skips=2 todos=1' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.strictEqual(typeof row.testsSkipped, 'object',
    'D2 makes row.testsSkipped an object ({total,sanctioned,unsanctioned}) always — a bare number here means ' +
    'the scalar shape survived and downstream consumers still cannot tell a sanctioned skip run from an ' +
    'unsanctioned one: ' + JSON.stringify(row))
  assert.strictEqual(row.testsSkipped.total, 3,
    'D2 pins the gate leg\'s observed format as "skips=N todos=M" specifically so testsSkipped.total can be ' +
    'summed from it (a skip is not a pass) — skips=2 todos=1 must derive total 3, not 2 or 1 alone: ' +
    JSON.stringify(row))
})

// specs/20260816/01-gate-baseline-reconcile.md D10 (retainer ruling, 2026-08-17, tdd-red-check
// consult): AC-20260816-01-12 is a sanctioned-green regression pin, standalone (never folded
// onto AC-8's testsSkipped-total test, which pins a different observable — see D10's rationale).
// The verdict word derives from leg exit codes alone (derive()/legIsRed reads row.exit, never
// row.observed), so a gate row's "sanctionedReds=<K>" suffix must never perturb it — this test
// is specified to already pass, and its falsifiability is demonstrated in-line by mutating the
// same fixture's gate exit to 1 and asserting the word flips to GATE_RED (D10: verified by
// mutation, never by weakening).
test('AC-20260816-01-12: a green-by-subtraction gate row (exit:0, observed "skips=0 todos=0 sanctionedReds=21") with all other legs green and a clean workflow return derives a CLEAN-family word, never GATE_RED — the terminal observable of the spec\'s chain', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => (r.leg === 'gate'
    ? { leg: 'gate', exit: 0, observed: 'skips=0 todos=0 sanctionedReds=21' } : r))
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.match(r.stdout.split('\n')[0], /^CLEAN/,
    'a gate leg that went green by sanctioned-baseline subtraction is still exit:0 — derive()/legIsRed reads ' +
    'only the exit code, never the observed string, so a review that closed via suite-baseline.js --gate must ' +
    'still reach a CLEAN-family verdict, not be misread as red because its observed text names 21 sanctioned ' +
    'reds: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'a CLEAN-family word here must exit 0: ' + r.stderr)

  const redRows = SIX_GREEN.map(r => (r.leg === 'gate'
    ? { leg: 'gate', exit: 1, observed: 'skips=0 todos=0 sanctionedReds=21' } : r))
  const redManifest = writeManifest(dir, redRows)
  const rRed = runNode(SCRIPT, ['--manifest', redManifest, '--workflow', workflow])
  assert.strictEqual(rRed.stdout.split('\n')[0], 'GATE_RED',
    'falsifiability check (D10): the exact same sanctionedReds=21 observed text with the gate row\'s exit ' +
    'flipped to 1 must derive GATE_RED — proving the pin above is actually sensitive to the gate leg\'s exit ' +
    'code and is not a vacuously-true assertion: ' + rRed.stdout + ' / ' + rRed.stderr)
})

test('AC-20260813-02-1: --ledger derives row.testsSkipped as {total,sanctioned,unsanctioned} from the gate row\'s skips+todos and the skip-reconcile row\'s "skipped=K sanctioned=S" observed format', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => {
    if (r.leg === 'gate') return { leg: 'gate', exit: 0, observed: 'skips=2 todos=1' }
    if (r.leg === 'skip-reconcile') return { leg: 'skip-reconcile', exit: 0, observed: 'skipped=3 sanctioned=2' }
    return r
  })
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.deepStrictEqual(row.testsSkipped, { total: 3, sanctioned: 2, unsanctioned: 1 },
    'D2: gate "skips=2 todos=1" (total 3) joined with skip-reconcile "skipped=3 sanctioned=2" (sanctioned 2) ' +
    'must derive {"total":3,"sanctioned":2,"unsanctioned":1} — without this split, hearwell\'s testsSkipped:5 ' +
    'incident (identical count for 5 declared-sanctioned skips and 5 undeclared ones) is unfixed: ' +
    JSON.stringify(row))
})

test('AC-20260813-02-2: a legacy skip-reconcile "skipped=K" observed (no sanctioned= term) derives sanctioned:0 — undeclared skips are unsanctioned by construction, never silently sanctioned', () => {
  const dir = tmpdir('verdict')
  const rows = SIX_GREEN.map(r => {
    if (r.leg === 'gate') return { leg: 'gate', exit: 0, observed: 'skips=2 todos=1' }
    if (r.leg === 'skip-reconcile') return { leg: 'skip-reconcile', exit: 0, observed: 'skipped=2' }
    return r
  })
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.deepStrictEqual(row.testsSkipped, { total: 3, sanctioned: 0, unsanctioned: 3 },
    'D2: a legacy skip-reconcile row carrying only "skipped=2" (no sanctioned= term) must derive sanctioned:0 ' +
    '— the conservative reading is that an undeclared skip is unsanctioned by definition, never silently ' +
    'treated as sanctioned just because an older manifest shape produced it: ' + JSON.stringify(row))
})

test('AC-20260805-02-8: the review ledger row nests survived/killed/waived/rejected/fixDispatched/reviewerCount under findings and carries none of them flat at the top level', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([{ severity: 'soft', id: 'AC-a' }]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--waived', '1'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.ok(row.findings && typeof row.findings === 'object',
    'the disposition counts must be nested under a findings object per review.md\'s documented ledger-row ' +
    'template — a flat row is a schema shape a consumer reading row.findings.killed cannot parse: ' +
    JSON.stringify(row))
  assert.deepStrictEqual(row.findings, {
    survived: 1, killed: 0, waived: 1, rejected: 0, fixDispatched: 0, reviewerCount: 1,
  }, 'row.findings must carry exactly the six disposition counts with their derived values — a mismatch ' +
    'means escape.md\'s "findings.killed" backlink reads the wrong number: ' + JSON.stringify(row.findings))
  for (const flatKey of ['survived', 'killed', 'waived', 'rejected', 'fixDispatched', 'reviewerCount']) {
    assert.ok(!(flatKey in row),
      `row.${flatKey} must not also exist flat at the top level once nested under findings — carrying both ` +
      'shapes at once is not what "additive" (Contracts: "ledger row (additive)") means, and a consumer ' +
      'reading the old flat field would silently see stale/duplicate data: ' + JSON.stringify(row))
  }
})

// 2026-08-06 review-fix: real wf-review returns workflow.killed as an ARRAY of killed-finding
// objects (not the plain count cleanWorkflow()'s stub used above) and workflow.tokens as a
// plain number — two shapes verdict.js's --ledger row was passing through unnormalized instead
// of converting to the documented review.md:229 template (findings.killed = a count,
// tokens = {"workflow":<n>}). This test pins the corrected normalization by execution.
test('AC-20260805-02-8: --ledger normalizes an array-shaped workflow.killed to its length and a numeric workflow.tokens to {workflow:<n>}', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflowObj = cleanWorkflow([{ severity: 'soft', id: 'AC-a' }])
  workflowObj.killed = [{ file: 'x' }, { file: 'y' }]
  workflowObj.tokens = 777
  const workflow = writeWorkflow(dir, workflowObj)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--ledger', '--waived', '1'])
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.strictEqual(row.findings.killed, 2,
    'workflow.killed arriving as an array of killed-finding objects must be normalized to its LENGTH under ' +
    'row.findings.killed, not passed through as an array — an array here breaks escape.md\'s ' +
    '"findings.killed>0" correlation and doctor\'s jq numeric comparison against this field: ' +
    JSON.stringify(row.findings))
  assert.deepStrictEqual(row.tokens, { workflow: 777 },
    'workflow.tokens arriving as a plain number must be normalized to the documented {"workflow":<n>} object ' +
    'shape, not passed through as a bare number — a bare number here makes the ledger\'s tokens accounting ' +
    'unparseable against review.md:229\'s schema: ' + JSON.stringify(row))
})

// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-6 .. -02-8): `at-risk` joins
// REVIEW_LEGS as a required-but-non-blocking full-scope leg, mirroring the fail-closed presence
// rule the ci/gate oracle legs already establish, and mirroring `reconcile`'s standing on the
// blocking question. This fixture predates the at-risk row (unlike SIX_GREEN above, which now
// carries it) so these three tests can isolate at-risk's own presence/absence/redness.
const SIX_LEGS_NO_AT_RISK = [
  { leg: 'gate', exit: 0, observed: 'skips=0 todos=0' },
  { leg: 'smoke', exit: 4, observed: 'inert' },
  { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
  { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
  { leg: 'ci', exit: 0, observed: 'conclusion=success' },
]

test('AC-20260815-02-6: a full-scope review manifest missing the at-risk row derives UNVERIFIED, never CLEAN, even with all six legacy legs green and a CLEAN workflow return', () => {
  const dir = tmpdir('verdict-at-risk-missing')
  const manifest = writeManifest(dir, SIX_LEGS_NO_AT_RISK)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'D4 makes at-risk a required full-scope leg via the same fail-closed presence rule the ' +
    'other REVIEW_LEGS entries already carry — a manifest missing it must derive UNVERIFIED even ' +
    'though all six legacy legs are green and the workflow returned zero-survivor CLEAN, or a ' +
    'review could close CLEAN having never run the compensating derivation at all: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so the close step is mechanically unreachable: ' + r.stderr)
})

test('AC-20260815-02-7: a red at-risk leg does not derive GATE_RED — at-risk is required but non-blocking, so a zero-survivor workflow still reaches a CLEAN-family word at exit 0', () => {
  const dir = tmpdir('verdict-at-risk-red')
  const rows = [...SIX_LEGS_NO_AT_RISK, { leg: 'at-risk', exit: 1, observed: 'files=2' }]
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, cleanWorkflow([]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.match(r.stdout.split('\n')[0], /^CLEAN/,
    'D4: at-risk does NOT join REVIEW_BLOCKING — a red at-risk leg must never derive GATE_RED, ' +
    'matching reconcile\'s exit-3 standing (the finding flows to Phase 2 dispositions instead), ' +
    'never a hard gate stop: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0,
    'a CLEAN-family word reached via a non-blocking red at-risk leg must exit 0, or a red-but-' +
    'non-blocking leg would still make the review mechanically unclosable: ' + r.stderr)
})

// The manifest below (fix-delta scope, missing both reconcile and at-risk) already derives CLEAN
// on pre-D4 code, since `at-risk` does not exist in today's REVIEW_LEGS at all — there is no
// manifest-only construction that makes this AC red on unimplemented code without at-risk first
// entering REVIEW_LEGS. Logged per host rules' conservative-deviation clause (this AC's shape is
// a regression continuity guard, not a reachable red-first case): 02-at-risk-pins.deviations.md.
test('AC-20260815-02-8: on scope fix-delta, a manifest lacking both reconcile and at-risk rows still derives from the remaining required legs', () => {
  const dir = tmpdir('verdict-at-risk-fixdelta')
  const rows = SIX_LEGS_NO_AT_RISK.filter(r => r.leg !== 'reconcile')
  const manifest = writeManifest(dir, rows)
  const workflow = writeWorkflow(dir, { ...cleanWorkflow([]), scope: 'fix-delta' })
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'D4: the fix-delta filter excludes both reconcile and at-risk from requiredLegs — a manifest ' +
    'missing both rows must still derive CLEAN from the remaining five green legs, never ' +
    'UNVERIFIED for a leg fix-delta scope never had to run: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'CLEAN must exit 0: ' + r.stderr)
})

const RELEASE_SIX_LEGS = [
  { leg: 'deploy', exit: 0, observed: 'ok' },
  { leg: 'ready', exit: 0, observed: 'ok' },
  { leg: 'e2e', exit: 0, observed: 'passed=10 failed=0 skipped=2' },
  { leg: 'journeys', exit: 0, observed: 'walked=5 failed=0' },
  { leg: 'substrate', exit: 0, observed: 'checked=8 failed=0 inert=1' },
  { leg: 'production', exit: 0, observed: 'verified' },
]
const RELEASE_SEVEN_LEGS = [
  ...RELEASE_SIX_LEGS,
  { leg: 'ci', exit: 0, observed: 'conclusion=success' },
]

test('AC-20260813-02-5 (AC-20260805-02-8 / AC-20260810-07-5, byte-identical per D5): --profile release --ledger with --milestone/--briefs and all seven green legs incl. ci observed conclusion=success derives plain CLEAN (never CLEAN-with-qualifier) matching release.md\'s template', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, RELEASE_SEVEN_LEGS)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.2.3', '--briefs', '12,13'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN',
    'seven green release legs (deploy/ready/e2e/journeys/substrate/production/ci) must derive CLEAN — a wrong ' +
    'word here means the row assertions below are exercising a path release.md never actually reaches: ' +
    r.stdout + ' / ' + r.stderr)
  const row = JSON.parse(lines[1])
  assert.strictEqual(row.milestone, 'v1.2.3',
    'row.milestone must carry the --milestone flag verbatim — release.md\'s template documents it as the ' +
    'tag/briefs-range identity of the release: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.briefs, [12, 13],
    'row.briefs must parse the comma-int --briefs flag into a numeric array, matching release.md\'s ' +
    '"briefs":[<NN>,…] template: ' + JSON.stringify(row))
  assert.strictEqual(row.staging, 'pass',
    'row.staging must be "pass" when both deploy and ready legs are exit 0 — release.md gates promotion on ' +
    'this derived value: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.e2e, { passed: 10, failed: 0, skipped: 2 },
    'row.e2e must parse the e2e leg\'s "passed=N failed=N skipped=N" observed string into the documented ' +
    'object shape: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.journeys, { walked: 5, failed: 0 },
    'row.journeys must parse the journeys leg\'s "walked=N failed=N" observed string: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.substrate, { checked: 8, failed: 0, inert: 1 },
    'row.substrate must parse the substrate leg\'s "checked=N failed=N inert=N" observed string: ' +
    JSON.stringify(row))
  assert.strictEqual(row.production, 'verified',
    'row.production must read the production leg\'s observed enum value directly when it is one of ' +
    'verified|skipped|failed: ' + JSON.stringify(row))
  assert.strictEqual(row.ci, 'conclusion=success',
    'row.ci must carry the ci leg\'s observed string verbatim (AC-20260810-07-5) — the release ledger row ' +
    'gains a "ci" field per D4/Contracts once ci joins RELEASE_LEGS, and this six-leg fixture regresses to ' +
    'UNVERIFIED the moment that happens (refuter-demonstrated) unless the ci row is present here: ' +
    JSON.stringify(row))
})

test('AC-20260813-02-4 (v7 retag): --profile release with six green legs and a ci row observed "unavailable" (exit 0, structurally-absent verdict) derives plain CLEAN, records the observation in row.ci, and exits 0', () => {
  const dir = tmpdir('verdict')
  const rows = RELEASE_SEVEN_LEGS.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 0, observed: 'unavailable' } : r))
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.2.3', '--briefs', '12,13'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN',
    'v7: the qualifier word is retired — a release whose ci leg observed is "unavailable" derives plain ' +
    'CLEAN; the structurally-absent observation stays durable in row.ci, never a distinct verdict word: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0, 'CLEAN must exit 0: ' + r.stderr)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    '--ledger must still print a parseable JSON row on line 2: ' + r.stdout)
  assert.strictEqual(row.ci, 'unavailable',
    'row.ci must record the unavailable observation — with the qualifier word retired this field is the ' +
    'only durable carrier of "CI never delivered a verdict on this commit": ' + JSON.stringify(row))
})

test('AC-20260810-07-6: --profile release with the other six legs green but NO ci row derives UNVERIFIED and exits 1', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, RELEASE_SIX_LEGS)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release'])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'RELEASE_LEGS must include `ci` (D4/Contracts: "RELEASE_LEGS becomes [...,\'ci\']") — a manifest missing ' +
    'the ci row is missing a required leg and must derive UNVERIFIED, never CLEAN, even though the other six ' +
    'legs are all green: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED must exit 1 so promotion is mechanically unreachable: ' + r.stderr)
})

test('AC-20260810-07-7: --profile release with a red ci row (exit 1) derives GATE_RED and exits 1', () => {
  const dir = tmpdir('verdict')
  const rows = RELEASE_SEVEN_LEGS.map(r => (r.leg === 'ci' ? { leg: 'ci', exit: 1, observed: 'conclusion=failure' } : r))
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release'])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'ci must be a blocking release leg (D4: RELEASE_LEGS is "all release legs blocking, unchanged rule") — a ' +
    'completed red run on the release commit must derive GATE_RED even with the other six legs green: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1, 'GATE_RED must exit 1 so promotion is mechanically unreachable: ' + r.stderr)
})

test('AC-20260805-02-8: a partial release manifest (STOP path) still prints a ledger row, omitting missing or unparseable leg keys instead of failing', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, [
    { leg: 'deploy', exit: 0, observed: 'ok' },
    { leg: 'ready', exit: 0, observed: 'ok' },
    { leg: 'e2e', exit: 0, observed: 'not-the-pinned-format' }, // present but unparseable
    // journeys/substrate/production never ran — the STOP fired before them
  ])
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.2.3', '--briefs', '7'])
  const lines = r.stdout.trim().split('\n')
  assert.notStrictEqual(lines[0], 'CLEAN',
    'a release manifest missing required legs (journeys/substrate/production never executed) must never ' +
    'derive CLEAN — that would ledger a promotion as clean evidence it never gathered: ' + r.stdout)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    'even on a STOP path (D7: "the STOP path appends the red row") the row must still print as parseable ' +
    'JSON on line 2 — a STOP that fails to ledger is invisible to doctor\'s correlations: ' + r.stdout)
  assert.strictEqual(row.milestone, 'v1.2.3', 'identity flags must survive onto a STOP-path row too: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.briefs, [7], 'identity flags must survive onto a STOP-path row too: ' + JSON.stringify(row))
  assert.strictEqual(row.staging, 'pass',
    'staging is derivable from the deploy+ready rows that DID execute, so it must still be present even ' +
    'though later legs did not run: ' + JSON.stringify(row))
  assert.ok(!('e2e' in row),
    'the e2e leg\'s observed string does not match the pinned "passed=N failed=N skipped=N" format — the ' +
    'row must omit row.e2e rather than print nulls/NaNs that a consumer would read as real zero counts: ' +
    JSON.stringify(row))
  for (const missingKey of ['journeys', 'substrate', 'production']) {
    assert.ok(!(missingKey in row),
      `the ${missingKey} leg never ran on this STOP path, so row.${missingKey} must be omitted entirely — ` +
      'a fabricated value would misreport a leg that was never executed: ' + JSON.stringify(row))
  }
})

test('AC-20260805-02-9: dispositions exceeding the workflow file\'s survivor count exit 2 without printing a verdict word', () => {
  const dir = tmpdir('verdict')
  const manifest = writeManifest(dir, SIX_GREEN)
  const workflow = writeWorkflow(dir, cleanWorkflow([
    { severity: 'soft', id: 'AC-a' }, { severity: 'soft', id: 'AC-b' },
  ]))
  const r = runNode(SCRIPT, ['--manifest', manifest, '--workflow', workflow, '--waived', '3'])
  assert.strictEqual(r.status, 2,
    'waived(3) alone already exceeds the workflow file\'s 2 survivors — a contradictory disposition count ' +
    'must exit 2 (usage/contradictory inputs), never silently pick a verdict: ' + r.stdout + ' / ' + r.stderr)
  assert.ok(!VERDICT_WORDS.test(r.stdout.split('\n')[0] || ''),
    'no verdict word may be printed on a contradictory-input run — printing one anyway would let a caller ' +
    'read stdout without checking the exit code and get a fabricated verdict: ' + JSON.stringify(r.stdout))
  assert.ok(r.stderr.length > 0, 'the contradiction must be named on stderr so the remedy is discoverable: (empty stderr)')
})
