'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// PRAX-20260817-01: two of ac-matrix.js's coverage/skip legs both key off a bare substring
// match on AC-ID text, and AC-ID grammar makes one ID a literal prefix of another with the
// same NN group (`AC-20260815-03-1` is a substring of `AC-20260815-03-14`). readTestFile(f)
// .includes(b.id) (~line 204) hands `-1` a false coverage hit on any file that only ever
// cites `-14`, and the skip-reconciliation's `mappedIds[0]` (~line 385) — the lowest-numbered
// match, by wellFormed's declaration order, not by which AC the test actually belongs to —
// attributes a skip owned by the env-gated `-14` to the ungated `-1`. Two symmetric failures
// from one root cause: a skip that IS sanctioned reads as a hard unsanctioned-skip finding
// (cry-wolf, trains waiving), and an AC that has NO test of its own (`-1`) reads as covered
// (a load-bearing pin invisible to the sweep, same shape as JJ-20260815-01). Measured on the
// prax host, 2026-08-17: 21 false hard findings from this one substring collision. Fix shape:
// anchored/longest-token match — an AC-ID hit must not also count as a hit for any other
// AC-ID that is a proper prefix of it.
//
// Executed against a synthetic host tree, never against script internals.

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer |\n|------|--------|-------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeManifest(dir, lines) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  return p
}

function greenGateManifest(dir) {
  return writeManifest(dir, [
    { leg: 'gate', exit: 0, observed: 'skips=1 todos=0' },
    { leg: 'smoke', exit: 0, observed: 'pass' },
  ])
}

function acMatrixRow(manifestPath, leg) {
  const rows = fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  return rows.find(r => r.leg === leg)
}

test('PRAX-20260817-01: a skip owned by AC-20260815-03-14 is attributed to it (and sanctioned by its own [env:]), not to the shorter AC-20260815-03-1 it happens to prefix', () => {
  const root = tmpdir('acm-prefix-skip')
  fs.mkdirSync(path.join(root, 'specs', '20260815'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })

  const specPath = path.join(root, 'specs', '20260815', '03-x.md')
  fs.writeFileSync(specPath, specMd(
    [
      '- **AC-20260815-03-1** plain criterion with no env gate',
      '- **AC-20260815-03-14** `[env: AI_GATEWAY_API_KEY]` env-gated admission suite',
    ],
    ['| tests/admission.test.ts | CREATE | tests |']
  ))
  fs.writeFileSync(path.join(root, 'tests', 'admission.test.ts'),
    "// AC-20260815-03-14\ntest('admits when gateway key present', () => {})\n")

  const skipsPath = path.join(root, 'skips.txt')
  fs.writeFileSync(skipsPath, 'admits when gateway key present\n')

  const manifestPath = greenGateManifest(root)
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath, '--skips', skipsPath, '--json'])

  let parsed = null
  try {
    parsed = JSON.parse(res.stdout)
  } catch {
    // leave parsed null — the assertion below reports raw stdout for diagnosis
  }
  assert.ok(parsed, 'ac-matrix.js --json must emit parseable JSON: stdout=' + JSON.stringify(res.stdout) +
    ' stderr=' + JSON.stringify(res.stderr))

  assert.ok(
    !parsed.findings.some(f => f.class === 'unsanctioned-skip' && f.ac === 'AC-20260815-03-1'),
    'the skip was attributed to AC-20260815-03-1 (mappedIds[0], the lowest-numbered substring ' +
    'match) instead of the AC-20260815-03-14 that the test file actually cites and whose ' +
    '[env: AI_GATEWAY_API_KEY] declaration sanctions it — a same-NN-group AC-ID that is a proper ' +
    'prefix of another must never be credited with a hit belonging to the longer ID. ' +
    'findings=' + JSON.stringify(parsed.findings))

  const skipRow = acMatrixRow(manifestPath, 'skip-reconcile')
  assert.ok(skipRow, 'ac-matrix.js must append a skip-reconcile manifest row')
  assert.match(skipRow.observed, /sanctioned=1/,
    'the durable skip-reconcile row must record sanctioned=1 once the skip is correctly ' +
    'attributed to AC-20260815-03-14 and read its own [env:] declaration; observed=' +
    JSON.stringify(skipRow.observed))
})

test('PRAX-20260817-01: AC-20260815-03-1, which no test cites on its own, is reported uncovered — a longer AC-ID it merely prefixes does not count as its coverage', () => {
  const root = tmpdir('acm-prefix-coverage')
  fs.mkdirSync(path.join(root, 'specs', '20260815'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })

  const specPath = path.join(root, 'specs', '20260815', '03-x.md')
  fs.writeFileSync(specPath, specMd(
    [
      '- **AC-20260815-03-1** plain criterion with no env gate',
      '- **AC-20260815-03-14** `[env: AI_GATEWAY_API_KEY]` env-gated admission suite',
    ],
    ['| tests/admission.test.ts | CREATE | tests |']
  ))
  fs.writeFileSync(path.join(root, 'tests', 'admission.test.ts'),
    "// AC-20260815-03-14\ntest('admits when gateway key present', () => {})\n")

  const skipsPath = path.join(root, 'skips.txt')
  fs.writeFileSync(skipsPath, 'admits when gateway key present\n')

  const manifestPath = greenGateManifest(root)
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath, '--skips', skipsPath, '--json'])

  let parsed = null
  try {
    parsed = JSON.parse(res.stdout)
  } catch {
    // leave parsed null — the assertion below reports raw stdout for diagnosis
  }
  assert.ok(parsed, 'ac-matrix.js --json must emit parseable JSON: stdout=' + JSON.stringify(res.stdout) +
    ' stderr=' + JSON.stringify(res.stderr))

  assert.ok(
    parsed.findings.some(f => f.class === 'uncovered-ac' && f.ac === 'AC-20260815-03-1'),
    'AC-20260815-03-1 has zero File Plan tests hits of its own (the only file in the tests row ' +
    'cites AC-20260815-03-14, which it merely happens to prefix) yet the durable observed string ' +
    'reads uncovered=0 — a bare substring match on AC-ID text must never let a longer sibling ' +
    'ID satisfy a shorter one\'s coverage. observed=' + JSON.stringify(parsed.observed) +
    ' findings=' + JSON.stringify(parsed.findings))
})
