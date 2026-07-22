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

// --next (2026-07-22): the end-of-run "Next:" line used to be freehand improvisation — no
// doctrine produced it, so it contradicted /spec:status (incident: a spec with `designed:`
// set kept being routed back to /spec:design). The mapping now lives in the script; command
// epilogues print its output verbatim.

test('--next routes hardened+design to /spec:design only until designed: is stamped', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260719/04-ui.md': 'date: 2026-07-19\nstatus: hardened\ndesign: true',
      '20260719/05-ui.md': 'date: 2026-07-19\nstatus: hardened\ndesign: true\ndesigned: 2026-07-21',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /\/spec:design specs\/20260719\/04-ui\.md — hardened \[design\]/, 'no designed: stamp → design stage first, tagged with the same [design] marker as the listing')
  assert.match(r.stdout, /\/spec:build specs\/20260719\/05-ui\.md/, 'designed: set → design already ran, go to build')
  assert.doesNotMatch(r.stdout, /\/spec:design specs\/20260719\/05-ui\.md/, 'the incident: a designed spec must never be routed back to /spec:design')
  const listing = runNode(SCRIPT, ['--root', dir])
  assert.match(listing.stdout, /05-ui\.md — hardened \[designed\]/, 'the open-specs listing distinguishes designed from design-pending')
})

test('--next orders closest-to-done first and sinks blocked specs with blockers named', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260701/01-draft.md': 'date: 2026-07-01\nstatus: draft',
      '20260701/02-ready.md': 'date: 2026-07-01\nstatus: hardened',
      '20260701/03-inflight.md': 'date: 2026-07-01\nstatus: implementing',
      '20260701/04-blocked.md': 'date: 2026-07-01\nstatus: hardened\ndepends_on: [specs/20260701/03-inflight.md]',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = r.stdout.trim().split('\n')
  assert.match(out[0], /^Next: \/spec:review specs\/20260701\/03-inflight\.md/, 'implementing is closest to done — top pick')
  assert.match(out[1], /^Then: \/spec:build specs\/20260701\/02-ready\.md/)
  assert.match(out[2], /^Then: \/spec:plan specs\/20260701\/01-draft\.md/)
  assert.match(out[3], /^Blocked: \/spec:build specs\/20260701\/04-blocked\.md.*waiting on specs\/20260701\/03-inflight\.md \(implementing\)/)
})

test('--next falls through to planning the next ready unplanned brief when all specs are done', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260705/01-billing.md': 'date: 2026-07-05\nstatus: done\nbrief: 02',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^Next: \/spec:plan docs\/roadmap\/03-reports\.md/, 'briefs 01+02 done → 03 is ready to plan')
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[0].action, '/spec:plan')
  assert.strictEqual(j.next[0].brief, '03')
})

test('--next with nothing actionable says so instead of inventing work', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /nothing next — all specs done, no unplanned briefs/)
})

// --next parallel annotation (2026-07-22): among UNBLOCKED entries a spec-level depends_on
// can never link two of them (a non-done dep already sinks an entry to Blocked), so whether
// runner-ups can run alongside the top pick is a brief-level question: shared brief = same
// declared surfaces, a transitive brief dependency path = declared order. Briefless specs
// get no claim — silence over a guessed parallel-ok.

test('--next marks runner-ups from unrelated briefs parallel-ok with the top pick', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
      '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01 · Primary workspaces: web\n',
    },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/02-reports.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /Then: \/spec:build specs\/20260710\/02-reports\.md.*parallel-ok with Next/,
    'briefs 02 and 03 both depend only on done 01 — no path between them, safe to fan out')
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[0].parallel, null, 'the top pick carries no claim about itself')
  assert.strictEqual(j.next[1].parallel, true)
})

test('--next marks a runner-up serial on a shared brief or a brief dependency path', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': BRIEFS['02-billing.md'],
      '03-reports.md': BRIEFS['03-reports.md'], // depends on 01, 02
    },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing-a.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/02-billing-b.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/03-reports.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /02-billing-b\.md.*serial after Next — shared brief 02/,
    'two specs on one brief touch the same declared surfaces')
  assert.match(r.stdout, /03-reports\.md.*serial after Next — brief 03 depends on 02/,
    'a declared brief dependency path forces order even though both specs are unblocked')
})

test('--next makes no parallel claim when a spec has no brief stamp', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260701/01-a.md': 'date: 2026-07-01\nstatus: hardened',
      '20260701/02-b.md': 'date: 2026-07-01\nstatus: hardened',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /parallel-ok|serial after/,
    'no brief = no declared surfaces to compare — silence beats a guessed parallel-ok')
})

// --pretty (2026-07-22): the /spec:status dashboard — the same derivation rendered once,
// deterministically, in the script (verdict line, progress-bar roadmap, parallel lanes,
// anomalies). Exists so the renderer prints verbatim instead of restyling by hand — the
// styling-drift sibling of the freehand-Next incident.

test('--pretty renders verdict, progress-bar roadmap, and collapses unplanned runs', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260701/02-auth-ui.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 01',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--pretty'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout.split('\n')[0], /^🟢 /, 'opens with the verdict line — no anomalies here')
  assert.match(r.stdout, /🔨 01 auth.*▓{5}░{5} 1\/2/, 'in-flight brief gets a half-full bar')
  assert.match(r.stdout, /⬜ 02–03.*unplanned \(2 briefs\)/, 'consecutive unplanned briefs collapse to one row')
  assert.match(r.stdout, /🎯 Next/, 'embeds the next derivation — no second run needed')
})

test('--pretty draws unblocked parallel-ok runner-ups as lanes and sinks serial/blocked', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
      '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01 · Primary workspaces: web\n',
    },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/02-billing-b.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/03-reports.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
      '20260710/04-blocked.md': 'date: 2026-07-10\nstatus: hardened\ndepends_on: [specs/20260710/01-billing.md]',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--pretty'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /⚡ 2 parallel lanes/, 'top pick + parallel-ok runner-up form the lane group')
  assert.match(r.stdout, /┌─ 🔨 \/spec:build 01-billing\.md.*◀ main/, 'the top pick is marked as the main lane, path shortened to basename for narrow terminals')
  assert.match(r.stdout, /└─ 🔨 \/spec:build 03-reports\.md/, 'the parallel-ok runner-up is the second lane')
  assert.match(r.stdout, /02-billing-b\.md.*⛓ shared brief 02/, 'serial runner-up sinks below the lanes with its reason')
  assert.match(r.stdout, /⛔ blocked:\n.*04-blocked\.md\s+⏳ 01-billing\.md/, 'blocked entries close the section, blockers shortened to basenames')
  assert.doesNotMatch(r.stdout, /specs\/20260710/, 'no full spec paths in the dashboard — they wrap narrow terminals; the plain --next keeps them')
})

test('--pretty stands alone: rejects --json, --brief, and --next combinations', () => {
  const dir = host({ briefs: {}, specs: {} })
  for (const extra of [['--json'], ['--brief', '01'], ['--next']]) {
    const r = runNode(SCRIPT, ['--root', dir, '--pretty', ...extra])
    assert.strictEqual(r.status, 2, `--pretty ${extra[0]} must be rejected`)
  }
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
  assert.match(read('spec/commands/status.md'), /spec-status.*--next/s,
    '/spec:status section 2 must print --next verbatim, not re-derive the mapping in prose')
  assert.match(read('spec/commands/status.md'), /--pretty/,
    '/spec:status must render via the deterministic --pretty dashboard, not restyle by hand')
  assert.match(read('spec/commands/review.md'), /spec-status.*--next/s,
    'review close must print --next verbatim — the freehand Next line is the incident this mode kills')
})
