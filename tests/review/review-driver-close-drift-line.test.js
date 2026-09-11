'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const {
  makeHost, run, toReviewer, returnFileWith, CLEAN_RETURN, driveToClose, ledgerRows, specBody, GREEN_TEST,
} = require('./review-driver.fixtures')

// Pins: specs/20260907/01-mixed-pin-guard-and-drift-line.md D6,
// AC-20260907-01-8, AC-20260907-01-9, AC-20260907-01-12. spec-review-driver.js's CLOSE step does
// not run ac-drift.js at all today — AC-8 is TDD red against the fixture host (mirrors
// tests/review/review-driver-close-row.test.js's makeHost/toReviewer/CLEAN_RETURN idiom). AC-9 is
// `[pre-green: absence-invariant]`: nothing prints an "AC-pin drift" line today, so its absence
// already holds. AC-12 is `SHALL CONTINUE TO` (ledger-row-shape continuity).
//
// Review repair round 2 (disposed `fix`, HARD): acPinDriftLine() called `JSON.parse(r.stdout)`
// unconditionally on a 0/1 exit, but ac-drift.js prints the PLAIN sentinel `inapplicable — no
// specs/` (not JSON) and exits 0 when its own --root has no specs/ directory at all — the crash
// path makeHost()'s fixtures never exercise, since makeHost() always seeds specs/20260820/. The
// second AC-20260907-01-9 test below builds a host with NO specs/ directory anywhere under its
// git top-level (the spec under review lives at the repo root instead) so the driver's own
// `ac-drift.js --root <repoRoot> --json` genuinely hits the sentinel, not just the "zero findings"
// arm the first AC-9 test already covers.

function makeHostNoSpecs() {
  const root = fs.realpathSync(tmpdir('rvdrv-nospecs'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
    // lib/glob-match.js's BASELINE_GLOBS excludes specs/** from scope-reconcile's out-of-plan
    // check by default — with the spec under review living at the repo root instead (no specs/
    // dir anywhere), its own path and sidecar need the same exclusion via the additive
    // pipelineOwnedPaths glob, or reconcile flags the spec editing itself as out-of-plan and the
    // review never reaches REVIEWER clean, which is no part of what this test is exercising.
    pipelineOwnedPaths: ['driver-test.md', 'driver-test.review/**'],
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  // Deliberately no specs/ directory anywhere under root — spec-review-driver.js has no
  // requirement that its own --spec path live under specs/ (grepped: no such check in the
  // driver), so the spec under review sits at the repo root instead.
  const spec = path.join(root, 'driver-test.md')
  fs.writeFileSync(spec, specBody({ diffBase }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec }
}

function writeDoneUncitedSpec(root) {
  fs.mkdirSync(path.join(root, 'specs/20260912'), { recursive: true })
  fs.writeFileSync(path.join(root, 'specs/20260912/01-x.md'),
    '---\nstatus: done\n---\n# X\n\n## Acceptance Criteria\n\n' +
    '- **AC-20260912-01-1**: WHEN a THE SYSTEM SHALL CONTINUE TO b\n')
}

test('AC-20260907-01-8: WHEN the review driver prints the CLOSE step in a fixture host that also holds a done spec with one uncited AC THE SYSTEM includes the advisory AC-pin drift line naming the count', () => {
  const host = makeHost()
  toReviewer(host)
  writeDoneUncitedSpec(host.root)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-drift-8', CLEAN_RETURN))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')

  const expectedLine = '⚠️ AC-pin drift (advisory): 1 criteria across 1 done spec(s) have no citing test — ' +
    'node "$(spec-paths ac-drift)" --root . names each'
  assert.ok(r.stdout.includes(expectedLine),
    `CLOSE must run ac-drift.js --root <repoRoot> --json and print the advisory line D6 pins verbatim ` +
    `when it reports findings — today the CLOSE step never invokes ac-drift.js at all, so this line ` +
    `never prints (stdout: ${r.stdout})`)

  const hygieneIdx = r.stdout.indexOf('Hygiene listing')
  const driftIdx = r.stdout.indexOf(expectedLine)
  const commitIdx = r.stdout.indexOf('4. Commit everything')
  assert.ok(hygieneIdx !== -1 && driftIdx !== -1 && commitIdx !== -1,
    `all three markers (hygiene listing, drift line, close-commit instruction) must be present to ` +
    `check their order: ${JSON.stringify({ hygieneIdx, driftIdx, commitIdx })}`)
  assert.ok(hygieneIdx < driftIdx && driftIdx < commitIdx,
    `D6/Contracts: the drift line prints "after the hygiene listing and before the close-commit line" ` +
    `— got hygiene@${hygieneIdx} drift@${driftIdx} commit@${commitIdx} in: ${r.stdout}`)
})

test('AC-20260907-01-9 [pre-green: absence-invariant]: WHEN the CLOSE step prints in a fixture host with no specs/ drift THE SYSTEM prints no line containing "AC-pin drift"', () => {
  const host = makeHost()
  const r = driveToClose(host, 'rvdrv-drift-9')
  assert.ok(!r.stdout.includes('AC-pin drift'),
    `a fixture with no cross-spec drift (the host's own spec's own AC is covered by its own green ` +
    `test) must never print a drift line — D6: "when 0 or inapplicable print nothing" (stdout: ${r.stdout})`)
})

test('AC-20260907-01-9 [pre-green: absence-invariant]: WHEN the CLOSE step prints in a host whose git top level holds no specs/ directory at all THE SYSTEM exits 0 and prints no line containing "AC-pin drift"', () => {
  const host = makeHostNoSpecs()
  const r = driveToClose(host, 'rvdrv-drift-9-nospecs')
  assert.strictEqual(r.status, 0,
    `ac-drift.js prints its plain "inapplicable — no specs/" sentinel (not JSON) and exits 0 when ` +
    `--root has no specs/ directory at all — acPinDriftLine() must guard the JSON.parse on that ` +
    `stdout rather than throw and wedge CLOSE at a nonzero exit: got status ${r.status} ` +
    `(stdout: ${r.stdout} stderr: ${r.stderr})`)
  assert.ok(!r.stdout.includes('AC-pin drift'),
    `a host with no specs/ directory anywhere must print no drift line at all — D6: "when 0 or ` +
    `inapplicable print nothing" (stdout: ${r.stdout})`)
})

test('AC-20260907-01-12 (SHALL CONTINUE TO): the review ledger row written at CLOSE carries the same key set and verdict whether or not the advisory drift line printed, no acDrift key is ever added, and --mark closed still succeeds once the drift line has printed', () => {
  const plain = makeHost()
  const plainClose = driveToClose(plain, 'rvdrv-drift-12-plain')
  assert.ok(!plainClose.stdout.includes('AC-pin drift'),
    `control precondition: the plain fixture must print no drift line, or this comparison proves nothing`)
  const plainRow = ledgerRows(plain.root).filter((r) => r.stage === 'review').slice(-1)[0]
  assert.ok(plainRow, 'setup precondition: a CLOSE pass must append one "review" stage ledger row')

  const drifted = makeHost()
  toReviewer(drifted)
  writeDoneUncitedSpec(drifted.root)
  run(drifted.root, drifted.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-drift-12-drifted', CLEAN_RETURN))
  const driftedClose = run(drifted.root, drifted.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.ok(driftedClose.stdout.includes('AC-pin drift'),
    `setup precondition: this fixture must actually print the advisory line, or this test exercises ` +
    `nothing (stdout: ${driftedClose.stdout})`)
  const driftedRow = ledgerRows(drifted.root).filter((r) => r.stage === 'review').slice(-1)[0]
  assert.ok(driftedRow, 'setup precondition: a CLOSE pass must append one "review" stage ledger row')

  assert.deepStrictEqual(Object.keys(driftedRow).sort(), Object.keys(plainRow).sort(),
    `the review ledger row's key set must be identical whether or not the advisory drift line printed ` +
    `— the print is CLOSE-step output only, never a ledger field: drifted=${JSON.stringify(Object.keys(driftedRow).sort())} ` +
    `plain=${JSON.stringify(Object.keys(plainRow).sort())}`)
  assert.ok(!('acDrift' in driftedRow),
    `the ledger row must never gain an "acDrift" key — D6 is advisory print-only, never a ledger write: ${JSON.stringify(driftedRow)}`)
  assert.strictEqual(driftedRow.verdict, plainRow.verdict,
    `the advisory drift line must never change the derived verdict — both fixtures are zero-survivor ` +
    `CLEAN runs: drifted=${driftedRow.verdict} plain=${plainRow.verdict}`)

  execFileSync('git', ['-C', drifted.root, 'add', '-A'])
  execFileSync('git', ['-C', drifted.root, 'commit', '-q', '-m', 'close'])
  const closeR = run(drifted.root, drifted.spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0,
    `--mark closed must still be accepted once the CLOSE step has printed the advisory drift line — ` +
    `the line is purely advisory and must never gate the close: ${closeR.stdout} ${closeR.stderr}`)
})
