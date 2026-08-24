'use strict'
// lib/queue.js — the ONE item-doneness/predicate evaluator and the ONE missing-brief
// placement algorithm for the derived session queue (specs/20260823/08-derived-session-
// queue.md). Why a shared module: D2/Behavior require doneness to be evaluated identically
// whether the caller is spec-queue.js (the write path — brief states come from shelling
// `spec-status --json`) or spec-status.js's own read-only overlay (brief states come from
// its in-process derivation) — a second hand-rolled copy of "is this item done" in either
// caller is exactly the duplicate-derivation defect class this repo flags as a hard
// finding. `reconcileMissingBriefs` is shared for the same reason: D6 runs the identical
// placement rule twice — for real, with writes, on every spec-queue.js write subcommand,
// and virtually (never writing) inside spec-status.js's overlay — and a placement computed
// two different ways would eventually disagree about where an auto-placed item lands.
//
// What this deliberately does NOT do: read or write the queue file itself (both CLI
// callers own their own file I/O — this module is pure, given-data-in/data-out); shell
// out to git or to spec-status.js (callers resolve the queue path and brief states
// themselves); validate CLI `--when` syntax (spec-queue.js's own add-subcommand parses the
// `--when <type>:<args>` flag; this module only evaluates an already-shaped `when` object);
// decide seeding (D7's "absent file -> seed everything" is spec-queue.js's own call —
// this module's reconcile only ever INSERTS missing items into an existing list, real or
// virtual, it never decides whether to seed from nothing).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

// Brief ids are NN plus an optional single lowercase letter (04, 04a, 15a, …) — the exact
// shape spec-status.js's own normBrief produces. Mirrored here (not re-exported from
// spec-status.js, which is a CLI entrypoint, not a requirable module) so spec-queue.js's
// <ref> resolution and --brief/add classification agree with spec-status.js's own id shape
// without a second, drifting regex.
function normBrief(v) {
  const m = String(v).trim().match(/^(\d+)([A-Za-z]?)(?:-.*)?$/)
  return m ? m[1].padStart(2, '0') + m[2].toLowerCase() : String(v).trim()
}

// D6's "minus superseded briefs, which are derived — never queued": a roadmap brief file is
// superseded when its body opens a blockquote with "Superseded by" — the same marker the
// roadmap overview's "*(superseded by v7)*" annotations describe in prose (docs/roadmap/
// 01-claims-registry.md, 05-hotspot-audit.md, 07-suite-baseline.md, as of 2026-08-23).
// "Substantially delivered by" (docs/roadmap/06-mechanized-prose-checks.md) deliberately
// does NOT match — a delivered brief is done, not exempt from ever being queued.
function isSupersededBriefText(text) {
  return /^>\s*\*\*Superseded by\b/m.test(text)
}

// The single predicate evaluator (D5's closed vocabulary). `ctx` is caller-shaped:
//   briefStatus(num) -> 'unplanned'|'in-flight'|'done'|undefined
//   specExists(relPath) -> boolean
//   ledgerCount(stage) -> number (count of ledger rows with that stage)
// Returns { done, unknownType } — an unknown `when.type` is NEVER done and NEVER throws
// (Contracts: "never a crash, never silently done"); the caller surfaces `unknownType` as
// its own one-anomaly-line policy.
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

// Item doneness (D3/D4/D14): a `brief` item's doneness is ALWAYS the derived brief state —
// never a stored flag (D4). A `prompt` item is done when manually ticked (`ticked` stamped,
// D14), OR — when it carries a `when` predicate — when that predicate evaluates true; a
// prompt item with neither is manual-only and stays undone until ticked.
function isItemDone(item, ctx) {
  if (item.kind === 'brief') return { done: ctx.briefStatus(item.brief) === 'done', unknownType: false }
  if (item.ticked) return { done: true, unknownType: false }
  if (item.when) return evaluateWhen(item.when, ctx)
  return { done: false, unknownType: false }
}

// Builds a `ctx` for evaluateWhen/isItemDone from already-read inputs — neither ledger rows
// nor brief statuses are re-read here; callers pass what they already have (spec-status.js
// its in-process `ledgerRows`/`briefByNum`; spec-queue.js its own `readLedgerRows` call and
// its shelled `spec-status --json` briefs map) so this module never becomes a second I/O
// path for either.
function makeCtx({ ledgerRows, briefStatus, specRoot }) {
  const countCache = new Map()
  return {
    briefStatus,
    specExists: relPath => fs.existsSync(path.join(specRoot, relPath)),
    ledgerCount: stage => {
      if (!countCache.has(stage)) countCache.set(stage, ledgerRows.filter(r => r.stage === stage).length)
      return countCache.get(stage)
    },
  }
}

// D6's placement rule, run against a full (brief+prompt, in order) item list. For every
// on-disk brief not already present as a `kind:'brief'` item, insert immediately after the
// item for the LAST brief in its `dependsOn` list; else immediately after its letter-suffix
// parent's item (15a -> 15); else append at the end. Processes `onDiskBriefs` in the order
// given (callers pass roadmap order) so a brief inserted this pass is itself a valid
// insertion target for a later brief in the same pass (15a after 15, 15b after 15a).
// Returns NEW arrays — `items` is never mutated. Each inserted item is stamped
// `auto_placed: stamp()` (called once per insertion) and gets `id: null` — assigning real,
// sequential ids is the caller's job (a real write bumps the file's `seq`; a virtual/never-
// persisted caller may leave ids null, since nothing downstream keys off them).
function reconcileMissingBriefs(items, onDiskBriefs, { stamp }) {
  const working = items.slice()
  const inserted = []
  const indexOfBrief = num => working.findIndex(it => it.kind === 'brief' && it.brief === num)
  for (const b of onDiskBriefs) {
    if (indexOfBrief(b.num) !== -1) continue // already a real item — never re-inserted
    let afterIdx = -1
    const deps = b.dependsOn || []
    if (deps.length) afterIdx = indexOfBrief(deps[deps.length - 1])
    if (afterIdx === -1) {
      const m = /^(\d+)([a-z])$/.exec(b.num)
      if (m) afterIdx = indexOfBrief(m[1])
    }
    const item = { id: null, kind: 'brief', brief: b.num, auto_placed: stamp() }
    if (afterIdx === -1) working.push(item)
    else working.splice(afterIdx + 1, 0, item)
    inserted.push(item)
  }
  return { items: working, inserted }
}

module.exports = {
  normBrief, isSupersededBriefText, evaluateWhen, isItemDone, makeCtx, reconcileMissingBriefs,
}
