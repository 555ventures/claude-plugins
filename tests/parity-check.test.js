'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, read, tmpdir, runNode } = require('./helpers')

// PRAX-20260717-01 follow-through: the incident's mechanical half. The same seam identifier
// shipped as `runId` in both contract planes while ADR-0012's own Logging row demanded
// `run_id` "across pg-boss payloads and Modal callbacks"; three id spellings (st_1, r_01,
// run_01) landed in byte-locked artifacts; a `+00:00` timestamp survived to review in a
// UTC-`Z` codebase. All of it is string-level detectable — no judgment, no model. The lint
// treats the files it is given as ONE representational plane (per-surface casing across
// planes is legitimate; contradiction within a plane is not), so callers invoke it once per
// plane. Fail-closed at genesis exit: incident-earned, deterministic, cheap.

const SCRIPT = 'scripts/parity-check.js'

test('parity-check script exists', () => {
  assert.ok(fs.existsSync(path.join(SPEC, SCRIPT)),
    'no spec/scripts/parity-check.js: cross-artifact contradictions stay human-caught')
})

test('catches divergent spellings of one identifier within a plane', () => {
  const dir = tmpdir('parity')
  fs.writeFileSync(path.join(dir, 'contract.ts'), 'export const ev = { runId: z.string() }\n')
  fs.writeFileSync(path.join(dir, 'adr.md'), 'Logging row: bind `run_id` across payloads.\n')
  const r = runNode(SCRIPT, [path.join(dir, 'contract.ts'), path.join(dir, 'adr.md')])
  assert.strictEqual(r.status, 1, 'seeded runId/run_id contradiction must exit 1')
  assert.match(r.stdout + r.stderr, /run_?id/i, 'finding must name the identifier')
  assert.match(r.stdout + r.stderr, /contract\.ts/, 'finding must cite both files')
  assert.match(r.stdout + r.stderr, /adr\.md/, 'finding must cite both files')
})

test('catches mixed wire timestamp forms (Z vs +00:00)', () => {
  const dir = tmpdir('parity')
  fs.writeFileSync(path.join(dir, 'a.md'), 'emitted `2026-07-17T09:00:00Z`\n')
  fs.writeFileSync(path.join(dir, 'b.md'), 'callback at `2026-07-17T09:00:00+00:00`\n')
  const r = runNode(SCRIPT, [path.join(dir, 'a.md'), path.join(dir, 'b.md')])
  assert.strictEqual(r.status, 1, 'mixed Z and +00:00 forms in one plane must exit 1')
  assert.match(r.stdout + r.stderr, /timestamp/i)
})

test('clean plane exits 0 and legitimate cross-file consistency passes', () => {
  const dir = tmpdir('parity')
  fs.writeFileSync(path.join(dir, 'contract.ts'), 'export const ev = { runId: z.string() }\n')
  fs.writeFileSync(path.join(dir, 'mirror.py'), 'class RunEvent:\n    runId: str\n')
  fs.writeFileSync(path.join(dir, 'adr.md'), 'The seam field is `runId`; emitted `2026-07-17T09:00:00Z`.\n')
  const r = runNode(SCRIPT, [path.join(dir, 'contract.ts'), path.join(dir, 'mirror.py'), path.join(dir, 'adr.md')])
  assert.strictEqual(r.status, 0, `clean plane must pass, got: ${r.stdout} ${r.stderr}`)
})

test('genesis-architect wires the lint at ops-conventions exit, fail-closed', () => {
  const architect = read('spec/commands/genesis-architect.md')
  assert.match(architect, /parity-check/,
    'genesis must run the lint over the seam-plane artifacts before Phase A closes')
})

test('the lint is registered in the scaffold ledger', () => {
  const ledger = read('spec/doctrine/scaffold-ledger.md')
  const row = ledger.split('\n').find(l => l.includes('parity-check')) || ''
  assert.ok(row, 'no ledger row for the parity lint')
  assert.match(row, /gate/, 'incident-earned + deterministic + cheap = ships as gate')
  assert.match(row, /PRAX-20260717-01/, 'justification cites the earning incident')
  assert.match(row, /retire|RETIRE/i, 'row must name its retire condition')
})
