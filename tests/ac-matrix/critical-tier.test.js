'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, runNode, SPEC } = require('../helpers')
const { specMd, writeManifest, run, findings } = require('./ac-matrix.fixtures.js')

// specs/20261025/03-critical-tier-enforces-its-own-rules.md D1-D4:
// AC-20261025-03-1, -2, -4, -5, -6 (ac-matrix.js critical-env-skip and missing-literal arms).

const FM = tier => `---\ntier: ${tier}\n---\n\n`

function criticalHost(prefix, tier) {
  const dir = tmpdir(prefix)
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/e2e.test.js'), '// covers AC-20261025-09-4\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, FM(tier) + specMd(
    ['- **AC-20261025-09-4** `[env: E2E_BASE_URL]`: WHEN X THE SYSTEM SHALL Y → tests/e2e.test.js'],
    ['| tests/e2e.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped e2e for AC-20261025-09-4\n')
  return { dir, spec, manifest, skips }
}

test('AC-20261025-03-1: a tier: critical spec whose own [env:]-gated AC is skipped exits 1 with one hard critical-env-skip finding naming the variable and remedy, no unsanctioned-skip, no sanction warning, observed {skipped:1,sanctioned:0}', () => {
  const h = criticalHost('crit1', 'critical')
  const res = run(h.spec, h.dir, h.manifest, ['--skips', h.skips, '--json'])
  assert.strictEqual(res.status, 1, `a critical spec's own gated skip left exit 0, so the skip gate still sanctions unexecuted runtime evidence (stderr: ${res.stderr})`)
  const out = findings(res)
  const hits = out.findings.filter(f => f.class === 'critical-env-skip')
  assert.strictEqual(hits.length, 1, `expected exactly one critical-env-skip finding, a missing one lets the skip pass silently — got ${JSON.stringify(out.findings)}`)
  assert.strictEqual(hits[0].severity, 'hard', 'a non-hard finding would not turn the findings leg red, so the review could still return CLEAN')
  assert.strictEqual(hits[0].ac, 'AC-20261025-09-4', 'the finding must name the AC so the disposer can find the skipped test')
  assert.match(hits[0].detail, /E2E_BASE_URL/, 'without the variable name the reviewer cannot tell what to provision')
  assert.match(hits[0].detail, /provision/, 'without the remedy the finding gives the orchestrator nothing to act on')
  assert.strictEqual(out.findings.filter(f => f.class === 'unsanctioned-skip').length, 0, 'a double-reported unsanctioned-skip would inflate the hard-finding count')
  assert.ok(!out.warnings.some(w => /sanctioned by/.test(w)), 'a "sanctioned by" warning beside the hard finding contradicts it and re-sanctions the skip')
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 0 },
    `a critical-env-skip counted as sanctioned would make the ledger's testsSkipped lie — got ${JSON.stringify(out.observed.skipReconcile)}`)
})

test('AC-20261025-03-2: the manifest AC-20261025-03-1 appended to, plus a green gate row, makes verdict.js --ledger print HARD_FINDINGS with testsSkipped {total:1,sanctioned:0,unsanctioned:1}', () => {
  const h = criticalHost('crit2', 'critical')
  run(h.spec, h.dir, h.manifest, ['--skips', h.skips, '--json'])
  // verdict.js reports UNVERIFIED until every required leg has a row, so the green gate row is
  // accompanied by the other required legs, all green or inert (see deviations sidecar).
  const legs = [
    { leg: 'gate', exit: 0, observed: { skips: 1, todos: 0, testsExecuted: 2 } },
    { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 5 } },
    { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
    { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } },
    { leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } },
    { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 } },
    { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
    { leg: 'tests', exit: 0, observed: { count: 1 } }
  ]
  fs.appendFileSync(h.manifest, legs.map(l => JSON.stringify(l)).join('\n') + '\n')
  const wf = path.join(h.dir, 'wf.json')
  fs.writeFileSync(wf, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full', tokens: { workflow: 10 } }))
  const v = spawnSync(process.execPath, [path.join(SPEC, 'scripts/verdict.js'), '--manifest', h.manifest, '--workflow', wf, '--retain', path.join(h.dir, 'retain'), '--ledger'], { encoding: 'utf8' })
  let ledger
  try { ledger = JSON.parse(v.stdout.trim().split('\n').pop()) } catch (e) {
    assert.fail(`verdict.js --ledger printed no parseable row, so the critical skip cannot reach a verdict (stderr: ${v.stderr}): ${e.message}`)
  }
  assert.strictEqual(ledger.verdict, 'HARD_FINDINGS', `a red skip-reconcile leg that does not derive HARD_FINDINGS lets a critical review return CLEAN — got ${ledger.verdict}`)
  assert.deepStrictEqual(ledger.testsSkipped, { total: 1, sanctioned: 0, unsanctioned: 1 },
    `the ledger would record the critical skip as sanctioned — got ${JSON.stringify(ledger.testsSkipped)}`)
})

test('AC-20261025-03-4: a tier: critical spec with no AC for a skipped foreign AC-ID keeps the owning-spec sanction, exit 0 with a "sanctioned by [env: TEST_DB] (declared in" warning and observed {skipped:1,sanctioned:1}', () => {
  const dir = tmpdir('crit4')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20261025-09-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, FM('critical') + specMd(
    ['- **AC-20261025-09-1**: WHEN `a` THE SYSTEM SHALL emit `b` → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC |']))
  fs.mkdirSync(path.join(dir, 'specs/20260814'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260814/01-owner.md'), specMd(
    ['- **AC-20260814-01-4** `[env: TEST_DB]`: WHEN X THE SYSTEM SHALL Y → tests/own.test.js'],
    ['| tests/own.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260814-01-4\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  assert.strictEqual(res.status, 0, `the critical tier must not block on a foreign spec's gated pin, or every critical review blocks on CHROME_BIN-style skips (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.warnings.some(w => w.includes('sanctioned by [env: TEST_DB] (declared in')), `the owning-spec warning vanished: ${JSON.stringify(out.warnings)}`)
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 1 }, `the owning-spec skip stopped counting as sanctioned — got ${JSON.stringify(out.observed.skipReconcile)}`)
})

const LITERAL_FREE = '- **AC-20261025-09-1**: WHEN x THE SYSTEM SHALL y → writes tests/a.test.js'
const SLOT_ONLY = '- **AC-20261025-09-2** `[env: FOO]`: WHEN x THE SYSTEM SHALL y → writes tests/a.test.js'
const WITH_LITERAL = '- **AC-20261025-09-3**: WHEN `a` THE SYSTEM SHALL emit `b` → writes tests/a.test.js'

function lintSpec(prefix, relPath, tier, bullets) {
  const dir = tmpdir(prefix)
  const spec = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(spec), { recursive: true })
  fs.writeFileSync(spec, FM(tier) + '# S\n\n## Acceptance Criteria\n\n' + bullets.join('\n') + '\n')
  const res = runNode('scripts/ac-matrix.js', ['--spec', spec, '--lint', '--json'])
  return { res, out: findings(res) }
}

test('AC-20261025-03-5: --lint on a dated tier: critical spec refuses the literal-free bullet and the slot-tag-only bullet as two missing-literal findings, observed.lint.missingLiteral 2', () => {
  const { res, out } = lintSpec('crit5', 'specs/20261025/09-x.md', 'critical', [LITERAL_FREE, SLOT_ONLY, WITH_LITERAL])
  assert.strictEqual(res.status, 1, `exit 0 means a critical AC with no example locks silently (stderr: ${res.stderr})`)
  const hits = out.findings.filter(f => f.class === 'missing-literal')
  assert.deepStrictEqual(hits.map(f => f.ac).sort(), ['AC-20261025-09-1', 'AC-20261025-09-2'],
    `a slot tag's own backticks counted as a literal, or the bare bullet slipped through — got ${JSON.stringify(out.findings)}`)
  for (const f of hits) assert.match(f.detail, /literal example/, `the refusal must tell the plan session what to add — got "${f.detail}"`)
  assert.strictEqual(out.observed.lint.missingLiteral, 2, `the lint counter is what --json consumers read — got ${JSON.stringify(out.observed.lint)}`)
})

test('AC-20261025-03-6: the literal-free bullet lints clean with the pre-existing lint key set for tier: standard, a critical spec dated before 20261025, and a critical spec with no date segment', () => {
  const FIVE = ['malformed', 'invalidPreGreen', 'mixed', 'missingDisposition', 'unresolvedDisposition']
  const cases = [
    ['a standard 20261025', 'specs/20261025/09-x.md', 'standard', FIVE],
    ['b critical 20261024', 'specs/20261024/09-x.md', 'critical', FIVE],
    ['c critical undated', 'spec.md', 'critical', ['malformed', 'invalidPreGreen', 'mixed']]
  ]
  for (const [label, rel, tier, keys] of cases) {
    const { res, out } = lintSpec('crit6', rel, tier, [LITERAL_FREE])
    assert.strictEqual(res.status, 0, `case ${label}: the arm leaked outside tier critical dated on or after 20261025 (stderr: ${res.stderr})`)
    assert.strictEqual(out.findings.length, 0, `case ${label}: a finding outside the arm breaks every existing spec's lock — got ${JSON.stringify(out.findings)}`)
    assert.deepStrictEqual(Object.keys(out.observed.lint), keys, `case ${label}: the observed.lint key set is a frozen --json contract`)
  }
})
