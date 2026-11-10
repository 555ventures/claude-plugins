'use strict'
// lib/queue-rows.js — what the queue says, as rows: groom's rot report, `queue list` and `show`, the type table (🏃 run
// · 📝 plan · 🧪 prototype · 🔧 fix · 📌 decide) and the in-progress marker the status screen shares. v7's row helpers on
// v8 state. It writes nothing: every item write goes through lib/queue.js.
const fs = require('fs')
const path = require('path')
const Q = require('./queue')
const work = require('./work')
const st = require('./state')

const { text } = Q

// Duplicate and cites-done helpers (v7's). Token set of a prompt: lowercase [a-z0-9]+ runs of length >= 4.
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

// The first specs/YYYYMMDD/NN…md a prompt names whose spec is done or superseded (ctx: {specStatus, specRoot}).
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


const TYPES = { run: '🏃', plan: '📝', prototype: '🧪', fix: '🔧', decide: '📌' }
// A row's type is read off the line it pastes, so it can never disagree with it.
const typeOf = (line) => { const m = /^\/spec:(run|plan|prototype|fix)\b/.exec(String(line)); return m ? m[1] : /^📌 decide:/.test(String(line)) ? 'decide' : null }
const typeCell = (type) => (type ? `${TYPES[type]} ${type.padEnd(9)}` : ' '.repeat(12))
// The status screen's mark before a paste line; a decide line already carries its 📌.
const mark = (line) => { const t = typeOf(line); return t && t !== 'decide' ? TYPES[t] + ' ' : '' }

// The one in-progress rule: a spec at `implementing`, or a fix item whose lane of the live batch is out.
const busy = (specStatuses, lane) => specStatuses.includes('implementing') || ['dispatched', 'sent-back'].includes(lane)
const laneOf = (root, id) => { const f = st.readFanout(root); const l = f && Array.isArray(f.batch) && id && f.batch.find((x) => x && x.item === id); return l ? l.status : null }

const ageDays = (it) => { const t = Date.parse(it.added); return it.added && !Number.isNaN(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null }
const ageText = (it) => (ageDays(it) === null ? '?' : `${ageDays(it)}d`)
const isStale = (it) => it.kind === 'prompt' && !it.after && ageDays(it) !== null && ageDays(it) >= 14
const ROW_WIDTH = () => process.stdout.columns || 100 // 100 off a TTY, so piped output is stable
const oneLine = (s, width) => { const flat = String(s).replace(/\s+/g, ' ').trim(); return flat.length <= width ? flat : flat.slice(0, Math.max(1, width - 1)) + '…' }

function dupPairs(prompts) {
  const pairs = []
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const score = promptDupScore(text(prompts[i]), text(prompts[j]))
      if (score !== null && score >= 0.35) pairs.push({ a: prompts[i], b: prompts[j], score })
    }
  }
  return pairs
}

// One read of specs and briefs for a screen: v7's brief rows, spec statuses, gate cache.
function ctxOf(root) {
  const specs = work.readSpecs(root); const briefs = Q.v7Briefs(root, work.readBriefs(root, specs))
  const byNum = new Map(briefs.map((b) => [b.num, b]))
  const statusOf = new Map(specs.map((s) => [s.path, s.status]))
  const specStatus = (p) => (fs.existsSync(path.join(root, p)) ? statusOf.get(p) || null : null)
  return { root, byNum, statusOf, ctx: { specStatus, specRoot: root }, cache: { briefs: [...byNum.values()] } }
}
const nameOf = (c, it) => c.byNum.get(work.normBrief(it.payload))
const gate = (c, it) => work.gateWhy(c.root, it.after, c.cache) // null = met or none
// A brief item whose brief has every spec done (or is superseded) and an open step outside specs: the user closes it.
const finished = (c, it) => { const b = it.kind === 'brief' && nameOf(c, it); return b && ['done', 'superseded'].includes(b.status) ? b.status : null }
const finTag = (c, it, fin) =>
  (fin === 'done' ? `✔ specs done, ${(nameOf(c, it).open || []).length} step(s) open` : '⛔ superseded')
const inProgress = (c, it) => it.kind === 'spec' ? busy([c.statusOf.get(it.payload)])
  : it.kind === 'brief' ? busy(((nameOf(c, it) || { specs: [] }).specs).map((s) => s.status))
    : busy([], it.type === 'fix' ? laneOf(c.root, it.id) : null)

const desc = (c, it) => (it.kind === 'brief' ? `brief ${work.normBrief(it.payload)}${nameOf(c, it) ? ` (${nameOf(c, it).name})` : ''}` : it.kind === 'spec' ? `spec ${it.payload}` : Q.paste(c.root, it))

// groom: v7's pending set on v8 state (the fill less finished work), flagged in buckets.
function groom(root, q) {
  const c = ctxOf(root)
  const isDone = (it) => !!it.done || (it.kind === 'brief' && (nameOf(c, it) || {}).status === 'done') ||
    (it.kind === 'spec' && [null, 'done', 'superseded'].includes(c.ctx.specStatus(it.payload)))
  const pending = Q.fill(root, q).items.filter((it) => !isDone(it))
  const prompts = pending.filter((it) => it.kind === 'prompt')
  const rows = (list) => {
    const idW = Math.max(0, ...list.map((it) => (it.id || '—').length)); const ageW = Math.max(0, ...list.map((it) => ageText(it).length))
    return list.map((it) => { const head = `  ${(it.id || '—').padEnd(idW)}  ${ageText(it).padEnd(ageW)}  `; return head + oneLine(desc(c, it), Math.max(20, ROW_WIDTH() - head.length)) })
  }
  const buckets = [
    ['duplicates', dupPairs(prompts).map((p) => `  ${p.a.id} ~ ${p.b.id}  ${p.score.toFixed(2)}`)],
    ['cites done', rows(prompts.filter((it) => citesDoneSpec(it, c.ctx)))],
    ['gate met', rows(pending.filter((it) => !!it.after && !gate(c, it)))],
    ['stale', rows(pending.filter(isStale))],
  ].filter(([, r]) => r.length)
  if (!buckets.length) return `✨ nothing to groom · ${pending.length} pending`
  return [...buckets.flatMap(([name, r]) => [`${name} (${r.length}):`, ...r]), 'fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes'].join('\n')
}

// list: `n id age type text` and the flags (v7's columns plus the type); the text is cut to the width, flags whole.
function list(root, q, json) {
  const c = ctxOf(root); const all = Q.fill(root, q).items; const items = Q.open({ items: all }); const done = all.length - items.length
  const info = (it) => ({ type: typeOf(Q.paste(root, it)), ref: it.id || (it.kind === 'brief' ? work.normBrief(it.payload) : it.payload), inProgress: inProgress(c, it) })
  if (json) return { items: items.map((it) => ({ ...it, ...info(it) })), done }
  if (!items.length) return `✨ nothing pending · ${done} done`
  const idW = Math.max(...items.map((it) => (it.id || '—').length)); const ageW = Math.max(...items.map((it) => ageText(it).length))
  const rows = items.map((it, i) => {
    const head = `${i + 1}  ${(it.id || '—').padEnd(idW)}  ${ageText(it).padEnd(ageW)}  ${typeCell(info(it).type)}  `
    const why = it.after && gate(c, it)
    const cites = citesDoneSpec(it, c.ctx); const fin = finished(c, it)
    const tail = (info(it).inProgress ? '  🔨 in progress' : '') +
      (it.after ? (why ? `  ⏳ after ${why.replace(/^\S*\//, '').replace(/\.md(?= \()/, '')}` : '  ⏳ gate met') : '') +
      (cites ? `  📎 cites done ${path.basename(cites).replace(/\.md$/, '')}` : '') + (isStale(it) ? '  ⌛ stale' : '') +
      (fin ? `  ${finTag(c, it, fin)} — /spec:queue done ${work.normBrief(it.payload)}` : '')
    const words = it.kind === 'brief' ? desc(c, it) : it.kind === 'spec' ? it.payload : text(it)
    return head + oneLine(words, Math.max(20, ROW_WIDTH() - head.length - tail.length)) + tail
  })
  return [...rows, `— ${done} done · move: /spec:queue move <ref> <n> · full text: /spec:queue show <ref>`].join('\n')
}

// show: v7's header, the gate line, a blank line, the full text.
function show(root, it) {
  const c = ctxOf(root); const why = it.after && gate(c, it)
  return [`${it.id || '—'}  ${it.kind}${it.done ? ' · done' : ''}`, ...(it.after ? [why ? `⏳ after ${why}` : '⏳ gate met'] : []), '', desc(c, it)].join('\n')
}

module.exports = { TYPES, typeCell, mark, oneLine, ROW_WIDTH, busy, laneOf, ctxOf, gate, finished, groom, list, show }
