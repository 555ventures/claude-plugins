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

test('AC-20260909-05-1: WHEN --mark reviewer-returned is accepted for iteration 1 in a host whose tree has one modified tracked file and one untracked file THE SYSTEM SHALL write marks.treeSnapshot["1"] as a git tree object capturing the untracked file, leaving the real index and worktree untouched', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup: a fresh green-legs fixture must reach REVIEWER before iteration 1\'s reviewer-returned mark can be exercised')

  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 42 // dirty tracked edit\n')
  fs.writeFileSync(path.join(host.root, 'untracked.txt'), 'u\n')
  const statusBefore = g(host.root, 'status', '--porcelain')

  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('fdp-ac1-return', SURVIVOR_RETURN))
  assert.strictEqual(r.status, 0, 'a valid reviewer return must be accepted at iteration 1: ' + r.stdout + r.stderr)

  const statusAfter = g(host.root, 'status', '--porcelain')
  assert.strictEqual(statusAfter, statusBefore,
    'D1: the scratch-index snapshot must never touch the real index or worktree — git status --porcelain must read byte-identical before and after the mark: before=' +
      JSON.stringify(statusBefore) + ' after=' + JSON.stringify(statusAfter))

  const state = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'review-state.json'), 'utf8'))
  const sha = state.treeSnapshot && state.treeSnapshot['1']
  assert.match(String(sha), /^[0-9a-f]{40}$/,
    'D1: marks.treeSnapshot["1"] must be recorded as a 40-hex git tree sha at reviewer-returned time for iteration 1 — got ' +
      JSON.stringify(state.treeSnapshot))
  assert.strictEqual(g(host.root, 'cat-file', '-t', sha).trim(), 'tree',
    'AC-20260909-05-1 (literal): git cat-file -t <sha> must print "tree" — the recorded snapshot must be a real git tree object')
  assert.match(g(host.root, 'ls-tree', '-r', '--name-only', sha), /(^|\n)untracked\.txt(\n|$)/,
    'AC-20260909-05-1 (literal): git ls-tree -r --name-only <sha> must list the untracked file — a snapshot blind to untracked files defeats the reason D1 chose a scratch-index write-tree over git stash create')
})

test('AC-20260909-05-2: WHEN --mark fix-applied follows a fix that modified a tracked file and created a new test file THE SYSTEM SHALL write <sidecar>/fix-delta-2.txt containing exactly the sorted changed-file list and create manifest-2.jsonl', () => {
  const host = makeHost()
  driveToFix(host, 'fdp-ac2')

  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 42 // fixed\n')
  fs.writeFileSync(path.join(host.root, 'tests/extra.test.js'),
    "'use strict'\nconst { test } = require('node:test')\ntest('noop', () => {})\n")

  const r = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(r.status, 0, 'a fix-applied following a real file change within the cap must succeed: ' + r.stdout + r.stderr)

  const deltaPath = path.join(host.sidecar, 'fix-delta-2.txt')
  assert.ok(fs.existsSync(deltaPath),
    'D2: fix-applied after a genuine file change must write <sidecar>/fix-delta-2.txt: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(deltaPath, 'utf8'), 'src/foo.js\ntests/extra.test.js\n',
    'AC-20260909-05-2 (literal): fix-delta-2.txt must contain exactly the sorted, LF-terminated changed-file list, one repo-relative path per line')
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-2.jsonl')),
    'D2: fix-applied must create manifest-2.jsonl for the fix-delta legs re-run: ' + r.stdout + r.stderr)
})

test('AC-20260909-05-3: WHEN --mark fix-applied follows no file change THE SYSTEM SHALL exit 2 naming the empty-delta refusal, create no manifest-2.jsonl, and leave review-state.json byte-identical', () => {
  const host = makeHost()
  driveToFix(host, 'fdp-ac3')

  const stateFile = path.join(host.sidecar, 'review-state.json')
  const before = fs.readFileSync(stateFile, 'utf8')

  const r = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(r.status, 2,
    'D2: a fix-applied with no file change since the reviewer returned must be refused, never silently re-running legs and re-dispatching a reviewer for no delta: ' +
      r.stdout + r.stderr)
  assert.match(r.stderr, /no file changed since the reviewer returned/,
    'AC-20260909-05-3 (literal): stderr must name the empty-delta refusal text verbatim ("no file changed since the reviewer returned — the fix workers wrote nothing"): ' +
      r.stderr)
  assert.strictEqual(fs.existsSync(path.join(host.sidecar, 'manifest-2.jsonl')), false,
    'D2: the empty-delta refusal must create no manifest-2.jsonl — legs must never run on a no-op fix')
  assert.strictEqual(fs.readFileSync(stateFile, 'utf8'), before,
    'D2: the empty-delta refusal must leave review-state.json byte-identical — marks.pendingFix must stay true so the fix can be re-attempted')
})

test('AC-20260909-05-4: WHEN review-state.json carries no treeSnapshot (an older sidecar) and one file is dirty against HEAD at --mark fix-applied THE SYSTEM SHALL write the delta file listing that file and proceed (exit 0)', () => {
  const host = makeHost()
  driveToFix(host, 'fdp-ac4')

  const stateFile = path.join(host.sidecar, 'review-state.json')
  const stateJson = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  delete stateJson.treeSnapshot
  fs.writeFileSync(stateFile, JSON.stringify(stateJson, null, 2))

  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 42 // ac4 dirty against HEAD\n')

  const r = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(r.status, 0,
    'D3: a missing treeSnapshot must fall back to snapshotting against HEAD\'s tree rather than refusing the whole pass: ' + r.stdout + r.stderr)
  const deltaPath = path.join(host.sidecar, 'fix-delta-2.txt')
  assert.ok(fs.existsSync(deltaPath), 'D3: the HEAD-fallback path must still write the delta file: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(deltaPath, 'utf8'), 'src/foo.js\n',
    'AC-20260909-05-4 (literal): with no treeSnapshot recorded, the delta must list every file dirty against HEAD — here only the one edited file, never empty by accident')
})

test('AC-20260909-05-5: the REVIEWER step for iteration >= 2 (manifest-2.jsonl present) names the fix-delta pass heading, the delta file, the prior reviewer/disposer returns and the return shape, with no "scope" substring; the iteration-1 step (only manifest-1.jsonl) names none of them', () => {
  const host = makeHost()
  const r1 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: a fresh green-legs fixture must reach REVIEWER on iteration 1')
  assert.ok(
    !r1.stdout.includes('fix-delta-2.txt') && !r1.stdout.includes('reviewer-return-1.json') && !r1.stdout.includes('disposer-return-1.json'),
    'AC-20260909-05-5: with only manifest-1.jsonl present the REVIEWER step must print the plain iteration-1 text, naming none of the fix-delta-pass filenames: ' + r1.stdout)

  driveToFix(host, 'fdp-ac5')
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 42 // ac5 fixed\n')
  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR.status, 0, 'setup: the fix-delta cycle must complete to reach the iteration-2 REVIEWER step: ' + fixR.stdout + fixR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: fix-applied must return to REVIEWER for the fix-delta reviewer pass')

  assert.match(fixR.stdout, /fix-delta pass/,
    'D4/AC-20260909-05-5 (literal): the iteration-2 REVIEWER step heading must contain "fix-delta pass": ' + fixR.stdout)
  assert.match(fixR.stdout, /fix-delta-2\.txt/,
    'D4: the step must name the delta file fix-delta-2.txt: ' + fixR.stdout)
  assert.match(fixR.stdout, /reviewer-return-1\.json/,
    'D4: the step must name the prior reviewer return reviewer-return-1.json: ' + fixR.stdout)
  assert.match(fixR.stdout, /disposer-return-1\.json/,
    'D4: the step must name the prior disposer return disposer-return-1.json: ' + fixR.stdout)
  assert.match(fixR.stdout, /\{verdict, survivors, killed, reviewerCount, tokens\}/,
    'D4: the step must still print the reviewer return shape {verdict, survivors, killed, reviewerCount, tokens}: ' + fixR.stdout)
  assert.ok(!fixR.stdout.includes('scope'),
    'D4/AC-20260909-05-5 (literal): the fix-delta pass step text must contain no "scope" substring — AC-20260902-05-13 forbids the word in this step: ' + fixR.stdout)
})
