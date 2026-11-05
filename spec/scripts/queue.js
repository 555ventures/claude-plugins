'use strict'
// queue.js — the session queue: next | list | add | move | done | show. Storage: lib/state.js.
const fs = require('fs')
const path = require('path')
const { readQueue, writeQueue, readSpec } = require('./lib/state')

const BRIEF_RE = /^(?:docs\/roadmap\/)?(\d+[a-z]?)(?:-[^/]*\.md)?$/

function kindOf(payload) {
  if (/^specs\/.*\.md$/.test(payload)) return 'spec'
  return BRIEF_RE.test(payload) ? 'brief' : 'prompt'
}

function briefPath(root, payload) {
  const nn = BRIEF_RE.exec(payload)[1]
  const dir = path.join(root, 'docs', 'roadmap')
  const f = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).find((n) => n.startsWith(nn + '-') && n.endsWith('.md'))
  return f ? 'docs/roadmap/' + f : payload.endsWith('.md') ? payload : `docs/roadmap/${nn}-*.md`
}

function specStatus(root, p) {
  try { return readSpec(path.join(root, p)).frontmatter.status } catch { return null }
}

// The line the session pastes to start an item.
function pasteLine(root, it) {
  if (it.kind === 'spec') return (specStatus(root, it.payload) === 'hardened' ? '/spec:run ' : '/spec:plan ') + it.payload
  if (it.kind === 'brief') return '/spec:plan ' + briefPath(root, it.payload)
  return it.payload
}

const pending = (q) => q.items.filter((i) => !i.done)

// `added` may be ISO or an epoch number (seconds or ms); normalised to ISO, written with the next write.
function toIso(v) {
  const n = typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : NaN
  const t = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : v
}

// A spec item whose spec is done counts as done; the timestamp is written with the next write.
function reconcile(root, q) {
  for (const i of q.items) if (i.added !== undefined) i.added = toIso(i.added)
  for (const i of q.items) if (!i.done && i.kind === 'spec' && specStatus(root, i.payload) === 'done') i.done = new Date().toISOString()
  return q
}

function age(iso) {
  const t = Date.parse(toIso(iso))
  if (!Number.isFinite(t)) return '?'
  const m = Math.max(0, (Date.now() - t) / 60000)
  return m < 60 ? Math.floor(m) + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'
}

// A brief number names the brief item first (`done 02` closes brief 02, never the 2nd row); a
// zero-padded ref is never a row position, so a brief that was never queued is "no match".
const briefNo = (p) => { const m = BRIEF_RE.exec(p); return m ? String(Number.parseInt(m[1], 10)) + m[1].replace(/^\d+/, '') : null }

function resolve(q, ref) {
  const list = pending(q)
  const hit = (xs) => (xs.length === 1 ? xs[0] : null)
  const brief = BRIEF_RE.test(ref) && list.find((i) => i.kind === 'brief' && briefNo(i.payload) === briefNo(ref))
  if (brief) return brief
  if (/^[1-9]\d*$/.test(ref) && list[Number(ref) - 1]) return list[Number(ref) - 1]
  return q.items.find((i) => i.id === ref) ||
    hit(list.filter((i) => i.payload === ref || path.basename(i.payload) === ref)) ||
    hit(list.filter((i) => i.payload.includes(ref)))
}

function main(argv) {
  const flags = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json' || a === '--top') flags[a.slice(2)] = true
    else if (a === '--root') flags.root = argv[++i]
    else pos.push(a)
  }
  const root = path.resolve(flags.root || require('./lib/git').repoRoot(process.cwd()))
  const cmd = pos[0] || 'next'
  let arg = pos.slice(1).join(' ')
  const q = reconcile(root, readQueue(root))
  const out = (text, json) => console.log(flags.json ? JSON.stringify(json ?? text) : text)
  const fail = (msg, code = 1) => { console.error('queue: ' + msg); return code }
  const list = pending(q)

  if (cmd === 'next') {
    if (!list.length) return out('queue empty', { empty: true }), 0
    out(pasteLine(root, list[0]), { ...list[0], paste: pasteLine(root, list[0]) })
  } else if (cmd === 'list') {
    const rows = list.map((it, i) => `${i + 1}  ${it.id}  ${age(it.added)}  ${it.payload}`)
    const done = q.items.length - list.length
    if (flags.json) return console.log(JSON.stringify({ items: list, done })), 0
    console.log([...rows, `— ${done} done`].join('\n'))
  } else if (cmd === 'add') {
    if (!arg) return fail('add needs a payload', 2)
    // `@specs/x.md`, `./specs/x.md` and an absolute path inside root are one spec: store it root-relative.
    const typed = arg.replace(/^@/, '')
    const file = fs.existsSync(path.resolve(root, typed)) || !fs.existsSync(path.resolve(process.cwd(), typed)) ? path.resolve(root, typed) : path.resolve(process.cwd(), typed)
    const relp = path.relative(root, file).split(path.sep).join('/')
    if (/\.md$/.test(arg) && !relp.startsWith('..') && fs.existsSync(file)) arg = relp
    if (q.items.some((i) => !i.done && i.payload === arg)) return fail(`duplicate payload already queued: ${arg}`, 2)
    q.seq += 1
    const it = { id: 'q' + q.seq, kind: kindOf(arg), payload: arg, added: new Date().toISOString() }
    const before = flags.top ? list[0] : null
    q.items.splice(before ? q.items.indexOf(before) : q.items.length, 0, it)
    writeQueue(root, q)
    out(`queued ${it.id} (${it.kind}): ${arg}`, it)
  } else if (cmd === 'move') {
    const [ref, n] = [pos[1], Number(pos[2])]
    const it = ref && resolve(q, ref)
    if (!it) return fail(`no pending item matches "${ref}"`)
    if (!(n >= 1)) return fail('move needs a 1-based position', 2)
    q.items.splice(q.items.indexOf(it), 1)
    const rest = pending(q)
    q.items.splice(rest[n - 1] ? q.items.indexOf(rest[n - 1]) : q.items.length, 0, it)
    writeQueue(root, q)
    out(`moved ${it.id} to ${n}`, it)
  } else if (cmd === 'done' || cmd === 'show') {
    const it = resolve(q, arg)
    if (!it) return fail(`no item matches "${arg}"`)
    if (cmd === 'show') return out(it.payload, it), 0
    it.done = new Date().toISOString()
    writeQueue(root, q)
    out(`done ${it.id}: ${it.payload}`, it)
  } else return fail(`unknown subcommand ${cmd}`, 2)
  return 0
}

module.exports = { kindOf, briefNo, pasteLine, pending, reconcile, main }
if (require.main === module) process.exitCode = main(process.argv.slice(2))
