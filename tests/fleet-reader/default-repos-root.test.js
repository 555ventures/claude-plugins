'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260820/05-fleet-evidence-reader.md: the fleet is re-derived every run, never stored —
// which the repos-root default broke by naming one hardcoded directory. On a host that spells its
// checkout directory differently, discovery finds nothing and every fleet query answers zero at
// exit 0, since zero repos scanned is a legitimate derived answer. The default is now the parent
// of the invoking repository's top level, so a bare run reads the checkouts beside the one it was
// started from; the homedir fallback survives only for a run started outside any repository.

const SCRIPT = 'scripts/fleet-reader.js'

// A discoverable fleet member: a git checkout carrying the host config discovery gates on.
function mkRepo(root, name) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  gitRepo(dir)
  return dir
}

test('a bare run inside a checkout scans the checkouts beside it — the repos-root default is derived from the invoking repository, never a hardcoded directory name', () => {
  const fleet = tmpdir('fleet-default-root')
  const here = mkRepo(fleet, 'invoking-repo')
  mkRepo(fleet, 'sibling-repo')

  const r = runNode(SCRIPT, ['--json'], { cwd: here })
  assert.strictEqual(r.status, 0, 'a bare run inside a repository must derive its fleet, not fail: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.population.reposRoot, fs.realpathSync(fleet),
    'the default repos-root must be the invoking repository\'s parent — if it is a homedir path ' +
    'instead, every fleet query on this host answers from a directory that holds none of its ' +
    'checkouts, and reports zero at exit 0: ' + r.stdout)
  assert.deepStrictEqual(out.population.repos.map((x) => x.name).sort(), ['invoking-repo', 'sibling-repo'],
    'both checkouts beside the invoking repository must be discovered — a short list here means ' +
    'the derived root landed one level off: ' + r.stdout)
})

test('an explicit --repos-root still wins over the derived default', () => {
  const fleet = tmpdir('fleet-default-root')
  const here = mkRepo(fleet, 'invoking-repo')
  const elsewhere = tmpdir('fleet-explicit-root')
  mkRepo(elsewhere, 'other-repo')

  const r = runNode(SCRIPT, ['--repos-root', elsewhere, '--json'], { cwd: here })
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.population.repos.map((x) => x.name), ['other-repo'],
    'the flag is the explicit override — if the derived default still wins, a caller can no longer ' +
    'point the reader at another machine\'s copied checkouts: ' + r.stdout)
})
