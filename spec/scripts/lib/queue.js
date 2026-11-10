'use strict'
// lib/queue.js — the one owner of the session queue: its two stores, the item shape, add, move, done, the closes
// worked out on read, the fill (unfinished briefs and open ad-hoc specs, derived on every read, not stored), the paste
// line and the brief helpers groom shares. No CLI. Typed text is parsed once, at the door (`add`, /spec:migrate).
// Tracked store: specs/queue/<id>.json in the main checkout (lib/queue-files.js), the items only /spec:queue
// add|move|done place, one trunk commit each. Local store: <git-common-dir>/spec-queue.json = {version: 4, items[],
// holds{}}, the items a driver places; `holds[id]` is a driver's `after` on a tracked item. No driver writes a tracked
// path or ticks (ADR-0050). Item: {id: YYYYMMDD-xxxx, rank, kind: spec|brief|prompt, payload, added, done?, type?,
// spec?, after?, advisories?}; rank is a decimal string over both stores (none on a tombstone: the user's `done`).
const fs = require('fs')
const path = require('path')
const st = require('./state')
const git = require('./git')
const work = require('./work')
const qf = require('./queue-files')
const VERSION = 4
const TYPES = ['plan', 'prototype', 'fix', 'decide']
const CMD_TYPES = ['plan', 'prototype', 'fix']
const BRIEF_RE = /^(?:docs\/roadmap\/)?(\d+[a-z]?)(?:-[^/]*\.md)?$/
const PREFIX_RE = /^\/spec:(plan|prototype|fix) ([\s\S]+)$/
const BOUND_RE = /^(specs\/\S+\.md)(?: — (.+))?$/
const BRIEFISH = [/^\d{2}[a-z]?$/, /^docs\/roadmap\/\d+[a-z]?-/]
const kindOf = (p) => (/^specs\/.*\.md$/.test(p) ? 'spec' : BRIEFISH.some((re) => re.test(p)) ? 'brief' : 'prompt')
function briefPath(root, payload) {
  const nn = BRIEF_RE.exec(payload)[1]
  const dir = path.join(root, 'docs', 'roadmap')
  const f = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).find((n) => n.startsWith(nn + '-') && n.endsWith('.md'))
  return f ? 'docs/roadmap/' + f : payload.endsWith('.md') ? payload : `docs/roadmap/${nn}-*.md`
}
// The only reader of typed text: a `/spec:(plan|prototype|fix) ` prefix sets the type (a disagreeing one stays text); a
// fix whose text is `specs/….md[ — words]` is bound: the path moves to `spec`.
function parse(text, type) {
  let t = String(text)
  const m = PREFIX_RE.exec(t)
  if (m && (!type || type === m[1])) { type = m[1]; t = m[2] }
  if (type !== 'fix') return { type, payload: m && type === m[1] ? t.trim() : t }
  const bound = BOUND_RE.exec(t.trim())
  return bound ? { type, spec: bound[1], payload: (bound[2] || '').trim() } : { type, payload: t.trim() }
}
// STORE: an item's store. GONE: read done by derivation: 'done' (its file or row goes at the next write) or 'missing'
// (a spec file absent here: kept). HELD: a held tracked item's own `after`.
const STORE = new WeakMap(); const GONE = new WeakMap(); const HELD = new WeakMap()
const storeOf = (i) => STORE.get(i) || null
const open = (q) => q.items.filter((i) => !i.done)
const isMain = (root) => { try { return fs.statSync(path.join(root, '.git')).isDirectory() } catch { return false } }
const specStatus = (root, p) => {
  try { return st.readSpec(path.join(root, p)).frontmatter.status } catch { return null }
}
// → (item) => 'done' when its work is finished: a spec or brief done or superseded (a brief: no open step).
function finisher(root) {
  let briefs = null
  return (i) => {
    if (i.kind === 'spec') return ['done', 'superseded'].includes(specStatus(root, i.payload)) ? 'done' : null
    if (i.kind !== 'brief' || !isMain(root)) return null
    const b = (briefs = briefs || work.readBriefs(root)).find((x) => x.num === work.normBrief(i.payload))
    return b && ['done', 'superseded'].includes(b.status) && !b.open.length ? 'done' : null
  }
}
// The ids a `Queue: <id>` trailer on trunk names, read once while a fix or plan prompt is open.
function trailed(root, items) {
  const want = items.filter((i) => !i.done && i.kind === 'prompt' && ['fix', 'plan'].includes(i.type))
  if (!want.length) return new Set()
  const t = want.map((i) => Date.parse(i.added)); const main = git.mainRoot(root)
  const since = t.some(Number.isNaN) ? [] : [`--since=${Math.floor(Math.min(...t) / 1000) - 86400}`]
  const trunk = git.trunk(st.readJson(st.configPath(main)))
  const r = git.raw(['log', trunk, ...since, '--format=%(trailers:key=Queue,valueonly)'], main)
  return new Set(r.status === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : [])
}
// Finished work, a prompt a trunk trailer names and a spec file gone from the main checkout read done (not while live).
function reconcile(root, q) {
  const now = new Date().toISOString(); const main = isMain(root); const fin = finisher(root)
  const ids = trailed(root, q.items)
  for (const i of q.items) {
    let why = i.kind === 'prompt' ? !i.done && ids.has(i.id) && 'done' : fin(i)
    if (!why && i.kind === 'spec' && !i.done && main && !fs.existsSync(path.join(root, i.payload))) why = 'missing'
    if (!why || (i.kind === 'spec' && !i.done && st.liveRun(root, i.payload))) continue
    GONE.set(i, why)
    i.done = i.done || now
  }
  return q
}
// Both stores as one list: open items by rank then id, done ones last; reconciled, a driver's holds laid over.
function read(root) {
  const local = qf.readLocal(root); const tracked = qf.readAll(git.mainRoot(root))
  for (const i of tracked) {
    STORE.set(i, 'tracked')
    if (local.holds[i.id] && !i.done) { HELD.set(i, i.after); i.after = local.holds[i.id] }
  }
  for (const i of local.items) STORE.set(i, 'local')
  const all = [...tracked, ...local.items]
  const items = [...all.filter((i) => !i.done).sort(qf.order), ...all.filter((i) => i.done)]
  return reconcile(root, { version: VERSION, items, holds: local.holds })
}
const isSupersededBriefText = (words) => /^>\s*\*\*Superseded by\b/m.test(words)
function v7Briefs(root, briefs) {
  return briefs.map((b) => {
    const superseded = isSupersededBriefText(fs.readFileSync(path.join(root, b.file), 'utf8'))
    const done = b.specs.every((s) => s.status === 'done')
    return { ...b, superseded, status: superseded && done ? 'superseded' : !b.specs.length ? 'unplanned' : done ? 'done' : 'in-flight' }
  })
}
// The fill (ADR-0044): every unfinished brief and open ad-hoc spec no open item holds joins the end as {id: null, kind,
// payload}; a done row holds nothing, so it comes back last. Main only.
const keyOf = (i) => (i.kind === 'brief' ? 'b' + work.normBrief(i.payload) : i.kind === 'spec' ? 's' + i.payload : null)
function fill(root, q) {
  const seen = new Set()
  const items = q.items.filter((i) => { const k = !i.done && keyOf(i); return !k || (!seen.has(k) && seen.add(k)) })
  if (!isMain(root)) return { ...q, items }
  const specs = work.readSpecs(root); const adds = []
  for (const b of v7Briefs(root, work.readBriefs(root, specs))) {
    if (!((b.status !== 'done' || b.open.length) && !b.superseded) || seen.has('b' + b.num)) continue // unfinished only
    seen.add('b' + b.num); adds.push({ id: null, kind: 'brief', payload: b.num })
  }
  for (const s of specs.filter((x) => !x.brief && !['done', 'superseded'].includes(x.status)).sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!seen.has('s' + s.path)) adds.push({ id: null, kind: 'spec', payload: s.path })
  }
  const ticked = new Set(q.items.filter((i) => i.done).map(keyOf))
  return { ...q, items: [...items, ...adds.filter((i) => !ticked.has(keyOf(i))), ...adds.filter((i) => ticked.has(keyOf(i)))] }
}
const pending = (root) => open(fill(root, read(root)))
// The local file: its items less those read done, and the holds of tracked ids still there.
function writeLocal(root, q) {
  const ids = new Set(q.items.filter((i) => storeOf(i) === 'tracked').map((i) => i.id))
  const items = q.items.filter((i) => storeOf(i) === 'local' && GONE.get(i) !== 'done')
    .map((i) => { const { done, ...rest } = i; return GONE.get(i) === 'missing' ? rest : i })
  qf.writeLocal(root, items, Object.fromEntries(Object.entries(q.holds).filter(([id]) => ids.has(id))))
}
const onDisk = (i) => ({ ...i, after: HELD.has(i) ? HELD.get(i) : i.after })
const finished = (q) => q.items.filter((i) => storeOf(i) === 'tracked' && GONE.get(i) === 'done').map((i) => i.id)
const newId = (root, q) => qf.newId(git.mainRoot(root), new Date(), new Set(q.items.map((i) => i.id)))
const same = (a, b) => a.kind === b.kind && a.type === b.type && a.spec === b.spec &&
  (a.kind === 'brief' ? work.normBrief(a.payload) === work.normBrief(b.payload) : a.payload === b.payload)
// fields {payload, type?, spec?, after?, advisories?, defaultType?}; null = an open duplicate. `tracked` (only
// /spec:queue add) commits a file on trunk; a driver's item goes to the local file with no git write.
function add(root, fields, { top, tracked } = {}) {
  const q = read(root)
  const kind = fields.type || fields.spec ? 'prompt' : kindOf(fields.payload)
  const body = kind !== 'prompt' ? { payload: fields.payload }
    : fields.spec ? { type: fields.type, spec: fields.spec, payload: fields.payload }
      : parse(fields.payload, fields.type)
  if (kind === 'prompt') body.type = body.type || fields.defaultType
  if (open(q).some((i) => same(i, { kind, ...body }))) return null
  const ranks = q.items.map((i) => i.rank).filter((r) => r !== undefined).sort(qf.rank.cmp)
  const rank = top ? qf.rank.before(ranks[0]) : qf.rank.after(ranks[ranks.length - 1])
  const { type, spec, payload } = body
  const item = { id: newId(root, q), rank, kind, ...(type && { type }), ...(spec && { spec }), payload }
  item.added = new Date().toISOString()
  Object.assign(item, fields.after ? { after: fields.after } : {}, fields.advisories ? { advisories: true } : {})
  if (tracked) qf.commit(root, 'add', { set: [item], del: finished(q) })
  else { STORE.set(item, 'local'); q.items.push(item); writeLocal(root, q) }
  return item
}
// /spec:queue move: `it` (stored or filled) goes to position n of the list as `list` prints it. A tracked or filled
// item is one commit on trunk; a local one is re-ranked locally.
function move(root, q, it, n) {
  const others = open(fill(root, q)).filter((i) => i.id && i !== it)
  const id = it.id || newId(root, q); const k = Math.min(n, others.length + 1) // past the end is last
  const rank = qf.rank.place(others[k - 2], others[k - 1], id)
  if (storeOf(it) === 'local') { it.rank = rank; writeLocal(root, q) } else {
    const file = it.id ? { ...onDisk(it), rank } : { id, rank, kind: it.kind, payload: it.payload }
    qf.commit(root, 'move', { set: [file], del: finished(q) })
  }
  return { ...it, id, rank }
}
// /spec:queue done: a local item is set done; a tracked prompt's file is deleted; unfinished brief or spec work (a
// filled item too) leaves a tombstone, so the fill brings it back last.
function done(root, q, it) {
  const now = new Date().toISOString()
  if (storeOf(it) === 'local') { it.done = now; writeLocal(root, q); return { ...it, done: now } }
  const id = it.id || newId(root, q)
  const tomb = it.kind === 'prompt' ? [] : [{ id, kind: it.kind, payload: it.payload, done: now }]
  const del = [...finished(q).filter((x) => x !== id), ...(tomb.length || !it.id ? [] : [id])]
  qf.commit(root, 'done', { set: tomb, del })
  return { ...it, id, done: now }
}
// Holds the open item `pred` admits behind `after` (or `fields` are added); a tracked item's hold is the local file's.
function hold(root, pred, after, fields) {
  const q = read(root)
  const hit = open(q).find(pred)
  if (!hit) return add(root, { ...fields, after })
  if (storeOf(hit) === 'tracked') q.holds[hit.id] = after
  hit.after = after
  writeLocal(root, q)
  return hit
}
const text = (it) => (it.spec ? it.spec + (it.payload ? ' — ' + it.payload : '') : it.payload)
// The line the session pastes to start an item: a hardened or implementing spec runs, any other plans.
function paste(root, it) {
  if (it.kind === 'spec') return (['hardened', 'implementing'].includes(st.specState(root, it.payload, specStatus(root, it.payload))) ? '/spec:run ' : '/spec:plan ') + it.payload
  if (it.kind === 'brief') return '/spec:plan ' + briefPath(root, it.payload)
  if (CMD_TYPES.includes(it.type)) return `/spec:${it.type} ${text(it)}`
  return it.type === 'decide' ? '📌 decide: ' + it.payload : text(it)
}
module.exports = {
  VERSION, TYPES, CMD_TYPES, BRIEF_RE, queuePath: qf.queuePath, kindOf, briefPath, parse, read, open, fill, pending,
  add, move, done, hold, same, finisher, storeOf, text, paste, isSupersededBriefText, v7Briefs, isMain,
  files: { readAll: qf.readAll, rank: qf.rank, newId: qf.newId, stateOf: qf.stateOf }, // for migrate.js only
}
