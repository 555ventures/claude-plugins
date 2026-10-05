'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { read, runBash, ROOT } = require('../helpers')

// specs/20260912/15-the-close-stops-deleting-tests.md D8/D9, AC-20260912-15-8: doctor.md check 20
// and coverage-scope.js's WHY header stop telling hosts that an every-AC coverage check deadlocks
// every close, and this repo's own contractHash is re-stamped over the rewritten contract.
// specs/20260926/02-the-design-contract-is-code.md D1 (rewrites the old AC-20260914-02-1 test in
// place as AC-20260926-02-7): the contract's `design` block gains the `kit`/`tokens`/`rules`
// sub-keys (required) and `app` (optional) in the same single contract edit that adds
// `kit-discipline` to the taxonomy; AC-20260926-02-9 reuses the AC-20260912-15-8 contractHash-
// restamp pin below, unchanged, retagged in its title per the reuses-pointer convention — joining
// specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md's own AC-20260914-02-2, which
// already reused that same pin and must keep its citation here or ac-drift-clean.test.js orphans it.

const CONTRACT_REL = 'spec/templates/grounding-contract.md'
const DOCTOR_REL = 'spec/commands/doctor.md'
const COVERAGE_SCOPE_REL = 'spec/scripts/coverage-scope.js'


test('AC-20260912-15-8 (reused by AC-20260926-02-9, AC-20260930-01-6, AC-20261001-01-17): WHEN this repo\'s .claude/spec.config.json is read THE SYSTEM carries a contractHash equal to the first 12 characters of the SHA-256 of spec/templates/grounding-contract.md as spec-paths contract-hash prints it, and the value is not the pre-edit stale stamp', () => {
  const cfgPath = path.join(ROOT, '.claude/spec.config.json')
  assert.ok(fs.existsSync(cfgPath), '.claude/spec.config.json must exist for this pin to mean anything')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))

  const contractText = fs.readFileSync(path.join(ROOT, CONTRACT_REL))
  const expected = crypto.createHash('sha256').update(contractText).digest('hex').slice(0, 12)

  const r = runBash('bin/spec-paths', ['contract-hash'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'spec-paths contract-hash must succeed against this repo: ' + r.stdout + r.stderr)
  const fromScript = r.stdout.trim()
  assert.strictEqual(fromScript, expected,
    'sanity: spec-paths contract-hash must itself agree with a plain SHA-256 of the contract file, or this pin ' +
    'is checking the wrong thing: ' + JSON.stringify({ fromScript, expected }))

  assert.notStrictEqual(cfg.contractHash, '2dfb46dfcd7a',
    'D8: the pre-edit stale stamp must not survive the contract rewrite — a still-stale hash here means the ' +
    'contract was rewritten (or the re-stamp forgotten) without re-running node "$(spec-paths contract-hash)"')
  assert.strictEqual(cfg.contractHash, expected,
    'D8: .claude/spec.config.json\'s contractHash must equal the first 12 characters of the SHA-256 of the ' +
    'CURRENT spec/templates/grounding-contract.md — a mismatch here is exactly what /spec:doctor check 2 flags ' +
    'as a stale-stamp lead: ' + JSON.stringify({ configured: cfg.contractHash, expected }))
})
