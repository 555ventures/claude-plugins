'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// git/commands/commit.md step 3 (the fix row a Direct-lane repair earns) and spec/commands/fix.md:
// a `stage:"fix"` row names its commit sha, never a spec — `fix` is in STAGES, not SPEC_STAGES,
// and a fix row without a 40-hex sha is drift the census names.

function makeRepo(root, name, rows) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}\n')
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return dir
}

function driftFor(reposRoot, repoName) {
  const r = runNode('scripts/fleet-reader.js', ['--repos-root', reposRoot, '--json'])
  assert.strictEqual(r.status, 0, 'fleet-reader.js --json must exit 0 on a well-formed fixture: ' + r.stderr)
  const repo = JSON.parse(r.stdout).driftCensus.byRepo.find((x) => x.name === repoName)
  assert.ok(repo, 'the fixture repo must appear in the drift census byRepo list')
  return repo
}

const SHA = 'a'.repeat(40)

test('a fix row written by /git:commit for a Direct-lane repair is a known stage, names no spec, and classifies in-shape', () => {
  const root = tmpdir('fleet-fix-stage')
  makeRepo(root, 'fix-repo', [
    { ts: '2026-10-14T09:00:00.000Z', stage: 'fix', sha: SHA, files: ['src/a.ts', 'src/b.ts'], reviewed: true, via: 'spec-fix' },
  ])
  const repo = driftFor(root, 'fix-repo')
  assert.strictEqual(repo.drift['stage-unknown'] || 0, 0,
    'a fix row counted as stage-unknown means every /spec:fix commit is reported as ledger drift: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.drift['missing-spec'] || 0, 0,
    'a fix row names a commit, not a spec — missing-spec here means fix was added to SPEC_STAGES: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.inShape, 1, 'a well-formed fix row must classify fully in-shape: ' + JSON.stringify(repo))
})

test('a fix row without a 40-hex sha is drift under fix-missing-sha — a later escape on its files could not join it', () => {
  const root = tmpdir('fleet-fix-sha')
  makeRepo(root, 'fix-repo-2', [
    { ts: '2026-10-14T09:00:00.000Z', stage: 'fix', sha: 'abc123', files: ['src/a.ts'], reviewed: false, via: 'commit' },
    { ts: '2026-10-14T09:00:01.000Z', stage: 'fix', files: ['src/a.ts'], reviewed: false, via: 'commit' },
  ])
  const repo = driftFor(root, 'fix-repo-2')
  assert.strictEqual(repo.drift['fix-missing-sha'], 2,
    'a short or absent sha passed the census, so a fix row can point at nothing: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.inShape, 0, 'neither malformed row may count as in-shape: ' + JSON.stringify(repo))
})
