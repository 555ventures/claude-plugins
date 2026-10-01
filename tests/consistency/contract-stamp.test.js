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

test('AC-20260926-02-7: WHEN spec/templates/grounding-contract.md is read THE SYSTEM SHALL describe "design" with the sub-keys "kit", "tokens", "rules" (required) and "app" (optional), and contain none of storyFormat, rulesManifest, atlasRoutes, copyCatalogs, "## Render gate", design.doctrine, design.command, design.screenshot', () => {
  assert.ok(fs.existsSync(path.join(ROOT, CONTRACT_REL)), CONTRACT_REL + ' must exist for this pin to mean anything')
  const text = read(CONTRACT_REL)

  assert.match(text, /`design`[\s\S]{0,400}"kit"[\s\S]{0,400}"tokens"[\s\S]{0,400}"rules"/,
    'D1: the required-config-keys paragraph must describe `design` with the sub-keys "kit", ' +
    '"tokens" and "rules" — a session reading this contract needs to know a host with a UI stack ' +
    'carries its design contract as a token file, a kit directory, and a rule file, not the old ' +
    'single "app" pointer or the render-gate bundle before it: ' + text.slice(0, 1600))
  for (const retired of ['storyFormat', 'rulesManifest', 'atlasRoutes', 'copyCatalogs']) {
    assert.doesNotMatch(text, new RegExp(retired),
      'D1: the retired design sub-key "' + retired + '" must not appear anywhere in the contract — ' +
      'its survival here would keep telling /spec:init to generate a key the driver and stage ' +
      'doctrine no longer read, and would keep it in every host\'s grounding forever')
  }
  assert.doesNotMatch(text, /^## Render gate$/m,
    'D1: the "## Render gate" section must be deleted whole — it documented a second-artifact ' +
    'fidelity check that has no home once the design block carries kit/tokens/rules instead of a ' +
    'render pipeline')
  for (const retiredKey of ['design.doctrine', 'design.command', 'design.screenshot']) {
    assert.ok(!text.includes(retiredKey),
      'D1: the retired key "' + retiredKey + '" must not appear anywhere in the contract — the new ' +
      '`design` block carries only kit/tokens/rules/app, and this key names a tool/command the ' +
      'contract no longer knows')
  }
})

// specs/20260929/01-the-walkthrough-contract-and-the-client.md D1, AC-20260929-01-19: the contract
// gains the optional `walkthrough` block and its own section, in the series' one contract edit.
test('AC-20260929-01-19: WHEN spec/templates/grounding-contract.md is read THE SYSTEM SHALL list "walkthrough" among the optional keys of § Required config keys and carry a "## Walkthrough" section naming baseUrl, project, tokenEnv and that an absent block sends nothing', () => {
  assert.ok(fs.existsSync(path.join(ROOT, CONTRACT_REL)), CONTRACT_REL + ' must exist for this pin to mean anything')
  const text = read(CONTRACT_REL)

  const required = text.split(/^## Required config keys.*$/m)[1]
  assert.ok(required !== undefined, 'the contract must keep its "## Required config keys" section')
  const requiredSection = required.split(/^## /m)[0]
  const optional = requiredSection.split('Optional:')[1] || ''
  assert.match(optional, /`walkthrough`/,
    'D1: `walkthrough` must be named in the optional list of § Required config keys — a host author reading the contract would never learn the block exists')

  const section = text.split(/^## Walkthrough.*$/m)[1]
  assert.ok(section !== undefined, 'D1: the contract must carry a "## Walkthrough" section — the one place the block\'s keys are defined')
  const body = section.split(/^## /m)[0]
  for (const key of ['baseUrl', 'project', 'tokenEnv']) {
    assert.ok(body.includes(key), 'D1: the Walkthrough section must name `' + key + '` — a host would guess the key set and /spec:doctor could not check it')
  }
  assert.match(body, /[Aa]bsent\s+block[\s\S]{0,200}sends\s+nothing/,
    'D1: the section must say an absent block sends nothing — without it a project that does not use the service cannot tell the client is safe to leave unconfigured')
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
