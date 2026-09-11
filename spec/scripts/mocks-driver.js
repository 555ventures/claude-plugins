#!/usr/bin/env node
// mocks-driver.js [--root <dir>] [--state]
// mocks-driver.js --root <dir> --mark <mark> [--journey <j>] [--shape <k>]
// mocks-driver.js --root <dir> --reopen journey:<j>|walk:<j>|shapes|kit|theme
// mocks-driver.js --root <dir> ledger (add|set|catch|check|counts|ask) [flags]
// mocks-driver.js --root <dir> ledger add --id <i> --step <s> --kind <k> --claim <c> [--tag <t>]
//                              [--status <st>] [--rejected <r>] [--dependents <d>] [--note <n>]
//                              [--screen <label>]
// mocks-driver.js --root <dir> ledger ask --id <rowId> --screen <label>
// mocks-driver.js --root <dir> notes open
// mocks-driver.js --root <dir> notes add --scope mock|project [--screen <label>] [--state <s>]
//                              --by <name> [--reason <r>] --text "<t>"
// mocks-driver.js --root <dir> notes add --scope mock --screen <label> --state <s> --kind walk
//                              --reason <break> --by <name> --text "<t>"
// mocks-driver.js --root <dir> notes address --id <id> --change "<what changed>" [--ledger <rowId>]
//                              [--port <n>]   (--port is required on a client-origin mock-scope note)
// mocks-driver.js --root <dir> notes reply --id <id> --text "<question back>"
// mocks-driver.js --root <dir> notes waive --id <id> --reason "<r>" [--by <who>]
// mocks-driver.js --root <dir> client open --address <url>
// mocks-driver.js --root <dir> client waive --journey <j> --reason "<r>"
// mocks-driver.js --root <dir> client log [--journey <j>]
// mocks-driver.js --root <dir> look <label> [--state <s>] [--out <png>] [--port <n>]
// mocks-driver.js --root <dir> look-probe | look-via <playwright|browser>
// mocks-driver.js --root <dir> stop open <step> [--port <n>]   shapes | kit | journey:<j> | signoff
// mocks-driver.js --root <dir> stop decide <P…> --verdict pick|approve|change [--pick <g>] [--note <n>] --by <who>
// mocks-driver.js --root <dir> theme state
// mocks-driver.js --root <dir> theme compose --direction <kebab>
// mocks-driver.js --root <dir> theme shortlist --directions <a,b[,c]> [--port <n>]
// mocks-driver.js --root <dir> --mark theme-picked [--direction <kebab>]
//
// specs/20260907/06-theme-pick-moves-to-sketch.md: `theme state|compose` is a SECOND theme
// producer that lives entirely outside the mocks state machine above — `/spec:sketch`'s own
// first run, not a mocks stage. `state` derives absent/picked from design/tokens.css alone
// (refusing outright when it is the wireframe gray register byte-for-byte) and writes nothing,
// not even status.json; `compose` validates one design/theme/<kebab>/ candidate (the signed-off
// kit re-rendered at production fidelity, plus specs/20260910/04's own D2 role-completeness leg)
// against design/kit/'s own primitive set.
// specs/20260910/04-theme-before-the-client-walk.md (ADR-0013) reinstates `/spec:mocks`'s own
// THEME state between WALK and CLIENT: `theme shortlist` opens a client-facing pick stop over the
// seed's own dense screens (never the kit page `theme open` — now retired — opened), and
// `--mark theme-picked` (the `theme adopt` — now retired — body verbatim, plus the mocks-state
// write adopt never had) adopts the client's pick and advances the chain. `--reopen theme` is
// this path's own reopen, unlike the pre-existing `theme state`/`theme compose` pair above (which
// still has none — they live outside the state machine, D1's "no state-machine step" rationale
// unchanged for them).
//
// specs/20260907/10-client-review.md D1/ADR-0012: CLIENT is the state that follows WALK, the
// served journey pages, exposed by the user, where a client answers product questions and
// leaves notes; `client open --address <url>` records the address once the exposed serve answers
// its own `/client/__notes/list` (D2), and the terminal `--mark approved` still closes on the
// ledger and the notes alone (D9), unchanged in every precondition. D3/D4: a note's `origin`
// (walk|client|session) is decided by the route it arrived on — `/client/__notes/*` stamps
// "client", `/__notes/*` stamps "session", `notes add --kind walk` stamps "walk" — never by a
// typed name. D5/D6: a client's mock-scope note captures its screen at raise
// (lib/client-capture.js, the look command's own URL form and first-declared viewport); D7:
// `notes address --port <n>` re-captures and refuses when the hash is unchanged, else stores the
// after image and moves the note to "addressed". D8: `notes waive --id --reason` releases a
// client-origin note or a question after seven days of client silence — a question's ledger row
// becomes `waived <date>`, printed by `--mark approved` (D9/D10) before the checkpoint line.
//
// specs/20260910/03-client-journey-player.md D7: `--mark approved` additionally refuses (before
// the ledger gate) while any seed journey is neither confirmed nor waived in design/mocks/
// walk.json (lib/mocks-walk.js's isClosed) — `client waive --journey <j> --reason "<r>"` is the
// remedy the refusal names, mirroring `notes waive`'s own seven-day-silence clock but over a
// whole journey; `client log [--journey <j>]` prints each journey's confirmed sentence or its
// reached/total count, then its misses grouped and counted. The accepted `approved` tail gains
// one `client: <j> — "<sentence>"` line per confirmed journey and a `waived journeys: <n>` line,
// both before the existing `waived: N` (notes) line.
//
// WHY: specs/20260902/07-mocks-command-driver.md — `/spec:mocks` is the standalone design
// stage; this driver derives SEED -> SHAPES -> KIT -> WIREFRAMES -> WALK -> THEME -> CLIENT ->
// APPROVED on every invocation from `design/mocks/status.json` plus the artifacts actually on
// disk (a recorded mark whose artifact vanished is demanded again), prints exactly one step,
// gates every advancing mark on the provenance ledger (spec 06, lib/mocks-ledger.js), and
// checkpoints every accepted mark so a run survives any number of `/clear`s (the genesis driver's
// discipline verbatim — spec/scripts/genesis-driver.js). specs/20260906/02-mocks-ends-at-wireframes.md
// retires the SKIN and REVIEW states along with the `journey-skinned`, `review-opened`,
// `journey-reviewed` marks and the `--decider` flag. specs/20260910/04-theme-before-the-client-walk.md
// (ADR-0013) reinstates THEME between WALK and CLIENT — the client picks it now, from the user's
// own shortlist over the seed's two dense screens, `theme shortlist` + `--mark theme-picked`; the
// terminal `approved` mark is still the one sign-off — it stamps every top-level mock
// `data-status="approved"` itself and records the decider from the sign-off stop's own "by".
//
// specs/20260907/04-kit-canon-family.md D1: `KIT` sits between `SHAPES` and `WIREFRAMES`,
// gated on `marks.kitSignedOff` exactly like every other step in the chain. `--mark kit-signed`
// (D7) requires a decided `kit-signed` look stop, a non-empty `design/kit/`, and a passing
// `design-atlas.js check design/kit`; `--reopen kit` (D10) clears the sign-off and the terminal
// approval only, never a journey's own approval, and `--reopen shapes` widens to clear it too
// (a re-picked shape invalidates whatever the kit was authored against).
//
// specs/20260905/04-per-project-look-server.md D3: `stop open <step> [--port <n>]` derives the
// candidate set for the step's look from disk and delegates to design-atlas.js (sibling path,
// never spec-paths) `stop open`, printing only the verified link plus the fixed reply line;
// `stop decide` passes an id + verdict straight through to the same script (the chat channel for
// a decision, `--by chat`). There is no per-machine hub — each project serves its own look stops
// (specs/20260905/02's design-review-hub-and-look-stops.md D6-D8 established the delegation
// shape; spec 04 retargets it at design-atlas.js). The three gated marks (shape-picked,
// journey-approved, approved) read their verdict from the newest non-superseded
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
// specs/20260906/06-sketch-high-fidelity-and-critique.md D3/D4: `notes add` is the one CLI writer
// of a plain (non-question) note — a client message on the page routes through it with its own
// `--by`. It refuses `--scope mock` with no `--screen`, and an unknown `--reason` (naming the
// eight-value plain enum via lib/mocks-notes.js's own validation); `notes open` renders a
// `by: "critic"` note's reason as `[critic: <reason>]` alongside its existing status tag.
// specs/20260907/08-walk-critic.md D4 narrows `--kind`/`--ledger-id`: `--kind` now accepts only
// `walk` (any other value, `question` included, refuses naming `ledger add --screen` as the
// remedy — questions are session-authored, never client- or critic-authored); `--ledger-id` stays
// refused outright, walk or not. A walk add additionally requires `--screen`/`--state`/`--reason`;
// the screen must have a `design/mocks/<label>.html` on disk and the state must be `default` or a
// `data-state-btn="<s>"` the mock itself declares, else it is refused naming the states the screen
// does declare — the journey itself is never typed or stored (groupOpen() derives it from
// seed.md). `notes open` renders a walk finding's reason as its own `[walk: <reason>]` tag,
// beside (never instead of) the status tag.
//
// specs/20260910/06-real-records-and-two-dense-screens.md D1/D2/D3: `## Dense screens` (plural)
// carries one or two `- <label>` lines, each already declared in a journey — `seed-done` refuses
// zero lines, more than two, or an undeclared label; the singular `## Dense screen` heading with
// one line still parses (legacy hosts, AC-20260910-06-5). D2: `## Records` names one
// `- <entity>: records/<entity>.json` line per entity the product handles — `seed-done` refuses
// a missing section, a `- none` line, or a records file that is missing, non-array, or holds
// fewer than three objects, naming the entity and the client-ask remedy; when the seed's own text
// carries no entity to name (section missing or `- none`), the entity named in the refusal falls
// back to whatever `design/mocks/records/*.json` already holds on disk, so the remedy is never
// silent about which file to author. D3: `journey-drawn` collects every declared entity's record
// values (`lib/mock-seed-checks.js` `recordValues`) and, after the D1/D2 edge-gap check above,
// warns per screen carrying no record value and refuses the whole journey when no screen carries
// one — never before the edge-gap check, so a placeholder-drawn journey is refused for its
// missing controls first.
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
//   - migrate a legacy status.json: a root checkpointed at SKIN or REVIEW derives WIREFRAMES from
//     its still-live marks on the very next invocation; the retired fields it still carries are
//     ignored on read and dropped on the next write — there is nothing to migrate. A root already
//     past THEME (marks.themePicked set) derives CLIENT the same way; D3's own legacy path
//     (`--mark theme-picked --direction <k>` with no stop, design/tokens.css already byte-equal)
//     is the one exception that DOES write — the one true migration this driver performs, for the
//     two hosts that picked a theme before this state existed at all.
//   - open a tunnel or expose anything itself (D2): `client open --address <url>` only probes
//     and records an address the session has already exposed on its own.
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
//      accepted `--mark` (theme-picked included) recorded its result and printed the checkpoint
//      line, a `--reopen` (theme included) printed what it invalidated, a ledger/look/notes
//      subcommand succeeded, `stop open` printed the link + reply line, `stop decide` recorded a
//      decision, `theme state` printed `absent` or `picked`, `theme compose`/`theme shortlist`
//      accepted its candidate(s), or `client open` recorded `status.client` and printed the open
//      line.
//   1  `ledger check` found a blocked gate (rows printed).
//   2  a refused mark (an unknown mark or the retired `--decider` flag included), a failed
//      precondition (missing artifact, blocked gate, unreachable look probe, undeclared/undrawn
//      journey for `stop open`, a `look --state` value the mock does not declare), a usage error,
//      `ledger check` grammar errors, a dead child process (runChild's fail-closed refusal),
//      `theme state` naming design/tokens.css as the wireframe gray register byte-for-byte,
//      `theme compose`/`theme shortlist` refusing a candidate direction (a D2 violation, the
//      two-direction floor, or an undeclared dense screen), `--mark theme-picked` refusing a
//      missing/disagreeing/still-open theme-picked stop, a D2 violation, or the legacy path's own
//      unmatched tokens.css, `theme open`/`theme adopt` (retired — both always exit 2 naming their
//      replacement), `client open` outside CLIENT / with no `--address` / against an address whose
//      `/client/__notes/list` never answers, `notes address` on a client-origin note with no
//      `--port` or an unchanged re-capture, `notes address` on a client-origin project-scope note,
//      or `notes waive` on a note that is neither client-origin nor a question, already resolved,
//      or not yet silent seven days.
//   3  `stop open`/`stop decide` failed inside design-atlas.js itself (its own stderr forwarded).

'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')
const { runChild, writeOut } = require('./lib/driver-io')
const { parseLedger, gateVerdict, countsLine, appendAssumption, appendCatch, setStatus } = require('./lib/mocks-ledger')
const {
  readNotes, writeNotes, addNote, addressNote, replyNote, groupOpen, unresolvedFor, WALK_REASONS,
  originOf, waiveNote,
} = require('./lib/mocks-notes')
const clientCaptureLib = require('./lib/client-capture')
// specs/20260910/03-client-journey-player.md D4/D7: the one reader/writer of design/mocks/
// walk.json and its pure per-journey transforms — `client waive`/`client log` and the `approved`
// gate's new precondition all share it, never hand-parsing the file themselves.
const walkLib = require('./lib/mocks-walk')
const picksLib = require('./lib/mocks-picks.js')
const shellLib = require('./lib/shell-region')
const { stylesheetTargets, linksWireRegister } = require('./lib/wire-register')
const { parseSeedJourneys } = require('./lib/surfaces')
const { edgeGaps, recordValues, recordHits } = require('./lib/mock-seed-checks')

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
    marks: { seedDone: null, shapePicked: null, kitSignedOff: null, canonWritten: null, themePicked: null, approved: null },
    shape: null, decider: null, look: 'playwright',
    journeys: {}, reopens: [], lastUpdated: null,
  }
}

// D1: a status.json written by a pre-20260906/02 driver may still carry `marks.reviewOpened` and
// `journeys[j].skinned`/`.reviewed` (the retired SKIN/REVIEW marks) — these are read and then
// discarded in memory so state derivation never sees them and the next save never writes them
// back. specs/20260910/04-theme-before-the-client-walk.md D3 (ADR-0013) reinstates
// `marks.themePicked` and top-level `theme` as LIVE fields (merged forward by loadStatus's own
// Object.assign, never dropped here); `directions` stays dropped — the retired mocks-driver THEME
// step's own candidate-discovery field, superseded by this spec's fresh-from-disk `--directions`
// argument. `decider` stays a live top-level field (the terminal `approved` mark still sets it
// from the sign-off stop's own "by"), so it is never stripped either.
function dropLegacyFields(merged) {
  delete merged.marks.reviewOpened
  delete merged.directions
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
  merged.reopens = Array.isArray(raw.reopens) ? raw.reopens : []
  return dropLegacyFields(merged)
}

function saveStatus() {
  status.schemaVersion = 1
  status.state = deriveState()
  status.lastUpdated = nowIso()
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n')
}

// specs/20260907/06-theme-pick-moves-to-sketch.md D1: `theme state` is a read-only derivation
// over design/tokens.css alone — it must write nothing at all, not even design/mocks/status.json
// (loadStatus() below creates that file, plus ledger.md/seed.md, the instant it runs on a cold
// root). So this one subcommand is dispatched HERE, before `let status = loadStatus()` ever
// executes, and never touches mocksDir/ledgerPath/statusPath itself. `compose`/`open`/`adopt`
// need no such guarantee (their own Contracts name only tokens.css/ledger.md/picks.json as
// writes) and are dispatched normally, after status is loaded, alongside every other subcommand.
function cmdThemeState() {
  const tokensCssPath = path.join(root, 'design/tokens.css')
  if (!fs.existsSync(tokensCssPath)) { writeOut(1, 'absent\n'); process.exit(0) }
  let written
  try { written = fs.readFileSync(tokensCssPath) } catch (e) { die('design/tokens.css could not be read: ' + e.message) }
  const template = fs.readFileSync(path.join(templatesDir, 'mocks', 'wire-tokens.css'))
  if (Buffer.compare(written, template) === 0) {
    die('design/tokens.css is the wireframe gray register byte-for-byte — no theme was ever picked; compose candidate directions, then run: theme open')
  }
  writeOut(1, 'picked\n')
  process.exit(0)
}
if (rest[0] === 'theme' && rest[1] === 'state') cmdThemeState()

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

// D1: `## Dense screens` (plural) carries one or two `- <label>` lines; a host still on the
// singular `## Dense screen` heading (one line) keeps parsing — `sectionOf`'s anchored `\s*$`
// match never confuses the two headings (the plural's trailing "s" fails the singular's regex
// and vice versa), so the plural section is tried first and the singular is a pure fallback.
function parseDenseScreens(text) {
  const plural = sectionOf(text, 'Dense screens')
  const sec = plural !== null ? plural : (sectionOf(text, 'Dense screen') || '')
  const out = []
  for (const raw of sec.split('\n')) {
    const line = raw.trim()
    const m = line.match(/^- (.+)$/)
    if (m) out.push(m[1].trim())
  }
  return out
}

// D2: the records directory listing (`design/mocks/records/*.json` basenames) — the fallback
// entity source for a `## Records` refusal when the seed's own text names no entity at all (the
// section is missing, or its one line is `- none`), so the refusal still names a concrete file to
// author instead of a bare "no entity declared".
function recordsDir() { return path.join(mocksDir, 'records') }
function existingRecordEntities() {
  let files = []
  try { files = fs.readdirSync(recordsDir()).filter((f) => f.endsWith('.json')) } catch { return [] }
  return files.map((f) => path.basename(f, '.json')).sort()
}

// D2: `## Records` — one `- <entity>: records/<entity>.json` line per entity; `- none` parses as
// declaring zero entities (never as an entity named "none"). Returns { missing, entities } where
// `entities` is a Map(entity -> relative path).
function parseRecordsSection(text) {
  const sec = sectionOf(text, 'Records')
  const entities = new Map()
  if (sec === null) return { missing: true, entities }
  for (const raw of sec.split('\n')) {
    const line = raw.trim()
    if (!line || line === '- none') continue
    const m = line.match(/^- ([a-z0-9-]+):\s*(\S+)$/)
    if (m) entities.set(m[1], m[2])
  }
  return { missing: false, entities }
}

// D2: refuses seed-done on a missing ## Records section, a "- none"-only section, or a records
// file that is missing, not valid JSON, not an array, or shorter than three objects — naming the
// entity and the client-ask remedy every branch shares.
function requireRecords(text) {
  const { missing, entities } = parseRecordsSection(text)
  if (missing || entities.size === 0) {
    const entity = existingRecordEntities()[0]
    if (!entity) {
      die('design/mocks/seed.md is missing "## Records" — add one "- <entity>: records/<entity>.json" line per entity the product handles, then ask the client for three real <entity> records and save them as design/mocks/records/<entity>.json')
    }
    die('design/mocks/seed.md ## Records must declare "' + entity + '" — ask the client for three real ' +
      entity + ' records and save them as design/mocks/records/' + entity + '.json')
  }
  for (const [entity, relPath] of entities) {
    const remedy = 'ask the client for three real ' + entity + ' records and save them as design/mocks/records/' + entity + '.json'
    const filePath = path.join(mocksDir, relPath)
    let raw
    try { raw = fs.readFileSync(filePath, 'utf8') } catch {
      die('design/mocks/seed.md ## Records names "' + entity + '" but ' + relPath + ' does not exist — ' + remedy)
    }
    let parsed
    try { parsed = JSON.parse(raw) } catch (e) {
      die('design/mocks/seed.md ## Records names "' + entity + '" but ' + relPath + ' is not valid JSON (' + e.message + ') — ' + remedy)
    }
    if (!Array.isArray(parsed)) die('design/mocks/seed.md ## Records names "' + entity + '" but ' + relPath + ' does not hold a JSON array — ' + remedy)
    if (parsed.length < 3) {
      die('design/mocks/seed.md ## Records names "' + entity + '" but ' + relPath + ' holds only ' +
        parsed.length + ' record(s) (three are required) — ' + remedy)
    }
  }
}

// D3: every entity's record values, combined and deduplicated — the values `journey-drawn`
// screens a journey's screens against. Missing/invalid records files contribute nothing here
// (that precondition is `seed-done`'s job, via requireRecords above); this is a read-only
// derivation over whatever is currently on disk.
function collectRecordValues(text) {
  const { entities } = parseRecordsSection(text)
  const values = []
  for (const relPath of entities.values()) {
    let parsed
    try { parsed = JSON.parse(fs.readFileSync(path.join(mocksDir, relPath), 'utf8')) } catch { continue }
    if (!Array.isArray(parsed)) continue
    for (const v of recordValues(parsed)) if (!values.includes(v)) values.push(v)
  }
  return values
}

function seedTextOr(fallback) {
  try { return fs.readFileSync(seedPath, 'utf8') } catch { return fallback }
}
function currentSeedJourneys() { return parseJourneysSeed(stripComments(seedTextOr(''))) }

function loadTargetsOrNull() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'design/targets.json'), 'utf8')) } catch { return null }
}

// D5: the same viewport rule lib/review-page.js's viewportOf(loadTargets(root)) derives — the
// first declared design/targets.json viewport, 1280×800 when none — restated over this driver's
// own root-relative loadTargetsOrNull() rather than importing the served-page library.
function captureViewport() {
  const targets = loadTargetsOrNull()
  const vp = targets && Array.isArray(targets.viewports) && targets.viewports[0]
  return {
    width: vp && vp.width > 0 ? vp.width | 0 : 1280,
    height: vp && vp.height > 0 ? vp.height | 0 : 800,
  }
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
// rows and the remedy — journey-drawn never calls this.
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

// specs/20260910/03-client-journey-player.md D4/D7: design/mocks/walk.json's one reader —
// {journeys:{}} on a cold root is a valid starting point (lib/mocks-walk.js's own readWalk
// posture), a malformed file is a hard refusal naming the remedy, same shape as notesOrEmpty.
function readWalkOrEmpty() {
  try { return walkLib.readWalk(root) } catch (e) { die('design/mocks/walk.json is not valid JSON (' + e.message + ') — restore it from git history, or delete it (no walk record is a valid starting point) and re-run') }
  return { journeys: {} } // unreachable
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
// specs/20260906/06 D4: a critic note's reason renders as its own "[critic: <blindspot>]" tag,
// alongside (never instead of) the existing status tag. specs/20260907/08-walk-critic.md D5: a
// walk finding renders its own "[walk: <reason>]" tag the same way, beside (never instead of)
// the status tag — the two tags are mutually exclusive on `kind`, never both, so a walk note
// authored `--by critic` still renders exactly one reason tag, not the same reason twice.
function noteLine(n, indent) {
  let line = indent + n.id + ' [' + noteTag(n) + ']'
  if (n.kind === 'walk' && n.reason) line += ' [walk: ' + n.reason + ']'
  else if (n.by === 'critic' && n.reason) line += ' [critic: ' + n.reason + ']'
  line += ' ' + n.by + ' · ' + n.text
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
  if (sub === 'add') {
    // specs/20260907/08-walk-critic.md D4: the refusal narrows to "--kind accepts only walk" —
    // `--ledger-id` stays refused outright, and any `--kind` other than "walk" (question included)
    // refuses the same way, naming `ledger add --screen` as the one remedy for a question.
    const kindArg = narg('--kind')
    if (narg('--ledger-id') != null || (kindArg != null && kindArg !== 'walk')) {
      die('notes add: --kind accepts only "walk" — questions come from `ledger add --screen`')
    }
    if (!narg('--by')) die('notes add: --by <name> is required')
    const screenArg = narg('--screen')
    const stateArg = narg('--state')
    const reasonArg = narg('--reason')
    if (kindArg === 'walk') {
      // D4: the journey is never typed and never stored — groupOpen() already derives it from
      // seed.md. The two halves a machine CAN check (screen on disk, state declared) are checked
      // against disk here; the third (--reason) is left to addNote's own WALK_REASONS validation.
      if (!screenArg) die('notes add: --screen <label> is required for --kind walk')
      const file = mockFile(screenArg)
      if (!fs.existsSync(file)) die('notes add: design/mocks/' + screenArg + '.html does not exist')
      // AC-20260907-08-6: resolve the screen's declared states BEFORE checking --state at all, so
      // a missing --state refuses naming the same list the undeclared-state branch below prints —
      // never a bare "is required" with no remedy.
      const html = fs.readFileSync(file, 'utf8')
      const declared = [...new Set([...html.matchAll(/data-state-btn\s*=\s*"([^"]+)"/g)].map((mm) => mm[1]))]
      const allowed = ['default', ...declared]
      if (!stateArg) {
        die('notes add: --state <s> is required for --kind walk — use --state <one of: ' + allowed.join(', ') + '>')
      }
      if (!allowed.includes(stateArg)) {
        die('notes add: state "' + stateArg + '" is not declared by design/mocks/' + screenArg +
          '.html — use --state <one of: ' + allowed.join(', ') + '>')
      }
      if (!reasonArg) {
        die('notes add: --reason <break> is required for --kind walk — use --reason <one of: ' + WALK_REASONS.join('|') + '>')
      }
    }
    const notes = notesOrEmpty()
    let result
    try {
      result = addNote(notes, {
        scope: narg('--scope'), screen: screenArg, state: stateArg,
        by: narg('--by'), reason: reasonArg, text: narg('--text'),
        kind: kindArg === 'walk' ? 'walk' : undefined,
      })
    } catch (e) { die('notes add: ' + e.message) }
    writeNotes(root, result.notes)
    writeOut(1, 'notes add: ' + result.note.id + ' → added\n')
    process.exit(0)
  }
  if (sub === 'address') {
    const id = narg('--id')
    const change = narg('--change')
    const ledgerRow = narg('--ledger')
    const port = narg('--port')
    if (!id) die('notes address: --id <id> is required')
    if (!change) die('notes address: --change "<what changed>" is required')
    const notes = notesOrEmpty()
    const found = notes.find((n) => n.id === id)
    if (!found) die('notes address: no note with id "' + id + '"')
    // specs/20260907/10-client-review.md D7: a client-origin note re-captures through D5 before
    // it can be addressed — every other note (session-origin, walk, or --port simply omitted on
    // a note this driver has no capture opinion about) carries no capture field at all.
    if (originOf(found) === 'client' && found.scope === 'mock') {
      if (!port) die('notes address: a client-origin mock-scope note requires --port <n> — run `node ' + designAtlasBin + ' serve --root ' + root + ' --port <n>` first')
      const capturesDir = path.join(mocksDir, 'captures')
      fs.mkdirSync(capturesDir, { recursive: true })
      const outPath = path.join(capturesDir, id + '.after.png')
      clientCaptureLib.captureScreen({
        port, label: found.screen, state: found.state || null, viewport: captureViewport(), out: outPath,
      }).then((captured) => {
        const beforeHash = found.capture && found.capture.before && found.capture.before.hash
        if (captured.hash === beforeHash) {
          try { fs.unlinkSync(outPath) } catch { /* best effort */ }
          die('notes address: the screen has not changed — a client note closes on a visible change, a reply (`notes reply`), a client withdrawal, or a waiver (`notes waive`)')
          return
        }
        let result
        try {
          result = addressNote(notes, id, { change, ledgerRow, capture: { hash: captured.hash, file: 'captures/' + id + '.after.png' } })
        } catch (e) { die('notes address: ' + e.message) }
        writeNotes(root, result.notes)
        writeOut(1, 'notes address: ' + id + ' → addressed\n')
        process.exit(0)
      }).catch((e) => {
        try { fs.unlinkSync(outPath) } catch { /* best effort */ }
        die('notes address: re-capture failed: ' + e.message)
      })
      return
    }
    if (originOf(found) === 'client' && found.scope === 'project') {
      die('notes address: a client-origin project-scope note is never addressed — the only closures are acceptance (through the client route) or a waiver (`notes waive`)')
    }
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
  if (sub === 'waive') {
    // specs/20260907/10-client-review.md D8: the one release for a silent client — refused
    // (exit 2) on a note that is neither client-origin nor a question, already resolved, or not
    // yet silent seven full days; the seven-day clock itself is measured by
    // lib/mocks-notes.js's waiveNote — this command only derives WHERE that clock starts.
    const id = narg('--id')
    const reason = narg('--reason')
    const by = narg('--by') || 'session'
    if (!id) die('notes waive: --id <id> is required')
    if (!reason) die('notes waive: --reason "<r>" is required')
    const notes = notesOrEmpty()
    const found = notes.find((n) => n.id === id)
    if (!found) die('notes waive: no note with id "' + id + '"')
    const isQuestion = found.kind === 'question'
    const isClientOrigin = originOf(found) === 'client'
    if (!isQuestion && !isClientOrigin) {
      die('notes waive: only client-origin notes and questions are waivable (note "' + id + '" is kind "' +
        (found.kind || 'note') + '", origin "' + originOf(found) + '")')
    }
    if (found.status === 'resolved') die('notes waive: note "' + id + '" is already resolved')
    let lastClientAt
    if (isQuestion) {
      const openedAt = status.client && status.client.openedAt
      if (!openedAt) die('notes waive: no client has ever been opened for this project — run `client open --address <url>` first')
      lastClientAt = found.at > openedAt ? found.at : openedAt
    } else {
      lastClientAt = found.lastClientAt || found.at
    }
    let result
    try {
      result = waiveNote(notes, id, { reason, by, now: new Date(), lastClientAt })
    } catch (e) { die('notes waive: ' + e.message) }
    if (isQuestion) {
      let out
      try { out = setStatus(ledgerTextOrDie(), found.ledgerId, 'waived ' + todayIso()) } catch (e) { die('notes waive: ' + e.message) }
      fs.writeFileSync(ledgerPath, out)
    }
    writeNotes(root, result.notes)
    writeOut(1, 'notes waive: ' + id + ' → waived\n')
    process.exit(0)
  }
  die('notes: no "' + sub + '" subcommand — resolving a note happens only on the served page ' +
    '(the Resolve button); one of: open, add, address, reply, waive')
}

// ---------------------------------------------------------------------------
// client open --address <url> (D2). The plugin never exposes anything itself — this only probes
// an address the session has already exposed on its own (ADR-0012, memory: hub base is optional,
// never ask for Tailscale).
// ---------------------------------------------------------------------------
function probeClientNotesList(address, scheme) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const mod = scheme === 'https:' ? require('https') : http
    let req
    try {
      req = mod.get(address + '/client/__notes/list', { timeout: 3000 }, (res) => {
        let raw = ''
        res.on('data', (c) => { raw += c })
        res.on('end', () => {
          if (res.statusCode !== 200) { finish(false); return }
          try { finish(Array.isArray(JSON.parse(raw))) } catch { finish(false) }
        })
      })
    } catch { finish(false); return }
    req.on('timeout', () => { req.destroy(); finish(false) })
    req.on('error', () => finish(false))
  })
}

// specs/20260910/03-client-journey-player.md D7: `client waive --journey <j> --reason <r>` —
// the whole-journey counterpart to `notes waive`, over the SAME `status.client.openedAt` floor
// (A3: a journey the client never opened is silent from `client open`, never from its own first
// event) — lib/mocks-walk.js's waiveJourney runs the actual seven-day clock; this command only
// derives WHERE that clock starts and reports its own refusal/acceptance.
function cmdClientWaive(args) {
  const journey = flagArg(args, '--journey')
  const reason = flagArg(args, '--reason')
  const by = flagArg(args, '--by') || 'session'
  if (!journey) die('client waive: --journey <j> is required')
  if (!reason) die('client waive: --reason "<r>" is required')
  const openedAt = status.client && status.client.openedAt
  if (!openedAt) die('client waive: no client has ever been opened for this project — run `client open --address <url>` first')
  let result
  try {
    result = walkLib.waiveJourney(readWalkOrEmpty(), { journey, reason, by, now: new Date(), openedAt })
  } catch (e) { die('client waive: ' + e.message) }
  walkLib.writeWalk(root, result)
  writeOut(1, 'client waive: ' + journey + ' → waived\n')
  process.exit(0)
}

// specs/20260910/03-client-journey-player.md D7: the one-line-per-journey status form `client
// log` and the CLIENT step block both print — `confirmed <date> — "<sentence>"` once the client
// has confirmed, else `open — reached <n>/<total>`.
function journeyWalkStatusLine(jn, rec, total) {
  if (rec && rec.confirmedAt) return jn + ': confirmed ' + String(rec.confirmedAt).slice(0, 10) + ' — "' + (rec.sentence || '') + '"'
  return jn + ': open — reached ' + ((rec && rec.reached) || []).length + '/' + total
}

// specs/20260910/03-client-journey-player.md D7: `client log [--journey <j>]` — the misses and
// the sentence are the two signals the client pass exists to collect; this prints them exactly
// where the session already looks, grouped/counted by {from,target} pair, first-seen order.
function cmdClientLog(args) {
  const only = flagArg(args, '--journey')
  const walk = readWalkOrEmpty()
  for (const [jn, j] of currentSeedJourneys()) {
    if (only && jn !== only) continue
    const rec = (walk.journeys || {})[jn] || { reached: [], misses: [], confirmedAt: null, sentence: null }
    writeOut(1, journeyWalkStatusLine(jn, rec, j.labels.length) + '\n')
    const groups = new Map() // insertion-ordered "from target" -> count
    for (const m of rec.misses || []) {
      const key = JSON.stringify([m.from, m.target])
      groups.set(key, (groups.get(key) || 0) + 1)
    }
    for (const [key, count] of groups) {
      const [from, target] = JSON.parse(key)
      writeOut(1, '  ' + from + ': ' + target + ' (' + count + '×)\n')
    }
  }
  process.exit(0)
}

function cmdClient(sub, args) {
  if (sub === 'waive') return cmdClientWaive(args)
  if (sub === 'log') return cmdClientLog(args)
  if (sub !== 'open') die('client: unknown subcommand "' + sub + '" — one of: open, waive, log')
  const state = deriveState()
  if (state !== 'CLIENT') {
    die('client open: the state is "' + state + '", not CLIENT — client open only runs once every journey is walked, before approval')
  }
  const addressArg = flagArg(args, '--address')
  if (!addressArg) die('client open: --address <url> is required')
  const address = addressArg.replace(/\/+$/, '')
  // Scheme is normalized once (WHATWG URL lowercases protocol) ahead of both the guard below and
  // the transport selection in probeClientNotesList — checking address.startsWith('https:') twice
  // let an uppercase scheme (e.g. "HTTPS://") pass the guard but pick the wrong http/https module.
  let scheme
  try { scheme = new URL(address).protocol } catch { scheme = null }
  if (scheme !== 'http:' && scheme !== 'https:') {
    die('client open: --address <url> must start with "http:" or "https:" (got "' + address + '")')
  }
  probeClientNotesList(address, scheme).then((ok) => {
    if (!ok) {
      die('client open: ' + address + '/client/__notes/list did not answer 200 with a JSON array within 3s — run `node ' +
        designAtlasBin + ' serve --root ' + root + '` (or your own server) and expose it yourself — the plugin never opens a tunnel')
      return
    }
    status.client = { address, openedAt: nowIso() }
    saveStatus()
    writeOut(1, 'client: open — ' + address + '/client/index.html\n')
    process.exit(0)
  })
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

// specs/20260907/04-kit-canon-family.md D7: `stop open kit`'s candidate derivation — one
// candidate per design/kit/*.html file, "<name>=kit/<name>.html".
function buildKitStopSpec() {
  const kitDir = path.join(root, 'design/kit')
  const files = shellLib.htmlFilesIn(kitDir)
  if (!files.length) die('stop open kit: design/kit/ holds no .html file — author the kit page first')
  const kebabs = files.map((f) => path.basename(f, '.html')).sort()
  return {
    kind: 'approve', key: 'kit-signed', title: 'sign off the kit',
    candidates: kebabs.map((k) => ({ group: null, label: k, path: 'kit/' + k + '.html' })),
  }
}

function buildSignoffStopSpec() {
  return {
    kind: 'approve', key: 'approved', title: 'sign off',
    candidates: allDeclaredLabels().map((l) => ({ group: null, label: l, path: 'mocks/' + l + '.html' })),
  }
}

function buildStopSpec(step) {
  if (step === 'shapes') return buildShapesStopSpec()
  if (step === 'kit') return buildKitStopSpec()
  if (step === 'signoff') return buildSignoffStopSpec()
  let m
  if ((m = /^journey:(.+)$/.exec(step))) return buildJourneyStopSpec(m[1])
  die('stop open: unknown step "' + step + '" — one of: shapes, kit, journey:<j>, signoff')
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
// specs/20260907/08-walk-critic.md D1: mirrors allJourneysApproved byte-for-byte in shape —
// false on an empty seed, false while any declared journey lacks journeys[j].walked.
function allJourneysWalked() {
  const journeys = currentSeedJourneys()
  if (journeys.size === 0) return false
  for (const [jn] of journeys) { const st = status.journeys[jn]; if (!st || !st.walked) return false }
  return true
}
// D1: SEED -> SHAPES -> KIT (`!marks.kitSignedOff`) -> WIREFRAMES -> WALK -> THEME
// (`!marks.themePicked`) -> CLIENT (`!marks.approved`) -> APPROVED — SKIN and REVIEW stay
// retired. specs/20260910/04-theme-before-the-client-walk.md D3 (ADR-0013) reinstates THEME
// between WALK and CLIENT: once every journey is walked, the state is THEME until
// `marks.themePicked` is set (by `--mark theme-picked`), then CLIENT.
// specs/20260907/04-kit-canon-family.md D1: KIT sits between SHAPES and WIREFRAMES, gated on one
// mark exactly like every other step in this chain — never on design/kit/ existing on disk, so a
// half-authored kit never silently advances the state. specs/20260907/08-walk-critic.md D1: WALK
// sits between WIREFRAMES and THEME, gated the same monotone way — a journey declared after the
// others were walked reopens WALK, never THEME/CLIENT, so nothing written after the client review
// can drag the chain backwards.
function deriveState() {
  if (!status.marks.seedDone) return 'SEED'
  if (!shapeValid()) return 'SHAPES'
  if (!status.marks.kitSignedOff) return 'KIT'
  if (!(status.marks.canonWritten && allJourneysApproved())) return 'WIREFRAMES'
  if (!allJourneysWalked()) return 'WALK'
  if (!status.marks.themePicked) return 'THEME'
  if (!status.marks.approved) return 'CLIENT'
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

  const denseScreens = parseDenseScreens(text)
  if (denseScreens.length === 0) {
    die('design/mocks/seed.md ## Dense screens has 0 lines — name one or two labels already declared in a journey')
  }
  if (denseScreens.length > 2) {
    die('design/mocks/seed.md ## Dense screens has ' + denseScreens.length + ' lines — one or two labels are allowed')
  }
  for (const label of denseScreens) {
    if (!labelOwners.has(label)) die('design/mocks/seed.md ## Dense screens names "' + label + '" which is not declared in a journey')
  }

  requireRecords(text)

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
  const denseScreens = parseDenseScreens(text)
  const journeys = parseJourneysSeed(text)
  const allLabels = new Set()
  for (const [, j] of journeys) for (const l of j.labels) allLabels.add(l)
  for (const f of files) {
    const html = fs.readFileSync(path.join(shapesDir, f), 'utf8')
    const label = labelOf(html)
    if (!label || (!denseScreens.includes(label) && !allLabels.has(label))) die(f + ': data-screen-label must equal a dense screen or a declared journey label')
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

// specs/20260907/04-kit-canon-family.md D7: `--mark kit-signed` requires a decided look stop
// keyed kit-signed, requires design/kit/ to hold at least one .html file, and requires
// design-atlas.js check design/kit to exit 0 — in that order, so the refusal always names the
// most immediate missing precondition. spec/doctrine/mocks.md "The gate rides every advancing
// mark" lists kit-signed among the gated marks, so this opens with requireGateOpen() exactly as
// handleShapePicked does.
function handleKitSignedOff() {
  requireGateOpen()
  const stop = requireStopDecision('kit-signed', 'stop open kit')
  const kitDir = path.join(root, 'design/kit')
  const files = shellLib.htmlFilesIn(kitDir)
  if (!files.length) die('design/kit/ holds no .html file — author the kit page first')
  const r = runDesignAtlasCheck([kitDir])
  if (r.status !== 0) die('design-atlas.js check design/kit failed: ' + childOutput(r))
  status.marks.kitSignedOff = nowIso()
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
  status.journeys[j] = Object.assign({ drawn: null, approved: null, walked: null }, status.journeys[j] || {})
  return status.journeys[j]
}

// specs/20260908/07-one-wire-register-predicate.md D6: journey-drawn's two "must link the
// register" checks below read lib/wire-register.js's stylesheetTargets(html) instead of a bare
// substring scan of the whole page — a commented-out mention stops satisfying the check, and a
// register applied only through CSS @import starts satisfying it. Built via the RegExp
// constructor (a plain string, no regex-literal escaping) so this file's own source never spells
// the escaped wire/ separator the consistency pin bans — AC-20260908-07-7.
const WIRE_TOKENS_CSS_RE = new RegExp('(^|/)wire/tokens\\.css$')
const WIRE_WIRE_CSS_RE = new RegExp('(^|/)wire/wire\\.css$')

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
    if (!stylesheetTargets(html).some((t) => WIRE_TOKENS_CSS_RE.test(t))) die(file + ': does not link ../wire/tokens.css' + atlasSuffix)
    if (!stylesheetTargets(html).some((t) => WIRE_WIRE_CSS_RE.test(t))) die(file + ': does not link ../wire/wire.css' + atlasSuffix)
    if (r.status !== 0) die(file + ': design-atlas.js check failed for label "' + label + '": ' + childOutput(r))
  }
  // specs/20260910/02-click-to-advance-and-real-records.md D1/D2: every seed edge needs a
  // matching data-to control and every data-to must name a screen declared in ANY seed
  // journey — edges come from lib/surfaces.js's parseSeedJourneys (A1: this driver's own
  // parseJourneysSeed stays labels-only), never mocks-driver.js's own parser. `declared` is the
  // repo-wide union of every seed journey's labels, computed here (not in the library) since
  // only this driver knows the full journey set — a `data-to` naming a screen owned by a
  // DIFFERENT seed journey is still a real, drawable edge and must not refuse. The screens
  // scanned and the `missing` loop stay this journey's own `j.labels`. Runs after the per-label
  // closure checks above and before check --states (the same posture the states gate already
  // has), and never records journeys.<j>.drawn on a refusal.
  const allSeedJourneys = parseSeedJourneys(seedTextOr(null))
  const surfJourney = allSeedJourneys.get(journeyName)
  const declared = []
  for (const jrn of allSeedJourneys.values()) {
    for (const label of jrn.labels) if (!declared.includes(label)) declared.push(label)
  }
  const gaps = edgeGaps({ labels: j.labels, edges: surfJourney ? surfJourney.edges : [], declared },
    (label) => { try { return fs.readFileSync(mockFile(label), 'utf8') } catch { return '' } })
  if (gaps.missing.length || gaps.unknown.length) {
    const lines = []
    for (const g of gaps.missing) {
      lines.push(g.from + '.html: no control carries data-to="' + g.to + '" — the seed edge ' +
        g.from + ' -> ' + g.to + ' has no clickable path; add data-to="' + g.to +
        '" to the control that leads there')
    }
    for (const g of gaps.unknown) {
      lines.push(g.from + '.html: data-to="' + g.to + '" names a screen no journey declares')
    }
    die(lines.join('\n') + '\nre-mark journey-drawn --journey ' + journeyName)
  }
  // specs/20260910/06-real-records-and-two-dense-screens.md D3: runs after the edge-gap check
  // above (a placeholder-drawn journey is refused for its missing controls first). Every
  // declared entity's record values (collectRecordValues, over lib/mock-seed-checks.js's
  // recordValues) are screened against each of the journey's own top-level mocks; a screen with
  // zero hits warns (never refuses — a settings screen legitimately shows no record) and the
  // whole journey refuses only when every screen has zero hits.
  const recordVals = collectRecordValues(stripComments(seedTextOr('')))
  if (recordVals.length) {
    const warnLines = []
    let anyHit = false
    for (const label of j.labels) {
      const html = fs.readFileSync(mockFile(label), 'utf8')
      if (recordHits(recordVals, html).length) anyHit = true
      else warnLines.push('⚠️ ' + label + ': carries none of the client\'s records')
    }
    if (!anyHit) {
      die('journey "' + journeyName + '": no screen carries a value from design/mocks/records/*.json — ' +
        'draw with the client\'s own data, then re-mark')
    }
    for (const line of warnLines) writeOut(1, line + '\n')
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
  // specs/20260907/04-kit-canon-family.md D9: once a kit family resolves, every content region of
  // this journey's own screens must already be kit-tagged or bespoke-marked — --matrix forces the
  // D5 stamp gate's violation tier onto these mocks even though journey-approved's mocks sit at
  // data-status="sketch" (A3). Bound only when a kit family actually resolves above these mocks
  // (D5's absence-invariant — the same resolveCanonDir walk-up `check` itself uses, so a
  // design/kit/ sitting above `root` binds here exactly as it binds `check`).
  if (shellLib.resolveCanonDir(mocksDir, 'kit')) {
    const journeyLabelFiles = (j ? j.labels : []).map(mockFile)
    const kitRes = runDesignAtlasCheck(['--matrix', ...journeyLabelFiles])
    if (kitRes.status !== 0) {
      die(childOutput(kitRes) + '\ninstantiate the missing kit primitive(s), or mark the region data-bespoke, then re-mark')
    }
  }
  requireRenderGateMocks((j ? j.labels : []).map((l) => mockFile(l)), journeyName)
  const stop = requireStopDecision('journey-approved:' + journeyName, 'stop open journey:' + journeyName)
  st.approved = nowIso()
  consumeStopAndSave(stop.id)
}

// specs/20260907/08-walk-critic.md D2: an OPEN (not addressed, not resolved) kind:"walk" note
// anchored to one of `labels` — deliberately narrower than lib/mocks-notes.js's own
// unresolvedFor (which also counts "addressed" as unresolved for the terminal `approved` gate):
// `notes address` is exactly how the session closes a walk finding for THIS gate, so an addressed
// finding must stop blocking journey-walked even though it still blocks approved.
function openWalkFindingsFor(labels) {
  const set = new Set(labels || [])
  return notesOrEmpty().filter((n) => n.kind === 'walk' && n.status === 'open' && set.has(n.screen))
}

// D2: --mark journey-walked --journey <j> — refuses with no --journey, an undeclared journey, an
// unapproved journey (naming journey-approved --journey <j>), or an open walk finding anchored to
// one of the journey's declared labels (naming each id and the notes-address remedy). Runs no
// ledger gate and no render gate (Rationale: "walking finds questions, it does not resolve them",
// the same posture journey-drawn and direction-composed already have).
function handleJourneyWalked(journeyName) {
  if (!journeyName) die('--journey <name> is required')
  const journeys = currentSeedJourneys()
  const j = journeys.get(journeyName)
  if (!j) die('journey "' + journeyName + '" is not declared in design/mocks/seed.md')
  const st = status.journeys[journeyName]
  if (!st || !st.approved) die('journey "' + journeyName + '" is not approved — mark journey-approved --journey ' + journeyName + ' first')
  const open = openWalkFindingsFor(j.labels)
  if (open.length) {
    die('walk finding(s) still open on ' + journeyName + ': ' + open.map((n) => n.id).join(', ') +
      ' — record the fix with `notes address --id <id> --change "<what changed>"`')
  }
  ensureJourneyRecord(journeyName).walked = nowIso()
  saveStatus()
}

// ---------------------------------------------------------------------------
// specs/20260907/06-theme-pick-moves-to-sketch.md: `theme state`/`theme compose` — a SECOND
// theme producer, outside the mocks state machine above (`/spec:sketch`'s own legacy path for a
// host with no design/kit/ family at all). `theme state` is dispatched earlier, before `status`
// is even loaded (cmdThemeState).
// specs/20260910/04-theme-before-the-client-walk.md (ADR-0013) reinstates the mocks state
// machine's OWN theme producer between WALK and CLIENT: `composeViolations` below (D2, gained the
// role-completeness leg) backs both `theme compose` and the new `theme shortlist`/`--mark
// theme-picked` pair — `theme shortlist` opens the client's own pick stop over the seed's two
// dense screens, `handleThemePicked` (near handleApproved) reads and writes
// `status.marks.themePicked`/`status.theme`, and `--reopen theme` clears them. `theme open`/
// `theme adopt` (the atlas-kit pick and its adopt, specs/20260907/06's own originals) are retired
// outright — `cmdThemeOpen`/`cmdThemeAdopt` below always exit 2 naming their replacement.
// ---------------------------------------------------------------------------

// specs/20260908/07-one-wire-register-predicate.md D1/D5: linksWireRegister(html) below is
// lib/wire-register.js's shared authority, not a private copy — D2's "a `wire/` stylesheet link"
// (link/import-anchored, gated on a stylesheet rel, "wire" as a whole path segment never a `\b`
// boundary) is now read the same way by every call site instead of being spelled per consumer.

// D2: the one shared validator `compose`/`shortlist`/`--mark theme-picked` all run over a single
// candidate directory, in the Contracts block's exact refusal order. Returns `{ ok: true, count }`
// on success or `{ message }` (the exact refusal text, sans the `mocks-driver: ` prefix `die()`
// adds) on the first violation found.
// specs/20260910/04-theme-before-the-client-walk.md D2: every wire role wire-tokens.css declares
// under :root — read from the template at run time, never a hard-coded list — must be re-valued
// by the candidate's own tokens.css :root block. Reads only the FIRST `:root{…}` block (never the
// dark variant, which composeViolations does not otherwise gate) so a candidate whose light block
// drops a role still refuses even when the dark block happens to keep it.
function rootRoles(cssText) {
  const m = /:root\s*\{([^}]*)\}/.exec(cssText || '')
  if (!m) return []
  const roles = []
  const re = /--([a-zA-Z0-9-]+)\s*:/g
  let mm
  while ((mm = re.exec(m[1]))) if (!roles.includes(mm[1])) roles.push(mm[1])
  return roles
}

function composeViolations(kebab) {
  const kitDir = shellLib.resolveCanonDir(root, 'kit')
  if (!kitDir) return { message: 'design/kit/ does not exist — run /spec:mocks to KIT and sign the kit off first' }
  const dir = path.join(root, 'design/theme', kebab)
  const tokensCssPath = path.join(dir, 'tokens.css')
  if (!fs.existsSync(tokensCssPath)) return { message: 'design/theme/' + kebab + '/tokens.css does not exist' }
  const templateRoles = rootRoles(fs.readFileSync(path.join(templatesDir, 'mocks', 'wire-tokens.css'), 'utf8'))
  const candidateRoles = rootRoles(fs.readFileSync(tokensCssPath, 'utf8'))
  const missingRoles = templateRoles.filter((r) => !candidateRoles.includes(r))
  if (missingRoles.length) {
    return {
      message: 'design/theme/' + kebab + '/tokens.css: missing role(s) ' +
        missingRoles.map((r) => '--' + r).join(', ') + ' — every wire role must be re-valued',
    }
  }
  const kitHtmlPath = path.join(dir, 'kit.html')
  if (!fs.existsSync(kitHtmlPath)) return { message: 'design/theme/' + kebab + '/kit.html does not exist — re-render the kit in this direction\'s tokens' }
  const html = fs.readFileSync(kitHtmlPath, 'utf8')
  if (!shellLib.isKitCanonFile(html)) {
    return { message: 'design/theme/' + kebab + '/kit.html is not a kit canon page — its root must carry data-kit-canon before any data-screen-label' }
  }
  if (linksWireRegister(html)) {
    return { message: 'design/theme/' + kebab + '/kit.html links the wireframe register (wire/) — a candidate direction is the kit at production fidelity' }
  }
  const kitPrimitives = shellLib.kitPrimitivesInDir(kitDir)
  const themePrimitives = shellLib.kitPrimitivesInDir(dir)
  const missing = [...kitPrimitives.keys()].filter((k) => !themePrimitives.has(k))
  if (missing.length) {
    return { message: 'design/theme/' + kebab + '/kit.html omits primitive(s) ' + missing.join(', ') + ' — every primitive the kit names is re-rendered in every candidate direction' }
  }
  const r = runDesignAtlasCheck([dir])
  if (r.status !== 0) return { message: 'design-atlas.js check design/theme/' + kebab + ' failed: ' + childOutput(r) }
  const row = findAssumption((a) => a.kind === 'product' && a.tag === 'said-by-user' && a.status === 'confirmed' && a.claim === 'theme-directions: ' + kebab)
  if (!row) {
    return { message: 'design/mocks/ledger.md has no confirmed said-by-user product row with claim "theme-directions: ' + kebab + '" — record the direction interview pick first' }
  }
  return { ok: true, count: kitPrimitives.size }
}

// Every design/theme/<kebab>/ directory on disk, sorted — the discovery this whole family uses
// instead of status.directions (which belongs to the retired mocks THEME step alone).
function themeDirsOnDisk() {
  try {
    return fs.readdirSync(path.join(root, 'design/theme'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch { return [] }
}

function cmdThemeCompose(args) {
  const kebab = flagArg(args, '--direction')
  if (!kebab) die('theme compose: --direction <kebab> is required')
  const v = composeViolations(kebab)
  if (v.message) die(v.message)
  writeOut(1, '✅ direction "' + kebab + '" composes — ' + v.count + ' primitive(s) re-rendered\n')
  process.exit(0)
}

// specs/20260910/04-theme-before-the-client-walk.md D4 (ADR-0013): the client-facing shortlist —
// every named direction must compose (D2), at least two, then a `pick` stop over the seed's own
// dense screens (never the kit page — the client sees the product, not a kit) is opened on the
// client's own theme page. Retires `theme open` (the atlas-kit pick, below).
function cmdThemeShortlist(args) {
  const dirsArg = flagArg(args, '--directions')
  if (!dirsArg) die('theme shortlist: --directions <a,b[,c]> is required')
  const dirs = dirsArg.split(',').map((s) => s.trim()).filter(Boolean)
  for (const kebab of dirs) {
    const v = composeViolations(kebab)
    if (v.message) die(v.message)
  }
  if (dirs.length < 2) {
    die('theme shortlist: only ' + dirs.length + ' direction(s) named — at least 2 are required')
  }
  const denseScreens = parseDenseScreens(stripComments(seedTextOr('')))
  if (!denseScreens.length) {
    die('theme shortlist: design/mocks/seed.md declares no dense screen(s) — name one or two under ## Dense screens first')
  }
  // D4: one candidate per (direction × dense screen), directions in --directions order, dense
  // screens in seed order — direction-major, so a client scanning left to right compares one
  // direction across both screens before the next.
  const candidates = []
  for (const kebab of dirs) {
    for (const dense of denseScreens) candidates.push({ group: kebab, label: dense, path: 'mocks/' + dense + '.html?theme=' + kebab })
  }
  const spec = {
    kind: 'pick', key: 'theme-picked', title: 'pick the theme', candidates,
    // D4/D5: the client's own theme page, never the atlas index every other stop keeps.
    page: '/client/theme.html',
  }
  const port = flagArg(args, '--port')
  const url = runDesignAtlasStopOpen(spec, port)
  writeOut(1, '🎨 ready for review — ' + url + '\nReply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>\n')
  process.exit(0)
}

// D4: `theme open` (the atlas-kit pick) is retired outright — `theme shortlist` (above) replaces
// it, over the client's own dense screens rather than the kit page.
function cmdThemeOpen() {
  die('theme open is retired — the client picks over the seed\'s own dense screens now: `theme shortlist --directions <a,b[,c]>`')
}

// D6: `theme adopt` is retired outright — its byte-copy/ledger-append/supersede mechanics live on
// verbatim as `--mark theme-picked`'s handler (handleThemePicked, below), which additionally sets
// the mocks-state mark and `status.theme` that `theme adopt` never touched.
function cmdThemeAdopt() {
  die('theme adopt is retired — `--mark theme-picked` adopts now (the same ledger/tokens.css discipline, plus the mocks-state mark)')
}

// specs/20260910/04-theme-before-the-client-walk.md D6 (ADR-0013): `--mark theme-picked
// [--direction <k>]` — requires the decided `theme-picked` stop (remedy `theme shortlist`), a
// `--direction` that disagrees refuses; then the retired `theme adopt`'s own body verbatim
// (compose check, supersede other `theme:` rows, append the confirmed said-by-user `theme: <k>`
// row naming the rejected siblings, copy tokens.css byte-for-byte), plus the mocks-state write
// `theme adopt` never had: `status.marks.themePicked` and `status.theme`.
// D3/AC-20260910-04-9: the legacy path — a host with no stop at all (it picked at sketch, before
// this spec existed) accepts `--direction <k>` with no stop when design/tokens.css is already
// present, NON-wire (byte-different from the wire template — D3's own "present and non-wire"
// precondition, never inferred from the direction's own tokens.css alone), and byte-equal to
// design/theme/<k>/tokens.css, skipping the compose/ledger/copy work since there is nothing left
// to write; any other no-stop shape (no `--direction`, still the wire template, an unmatched byte
// compare) refuses naming `theme shortlist` — the one remedy for "you have not really picked yet".
function handleThemePicked(directionArg) {
  const stop = liveStopFor('theme-picked')
  if (!stop) {
    if (!directionArg) die('no look stop for theme-picked — run `theme shortlist` first')
    const tokensCssPath = path.join(root, 'design/tokens.css')
    if (!fs.existsSync(tokensCssPath)) die('no look stop for theme-picked — run `theme shortlist` first')
    const written = fs.readFileSync(tokensCssPath)
    const wireTemplate = fs.readFileSync(path.join(templatesDir, 'mocks', 'wire-tokens.css'))
    if (Buffer.compare(written, wireTemplate) === 0) {
      die('design/tokens.css is the wireframe gray register byte-for-byte — no theme was ever picked; run `theme shortlist` first')
    }
    const candidatePath = path.join(root, 'design/theme', directionArg, 'tokens.css')
    if (!fs.existsSync(candidatePath)) die('design/theme/' + directionArg + '/tokens.css does not exist')
    const candidate = fs.readFileSync(candidatePath)
    if (Buffer.compare(written, candidate) !== 0) {
      die('design/tokens.css does not match design/theme/' + directionArg + '/tokens.css byte-for-byte — run `theme shortlist` first')
    }
    status.marks.themePicked = nowIso()
    status.theme = directionArg
    saveStatus()
    return
  }
  if (stop.status === 'open') die('waiting on ' + stop.url + ' — the decision has not been taken yet')
  if (stop.decision.verdict === 'change') {
    die('change requested by ' + stop.decision.by + ': "' + stop.decision.note + '"' +
      ' — address it, then `theme shortlist`')
  }
  const pick = stop.decision.pick
  if (directionArg && directionArg !== pick) die('--direction ' + directionArg + ' disagrees with the page pick "' + pick + '" (stop ' + stop.id + ')')
  const kebab = pick
  const v = composeViolations(kebab)
  if (v.message) die(v.message)
  // Review finding (specs/20260907/06 build, inherited verbatim): "every other composed
  // direction" means every sibling that itself composes, not every directory merely present on
  // disk — a stale or half-authored design/theme/<k>/ that never passed D2 must not be recorded
  // as rejected.
  const others = themeDirsOnDisk().filter((k) => k !== kebab).filter((k) => composeViolations(k).ok)

  // D10/D12 (specs/20260907/06 review rulings, inherited verbatim): the whole ledger update below
  // is a sequence of pure string transforms on one in-memory `text`, followed by a single
  // fs.writeFileSync — a throw partway through leaves the file untouched. An incomplete/stale
  // "theme: <kebab>" row is superseded, never a dead end; adopting <kebab> ALSO supersedes every
  // OTHER confirmed "theme: <other>" row — exactly one confirmed theme: row must exist across all
  // directions at any time. `sameRows` is every confirmed same-kebab row, not just the first, so
  // re-picking `<kebab>` collapses all of them; the fresh row's id is computed AFTER every
  // supersede write, so ids never collide.
  let text = ledgerTextOrDie()
  const parsed = parseLedger(text)
  const isConfirmedThemeRow = (a) => a.kind === 'product' && a.tag === 'said-by-user' && a.status === 'confirmed' && a.claim.startsWith('theme: ')
  const confirmedThemeRows = parsed.assumptions.filter(isConfirmedThemeRow)
  const sameRows = confirmedThemeRows.filter((a) => a.claim === 'theme: ' + kebab)
  const crossRows = confirmedThemeRows.filter((a) => a.claim !== 'theme: ' + kebab)
  const rejectedTokens = sameRows.length === 1 ? (sameRows[0].rejected || '').split(/[,\s]+/).filter(Boolean) : []
  const missing = sameRows.length === 1 ? others.filter((o) => !rejectedTokens.includes(o)) : []
  const sameRowsNeedSupersede = sameRows.length !== 1 || missing.length > 0
  const needsFreshRow = sameRowsNeedSupersede

  try {
    if (sameRowsNeedSupersede) for (const same of sameRows) text = setStatus(text, same.id, 'overridden ' + todayIso())
    for (const cross of crossRows) text = setStatus(text, cross.id, 'overridden ' + todayIso())
    if (needsFreshRow) {
      text = appendAssumption(text, {
        id: nextLedgerId(parseLedger(text)), step: 'SKETCH', kind: 'product',
        claim: 'theme: ' + kebab, tag: 'said-by-user', status: 'confirmed ' + todayIso(),
        rejected: others.join(', '), note: stop.decision.note || 'picked on the page',
      })
    }
  } catch (e) { die('could not update the theme ledger row(s): ' + e.message) }
  if (needsFreshRow || crossRows.length) fs.writeFileSync(ledgerPath, text)

  fs.copyFileSync(path.join(root, 'design/theme', kebab, 'tokens.css'), path.join(root, 'design/tokens.css'))
  status.marks.themePicked = nowIso()
  status.theme = kebab
  consumeStopAndSave(stop.id)
}

// D5: `approved` is the one sign-off — SKIN and REVIEW (and the journey-skinned/review-opened/
// journey-reviewed marks that gated them) are retired.
// `approved` requires every declared journey approved, notes resolved, a decided `approved` stop,
// and the existing render-gate/matrix checks; on accept it is the mark's OWN write that stamps
// every top-level mock `data-status="approved"` (attribute-only, byte-identical otherwise) and
// records the decider from the stop's own "by" — there is no precondition that a mock already
// carry data-status="approved" (D5 rationale: with no review loop nobody would ever set it by
// hand).
function handleApproved() {
  for (const [jn] of currentSeedJourneys()) {
    const st = status.journeys[jn]
    if (!st || !st.approved) die('journey "' + jn + '" is not approved — mark journey-approved --journey ' + jn + ' first')
  }
  // specs/20260906/03: notes gate (question-aware) runs before requireGateOpen — same ordering
  // reason as handleJourneyApproved above.
  requireNotesResolved(allDeclaredLabels(), null)
  // specs/20260910/03-client-journey-player.md D7: every seed journey must be confirmed by the
  // client, or waived after seven days of silence, before the ledger gate ever runs.
  {
    const walk = readWalkOrEmpty()
    for (const [jn] of currentSeedJourneys()) {
      if (!walkLib.isClosed(walk, jn)) {
        die('journey "' + jn + '" is not confirmed by the client — the client walks it to the end and confirms on ' +
          '/client/walk/' + jn + '.html, or after seven days: client waive --journey ' + jn + ' --reason "<r>"')
      }
    }
  }
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
// D9: the accepted `approved` mark prints `waived: N` and one `  <id> — <reason>` line per
// waived note (a waived client note or a waived question both count — the note's own `waived`
// field is set by D8's waiveNote either way), before the checkpoint line — every other mark's
// tail prints only the counts line and the checkpoint line, unchanged.
function printAcceptedTail(prev, next, mark) {
  const parsed = parseLedger(ledgerTextOrDie())
  writeOut(1, countsLine(parsed) + '\n\n')
  if (mark === 'approved') {
    // specs/20260910/03-client-journey-player.md D7: one `client: <j> — "<sentence>"` line per
    // confirmed seed journey, then `waived journeys: <n>`, both before the existing waived-notes
    // block below.
    const walk = readWalkOrEmpty()
    let waivedJourneys = 0
    for (const [jn] of currentSeedJourneys()) {
      const rec = (walk.journeys || {})[jn]
      if (rec && rec.confirmedAt) writeOut(1, 'client: ' + jn + ' — "' + (rec.sentence || '') + '"\n')
      if (rec && rec.waived) waivedJourneys++
    }
    writeOut(1, 'waived journeys: ' + waivedJourneys + '\n\n')

    const waived = notesOrEmpty().filter((n) => n.waived != null)
    writeOut(1, 'waived: ' + waived.length + '\n')
    for (const n of waived) writeOut(1, '  ' + n.id + ' — ' + n.waived.reason + '\n')
    writeOut(1, '\n')
  }
  writeOut(1, '✅ checkpoint — mocks state saved (' + prev + ' → ' + next + '); safe to /clear and re-run /spec:mocks\n')
  process.exit(0)
}

function doMark(mark, opts) {
  const prevState = deriveState()
  switch (mark) {
    case 'seed-done': handleSeedDone(); break
    case 'shape-picked': handleShapePicked(opts.shape); break
    case 'kit-signed': handleKitSignedOff(); break
    case 'canon-written': handleCanonWritten(); break
    case 'journey-drawn': handleJourneyDrawn(opts.journey); break
    case 'journey-approved': handleJourneyApproved(opts.journey); break
    case 'journey-walked': handleJourneyWalked(opts.journey); break
    case 'theme-picked': handleThemePicked(opts.direction); break
    case 'approved': handleApproved(); break
    default: die('unknown mark "' + mark + '" — one of: seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, journey-walked, theme-picked, approved')
  }
  const nextState = deriveState()
  printAcceptedTail(prevState, nextState, mark)
}

// ---------------------------------------------------------------------------
// --reopen (D11) — clears marks, deletes nothing on disk.
// ---------------------------------------------------------------------------
// D7: `--reopen` never deletes and never over-clears.
function doReopen(target) {
  const at = nowIso()
  let m
  // specs/20260907/08-walk-critic.md D6: `--reopen walk:<j>` — clears that journey's `walked`,
  // `marks.approved` and `decider`, leaves `journeys[j].approved` and every other journey
  // untouched (a redraw is what invalidates approval; a walk finding alone never does).
  if ((m = /^walk:(.+)$/.exec(target))) {
    const j = m[1]
    ensureJourneyRecord(j).walked = null
    status.marks.approved = null
    status.decider = null
    const invalidated = ['walk:' + j, 'approved(all)']
    status.reopens.push({ at, target: 'walk:' + j, invalidated })
    saveStatus()
    writeOut(1, '↩ reopened walk:' + j + ' — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else if ((m = /^journey:(.+)$/.exec(target))) {
    const j = m[1]
    const st = ensureJourneyRecord(j)
    st.approved = null
    // D6: a redrawn journey is a different journey to walk — --reopen journey:<j> cascades into
    // the walk exactly as it already cascades into approved.
    st.walked = null
    status.marks.approved = null
    status.decider = null
    const invalidated = ['approved', 'walk:' + j, 'approved(all)']
    status.reopens.push({ at, target: 'journey:' + j, invalidated })
    saveStatus()
    writeOut(1, '↩ reopened journey:' + j + ' — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else if (target === 'shapes') {
    status.shape = null
    status.marks.shapePicked = null
    // specs/20260907/04-kit-canon-family.md D10: `--reopen shapes` additionally clears
    // marks.kitSignedOff — KIT sits after SHAPES in the chain, so a re-picked shape invalidates
    // whatever the kit was authored against.
    status.marks.kitSignedOff = null
    status.marks.canonWritten = null
    for (const j of Object.keys(status.journeys || {})) {
      const st = status.journeys[j]
      st.drawn = null; st.approved = null
      // specs/20260907/08-walk-critic.md D6: `--reopen shapes` additionally clears every
      // journey's `walked` — a re-picked shape invalidates whatever every screen was walked as.
      st.walked = null
    }
    status.decider = null
    status.marks.approved = null
    const invalidated = ['shape', 'canon', 'kit', 'journeys(all)', 'walk(all)', 'approved(all)']
    status.reopens.push({ at, target: 'shapes', invalidated })
    saveStatus()
    writeOut(1, '↩ reopened shapes — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else if (target === 'kit') {
    status.marks.kitSignedOff = null
    status.marks.approved = null
    status.decider = null
    const invalidated = ['kit', 'approved(all)']
    status.reopens.push({ at, target: 'kit', invalidated })
    saveStatus()
    writeOut(1, '↩ reopened kit — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else if (target === 'theme') {
    // specs/20260910/04-theme-before-the-client-walk.md D3 (ADR-0013): clears themePicked plus
    // the same approved(all)/decider cascade every other reopen already carries — a re-picked
    // theme invalidates whatever was signed off in the old look.
    status.marks.themePicked = null
    status.marks.approved = null
    status.decider = null
    const invalidated = ['theme', 'approved(all)']
    status.reopens.push({ at, target: 'theme', invalidated })
    saveStatus()
    writeOut(1, '↩ reopened theme — invalidated: ' + invalidated.join(', ') + '\n')
    process.exit(0)
  } else {
    die('--reopen must be journey:<j>, walk:<j>, shapes, kit, or theme')
  }
}

// ---------------------------------------------------------------------------
// ledger subcommand (D14).
// ---------------------------------------------------------------------------
// specs/20260906/03-questions-on-the-wireframe.md D2: the shared refusal checks `ledger add
// --screen` and `ledger ask` both run before pinning a row as a question — a process row is
// never a question, a said-by-user/ratified-doc row has nothing to ask, and the screen must be
// one the seed actually declares.
function refuseUnaskable(prefix, kind, tag, screenArg, stateArg) {
  if (stateArg) die(prefix + ': --state refused (ADR-0013: never a gray state)')
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
    const kind = larg('--kind')
    const tag = larg('--tag')
    const claim = larg('--claim')
    const id = larg('--id')
    if (screenArg) refuseUnaskable('ledger add', kind, tag, screenArg, larg('--state'))
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
        result = addNote(notes, { kind: 'question', ledgerId: id, scope: 'mock', screen: screenArg, state: null, text: claim, by: 'session' })
      } catch (e) { die('ledger add: ' + e.message) }
      writeNotes(root, result.notes)
    }
    process.exit(0)
  }
  if (sub === 'ask') {
    const id = larg('--id')
    const screenArg = larg('--screen')
    if (!id) die('ledger ask: --id <id> is required')
    if (!screenArg) die('ledger ask: --screen <label> is required')
    const parsed = parseLedger(ledgerTextOrDie())
    const row = parsed.assumptions.find((a) => a.id === id)
    if (!row) die('ledger ask: no assumption row "' + id + '" found')
    refuseUnaskable('ledger ask', row.kind, row.tag, screenArg, larg('--state'))
    if (row.status !== 'open') die('ledger ask: row "' + id + '" must be open (found "' + row.status + '")')
    const notes = notesOrEmpty()
    const already = notes.find((n) => n.kind === 'question' && n.ledgerId === id)
    if (already) die(id + ' is already a question on ' + already.screen)
    let result
    try {
      result = addNote(notes, { kind: 'question', ledgerId: id, scope: 'mock', screen: screenArg, state: null, text: row.claim, by: 'session' })
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
// (doBareStep) — CLIENT is not an authoring state (it asks the user to look, not to draw), so
// it prints no skill line even though its own look probe still runs.
// specs/20260910/04-theme-before-the-client-walk.md D3: THEME joins the set — authoring a
// direction's tokens/kit re-render is drawing, and its own look probe runs the same way.
const AUTHORING_STATES = new Set(['SHAPES', 'KIT', 'WIREFRAMES', 'THEME'])
function printStepBlock(state, title, readOnlyList, doctrineSection, progressLine, thenLines) {
  const lines = []
  lines.push('[mocks-driver] state: ' + state + '  root: ' + root)
  lines.push('(re-run this driver after completing the step; it verifies artifacts and prints the next one)')
  lines.push('')
  lines.push('## Step: ' + title)
  lines.push('Read only: ' + readOnlyList.join(', '))
  lines.push('Doctrine: spec/doctrine/mocks.md § ' + doctrineSection)
  lines.push('print: spec-paths shared-mocks --section "' + doctrineSection.replace(/^Mocks: /, '') + '"')
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

// specs/20260907/04-kit-canon-family.md D8: the KIT step's own printStepBlock invocation — the
// fixed instantiate-not-invent line is the authoring seed, and (like CLIENT's D10) the Then:
// command stays pinned to `--mark kit-signed` regardless of the look stop's own state; only the
// look: progress line varies (none/waiting/change/approved).
function printKitStep() {
  const look = lookLineAndThen('kit-signed', 'kit', () => driverCmd('--mark kit-signed'))
  printStepBlock('KIT', 'name the shared parts — one page, every state, before any screen',
    ['design/mocks/seed.md', 'design/shapes/<shape>.html'],
    'Mocks: State Machine',
    'Every wireframe is instantiated from this page — name a primitive once here or it gets invented once per screen.' + '\n' + look.look,
    [driverCmd('--mark kit-signed')])
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

// specs/20260907/08-walk-critic.md D7: WALK prints, for the first journey with no `walked`, the
// dispatch/notes-add/mark trio in order — a fresh design-critic dispatch, one `notes add --kind
// walk` per finding, then the mark itself. Deliberately no skill line (WALK is not in
// AUTHORING_STATES — it draws nothing) and doBareStep's look-probe precondition below gains no
// WALK disjunct — WALK opens no look stop and serves no page, so a machine with no browser must
// still be able to walk a journey.
function walkedCount(journeys) {
  let n = 0
  for (const [jn] of journeys) { const st = status.journeys[jn]; if (st && st.walked) n++ }
  return n
}
function printWalkStep() {
  const journeys = currentSeedJourneys()
  for (const [jn, j] of journeys) {
    const st = status.journeys[jn]
    if (st && st.walked) continue
    const openCount = openWalkFindingsFor(j.labels).length
    printStepBlock('WALK', 'walk journey ' + jn + ' — one fresh critic, flow breaks only',
      ['design/mocks/seed.md (## Journeys › ' + jn + ')', ...j.labels.map((l) => 'design/mocks/' + l + '.html')],
      'Mocks: State Machine',
      'walked: ' + walkedCount(journeys) + '/' + journeys.size + ' · open walk findings on ' + jn + ': ' + openCount,
      ["dispatch Agent {subagent_type: 'design-critic'} once for journey " + jn + ' — its mock paths and design/mocks/seed.md, never file contents',
        'record each finding: ' + driverCmd('notes add --scope mock --screen <label> --state <state> --kind walk --reason <break> --by walk-critic --text "<finding>"'),
        driverCmd('--mark journey-walked --journey ' + jn)])
    return
  }
}

// specs/20260910/04-theme-before-the-client-walk.md D3/Behavior: the THEME step's own
// printStepBlock invocation — author two or three directions, compose each, then open the
// client's shortlist; the Then: command stays `theme shortlist` (AC-20260910-04-3's own literal)
// regardless of how many directions are already composed on disk.
function printThemeStep() {
  printStepBlock('THEME', 'pick the theme — the client chooses from a shortlist you compose',
    ['design/mocks/seed.md (## Dense screens)', 'design/kit/kit.html', 'design/theme/<kebab>/'],
    'Mocks: State Machine', openRowsLine(),
    ['author two or three directions under design/theme/<kebab>/ (tokens.css re-valuing the eleven wire roles, plus kit.html)',
      driverCmd('theme compose --direction <kebab>'),
      driverCmd('theme shortlist --directions <a,b[,c]>')])
}

// D10: the client: progress line — "not opened" names the `client open --address <url>` command
// when `status.client` is absent; once present it derives its counts fresh from notes.json on
// every run rather than trusting anything cached. specs/20260907/10-client-review.md D10.
function clientNoteCounts() {
  const notes = notesOrEmpty()
  const clientNotes = notes.filter((n) => n.kind !== 'question' && originOf(n) === 'client')
  const open = clientNotes.filter((n) => n.status === 'open').length
  const addressed = clientNotes.filter((n) => n.status === 'addressed').length
  const waived = clientNotes.filter((n) => n.waived != null).length
  const unanswered = notes.filter((n) => n.kind === 'question' && n.answer == null).length
  return { open, addressed, waived, unanswered }
}
function clientLineFor() {
  if (!status.client) {
    return 'client: not opened — expose the served atlas yourself, then: ' + driverCmd('client open --address <url>')
  }
  const c = clientNoteCounts()
  return 'client: open since ' + String(status.client.openedAt).slice(0, 10) + ' — ' + status.client.address +
    '/client/index.html · client notes: ' + c.open + ' open · ' + c.addressed + ' addressed · ' + c.waived +
    ' waived · questions: ' + c.unanswered + ' unanswered'
}

// D10: CLIENT is one look over the atlas index — the terminal `approved` mark is the one
// sign-off, replacing the retired sign-off state one-for-one minus the decider ceremony (the
// decider now comes from the `approved` stop's own "by", set by handleApproved). Unlike every
// other look-gated step, D9's rationale pins the Then: line to the literal `--mark approved`
// regardless of the stop's own state (the `look:` progress line still varies —
// none/waiting/change/approved — the same as any other look-gated step; only the Then: command
// itself is unconditional here). The `approved` stop key and the `signoff` stop step NAME are
// both kept unchanged (D9 rationale — AC-20260907-08-12's pin and the `stop open` enumeration
// both still name "signoff").
// specs/20260910/03-client-journey-player.md D7: one journeyWalkStatusLine per seed journey,
// right beside the existing client-notes progress line — the same form `client log` prints.
function clientWalkLinesFor() {
  const walk = readWalkOrEmpty()
  const lines = []
  for (const [jn, j] of currentSeedJourneys()) {
    lines.push(journeyWalkStatusLine(jn, (walk.journeys || {})[jn], j.labels.length))
  }
  return lines.join('\n')
}

function printClientStep() {
  const look = lookLineAndThen('approved', 'signoff', () => driverCmd('--mark approved'))
  printStepBlock('CLIENT', 'client review — the product I understand',
    ['design/atlas/index.html', 'design/mocks/notes.json'], 'Mocks: State Machine',
    clientLineFor() + '\n' + clientWalkLinesFor() + '\n' +
    'Approval means "this is the product I understand" — the written brief, not these screens, holds scope.' + '\n' + look.look,
    [driverCmd('--mark approved')])
}

function printApprovedTerminal() {
  writeOut(1, '[mocks-driver] state: APPROVED  root: ' + root + '\n\n## Step: done — every journey approved, signed off by ' +
    status.decider + '\nnext: /spec:genesis\n')
  process.exit(0)
}

function doBareStep() {
  const state = deriveState()
  if ((AUTHORING_STATES.has(state) || state === 'CLIENT') && status.look !== 'browser' && !probeOk()) {
    dieProbeFailed()
  }
  if (state === 'SEED') return printSeedStep()
  if (state === 'SHAPES') return printShapesStep()
  if (state === 'KIT') return printKitStep()
  if (state === 'WIREFRAMES') return printWireframesStep()
  if (state === 'WALK') return printWalkStep()
  if (state === 'THEME') return printThemeStep()
  if (state === 'CLIENT') return printClientStep()
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
} else if (rest[0] === 'client') {
  cmdClient(rest[1], rest.slice(2))
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
} else if (rest[0] === 'theme' && rest[1] === 'compose') {
  cmdThemeCompose(rest.slice(2))
} else if (rest[0] === 'theme' && rest[1] === 'shortlist') {
  cmdThemeShortlist(rest.slice(2))
} else if (rest[0] === 'theme' && rest[1] === 'open') {
  cmdThemeOpen()
} else if (rest[0] === 'theme' && rest[1] === 'adopt') {
  cmdThemeAdopt()
} else if (rest[0] === 'theme') {
  die('theme: unknown subcommand "' + rest[1] + '" — one of: state, compose, shortlist')
} else {
  const REOPEN = flagArg(rest, '--reopen')
  const MARK = flagArg(rest, '--mark')
  const STATE_ONLY = rest.includes('--state')
  if (REOPEN) {
    doReopen(REOPEN)
  } else if (MARK) {
    doMark(MARK, {
      journey: flagArg(rest, '--journey'),
      shape: flagArg(rest, '--shape'),
      direction: flagArg(rest, '--direction'),
    })
  } else if (STATE_ONLY) {
    writeOut(1, deriveState() + '\n')
    process.exit(0)
  } else {
    doBareStep()
  }
}
