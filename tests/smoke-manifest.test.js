'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash, gitRepo } = require('./helpers')

// The boot smoke leg and the deliverable manifest check are the executed-observation gates
// behind /spec:review and /spec:init (shared § Runtime Verification). Pinned: exit codes are
// the verdict — no model narrates pass/fail — and both fail closed.

function writeConfig(dir, runtime) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'),
    JSON.stringify(runtime === undefined ? {} : { runtime }))
  return dir
}

const smoke = (dir, ...args) => runBash('scripts/smoke.sh', args, { cwd: dir })

test('smoke: no runtime block is exit 3 — "no way to boot" is a finding, not a skip', () => {
  const dir = writeConfig(tmpdir('smoke'), undefined)
  const res = smoke(dir)
  assert.strictEqual(res.status, 3, res.stdout + res.stderr)
  assert.match(res.stdout, /__SMOKE_FAIL__ no-runtime/)
})

test('smoke: missing config is exit 3 too', () => {
  const res = smoke(tmpdir('smoke'))
  assert.strictEqual(res.status, 3)
})

test('smoke: declared inert is exit 4 with the reason printed — sanctioned, never silent', () => {
  const dir = writeConfig(tmpdir('smoke'), { inert: 'pure library, nothing to boot' })
  const res = smoke(dir)
  assert.strictEqual(res.status, 4)
  assert.match(res.stdout, /__SMOKE_INERT__ pure library/)
})

test('smoke: boot observed ready is exit 0 with the pass sentinel', () => {
  const dir = tmpdir('smoke')
  writeConfig(dir, {
    bootCommand: `touch ${dir}/up && sleep 30`,
    readyCheck: `test -f ${dir}/up`,
    readyTimeout: 20,
  })
  const res = smoke(dir)
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  assert.match(res.stdout, /__SMOKE_PASS__/)
})

test('smoke: boot process dying before ready is exit 2 with log tail', () => {
  const dir = writeConfig(tmpdir('smoke'), {
    bootCommand: 'echo boom >&2; exit 1',
    readyCheck: 'false',
    readyTimeout: 20,
  })
  const res = smoke(dir)
  assert.strictEqual(res.status, 2, res.stdout + res.stderr)
  assert.match(res.stdout, /__SMOKE_FAIL__ boot-crashed/)
  assert.match(res.stdout, /boom/)
})

test('smoke: readyCheck never passing is exit 1 after the timeout', () => {
  const dir = writeConfig(tmpdir('smoke'), {
    bootCommand: 'sleep 30',
    readyCheck: 'false',
  })
  const res = smoke(dir, '--timeout', '2')
  assert.strictEqual(res.status, 1, res.stdout + res.stderr)
  assert.match(res.stdout, /__SMOKE_FAIL__ not-ready/)
})

const check = (dir) => runBash('scripts/manifest-check.sh', [], { cwd: dir })

function writeManifest(dir, checks) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec-manifest.json'), JSON.stringify({ checks }))
}

test('manifest-check: missing manifest is exit 5 — init has not proven activation', () => {
  assert.strictEqual(check(tmpdir('manifest')).status, 5)
})

test('manifest-check: file + exec + inert rows pass; inert is printed, never silent', () => {
  const dir = tmpdir('manifest')
  fs.writeFileSync(path.join(dir, 'real.txt'), 'x\n')
  writeManifest(dir, [
    { claim: 'deliverable exists', kind: 'file', target: 'real.txt' },
    { claim: 'script executes', kind: 'exec', target: 'true' },
    { claim: 'CI local-only', kind: 'inert', target: 'user declared: no remote yet' },
  ])
  const res = check(dir)
  assert.strictEqual(res.status, 0, res.stdout)
  assert.match(res.stdout, /INERT CI local-only — declared: user declared: no remote yet/)
})

test('manifest-check: a missing file, failing exec, or unknown kind fails closed', () => {
  const dir = tmpdir('manifest')
  writeManifest(dir, [
    { claim: 'ghost deliverable', kind: 'file', target: 'nope.md' },
    { claim: 'broken script', kind: 'exec', target: 'false' },
    { claim: 'typo kind', kind: 'exsits', target: 'x' },
  ])
  const res = check(dir)
  assert.strictEqual(res.status, 1)
  assert.match(res.stdout, /3 of 3 checks FAILED/)
  assert.match(res.stdout, /do not stamp generatedBy/)
})

test('manifest-check: remote row fails without a git remote, passes with one', () => {
  const dir = fs.realpathSync(tmpdir('manifest'))
  gitRepo(dir)
  writeManifest(dir, [{ claim: 'CI activated', kind: 'remote', target: 'origin' }])
  const fail = check(dir)
  assert.strictEqual(fail.status, 1)
  assert.match(fail.stdout, /authored CI is inert without it/)
  const { execFileSync } = require('node:child_process')
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://example.com/x.git'])
  assert.strictEqual(check(dir).status, 0)
})
