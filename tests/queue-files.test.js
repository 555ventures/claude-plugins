'use strict'
// The tracked half of the queue (ADR-0050, spec 20261108/06): the items only /spec:queue add|move|done place, one file
// each under specs/queue/, one commit each on trunk. Real repos, real clones of one bare origin, real queue.js processes.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { tmpdir, gitRepo, runNode, SPEC, ROOT, seedQueue } = require('./helpers')
const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))
const QF = require(path.join(SPEC, 'scripts/lib/queue-files.js'))

const g = (d, ...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }).stdout
const q = (d, ...a) => runNode('scripts/queue.js', [...a, '--root', d])
const list = (d) => JSON.parse(q(d, 'list', '--json').stdout).items
const subjects = (d, n = 50) => g(d, 'log', `-${n}`, '--format=%s').trim().split('\n')
const touched = (d, rev = 'HEAD') => g(d, 'show', '--name-only', '--format=', rev).trim().split('\n').filter(Boolean)
const w = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const sp = (status, brief) => `---\nstatus: ${status}\n${brief ? `brief: ${brief}\n` : ''}---\n# S\n`
const files = (d) => { try { return fs.readdirSync(path.join(d, 'specs/queue')).sort() } catch { return [] } }
const ID = /^\d{8}-[0-9a-f]{4}$/

// Two real clones of one bare origin, each with its own identity and the same first commit.
function clones() {
  const origin = tmpdir('origin')
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
  const make = (name) => {
    const d = tmpdir(name)
    spawnSync('git', ['clone', '-q', origin, d])
    for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['commit.gpgsign', 'false']]) g(d, 'config', k, v)
    return d
  }
  const a = make('clone-a')
  w(a, '.gitignore', '.claude/worktrees/\n'); w(a, 'a.txt', 'a\n')
  g(a, 'checkout', '-q', '-b', 'main'); g(a, 'add', '-A'); g(a, 'commit', '-q', '-m', 'init'); g(a, 'push', '-q', 'origin', 'main')
  return { origin, a, b: make('clone-b') }
}
const pull = (d) => g(d, 'pull', '-q', '--rebase', 'origin', 'main')
const push = (d) => g(d, 'push', '-q', 'origin', 'main')

test('rank: append, --top and the exact midpoint compare as numbers and never renumber', () => {
  const { rank } = QF
  assert.deepStrictEqual([rank.after(undefined), rank.before(undefined)], ['1', '1'])
  assert.deepStrictEqual([rank.after('3'), rank.after('3.5'), rank.after('-2.5')], ['4', '4', '-2'], 'append is floor + 1')
  assert.deepStrictEqual([rank.before('3'), rank.before('3.5'), rank.before('-2.5')], ['2', '3', '-3'], '--top is ceil - 1')
  assert.deepStrictEqual([rank.between('1', '3'), rank.between('1', '2'), rank.between('1', '1.5'), rank.between('-1', '0')], ['2', '1.5', '1.25', '-0.5'])
  assert.deepStrictEqual([rank.cmp('2', '10'), rank.cmp('1.5', '1.25'), rank.cmp('-1', '-0.5'), rank.cmp('2.0', '2')], [-1, 1, -1, 0], 'numbers, not strings')
  let [lo, hi] = ['1', '2']
  for (let k = 0; k < 300; k++) { const mid = rank.between(lo, hi); assert.ok(rank.cmp(lo, mid) < 0 && rank.cmp(mid, hi) < 0); hi = mid }
})

test('newId: the date and four hex, unique over the files and the ids the local store holds', () => {
  const d = tmpdir('ids'); gitRepo(d)
  const ids = new Set()
  for (let i = 0; i < 50; i++) { const id = QF.newId(d, new Date(2026, 10, 8, 12), ids); assert.match(id, /^20261108-[0-9a-f]{4}$/); assert.ok(!ids.has(id)); ids.add(id) }
  w(d, 'specs/queue/20261108-aaaa.json', '{}')
  const seen = new Set(); for (let i = 0; i < 300; i++) seen.add(QF.newId(d, new Date(2026, 10, 8), new Set(['20261108-bbbb'])))
  assert.ok(!seen.has('20261108-aaaa') && !seen.has('20261108-bbbb'), 'a taken id is never issued')
})

test('AC-20261108-06-1 two clones add, move and close through queue.js; plain git push and pull make list --json identical, each write one commit of its own paths and no script having pushed, pulled or fetched', () => {
  const { origin, a, b } = clones()
  const tip = () => g(origin, 'rev-parse', 'main').trim()
  const first = tip()
  for (const t of ['a one', 'a two', 'a three']) assert.strictEqual(q(a, 'add', t).status, 0)
  assert.strictEqual(q(a, 'move', 'a three', '1').status, 0)
  assert.deepStrictEqual(touched(a).length, 1, 'a move is one commit of one path')
  assert.strictEqual(q(a, 'done', 'a one').status, 0)
  assert.deepStrictEqual(touched(a).length, 1, 'a close is one commit of one path')
  for (const t of ['b one', 'b two']) assert.strictEqual(q(b, 'add', t).status, 0)
  assert.strictEqual(q(b, 'move', 'b two', '1').status, 0)
  assert.strictEqual(q(b, 'done', 'b one').status, 0)
  assert.strictEqual(tip(), first, 'no script pushed: origin has not moved')
  for (const d of [a, b]) assert.ok(!fs.existsSync(path.join(d, '.git/FETCH_HEAD')), 'no script fetched or pulled in ' + d)
  assert.ok(list(a).length === 2 && list(b).length === 1, 'before any sync each machine sees its own queue')
  assert.ok(subjects(a).slice(0, 5).every((s) => /^chore\(queue\): (add|move|done) /.test(s)), 'every write is one chore(queue) commit')
  push(a); pull(b) // no conflict: item files are disjoint
  assert.strictEqual(g(b, 'status', '--porcelain').trim(), '')
  push(b); pull(a)
  const [la, lb] = [q(a, 'list', '--json').stdout, q(b, 'list', '--json').stdout]
  assert.strictEqual(la, lb, 'identical list --json on both machines')
  assert.deepStrictEqual(JSON.parse(la).items.map((i) => i.payload).sort(), ['a three', 'a two', 'b two'])
  assert.ok(!fs.existsSync(path.join(a, '.git/spec-queue.json')) && !fs.existsSync(path.join(b, '.git/spec-queue.json')), 'the local file was never written')
})

test('AC-20261108-06-3 a tracked write with the main checkout off trunk, detached or mid-merge, mid-rebase, mid-cherry-pick or mid-revert exits 2 naming the state and its remedy and changes nothing; list prints the items', () => {
  const stuck = (kind) => {
    const d = tmpdir('q3'); gitRepo(d)
    q(d, 'add', 'already queued')
    const git2 = (...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' })
    const edit = (text, msg) => { w(d, 'c.txt', text); git2('add', '-A'); git2('commit', '-q', '-m', msg) }
    edit('base\n', 'base')
    if (kind === 'branch') git2('checkout', '-q', '-b', 'feature')
    else if (kind === 'detached') git2('checkout', '-q', '--detach')
    else if (kind === 'revert') { edit('two\n', 'two'); edit('three\n', 'three'); git2('revert', '--no-edit', 'HEAD~1') }
    else {
      git2('checkout', '-q', '-b', 'side'); edit('side\n', 'side'); git2('checkout', '-q', 'main'); edit('main\n', 'main')
      if (kind === 'merge') git2('merge', 'side')
      else if (kind === 'cherry-pick') git2('cherry-pick', 'side')
      else { git2('checkout', '-q', 'side'); git2('rebase', 'main') }
    }
    return d
  }
  const states = { branch: /on feature, not main/, detached: /detached HEAD/, merge: /middle of a merge/, rebase: /middle of a rebase/, 'cherry-pick': /middle of a cherry-pick/, revert: /middle of a revert/ }
  for (const [kind, name] of Object.entries(states)) {
    const d = stuck(kind)
    const [log, status, before] = [g(d, 'log', '--all', '--format=%H').trim(), g(d, 'status', '--porcelain'), files(d)]
    for (const args of [['add', 'new words'], ['done', 'already queued'], ['move', 'already queued', '1']]) {
      const r = q(d, ...args)
      assert.strictEqual(r.status, 2, `${kind}: ${args[0]}`)
      assert.match(r.stderr, name, kind)
      assert.match(r.stderr, /check out main there|--continue or --abort/, `${kind} names the remedy`)
    }
    assert.strictEqual(g(d, 'log', '--all', '--format=%H').trim(), log, kind + ': no commit')
    assert.deepStrictEqual(files(d), before, kind + ': no file')
    assert.strictEqual(g(d, 'status', '--porcelain'), status, kind + ': the working tree is as it was')
    const ls = q(d, 'list')
    assert.strictEqual(ls.status, 0, kind)
    assert.ok(ls.stdout.includes('already queued'), kind + ': the items still print')
  }
})

test('AC-20261108-06-3 a failed git commit puts the paths back and prints git\'s message', () => {
  const d = tmpdir('q3c'); gitRepo(d)
  assert.strictEqual(q(d, 'add', 'before').status, 0)
  g(d, 'config', 'commit.gpgsign', 'true'); g(d, 'config', 'gpg.program', 'false') // a commit git cannot sign: --no-verify does not skip it
  const [head, before] = [g(d, 'rev-parse', 'HEAD'), files(d)]
  for (const args of [['add', 'after'], ['done', 'before']]) {
    const r = q(d, ...args)
    assert.notStrictEqual(r.status, 0, args.join(' '))
    assert.match(r.stderr, /git commit failed in .*(gpg|sign)/i, 'git\'s own message is printed: ' + r.stderr)
    assert.strictEqual(g(d, 'rev-parse', 'HEAD'), head, 'no commit')
    assert.deepStrictEqual(files(d), before, 'the paths are back as they were')
    assert.strictEqual(g(d, 'status', '--porcelain'), '', 'index and tree clean')
  }
})

test('AC-20261108-06-4 an add or a move changes one path in one commit; --top, append and 200 moves into one gap keep the asked order; equal ranks list in id order', () => {
  const d = tmpdir('q4'); gitRepo(d)
  const n0 = subjects(d).length
  assert.strictEqual(q(d, 'add', 'one').status, 0)
  assert.strictEqual(subjects(d).length, n0 + 1)
  assert.match(subjects(d)[0], /^chore\(queue\): add \d{8}-[0-9a-f]{4}$/)
  assert.deepStrictEqual(touched(d), [`specs/queue/${list(d)[0].id}.json`])
  for (const t of ['two', 'three']) q(d, 'add', t)
  q(d, 'add', 'top', '--top')
  assert.deepStrictEqual(list(d).map((i) => i.payload), ['top', 'one', 'two', 'three'], '--top and append')
  const n1 = subjects(d).length
  assert.strictEqual(q(d, 'move', 'three', '2').status, 0)
  assert.strictEqual(subjects(d).length, n1 + 1)
  assert.strictEqual(touched(d).length, 1, 'a move changes one file')
  assert.deepStrictEqual(list(d).map((i) => i.payload), ['top', 'three', 'one', 'two'])
  // 200 moves into one gap: X and Y take turns going to position 2, so the gap after the first item halves every time.
  // The ranks are the one maths of both stores; the local file takes the 200 moves (no commit each), a tracked item 12.
  const e = tmpdir('q4b'); gitRepo(e)
  seedQueue(e, ['A', 'X', 'Y', 'B'].map((p, i) => ({ id: `20261101-000${i}`, kind: 'prompt', type: 'plan', payload: p, added: 'x' })))
  const spec = (p, root = e) => Q.read(root).items.find((i) => i.payload === p)
  const move = (p, root = e) => { const read = Q.read(root); Q.move(root, read, Q.fill(root, read).items.find((i) => i.payload === p), 2) }
  for (let k = 0; k < 200; k++) move(k % 2 ? 'X' : 'Y')
  assert.deepStrictEqual(Q.open(Q.read(e)).map((i) => i.payload), ['A', 'X', 'Y', 'B'], 'after 200 moves each went where it was asked')
  assert.ok(spec('X').rank.length > 50 && /^-?\d+(\.\d+)?$/.test(spec('X').rank), 'ranks are exact midpoints')
  assert.deepStrictEqual([spec('A').rank, spec('B').rank], ['1', '4'], 'the neighbours were never touched')
  const t = tmpdir('q4t'); gitRepo(t)
  for (const p of ['A', 'X', 'Y', 'B']) q(t, 'add', p)
  const c0 = subjects(t).length
  for (let k = 0; k < 12; k++) move(k % 2 ? 'X' : 'Y', t)
  assert.strictEqual(subjects(t, 100).length, c0 + 12, 'one commit per tracked move')
  assert.deepStrictEqual(list(t).map((i) => i.payload), ['A', 'X', 'Y', 'B'])
  // two clones append at the same rank: both list them by id
  const { a, b } = clones()
  for (const [d2, id] of [[a, '20261101-bbbb'], [b, '20261101-aaaa']]) {
    w(d2, `specs/queue/${id}.json`, JSON.stringify({ version: 4, id, rank: '1', kind: 'prompt', type: 'plan', payload: id, added: 'x' }))
    g(d2, 'add', '-A'); g(d2, 'commit', '-q', '-m', 'item')
  }
  push(a); pull(b); push(b); pull(a)
  for (const d2 of [a, b]) assert.deepStrictEqual(list(d2).map((i) => i.id), ['20261101-aaaa', '20261101-bbbb'], 'ties break by id in ' + d2)
})

test('AC-20261108-06-4 a move into the middle of two items of one rank lands where it was asked or refuses naming the tie', () => {
  const d = tmpdir('q4tie'); gitRepo(d)
  const row = (id, rank, payload) => ({ version: 4, id, rank, kind: 'prompt', type: 'plan', payload, added: 'x' })
  for (const r of [row('20261101-aaaa', '1', 'A'), row('20261101-bbbb', '2', 'B'), row('20261101-cccc', '2', 'C'), row('20261101-0001', '3', 'Z'), row('20261101-bbbc', '4', 'M')]) w(d, `specs/queue/${r.id}.json`, JSON.stringify(r))
  g(d, 'add', '-A'); g(d, 'commit', '-q', '-m', 'two clones appended at once')
  const order = () => list(d).map((i) => i.payload)
  assert.deepStrictEqual(order(), ['A', 'B', 'C', 'Z', 'M'])
  const n = subjects(d).length
  const r = q(d, 'move', '20261101-0001', '3') // between B and C, but Z's id sorts before both
  assert.strictEqual(r.status, 2, r.stdout + r.stderr)
  assert.ok(r.stderr.includes('20261101-bbbb and 20261101-cccc share rank 2'), r.stderr)
  assert.ok(!r.stdout.includes('moved'), 'no position is claimed: ' + r.stdout)
  assert.strictEqual(subjects(d).length, n, 'nothing committed')
  assert.strictEqual(g(d, 'status', '--porcelain').trim(), '', 'nothing written')
  const m = q(d, 'move', '20261101-bbbc', '3') // M's id falls between B's and C's: one file can go there
  assert.strictEqual(m.status, 0, m.stderr)
  assert.deepStrictEqual(order(), ['A', 'B', 'M', 'C', 'Z'], 'M is third, as printed')
  assert.strictEqual(q(d, 'move', '20261101-0001', '2').status, 0)
  assert.deepStrictEqual(order(), ['A', 'Z', 'B', 'M', 'C'], 'Z is second, as printed')
})

test('AC-20261108-06-4 a move past the last position lands the item last, as printed', () => {
  const d = tmpdir('q4end'); gitRepo(d)
  w(d, 'docs/roadmap/05-extra.md', '# 05 — Extra\n'); w(d, 'docs/roadmap/06-more.md', '# 06 — More\n')
  for (const t of ['A', 'B', 'C']) q(d, 'add', t)
  const order = () => list(d).map((i) => i.payload)
  for (const n of ['5', '10']) {
    const r = q(d, 'move', 'A', n)
    assert.strictEqual(r.status, 0, r.stderr)
    assert.deepStrictEqual(order(), ['B', 'C', 'A', '05', '06'], `move to ${n} puts A after the last stored item`)
    if (n === '5') assert.ok(r.stdout.includes(' to 3'), r.stdout)
    q(d, 'move', 'A', '1')
  }
  const r = q(d, 'move', '06', '5') // a filled brief moved to a position among the filled rows
  assert.strictEqual(r.status, 0, r.stderr)
  assert.deepStrictEqual(order(), ['A', 'B', 'C', '06', '05'], 'the filled brief becomes the last stored item, not the first')
})

test('AC-20261108-06-4 move on a local item re-ranks it in the local file with no commit; a filled item becomes one tracked file', () => {
  const d = tmpdir('q4l'); gitRepo(d)
  w(d, 'docs/roadmap/05-extra.md', '# 05 — Extra\n')
  q(d, 'add', 'tracked one')
  seedQueue(d, [{ id: 'q1', rank: '5', kind: 'prompt', type: 'plan', payload: 'driver one', added: new Date().toISOString() }])
  assert.deepStrictEqual(list(d).map((i) => i.payload), ['tracked one', 'driver one', '05'], 'one list over both stores, the fill last')
  const [head, n] = [g(d, 'rev-parse', 'HEAD'), files(d).length]
  assert.strictEqual(q(d, 'move', 'driver one', '1').status, 0)
  assert.deepStrictEqual(list(d).map((i) => i.payload), ['driver one', 'tracked one', '05'])
  assert.strictEqual(g(d, 'rev-parse', 'HEAD'), head, 'a local move makes no commit')
  assert.strictEqual(files(d).length, n, 'and writes no tracked file')
  const local = JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8'))
  assert.deepStrictEqual([local.version, local.items.length, local.items[0].id], [4, 1, 'q1'])
  assert.strictEqual(q(d, 'move', '05', '1').status, 0)
  assert.strictEqual(files(d).length, n + 1, 'the filled brief became one tracked file')
  assert.strictEqual(touched(d).length, 1)
  assert.deepStrictEqual(list(d).map((i) => i.payload), ['05', 'driver one', 'tracked one'])
  q(d, 'done', 'driver one') // a local item: done is set in the local file
  assert.strictEqual(g(d, 'status', '--porcelain', '--', 'specs/queue'), '')
  assert.ok(JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8')).items[0].done)
})

test('AC-20261108-06-5 done deletes a tracked prompt\'s file, leaves one tombstone for unfinished work listed last, and any tracked write deletes what trunk reads done', () => {
  const d = tmpdir('q5'); gitRepo(d)
  w(d, 'docs/roadmap/03-fin.md', '# 03 — fin\n'); w(d, 'specs/20261104/03-a.md', sp('done', '03'))
  w(d, 'docs/roadmap/04-wip.md', '# 04 — wip\n'); w(d, 'specs/20261104/04-a.md', sp('hardened', '04'))
  w(d, 'specs/20261104/09-adhoc.md', sp('hardened'))
  for (const t of ['a prompt', 'specs/20261104/09-adhoc.md', '03']) assert.strictEqual(q(d, 'add', t).status, 0, t) // brief 03 is finished: its file goes in the next write
  assert.strictEqual(files(d).length, 3)
  assert.strictEqual(q(d, 'done', 'a prompt').status, 0)
  assert.strictEqual(files(d).length, 1, 'the prompt\'s file is gone, and brief 03\'s (every spec done) with it, in one commit')
  assert.strictEqual(touched(d).length, 2)
  assert.match(subjects(d)[0], /^chore\(queue\): done \d{8}-[0-9a-f]{4} \d{8}-[0-9a-f]{4}$/)
  assert.strictEqual(q(d, 'done', '04').status, 0) // brief 04 is in the fill with no id: one write stores its tombstone
  assert.strictEqual(files(d).length, 2, 'unfinished work leaves the one tombstone')
  const tomb = Q.read(d).items.find((i) => i.kind === 'brief' && i.payload === '04')
  assert.deepStrictEqual(Object.keys(tomb).sort(), ['done', 'id', 'kind', 'payload'], 'a tombstone is tiny')
  assert.strictEqual(touched(d).length, 1)
  assert.deepStrictEqual(list(d).map((i) => i.payload), ['specs/20261104/09-adhoc.md', '04'], 'the unfinished work is listed last')
  assert.strictEqual(q(d, 'done', 'specs/20261104/09-adhoc.md').status, 0)
  assert.deepStrictEqual(list(d).map((i) => i.payload), ['04', 'specs/20261104/09-adhoc.md'], 'ad-hoc spec work comes back from the fill too')
  assert.strictEqual(files(d).length, 2, 'one tombstone per piece of unfinished work')
  w(d, 'specs/20261104/04-a.md', sp('done', '04')) // brief 04 is finished: its tombstone is finished work
  assert.strictEqual(q(d, 'add', 'poke').status, 0)
  assert.strictEqual(files(d).length, 2, 'the tombstone of finished work went in the next write\'s commit: poke and the ad-hoc tombstone remain')
  assert.ok(!Q.read(d).items.some((i) => i.payload === '04'))
})

test('AC-20261108-06-5 a tracked write keeps a spec item whose spec file is only missing, and deletes one whose spec is done', () => {
  const d = tmpdir('q5m'); gitRepo(d)
  w(d, 'specs/20261104/01-a.md', sp('hardened')); w(d, 'specs/20261104/02-b.md', sp('hardened'))
  for (const t of ['specs/20261104/01-a.md', 'specs/20261104/02-b.md']) assert.strictEqual(q(d, 'add', t).status, 0)
  fs.rmSync(path.join(d, 'specs/20261104/01-a.md')) // the spec has not arrived on this machine
  w(d, 'specs/20261104/02-b.md', sp('done'))
  assert.strictEqual(q(d, 'add', 'poke').status, 0)
  const payloads = files(d).map((f) => JSON.parse(fs.readFileSync(path.join(d, 'specs/queue', f), 'utf8')).payload).sort()
  assert.deepStrictEqual(payloads, ['poke', 'specs/20261104/01-a.md'], 'the missing spec\'s item stays; the done spec\'s is deleted')
})

test('AC-20261108-06-6 a tracked file that is invalid JSON, another version, misnamed or open with no rank refuses every read naming that file; a tmp file is skipped', () => {
  const d = tmpdir('q6'); gitRepo(d)
  q(d, 'add', 'fine')
  w(d, 'specs/queue/20261101-aaaa.json.123.tmp', '{ half written')
  assert.strictEqual(q(d, 'list').status, 0, 'a *.tmp file is skipped')
  const bad = {
    '20261101-bbbb': '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> origin/main\n',
    '20261101-cccc': JSON.stringify({ version: 3, id: '20261101-cccc', rank: '1', kind: 'prompt', payload: 'x' }),
    '20261101-dddd': JSON.stringify({ version: 4, id: '20261101-eeee', rank: '1', kind: 'prompt', payload: 'x' }),
    '20261101-ffff': JSON.stringify({ version: 4, id: '20261101-ffff', kind: 'prompt', payload: 'x' }),
  }
  for (const [id, text] of Object.entries(bad)) {
    w(d, `specs/queue/${id}.json`, text)
    for (const args of [['list'], ['next'], ['add', 'y'], ['done', '1']]) {
      const r = q(d, ...args)
      assert.strictEqual(r.status, 2, `${id}: ${args[0]}`)
      assert.ok(r.stderr.includes(`specs/queue/${id}.json`), r.stderr)
    }
    assert.throws(() => Q.read(d), (e) => e.exit === 2 && e.message.includes(`${id}.json`))
    fs.rmSync(path.join(d, `specs/queue/${id}.json`))
  }
  assert.strictEqual(q(d, 'list').status, 0)
  assert.deepStrictEqual(QF.readAll(tmpdir('none')), [], 'no directory is no items')
})

test('AC-20261108-06-13 an item whose text matches the secrets scan is refused naming the rule, never the text, leaving no file or commit', () => {
  const d = tmpdir('q13'); gitRepo(d)
  const n = subjects(d).length
  const secret = 'AKIAIOSFODNN7EXAMPLE'
  for (const args of [['add', `deploy with ${secret}`], ['add', '--type', 'decide', `rotate ${secret}`]]) {
    const r = q(d, ...args)
    assert.strictEqual(r.status, 2, args.join(' '))
    assert.ok(r.stderr.includes('content:AKIA[0-9A-Z]{16}'), r.stderr)
    assert.ok(!r.stderr.includes(secret) && !r.stdout.includes(secret), 'the text is never echoed')
  }
  assert.deepStrictEqual(files(d), [], 'no file, no temp file')
  assert.strictEqual(subjects(d).length, n, 'no commit')
  assert.strictEqual(g(d, 'status', '--porcelain').trim(), '')
  assert.strictEqual(q(d, 'add', 'plain words').status, 0)
})

test('a queue write leaves other staged work staged and commits only its own paths', () => {
  const d = tmpdir('qs'); gitRepo(d)
  w(d, 'staged.txt', 'work in progress\n'); g(d, 'add', 'staged.txt')
  assert.strictEqual(q(d, 'add', 'one').status, 0)
  assert.deepStrictEqual(touched(d).length, 1)
  assert.strictEqual(g(d, 'diff', '--cached', '--name-only').trim(), 'staged.txt', 'the staged file stayed staged and out of the commit')
})

test('AC-20261108-06-14 the contract docs name specs/queue/, version 4, both stores and the Queue: trailer, and no version 3 as the live shape', () => {
  // each file is found in its directory, so no path literal of prose lives in this test
  const at = (dir, name) => fs.readFileSync(path.join(ROOT, dir, fs.readdirSync(path.join(ROOT, dir)).find((n) => n.startsWith(name))), 'utf8')
  const commands = path.join('spec', 'commands'); const v8 = path.join('docs', 'v8')
  const docs = { doctrine: at('spec', 'doctrine'), queue: at(commands, 'queue'), migrate: at(commands, 'migrate'), fix: at(commands, 'fix'),
    contract: at(v8, 'interface-contract'), architecture: at(v8, 'architecture') }
  const all = Object.values(docs).join('\n')
  for (const need of ['specs/queue/', 'version 4', '`Queue:', 'spec-queue.json', 'push before switching']) assert.ok(all.includes(need) || all.includes(need.replace('push', 'Push')), `the docs name ${need}`)
  assert.ok(docs.queue.includes('{version: 4, items[],') && docs.contract.includes('`{version: 4, items[], holds{}}`') && docs.architecture.includes('`{version: 4, items[], holds{}}`'), 'both stores, version 4')
  for (const [name, text] of Object.entries(docs)) assert.ok(!/\{version: 3, seq/.test(text) && !text.includes('(version 3,'), `${name} has no version 3 shape`)
  for (const name of ['doctrine', 'queue', 'contract', 'architecture']) assert.ok(docs[name].includes('specs/queue/'), `${name} names the tracked store`)
  for (const name of ['queue', 'fix', 'contract', 'architecture', 'doctrine']) assert.ok(docs[name].includes('Queue: <id>') || docs[name].includes('Queue:'), `${name} names the trailer`)
  assert.ok(docs.migrate.includes('specs/queue/') && docs.migrate.includes('version 4'), 'migrate names the new home and version')
})
