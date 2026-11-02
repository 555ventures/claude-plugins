'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const { run, stateOf, toReviewer, returnFileWith, specBody, GREEN_TEST, CLEAN_RETURN } = require('./review-driver.fixtures')

// Direct-lane fix (2026-11-02): niko-hub spec 20261101/12 could never close. Its gate exited 0
// but printed 1.24 MB; the close-time gate re-run captured it through a Node pipe at spawnSync's
// default 1 MiB maxBuffer, the child was SIGTERM-killed (ENOBUFS, status null) and runHost
// refused with "died without an exit code". gateCommand and testCommand differ here on purpose
// so BOTH close-time re-runs (gate, then whole-suite) capture the big output.
function makeBigGateHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-close-big-gate'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'bash test.sh gate',
    testCommand: 'bash test.sh suite',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, '.gitignore'), 'specs/**/*.review/\nspecs/**/*.build/\n')
  // 2 MiB of noise after a green runner — well past the 1 MiB default, exit 0.
  fs.writeFileSync(path.join(root, 'test.sh'),
    '#!/usr/bin/env bash\nnode --test || exit $?\nhead -c 2097152 /dev/zero | tr "\\0" x\necho\n')
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-close-big-gate.md')
  fs.writeFileSync(spec, specBody({ diffBase }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec }
}

test('WHEN --mark closed re-runs a green gate and suite that each print more than 1 MiB THE SYSTEM closes with exit 0 instead of reporting a death without an exit code', () => {
  const host = makeBigGateHost()
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvdrv-close-big-gate-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: the clean reviewer return must reach CLOSE: ' + r.stdout + r.stderr)
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })

  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.doesNotMatch(closed.stderr, /died without an exit code/,
    'a passing gate that prints past 1 MiB must not be reported as a dead child: ' + closed.stderr)
  assert.strictEqual(closed.status, 0,
    'a green close tree must let --mark closed succeed however much the gate prints: ' + closed.stdout + closed.stderr)
})
