'use strict'
// lib/queue.js — the ONE item-doneness/readiness evaluator and the ONE missing-brief
// placement algorithm for the derived session queue.
// Owner: specs/20260903/03-pipeline-queue-mechanics.md.
// Why a shared module: spec-queue.js (the write path) and spec-status.js's read-only overlay must
// evaluate doneness, readiness and the append-last placement identically.
//
// What this deliberately does NOT do: read or write the queue file (pure data-in/data-out); shell out
// to git or spec-status.js; validate CLI `--when`/`--after-*` syntax; decide seeding; or place items
// relative to their roadmap Depends-on parent (append-last is the whole rule).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

// Brief ids are NN plus an optional single lowercase letter (04, 04a, 15a, …).
function normBrief(v) {
  const m = String(v).trim().match(/^(\d+)([A-Za-z]?)(?:-.*)?$/)
  return m ? m[1].padStart(2, '0') + m[2].toLowerCase() : String(v).trim()
}

// A roadmap brief is superseded when its body opens a blockquote with "Superseded by";
// "Substantially delivered by" deliberately does NOT match.
function isSupersededBriefText(text) {
  return /^>\s*\*\*Superseded by\b/m.test(text)
}

// The single predicate evaluator for a prompt item's `when` (closed vocabulary). `ctx` is
// caller-shaped — see makeCtx below. Returns { done, unknownType } — an unknown `when.type`
// is NEVER done and NEVER throws; the caller surfaces `unknownType` as its own one-anomaly-
// line policy.
function evaluateWhen(when, ctx) {
  if (!when || typeof when.type !== 'string') return { done: false, unknownType: true }
  switch (when.type) {
    case 'brief-state':
      return { done: ctx.briefStatus(when.brief) === when.state, unknownType: false }
    case 'spec-exists':
      return { done: ctx.specExists(when.path), unknownType: false }
    case 'ledger-count':
      return { done: (ctx.ledgerCount(when.stage) - (when.baseline || 0)) >= when.min, unknownType: false }
    case 'manual':
      return { done: false, unknownType: false } // never auto-completes — only a `done` tick does
    default:
      return { done: false, unknownType: true }
  }
}

// Item doneness: a `brief` item is the derived brief state; a `spec` item is done/superseded or its
// file absent; a `prompt` item is done when ticked or its `when` predicate holds. A tick always wins.
function isItemDone(item, ctx) {
  // An explicit tick retires ANY item, whatever its kind — a brief/spec whose target vanished is
  // otherwise unclearable.
  if (item.ticked) return { done: true, unknownType: false }
  if (item.kind === 'brief') return { done: ctx.briefStatus(item.brief) === 'done', unknownType: false }
  if (item.kind === 'spec') {
    const st = ctx.specStatus(item.spec)
    return { done: st === null || st === 'done' || st === 'superseded', unknownType: false }
  }
  if (item.when) return evaluateWhen(item.when, ctx)
  return { done: false, unknownType: false }
}

// Readiness is a second predicate, consulted only while an item is undone. No `after` gate -> ready.
// `target` is "specs/…" or "brief NN"; `state` is the target's derived status, or "missing" — a
// missing target is NEVER ready.
function isItemReady(item, ctx) {
  if (!item.after) return { ready: true, target: null, state: null }
  if (item.after.spec) {
    const target = item.after.spec
    const st = ctx.specStatus(target)
    if (st === null) return { ready: false, target, state: 'missing' }
    return { ready: st === 'done' || st === 'superseded', target, state: st }
  }
  if (item.after.brief) {
    const target = `brief ${item.after.brief}`
    const st = ctx.briefStatus(item.after.brief)
    if (st === undefined || st === null) return { ready: false, target, state: 'missing' }
    return { ready: st === 'done', target, state: st }
  }
  return { ready: true, target: null, state: null }
}

// Builds a `ctx` for evaluateWhen/isItemDone/isItemReady from inputs the caller already read —
// this module is never a second I/O path.
//   briefStatus(num) -> 'unplanned'|'in-flight'|'done'|undefined
//   specStatus(relPath) -> 'draft'|'hardened'|'implementing'|'done'|'superseded'|null (absent)
function makeCtx({ ledgerRows, briefStatus, specStatus, specRoot }) {
  const countCache = new Map()
  return {
    briefStatus,
    specStatus,
    specRoot,
    specExists: relPath => fs.existsSync(path.join(specRoot, relPath)),
    ledgerCount: stage => {
      if (!countCache.has(stage)) countCache.set(stage, ledgerRows.filter(r => r.stage === stage).length)
      return countCache.get(stage)
    },
  }
}

// Collapses duplicate `brief`/`spec` items to their FIRST occurrence; `prompt` items are never deduped.
// Returns a NEW array.
function dedupeItems(items) {
  const seenBrief = new Set()
  const seenSpec = new Set()
  const out = []
  for (const it of items) {
    if (it.kind === 'brief') {
      if (seenBrief.has(it.brief)) continue
      seenBrief.add(it.brief)
    } else if (it.kind === 'spec') {
      if (seenSpec.has(it.spec)) continue
      seenSpec.add(it.spec)
    }
    out.push(it)
  }
  return out
}

// Appends every on-disk brief not already queued at the very end, in the given (roadmap) order, with
// `id: null` — the caller assigns real ids. Returns NEW arrays.
function reconcileMissingBriefs(items, onDiskBriefs) {
  const present = new Set(items.filter(it => it.kind === 'brief').map(it => it.brief))
  const inserted = []
  for (const b of onDiskBriefs) {
    if (present.has(b.num)) continue
    const item = { id: null, kind: 'brief', brief: b.num }
    inserted.push(item)
    present.add(b.num)
  }
  return { items: items.concat(inserted), inserted }
}

// Token set of a free-text prompt: lowercase [a-z0-9]+ runs of length >= 4.
// Short words and punctuation carry no duplicate signal.
function promptTokens(payload) {
  const out = new Set()
  for (const t of String(payload || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (t.length >= 4) out.add(t)
  }
  return out
}

// |A∩B| / |A∪B| over two Sets; 0 when both are empty.
function jaccard(a, b) {
  if (!a.size && !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

// A path-shaped payload: one whitespace-free token containing a `/` (a prototype's
// `design/prototypes/<stem>/contract.json`, queued in the plan lane). Paths are identities, not
// prose — two different paths are never near-duplicates however many directory words they share.
function isPathPayload(payload) { return /^\S+\/\S+$/.test(String(payload || '').trim()) }
// Identity form of a path payload: `./` prefixes, `//` runs and a trailing `/` are cosmetic.
function pathIdentity(payload) { return path.posix.normalize(String(payload).trim()).replace(/\/+$/, '') }

// Near-duplicate score between two prompt payloads, or null when the pair is not comparable.
// Path vs path: 1 when identical, else null. Path vs prose: null. Prose vs prose: token Jaccard.
function promptDupScore(a, b) {
  const pa = isPathPayload(a), pb = isPathPayload(b)
  if (pa || pb) return pa && pb && pathIdentity(a) === pathIdentity(b) ? 1 : null
  return jaccard(promptTokens(a), promptTokens(b))
}

// The first specs/YYYYMMDD/NN…md path a prompt payload names whose spec is done or
// superseded (ctx.specStatus), else null. Only prompts cite; briefs and specs never do.
function citesDoneSpec(item, ctx) {
  if (!item || item.kind !== 'prompt' || typeof item.payload !== 'string') return null
  const hit = rel => { const st = ctx.specStatus(rel); return st === 'done' || st === 'superseded' }
  for (const m of item.payload.matchAll(/specs\/\d{8}\/\d{2}[\w.-]*\.md/g)) if (hit(m[0])) return m[0]
  // bare `specs/YYYYMMDD/NN` (no more filename) -> the unique on-disk NN-*.md; ambiguous/missing -> no flag
  for (const m of item.payload.matchAll(/specs\/(\d{8})\/(\d{2})(?![\w.-])/g)) {
    let names = []
    try { names = fs.readdirSync(path.join(ctx.specRoot, 'specs', m[1])).filter(n => n.startsWith(m[2] + '-') && n.endsWith('.md')) } catch (_) { /* absent dir */ }
    if (names.length === 1 && hit(`specs/${m[1]}/${names[0]}`)) return `specs/${m[1]}/${names[0]}`
  }
  return null
}

// A free-text item's lane: which command takes it next, recorded by the session that adds it. One lane
// per entry command, plus `decide` (waits on the user's yes).
const LANES = { plan: '/spec:plan', prototype: '/spec:prototype', fix: '/spec:fix', decide: null }

// The ONE paste line for a prompt item, shared by `spec-queue next` and spec-status.js's Next block:
// the lane's command then the payload; `decide` prints a "needs your yes" lead; a lane-less item
// prints its payload verbatim.
function promptAction(item) {
  if (!item.lane || !Object.prototype.hasOwnProperty.call(LANES, item.lane)) return item.payload
  const command = LANES[item.lane]
  return command ? `${command} ${item.payload}` : `📌 decide: ${item.payload}`
}

module.exports = {
  normBrief, isSupersededBriefText, evaluateWhen, isItemDone, isItemReady, makeCtx,
  dedupeItems, reconcileMissingBriefs,
  promptTokens, jaccard, isPathPayload, promptDupScore, citesDoneSpec, LANES, promptAction,
}
