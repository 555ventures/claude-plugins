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
//
// specs/20260810/07-per-sha-ci-legs.md D1 (2026-08-10, Prax stale-CI-review incident): a review
// asking "latest run on this branch?" hard-stopped on evidence about a DIFFERENT commit. D1 adds
// a `--commit <sha>` mode, mutually exclusive with `--branch`, that keys `gh run list` on the
// exact reviewed commit instead — every other behavior (normalization, the raw-vs-mapped split,
// `--limit 1`, no retry) stays byte-identical, and `--branch` mode itself is untouched
// (observe-ci.js depends on it, AC-20260810-07-4).

const SCRIPT = 'scripts/ci-query.js'
const USAGE_LINE = 'usage: ci-query.js (--branch <name> | --commit <sha>) [--root <dir>]'
const usageLineRe = new RegExp(USAGE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

function fakeGhDir(body) {
  const dir = tmpdir('fake-gh')
  const bin = path.join(dir, 'gh')
  fs.writeFileSync(bin, '#!/usr/bin/env bash\n' + body + '\n')
  fs.chmodSync(bin, 0o755)
  return dir
}

test('AC-20260805-02-10 / AC-20260810-07-4: gh absent from PATH prints available:false, transient:false in --branch mode (unchanged by the --commit addition)', () => {
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

test('AC-20260805-02-10 / AC-20260810-07-4: a fake gh exiting non-zero prints transient:true in --branch mode (unchanged by the --commit addition)', () => {
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

test('AC-20260805-02-10 / AC-20260810-07-4: a fake gh printing a completed run passes status/conclusion/sha/url/runAt through in --branch mode (unchanged by the --commit addition)', () => {
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

test('AC-20260810-07-1: --commit <sha> invokes gh run list --commit <sha> --limit 1 --json ... and passes a completed run through', () => {
  const dir = tmpdir('ci-query')
  gitRepo(dir)
  const argsFile = path.join(dir, 'gh-argv.txt')
  const ghDir = fakeGhDir(
    'echo "$@" > "' + argsFile + '"\n' +
    'echo \'[{"status":"completed","conclusion":"failure","headSha":"deadbeef1234","' +
    'url":"u","updatedAt":"t"}]\''
  )
  const r = runNode(SCRIPT, ['--commit', 'deadbeef1234', '--root', dir],
    { env: { PATH: ghDir + path.delimiter + process.env.PATH } })
  assert.strictEqual(r.status, 0, '--commit mode answering with a completed run must exit 0: ' + r.stderr)
  const argv = fs.readFileSync(argsFile, 'utf8').trim()
  assert.strictEqual(argv, 'run list --commit deadbeef1234 --limit 1 --json status,conclusion,headSha,url,updatedAt',
    'D1 requires --commit mode to pass `--commit <sha>` to `gh run list` in place of `--branch <name>`, with every ' +
    'other flag byte-identical to --branch mode — a wrong invocation means the script is asking gh the wrong ' +
    'question about the wrong commit: ' + JSON.stringify(argv))
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out,
    { available: true, transient: false, status: 'completed', conclusion: 'failure', sha: 'deadbeef1234', url: 'u', runAt: 't' },
    '--commit mode\'s output JSON shape must be byte-identical to --branch mode\'s normalization (D1): ' + r.stdout)
})

test('AC-20260810-07-2: --commit <sha> with fake gh printing [] prints {available:false,transient:false} and exits 0 (the unpushed/never-seen-commit case)', () => {
  const ghDir = fakeGhDir("echo '[]'")
  const dir = tmpdir('ci-query')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--commit', 'deadbeef1234', '--root', dir],
    { env: { PATH: ghDir + path.delimiter + process.env.PATH } })
  assert.strictEqual(r.status, 0,
    'an empty run list for a commit CI never saw is a structural fact, not a usage error — exit 0 (D1, spiked ' +
    'against real gh 2.93.0): ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out, { available: false, transient: false },
    'this is the Prax incident\'s exact shape (unpushed HEAD, CI never saw the commit) — it must normalize to ' +
    'available:false, transient:false so the review ci leg treats it as informational, never a hard-stop: ' + r.stdout)
})

test('AC-20260810-07-3: passing both --branch and --commit prints the exclusive-mode usage line to stderr and exits 2', () => {
  const dir = tmpdir('ci-query')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--branch', 'main', '--commit', 'deadbeef1234', '--root', dir])
  assert.strictEqual(r.status, 2,
    'D1 requires exactly one of --branch/--commit — passing both is a usage error and must exit 2, never ' +
    'silently pick one of the two conflicting keys: ' + r.stdout + ' / ' + r.stderr)
  assert.match(r.stderr, usageLineRe,
    'stderr must print the two-alternative usage line from the spec Contracts section, naming both --branch ' +
    'and --commit as the exclusive modes — the pre-change usage text only mentions --branch and would not ' +
    'tell a caller --commit even exists: ' + r.stderr)
})

test('AC-20260810-07-3: passing neither --branch nor --commit prints the exclusive-mode usage line to stderr and exits 2', () => {
  const dir = tmpdir('ci-query')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 2,
    'D1 requires exactly one of --branch/--commit — passing neither is a usage error and must exit 2: ' +
    r.stdout + ' / ' + r.stderr)
  assert.match(r.stderr, usageLineRe,
    'stderr must print the two-alternative usage line from the spec Contracts section, naming both --branch ' +
    'and --commit as the exclusive modes: ' + r.stderr)
})
