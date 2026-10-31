'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261029/05-structural-triggers-at-plan-time.md AC-20261029-05-1..5: decision-lint
// reads breaking:, manifest File Plan rows and a non-empty Data Model at lock.

function host() {
  const dir = tmpdir('dl-structural')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ pipelineRules: 'rules.md' }))
  fs.writeFileSync(path.join(dir, 'rules.md'), '# Rules\n\n## Risk Tiers\n\nauth and billing are critical.\n')
  return dir
}

// opts: breaking, tag, tier, fileRows (array of table rows), dataModel (string|null), rel (spec path)
function spec(dir, opts = {}) {
  const rel = opts.rel || 'spec-under-test.md'
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const text = '---\ntier: ' + (opts.tier || 'standard') + '\nbreaking: ' + (opts.breaking === undefined ? 'false' : opts.breaking) + '\n---\n\n# T\n\n' +
    '## Decisions\n\n| ID | Decision | Why |\n|----|----------|-----|\n' +
    '| D1 | Rename the export route. ' + (opts.tag || '') + ' | because |\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    (opts.fileRows || ['| src/app.js | MODIFY | scripts | thing |']).join('\n') + '\n\n' +
    (opts.dataModel === undefined || opts.dataModel === null ? '' : '## Data Model\n\n' + opts.dataModel + '\n\n') +
    '## Acceptance Criteria\n\n- **AC-1**: x\n'
  fs.writeFileSync(file, text)
  return file
}

function lint(dir, file, extra = []) {
  return runNode('scripts/decision-lint.js', ['--spec', file, '--root', dir, ...extra])
}
function lintJson(dir, file) {
  const r = lint(dir, file, ['--json'])
  let j = null
  try { j = JSON.parse(r.stdout) } catch (e) { /* asserted by caller */ }
  return { r, j }
}
const classes = j => j.findings.map(f => f.class)

test('AC-20261029-05-1: breaking: true with no [asked:]/[breaking:] Decision tag exits 1 with exactly one breaking-unasked finding on id frontmatter', () => {
  const dir = host()
  const r = lint(dir, spec(dir, { breaking: 'true' }))
  assert.strictEqual(r.status, 1, 'a breaking spec with no tagged Decision would lock silently: ' + r.stderr + r.stdout)
  assert.match(r.stdout, /^ {2}breaking-unasked frontmatter:/m, 'the finding line is the contract plan.md quotes to the author')
  assert.strictEqual((r.stdout.match(/breaking-unasked/g) || []).length, 1, 'exactly one breaking finding must be emitted, not one per Decision')
})

test('AC-20261029-05-1: a [breaking: …] tag on a live Decision row, or breaking: false, yields exit 0 with zero findings', () => {
  const dir = host()
  const untagged = lint(dir, spec(dir, { breaking: 'true', rel: 'u.md' }))
  assert.strictEqual(untagged.status, 1, 'the control (same spec untagged) must be refused, else the exit-0 cases below prove nothing: ' + untagged.stdout)
  const tagged = lint(dir, spec(dir, { breaking: 'true', tag: '[breaking: the /v1/export route is removed]', rel: 'a.md' }))
  assert.strictEqual(tagged.status, 0, 'a tagged breaking Decision must satisfy the lint: ' + tagged.stdout + tagged.stderr)
  const asked = lint(dir, spec(dir, { breaking: 'true', tag: '[asked: user chose to break v1]', rel: 'b.md' }))
  assert.strictEqual(asked.status, 0, 'an [asked:] tag must satisfy the lint too: ' + asked.stdout + asked.stderr)
  const off = lint(dir, spec(dir, { breaking: 'false', rel: 'c.md' }))
  assert.strictEqual(off.status, 0, 'breaking: false must emit nothing: ' + off.stdout + off.stderr)
  assert.match(off.stdout, /findings=0/, 'breaking: false must report zero findings')
})

test('AC-20261029-05-2: a manifest row with a name-less Summary prints the notice and one missing-dependency-names finding', () => {
  const dir = host()
  const r = lint(dir, spec(dir, { fileRows: ['| package.json | MODIFY | other | dependency bump |'] }))
  assert.strictEqual(r.status, 1, 'a manifest row naming no package would lock silently: ' + r.stderr + r.stdout)
  assert.match(r.stdout, /📌 adds or changes dependencies — package\.json \(veto anytime\)/, 'the advisory notice is what the owner sees at lock')
  assert.match(r.stdout, /^ {2}missing-dependency-names package\.json:/m, 'the finding must carry the manifest path as id')
})

test('AC-20261029-05-2: a manifest row naming packages in backticks prints the notice and no finding; `no dependency change` prints neither; a source row prints nothing', () => {
  const dir = host()
  const named = lint(dir, spec(dir, { fileRows: ['| package.json | MODIFY | other | adds `zod@3` |'], rel: 'a.md' }))
  assert.strictEqual(named.status, 0, 'notices alone must never change the exit code: ' + named.stdout + named.stderr)
  assert.match(named.stdout, /📌 adds or changes dependencies — package\.json \(veto anytime\)/, 'a named-package row still prints the notice')
  const none = lint(dir, spec(dir, { fileRows: ['| package.json | MODIFY | other | no dependency change |'], rel: 'b.md' }))
  assert.strictEqual(none.status, 0, 'the explicit escape must pass: ' + none.stdout + none.stderr)
  assert.doesNotMatch(none.stdout, /📌/, 'the escape literal must print no notice')
  const src = lint(dir, spec(dir, { fileRows: ['| src/app.js | MODIFY | scripts | thing |'], rel: 'c.md' }))
  assert.doesNotMatch(src.stdout, /📌|missing-dependency-names/, 'a non-manifest path must print nothing')
})

test('AC-20261029-05-2: --json carries notices and counts.dependencyRows equal to the notice count', () => {
  const dir = host()
  const { r, j } = lintJson(dir, spec(dir, { fileRows: ['| package.json | MODIFY | other | adds `zod@3` |'] }))
  assert.ok(j, '--json must print parseable JSON: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(j.notices, [{ kind: 'dependency-row', path: 'package.json' }], 'tooling would not see the dependency notice in --json')
  assert.strictEqual(j.counts.dependencyRows, 1, 'dependencyRows must equal the number of notices')
})

test('AC-20261029-05-3: a non-empty Data Model on tier: standard exits 1 with one data-model-requires-critical finding; tier: critical exits 0 with counts.dataModel 1', () => {
  const dir = host()
  const dm = 'tables: orders gains column refunded_at\nexisting rows: unaffected'
  const std = lint(dir, spec(dir, { dataModel: dm, tier: 'standard' }))
  assert.strictEqual(std.status, 1, 'a persisted-data change on a standard spec would lock without the critical confirmation: ' + std.stdout + std.stderr)
  assert.match(std.stdout, /^ {2}data-model-requires-critical Data Model:/m, 'the finding must carry id Data Model')
  assert.strictEqual((std.stdout.match(/data-model-requires-critical/g) || []).length, 1, 'exactly one tier finding')
  const { r, j } = lintJson(dir, spec(dir, { dataModel: dm, tier: 'critical', rel: 'crit.md' }))
  assert.strictEqual(r.status, 0, 'a critical spec with the existing rows line is clean: ' + r.stdout + r.stderr)
  assert.strictEqual(j.findings.length, 0, 'zero findings expected on critical tier')
  assert.strictEqual(j.counts.dataModel, 1, 'counts.dataModel must be 1 for a non-empty section')
})

test('AC-20261029-05-4: a non-empty Data Model without an existing rows: line reports missing-existing-rows-line; with the line it does not', () => {
  const dir = host()
  const bad = lint(dir, spec(dir, { dataModel: 'tables: orders gains column refunded_at', tier: 'critical' }))
  assert.match(bad.stdout, /missing-existing-rows-line/, 'without the line the owner is never told whether live rows change')
  const ok = lint(dir, spec(dir, { dataModel: 'tables: orders gains column\nexisting rows: unaffected', tier: 'critical', rel: 'ok.md' }))
  assert.doesNotMatch(ok.stdout, /missing-existing-rows-line/, 'the grammar line must satisfy the check')
})

test('AC-20261029-05-4: a placeholder-only or absent Data Model reports neither Data Model class and counts.dataModel is 0', () => {
  const dir = host()
  const ph = lintJson(dir, spec(dir, { dataModel: '{ Persistence changes: tables, columns, migrations }', tier: 'standard' }))
  assert.ok(ph.j, 'must print JSON: ' + ph.r.stdout + ph.r.stderr)
  assert.ok(!classes(ph.j).includes('data-model-requires-critical') && !classes(ph.j).includes('missing-existing-rows-line'),
    'the template placeholder must count as empty or every fresh spec would be refused')
  assert.strictEqual(ph.j.counts.dataModel, 0, 'placeholder-only means dataModel 0')
  const none = lintJson(dir, spec(dir, { rel: 'none.md' }))
  assert.ok(none.j && none.j.counts.dataModel === 0, 'an absent section means dataModel 0')
})

test('AC-20261029-05-5: a spec dated before STRUCTURAL_LINT_APPLIES_FROM emits nothing, the same content at specs/20261029/ emits all four classes, and the summary line and counts keys hold', () => {
  const sections = require('../../spec/scripts/lib/spec-sections')
  assert.strictEqual(sections.STRUCTURAL_LINT_APPLIES_FROM, '20261029', 'lib/spec-sections.js must export the structural cutoff')
  const dir = host()
  const content = { breaking: 'true', fileRows: ['| package.json | MODIFY | other | |'], dataModel: 'tables: x', tier: 'standard' }
  const old = lintJson(dir, spec(dir, { ...content, rel: 'specs/20261025/01-x.md' }))
  assert.ok(old.j, 'must print JSON: ' + old.r.stdout + old.r.stderr)
  assert.strictEqual(old.r.status, 0, 'history must never redden: ' + old.r.stdout)
  assert.strictEqual(old.j.findings.length, 0, 'pre-cutoff spec must emit zero findings')
  assert.ok(!(old.j.notices || []).length, 'pre-cutoff spec must emit zero notices')
  const cur = lintJson(dir, spec(dir, { ...content, rel: 'specs/20261029/09-x.md' }))
  assert.ok(cur.j, 'must print JSON: ' + cur.r.stdout + cur.r.stderr)
  const cls = classes(cur.j)
  for (const c of ['breaking-unasked', 'missing-dependency-names', 'data-model-requires-critical', 'missing-existing-rows-line']) {
    assert.ok(cls.includes(c), c + ' must fire on a post-cutoff spec carrying all four triggers; got ' + cls.join(','))
  }
  for (const k of ['breaking', 'dependencyRows', 'dataModel']) {
    assert.ok(k in cur.j.counts, 'counts must carry ' + k)
  }
  const plain = lint(dir, path.join(dir, 'specs/20261029/09-x.md'))
  assert.match(plain.stdout.split('\n')[0], /^decision-lint: restrictions=\d+ deferrals=\d+ findings=\d+$/,
    'plan.md copies this summary line into the ledger, so it must stay byte-shaped')
})
