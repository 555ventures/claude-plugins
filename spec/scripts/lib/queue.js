'use strict'
// lib/queue.js — the one owner of the session queue: the file, its version, the item shape, the type
// list, creation, dedupe, ticking, reconcile, the fill (unfinished briefs and open ad-hoc specs, worked out on
// every read and never stored), the paste line and the brief helpers groom shares. No CLI. Typed text is parsed
// once, at the door (`add`, and /spec:migrate); a reader trusts what it reads. No other script touches items.
// The file holds what was placed, by a user or an agent; readers derive the rest (ADR-0044).
//
// File: <git-common-dir>/spec-queue.json = {version: 3, seq, items[]}.
// Item: {id, kind: spec|brief|prompt, payload, added, done?, type?, spec?, after?, advisories?}
//   type   only on a prompt: plan | prototype | fix | decide; none = a plain note. The only carrier of a prompt's command.
//   spec   only on type fix: the root-relative specs/…md the fix is bound to; absent = a spec-less fix.
//   advisories  only on a fix queued for a run's advisories: the run working it queues none of its own.
//   payload is bare text (a spec path, a brief path, the words); never a `/spec:<type> ` prefix.
const fs = require('fs')
const path = require('path')
const st = require('./state')
const work = require('./work')

const VERSION = 3
const TYPES = ['plan', 'prototype', 'fix', 'decide']
const CMD_TYPES = ['plan', 'prototype', 'fix']
const BRIEF_RE = /^(?:docs\/roadmap\/)?(\d+[a-z]?)(?:-[^/]*\.md)?$/
const PREFIX_RE = /^\/spec:(plan|prototype|fix) ([\s\S]+)$/
const BOUND_RE = /^(specs\/\S+\.md)(?: — (.+))?$/

const queuePath = (root) => path.join(st.gitCommonDir(root), 'spec-queue.json')
const refuse = (message) => Object.assign(new Error(message), { exit: 2 })

// A brief is `NN[a-z]` or `docs/roadmap/NN…-…`; `3` and `2026` are prose. Refs (`3`, `07`) are BRIEF_RE's business.
function kindOf(payload) {
  if (/^specs\/.*\.md$/.test(payload)) return 'spec'
  return /^\d{2}[a-z]?$/.test(payload) || /^docs\/roadmap\/\d+[a-z]?-/.test(payload) ? 'brief' : 'prompt'
}

// A brief number names the brief item first (`done 02` closes brief 02, never the 2nd row).
const briefNo = (p) => { const m = BRIEF_RE.exec(p); return m ? String(Number.parseInt(m[1], 10)) + m[1].replace(/^\d+/, '') : null }

function briefPath(root, payload) {
  const nn = BRIEF_RE.exec(payload)[1]
  const dir = path.join(root, 'docs', 'roadmap')
  const f = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).find((n) => n.startsWith(nn + '-') && n.endsWith('.md'))
  return f ? 'docs/roadmap/' + f : payload.endsWith('.md') ? payload : `docs/roadmap/${nn}-*.md`
}

// The only reader of typed text. A `/spec:(plan|prototype|fix) ` prefix is stripped and sets the type when
// none is given or it is the same; a prefix that disagrees with a given type stays as text. A fix whose
// text is `specs/….md[ — words]` is bound: the path moves to `spec`, the rest is the payload.
function parse(text, type) {
  let t = String(text)
  const m = PREFIX_RE.exec(t)
  if (m && (!type || type === m[1])) { type = m[1]; t = m[2] }
  if (type !== 'fix') return { type, payload: m && type === m[1] ? t.trim() : t }
  const bound = BOUND_RE.exec(t.trim())
  return bound ? { type, spec: bound[1], payload: (bound[2] || '').trim() } : { type, payload: t.trim() }
}

function read(root) {
  const text = st.readText(queuePath(root))
  if (text === null) return { version: VERSION, seq: 0, items: [] }
  let q
  try { q = JSON.parse(text) } catch { throw refuse(`queue file is not valid JSON: ${queuePath(root)}`) }
  if (!q || q.version !== VERSION) throw refuse(`queue file is version ${q && q.version} — run /spec:migrate`)
  if (!Array.isArray(q.items)) throw refuse(`queue file has no "items" list — repair or remove ${queuePath(root)}`)
  return q
}

const write = (root, q) => st.writeJson(queuePath(root), { version: VERSION, seq: q.seq, items: q.items })
const open = (q) => q.items.filter((i) => !i.done)
const isMain = (root) => { try { return fs.statSync(path.join(root, '.git')).isDirectory() } catch { return false } }

function specStatus(root, p) {
  try { return st.readSpec(path.join(root, p)).frontmatter.status } catch { return null }
}

// A spec item whose spec is done (or superseded), or whose file is gone, and not live counts as done; the timestamp is
// written with the next write. A file is only missed from the main checkout: a lane may predate the spec. A brief item
// is never ticked here: `done` closes it, or lib/land.js when its last spec merges with no step open.
function reconcile(root, q) {
  const now = new Date().toISOString(); const main = isMain(root)
  for (const i of q.items) {
    if (i.done || i.kind !== 'spec' || st.liveRun(root, i.payload)) continue
    if ((main && !fs.existsSync(path.join(root, i.payload))) || ['done', 'superseded'].includes(specStatus(root, i.payload))) i.done = now
  }
  return q
}

// A brief is superseded in v7 only by the bold banner; work.js also takes a plain `> Superseded by`.
const isSupersededBriefText = (words) => /^>\s*\*\*Superseded by\b/m.test(words)

// work.readBriefs rows with v7's `superseded` and `status`, so groom counts and gates a plainly bannered brief as v7 did.
function v7Briefs(root, briefs) {
  return briefs.map((b) => {
    const superseded = isSupersededBriefText(fs.readFileSync(path.join(root, b.file), 'utf8'))
    const done = b.specs.every((s) => s.status === 'done')
    return { ...b, superseded, status: superseded && done ? 'superseded' : !b.specs.length ? 'unplanned' : done ? 'done' : 'in-flight' }
  })
}

// The fill, in memory and never stored (ADR-0044): later duplicates of an open brief or spec drop out of the view, then every
// unfinished brief and every open ad-hoc spec (path order) no open item holds joins the end as {id: null, kind, payload}. A done
// row holds nothing, so a ticked unfinished brief or spec comes back last (as v7's archive had it). Main checkout only: a lane's file tree may predate the work.
const keyOf = (i) => (i.kind === 'brief' ? 'b' + work.normBrief(i.payload) : i.kind === 'spec' ? 's' + i.payload : null)
function fill(root, q) {
  const seen = new Set()
  const items = q.items.filter((i) => { const k = !i.done && keyOf(i); return !k || (!seen.has(k) && seen.add(k)) })
  if (!isMain(root)) return { ...q, items }
  const specs = work.readSpecs(root); const adds = []
  for (const b of v7Briefs(root, work.readBriefs(root, specs))) {
    const unfinished = (b.status !== 'done' || b.open.length) && !b.superseded // done with an open step: unfinished
    if (!unfinished || seen.has('b' + b.num)) continue
    seen.add('b' + b.num); adds.push({ id: null, kind: 'brief', payload: b.num })
  }
  for (const s of specs.filter((x) => !x.brief && !['done', 'superseded'].includes(x.status)).sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!seen.has('s' + s.path)) adds.push({ id: null, kind: 'spec', payload: s.path })
  }
  const ticked = new Set(q.items.filter((i) => i.done).map(keyOf))
  return { ...q, items: [...items, ...adds.filter((i) => !ticked.has(keyOf(i))), ...adds.filter((i) => ticked.has(keyOf(i)))] }
}
const pending = (root) => open(fill(root, reconcile(root, read(root))))

// Stores one filled item where `at` says (an index of q.items, default last): the next qN in v3's shape, no `added`. Writes q.
function place(root, q, item, at = q.items.length) {
  q.seq += 1
  const stored = { id: 'q' + q.seq, kind: item.kind, payload: item.payload }
  q.items.splice(at, 0, stored)
  write(root, q)
  return stored
}

// fields {payload, type?, spec?, after?, advisories?, defaultType?}: payload as typed. A prompt goes through `parse`
// (a given `spec` is taken as is); a prompt with no type takes `defaultType`. null = an open duplicate (a brief by number).
function add(root, fields, { top } = {}) {
  const q = reconcile(root, read(root))
  const kind = fields.type || fields.spec ? 'prompt' : kindOf(fields.payload)
  let body = { payload: fields.payload }
  if (kind === 'prompt') {
    body = fields.spec ? { type: fields.type, spec: fields.spec, payload: fields.payload } : parse(fields.payload, fields.type)
    body.type = body.type || fields.defaultType
  }
  const same = (i) => i.kind === kind && i.type === body.type && i.spec === body.spec && (kind === 'brief' ? work.normBrief(i.payload) === work.normBrief(body.payload) : i.payload === body.payload)
  if (open(q).some(same)) return null
  q.seq += 1
  const item = { id: 'q' + q.seq, kind, ...(body.type ? { type: body.type } : {}), ...(body.spec ? { spec: body.spec } : {}), payload: body.payload, added: new Date().toISOString(), ...(fields.after ? { after: fields.after } : {}) }
  if (fields.advisories) item.advisories = true
  const first = top ? open(q)[0] : null
  q.items.splice(first ? q.items.indexOf(first) : q.items.length, 0, item)
  write(root, q)
  return item
}

// Sets `done` on every open item `pred` admits; one write; returns the count.
function tick(root, pred) {
  const q = read(root)
  const now = new Date().toISOString()
  const hit = open(q).filter(pred)
  for (const i of hit) i.done = now
  if (hit.length) write(root, q)
  return hit.length
}

// Holds the open item `pred` admits behind `after` ({spec} or {brief}); with none stored, `fields` are added
// holding it. Returns the item. A lane that needs another spec done waits on the queue's own gate.
function hold(root, pred, after, fields) {
  const q = read(root)
  const hit = open(q).find(pred)
  if (!hit) return add(root, { ...fields, after })
  hit.after = after
  write(root, q)
  return hit
}

// What the item says, as one line: a bound fix reads `specs/x.md — words`.
const text = (it) => (it.spec ? it.spec + (it.payload ? ' — ' + it.payload : '') : it.payload)

// The line the session pastes to start an item: a hardened or implementing spec runs, any other plans.
function paste(root, it) {
  if (it.kind === 'spec') return (['hardened', 'implementing'].includes(st.specState(root, it.payload, specStatus(root, it.payload))) ? '/spec:run ' : '/spec:plan ') + it.payload
  if (it.kind === 'brief') return '/spec:plan ' + briefPath(root, it.payload)
  if (CMD_TYPES.includes(it.type)) return `/spec:${it.type} ${text(it)}`
  return it.type === 'decide' ? '📌 decide: ' + it.payload : text(it)
}

module.exports = { VERSION, TYPES, CMD_TYPES, BRIEF_RE, queuePath, kindOf, briefNo, briefPath, parse, read, write, open, reconcile, fill, pending, place, add, tick, hold, text, paste, isSupersededBriefText, v7Briefs, isMain }
