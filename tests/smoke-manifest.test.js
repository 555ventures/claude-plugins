'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash, gitRepo } = require('./helpers')

// The boot smoke leg and the deliverable manifest check are the executed-observation gates
// behind /spec:review and /spec:init (shared § Runtime Verification). Pinned: exit codes are
// the verdict — no model narrates pass/fail — and both fail closed.
//
// specs/20260815/04-runtime-shutdown-leg.md D5(a): the shutdown observation D1 adds reddens
// this file's pass-path fixture as a collision — a bare `sleep 30` boot command has no
// SIGTERM handler, so once smoke.sh sends the stop signal the process dies by default action
// (143 ∉ [0]) and the leg now fails as unclean instead of passing. The fixture gains a
// `trap 'exit 0' TERM` handler so it keeps meaning "this boots and stops cleanly." The
// inert/no-runtime/boot-crashed/not-ready pins are untouched by construction (AC-20260815-04-7)
// — the shutdown block sits after readiness, and none of those paths ever reach it.

function writeConfig(dir, runtime) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'),
    JSON.stringify(runtime === undefined ? {} : { runtime }))
  return dir
}

const smoke = (dir, ...args) => runBash('scripts/smoke.sh', args, { cwd: dir })

test('AC-20260815-04-7: smoke: no runtime block CONTINUES TO exit 3 — "no way to boot" is a finding, not a skip', () => {
  const dir = writeConfig(tmpdir('smoke'), undefined)
  const res = smoke(dir)
  assert.strictEqual(res.status, 3, res.stdout + res.stderr)
  assert.match(res.stdout, /__SMOKE_FAIL__ no-runtime/)
})

test('AC-20260815-04-7: smoke: missing config CONTINUES TO be exit 3 too', () => {
  const res = smoke(tmpdir('smoke'))
  assert.strictEqual(res.status, 3)
})

test('AC-20260815-04-7: smoke: declared inert CONTINUES TO exit 4 with the reason printed — sanctioned, never silent', () => {
  const dir = writeConfig(tmpdir('smoke'), { inert: 'pure library, nothing to boot' })
  const res = smoke(dir)
  assert.strictEqual(res.status, 4)
  assert.match(res.stdout, /__SMOKE_INERT__ pure library/)
})

test('AC-20260815-04-7: smoke: boot observed ready with a clean-handler boot CONTINUES TO be exit 0 with the pass sentinel', () => {
  const dir = tmpdir('smoke')
  writeConfig(dir, {
    // D5(a): the shutdown observation this spec adds requires a SIGTERM handler for the boot
    // to still pass — a bare `sleep 30` dies 143 on the stop signal (default action), which is
    // exactly the escape this spec exists to catch. `trap 'exit 0' TERM` keeps this fixture
    // meaning "boots and stops cleanly."
    bootCommand: `touch ${dir}/up && trap 'exit 0' TERM && while :; do sleep 1; done`,
    readyCheck: `test -f ${dir}/up`,
    readyTimeout: 20,
  })
  const res = smoke(dir)
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  assert.match(res.stdout, /__SMOKE_PASS__/)
})

test('AC-20260815-04-7: smoke: boot process dying before ready CONTINUES TO exit 2 with log tail', () => {
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

test('AC-20260815-04-7: smoke: readyCheck never passing CONTINUES TO exit 1 after the timeout', () => {
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
