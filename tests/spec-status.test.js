'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode } = require('./helpers')

// /spec:status derivation: brief/spec status is never stored, only derived from
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
  for (const [file, val] of Object.entries(specs)) {
    const p = path.join(dir, 'specs', file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    // val is either the plain frontmatter string (existing call sites) or { fm, body } when a
    // test needs body content (e.g. a File Plan table) below the frontmatter.
    const fm = typeof val === 'string' ? val : val.fm
    const body = typeof val === 'string' ? '# spec\n' : (val.body || '# spec\n')
    fs.writeFileSync(p, '---\n' + fm + '\n---\n\n' + body)
  }
  return dir
}

const BRIEFS = {
  '01-auth.md': '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
  '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
  '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01, 02 ·\nPrimary workspaces: web\n',
}

// AC-20260805-01-7 (sanctioned pin exception, green pre-change): --json output must stay
// byte-identical after parseFilePlan/splitPlanCell move into spec/scripts/lib/file-plan.js —
// the lib extraction is invisible at the CLI.
// AC-20260805-03-7 / AC-20260807-01-11 (sanctioned pin exception, green pre-change): every test
// in this file already exercises a host with no `.claude/spec-runs.jsonl` (the `host()` fixture
// never writes one) — status/--next/--brief derivation must stay unchanged when the ledger is
// absent, across observe-ci.js's spec 03 introduction AND spec 20260807/01's D2/D3 slim
// (identified by name per specs/20260807/01-observation-red-alarm.md's File Plan, not line
// number — this is the test the AC retags).
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

// AC-20260805-01-7 (sanctioned pin exception, green pre-change): --brief output must stay
// byte-identical after the lib extraction (D2).
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

// Phantom-blocker incident: a spec reference on the Depends on: line
// (`Depends on: spec 20260804/02 at done`) was digit-harvested into brief deps 20260804
// (can never exist → permanent exit 1) and 02 (binds to an unrelated real brief). The
// --brief preflight feeds /spec:plan Phase 0's warn-and-confirm, so a false blocker
// trains click-through on real ones. Deps now parse item-wise: exact brief tokens only.
test('a spec reference on the Depends on line is not harvested into phantom brief deps', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': BRIEFS['02-billing.md'],
      '18-foo.md': '# 18 — Foo\n\nPhase: P1 · Depends on: spec 20260804/02 at done · Primary workspaces: api\n',
    },
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--brief', '18'])
  assert.strictEqual(r.status, 0, 'a spec id in prose must not become an unmet brief dependency (phantom blocker): ' + r.stdout)
  assert.doesNotMatch(r.stdout, /20260804/, 'the spec date fragment must not register as a dependency')
  assert.doesNotMatch(r.stdout, /UNMET/, 'the 02 fragment must not bind to the real (unplanned) brief 02')

  const full = runNode(SCRIPT, ['--root', dir, '--json'])
  const rej = JSON.parse(full.stdout).anomalies.filter(a => a.kind === 'unparsed-dependency')
  assert.strictEqual(rej.length, 1, 'the ignored prose item must surface as an anomaly, not vanish silently')
  assert.match(rej[0].detail, /spec 20260804\/02 at done/, 'the anomaly names the item so a typo\'d brief id stays findable')
})

test('a typo\'d brief id in Depends on surfaces as an anomaly instead of silently dropping', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 0 1 · Primary workspaces: api\n',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const rej = JSON.parse(r.stdout).anomalies.filter(a => a.kind === 'unparsed-dependency')
  assert.strictEqual(rej.length, 1, 'a mistyped brief id must stay visible in the dependency graph report')
})

// A brief id followed by a parenthetical note (`16 (the review driver this brief mirrors)`)
// is how briefs are actually written; rejecting it dropped real dependencies (18, 19, 23)
// from the graph while printing four remediation paragraphs. The note is ignored, the id binds,
// and a comma inside the note never splits the item.
test('a brief id with a trailing parenthetical note binds as a dependency, not an anomaly', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 (auth — sessions, tokens\nand refresh), 03 (design; the atlas is its output) · Primary workspaces: api\n',
      '03-design.md': '# 03 — Design\n\nPhase: P0 · Depends on: none · Primary workspaces: ui\n',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout)
  const b2 = j.briefs.find(b => b.num === '02')
  assert.deepStrictEqual(b2.depends_on, ['01', '03'], 'both ids bind; the notes (with their comma and line break) are ignored')
  assert.strictEqual(j.anomalies.filter(a => a.kind === 'unparsed-dependency').length, 0, 'an author\'s note is not an anomaly')
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

test('AC-20260901-10-4: a design: true spec routes to /spec:run in the dashboard, not /spec:design', () => {
  const dir = host({
    briefs: {},
    specs: { '20260701/01-ui.md': 'date: 2026-07-01\nstatus: hardened\ndesign: true' },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.match(r.stdout, /\/spec:run @specs\/20260701\/01-ui\.md/, 'AC-20260901-10-4/D5: design: true must surface as /spec:run — the loop derives design-due itself, so the dashboard no longer names /spec:design as a next-command')
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

test('AC-20260901-10-4: roadmap-less host still reports open specs as /spec:run, no crash', () => {
  const dir = tmpdir('spec-status')
  fs.mkdirSync(path.join(dir, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260701/01-a.md'), '---\nstatus: hardened\n---\n# a\n')
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /\/spec:run @specs\/20260701\/01-a\.md/, 'AC-20260901-10-4/D5: open spec surfaces in 🎯 Next without a roadmap, as /spec:run')
})

// --next: the end-of-run "Next:" line was freehand improvisation — no
// doctrine produced it, so it contradicted /spec:status (incident: a spec with `designed:`
// set kept being routed back to /spec:design). The mapping lives in the script; command
// epilogues print its output verbatim.
//
// AC-20260824-02-4 (specs/20260824/02-design-stage-on-render-gate.md D16, tagged in place):
// specs/20260824/02 replaces the design stage's interior (driver, wf-design, skeletons-check)
// but keeps its seat in the state machine — this routing must stay observed unchanged, a
// SHALL-CONTINUE-TO regression pin that is green at HEAD by design, not a new behavior.

test('AC-20260824-02-4 (SHALL CONTINUE TO) / AC-20260901-10-4: --next routes both design-pending and designed hardened specs to /spec:run, distinguished only by the note', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260719/04-ui.md': 'date: 2026-07-19\nstatus: hardened\ndesign: true',
      '20260719/05-ui.md': 'date: 2026-07-19\nstatus: hardened\ndesign: true\ndesigned: 2026-07-21',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  const by = Object.fromEntries(j.next.map(e => [e.path, e.action]))
  assert.strictEqual(by['specs/20260719/04-ui.md'], '/spec:run', 'AC-20260901-10-4/D5: no designed: stamp → the loop, which runs design when due, not the narrower /spec:design action')
  assert.strictEqual(by['specs/20260719/05-ui.md'], '/spec:run', 'AC-20260901-10-4/D5: designed: set → the loop still, never /spec:build — the frozen action set no longer emits stage-specific actions for a hardened spec')
  assert.match(j.next.find(e => e.path.endsWith('05-ui.md')).note, /\[designed\]/, 'AC-20260824-02-4 (SHALL CONTINUE TO): the note still distinguishes designed from design-pending even though both now derive the same /spec:run action')
})

test('AC-20260901-10-4: --next orders closest-to-done first (both implementing and hardened as /spec:run) and sinks blocked specs with blockers named', () => {
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
  assert.strictEqual(r.stdout.trim(), '🎯 Next\n/spec:run @specs/20260701/03-inflight.md',
    'AC-20260901-10-4/D5: implementing is closest to done — the lean view prints exactly the top pick, as /spec:run')
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.deepStrictEqual(j.next.map(e => `${e.action} ${e.path}`), [
    '/spec:run specs/20260701/03-inflight.md',
    '/spec:run specs/20260701/02-ready.md',
    '/spec:plan specs/20260701/01-draft.md',
    '/spec:run specs/20260701/04-blocked.md',
  ], 'AC-20260901-10-4/D5: closest-to-done first, blocked entry sinks last — implementing and hardened both derive /spec:run now, never /spec:review or /spec:build')
  assert.deepStrictEqual(j.next[3].blockers, ['specs/20260701/03-inflight.md (implementing)'], 'blocker named on the blocked entry')
})

// AC-20260901-10-6 (D5): the --json action set shrinks from five strings to three —
// /spec:plan | /spec:run | /spec:escape — with /spec:design, /spec:build, and /spec:review
// never emitted. Two hosts, not one: spec-status.js's own fallback gate (line ~510,
// `if (readyBriefs.length && !entries.some(e => !e.blockers.length))`) only ever adds a
// /spec:plan entry when NO other entry is unblocked, and /spec:run/​/spec:escape entries are
// always unblocked — so /spec:plan can never coexist with /spec:run or /spec:escape in one
// call. Host A carries a hardened spec, an implementing spec, and an open escape (a
// red-observation ledger row — D2/qualifyingObservation, spec/scripts/lib/observation.js, an
// offline read of .claude/spec-runs.jsonl with no git-repo dependency, so this host writes one
// directly rather than reaching for tests/queue/queue-overlay.test.js's queue-file fixture).
// Host B carries only a done spec, so the unplanned dependency-met brief 03 is the sole
// (fallback) pick. Both hosts assert the negative — the forbidden three never appear — and
// together they cover the positive presence of all three surviving actions.
test('AC-20260901-10-6: --json emits only /spec:plan | /spec:run | /spec:escape action values, never /spec:design, /spec:build, or /spec:review', () => {
  const dirA = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/02-billing.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/03-reports.md': 'date: 2026-07-10\nstatus: implementing\nbrief: n/a',
    },
  })
  const redSpecPath = 'specs/20260701/01-auth-core.md'
  fs.mkdirSync(path.join(dirA, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dirA, '.claude/spec-runs.jsonl'), JSON.stringify({
    ts: '2026-08-20', stage: 'observe', spec: redSpecPath, branch: 'main', ci: 'red',
    sha: 'deadbee', url: 'https://github.com/x/y/actions/runs/9', runAt: '2026-08-20T09:00:00Z',
  }) + '\n')
  const rA = runNode(SCRIPT, ['--root', dirA, '--next', '--json'])
  assert.strictEqual(rA.status, 0, rA.stderr)
  const jA = JSON.parse(rA.stdout)
  const actionsA = new Set(jA.next.map(e => e.action))

  const dirB = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/02-billing.md': 'date: 2026-07-10\nstatus: done\nbrief: 02',
    },
  })
  const rB = runNode(SCRIPT, ['--root', dirB, '--next', '--json'])
  assert.strictEqual(rB.status, 0, rB.stderr)
  const jB = JSON.parse(rB.stdout)
  const actionsB = new Set(jB.next.map(e => e.action))

  for (const [label, actions, j] of [['A', actionsA, jA], ['B', actionsB, jB]]) {
    for (const forbidden of ['/spec:design', '/spec:build', '/spec:review']) {
      assert.ok(!actions.has(forbidden), `AC-20260901-10-6/D5: the --json action set must never emit ${forbidden} — the frozen set shrinks to /spec:plan | /spec:run | /spec:escape (host ${label}): ${JSON.stringify([...actions])}`)
    }
    for (const a of actions) {
      assert.ok(['/spec:plan', '/spec:run', '/spec:escape'].includes(a),
        `AC-20260901-10-6/D5: every --json action value must be one of /spec:plan, /spec:run, or /spec:escape — got ${a} (host ${label}): ${JSON.stringify(j.next)}`)
    }
  }
  assert.ok(actionsA.has('/spec:run'), 'AC-20260901-10-6/D5: the hardened and implementing specs must both surface as /spec:run entries: ' + JSON.stringify(jA.next))
  assert.ok(actionsA.has('/spec:escape'), 'AC-20260901-10-6/D5: the red-observation ledger row for the done spec must surface as an /spec:escape entry: ' + JSON.stringify(jA.next))
  assert.ok(actionsB.has('/spec:plan'), 'AC-20260901-10-6/D5: brief 03\'s unplanned, dependency-met status must surface as the fallback /spec:plan pick once every spec is done: ' + JSON.stringify(jB.next))
})

test('AC-20260901-10-5 (SHALL CONTINUE TO): --next falls through to planning the next ready unplanned brief when all specs are done', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260705/01-billing.md': 'date: 2026-07-05\nstatus: done\nbrief: 02',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^🎯 Next\n\/spec:plan @docs\/roadmap\/03-reports\.md$/m, 'AC-20260901-10-5 (SHALL CONTINUE TO)/D5: an unplanned brief whose dependencies are met must continue to derive /spec:plan, unchanged by this spec')
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[0].action, '/spec:plan')
  assert.strictEqual(j.next[0].brief, '03')
})

// --next parallel annotation: among UNBLOCKED entries a spec-level depends_on
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
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[0].parallel, null, 'the top pick carries no claim about itself')
  assert.strictEqual(j.next[1].parallel, true,
    'briefs 02 and 03 both depend only on done 01 — no path between them, safe to fan out')
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
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  const by = Object.fromEntries(j.next.map(e => [e.path, e]))
  const billing = by['specs/20260710/02-billing-b.md']
  assert.strictEqual(billing.parallel, false, 'two specs on one brief touch the same declared surfaces')
  assert.match(billing.parallel_reason, /shared brief 02/)
  const reports = by['specs/20260710/03-reports.md']
  assert.strictEqual(reports.parallel, false, 'a declared brief dependency path forces order even though both specs are unblocked')
  assert.match(reports.parallel_reason, /brief 03 depends on 02/)
})

test('--next makes no parallel claim when a spec has no brief stamp', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260701/01-a.md': 'date: 2026-07-01\nstatus: hardened',
      '20260701/02-b.md': 'date: 2026-07-01\nstatus: hardened',
    },
  })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[1].parallel, null,
    'no brief = no declared surfaces to compare — silence beats a guessed parallel-ok')
})

// The dashboard: the same derivation rendered
// once, deterministically, in the script (verdict line, progress-bar roadmap, parallel
// lanes, anomalies). Exists so the renderer prints verbatim instead of restyling by hand —
// the styling-drift sibling of the freehand-Next incident.

// AC-20260805-03-7 (sanctioned pin exception, green pre-change): the dashboard render (headline
// glyph, roadmap, --next) with an absent ledger must stay unchanged by the observation feature.
test('bare run renders verdict, progress-bar roadmap, and collapses unplanned runs', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260701/02-auth-ui.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 01',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const nonEmpty = r.stdout.split('\n').filter((l) => l.trim() !== '')
  assert.match(nonEmpty[nonEmpty.length - 1], /^🟢 /,
    'D1: the verdict line is bottom-anchored as the LAST line — no anomalies here')
  assert.match(r.stdout, /🔨 01 auth.*▓{5}░{5} 1\/2/, 'in-flight brief gets a half-full bar')
  assert.match(r.stdout, /⬜ 02–03.*unplanned \(2 briefs\)/, 'consecutive unplanned briefs collapse to one row')
  assert.match(r.stdout, /🎯 Next/, 'embeds the next derivation — no second run needed')
})

// Owner report: a long shipped history rendered one row per done brief and filled
// the screen — done runs now collapse to a range row exactly like unplanned runs, with the
// spec count preserved so the shipped volume stays visible.
test('consecutive done briefs collapse to one range row with brief and spec counts', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260701/02-auth-ui.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260702/01-billing.md': 'date: 2026-07-02\nstatus: done\nbrief: 02',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /✅ 01–02.*done \(2 briefs, 3 specs\)/,
    'a run of fully-done briefs renders one collapsed row instead of filling the screen row-per-brief')
  assert.ok(!/✅ 01 auth/.test(r.stdout),
    'the collapsed done run must replace the per-brief rows, not print alongside them')
})

test('AC-20260901-10-4: dashboard draws unblocked parallel-ok runner-ups as lanes and sinks serial/blocked, both as /spec:run', () => {
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
      '20260710/05-adhoc.md': 'date: 2026-07-10\nstatus: hardened\nbrief: n/a',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /⚡ 2 parallel lanes/, 'top pick + parallel-ok runner-up form the lane group')
  assert.match(r.stdout, /lanes[^\n]*\n\/spec:run @specs\/20260710\/01-billing\.md\n\/spec:run @specs\/20260710\/03-reports\.md/,
    'lane lines are bare flush-left commands — top pick first, parallel-ok runner-up second')
  assert.match(r.stdout, /🕓 after that:\n\/spec:run @specs\/20260710\/02-billing-b\.md\n\s+└─ ⛓️ shared brief 02/,
    'serial runner-up sinks below the lanes with its reason on a branch line, command line bare')
  assert.match(r.stdout, /\/spec:run @specs\/20260710\/05-adhoc\.md\n\s+└─ 🤷 no brief — parallelism unknown/,
    'briefless runner-up gets a no-claim branch, not silently lumped in with the serial ones')
  assert.match(r.stdout, /⛔ blocked:\n\/spec:run @specs\/20260710\/04-blocked\.md\n\s+└─ ⏳ 01-billing/, 'blocked entries close the section, each blocker a tree branch under its command')
})

// merge-conflict heads-up: parallel lanes are independently safe by brief, but
// two lanes can still declare the same file in their File Plan tables. The 333-spec corpus
// audit showed overlap can't DECIDE parallelism (51% of unrelated-brief pairs overlap), so
// this is a branch-line annotation under the lane list — never a change to the verdict.

const PARALLEL_BRIEFS = {
  '01-auth.md': '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
  '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
  '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01 · Primary workspaces: web\n',
}
const planBody = rows => '# spec\n\n## File Plan\n\n| File | Notes |\n|---|---|\n'
  + rows.map(r => `| \`${r}\` | — |\n`).join('')

test('AC-20260901-10-4: dashboard flags a merge-conflict heads-up when two parallel lanes share a File Plan path, both as /spec:run', () => {
  const dir = host({
    briefs: PARALLEL_BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
        body: planBody(['spec/shared/util.js', 'spec/billing/pay.js']),
      },
      '20260710/02-reports.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
        body: planBody(['spec/shared/util.js', 'spec/reports/view.js']),
      },
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /⚡ 2 parallel lanes/, 'shared File Plan path must NOT demote the verdict')
  assert.match(r.stdout,
    /\/spec:run @specs\/20260710\/01-billing\.md\n\/spec:run @specs\/20260710\/02-reports\.md\n\s+└─ 🔶 merge-conflict risk: spec\/shared\/util\.js/,
    'the branch line sits under the lane commands and names the shared file')
})

test('dashboard adds no heads-up when parallel lanes\' File Plans are disjoint', () => {
  const dir = host({
    briefs: PARALLEL_BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
        body: planBody(['spec/billing/pay.js']),
      },
      '20260710/02-reports.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
        body: planBody(['spec/reports/view.js']),
      },
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /⚡ 2 parallel lanes/)
  assert.doesNotMatch(r.stdout, /🔶/, 'disjoint File Plans must never earn a heads-up line')
})

test('dashboard is silent, not broken, when a parallel lane has no File Plan section', () => {
  const dir = host({
    briefs: PARALLEL_BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
        body: '# Billing\n\nno File Plan here at all.\n',
      },
      '20260710/02-reports.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
        body: planBody(['spec/reports/view.js']),
      },
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /⚡ 2 parallel lanes/)
  assert.doesNotMatch(r.stdout, /🔶/, 'zero rows parsed from a missing File Plan is a silent no-op')
})

test('File Plan compound cells (a + b, comma lists, braces, trailing annotations) split into real paths', () => {
  // The only format variance the corpus audit counted (~1% of cells) — pinned here so the
  // splitter never regresses into treating a compound cell as one bogus path.
  const dir = host({
    briefs: PARALLEL_BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
        body: planBody(['app/package.json + worker/package.json', 'app/drizzle/ (generated migration)']),
      },
      '20260710/02-reports.md': {
        fm: 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
        body: planBody(['contracts/{run_request,trade_record}.json', 'worker/package.json']),
      },
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /└─ 🔶 merge-conflict risk: worker\/package\.json/,
    'worker/package.json hides inside a "a + b" compound cell — the splitter must surface it')
})

test('AC-20260901-10-4: lane admission is pairwise — a runner-up parallel with the pick but ordered against another lane is demoted, both as /spec:run', () => {
  // 03 and 04 are both unrelated to the pick's brief 02, but 04 depends on 03 — vs-top-only
  // checking would draw three "parallel" lanes with a declared ordering inside the fan-out.
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
      '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01 · Primary workspaces: web\n',
      '04-exports.md': '# 04 — Exports\n\nPhase: P1 · Depends on: 03 · Primary workspaces: web\n',
    },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260701/02-reports-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 03',
      '20260710/01-billing.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/02-reports-ui.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 03',
      '20260710/03-exports.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 04',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /⚡ 2 parallel lanes/, 'only the mutually-unrelated pair fans out')
  assert.match(r.stdout, /lanes[^\n]*\n\/spec:run @specs\/20260710\/01-billing\.md\n\/spec:run @specs\/20260710\/02-reports-ui\.md/,
    'pick + first admissible runner-up form the lanes')
  assert.match(r.stdout, /🕓 after that:\n\/spec:run @specs\/20260710\/03-exports\.md\n\s+└─ ⛓️ brief 04 depends on 03/,
    'the vs-top-parallel entry ordered against lane 03 is demoted with the pairwise reason')
})

test('AC-20260901-10-4: dashboard states solo out loud when the pick has no parallel lane but other work exists, as /spec:run', () => {
  const dir = host({
    briefs: {
      '01-auth.md': BRIEFS['01-auth.md'],
      '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
    },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-billing.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
      '20260710/02-billing-b.md': 'date: 2026-07-10\nstatus: hardened\nbrief: 02',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /⚡/, 'one lane is not a fan-out')
  assert.match(r.stdout, /\/spec:run @specs\/20260710\/01-billing\.md\n\s+└─ 🚦 solo/,
    'the solo pick says it is not parallelable instead of relying on the missing ⚡ header')
})

test('dashboard omits the solo branch when the pick is the only open work', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 01' },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /🚦/, 'nothing else exists to be parallel WITH — the branch would be noise')
})

// brief: n/a: ad-hoc specs — work the roadmap missed — carried `brief: n/a`
// and each one earned a bogus orphan-stamp ("no docs/roadmap/n/a-*.md exists"). The spelling
// is now sanctioned: explicitly briefless, identical to omitting the field, never a pointer.

test('brief: n/a (and none/-) is deliberately briefless — no orphan-stamp, brief null', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: {
      '20260701/01-adhoc.md': 'date: 2026-07-01\nstatus: done\nbrief: n/a',
      '20260701/02-adhoc.md': 'date: 2026-07-01\nstatus: hardened\nbrief: none',
      '20260701/03-adhoc.md': 'date: 2026-07-01\nstatus: hardened\nbrief: -',
      '20260701/04-typo.md': 'date: 2026-07-01\nstatus: done\nbrief: 07',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  for (const s of out.specs.filter(x => x.path.includes('adhoc'))) {
    assert.strictEqual(s.brief, null, `${s.path} must parse as briefless`)
  }
  const orphans = out.anomalies.filter(a => a.kind === 'orphan-stamp')
  assert.strictEqual(orphans.length, 1, 'only the genuine dangling stamp (brief: 07) remains')
  assert.match(orphans[0].detail, /04-typo\.md/)
})

// D1 render inversion (specs/20260807/01-observation-red-alarm.md): a terminal shows the TAIL
// of output, so the actionable sections must be the last thing printed. Section order flips to
// Roadmap → anomalies → 🎯 Next → headline verdict LAST (owner directive — "I need
// to scroll up to see what's Next").
test('AC-20260807-01-1: --pretty renders Roadmap, then the anomalies section, then 🎯 Next, with the headline verdict as the final line', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 01' },
    overviewRow: '| 01 | auth | P0 | — | ✅ done |',
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n')
  const idxRoadmap = lines.findIndex((l) => l.includes('🗺️ Roadmap'))
  const idxAnomalies = lines.findIndex((l) => l.includes('⚠️ Anomalies') || l.includes('No anomalies'))
  const idxNext = lines.findIndex((l) => l.includes('🎯 Next'))
  assert.ok(idxRoadmap !== -1 && idxAnomalies !== -1 && idxNext !== -1,
    'test fixture bug: Roadmap, an anomalies section, and Next must all be present: ' + r.stdout)
  assert.ok(idxRoadmap < idxAnomalies, 'D1: 🗺️ Roadmap must render before the anomalies section — today anomalies print after 🎯 Next, at the very bottom')
  assert.ok(idxAnomalies < idxNext, 'D1: the anomalies section must render above 🎯 Next so a scrolled-to-bottom terminal still shows Next, not anomaly detail')
  const nonEmpty = lines.filter((l) => l.trim() !== '')
  assert.match(nonEmpty[nonEmpty.length - 1], /^(🔴|🟠|🟢)/,
    'D1: the one-line headline verdict must be the LAST line of output — today it is printed first, so a terminal showing only the tail never sees it')
})

test('AC-20260901-10-4: dashboard folds spec-scoped anomalies onto their Next lines instead of a bottom section, Next line is /spec:run', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 07' },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /\/spec:run @specs\/20260701\/01-x\.md\s+⚠️ orphan-stamp/,
    'the orphan-stamp rides the spec\'s own Next line as a ⚠️ tag')
  assert.match(r.stdout, /⚠️ 1 anomaly — each tagged ⚠️ on its 🎯 Next line/,
    'all anomalies folded → one summary line, no section repeating the paths')
  assert.doesNotMatch(r.stdout, /\[orphan-stamp\]/, 'no bottom-section line for a folded anomaly')
})

test('--pretty is a no-op — pretty is the default render, old call sites keep working', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 01' },
  })
  const bare = runNode(SCRIPT, ['--root', dir])
  const flagged = runNode(SCRIPT, ['--root', dir, '--pretty'])
  assert.strictEqual(flagged.status, 0, flagged.stderr)
  assert.strictEqual(flagged.stdout, bare.stdout, 'the flag changes nothing — same dashboard')
  const next = runNode(SCRIPT, ['--root', dir, '--next', '--pretty'])
  assert.strictEqual(next.stdout, runNode(SCRIPT, ['--root', dir, '--next']).stdout)
})

// AC-20260805-01-7 (sanctioned pin exception, green pre-change): --next output must stay
// byte-identical after the lib extraction (D2).
test('AC-20260901-10-4: --next prints only the header and the top pick, @-prefixed, as /spec:run', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260701/01-draft.md': 'date: 2026-07-01\nstatus: draft',
      '20260701/02-ready.md': 'date: 2026-07-01\nstatus: hardened',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout.trim(), '🎯 Next\n/spec:run @specs/20260701/02-ready.md',
    'lean view is exactly the header plus the top-pick line — no Then/Blocked, no notes')
})

test('AC-20260901-10-4: --next on an all-blocked set still shows the top entry as /spec:run, with its blocker named', () => {
  const dir = host({
    briefs: {},
    specs: {
      '20260701/01-inflight.md': 'date: 2026-07-01\nstatus: implementing',
      '20260701/02-blocked.md': 'date: 2026-07-01\nstatus: hardened\ndepends_on: [specs/20260701/01-inflight.md]',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^🎯 Next\n\/spec:run @specs\/20260701\/01-inflight\.md$/m,
    'the unblocked implementing spec still wins the top slot over the blocked one')
})

test('--next with nothing actionable prints the header and the nothing-next message', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout.trim(), '🎯 Next\n✨ nothing next — all specs done, no unplanned briefs')
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
  assert.match(read('spec/commands/status.md'), /verbatim, as a fenced code block/,
    '/spec:status must print the deterministic dashboard verbatim, not restyle by hand')
  assert.match(read('spec/commands/review.md'), /spec-status.*--next/s,
    'review close must print --next verbatim — the freehand Next line is the incident this mode kills')
})

// Fail-closed statuses + sanctioned retirement: a spec hand-edited to a word
// outside the lifecycle fell through deriveNext's else-branch to a /spec:build recommendation
// with zero anomalies. Unknown statuses must be flagged and never routed to an action. The
// sanctioned retirement spelling — `status: superseded` — must be SILENT (no anomaly, no Next
// entry, no brief membership): a retired spec left in the repo indefinitely must never
// accumulate report lines. Silence is UNCONDITIONAL. The first cut of this fix required
// `superseded_by:` to resolve to another spec and nagged daily at a spec correctly superseded
// by an ADR — an errand with no possible completion. Never make retirement conditional again.
test('unknown status fails closed: anomaly flagged, spec excluded from --next', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: wip\nbrief: 01' },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  const unk = out.anomalies.filter(a => a.kind === 'unknown-status')
  assert.strictEqual(unk.length, 1, 'wip is not in the spec status vocabulary — must be flagged')
  assert.match(unk[0].detail, /wip/, 'names the offending status')
  assert.match(unk[0].detail, /01-auth-core\.md/, 'names the offending spec')
  const next = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(next.status, 0, next.stderr)
  assert.doesNotMatch(next.stdout, /@specs\/20260701\/01-auth-core\.md/,
    'a spec in an unrecognized state must never be recommended for any action')
})

test('valid retirement is silent: no anomaly, no Next entry, brief derives from live specs', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: superseded\nbrief: 01\nsuperseded_by: specs/20260715/01-auth-core-v2.md',
      '20260715/01-auth-core-v2.md': 'date: 2026-07-15\nstatus: done\nbrief: 01',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.anomalies, [], 'a clean retirement never nags — not today, not after a year')
  assert.strictEqual(out.briefs.find(b => b.num === '01').status, 'done',
    'the retired spec must not hold its brief hostage in in-flight')
  assert.deepStrictEqual(out.superseded, [{ path: 'specs/20260701/01-auth-core.md', superseded_by: 'specs/20260715/01-auth-core-v2.md' }],
    'retirement is still visible to machines via the superseded list')
  const next = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.doesNotMatch(next.stdout, /01-auth-core\.md/, 'retired spec never appears in Next')
})

test('retirement is silent whatever superseded_by says — no pointer, an ADR, or free text', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: {
      '20260701/01-no-ptr.md': 'date: 2026-07-01\nstatus: superseded\nbrief: 01',
      '20260701/01-adr-ptr.md': 'date: 2026-07-01\nstatus: superseded\nbrief: 01\nsuperseded_by: docs/adr/0017-global-client-base.md',
      '20260701/01-prose-ptr.md': 'date: 2026-07-01\nstatus: superseded\nbrief: 01\nsuperseded_by: dropped, requirement went away',
      '20260715/01-live.md': 'date: 2026-07-15\nstatus: done\nbrief: 01',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.anomalies, [],
    'a retirement pointing outside specs/ (or nowhere) is finished work, not an unfinished edit')
  assert.strictEqual(out.superseded.length, 3, 'all three stay machine-visible in --json')
  const next = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.doesNotMatch(next.stdout, /-ptr\.md/, 'no retired spec is ever routed to an action')
})

test('a dependency on a retired spec blocks nothing and reports nothing', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: superseded\nbrief: 01\nsuperseded_by: specs/20260715/01-auth-core-v2.md',
      '20260715/01-auth-core-v2.md': 'date: 2026-07-15\nstatus: done\nbrief: 01',
      '20260720/01-auth-ui.md': 'date: 2026-07-20\nstatus: done\nbrief: 01\ndepends_on: [specs/20260701/01-auth-core.md]',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.anomalies, [],
    'a dependency retired out from under a done spec is not a skipped-spec finding')
})

// specs/20260902/11-brief-from-approved-set.md D6: spec-status.js renders one line after the
// 🗺️ Roadmap block, reading design/mocks/ledger.md through lib/mocks-ledger.js — `🧭
// misunderstandings: {N} caught before build (latest {id} at {step})` when the ledger exists
// and has >=1 catch; the line is omitted (silently, never a verdict) with no ledger, an
// unparsable ledger, or zero catches. spec-status.js does not require ./lib/mocks-ledger.js or
// read design/mocks/ledger.md at all today, so every case below is red until D6 lands.

// Assumptions and Misunderstandings table headers from lib/mocks-ledger.js's own grammar
// (D1 comment): callers own all file I/O, so this fixture writes design/mocks/ledger.md
// directly rather than driving mocks-driver.js's `ledger add` subcommand — spec-status.js is
// the thing under test here, not the mocks driver.
const LEDGER_ASSUMPTIONS_HEADER = [
  '| id | step | kind | claim | tag | status | rejected | dependents | note |',
  '| - | - | - | - | - | - | - | - | - |',
].join('\n')

function writeLedgerFile(dir, catchRows) {
  const misunderstandingsLines = [
    '## Misunderstandings', '',
    '| id | what | step | cost | note |',
    '| - | - | - | - | - |',
    ...catchRows,
    '',
  ]
  fs.writeFileSync(path.join(dir, 'design/mocks/ledger.md'),
    ['# Provenance ledger — test product', '', '## Assumptions', '', LEDGER_ASSUMPTIONS_HEADER, '']
      .concat(misunderstandingsLines).join('\n'))
}

// 13 catch rows, ids M1..M12 then M14 (skipping M13 on purpose — count and "latest id" must
// never be conflated with a contiguous numeric run), the Contracts block's own worked example
// verbatim: latest (last row) M14 at step THEME.
const THIRTEEN_CATCH_ROWS = [
  ...Array.from({ length: 12 }, (_, i) => `| M${i + 1} | a misunderstanding caught during the run | WIREFRAMES | low | synthetic fixture row |`),
  '| M14 | the dispatcher misread as an agency, not a solo operator | THEME | medium | corrected the copy across every screen |',
]

test('AC-20260902-11-6: WHEN spec-status.js runs on a root whose design/mocks/ledger.md carries 13 catches (latest M14 at THEME) THE SYSTEM prints the 🧭 misunderstandings line between 🗺️ Roadmap and the anomalies section, and omits it with no ledger, an unparsable ledger, or zero catches', () => {
  const withLedger = host({
    briefs: BRIEFS,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  fs.mkdirSync(path.join(withLedger, 'design/mocks'), { recursive: true })
  writeLedgerFile(withLedger, THIRTEEN_CATCH_ROWS)
  const r = runNode(SCRIPT, ['--root', withLedger])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^   🧭 misunderstandings: 13 caught before build \(latest M14 at THEME\)$/m,
    'AC-20260902-11-6/D6: a ledger with 13 catches (latest M14 at THEME) must print the exact ' +
    'pipeline-record line the Contracts block pins — its absence means the table never became a ' +
    'status-line-visible fact: ' + r.stdout)
  const lines = r.stdout.split('\n')
  const idxRoadmap = lines.findIndex((l) => l.includes('🗺️ Roadmap'))
  const idxMisunderstandings = lines.findIndex((l) => l.includes('🧭 misunderstandings'))
  const idxAnomalies = lines.findIndex((l) => l.includes('⚠️ Anomalies') || l.includes('No anomalies') || l.includes('anomal'))
  assert.ok(idxRoadmap !== -1 && idxMisunderstandings !== -1 && idxAnomalies !== -1,
    'test fixture bug: 🗺️ Roadmap, 🧭 misunderstandings, and the anomalies section must all be present: ' + r.stdout)
  assert.ok(idxRoadmap < idxMisunderstandings,
    'D6: the 🧭 line must render directly under the 🗺️ Roadmap block, not above it: ' + r.stdout)
  assert.ok(idxMisunderstandings < idxAnomalies,
    'D6: the 🧭 line must render before the anomalies section (Contracts: "before 📡 Observation") — a line after anomalies would sit past the block this spec pins it under: ' + r.stdout)

  const noLedger = host({
    briefs: BRIEFS,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  const rNoLedger = runNode(SCRIPT, ['--root', noLedger])
  assert.strictEqual(rNoLedger.status, 0, rNoLedger.stderr)
  assert.doesNotMatch(rNoLedger.stdout, /🧭/,
    'D6: a root with no design/mocks/ledger.md at all must print no 🧭 line — the line is a viewer, never a verdict, so its absence must be silent: ' + rNoLedger.stdout)

  const badLedger = host({
    briefs: BRIEFS,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  fs.mkdirSync(path.join(badLedger, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(badLedger, 'design/mocks/ledger.md'), 'not a ledger at all, no tables here\n')
  const rBad = runNode(SCRIPT, ['--root', badLedger])
  assert.strictEqual(rBad.status, 0, 'D6: an unparsable ledger must never crash or fail the whole dashboard — the read/parse failure is swallowed silently: ' + rBad.stderr)
  assert.doesNotMatch(rBad.stdout, /🧭/,
    'D6: an unparsable design/mocks/ledger.md must print no 🧭 line, exactly like a missing one — a parse failure surfacing partial or wrong data would be worse than silence: ' + rBad.stdout)

  const zeroCatches = host({
    briefs: BRIEFS,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  fs.mkdirSync(path.join(zeroCatches, 'design/mocks'), { recursive: true })
  writeLedgerFile(zeroCatches, [])
  const rZero = runNode(SCRIPT, ['--root', zeroCatches])
  assert.strictEqual(rZero.status, 0, rZero.stderr)
  assert.doesNotMatch(rZero.stdout, /🧭/,
    'D6: a valid ledger with zero catch rows must print no 🧭 line — "0 caught before build" is not the pipeline-record fact this line exists to surface: ' + rZero.stdout)
})

test('AC-20260902-11-7: WHEN spec-status.js --json and --next --json run on a root whose ledger has catches THE SYSTEM CONTINUES TO emit the same top-level keys as before this spec, with no misunderstandings key', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  writeLedgerFile(dir, THIRTEEN_CATCH_ROWS)

  const jsonOut = JSON.parse(runNode(SCRIPT, ['--root', dir, '--json']).stdout)
  assert.deepStrictEqual(Object.keys(jsonOut).sort(), ['anomalies', 'briefs', 'specs', 'superseded'].sort(),
    'AC-20260902-11-7/D6: --json\'s top-level key set must stay exactly what it was before this spec — a ' +
    '"misunderstandings" key (or any other new key) here means the frozen --json shape was widened for a render line, which the spec\'s own Rationale forbids: ' + JSON.stringify(Object.keys(jsonOut)))
  assert.ok(!Object.prototype.hasOwnProperty.call(jsonOut, 'misunderstandings'),
    'AC-20260902-11-7/D6: --json must carry no "misunderstandings" key even though the ledger has 13 catches')

  const nextJsonOut = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.deepStrictEqual(Object.keys(nextJsonOut).sort(), ['next'].sort(),
    'AC-20260902-11-7/D6: --next --json\'s top-level key set must stay exactly what it was before this spec: ' + JSON.stringify(Object.keys(nextJsonOut)))
  assert.ok(!Object.prototype.hasOwnProperty.call(nextJsonOut, 'misunderstandings'),
    'AC-20260902-11-7/D6: --next --json must carry no "misunderstandings" key even though the ledger has 13 catches')
})
