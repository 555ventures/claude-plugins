'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260810/07-per-sha-ci-legs.md (2026-08-10, Prax stale-CI-review incident): D5 adds
// doctor.md check 19 — CI-gate parity, an advisory check that the host's CI actually invokes the
// configured gateCommand (the root-cause fix for local-green/CI-red drift), registered in
// scaffold-ledger.md per D6. D4 adds a Phase 2 `ci` leg to release.md keyed on --commit, with a
// bounded in-progress re-poll, a mandatory ⚠️ no-verdict report line, and the Phase-2
// immediate-STOP enumeration extended to include a red ci row (without which a red release-commit
// run would only surface post-promotion — a refuter finding). This file pins both doctrine edits
// by regex over the prose.

const doctorMd = read('spec/commands/doctor.md')
const scaffoldLedger = read('spec/doctrine/scaffold-ledger.md')
const releaseMd = read('spec/commands/release.md')

test('AC-20260810-07-11: doctor.md check 19 gates on .github/workflows existing, states the placeholder-split ≥10-char literal-segment substring rule, is advisory, and names the gateCommand remedy', () => {
  const m = doctorMd.match(/19\.\s+\*\*[^*]*\*\*[\s\S]*?(?=\n\d+\.\s+\*\*|\n## )/)
  assert.ok(m,
    'doctor.md must have a numbered check 19 inside "## Checks — deterministic first" (D5) — without it ' +
    'there is no CI-gate parity check at all, and local-green/CI-red drift has no root-cause fix: ' +
    '(no "19. **...**" entry found)')
  const section = m[0]
  assert.match(section, /\.github\/workflows/,
    'check 19 must gate on `.github/workflows/` existing (D5: "only when .github/workflows/ exists") — ' +
    'without that guard the check would run/skip vacuously on hosts with no GitHub Actions at all: ' + section)
  assert.match(section, /gateCommand/,
    'check 19 must name the config gateCommand — it is the value split into literal segments and checked ' +
    'against the workflow YAML (D5): ' + section)
  assert.match(section, /\{[^}]*\}/,
    'check 19 must show the placeholder-split pattern (D5: split on the regex /\\{[^}]*\\}/g) that separates ' +
    'literal segments from templated placeholder tokens before the substring check runs: ' + section)
  assert.match(section, /\b10\b[\s\S]{0,30}char|char[\s\S]{0,30}\b10\b/i,
    'check 19 must state the ≥10-char floor for kept literal segments (D5) — without the floor a short, ' +
    'noisy segment would false-positive-match almost any CI YAML text: ' + section)
  assert.match(section, /substring/i,
    'check 19 must state the substring-containment rule — each kept segment must appear as a substring in ' +
    'the concatenation of .github/workflows/*.yml + *.yaml (D5/Contracts): ' + section)
  assert.match(section, /advisory/i,
    'check 19 must be advisory severity (D5) — never a hard/blocking finding, since equivalent-but-respelled ' +
    'CI is a false positive this substring check cannot see: ' + section)
  assert.match(section, /gateCommand[\s\S]{0,200}(remedy|verbatim)|remedy[\s\S]{0,200}gateCommand/i,
    'check 19\'s finding must name a remedy referencing gateCommand — D5\'s remedy is "make one CI step run ' +
    'the gateCommand verbatim": ' + section)
})

test('AC-20260810-07-11: scaffold-ledger.md registers a row for doctor check 19 (CI-gate parity)', () => {
  const rowMatch = scaffoldLedger.match(/^\|[^\n]*[Cc]heck 19[^\n]*\|$/m)
  assert.ok(rowMatch,
    'scaffold-ledger.md must carry a table row registering doctor check 19 (D6: "add exactly ONE new row for ' +
    'check 19") — a new advisory guard with no ledger row and no promote/retire condition is a hard review ' +
    'finding per this repo\'s own Review Checks: (no "| ... check 19 ... |" row found)')
  assert.match(rowMatch[0], /advisory/i,
    'check 19\'s ledger row must record its kind as advisory (D6: "kind: advisory") — matching the doctrine ' +
    'section\'s own advisory-severity statement: ' + rowMatch[0])
})

test('AC-20260810-07-12: release.md documents the Phase 2 ci leg keyed on --commit, with the observed enum and the bounded 30s/10-minute in-progress re-poll', () => {
  assert.match(releaseMd, /--commit\b/,
    'release.md must document the ci leg invoked with --commit (D4) — release re-keys on the exact release ' +
    'commit, the same per-SHA fix review gets: (not found)')
  assert.match(releaseMd, /conclusion=<value>|conclusion=/,
    'release.md must document the ci leg\'s observed "conclusion=<value>" format for a completed non-red run ' +
    '(D4) — without it verdict.js\'s parse target is undocumented: (not found)')
  assert.match(releaseMd, /unavailable/,
    'release.md must document "unavailable" as the ci leg\'s observed value when no CI verdict exists for ' +
    'the release commit (D4): (not found)')
  assert.match(releaseMd, /in-progress/,
    'release.md must document "in-progress" as the ci leg\'s observed value while CI is still running (D4): ' +
    '(not found)')
  assert.match(releaseMd, /30s|30 second/i,
    'release.md must document the 30-second re-poll interval for an in-progress ci run (D4): (not found)')
  assert.match(releaseMd, /10[- ]minute|10 min\b/i,
    'release.md must document the 10-minute bound on the in-progress re-poll loop (D4) — an unbounded poll ' +
    'would hang a release indefinitely on a slow CI run: (not found)')
})

test('AC-20260810-07-12: release.md mandates a ⚠️ pre-promote report line whenever CI delivered no verdict on the release commit', () => {
  assert.match(releaseMd, /⚠️[\s\S]{0,250}(CI|ci)[\s\S]{0,150}(commit|verdict)|(CI|ci)[\s\S]{0,250}⚠️[\s\S]{0,150}(commit|verdict)/,
    'release.md must state that the pre-promote report carries a mandatory ⚠️ line whenever the observed ' +
    'value is not a "conclusion=" value — i.e. CI never delivered a verdict on the exact release commit (D4) ' +
    '— otherwise an unpushed or CI-less release promotes with no visible warning that CI was never consulted: ' +
    '(⚠️ + CI/commit-or-verdict wording not found near each other)')
})

test('AC-20260810-07-12: release.md\'s Phase-2 immediate-STOP enumeration is extended to include a red ci row', () => {
  const stopMatch = releaseMd.match(/Any failure here[\s\S]{0,300}STOP/)
  assert.ok(stopMatch,
    'release.md must still carry the Phase-2 immediate-STOP enumeration sentence ("Any failure here (a red ' +
    '... row): STOP") — D4 extends this enumeration in place, it does not delete or relocate it: (not found)')
  assert.match(stopMatch[0], /`ci`|\bci\b/,
    'the Phase-2 STOP enumeration must name a red `ci` row alongside deploy/ready/e2e/journeys (D4) — without ' +
    'it a red CI verdict on the release commit would only surface AFTER promotion, the exact refuter finding ' +
    'D4 closes: ' + JSON.stringify(stopMatch[0]))
})
