'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// JJ-20260817-01 — spec/scripts/ac-matrix.js never adjudicates AC-ID uniqueness: `acById` is
// a last-wins Map keyed on the ID string, so two DIFFERENT criteria sharing one well-formed
// ID collapse to a single entry. Found by eye at the self-hosted review of
// specs/20260815/06 (2026-08-17); second hole identified by the same day's Fable 5 retainer
// brief; both reproduced by execution against synthetic hosts before this pin was written.
//
// Hole 1 (coverage collapse). The earlier bullet vanishes from the effective denominator: a
// criterion with NO test at all reads as fully covered (`uncovered=0`, exit 0) the moment a
// later criterion reuses its ID and the ID string appears once anywhere in a File Plan test
// file. No test deletion needed — an author amending a spec need only reuse an ID.
//
// Hole 2 (skip laundering). The skip reconciliation resolves a skipped test through the same
// Map, so with `[env:]` on the LAST copy an UNGATED criterion's skipped test is silently
// sanctioned (`skipped=1 sanctioned=1`, exit 0, zero findings) by a declaration belonging to
// a different criterion. The inverse ordering is the cry-wolf direction: `[env:]` on the
// first copy is overwritten and the declared gate reads as an unsanctioned skip.
//
// Same family as JJ-20260815-01 (a property the checker depends on but never adjudicates,
// failing silently open on the denominator) — NOT the D2 owning-spec-lookup class, which
// failed loud. Fix contract: each occurrence of a well-formed ID beyond the first is a hard
// `duplicate-ac` finding AND counts toward uncovered, in both drift modes; a skip mapping to
// a duplicated ID is unsanctioned, never reading either copy's [env:] and never falling
// through to the owning-spec lookup (which would find() the first copy and re-launder).
// The observed grammar `uncovered=N oracle=M` / `skipped=N sanctioned=M` stays byte-unchanged.
//
// Executed against synthetic host trees, never against script internals.

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeManifest(dir) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, [
    JSON.stringify({ leg: 'gate', exit: 0, observed: 'skips=1 todos=0' }),
    JSON.stringify({ leg: 'smoke', exit: 0, observed: 'pass' }),
  ].join('\n') + '\n')
  return p
}

function manifestRow(manifestPath, leg) {
  const rows = fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  return rows.find(r => r.leg === leg)
}

test('JJ-20260817-01: a second criterion reusing an AC-ID is a hard duplicate-ac finding and counts toward uncovered — a criterion with no test must never read as covered', () => {
  const root = tmpdir('acm-dup-coverage')
  fs.mkdirSync(path.join(root, 'specs', '20260101'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const specPath = path.join(root, 'specs', '20260101', '01-probe.md')
  // Two DIFFERENT criteria share one well-formed ID; the second has no test anywhere.
  fs.writeFileSync(specPath, specMd(
    [
      '- **AC-20260101-01-1**: WHEN the first criterion is read THE SYSTEM SHALL do the first thing → tests/probe.test.js',
      '- **AC-20260101-01-1**: WHEN a SECOND, DIFFERENT criterion reuses that same ID THE SYSTEM SHALL do a second thing that has NO test at all → tests/probe.test.js',
    ],
    ['| tests/probe.test.js | CREATE | tests | AC-20260101-01-1 |']
  ))
  fs.writeFileSync(path.join(root, 'tests', 'probe.test.js'),
    "test('AC-20260101-01-1: the first thing', () => {})\n")

  const manifestPath = writeManifest(root)
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath])

  assert.strictEqual(res.status, 1,
    'two different criteria sharing one AC-ID — the second having NO test at all — produced a ' +
    'clean exit: acById is last-wins, so the earlier criterion silently left the coverage ' +
    'denominator and a spec author can retire any requirement from review\'s sight by reusing ' +
    'its ID in an amendment. Each occurrence beyond the first must be a hard duplicate-ac ' +
    'finding. stdout=' + JSON.stringify(res.stdout))
  assert.match(res.stdout || '', /duplicate-ac/,
    'the finding class must be duplicate-ac, naming the adjudication that fired — a generic ' +
    'uncovered-ac line would read as a test-authoring gap, sending the fixer at the wrong ' +
    'surface. stdout=' + JSON.stringify(res.stdout))
  const row = manifestRow(manifestPath, 'ac-matrix')
  assert.ok(row && !/uncovered=0/.test(row.observed),
    'the durable ac-matrix manifest row recorded uncovered=0 while a criterion with zero ' +
    'tests sat behind a duplicated ID: the one artifact that outlives the run certifies full ' +
    'coverage for a requirement nothing verifies. A duplicated occurrence is UNKNOWN ' +
    'coverage, which is uncovered — the JJ-20260815-01 fail-closed rule applied to identity. ' +
    'observed=' + JSON.stringify(row && row.observed))
})

test('JJ-20260817-01: a skipped test mapping to a duplicated AC-ID is never sanctioned by either copy\'s [env:] declaration', () => {
  const root = tmpdir('acm-dup-env')
  fs.mkdirSync(path.join(root, 'specs', '20260101'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const specPath = path.join(root, 'specs', '20260101', '02-envprobe.md')
  // First criterion is explicitly UNGATED; the second reuses its ID and declares [env:].
  fs.writeFileSync(specPath, specMd(
    [
      '- **AC-20260101-02-1**: WHEN this UNGATED criterion is read THE SYSTEM SHALL run its test on every machine with no environment gating whatsoever → tests/envprobe.test.js',
      '- **AC-20260101-02-1** `[env: SOME_LIVE_CREDENTIAL]`: WHEN a SECOND, DIFFERENT criterion reuses that same ID and declares gating THE SYSTEM SHALL be the last-wins entry → tests/envprobe.test.js',
    ],
    ['| tests/envprobe.test.js | CREATE | tests | AC-20260101-02-1 |']
  ))
  fs.writeFileSync(path.join(root, 'tests', 'envprobe.test.js'),
    "test('AC-20260101-02-1: the ungated criterion, skipped', { skip: true }, () => {})\n")
  const skipsPath = path.join(root, 'skips.txt')
  fs.writeFileSync(skipsPath, 'AC-20260101-02-1: the ungated criterion, skipped\n')

  const manifestPath = writeManifest(root)
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath, '--skips', skipsPath])

  assert.ok(!/sanctioned by \[env:/.test(res.stdout || ''),
    'an UNGATED criterion\'s skipped test was sanctioned by a DIFFERENT criterion\'s [env:] ' +
    'declaration, purely because the two share an ID and the Map kept the later copy: the ' +
    'exact silent-green path the skip reconciliation exists to close, reachable in one ' +
    'authoring step. A duplicated ID has no trustworthy declaration — neither copy\'s [env:] ' +
    'may sanction, and the owning-spec fallback must not re-launder it via the first copy. ' +
    'stdout=' + JSON.stringify(res.stdout))
  const row = manifestRow(manifestPath, 'skip-reconcile')
  assert.ok(row && /sanctioned=0/.test(row.observed),
    'the durable skip-reconcile row recorded the laundered skip as sanctioned, so every ' +
    'downstream sweep and the ledger\'s testsSkipped split reads a declared env gate where ' +
    'none governs the skipped criterion; a skip mapping to a duplicated ID must record ' +
    'sanctioned=0. observed=' + JSON.stringify(row && row.observed))
  assert.match(res.stdout || '', /duplicate/i,
    'the unsanctioned-skip finding must name the duplication as the reason — without it the ' +
    'finding reads as a missing [env:] tag and the "fix" becomes adding a tag to the ' +
    'surviving copy, which re-opens the laundering path. stdout=' + JSON.stringify(res.stdout))
})
