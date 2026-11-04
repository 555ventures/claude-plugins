'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')
const { reviewLegsSpecBody } = require('./review-legs.fixtures')

// specs/20261103/12-one-suite-run-per-tree.md D6: AC-20261103-12-16, AC-20261103-12-17.

const SCRIPT = 'scripts/review-legs.js'
const SPEC_REL = 'specs/20260820/99-test.md'
const AT_RISK = "'use strict'\nconst foo = require('../src/foo.js')\nmodule.exports = typeof foo\n"
const GREEN = "'use strict'\nconst { test } = require('node:test')\nconst foo = require('../src/foo.js')\n" +
  "test('AC-20260820-99-1: foo() returns 42', () => { require('node:assert').strictEqual(foo(), 42) })\n"

// Two at-risk files predate the diff and reference the changed stem. The counter lives outside
// the repo; test.sh stands in for testCommand (bare suite and at-risk both invoke it) and exits
// STUB_EXIT, printing "ℹ tests 4" only when the host declares a count pattern.
function makeHost({ countPattern = true } = {}) {
  const dir = tmpdir('at-risk-reuse')
  const counter = path.join(tmpdir('at-risk-reuse-counter'), 'counter')
  const g = gitRepo(dir)
  for (const d of ['.claude', 'src', 'tests']) fs.mkdirSync(path.join(dir, d), { recursive: true })
  const capabilities = { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' }
  if (countPattern) capabilities.testCountPattern = 'ℹ tests (\\d+)'
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'bash gate.sh', testCommand: 'bash test.sh', runtime: { inert: 'fixture' }, capabilities,
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  fs.writeFileSync(path.join(dir, 'tests/atrisk-a.test.js'), AT_RISK)
  fs.writeFileSync(path.join(dir, 'tests/atrisk-b.test.js'), AT_RISK)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, SPEC_REL),
    reviewLegsSpecBody({ title: 'At-risk reuse fixture', acId: 'AC-20260820-99-1' })
      .replace('| tests/foo.test.js | create | tests |\n', '| tests/foo.test.js | create | tests |\n| gate.sh | create | scripts |\n| test.sh | create | scripts |\n'))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN)
  fs.writeFileSync(path.join(dir, 'gate.sh'), '#!/usr/bin/env bash\nexit 0\n')
  fs.writeFileSync(path.join(dir, 'test.sh'),
    `#!/usr/bin/env bash\necho x >> '${counter}'\n${countPattern ? 'echo "ℹ tests 4"\n' : ''}echo "ℹ skipped 0"\nexit \${STUB_EXIT:-0}\n`)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base, counter }
}

const lines = c => fs.existsSync(c) ? fs.readFileSync(c, 'utf8').split('\n').filter(Boolean).length : 0

function run(host, env = {}) {
  const manifest = path.join(tmpdir('at-risk-reuse-manifest'), 'manifest.jsonl')
  const outDir = tmpdir('at-risk-reuse-out')
  const r = runNode(SCRIPT, ['--root', host.dir, '--spec', SPEC_REL, '--base', host.base,
    '--manifest', manifest, '--out-dir', outDir], { env: { ...process.env, ...env } })
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) : []
  return { r, byLeg: new Map(rows.map(x => [x.leg, x])), outDir }
}

test('AC-20261103-12-16: a green suite row with a count and a {file}-less testCommand makes the at-risk leg append reused:"suite" with no spawn and no at-risk.txt', () => {
  const host = makeHost()
  const { r, byLeg, outDir } = run(host)
  assert.strictEqual(byLeg.get('suite').observed.testsExecuted, 4, 'setup precondition: the suite row must carry the count: ' + r.stdout + r.stderr)
  assert.strictEqual(lines(host.counter), 1,
    'only the suite may invoke testCommand — a second counter line means at-risk reran files the bare suite already executed: ' + r.stdout)
  assert.deepStrictEqual(byLeg.get('at-risk'),
    { leg: 'at-risk', exit: 0, observed: { files: 2, testsExecuted: 4, reused: 'suite' }, scope: 'full' },
    'the at-risk row must be the suite\'s observation stamped reused:"suite": ' + JSON.stringify(byLeg.get('at-risk')))
  assert.ok(!fs.existsSync(path.join(outDir, 'at-risk.txt')),
    'a reused at-risk leg must write no at-risk.txt — evidence that was never produced must not be advertised')
})

test('AC-20261103-12-17: a red suite row, or one with an unobserved count, leaves the at-risk leg spawning and its row free of a reused key, while a green counted suite does reuse', () => {
  const control = run(makeHost())
  assert.strictEqual(control.byLeg.get('at-risk').observed.reused, 'suite',
    'control: a green counted suite must reuse — without it the two spawn cases below prove nothing: ' + JSON.stringify(control.byLeg.get('at-risk')))

  const red = makeHost()
  const redRun = run(red, { STUB_EXIT: '1' })
  assert.strictEqual(redRun.byLeg.get('suite').exit, 1, 'setup precondition: STUB_EXIT=1 must redden the suite: ' + JSON.stringify(redRun.byLeg.get('suite')))
  assert.strictEqual(lines(red.counter), 2,
    'a red suite vouches for nothing, so at-risk must spawn (counter 2): ' + redRun.r.stdout + redRun.r.stderr)
  assert.ok(!('reused' in redRun.byLeg.get('at-risk').observed),
    'the spawned at-risk row must carry no reused key: ' + JSON.stringify(redRun.byLeg.get('at-risk')))

  const noCount = makeHost({ countPattern: false })
  const ncRun = run(noCount)
  assert.deepStrictEqual(ncRun.byLeg.get('suite').observed.testsExecuted, { unavailable: 'no-format-declared' },
    'setup precondition: no declared pattern means an unobserved suite count: ' + JSON.stringify(ncRun.byLeg.get('suite')))
  assert.strictEqual(lines(noCount.counter), 2,
    'an unobserved suite count cannot stand in for the at-risk run, so at-risk must spawn (counter 2): ' + ncRun.r.stdout)
  assert.ok(!('reused' in ncRun.byLeg.get('at-risk').observed),
    'the spawned at-risk row must carry no reused key: ' + JSON.stringify(ncRun.byLeg.get('at-risk')))
})
