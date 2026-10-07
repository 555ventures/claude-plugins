'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D10 (a prototype row is a known
// stage) and specs/20261007/01-approve-writes-a-behaviour-contract.md D8 (a prototype row names a
// contract, never a spec: `prototype` is in STAGES and not in SPEC_STAGES).

function makeRepo(root, name, rows) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  // fleet-reader.js's discoverRepos() gates purely on config presence (lib/host-config.js's
  // configExists) — the file's content is never read for this test's purposes.
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}\n')
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return dir
}

function driftFor(reposRoot, repoName) {
  const r = runNode('scripts/fleet-reader.js', ['--repos-root', reposRoot, '--json'])
  assert.strictEqual(r.status, 0, 'fleet-reader.js --json must exit 0 on a well-formed fixture: ' + r.stderr)
  const parsed = JSON.parse(r.stdout)
  const repo = parsed.driftCensus.byRepo.find((x) => x.name === repoName)
  assert.ok(repo, 'the fixture repo must appear in the drift census byRepo list: ' + JSON.stringify(parsed.driftCensus))
  return repo
}

test('AC-20260928-01-11: a prototype-stage row carrying spec is not classified stage-unknown or missing-spec', () => {
  const root = tmpdir('fleet-proto')
  makeRepo(root, 'proto-repo', [
    { ts: '2026-09-28T09:00:00.000Z', stage: 'prototype', spec: 'specs/20260928/09-x.md', brief: '28', rounds: 2 },
  ])
  const repo = driftFor(root, 'proto-repo')
  assert.strictEqual(repo.drift['stage-unknown'] || 0, 0,
    'a prototype-stage row must be a known stage once D10 lands — a still-nonzero stage-unknown count means "prototype" never joined STAGES: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.drift['missing-spec'] || 0, 0,
    'a prototype row that DOES carry spec must never be counted under missing-spec: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.inShape, 1,
    'a well-formed prototype row (ts, stage, spec all present and valid) must classify fully in-shape: ' + JSON.stringify(repo))
})

test('AC-20261007-01-9: a prototype-stage contract row naming no spec is listed under neither stage-unknown nor missing-spec', () => {
  const root = tmpdir('fleet-proto')
  makeRepo(root, 'proto-repo-2', [
    { ts: '2026-10-07T09:05:00.000Z', stage: 'prototype', stem: 'x', brief: 'n/a', contract: 'design/prototypes/x/contract.json', verdict: 'contracted' },
  ])
  const repo = driftFor(root, 'proto-repo-2')
  assert.strictEqual(repo.drift['missing-spec'] || 0, 0,
    'a prototype row names its contract, not a spec — a nonzero missing-spec count means every approved prototype is reported as drift in the fleet census because prototype is still a SPEC_STAGE: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.drift['stage-unknown'] || 0, 0,
    'prototype is a known stage — it must never count as stage-unknown: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.inShape, 1,
    'a well-formed contract row (ts, stage, verdict) must classify fully in-shape: ' + JSON.stringify(repo))
})
