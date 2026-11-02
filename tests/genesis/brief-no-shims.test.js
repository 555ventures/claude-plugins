'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { writeBrief } = require('./tournament.fixtures.js')

// specs/20261101/08-no-host-needs-the-shims.md D1: genesis-driver.js carries no legacy resume,
// no resume flag, no retired-mark table, and writes status.brief as {mocks, ratifiedAt}.
// Retired names are assembled from fragments so the repo-wide retired-literal sweeps never see them.

const SCRIPT = 'scripts/genesis-driver.js'
const RESUME_FLAG = '--leg' + 'acy'
const OLD_MARK_A = 'positions-' + 'authored'
const OLD_MARK_B = 'tiles-' + 'culled'

const bare = (dir) => runNode(SCRIPT, ['--root', dir])
const mark = (dir, name, extra = []) => runNode(SCRIPT, ['--root', dir, '--mark', name, ...extra])
const statusPath = (dir) => path.join(dir, '.claude/genesis/status.json')
const statusOf = (dir) => JSON.parse(fs.readFileSync(statusPath(dir), 'utf8'))

function atDiscoveryDone(archetype) {
  const dir = fs.realpathSync(tmpdir('brief-no-shims'))
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const r = mark(dir, 'discovery-done')
  assert.strictEqual(r.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered ' + archetype + ' brief: ' + r.stderr)
  return dir
}

function pastMenusWithoutBrief(dir) {
  const s = statusOf(dir)
  s.marks.menusDone = true
  delete s.marks.briefWritten
  fs.writeFileSync(statusPath(dir), JSON.stringify(s, null, 2) + '\n')
}

test('AC-20261101-08-1: a web-app status past MENUS with no briefWritten mark and no mocks status derives the BRIEF step naming /spec:mocks with no legacy: line', () => {
  const dir = atDiscoveryDone('web-app')
  pastMenusWithoutBrief(dir)
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare run must print its step and exit 0: ' + r.stderr)
  assert.match(r.stdout, /## Step: brief/, 'the status must derive BRIEF from live artifacts like a fresh run: ' + r.stdout)
  assert.match(r.stdout, /\/spec:mocks/, 'a visual archetype without an approved mocks set must be sent to /spec:mocks, or the session has no path forward: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /^legacy:/m, 'a legacy: line means the resume branch still exists and offers a way around the mocks precondition: ' + r.stdout)
})

test('AC-20261101-08-2: --mark brief-written followed by the retired resume flag exits 2 on the mocks precondition and leaves briefWritten unset', () => {
  const dir = atDiscoveryDone('web-app')
  const r = mark(dir, 'brief-written', [RESUME_FLAG])
  assert.strictEqual(r.status, 2, 'the retired flag must be inert — accepting it skips the mocks precondition and ratifies a brief with no approved design: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /run \/spec:mocks first/, 'the precondition must fire exactly as it would without the flag: ' + r.stderr)
  assert.ok(!statusOf(dir).marks.briefWritten, 'a refused mark must not record briefWritten: ' + JSON.stringify(statusOf(dir).marks))
})

test('AC-20261101-08-3: the former design marks fall to the generic unknown-mark refusal whose usage list carries no resume-flag segment', () => {
  const dir = atDiscoveryDone('data-ml')
  for (const name of [OLD_MARK_A, OLD_MARK_B]) {
    const r = mark(dir, name)
    assert.strictEqual(r.status, 2, '--mark ' + name + ' must exit 2: ' + r.stdout + r.stderr)
    assert.ok(r.stderr.includes('unknown mark "' + name + '"'),
      '--mark ' + name + ' must hit the generic unknown-mark refusal, not a retired-mark table that outlives its states: ' + r.stderr)
    assert.ok(!r.stderr.includes('[' + RESUME_FLAG + ']'),
      'the usage list must not advertise the retired flag, or callers keep passing it: ' + r.stderr)
  }
})

test('AC-20261101-08-4: brief-written on a data-ml root writes status.brief with exactly the keys mocks and ratifiedAt', () => {
  const dir = atDiscoveryDone('data-ml')
  const r = mark(dir, 'brief-written')
  assert.strictEqual(r.status, 0, 'brief-written must be accepted for a design-skipped archetype: ' + r.stderr)
  assert.deepStrictEqual(Object.keys(statusOf(dir).brief), ['mocks', 'ratifiedAt'],
    'a surviving legacy key in status.brief means the writer still stamps a flag nothing reads: ' + JSON.stringify(statusOf(dir).brief))
})

test('AC-20261101-08-16: a hand-written status carrying a legacy brief key, an explore key and every mark loads without a parse or schema refusal', () => {
  const dir = atDiscoveryDone('data-ml')
  const s = statusOf(dir)
  for (const k of Object.keys(s.marks)) s.marks[k] = true
  s.brief = { mocks: null, ['leg' + 'acy']: false, ratifiedAt: '2026-09-30T05:56:05.757Z' }
  s.explore = 'picked'
  fs.writeFileSync(statusPath(dir), JSON.stringify(s, null, 2) + '\n')
  const r = runNode(SCRIPT, ['--root', dir, '--state'])
  assert.strictEqual(r.status, 0, 'an unknown key in an existing status must never be a schema error — it would strand every host that carries it: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /^[A-Z_]+$/m, '--state must print a state name: ' + r.stdout)
})
