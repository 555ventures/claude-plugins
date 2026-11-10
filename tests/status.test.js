'use strict'
// The status screen is v7's: the oracle runs v7's spec-status.js (tag spec-v7-final) beside status.js on
// three fixture hosts and the outputs must be byte-identical; the other tests pin what the oracle cannot.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { SPEC, ROOT, tmpdir, gitRepo, runNode, v7Scripts, v1Queue, seedQueue } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))
const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))

const w = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const GOLD = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'status', n), 'utf8')
const status = (d, ...a) => runNode('scripts/status.js', [...a, '--root', d])
const json = (d) => JSON.parse(status(d, '--json').stdout)
const brief = (nn, title, phase, deps, extra = '') => `# ${nn} — ${title}\n\nPhase: ${phase} · Depends on: ${deps} · Primary workspaces: app\n\n## Result\n\nx\n${extra}`
const SUPERSEDED = '\n> **Superseded by** 04\n'
const plan = (files) => `## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n${files.map((f) => `| ${f} | MODIFY | x |`).join('\n')}\n`
const specDoc = (stat, { brief: b = 'n/a', deps, files = ['x.js'], tail = '' } = {}) =>
  `---\n${stat === null ? '' : `status: ${stat}\n`}${b === null ? '' : `brief: ${b}\n`}${deps ? `depends_on: ${deps}\n` : ''}---\n# S\n\n${plan(files)}${tail}`
const A = 'specs/20261104'

// v7 on the host's v1 twin, normalised by the three edits the spec allows.
function v7Screen(host, ...flags) {
  const twin = v1Queue(host)
  const r = spawnSync(process.execPath, [path.join(v7Scripts(), 'spec-status.js'), '--root', twin, ...flags], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = []
  for (const l of r.stdout.split('\n')) {
    if (l.startsWith('📈')) { if (lines[lines.length - 1] === '') lines.pop(); continue }
    lines.push(l)
  }
  return lines.join('\n').replace(/ · \d+ done since last release| · \d+ done, never released/g, '')
    .replace(/`spec-queue (done|move) /g, '`/spec:queue $1 ').replace(/`spec-queue next`/g, '`/spec:queue next`')
}

// v8's screen with the type marks and the in-progress marker taken off: what v7's screen is compared with (ADR-0044).
const unmark = (screen) => screen.replace(/^((?:q\d+ +)?)(?:🏃|📝|🧪|🔧) /gm, '$1').replace(/ {2}🔨 in progress$/gm, '')

// ---- the fixture hosts ---------------------------------------------------------------------

// openBrief gives brief 01 an open step outside specs: it is then done but still queued, and v8 raises the decide line (brief-done-queued).
function fullHost({ openBrief = false } = {}) {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'docs/roadmap/00-overview.md', '# Overview\n\n| # | Brief | Status |\n|---|---|---|\n| 01 | foundation | done |\n| 02 | schema | |\n')
  w(d, 'docs/roadmap/01-foundation.md', brief('01', 'Foundation', 'P0', '—', openBrief ? '\n## Steps outside specs\n\n- [ ] cut over DNS\n' : ''))
  w(d, 'docs/roadmap/02-schema.md', brief('02', 'Schema', 'P0', '01'))
  w(d, 'docs/roadmap/03-rounds.md', brief('03', 'Rounds', 'P1', '02, 99'))
  w(d, 'docs/roadmap/04A-boards.md', brief('04A', 'Boards', 'P1', '03'))
  w(d, 'docs/roadmap/04B-views.md', brief('04B', 'Views', 'P1', '04a'))
  w(d, 'docs/roadmap/05-settings.md', '# 05 — Settings\n\nPhase: P1 · Depends on: 02-B (02a-2; parts of 02a-3a),\n brief 04, 2026-style, none <!-- note -->\n · Primary workspaces: app\n\n## Result\n\nx\n')
  for (const [n, slug] of [['05A', 'alpha'], ['05B', 'beta'], ['05C', 'gamma']]) w(d, `docs/roadmap/${n}-${slug}.md`, brief(n, slug, 'P1', '—'))
  w(d, 'docs/roadmap/06-reports.md', brief('06', 'Reports', 'P2', '05'))
  w(d, 'docs/roadmap/07-export.md', brief('07', 'Export', 'P2', '06, 04a'))
  w(d, 'docs/roadmap/08-legacy.md', brief('08', 'Legacy', 'P2', '—', SUPERSEDED))
  w(d, 'docs/roadmap/09-retired.md', brief('09', 'Retired', 'P2', '—', SUPERSEDED))
  w(d, 'specs/20261101/01-foundation.md', specDoc('done', { brief: '01' }))
  w(d, 'specs/20261101/02-schema.md', specDoc('done', { brief: '02', deps: '[specs/20261103/01-rounds.md]' }))
  w(d, 'specs/20261103/01-rounds.md', specDoc('draft', { brief: '03' }))
  w(d, `${A}/01-boards.md`, specDoc('hardened', { brief: '04a', files: ['src/shared.ts', 'src/boards.ts'] }))
  w(d, '.claude/worktrees/spec-01-boards/specs/20261104/01-boards.run/state.json', '{"step":"BUILD"}')
  w(d, `${A}/13-boards-two.md`, specDoc('hardened', { brief: '04a' }))
  w(d, `${A}/02-views.md`, specDoc('hardened', { brief: '4B' }))
  w(d, `${A}/14-views-two.md`, specDoc('hardened', { brief: '04b' }))
  w(d, `${A}/03-views-done.md`, specDoc('done', { brief: '04b' }))
  w(d, `${A}/04-adhoc-a.md`, specDoc('hardened', {
    files: ['src/shared.ts + src/a.ts'],
    tail: '\n### Second table\n\n| File | Why |\n|------|-----|\n| src/z.ts | z |\n| src/y.ts | y |\n| src/x.ts | x |\n',
  }))
  w(d, `${A}/05-adhoc-b.md`, specDoc('hardened', {
    files: ['`src/{shared,b}.ts` (generated)', 'src/z.ts, src/y.ts', 'src/x.ts'],
  }))
  w(d, '.claude/worktrees/spec-05-adhoc-b/specs/20261104/05-adhoc-b.run/state.json', '{"step":"STOPPED","ended":true}')
  w(d, `${A}/06-export-a.md`, specDoc('hardened', { brief: '07', deps: `[${A}/09-retired.md]` }))
  w(d, `${A}/07-export-b.md`, specDoc('hardened', { brief: '07', deps: '06-export-a.md, 01-rounds.md' }))
  w(d, `${A}/08-gated.md`, specDoc('hardened'))
  w(d, `${A}/09-retired.md`, specDoc('superseded', { brief: '06' }))
  w(d, `${A}/10-nostatus.md`, specDoc(null))
  w(d, `${A}/11-wip.md`, specDoc('wip'))
  w(d, `${A}/12-orphan.md`, specDoc('done', { brief: '99' }))
  w(d, `${A}/15-legacy.md`, specDoc('done', { brief: '08' }))
  const long = 'notifications: a removed or soft-deleted staff person has no ended suppression rule so the lookup returns a stale row and the digest still goes out'
  const items = [
    { id: 'q1', kind: 'prompt', payload: 'already finished', type: 'plan', done: '2026-11-02T00:00:00.000Z' },
    { id: 'q2', kind: 'brief', payload: 'docs/roadmap/04A-boards.md' },
    { id: 'q3', kind: 'prompt', payload: 'tighten the retry copy', type: 'plan' },
    { id: 'q4', kind: 'prompt', payload: 'the board drag handle', type: 'prototype' },
    { id: 'q5', kind: 'prompt', payload: 'digest sends twice', type: 'fix' },
    { id: 'q6', kind: 'prompt', payload: 'drop the legacy export?', type: 'decide' },
    { id: 'q7', kind: 'prompt', payload: long },
    { id: 'q8', kind: 'brief', payload: '3' },
    { id: 'q9', kind: 'brief', payload: 'docs/roadmap/03-rounds.md' },
    { id: 'q10', kind: 'prompt', payload: 'wait for rounds', type: 'plan', after: { brief: '03' } },
    { id: 'q11', kind: 'prompt', payload: 'after schema', type: 'fix', after: { brief: '02' } },
    { id: 'q12', kind: 'prompt', payload: 'after export a', type: 'plan', after: { spec: `${A}/06-export-a.md` } },
    { id: 'q13', kind: 'prompt', payload: 'after a ghost', type: 'plan', after: { spec: `${A}/99-ghost.md` } },
    { id: 'q14', kind: 'prompt', payload: 'after retired', type: 'plan', after: { spec: `${A}/09-retired.md` } },
    { id: 'q15', kind: 'spec', payload: `${A}/08-gated.md`, after: { brief: '03' } },
    // Brief 01 is done: with no open step it reads done (as v7's oracle reconcile ticks it); openBrief gives it one.
    { id: 'q16', kind: 'brief', payload: '01' },
    { id: 'q17', kind: 'brief', payload: '77' },
    { id: 'q18', kind: 'brief', payload: '07' },
  ].map((i) => ({ added: '2026-11-01T00:00:00.000Z', ...i }))
  seedQueue(d, items)
  st.writeFanout(d, { step: 'WAIT', batch: [] })
  w(d, '.claude/pending-question.json', JSON.stringify({ lane: 'root', question: 'which?', options: [], answer: null }))
  return d
}

const emptyHost = () => { const d = tmpdir('status'); gitRepo(d); return d }

function allDoneHost(unplanned) {
  const d = tmpdir('status'); gitRepo(d)
  w(d, 'docs/roadmap/01-foundation.md', brief('01', 'Foundation', 'P0', '—'))
  if (unplanned) w(d, 'docs/roadmap/02-later.md', brief('02', 'Later', 'P1', '99'))
  w(d, 'specs/20261101/01-foundation.md', specDoc('done', { brief: '01' }))
  w(d, 'specs/20261101/02-extra.md', specDoc('done'))
  return d
}

// ---- the oracle ----------------------------------------------------------------------------

test('AC-20261105-05-1 AC-20261105-16-15 v7\'s own script and status.js print the same bytes on the full, empty and all-done hosts, once the type marks and the marker come off', () => {
  const hosts = { full: fullHost(), empty: emptyHost(), allDone: allDoneHost(true), allDoneNoBrief: allDoneHost(false) }
  for (const [name, host] of Object.entries(hosts)) {
    for (const flags of [[], ['--all']]) {
      const mine = status(host, ...flags)
      assert.strictEqual(mine.status, 0, mine.stderr)
      assert.strictEqual(unmark(mine.stdout), v7Screen(host, ...flags), `${name} ${flags.join(' ') || 'bare'}`)
    }
  }
})

test('AC-20261105-05-1 a missing v7 tag fails the oracle, it never skips', () => {
  const r = spawnSync('git', ['-C', ROOT, 'rev-parse', '--verify', 'refs/tags/spec-v7-final'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'tag spec-v7-final must exist: the oracle has no skip path')
  assert.ok(fs.existsSync(path.join(v7Scripts(), 'spec-status.js')))
})

test('the goldens are the full host\'s render (UPDATE_GOLDENS=1 regenerates them)', () => {
  const d = fullHost()
  const runs = { 'bare.txt': status(d), 'all.txt': status(d, '--all'), 'brief-met.txt': status(d, '04b'), 'brief-unmet.txt': status(d, '05'), 'brief-queued.txt': status(fullHost({ openBrief: true })) }
  for (const [name, r] of Object.entries(runs)) {
    if (process.env.UPDATE_GOLDENS) fs.writeFileSync(path.join(__dirname, 'fixtures', 'status', name), r.stdout)
    assert.strictEqual(r.stdout, GOLD(name), name)
  }
  assert.deepStrictEqual(Object.values(runs).map((r) => r.status), [0, 0, 0, 1, 0])
  const queued = GOLD('brief-queued.txt')
  assert.ok(queued.includes('⚠️ Brief 01 (foundation) has every spec done; 1 step(s) outside specs are still open.\n   Close it?  /spec:queue done 01\n'), 'the decide pair')
  assert.ok(queued.includes('· 3 more to decide (--all)'), 'the footer clause')
  assert.ok(!v7Screen(fullHost({ openBrief: true })).includes('Close it?'), 'v7 ticks a done brief in its oracle reconcile and never printed the line')
})

// ---- what the oracle cannot say ------------------------------------------------------------

const lines = (r) => r.stdout.split('\n')
const small = (files, queue) => {
  const d = tmpdir('status'); gitRepo(d)
  for (const [rel, text] of Object.entries(files)) w(d, rel, text)
  if (queue) seedQueue(d, queue.map((i) => ({ added: '2026-11-01T00:00:00.000Z', ...i })))
  return d
}
const rm = (d, rel) => fs.rmSync(path.join(d, rel), { recursive: true, force: true })

test('AC-20261105-05-2 queued prompts print as typed qNN rows; gated ones wait under ⛔ blocked', () => {
  const d = fullHost()
  const bare = lines(status(d)); const all = lines(status(d, '--all'))
  const next = bare.slice(bare.indexOf('🎯 Next'), bare.indexOf('⚡ 3 parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):'))
  assert.deepStrictEqual(next.slice(0, 5), ['🎯 Next', 'q3   📝 /spec:plan tighten the retry copy', 'q4   🧪 /spec:prototype the board drag handle', 'q5   🔧 /spec:fix digest sends twice', 'q6   📌 decide: drop the legacy export?'])
  const q7 = next.find((l) => l.startsWith('q7   notifications'))
  assert.ok(q7.endsWith('…') && [...q7].length === 100, 'an untyped payload prints verbatim with no mark, cut to 100 columns')
  assert.ok(next.includes('q11  🔧 /spec:fix after schema') && next.includes('q14  📝 /spec:plan after retired'), 'a met brief gate and a superseded spec gate print')
  for (const gated of ['q10', 'q12', 'q13']) assert.ok(!next.some((l) => l.startsWith(gated + ' ')), `${gated} is gated`)
  assert.ok(!next.some((l) => l.startsWith('q1 ')), 'a done item prints nothing')
  const blocked = all.slice(all.indexOf('⛔ blocked:'))
  for (const [row, why] of [['q10  📝 /spec:plan wait for rounds', '   └─ ⏳ after brief 03'], ['q12  📝 /spec:plan after export a', '   └─ ⏳ after 06-export-a'], ['q13  📝 /spec:plan after a ghost', '   └─ ⏳ after 99-ghost']]) {
    assert.strictEqual(blocked[blocked.indexOf(row) + 1], why)
  }
})

test('AC-20261105-05-3 a queue gate keeps a spec out of the lanes and the top pick; a gate on a missing spec reads (missing)', () => {
  const d = small({ 'docs/roadmap/03-x.md': brief('03', 'X', 'P0', '99'), [`${A}/01-g.md`]: specDoc('hardened', { brief: '03' }), [`${A}/02-d.md`]: specDoc('draft', { brief: '03' }) },
    [{ kind: 'spec', payload: `${A}/01-g.md`, after: { spec: `${A}/99-none.md` } }, { kind: 'brief', payload: '03', after: { brief: '03' } }])
  const j = json(d)
  assert.deepStrictEqual(j.specs.find((s) => s.path === `${A}/01-g.md`).blockers, [`after ${A}/99-none.md (missing)`])
  const out = status(d, '--all').stdout
  assert.match(out, /\/spec:run @specs\/20261104\/01-g\.md\n   └─ ⏳ after 99-none\n/)
  assert.ok(!out.includes('parallel lanes') && !out.includes('🚦'), 'a blocked spec is no lane')
  assert.match(out, /🟠 next is blocked · waiting on after 99-none/)
  const e = small({ 'docs/roadmap/03-x.md': brief('03', 'X', 'P0', '99'), [`${A}/01-g.md`]: specDoc('hardened', { brief: '03' }), [`${A}/02-d.md`]: specDoc('draft', { brief: '03' }) },
    [{ kind: 'spec', payload: `${A}/01-g.md`, after: { brief: '03' } }])
  assert.match(status(e).stdout, /🟠 next is blocked · waiting on after brief 03/)
})

test('AC-20261105-05-4 brief rows: ranges, bars, banner forms, UTF-16 padding', () => {
  const full = status(fullHost()).stdout
  assert.match(full, /✅ 01–02 +P0 +done \(2 briefs, 2 specs\)\n/)
  assert.match(full, /🔨 03 rounds +P1 +░░░░░░░░░░ 0\/1\n/)
  assert.match(full, /⬜ 05–06 +P1–P2 +unplanned \(5 briefs\)\n/)
  assert.match(full, /⛔ 08–09 +P2 +superseded \(2 briefs\)\n/)
  const d = small({
    'docs/roadmap/01-plain.md': brief('01', 'Plain', 'P0', '—', '\n> Superseded by 03\n'),
    'docs/roadmap/02-bold.md': brief('02', 'Bold', 'P0', '—', '\n> **Superseded by** 03\n'),
    'docs/roadmap/03-wide😀.md': brief('03', 'Wide', 'P1', '—'),
    'docs/roadmap/04-abcdefgh.md': brief('04', 'Abc', 'P1', '—'),
    [`${A}/01-p.md`]: specDoc('done', { brief: '01' }), [`${A}/02-b.md`]: specDoc('hardened', { brief: '02' }),
    [`${A}/03-w.md`]: specDoc('hardened', { brief: '03' }), [`${A}/04-a.md`]: specDoc('hardened', { brief: '04' }),
  })
  const rows = lines(status(d))
  assert.ok(rows.includes('   ⛔ 01 plain     P0  ▓▓▓▓▓▓▓▓▓▓ 1/1'), 'a `> Superseded by` brief with done members is ⛔ with a full bar')
  assert.ok(rows.some((l) => l.startsWith('   🔨 02 bold ')), 'a `> **Superseded by**` brief with a hardened member stays in flight')
  assert.ok(rows.includes('   🔨 03 wide😀    P1  ░░░░░░░░░░ 0/1'), `padding counts UTF-16 units: ${rows.join('|')}`)
  const one = small({ 'docs/roadmap/01-only.md': brief('01', 'Only', 'P0', '—'), [`${A}/01-s.md`]: specDoc('superseded', { brief: '01' }) })
  assert.ok(lines(status(one)).some((l) => /^ {3}⬜ 01 only +P0 +unplanned$/.test(l)), 'a superseded-only brief is unplanned')
})

test('AC-20261105-05-5 lanes: the implementing spec first, pair prefixes only with three lanes, 🚦 solo beside other work', () => {
  const bare = status(fullHost()).stdout
  const L = lines({ stdout: bare })
  const at = L.indexOf('⚡ 3 parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):')
  assert.deepStrictEqual(L.slice(at + 1, at + 4), [`🏃 /spec:run @${A}/01-boards.md  🔨 in progress`, `🏃 /spec:run @${A}/04-adhoc-a.md`, `🏃 /spec:run @${A}/05-adhoc-b.md`])
  assert.strictEqual(L[at + 6], '   └─ 🔶 04-adhoc-a.md × 05-adhoc-b.md: merge-conflict risk: src/shared.ts, src/z.ts (+2 more)', 'every table, `a + b`, `{a,b}`, `(generated)` count')
  assert.strictEqual(bare.split(`/spec:run @${A}/01-boards.md`).length, 2, 'nothing above ⚡ repeats the top pick')
  const two = small({ [`${A}/01-a.md`]: specDoc('hardened', { files: ['s.js', 'a.js'] }), [`${A}/02-b.md`]: specDoc('hardened', { files: ['s.js'] }) })
  assert.match(status(two).stdout, /⚡ 2 parallel lanes[^\n]*\n[^\n]+\n[^\n]+\n   └─ 🔶 merge-conflict risk: s\.js\n/)
  const solo = small({ [`${A}/01-a.md`]: specDoc('hardened'), [`${A}/02-b.md`]: specDoc('draft', { brief: '03' }), 'docs/roadmap/03-x.md': brief('03', 'X', 'P0', '99') })
  assert.match(status(solo).stdout, /🏃 \/spec:run @specs\/20261104\/01-a\.md\n   └─ 🚦 solo\n/)
  const alone = small({ [`${A}/01-a.md`]: specDoc('hardened') })
  assert.ok(!status(alone).stdout.includes('solo'))
})

test('AC-20261105-05-6 --all: after-that reasons share lines, blocked lists specs and prompts, hygiene is the derivation\'s own', () => {
  const out = status(fullHost(), '--all').stdout
  assert.match(out, /🕓 after that:\n[^\n]+13-boards-two\.md\n   └─ ⛓️ shared brief 04a\n[^\n]+06-export-a\.md\n   └─ ⛓️ brief 07 depends on 04a\n[^\n]+02-views\.md\n[^\n]+14-views-two\.md\n   └─ ⛓️ brief 04b depends on 04a\n/)
  assert.ok(!out.includes('🤷'))
  assert.match(out, /⛔ blocked:\n📝 \/spec:plan @specs\/20261103\/01-rounds\.md\n   └─ ⏳ brief 99\n/)
  assert.match(out, /🧹 Hygiene \(7\) — \/spec:doctor\n/)
  for (const k of ['queue-orphan', 'unknown-status', 'orphan-stamp', 'unparsed-dependency', 'unknown-dependency', 'skipped-spec', 'hand-tracked-status']) assert.ok(out.includes(`   [${k}] `), k)
  assert.match(out, /\[queue-orphan\][^\n]*`\/spec:queue done 77`[^\n]*`\/spec:queue move 77 <n>`/)
  for (const bad of ['[prototype-open]', '[leftover worktree]', '[stale sidecar]', '[doctor]']) assert.ok(!out.includes(bad), bad)
  const d = fullHost()
  fs.writeFileSync(path.join(st.gitCommonDir(d), 'spec-queue.json'), '{ not json')
  const broken = status(d, '--all').stdout
  assert.strictEqual(broken.split('\n').filter((l) => l.startsWith('   [queue-unparseable]')).length, 1)
  assert.match(broken, /\[queue-unparseable\][^\n]*`\/spec:queue next`\)/)
  assert.ok(!/^q\d+ /m.test(broken), 'no overlay, no qNN row')
  assert.match(broken, /🎯 Next\n⚡ 4 parallel lanes[^\n]*\n🏃 \/spec:run @specs\/20261104\/01-boards\.md  🔨 in progress\n/)
})

test('AC-20261105-05-7 decide lines: wording, the cap of three, the overflow clause', () => {
  const d = small({
    'docs/roadmap/01-a.md': brief('01', 'A', 'P0', '—'), 'docs/roadmap/02-b.md': brief('02', 'B', 'P0', '—'),
    'docs/roadmap/03-c.md': brief('03', 'C', 'P0', '02'), 'docs/roadmap/04-d.md': brief('04', 'D', 'P0', '—'),
    [`${A}/01-c.md`]: specDoc('hardened', { brief: '03' }), [`${A}/02-d.md`]: specDoc('hardened', { brief: '04' }),
  })
  const out = status(d).stdout
  assert.ok(out.includes('⚠️ Brief 03 (c) moved on, but its dependency 02 (b) was never planned.\n   Plan it now?  /spec:plan @docs/roadmap/02-b.md\n'))
  assert.ok(out.includes('⚠️ Brief 01 (a) is unplanned while later brief 04 has moved on.\n   Still wanted?  /spec:plan @docs/roadmap/01-a.md\n'))
  const full = status(fullHost()).stdout
  assert.strictEqual(full.split('\n').filter((l) => l.startsWith('⚠️ ')).length, 3)
  assert.match(full, /· 2 more to decide \(--all\) · 7 hygiene findings/)
  const all = status(fullHost(), '--all').stdout
  assert.strictEqual(all.split('\n').filter((l) => l.startsWith('⚠️ ')).length, 5)
  assert.ok(!all.includes('more to decide'))
})

test('AC-20261105-05-8 roadmap heads, supersession, bracketless depends_on, stamps, status-less specs', () => {
  const d = small({
    'docs/roadmap/01-sch.md': brief('01', 'Sch', 'P0', '—'),
    'docs/roadmap/03-x.md': '# 03 — X\n\nPhase: P1 · Depends on: 02-B (02a-2; parts of 02a-3a),\n brief 04 · Risk: low\n\n## Result\n\nx\n',
    'docs/roadmap/04A-boards.md': brief('04A', 'Boards', 'P1', '—'),
    [`${A}/01-x.md`]: specDoc('draft', { brief: '03' }),
  })
  const out = status(d, '--all').stdout
  assert.match(out, /\/spec:plan @specs\/20261104\/01-x\.md\n   ├─ ⏳ brief 02\n   └─ ⏳ brief 04\n/)
  assert.ok(!out.includes('3a') && /04a boards/.test(out))
  const full = fullHost()
  const j = json(full)
  const sp = (n) => j.specs.find((s) => s.path.endsWith(n))
  assert.deepStrictEqual(sp('07-export-b.md').blockers, [`${A}/06-export-a.md (hardened)`, 'specs/20261103/01-rounds.md (draft)'])
  assert.deepStrictEqual(sp('06-export-a.md').blockers, [], 'a superseded dependency never blocks')
  assert.strictEqual(sp('02-views.md').brief, '04b')
  assert.ok(!j.specs.some((s) => s.path.includes('10-nostatus')) && !JSON.stringify(j.anomalies).includes('10-nostatus'))
  assert.ok(j.superseded.some((s) => s.path.endsWith('09-retired.md')))
})

test('AC-20261105-05-9 a spec built in a lane worktree is implementing, first, not done in its bar; a STOPPED run reads the frontmatter', () => {
  const d = fullHost()
  const j = json(d)
  const state = (n) => j.specs.find((s) => s.path.endsWith(n)).status
  assert.strictEqual(state('01-boards.md'), 'implementing')
  assert.strictEqual(state('05-adhoc-b.md'), 'hardened', 'a parked sidecar is no run')
  assert.match(status(d).stdout, /🔨 04a boards +P1 +░░░░░░░░░░ 0\/2/)
  const e = small({
    'docs/roadmap/01-a.md': brief('01', 'A', 'P0', '—'), 'docs/roadmap/02-b.md': brief('02', 'B', 'P0', '01'),
    [`${A}/01-a.md`]: specDoc('hardened', { brief: '01' }), [`${A}/02-b.md`]: specDoc('draft', { brief: '02' }),
    '.claude/worktrees/spec-01-a/specs/20261104/01-a.run/state.json': '{"step":"BUILD"}',
  })
  assert.deepStrictEqual(json(e).specs.map((s) => [s.path.slice(-8), s.status, s.blockers]), [['/01-a.md', 'implementing', []], ['/02-b.md', 'draft', []]])
})

test('AC-20261105-05-10 queue positions: first occurrence, done items count, unqueued briefs last, no overlay in a linked worktree', () => {
  const files = {
    'docs/roadmap/01-a.md': brief('01', 'A', 'P0', '—'), 'docs/roadmap/02-b.md': brief('02', 'B', 'P0', '—'), 'docs/roadmap/03-x.md': brief('03', 'X', 'P0', '—'),
    [`${A}/01-a.md`]: specDoc('hardened', { brief: '01', files: ['a.js'] }), [`${A}/02-b.md`]: specDoc('hardened', { brief: '02', files: ['b.js'] }), [`${A}/03-x.md`]: specDoc('hardened', { brief: '03', files: ['c.js'] }),
  }
  const d = small(files, [{ kind: 'prompt', payload: 'old', type: 'fix', done: '2026-11-02T00:00:00.000Z' }, { kind: 'brief', payload: '3' }, { kind: 'brief', payload: 'docs/roadmap/03-x.md' }, { kind: 'brief', payload: '02' }, { kind: 'brief', payload: 'docs/roadmap/03-x.md' }])
  const o = status(d, '--all').stdout
  assert.ok(!o.includes('queue-orphan'), '`3` is brief 03')
  assert.deepStrictEqual(json(d).next, `/spec:run ${A}/03-x.md`, 'queued 03 first, then 02, then the unqueued 01')
  assert.match(o, /⚡ 3 parallel lanes[^\n]*\n[^\n]+03-x\.md\n[^\n]+02-b\.md\n[^\n]+01-a\.md\n/)
  const e = small(files, [{ kind: 'prompt', payload: 'hello', type: 'plan' }])
  assert.match(status(e).stdout, /^q1 {2}📝 \/spec:plan hello$/m)
  const wt = path.join(path.dirname(e), 'linked')
  spawnSync('git', ['-C', e, 'worktree', 'add', '-q', '-b', 'side', wt], { encoding: 'utf8' })
  const linked = status(wt).stdout
  assert.ok(!/^q\d/m.test(linked) && linked.includes('🎯 Next'), 'a linked worktree renders without the overlay')
})

test('AC-20261105-05-11 the empty states and the unplanned-brief pick', () => {
  const ready = small({ 'docs/roadmap/01-a.md': brief('01', 'A', 'P0', '—'), 'docs/roadmap/02-b.md': brief('02', 'B', 'P0', '01') })
  assert.match(status(ready).stdout, /🎯 Next\n📝 \/spec:plan @docs\/roadmap\/01-a\.md\n/)
  const e = status(emptyHost()).stdout
  assert.ok(e.includes('   ✨ nothing next — no specs or briefs found\n') && e.endsWith('⬜ nothing waits\n'))
  assert.ok(status(allDoneHost(true)).stdout.includes('   ✨ nothing actionable — all specs done; 1 unplanned brief(s) blocked on unmet dependencies\n'))
  assert.ok(status(allDoneHost(false)).stdout.includes('   ✨ nothing next — all specs done, no unplanned briefs\n'))
})

test('AC-20261105-05-12 no fence, no ledger lines, none of v8\'s retired tails; blank first line; reset only on a TTY', () => {
  for (const d of [fullHost(), emptyHost()]) {
    for (const flags of [[], ['--all']]) {
      const out = status(d, ...flags).stdout
      assert.ok(out.startsWith('\n') && !out.startsWith('\n\n'))
      assert.ok(!out.includes('```') && !out.includes('\x1B'))
      for (const bad of ['📈', '/spec:fanout', 'fan-out is in flight', 'run is in flight', 'waiting on you', 'Pending questions', 'hardened specs are not queued', 'parallel lanes ready', 'queue empty', '🤷', 'implementing —', 'superseded —', 'done since last release', 'never released', '📥', '🟡']) {
        assert.ok(!out.includes(bad), `${bad} on ${flags.join('') || 'bare'}`)
      }
    }
  }
  const written = []
  const { write } = process.stdout; const tty = process.stdout.isTTY
  process.stdout.isTTY = true; process.stdout.write = (c) => { written.push(String(c)); return true }
  try { require(path.join(SPEC, 'scripts/status.js')).main(['--root', emptyHost()]) } finally { process.stdout.write = write; process.stdout.isTTY = tty }
  assert.strictEqual(written[0], '\x1Bc')
  assert.ok(written[1].startsWith('\n'))
})

test('AC-20261105-05-13 NN: v7\'s words and codes; v7\'s refusals; --json is exactly the five keys', () => {
  const d = fullHost()
  const met = status(d, '04b'); assert.deepStrictEqual([met.status, met.stdout], [0, 'brief 04b (views): all 1 dependencies met\n'])
  const unmet = status(d, '03'); assert.deepStrictEqual([unmet.status, unmet.stdout], [1, 'brief 03 (rounds): UNMET dependencies — 99 (missing)\n'])
  assert.match(status(d, '01').stdout, /^brief 01 \(foundation\): all zero dependencies met$/m)
  const none = status(d, '98'); assert.deepStrictEqual([none.status, none.stderr], [2, 'no docs/roadmap/98-*.md found\n'])
  const usage = 'usage: status.js [NN] [--all] [--json] [--root <dir>]\n'
  for (const argv of [['--brief', '03'], ['--next'], ['--lanes'], ['--pretty'], ['03', '04']]) {
    const r = status(d, ...argv); assert.deepStrictEqual([r.status, r.stderr, r.stdout], [2, usage, ''], argv.join(' '))
  }
  const both = status(d, '03', '--all'); assert.deepStrictEqual([both.status, both.stderr], [2, 'usage: --all cannot combine with NN\n'])
  assert.deepStrictEqual(JSON.parse(status(d, '04b', '--json').stdout), { brief: '04b', name: 'views', status: 'in-flight', depends_on: [{ brief: '04a', status: 'in-flight', met: true }], ready: true })
  const j = json(d)
  assert.deepStrictEqual(Object.keys(j), ['briefs', 'specs', 'superseded', 'anomalies', 'next'])
  assert.ok(j.briefs.every((b) => ['unplanned', 'in-flight', 'done', 'superseded'].includes(b.status)))
  assert.deepStrictEqual(j.anomalies.filter((a) => a.audience === 'decide').length, 5)
  assert.strictEqual(j.next, `/spec:run ${A}/01-boards.md`)
  assert.strictEqual(json(emptyHost()).next, null)
})

test('AC-20261105-05-15 the contract, the architecture note and the command doc say the same screen', () => {
  const doc = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')
  const para = doc('docs/v8/interface-contract.md').split('\n').find((l) => l.startsWith('`/spec:status` prints'))
  const archDoc = doc('docs/v8/architecture.md')
  const arch = archDoc.slice(archDoc.indexOf('- `status.js`'), archDoc.indexOf('- `init.js`'))
  assert.ok(para && arch.includes('lib/next.js'))
  for (const need of ['⚡ N parallel lanes — first stays on main', '🚦 solo', '⏳ after', '⚠️', '· N more to decide (--all)', 'queue-orphan', 'hand-tracked-status', '{briefs, specs, superseded, anomalies, next}']) {
    assert.ok(para.includes(need), `contract §5 names ${need}`)
  }
  for (const text of [para, arch]) for (const bad of ['📈', '📥', 'parallel lanes ready', 'Pending questions', '🤷']) assert.ok(!text.includes(bad), `status docs carry ${bad}`)
  assert.ok(arch.includes('{briefs, specs, superseded, anomalies, next}') && arch.includes('⚡ N parallel lanes — first stays on main'))
  const cmd = doc('spec/commands/status.md')
  assert.match(cmd, /fenced block/)
  assert.ok(!cmd.includes('📈'))
})

test('AC-20261108-06-8 a queued brief with every spec done and no open step reads done: no decide line and no anomaly; an opened box brings the line back; an unqueued done brief raises nothing', () => {
  const files = (box) => ({
    'docs/roadmap/03-rounds.md': brief('03', 'Rounds', 'P1', '—', box ? `\n## Steps outside specs\n\n- [${box}] cut over DNS\n` : ''), 'docs/roadmap/04-boards.md': brief('04', 'Boards', 'P1', '—'),
    [`${A}/01-rounds.md`]: specDoc('done', { brief: '03' }), [`${A}/02-boards.md`]: specDoc('done', { brief: '04' }),
  })
  const queued = [{ kind: 'brief', payload: '03' }]
  const d = small(files(null), queued)
  assert.ok(!status(d).stdout.includes('Close it?') && !status(d).stdout.includes('still queued'), status(d).stdout)
  assert.deepStrictEqual(json(d).anomalies.filter((x) => x.kind === 'brief-done-queued'), [])
  const open = small(files(' '), queued)
  assert.deepStrictEqual(json(open).anomalies.filter((x) => x.kind === 'brief-done-queued').map((x) => [x.kind, x.audience]), [['brief-done-queued', 'decide']], 'an opened box brings it back')
  assert.ok(status(open).stdout.includes('⚠️ Brief 03 (rounds) has every spec done; 1 step(s) outside specs are still open.\n   Close it?  /spec:queue done 03\n'))
  assert.ok(!status(open).stdout.includes('Brief 04 (boards) has every spec done'), 'brief 04 is not queued')
})

test('AC-20261107-05-6 an unstored done brief with an open step raises the decide line with its count; ticking the box clears it', () => {
  const files = (box) => ({ 'docs/roadmap/03-rounds.md': brief('03', 'Rounds', 'P1', '—', `\n## Steps outside specs\n\n- [${box}] cut over DNS\n`), [`${A}/01-rounds.md`]: specDoc('done', { brief: '03' }) })
  const out = status(small(files(' '))).stdout
  assert.ok(out.includes('⚠️ Brief 03 (rounds) has every spec done; 1 step(s) outside specs are still open.\n   Close it?  /spec:queue done 03\n'), out)
  const a = json(small(files(' '))).anomalies.filter((x) => x.kind === 'brief-done-queued')
  assert.deepStrictEqual(a.map((x) => x.detail), ['Brief 03 (rounds) has every spec done; 1 step(s) outside specs are still open.'])
  assert.ok(!status(small(files('x'))).stdout.includes('has every spec done'))
})
