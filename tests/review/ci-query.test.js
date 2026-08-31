'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
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
//
// specs/20260830/03-ci-leg-honest-absence.md D1/D2/D3 (2026-08-30, salon-os host-escape report):
// an unpushed HEAD's empty --commit run list was indistinguishable from "no CI at all" —
// origin's branch could be red for days while the leg read green. `--commit` mode now runs
// `git branch -r --contains <sha>` (cwd --root) when the run list is empty; if that prints
// NOTHING (the sha isn't on any remote ref) it re-queries `--branch <current branch>` in-process
// and, finding a real run, emits the `shaUnseen` shape carrying that branch's own conclusion
// (AC-20260830-03-1). Every other empty-list path — the sha genuinely IS on a remote ref
// (AC-20260830-03-3), or the branch fallback itself can't answer (AC-20260830-03-5) — keeps
// today's exact `{available:false,transient:false}` output. `fakeGhBranchingDir` below extends
// `fakeGhDir` to answer differently per Assumption A5's `--commit`-vs-`--branch` argv split, so a
// test can prove the fallback ACTUALLY fired (or didn't) rather than merely matching the final
// JSON, which for several of these cases is byte-identical whether or not the fallback ran at all.

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

// A5: the shim must branch on its own argv (--commit vs --branch) — two canned responses in one
// binary, since D1's fallback invokes `gh` a second time, in-process, with the SAME PATH entry.
// logFile (optional) records every invocation's argv so a test can prove the fallback fired (or
// didn't) rather than trusting the final JSON alone, which several of D2/D3's paths reproduce
// byte-identically whether or not the new decision tree ever ran.
function fakeGhBranchingDir(commitBody, branchBody, logFile) {
  const dir = tmpdir('fake-gh-branching')
  const bin = path.join(dir, 'gh')
  const logLine = logFile ? 'echo "$@" >> ' + JSON.stringify(logFile) + '\n' : ''
  fs.writeFileSync(bin, '#!/usr/bin/env bash\n' + logLine +
    'if [[ "$*" == *"--commit"* ]]; then\n' + commitBody + '\n' +
    'elif [[ "$*" == *"--branch"* ]]; then\n' + branchBody + '\n' +
    'fi\n')
  fs.chmodSync(bin, 0o755)
  return dir
}

// AC-20260830-03-3's contained-sha case: a REAL local bare "remote" so `git branch -r --contains`
// has genuine remote-tracking refs to answer from (a fetch/push against a filesystem path needs
// no network) — the sha this returns IS on origin/main, so the D1 fallback must never fire for it.
function makeContainedShaHost() {
  const bareDir = tmpdir('ci-query-bare')
  execFileSync('git', ['init', '--bare', '-q', '-b', 'main', bareDir], { encoding: 'utf8' })
  const dir = tmpdir('ci-query-contained')
  const g = gitRepo(dir)
  g('remote', 'add', 'origin', bareDir)
  g('push', '-q', 'origin', 'main')
  const headSha = g('rev-parse', 'HEAD').trim()
  return { dir, headSha }
}

test('AC-20260805-02-10 / AC-20260810-07-4 / AC-20260830-03-3 (SHALL CONTINUE TO): gh absent from PATH prints available:false, transient:false in --branch mode (unchanged by the --commit addition or by the shaUnseen fallback)', () => {
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

test('AC-20260810-07-2 / AC-20260830-03-3 (SHALL CONTINUE TO): --commit <sha> with fake gh printing [] prints {available:false,transient:false} and exits 0 (the unpushed/never-seen-commit case, sha unresolvable so the containment probe itself errors into D3 degradation)', () => {
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

test('AC-20260830-03-1: an unpushed commit whose current branch has a real red origin run prints the shaUnseen shape carrying that branch and run, exit 0', () => {
  const dir = tmpdir('ci-query-sha-unseen')
  const g = gitRepo(dir) // no remote at all — HEAD is by construction absent from every origin/* ref
  const headSha = g('rev-parse', 'HEAD').trim()
  const logFile = path.join(dir, 'gh-invocations.log')
  const ghDir = fakeGhBranchingDir(
    "echo '[]'",
    "echo '[{\"status\":\"completed\",\"conclusion\":\"failure\",\"headSha\":\"abc\",\"url\":\"u\",\"updatedAt\":\"t\"}]'",
    logFile)
  const r = runNode(SCRIPT, ['--commit', headSha, '--root', dir],
    { env: { ...process.env, PATH: ghDir + path.delimiter + process.env.PATH } })
  assert.strictEqual(r.status, 0,
    'D1: a commit CI never saw but whose branch has a real (if red) origin run must still answer, never a ' +
    'usage error or crash: ' + r.stderr)
  const lines = r.stdout.split('\n').filter(l => l.trim())
  let out
  assert.doesNotThrow(() => { out = JSON.parse(lines[lines.length - 1]) },
    'the shaUnseen fallback must still print one parseable JSON line as its last line of stdout: ' + r.stdout)
  assert.deepStrictEqual(out,
    { available: false, transient: false, shaUnseen: true, branch: 'main',
      branchRun: { status: 'completed', conclusion: 'failure', url: 'u', runAt: 't' } },
    'D1/Contracts: an unpushed commit whose current branch DOES have a real origin run must emit the ' +
    'shaUnseen shape naming that branch and transcribing its run — anything else silently relabels the ' +
    'salon-os incident\'s exact condition (origin red for days, local HEAD unpushed) back down to ' +
    '"no CI at all": ' + r.stdout)
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
  assert.match(log, /--branch main/,
    'D1: the shaUnseen shape must be reached by the fallback actually invoking `gh run list --branch main` ' +
    'after the commit query came back empty and the containment probe found nothing — a shim log with no ' +
    '--branch invocation means this JSON was produced by the pre-spec commit-only code path, which cannot ' +
    'possibly know about a branch run at all: ' + log)
})

test('AC-20260830-03-3: a commit already contained in a remote ref keeps today\'s plain unavailable shape and never invokes the branch fallback, even with an empty run list', () => {
  const { dir, headSha } = makeContainedShaHost()
  const logFile = path.join(dir, 'gh-invocations.log')
  const ghDir = fakeGhBranchingDir(
    "echo '[]'",
    // A trap: if the fallback wrongly fired despite containment, this would manufacture a
    // shaUnseen row the AC forbids for this case.
    "echo '[{\"status\":\"completed\",\"conclusion\":\"failure\",\"headSha\":\"trap\",\"url\":\"trap\",\"updatedAt\":\"trap\"}]'",
    logFile)
  const r = runNode(SCRIPT, ['--commit', headSha, '--root', dir],
    { env: { ...process.env, PATH: ghDir + path.delimiter + process.env.PATH } })
  assert.strictEqual(r.status, 0,
    'a sha genuinely on a remote ref with no recorded runs is a structural fact, not a usage error: ' + r.stderr)
  const out = JSON.parse(r.stdout.trim().split('\n').pop())
  assert.deepStrictEqual(out, { available: false, transient: false },
    'D2: a commit already contained in a remote ref (genuinely no CI ran for it) must keep today\'s exact ' +
    'plain shape — this is the "real absence" case D1\'s fallback must never relabel as shaUnseen: ' + r.stdout)
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
  assert.ok(!/--branch/.test(log),
    'D1: the branch fallback fires ONLY when the containment probe finds nothing — a sha contained in ' +
    'origin/main already has real branch evidence (an empty run list there IS the genuine "no CI" case), so ' +
    'any --branch invocation here means the fallback ran when D1 says it must not: ' + log)
})

test('AC-20260830-03-5: an unpushed sha whose branch fallback query itself fails degrades to today\'s plain unavailable shape, exit 0', () => {
  const dir = tmpdir('ci-query-fallback-fail')
  const g = gitRepo(dir) // no remote — HEAD is unpushed, so the containment probe finds nothing
  const headSha = g('rev-parse', 'HEAD').trim()
  const logFile = path.join(dir, 'gh-invocations.log')
  const ghDir = fakeGhBranchingDir("echo '[]'", 'exit 1', logFile)
  const r = runNode(SCRIPT, ['--commit', headSha, '--root', dir],
    { env: { ...process.env, PATH: ghDir + path.delimiter + process.env.PATH } })
  assert.strictEqual(r.status, 0,
    'D3: the fallback itself failing must never be a usage error or crash — the best-effort enrichment ' +
    'degrades toward today\'s behavior, it does not hard-stop: ' + r.stderr)
  const out = JSON.parse(r.stdout.trim().split('\n').pop())
  assert.deepStrictEqual(out, { available: false, transient: false },
    'D3: when the branch-query gh invocation itself fails (exits 1, prints nothing), the result must degrade ' +
    'to today\'s exact plain shape — never a crash, never a red leg, and never a fabricated shaUnseen claim ' +
    'built on a probe that never actually answered: ' + r.stdout)
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
  assert.match(log, /--branch main/,
    'D3: the degradation must be reached by actually attempting the --branch fallback and observing it fail ' +
    '— a shim log with no --branch invocation means this assertion would trivially pass against the pre-spec ' +
    'commit-only code path too, proving nothing about the new decision tree: ' + log)
})
