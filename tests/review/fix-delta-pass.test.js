'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { makeHost, run, stateOf, returnFileWith, oneFixReturnFile, SURVIVOR_RETURN } = require('./review-driver.fixtures')

// specs/20260909/05-fix-delta-reviewer-pass.md D1-D5 / AC-20260909-05-1 .. -5: the driver
// snapshots the working tree (scratch-index write-tree) at reviewer-returned and again at
// fix-applied, writes the changed-file delta, refuses an empty delta, falls back to HEAD when a
// prior-version sidecar carries no snapshot, and the iteration>=2 REVIEWER step names the
// fix-delta pass's extra inputs.

function g(root, ...a) {
  return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' })
}

// Drives a fresh host from cold through one HARD survivor to FIX, ready for a fix edit + fix-applied.
function driveToFix(host, tag) {
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup (' + tag + '): a fresh green-legs fixture must reach REVIEWER before iteration 1 can proceed')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith(tag + '-return', SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup (' + tag + '): a returned hard survivor must land DISPOSITIONS')
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--file', oneFixReturnFile(tag + '-disp', 's0'),
    '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX',
    'setup (' + tag + '): dispatching a fix for the one hard survivor must land FIX: ' + dispR.stdout + dispR.stderr)
}

// Incident (this spec's own review run, caught dogfooding in the plugin repo): a host whose
// .gitignore already covers the review sidecar made D1's negative pathspec name an ignored path,
// and `git add` refuses that outright — the snapshot died before any mark could land. The
// exclusion is redundant on such a host, so it is only carried when the sidecar is not ignored.
test('a host whose .gitignore already covers the review sidecar still snapshots at reviewer-returned — the negative pathspec must not make git add refuse an ignored path', () => {
  const host = makeHost()
  fs.appendFileSync(path.join(host.root, '.gitignore'), 'specs/**/*.review/\n')
  g(host.root, 'add', '.gitignore')
  g(host.root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'ignore review sidecars')

  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup: a fresh green-legs fixture must reach REVIEWER before the ignored-sidecar snapshot can be exercised')

  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('fdp-ign-return', SURVIVOR_RETURN))
  assert.strictEqual(r.status, 0,
    'D1: the tree snapshot must succeed on a host that already gitignores the sidecar — a refusal here blocks every review in such a repo: ' + r.stdout + r.stderr)

  const state = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'review-state.json'), 'utf8'))
  assert.match(String(state.treeSnapshot && state.treeSnapshot['1']), /^[0-9a-f]{40}$/,
    'D1: an ignored sidecar must still yield a recorded 40-hex tree sha, not a missing snapshot that silently widens the next delta to HEAD')
})
