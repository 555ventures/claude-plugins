'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// specs/20260815/07-release-migrations-leg.md (D4):
// verdict.js gains a repeatable `--require <leg>` flag — each occurrence adds the named leg to
// the active profile's required set and, on the release profile, its blocking set. This closes
// the vacuous-green half of the incident: a host's migrations leg absent from the manifest must
// derive UNVERIFIED (the doctrine-execution-slip case), and a red migrations leg must derive
// GATE_RED (the incident itself, replayed) — both through the EXISTING missing-required-leg and
// blocking-leg branches, no new derivation. AC-3 pins the regression floor: omitting --require
// entirely must still derive today's word byte-for-byte, since legacy/declined hosts get no new
// leg and no new flag.
//
// specs/20260820/06-typed-evidence-manifest.md D1/D3/D11 (brief 16's second move):
// every manifest row's `observed` field becomes a typed JSON object, and the release ledger's
// `e2e`/`journeys`/`substrate`/`ci` keys now copy that typed object VERBATIM (D3) instead of
// re-deriving a shape via the deleted `parseCounts`. The two new tests at the end of this file
// pin AC-20260820-06-11 (never omit the e2e key on a valid typed row) and AC-20260820-06-12
// (any string-observed row fails the WHOLE manifest closed, release profile included) — both
// against the pre-image spike-C/A2 defects the spec's Assumptions record executed.
// The RELEASE_SEVEN_GREEN fixture below is retyped in place; this file's existing three tests
// key on `--require`'s presence/redness through exit codes alone and never inspect `observed`,
// so none of their assertion text changes.

const SCRIPT = 'scripts/verdict.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

// The seven built-in release legs, all green — matches RELEASE_LEGS in verdict.js exactly.
const RELEASE_SEVEN_GREEN = [
  { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
  { leg: 'ready', exit: 0, observed: { result: 'pass' } },
  { leg: 'e2e', exit: 0, observed: { passed: 10, failed: 0, skipped: 2 } },
  { leg: 'journeys', exit: 0, observed: { walked: 5, failed: 0 } },
  { leg: 'substrate', exit: 0, observed: { checked: 8, failed: 0, inert: 1 } },
  { leg: 'production', exit: 0, observed: { result: 'verified' } },
  { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
]

test('AC-20260815-07-1: --profile release --require migrations with the seven built-in legs green but no migrations row derives UNVERIFIED', () => {
  const dir = tmpdir('verdict-require')
  const manifest = writeManifest(dir, RELEASE_SEVEN_GREEN)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--require', 'migrations'])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    '--require migrations must add "migrations" to the required-leg set — a manifest missing that row ' +
    'entirely (the doctrine-execution-slip case: migrationsCheck is declared but the leg was never ' +
    'appended) must derive UNVERIFIED, not fall through to CLEAN over an absent row: ' +
    r.stdout + ' / ' + r.stderr)
})

test('AC-20260815-07-2: --profile release --require migrations with a red migrations row alongside seven green built-ins derives GATE_RED', () => {
  const dir = tmpdir('verdict-require')
  const rows = [...RELEASE_SEVEN_GREEN, { leg: 'migrations', exit: 1, observed: { result: 'fail' } }]
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--require', 'migrations'])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'on the release profile, --require migrations must add the leg to the BLOCKING set too — a red ' +
    'migrations row (the hearwell incident replayed: DB four migrations behind) must derive GATE_RED so ' +
    'the milestone cannot read CLEAN: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1,
    'a GATE_RED word must exit non-zero — release.md gates promotion on this exit code: ' + r.stderr)
})

test('AC-20260815-07-3: --profile release with no --require flag and no migrations row derives exactly today\'s word — CLEAN, unchanged for legacy/declined hosts', () => {
  const dir = tmpdir('verdict-require')
  const manifest = writeManifest(dir, RELEASE_SEVEN_GREEN)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release'])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'a legacy or "none"-declined host passes no --require flag and appends no migrations row — the ' +
    'derivation must be byte-identical to pre-this-spec verdict.js (plain CLEAN over the seven green ' +
    'built-in legs), since --require is additive and must never change behavior when absent: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0,
    'the unmodified regression path must still exit 0: ' + r.stderr)
})

test('AC-20260815-07-6: --profile release --require migrations with a green migrations row (exit 0) alongside seven green built-ins derives CLEAN', () => {
  const dir = tmpdir('verdict-require')
  const rows = [...RELEASE_SEVEN_GREEN, { leg: 'migrations', exit: 0, observed: { result: 'pass' } }]
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--require', 'migrations'])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    '--require migrations only ever ADDS a requirement — it must never invent a new failure mode, so a ' +
    'present and green migrations row alongside the seven green built-ins must still derive CLEAN (the ' +
    'happy path): ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 0,
    'CLEAN must exit 0: ' + r.stderr)
})

test('AC-20260815-07-6: --require is repeatable and duplicate occurrences of the same leg do not change the derivation', () => {
  const dir = tmpdir('verdict-require')
  const rows = [...RELEASE_SEVEN_GREEN, { leg: 'migrations', exit: 0, observed: { result: 'pass' } }]
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release',
    '--require', 'migrations', '--require', 'migrations'])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'the flag is documented as repeatable with duplicates de-duplicated (D4) — passing --require ' +
    'migrations twice must not double-count or otherwise perturb the derivation away from plain CLEAN: ' +
    r.stdout + ' / ' + r.stderr)
})

test('AC-20260820-06-11: a release manifest\'s e2e row observed {"passed":3,"failed":0,"skipped":{"unavailable":"no-format-declared"}} is copied into the ledger row\'s e2e key verbatim, never omitted', () => {
  const dir = tmpdir('verdict-e2e-verbatim')
  const rows = RELEASE_SEVEN_GREEN.map(r => (r.leg === 'e2e'
    ? { leg: 'e2e', exit: 0, observed: { passed: 3, failed: 0, skipped: { unavailable: 'no-format-declared' } } }
    : r))
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.0.0', '--briefs', '16'])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'CLEAN',
    'every release leg is green (e2e\'s exit is still 0) — the derivation must reach CLEAN so the ledger row ' +
    'assertion below is exercising the real path, not a STOP-path partial row: ' + r.stdout + ' / ' + r.stderr)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    '--ledger must print a parseable JSON row on line 2: ' + r.stdout)
  assert.deepStrictEqual(row.e2e, { passed: 3, failed: 0, skipped: { unavailable: 'no-format-declared' } },
    'D3/AC-20260820-06-11 (literal): row.e2e must equal the manifest e2e row\'s observed object EXACTLY, ' +
    'including its nested skipped.unavailable sub-field — the deleted parseCounts() used to re-derive this ' +
    'shape by regex and silently drop the key entirely when the observed string did not match its pinned ' +
    'grammar (spike C, A3: pre-image "passed=3 failed=0 skipped=unavailable" prints CLEAN with NO e2e key at ' +
    `all) — the typed object must never be omitted, sliced, or re-derived: got ${JSON.stringify(row)}`)
})

test('AC-20260820-06-12: a release manifest carrying any string-observed row (fail-closed applies to both profiles) prints UNVERIFIED and exits 1', () => {
  const dir = tmpdir('verdict-release-string-observed')
  const rows = RELEASE_SEVEN_GREEN.map(r => (r.leg === 'e2e'
    ? { leg: 'e2e', exit: 0, observed: 'passed=3 failed=0 skipped=unavailable' }
    : r))
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release', '--ledger',
    '--milestone', 'v1.0.0', '--briefs', '16'])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'D1: verdict.js treats ANY row whose observed is not a non-null JSON object as manifest-invalid, on ' +
    'BOTH profiles — a release manifest with one legacy string-observed row (even with every leg\'s exit ' +
    'green) must derive UNVERIFIED, never silently misread the string and fabricate a CLEAN release the way ' +
    'the pre-image did (spike A/A2: a typed-looking or gibberish string observed both decayed to a fabricated ' +
    `zero/CLEAN instead of loudly failing): ` + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1,
    'UNVERIFIED must exit 1 so promotion is mechanically unreachable: ' + r.stderr)
})
