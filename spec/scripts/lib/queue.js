'use strict'
// lib/queue.js — the one owner of the session queue: the file, its version, the item shape, the type
// list, creation, dedupe, ticking, reconcile, the paste line and groom's duplicate, cites-done and
// brief helpers. No CLI. Typed text is parsed once, at the door (`add`, and /spec:migrate); a reader trusts
// what it reads. No other script touches items.
//
// File: <git-common-dir>/spec-queue.json = {version: 3, seq, items[]}.
// Item: {id, kind: spec|brief|prompt, payload, added, done?, type?, spec?, after?}
//   type   only on a prompt: plan | prototype | fix | decide; none = a plain note. The only carrier of a prompt's command.
//   spec   only on type fix: the root-relative specs/…md the fix is bound to; absent = a spec-less fix.
//   payload is bare text (a spec path, a brief path, the words); never a `/spec:<type> ` prefix.
const fs = require('fs')
const path = require('path')
const st = require('./state')

const VERSION = 3
const TYPES = ['plan', 'prototype', 'fix', 'decide']
const CMD_TYPES = ['plan', 'prototype', 'fix']
const BRIEF_RE = /^(?:docs\/roadmap\/)?(\d+[a-z]?)(?:-[^/]*\.md)?$/
const PREFIX_RE = /^\/spec:(plan|prototype|fix) ([\s\S]+)$/
const BOUND_RE = /^(specs\/\S+\.md)(?: — (.+))?$/

const queuePath = (root) => path.join(st.gitCommonDir(root), 'spec-queue.json')
const refuse = (message) => Object.assign(new Error(message), { exit: 2 })

function kindOf(payload) {
  if (/^specs\/.*\.md$/.test(payload)) return 'spec'
  return BRIEF_RE.test(payload) ? 'brief' : 'prompt'
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
  return q
}

const write = (root, q) => st.writeJson(queuePath(root), { version: VERSION, seq: q.seq, items: q.items })
const open = (q) => q.items.filter((i) => !i.done)

function specStatus(root, p) {
  try { return st.readSpec(path.join(root, p)).frontmatter.status } catch { return null }
}

// A spec item whose spec is done (or superseded) and not live counts as done; the timestamp is written
// with the next write. A brief item is never ticked here: only `done` closes it.
function reconcile(root, q) {
  const now = new Date().toISOString()
  for (const i of q.items) if (!i.done && i.kind === 'spec' && ['done', 'superseded'].includes(specStatus(root, i.payload)) && !st.liveRun(root, i.payload)) i.done = now
  return q
}

// fields {payload, type?, spec?, after?, defaultType?}: payload as typed. A prompt goes through `parse`
// (a given `spec` is taken as is); a prompt with no type takes `defaultType`. null = an open duplicate.
function add(root, fields, { top } = {}) {
  const q = reconcile(root, read(root))
  const kind = fields.type || fields.spec ? 'prompt' : kindOf(fields.payload)
  let body = { payload: fields.payload }
  if (kind === 'prompt') {
    body = fields.spec ? { type: fields.type, spec: fields.spec, payload: fields.payload } : parse(fields.payload, fields.type)
    body.type = body.type || fields.defaultType
  }
  const dup = open(q).some((i) => i.kind === kind && i.type === body.type && i.spec === body.spec && i.payload === body.payload)
  if (dup) return null
  q.seq += 1
  const item = { id: 'q' + q.seq, kind, ...(body.type ? { type: body.type } : {}), ...(body.spec ? { spec: body.spec } : {}), payload: body.payload, added: new Date().toISOString(), ...(fields.after ? { after: fields.after } : {}) }
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

// What the item says, as one line: a bound fix reads `specs/x.md — words`.
const text = (it) => (it.spec ? it.spec + (it.payload ? ' — ' + it.payload : '') : it.payload)

// Duplicate and cites-done helpers, ported from v7. They read `text(it)`: a bound fix's spec path lives in `spec`.
// Token set of a free-text prompt: lowercase [a-z0-9]+ runs of length >= 4.
function promptTokens(payload) {
  const out = new Set()
  for (const t of String(payload || '').toLowerCase().match(/[a-z0-9]+/g) || []) if (t.length >= 4) out.add(t)
  return out
}

// |A∩B| / |A∪B| over two Sets; 0 when both are empty.
function jaccard(a, b) {
  if (!a.size && !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

// A path-shaped payload is one whitespace-free token holding a `/`: an identity, not prose.
const isPathPayload = (payload) => /^\S+\/\S+$/.test(String(payload || '').trim())
const pathIdentity = (payload) => path.posix.normalize(String(payload).trim()).replace(/\/+$/, '')

// Near-duplicate score of two prompt texts, or null when not comparable: path vs path is 1 when identical.
function promptDupScore(a, b) {
  const pa = isPathPayload(a); const pb = isPathPayload(b)
  if (pa || pb) return pa && pb && pathIdentity(a) === pathIdentity(b) ? 1 : null
  return jaccard(promptTokens(a), promptTokens(b))
}

// The first specs/YYYYMMDD/NN…md a prompt names whose spec is done or superseded (ctx = {specStatus(rel), specRoot}), else null.
function citesDoneSpec(item, ctx) {
  if (!item || item.kind !== 'prompt') return null
  const words = text(item)
  const hit = (rel) => { const s = ctx.specStatus(rel); return s === 'done' || s === 'superseded' }
  for (const m of words.matchAll(/specs\/\d{8}\/\d{2}[\w.-]*\.md/g)) if (hit(m[0])) return m[0]
  // bare `specs/YYYYMMDD/NN` -> the unique on-disk NN-*.md; ambiguous or missing -> no flag
  for (const m of words.matchAll(/specs\/(\d{8})\/(\d{2})(?![\w.-])/g)) {
    let names = []
    try { names = fs.readdirSync(path.join(ctx.specRoot, 'specs', m[1])).filter((n) => n.startsWith(m[2] + '-') && n.endsWith('.md')) } catch { /* absent dir */ }
    if (names.length === 1 && hit(`specs/${m[1]}/${names[0]}`)) return `specs/${m[1]}/${names[0]}`
  }
  return null
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

// The line the session pastes to start an item.
function paste(root, it) {
  if (it.kind === 'spec') return (specStatus(root, it.payload) === 'hardened' ? '/spec:run ' : '/spec:plan ') + it.payload
  if (it.kind === 'brief') return '/spec:plan ' + briefPath(root, it.payload)
  if (CMD_TYPES.includes(it.type)) return `/spec:${it.type} ${text(it)}`
  return it.type === 'decide' ? '📌 decide: ' + it.payload : text(it)
}

module.exports = { VERSION, TYPES, CMD_TYPES, BRIEF_RE, queuePath, kindOf, briefNo, briefPath, parse, read, write, open, reconcile, add, tick, text, paste, promptTokens, jaccard, isPathPayload, pathIdentity, promptDupScore, citesDoneSpec, isSupersededBriefText, v7Briefs }
