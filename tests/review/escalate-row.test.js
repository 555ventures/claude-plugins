'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20260822/01-escalate-ledger-row.md: a review that burns its fix loop to the
// cap (2 iterations) and is then abandoned writes ZERO ledger rows today — the driver's only two
// append points are the GATE_RED hard-stop and the CLEAN close, and the ESCALATE refusal reaches
// neither. This file pins verdict.js's new `--escalated` flag (D1-D4: no new verdict word, the
// escalation fact is a typed `escalated:true` row field, refused with --fixDispatched>0/--profile
// release before file I/O, refused when derivation reaches CLEAN — evidence drift) and the
// driver's `writeEscalateRow()` write point (D5-D10: the durable path, idempotency, self-heal,
// loud-row-less-retryable drift handling, the ESCALATE step's remedy block, the silent-loss
// detector). Every test here fails against current code: verdict.js rejects `--escalated` as an
// unknown flag (usage, exit 2, spike A3) and the driver has no escalate-row mechanism at all.
// AC-20260822-01-1 .. -9, -12, -13.
//
// AC-20260901-08-9 (tagged, no assertion change, specs/20260901/08-corpus-derivation-and-kill-
// match.md D8): `reviewerReturn()` below carries `killed: []` alongside a `survivors` array, and
// every `--mark reviewer-returned` call in this file (directly and via `driveToCapEdge()`) feeds
// that exact shape through the driver and depends on it landing FIX/DISPOSITIONS successfully —
// D8's new killed[] shape validation must CONTINUE TO accept an empty killed array exactly as it
// does today, or every escalation test below would break on its own setup before ever reaching
// the escalate-row behavior it actually pins.

const VERDICT = 'scripts/verdict.js'
const DRIVER = 'scripts/spec-review-driver.js'
const STOPPED_LEDGER_REL = '.claude/spec-runs.stopped.jsonl'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260822-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase) {
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Escalate Row Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260822-99-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260822-99-1**: foo() returns 42.
`
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}

// specs/20260901/09-disposer-gate.md D2/AC-20260901-09-2 (brief 18b): --mark
// dispositions on a non-empty pool now refuses without --file <disposer return> — every fix-cycle
// setup below that dispatches a fix must first write a minimal valid disposer return covering
// every ref in that pool exactly once (here: always a single "fix" recommendation, since these
// fixtures only ever carry one survivor or one injected leg finding) and pass --file <path>.
function oneFixReturnFile(scratchName, ref) {
  return returnFileWith(scratchName, {
    verdict: 'DISPOSED',
    dispositions: [{ ref, recommended: 'fix', reason: 'D3 of specs/20260901/09-disposer-gate.md: fix is the conservative disposition' }],
    tokens: 1,
  })
}

// One soft survivor, scope fix-delta throughout (sidesteps the reconcile/at-risk required-legs
// filter entirely — those two legs are excluded from fix-delta's required set, and a fix-delta
// manifest never emits rows for them, so declaring this scope keeps every cycle's dispositions
// pass a clean, uncomplicated pool of exactly 1).
// AC-20260901-08-9 (tagged): killed: [] here, riding with a non-empty survivors array, is the
// exact shape D8's new validation must SHALL CONTINUE TO accept for the reviewer-returned mark —
// every test below that calls driveToCapEdge() (or marks reviewer-returned directly) depends on
// this acceptance holding.
function reviewerReturn() {
  return {
    verdict: 'CLEAN',
    survivors: [{ severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' }],
    killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10,
  }
}

const readJsonl = (file) =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []

function readSidecar(sidecarDir) {
  return JSON.parse(fs.readFileSync(path.join(sidecarDir, 'review-state.json'), 'utf8'))
}

// Appends a NEW line for `leg` — verdict.js's manifest parser is last-line-wins per leg key
// (a Map keyed on leg name, populated in file order), so this overrides whatever review-legs.js
// itself wrote for that leg without touching the rest of the manifest.
function overrideLeg(manifestPath, leg, exit, observed) {
  fs.appendFileSync(manifestPath, JSON.stringify({ leg, exit, observed }) + '\n')
}

function makeHost(name) {
  const root = fs.realpathSync(tmpdir(name))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260822'), { recursive: true })
  const specRel = `specs/20260822/${name}.md`
  const spec = path.join(root, specRel)
  fs.writeFileSync(spec, specBody(diffBase))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, specRel, sidecar: spec.replace(/\.md$/, '.review') }
}

function makeWorktreeHost({ name, ignoreStopped }) {
  const root = fs.realpathSync(tmpdir(name + '-root'))
  const g = gitRepo(root)
  if (ignoreStopped) {
    fs.appendFileSync(path.join(root, '.gitignore'), STOPPED_LEDGER_REL + '\n')
    g('add', '.gitignore'); g('commit', '-q', '-m', 'ignore stopped ledger')
  }
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/' + name, '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  const specRel = `specs/20260822/${name}.md`
  fs.mkdirSync(path.join(wt, 'specs/20260822'), { recursive: true })
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody(baseSha).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST)
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  return { root, wt, spec, specRel, sidecar: spec.replace(/\.md$/, '.review') }
}

// Drives an in-place or worktree host through 2 full fix cycles plus a third reviewer-returned +
// dispositions --fix-dispatched 1, landing state FIX poised for the CAPPING (3rd) fix-applied —
// mirrors AC-20260820-07-8's own cap-approach idiom, generalized so every AC below can supply its
// own final fix-applied call (or hand-edit the sidecar instead, for the self-heal AC).
function driveToCapEdge(root, spec) {
  const r0 = run(root, spec)
  assert.strictEqual(stateOf(root, spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before the fix cap can be exercised: ' + r0.stdout + r0.stderr)
  for (let cycle = 1; cycle <= 2; cycle++) {
    const rf = returnFileWith('esc-drive-' + cycle, reviewerReturn())
    run(root, spec, '--mark', 'reviewer-returned', '--file', rf)
    // AC-20260901-09-2: reviewerReturn()'s single survivor is the whole pool (s0) — cover it with
    // a minimal "fix" disposer return before --mark dispositions --fix-dispatched 1 is accepted.
    const dispFile = oneFixReturnFile('esc-drive-disp-' + cycle, 's0')
    const d = run(root, spec, '--mark', 'dispositions', '--file', dispFile, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
    assert.strictEqual(stateOf(root, spec), 'FIX',
      `setup cycle ${cycle}: fix-dispatched 1 (within the 1-survivor pool) must land FIX: ` + d.stdout + d.stderr)
    const f = run(root, spec, '--mark', 'fix-applied')
    assert.strictEqual(f.status, 0, `setup cycle ${cycle}: fix-applied within the cap must succeed: ` + f.stdout + f.stderr)
  }
  const rf3 = returnFileWith('esc-drive-3', reviewerReturn())
  run(root, spec, '--mark', 'reviewer-returned', '--file', rf3)
  const dispFile3 = oneFixReturnFile('esc-drive-disp-3', 's0')
  const d3 = run(root, spec, '--mark', 'dispositions', '--file', dispFile3, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(root, spec), 'FIX',
    'setup: the third dispositions --fix-dispatched 1 must land FIX, poised for the capping fix-applied: ' + d3.stdout + d3.stderr)
}

// ---- verdict.js-level ACs (D1-D4): --escalated behavior, no driver involved --------------------

test('AC-20260822-01-1: WHEN verdict.js runs --escalated --fixDispatched 0 --ledger against 1 hard survivor + 1 red at-risk leg with --waived 1 --rejected 0 THE SYSTEM SHALL print HARD_FINDINGS (exit 1) and a ledger row carrying escalated:true and findings.fixDispatched:0', () => {
  const dir = fs.realpathSync(tmpdir('esc-ac1'))
  const manifestPath = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifestPath, [
    { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 } },
    { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
    { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } },
    { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
    { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
    { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
    { leg: 'at-risk', exit: 1, observed: { files: 1, testsExecuted: 5 } },
    { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const workflowPath = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflowPath, JSON.stringify({
    verdict: 'CLEAN', survivors: [{ severity: 'hard', claim: 'x', file: 'a', line: 1, impact: 'x', evidence: 'x' }],
    killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
  }))
  const retainDir = fs.realpathSync(tmpdir('esc-ac1-retain'))
  const r = runNode(VERDICT, [
    '--manifest', manifestPath, '--workflow', workflowPath,
    '--waived', '1', '--rejected', '0', '--fixDispatched', '0',
    '--escalated', '--ledger', '--spec', 'specs/20260822/99-esc-ac1.md', '--tier', 'standard',
    '--diff-loc', '10', '--iteration', '1', '--run-id', 'rv_esc1test01', '--retain', retainDir,
  ])
  assert.strictEqual(r.status, 1,
    'a 1-hard-survivor + 1-red-at-risk-leg escalate pass with --waived 1 must derive HARD_FINDINGS (exit 1) — a different exit means --escalated is not yet accepted or the derivation regressed: ' + r.stdout + r.stderr)
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'HARD_FINDINGS',
    'stdout line 1 must be the bare derived word HARD_FINDINGS: ' + JSON.stringify(r.stdout))
  assert.ok(lines[1], 'a --ledger --escalated pass must still print the ledger row on stdout line 2: ' + r.stdout)
  const row = JSON.parse(lines[1])
  assert.strictEqual(row.escalated, true,
    'the ledger row must carry escalated:true — this is the ONLY mechanism by which a capped run becomes distinguishable from an ordinary non-CLEAN review row: ' + JSON.stringify(row))
  assert.ok(row.findings && row.findings.fixDispatched === 0,
    'the row\'s findings.fixDispatched must be 0 — the escalate row must never credit a fix that never landed: ' + JSON.stringify(row))
})

test('AC-20260822-01-2: WHEN --escalated is passed with --fixDispatched 1 THE SYSTEM SHALL refuse (exit 2) with a stderr message naming "dispatched fix never landed", checked BEFORE any manifest file I/O', () => {
  const r = runNode(VERDICT, ['--manifest', '/nonexistent/does-not-exist.jsonl', '--escalated', '--fixDispatched', '1'])
  assert.strictEqual(r.status, 2,
    '--escalated with --fixDispatched > 0 must be refused — crediting a fix that never landed fabricates disposition coverage: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /dispatched fix never landed/,
    'the refusal must name the specific rule ("dispatched fix never landed"), never just exit 2 — the pre-image ALSO exits 2 for an unrecognized --escalated flag via the generic usage fallback, so an exit-code-only assert would pass vacuously against unimplemented code: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /cannot read/,
    'the refusal must fire on flag presence alone, before the (nonexistent) --manifest file is ever read — a "cannot read --manifest" message here would mean the check ran too late: ' + r.stderr)
  assert.strictEqual(r.stdout, '', 'a before-file-I/O refusal must print no verdict word: ' + JSON.stringify(r.stdout))
})

test('AC-20260822-01-3: WHEN --escalated is passed with --profile release THE SYSTEM SHALL refuse (exit 2) with a stderr message naming "drop --escalated", checked BEFORE any manifest file I/O', () => {
  const r = runNode(VERDICT, ['--manifest', '/nonexistent/does-not-exist.jsonl', '--escalated', '--profile', 'release'])
  assert.strictEqual(r.status, 2,
    '--escalated is a review-profile-only fact and must be refused under --profile release: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /drop --escalated/,
    'the refusal must name the specific remedy ("drop --escalated") — a release row carries no runId and no reviewer return, so escalated:true has nothing to key: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /cannot read/,
    'the refusal must fire on flag presence alone, before the (nonexistent) --manifest file is ever read: ' + r.stderr)
  assert.strictEqual(r.stdout, '', 'a before-file-I/O refusal must print no verdict word: ' + JSON.stringify(r.stdout))
})

test('AC-20260822-01-4: WHEN --escalated derivation reaches CLEAN (spike S1 Case B: 6 green fix-delta legs + green at-risk, 1 hard survivor, --waived 1 --fixDispatched 0) THE SYSTEM SHALL exit 2, print no verdict word and no ledger line, and name evidence drift on stderr — even though the identical inputs without --escalated derive CLEAN exit 0', () => {
  const dir = fs.realpathSync(tmpdir('esc-ac4'))
  const manifestPath = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifestPath, [
    { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 } },
    { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
    { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
    { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
    { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
    { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
    { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const workflowPath = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflowPath, JSON.stringify({
    verdict: 'CLEAN', survivors: [{ severity: 'hard', claim: 'x', file: 'a', line: 1, impact: 'x', evidence: 'x' }],
    killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10,
  }))

  // Regression proof this fixture is genuinely CLEAN-bound (never a vacuous rejection): the SAME
  // manifest/workflow/waived WITHOUT --escalated must derive CLEAN exit 0.
  const baseline = runNode(VERDICT, ['--manifest', manifestPath, '--workflow', workflowPath, '--waived', '1', '--rejected', '0', '--fixDispatched', '0'])
  assert.strictEqual(baseline.status, 0, 'setup precondition: this fixture must derive plain CLEAN without --escalated, or the guard below is never actually exercised: ' + baseline.stdout + baseline.stderr)
  assert.strictEqual(baseline.stdout.trim(), 'CLEAN', 'setup precondition: the un-escalated word must be exactly CLEAN: ' + baseline.stdout)

  const retainDir = fs.realpathSync(tmpdir('esc-ac4-retain'))
  const r = runNode(VERDICT, [
    '--manifest', manifestPath, '--workflow', workflowPath,
    '--waived', '1', '--rejected', '0', '--fixDispatched', '0',
    '--escalated', '--ledger', '--spec', 'specs/20260822/99-esc-ac4.md', '--tier', 'standard',
    '--diff-loc', '5', '--iteration', '3', '--run-id', 'rv_esc4test01', '--retain', retainDir,
  ])
  assert.strictEqual(r.status, 2,
    'a derived CLEAN under --escalated must be refused — a self-contradictory CLEAN+escalated:true row in the ledger file that must never wrongly say CLEAN is the worst possible output: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout, '', 'a CLEAN-under-escalated refusal must print NO verdict word and NO ledger line: ' + JSON.stringify(r.stdout))
  assert.match(r.stderr, /derived CLEAN under --escalated/,
    'the refusal must name that the derivation reached CLEAN under --escalated: ' + r.stderr)
  assert.match(r.stderr, /re-run dispositions/i,
    'the refusal must instruct re-running dispositions against the current evidence — the remedy for drift, not a crash: ' + r.stderr)
})

// ---- driver-level ACs (D5-D10): writeEscalateRow(), self-heal, D10 detector --------------------

test('AC-20260822-01-5 (also AC-20260901-09-2): WHEN the third fix-applied mark is refused in an in-place review THE SYSTEM SHALL have appended exactly one row with escalated:true to .claude/spec-runs.jsonl whose runId equals the sidecar\'s own runId and whose iteration equals the final manifest number, and the sidecar SHALL record escalateRunId', () => {
  const host = makeHost('esc-ac5')
  driveToCapEdge(host.root, host.spec)
  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = readJsonl(ledgerPath)

  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'a third fix-applied must still be refused — the iteration cap of 2 is unchanged by this spec: ' + thirdFix.stdout + thirdFix.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a refused third fix-applied must land the terminal state ESCALATE: ' + thirdFix.stdout + thirdFix.stderr)

  const after = readJsonl(ledgerPath)
  const newRows = after.slice(before.length)
  const escalateRows = newRows.filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(escalateRows.length, 1,
    'exactly one escalated:true row must be appended for this cap refusal — zero means the write point is missing, more than one is a duplicate append: ' + JSON.stringify(newRows))
  const row = escalateRows[0]

  const sidecar = readSidecar(host.sidecar)
  assert.ok(sidecar.runId, 'the sidecar must record marks.runId once the escalate row is written: ' + JSON.stringify(sidecar))
  assert.strictEqual(row.runId, sidecar.runId,
    'the appended row\'s runId must equal the sidecar\'s own runId — a mismatch would mean the row was minted under a second, unrelated run id: ' + JSON.stringify({ row, sidecar }))
  assert.strictEqual(row.iteration, 3,
    'the row\'s iteration must equal the final manifest number (3, after two real fix cycles) — a stale iteration would misattribute which pass the capped evidence came from: ' + JSON.stringify(row))
  assert.strictEqual(sidecar.escalateRunId, row.runId,
    'the sidecar must record escalateRunId equal to the appended row\'s runId — this is the idempotency guard a bare re-invocation checks before ever writing again: ' + JSON.stringify(sidecar))
})

// specs/20260824/06-review-range-identity.md D4/AC-7: writeEscalateRow() mirrors
// runHardStopVerdict()'s D4 threading exactly — the capped run's escalate row must name the range
// it burned its fix loop against, same as the hard-stop and close rows.
test('AC-20260824-06-7 (also AC-20260901-09-2): WHEN a third fix-applied lands ESCALATE THE SYSTEM writes an escalate row carrying diff.base and diff.head as 40-hex shas and diff.dirty as a boolean', () => {
  const host = makeHost('esc-ac7-range')
  driveToCapEdge(host.root, host.spec)
  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'setup: a third fix-applied must still be refused so the escalate row gets written: ' + thirdFix.stdout + thirdFix.stderr)

  const rows = readJsonl(path.join(host.root, '.claude/spec-runs.jsonl'))
  const escalateRows = rows.filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(escalateRows.length, 1,
    'setup: exactly one escalated:true row must exist for this spec before the range fields can be checked: ' +
    JSON.stringify(rows))
  const row = escalateRows[0]
  assert.match((row.diff && row.diff.base) || '', /^[0-9a-f]{40}$/,
    'AC-20260824-06-7: the escalate row\'s diff.base must be a 40-hex commit sha — D4 threads the resolved ' +
    'base sha onto all three ledger passes, escalate included: ' + JSON.stringify(row))
  assert.match((row.diff && row.diff.head) || '', /^[0-9a-f]{40}$/,
    'AC-20260824-06-7: the escalate row\'s diff.head must be a 40-hex commit sha — HEAD is re-read fresh at ' +
    'this pass, after the two real fix cycles: ' + JSON.stringify(row))
  assert.strictEqual(typeof (row.diff && row.diff.dirty), 'boolean',
    'AC-20260824-06-7: the escalate row\'s diff.dirty must be a boolean — an absent or non-boolean value here ' +
    'means the driver never threaded the flag onto writeEscalateRow()\'s verdict.js invocation: ' + JSON.stringify(row))
})

test('AC-20260822-01-6 (also AC-20260901-09-2): WHEN the refused third fix-applied mark is repeated THE SYSTEM SHALL still have exactly one escalated:true row for the spec — the write is idempotent on the persisted escalateRunId mark, never a second append', () => {
  const host = makeHost('esc-ac6')
  driveToCapEdge(host.root, host.spec)
  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')

  const first = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(first.status, 2, 'setup: the first capping fix-applied must be refused: ' + first.stdout + first.stderr)
  const second = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(second.status, 2,
    'a repeated refused mark must still exit 2 — the cap does not become permissive on retry: ' + second.stdout + second.stderr)

  const rows = readJsonl(ledgerPath).filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(rows.length, 1,
    'two refusals of the SAME third fix-applied mark must leave exactly one escalated:true row — a count of 0 means the first write never landed, a count of 2 means idempotency was never checked (pre-image count here is 0, so this pins both presence and idempotency at once): ' + JSON.stringify(rows))
})

test('AC-20260822-01-7 (also AC-20260901-09-2): WHEN the cap is hit in a worktree review whose main root already ignores the stopped ledger THE SYSTEM SHALL append the escalate row to <mainRoot>/.claude/spec-runs.stopped.jsonl and record that absolute path as marks.escalateLedgerPath with escalateFallback:false', () => {
  const host = makeWorktreeHost({ name: 'esc-ac7', ignoreStopped: true })
  driveToCapEdge(host.wt, host.spec)

  const wtLedger = path.join(host.wt, '.claude/spec-runs.jsonl')
  const wtLedgerBefore = fs.existsSync(wtLedger) ? fs.readFileSync(wtLedger, 'utf8') : null

  const thirdFix = run(host.wt, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2, 'setup: the capping fix-applied must be refused: ' + thirdFix.stdout + thirdFix.stderr)

  const stoppedPath = path.join(host.root, STOPPED_LEDGER_REL)
  assert.ok(fs.existsSync(stoppedPath),
    'a worktree cap refusal must write its escalate row to the DURABLE main-root path — writing it only inside the worktree means `git worktree remove` (merge-back\'s own eventual cleanup) destroys the only record of the capped run: ' + thirdFix.stdout + thirdFix.stderr)
  const rows = readJsonl(stoppedPath).filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(rows.length, 1,
    'exactly one escalated:true row for this spec must land in the durable stopped ledger: ' + JSON.stringify(rows))

  const wtLedgerAfter = fs.existsSync(wtLedger) ? fs.readFileSync(wtLedger, 'utf8') : null
  assert.strictEqual(wtLedgerAfter, wtLedgerBefore,
    'the worktree\'s own .claude/spec-runs.jsonl must stay byte-unchanged — the durable write must relocate the append, never duplicate it: ' + JSON.stringify({ before: wtLedgerBefore, after: wtLedgerAfter }))

  const sidecar = readSidecar(host.sidecar)
  assert.strictEqual(sidecar.escalateLedgerPath, stoppedPath,
    'the sidecar must record the absolute durable path as escalateLedgerPath so the ESCALATE step and D10\'s detector can both name where the row actually landed: ' + JSON.stringify(sidecar))
  assert.strictEqual(sidecar.escalateFallback, false,
    'escalateFallback must be false — the durable write succeeded, this was never a fallback: ' + JSON.stringify(sidecar))
})

test('AC-20260822-01-8 (also AC-20260901-09-2): WHEN the driver is invoked bare with marks.escalated set and no escalateRunId THE SYSTEM SHALL self-heal by appending the row then, and print the ESCALATE step', () => {
  const host = makeHost('esc-ac8')
  driveToCapEdge(host.root, host.spec)
  // Simulate the crash-between-refusal-and-write case directly (D5's own rationale: "the
  // abandonment path never re-invokes" — the refusal is the last guaranteed execution moment) by
  // hand-setting the mark WITHOUT ever calling the real capping fix-applied, mirroring this
  // suite's own established idiom of hand-editing review-state.json to reach an exact
  // precondition the CLI cannot construct directly (AC-20260820-07-8's manifest-provable-cap test).
  const stateFile = path.join(host.sidecar, 'review-state.json')
  const marks = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  marks.escalated = true
  fs.writeFileSync(stateFile, JSON.stringify(marks, null, 2) + '\n')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'setup precondition: escalated:true with pendingFix:true must derive state ESCALATE before the self-heal can be exercised')

  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = readJsonl(ledgerPath).filter((r) => r.spec === host.specRel && r.escalated === true)
  assert.strictEqual(before.length, 0,
    'setup precondition: no escalate row must exist yet — the hand-set mark never went through the real write point, so self-heal is what has to append the FIRST row')

  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'a bare invocation at ESCALATE must exit 0 (step printed): ' + r.stdout + r.stderr)
  assert.match(r.stdout, /ESCALATE/, 'the bare invocation must print the ESCALATE step: ' + r.stdout)

  const after = readJsonl(ledgerPath).filter((r2) => r2.spec === host.specRel && r2.escalated === true)
  assert.strictEqual(after.length, 1,
    'the self-heal must append exactly one escalated:true row on this bare invocation — a session that hits the cap and walks away, then returns later with no fix-applied re-attempt, must still get a durable record: ' + JSON.stringify(after))

  const sidecar = readSidecar(host.sidecar)
  assert.ok(sidecar.escalateRunId, 'the self-heal must record escalateRunId once it succeeds, same as the direct write point: ' + JSON.stringify(sidecar))
})

test('AC-20260822-01-9 (also AC-20260901-09-2): WHEN the escalate verdict pass exits 2 because a red leg drifted green between the dispositions pass and the cap (deriving CLEAN) THE SYSTEM SHALL embed the verdict error in the refusal output, append no row, leave escalateRunId unset, and keep marks.escalated true so the next invocation can retry', () => {
  const host = makeHost('esc-ac9')
  const emptyReturn = () => ({ verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10 })

  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: green legs must reach REVIEWER: ' + r0.stdout + r0.stderr)

  // Cycles 1 and 2: inject a red skip-reconcile finding into each manifest right after it is
  // created (before dispositions reads it) so a 0-survivor return can still justify
  // fix-dispatched 1 — the real fix-delta rerun each cycle produces naturally leaves
  // skip-reconcile genuinely green again, exactly the "red leg, then green" drift this AC pins.
  for (let cycle = 1; cycle <= 2; cycle++) {
    const n = cycle // manifest-<n> is current entering this loop iteration
    overrideLeg(path.join(host.sidecar, `manifest-${n}.jsonl`), 'skip-reconcile', 1, { skipped: 1, sanctioned: 0 })
    const rf = returnFileWith('esc-ac9-' + cycle, emptyReturn())
    run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf)
    // AC-20260901-09-2: the pool here is the injected leg finding (leg:skip-reconcile), not a
    // survivor — the disposer return's ref must name it exactly.
    const dispFile = oneFixReturnFile('esc-ac9-disp-' + cycle, 'leg:skip-reconcile')
    const d = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
    assert.strictEqual(stateOf(host.root, host.spec), 'FIX',
      `setup cycle ${cycle}: the injected red skip-reconcile finding must justify fix-dispatched 1: ` + d.stdout + d.stderr)
    const f = run(host.root, host.spec, '--mark', 'fix-applied')
    assert.strictEqual(f.status, 0, `setup cycle ${cycle}: fix-applied within the cap must succeed: ` + f.stdout + f.stderr)
  }

  // Third (final) cycle: inject red skip-reconcile again into manifest-3 and record dispositions
  // against it — waived 0, rejected 0, fixDispatched 1 (pool 1, sum 1, fits).
  overrideLeg(path.join(host.sidecar, 'manifest-3.jsonl'), 'skip-reconcile', 1, { skipped: 1, sanctioned: 0 })
  const rf3 = returnFileWith('esc-ac9-3', emptyReturn())
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', rf3)
  const dispFile3 = oneFixReturnFile('esc-ac9-disp-3', 'leg:skip-reconcile')
  const d3 = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile3, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX',
    'setup: the third dispositions must land FIX, poised for the capping fix-applied: ' + d3.stdout + d3.stderr)

  // Drift: AFTER dispositions recorded waived:0/rejected:0 against a pool of 1 (the injected red
  // skip-reconcile), the SAME manifest-3.jsonl is overridden green — the recomputed pool at the
  // escalate pass shrinks to 0, and waived:0+rejected:0+fixDispatched:0(forced) already covers it.
  overrideLeg(path.join(host.sidecar, 'manifest-3.jsonl'), 'skip-reconcile', 0, { skipped: 0, sanctioned: 0 })

  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = readJsonl(ledgerPath)

  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'the capping fix-applied must still exit 2 — the cap refusal stands regardless of what the escalate verdict pass derives: ' + thirdFix.stdout + thirdFix.stderr)
  const combined = thirdFix.stdout + thirdFix.stderr
  assert.match(combined, /iteration cap 2/,
    'the refusal must still name the iteration cap — D8\'s drift handling must never replace the base cap message: ' + combined)
  assert.match(combined, /derived CLEAN under --escalated/,
    'the refusal must embed the verdict.js drift error verbatim — a session hitting the cap needs to see WHY no row was written, not just that it was refused: ' + combined)

  const after = readJsonl(ledgerPath)
  assert.strictEqual(after.length, before.length,
    'a drift-refused escalate pass must append NO row — printing a CLEAN-tainted or otherwise fabricated row would be worse than printing nothing: ' + JSON.stringify({ before, after }))

  const sidecar = readSidecar(host.sidecar)
  assert.ok(!sidecar.escalateRunId,
    'escalateRunId must stay unset after a drift refusal — a set value here would falsely tell a later self-heal that the write already succeeded: ' + JSON.stringify(sidecar))
  assert.strictEqual(sidecar.escalated, true,
    'marks.escalated must remain true — the cap refusal itself still stands and must not be undone by the drifted verdict pass: ' + JSON.stringify(sidecar))
})

test('AC-20260822-01-12 (also AC-20260901-09-2): WHEN the driver prints the ESCALATE step THE SYSTEM SHALL name the waive/reject close route, the abandon route, and the absolute ledger path the escalate row landed in', () => {
  const host = makeHost('esc-ac12')
  driveToCapEdge(host.root, host.spec)
  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2, 'setup: the capping fix-applied must be refused: ' + thirdFix.stdout + thirdFix.stderr)

  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE', 'setup precondition: state must be ESCALATE for this AC: ' + r.stdout + r.stderr)

  assert.match(r.stdout, /dispositions --fix-dispatched 0/,
    'the ESCALATE step must name the waive/reject route — a fresh --mark dispositions --fix-dispatched 0 covering the pool closes normally, and today\'s ESCALATE text names no exit at all: ' + r.stdout)
  assert.match(r.stdout, /delete/i,
    'the ESCALATE step must name the abandon route (delete the sidecar and manifests to restart cold): ' + r.stdout)
  assert.match(r.stdout, /\.review/,
    'the abandon route must literally name the <spec>.review sidecar directory to delete: ' + r.stdout)
  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  assert.ok(r.stdout.includes(ledgerPath),
    'the ESCALATE step must name the absolute path the escalate row actually landed in — a session cannot judge or audit evidence it was never told the location of: ' + r.stdout)
})

test('AC-20260822-01-13 (also AC-20260901-09-2): WHEN the sidecar records a durable escalate ledger path but no row for this spec+runId is readable there THE SYSTEM SHALL print one stderr warning naming the spec, runId, and path, with the exit status and printed step identical to the no-warning run', () => {
  const host = makeWorktreeHost({ name: 'esc-ac13', ignoreStopped: true })
  driveToCapEdge(host.wt, host.spec)
  const thirdFix = run(host.wt, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2, 'setup: the capping fix-applied must be refused: ' + thirdFix.stdout + thirdFix.stderr)

  const sidecar = readSidecar(host.sidecar)
  assert.ok(sidecar.escalateRunId && sidecar.escalateLedgerPath,
    'setup precondition: the escalate write must have landed durably before this AC can exercise its loss: ' + JSON.stringify(sidecar))

  const r1 = run(host.wt, host.spec)
  assert.strictEqual(r1.status, 0, 'setup: a bare re-invocation with the row intact must exit 0: ' + r1.stdout + r1.stderr)

  const stoppedPath = sidecar.escalateLedgerPath
  const lines = fs.readFileSync(stoppedPath, 'utf8').trim().split('\n').filter(Boolean)
  const kept = lines.filter((l) => { const row = JSON.parse(l); return !(row.spec === host.specRel && row.runId === sidecar.escalateRunId) })
  assert.ok(kept.length < lines.length, 'setup: the escalate row must actually be removable from the durable file to simulate its loss')
  fs.writeFileSync(stoppedPath, kept.length ? kept.join('\n') + '\n' : '')

  const r2 = run(host.wt, host.spec)
  assert.strictEqual(r2.status, r1.status,
    'the silent-loss detector must never block or change the exit status — a partial dead-letter observation must not itself become a new failure: ' + JSON.stringify({ r1status: r1.status, r2status: r2.status, r2out: r2.stdout + r2.stderr }))
  assert.strictEqual(r2.stdout, r1.stdout,
    'the printed step must be byte-identical to the no-warning run — the detector is stderr-only and must never alter the step text: ' + JSON.stringify({ r1: r1.stdout, r2: r2.stdout }))
  assert.match(r2.stderr, new RegExp(host.specRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the warning must name the spec whose durable row went missing: ' + r2.stderr)
  assert.match(r2.stderr, new RegExp(sidecar.escalateRunId),
    'the warning must name the runId whose row is unreadable — without it a session cannot correlate the warning to a specific run: ' + r2.stderr)
  assert.match(r2.stderr, new RegExp(stoppedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the warning must name the durable path that was checked, so the loss is diagnosable: ' + r2.stderr)
  assert.doesNotMatch(r1.stderr, new RegExp(sidecar.escalateRunId),
    'sanity: the FIRST bare invocation (row still present) must not have printed this warning — otherwise the detector would be firing unconditionally, not on genuine loss: ' + r1.stderr)
})
