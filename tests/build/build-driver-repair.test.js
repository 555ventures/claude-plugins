'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeHost, makeNoTestsHost, run, stateOf, toFirstWave, toIntegration, toEscalateCap, implementScriptsWave } = require('./build-driver.fixtures')

// specs/20260901/01-build-driver.md (brief 18): shard of build-driver.test.js, split by
// specs/20260903/07-test-file-budget-guard.md D7. Owns the WAVE/INTEGRATION/REPAIR/ESCALATE
// lifecycle: AC-20260901-01-6, -7, -8 (all legs), -18 (all three admission-gate legs), and the
// empty-waves field report. Admission/TESTS-stage lives in build-driver.test.js; commit/ledger/
// provenance/glob lives in build-driver-commit.test.js. Shared helpers live in
// tests/build/build-driver.fixtures.js.

test('field report 2026-09-02 (empty waves): WHEN layerGroups declares groups with no File Plan rows THE SYSTEM skips them at derivation — the first WAVE is the first non-empty group, one printed line names the skipped groups, unlisted layers still trail as other, and no wave-done mark is ever demanded for a skipped group', () => {
  const host = makeNoTestsHost()
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.layerGroups = [['contracts'], ['doctrine', 'scripts'], ['wiring']]
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  // Add an unlisted-layer row so the trailing `other` wave is exercised alongside the skips.
  fs.writeFileSync(host.spec, fs.readFileSync(host.spec, 'utf8').replace(
    '| src/only.js | MODIFY | scripts |', '| src/only.js | MODIFY | scripts |\n| gate.sh | MODIFY | other |'))

  const r0 = run(host.root, host.spec)
  assert.strictEqual(r0.status, 0, r0.stdout + r0.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts',
    'the empty leading group (contracts) must never become a wave — the first step is the first non-empty group: ' + r0.stdout)
  assert.match(r0.stdout, /empty wave\(s\) skipped — no File Plan rows: contracts, wiring/,
    'one line must name every skipped group so the session can see the derivation: ' + r0.stdout)
  const rWrong = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'contracts', '--workers', '0')
  assert.strictEqual(rWrong.status, 2, 'a skipped group is not a wave, so marking it must be refused: ' + rWrong.stdout + rWrong.stderr)

  const r1 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  assert.strictEqual(r1.status, 0, r1.stdout + r1.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:other',
    'the empty trailing group (wiring) must be skipped straight to the other wave: ' + r1.stdout)
  const r2 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(r2.status, 0, r2.stdout + r2.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION', 'no wave remains after other: ' + r2.stdout)
})

// specs/20261103/07-the-file-decides-not-the-tier.md D4: REPAIR names the out-of-plan triage script.
test('AC-20261103-07-6: WHEN a build reaches REPAIR THE SYSTEM prints the out-of-plan-triage line between the rows-by-layer block and the Route-each-failing-file line, carrying the driver\'s own spec path', () => {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  run(host.root, host.spec, '--mark', 'integrated')
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR', 'setup precondition: a red gate lands REPAIR: ' + r.stdout + r.stderr)
  const line = 'a failing file outside the File Plan: node "$(spec-paths out-of-plan-triage)" --spec ' + host.spec +
    ' --file <path> — exit 0 prints the two rows to paste, exit 1 asks (add to scope / file separately / pause)'
  const lines = r.stdout.split('\n')
  const at = lines.indexOf(line)
  assert.ok(at > 0, 'REPAIR must print the triage line verbatim or a lane relays the add-to-scope question to the user: ' + r.stdout)
  const layerAt = lines.findIndex((l) => /^ {2}(doctrine\+scripts|scripts|doctrine):/.test(l))
  assert.ok(layerAt >= 0 && layerAt < at && lines[at + 1].startsWith('Route each failing file'),
    'the triage line must sit after the rows-by-layer block and directly before "Route each failing file": ' + r.stdout)
})

