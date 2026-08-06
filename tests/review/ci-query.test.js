'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260805/02-review-evidence-manifest.md (D4, spiked 2026-08-05 A1): the review `ci` leg
// and spec 03's observe-ci.js both need to ask "what did CI just do?" without duplicating a `gh`
// wrapper — two independent wrappers was the drift seam a refuter flagged. ci-query.js is the
// one normalized wrapper: gh missing / no remote / `[]` is a structural "no CI to consult"
// (available:false, transient:false); gh executing but exiting non-zero is a retryable
// auth/network failure (available:false, transient:true); a completed run passes its fields
// through untouched. This file pins the raw-vs-mapped distinction by execution against a fake
// `gh` on PATH.

const SCRIPT = 'scripts/ci-query.js'

function fakeGhDir(body) {
  const dir = tmpdir('fake-gh')
  const bin = path.join(dir, 'gh')
  fs.writeFileSync(bin, '#!/usr/bin/env bash\n' + body + '\n')
  fs.chmodSync(bin, 0o755)
  return dir
}

test('AC-20260805-02-10: gh absent from PATH prints available:false, transient:false', () => {
  const dir = tmpdir('ci-query')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--branch', 'main', '--root', dir],
    { env: { PATH: '/nonexistent-bin-dir-for-ci-query-test' } })
  assert.strictEqual(r.status, 0, 'gh being absent is a structural fact, not a usage error — exit 0: ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) },
    'ci-query.js must print parseable JSON even when gh is missing: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(out.available, false,
    'with no gh binary reachable there is no CI to consult — available must be false: ' + r.stdout)
  assert.strictEqual(out.transient, false,
    'a missing gh binary is a structural condition (never retryable by itself) — transient must be false, ' +
    'distinguishing it from an auth/network failure: ' + r.stdout)
})

test('AC-20260805-02-10: a fake gh exiting non-zero prints transient:true', () => {
  const ghDir = fakeGhDir('echo "gh: authentication failed" >&2\nexit 1')
  const dir = tmpdir('ci-query')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--branch', 'main', '--root', dir],
    { env: { PATH: ghDir + path.delimiter + process.env.PATH } })
  assert.strictEqual(r.status, 0, 'a transient gh failure is still an answered query, not a usage error: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.available, false,
    'a failing gh call cannot report a CI run — available must be false: ' + r.stdout)
  assert.strictEqual(out.transient, true,
    'gh executing but exiting non-zero (auth/network) is retryable — transient must be true, distinguishing ' +
    'it from the structural gh-missing case: ' + r.stdout)
})

test('AC-20260805-02-10: a fake gh printing a completed run passes status/conclusion/sha/url/runAt through', () => {
  const ghDir = fakeGhDir(
    'echo \'[{"status":"completed","conclusion":"success","headSha":"abc123def456","' +
    'url":"https://github.com/x/y/actions/runs/1","updatedAt":"2026-08-06T00:00:00Z"}]\'')
  const dir = tmpdir('ci-query')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--branch', 'main', '--root', dir],
    { env: { PATH: ghDir + path.delimiter + process.env.PATH } })
  assert.strictEqual(r.status, 0, 'an answered, completed run must exit 0: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.available, true, 'a completed run was successfully fetched — available must be true: ' + r.stdout)
  assert.strictEqual(out.status, 'completed', 'gh\'s status field must pass through unmapped: ' + r.stdout)
  assert.strictEqual(out.conclusion, 'success', 'gh\'s conclusion field must pass through unmapped: ' + r.stdout)
  assert.strictEqual(out.sha, 'abc123def456', 'gh\'s headSha must map to the normalized sha field: ' + r.stdout)
  assert.strictEqual(out.url, 'https://github.com/x/y/actions/runs/1', 'gh\'s url must pass through: ' + r.stdout)
  assert.strictEqual(out.runAt, '2026-08-06T00:00:00Z', 'gh\'s updatedAt must map to the normalized runAt field: ' + r.stdout)
})
