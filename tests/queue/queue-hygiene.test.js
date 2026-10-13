'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo, read } = require('../helpers')

// specs/20261013/02-queue-hygiene.md: `add` refuses near-duplicate prompts, `list` shows age and
// rot flags, ticked rows archive beside the queue file, `groom` prints the cut list read-only,
// and the command doctrine asks per item. Pins AC-20261013-02-1 through AC-20261013-02-8.

const SCRIPT = 'scripts/spec-queue.js'
const DAY = 86400000
const daysAgo = (n) => new Date(Date.now() - n * DAY - 3600000).toISOString()

function host({ briefs = {}, specs = {}, queue = null, seq = null } = {}) {
  const dir = fs.realpathSync(tmpdir('queue-hygiene'))
  gitRepo(dir)
  if (Object.keys(briefs).length) {
    fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
      '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n')
    for (const [file, header] of Object.entries(briefs)) {
      fs.writeFileSync(path.join(dir, 'docs/roadmap', file), header)
    }
  }
  for (const [file, fm] of Object.entries(specs)) {
    const p = path.join(dir, 'specs', file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '---\n' + fm + '\n---\n\n# spec\n')
  }
  if (queue) {
    fs.writeFileSync(path.join(dir, '.git/spec-queue.json'),
      JSON.stringify({ version: 1, seq: seq === null ? queue.length : seq, items: queue }, null, 2))
  }
  return dir
}
const qPath = (dir) => path.join(dir, '.git/spec-queue.json')
const archivePath = (dir) => path.join(dir, '.git/spec-queue-done.json')

const Q1 = "merge-back.sh create fails with 'host config cannot be read as JSON' when invoked by a relative path: its config reader require()s a path built from $0, which Node resolves as a package name. Fix: resolve the lib path absolutely before require; add a test invoking create by relative path."
const DUP = "merge-back.sh create fails with 'host config cannot be read as JSON' when the script is invoked by a relative path (it requires spec/scripts/lib/host-config.js as a bare module name); resolve its own dir absolutely"

test('AC-20261013-02-1: spec-queue add exits 2 on a prompt whose token Jaccard against a pending prompt is at least 0.35, naming the id, a two-decimal score, show and --distinct, and writes nothing', () => {
  const dir = host({ queue: [{ id: 'q1', kind: 'prompt', payload: Q1, added: daysAgo(1) }] })
  const before = fs.readFileSync(qPath(dir), 'utf8')
  const r = runNode(SCRIPT, ['add', DUP], { cwd: dir })
  assert.strictEqual(r.status, 2, 'D1: a near-duplicate prompt must exit 2, or the same finding is queued twice from two sessions: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /near-duplicate of q1/, 'D1: the refusal must name the matching id so the caller can inspect it: ' + r.stderr)
  const m = /\(score (\d\.\d\d)\)/.exec(r.stderr)
  assert.ok(m && parseFloat(m[1]) >= 0.35, 'D1: the refusal must print the score to two decimals and it must be at least the 0.35 threshold: ' + r.stderr)
  assert.match(r.stderr, /spec-queue show q1/, 'D1: the refusal must name `spec-queue show q1` as the inspect remedy: ' + r.stderr)
  assert.match(r.stderr, /--distinct/, 'D1: the refusal must name --distinct as the override, or a legitimate near-match has no path forward: ' + r.stderr)
  assert.strictEqual(fs.readFileSync(qPath(dir), 'utf8'), before,
    'D1: a refused add must leave the queue file byte-identical — no partial write on a usage refusal')
})

test('AC-20261013-02-2: spec-queue add still appends with --distinct, a below-threshold prompt, a brief number and a spec path', () => {
  const addTo = (argv, extra = {}) => {
    const dir = host({ ...extra, queue: [{ id: 'q1', kind: 'prompt', payload: Q1, added: daysAgo(1) }] })
    const r = runNode(SCRIPT, argv, { cwd: dir })
    return { dir, r }
  }
  const a = addTo(['add', DUP, '--distinct'])
  assert.strictEqual(a.r.status, 0, 'D1: --distinct must skip the duplicate check, or the honest override does not exist: ' + a.r.stdout + a.r.stderr)
  assert.strictEqual(JSON.parse(fs.readFileSync(qPath(a.dir), 'utf8')).items.length, 2,
    'D1: the --distinct add must append the item, not merely exit 0: ' + fs.readFileSync(qPath(a.dir), 'utf8'))

  const b = addTo(['add', 'Decide whether the walkthrough export keeps its PNG step'])
  assert.strictEqual(b.r.status, 0, 'D1: a prompt scoring below 0.35 against every pending prompt must be accepted: ' + b.r.stdout + b.r.stderr)

  const c = addTo(['add', '15'])
  assert.strictEqual(c.r.status, 0, 'D1: brief payloads are unaffected by the duplicate check: ' + c.r.stdout + c.r.stderr)

  const d = addTo(['add', 'specs/20260701/02-fix.md'], { specs: { '20260701/02-fix.md': 'date: 2026-07-01\nstatus: hardened\nbrief: n/a' } })
  assert.strictEqual(d.r.status, 0, 'D1: spec payloads are unaffected by the duplicate check: ' + d.r.stdout + d.r.stderr)

  // --distinct is a bare flag accepted with no duplicate present too.
  const e = addTo(['add', 'Decide whether the walkthrough export keeps its PNG step', '--distinct'])
  assert.strictEqual(e.r.status, 0, 'D1: --distinct with no duplicate present must still be accepted, not refused as an unknown flag: ' + e.r.stdout + e.r.stderr)
})

// The AC-3 queue: stale ungated prompt, prompt citing a done spec, gated prompt whose gate is met,
// and (not queued) an on-disk brief the list virtually reconciles, which has no `added`.
const DONE_SPEC = { '20260101/01-done.md': 'date: 2026-01-01\nstatus: done\nbrief: n/a' }
function flagQueue() {
  return [
    { id: 'q1', kind: 'prompt', payload: Q1, added: daysAgo(20) },
    { id: 'q2', kind: 'prompt', payload: 'Check the export step after specs/20260101/01-done.md shipped to staging', added: daysAgo(3) },
    { id: 'q3', kind: 'prompt', payload: 'Rotate the staging credentials for the review service', after: { spec: 'specs/20260101/01-done.md' }, added: daysAgo(2) },
  ]
}
const BRIEF05 = { '05-x.md': '# 05 — X\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n' }

test('AC-20261013-02-3: spec-queue list prints an age column and the stale, cites-done and gate-met flags, one line per row, numbered 1-4, with age ? and no flag for a brief lacking added', () => {
  const dir = host({ specs: DONE_SPEC, briefs: BRIEF05, queue: flagQueue() })
  const r = runNode(SCRIPT, ['list'], { cwd: dir })
  assert.strictEqual(r.status, 0, r.stderr)
  const rows = r.stdout.split('\n').filter((l) => /^\d+ /.test(l))
  assert.strictEqual(rows.length, 4, 'D2: all four pending items must print, one line each: ' + r.stdout)
  assert.match(rows[0], /^1  q1\s+20d\s+merge-back\.sh.*⌛ stale$/, 'D2: an ungated prompt 20 days old must show `20d` and the ⌛ stale flag, or rot goes unseen: ' + rows[0])
  assert.match(rows[1], /^2  q2\s+3d\s+.*📎 cites done 01-done$/, 'D2: a prompt naming a done spec path must carry `📎 cites done <basename>`: ' + rows[1])
  assert.doesNotMatch(rows[1], /⌛ stale/, 'D2: a 3-day-old prompt is never stale: ' + rows[1])
  assert.match(rows[2], /^3  q3\s+2d\s+.*⏳ gate met$/, 'D2: a gated item whose gate is met must say so, or an opened gate sits idle unnoticed: ' + rows[2])
  assert.doesNotMatch(rows[2], /⌛ stale/, 'D2: a gated item is never flagged stale: ' + rows[2])
  assert.match(rows[3], /^4  —\s+\?\s+brief 05/, 'D2: a brief with no `added` must print id `—` and age `?`: ' + rows[3])
  assert.doesNotMatch(rows[3], /⌛|📎|gate met/, 'D2: an item with age `?` carries no flag: ' + rows[3])
  const bare = host({ specs: DONE_SPEC, queue: [{ id: 'q1', kind: 'prompt', payload: 'Check export after specs/20260101/01 shipped', added: daysAgo(1) }] })
  assert.match(runNode(SCRIPT, ['list'], { cwd: bare }).stdout, /📎 cites done 01-done/, 'D2: a bare specs/YYYYMMDD/NN citation of a done spec must be flagged')
})

function archiveHost() {
  return host({
    specs: { '20260101/03-shipped.md': 'date: 2026-01-01\nstatus: done\nbrief: n/a' },
    queue: [
      { id: 'q1', kind: 'prompt', payload: 'first task already ticked', ticked: daysAgo(5), added: daysAgo(9) },
      { id: 'q2', kind: 'prompt', payload: 'second task still pending', added: daysAgo(4) },
      { id: 'q3', kind: 'spec', spec: 'specs/20260101/03-shipped.md', added: daysAgo(3) },
    ],
    seq: 3,
  })
}

test('AC-20261013-02-4: spec-queue done archives ticked and derived-done rows into spec-queue-done.json, leaves the queue file empty with seq kept, and list reports nothing pending', () => {
  const dir = archiveHost()
  const r = runNode(SCRIPT, ['done', 'q2'], { cwd: dir })
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  const q = JSON.parse(fs.readFileSync(qPath(dir), 'utf8'))
  assert.deepStrictEqual(q.items, [], 'D3: the queue file must hold only live rows after a write: ' + JSON.stringify(q))
  assert.strictEqual(q.seq, 3, 'D3: seq stays in the queue file so archived ids are never reused: ' + JSON.stringify(q))
  assert.ok(fs.existsSync(archivePath(dir)), 'D3: the archive file must be written beside the queue file')
  const a = JSON.parse(fs.readFileSync(archivePath(dir), 'utf8'))
  assert.strictEqual(a.version, 1, 'D3: the archive carries {version:1, items}: ' + JSON.stringify(a))
  assert.deepStrictEqual(a.items.map((i) => i.id), ['q1', 'q2', 'q3'], 'D3: archived rows append in queue order: ' + JSON.stringify(a.items))
  for (const i of a.items) {
    assert.ok(!Number.isNaN(Date.parse(i.archived)) && /T.*Z$/.test(i.archived), 'D3: every archived row carries an ISO `archived` stamp: ' + JSON.stringify(i))
  }
  assert.ok(a.items[0].ticked && a.items[1].ticked, 'D3: q1 and q2 keep their `ticked` stamps in the archive: ' + JSON.stringify(a.items))
  const l = runNode(SCRIPT, ['list'], { cwd: dir })
  assert.strictEqual(l.stdout.trim(), '✨ nothing pending · 3 done',
    'D3: the footer count must include archive rows, or archiving makes the done history vanish from list: ' + l.stdout + l.stderr)
})

test('AC-20261013-02-5: spec-queue show resolves an archived id as done (archived) while move and done on it exit 2 saying nothing to do', () => {
  const dir = archiveHost()
  assert.strictEqual(runNode(SCRIPT, ['done', 'q2'], { cwd: dir }).status, 0, 'setup: done q2 must archive the rows')
  const s = runNode(SCRIPT, ['show', 'q1'], { cwd: dir })
  assert.strictEqual(s.status, 0, 'D3: show must still resolve an archived id: ' + s.stdout + s.stderr)
  assert.strictEqual(s.stdout.split('\n')[0], 'q1  prompt · done (archived)', 'D3: show prints the archived marker on its first line: ' + s.stdout)
  assert.match(s.stdout, /first task already ticked/, 'D3: show prints the full payload of an archived row: ' + s.stdout)
  for (const argv of [['move', 'q1', '1'], ['done', 'q1']]) {
    const r = runNode(SCRIPT, argv, { cwd: dir })
    assert.strictEqual(r.status, 2, `D3: \`${argv.join(' ')}\` on an archived id must exit 2, not silently succeed or re-queue: ` + r.stdout + r.stderr)
    assert.match(r.stderr, /q1 is archived \(done\) — nothing to do/, `D3: \`${argv.join(' ')}\` must say the id is archived: ` + r.stderr)
  }
})

test('AC-20261013-02-6: spec-queue groom prints duplicates, cites done, gate met and stale buckets in order with the fates footer, exits 0, and never writes the queue file', () => {
  const queue = flagQueue()
  queue.push({ id: 'q5', kind: 'prompt', payload: DUP, added: daysAgo(0) })
  const dir = host({ specs: DONE_SPEC, briefs: BRIEF05, queue })
  const before = fs.readFileSync(qPath(dir), 'utf8')
  const r = runNode(SCRIPT, ['groom'], { cwd: dir })
  assert.strictEqual(r.status, 0, 'D4: groom exits 0 always: ' + r.stdout + r.stderr)
  const out = r.stdout
  const idx = ['duplicates (1):', 'cites done (1):', 'gate met (1):', 'stale (1):', 'fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes'].map((h) => out.indexOf(h))
  assert.ok(idx.every((i) => i >= 0), 'D4: every bucket header and the fates footer must print: ' + out + r.stderr)
  assert.deepStrictEqual([...idx].sort((a, b) => a - b), idx, 'D4: buckets print in the order duplicates, cites done, gate met, stale, then the footer: ' + out)
  const section = (from, to) => out.slice(idx[from], idx[to])
  assert.match(section(0, 1), /q1 ~ q5  0\.\d\d/, 'D4: the duplicate pair prints as `q1 ~ q5  0.NN`: ' + out)
  assert.match(section(1, 2), /q2\s+3d\s/, 'D4: q2 sits in the cites done bucket with its age: ' + out)
  assert.match(section(2, 3), /q3\s+2d\s/, 'D4: q3 sits in the gate met bucket: ' + out)
  assert.match(section(3, 4), /q1\s+20d\s/, 'D4: q1 sits in the stale bucket: ' + out)
  assert.doesNotMatch(section(3, 4), /q5/, 'D4: a prompt added today is not stale: ' + out)
  assert.strictEqual(fs.readFileSync(qPath(dir), 'utf8'), before, 'D4: groom is read-only — the queue file must stay byte-identical')
  assert.ok(!fs.existsSync(archivePath(dir)), 'D4: groom never archives either')
})

test('AC-20261013-02-7: spec-queue groom on one fresh ungated prompt citing no spec prints exactly the nothing-to-groom line and exits 0', () => {
  const dir = host({ queue: [{ id: 'q1', kind: 'prompt', payload: 'Tidy the release notes wording', added: new Date().toISOString() }] })
  const r = runNode(SCRIPT, ['groom'], { cwd: dir })
  assert.strictEqual(r.status, 0, 'D4: groom exits 0 always: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout.trim(), '✨ nothing to groom · 1 pending',
    'D4: a clean queue must print only the one-line verdict, never empty bucket headers: ' + r.stdout + r.stderr)
})

test('AC-20261013-02-8: the queue command doctrine names groom in its argument-hint and subcommand list, says never tick in Render, and stays within 55 lines', () => {
  const file = path.join(__dirname, '../../spec/commands/queue.md')
  assert.ok(fs.existsSync(file), 'spec/commands/queue.md must exist')
  const src = read('spec/commands/queue.md')
  const hint = /^argument-hint:.*$/m.exec(src)
  assert.ok(hint && /groom/.test(hint[0]), 'D5: the frontmatter argument-hint must list groom, or the session never learns the subcommand exists: ' + (hint && hint[0]))
  assert.match(src, /^- `groom`/m, 'D5: the subcommand list needs a groom line: ' + src)
  const render = src.slice(src.indexOf('## Render'))
  assert.match(render, /never tick/, 'D5: § Render must carry the ask-per-item rule (never tick without a yes), or groom becomes an auto-tick path: ' + render)
  assert.ok(src.split('\n').length - (src.endsWith('\n') ? 1 : 0) <= 55, 'D5: the file must stay at or under the 55-line read-load ceiling: ' + src.split('\n').length)
})
