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
// specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md D1, AC-20260914-02-1 (rewrites
// AC-20260912-15-7 in place): the contract's `design` block collapses to the single `app`
// sub-key and § Render gate is deleted whole; AC-20260914-02-2 reuses AC-20260912-15-8's
// contractHash-restamp pin unchanged.

const CONTRACT_REL = 'spec/templates/grounding-contract.md'
const DOCTOR_REL = 'spec/commands/doctor.md'
const COVERAGE_SCOPE_REL = 'spec/scripts/coverage-scope.js'

test('AC-20260914-02-1: WHEN spec/templates/grounding-contract.md is read THE SYSTEM SHALL describe "design" with the single sub-key "app" and contain none of storyFormat, rulesManifest, atlasRoutes, copyCatalogs, "## Render gate"', () => {
  assert.ok(fs.existsSync(path.join(ROOT, CONTRACT_REL)), CONTRACT_REL + ' must exist for this pin to mean anything')
  const text = read(CONTRACT_REL)

  assert.match(text, /`design`\s*\n?\(`\{ "app": "<dir/,
    'D1: the required-config-keys paragraph must describe `design` as `{ "app": "<dir...>" }` and ' +
    'nothing else — a session reading this contract needs to know the design block is now a ' +
    'single directory pointer, not the old tool/command/storyFormat/render bundle: ' + text.slice(0, 1200))
  for (const retired of ['storyFormat', 'rulesManifest', 'atlasRoutes', 'copyCatalogs']) {
    assert.doesNotMatch(text, new RegExp(retired),
      'D1: the retired design sub-key "' + retired + '" must not appear anywhere in the contract — ' +
      'its survival here would keep telling /spec:init to generate a key the driver and stage ' +
      'doctrine no longer read, and would keep it in every host\'s grounding forever')
  }
  assert.doesNotMatch(text, /^## Render gate$/m,
    'D1: the "## Render gate" section must be deleted whole — it documented a second-artifact ' +
    'fidelity check (design.render/capture/url/ready/boot) that has no home once the design ' +
    'block carries only "app"')
})

test('AC-20260912-15-7: WHEN spec/commands/doctor.md check 20 and spec/scripts/coverage-scope.js are read THE SYSTEM contains neither of them carrying the literal "deadlocks every close"', () => {
  assert.ok(fs.existsSync(path.join(ROOT, DOCTOR_REL)), DOCTOR_REL + ' must exist for this pin to mean anything')
  assert.ok(fs.existsSync(path.join(ROOT, COVERAGE_SCOPE_REL)), COVERAGE_SCOPE_REL + ' must exist for this pin to mean anything')

  const doctorText = read(DOCTOR_REL)
  const coverageScopeText = read(COVERAGE_SCOPE_REL)

  assert.doesNotMatch(doctorText, /deadlocks every close/,
    'D9: check 20 (b)\'s rationale must drop "deadlocks every close" and name the real hazard instead — after a ' +
    'sweep, a host check demanding a carrier for every AC of a done spec goes red and stays red')
  assert.doesNotMatch(coverageScopeText, /deadlocks every close/,
    'D9: coverage-scope.js\'s WHY header carries the same now-false sentence and must be rebased with the ' +
    'contract — its derivation and output stay untouched, only the comment')
})

test('AC-20260912-15-8: WHEN this repo\'s .claude/spec.config.json is read THE SYSTEM carries a contractHash equal to the first 12 characters of the SHA-256 of spec/templates/grounding-contract.md as spec-paths contract-hash prints it, and the value is not the pre-edit stale stamp', () => {
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
