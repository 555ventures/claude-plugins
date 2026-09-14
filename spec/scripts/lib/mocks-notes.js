'use strict'
// lib/mocks-notes.js — the one validated reader/writer for design/mocks/notes.json plus the
// pure note-array transforms every caller (design-atlas.js's serve endpoints, mocks-driver.js's
// `notes` subcommands and mark gates) shares. specs/20260902/10-page-notes-review-loop.md D1/D4,
// AC-20260902-10-1/-5/-6/-10.
//
// specs/20260913/07-the-critic-is-out.md D5/D8: nothing in this pipeline stamps `kind:
// "question"` or `kind: "walk"` any more — a note is what a person typed. `authoredByPerson(n)`
// is the one predicate every reader now filters through; `kind: "note"` and an absent kind are
// both a person's note, and a legacy note of either retired kind stays on disk exactly as it is
// (readNotes/writeNotes never filter) but stops being listed, grouped, counted or gated on.
//
// Ids are "N001"-style, assigned by addNote — never handed in by a caller. resolveNote exists
// for the HTTP layer only (D2: the served page's Resolve button is the sole caller); the driver
// never calls it — D4 deliberately has no `notes resolve` subcommand, so the caller-side refusal
// (exit 2, naming the page) lives in mocks-driver.js, not here. resolveNote keeps refusing a
// legacy question by id outright — it was never resolved this way even while its producer lived,
// and the producer is gone now.
//
// Does NOT: touch design/mocks/status.json or design/mocks/ledger.md (mocks-driver.js's
// `notes waive` is the one caller that rewrites a waived legacy question's ledger row), parse
// seed.md itself (groupOpen takes the caller's already-parsed {journey -> {labels}} map), or
// enforce D5's mark-gate rule — unresolvedFor is the primitive the gate is built from; the
// refusal message and exit code live in mocks-driver.js.
//
// specs/20260912/11-a-note-can-mark-an-area.md D2/D3: `region` is an optional, validated field on
// a mock-scope note only — regionShapeErrors is the one shared shape check addNote (throws, no
// "note …:" prefix) and validateNotes (one "note …:" prefixed error per problem) both call;
// replaceRegion/deleteNote are the two new primitives D3's served /__notes/region and
// /__notes/delete routes call, each enforcing its own precondition before ever touching the note.
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

// D3: absent = "session" (a legacy note carrying no origin field) — a client note is only ever
// "client" by an explicit stamp (never inferred), since nothing else on a note's own shape
// implies a client wrote it. 'walk' stays a legal value only because a pre-retirement note on
// disk may still carry it; nothing produces it any more.
const ORIGINS = ['walk', 'client', 'session']   // 'walk' is legacy-accept only; nothing produces it
function originOf(n) {
  if (n && n.origin != null) return n.origin
  return 'session'
}

// specs/20260913/07-the-critic-is-out.md D8: a note a person did not type is one a retired
// producer stamped with a kind. `kind: "note"` and an absent kind are both a person's note. The
// predicate is the one rule; the note itself is never filtered out of readNotes/writeNotes, so no
// read-modify-write path can erase a hidden note's history.
function authoredByPerson(n) { return n.kind !== 'question' && n.kind !== 'walk' }

const SCOPES = ['mock', 'project']
const STATUSES = ['open', 'addressed', 'resolved']
const ID_RE = /^N\d+$/
const KINDS = ['note', 'question', 'walk']      // 'question' and 'walk' are legacy-accept only
// specs/20260906/06-sketch-high-fidelity-and-critique.md D4: the enum gains the four fixed
// critique blind spots (error-prevention, error-recovery, help, efficiency) alongside the
// original client-message reasons — one enum shared by a critic finding and a client message,
// which differ only in `by` and `reason`. specs/20260913/07-the-critic-is-out.md D5: the
// producer that could cite a retired flow-break reason is gone, so REASONS collapses to this one
// set — no composer authors a reason outside it.
const PLAIN_REASONS = ['missing-screen', 'wrong-direction', 'wrong-words', 'other', 'error-prevention', 'error-recovery', 'help', 'efficiency']
const REASONS = PLAIN_REASONS                    // legacy retired-reason enum retired; no composer authors one outside PLAIN_REASONS
// specs/20260910/05-what-the-journey-does-not-do.md D3: the optional `reason` a client gives when
// withdrawing a note through the client route — stored as `withdrawReason`, validated here and by
// design-atlas.js's client `/__notes/resolve` route (which 400s a value outside this enum before
// ever calling resolveNote).
const WITHDRAW_REASONS = ['not-needed', 'fixed-elsewhere', 'mistake']

// specs/20260912/11-a-note-can-mark-an-area.md D2, Contracts: one bare message per shape problem
// (no "note …:" prefix, no "field" label omitted) — addNote joins these into its thrown Error;
// validateNotes prefixes each with 'note "<label>": '. A region missing entirely is never called
// with this function — both callers check `region != null` first.
const ARRANGEMENTS = ['single', 'row', 'col', 'grid']
function regionShapeErrors(region) {
  const errs = []
  if (!region || typeof region !== 'object') {
    return ['region must be an object (field "region")']
  }
  const anchor = region.anchor
  if (!anchor || !Array.isArray(anchor.path) || !anchor.path.every((n) => Number.isInteger(n) && n >= 0)) {
    errs.push('region.anchor.path must be an array of non-negative integers (field "region.anchor.path")')
  }
  const frac = region.frac
  const fracOk = !!frac && ['x', 'y', 'w', 'h'].every((k) => typeof frac[k] === 'number' && frac[k] >= 0 && frac[k] <= 1) &&
    frac.w > 0 && frac.h > 0
  if (!fracOk) errs.push('region.frac.{x,y,w,h} must be numbers in [0,1] with w,h > 0 (field "region.frac")')
  const layout = region.layout
  if (!layout || !ARRANGEMENTS.includes(layout.arrangement)) {
    errs.push('region.layout.arrangement must be one of ' + ARRANGEMENTS.join('|') + ' (field "region.layout.arrangement")')
  }
  const touched = region.touched
  const touchedOk = Array.isArray(touched) && touched.every((t) => t && Number.isInteger(t.i) && t.i >= 0 && typeof t.snippet === 'string')
  if (!touchedOk) errs.push('region.touched must be an array of {i:integer>=0, snippet:string} (field "region.touched")')
  const drawnAt = region.drawnAt
  if (!drawnAt || !Number.isInteger(drawnAt.w) || drawnAt.w <= 0) {
    errs.push('region.drawnAt.w must be a positive integer (field "region.drawnAt.w")')
  }
  return errs
}

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
    // D1: kind/reason — additive to the shape above, never a stricter version of it.
    // specs/20260913/07-the-critic-is-out.md D5: nothing produces a `kind: "question"` or
    // `kind: "walk"` note any more, so a note of either kind is accepted with whatever ledgerId,
    // answer or reason it already carries — no format check on a value nothing produces. Only a
    // plain note (kind "note" or absent) still has its optional `reason` checked, against
    // PLAIN_REASONS.
    const isLegacy = n.kind === 'question' || n.kind === 'walk'
    if (n.kind != null && !KINDS.includes(n.kind)) {
      errors.push('note "' + label + '": kind must be one of ' + KINDS.join('|') + ' (field "kind")')
    } else if (!isLegacy && n.reason != null && !PLAIN_REASONS.includes(n.reason)) {
      errors.push('note "' + label + '": reason must be one of ' + PLAIN_REASONS.join('|') + ' (field "reason")')
    }
    if (!isLegacy && n.answer != null) {
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
    // D3: additive and optional — a present value must be one of the enum.
    if (n.withdrawReason != null && !WITHDRAW_REASONS.includes(n.withdrawReason)) {
      errors.push('note "' + label + '": withdrawReason must be one of ' + WITHDRAW_REASONS.join('|') + ' (field "withdrawReason")')
    }
    // specs/20260911/06-the-client-loop.md D3: `thread` is additive/optional — a present value
    // must be an array (its own entries, {at, text, by, addressed}, are reopenNote's own shape,
    // never re-validated here — the client route is the only writer).
    if (n.thread != null && !Array.isArray(n.thread)) {
      errors.push('note "' + label + '": thread must be an array (field "thread")')
    }
    // specs/20260912/11-a-note-can-mark-an-area.md D2: region is additive/optional — a present
    // value is checked against scope first (a project-scope note may never carry one), then
    // against its own shape via the shared regionShapeErrors.
    if (n.region != null) {
      if (n.scope !== 'mock') {
        errors.push('note "' + label + '": region is allowed only on scope "mock" (field "region")')
      } else {
        for (const msg of regionShapeErrors(n.region)) errors.push('note "' + label + '": ' + msg)
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
// unrecognized scope, or a mock-scope body with no screen. specs/20260913/07-the-critic-is-out.md
// D5: `kind`/`ledgerId` are retired inputs — the caller (mocks-driver.js's `notes add`,
// design-atlas.js's POST /__notes/add) refuses a body naming either before this is ever called, so
// this function stamps every note it writes as a person's plain note, with `reason` (when given)
// checked against PLAIN_REASONS. Never mutates the input array.
function addNote(notes, input) {
  const problems = []
  const body = input || {}
  if (!String(body.text || '').trim()) problems.push('text must be non-empty')
  if (!String(body.by || '').trim()) problems.push('by must be non-empty')
  if (!SCOPES.includes(body.scope)) problems.push('scope must be one of ' + SCOPES.join('|'))
  else if (body.scope === 'mock' && !body.screen) problems.push('scope "mock" requires a screen')
  if (body.reason != null && !PLAIN_REASONS.includes(body.reason)) {
    problems.push('reason must be one of ' + PLAIN_REASONS.join('|'))
  }
  // specs/20260912/11-a-note-can-mark-an-area.md D2: region is accepted only on scope "mock" —
  // a project-scope body carrying one is refused by name, never silently dropped.
  if (body.region != null) {
    if (body.scope !== 'mock') problems.push('region is allowed only on scope "mock" (field "region")')
    else problems.push(...regionShapeErrors(body.region))
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
  if (body.reason != null) note.reason = body.reason
  // specs/20260912/11-a-note-can-mark-an-area.md D2: stored verbatim — the shape has already been
  // validated above, and only ever on a mock-scope body (the project-scope case already threw).
  if (body.scope === 'mock' && body.region != null) note.region = body.region
  // D3: origin from the caller when given (design-atlas.js's client route always passes
  // "client" explicitly), else originOf's own rule ("session" for every note this function writes).
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
// never calls this (D4: no `notes resolve` subcommand exists). specs/20260913/07-the-critic-is-out.md
// D6: a legacy note carrying `kind: "question"` was never written by a person and cannot be
// resolved through this route — it throws, naming why, whether or not its retired producer still
// exists.
// specs/20260907/10-client-review.md D4: `opts.viaClient` (design-atlas.js's client-route
// /__notes/resolve only) derives `resolution` from the note's prior status — "withdrawn" from
// "open", "accepted" from "addressed" — and stamps `lastClientAt`; the non-client route (the
// existing caller) omits opts and leaves both fields untouched.
// specs/20260910/05-what-the-journey-does-not-do.md D3: `opts.reason`, given only alongside
// `opts.viaClient`, is stored as `withdrawReason` on the note — the route validates it against
// WITHDRAW_REASONS before ever calling this (a 400, not a thrown error, so the enum check has
// only the one home); this function trusts an already-validated value.
function resolveNote(notes, id, by, opts) {
  const { next, found } = cloneFind(notes, id)
  if (found.kind === 'question') throw new Error('note "' + id + '" was not written by a person and cannot be resolved')
  const o = opts || {}
  const priorStatus = found.status
  found.status = 'resolved'
  found.resolvedBy = by || 'session'
  found.resolvedAt = new Date().toISOString()
  if (o.viaClient) {
    found.resolution = priorStatus === 'addressed' ? 'accepted' : 'withdrawn'
    found.lastClientAt = found.resolvedAt
    if (o.reason != null) found.withdrawReason = o.reason
  }
  return { notes: next, note: found }
}

// D4's `notes address --id --change [--ledger]` — driver-only file write.
// specs/20260907/10-client-review.md D7: `opts.capture` ({hash, file}, given only by the driver's
// own client-origin mock-scope re-capture path) stores the after-image and stamps `lastClientAt`;
// every other caller (session-origin or walk note, `--port` omitted) leaves the note with no
// `capture` field at all — CONTINUE-TO byte-identical, AC-20260907-10-22.
// specs/20260911/06-the-client-loop.md D3: `opts.screen`/`opts.journey`, given only when the
// caller (mocks-driver.js's `notes address --screen/--journey`) points a project-scope answer
// somewhere, are stored on `addressed` — the client index's "Done" line resolves its "See
// <journey>" link from these, never from the note's own (mock-scope-only) `screen` field.
function addressNote(notes, id, opts) {
  const { next, found } = cloneFind(notes, id)
  const o = opts || {}
  found.status = 'addressed'
  found.addressed = { at: new Date().toISOString(), change: o.change || '', ledgerRow: o.ledgerRow || null }
  if (o.screen != null) found.addressed.screen = o.screen
  if (o.journey != null) found.addressed.journey = o.journey
  if (o.capture) {
    found.capture = Object.assign({}, found.capture, { after: o.capture })
    found.lastClientAt = found.addressed.at
  }
  return { notes: next, note: found }
}

// specs/20260911/06-the-client-loop.md D2's POST /client/__notes/reopen — the client's own return
// leg on an already-addressed note: threads the prior `addressed` object (verbatim) plus the
// client's new text into `thread` (created when absent), nulls `addressed`, and sets status back
// to "open". design-atlas.js's client route checks origin/status/text preconditions BEFORE ever
// calling this — reopenNote itself performs the mutation only, no validation of its own.
// specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D5: the "put it back" arm reopens a
// resolved/withdrawn note the same way — the note must actually LEAVE "withdrawn" so
// lib/mocks-exclusions.js's `withdrawnNotNeededEntries` (which keys only on `resolution`/
// `withdrawReason`, never `status`) stops deriving a source from it; a status flip alone would
// leave the note reading `status: 'open'` with a stale `resolution: 'withdrawn'` forever, and the
// next `materialize` would neither retire the derived row nor ever let the source register again.
// Nulling both is a no-op for the pre-existing addressed-note arm (neither field is ever set on an
// addressed note in the first place).
function reopenNote(notes, id, opts) {
  const { next, found } = cloneFind(notes, id)
  const o = opts || {}
  const priorAddressed = found.addressed
  found.thread = (Array.isArray(found.thread) ? found.thread.slice() : []).concat([
    { at: new Date().toISOString(), text: o.text, by: o.by || 'client', addressed: priorAddressed },
  ])
  found.status = 'open'
  found.addressed = null
  found.resolution = null
  found.withdrawReason = null
  found.lastClientAt = new Date().toISOString()
  return { notes: next, note: found }
}

// specs/20260912/11-a-note-can-mark-an-area.md D3's POST /__notes/region — re-places an open or
// addressed note's box (a resolved note's box is history, never moved) and threads the re-place as
// a card-visible event. Throws 'no note with id "…"' (the route's own 404), the status precondition
// message (400), or a regionShapeErrors join (400) — never stores a malformed region.
function replaceRegion(notes, id, region, by) {
  const { next, found } = cloneFind(notes, id)
  if (found.status === 'resolved') {
    throw new Error('region can be re-placed only on an open or addressed note (status "resolved")')
  }
  const errs = regionShapeErrors(region)
  if (errs.length) throw new Error(errs.join('; '))
  found.region = region
  found.thread = (Array.isArray(found.thread) ? found.thread.slice() : []).concat([
    { at: new Date().toISOString(), text: 're-placed the box', by: by || 'session' },
  ])
  return { notes: next, note: found }
}

// specs/20260912/11-a-note-can-mark-an-area.md D3's POST /__notes/delete — narrow on purpose: a
// note anyone has replied to, or one already addressed, or one carrying a `kind` (a question or a
// walk finding) is history and is withdrawn, never erased. Throws 'no note with id "…"' (404) or
// the withdraw-remedy message (400).
function deleteNote(notes, id) {
  const { next, found } = cloneFind(notes, id)
  const threadEmpty = !Array.isArray(found.thread) || found.thread.length === 0
  if (found.status !== 'open' || found.kind != null || !threadEmpty) {
    throw new Error('only an open plain note nobody has replied to can be deleted — withdraw it instead')
  }
  return { notes: next.filter((n) => n.id !== id) }
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
// visible until the author resolves them from the page). specs/20260913/07-the-critic-is-out.md
// D8: a note a person did not type is never grouped, whatever its status.
function groupOpen(notes, seed) {
  const labelToJourney = new Map()
  if (seed) {
    for (const [journeyName, j] of seed) {
      for (const label of (j && j.labels) || []) labelToJourney.set(label, journeyName)
    }
  }
  const notResolved = (notes || []).filter((n) => n.status !== 'resolved' && authoredByPerson(n))
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
// (open or addressed both count — only `resolved` clears a gate). specs/20260913/07-the-critic-is-out.md
// D7/D8: no gate counts a note a person did not type, whatever its status — every note this
// function returns is judged by `status !== 'resolved'` alone now.
function unresolvedFor(notes, labels) {
  const set = new Set(labels || [])
  return (notes || []).filter((n) => n.scope === 'mock' && set.has(n.screen) &&
    authoredByPerson(n) && n.status !== 'resolved')
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
  // q240 (2026-09-13): `resolution` is what the client-facing surfaces read to say WHY a request
  // closed (lib/walk-page.js's `renderIndexRequest`) — a waiver that set only `waived` fell
  // through to the bare "Closed" a session-side resolve renders, so the one close the client
  // never asked for was the one close that explained itself least. 'withdrawn'/'accepted' stay
  // `resolveNote`'s alone; nothing keyed on those two (lib/mocks-exclusions.js's own derivation
  // included) sees a waiver as either.
  found.resolution = 'waived'
  found.waived = { at, reason: o.reason, by: o.by || 'session' }
  return { notes: next, note: found }
}

module.exports = {
  readNotes, writeNotes, validateNotes, addNote, resolveNote, addressNote, replyNote,
  reopenNote, groupOpen, unresolvedFor, ORIGINS, originOf, waiveNote, WITHDRAW_REASONS,
  replaceRegion, deleteNote, authoredByPerson,
}
