'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, read, SPEC } = require('../helpers')
const { setupWorkingHost, makeStubBin, withStubPath, readRows, rowFor, writeConfig } = require('./release-legs.fixtures')

// specs/20260913/08-silence-is-not-a-pass.md D1-D4: an unmeasured release leg (no adapter, a
// commit CI never saw, an all-inert substrate manifest, a declined promotion) must stop the
// release flow (⚪ glyph + UNMEASURED: line + exit 1 from `stage`, UNVERIFIED from `verdict.js`
// and `record`) instead of falling through to a silent CLEAN — the letter's central claim, A1
// spiked. Pins AC-20260913-08-1, -2, -3, -5, -6, -7, -8, -11 by executing the real scripts
// against synthetic hosts and reading release.md's prose verbatim (AC-8).

const VERDICT = 'scripts/verdict.js'
const RELEASE_LEGS = 'scripts/release-legs.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

// The AC-20260913-08-2/-3 seven-row fixture, built to Contracts' own literal ci/production/
// substrate shapes: ci has no adapter, production was declined, and substrate's manifest ran
// nothing (checked - inert === 0) — every row otherwise exit 0, so a pre-D2 verdict.js falls
// through to plain CLEAN (A1, spiked 2026-09-13).
const SEVEN_ROWS_TRIPLE_UNMEASURED = [
  { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
  { leg: 'ready', exit: 0, observed: { result: 'pass' } },
  { leg: 'e2e', exit: 0, observed: { passed: 10, failed: 0, skipped: 2, executed: 12 } },
  { leg: 'journeys', exit: 0, observed: { walked: 5, failed: 0 } },
  { leg: 'substrate', exit: 0, observed: { checked: 2, failed: 0, inert: 2 } },
  { leg: 'production', exit: 0, observed: { result: 'skipped' } },
  { leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } },
]

test('AC-20260913-08-1: unmeasuredReason(row) returns the Contracts\' exact derivation for each of its eight typed observed shapes, judged from observed alone', () => {
  const libPath = path.join(SPEC, 'scripts/lib/release-unmeasured.js')
  let unmeasuredReason
  assert.doesNotThrow(() => { ({ unmeasuredReason } = require(libPath)) },
    'D1: spec/scripts/lib/release-unmeasured.js must exist and export unmeasuredReason(row) — its ' +
    'absence means neither verdict.js nor release-legs.js has one derivation of "unmeasured" to require, ' +
    'and each is free to drift from the other')
  const cases = [
    [{ leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } }, 'ci:unavailable:no-adapter'],
    [{ leg: 'ci', exit: 0, observed: { unavailable: 'sha-unseen', branch: 'main', branchConclusion: 'failure' } },
      'ci:unavailable:sha-unseen'],
    [{ leg: 'ci', exit: 0, observed: { status: 'in-progress' } }, 'ci:in-progress'],
    [{ leg: 'production', exit: 0, observed: { result: 'skipped' } }, 'production:skipped'],
    [{ leg: 'substrate', exit: 0, observed: { checked: 2, failed: 0, inert: 2 } }, 'substrate:nothing-executed'],
    [{ leg: 'substrate', exit: 0, observed: { checked: 2, failed: 0, inert: 1 } }, null],
    [{ leg: 'e2e', exit: 0, observed: { passed: 3, failed: 0, skipped: { unavailable: 'no-format-declared' }, executed: 3 } }, null],
    [{ leg: 'ci', exit: 0, observed: { conclusion: 'success' } }, null],
  ]
  for (const [row, expected] of cases) {
    const got = unmeasuredReason(row)
    assert.strictEqual(got, expected,
      `unmeasuredReason(${JSON.stringify(row)}) must return ${JSON.stringify(expected)} — a wrong ` +
      'derivation here means release-legs.js\'s summary and verdict.js\'s release-word derivation ' +
      `can disagree about what silence looks like: got ${JSON.stringify(got)}`)
  }
})

test('AC-20260913-08-2: verdict.js --profile release derives UNVERIFIED (not CLEAN) over seven exit-0 rows where ci/production/substrate are each unmeasured', () => {
  const dir = tmpdir('verdict-unmeasured-ac2')
  const manifest = writeManifest(dir, SEVEN_ROWS_TRIPLE_UNMEASURED)
  const r = runNode(VERDICT, ['--manifest', manifest, '--profile', 'release'])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'D2: any required release leg with a non-null unmeasuredReason (here: ci no-adapter, production ' +
    'skipped, substrate nothing-executed) must derive UNVERIFIED — the pre-image falls through every ' +
    'exit-0 row straight to a fabricated CLEAN (A1, executed 2026-09-13): ' + r.stdout + ' / ' + r.stderr)
  assert.notStrictEqual(r.status, 0,
    'UNVERIFIED must exit non-zero so promotion cannot mechanically proceed past it: ' + r.stderr)
})

test('AC-20260913-08-3: verdict.js --profile release derives GATE_RED (red outranks unmeasured) when the same triple-unmeasured manifest also carries a red deploy row', () => {
  const dir = tmpdir('verdict-unmeasured-ac3')
  const rows = SEVEN_ROWS_TRIPLE_UNMEASURED.map(r => (r.leg === 'deploy'
    ? { leg: 'deploy', exit: 1, observed: { result: 'fail' } }
    : r))
  const manifest = writeManifest(dir, rows)
  const r = runNode(VERDICT, ['--manifest', manifest, '--profile', 'release'])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'D2\'s new UNVERIFIED check sits AFTER the existing red-leg check — a red deploy row must still ' +
    'reach GATE_RED first, even when ci/production/substrate are all separately unmeasured, so the more ' +
    'actionable fact (a red leg) is never buried under an UNVERIFIED word: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1,
    'GATE_RED must exit non-zero: ' + r.stderr)
})

test('AC-20260913-08-5: release-legs.js stage prints a ⚪ ci summary line and a final UNMEASURED: ci:unavailable:no-adapter line, exits 1, and still appends the unchanged ci row, when capabilities.forge is "none" and every other leg is green', async () => {
  const host = await setupWorkingHost('rl-unmeasured-ac5')
  try {
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(RELEASE_LEGS, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'ci'), { leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } },
      'D3: the appended ci row is byte-identical to today — this spec changes what stage PRINTS and ' +
      'EXITS over the row, never the row itself: ' + JSON.stringify(rowFor(rows, 'ci')))
    assert.match(r.stdout, /⚪\s+ci\s+exit=0\s+\{"unavailable":"no-adapter"\}/,
      'D3: an unmeasured row must print the ⚪ glyph (never ✅, which today\'s summary loop uses for ' +
      `every exit-0 row regardless of whether anything was actually observed): ${r.stdout}`)
    assert.ok(!/✅\s+ci\b/.test(r.stdout),
      'the ci line must not also print the ✅ (green) glyph — a leg cannot be reported both measured ' +
      `and unmeasured: ${r.stdout}`)
    const lines = r.stdout.trim().split('\n')
    assert.strictEqual(lines[lines.length - 1], 'UNMEASURED: ci:unavailable:no-adapter',
      'D3: the summary\'s final line must name every unmeasured leg:reason pair — its absence is ' +
      `exactly the silent-CLEAN failure mode this spec exists to close: ${r.stdout}`)
    assert.strictEqual(r.status, 1,
      'D3: stage must exit 1 when a required leg is unmeasured, even though every row it ran is ' +
      `individually exit 0 — the pre-image exits 0 here since it only checks row.exit: ${r.stderr}`)
  } finally {
    host.kill()
  }
})

test('AC-20260913-08-6: release-legs.js stage appends {"leg":"substrate","exit":0,"observed":{"checked":1,"failed":0,"inert":1}}, prints UNMEASURED: substrate:nothing-executed, and exits 1 when every release-manifest check is kind:"inert"', async () => {
  const ghScript = '#!/usr/bin/env bash\n' +
    'echo \'[{"status":"completed","conclusion":"success","headSha":"abc123","url":"http://example.com/run","updatedAt":"2026-08-23T00:00:00Z"}]\'\n' +
    'exit 0\n'
  // capabilities.forge left undefined (dropped by JSON.stringify) so ci falls through to the
  // dynamic gh probe instead of the forge:"none" short-circuit — the AC-20260823-01-7 trick —
  // giving this host a real, measured ci leg so the UNMEASURED: line pins substrate alone,
  // isolated from AC-20260913-08-5's ci case above.
  const host = await setupWorkingHost('rl-unmeasured-ac6', {
    capabilities: { forge: undefined },
    checks: [{ claim: 'an unverifiable-from-this-host check', kind: 'inert', target: 'declared: nothing to verify from here' }],
  })
  try {
    const binDir = makeStubBin(host.dir, 'gh', ghScript)
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(RELEASE_LEGS, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')],
      { env: withStubPath(binDir) })
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'substrate'), { leg: 'substrate', exit: 0, observed: { checked: 1, failed: 0, inert: 1 } },
      'an all-inert manifest (TOTAL=1 FAILS=0 INERT=1) must still append the row byte-identically ' +
      `to today — this leg\'s row shape is unchanged, only its downstream reading: ${JSON.stringify(rowFor(rows, 'substrate'))}`)
    assert.deepStrictEqual(rowFor(rows, 'ci'), { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
      `setup check: the stubbed gh must make ci measured, isolating this test to the substrate case: ${JSON.stringify(rowFor(rows, 'ci'))} (stderr ${r.stderr})`)
    const lines = r.stdout.trim().split('\n')
    assert.strictEqual(lines[lines.length - 1], 'UNMEASURED: substrate:nothing-executed',
      'D1/D3: checked - inert === 0 means the substrate leg verified nothing at all — an all-' +
      `declared-exempt manifest must not read as a passed release gate: ${r.stdout}`)
    assert.strictEqual(r.status, 1,
      `stage must exit 1 over an unmeasured substrate leg, never fall through to exit 0: ${r.stderr}`)
  } finally {
    host.kill()
  }
})

test('AC-20260913-08-7: release-legs.js append --leg production --result skipped SHALL CONTINUE TO append {"leg":"production","exit":0,"observed":{"result":"skipped"}} and exit 0', () => {
  const dir = tmpdir('rl-unmeasured-ac7')
  const manifest = path.join(dir, 'manifest.jsonl')
  const r = runNode(RELEASE_LEGS, ['append', '--manifest', manifest, '--leg', 'production', '--result', 'skipped'])
  assert.strictEqual(r.status, 0,
    'a declined promotion is not itself red — append must keep exiting 0 for a skipped production ' +
    `result; only verdict.js\'s downstream derivation (AC-20260913-08-11) changes: ${r.stderr}`)
  const rows = readRows(manifest)
  assert.deepStrictEqual(rows[0], { leg: 'production', exit: 0, observed: { result: 'skipped' } },
    `the appended row's grammar must stay byte-identical to today — D3 never touches append: ${JSON.stringify(rows[0])}`)
})

test('AC-20260913-08-11: release-legs.js record derives UNVERIFIED and writes a ledger row with verdict "UNVERIFIED" and production "skipped" when six legs are measured green and production was declined', () => {
  const dir = tmpdir('rl-unmeasured-ac11')
  writeConfig(dir, { release: {} })
  const rows = [
    { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
    { leg: 'ready', exit: 0, observed: { result: 'pass' } },
    { leg: 'e2e', exit: 0, observed: { passed: 5, failed: 0, skipped: 0, executed: 5 } },
    { leg: 'journeys', exit: 0, observed: { walked: 2, failed: 0 } },
    { leg: 'substrate', exit: 0, observed: { checked: 2, failed: 0, inert: 0 } },
    { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
    { leg: 'production', exit: 0, observed: { result: 'skipped' } },
  ]
  const manifest = writeManifest(dir, rows)
  const r = runNode(RELEASE_LEGS, ['record', '--root', dir, '--manifest', manifest])
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'UNVERIFIED',
    'D2: production:skipped is an unmeasured required leg on an otherwise fully-measured-green ' +
    `manifest — record\'s sole verdict.js invocation must derive UNVERIFIED, not the pre-image\'s ` +
    `fabricated CLEAN over a declined promotion: ${r.stdout} / ${r.stderr}`)
  let row
  assert.doesNotThrow(() => { row = JSON.parse(lines[1]) },
    `record must still print a parseable ledger row on stdout line 2 on an UNVERIFIED path: ${r.stdout}`)
  assert.strictEqual(row.verdict, 'UNVERIFIED',
    `the ledger row's own verdict field must agree with stdout line 1 — a mismatch here is the exact ` +
    `two-consumer drift D1 exists to prevent: ${JSON.stringify(row)}`)
  assert.strictEqual(row.production, 'skipped',
    `the ledger row must still carry production's observed.result verbatim (D3 of the typed-evidence-` +
    `manifest spec, untouched by this one) alongside the new UNVERIFIED word: ${JSON.stringify(row)}`)
  assert.strictEqual(r.status, 1,
    `record must exit non-zero on an UNVERIFIED derivation — release.md routes exit 1 to STOP: ${r.stderr}`)
})

test('AC-20260913-08-8: spec/commands/release.md (whitespace squashed) names UNMEASURED:, the never-promote-over-unmeasured rule, and the declined-promotion outcome, and drops the retired plain-CLEAN/ci-never-delivered wording', () => {
  const squash = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ')
  const text = squash(read('spec/commands/release.md'))
  assert.match(text, /UNMEASURED:/,
    'D3/D4: release.md must name the UNMEASURED: line release-legs.js stage now prints, or the ' +
    'session executing this doc has no documented signal that a leg measured nothing')
  assert.match(text, /never promote over a leg that observed nothing/,
    'D4: Phase 2\'s exit-1 wording must carry this exact rule — the command text is what the session ' +
    'executes, so a script that exits 1 under prose that still says "continue" is the contradiction ' +
    'this spec exists to remove')
  assert.match(text, /nothing was measured in production/,
    'D4: a declined promotion\'s outcome line must say nothing was measured in production — the ' +
    'reversed Phase 3 makes a never-delivered ci verdict an UNMEASURED stop like any other, not a ' +
    'silent promote')
  assert.doesNotMatch(text, /still derives plain CLEAN/,
    'D4: Phase 3\'s old "a ci leg that never delivered a verdict still derives plain CLEAN" paragraph ' +
    'must be reversed, not left standing alongside the new UNMEASURED stop')
  assert.doesNotMatch(text, /ci never delivered a verdict on this commit/,
    'D4: the two ci `warns` lines are deleted outright (not merely made unreachable) — the 🚫 outcome ' +
    'now names unmeasured legs verbatim off the UNMEASURED: line instead')
})
