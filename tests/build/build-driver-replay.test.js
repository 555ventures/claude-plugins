'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeHost, run, stateOf, toGreenGate } = require('./build-driver.fixtures')

// /spec:fix 2026-10-28 (prax-app spec 20261028/02): two prototype-replay defects fixed as one root
// cause. (1) The REPLAY step printed runtime.bootCommand — the smoke boot — as the way to serve the
// app at prototype.url; on a host whose smoke target is an API-only worker every screen 404'd. The
// step now prints prototype.bootCommand when declared, else runtime.bootCommand. (2) REPLAY was
// derived for every spec carrying `prototype:` and ran the whole contract, so when /spec:plan split
// one contract into sibling specs the earlier slices could never go green (core § Decomposition).
// REPLAY is now derived only for the spec whose File Plan owns prototype.e2eFile ({stem}
// substituted) — the one row plan.md already gives exactly one spec; a sibling goes straight to
// COMMIT, says so in the step, refuses --mark replayed, and records replay:{owner:false}.

const STEM = 'crm-list'

test('replay owner: a prototype: spec whose File Plan owns prototype.e2eFile derives REPLAY after a green gate, the row never becomes a wave row, and the step prints prototype.bootCommand over runtime.bootCommand', () => {
  const host = makeHost({ prototype: STEM, protoBoot: 'npm run dev:web' })
  toGreenGate(host)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'the owner must park at REPLAY once the gate is green — its File Plan carries e2e/proto-' + STEM + '.spec.ts')
  const step = run(host.root, host.spec)
  assert.match(step.stdout, /Session: start the app .*npm run dev:web/,
    'the REPLAY step must print the declared prototype.bootCommand — the smoke boot may be a different process: ' + step.stdout)
  assert.ok(!/scripts\/dev-server\.js/.test(step.stdout),
    'runtime.bootCommand must not be printed when prototype.bootCommand is declared: ' + step.stdout)
  assert.ok(!fs.existsSync(path.join(host.root, 'e2e/proto-' + STEM + '.spec.ts')),
    'setup: the e2e row is driver-copied at --mark replayed — the waves above must have advanced without it on disk')
})

test('replay owner: with no prototype.bootCommand the REPLAY step falls back to runtime.bootCommand', () => {
  const host = makeHost({ prototype: STEM })
  toGreenGate(host)
  const step = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY')
  assert.match(step.stdout, /Session: start the app .*node scripts\/dev-server\.js/,
    'absent prototype.bootCommand, the step prints runtime.bootCommand as before: ' + step.stdout)
})

test('sibling slice: a prototype: spec whose File Plan does not own prototype.e2eFile skips REPLAY — COMMIT after a green gate, the step names the skip, --mark replayed is refused, and the build row records replay.owner false', () => {
  const host = makeHost({ prototype: STEM, owner: false })
  toGreenGate(host)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'a sibling slice must land COMMIT, never REPLAY — the pins it does not own cannot pass on it')
  const step = run(host.root, host.spec)
  assert.match(step.stdout, /REPLAY skipped — this spec's File Plan does not own e2e\/proto-crm-list\.spec\.ts/,
    'the COMMIT step must say why no replay ran on this spec: ' + step.stdout)
  const refused = run(host.root, host.spec, '--mark', 'replayed')
  assert.notStrictEqual(refused.status, 0, 'a sibling must not be able to replay: ' + refused.stdout)
  assert.match(refused.stderr, /--mark replayed refused — the current state is COMMIT/, refused.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'replay-state.json')), 'a refused mark writes no replay state')

  host.g('add', '-A'); host.g('commit', '-q', '-m', 'slice')
  const committed = run(host.root, host.spec, '--mark', 'committed')
  assert.strictEqual(committed.status, 0, 'COMMIT must close on a sibling: ' + committed.stdout + committed.stderr)
  const rows = fs.readFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const build = rows.find((r) => r.stage === 'build')
  assert.deepStrictEqual(build.replay, { owner: false },
    'the sibling build row must say it was not the replay owner, so review appends no contract leg and never reads a phantom red: ' + JSON.stringify(build))
})
