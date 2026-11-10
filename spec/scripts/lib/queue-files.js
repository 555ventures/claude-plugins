'use strict'
// lib/queue-files.js — the queue's file mechanics (ADR-0050); lib/queue.js alone requires it. Tracked store: the items
// only /spec:queue add|move|done place, one specs/queue/<id>.json each, {version: 4, id, rank, kind, ...} (a tombstone:
// {version, id, kind, payload, done}); its rank maths, ids, strict read, checkout check and `commit`; and the local
// store file. No CLI, no lock; nothing here pushes, pulls or fetches.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const st = require('./state')
const git = require('./git')

const VERSION = 4
const refuse = (message, extra) => Object.assign(new Error(message), { exit: 2 }, extra)
const dirOf = (main) => path.join(main, git.QUEUE_DIR)
const fileOf = (main, id) => path.join(dirOf(main), id + '.json')

const num = (s) => { const [i, f = ''] = String(s).split('.'); return [BigInt(i + f), f.length] }
const at = ([n, d], k) => n * 10n ** BigInt(k - d)
const show = (n, d) => {
  while (d > 0 && n % 10n === 0n) { n /= 10n; d-- }
  const s = (n < 0n ? -n : n).toString().padStart(d + 1, '0')
  return (n < 0n ? '-' : '') + (d ? s.slice(0, -d) + '.' + s.slice(-d) : s)
}
const cmp = (a, b) => {
  const [x, y] = [num(a), num(b)]; const k = Math.max(x[1], y[1])
  return Math.sign(Number(at(x, k) - at(y, k)))
}
const order = (a, b) => cmp(a.rank, b.rank) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const fl = (a) => { const [n, d] = num(a); const p = 10n ** BigInt(d); return n / p - (n % p < 0n ? 1n : 0n) }
const ce = (a) => { const [n, d] = num(a); const p = 10n ** BigInt(d); return n / p + (n % p > 0n ? 1n : 0n) }
const rank = {
  cmp,
  after: (last) => (last === undefined ? '1' : String(fl(last) + 1n)), // append: floor(last) + 1
  before: (first) => (first === undefined ? '1' : String(ce(first) - 1n)), // --top: ceil(first) - 1
  between(a, b) { // the exact midpoint: one more digit when the sum is odd
    const [x, y] = [num(a), num(b)]; const k = Math.max(x[1], y[1]); const s = at(x, k) + at(y, k)
    return s % 2n === 0n ? show(s / 2n, k) : show(s * 5n, k + 1)
  },
  // The rank that lists `id` between `prev` and `next` ({id, rank}, either absent at an end). Equal ranks list by id,
  // so between two of them a file goes only where its id falls; any other place refuses naming the tie.
  place(prev, next, id) {
    const r = !prev ? rank.before(next && next.rank)
      : !next ? rank.after(prev.rank) : rank.between(prev.rank, next.rank)
    const me = { id, rank: r }
    if ((!prev || order(prev, me) < 0) && (!next || order(me, next) < 0)) return r
    throw refuse(`${prev.id} and ${next.id} share rank ${r}: nothing can move between them — move one first`)
  },
}

const queuePath = (root) => path.join(st.gitCommonDir(root), 'spec-queue.json')
function readLocal(root) {
  const text = st.readText(queuePath(root))
  if (text === null) return { items: [], holds: {} }
  let q
  try { q = JSON.parse(text) } catch { throw refuse(`queue file is not valid JSON: ${queuePath(root)}`) }
  const old = !q || q.version !== VERSION
  if (old) throw refuse(`queue file is version ${q && q.version} — run /spec:migrate`, { old })
  if (!Array.isArray(q.items)) throw refuse(`queue file has no "items" list — repair or remove ${queuePath(root)}`)
  return { items: q.items, holds: q.holds && typeof q.holds === 'object' ? q.holds : {} }
}
const writeLocal = (root, items, holds) => st.writeJson(queuePath(root), { version: VERSION, items, holds })

const DECIMAL = /^-?\d+(\.\d+)?$/
function problem(it, stem) {
  if (it === undefined || it === null || typeof it !== 'object') return 'is not valid JSON (a git conflict marker?)'
  if (it.version !== VERSION) return `is version ${it.version}, not ${VERSION}`
  if (it.id !== stem) return `names id ${it.id}, not its file name`
  return it.done || DECIMAL.test(it.rank) ? null : 'has no decimal rank'
}

// `*.tmp` is skipped and no directory is no items. Items come back without `version`.
function readAll(main) {
  let names = []
  try { names = fs.readdirSync(dirOf(main)) } catch { /* no directory: no items */ }
  return names.filter((n) => n.endsWith('.json')).sort().map((n) => {
    let it
    try { it = JSON.parse(fs.readFileSync(path.join(dirOf(main), n), 'utf8')) } catch { /* reported below */ }
    const why = problem(it, n.slice(0, -5))
    if (why) throw refuse(`queue item ${git.QUEUE_DIR}/${n} ${why} — repair or restore that file`)
    const { version, ...item } = it
    return item
  })
}

// A new id: the date and four random hex, retried while taken (a file, or in `used`: the local store's ids).
function newId(main, when = new Date(), used = new Set()) {
  const day = new Date(when).toLocaleDateString('sv').replace(/-/g, '')
  for (;;) {
    const id = day + '-' + crypto.randomBytes(2).toString('hex')
    if (!used.has(id) && !fs.existsSync(fileOf(main, id))) return id
  }
}

const UNDER_WAY = [['MERGE_HEAD', 'a merge', 'merge'], ['rebase-merge', 'a rebase', 'rebase'],
  ['rebase-apply', 'a rebase', 'rebase'], ['CHERRY_PICK_HEAD', 'a cherry-pick', 'cherry-pick'],
  ['REVERT_HEAD', 'a revert', 'revert']]
function stateOf(main) {
  const trunk = git.trunk(st.readJson(st.configPath(main)))
  const gd = git.sh(['rev-parse', '--absolute-git-dir'], main)
  const busy = UNDER_WAY.find(([f]) => fs.existsSync(path.join(gd, f)))
  const here = `the main checkout ${main}`
  const fix = busy && `finish it there (git ${busy[2]} --continue or --abort), then re-run`
  if (busy) return { state: `${here} is in the middle of ${busy[1]}`, remedy: fix }
  const sym = git.raw(['symbolic-ref', '-q', '--short', 'HEAD'], main)
  const on = sym.status === 0 ? sym.stdout.trim() : 'HEAD'
  const back = `check out ${trunk} there (git -C ${main} switch ${trunk}), then re-run`
  if (on === 'HEAD') return { state: `${here} has a detached HEAD`, remedy: back }
  return on === trunk ? null : { state: `${here} is on ${on}, not ${trunk}`, remedy: back }
}

// ---- a write: refuse on the wrong checkout; scan the new text for secrets (queue text is repo history); write tmp
// then
// rename; commit only its own paths on trunk. A failed git call puts the paths back and prints git's message.
function commit(root, verb, { set = [], del = [] }) {
  const main = git.mainRoot(root)
  const bad = stateOf(main)
  if (bad) throw refuse(`${bad.state} — ${bad.remedy}`)
  if (!set.length && !del.length) return
  fs.mkdirSync(dirOf(main), { recursive: true })
  const tmps = set.map((it) => [fileOf(main, it.id) + '.' + process.pid + '.tmp', fileOf(main, it.id)])
  set.forEach((it, i) => fs.writeFileSync(tmps[i][0], JSON.stringify({ version: VERSION, ...it }, null, 2) + '\n'))
  const hit = tmps.flatMap(([t]) => git.scanFile(main, path.relative(main, t)))[0]
  if (hit) {
    for (const [t] of tmps) fs.rmSync(t, { force: true })
    throw refuse(`the text matches the secrets scan (${hit.reason}) — take it out; nothing was queued`)
  }
  for (const [t, f] of tmps) fs.renameSync(t, f)
  for (const id of del) fs.rmSync(fileOf(main, id), { force: true })
  const rel = (id) => `${git.QUEUE_DIR}/${id}.json`
  const paths = [...set.map((i) => rel(i.id)), ...del.map(rel)]
  const add = git.raw(['add', '--', ...paths], main)
  if (add.status === 0 && git.raw(['diff', '--cached', '--quiet', '--', ...paths], main).status === 0) return
  const msg = `chore(queue): ${verb} ${[...set.map((i) => i.id), ...del].join(' ')}`
  const c = add.status === 0 ? git.raw(['commit', '-q', '--no-verify', '-m', msg, '--', ...paths], main) : add
  if (c.status === 0) return
  git.raw(['reset', '-q', '--', ...paths], main)
  git.restore(main, 'HEAD', paths)
  const what = add.status === 0 ? 'commit' : 'add'
  throw Object.assign(new Error(`git ${what} failed in ${main}: ${(c.stderr || c.stdout).trim()}`), { exit: 1 })
}

module.exports = { VERSION, rank, order, queuePath, readLocal, writeLocal, readAll, newId, stateOf, commit }
