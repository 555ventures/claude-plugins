'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const { run, stateOf, toReviewer, returnFileWith, specBody, GREEN_TEST, CLEAN_RETURN } = require('./review-driver.fixtures')

// specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md D3/D7: AC-20261101-05-8.

// D7: test.sh keeps the real `node --test` as the runner behind a counting wrapper; the counter
// is git-ignored so the close tree stays clean.
function makeUnscopedHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-close-reuse'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'true && bash test.sh',
    testCommand: 'bash test.sh',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, '.gitignore'), 'counter\nspecs/**/*.review/\nspecs/**/*.build/\n')
  fs.writeFileSync(path.join(root, 'test.sh'), '#!/usr/bin/env bash\necho x >> counter\nnode --test\n')
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-close-reuse.md')
  fs.writeFileSync(spec, specBody({ diffBase }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec }
}

const counterLines = root => {
  const f = path.join(root, 'counter')
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0
}

test('AC-20261101-05-8: WHEN --mark closed runs over an unscoped && gate ending in testCommand on a green close tree THE SYSTEM runs the runner exactly once, prints the reuse line, and exits 0', () => {
  const host = makeUnscopedHost()
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-close-reuse-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })

  const before = counterLines(host.root)
  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0,
    'a green unscoped close tree must let --mark closed succeed: ' + closed.stdout + closed.stderr)
  assert.strictEqual(counterLines(host.root) - before, 1,
    'close must run the runner once (the gate) — a delta of 2 means the whole-suite half re-ran a suite the gate already covered: ' + closed.stdout)
  assert.match(closed.stdout, /^close-time suite: reused the gate run \(/m,
    'the driver must say it reused the gate run so a skipped half is never silent: ' + closed.stdout)
})
