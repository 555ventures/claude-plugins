#!/usr/bin/env node
// mocks-driver.js [--root <dir>] [--state]
// mocks-driver.js --root <dir> --mark <mark> [--journey <j>] [--direction <k>] [--shape <k>]
// mocks-driver.js --root <dir> --reopen journey:<j>|shapes|theme
// mocks-driver.js --root <dir> ledger (add|set|catch|check|counts|ask) [flags]
// mocks-driver.js --root <dir> ledger add --id <i> --step <s> --kind <k> --claim <c> [--tag <t>]
//                              [--status <st>] [--rejected <r>] [--dependents <d>] [--note <n>]
//                              [--screen <label> [--state <s>]]
// mocks-driver.js --root <dir> ledger ask --id <rowId> --screen <label> [--state <s>]
// mocks-driver.js --root <dir> notes open
// mocks-driver.js --root <dir> notes address --id <id> --change "<what changed>" [--ledger <rowId>]
// mocks-driver.js --root <dir> notes reply --id <id> --text "<question back>"
// mocks-driver.js --root <dir> look <label> [--state <s>] [--out <png>] [--port <n>]
// mocks-driver.js --root <dir> look-probe | look-via <playwright|browser>
// mocks-driver.js --root <dir> stop open <step> [--port <n>]   shapes | journey:<j> | theme | signoff
// mocks-driver.js --root <dir> stop decide <P…> --verdict pick|approve|change [--pick <g>] [--note <n>] --by <who>
//
// WHY: specs/20260902/07-mocks-command-driver.md — `/spec:mocks` is the standalone design
// stage; this driver derives SEED -> SHAPES -> WIREFRAMES -> THEME -> SIGNOFF -> APPROVED on
// every invocation from `design/mocks/status.json` plus the artifacts actually on disk (a
// recorded mark whose artifact vanished is demanded again), prints exactly one step, gates every
// advancing mark on the provenance ledger (spec 06, lib/mocks-ledger.js), and checkpoints every
// accepted mark so a run survives any number of `/clear`s (the genesis driver's discipline
// verbatim — spec/scripts/genesis-driver.js). specs/20260906/02-mocks-ends-at-wireframes.md
// retires the SKIN and REVIEW states along with the `journey-skinned`, `review-opened`,
// `journey-reviewed` marks and the `--decider` flag: THEME composes each direction on the seed's
// dense screen (a second screen at most) and picks one; the terminal `approved` mark is the one
// sign-off — it stamps every top-level mock `data-status="approved"` itself and records the
// decider from the sign-off stop's own "by".
//
// specs/20260905/04-per-project-look-server.md D3: `stop open <step> [--port <n>]` derives the
// candidate set for the step's look from disk and delegates to design-atlas.js (sibling path,
// never spec-paths) `stop open`, printing only the verified link plus the fixed reply line;
// `stop decide` passes an id + verdict straight through to the same script (the chat channel for
// a decision, `--by chat`). There is no per-machine hub — each project serves its own look stops
// (specs/20260905/02's design-review-hub-and-look-stops.md D6-D8 established the delegation
// shape; spec 04 retargets it at design-atlas.js). The four gated marks (shape-picked,
// journey-approved, theme-picked, approved) read their verdict from the newest non-superseded
// look stop for the mark's key (lib/mocks-picks.js, spec 01) instead of trusting the session's
// own judgment — a session can never mark past a look. A pick mark's `--shape`/`--direction` flag
// is optional (the page's pick is the value); a given flag that disagrees with the pick refuses.
//
// specs/20260906/04-journey-review-page.md D6: `stop open journey:<j>` passes design-atlas.js's
// `stop open` a `--page /review/<j>.html` override, so the stop's url/probe target is that
// journey's own review page (http://localhost:<port>/review/<j>.html#stop-<id>) instead of the
// atlas index — every other step (shapes, theme, signoff) omits `--page` and keeps the atlas URL.
//
// specs/20260906/05-gray-states-on-every-wireframe.md D2: `journey-drawn` and `journey-approved`
// each run design-atlas.js's `check --states` over the journey's own top-level mocks (after the
// existing per-label closure checks at drawn; before the render gate at approved) and refuse the
// mark on any violation, naming the file, the missing/unknown state(s), and the redraw remedy. D3:
// the "draw journey <j>" step's printed Then: block carries the same states/data-no-state prompt.
//
// What this deliberately does NOT do:
//   - author the seed, canon, screens, theme directions, or the sign-off itself — those stay
//     session judgment; the driver only closes each mark once the artifact exists and validates
//     under D2-D10's closure checks.
//   - judge taste — every check is a closure on an artifact (a heading, a label, a linked
//     stylesheet, a status attribute, a ledger row), never an opinion on which screen is right.
//   - relocate the session CWD, delete a file on `--reopen` (D11 — marks are cleared, disk is
//     never touched), or run the look probe / write status.json beyond first-run creation on a
//     `--state` peek (a read-only derivation).
//   - hand-write a ledger row: `ledger add/set/catch` are the only writers of
//     design/mocks/ledger.md, routed through spec/scripts/lib/mocks-ledger.js exactly as spec 06
//     built it.
//   - resolve a note (specs/20260902/10-page-notes-review-loop.md D4): `notes address` and
//     `notes reply` are the only note writers this driver exposes; there is no `notes resolve`
//     subcommand — resolving happens only from the served page (the Resolve button, POST
//     /__notes/resolve), so a `notes resolve` invocation refuses (exit 2) naming the page.
//   - migrate a legacy status.json: a root checkpointed at SKIN or REVIEW derives THEME or
//     SIGNOFF from its still-live marks on the very next invocation; the retired fields it still
//     carries are ignored on read and dropped on the next write — there is nothing to migrate.
//   - answer a question (specs/20260906/03-questions-on-the-wireframe.md D2-D4): `ledger add
//     --screen`/`ledger ask` only PIN an assumption row to a screen as a question note; the page
//     is the only place a question is answered (POST /__notes/answer on design-atlas.js), which
//     is also the one writer of the ledger row's confirmed/overridden status for a question — this
//     driver never writes that transition itself.
//
// Deviation (specs/20260902/07-mocks-command-driver.deviations.md): D8 names "theme-directions"
// and "theme" product ledger rows without pinning their identification shape (ledger ids are
// `^[A-Z]+\d+[a-z]?$`, so neither can literally be the id). This driver identifies them by a
// confirmed said-by-user product row whose `claim` cell is exactly `theme-directions: <kebab>` /
// `theme: <kebab>` — the same shape is reused for the SHAPES stage's `shape: <kebab>` row.
//
// Exit codes:
//   0  a bare invocation printed the current step (or `--state` printed the state name), an
//      accepted `--mark` recorded its result and printed the checkpoint line, a `--reopen`
//      printed what it invalidated, a ledger/look subcommand succeeded, `stop open` printed the
//      link + reply line, or `stop decide` recorded a decision.
//   1  `ledger check` found a blocked gate (rows printed).
//   2  a refused mark (an unknown mark or the retired `--decider` flag included), a failed
//      precondition (missing artifact, blocked gate, unreachable look probe, undeclared/undrawn
//      journey for `stop open`, a `look --state` value the mock does not declare), a usage error,
//      `ledger check` grammar errors, or a dead child process (runChild's fail-closed refusal).
//   3  `stop open`/`stop decide` failed inside design-atlas.js itself (its own stderr forwarded).

'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { runChild, writeOut } = require('./lib/driver-io')
const { parseLedger, gateVerdict, countsLine, appendAssumption, appendCatch, setStatus } = require('./lib/mocks-ledger')
const { readNotes, writeNotes, addNote, addressNote, replyNote, groupOpen, unresolvedFor } = require('./lib/mocks-notes')
const picksLib = require('./lib/mocks-picks.js')

function die(msg) { writeOut(2, 'mocks-driver: ' + msg + '\n'); process.exit(2) }
function nowIso() { return new Date().toISOString() }

// ---------------------------------------------------------------------------
// Arg parsing — hand-rolled, no library.
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
function flagArg(arr, name) { const i = arr.indexOf(name); return i > -1 ? arr[i + 1] : null }
function withoutFlagPair(arr, name) {
  const i = arr.indexOf(name)
  if (i === -1) return arr.slice()
  const copy = arr.slice()
  copy.splice(i, 2)
  return copy
}

const root = path.resolve(flagArg(argv, '--root') || process.cwd())
const rest = withoutFlagPair(argv, '--root')

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  die('--root ' + root + ' is not a directory — pass a real project root, or omit --root to use the current directory')
}

const mocksDir = path.join(root, 'design/mocks')
const statusPath = path.join(mocksDir, 'status.json')
const ledgerPath = path.join(mocksDir, 'ledger.md')
const seedPath = path.join(mocksDir, 'seed.md')
const designAtlasBin = path.join(__dirname, 'design-atlas.js')
const templatesDir = path.join(__dirname, '..', 'templates')

const FACT_KEYS = [
  'primary-surface', 'platforms-horizon', 'tenancy', 'offline', 'realtime', 'ai-in-loop',
  'residency', 'payer', 'day-one-integrations', 'scale-outage', 'vendor-limits', 'retention',
  'legal-floor',
]

// ---------------------------------------------------------------------------
// status.json (schemaVersion 1) — created fresh on a cold root; `state` is re-derived and
// re-stamped on every save, never trusted from a prior write alone.
// ---------------------------------------------------------------------------
function freshStatus() {
  return {
    schemaVersion: 1, state: 'SEED',
    marks: { seedDone: null, shapePicked: null, canonWritten: null, themePicked: null, approved: null },
    shape: null, theme: null, decider: null, look: 'playwright',
    journeys: {}, directions: {}, reopens: [], lastUpdated: null,
  }
}

// D1: a status.json written by a pre-20260906/02 driver may still carry `marks.reviewOpened` and
// `journeys[j].skinned`/`.reviewed` (the retired SKIN/REVIEW marks) — these are read and then
// discarded in memory so state derivation never sees them and the next save never writes them
// back; `decider` stays a live top-level field (the terminal `approved` mark still sets it from
// the sign-off stop's own "by"), so it is never stripped.
function dropLegacyFields(merged) {
  delete merged.marks.reviewOpened
  for (const j of Object.keys(merged.journeys)) {
    delete merged.journeys[j].skinned
    delete merged.journeys[j].reviewed
  }
  return merged
}

function loadStatus() {
  if (!fs.existsSync(statusPath)) {
    fs.mkdirSync(mocksDir, { recursive: true })
    if (!fs.existsSync(ledgerPath)) fs.copyFileSync(path.join(templatesDir, 'mocks-ledger.md'), ledgerPath)
    if (!fs.existsSync(seedPath)) fs.copyFileSync(path.join(templatesDir, 'mocks-seed.md'), seedPath)
    const f = freshStatus()
    fs.writeFileSync(statusPath, JSON.stringify(f, null, 2) + '\n')
    return f
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
  } catch (e) {
    die('design/mocks/status.json is not valid JSON (' + e.message + ') — restore it from git history, or delete it (a fresh root is a valid starting point) and re-run')
    return null // unreachable
  }
  const merged = Object.assign(freshStatus(), raw)
  merged.marks = Object.assign({}, freshStatus().marks, raw.marks || {})
  merged.journeys = Object.assign({}, raw.journeys || {})
  merged.directions = Object.assign({}, raw.directions || {})
  merged.reopens = Array.isArray(raw.reopens) ? raw.reopens : []
  return dropLegacyFields(merged)
}

function saveStatus() {
  status.schemaVersion = 1
  status.state = deriveState()
  status.lastUpdated = nowIso()
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n')
}

let status = loadStatus()

// ---------------------------------------------------------------------------
// seed.md parsing (D3/D4) — HTML-comment stripped once; sections read by `## ` boundary;
// journeys are read as `### <kebab>` blocks ANYWHERE in the file (not confined to the
// `## Journeys` slice), so a journey block accidentally placed after another `## ` heading is
// still found and its labels still collide-checked, rather than silently ignored.
// ---------------------------------------------------------------------------
function stripComments(t) { return String(t).replace(/<!--[\s\S]*?-->/g, '') }

function sectionOf(text, name) {
  const re = new RegExp('^## ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')
  const m = re.exec(text)
  if (!m) return null
  const rest2 = text.slice(m.index + m[0].length)
  const next = rest2.search(/^## /m)
  return next === -1 ? rest2 : rest2.slice(0, next)
}

function parseFacts(text) {
  const sec = sectionOf(text, 'Facts') || ''
  const map = {}
  for (const raw of sec.split('\n')) {
    const line = raw.trim()
    const m = line.match(/^- ([a-z0-9-]+):\s*(\S+)/)
    if (m) map[m[1]] = m[2]
  }
  return map
}

function parseJourneysSeed(fullText) {
  const journeys = new Map()
  const starts = []
  const re = /^### ([a-z0-9-]+)\s*$/gm
  let m
  while ((m = re.exec(fullText))) starts.push({ name: m[1], index: m.index, headerEnd: m.index + m[0].length })
  for (let i = 0; i < starts.length; i++) {
    const body = fullText.slice(starts[i].headerEnd, i + 1 < starts.length ? starts[i + 1].index : fullText.length)
    const lines = body.split('\n')
    let persona = ''
    for (const l of lines) { if (l.trim()) { persona = l.trim(); break } }
    const surfMatch = body.match(/```surfaces\n([\s\S]*?)```/)
    const labels = []
    if (surfMatch) {
      for (const raw of surfMatch[1].split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const edge = line.split('->').map((s) => s.trim())
        if (edge.length === 2 && edge[0] && edge[1]) {
          for (const l of edge) if (!labels.includes(l)) labels.push(l)
        } else if (/^[\w][\w-]*$/.test(line) && !labels.includes(line)) {
          labels.push(line)
        }
      }
    }
    journeys.set(starts[i].name, { persona, labels })
  }
  return journeys
}

function parseDenseScreen(text) {
  const sec = sectionOf(text, 'Dense screen') || ''
  const m = sec.match(/^- (.+)$/m)
  return m ? m[1].trim() : null
}

function seedTextOr(fallback) {
  try { return fs.readFileSync(seedPath, 'utf8') } catch { return fallback }
}
function currentSeedJourneys() { return parseJourneysSeed(stripComments(seedTextOr(''))) }

function loadTargetsOrNull() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'design/targets.json'), 'utf8')) } catch { return null }
}

// ---------------------------------------------------------------------------
// Ledger I/O (spec 06's lib is the one writer — this module never hand-builds a row).
// ---------------------------------------------------------------------------
function ledgerTextOrDie() {
  try { return fs.readFileSync(ledgerPath, 'utf8') } catch {
    die('design/mocks/ledger.md does not exist — run the driver once with --root ' + root + ' to create it')
    return null // unreachable
  }
}

function findAssumption(pred) {
  const parsed = parseLedger(ledgerTextOrDie())
  return parsed.assumptions.find(pred) || null
}

function todayIso() { return nowIso().slice(0, 10) }

// specs/20260905/02-design-review-hub-and-look-stops.md D7: the driver derives, never asks the
// session to re-type, the id for a ledger row it appends on the page's behalf (shape:/theme:
// picks) — picks the next unused "P<n>" the way lib/mocks-picks.js's own nextId does for stops.
function nextLedgerId(parsed) {
  let max = 0
  for (const a of parsed.assumptions) {
    const m = /^P(\d+)$/.exec(a.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return 'P' + (max + 1)
}

// ---------------------------------------------------------------------------
// Look stops (specs/20260905/02-design-review-hub-and-look-stops.md D5-D8). picks.json's one
// validated reader/writer is lib/mocks-picks.js (spec 01) — this module never hand-edits a stop.
// ---------------------------------------------------------------------------
function readStopsOrEmpty() {
  try { return picksLib.readPicks(root) } catch (e) {
    die('design/mocks/picks.json is not valid JSON (' + e.message + ') — restore it from git history, or delete it (no stops is a valid starting point) and re-run')
    return [] // unreachable
  }
}

// The newest non-superseded, non-consumed stop carrying `key`, or null.
function liveStopFor(key) {
  const live = readStopsOrEmpty().filter((s) => s.key === key && s.status !== 'superseded' && s.status !== 'consumed')
  if (!live.length) return null
  live.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0))
  return live[0]
}

// D7: refuses (exit 2) unless the key's live stop is decided approve/pick; returns that stop.
function requireStopDecision(key, remedyCmd) {
  const stop = liveStopFor(key)
  if (!stop) die('no look stop for ' + key + ' — run `' + remedyCmd + '` first')
  if (stop.status === 'open') die('waiting on ' + stop.url + ' — the decision has not been taken yet')
  if (stop.decision.verdict === 'change') {
    die('change requested by ' + stop.decision.by + ': "' + stop.decision.note + '"' +
      ' — address it, then `' + remedyCmd + '`')
  }
  return stop
}

// consumeStop in the SAME write as status.json (D7) — callers set their own status fields, then
// call this right before saveStatus() so both writes land together.
function consumeStopAndSave(stopId) {
  const stops = readStopsOrEmpty()
  let result
  try { result = picksLib.consumeStop(stops, stopId) } catch (e) { die('could not consume stop "' + stopId + '": ' + e.message) }
  picksLib.writePicks(root, result.stops)
  saveStatus()
}

// D8: the bare step's `look:` line plus its derived `Then:` line, for the five look-gated marks.
// `mapAccept(pickValue?)` renders the accept-branch Then command with the picked value filled in
// when the stop is a pick stop.
function lookLineAndThen(key, step, mapAccept) {
  const openCmd = 'stop open ' + step
  const stop = liveStopFor(key)
  if (!stop) return { look: 'look: none — `' + openCmd + '` next', then: [openCmd] }
  if (stop.status === 'open') {
    return { look: 'look: ⏳ waiting — ' + stop.url, then: ['end the turn; re-run after the decision'] }
  }
  if (stop.decision.verdict === 'change') {
    return {
      look: 'look: ✏️ change requested by ' + stop.decision.by + ': ' + stop.decision.note,
      then: ['address it, then ' + openCmd],
    }
  }
  const who = stop.decision.by
  const at = stop.decision.at
  if (stop.kind === 'pick') {
    return { look: 'look: ✅ picked "' + stop.decision.pick + '" by ' + who + ' at ' + at, then: [mapAccept(stop.decision.pick)] }
  }
  return { look: 'look: ✅ approved by ' + who + ' at ' + at, then: [mapAccept()] }
}

// D2: every advancing mark first runs gateVerdict and refuses (exit 2) naming the offending
// rows and the remedy — journey-drawn and direction-composed never call this.
function requireGateOpen() {
  const parsed = parseLedger(ledgerTextOrDie())
  if (parsed.errors.length) {
    die('design/mocks/ledger.md has grammar error(s): ' + parsed.errors.map((e) => e.message).join('; ') + ' — fix the ledger and re-run')
  }
  const verdict = gateVerdict(parsed)
  if (!verdict.open) {
    const rows = verdict.blocking.map((b) => b.id + ' ' + b.tag + ' ' + b.status).join(', ')
    die('provenance ledger is blocked: ' + rows + ' — remedy: `ledger set --id <id> --status confirmed --tag said-by-user` (or `--status overridden`)')
  }
}

// ---------------------------------------------------------------------------
// Page notes (specs/20260902/10-page-notes-review-loop.md D4/D5). notesPath's own reader/writer
// and pure transforms live in lib/mocks-notes.js — this file owns only the gate rule, the CLI
// surface, and the printed shapes.
// ---------------------------------------------------------------------------
function notesOrEmpty() {
  try { return readNotes(root) } catch (e) { die('design/mocks/notes.json is not valid JSON (' + e.message + ') — restore it from git history, or delete it (no notes is a valid starting point) and re-run') }
  return [] // unreachable
}

// D5: any open (not-resolved) project note blocks every advancing mark, named first; then, when
// `labels` is given, an unresolved note on any of those screens blocks it too. `approved` calls
// this with every declared label (D5: "any unresolved note anywhere").
// specs/20260906/03-questions-on-the-wireframe.md D4: an unanswered question on any of `labels`
// blocks the mark too, named on its own line before any plain unresolved note — by ledger id and
// screen, never the note id, and callers run this BEFORE requireGateOpen() (a question's ledger
// row is by construction open+inferred, so requireGateOpen's own "provenance ledger is blocked"
// message would otherwise fire first and the promised wording could never be reached).
function requireNotesResolved(labels, journeyName) {
  const notes = notesOrEmpty()
  const openProject = notes.filter((n) => n.scope === 'project' && n.status !== 'resolved')
  if (openProject.length) {
    die('project note(s) open: ' + openProject.map((n) => n.id).join(', ') + ' — answer the project note first')
  }
  if (labels && labels.length) {
    const unresolved = unresolvedFor(notes, labels)
    const where = journeyName ? ' on ' + journeyName : ''
    const questions = unresolved.filter((n) => n.kind === 'question')
    if (questions.length) {
      const list = questions.map((n) => n.ledgerId + ' (' + n.screen + ')').join(', ')
      die('unanswered question(s)' + where + ': ' + list + ' — answer them on the page')
    }
    const plain = unresolved.filter((n) => n.kind !== 'question')
    if (plain.length) {
      die('unresolved note(s)' + where + ': ' + plain.map((n) => n.id).join(', ') + ' — the author resolves after a re-look')
    }
  }
}

function allDeclaredLabels() {
  const labels = []
  for (const [, j] of currentSeedJourneys()) for (const l of j.labels) if (!labels.includes(l)) labels.push(l)
  return labels
}

function noteTag(n) {
  if (n.status === 'addressed' && n.addressed && n.addressed.ledgerRow) return 'addressed → ' + n.addressed.ledgerRow
  return n.status
}
function noteLine(n, indent) {
  let line = indent + n.id + ' [' + noteTag(n) + '] ' + n.by + ' · ' + n.text
  if (n.status === 'addressed' && n.addressed && n.addressed.change) line += '   ↳ changed: ' + n.addressed.change
  return line
}

// specs/20260906/03-questions-on-the-wireframe.md D6: questions print in their own block, before
// the plain-note listing — "❓ questions: N open" (N = still-open questions only), then each open
// question grouped journey -> screen the way groupOpen groups plain notes, then every answered
// question under "answered:" (D1's answer.verdict "yes"/"no" rendered "yes" / `no → "<text>"`).
// s0 fix: a question's open/answered split keys on `answer == null`, never `status` — the
// session's own `notes address` follow-up (recording the redraw after a "no") sets status
// "addressed" without touching `answer`, and that must never re-list an answered question as open.
function questionLines(notes, seed) {
  const questions = notes.filter((n) => n.kind === 'question')
  const open = questions.filter((n) => n.answer == null)
  const answered = questions.filter((n) => n.answer != null)

  const labelToJourney = new Map()
  for (const [journeyName, j] of seed) for (const label of (j && j.labels) || []) labelToJourney.set(label, journeyName)
  const journeys = new Map() // journeyName -> Map(screen -> notes[])
  for (const n of open) {
    const jn = labelToJourney.get(n.screen) || 'unassigned'
    if (!journeys.has(jn)) journeys.set(jn, new Map())
    const screens = journeys.get(jn)
    if (!screens.has(n.screen)) screens.set(n.screen, [])
    screens.get(n.screen).push(n)
  }

  const lines = ['❓ questions: ' + open.length + ' open']
  for (const [jn, screens] of journeys) {
    lines.push(jn)
    for (const [screenLabel, ns] of screens) {
      lines.push('  ' + screenLabel)
      for (const n of ns) lines.push('    ' + n.id + ' [' + n.ledgerId + '] ' + n.text)
    }
  }
  if (answered.length) {
    lines.push('answered:')
    for (const n of answered) {
      const verdictText = n.answer && n.answer.verdict === 'no' ? 'no → "' + (n.answer.text || '') + '"' : 'yes'
      lines.push('  ' + n.id + ' [' + n.ledgerId + '] ' + verdictText)
    }
  }
  return lines
}

// D4's `notes open` — exact shape: the D6 questions block first, then plain notes (project first,
// with a ⚠️ tail while any is open, then journey -> screen -> state, derived from seed.md via
// groupOpen); questions never appear twice — the plain listing below excludes them.
function cmdNotesOpen() {
  const notes = notesOrEmpty()
  const seed = currentSeedJourneys()
  const plainNotes = notes.filter((n) => n.kind !== 'question')
  const { project, journeys } = groupOpen(plainNotes, seed)
  const notResolved = plainNotes.filter((n) => n.status !== 'resolved')
  const mockCount = notResolved.filter((n) => n.scope === 'mock').length
  const addressedCount = notResolved.filter((n) => n.status === 'addressed').length

  const lines = questionLines(notes, seed)
  lines.push('📝 open notes: ' + notResolved.length + ' (' + project.length + ' project · ' + mockCount + ' mock) · addressed: ' + addressedCount)
  if (project.length) {
    lines.push('project')
    for (const n of project) lines.push(noteLine(n, '  '))
  }
  for (const [journeyName, screens] of journeys) {
    lines.push(journeyName)
    for (const [screenLabel, states] of screens) {
      lines.push('  ' + screenLabel)
      for (const [stateLabel, ns] of states) {
        lines.push('    ' + stateLabel)
        for (const n of ns) lines.push(noteLine(n, '      '))
      }
    }
  }
  if (project.length) {
    lines.push('⚠️ a project note is open — answer it (canon change or new directions) before any mock note')
  }
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function cmdNotes(sub, args) {
  const narg = (name) => flagArg(args, name)
  if (sub === 'open') { cmdNotesOpen(); return }
  if (sub === 'address') {
    const id = narg('--id')
    const change = narg('--change')
    const ledgerRow = narg('--ledger')
    if (!id) die('notes address: --id <id> is required')
    if (!change) die('notes address: --change "<what changed>" is required')
    const notes = notesOrEmpty()
    let result
    try { result = addressNote(notes, id, { change, ledgerRow }) } catch (e) { die('notes address: ' + e.message) }
    writeNotes(root, result.notes)
    writeOut(1, 'notes address: ' + id + ' → addressed\n')
    process.exit(0)
  }
  if (sub === 'reply') {
    const id = narg('--id')
    const text = narg('--text')
    if (!id) die('notes reply: --id <id> is required')
    if (!text) die('notes reply: --text "<question back>" is required')
    const notes = notesOrEmpty()
    let result
    try { result = replyNote(notes, id, text) } catch (e) { die('notes reply: ' + e.message) }
    writeNotes(root, result.notes)
    writeOut(1, 'notes reply: ' + id + ' → reply recorded\n')
    process.exit(0)
  }
  die('notes: no "' + sub + '" subcommand — resolving a note happens only on the served page ' +
    '(the Resolve button); one of: open, address, reply')
}

// ---------------------------------------------------------------------------
// HTML mock helpers (D6).
// ---------------------------------------------------------------------------
function labelOf(html) { const m = html.match(/data-screen-label\s*=\s*"([^"]+)"/); return m ? m[1] : null }
function statusOf(html) { const m = html.match(/data-status\s*=\s*"([^"]+)"/); return m ? m[1] : 'sketch' }
function mockFile(label) { return path.join(mocksDir, label + '.html') }
function mocksTopLevelHtmlFiles() {
  let entries = []
  try { entries = fs.readdirSync(mocksDir) } catch { return [] }
  return entries.filter((f) => f.endsWith('.html') && !f.startsWith('.')).sort().map((f) => path.join(mocksDir, f))
}
function runDesignAtlasCheck(args) {
  return runChild(process.execPath, [designAtlasBin, 'check', ...args], { encoding: 'utf8' }, 'design-atlas.js check')
}
function childOutput(r) { return ((r.stdout || '') + (r.stderr || '')).trim() }

// specs/20260905/06-plugin-owned-capture-at-approval.md (D5): journey-approved and approved
// both run render-gate.js --mocks over their own mock set and refuse the mark on any finding
// (gate exit 1) or capture-family failure (gate exit 2/3) — never on a pass. A plain spawnSync
// (via runChild) is safe here, unlike render-gate.js's OWN capture calls: render-gate.js's D8
// mock HTTP server lives inside THAT child process, never in this one, so this call carries
// none of the async-vs-spawnSync deadlock its own header guards against.
const renderGateBin = path.join(__dirname, 'render-gate.js')
function requireRenderGateMocks(mockPaths, journeyName) {
  const args = []
  for (const p of mockPaths) args.push('--mocks', p)
  args.push('--root', root)
  const r = runChild(process.execPath, [renderGateBin, ...args], { encoding: 'utf8' }, 'render-gate.js --mocks')
  if (r.status === 1) {
    const subject = journeyName ? 'journey "' + journeyName + '"' : 'the mock set'
    die(subject + ' fails the rendered adaptation gate:\n' + (r.stdout || '').trim())
  }
  if (r.status !== 0) {
    die('render-gate --mocks could not run: ' + ((r.stderr || r.stdout || '').trim()))
  }
}

// ---------------------------------------------------------------------------
// stop open <step> [--port <n>] (specs/20260905/04-per-project-look-server.md D3) — the driver
// derives every candidate set from disk and delegates to design-atlas.js (sibling path, never
// spec-paths) `stop open`/`stop decide` for writing/probing the stop; there is no hub to register
// with.
// ---------------------------------------------------------------------------
function candidatesArgOf(candidates) {
  return candidates.map((c) => (c.group != null ? c.group + '/' : '') + c.label + '=' + c.path).join(',')
}

function buildShapesStopSpec() {
  const shapesDir = path.join(root, 'design/shapes')
  let files = []
  try { files = fs.readdirSync(shapesDir).filter((f) => f.endsWith('.html')) } catch { /* none yet */ }
  const kebabs = files.map((f) => path.basename(f, '.html'))
  if (kebabs.length < 2 || kebabs.length > 3) die('stop open shapes: design/shapes/ has ' + kebabs.length + ' candidate(s) — 2-3 are required before opening a look stop')
  return { kind: 'pick', key: 'shape-picked', title: 'pick a shape', candidates: kebabs.map((k) => ({ group: k, label: k, path: 'shapes/' + k + '.html' })) }
}

function buildJourneyStopSpec(journeyName) {
  const j = currentSeedJourneys().get(journeyName)
  if (!j) die('stop open journey:' + journeyName + ': journey "' + journeyName + '" is not declared in design/mocks/seed.md')
  for (const label of j.labels) {
    if (!fs.existsSync(mockFile(label))) die('stop open journey:' + journeyName + ': design/mocks/' + label + '.html does not exist — mark journey-drawn --journey ' + journeyName + ' first')
  }
  return {
    kind: 'approve', key: 'journey-approved:' + journeyName, title: 'approve journey ' + journeyName,
    candidates: j.labels.map((l) => ({ group: null, label: l, path: 'mocks/' + l + '.html' })),
    // specs/20260906/04-journey-review-page.md D6: the journey look happens on its own review
    // page now, not the atlas index — every other stop spec omits `page` and keeps the atlas URL.
    page: '/review/' + journeyName + '.html',
  }
}

function buildThemeStopSpec() {
  const composed = Object.keys(status.directions || {})
  if (composed.length < 2) die('stop open theme: only ' + composed.length + ' direction(s) composed — at least 2 are required before opening a look stop')
  const candidates = []
  for (const dir of composed) {
    const dirPath = path.join(root, 'design/theme', dir)
    let files = []
    try { files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.html')) } catch { /* not composed */ }
    for (const f of files) candidates.push({ group: dir, label: path.basename(f, '.html'), path: 'theme/' + dir + '/' + f })
  }
  return { kind: 'pick', key: 'theme-picked', title: 'pick the theme', candidates }
}

function buildSignoffStopSpec() {
  return {
    kind: 'approve', key: 'approved', title: 'sign off',
    candidates: allDeclaredLabels().map((l) => ({ group: null, label: l, path: 'mocks/' + l + '.html' })),
  }
}

function buildStopSpec(step) {
  if (step === 'shapes') return buildShapesStopSpec()
  if (step === 'theme') return buildThemeStopSpec()
  if (step === 'signoff') return buildSignoffStopSpec()
  let m
  if ((m = /^journey:(.+)$/.exec(step))) return buildJourneyStopSpec(m[1])
  die('stop open: unknown step "' + step + '" — one of: shapes, journey:<j>, theme, signoff')
  return null // unreachable
}

function runDesignAtlasStopOpen(spec, port) {
  const args = ['stop', 'open', '--root', root, '--kind', spec.kind, '--key', spec.key,
    '--title', spec.title, '--candidates', candidatesArgOf(spec.candidates)]
  if (port) args.push('--port', port)
  if (spec.page) args.push('--page', spec.page)
  const r = spawnSync(process.execPath, [designAtlasBin, ...args], { encoding: 'utf8' })
  if (r.error || r.status === null) {
    die('design-atlas.js died without an exit code (' + (r.error ? r.error.message : 'no status') + ')')
  }
  if (r.status !== 0) {
    writeOut(2, (r.stderr || r.stdout || 'design-atlas.js failed with no output') + '\n')
    process.exit(3)
  }
  return (r.stdout || '').trim()
}

function cmdStopOpen(step, args) {
  const spec = buildStopSpec(step)
  const port = flagArg(args, '--port')
  const url = runDesignAtlasStopOpen(spec, port)
  const replyLine = spec.kind === 'pick'
    ? 'Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>'
    : 'Reply  ✅ approve  — or —  ✏️ change <what looks wrong>'
  writeOut(1, '🎨 ready for review — ' + url + '\n' + replyLine + '\n')
  process.exit(0)
}

function cmdStopDecide(id, args) {
  if (!id) die('stop decide: needs a stop id, e.g. `stop decide P001 --verdict approve --by chat`')
  const r = spawnSync(process.execPath, [designAtlasBin, 'stop', 'decide', '--root', root, '--id', id, ...args], { encoding: 'utf8' })
  if (r.error || r.status === null) {
    die('design-atlas.js died without an exit code (' + (r.error ? r.error.message : 'no status') + ')')
  }
  if (r.stdout) writeOut(1, r.stdout)
  if (r.stderr) writeOut(2, r.stderr)
  process.exit(r.status)
}

// ---------------------------------------------------------------------------
// State derivation (D2, Behavior "Derivation order") — a pure function of `status` + disk,
// never trusting a recorded mark whose artifact vanished.
// ---------------------------------------------------------------------------
function shapeValid() {
  return !!(status.shape && fs.existsSync(path.join(root, 'design/shapes', status.shape + '.html')))
}
function allJourneysApproved() {
  const journeys = currentSeedJourneys()
  if (journeys.size === 0) return false
  for (const [jn] of journeys) { const st = status.journeys[jn]; if (!st || !st.approved) return false }
  return true
}
// D1: SEED -> SHAPES -> WIREFRAMES -> THEME (`!status.theme`) -> SIGNOFF (`!marks.approved`) ->
// APPROVED — SKIN and REVIEW are retired; a root with `theme` set derives SIGNOFF straight
// through, whatever legacy SKIN/REVIEW-era fields it still carries alongside.
function deriveState() {
  if (!status.marks.seedDone) return 'SEED'
  if (!shapeValid()) return 'SHAPES'
  if (!(status.marks.canonWritten && allJourneysApproved())) return 'WIREFRAMES'
  if (!status.theme) return 'THEME'
  if (!status.marks.approved) return 'SIGNOFF'
  return 'APPROVED'
}

// ---------------------------------------------------------------------------
// Mark handlers (D2-D10). Each mutates `status` and calls saveStatus(); doMark() computes
// prev/next state around the call and prints the D1 checkpoint tail.
// ---------------------------------------------------------------------------
function handleSeedDone() {
  requireGateOpen()
  const raw = seedTextOr(null)
  if (raw === null) die('design/mocks/seed.md does not exist — write it from spec/templates/mocks-seed.md, then re-mark seed-done')
  const text = stripComments(raw)

  const productLines = (sectionOf(text, 'Product') || '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (productLines.length < 3) die('design/mocks/seed.md ## Product needs at least 3 non-blank lines (what it is · who it is for · the one job)')

  const facts = parseFacts(text)
  const ledgerParsed = parseLedger(ledgerTextOrDie())
  for (const key of FACT_KEYS) {
    const id = facts[key]
    if (!id) die('design/mocks/seed.md ## Facts is missing the "' + key + '" key — add "- ' + key + ': <ledger id>", then re-mark seed-done')
    const row = ledgerParsed.assumptions.find((a) => a.id === id)
    if (!row) die('design/mocks/seed.md ## Facts names "' + id + '" for "' + key + '" but no such row exists in design/mocks/ledger.md')
    if (row.kind !== 'product') die('ledger row "' + id + '" for fact "' + key + '" must be a product row (found "' + row.kind + '")')
    if (row.status !== 'confirmed') die('ledger row "' + id + '" for fact "' + key + '" must be confirmed (found "' + row.status + '") — run `ledger set --id ' + id + ' --status confirmed --tag said-by-user`')
    if (!['said-by-user', 'ratified-doc'].includes(row.tag)) die('ledger row "' + id + '" for fact "' + key + '" must be tagged said-by-user or ratified-doc (found "' + row.tag + '")')
  }

  const journeys = parseJourneysSeed(text)
  if (journeys.size === 0) die('design/mocks/seed.md ## Journeys needs at least one ### journey block')
  const labelOwners = new Map()
  for (const [jn, j] of journeys) {
    if (!j.persona) die('journey "' + jn + '" is missing its persona line')
    if (!j.labels.length) die('journey "' + jn + '" declares no labels in its ```surfaces block')
    for (const l of j.labels) {
      if (labelOwners.has(l)) die('label "' + l + '" is declared in two journeys ("' + labelOwners.get(l) + '" and "' + jn + '") — every label must belong to exactly one journey')
      labelOwners.set(l, jn)
    }
  }

  const dense = parseDenseScreen(text)
  if (!dense || !labelOwners.has(dense)) die('design/mocks/seed.md ## Dense screen must name a label already declared in a journey')

  const targets = loadTargetsOrNull()
  if (!targets) die('design/targets.json does not exist or is not valid JSON')
  if (!Array.isArray(targets.themes) || !targets.themes.length) die('design/targets.json has an empty or missing "themes" array')
  if (!Array.isArray(targets.viewports) || !targets.viewports.length) die('design/targets.json has an empty or missing "viewports" array')

  const briefPath = path.join(root, 'docs/design/research-brief.md')
  if (!fs.existsSync(briefPath)) die('docs/design/research-brief.md does not exist — author it per spec/doctrine/genesis.md § Genesis: Fresh UX Research, then re-mark seed-done')
  const briefText = fs.readFileSync(briefPath, 'utf8')
  if (!briefText.trim()) die('docs/design/research-brief.md is empty — author it, then re-mark seed-done')
  if (!/^##\s/m.test(briefText)) die('docs/design/research-brief.md has no "## " heading — add one, then re-mark seed-done')

  status.marks.seedDone = nowIso()
  saveStatus()
}

function handleShapePicked(shapeArg) {
  requireGateOpen()
  if (!status.marks.seedDone) die('seed-done has not been marked yet — mark seed-done first')
  const stop = requireStopDecision('shape-picked', 'stop open shapes')
  const pick = stop.decision.pick
  if (shapeArg && shapeArg !== pick) die('--shape ' + shapeArg + ' disagrees with the page pick "' + pick + '" (stop ' + stop.id + ')')
  const shapeChosen = pick

  const shapesDir = path.join(root, 'design/shapes')
  let files = []
  try { files = fs.readdirSync(shapesDir).filter((f) => f.endsWith('.html')) } catch { /* none yet */ }
  const kebabs = files.map((f) => path.basename(f, '.html'))
  if (kebabs.length < 2 || kebabs.length > 3) die('design/shapes/ has ' + kebabs.length + ' candidate(s) — 2-3 are required before a pick')
  if (!kebabs.includes(shapeChosen)) die('"' + shapeChosen + '" is not among the shape candidates (' + kebabs.join(', ') + ')')

  const text = stripComments(seedTextOr(''))
  const dense = parseDenseScreen(text)
  const journeys = parseJourneysSeed(text)
  const allLabels = new Set()
  for (const [, j] of journeys) for (const l of j.labels) allLabels.add(l)
  for (const f of files) {
    const html = fs.readFileSync(path.join(shapesDir, f), 'utf8')
    const label = labelOf(html)
    if (!label || (label !== dense && !allLabels.has(label))) die(f + ': data-screen-label must equal the dense screen or a declared journey label')
    const kebab = path.basename(f, '.html')
    const m = html.match(/data-shape\s*=\s*"([^"]+)"/)
    if (!m || m[1] !== kebab) die(f + ': data-shape must equal "' + kebab + '"')
  }

  const row = findAssumption((a) => a.kind === 'product' && a.tag === 'said-by-user' && a.status === 'confirmed' && a.claim === 'shape: ' + shapeChosen)
  const others = kebabs.filter((k) => k !== shapeChosen)
  if (!row) {
    // D7: the page's radio exclusivity already names every rejected group — the driver appends
    // the row itself rather than ask the session to re-type it.
    let out
    try {
      out = appendAssumption(ledgerTextOrDie(), {
        id: nextLedgerId(parseLedger(ledgerTextOrDie())), step: 'SHAPES', kind: 'product',
        claim: 'shape: ' + shapeChosen, tag: 'said-by-user', status: 'confirmed ' + todayIso(),
        rejected: others.join(', '), note: stop.decision.note || 'picked on the page',
      })
    } catch (e) { die('could not append the shape ledger row: ' + e.message) }
    fs.writeFileSync(ledgerPath, out)
  } else {
    const rejectedTokens = (row.rejected || '').split(/[,\s]+/).filter(Boolean)
    const missing = others.filter((o) => !rejectedTokens.includes(o))
    if (missing.length) die('the "shape: ' + shapeChosen + '" ledger row\'s rejected cell does not name every other shape candidate — missing: ' + missing.join(', '))
  }

  status.shape = shapeChosen
  status.marks.shapePicked = nowIso()
  consumeStopAndSave(stop.id)
}

function handleCanonWritten() {
  requireGateOpen()
  if (!status.marks.shapePicked) die('shape-picked has not been marked yet — mark shape-picked first')
  const canonPath = path.join(mocksDir, 'canon.md')
  if (!fs.existsSync(canonPath)) die('design/mocks/canon.md does not exist — write it from spec/templates/mocks-canon.md, then re-mark canon-written')
  const text = stripComments(fs.readFileSync(canonPath, 'utf8'))
  for (const heading of ['Shells', 'Primitives', 'Rules', 'Grounding']) {
    if (sectionOf(text, heading) === null) die('design/mocks/canon.md is missing "## ' + heading + '"')
  }
  const primitives = sectionOf(text, 'Primitives') || ''
  if (!/^- \*\*.+\*\*\s*—/m.test(primitives)) die('design/mocks/canon.md ## Primitives needs at least one "- **name** — purpose" bullet')
  const grounding = sectionOf(text, 'Grounding') || ''
  if (!grounding.includes('docs/design/research-brief.md')) die('design/mocks/canon.md ## Grounding must contain the literal "docs/design/research-brief.md"')
  if (!/\bbinding\b/.test(grounding)) die('design/mocks/canon.md ## Grounding must contain the word "binding"')

  const existingMocks = mocksTopLevelHtmlFiles()
  if (existingMocks.length) die('design/mocks/' + path.basename(existingMocks[0]) + ' already exists — canon must be written before any screen (canon first)')

  const wireDir = path.join(root, 'design/wire')
  fs.mkdirSync(wireDir, { recursive: true })
  const tplDir = path.join(templatesDir, 'mocks')
  const tokensDest = path.join(wireDir, 'tokens.css')
  const cssDest = path.join(wireDir, 'wire.css')
  if (!fs.existsSync(tokensDest)) fs.copyFileSync(path.join(tplDir, 'wire-tokens.css'), tokensDest)
  if (!fs.existsSync(cssDest)) fs.copyFileSync(path.join(tplDir, 'wire.css'), cssDest)

  status.marks.canonWritten = nowIso()
  saveStatus()
}

function ensureJourneyRecord(j) {
  status.journeys[j] = Object.assign({ drawn: null, approved: null }, status.journeys[j] || {})
  return status.journeys[j]
}

function handleJourneyDrawn(journeyName) {
  if (!status.marks.canonWritten) die('canon-written has not been marked yet — mark canon-written first')
  if (!journeyName) die('--journey <name> is required')
  const journeys = currentSeedJourneys()
  const j = journeys.get(journeyName)
  if (!j) die('journey "' + journeyName + '" is not declared in design/mocks/seed.md — add it under ## Journeys, then re-mark journey-drawn')
  for (const label of j.labels) {
    const file = mockFile(label)
    if (!fs.existsSync(file)) die('design/mocks/' + label + '.html does not exist — draw it, then re-mark journey-drawn --journey ' + journeyName)
    const html = fs.readFileSync(file, 'utf8')
    // AC-20260902-07-6: every D6 failure mode (ratified status, no wire/tokens.css link, an
    // off-token color literal) must exit 2 carrying BOTH the failing label and design-atlas.js
    // check's own line — so the atlas check runs once, up front, and its output (when it fails)
    // rides along on whichever die() below actually fires for this label, not only the branch
    // that reads the atlas exit code directly.
    const r = runDesignAtlasCheck([file])
    const atlasSuffix = r.status !== 0 ? ' — design-atlas.js check: ' + childOutput(r) : ''
    if (labelOf(html) !== label) die(file + ': data-screen-label must equal "' + label + '"' + atlasSuffix)
    if (statusOf(html) !== 'sketch') die(file + ': data-status must be "sketch" at journey-drawn time' + atlasSuffix)
    if (!/wire\/tokens\.css/.test(html)) die(file + ': does not link ../wire/tokens.css' + atlasSuffix)
    if (!/wire\/wire\.css/.test(html)) die(file + ': does not link ../wire/wire.css' + atlasSuffix)
    if (r.status !== 0) die(file + ': design-atlas.js check failed for label "' + label + '": ' + childOutput(r))
  }
  // specs/20260906/05-gray-states-on-every-wireframe.md D2: after every per-label closure check
  // above, run check --states over the journey's own top-level mocks — a violation refuses the
  // mark before journeys.<j>.drawn is ever recorded.
  const statesRes = runDesignAtlasCheck(['--states', ...j.labels.map(mockFile)])
  if (statesRes.status !== 0) {
    die(childOutput(statesRes) + '\ndraw the missing states in the wireframe register, then re-mark')
  }
  ensureJourneyRecord(journeyName).drawn = nowIso()
  saveStatus()
}

function handleJourneyApproved(journeyName) {
  if (!journeyName) die('--journey <name> is required')
  const st = status.journeys[journeyName]
  if (!st || !st.drawn) die('journey "' + journeyName + '" has not been drawn yet — mark journey-drawn --journey ' + journeyName + ' first')
  const j = currentSeedJourneys().get(journeyName)
  // specs/20260906/03-questions-on-the-wireframe.md's ruling on D4: the notes gate (question-aware)
  // runs BEFORE requireGateOpen — otherwise a question's own open/inferred ledger row trips the
  // generic ledger-blocked message first and the question wording is never reached.
  requireNotesResolved(j ? j.labels : [], journeyName)
  requireGateOpen()
  // D2: re-run check --states before the render gate — a redrawn screen cannot lose a state
  // between journey-drawn and journey-approved.
  const statesRes = runDesignAtlasCheck(['--states', ...(j ? j.labels : []).map(mockFile)])
  if (statesRes.status !== 0) {
    die(childOutput(statesRes) + '\ndraw the missing states in the wireframe register, then re-mark')
  }
  requireRenderGateMocks((j ? j.labels : []).map((l) => mockFile(l)), journeyName)
  const stop = requireStopDecision('journey-approved:' + journeyName, 'stop open journey:' + journeyName)
  st.approved = nowIso()
  consumeStopAndSave(stop.id)
}

function handleDirectionComposed(kebab) {
  if (!kebab) die('--direction <kebab> is required')
  const text = stripComments(seedTextOr(''))
  const dense = parseDenseScreen(text)
  const journeys = parseJourneysSeed(text)
  const approvedLabels = new Set()
  for (const [jn, j] of journeys) {
    const st = status.journeys[jn]
    if (st && st.approved) for (const l of j.labels) approvedLabels.add(l)
  }
  const dir = path.join(root, 'design/theme', kebab)
  let htmlFiles = []
  try { htmlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.html')) } catch { /* not composed yet */ }
  // D3: at most 2 screens per direction, the dense screen first — a theme is picked on the
  // dense screens, never the whole product; recomposing more is /spec:sketch's fidelity work.
  if (htmlFiles.length > 2) {
    die('direction "' + kebab + '" composes ' + htmlFiles.length + ' screens — at most 2 (the dense screen first): ' +
      'a theme is picked on the dense screens, never the whole product; /spec:sketch skins per brief')
  }
  const labels = htmlFiles.map((f) => path.basename(f, '.html'))
  if (!dense || !labels.includes(dense)) die('design/theme/' + kebab + ' does not include the dense screen "' + dense + '"')
  if (!fs.existsSync(path.join(dir, 'tokens.css'))) die('design/theme/' + kebab + '/tokens.css does not exist')
  for (const f of htmlFiles) {
    const label = path.basename(f, '.html')
    if (!approvedLabels.has(label)) die('design/theme/' + kebab + '/' + f + ' names label "' + label + '" which is not an approved wireframe label')
    const html = fs.readFileSync(path.join(dir, f), 'utf8')
    if (!/tokens\.css/.test(html)) die('design/theme/' + kebab + '/' + f + ' does not link tokens.css')
  }
  const r = runDesignAtlasCheck([dir])
  if (r.status !== 0) die('design-atlas.js check design/theme/' + kebab + ' failed: ' + childOutput(r))
  const row = findAssumption((a) => a.kind === 'product' && a.tag === 'said-by-user' && a.status === 'confirmed' && a.claim === 'theme-directions: ' + kebab)
  if (!row) die('design/mocks/ledger.md has no confirmed said-by-user product row with claim "theme-directions: ' + kebab + '" — record the direction interview pick first')

  status.directions[kebab] = { composed: nowIso() }
  saveStatus()
}

function handleThemePicked(directionArg) {
  requireGateOpen()
  const stop = requireStopDecision('theme-picked', 'stop open theme')
  const pick = stop.decision.pick
  if (directionArg && directionArg !== pick) die('--direction ' + directionArg + ' disagrees with the page pick "' + pick + '" (stop ' + stop.id + ')')
  const kebab = pick
  const composed = Object.keys(status.directions || {})
  if (composed.length < 2) die('only ' + composed.length + ' direction(s) composed — at least 2 are required before a pick')
  if (!composed.includes(kebab)) die('direction "' + kebab + '" has not been composed yet — mark direction-composed --direction ' + kebab + ' first')
  const others = composed.filter((k) => k !== kebab)
  const row = findAssumption((a) => a.kind === 'product' && a.tag === 'said-by-user' && a.status === 'confirmed' && a.claim === 'theme: ' + kebab)
  if (!row) {
    let out
    try {
      out = appendAssumption(ledgerTextOrDie(), {
        id: nextLedgerId(parseLedger(ledgerTextOrDie())), step: 'THEME', kind: 'product',
        claim: 'theme: ' + kebab, tag: 'said-by-user', status: 'confirmed ' + todayIso(),
        rejected: others.join(', '), note: stop.decision.note || 'picked on the page',
      })
    } catch (e) { die('could not append the theme ledger row: ' + e.message) }
    fs.writeFileSync(ledgerPath, out)
  } else {
    const rejectedTokens = (row.rejected || '').split(/[,\s]+/).filter(Boolean)
    const missing = others.filter((o) => !rejectedTokens.includes(o))
    if (missing.length) die('the "theme: ' + kebab + '" ledger row\'s rejected cell does not name every other composed direction — missing: ' + missing.join(', '))
  }

  fs.copyFileSync(path.join(root, 'design/theme', kebab, 'tokens.css'), path.join(root, 'design/tokens.css'))
  status.theme = kebab
  status.marks.themePicked = nowIso()
  consumeStopAndSave(stop.id)
}

// D5: `approved` is the one sign-off — SKIN and REVIEW (and the journey-skinned/review-opened/
// journey-reviewed marks that gated them) are retired. `approved` requires the theme picked,
// every declared journey approved, notes resolved, a decided `approved` stop, and the existing
// render-gate/matrix checks; on accept it is the mark's OWN write that stamps every top-level
// mock `data-status="approved"` (attribute-only, byte-identical otherwise) and records the
// decider from the stop's own "by" — there is no precondition that a mock already carry
// data-status="approved" (D5 rationale: with no review loop nobody would ever set it by hand).
function handleApproved() {
  if (!status.marks.themePicked) die('theme-picked first')
  for (const [jn] of currentSeedJourneys()) {
    const st = status.journeys[jn]
    if (!st || !st.approved) die('journey "' + jn + '" is not approved — mark journey-approved --journey ' + jn + ' first')
  }
  // specs/20260906/03: notes gate (question-aware) runs before requireGateOpen — same ordering
  // reason as handleJourneyApproved above.
  requireNotesResolved(allDeclaredLabels(), null)
  requireGateOpen()
  const stop = requireStopDecision('approved', 'stop open signoff')

  const files = mocksTopLevelHtmlFiles()
  const targets = loadTargetsOrNull()
  if (targets && Array.isArray(targets.viewports) && targets.viewports.length) {
    for (const f of files) {
      const html = fs.readFileSync(f, 'utf8')
      if (!/<meta[^>]+name="viewport"/.test(html)) die(path.basename(f) + ': no <meta name="viewport"> — every mock is one responsive file')
    }
  }
  const r = runDesignAtlasCheck([mocksDir, '--matrix'])
  if (r.status !== 0) die('design-atlas.js check --matrix design/mocks failed: ' + childOutput(r))

  requireRenderGateMocks(files, null)

  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8')
    if (statusOf(html) === 'sketch') fs.writeFileSync(f, html.replace('data-status="sketch"', 'data-status="approved"'))
  }
  status.decider = stop.decision.by
  status.marks.approved = nowIso()
  consumeStopAndSave(stop.id)
}

// ---------------------------------------------------------------------------
// doMark / printAcceptedTail (D1, AC-20260902-07-2).
// ---------------------------------------------------------------------------
function printAcceptedTail(prev, next) {
  const parsed = parseLedger(ledgerTextOrDie())
  writeOut(1, countsLine(parsed) + '\n\n')
  writeOut(1, '✅ checkpoint — mocks state saved (' + prev + ' → ' + next + '); safe to /clear and re-run /spec:mocks\n')
  process.exit(0)
}

function doMark(mark, opts) {
  const prevState = deriveState()
  switch (mark) {
    case 'seed-done': handleSeedDone(); break
    case 'shape-picked': handleShapePicked(opts.shape); break
    case 'canon-written': handleCanonWritten(); break
    case 'journey-drawn': handleJourneyDrawn(opts.journey); break
    case 'journey-approved': handleJourneyApproved(opts.journey); break
    case 'direction-composed': handleDirectionComposed(opts.direction); break
    case 'theme-picked': handleThemePicked(opts.direction); break
    case 'approved': handleApproved(); break
    default: die('unknown mark "' + mark + '" — one of: seed-done, shape-picked, canon-written, journey-drawn, journey-approved, direction-composed, theme-picked, approved')
  }
  const nextState = deriveState()
  printAcceptedTail(prevState, nextState)
}

// ---------------------------------------------------------------------------
// --reopen (D11) — clears marks, deletes nothing on disk.
// ---------------------------------------------------------------------------
// D7: `--reopen` never deletes and never over-clears — a theme re-pick must not un-approve a
// journey's wireframes, so `--reopen theme` leaves every journeys[j].approved untouched.
function doReopen(target) {
  const at = nowIso()
  let m
  if ((m = /^journey:(.+)$/.exec(target))) {
    const j = m[1]
    const st = ensureJourneyRecord(j)
    st.approved = null
    status.marks.approved = null
    status.decider = null
    const invalidated = ['approved', 'approved(all)']
    status.reopens.push({ at, target: 'journey:' + j, invalidated })
    saveStatus()
    writeOut(1, '↩ reopened journey:' + j + ' — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else if (target === 'shapes') {
    status.shape = null
    status.marks.shapePicked = null
    status.marks.canonWritten = null
    for (const k of Object.keys(status.directions || {})) delete status.directions[k]
    status.theme = null
    status.marks.themePicked = null
    for (const j of Object.keys(status.journeys || {})) {
      const st = status.journeys[j]
      st.drawn = null; st.approved = null
    }
    status.decider = null
    status.marks.approved = null
    const invalidated = ['shape', 'canon', 'journeys(all)', 'theme', 'approved(all)']
    status.reopens.push({ at, target: 'shapes', invalidated })
    saveStatus()
    writeOut(1, '↩ reopened shapes — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else if (target === 'theme') {
    status.theme = null
    status.marks.themePicked = null
    status.marks.approved = null
    status.decider = null
    const invalidated = ['theme', 'approved(all)']
    status.reopens.push({ at, target: 'theme', invalidated })
    saveStatus()
    writeOut(1, '↩ reopened theme — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else {
    die('--reopen must be journey:<j>, shapes, or theme')
  }
}

// ---------------------------------------------------------------------------
// ledger subcommand (D14).
// ---------------------------------------------------------------------------
// specs/20260906/03-questions-on-the-wireframe.md D2: the shared refusal checks `ledger add
// --screen` and `ledger ask` both run before pinning a row as a question — a process row is
// never a question, a said-by-user/ratified-doc row has nothing to ask, and the screen must be
// one the seed actually declares.
function refuseUnaskable(prefix, kind, tag, screenArg) {
  if (kind === 'process') die(prefix + ': --screen on a process row is never a question for the user')
  if (tag === 'said-by-user' || tag === 'ratified-doc') {
    die(prefix + ': --screen on a "' + tag + '" tag — nothing to ask — the user already said it')
  }
  if (!allDeclaredLabels().includes(screenArg)) die(prefix + ': unknown screen "' + screenArg + '"')
}

function cmdLedger(sub, args) {
  const larg = (name) => flagArg(args, name)
  if (sub === 'add') {
    const screenArg = larg('--screen')
    const stateArg = larg('--state')
    const kind = larg('--kind')
    const tag = larg('--tag')
    const claim = larg('--claim')
    const id = larg('--id')
    if (screenArg) refuseUnaskable('ledger add', kind, tag, screenArg)
    let out
    try {
      out = appendAssumption(ledgerTextOrDie(), {
        id, step: larg('--step'), kind, claim,
        tag, status: larg('--status'), rejected: larg('--rejected'),
        dependents: larg('--dependents'), note: larg('--note'),
      })
    } catch (e) { die('ledger add: ' + e.message) }
    fs.writeFileSync(ledgerPath, out)
    if (screenArg) {
      const notes = notesOrEmpty()
      let result
      try {
        result = addNote(notes, { kind: 'question', ledgerId: id, scope: 'mock', screen: screenArg, state: stateArg || null, text: claim, by: 'session' })
      } catch (e) { die('ledger add: ' + e.message) }
      writeNotes(root, result.notes)
    }
    process.exit(0)
  }
  if (sub === 'ask') {
    const id = larg('--id')
    const screenArg = larg('--screen')
    const stateArg = larg('--state')
    if (!id) die('ledger ask: --id <id> is required')
    if (!screenArg) die('ledger ask: --screen <label> is required')
    const parsed = parseLedger(ledgerTextOrDie())
    const row = parsed.assumptions.find((a) => a.id === id)
    if (!row) die('ledger ask: no assumption row "' + id + '" found')
    refuseUnaskable('ledger ask', row.kind, row.tag, screenArg)
    if (row.status !== 'open') die('ledger ask: row "' + id + '" must be open (found "' + row.status + '")')
    const notes = notesOrEmpty()
    const already = notes.find((n) => n.kind === 'question' && n.ledgerId === id)
    if (already) die(id + ' is already a question on ' + already.screen)
    let result
    try {
      result = addNote(notes, { kind: 'question', ledgerId: id, scope: 'mock', screen: screenArg, state: stateArg || null, text: row.claim, by: 'session' })
    } catch (e) { die('ledger ask: ' + e.message) }
    writeNotes(root, result.notes)
    process.exit(0)
  }
  if (sub === 'set') {
    let out
    try { out = setStatus(ledgerTextOrDie(), larg('--id'), larg('--status'), larg('--tag')) } catch (e) { die('ledger set: ' + e.message) }
    fs.writeFileSync(ledgerPath, out)
    process.exit(0)
  }
  if (sub === 'catch') {
    let out
    try {
      out = appendCatch(ledgerTextOrDie(), { id: larg('--id'), what: larg('--what'), step: larg('--step'), cost: larg('--cost'), note: larg('--note') })
    } catch (e) { die('ledger catch: ' + e.message) }
    fs.writeFileSync(ledgerPath, out)
    process.exit(0)
  }
  if (sub === 'check') {
    const parsed = parseLedger(ledgerTextOrDie())
    writeOut(1, countsLine(parsed) + '\n')
    if (parsed.errors.length) {
      for (const e of parsed.errors) writeOut(2, 'grammar error: ' + e.message + '\n')
      process.exit(2)
    }
    const verdict = gateVerdict(parsed)
    if (verdict.open) { writeOut(1, 'gate: open\n'); process.exit(0) }
    writeOut(1, 'gate: blocked\n')
    for (const b of verdict.blocking) writeOut(1, b.id + ' ' + b.tag + ' ' + b.status + '\n')
    process.exit(1)
  }
  if (sub === 'counts') {
    const parsed = parseLedger(ledgerTextOrDie())
    writeOut(1, countsLine(parsed) + '\n' + catchProvenanceLine(parsed) + '\n')
    process.exit(0)
  }
  die('ledger: unknown subcommand "' + sub + '" — one of: add, set, catch, check, counts, ask')
}

// specs/20260906/03-questions-on-the-wireframe.md D6: derived, never attested — a catch row
// counts as "question" when some question note's addressed.ledgerRow names it, "note" when some
// plain note's addressed.ledgerRow does, "unlinked" otherwise.
function catchProvenanceLine(parsed) {
  const notes = notesOrEmpty()
  let question = 0; let note = 0; let unlinked = 0
  for (const c of parsed.catches) {
    const byQuestion = notes.some((n) => n.kind === 'question' && n.addressed && n.addressed.ledgerRow === c.id)
    const byNote = notes.some((n) => n.kind !== 'question' && n.addressed && n.addressed.ledgerRow === c.id)
    if (byQuestion) question++
    else if (byNote) note++
    else unlinked++
  }
  return '📎 catches: ' + parsed.catches.length + ' — question ' + question + ' · note ' + note + ' · unlinked ' + unlinked
}

// ---------------------------------------------------------------------------
// look / look-probe / look-via (D12/D13).
// ---------------------------------------------------------------------------
function probeOk() {
  const r = spawnSync('npx', ['--no-install', 'playwright', '--version'], { encoding: 'utf8' })
  return !r.error && r.status === 0
}
function dieProbeFailed() {
  die('look reachability probe failed (`npx --no-install playwright --version` did not succeed) — run `npx playwright install chromium`, or record `look-via browser` once a browser MCP is available')
}
function cmdLookProbe() {
  if (probeOk()) { writeOut(1, 'look-probe: ok\n'); process.exit(0) }
  dieProbeFailed()
}
function cmdLookVia(mode) {
  if (!['playwright', 'browser'].includes(mode)) die('look-via needs "playwright" or "browser"')
  status.look = mode
  saveStatus()
  writeOut(1, 'look-via: recorded "' + mode + '"\n')
  process.exit(0)
}
// specs/20260906/04-journey-review-page.md D2 (review fix round F4): `--port <n>` prefers the
// served URL's `?state=` (design-atlas.js's own state injection, D2) over this command's own
// file:// sibling-with-injected-script path — the same mock served instead of a throwaway copy.
// No `--port` leaves the file:// path byte-identical to before.
function cmdLook(label, args) {
  if (!label) die('look needs a <label>')
  const file = mockFile(label)
  if (!fs.existsSync(file)) die('design/mocks/' + label + '.html does not exist')
  const stateArg = flagArg(args, '--state')
  const outArg = flagArg(args, '--out')
  const portArg = flagArg(args, '--port')
  const mockHtml = fs.readFileSync(file, 'utf8')

  // review fix round F9: a state design-atlas.js's ?state= would silently drop (invalid chars) or
  // a state the mock never declares both produce, silently, a state-named PNG of the HAPPY state
  // — refuse BEFORE any target is built, one rule for both the file:// and served paths.
  if (stateArg) {
    const declared = [...new Set([...mockHtml.matchAll(/data-state-btn\s*=\s*"([^"]+)"/g)].map((m) => m[1]))]
    if (!/^[A-Za-z0-9_-]+$/.test(stateArg) || !declared.includes(stateArg)) {
      die('look: state "' + stateArg + '" is not declared by design/mocks/' + label + '.html — use --state <one of: ' +
        (declared.join(', ') || 'none declared') + '> or omit it for happy')
    }
  }

  const targets = loadTargetsOrNull()
  const vp = (targets && Array.isArray(targets.viewports) && targets.viewports[0]) || { width: 390, height: 844 }
  const outPath = outArg ? path.resolve(outArg) : path.join(mocksDir, '.looks', label + (stateArg ? '.' + stateArg : '') + '.png')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })

  let target
  let siblingPath = null
  if (portArg) {
    target = 'http://localhost:' + portArg + '/mocks/' + encodeURIComponent(label) + '.html?clean' + (stateArg ? '&state=' + encodeURIComponent(stateArg) : '')
  } else {
    siblingPath = path.join(mocksDir, '.look-' + label + '.html')
    let content = mockHtml
    if (stateArg) {
      const script = '<script>document.addEventListener(\'DOMContentLoaded\',function(){var b=document.querySelector(\'[data-state-btn="' + stateArg + '"]\');if(b)b.click()})</script>'
      content = /<\/body>/i.test(content) ? content.replace(/<\/body>/i, script + '</body>') : content + script
    }
    fs.writeFileSync(siblingPath, content)
    target = 'file://' + siblingPath
  }
  try {
    const screenshotArgs = ['--no-install', 'playwright', 'screenshot', '--viewport-size=' + (vp.width | 0) + ',' + (vp.height | 0), target, outPath]
    const r = spawnSync('npx', screenshotArgs, { encoding: 'utf8' })
    if (r.error || r.status !== 0) {
      die('look: playwright screenshot of ' + target + ' failed: ' + (childOutput(r) || (r.error && r.error.message) || 'unknown error'))
    }
  } finally {
    if (siblingPath) { try { fs.unlinkSync(siblingPath) } catch { /* best-effort cleanup */ } }
  }
  writeOut(1, 'look: wrote ' + outPath + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Bare-invocation step printer (D1's checkpoint contract skeleton, verbatim shape).
// ---------------------------------------------------------------------------
function openRowsLine() {
  const parsed = parseLedger(ledgerTextOrDie())
  const open = parsed.assumptions.filter((a) => a.kind === 'product' && a.status === 'open')
  if (!open.length) return 'open product rows: 0'
  return 'open product rows: ' + open.length + ' (' + open.map((r) => r.id + ' ' + r.tag).join(', ') + ')'
}

// D8: one constant feeds both the skill line (printStepBlock) and the look-probe precondition
// (doBareStep) — SIGNOFF is not an authoring state (it asks the user to look, not to draw), so
// it prints no skill line even though its own look probe still runs.
const AUTHORING_STATES = new Set(['SHAPES', 'WIREFRAMES', 'THEME'])
function printStepBlock(state, title, readOnlyList, doctrineSection, progressLine, thenLines) {
  const lines = []
  lines.push('[mocks-driver] state: ' + state + '  root: ' + root)
  lines.push('(re-run this driver after completing the step; it verifies artifacts and prints the next one)')
  lines.push('')
  lines.push('## Step: ' + title)
  lines.push('Read only: ' + readOnlyList.join(', '))
  lines.push('Doctrine: spec/doctrine/mocks.md § ' + doctrineSection)
  if (AUTHORING_STATES.has(state)) lines.push(skillLine())
  if (progressLine) lines.push(progressLine)
  lines.push('Then:')
  for (const t of thenLines) lines.push('  ' + t)
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function driverCmd(extra) { return 'node ' + __filename + ' --root ' + root + ' ' + extra }

function printSeedStep() {
  printStepBlock('SEED', 'seed the product — facts before screens',
    ['design/mocks/seed.md', 'design/mocks/ledger.md', 'docs/design/research-brief.md', 'design/targets.json'],
    'Mocks: Seed', openRowsLine(),
    [driverCmd('--mark seed-done')])
}

function printShapesStep() {
  const look = lookLineAndThen('shape-picked', 'shapes', (pick) => driverCmd('--mark shape-picked --shape ' + pick))
  printStepBlock('SHAPES', 'pick a shape — 2 to 3 candidates, one wins',
    ['design/mocks/seed.md', 'design/shapes/*.html', 'design/mocks/ledger.md'],
    'Mocks: State Machine', openRowsLine() + '\n' + look.look,
    look.then)
}

function journeysProgressLine(journeys) {
  const total = journeys.size
  let drawn = 0; let approved = 0
  for (const [jn] of journeys) {
    const st = status.journeys[jn]
    if (st && st.drawn) drawn++
    if (st && st.approved) approved++
  }
  return 'journeys: ' + drawn + '/' + total + ' drawn · ' + approved + '/' + total + ' approved · ' + openRowsLine()
}

// specs/20260906/03-questions-on-the-wireframe.md D7: per-journey question counts (open/total)
// anchored to the journey's own declared labels — feeds the draw/approve step progress lines.
// s0 fix: "open" keys on `answer == null`, never `status` (see questionLines above).
function journeyQuestionCounts(jn, journeys) {
  const j = journeys.get(jn)
  const labels = j ? j.labels : []
  const qs = notesOrEmpty().filter((n) => n.kind === 'question' && labels.includes(n.screen))
  const open = qs.filter((n) => n.answer == null).length
  return 'questions: ' + open + '/' + qs.length + ' open on ' + jn
}

function printWireframesStep() {
  if (!status.marks.canonWritten) {
    printStepBlock('WIREFRAMES', 'write the canon — one hand before any screen',
      ['design/mocks/canon.md', 'docs/design/research-brief.md', 'design/mocks/seed.md'],
      'Mocks: State Machine', openRowsLine(),
      [driverCmd('--mark canon-written')])
    return
  }
  const journeys = currentSeedJourneys()
  for (const [jn] of journeys) {
    const st = status.journeys[jn]
    if (!st || !st.drawn) {
      printStepBlock('WIREFRAMES', 'draw journey ' + jn + ' — one screen at a time, canon first',
        ['design/mocks/seed.md (## Journeys › ' + jn + ')', 'design/mocks/canon.md', 'docs/design/research-brief.md', 'design/mocks/ledger.md'],
        'Mocks: State Machine', journeysProgressLine(journeys) + ' · ' + journeyQuestionCounts(jn, journeys),
        [driverCmd('--mark journey-drawn --journey ' + jn),
          'states: empty, loading, error on every screen (data-state-btn) — or data-no-state="<name>" with the product reason in the ledger',
          'pin every inferred/invented product assumption you write while drawing: ledger add … --screen <label>'])
      return
    }
  }
  for (const [jn] of journeys) {
    const st = status.journeys[jn]
    if (!st.approved) {
      const look = lookLineAndThen('journey-approved:' + jn, 'journey:' + jn, () => driverCmd('--mark journey-approved --journey ' + jn))
      printStepBlock('WIREFRAMES', 'approve journey ' + jn + ' — look, then approve',
        ['design/mocks/ledger.md'],
        'Mocks: State Machine', journeysProgressLine(journeys) + ' · ' + journeyQuestionCounts(jn, journeys) + '\n' + look.look,
        look.then)
      return
    }
  }
}

function printThemeStep() {
  const composed = Object.keys(status.directions || {})
  if (composed.length < 2) {
    const title = composed.length === 0
      ? 'compose theme directions — the seed\'s dense screen per direction, a second screen at most; derive 2-3 candidates, then ASK which to compose'
      : 'compose another theme direction — at least 2 are required before a pick'
    printStepBlock('THEME', title,
      ['design/mocks/seed.md', 'design/mocks/canon.md', 'design/mocks/references/', 'docs/design/research-brief.md'],
      'Mocks: State Machine', 'directions composed: ' + (composed.join(', ') || 'none'),
      [driverCmd('--mark direction-composed --direction <kebab>')])
    return
  }
  const look = lookLineAndThen('theme-picked', 'theme', (pick) => driverCmd('--mark theme-picked --direction ' + pick))
  printStepBlock('THEME', 'pick the theme — reject every other composed direction by name',
    ['design/mocks/seed.md', 'design/mocks/ledger.md'],
    'Mocks: State Machine', 'composed: ' + composed.join(', ') + '\n' + look.look,
    look.then)
}

// D6: SIGNOFF is one look over the atlas index — the terminal `approved` mark is the one
// sign-off, replacing REVIEW one-for-one minus the decider ceremony (the decider now comes from
// the sign-off stop's own "by", set by handleApproved). Unlike every other look-gated step, D6
// pins the Then: line to the literal `--mark approved` regardless of the stop's own state (the
// `look:` progress line still varies — none/waiting/change/approved — the same as any other
// look-gated step; only the Then: command itself is unconditional here).
function printSignoffStep() {
  const look = lookLineAndThen('approved', 'signoff', () => driverCmd('--mark approved'))
  printStepBlock('SIGNOFF', 'sign off — the product I understand',
    ['design/atlas/index.html'], 'Mocks: State Machine',
    'Approval means "this is the product I understand" — the written brief, not these screens, holds scope.' + '\n' + look.look,
    [driverCmd('--mark approved')])
}

function printApprovedTerminal() {
  writeOut(1, '[mocks-driver] state: APPROVED  root: ' + root + '\n\n## Step: done — every journey approved, theme "' +
    status.theme + '" picked, signed off by ' + status.decider + '\nnext: /spec:genesis\n')
  process.exit(0)
}

function doBareStep() {
  const state = deriveState()
  if ((AUTHORING_STATES.has(state) || state === 'SIGNOFF') && status.look !== 'browser' && !probeOk()) {
    dieProbeFailed()
  }
  if (state === 'SEED') return printSeedStep()
  if (state === 'SHAPES') return printShapesStep()
  if (state === 'WIREFRAMES') return printWireframesStep()
  if (state === 'THEME') return printThemeStep()
  if (state === 'SIGNOFF') return printSignoffStep()
  return printApprovedTerminal()
}

// ---------------------------------------------------------------------------
// frontend-design skill check (doctrine/mocks.md § Mocks: Authoring Rules). Every authoring
// step block carries skillLine(); `skill-check` prints it alone (sketch's setup runs it). Never
// blocks: exit 0 on every outcome. Probe: `claude plugin list --json` (same read as
// init-gen.js probe D7); the CLI absent or unparseable is reported, never guessed installed.
// ---------------------------------------------------------------------------
function probeSkill() {
  const r = spawnSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf8' })
  if (r.error) return { unavailable: 'no-claude-cli' }
  let rows
  try { rows = JSON.parse(r.stdout) } catch { return { unavailable: 'unparseable-plugin-list' } }
  if (!Array.isArray(rows)) return { unavailable: 'unparseable-plugin-list' }
  const row = rows.find((x) => x && typeof x.id === 'string' && x.id.split('@')[0] === 'frontend-design')
  if (!row) return { installed: false }
  return { installed: true, enabled: row.enabled !== false }
}
function skillLine() {
  const p = probeSkill()
  if (p.installed && p.enabled) return '🎨 Load the `frontend-design` skill (Skill tool) before the first edit — every mock is authored under it'
  if (p.installed) return '⚠️ frontend-design skill installed but disabled — authoring without it; enable: /plugin (toggle frontend-design)'
  if (p.unavailable) return '⚠️ frontend-design skill could not be verified (' + p.unavailable + ') — load it via the Skill tool if present; install: /plugin install frontend-design'
  return '⚠️ frontend-design skill not installed — authoring without it; install: /plugin install frontend-design'
}
function cmdSkillCheck() { writeOut(1, skillLine() + '\n'); process.exit(0) }

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------
// D2: `--decider` is retired outright — on ANY invocation (bare or `--mark`) it exits 2, never a
// silent no-op. The sign-off stop's own "by" is the decider now (handleApproved).
if (rest.includes('--decider')) {
  die('--decider is retired — the sign-off stop\'s "by" is the decider')
}
if (rest[0] === 'skill-check') {
  cmdSkillCheck()
} else if (rest[0] === 'ledger') {
  cmdLedger(rest[1], rest.slice(2))
} else if (rest[0] === 'notes') {
  cmdNotes(rest[1], rest.slice(2))
} else if (rest[0] === 'look-probe') {
  cmdLookProbe()
} else if (rest[0] === 'look-via') {
  cmdLookVia(rest[1])
} else if (rest[0] === 'look') {
  cmdLook(rest[1], rest.slice(2))
} else if (rest[0] === 'stop' && rest[1] === 'open') {
  cmdStopOpen(rest[2], rest.slice(3))
} else if (rest[0] === 'stop' && rest[1] === 'decide') {
  cmdStopDecide(rest[2], rest.slice(3))
} else if (rest[0] === 'stop') {
  die('stop: unknown subcommand "' + rest[1] + '" — one of: open, decide')
} else {
  const REOPEN = flagArg(rest, '--reopen')
  const MARK = flagArg(rest, '--mark')
  const STATE_ONLY = rest.includes('--state')
  if (REOPEN) {
    doReopen(REOPEN)
  } else if (MARK) {
    doMark(MARK, {
      journey: flagArg(rest, '--journey'),
      direction: flagArg(rest, '--direction'),
      shape: flagArg(rest, '--shape'),
    })
  } else if (STATE_ONLY) {
    writeOut(1, deriveState() + '\n')
    process.exit(0)
  } else {
    doBareStep()
  }
}
