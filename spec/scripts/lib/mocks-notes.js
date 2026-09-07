'use strict'
// lib/mocks-notes.js — the one validated reader/writer for design/mocks/notes.json plus the
// pure note-array transforms every caller (design-atlas.js's serve endpoints, mocks-driver.js's
// `notes` subcommands and mark gates) shares. specs/20260902/10-page-notes-review-loop.md D1/D4,
// AC-20260902-10-1/-5/-6/-10. specs/20260906/03-questions-on-the-wireframe.md D1, AC-20260906-03-1:
// a note gains optional `kind: "note"|"question"` (absent = "note"), optional `reason` (notes
// only), and for questions `ledgerId` + `answer`; answerQuestion is the one writer of `answer`.
//
// Ids are "N001"-style, assigned by addNote — never handed in by a caller. resolveNote exists
// for the HTTP layer only (D2: the served page's Resolve button is the sole caller); the driver
// never calls it — D4 deliberately has no `notes resolve` subcommand, so the caller-side refusal
// (exit 2, naming the page) lives in mocks-driver.js, not here. resolveNote refuses a question
// outright (D1: "answered, never resolved") — a question is resolved only by answerQuestion,
// called from design-atlas.js's POST /__notes/answer.
//
// Does NOT: touch design/mocks/status.json or design/mocks/ledger.md (design-atlas.js's
// /__notes/answer is the one caller that rewrites the ledger, via lib/mocks-ledger.js's
// setStatus, before calling answerQuestion here), parse seed.md itself (groupOpen takes the
// caller's already-parsed {journey -> {labels}} map), or enforce D5's mark-gate rule —
// unresolvedFor is the primitive the gate is built from; the refusal message and exit code live
// in mocks-driver.js.
//
// Exit codes: none — this is a library, not an executable.

const fs = require('fs')
const path = require('path')

const SCOPES = ['mock', 'project']
const STATUSES = ['open', 'addressed', 'resolved']
const ID_RE = /^N\d+$/
const KINDS = ['note', 'question']
const REASONS = ['missing-screen', 'wrong-direction', 'wrong-words', 'other']
const LEDGER_ID_RE = /^[A-Z]+\d+[a-z]?$/

function notesPath(root) { return path.join(root, 'design/mocks/notes.json') }

// [] on a cold root — a project with no notes yet is a valid starting point, same posture as
// mocks-driver.js's own loadStatus() first-run behavior.
function readNotes(root) {
  let raw
  try {
    raw = fs.readFileSync(notesPath(root), 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }
  return JSON.parse(raw)
}

function writeNotes(root, notes) {
  const p = notesPath(root)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(notes, null, 2) + '\n')
}

// D1: one error string per problem, each naming the offending note's id (or its array index
// when the id itself does not parse) and the failing field — id shape, scope enum, a mock-scope
// note with no screen, status enum, and a duplicate id across the array.
function validateNotes(notes) {
  const errors = []
  const seen = new Set()
  const list = Array.isArray(notes) ? notes : []
  for (let i = 0; i < list.length; i++) {
    const n = list[i] || {}
    const label = n.id != null ? n.id : '#' + i
    if (typeof n.id !== 'string' || !ID_RE.test(n.id)) {
      errors.push('note "' + label + '": id must match ^N\\d+$ (field "id")')
    } else if (seen.has(n.id)) {
      errors.push('note "' + n.id + '": duplicate id (field "id")')
    } else {
      seen.add(n.id)
    }
    if (!SCOPES.includes(n.scope)) {
      errors.push('note "' + label + '": scope must be one of ' + SCOPES.join('|') + ' (field "scope")')
    } else if (n.scope === 'mock' && (n.screen == null || n.screen === '')) {
      errors.push('note "' + label + '": scope "mock" requires a non-null screen (field "screen")')
    }
    if (!STATUSES.includes(n.status)) {
      errors.push('note "' + label + '": status must be one of ' + STATUSES.join('|') + ' (field "status")')
    }
    // D1: kind/reason/ledgerId/answer — additive to the shape above, never a stricter version of it.
    const isQuestion = n.kind === 'question'
    if (n.kind != null && !KINDS.includes(n.kind)) {
      errors.push('note "' + label + '": kind must be one of ' + KINDS.join('|') + ' (field "kind")')
    } else if (isQuestion) {
      if (typeof n.ledgerId !== 'string' || !LEDGER_ID_RE.test(n.ledgerId)) {
        errors.push('note "' + label + '": a question requires a ledgerId matching ^[A-Z]+\\d+[a-z]?$ (field "ledgerId")')
      }
      if (n.reason != null) {
        errors.push('note "' + label + '": reason is not allowed on a question (field "reason")')
      }
    } else if (n.reason != null && !REASONS.includes(n.reason)) {
      errors.push('note "' + label + '": reason must be one of ' + REASONS.join('|') + ' (field "reason")')
    }
    if (n.answer != null) {
      if (!['yes', 'no'].includes(n.answer.verdict)) {
        errors.push('note "' + label + '": answer.verdict must be "yes" or "no" (field "answer")')
      } else if (n.answer.verdict === 'no' && !String(n.answer.text || '').trim()) {
        errors.push('note "' + label + '": a "no" answer requires non-empty text (field "answer")')
      }
    }
  }
  return { errors }
}

function nextId(notes) {
  let max = 0
  for (const n of notes) {
    const m = /^N(\d+)$/.exec(n && n.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return 'N' + String(max + 1).padStart(3, '0')
}

// D2's POST /__notes/add — assigns id/at/status; refuses (throws) a body missing text/by, an
// unrecognized scope, or a mock-scope body with no screen. specs/20260906/03 D1: also accepts
// `kind: "question"` (with a required `ledgerId`) or a plain note's optional `reason` — the HTTP
// layer (design-atlas.js) refuses a client body carrying kind/ledgerId before ever reaching here
// (D3: "questions are session-authored"); this function itself has no opinion on the caller —
// mocks-driver.js's `ledger add --screen`/`ledger ask` call it directly with kind:"question".
// Never mutates the input array.
function addNote(notes, input) {
  const problems = []
  const body = input || {}
  if (!String(body.text || '').trim()) problems.push('text must be non-empty')
  if (!String(body.by || '').trim()) problems.push('by must be non-empty')
  if (!SCOPES.includes(body.scope)) problems.push('scope must be one of ' + SCOPES.join('|'))
  else if (body.scope === 'mock' && !body.screen) problems.push('scope "mock" requires a screen')
  const isQuestion = body.kind === 'question'
  if (isQuestion) {
    if (typeof body.ledgerId !== 'string' || !LEDGER_ID_RE.test(body.ledgerId)) problems.push('a question requires a valid ledgerId')
  } else if (body.reason != null && !REASONS.includes(body.reason)) {
    problems.push('reason must be one of ' + REASONS.join('|'))
  }
  if (problems.length) throw new Error(problems.join('; '))

  const note = {
    id: nextId(notes),
    scope: body.scope,
    screen: body.scope === 'mock' ? body.screen : null,
    state: body.scope === 'mock' ? (body.state || null) : null,
    text: String(body.text).trim(),
    by: String(body.by).trim(),
    at: new Date().toISOString(),
    status: 'open',
    addressed: null,
    reply: null,
    resolvedBy: null,
    resolvedAt: null,
  }
  if (isQuestion) {
    note.kind = 'question'
    note.ledgerId = body.ledgerId
    note.answer = null
  } else if (body.reason != null) {
    note.reason = body.reason
  }
  return { notes: notes.concat([note]), note }
}

function cloneFind(notes, id) {
  const next = notes.map((n) => Object.assign({}, n))
  const found = next.find((n) => n.id === id)
  if (!found) throw new Error('no note with id "' + id + '"')
  return { next, found }
}

// D2's POST /__notes/resolve — the page's Resolve button is the only caller; mocks-driver.js
// never calls this (D4: no `notes resolve` subcommand exists). specs/20260906/03 D1: a question
// is never resolved this way — it throws, naming the only path that closes a question.
function resolveNote(notes, id, by) {
  const { next, found } = cloneFind(notes, id)
  if (found.kind === 'question') throw new Error('question "' + id + '" is answered, never resolved')
  found.status = 'resolved'
  found.resolvedBy = by || 'session'
  found.resolvedAt = new Date().toISOString()
  return { notes: next, note: found }
}

// specs/20260906/03-questions-on-the-wireframe.md D1/D3: the one writer of `answer` — called by
// design-atlas.js's POST /__notes/answer AFTER it has already rewritten the ledger row's status
// (setStatus), so a crash between the two writes leaves an answered row with a still-open note
// (a harmless re-ask), never a resolved note over an open row. Sets status "resolved" directly —
// an answered question is never "addressed", only ever open or resolved.
function answerQuestion(notes, id, opts) {
  const { next, found } = cloneFind(notes, id)
  const o = opts || {}
  found.answer = { verdict: o.verdict, text: o.text || '', by: o.by || 'session', at: new Date().toISOString() }
  found.status = 'resolved'
  found.resolvedBy = o.by || 'session'
  found.resolvedAt = found.answer.at
  return { notes: next, note: found }
}

// D4's `notes address --id --change [--ledger]` — driver-only file write.
function addressNote(notes, id, opts) {
  const { next, found } = cloneFind(notes, id)
  const o = opts || {}
  found.status = 'addressed'
  found.addressed = { at: new Date().toISOString(), change: o.change || '', ledgerRow: o.ledgerRow || null }
  return { notes: next, note: found }
}

// D4's `notes reply --id --text` — status is left unchanged (Contracts: "reply never changes status").
function replyNote(notes, id, text) {
  const { next, found } = cloneFind(notes, id)
  found.reply = text
  return { notes: next, note: found }
}

// D4's `notes open` grouping primitive: project scope first, then mock-scope notes grouped
// journey -> screen -> state via the caller-supplied {journey -> {labels}} map (mocks-driver.js's
// own seed.md parse — this module never reads seed.md itself). A screen no journey declares
// groups under "unassigned". Only non-resolved notes are grouped (open and addressed both stay
// visible until the author resolves them from the page).
function groupOpen(notes, seed) {
  const labelToJourney = new Map()
  if (seed) {
    for (const [journeyName, j] of seed) {
      for (const label of (j && j.labels) || []) labelToJourney.set(label, journeyName)
    }
  }
  const notResolved = (notes || []).filter((n) => n.status !== 'resolved')
  const project = notResolved.filter((n) => n.scope === 'project')
  const mock = notResolved.filter((n) => n.scope === 'mock')

  const journeys = new Map() // journeyName -> Map(screen -> Map(state -> notes[]))
  for (const n of mock) {
    const journeyName = labelToJourney.get(n.screen) || 'unassigned'
    if (!journeys.has(journeyName)) journeys.set(journeyName, new Map())
    const screens = journeys.get(journeyName)
    if (!screens.has(n.screen)) screens.set(n.screen, new Map())
    const states = screens.get(n.screen)
    const stateKey = n.state || 'default'
    if (!states.has(stateKey)) states.set(stateKey, [])
    states.get(stateKey).push(n)
  }
  return { project, journeys }
}

// D5's mark-gate primitive: mock-scope notes anchored to any of `labels` that are not resolved
// (open or addressed both count — only `resolved` clears a gate).
function unresolvedFor(notes, labels) {
  const set = new Set(labels || [])
  return (notes || []).filter((n) => n.scope === 'mock' && set.has(n.screen) && n.status !== 'resolved')
}

module.exports = {
  readNotes, writeNotes, validateNotes, addNote, resolveNote, answerQuestion, addressNote, replyNote,
  groupOpen, unresolvedFor,
}
