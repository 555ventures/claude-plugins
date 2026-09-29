'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D10, AC-20260928-01-11 —
// spec/scripts/fleet-reader.js's STAGES/SPEC_STAGES sets do not carry 'prototype' yet, so a
// prototype-stage row is classified stage-unknown (never missing-spec, since the missing-spec
// check only runs when stageOk) on the pre-image. Both halves of the AC are genuinely RED.

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

test('AC-20260928-01-11: a prototype-stage row with no spec is listed under missing-spec', () => {
  const root = tmpdir('fleet-proto')
  makeRepo(root, 'proto-repo-2', [
    { ts: '2026-09-28T09:05:00.000Z', stage: 'prototype', brief: '28', rounds: 0 },
  ])
  const repo = driftFor(root, 'proto-repo-2')
  assert.strictEqual(repo.drift['missing-spec'], 1,
    'a prototype row with no `spec` field must be listed under missing-spec (D10: prototype is one of the SPEC_STAGES that requires it) — a still-zero count means the stage never reached the missing-spec check at all: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.drift['stage-unknown'] || 0, 0,
    'the row\'s stage IS a known one (prototype) — it must never ALSO count as stage-unknown: ' + JSON.stringify(repo.drift))
})
