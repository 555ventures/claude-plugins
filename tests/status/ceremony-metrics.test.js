'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261103/13-a-change-is-sized-by-its-files.md D15: spec-status.js prints two 📈 ceremony
// metric lines before the footer, derived from the ledger; --json shapes are untouched.
// Pins AC-20261103-13-9.

const SCRIPT = 'scripts/spec-status.js'

function host(rows) {
  const dir = tmpdir('ceremony-metrics')
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
    '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n| 01 | auth | P0 | — |\n')
  fs.writeFileSync(path.join(dir, 'docs/roadmap/01-auth.md'), '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')
  if (rows) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  }
  return dir
}

const build = (spec, ts) => ({ ts, stage: 'build', spec, runId: 'b_' + ts, gate: { finalRounds: 1, postGate: true } })
const review = (spec, ts, extra) => ({
  ts, stage: 'review', spec, verdict: 'CLEAN', runId: 'r_' + ts,
  legs: [{ leg: 'gate', exit: 0 }, { leg: 'suite', exit: 0, observed: { testsExecuted: 5 } }], ...extra,
})

const ROWS = [
  build('specs/20261101/01-a.md', '2026-11-01T01:00:00Z'),
  review('specs/20261101/01-a.md', '2026-11-01T02:00:00Z', { lines: { tests: 3, production: 2 } }),
  build('specs/20261101/02-b.md', '2026-11-01T03:00:00Z'),
  review('specs/20261101/02-b.md', '2026-11-01T04:00:00Z'),
]

function lastLines(r, n) { return r.stdout.trim().split('\n').slice(-n - 1, -1) }

test('AC-20261103-13-9: spec-status.js prints both 📈 metric lines immediately before the footer over a two-spec ledger', () => {
  const r = runNode(SCRIPT, ['--root', host(ROWS)])
  assert.strictEqual(r.status, 0, 'setup: spec-status.js must exit 0: ' + r.stderr)
  assert.deepStrictEqual(lastLines(r, 2), [
    '📈 suite runs per spec: 2.0 (2 specs)',
    '📈 test:production lines: 1.50 (+3/+2 over 1 close)',
  ], 'the two metric lines must sit directly above the footer — absent, the maintainer has no number for ceremony per spec: ' + r.stdout)
})

test('AC-20261103-13-9: spec-status.js prints n/a metric lines when the ledger is absent', () => {
  const r = runNode(SCRIPT, ['--root', host(null)])
  assert.strictEqual(r.status, 0, 'setup: spec-status.js must exit 0: ' + r.stderr)
  assert.deepStrictEqual(lastLines(r, 2), [
    '📈 suite runs per spec: n/a (0 specs)',
    '📈 test:production lines: n/a (+0/+0 over 0 closes)',
  ], 'an empty host must still print the n/a lines — a missing line hides that nothing is measured: ' + r.stdout)
})

test('AC-20261103-13-9: --json and --next --json emit no metrics key and no 📈 text', () => {
  const dir = host(ROWS)
  for (const args of [['--json'], ['--next', '--json']]) {
    const r = runNode(SCRIPT, ['--root', dir, ...args])
    assert.strictEqual(r.status, 0, 'setup: ' + args.join(' ') + ' must exit 0: ' + r.stderr)
    assert.ok(!r.stdout.includes('📈'), args.join(' ') + ' printed a metric line — the frozen JSON consumers break: ' + r.stdout)
    assert.ok(!/"metrics"/.test(r.stdout), args.join(' ') + ' grew a metrics key — the frozen JSON shape moved: ' + r.stdout)
  }
})
