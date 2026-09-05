'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runBash, gitRepo } = require('./helpers')

const SCRIPT = 'scripts/worktree-include.sh'

// specs/20260904/02-worktree-include-shared-owner.md D1/D2: the sole owner of "copy the
// manifest's gitignored matches into a worktree" — AC-20260904-02-1..5 pin its selection rule,
// its quiet-on-nothing contract, its usage/precondition exit alphabet, the .claude/worktrees/
// exclusion, and the copy-failure warning.

test('AC-20260904-02-1: worktree-include.sh copies every .worktreeinclude-matched gitignored file into an empty --dest, prints nothing on stdout, and prints exactly one stderr line naming the count', () => {
  const root = fs.realpathSync(tmpdir('wi-1'))
  const g = gitRepo(root)
  fs.appendFileSync(path.join(root, '.gitignore'), '.env\nconfig/local.json\nsecret.txt\n')
  fs.writeFileSync(path.join(root, '.worktreeinclude'), '.env\nconfig/local.json\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest')
  fs.writeFileSync(path.join(root, '.env'), 'KEY=1\n')
  fs.mkdirSync(path.join(root, 'config'))
  fs.writeFileSync(path.join(root, 'config', 'local.json'), '{}\n')
  fs.writeFileSync(path.join(root, 'secret.txt'), 's\n')

  const dest = fs.realpathSync(tmpdir('wi-1-dest'))
  const r = runBash(SCRIPT, ['--root', root, '--dest', dest])
  assert.strictEqual(r.status, 0,
    'D1: a manifest-matched, gitignored, untracked file set must copy cleanly and exit 0: ' + r.stderr)
  assert.strictEqual(r.stdout, '',
    'D2: the owner writes nothing on stdout, ever — a stray line here would corrupt replay.js\'s --setup, ' +
    'which forwards this script\'s stdout verbatim: ' + JSON.stringify(r.stdout))
  assert.match(r.stderr, /^worktree-include: copied 2 \.worktreeinclude-matched file\(s\) into /,
    'D2: the exactly-one stderr line must name the count and the dest, preserving the phrase merge-back\'s ' +
    'own retagged test still greps for: ' + JSON.stringify(r.stderr))
  assert.strictEqual(fs.readFileSync(path.join(dest, '.env'), 'utf8'), 'KEY=1\n',
    'AC-1: .env must land in --dest with its exact content — a wrong copy here boots the host env-less')
  assert.strictEqual(fs.readFileSync(path.join(dest, 'config', 'local.json'), 'utf8'), '{}\n',
    'AC-1: a nested manifest match must preserve its relative path under --dest')
  assert.ok(!fs.existsSync(path.join(dest, 'secret.txt')),
    'AC-1: a gitignored file NOT named in the manifest must never be copied — the manifest is the selection ' +
    'boundary, not "everything ignored"')
})

test('AC-20260904-02-2: worktree-include.sh copies nothing and prints nothing on stdout or stderr when there is no manifest, or the manifest matches only tracked/absent files', () => {
  const noManifestRoot = fs.realpathSync(tmpdir('wi-2-none'))
  gitRepo(noManifestRoot)
  const dest1 = fs.realpathSync(tmpdir('wi-2-none-dest'))
  const r1 = runBash(SCRIPT, ['--root', noManifestRoot, '--dest', dest1])
  assert.strictEqual(r1.status, 0, 'AC-2: a repo with no .worktreeinclude at all must still exit 0: ' + r1.stderr)
  assert.strictEqual(fs.readdirSync(dest1).length, 0, 'AC-2: --dest must stay empty when there is no manifest')
  assert.strictEqual(r1.stdout, '', 'AC-2: no manifest means no output on stdout: ' + JSON.stringify(r1.stdout))
  assert.strictEqual(r1.stderr, '', 'AC-2: no manifest means no output on stderr either — quiet on nothing ' +
    'qualifying is D2\'s explicit contract: ' + JSON.stringify(r1.stderr))

  const nothingRoot = fs.realpathSync(tmpdir('wi-2-nothing'))
  const g = gitRepo(nothingRoot)
  fs.writeFileSync(path.join(nothingRoot, '.worktreeinclude'), 'a.txt\n.env\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest matching tracked + absent only')
  const dest2 = fs.realpathSync(tmpdir('wi-2-nothing-dest'))
  const r2 = runBash(SCRIPT, ['--root', nothingRoot, '--dest', dest2])
  assert.strictEqual(r2.status, 0,
    'AC-2: a manifest whose entries are all tracked or absent-on-disk must still exit 0: ' + r2.stderr)
  assert.strictEqual(fs.readdirSync(dest2).length, 0,
    'AC-2: a.txt is tracked (checkout\'s job, not the owner\'s) and .env does not exist on disk — nothing ' +
    'qualifies to copy')
  assert.strictEqual(r2.stdout, '', 'AC-2: nothing qualifying means no stdout: ' + JSON.stringify(r2.stdout))
  assert.strictEqual(r2.stderr, '', 'AC-2: nothing qualifying means no stderr: ' + JSON.stringify(r2.stderr))
})

test('AC-20260904-02-3: worktree-include.sh exits 2 naming the missing flag or failed precondition when --dest is omitted, --root is not a git repo, or --dest does not exist', () => {
  const root = fs.realpathSync(tmpdir('wi-3-root'))
  gitRepo(root)

  const rNoDest = runBash(SCRIPT, ['--root', root])
  assert.strictEqual(rNoDest.status, 2,
    'AC-3: --root alone with no --dest must exit 2 (usage/precondition), never hang or crash uninformatively: ' +
    rNoDest.stderr)
  assert.match(rNoDest.stderr, /--dest/,
    'AC-3: the usage error must name the missing --dest flag specifically: ' + JSON.stringify(rNoDest.stderr))

  const notARepo = fs.realpathSync(tmpdir('wi-3-notrepo'))
  const dest = fs.realpathSync(tmpdir('wi-3-notrepo-dest'))
  const rNotRepo = runBash(SCRIPT, ['--root', notARepo, '--dest', dest])
  assert.strictEqual(rNotRepo.status, 2,
    'AC-3: a --root that is not a git repo must exit 2, not attempt any git operation and crash instead: ' +
    rNotRepo.stderr)
  assert.match(rNotRepo.stderr, /--root|git repo/,
    'AC-3: the usage error must name the failed --root precondition: ' + JSON.stringify(rNotRepo.stderr))

  const missingDest = path.join(fs.realpathSync(tmpdir('wi-3-missingdest')), 'does-not-exist')
  const rMissingDest = runBash(SCRIPT, ['--root', root, '--dest', missingDest])
  assert.strictEqual(rMissingDest.status, 2,
    'AC-3: a --dest path that does not exist must exit 2 rather than mkdir it silently or crash: ' +
    rMissingDest.stderr)
  assert.match(rMissingDest.stderr, /--dest/,
    'AC-3: the usage error must name the failed --dest precondition: ' + JSON.stringify(rMissingDest.stderr))
})

test('AC-20260904-02-4: worktree-include.sh copies a manifest-matched file but never any path under .claude/worktrees/, even when the manifest itself lists that directory', () => {
  const root = fs.realpathSync(tmpdir('wi-4'))
  const g = gitRepo(root)
  fs.appendFileSync(path.join(root, '.gitignore'), 'x.txt\n')
  fs.writeFileSync(path.join(root, '.worktreeinclude'), 'x.txt\n.claude/worktrees/\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest with worktrees entry')
  fs.writeFileSync(path.join(root, 'x.txt'), 'x\n')
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'stale'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'stale', 'x.txt'), 'stale\n')

  const dest = fs.realpathSync(tmpdir('wi-4-dest'))
  const r = runBash(SCRIPT, ['--root', root, '--dest', dest])
  assert.strictEqual(r.status, 0, 'AC-4: a manifest matching one real file plus the worktrees exclusion must still exit 0: ' + r.stderr)
  assert.match(r.stderr, /^worktree-include: copied 1 \.worktreeinclude-matched file\(s\) into /,
    'D1: only x.txt qualifies — a copied count of 2 here would mean the .claude/worktrees/ exclusion leaked ' +
    'a stale sibling worktree\'s file into a fresh one: ' + JSON.stringify(r.stderr))
  assert.strictEqual(fs.readFileSync(path.join(dest, 'x.txt'), 'utf8'), 'x\n',
    'AC-4: the real top-level match must still be copied')
  assert.ok(!fs.existsSync(path.join(dest, '.claude')),
    'D1: nothing under .claude/worktrees/ may ever be copied, even when the manifest itself names that ' +
    'directory — copying a sibling worktree\'s tree into a fresh one would corrupt it')
})

test('AC-20260904-02-5: worktree-include.sh exits 3 and prints the WARNING line when --dest cannot be written to', () => {
  const root = fs.realpathSync(tmpdir('wi-5'))
  const g = gitRepo(root)
  fs.appendFileSync(path.join(root, '.gitignore'), '.env\n')
  fs.writeFileSync(path.join(root, '.worktreeinclude'), '.env\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest')
  fs.writeFileSync(path.join(root, '.env'), 'KEY=1\n')

  const dest = fs.realpathSync(tmpdir('wi-5-dest'))
  // Read-only via chmod 0555 denies writes for the running (non-root) user — this test would pass
  // vacuously under a root-run CI, which this repo does not have (spec Rationale, "Fragile to
  // watch at build").
  fs.chmodSync(dest, 0o555)
  try {
    const r = runBash(SCRIPT, ['--root', root, '--dest', dest])
    assert.strictEqual(r.status, 3,
      'AC-5: a copy that cannot write into --dest must exit 3, distinct from the exit-2 usage/precondition ' +
      'class — 3 means enumeration succeeded but the copy itself failed: ' + JSON.stringify({ status: r.status, stderr: r.stderr }))
    // One newline-terminated line: the caller (merge-back.sh create) prints its own stderr line right
    // after, so a missing terminator would glue the two together.
    assert.strictEqual(r.stderr.trimEnd().split('\n').length, 1,
      'AC-5: the WARNING is exactly one stderr line: ' + JSON.stringify(r.stderr))
    assert.match(r.stderr, /^worktree-include: WARNING — \.worktreeinclude copy failed; .* may be missing env\/config files\n$/,
      'D1/AC-5: the failure must print the exact WARNING line naming the consequence (env/config files may ' +
      'be missing) — a generic tar error here leaves a caller with no idea the worktree just booted degraded: ' +
      JSON.stringify(r.stderr))
  } finally {
    fs.chmodSync(dest, 0o755)
  }
})
