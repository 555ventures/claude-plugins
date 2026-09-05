'use strict'
// lib/mocks-picks.js — the one validated reader/writer for design/mocks/picks.json plus the pure
// stop transforms both the served atlas (design-atlas.js's /__picks/* routes) and spec 02's mocks
// driver share. specs/20260905/01-picks-on-the-atlas-page.md D1, AC-20260905-01-1, AC-20260905-01-2.
//
// A stop is a look-stop record over one or more candidate groups (a group is one flow: its
// screens in candidate order). `openStop` assigns "P001"-style ids and supersedes any earlier
// open/decided stop sharing the same key, so a redraw after a change decision always yields a
// fresh block. `decideStop` on an open stop records the decision; on an already-decided stop it
// REPLACES the decision and pushes the earlier one onto `previous` (re-pick until the session
// consumes it) — it refuses a consumed stop ("already consumed"), a superseded stop
// ("superseded"), a pick outside the declared candidate groups, a change with an empty note, and
// any verdict the stop's kind does not allow (pick stops take pick|change, approve stops take
// approve|change).
//
// Does NOT: touch design/mocks/status.json, ledger.md, or notes.json, parse seed.md or roadmap
// surfaces itself (callers hand in already-derived candidates), or read/write any file beyond
// design/mocks/picks.json.
//
// Exit codes: none — this is a library, not an executable.

const fs = require('fs')
const path = require('path')

const KINDS = ['pick', 'approve']
const STATUSES = ['open', 'decided', 'consumed', 'superseded']
const VERDICTS_BY_KIND = { pick: ['pick', 'change'], approve: ['approve', 'change'] }
const ID_RE = /^P\d+$/

function picksPath(root) { return path.join(root, 'design/mocks/picks.json') }

// [] on a cold root — no picks.json yet is a valid starting point (same posture as
// mocks-notes.js's readNotes).
function readPicks(root) {
  let raw
  try {
    raw = fs.readFileSync(picksPath(root), 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }
  return JSON.parse(raw)
}

function writePicks(root, stops) {
  const p = picksPath(root)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(stops, null, 2) + '\n')
}

// D1: one error per problem — id shape, kind enum, status enum, empty candidates, a pick stop
// with a null-group candidate, an approve stop with a non-null-group candidate, and a duplicate
// id (counted once, mirroring mocks-notes.js's validateNotes convention).
function validatePicks(stops) {
  const errors = []
  const seen = new Set()
  const list = Array.isArray(stops) ? stops : []
  for (let i = 0; i < list.length; i++) {
    const s = list[i] || {}
    const label = s.id != null ? s.id : '#' + i
    if (typeof s.id !== 'string' || !ID_RE.test(s.id)) {
      errors.push('stop "' + label + '": id must match ^P\\d+$ (field "id")')
    } else if (seen.has(s.id)) {
      errors.push('stop "' + s.id + '": duplicate id (field "id")')
    } else {
      seen.add(s.id)
    }
    if (!KINDS.includes(s.kind)) {
      errors.push('stop "' + label + '": kind must be one of ' + KINDS.join('|') + ' (field "kind")')
    }
    if (typeof s.key !== 'string' || !s.key.trim()) {
      errors.push('stop "' + label + '": key must be non-empty (field "key")')
    }
    if (!STATUSES.includes(s.status)) {
      errors.push('stop "' + label + '": status must be one of ' + STATUSES.join('|') + ' (field "status")')
    }
    if (!Array.isArray(s.candidates) || !s.candidates.length) {
      errors.push('stop "' + label + '": candidates must be a non-empty array (field "candidates")')
    } else if (s.kind === 'pick') {
      if (s.candidates.some((c) => !c || c.group == null)) {
        errors.push('stop "' + label + '": every candidate needs a non-null group on a pick stop (field "candidates")')
      }
    } else if (s.kind === 'approve') {
      if (s.candidates.some((c) => c && c.group != null)) {
        errors.push('stop "' + label + '": every candidate\'s group must be null on an approve stop (field "candidates")')
      }
    }
  }
  return { errors }
}

function nextId(stops) {
  let max = 0
  for (const s of stops) {
    const m = /^P(\d+)$/.exec(s && s.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return 'P' + String(max + 1).padStart(3, '0')
}

// openStop(stops, {kind, key, title, question?, candidates, url?}) → {stops, stop}
// Supersedes any earlier open/decided stop sharing `key` — a redraw after a change decision
// must not leave two live blocks for the same section.
function openStop(stops, input) {
  const body = input || {}
  const superseded = stops.map((s) =>
    s.key === body.key && (s.status === 'open' || s.status === 'decided')
      ? Object.assign({}, s, { status: 'superseded' })
      : s)
  const stop = {
    id: nextId(stops),
    kind: body.kind,
    key: body.key,
    title: body.title,
    question: body.question != null ? body.question : null,
    candidates: body.candidates,
    url: body.url != null ? body.url : null,
    openedAt: new Date().toISOString(),
    status: 'open',
    decision: null,
    previous: [],
  }
  return { stops: superseded.concat([stop]), stop }
}

function findStop(stops, id) {
  const stop = stops.find((s) => s.id === id)
  if (!stop) throw new Error('no stop with id "' + id + '"')
  return stop
}

// decideStop(stops, id, {verdict, pick?, note?, by}) → {stops, stop}
// open → decided; decided → replaced (prior decision appended to previous, oldest first).
// Throws on a consumed stop, a superseded stop, a pick outside the declared targets, a change
// with an empty note, and a verdict the stop's kind does not allow.
function stopError(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

function decideStop(stops, id, input) {
  const body = input || {}
  const stop = findStop(stops, id)
  if (stop.status === 'consumed') throw stopError('consumed', 'stop "' + id + '": already consumed')
  if (stop.status === 'superseded') throw stopError('superseded', 'stop "' + id + '": superseded')

  const allowed = VERDICTS_BY_KIND[stop.kind] || []
  if (!allowed.includes(body.verdict)) {
    throw stopError('bad-request', 'stop "' + id + '": verdict "' + body.verdict + '" is not allowed on a "' + stop.kind +
      '" stop — ' + stop.kind + ' stops take ' + allowed.join('|'))
  }
  if (body.verdict === 'pick') {
    const targets = [...new Set((stop.candidates || []).map((c) => c.group))]
    if (!targets.includes(body.pick)) {
      throw stopError('bad-request', 'stop "' + id + '": pick "' + body.pick + '" is not among the candidate groups (' + targets.join(', ') + ')')
    }
  }
  if (body.verdict === 'change' && !String(body.note || '').trim()) {
    throw stopError('bad-request', 'stop "' + id + '": a change decision requires a non-empty note (field "note")')
  }

  const decision = {
    verdict: body.verdict,
    pick: body.verdict === 'pick' ? body.pick : null,
    note: body.note != null && String(body.note).trim() ? body.note : null,
    by: body.by,
    at: new Date().toISOString(),
  }
  const previous = stop.status === 'decided' ? stop.previous.concat([stop.decision]) : stop.previous
  const decided = Object.assign({}, stop, { status: 'decided', decision, previous })
  return { stops: stops.map((s) => (s.id === id ? decided : s)), stop: decided }
}

// consumeStop(stops, id) → {stops, stop}   decided → consumed; throws otherwise.
function consumeStop(stops, id) {
  const stop = findStop(stops, id)
  if (stop.status !== 'decided') {
    throw new Error('stop "' + id + '": cannot consume a "' + stop.status + '" stop — only a decided stop is ready for the driver to consume')
  }
  const consumed = Object.assign({}, stop, { status: 'consumed' })
  return { stops: stops.map((s) => (s.id === id ? consumed : s)), stop: consumed }
}

// pending(stops) → {open:[…], decided:[…]}   non-superseded, non-consumed, each newest first.
function pending(stops) {
  const byRecency = (a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0)
  const open = (stops || []).filter((s) => s.status === 'open').sort(byRecency)
  const decided = (stops || []).filter((s) => s.status === 'decided').sort(byRecency)
  return { open, decided }
}

module.exports = {
  readPicks, writePicks, validatePicks, openStop, decideStop, consumeStop, pending,
}
