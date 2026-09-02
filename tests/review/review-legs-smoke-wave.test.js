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
  const marker = path.join(scratch, 'at-risk-done')
  const bootObserved = path.join(scratch, 'boot-observed.txt')
  const readyFile = path.join(scratch, 'ready')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  // Stand-in for a host testCommand whose at-risk run rebuilds the app: it takes real time
  // (the sleep), then drops a marker. If smoke boots during the sleep, the collision window
  // the incident above hit is open and bin/boot.js records it.
  fs.writeFileSync(path.join(dir, 'bin/slow-tests.js'),
    'const fs = require("fs")\n' +
    'setTimeout(() => {\n' +
    `  fs.writeFileSync(${JSON.stringify(marker)}, "done")\n` +
    '  process.stdout.write("slow-tests ran: " + process.argv.slice(2).join(" ") + "\\n")\n' +
    '  process.exit(0)\n' +
    '}, 500)\n')
  fs.writeFileSync(path.join(dir, 'bin/boot.js'),
    'const fs = require("fs")\n' +
    `fs.writeFileSync(${JSON.stringify(bootObserved)}, fs.existsSync(${JSON.stringify(marker)}) ? "at-risk-complete" : "at-risk-still-running")\n` +
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
  return { dir, base, bootObserved }
}

test('smoke boots only after the at-risk dispatch completes, and its output lands in <out-dir>/smoke.txt', () => {
  const { dir, base, bootObserved } = makeHost()
  const manifest = path.join(tmpdir('review-legs-smoke-wave-out'), 'manifest.jsonl')
  const outDir = tmpdir('review-legs-smoke-wave-outdir')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260821/99-test.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const byLeg = new Map(rows.map(x => [x.leg, x]))

  assert.ok(fs.existsSync(bootObserved),
    `bootCommand never ran — smoke.sh did not boot the fixture app\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  assert.strictEqual(fs.readFileSync(bootObserved, 'utf8'), 'at-risk-complete',
    'UpWell 2026-08-21 collision: smoke booted while the at-risk test dispatch was still running — ' +
    'smoke must have its own wave AFTER at-risk/patterns complete, not share wave 2 with them')

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
