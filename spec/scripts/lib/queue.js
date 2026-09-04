'use strict'
// lib/queue.js — the ONE item-doneness/readiness evaluator and the ONE missing-brief
// placement algorithm for the derived session queue. Owner: specs/20260903/03-pipeline-
// queue-mechanics.md (D1-D5), superseding specs/20260823/08-derived-session-queue.md's
// original dependency-aware placement. Why a shared module: doneness AND readiness must be
// evaluated identically whether the caller is spec-queue.js (the write path — brief/spec
// states come from shelling `spec-status --json`) or spec-status.js's own read-only overlay
// (states come from its in-process derivation) — a second hand-rolled copy of either
// predicate in either caller is exactly the duplicate-derivation defect class this repo
// flags as a hard finding. `reconcileMissingBriefs` is shared for the same reason: D4 runs
// the identical append-last placement rule twice — for real, with writes, on every
// spec-queue.js write subcommand, and virtually (never writing) inside spec-status.js's
// overlay — and a placement computed two different ways would eventually disagree about
// where an appended item lands.
//
// What this deliberately does NOT do: read or write the queue file itself (both CLI
// callers own their own file I/O — this module is pure, given-data-in/data-out); shell
// out to git or to spec-status.js (callers resolve the queue path and brief/spec states
// themselves); validate CLI `--when`/`--after-*` syntax (spec-queue.js's own add-subcommand
// parses those flags; this module only evaluates an already-shaped `when`/`after` object);
// decide seeding (an absent-file "seed everything" is spec-queue.js's own call — this
// module's reconcile only ever appends missing items into an existing list, real or
// virtual, it never decides whether to seed from nothing); place items relative to their
// roadmap Depends-on parent (D4 retired that — append-last is the whole rule now).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

// Brief ids are NN plus an optional single lowercase letter (04, 04a, 15a, …) — the exact
// shape spec-status.js's own normBrief produces. Mirrored here (not re-exported from
// spec-status.js, which is a CLI entrypoint, not a requirable module) so spec-queue.js's
// <ref> resolution and payload classification agree with spec-status.js's own id shape
// without a second, drifting regex.
function normBrief(v) {
  const m = String(v).trim().match(/^(\d+)([A-Za-z]?)(?:-.*)?$/)
  return m ? m[1].padStart(2, '0') + m[2].toLowerCase() : String(v).trim()
}

// D6 (20260823/08): a roadmap brief file is superseded when its body opens a blockquote
// with "Superseded by" — the same marker the roadmap overview's "*(superseded by v7)*"
// annotations describe in prose. "Substantially delivered by" deliberately does NOT match —
// a delivered brief is done, not exempt from ever being queued.
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

// Item doneness (D1/D4/D14 of the two specs): a `brief` item's doneness is ALWAYS the
// derived brief state — never a stored flag. A `spec` item's doneness (D1, this spec) is
// ALWAYS the derived spec status — done or superseded — OR the file no longer existing
// (retirement precedent: a vanished spec is silence, not a dangling reference). A `prompt`
// item is done when manually ticked (`ticked` stamped), OR — when it carries a `when`
// predicate — when that predicate evaluates true; a prompt item with neither is manual-only
// and stays undone until ticked.
function isItemDone(item, ctx) {
  if (item.kind === 'brief') return { done: ctx.briefStatus(item.brief) === 'done', unknownType: false }
  if (item.kind === 'spec') {
    const st = ctx.specStatus(item.spec)
    return { done: st === null || st === 'done' || st === 'superseded', unknownType: false }
  }
  if (item.ticked) return { done: true, unknownType: false }
  if (item.when) return evaluateWhen(item.when, ctx)
  return { done: false, unknownType: false }
}

// D2/D3 (this spec): readiness is a SECOND predicate, independent of doneness — a done item
// is never "not ready" (nothing consults isItemReady for a done item; readiness only matters
// while the item is still undone). An item with no `after` gate is always ready. `target` is
// "specs/…" for a spec gate, "brief NN" for a brief gate; `state` is the gate target's
// derived status string, or "missing" when the target cannot be resolved at all (a deleted
// spec file, an unknown brief number) — a missing target is NEVER ready and NEVER silently
// releases the item.
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

// Builds a `ctx` for evaluateWhen/isItemDone/isItemReady from already-read inputs — neither
// ledger rows nor brief/spec statuses are re-read here; callers pass what they already have
// (spec-status.js its in-process `ledgerRows`/`briefByNum`/spec list; spec-queue.js its own
// `readLedgerRows` call and its shelled `spec-status --json` briefs/specs maps) so this
// module never becomes a second I/O path for either.
//   briefStatus(num) -> 'unplanned'|'in-flight'|'done'|undefined
//   specStatus(relPath) -> 'draft'|'hardened'|'implementing'|'done'|'superseded'|null (absent)
function makeCtx({ ledgerRows, briefStatus, specStatus, specRoot }) {
  const countCache = new Map()
  return {
    briefStatus,
    specStatus,
    specExists: relPath => fs.existsSync(path.join(specRoot, relPath)),
    ledgerCount: stage => {
      if (!countCache.has(stage)) countCache.set(stage, ledgerRows.filter(r => r.stage === stage).length)
      return countCache.get(stage)
    },
  }
}

// D5 (this spec): a brief or spec is queued at most once. Collapses duplicate `brief`/`spec`
// items to their FIRST occurrence, in original order; `prompt` items are never deduped
// (there is no natural identity to collapse on). Returns a NEW array — `items` is never
// mutated.
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

// D4 (this spec): `auto_placed` is never written going forward; a file carrying it from
// before this spec is tolerated on read and stripped on the next write. Returns a NEW array
// (items themselves are shallow-copied only when they actually carry the key) — `items` is
// never mutated.
function stripAutoPlaced(items) {
  return items.map(it => {
    if (!('auto_placed' in it)) return it
    const { auto_placed, ...rest } = it
    return rest
  })
}

// D4's placement rule, run against a full (brief/spec/prompt, in order) item list. For every
// on-disk brief not already present as a `kind:'brief'` item, APPEND it at the very end, in
// the order `onDiskBriefs` is given (callers pass roadmap order) — no dependency-aware or
// letter-suffix-parent insertion (both retired by D4), no stamp. Returns NEW arrays —
// `items` is never mutated. Each inserted item gets `id: null` — assigning a real,
// sequential id is the caller's job (a real write bumps the file's `seq`; a virtual/never-
// persisted caller may leave ids null, since nothing downstream keys off them).
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

module.exports = {
  normBrief, isSupersededBriefText, evaluateWhen, isItemDone, isItemReady, makeCtx,
  dedupeItems, stripAutoPlaced, reconcileMissingBriefs,
}
