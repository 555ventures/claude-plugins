'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { makeHost, run, stateOf, toFirstWave, implementScriptsWave } = require('./build-driver.fixtures')

// specs/20261103/03-workers-never-run-git.md D2: the build driver keeps <private git dir>/spec-wave-open
// in sync with its derived state — AC-20261103-03-5 .. AC-20261103-03-7.

const SPEC_REL = 'specs/20260901/99-bd-test.md'

function markerOf(host) {
  const gd = execFileSync('git', ['-C', host.root, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  return path.join(path.isAbsolute(gd) ? gd : path.join(host.root, gd), 'spec-wave-open')
}
const readMarker = (host) => JSON.parse(fs.readFileSync(markerOf(host), 'utf8'))

test('AC-20261103-03-5: a step print at TESTS and at the first wave leaves spec-wave-open holding the spec path and that state', () => {
  const host = makeHost()
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(fs.existsSync(markerOf(host)),
    'without the marker the hook cannot tell a worker-dispatching step is open and the git ban stays prose: ' + r.stdout)
  assert.deepStrictEqual(readMarker(host), { spec: SPEC_REL, state: 'TESTS' },
    'the marker must carry the repo-relative spec path and the derived state so the block message can name them')
  toFirstWave(host)
  assert.deepStrictEqual(readMarker(host), { spec: SPEC_REL, state: 'WAVE:doctrine+scripts' },
    'the marker must be rewritten as the derived state moves to a wave, or the block message names a stale state')
})

test('AC-20261103-03-6: accepting wave-done for the last pending wave removes the marker on that invocation', () => {
  const host = makeHost()
  toFirstWave(host)
  implementScriptsWave(host)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  run(host.root, host.spec)
  assert.strictEqual(readMarker(host).state, 'WAVE:other',
    'setup precondition: the last pending wave must carry the marker before it is marked done')
  const r = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(fs.existsSync(markerOf(host)), false,
    'a marker surviving into INTEGRATION blocks the orchestrator\'s own git add -N and checkpoint commit')
  assert.match(r.stdout, /## Step: host integration/, 'the printed step must be the integration step: ' + r.stdout)
})

test('AC-20261103-03-7: a planted marker at a non-dispatching state is removed by a step print, while --state neither writes nor removes it', () => {
  const host = makeHost()
  toFirstWave(host)
  implementScriptsWave(host)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION', 'setup precondition: the host must be at INTEGRATION')
  fs.writeFileSync(markerOf(host), JSON.stringify({ spec: SPEC_REL, state: 'WAVE:other' }))
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION')
  assert.ok(fs.existsSync(markerOf(host)), '--state must stay pure: removing here makes a read-only query mutate the tree')
  run(host.root, host.spec)
  assert.strictEqual(fs.existsSync(markerOf(host)), false,
    'a stale marker at INTEGRATION keeps blocking the orchestrator\'s git until someone deletes it by hand')

  const fresh = makeHost()
  toFirstWave(fresh)
  fs.unlinkSync(markerOf(fresh))
  assert.strictEqual(stateOf(fresh.root, fresh.spec), 'WAVE:doctrine+scripts')
  assert.strictEqual(fs.existsSync(markerOf(fresh)), false, '--state must not write the marker: it is a pure query')
  run(fresh.root, fresh.spec)
  assert.ok(fs.existsSync(markerOf(fresh)), 'a step print at a wave must rewrite a deleted marker — self-healing after /clear or a crash')
  assert.strictEqual(stateOf(fresh.root, fresh.spec), 'WAVE:doctrine+scripts')
  assert.ok(fs.existsSync(markerOf(fresh)), '--state must not remove the marker at a dispatching state')
})
