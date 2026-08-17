'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// specs/20260815/07-release-migrations-leg.md (D4, HEARWELL-20260814-02 / JJ-20260815-09):
// verdict.js gains a repeatable `--require <leg>` flag — each occurrence adds the named leg to
// the active profile's required set and, on the release profile, its blocking set. This closes
// the vacuous-green half of the incident: a host's migrations leg absent from the manifest must
// derive UNVERIFIED (the doctrine-execution-slip case), and a red migrations leg must derive
// GATE_RED (the incident itself, replayed) — both through the EXISTING missing-required-leg and
// blocking-leg branches, no new derivation. AC-3 pins the regression floor: omitting --require
// entirely must still derive today's word byte-for-byte, since legacy/declined hosts get no new
// leg and no new flag.

const SCRIPT = 'scripts/verdict.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

// The seven built-in release legs, all green — matches RELEASE_LEGS in verdict.js exactly.
const RELEASE_SEVEN_GREEN = [
  { leg: 'deploy', exit: 0, observed: 'ok' },
  { leg: 'ready', exit: 0, observed: 'ok' },
  { leg: 'e2e', exit: 0, observed: 'passed=10 failed=0 skipped=2' },
  { leg: 'journeys', exit: 0, observed: 'walked=5 failed=0' },
  { leg: 'substrate', exit: 0, observed: 'checked=8 failed=0 inert=1' },
  { leg: 'production', exit: 0, observed: 'verified' },
  { leg: 'ci', exit: 0, observed: 'conclusion=success' },
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
  const rows = [...RELEASE_SEVEN_GREEN, { leg: 'migrations', exit: 1, observed: 'fail' }]
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
  const rows = [...RELEASE_SEVEN_GREEN, { leg: 'migrations', exit: 0, observed: 'pass' }]
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
  const rows = [...RELEASE_SEVEN_GREEN, { leg: 'migrations', exit: 0, observed: 'pass' }]
  const manifest = writeManifest(dir, rows)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--profile', 'release',
    '--require', 'migrations', '--require', 'migrations'])
  assert.strictEqual(r.stdout.split('\n')[0], 'CLEAN',
    'the flag is documented as repeatable with duplicates de-duplicated (D4) — passing --require ' +
    'migrations twice must not double-count or otherwise perturb the derivation away from plain CLEAN: ' +
    r.stdout + ' / ' + r.stderr)
})
