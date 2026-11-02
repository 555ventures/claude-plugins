'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261102/02-additive-data-model-stays-standard.md AC-20261102-02-1, -3, -4, -7:
// decision-lint lets a declared additive-only Data Model stay standard and refuses a contradicted claim.

function host() {
  const dir = tmpdir('dl-additive')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ pipelineRules: 'rules.md' }))
  fs.writeFileSync(path.join(dir, 'rules.md'), '# Rules\n\n## Risk Tiers\n\nauth and billing are critical.\n')
  return dir
}

function spec(dir, dataModel, tier, rel) {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '---\ntier: ' + tier + '\nbreaking: false\n---\n\n# T\n\n' +
    '## Decisions\n\n| ID | Decision | Why |\n|----|----------|-----|\n| D1 | Add a column. | because |\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n| src/app.js | MODIFY | scripts | thing |\n\n' +
    '## Data Model\n\n' + dataModel + '\n\n## Acceptance Criteria\n\n- **AC-1**: x\n')
  return file
}

function lint(dir, file, extra = []) {
  const r = runNode('scripts/decision-lint.js', ['--spec', file, '--root', dir, ...extra])
  let j = null
  try { j = JSON.parse(r.stdout) } catch (e) { /* asserted by caller */ }
  return { r, j }
}
const count = (r, cls) => (r.stdout.match(new RegExp(cls, 'g')) || []).length

const ADD = 'tables: orders gains nullable column refunded_at\nchanges: additive-only\nexisting rows: unaffected'

test('AC-20261102-02-1: an additive-only unaffected Data Model on tier: standard exits 0 with zero findings and --json counts dataModel 1 and additiveDataModel 1', () => {
  const dir = host()
  const { r, j } = lint(dir, spec(dir, ADD, 'standard', 'specs/20261102/09-x.md'), ['--json'])
  assert.ok(j, '--json must print parseable JSON: ' + r.stdout + r.stderr)
  assert.strictEqual(r.status, 0, 'the declared carve-out would still force critical on every additive spec: ' + r.stdout + r.stderr)
  assert.strictEqual(j.findings.length, 0, 'zero findings expected for a clean declaration: ' + JSON.stringify(j.findings))
  assert.strictEqual(j.counts.dataModel, 1, 'counts.dataModel must be 1 for a non-empty section')
  assert.strictEqual(j.counts.additiveDataModel, 1, 'tooling could not see the carve-out being used without counts.additiveDataModel')
})

test('AC-20261102-02-3: additive-only plus an existing rows value other than unaffected is refused with additive-claim-contradicted quoting the line, on standard and critical', () => {
  const dir = host()
  const dm = 'tables: orders gains column refunded_at\nchanges: additive-only\nexisting rows: backfilled from created_at'
  const std = lint(dir, spec(dir, dm, 'standard', 'specs/20261102/09-s.md')).r
  assert.strictEqual(std.status, 1, 'a self-refuted additive claim would lock on standard: ' + std.stdout + std.stderr)
  assert.strictEqual(count(std, 'additive-claim-contradicted'), 1, 'exactly one contradiction finding expected: ' + std.stdout)
  assert.match(std.stdout, /existing rows: backfilled from created_at/, 'the detail must quote the offending line so the author can fix it')
  assert.strictEqual(count(std, 'data-model-requires-critical'), 1, 'a contradicted declaration on standard must also carry the tier demand: ' + std.stdout)
  const crit = lint(dir, spec(dir, dm, 'critical', 'specs/20261102/09-c.md')).r
  assert.strictEqual(crit.status, 1, 'the contradiction must be raised on critical too, or the lie survives a tier flip: ' + crit.stdout + crit.stderr)
  assert.strictEqual(count(crit, 'additive-claim-contradicted'), 1, 'one contradiction finding on critical: ' + crit.stdout)
  assert.strictEqual(count(crit, 'data-model-requires-critical'), 0, 'critical tier must not carry the tier demand: ' + crit.stdout)
})

test('AC-20261102-02-3: additive-only plus a drop column line is refused with additive-claim-contradicted quoting that line, on standard and critical', () => {
  const dir = host()
  const dm = 'changes: additive-only\nexisting rows: unaffected\ndrop column legacy_total'
  for (const tier of ['standard', 'critical']) {
    const r = lint(dir, spec(dir, dm, tier, 'specs/20261102/09-' + tier + '.md')).r
    assert.strictEqual(r.status, 1, 'a drop under an additive claim would lock on ' + tier + ': ' + r.stdout + r.stderr)
    assert.strictEqual(count(r, 'additive-claim-contradicted'), 1, 'one contradiction finding on ' + tier + ': ' + r.stdout)
    assert.match(r.stdout, /drop column legacy_total/, 'the detail must quote the migrating line on ' + tier)
  }
  const std = lint(dir, spec(dir, dm, 'standard', 'specs/20261102/09-both.md')).r
  assert.strictEqual(count(std, 'data-model-requires-critical'), 1, 'standard tier must also carry the tier demand: ' + std.stdout)
})

test('AC-20261102-02-4: counts.additiveDataModel is 1 on the additive spec and 0 on a non-empty section without a changes line, and the plain first line keeps its byte shape', () => {
  const dir = host()
  const addFile = spec(dir, ADD, 'standard', 'specs/20261102/09-a.md')
  const add = lint(dir, addFile, ['--json'])
  assert.ok(add.j && add.j.counts.additiveDataModel === 1, 'additiveDataModel must be 1 for the declared carve-out: ' + add.r.stdout + add.r.stderr)
  const none = lint(dir, spec(dir, 'tables: orders gains column\nexisting rows: unaffected', 'critical', 'specs/20261102/09-n.md'), ['--json'])
  assert.ok(none.j && none.j.counts.dataModel === 1 && none.j.counts.additiveDataModel === 0,
    'additiveDataModel must be 0 with no changes: line, or tooling over-counts carve-outs: ' + none.r.stdout + none.r.stderr)
  const plain = lint(dir, addFile).r
  assert.match(plain.stdout.split('\n')[0], /^decision-lint: restrictions=\d+ deferrals=\d+ findings=\d+$/,
    'plan.md copies this summary line into the ledger, so it must stay byte-shaped')
})

test('AC-20261102-02-7: not null with a default on the line passes the additive declaration; not null without a default is refused quoting the line', () => {
  const dir = host()
  const base = 'changes: additive-only\nexisting rows: unaffected\n'
  const ok = lint(dir, spec(dir, base + 'column paid_cents integer not null default 0', 'standard', 'specs/20261102/09-ok.md')).r
  assert.strictEqual(ok.status, 0, 'a defaulted not-null column is additive and must pass: ' + ok.stdout + ok.stderr)
  const bad = lint(dir, spec(dir, base + 'column paid_cents integer not null', 'standard', 'specs/20261102/09-bad.md')).r
  assert.strictEqual(bad.status, 1, 'a not-null column with no default breaks existing rows and must be refused: ' + bad.stdout + bad.stderr)
  assert.strictEqual(count(bad, 'additive-claim-contradicted'), 1, 'one contradiction finding expected: ' + bad.stdout)
  assert.match(bad.stdout, /column paid_cents integer not null/, 'the detail must quote the offending line')
})
