'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20260820/07-review-driver.md (2026-08-20, brief 16): the review stage's ~14
// hand-performed choreography steps (base derivation, manifest lifecycle, both verdict
// passes, ledger appends, the status flip, merge-back) move into spec-review-driver.js on
// the spec-design-driver.js contract — a session that only follows printed steps can no
// longer skip or hand-compose any of them. These tests drive the real binary end-to-end
// against synthetic git hosts (the spec-design-driver.js idiom: tmpdir() + gitRepo(),
// runNode with cwd), never poke at internals, and are written BEFORE the driver exists —
// every test here fails on a missing/inert spec-review-driver.js and must go green only
// once the state machine genuinely does what its AC names. AC-20260820-07-1 … -12 below.

const DRIVER = 'scripts/spec-review-driver.js'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260820-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody({ status = 'implementing', tier = 'standard', diffBase, acId = 'AC-20260820-99-1' }) {
  return `---
status: ${status}
tier: ${tier}
diff_base: ${diffBase}
---
# Driver Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

function makeHost({ gateFails = false } = {}) {
  const root = fs.realpathSync(tmpdir('rvdrv'))
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
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-test.md')
  fs.writeFileSync(spec, specBody({ diffBase }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), gateFails ? 'module.exports = () => 0\n' : 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

function makeSkipsHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-skips'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: "echo 'ℹ skipped 1'; node --test {testDirs}",
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-skips.md')
  fs.writeFileSync(spec, specBody({ diffBase, acId: 'AC-20260820-99-2' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-2'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function toReviewer(host) {
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before this AC can be exercised: ' + r.stdout + r.stderr)
  return r
}

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}
const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }
const SURVIVOR_RETURN = {
  verdict: 'CLEAN',
  survivors: [{ severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' }],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

test('AC-20260820-07-1: WHEN the driver runs on an implementing spec whose legs all pass THE SYSTEM executes review-legs itself (manifest-1.jsonl carries every leg row) and prints the REVIEWER dispatch step, never a leg instruction', () => {
  const { root, spec, sidecar } = makeHost()
  const r = run(root, spec)
  assert.strictEqual(r.status, 0, 'a fully green legs run must exit 0 (step printed), not a precondition failure: ' + r.stdout + r.stderr)
  const manifestPath = path.join(sidecar, 'manifest-1.jsonl')
  assert.ok(fs.existsSync(manifestPath),
    'the driver must execute review-legs.js itself and write manifest-1.jsonl into the <spec>.review sidecar — a session that only follows printed steps could otherwise skip this deterministic leg run entirely: ' + r.stdout + r.stderr)
  const rows = fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  for (const leg of ['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk', 'promise-sweep']) {
    assert.ok(rows.some(x => x.leg === leg),
      `manifest-1.jsonl must carry a "${leg}" row from the driver's own review-legs.js invocation — a missing row means the driver did not genuinely run the leg it claims to have executed: ${JSON.stringify(rows)}`)
  }
  assert.match(r.stdout, /reviewer/i,
    'a fully green legs run must print the REVIEWER dispatch step — printing a leg instruction instead would ask the session to redo work the driver already did: ' + r.stdout)
  assert.strictEqual(stateOf(root, spec), 'REVIEWER', 'the derived state after a green legs run must be REVIEWER: ' + r.stdout)
})

test('AC-20260820-07-2 (also AC-20260821-04-8, SHALL CONTINUE TO): WHEN the synthetic gate fails THE SYSTEM appends exactly one GATE_RED ledger line byte-equal to verdict.js\'s own line, prints the red leg + remedy, and reports state STOPPED — the reviewer step is never printed', () => {
  const { root, spec, sidecar } = makeHost({ gateFails: true })
  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : ''
  const r = run(root, spec)
  assert.strictEqual(stateOf(root, spec), 'STOPPED',
    'a red blocking leg must land the driver in the terminal state STOPPED, never proceed as if the substrate were clean: ' + r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout, /reviewer dispatch|dispatch.*reviewer/i,
    'a red substrate must never print the reviewer dispatch step — dispatching the reviewer on a red gate is exactly the procedural-hallucination class this driver exists to structurally eliminate: ' + r.stdout)

  const beforeLines = before.trim() ? before.trim().split('\n') : []
  assert.ok(fs.existsSync(ledger), 'a GATE_RED run must append a ledger line — a stopped attempt left un-appended is invisible to the pipeline: ' + r.stdout + r.stderr)
  const afterLines = fs.readFileSync(ledger, 'utf8').trim().split('\n')
  assert.strictEqual(afterLines.length, beforeLines.length + 1,
    'exactly one ledger line must be appended for the STOPPED run — more than one is a duplicate append, fewer means the append was skipped: before=' + beforeLines.length + ' after=' + afterLines.length)
  const appended = JSON.parse(afterLines[afterLines.length - 1])
  assert.strictEqual(appended.verdict, 'GATE_RED', 'the appended ledger row must carry verdict GATE_RED: ' + JSON.stringify(appended))
  assert.ok(appended.runId, 'the appended row must carry a runId — /spec:escape needs a backlink on every row: ' + JSON.stringify(appended))

  // Reproducibility check for "byte-equal to verdict.js's stdout line 2": feeding verdict.js the
  // SAME manifest with the exact tier/diff/iteration/runId the driver's own row recorded must
  // reproduce an identical row (every field but the call-time timestamp) — proving the driver
  // appended verdict.js's own printed line rather than hand-composing one.
  const manifestPath = path.join(sidecar, 'manifest-1.jsonl')
  assert.ok(fs.existsSync(manifestPath), 'a STOPPED run must still have written manifest-1.jsonl before hard-stopping: ' + r.stdout)
  assert.ok(appended.spec && appended.tier, 'the ledger row must carry --spec and --tier so a GATE_RED run is attributable: ' + JSON.stringify(appended))
  const reArgs = ['--manifest', manifestPath, '--ledger', '--spec', appended.spec, '--tier', appended.tier, '--run-id', appended.runId]
  if (appended.diff && typeof appended.diff.loc === 'number') reArgs.push('--diff-loc', String(appended.diff.loc))
  if (appended.iteration !== undefined) reArgs.push('--iteration', String(appended.iteration))
  const reRun = runNode('scripts/verdict.js', reArgs)
  const reRunLine = reRun.stdout.trim().split('\n')[1]
  assert.ok(reRunLine, 'verdict.js must print a ledger line when re-invoked with the driver\'s own recorded flags against the same manifest: ' + reRun.stdout + reRun.stderr)
  const reRunRow = JSON.parse(reRunLine)
  delete reRunRow.ts
  const appendedNoTs = { ...appended }; delete appendedNoTs.ts
  assert.deepStrictEqual(appendedNoTs, reRunRow,
    'the ledger row the driver appended must be byte-equal (aside from the call-time timestamp) to verdict.js\'s own output for the same manifest and flags — any divergence means the driver hand-assembled the row instead of using verdict.js\'s printed line: appended=' + JSON.stringify(appended) + ' reRun=' + JSON.stringify(reRunRow))
})

test('AC-20260820-07-3: WHEN --mark reviewer-returned --file names a missing or malformed file THE SYSTEM exits 2 naming the defect and leaves the state unchanged', () => {
  const host = makeHost()
  toReviewer(host)

  const missing = path.join(fs.realpathSync(tmpdir('rvdrv-scratch')), 'nope.json')
  const rMissing = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', missing)
  assert.strictEqual(rMissing.status, 2,
    'a reviewer-returned mark whose --file is missing must exit 2, never crash uninformatively or silently accept the mark: ' + rMissing.stdout + rMissing.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'a refused mark must leave state at REVIEWER — advancing here would accept an evidence-less reviewer pass')

  const malformed = path.join(fs.realpathSync(tmpdir('rvdrv-scratch2')), 'bad.json')
  fs.writeFileSync(malformed, '{not valid json')
  const rBad = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', malformed)
  assert.strictEqual(rBad.status, 2, 'an unparseable reviewer return file must also exit 2: ' + rBad.stdout + rBad.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'the malformed-file mark must also leave the state unchanged')
})

test('AC-20260820-07-4: WHEN the reviewer return file\'s verdict is REVIEWER_FAILED THE SYSTEM refuses the mark (exit 2) and prints the re-dispatch instruction', () => {
  const host = makeHost()
  toReviewer(host)
  const failedFile = returnFileWith('rvdrv-failed', { verdict: 'REVIEWER_FAILED', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', failedFile)
  assert.strictEqual(r.status, 2,
    'a REVIEWER_FAILED return must refuse the mark — accepting it would let a reviewer that died mid-run read as a completed pass: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /re-?dispatch/i,
    'the refusal must print the re-dispatch instruction so the session relaunches the reviewer instead of stalling: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'the state must remain REVIEWER so the very next driver run asks for a fresh dispatch')
})

test('AC-20260820-07-5: WHEN --mark dispositions counts exceed the survivor + leg-finding pools THE SYSTEM exits 2 (verdict.js\'s contradiction arithmetic, surfaced through the driver) and leaves the state unchanged', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-disp', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup: a returned non-empty survivor list must land DISPOSITIONS')

  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '5', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 2,
    'dispositions summing to more than the survivor+leg-finding pool (1 survivor here) must exit 2 — accepting it would record counts the run never actually found: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'a refused dispositions mark must leave the state at DISPOSITIONS unchanged')
})

test('AC-20260820-07-6: WHEN a clean run reaches CLOSE (0 survivors, dispositions 0 0 0) THE SYSTEM runs the authoritative verdict with --retain .claude/spec-runs, appends one ledger line, flips status implementing -> done, and prints the close-step instructions', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-clean', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS')

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : []
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a zero-survivor, zero-finding disposition must be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'zero undispositioned findings must land CLOSE: ' + r.stdout + r.stderr)

  const after = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1,
    'exactly one ledger line must be appended for the authoritative CLOSE pass: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  assert.strictEqual(row.verdict, 'CLEAN', 'the authoritative pass must derive CLEAN for a zero-survivor, zero-leg-finding run: ' + JSON.stringify(row))

  const retainDir = path.join(host.root, '.claude/spec-runs')
  assert.ok(fs.existsSync(retainDir) && fs.readdirSync(retainDir).includes(row.runId + '.json'),
    'the authoritative verdict must run with --retain .claude/spec-runs, writing <runId>.json — without it the reviewer\'s full-fidelity evidence is never durable: ' + retainDir)

  assert.match(fs.readFileSync(host.spec, 'utf8'), /status:\s*done/,
    'CLOSE must flip the spec\'s frontmatter status from implementing to done')

  assert.match(r.stdout, /Canonical Delta/, 'the CLOSE step must print the Canonical Delta instruction: ' + r.stdout)
  assert.match(r.stdout, /\.claude\/spec-runs\/\*\.json/,
    'the CLOSE step\'s hygiene listing must name .claude/spec-runs/*.json as an EXPECTED artifact — omitting it invites deleting durable evidence as reviewer scratch: ' + r.stdout)
  assert.match(r.stdout, /EXPECTED/, 'the hygiene listing must mark expected artifacts (retained evidence + sidecar) as EXPECTED, not stray paths to clean up: ' + r.stdout)
  assert.match(r.stdout, /close[- ]commit/i, 'the CLOSE step must print the close-commit instruction: ' + r.stdout)
})

test('AC-20260820-07-7: WHEN --mark closed is passed while the tree is dirty beyond the sidecar THE SYSTEM exits 2 naming the unexpected paths', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-dirty', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE')

  fs.writeFileSync(path.join(host.root, 'stray-uncommitted.txt'), 'oops\n')
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a dirty tree beyond the sidecar must refuse the closed mark — accepting it would leave an unadjudicated stray path riding the close commit: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /stray-uncommitted\.txt/,
    'the refusal must name the unexpected path so the session can adjudicate it, not just report generic dirtiness: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'a refused closed mark must leave the state at CLOSE')
})

test('AC-20260820-07-8: a dispatched fix cycles FIX -> fix-applied (fresh manifest, legs --fix-delta) -> REVIEWER twice, and a third fix-applied is refused with state ESCALATE naming the iteration cap of 2', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER')

  for (let cycle = 1; cycle <= 2; cycle++) {
    const returnFile = returnFileWith('rvdrv-fix-' + cycle, SURVIVOR_RETURN)
    run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
    assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', `cycle ${cycle}: a returned survivor must land DISPOSITIONS`)

    const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
    assert.strictEqual(dispR.status, 0, `cycle ${cycle}: fix-dispatched 1 (within the 1-survivor pool) must be accepted: ` + dispR.stdout + dispR.stderr)
    assert.strictEqual(stateOf(host.root, host.spec), 'FIX', `cycle ${cycle}: fix-dispatched 1 must land FIX`)

    const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
    assert.strictEqual(fixR.status, 0, `cycle ${cycle}: fix-applied within the cap must succeed: ` + fixR.stdout + fixR.stderr)
    const manifestN = path.join(host.sidecar, `manifest-${cycle + 1}.jsonl`)
    assert.ok(fs.existsSync(manifestN),
      `cycle ${cycle}: fix-applied must re-run legs --fix-delta on a FRESH manifest-${cycle + 1}.jsonl — reusing the prior manifest would carry stale pre-fix evidence into the fix-delta pass: ` + fixR.stdout + fixR.stderr)
    assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', `cycle ${cycle}: fix-applied must return to REVIEWER for the fix-delta reviewer pass: ` + fixR.stdout + fixR.stderr)
  }

  const returnFile3 = returnFileWith('rvdrv-fix-3', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile3)
  const dispR3 = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(dispR3.status, 0, 'a third dispositions-with-fix-dispatched must still be accepted — the cap applies to fix-applied, not to entering FIX: ' + dispR3.stdout + dispR3.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX')

  const manifestsBefore = fs.readdirSync(host.sidecar).filter(f => /^manifest-\d+\.jsonl$/.test(f)).sort()
  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'a third fix-applied must be refused — the iteration cap is 2, and accepting a third cycle re-opens unbounded fix/review churn: ' + thirdFix.stdout + thirdFix.stderr)
  assert.match(thirdFix.stdout + thirdFix.stderr, /iteration cap 2/,
    'the refusal must literally name the iteration cap ("iteration cap 2") per the Contracts\' own literal note: ' + thirdFix.stdout + thirdFix.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a refused third fix-applied must land the terminal state ESCALATE and print the escalation step: ' + thirdFix.stdout + thirdFix.stderr)
  const manifestsAfter = fs.readdirSync(host.sidecar).filter(f => /^manifest-\d+\.jsonl$/.test(f)).sort()
  assert.deepStrictEqual(manifestsAfter, manifestsBefore,
    'a refused fix-applied must create NO new manifest file — a manifest-4.jsonl appearing here means legs re-ran on a mark the driver was supposed to refuse: ' + JSON.stringify({ manifestsBefore, manifestsAfter }))
})

test('AC-20260820-07-8 (manifest-provable cap): hand-editing the sidecar\'s stored iteration count cannot reach ESCALATE — only manifest-<n>.jsonl files actually present on disk advance the cap', () => {
  const host = makeHost()
  run(host.root, host.spec)
  const returnFile = returnFileWith('rvdrv-hand-edit', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX')
  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR.status, 0, 'setup: one real fix-applied cycle must succeed: ' + fixR.stdout + fixR.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-2.jsonl')), 'setup: one real fix-applied cycle must produce manifest-2.jsonl')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER')

  // Hand-edit the sidecar to CLAIM the cap is already exhausted, with only manifest-1/2 on disk.
  const stateFile = path.join(host.sidecar, 'review-state.json')
  const stateJson = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  stateJson.iteration = 99
  stateJson.fixIterations = 99
  fs.writeFileSync(stateFile, JSON.stringify(stateJson, null, 2))

  assert.notStrictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a hand-edited sidecar counter must NEVER be able to reach ESCALATE on its own — the iteration cap must derive from manifest-<n>.jsonl files actually present on disk (only manifest-1 and manifest-2 exist, within the cap of 2), per the Fragile Spots note that the count must not be a stored counter')

  // The real cap must still be reachable normally afterward — the fabricated counter consumed nothing real.
  const returnFile2 = returnFileWith('rvdrv-hand-edit-2', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile2)
  run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  const fixR2 = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR2.status, 0,
    'the hand-edited counter must not have consumed the real cap — the second genuine fix-applied (only manifest-1/2 on disk beforehand) must still succeed: ' + fixR2.stdout + fixR2.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-3.jsonl')), 'the second genuine fix cycle must produce manifest-3.jsonl')
})

test('AC-20260820-07-9: WHEN the driver is re-invoked with no mark THE SYSTEM prints the same step again with no side effects — no duplicate manifest rows, no duplicate ledger lines', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: fixture must reach REVIEWER before exercising re-invocation idempotency')

  const manifestPath = path.join(host.sidecar, 'manifest-1.jsonl')
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const readLedger = () => (fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : '')

  const manifestSnap = fs.readFileSync(manifestPath, 'utf8')
  const ledgerSnap = readLedger()

  const r1 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'literal: a no-mark invocation at REVIEWER must derive the identical state: ' + r1.stdout + r1.stderr)
  assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), manifestSnap,
    'a no-mark invocation must not append duplicate manifest rows — manifest-1.jsonl must stay byte-identical: ' + r1.stdout + r1.stderr)
  assert.strictEqual(readLedger(), ledgerSnap,
    'a no-mark invocation must not append a ledger line — the ledger must stay byte-identical: ' + r1.stdout + r1.stderr)

  const r2 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'literal: TWO consecutive no-mark invocations at REVIEWER must derive the identical state both times: ' + r2.stdout + r2.stderr)
  assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), manifestSnap,
    'the second consecutive no-mark invocation must also leave manifest-1.jsonl byte-identical: ' + r2.stdout + r2.stderr)
  assert.strictEqual(readLedger(), ledgerSnap,
    'literal: the ledger must stay byte-identical across both consecutive no-mark invocations at REVIEWER: ' + r2.stdout + r2.stderr)
})

test('AC-20260820-07-10: WHEN the gate row reports skips > 0 and no skips file is marked THE SYSTEM prints the SKIPS extraction step; after skips-extracted --file <f> it re-runs legs with --skips <f> on a fresh manifest', () => {
  const host = makeSkipsHost()
  const r1 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS',
    'a gate row reporting skips > 0 with no skips file marked must land state SKIPS, not proceed straight to REVIEWER: ' + r1.stdout + r1.stderr)
  assert.match(r1.stdout, /skip/i, 'the SKIPS state must print the extraction step instructions: ' + r1.stdout)

  const skipsFile = path.join(fs.realpathSync(tmpdir('rvdrv-skipfile')), 'skips.txt')
  fs.writeFileSync(skipsFile, 'AC-20260820-99-2: foo() returns 42\n')
  const r2 = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', skipsFile)
  assert.strictEqual(r2.status, 0, 'a valid skips-extracted mark must be accepted: ' + r2.stdout + r2.stderr)

  const manifest2 = path.join(host.sidecar, 'manifest-2.jsonl')
  assert.ok(fs.existsSync(manifest2),
    'skips-extracted must re-run legs on a FRESH manifest-2.jsonl — reusing manifest-1.jsonl would mix pre- and post-skip-attribution evidence: ' + r2.stdout + r2.stderr)
  const rows2 = fs.readFileSync(manifest2, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.ok(rows2.some(x => x.leg === 'gate'), 'the fresh manifest must still carry a gate row from the re-run: ' + JSON.stringify(rows2))
})

// specs/20260821/03-cross-spec-skip-mapping.md D3 (2026-08-21): ac-matrix.js's new route 3
// (D1) maps a skipped test through the file its runner names — but only if the SKIPS step's
// printed instruction actually tells the session to keep that qualifier. The pre-existing test
// above pins the SKIPS step only as /skip/i (deliberately loose, per this spec's Rationale), so
// this is a purely additive assertion, not a collision. Red-first: today's SKIPS step says only
// "Extract the skip names ... write them to a scratch file" — it never mentions a file qualifier,
// a bare-names fallback, or pytest's path::name form at all.
test('AC-20260821-03-8: the SKIPS step\'s extraction instruction names the <relpath>::<name> qualifier form (pytest-style) and instructs bare names only when the runner reports no path — red-first, since today\'s step gives no qualifier guidance at all', () => {
  const host = makeSkipsHost()
  const r1 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS',
    'setup precondition: a gate row reporting skips > 0 with no skips file marked must land state SKIPS before this AC can be exercised: ' + r1.stdout + r1.stderr)
  assert.match(r1.stdout, /<relpath>::<name>/,
    'the SKIPS step must literally name the <relpath>::<name> qualifier form — route 3 ' +
    '(specs/20260821/03-cross-spec-skip-mapping.md D1) consumes exactly this shape, and a prompt ' +
    'that omits it starves the fix: a session extracting only bare test names produces the same ' +
    'unmapped input the new mapping route cannot use: ' + r1.stdout)
  assert.match(r1.stdout, /pytest/i,
    'the instruction must name pytest\'s path::name form as the worked example of a runner that ' +
    'emits a file qualifier: ' + r1.stdout)
  assert.match(r1.stdout, /bare names?/i,
    'the instruction must cover the bare-names case for a runner that emits no path at all: ' + r1.stdout)
  assert.match(r1.stdout, /no path/i,
    'the bare-names instruction must be conditioned on "the runner reports no path" — an ' +
    'unconditional bare-names instruction would tell every session to strip qualifiers regardless ' +
    'of what the runner actually emitted, starving route 3 for every runner that DOES emit one: ' + r1.stdout)
})

test('AC-20260820-07-11: WHEN --state is passed THE SYSTEM prints the bare state name only', () => {
  const host = makeHost()
  run(host.root, host.spec)
  const r = run(host.root, host.spec, '--state')
  assert.strictEqual(r.status, 0, '--state must exit 0 for a non-blocked state: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout.trim(), 'REVIEWER',
    '--state must print exactly the bare state name and nothing else — a caller scripting against this needs one clean token: ' + JSON.stringify(r.stdout))
})

test('AC-20260820-07-12 (also AC-20260821-04-9, SHALL CONTINUE TO): WHEN merge-strategy is marked from the main root in a two-branch fixture THE SYSTEM runs merge, cleanup, and verify — promoting the worktree\'s ledger and retained evidence into the main root (exact-line / filename dedup) and leaving the worktree clean for a plain `git worktree remove` — prints spec-status --next verbatim, and lands DONE; the same mark from inside the build worktree is refused with a relocate instruction', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-merge'))
  const g = gitRepo(root)
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

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-merge', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, 'specs/20260820/99-drv-merge.md')
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-3' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-3'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')

  const sidecar = spec.replace(/\.md$/, '.review')

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the two-branch fixture must reach REVIEWER on green legs')
  const returnFile = returnFileWith('rvdrv-merge-return', CLEAN_RETURN)
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean pass must reach CLOSE')

  // The session's close commit — specific file only, never a blind `add -A` that would scoop up
  // the sidecar (never committed, per D10).
  gw('add', 'specs/20260820/99-drv-merge.md')
  gw('commit', '-q', '-m', 'close')
  const closeR = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0, 'setup: closed must succeed once the tree is clean apart from the sidecar: ' + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(wt, spec), 'MERGE', 'setup: a closed spec must land state MERGE')

  const refused = run(wt, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(refused.status, 2,
    'marking merge-strategy while the driver\'s own inherited CWD is inside the build worktree must be refused — cleanup would otherwise delete the directory the session stands in: ' + refused.stdout + refused.stderr)
  assert.match(refused.stdout + refused.stderr, /relocate/i,
    'the refusal must print the relocate instruction so the session knows to ExitWorktree/cd before retrying: ' + refused.stdout + refused.stderr)
  assert.ok(fs.existsSync(wt), 'a refused merge-strategy mark must never remove the worktree')

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'the same mark, issued with CWD relocated to the main root, must be accepted and run merge + cleanup + verify: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'a completed merge-strategy mark must land (and report) the terminal state DONE: ' + merged.stdout)

  assert.ok(!fs.existsSync(wt),
    'cleanup must remove the build worktree — the sidecar living inside it dies with it, per D10\'s "dies with the worktree at cleanup, by design"')
  assert.match(fs.readFileSync(path.join(root, 'specs/20260820/99-drv-merge.md'), 'utf8'), /status:\s*done/,
    'the merge must fast-forward the close commit into the main root — the root\'s own copy of the spec must now read status: done')

  const status = runNode('scripts/spec-status.js', ['--root', root, '--next'])
  assert.strictEqual(status.status, 0, 'spec-status.js --next must succeed against the post-merge root: ' + status.stdout + status.stderr)
  assert.ok(status.stdout.trim() && merged.stdout.includes(status.stdout.trim()),
    'the driver must print spec-status --next\'s output VERBATIM as the closing pointer — it is the only source of the "what now" suggestion, and independently re-deriving it against the post-merge root must reproduce byte-identical text: ' + JSON.stringify({ driver: merged.stdout, status: status.stdout }))
})

// specs/20260820/07-review-driver.md (2026-08-21 review, rulings R8/R9/R10): three fixes landed
// past the original AC-1..12 build. R9: every child this driver spawns is wrapped by runChild(),
// which fails closed on spawnSync's status === null (signal death, spawn failure, maxBuffer
// overflow) instead of tolerating it as a silent pass — the reviewer's own executed repro was a
// gateCommand that SIGKILLs review-legs.js itself via the `bash -c` tail-exec trick, which the
// OLD driver let through as `state: REVIEWER` over a manifest nobody wrote. R8: a cold invocation
// on a spec already `status: done` whose sidecar carries no closeRunId of ITS OWN run is refused
// (exit 2, names /spec:escape) rather than silently re-walking a review that records nothing —
// note this refusal fires only when the sidecar directory exists (a stray/hand-recreated
// artifact); a `done` spec with NO sidecar at all stays the legitimate post-merge DONE fast path
// (R2 arm (a), unaffected). R10: the CLOSE step's close-commit instruction now excludes the
// sidecar + ledger + retained-evidence paths when running in a linked worktree (they promote to
// the main root only after the merge lands), but includes them unchanged when running in-place.

function makeKillHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-kill'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    // `bash -c '<cmd>'` tail-exec's a lone last command, so this node process's ppid IS
    // review-legs.js's own pid, not bash's — the SIGKILL lands on the leg runner itself.
    gateCommand: "node -e \"process.kill(process.ppid,'SIGKILL')\"",
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-kill.md')
  fs.writeFileSync(spec, specBody({ diffBase, acId: 'AC-20260820-99-4' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-4'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

test('AC-20260820-07-14: WHEN the gateCommand SIGKILLs review-legs.js itself THE SYSTEM exits 2 naming the dead child, never reports state REVIEWER, and never writes manifest-1.jsonl', () => {
  const host = makeKillHost()
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 2,
    'a leg runner that dies by signal mid-run must be treated as an unrun check, never a pass — exit 0 here would hand the session a manifest path that was never written: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /review-legs\.js/,
    'the refusal must name review-legs.js as the dead child so the session knows which subprocess died, not just that something failed: ' + r.stderr)
  const manifestPath = path.join(host.sidecar, 'manifest-1.jsonl')
  assert.ok(!fs.existsSync(manifestPath),
    'a signal-killed leg runner must leave no manifest-1.jsonl behind — a file existing here would mean partial evidence got treated as trustworthy: ' + JSON.stringify(fs.existsSync(host.sidecar) ? fs.readdirSync(host.sidecar) : []))

  const r2 = run(host.root, host.spec, '--state')
  assert.notStrictEqual(r2.stdout.trim(), 'REVIEWER',
    'a re-invocation after the kill must never derive state REVIEWER — that would mean the driver advanced past a leg run that never actually produced evidence: ' + r2.stdout + r2.stderr)
  assert.strictEqual(r2.status, 2,
    'the SAME unfixed host must refuse identically on re-invocation (the kill reproduces every time) rather than flip to a stale cached REVIEWER state: ' + r2.stdout + r2.stderr)
  assert.ok(!fs.existsSync(manifestPath),
    'the re-invocation must also leave manifest-1.jsonl unwritten — the underlying cause (the gateCommand) was never fixed, so nothing new can have been trusted into existence: ' + r2.stdout + r2.stderr)
})

function makeDoneHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-done'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-done.md')
  fs.writeFileSync(spec, specBody({ status: 'done', diffBase, acId: 'AC-20260820-99-5' }))
  g('add', '-A'); g('commit', '-q', '-m', 'spec')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

test('AC-20260820-07-15: WHEN a done spec\'s sidecar exists but does not record this run\'s own closeRunId THE SYSTEM refuses (exit 2, names /spec:escape) and appends no ledger line, in BOTH an empty hand-recreated sidecar and one carrying stray marks with no closeRunId', () => {
  const host = makeDoneHost()
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const ledgerSnap = () => (fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : '')

  // Case 1: sidecar directory hand-recreated with nothing in it (no review-state.json at all).
  fs.mkdirSync(host.sidecar, { recursive: true })
  const before1 = ledgerSnap()
  const r1 = run(host.root, host.spec)
  assert.strictEqual(r1.status, 2,
    'a done spec whose sidecar carries no closeRunId of its own must be refused, not walked as a fresh review that would record nothing: ' + r1.stdout + r1.stderr)
  assert.match(r1.stderr, /\/spec:escape/,
    'the refusal must name /spec:escape as the remedy — that command exists precisely to record a defect escaping an already-passed review: ' + r1.stderr)
  assert.strictEqual(ledgerSnap(), before1,
    'the refused cold invocation must append NO ledger line — the old bug was a full review walk over a done spec recording nothing while looking like a real run: ' + JSON.stringify({ before: before1, after: ledgerSnap() }))

  // Case 2: sidecar carries a hand-written review-state.json with unrelated marks but no closeRunId
  // (an aborted prior run's stray artifact) — must refuse identically.
  fs.writeFileSync(path.join(host.sidecar, 'review-state.json'), JSON.stringify({ iteration: 1, reviewerReturnFile: 'x' }))
  const before2 = ledgerSnap()
  const r2 = run(host.root, host.spec)
  assert.strictEqual(r2.status, 2,
    'a sidecar carrying OTHER marks but still no closeRunId must be refused the same way — closeRunId, not sidecar existence alone, is the signal that THIS run already closed: ' + r2.stdout + r2.stderr)
  assert.match(r2.stderr, /\/spec:escape/,
    'this case must also name /spec:escape: ' + r2.stderr)
  assert.strictEqual(ledgerSnap(), before2,
    'this case must also append no ledger line: ' + JSON.stringify({ before: before2, after: ledgerSnap() }))

  // Non-regression: a done spec with NO sidecar at all is the legitimate post-merge fast path
  // (the sidecar is deleted at DONE) and must keep printing DONE at exit 0 — this refusal must
  // not over-fire onto the ordinary completed-review case.
  fs.rmSync(host.sidecar, { recursive: true, force: true })
  const r3 = run(host.root, host.spec)
  assert.strictEqual(r3.status, 0,
    'a done spec with no sidecar at all must NOT be refused — that is the ordinary post-merge state (sidecar deleted at DONE), and refusing it here would break every already-completed review: ' + r3.stdout + r3.stderr)
  assert.match(r3.stdout, /state: DONE/,
    'a done spec with no sidecar must still print state DONE: ' + r3.stdout)

  // AC-20260820-07-12's own fixture already proves the OTHER direction of R8 (a sidecar that DOES
  // carry this run's own closeRunId keeps flowing to MERGE/DONE) — not duplicated here.
})

test('AC-20260820-07-16: the CLOSE step\'s close-commit instruction excludes the sidecar/ledger/retained-evidence paths in a linked worktree but includes them unchanged when running in-place', () => {
  // In-place branch: a plain tmpdir host has no linked worktree, so repoRoot === mainRoot.
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-close-inplace', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const inPlaceR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a clean in-place pass must reach CLOSE')
  assert.doesNotMatch(inPlaceR.stdout, /EXCEPT/,
    'an in-place review (repoRoot === mainRoot) must instruct that EVERYTHING rides the close commit — an EXCEPT clause here would wrongly exclude evidence that has nowhere else to be promoted from: ' + inPlaceR.stdout)
  assert.match(inPlaceR.stdout, /Commit everything still uncommitted on the working branch \(never --no-verify\)/,
    'the in-place close-commit line must instruct committing everything uncommitted, unconditionally: ' + inPlaceR.stdout)

  // Linked-worktree branch: the same two-branch fixture AC-20260820-07-12 drives to CLOSE.
  const root = fs.realpathSync(tmpdir('rvdrv-close-wt'))
  const g = gitRepo(root)
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

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-close-wt', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, 'specs/20260820/99-drv-close-wt.md')
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-6' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-6'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  const wtSidecarRel = 'specs/20260820/99-drv-close-wt.review'

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the worktree fixture must reach REVIEWER on green legs')
  const wtReturnFile = returnFileWith('rvdrv-close-wt-return', CLEAN_RETURN)
  run(wt, spec, '--mark', 'reviewer-returned', '--file', wtReturnFile)
  const wtR = run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean worktree pass must reach CLOSE')

  assert.match(wtR.stdout, new RegExp('EXCEPT ' + wtSidecarRel.replace(/\//g, '\\/') + '\\/'),
    'a linked-worktree review must name its OWN sidecar path as excluded from the close commit — evidence promotion (only once the merge lands) is what moves it into the main root, not this commit: ' + wtR.stdout)
  assert.match(wtR.stdout, /EXCEPT[^\n]*\.claude\/spec-runs\.jsonl/,
    'the exclusion must name .claude/spec-runs.jsonl — committing the ledger from the worktree now would leave the tree dirty after evidence promotion runs post-merge, per R3\'s "cleanup exits 2 after the merge already landed": ' + wtR.stdout)
  assert.match(wtR.stdout, /EXCEPT[^\n]*\.claude\/spec-runs\//,
    'the exclusion must also name .claude/spec-runs/ (the retained-evidence directory) for the same reason: ' + wtR.stdout)
  assert.doesNotMatch(wtR.stdout, /Commit everything still uncommitted on the working branch \(never --no-verify\) —/,
    'the worktree branch must NOT print the unconditional in-place close-commit line — the two branches must read as genuinely different instructions, not the same text with an aside: ' + wtR.stdout)

  // Clean up: this fixture's worktree is left dangling deliberately (the test never marks
  // closed/merges it) — merge-back.sh has its own idempotent cleanup path and stray worktrees
  // under tmpdir() do not affect other tests, matching this file's existing worktree fixtures.
})

// specs/20260821/02-replay-review-phase.md (2026-08-21, brief 14): the reviewer-replay harness
// shipped 2026-08-19 as an ADVISORY — review's CLEAN close printed `replay is DUE — run
// /spec:replay` and nothing ran it. This repo went due at 5 reviews and skipped the reminder
// through 12+ reviews in ~48 hours; advisory visibility is measured to be insufficient. The
// driver therefore gains a REPLAY state between MERGE's conclusion and DONE (D1): it runs
// `replay.js --due` and `--select` ITSELF (the session never hand-derives dueness) and refuses to
// conclude the review until a `stage:"replay"` ledger row exists for the SELECTED target's
// reviewRunId (D2) — while never re-deriving, re-opening, or gating the already-committed verdict
// (D3). D8 (build ruling) retires the driver's own copy of the measured-to-fail advisory: the
// CLOSE-time `--due` probe and its `replay is DUE — run /spec:replay` line are gone, REPLAY's
// entry `--due` being the single dueness derivation. AC-20260821-02-1 … -7 below.

// A recorded measurement replay (caught|missed|leg-caught) is what closes the dueness window;
// review rows appearing AFTER it are what `--due` counts.
const seedReplayRow = (outcome, reviewRunId) => ({
  ts: '2026-08-20T00:00:00Z', stage: 'replay', spec: 'specs/20260819/02-mutation-replay.md',
  runId: 'rp_seed000000', reviewRunId, class: 'silent-fallback', files: ['spec/scripts/x.js'],
  legs: outcome === 'leg-caught' ? 'red:gate' : 'green', outcome, tokens: 1000,
})
const seedReviewRow = (i) => ({
  ts: `2026-08-20T01:0${i}:00Z`, stage: 'review', spec: `specs/20260820/9${i}-seed.md`,
  verdict: 'CLEAN', runId: `rv_seed00000${i}`, tier: 'standard', survived: 0,
})
const fiveSeedReviews = [1, 2, 3, 4, 5].map(seedReviewRow)

// The REPLAY fixtures are makeHost()'s shape with two additions the replay harness needs: a
// seeded ledger (which decides dueness) and an optional base-less spec frontmatter (which makes
// `replay.js --select` fail at exit 4, the only reachable "due but nothing selectable" arm —
// see AC-20260821-02-3's own note).
function makeReplayHost(prefix, { seedRows = [], withBase = true, acId } = {}) {
  const root = fs.realpathSync(tmpdir(prefix))
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
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const specRel = `specs/20260820/${prefix.replace(/[^a-z0-9-]/g, '')}.md`
  const spec = path.join(root, specRel)
  let body = specBody({ diffBase, acId })
  if (!withBase) body = body.replace(/^diff_base:.*\n/m, '')
  fs.writeFileSync(spec, body)
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', acId))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  if (seedRows.length) {
    fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'),
      seedRows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }
  return { root, spec, specRel, sidecar: spec.replace(/\.md$/, '.review'), g }
}

// Drive a fixture through the green-legs / clean-reviewer / zero-disposition path to CLOSE,
// returning the CLOSE step's own output (the driver has already flipped status: done and
// appended its authoritative CLEAN review row by this point).
function driveToClose(host, scratchName) {
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: the replay fixture must reach REVIEWER on green legs before any REPLAY AC can be exercised')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith(scratchName, CLEAN_RETURN))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a zero-survivor disposition must reach CLOSE: ' + r.stdout + r.stderr)
  return r
}

// The session's close commit. `amend: true` folds the status flip into the implement commit
// instead, so the spec's newest commit has a parent that predates the spec entirely — which is
// what makes `replay.js --select` fail to resolve a target (AC-20260821-02-3).
function commitClose(host, { amend = false } = {}) {
  host.g('add', host.specRel)
  if (amend) host.g('commit', '-q', '--amend', '--no-edit')
  else host.g('commit', '-q', '-m', 'close')
}

const ledgerRows = (root) => {
  const p = path.join(root, '.claude/spec-runs.jsonl')
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
const closeRunIdOf = (root) => {
  const reviews = ledgerRows(root).filter((r) => r.stage === 'review' && String(r.runId || '').startsWith('rv_'))
  return reviews[reviews.length - 1].runId
}

test('AC-20260821-02-1: WHEN a CLEAN close reaches REPLAY and the harness reports the window is not yet due THE SYSTEM transitions straight to DONE, printing the harness\'s own not-due line (reviewsSince=3) rather than deriving dueness itself', () => {
  const host = makeReplayHost('rvdrvreplaynotdue', {
    acId: 'AC-20260820-99-7',
    seedRows: [seedReplayRow('caught', 'rv_prior000000'), seedReviewRow(1), seedReviewRow(2)],
  })
  driveToClose(host, 'rvdrv-replay-notdue-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a not-due CLEAN close must still be accepted — REPLAY may never turn a finished review into a failure: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /not due/,
    'the driver must print the replay harness\'s own not-due verdict; a driver that decides dueness itself becomes a second derivation of the measurement window and will drift from replay.js: ' + r.stdout)
  assert.match(r.stdout, /reviewsSince=3/,
    'the harness\'s own count must be surfaced verbatim (2 seeded review rows + this run\'s close row after the last caught replay) — a hand-composed count hides a window-semantics change instead of failing on it: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a not-due close must pass through REPLAY untouched and land DONE — parking a review that owes no measurement would make every close hostage to the harness: ' + r.stdout)
})

test('AC-20260821-02-2: WHEN due and --select yields an eligible CLEAN row THE SYSTEM prints an execution step naming spec/commands/replay.md plus the selection\'s spec path and reviewRunId, reports state REPLAY, and prints no retired manual /spec:replay reminder anywhere in the run (D8)', () => {
  const host = makeReplayHost('rvdrvreplaydue', { acId: 'AC-20260820-99-8', seedRows: fiveSeedReviews })
  const closeStep = driveToClose(host, 'rvdrv-replay-due-ret')
  assert.doesNotMatch(closeStep.stdout, /replay is DUE/,
    'D8: the CLOSE step must no longer carry the advisory reminder — a printed "run it yourself" line is the exact mechanism this spec exists to replace, and leaving it beside a state machine that now runs the replay itself tells the user to do the work twice: ' + closeStep.stdout)
  assert.doesNotMatch(closeStep.stdout, /run \/spec:replay/,
    'D8: no step may instruct the session to run /spec:replay by hand at close — REPLAY executes replay.md\'s phases in this session instead: ' + closeStep.stdout)
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a due CLEAN close must be accepted and enter REPLAY, never refused: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /spec\/commands\/replay\.md/,
    'the execution step must name spec/commands/replay.md as the executor — duplicating its phases into the driver or review.md is the collision class the host Gotchas already record twice: ' + r.stdout)
  assert.match(r.stdout, new RegExp(host.specRel.replace(/[.\/]/g, '\\$&')),
    'the step must inline --select\'s chosen spec path; a step that omits it forces the session to re-derive the target by hand, which is what the driver exists to prevent: ' + r.stdout)
  assert.ok(r.stdout.includes(runId),
    'the step must inline --select\'s reviewRunId — it is the join key the replay row must carry for the mark to be satisfiable at all: ' + JSON.stringify({ runId, stdout: r.stdout }))
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a due close with a selected target must PARK at REPLAY — reaching DONE with the measurement unrun is precisely the skip this spec removes: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /replay is DUE/,
    'D8: the retired advisory line must not survive into the REPLAY step either: ' + r.stdout)
})

test('AC-20260821-02-3: WHEN due but --select resolves no usable CLEAN target THE SYSTEM transitions to DONE printing the harness\'s own advisory — a due-but-unmeasurable close is never parked', () => {
  // The exit-1 arm ("no eligible CLEAN row in the window") is structurally unreachable from
  // REPLAY: the driver's own close appends a CLEAN review row with a runId moments earlier, so a
  // candidate always exists. The reachable arm is --select failing to RESOLVE that candidate
  // (exit 4) — here because the spec's newest commit has no parent revision carrying the spec.
  const host = makeReplayHost('rvdrvreplaynosel', { acId: 'AC-20260820-99-9', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-nosel-ret')
  commitClose(host, { amend: true })
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a close the harness cannot select a target for must still be accepted — an unmeasurable window may never fail a finished review: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /replay\.js:/,
    'the harness\'s own advisory must be printed verbatim so the reason the measurement was skipped is on the record, not silently swallowed: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a due close with nothing selectable must land DONE, never park — the review would otherwise be unfinishable through no fault of its own: ' + r.stdout)
})

test('AC-20260821-02-4: WHEN --mark replay-recorded is given and the ledger holds no stage:"replay" row for the sidecar target\'s reviewRunId THE SYSTEM refuses with exit 2, naming the missing row for that reviewRunId and the replay.js --record remedy', () => {
  const host = makeReplayHost('rvdrvreplaynorow', { acId: 'AC-20260820-99-10', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-norow-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  // A replay row for a DIFFERENT target — a concurrent session's measurement — must not satisfy
  // this review's mark: the join is on the selected target's reviewRunId, never a bare count.
  fs.appendFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), JSON.stringify({
    ts: '2026-08-21T00:00:00Z', stage: 'replay', spec: 'specs/other/01-other.md',
    runId: 'rp_other000000', reviewRunId: 'rv_someoneelse', class: 'off-by-one',
    files: ['x.js'], legs: 'green', outcome: 'caught', tokens: 1,
  }) + '\n')

  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 2,
    'marking replay-recorded with no replay row for THIS review\'s target must be refused — accepting it would let the state machine report a measurement that never happened, which is the procedural-hallucination failure the driver exists to block: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  assert.ok(out.includes(runId),
    'the refusal must name the target reviewRunId whose replay row is missing, or the session cannot tell which measurement it still owes: ' + JSON.stringify({ runId, out }))
  assert.match(out, /--record/,
    'the refusal must name the replay.js --record remedy — an error path without its remedy command is a hard finding under this repo\'s rules: ' + out)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a refused mark must leave the state unchanged; a foreign session\'s replay row must never advance this review: ' + out)
})

test('AC-20260821-02-5: WHEN a stage:"replay" row for the target reviewRunId exists with the non-measurement outcome setup-failed THE SYSTEM accepts replay-recorded and transitions to DONE — any recorded outcome concludes the review', () => {
  const host = makeReplayHost('rvdrvreplaysetupfail', { acId: 'AC-20260820-99-11', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-setupfail-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  // Recorded through the real harness, never a hand-written line — the mark's join must hold
  // against the row shape replay.js actually appends.
  const rec = runNode('scripts/replay.js', ['--record', '--spec', host.specRel, '--review-run-id', runId,
    '--legs', 'none', '--outcome', 'setup-failed'], { cwd: host.root })
  assert.strictEqual(rec.status, 0, 'setup: replay.js --record must accept a setup-failed row: ' + rec.stdout + rec.stderr)

  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 0,
    'a recorded setup-failed outcome must satisfy the mark — parking a finished review on a broken scratch worktree would make an infrastructure failure block delivery: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'once any outcome is on the record the review must conclude; the harness stays due (replay.js D5) and retries at the NEXT review, never this one: ' + r.stdout)
})

test('AC-20260821-02-6: WHEN the recorded outcome is missed THE SYSTEM CONTINUES TO leave the reviewed spec at status: done and appends no review-stage ledger row from the mark — replay measures the reviewer, never the verdict', () => {
  const host = makeReplayHost('rvdrvreplaymissed', { acId: 'AC-20260820-99-12', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-missed-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  const scratch = fs.realpathSync(tmpdir('rvdrv-replay-missed-art'))
  const patchFile = path.join(scratch, 'mutation.patch')
  fs.writeFileSync(patchFile, [
    'diff --git a/src/foo.js b/src/foo.js',
    'index 1111111..2222222 100644',
    '--- a/src/foo.js',
    '+++ b/src/foo.js',
    '@@ -1 +1 @@',
    '-module.exports = () => 42',
    '+module.exports = () => 41',
    '',
  ].join('\n'))
  const workflowFile = path.join(scratch, 'blind-return.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }))
  const rec = runNode('scripts/replay.js', ['--record', '--spec', host.specRel, '--review-run-id', runId,
    '--legs', 'green', '--outcome', 'missed', '--class', 'silent-fallback',
    '--patch', patchFile, '--workflow', workflowFile], { cwd: host.root })
  assert.strictEqual(rec.status, 0, 'setup: replay.js --record must accept a missed row: ' + rec.stdout + rec.stderr)

  const reviewsBefore = ledgerRows(host.root).filter((x) => x.stage === 'review').length
  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 0,
    'a missed outcome must conclude the review exactly like a caught one — gating the verdict on the reviewer\'s own score confuses what is being measured: ' + r.stdout + r.stderr)
  assert.match(fs.readFileSync(host.spec, 'utf8'), /^status:\s*done$/m,
    'a missed replay must leave the reviewed spec at status: done — the verdict is committed history and REPLAY may never re-open it: ' + r.stdout)
  assert.strictEqual(ledgerRows(host.root).filter((x) => x.stage === 'review').length, reviewsBefore,
    'the mark must append no review-stage ledger row — a second review row for one review would double-count the very denominator the replay window is measured against: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a recorded missed outcome must land DONE: ' + r.stdout)
})

test('AC-20260821-02-7: WHEN review ran on the originating branch (merge-back skipped with its one-line note) THE SYSTEM still enters REPLAY before DONE — the skip path is not a back door around the measurement', () => {
  const host = makeReplayHost('rvdrvreplayskip', { acId: 'AC-20260820-99-13', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-skip-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0, 'setup: the merge-skipped close must be accepted: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /originating branch/,
    'setup precondition: this fixture has no build branch, so the driver must take the merge-skipped arm: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'the merge-skipped arm must reach REPLAY too — a review that happened not to run in a worktree owes the same measurement as one that did, and an arm that bypasses REPLAY makes the whole state a matter of where the session happened to be standing: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /^## DONE$/m,
    'the merge-skipped arm must NOT print DONE while a due replay is outstanding: ' + r.stdout)
})

test('AC-20260821-02-2 (worktree merge carrier): WHEN a due CLEAN close merges back from a linked worktree THE SYSTEM survives cleanup — the sidecar is retained in the MAIN root, state is REPLAY, and the printed step names the main-root spec path (D8 (b))', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-replay-wt'))
  const g = gitRepo(root)
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

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-replay-wt', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  const specRel = 'specs/20260820/99-drv-replay-wt.md'
  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-14' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-14'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  // The ledger lives under the review's own root (the worktree) until the merge promotes it.
  fs.mkdirSync(path.join(wt, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(wt, '.claude/spec-runs.jsonl'),
    fiveSeedReviews.map((r) => JSON.stringify(r)).join('\n') + '\n')

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the two-branch fixture must reach REVIEWER on green legs')
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-replay-wt-return', CLEAN_RETURN))
  run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean worktree pass must reach CLOSE')
  gw('add', specRel); gw('commit', '-q', '-m', 'close')
  const closed = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'setup: closed must succeed: ' + closed.stdout + closed.stderr)

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'the merge mark must be accepted and run merge + cleanup + verify before REPLAY: ' + merged.stdout + merged.stderr)
  assert.ok(!fs.existsSync(wt),
    'cleanup must still remove the build worktree — retaining the sidecar for REPLAY may never come at the cost of leaving the worktree behind: ' + merged.stdout)
  const mainSpec = path.join(root, specRel)
  const mainSidecar = path.join(root, 'specs/20260820/99-drv-replay-wt.review/review-state.json')
  assert.ok(fs.existsSync(mainSidecar),
    'the sidecar must survive cleanup in the MAIN root — REPLAY runs after the worktree is gone, and a sidecar that died with it would leave the review unfinishable and its own state unreadable: ' + merged.stdout)
  assert.match(merged.stdout, new RegExp(specRel.replace(/[.\/]/g, '\\$&')),
    'the printed step must name the main-root spec path; naming the deleted worktree path would hand the session a command that cannot run: ' + merged.stdout)
  assert.match(merged.stdout, /spec\/commands\/replay\.md/,
    'the merged path must print the same REPLAY execution step as the in-place path: ' + merged.stdout)
  assert.strictEqual(stateOf(root, mainSpec), 'REPLAY',
    'a due close that merged back must park at REPLAY, re-derivable from the main root alone — a fresh session resuming after the merge has nothing else to read: ' + merged.stdout)
})
