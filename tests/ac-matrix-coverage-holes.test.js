'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// JJ-20260815-01 / JJ-20260815-02 — two independent holes in spec/scripts/ac-matrix.js's
// coverage accounting, both surfaced by the self-hosted review of
// specs/20260814/04-lock-signal-window.md (run wf_e9e438d1-c94, 2026-08-15).
//
// Hole 1 (malformed-ac fails OPEN on the denominator). parseBullets() matches
// `^- \*\*(token)\*\*` and requires the token to satisfy AC_ID_RE; a bullet failing either
// is dropped from `wellFormed`, hence from `acById` AND from the coverage loop. The script
// does emit a loud `malformed-ac` hard finding, so the NOTATION is caught — but the
// observed string it writes to the durable manifest row still reads `uncovered=0`, because
// the unparseable AC left the denominator entirely. The review that found this had its
// single most load-bearing pin (a signal-handler ordering AC) invisible to the sweep while
// the row recorded full coverage. Waive the notation finding once and the coverage claim is
// silently false forever after. Correct behavior: unparseable = unknown = uncovered. Fail
// closed on the denominator, exactly as the skipped-test reconciliation already does.
//
// Hole 2 ([env:] lookup is scoped to the wrong file). The skipped-test reconciliation
// resolves a skipped test's AC through `acById` — built ONLY from the spec under review —
// so an `[env: VAR]` declaration living in the spec that OWNS that AC is unreachable. The
// scoped gate glob, meanwhile, runs every test file in the directory. Result: a correctly
// declared env-gated suite reports as an unsanctioned skip — a HARD finding — on every
// review of that area, in perpetuity, with waive as the only remedy. That is the
// cry-wolf path that ends in a real skipped test being waved through (cf. UPWELL-20260716-02,
// the founding incident of this very leg, and CROSS-20260813-03, whose 6.61.0 fix added
// `[env:]` sanctioning but never widened where the declaration is read from — this is that
// fix's residual hole, not a regression of it).
//
// The AC-ID grammar itself carries the lookup: AC-YYYYMMDD-NN[a-z]?-k encodes its owning
// spec as specs/YYYYMMDD/NN*-*.md. Fail closed when that spec is absent, unreadable, or
// carries no [env:] — unknown is never sanctioned.
//
// Executed against synthetic host trees, never against script internals.
//
// specs/20260820/06-typed-evidence-manifest.md D1/D2 (2026-08-20, brief 16's second move): every
// manifest row's `observed` field becomes a typed JSON object — the gate/skip-reconcile rows
// below retire their packed "skips=1 todos=0"/"sanctioned=1" strings for typed objects. The two
// existing regex-over-string assertions this file's incident predates (`/uncovered=0/.test(...)`,
// `/sanctioned=1/.test(...)`) are retyped to field reads in place — a regex applied to a
// stringified object would silently always fail to match, turning a real red pin into a
// vacuously-true one, exactly the class this migration exists to make impossible.

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeManifest(dir, lines) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  return p
}

function greenGateManifest(dir) {
  return writeManifest(dir, [
    { leg: 'gate', exit: 0, observed: { skips: 1, todos: 0, testsExecuted: 4 } },
    { leg: 'smoke', exit: 0, observed: { result: 'pass' } },
  ])
}

function acMatrixRow(manifestPath, leg) {
  const rows = fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  return rows.find(r => r.leg === leg)
}

test('AC-20260815-03-1 / JJ-20260815-01: a malformed AC bullet counts toward uncovered — an unparseable AC is unknown, never absent', () => {
  const root = tmpdir('acm-malformed')
  fs.mkdirSync(path.join(root, 'specs', '20260814'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  // One well-formed AC with a real test hit, one malformed (prime-suffixed) AC with none.
  const specPath = path.join(root, 'specs', '20260814', '04-x.md')
  fs.writeFileSync(specPath, specMd(
    [
      '- **AC-20260814-04-1**: WHEN a thing happens THE SYSTEM SHALL do the thing → tests/x.test.js',
      "- **AC-20260814-04-3′**: WHEN the source is read THE SYSTEM SHALL show the ordering → tests/x.test.js",
    ],
    ['| tests/x.test.js | MODIFY | tests | AC-20260814-04-1 |']
  ))
  fs.writeFileSync(path.join(root, 'tests', 'x.test.js'),
    "test('AC-20260814-04-1: the thing', () => {})\n")

  const manifestPath = greenGateManifest(root)
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath])

  const row = acMatrixRow(manifestPath, 'ac-matrix')
  assert.ok(row, 'ac-matrix.js must append its own manifest row')
  assert.ok(row.observed && typeof row.observed === 'object' && row.observed.uncovered !== 0,
    'the durable manifest row recorded uncovered:0 while an unparseable AC bullet sat outside ' +
    'the coverage sweep entirely: a reviewer who waives the malformed-ac notation finding is ' +
    'then told, by the only artifact that outlives the run, that every requirement has a test. ' +
    'The load-bearing pin can be deleted afterwards and nothing reports it. An AC the script ' +
    'cannot parse is UNKNOWN coverage, which is uncovered — never zero. ' +
    'observed=' + JSON.stringify(row.observed) + ' stdout=' + JSON.stringify(res.stdout))
})

test('AC-20260815-03-2 / JJ-20260815-02: a skipped test whose AC declares [env:] in the spec that OWNS it is sanctioned, not a hard finding', () => {
  const root = tmpdir('acm-crossspec')
  fs.mkdirSync(path.join(root, 'specs', '20260808'), { recursive: true })
  fs.mkdirSync(path.join(root, 'specs', '20260814'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })

  // The OWNING spec declares the env gate on its own AC line.
  fs.writeFileSync(path.join(root, 'specs', '20260808', '01-enroll.md'), specMd(
    ['- **AC-20260808-01-12** `[env: AUTOPILOT_ENROLL_LIVE]`: WHEN the live gate vars are set ' +
      'THE SYSTEM SHALL enroll against the real hub → tests/enroll-live.test.js'],
    ['| tests/enroll-live.test.js | CREATE | tests | AC-20260808-01-12 |']
  ))

  // The spec UNDER REVIEW is a different spec that never mentions that AC.
  const specPath = path.join(root, 'specs', '20260814', '04-x.md')
  fs.writeFileSync(specPath, specMd(
    ['- **AC-20260814-04-1**: WHEN a thing happens THE SYSTEM SHALL do the thing → tests/x.test.js'],
    ['| tests/x.test.js | MODIFY | tests | AC-20260814-04-1 |']
  ))
  fs.writeFileSync(path.join(root, 'tests', 'x.test.js'),
    "test('AC-20260814-04-1: the thing', () => {})\n")

  // The scoped gate glob ran the whole directory, so the owning spec's env-gated test skipped.
  const skipsPath = path.join(root, 'skips.txt')
  fs.writeFileSync(skipsPath,
    'AC-20260808-01-12: a real enroll against the live hub skips by declaration when the gate vars are unset\n')

  const manifestPath = greenGateManifest(root)
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath, '--skips', skipsPath])

  assert.ok(!/unsanctioned-skip/.test(res.stdout || ''),
    'a test correctly declared `[env: AUTOPILOT_ENROLL_LIVE]` in the spec that owns its AC was ' +
    'reported as an unsanctioned skip, because the reconciliation reads [env:] only from the ' +
    'spec under review while the scoped gate runs every test file in the directory. This HARD ' +
    'finding recurs on every review touching that area and its only remedy is a waive — which ' +
    'is precisely how reviewers are trained to wave through the real skipped test this leg ' +
    'exists to catch. The AC-ID encodes its owning spec (AC-YYYYMMDD-NN-k -> specs/YYYYMMDD/NN*); ' +
    'read the declaration there, and fail closed when that spec is missing or carries no [env:]. ' +
    'stdout=' + JSON.stringify(res.stdout))

  const row = acMatrixRow(manifestPath, 'skip-reconcile')
  assert.ok(row, 'ac-matrix.js must append a skip-reconcile manifest row')
  assert.strictEqual(row.observed && row.observed.sanctioned, 1,
    'the durable skip-reconcile row must record the skip as observed.sanctioned:1 so downstream sweeps ' +
    'and the ledger\'s testsSkipped split can tell a declared env gate from a test that simply ' +
    'never ran (CROSS-20260813-03\'s whole point); observed=' + JSON.stringify(row.observed))

  // D3 (AC-20260815-03-2): the sanction warning must name the declaring file — an auditable
  // cross-spec sanction, never a silent green that looks identical to a same-spec one.
  assert.match(res.stdout || '', /declared in .*specs\/20260808\/01/,
    'the sanction warning for a cross-spec [env:] declaration must name the owning spec path ' +
    '(specs/20260808/01-enroll.md) so a reviewer can audit WHERE the gate was declared — a bare ' +
    '"sanctioned by [env: VAR]" line with no source is indistinguishable from a same-spec sanction. ' +
    'stdout=' + JSON.stringify(res.stdout))
})
