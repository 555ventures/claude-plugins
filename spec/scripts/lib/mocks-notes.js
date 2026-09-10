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
// setStatus, before calling answerQuestion here — mocks-driver.js's `notes waive` does the same
// for a waived question's row), parse seed.md itself (groupOpen takes the caller's already-parsed
// {journey -> {labels}} map), or enforce D5's mark-gate rule — unresolvedFor is the primitive
// the gate is built from; the refusal message and exit code live in mocks-driver.js.
//
// specs/20260907/10-client-review.md D3: a note's `origin` (walk|client|session) is decided by
// the route it arrived on, never by a typed name — ORIGINS/originOf are the shared enum/default;
// addNote stamps `origin` from `input.origin` when the caller gives one (design-atlas.js's client
// route passes "client" explicitly), else by originOf's own rule. D8: waiveNote is the one writer
// of a note's `waived` field and the sole non-page closure of a client-origin note or a question —
// the seven-day silence clock and the day-count/first-accepted-date refusal text are the caller's
// (mocks-driver.js `notes waive`) job to assemble from `lastClientAt`/`status.client.openedAt`;
// this function only measures elapsed time against the `lastClientAt` it is handed. D11: writeNotes
// is now a tmp-file rename (no lock file — two writers by design, Rationale) instead of a direct
// overwrite, so a reader (the served page) never observes a torn file mid-write.
//
// Exit codes: none — this is a library, not an executable.

const fs = require('fs')
const path = require('path')

// D3: absent = "session" (a legacy note carrying no origin field), except a walk-kind note which
// is always "walk" by construction — a client note is only ever "client" by an explicit stamp
// (never inferred), since nothing else on a note's own shape implies a client wrote it.
const ORIGINS = ['walk', 'client', 'session']
function originOf(n) {
  if (n && n.origin != null) return n.origin
  if (n && n.kind === 'walk') return 'walk'
  return 'session'
}

const SCOPES = ['mock', 'project']
const STATUSES = ['open', 'addressed', 'resolved']
const ID_RE = /^N\d+$/
const KINDS = ['note', 'question', 'walk']
// specs/20260906/06-sketch-high-fidelity-and-critique.md D4: the enum gains the four fixed
// critique blind spots (error-prevention, error-recovery, help, efficiency) alongside the
// original client-message reasons — one enum shared by a critic finding and a client message,
// which differ only in `by` and `reason`. PLAIN_REASONS is that eight-item set, kept separate
// from REASONS below because specs/20260907/08-walk-critic.md D3 requires a plain note's
// optional `reason` to reject a walk reason even though REASONS (the merged export) contains it —
// the four blind-spot reasons stay in PLAIN_REASONS/REASONS unproduced (their critic pass is
// retired by that same spec) purely so an existing host's notes.json keeps validating.
const PLAIN_REASONS = ['missing-screen', 'wrong-direction', 'wrong-words', 'other', 'error-prevention', 'error-recovery', 'help', 'efficiency']
// specs/20260907/08-walk-critic.md D3: the six flow breaks a walk finding may cite — no other
// reason is ever valid on a `kind: "walk"` note, and no plain note may cite one of these either.
const WALK_REASONS = ['no-path-back', 'no-path-forward', 'dead-end-state', 'missing-data', 'ambiguous-control', 'unrecoverable-error']
const REASONS = PLAIN_REASONS.concat(WALK_REASONS)
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

// D11: a tmp file in the same directory, then renameSync over the final path — atomic on one
// filesystem, so a reader (the served page's own GET /__notes/list) never sees a torn write. No
// lock file: the remaining read-modify-write race between the driver and the server is a
// millisecond window, accepted (spec Rationale "Two writers, no lock").
function writeNotes(root, notes) {
  const p = notesPath(root)
  const dir = path.dirname(p)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, 'notes.json.tmp-' + process.pid)
  fs.writeFileSync(tmp, JSON.stringify(notes, null, 2) + '\n')
  fs.renameSync(tmp, p)
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
    // specs/20260907/08-walk-critic.md D3: validation now splits three ways by kind — a question
    // (ledgerId required, no reason), a walk finding (scope "mock", a non-empty state, a reason
    // from WALK_REASONS), or a plain note (an optional reason drawn from PLAIN_REASONS only — a
    // walk reason on a plain note is an error, never silently accepted via the merged REASONS set).
    const isQuestion = n.kind === 'question'
    const isWalk = n.kind === 'walk'
    if (n.kind != null && !KINDS.includes(n.kind)) {
      errors.push('note "' + label + '": kind must be one of ' + KINDS.join('|') + ' (field "kind")')
    } else if (isQuestion) {
      if (typeof n.ledgerId !== 'string' || !LEDGER_ID_RE.test(n.ledgerId)) {
        errors.push('note "' + label + '": a question requires a ledgerId matching ^[A-Z]+\\d+[a-z]?$ (field "ledgerId")')
      }
      if (n.reason != null) {
        errors.push('note "' + label + '": reason is not allowed on a question (field "reason")')
      }
    } else if (isWalk) {
      if (n.scope !== 'mock') {
        errors.push('note "' + label + '": a walk finding requires scope "mock" (field "scope")')
      }
      if (n.state == null || n.state === '') {
        errors.push('note "' + label + '": a walk finding requires a non-empty state (field "state")')
      }
      if (!WALK_REASONS.includes(n.reason)) {
        errors.push('note "' + label + '": reason must be one of ' + WALK_REASONS.join('|') + ' (field "reason")')
      }
    } else if (n.reason != null && !PLAIN_REASONS.includes(n.reason)) {
      errors.push('note "' + label + '": reason must be one of ' + PLAIN_REASONS.join('|') + ' (field "reason")')
    }
    if (n.answer != null) {
      // specs/20260907/10-client-review.md D8: the verdict enum gains "waived" — a waived
      // question keeps its answer non-null (every existing "unanswered" derivation closes with
      // no edit), and like "no" it requires non-empty text (the waiver's reason).
      if (!['yes', 'no', 'waived'].includes(n.answer.verdict)) {
        errors.push('note "' + label + '": answer.verdict must be "yes", "no" or "waived" (field "answer")')
      } else if ((n.answer.verdict === 'no' || n.answer.verdict === 'waived') && !String(n.answer.text || '').trim()) {
        errors.push('note "' + label + '": a "' + n.answer.verdict + '" answer requires non-empty text (field "answer")')
      }
    }
    // D3: origin is additive and optional (absent = legacy, resolved by originOf()) — the only
    // new validation is that a PRESENT value must be one of the enum.
    if (n.origin != null && !ORIGINS.includes(n.origin)) {
      errors.push('note "' + label + '": origin must be one of ' + ORIGINS.join('|') + ' (field "origin")')
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
  const isWalk = body.kind === 'walk'
  if (isQuestion) {
    if (typeof body.ledgerId !== 'string' || !LEDGER_ID_RE.test(body.ledgerId)) problems.push('a question requires a valid ledgerId')
  } else if (isWalk) {
    // specs/20260907/08-walk-critic.md D3/D4: mocks-driver.js's `notes add` already checks the
    // screen/state pair against disk before ever calling this — the state-non-empty check here is
    // this library's own floor, never a second copy of that disk check.
    if (body.scope !== 'mock') problems.push('a walk finding requires scope "mock"')
    if (!String(body.state || '').trim()) problems.push('a walk finding requires a non-empty state')
    if (!WALK_REASONS.includes(body.reason)) problems.push('reason must be one of ' + WALK_REASONS.join('|'))
  } else if (body.reason != null && !PLAIN_REASONS.includes(body.reason)) {
    problems.push('reason must be one of ' + PLAIN_REASONS.join('|'))
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
  } else if (isWalk) {
    note.kind = 'walk'
    note.reason = body.reason
  } else if (body.reason != null) {
    note.reason = body.reason
  }
  // D3: origin from the caller when given (design-atlas.js's client route always passes
  // "client" explicitly), else originOf's own rule — a walk-kind note is "walk" by construction,
  // everything else (including a question) defaults "session".
  note.origin = body.origin != null ? body.origin : originOf(note)
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
// specs/20260907/10-client-review.md D4: `opts.viaClient` (design-atlas.js's client-route
// /__notes/resolve only) derives `resolution` from the note's prior status — "withdrawn" from
// "open", "accepted" from "addressed" — and stamps `lastClientAt`; the non-client route (the
// existing caller) omits opts and leaves both fields untouched.
function resolveNote(notes, id, by, opts) {
  const { next, found } = cloneFind(notes, id)
  if (found.kind === 'question') throw new Error('question "' + id + '" is answered, never resolved')
  const o = opts || {}
  const priorStatus = found.status
  found.status = 'resolved'
  found.resolvedBy = by || 'session'
  found.resolvedAt = new Date().toISOString()
  if (o.viaClient) {
    found.resolution = priorStatus === 'addressed' ? 'accepted' : 'withdrawn'
    found.lastClientAt = found.resolvedAt
  }
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
// specs/20260907/10-client-review.md D7: `opts.capture` ({hash, file}, given only by the driver's
// own client-origin mock-scope re-capture path) stores the after-image and stamps `lastClientAt`;
// every other caller (session-origin or walk note, `--port` omitted) leaves the note with no
// `capture` field at all — CONTINUE-TO byte-identical, AC-20260907-10-22.
function addressNote(notes, id, opts) {
  const { next, found } = cloneFind(notes, id)
  const o = opts || {}
  found.status = 'addressed'
  found.addressed = { at: new Date().toISOString(), change: o.change || '', ledgerRow: o.ledgerRow || null }
  if (o.capture) {
    found.capture = Object.assign({}, found.capture, { after: o.capture })
    found.lastClientAt = found.addressed.at
  }
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
// (open or addressed both count — only `resolved` clears a gate). specs/20260906/03 s0 fix: a
// question's "unresolved" is `answer == null`, never `status`'s "resolved" word — the session's
// own follow-up (`notes address` after a "no" answer) sets a question's status to "addressed" to
// record the redraw, and that must never flip an already-answered question back to unanswered.
function unresolvedFor(notes, labels) {
  const set = new Set(labels || [])
  return (notes || []).filter((n) => n.scope === 'mock' && set.has(n.screen) &&
    (n.kind === 'question' ? n.answer == null : n.status !== 'resolved'))
}

const DAY_MS = 86400000

// D8's `notes waive` primitive — the caller (mocks-driver.js) refuses a note that is neither
// client-origin nor a question and one already resolved BEFORE ever calling this; this function's
// own job is the seven-day silence clock alone. `opts.lastClientAt` is the silence clock's start
// — the caller derives it (a client note's own `lastClientAt`, or a question's later of `at` and
// `status.client.openedAt`) and hands it in explicitly; `found.lastClientAt` is the fallback for a
// direct library caller (this file's own tests) that omits it. `opts.now` accepts a Date or an
// ISO string, defaulting to the real clock.
function waiveNote(notes, id, opts) {
  const { next, found } = cloneFind(notes, id)
  const o = opts || {}
  const now = o.now instanceof Date ? o.now : new Date(o.now || Date.now())
  const silenceSince = o.lastClientAt != null ? o.lastClientAt : found.lastClientAt
  const since = new Date(silenceSince)
  const elapsedDays = Math.floor((now.getTime() - since.getTime()) / DAY_MS)
  if (elapsedDays < 7) {
    const firstOk = new Date(since.getTime() + 7 * DAY_MS).toISOString().slice(0, 10)
    throw new Error('note "' + id + '" has been silent ' + elapsedDays + ' day(s) — a waiver needs 7; first accepted on ' + firstOk)
  }
  const at = now.toISOString()
  found.status = 'resolved'
  found.resolvedBy = 'waiver'
  found.resolvedAt = at
  found.waived = { at, reason: o.reason, by: o.by || 'session' }
  if (found.kind === 'question') {
    found.answer = { verdict: 'waived', text: o.reason, by: o.by || 'session', at }
  }
  return { notes: next, note: found }
}

module.exports = {
  readNotes, writeNotes, validateNotes, addNote, resolveNote, answerQuestion, addressNote, replyNote,
  groupOpen, unresolvedFor, WALK_REASONS, ORIGINS, originOf, waiveNote,
}
