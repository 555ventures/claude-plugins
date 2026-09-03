'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// Incident (field report, 3/3 runs): review-legs.js wave 2 ran smoke.sh
// concurrently with the at-risk test dispatch. A host's at-risk set can include a test that
// performs a real production build of the app, which clobbers the artifact smoke is booting —
// observed as smoke exit 2 (ENOTEMPTY inside app/node_modules/.nitro/vite during the concurrent
// vite build) and exit 1 (readyCheck never passed), while smoke.sh alone passed every time.
// This is the same collision class the wave-1 comment already documented for the gate
// (two boots rm -f'ing each other's ready file) — anything that runs host tests can
// boot or build the app, so smoke must serialize behind ALL of it, not just the gate.
//
// Second defect from the same report: review-legs.js discarded smoke's stdout/stderr entirely
// (only the exit code survived into the manifest row), so a red smoke row carried no diagnosis
// at all — identifying the collision cost two extra full re-runs.
//
// The fix pins both behaviors here:
//   (a) smoke boots only AFTER the at-risk dispatch has completed — the at-risk testCommand
//       below sleeps, then drops a marker file; the bootCommand records whether the marker
//       existed at boot start. Under the old concurrent wave the boot starts during the sleep
//       and observes the marker absent, so this test is red on the pre-fix code by construction.
//   (b) smoke's full output is written to <out-dir>/smoke.txt — the __SMOKE_*__ sentinel line
//       must be retrievable after the run, not just an exit code.
//
// specs/20260903/02-whole-suite-review-leg.md D1/D6 (AC-20260903-02-6): the standalone `suite`
// leg (its own wave 1b, before at-risk/patterns and smoke) means this host's single stand-in
// `testCommand` now serves TWO different invocation shapes — bare (the suite leg) and with file
// args (the at-risk leg) — and both must complete before smoke boots. The stand-in below writes
// a distinct marker per shape (`suite-done` on a bare invocation, `at-risk-done` on one carrying
// argv) so `bootCommand`'s observation can name which markers existed at boot start, and the
// at-risk invocation's own stand-in records whether `suite-done` already existed when IT started
// — proving suite's own wave (1b) really precedes at-risk's (wave 2), not just smoke's.

const SCRIPT = 'scripts/review-legs.js'

// tests/atrisk.test.js is deliberately outside the File Plan while referencing the `foo` stem —
// that is what puts it in scope-reconcile's atRisk set (same construction as
// review-legs-at-risk-argv.test.js).
const SPEC_BODY = `---
status: implementing
tier: standard
---
# Smoke-wave ordering fixture

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260821-99-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260821-99-1**: foo() returns 42.
`

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260821-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

const AT_RISK_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('sibling coverage of foo', () => { assert.strictEqual(typeof foo, 'function') })
`

function makeHost() {
  const dir = tmpdir('review-legs-smoke-wave')
  const scratch = tmpdir('review-legs-smoke-wave-scratch')
  const suiteMarker = path.join(scratch, 'suite-done')
  const atRiskMarker = path.join(scratch, 'at-risk-done')
  const atRiskObserved = path.join(scratch, 'at-risk-observed.txt')
  const bootObserved = path.join(scratch, 'boot-observed.txt')
  const readyFile = path.join(scratch, 'ready')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  // Stand-in for the one host testCommand that serves BOTH invocation shapes: bare (the suite
  // leg, wave 1b) writes suite-done; with file args (the at-risk leg, wave 2) records whether
  // suite-done already existed at ITS OWN start, then writes at-risk-done. Both take real time
  // (the sleep) before dropping their marker. If smoke boots before either completes, the
  // collision window the incident above hit is open and bin/boot.js records it.
  fs.writeFileSync(path.join(dir, 'bin/slow-tests.js'),
    'const fs = require("fs")\n' +
    'const args = process.argv.slice(2)\n' +
    'const isAtRisk = args.length > 0\n' +
    `const suiteMarker = ${JSON.stringify(suiteMarker)}\n` +
    `const atRiskMarker = ${JSON.stringify(atRiskMarker)}\n` +
    'if (isAtRisk) {\n' +
    `  fs.writeFileSync(${JSON.stringify(atRiskObserved)}, fs.existsSync(suiteMarker) ? "suite-done" : "suite-not-done")\n` +
    '}\n' +
    'setTimeout(() => {\n' +
    '  fs.writeFileSync(isAtRisk ? atRiskMarker : suiteMarker, "done")\n' +
    '  process.stdout.write("slow-tests ran: " + args.join(" ") + "\\n")\n' +
    '  process.exit(0)\n' +
    '}, 500)\n')
  fs.writeFileSync(path.join(dir, 'bin/boot.js'),
    'const fs = require("fs")\n' +
    `const suiteMarker = ${JSON.stringify(suiteMarker)}\n` +
    `const atRiskMarker = ${JSON.stringify(atRiskMarker)}\n` +
    'const parts = []\n' +
    'if (fs.existsSync(suiteMarker)) parts.push("suite-complete")\n' +
    'if (fs.existsSync(atRiskMarker)) parts.push("at-risk-complete")\n' +
    `fs.writeFileSync(${JSON.stringify(bootObserved)}, parts.join(","))\n` +
    `fs.writeFileSync(${JSON.stringify(readyFile)}, "ready")\n` +
    'process.on("SIGTERM", () => process.exit(0))\n' +
    'setInterval(() => {}, 1000)\n')
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: `node ${JSON.stringify(path.join(dir, 'bin/slow-tests.js'))}`,
    runtime: {
      bootCommand: `node ${JSON.stringify(path.join(dir, 'bin/boot.js'))}`,
      readyCheck: `test -f ${JSON.stringify(readyFile)}`,
      readyTimeout: 15,
      stopSignal: 'SIGTERM',
      stopTimeout: 5,
      stopExitCodes: [0],
    },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  // Must predate the diff and stay untouched by it — "at risk" means a test nobody in this spec
  // touched, which reads a file this spec changed.
  fs.writeFileSync(path.join(dir, 'tests/atrisk.test.js'), AT_RISK_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260821'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260821/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base, bootObserved, atRiskObserved }
}

test('smoke boots only after the suite and at-risk dispatches both complete, and its output lands in <out-dir>/smoke.txt', () => {
  const { dir, base, bootObserved } = makeHost()
  const manifest = path.join(tmpdir('review-legs-smoke-wave-out'), 'manifest.jsonl')
  const outDir = tmpdir('review-legs-smoke-wave-outdir')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260821/99-test.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const byLeg = new Map(rows.map(x => [x.leg, x]))

  assert.ok(fs.existsSync(bootObserved),
    `bootCommand never ran — smoke.sh did not boot the fixture app\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  assert.strictEqual(fs.readFileSync(bootObserved, 'utf8'), 'suite-complete,at-risk-complete',
    'AC-20260903-02-6: bootCommand must observe BOTH markers present at boot start — smoke must have its own ' +
    'wave AFTER wave 1b (suite) AND wave 2 (at-risk/patterns) complete, not boot while either is still running ' +
    '(UpWell 2026-08-21 collision, extended by the new suite leg\'s own wave)')

  assert.deepStrictEqual(byLeg.get('smoke').observed, { result: 'pass' },
    `smoke leg must pass against the healthy fixture runtime\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  assert.ok(byLeg.get('at-risk') && byLeg.get('at-risk').observed.files === 1,
    'fixture must actually exercise the at-risk dispatch (one at-risk file) or the ordering assertion is vacuous')

  const smokeTxt = path.join(outDir, 'smoke.txt')
  assert.ok(fs.existsSync(smokeTxt),
    'smoke output must be retained in the out-dir — a red smoke row with no boot log is undiagnosable')
  assert.match(fs.readFileSync(smokeTxt, 'utf8'), /__SMOKE_PASS__/,
    'smoke.txt must carry smoke.sh\'s own sentinel output, not a paraphrase')
  assert.match(r.stdout, /smoke\.txt/, 'the outputs line must advertise smoke.txt')
})

test('AC-20260903-02-6: the at-risk invocation observes suite-done already present when IT starts — the standalone suite leg (wave 1b) genuinely precedes at-risk (wave 2), not just smoke\'s later wave', () => {
  const { dir, base, atRiskObserved } = makeHost()
  const manifest = path.join(tmpdir('review-legs-smoke-wave-out'), 'manifest.jsonl')
  const outDir = tmpdir('review-legs-smoke-wave-outdir')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260821/99-test.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  assert.ok(fs.existsSync(atRiskObserved),
    `the at-risk invocation of the stand-in testCommand never recorded its own observation — the at-risk leg ` +
    `never ran\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  assert.strictEqual(fs.readFileSync(atRiskObserved, 'utf8'), 'suite-done',
    'AC-20260903-02-6: at the moment the at-risk (file-args) invocation of the stand-in testCommand started, ' +
    'suite-done must already exist — proving the suite leg\'s own wave (1b) completed before at-risk\'s wave ' +
    '(2) began, not merely before smoke\'s (2b): ' + r.stdout + r.stderr)
})
