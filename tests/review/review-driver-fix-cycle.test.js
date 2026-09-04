'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, gitRepo } = require('../helpers')
const { GREEN_TEST, specBody, makeHost, run, stateOf, returnFileWith, oneFixReturnFile, CLEAN_RETURN, SURVIVOR_RETURN } = require('./review-driver.fixtures')

// Shard D of the review-driver family (review-driver-fix-cycle.test.js, split from
// review-driver.test.js by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns the
// fix-cycle ACs: specs/20260903/02-whole-suite-review-leg.md AC-20260903-02-9;
// specs/20260820/07-review-driver.md AC-20260820-07-8; specs/20260822/01-escalate-ledger-row.md
// AC-20260822-01-10; specs/20260901/09-disposer-gate.md AC-20260901-09-2;
// specs/20260902/05-manifest-stamped-scope.md AC-20260902-05-6/-8. Shared helpers live in
// review-driver.fixtures.js (D2).

// specs/20260903/02-whole-suite-review-leg.md D1/D3 (AC-20260903-02-9): a synthetic host whose
// planned test is green but whose tests/consistency/scanner.test.js (outside the File Plan,
// naming no changed file — the same A2/D5 shape) fails because of the diff's own content. Only
// the bare testCommand (the suite leg) ever executes the scanner, so gate stays green and the
// hard-stop must come from the new blocking leg alone.
function makeSuiteBlindSpotDriverHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-suite-blind'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests/inplan'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests/consistency'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  fs.writeFileSync(path.join(root, 'tests/consistency/scanner.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "const fs = require('node:fs')\nconst path = require('node:path')\n" +
    'function walk(d, out) {\n' +
    "  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {\n" +
    "    if (entry.name === '.git' || entry.name === 'node_modules') continue\n" +
    '    const p = path.join(d, entry.name)\n' +
    '    if (entry.isDirectory()) walk(p, out)\n' +
    '    else out.push(p)\n' +
    '  }\n' +
    '  return out\n' +
    '}\n' +
    "test('no tracked file names the forbidden literal', () => {\n" +
    "  const root = path.join(__dirname, '..', '..')\n" +
    "  const hit = walk(root, []).some((p) => fs.readFileSync(p, 'utf8').includes('DRIVER_SUITE_BLIND_SPOT_LITERAL'))\n" +
    '  assert.strictEqual(hit, false)\n' +
    '})\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260903'), { recursive: true })
  const spec = path.join(root, 'specs/20260903/99-drv-suite-blind.md')
  fs.writeFileSync(spec, specBody({ diffBase, acId: 'AC-20260903-98-1' })
    .replace('tests/foo.test.js | create | tests', 'tests/inplan/foo.test.js | create | tests'))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42 // DRIVER_SUITE_BLIND_SPOT_LITERAL\n')
  fs.writeFileSync(path.join(root, 'tests/inplan/foo.test.js'),
    GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260903-98-1').replace("require('../src/foo.js')", "require('../../src/foo.js')"))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

test('AC-20260903-02-9: WHEN the driver runs against a synthetic host whose planned test is green and whose tests/consistency/scanner.test.js (outside the File Plan, naming no changed file) is red THE SYSTEM SHALL land --state STOPPED, append exactly one ledger row with verdict:"GATE_RED", and print the STOPPED step with a line matching ❌ suite exit=1', () => {
  const { root, spec } = makeSuiteBlindSpotDriverHost()
  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : ''
  const r = run(root, spec)
  assert.strictEqual(stateOf(root, spec), 'STOPPED',
    'a red blocking suite leg must land the driver in the terminal state STOPPED, exactly like a red gate: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /❌ suite exit=1/,
    'AC-20260903-02-9 (literal): the STOPPED step must print a line matching "❌ suite exit=1" — a generic red-leg summary here would not tell the session which leg to fix: ' + r.stdout)
  const beforeLines = before.trim() ? before.trim().split('\n') : []
  assert.ok(fs.existsSync(ledger), 'a GATE_RED run must append a ledger line: ' + r.stdout + r.stderr)
  const afterLines = fs.readFileSync(ledger, 'utf8').trim().split('\n')
  assert.strictEqual(afterLines.length, beforeLines.length + 1,
    'exactly one ledger line must be appended for the STOPPED run: before=' + beforeLines.length + ' after=' + afterLines.length)
  const appended = JSON.parse(afterLines[afterLines.length - 1])
  assert.strictEqual(appended.verdict, 'GATE_RED', 'the appended ledger row must carry verdict GATE_RED: ' + JSON.stringify(appended))
})

// specs/20260822/01-escalate-ledger-row.md D12: the cap refusal below is retagged
// (never weakened) as a SHALL-CONTINUE-TO pin for AC-20260822-01-10 — that spec inserts a
// writeEscalateRow() call ahead of this same die(), but the refusal itself (exit 2, iteration cap
// 2, state ESCALATE) must survive byte-for-byte in spirit. The new escalate-row mechanics are
// pinned separately in tests/review/escalate-row.test.js.
test('AC-20260820-07-8 (also AC-20260822-01-10, SHALL CONTINUE TO) / AC-20260901-09-2: a dispatched fix cycles FIX -> fix-applied (fresh manifest, legs --fix-delta) -> REVIEWER twice, and a third fix-applied is refused with state ESCALATE naming the iteration cap of 2', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER')

  for (let cycle = 1; cycle <= 2; cycle++) {
    const returnFile = returnFileWith('rvdrv-fix-' + cycle, SURVIVOR_RETURN)
    run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
    assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', `cycle ${cycle}: a returned survivor must land DISPOSITIONS`)

    // AC-20260901-09-2: SURVIVOR_RETURN's single survivor is the whole pool (s0) — cover it with
    // a minimal "fix" disposer return before --mark dispositions --fix-dispatched 1 is accepted.
    const dispFile = oneFixReturnFile('rvdrv-fix-disp-' + cycle, 's0')
    const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
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
  const dispFile3 = oneFixReturnFile('rvdrv-fix-disp-3', 's0')
  const dispR3 = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile3, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
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

test('AC-20260820-07-8 (manifest-provable cap) / AC-20260901-09-2: hand-editing the sidecar\'s stored iteration count cannot reach ESCALATE — only manifest-<n>.jsonl files actually present on disk advance the cap', () => {
  const host = makeHost()
  run(host.root, host.spec)
  const returnFile = returnFileWith('rvdrv-hand-edit', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const dispFile1 = oneFixReturnFile('rvdrv-hand-edit-disp', 's0')
  run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile1, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
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
  const dispFile2 = oneFixReturnFile('rvdrv-hand-edit-disp2', 's0')
  run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile2, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  const fixR2 = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR2.status, 0,
    'the hand-edited counter must not have consumed the real cap — the second genuine fix-applied (only manifest-1/2 on disk beforehand) must still succeed: ' + fixR2.stdout + fixR2.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-3.jsonl')), 'the second genuine fix cycle must produce manifest-3.jsonl')
})

// specs/20260902/05-manifest-stamped-scope.md D10/AC-20260902-05-6 (A8): a green host, one soft
// survivor dispositioned "fix", a broken tests/foo.test.js before --mark fix-applied — the
// fix-delta legs run hard-stops on the now-red gate. D2 makes the manifest's own scope:"fix-delta"
// stamps (D1) the source of the hard-stop pass's required-leg set, so the red gate is reached and
// GATE_RED derives (today's code judges the same manifest against the FULL set and derives
// UNVERIFIED instead — A2 spike S1).
test('AC-20260902-05-6: WHEN the driver\'s --mark fix-applied legs run hard-stops on a red gate THE SYSTEM SHALL append a ledger row with verdict:"GATE_RED", scope:"fix-delta" and iteration:2, and --state SHALL report STOPPED', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: a fresh green-legs fixture must reach REVIEWER')

  const returnFile = returnFileWith('rvdrv-05-6-return', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup: the one soft survivor must land DISPOSITIONS')

  const dispFile = oneFixReturnFile('rvdrv-05-6-disp', 's0')
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(dispR.status, 0, 'setup: dispatching a fix for the single survivor must be accepted: ' + dispR.stdout + dispR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX', 'setup: fix-dispatched must land FIX')

  // A8: break the gate before the fix-delta legs re-run — the "fix" never actually fixed it.
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "const foo = require('../src/foo.js')\n" +
    "test('AC-20260820-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 43) })\n")

  const ledgerPath = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean) : []
  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(stateOf(host.root, host.spec), 'STOPPED',
    'D10: a fix-delta legs run that hard-stops on a red gate must report state STOPPED: ' + fixR.stdout + fixR.stderr)
  const after = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1,
    'exactly one ledger line must be appended for the hard-stop pass: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  assert.strictEqual(row.verdict, 'GATE_RED',
    'D2: the manifest\'s own scope:"fix-delta" stamps must make requiredLegs the six-leg fix-delta set (never ' +
    'the full eight, which is missing reconcile/at-risk by design on a fix pass) so the red gate is reached and ' +
    `GATE_RED derives, never UNVERIFIED: ${JSON.stringify(row)}`)
  assert.strictEqual(row.scope, 'fix-delta',
    `D4: the hard-stop ledger row must carry the manifest-derived scope "fix-delta": ${JSON.stringify(row)}`)
  assert.strictEqual(row.iteration, 2,
    `this is the second manifest iteration (manifest-2.jsonl, the fix-delta re-run) — the row must record it: ${JSON.stringify(row)}`)
})

// specs/20260902/05-manifest-stamped-scope.md D5/AC-20260902-05-8: a hand-edited manifest (the
// only realistic way this class occurs — a leg crashed after review-legs.js wrote some rows,
// leaving the on-disk manifest with disagreeing scope carriers) must refuse --mark dispositions
// before any write, naming the D3 line and the cold-restart remedy.
test('AC-20260902-05-8: WHEN --mark dispositions is invoked after a gate override row carrying a disagreeing scope has been appended to the manifest THE SYSTEM SHALL exit 2, leave review-state.json byte-identical, write no disposer-return file, and print stderr naming the D3 line, the sidecar directory, and the bare re-run command', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: a fresh green-legs fixture must reach REVIEWER')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-05-8-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup: a clean zero-survivor return must land DISPOSITIONS')

  // Hand-edit the manifest to append a "gate" row stamped scope:"fix-delta" — once D1 stamps
  // every other row "full", this single override disagrees with the rest of the manifest.
  const manifestPath = path.join(host.sidecar, 'manifest-1.jsonl')
  fs.appendFileSync(manifestPath,
    JSON.stringify({ leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1 }, scope: 'fix-delta' }) + '\n')

  const stateFile = path.join(host.sidecar, 'review-state.json')
  const stateBefore = fs.readFileSync(stateFile, 'utf8')
  const disposerFilesBefore = fs.readdirSync(host.sidecar).filter(f => /^disposer-return-/.test(f))

  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 2,
    'D5: --mark dispositions must refuse a pass that derives UNVERIFIED — dispositions can never cure missing ' +
    `or contradictory evidence: ${r.stdout} / ${r.stderr}`)
  const stateAfter = fs.readFileSync(stateFile, 'utf8')
  assert.strictEqual(stateAfter, stateBefore,
    'D5: the refusal must happen BEFORE any sidecar write — review-state.json must be byte-identical to before the refused mark')
  const disposerFilesAfter = fs.readdirSync(host.sidecar).filter(f => /^disposer-return-/.test(f))
  assert.deepStrictEqual(disposerFilesAfter, disposerFilesBefore,
    'D5: the refusal must write no disposer-return-*.json file: ' + JSON.stringify(disposerFilesAfter))
  assert.match(r.stderr, /verdict\.js: UNVERIFIED — manifest invalid: scope values disagree/,
    'D5: stderr must carry verdict.js\'s own D3 line verbatim, naming the manifest-invalid cause: ' + r.stderr)
  assert.match(r.stderr, new RegExp(host.sidecar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'D5: stderr must name the sidecar directory the session should delete before re-running from cold: ' + r.stderr)
  assert.match(r.stderr, /node .*\.js.*99-drv-test\.md/,
    'D5: stderr must name the literal bare re-run command "node <driver> <spec>" as the remedy: ' + r.stderr)
})
