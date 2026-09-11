'use strict'
// lib/mocks-walk.js — the one validated reader/writer for design/mocks/walk.json plus the pure
// per-journey transforms design-atlas.js's client-mount walk routes and mocks-driver.js's
// `client waive`/`client log` share. specs/20260910/03-client-journey-player.md D4,
// AC-20260910-03-4.
//
// Same one-writer pattern as lib/mocks-notes.js/lib/mocks-picks.js: readWalk returns a cold
// default ({journeys:{}}) rather than throwing on a missing file, writeWalk is a tmp-file
// rename (never a direct overwrite) so a concurrent reader (the served /client/__walk/state
// route) never observes a torn write. recordEvent/confirmJourney/waiveJourney are pure — they
// take the in-memory walk object and return a NEW one; callers (design-atlas.js's routes,
// mocks-driver.js's `client waive`) own reading the file first and writing the result after.
//
// Does NOT: touch design/mocks/notes.json, status.json or ledger.md, read or derive `openedAt`
// itself (waiveJourney takes it as an input — the caller derives it from
// status.client.openedAt, mocks-driver.js's own job), or know about the served HTTP routes at
// all.
//
// Exit codes: none — this is a library, not an executable.

const fs = require('fs')
const path = require('path')

const DAY_MS = 86400000

function walkPath(root) { return path.join(root, 'design/mocks/walk.json') }

// {journeys:{}} on a cold root — no walk.json yet is a valid starting point.
function readWalk(root) {
  let raw
  try {
    raw = fs.readFileSync(walkPath(root), 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return { journeys: {} }
    throw e
  }
  const parsed = JSON.parse(raw)
  if (!parsed.journeys) parsed.journeys = {}
  return parsed
}

// D11/tmp-file-rename discipline (mocks-notes.js's writeNotes): a tmp file beside walk.json,
// then renameSync over the final path — atomic on one filesystem, so the served GET
// /client/__walk/state route never sees a torn write.
function writeWalk(root, walk) {
  const p = walkPath(root)
  const dir = path.dirname(p)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, 'walk.json.tmp-' + process.pid)
  fs.writeFileSync(tmp, JSON.stringify(walk, null, 2) + '\n')
  fs.renameSync(tmp, p)
}

const EMPTY_RECORD = () => ({ reached: [], misses: [], confirmedAt: null, sentence: null, waived: null, lastEventAt: null })

function recordOf(walk, journey) {
  return (walk.journeys && walk.journeys[journey]) || EMPTY_RECORD()
}

// recordEvent(walk, {journey, walk:'to'|'miss', from, to?, target?, at}) → a NEW walk object.
// A "to" appends `from` then `to` to `reached` when each is not already present (so two
// identical "to" events over the same edge never duplicate either label); a "miss" appends
// {at, from, target} to `misses` and never touches `reached`.
function recordEvent(walk, input) {
  const body = input || {}
  const journey = body.journey
  if (!journey) throw new Error('recordEvent: {journey} is required')
  const rec = recordOf(walk, journey)
  const next = Object.assign({}, rec, { reached: rec.reached.slice(), misses: rec.misses.slice() })
  if (body.walk === 'to') {
    if (!next.reached.includes(body.from)) next.reached.push(body.from)
    if (!next.reached.includes(body.to)) next.reached.push(body.to)
  } else if (body.walk === 'miss') {
    next.misses.push({ at: body.at, from: body.from, target: body.target })
  } else {
    throw new Error('recordEvent: unknown walk event "' + body.walk + '" — expected "to" or "miss"')
  }
  next.lastEventAt = body.at
  return { journeys: Object.assign({}, walk.journeys, { [journey]: next }) }
}

// confirmJourney(walk, {journey, sentence, at}) → a NEW walk object. Refuses (throws, naming
// the journey) an empty sentence or a journey already confirmed.
function confirmJourney(walk, input) {
  const body = input || {}
  const journey = body.journey
  if (!journey) throw new Error('confirmJourney: {journey} is required')
  const rec = recordOf(walk, journey)
  if (rec.confirmedAt) throw new Error('confirmJourney: journey "' + journey + '" is already confirmed')
  if (!String(body.sentence || '').trim()) {
    throw new Error('confirmJourney: journey "' + journey + '" requires a non-empty sentence to confirm')
  }
  const next = Object.assign({}, rec, {
    confirmedAt: body.at || new Date().toISOString(),
    sentence: body.sentence,
  })
  return { journeys: Object.assign({}, walk.journeys, { [journey]: next }) }
}

// waiveJourney(walk, {journey, reason, by, now, openedAt}) → a NEW walk object. Refuses (throws,
// naming the elapsed day count and 7) before seven full days have elapsed since the LATER of
// `openedAt`, the journey's `lastEventAt` (any client event, a correct click included) and the
// journey's own last recorded miss (kept as a fallback so records written before lastEventAt
// existed still clock correctly) — the same elapsed-days clock lib/mocks-notes.js's waiveNote
// runs for a note, applied here to a whole journey.
function waiveJourney(walk, input) {
  const body = input || {}
  const journey = body.journey
  if (!journey) throw new Error('waiveJourney: {journey} is required')
  const rec = recordOf(walk, journey)
  const now = body.now instanceof Date ? body.now : new Date(body.now || Date.now())
  let since = body.openedAt
  if (rec.lastEventAt && rec.lastEventAt > since) since = rec.lastEventAt
  for (const m of rec.misses || []) if (m.at && m.at > since) since = m.at
  const sinceDate = new Date(since)
  const elapsedDays = Math.floor((now.getTime() - sinceDate.getTime()) / DAY_MS)
  if (elapsedDays < 7) {
    throw new Error('waiveJourney: journey "' + journey + '" has been silent ' + elapsedDays +
      ' day(s) — a waiver needs 7')
  }
  const next = Object.assign({}, rec, {
    waived: { at: now.toISOString(), reason: body.reason, by: body.by || 'session' },
  })
  return { journeys: Object.assign({}, walk.journeys, { [journey]: next }) }
}

// isClosed(walk, j) — confirmed or waived, either closes the journey for the `approved` gate.
function isClosed(walk, journey) {
  const rec = recordOf(walk, journey)
  return !!(rec.confirmedAt || rec.waived)
}

// specs/20260911/04-the-client-loop.md D1: journeyState(rec, notes, labels) — `rec` is ONE
// journey's own record (recordOf's return shape, not the whole {journeys:{}} file), `notes` is
// notes.json's raw array, `labels` is that journey's declared screen set (Array or Set). Derived,
// never stored — callers (design-atlas.js's client routes, mocks-driver.js's CLIENT step and
// lib/walk-page.js's builders) all read the same two files and get the same answer. Order is
// fixed: `waived` short-circuits regardless of notes; an OPEN client request outranks a set
// `confirmedAt` (a new "changes requested" ask takes back a stale OK by construction, before D2's
// own route-level unconfirm ever runs); an ADDRESSED one with none open reads `fixed`; only then
// does a set `confirmedAt` read `ok`; `walking`/`unseen` split on whether any screen was reached.
function journeyState(rec, notes, labels) {
  if (rec && rec.waived) return 'waived'
  const set = labels instanceof Set ? labels : new Set(labels || [])
  const relevant = (notes || []).filter((n) => n && n.scope === 'mock' && set.has(n.screen) &&
    n.kind !== 'question' && (n.origin === 'client'))
  if (relevant.some((n) => n.status === 'open')) return 'changes-requested'
  if (relevant.some((n) => n.status === 'addressed')) return 'fixed'
  if (rec && rec.confirmedAt) return 'ok'
  if (rec && Array.isArray(rec.reached) && rec.reached.length) return 'walking'
  return 'unseen'
}

// specs/20260911/04-the-client-loop.md D1: unconfirmJourney(walk, {journey, at, cause}) — the
// whole-file transform (same shape as confirmJourney/recordEvent: takes the {journeys:{}} object,
// returns a NEW one). A confirmed journey's `confirmedAt`/`sentence` move into one APPENDED
// `history` entry (`{confirmedAt, sentence, clearedAt: at, cause}`) and are nulled; an unconfirmed
// journey (confirmedAt already null) is returned byte-identical, with no history entry appended —
// a second take-back on the same journey (D2's own re-add case) is a no-op, never a growing log.
function unconfirmJourney(walk, input) {
  const body = input || {}
  const journey = body.journey
  if (!journey) throw new Error('unconfirmJourney: {journey} is required')
  const rec = recordOf(walk, journey)
  if (!rec.confirmedAt) return walk
  const history = Array.isArray(rec.history) ? rec.history.slice() : []
  history.push({ confirmedAt: rec.confirmedAt, sentence: rec.sentence, clearedAt: body.at, cause: body.cause })
  const next = Object.assign({}, rec, { confirmedAt: null, sentence: null, history })
  return { journeys: Object.assign({}, walk.journeys, { [journey]: next }) }
}

module.exports = {
  readWalk, writeWalk, recordEvent, confirmJourney, waiveJourney, isClosed, journeyState, unconfirmJourney,
}
