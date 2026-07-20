'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode } = require('./helpers')

// /spec:status derivation (2026-07-19): brief/spec status is never stored, only derived from
// spec frontmatter per doctor check 14 — this script is the single shared derivation behind
// /spec:status, doctor check 14, and /spec:plan's Phase 0 dependency preflight. The incident
// class it exists for: a roadmap brief silently skipped (later briefs planned/built on top of
// an unplanned dependency), discovered only when the missing surface is needed.

const SCRIPT = 'scripts/spec-status.js'

function host({ briefs = {}, specs = {}, overviewRow = null } = {}) {
  const dir = tmpdir('spec-status')
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
    '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n' +
    (overviewRow ? overviewRow + '\n' : '| 01 | auth | P0 | — |\n'))
  for (const [file, header] of Object.entries(briefs)) {
    fs.writeFileSync(path.join(dir, 'docs/roadmap', file), header)
  }
  for (const [file, fm] of Object.entries(specs)) {
    const p = path.join(dir, 'specs', file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '---\n' + fm + '\n---\n\n# spec\n')
  }
  return dir
}

const BRIEFS = {
  '01-auth.md': '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
  '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
  '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01, 02 ·\nPrimary workspaces: web\n',
}

test('derives unplanned / in-flight / done per doctor check 14', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-reports-ui.md': 'date: 2026-07-10\nstatus: implementing\nbrief: 03',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  const by = Object.fromEntries(out.briefs.map(b => [b.num, b.status]))
  assert.deepStrictEqual(by, { '01': 'done', '02': 'unplanned', '03': 'in-flight' })
})

test('flags a skipped brief: in-flight work on top of an unplanned dependency', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-reports-ui.md': 'date: 2026-07-10\nstatus: implementing\nbrief: 03',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, 'anomalies are report lines, not failures')
  assert.match(r.stdout, /skipped-brief/, 'unplanned dependency under a moved brief must be flagged')
  assert.match(r.stdout, /02-billing\.md/, 'the remedy names the brief to plan')
})

test('--brief preflight: exit 1 with unmet dependencies, 0 when met', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  const unmet = runNode(SCRIPT, ['--root', dir, '--brief', '3'])
  assert.strictEqual(unmet.status, 1, 'brief 03 depends on unplanned 02')
  assert.match(unmet.stdout, /02/, 'names the unmet dependency')
  const met = runNode(SCRIPT, ['--root', dir, '--brief', '02'])
  assert.strictEqual(met.status, 0, 'brief 02 depends only on done 01: ' + met.stdout)
})

test('flags orphan brief stamps and hand-tracked overview status', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 07' },
    overviewRow: '| 01 | auth | P0 | — | ✅ done |',
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /orphan-stamp/, 'brief: 07 matches no roadmap file')
  assert.match(r.stdout, /hand-tracked-status/, 'status column in the Sequence table is drift')
})

test('hand-tracked detection is whole-cell: a brief NAMED after a status word is not drift', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
    overviewRow: '| 01 | mark-as-done flow | P0 | — |',
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.doesNotMatch(r.stdout, /hand-tracked-status/, 'substring match on a brief name is a false positive')
})

test('a wrapped Depends on list does not silently drop dependencies', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': BRIEFS['02-billing.md'],
      '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01,\n02 · Primary workspaces: web\n',
    },
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--brief', '03'])
  assert.strictEqual(r.status, 1, 'the dependency on the wrapped continuation line (02, unplanned) must count')
  assert.match(r.stdout, /02/, 'names the dependency that wrapped')
})

test('lettered ad-hoc briefs (04b between 04 and 05) are first-class brief ids', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '01b-sso.md': '# 01b — SSO\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
      '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01b · Primary workspaces: api\n',
    },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260705/01-sso.md': 'date: 2026-07-05\nstatus: done\nbrief: 1B-sso',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  const by = Object.fromEntries(out.briefs.map(b => [b.num, b.status]))
  assert.deepStrictEqual(by, { '01': 'done', '01b': 'done', '02': 'unplanned' },
    'the lettered brief registers and any brief: spelling (1B-sso) normalizes onto it')
  assert.strictEqual(out.anomalies.filter(a => a.kind === 'orphan-stamp').length, 0,
    'a spec stamped with a lettered brief must not be reported as an orphan stamp')
  assert.strictEqual(out.anomalies.filter(a => a.kind === 'out-of-order').length, 0,
    '01b sits between 01 and 02, not after the moved briefs — ordering must handle the letter')

  const pre = runNode(SCRIPT, ['--root', dir, '--brief', '2'])
  assert.strictEqual(pre.status, 0, 'brief 02 depends on lettered 01b, which is done: ' + pre.stdout)
})

test('open specs carry the [design] marker so the renderer can route to /spec:design', () => {
  const dir = host({
    briefs: {},
    specs: { '20260701/01-ui.md': 'date: 2026-07-01\nstatus: hardened\ndesign: true' },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.match(r.stdout, /01-ui\.md — hardened \[design\]/, 'design: true must surface in the open-specs line')
})

test('flags a done spec whose depends_on spec is not done', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260701/01-base.md': 'date: 2026-07-01\nstatus: implementing',
      '20260710/01-top.md': 'date: 2026-07-10\nstatus: done\ndepends_on: [specs/20260701/01-base.md]',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.match(r.stdout, /skipped-spec/, 'done work atop an unfinished dependency must be flagged')
})

test('roadmap-less host still reports open specs, no crash', () => {
  const dir = tmpdir('spec-status')
  fs.mkdirSync(path.join(dir, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260701/01-a.md'), '---\nstatus: hardened\n---\n# a\n')
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /01-a\.md — hardened/, 'open specs listed without a roadmap')
})

test('consumers are wired to the one derivation', () => {
  assert.match(read('spec/bin/spec-paths'), /spec-status\)\s+echo "\$ROOT\/scripts\/spec-status\.js"/,
    'spec-paths must expose the script')
  assert.match(read('spec/commands/status.md'), /spec-paths spec-status/,
    '/spec:status must run the script, not re-derive in prose')
  assert.match(read('spec/commands/doctor.md'), /spec-paths spec-status/,
    'doctor check 14 must run the script, not re-describe the greps')
  assert.match(read('spec/commands/plan.md'), /spec-paths spec-status.*--brief/,
    'plan Phase 0 dependency preflight must use --brief mode')
})
