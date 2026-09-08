'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('./helpers')

// specs/20260822/02-init-generation-script.md D9 (A9): scope-reconcile.js gains an additive,
// read-only `--probe-at-risk <file> --root <dir> [--test-globs <csv>]` mode for init-gen.js's
// at-risk-applicability probe — `<file>` is a newline-separated list of repo-relative source
// paths (init-gen samples up to 20 tracked non-test files), and the mode REUSES the existing
// stemsFor derivation and test-file content scan in place (the sole-derivation rule: a second
// stem implementation anywhere is a hard violation). This test pins AC-11. The motivating
// incident is the at-risk escape this same derivation was built to close (specs/20260815/02)
// — D9's point is that a Python-shaped (dotted-import) host is silently indistinguishable
// from "clean" unless the probe surfaces refs:0 at init time.
//
// specs/20260907/03-ignored-paths-and-unobserved-count.md D3 (AC-20260907-03-4): --probe-at-risk
// reuses walkTestFiles's new git-ignore prune through the same call, no probe-specific branch —
// this test fails on current code, which has no prune at all yet. D2 (AC-20260907-03-3) pins the
// prune's safety guard (no repository -> empty ignored set, byte-identical to today) — this is a
// CONTINUE-TO pin, already green pre-image because no prune exists to misfire.

const SCRIPT = 'scripts/scope-reconcile.js'

function writeSampleFile(dir, lines) {
  const p = path.join(dir, 'sample.txt')
  fs.writeFileSync(p, lines.join('\n') + '\n')
  return p
}

test('AC-20260822-02-11: a sampled source file whose path stem appears in a test file\'s content is reported with refs >= 1', () => {
  const dir = tmpdir('scope-reconcile-probe')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/util.test.js'), "require('../src/lib/util.js')\n")
  const sampleFile = writeSampleFile(dir, ['src/lib/util.js'])

  const r = runNode(SCRIPT, ['--probe-at-risk', sampleFile, '--root', dir])
  assert.strictEqual(r.status, 0, 'a probe-at-risk run over a well-formed sample list must exit 0 — findings are data, never a failure: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.sampled, 1, 'sampled must count the lines of the --probe-at-risk input file, or init-gen\'s reported sample size is wrong: ' + r.stdout)
  assert.ok(out.testFiles >= 1, 'testFiles must count the test-classified files found under --root — tests/util.test.js must be counted: ' + r.stdout)
  assert.ok(out.refs >= 1,
    "tests/util.test.js contains the literal stem \"src/lib/util.js\" from the changed sample — refs:0 here would mean the reused stem scan stopped matching a plain relative require, silently telling the interview the at-risk leg is inert when it is not: " + r.stdout)
})

test('AC-20260822-02-11: a sampled source file referenced only via a dotted module import (no path-shaped substring) is reported with refs 0', () => {
  const dir = tmpdir('scope-reconcile-probe')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/services.test.js'), '# from app.services import x\n')
  const sampleFile = writeSampleFile(dir, ['app/services.py'])

  const r = runNode(SCRIPT, ['--probe-at-risk', sampleFile, '--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.sampled, 1, 'sampled must count the one sampled path: ' + r.stdout)
  assert.strictEqual(out.refs, 0,
    'stemsFor("app/services.py") never yields a dotted form ("app.services") — a Python-shaped host\'s test suite references its changed files only by dotted import, so refs must be 0 here, exactly the "silently indistinguishable from clean" case D9 exists to surface to the interview rather than hide: ' + r.stdout)
})

test('AC-20260907-03-3 (SHALL CONTINUE TO): --probe-at-risk with --root pointing at a directory that is not a git repository completes the full unpruned walk, never a crash or a git error', () => {
  const dir = tmpdir('scope-reconcile-probe') // tmpdir() lives under the OS temp root, not inside this repo — no .git anywhere above it
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/thing.test.js'), "require('../src/lib/util.js')\n")
  const sampleFile = writeSampleFile(dir, ['src/lib/util.js'])

  const r = runNode(SCRIPT, ['--probe-at-risk', sampleFile, '--root', dir])
  assert.strictEqual(r.status, 0,
    'D2\'s safety guard must leave the walk exactly as today\'s pre-change unpruned walk when --root is not ' +
    'a git repository — a nonzero exit here means the new git-ignore detection crashed instead of falling ' +
    'back to an empty ignored set: ' + r.stderr)
  assert.strictEqual(r.stderr, '',
    'a non-repository --root must never print a git error on stderr — the failed `git rev-parse --show-prefix` ' +
    'call must be swallowed into an empty ignored set, never surfaced to the caller: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.testFiles, 1,
    'a non-repository --root must report the full unpruned walk (testFiles: 1 for the one tests/thing.test.js ' +
    'on disk) — testFiles: 0 would mean the walk silently emptied itself instead of falling back to the ' +
    'pre-change behaviour: ' + r.stdout)
})

test('AC-20260907-03-4: --probe-at-risk reuses the same git-ignore prune as the main derivation — an identical test file living under a git-ignored directory is not double-counted in testFiles', () => {
  const dir = tmpdir('scope-reconcile-probe')
  const g = gitRepo(dir) // gitRepo's init commit already seeds and commits a root .gitignore containing .claude/worktrees/
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const refBody = "require('../src/lib/util.js')\n"
  fs.writeFileSync(path.join(dir, 'tests/thing.test.js'), refBody)
  fs.mkdirSync(path.join(dir, '.claude/worktrees/wt/tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/worktrees/wt/tests/thing.test.js'), refBody)
  g('add', '-A'); g('commit', '-q', '-m', 'base') // git add -A silently skips the ignored copy — it stays untracked and ignored on disk
  const sampleFile = writeSampleFile(dir, ['src/lib/util.js'])

  const r = runNode(SCRIPT, ['--probe-at-risk', sampleFile, '--root', dir])
  assert.strictEqual(r.status, 0, 'a well-formed probe-at-risk run over a real repository must exit 0: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.testFiles, 1,
    'D3: --probe-at-risk must reuse walkTestFiles\'s prune through the same call, no probe-specific branch — ' +
    'testFiles: 2 here means the ignored .claude/worktrees/wt/tests/thing.test.js copy is still being ' +
    'counted, inflating the sample count init-gen.js shows a new host at interview time: ' + r.stdout)
})
