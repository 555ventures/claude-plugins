'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode } = require('../helpers')

// specs/20260810/07-per-sha-ci-legs.md (2026-08-10, Prax stale-CI-review incident): D5 adds
// doctor.md check 19 — CI-gate parity, an advisory check that the host's CI actually invokes the
// configured gateCommand (the root-cause fix for local-green/CI-red drift), registered in
// scaffold-ledger.md per D6. D4 adds a Phase 2 `ci` leg to release.md keyed on --commit, with a
// bounded in-progress re-poll, a mandatory ⚠️ no-verdict report line, and the Phase-2
// immediate-STOP enumeration extended to include a red ci row (without which a red release-commit
// run would only surface post-promotion — a refuter finding). This file pins both doctrine edits
// by regex over the prose.
//
// specs/20260814/02-doctor-mergeback-fidelity-mechanics.md (2026-08-14, D1/D6): the
// split/trim/floor/substring algorithm doctor.md check 19 hand-executed becomes
// spec/scripts/ci-gate-parity.js — a deterministic script check 19 now only INVOKES.
// AC-20260810-07-11's paragraph-regex pins retag to exec pins against the script (AC-1/2/3
// below), plus one doctrine pin confirming check 19 shrinks to an invocation with no restated
// algorithm.

const doctorMd = read('spec/commands/doctor.md')
const scaffoldLedger = read('spec/doctrine/scaffold-ledger.md')
const releaseMd = read('spec/commands/release.md')

function makeHost(gateCommand, workflowContent) {
  const dir = tmpdir('ci-gate')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'),
    JSON.stringify({ gateCommand }))
  if (workflowContent !== undefined) {
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), workflowContent)
  }
  return dir
}

test('AC-20260814-02-1: this repo\'s real gateCommand splits to exactly one ≥10-char kept segment, exiting 0 when a workflow contains it and 1 naming it when none does', () => {
  const gateCommand = 'node spec/scripts/build-workflows.js --check && node --test {testDirs}'
  const kept = 'node spec/scripts/build-workflows.js --check && node --test'

  const present = makeHost(gateCommand, `jobs:\n  test:\n    run: ${kept} 'tests/**/*.test.js'\n`)
  const rPresent = runNode('scripts/ci-gate-parity.js', ['--root', present])
  assert.strictEqual(rPresent.status, 0,
    'ci-gate-parity.js must exit 0 when the workflow YAML contains the one kept segment of ' +
    'this repo\'s real gateCommand (AC-1) — the split must drop the trailing empty tail after ' +
    'the {testDirs} placeholder and keep only the ≥10-char literal prefix: ' + rPresent.stderr)

  const absent = makeHost(gateCommand, 'jobs:\n  test:\n    run: echo nope\n')
  const rAbsent = runNode('scripts/ci-gate-parity.js', ['--root', absent])
  assert.strictEqual(rAbsent.status, 1,
    'ci-gate-parity.js must exit 1 when no workflow file contains the kept segment — a missing ' +
    'CI invocation of gateCommand is the exact local-green/CI-red drift this check exists to ' +
    'catch: ' + rAbsent.stdout + rAbsent.stderr)
  assert.match(rAbsent.stdout + rAbsent.stderr, /node --test/,
    'the exit-1 finding must name the missing segment so the remedy is actionable: ' +
    rAbsent.stdout + rAbsent.stderr)
})

test('AC-20260814-02-1: a synthetic two-placeholder gateCommand keeps only its ≥10-char second split segment, exiting 1 naming it when the workflow has only the first', () => {
  const gateCommand = 'lint {a} && test-suite-run {b}'
  const dir = makeHost(gateCommand, 'jobs:\n  test:\n    run: lint --fix\n')
  const r = runNode('scripts/ci-gate-parity.js', ['--root', dir])
  assert.strictEqual(r.status, 1,
    'the multi-placeholder split drops the 4-char "lint" segment (below the ≥10-char floor) ' +
    'and keeps "&& test-suite-run" — a workflow containing only "lint" text must still fail ' +
    'parity because the ENFORCED segment is absent: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /test-suite-run/,
    'the exit-1 finding must name the second split segment ("&& test-suite-run") — the only ' +
    'one that survives the ≥10-char floor: ' + r.stdout + r.stderr)
})

test('AC-20260814-02-2: a gateCommand with no segment ≥10 chars after split falls back to the whole placeholder-stripped command as the single required segment', () => {
  const gateCommand = 'npm test'

  const present = makeHost(gateCommand, 'jobs:\n  test:\n    run: npm test\n')
  const rPresent = runNode('scripts/ci-gate-parity.js', ['--root', present])
  assert.strictEqual(rPresent.status, 0,
    '"npm test" is 8 chars — below the ≥10-char floor — so the fallback rule must require the ' +
    'whole command as one segment, not silently pass with zero segments enforced: ' +
    rPresent.stderr)

  const absent = makeHost(gateCommand, 'jobs:\n  test:\n    run: echo hi\n')
  const rAbsent = runNode('scripts/ci-gate-parity.js', ['--root', absent])
  assert.strictEqual(rAbsent.status, 1,
    'without the fallback, a short gateCommand like "npm test" would degenerate into a ' +
    'vacuously green check (D1) — the fallback must still catch a workflow that never runs it: ' +
    rAbsent.stdout + rAbsent.stderr)
})

test('AC-20260814-02-3: --root with no .github/workflows prints the inapplicable sentinel and exits 0 (advisory absence, not a finding)', () => {
  const dir = makeHost('npm test', undefined)
  const r = runNode('scripts/ci-gate-parity.js', ['--root', dir])
  assert.strictEqual(r.status, 0,
    'a host with no .github/workflows/ has no CI to check parity against — this must exit 0 ' +
    'with the sentinel, never a finding: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /inapplicable — no \.github\/workflows/,
    'the exact sentinel text "inapplicable — no .github/workflows" must print so doctor.md can ' +
    'rely on it instead of its own existence pre-check: ' + r.stdout)
})

test('AC-20260814-02-3: doctor.md check 19 invokes ci-gate-parity.js via spec-paths and no longer restates the split/floor/substring algorithm', () => {
  const m = doctorMd.match(/19\.\s+\*\*[^*]*\*\*[\s\S]*?(?=\n\d+\.\s+\*\*|\n## )/)
  assert.ok(m,
    'doctor.md must still have a numbered check 19 — without it there is no CI-gate parity ' +
    'check at all, and local-green/CI-red drift has no root-cause fix: (no "19. **...**" entry found)')
  const section = m[0]
  assert.match(section, /ci-gate-parity/,
    'check 19 must invoke the script by its spec-paths key (`ci-gate-parity`) — the algorithm ' +
    'now lives once, in the script, per D1: ' + section)
  assert.doesNotMatch(section, /\{[^}]*\}/,
    'check 19 must NOT restate the placeholder-split regex pattern — that prose now lives only ' +
    'in the script; a surviving copy means the algorithm still lives in two places: ' + section)
  assert.doesNotMatch(section, /keep segments.{0,20}\b10\b|\b10\b.{0,20}char/i,
    'check 19 must NOT restate the ≥10-char literal-segment floor — the script owns this ' +
    'algorithm now; doctor.md should shrink to the invocation + one sentence on what a finding ' +
    'means (D1): ' + section)
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
