#!/usr/bin/env node
// genesis-driver.js [--root <dir>] [--mark <mark> [--file <path>]] [--state]
//
// WHY: specs/20260825/04-genesis-driver.md — genesis's architect stage was three phases
// of hand-performed choreography: run the coverage-audit gate,
// invoke registry-check.js per research menu, close the decision record, run the scaffold
// command, run the zero-day gate, close the roadmap — each a deterministic check a session could
// (and, measured, did) skip or fabricate while reporting success. Procedural hallucination is
// the largest agent-failure class (38.5%, agenticrail.nz). On specs/20260825/04-genesis-driver.md's
// contract, this script EXECUTES every one of those checks itself and prints only the ONE step
// that still needs the session's judgment (the interview, the picks, the ADRs, the day-zero
// skeleton, the roadmap decomposition). State is re-derived from `.claude/genesis/status.json`
// plus the artifacts actually on disk on EVERY invocation — a mark whose artifact vanished (a
// coverage answer edited back to `dark`, a menu file deleted) is demanded again, never trusted
// from the recorded mark alone. Every accepted mark prints a checkpoint line so a full genesis
// interview never has to fit inside one context window (D9): the session may /clear and
// re-invoke, and the driver picks up exactly where the disk says it left off.
//
// Every child process this driver spawns (registry-check.js, the descriptor's scaffoldCommand,
// the descriptor's gateCommand) is routed through one fail-closed helper, runChild: spawnSync's
// `status` is null when a child dies by signal, never spawns, or overflows maxBuffer (still true
// of any caller that captures output through a pipe via `encoding`, e.g. the registry-check.js
// call) — treating that null as a pass (or reading `.stdout` off a child that never ran) is the
// exact silent-success failure this driver exists to prevent. scaffoldCommand/gateCommand run
// through runShell, which streams the child's stdout+stderr straight to the log file's own fd
// instead of buffering it through a Node pipe: a real scaffold (create-next-app plus an install)
// routinely emits well over spawnSync's 1 MiB default maxBuffer, and a Node pipe at that ceiling
// SIGTERM-kills the child mid-run (ENOBUFS) before a single byte reaches the log — permanently
// bricking genesis on that project, since the truncated scaffold never completes and every re-run
// hits the identical wall (specs/20260825/04-genesis-driver.md). Streamed output can never
// overflow a buffer that does not exist in the parent; runChild's fail-closed guard for a
// genuine signal death or spawn failure is unchanged.
//
// What this deliberately does NOT do:
//   - hold the interview, write the picks, author the ADRs, land the skeleton, or decompose the
//     roadmap itself — those stay session judgment; the driver only closes them once they exist.
//   - assert a design or roadmap judgment as "correct" — its checks are closure checks on
//     artifacts (a key is not dark, a file parses, a Dissents section is non-empty, a dimension
//     is named somewhere, a roadmap has no cycle), never opinions on their content.
//   - relocate the session CWD, or touch any file outside `--root`'s `.claude/genesis/`,
//     `docs/roadmap/`, and whatever `scaffoldCommand`/`gateCommand` themselves write.
//   - run scaffoldCommand/gateCommand, or write status.json beyond `loadStatus()`'s own cold-root
//     creation, for a `--state` invocation: `--state` is a read-only peek at the derived state, so
//     it may report the transient driver-only states `SCAFFOLD`/`GATE` (D2's enum) that a bare
//     invocation never leaves standing, instead of running the command a bare invocation would.
//
// specs/20260827/01-genesis-tournament.md: between MENUS and DECIDE, five archetypes
// (web-app, realtime-trading, backend-api, mobile-app, desktop-app) gain a tournament —
// FINALISTS -> RACE (driver-only) -> PROBE -> PICK. The driver races 2-3 session-composed
// finalist stacks for real (scaffold, zero-day gate, boot through smoke.sh's own contract) into
// `.claude/genesis/tournament/finalists/<name>/`, hands the session one probe slice per finalist
// to build under a two-retry cap, re-runs gate+boot once the slice lands, and assembles a
// benchmark table + screenshot gallery. Executed evidence INFORMS the pick; `--mark picked`
// records whichever finalist the brief's own `## Picks` already names — the driver never ranks
// or chooses. The winner is re-scaffolded clean into the project root on `decided`: the probe
// slice was built under retry caps with no spec and no review, and must
// never become the project's foundation — `tournament/finalists/` and `tournament/logs/` are
// deleted once the decision record cites `benchmark.md`; `benchmark.json/.md`, `gallery.html`,
// and `evidence/` survive as the ADR's cited evidence. Every other archetype's MENUS -> DECIDE
// path is untouched and never creates `.claude/genesis/tournament/` at all.
//
// What the tournament deliberately does NOT do:
//   - render a screenshot itself, or judge a probe slice's quality — `probe.json` is
//     session-written; the driver only validates its shape (task coverage, retry cap, tokens)
//     and re-runs gate/boot as an executed fact.
//   - promote the raced copy under `tournament/finalists/<name>/` into the project root — the
//     winner's `scaffoldCommand` runs fresh in `--root` on `decided`; the raced directory is
//     always deleted, never moved.
//   - pick a winner from the benchmark numbers — `--mark picked` reads the winner off the
//     brief's own `## Picks`, matched against each finalist's `picks`; a benchmark with a clear
//     leader and a `## Picks` that names the other finalist still records THAT finalist as the
//     winner.
//
// specs/20260827/01-genesis-tournament.md D1 named an EXPLORE state (a pre-tournament
// taste funnel) and specs/20260827/03-genesis-design-state.md D1 named a DESIGN state (the
// design lock, between ROADMAP and HANDOFF); both are retired outright by
// specs/20260902/08-genesis-shrink-brief-state.md D1 — see that spec's own paragraph below for
// the current contract; `deriveState` never derives either name for any status shape.
//
// specs/20260827/04-genesis-conventions-handoff.md: the ops-conventions table
// stops being ADR paragraph nobody re-runs. `--mark decided` additionally validates
// `.claude/genesis/conventions.json` — the nine floor keys, each row DECIDED-with-boolean-
// enforceable or DEFERRED-with-reason, an enforceable row's probe living under the declared
// testTree, and every row's adr existing. `--mark skeleton-landed` additionally requires every
// enforceable DECIDED row's probe file to exist and be non-empty, and a root CLAUDE.md or
// AGENTS.md, capped at 150 lines, naming the descriptor's gateCommand and the testTree as
// literals — the binding subset agents actually read. HANDOFF stops being terminal: it becomes
// a judgment step (author `.claude/genesis/init-profile.json`, init.md Phase 4's shape) that
// closes with the new mark `profile-written --file <f> [--refresh]`, which runs `node
// init-gen.js generate --root <root> --profile <f> [--refresh]` through the existing runShell
// idiom (stdout+stderr streamed to `.claude/genesis/init-gen.log`, never a Node pipe). Exit 0
// records `status.handoff = {initGenExit: 0, at}` and advances to the new terminal state
// GROUNDED (`next: /spec:enforce`); any other exit refuses the mark (exit 2) with the log tail
// and a remedy keyed on init-gen's own exit code. Greenfield genesis is now init + enforce;
// `/spec:init` stays the brownfield entry and the regeneration owner (`--refresh`).
//
// What the D2-D4 additions deliberately do NOT do:
//   - author conventions.json, land a probe file, write CLAUDE.md/AGENTS.md, or author the init
//     profile itself — those stay session judgment; the driver only closes each gate once the
//     artifact exists and validates.
//   - judge whether the gate command actually INCLUDES the probes (a property of the host's own
//     gateCommand, not checkable from here), or whether CLAUDE.md's content is the right subset
//     (existence and the two required literals are checked; content is judgment).
//   - read status.json a second time inside init-gen — the profile itself carries every genesis
//     artifact init-gen needs (config.genesisStackDescriptor, design.rulesManifest).
//
// specs/20260901/04-shell-composed-mocks.md D7: `--mark tokens-landed` (visual
// archetypes) additionally requires `design/shell/app.html` to exist and
// `design-atlas.js check design/shell` to exit 0, refused naming the missing file or carrying the
// check's own output otherwise — the navigation shell is the mock-side artifact of the same
// decision `tokens.css` already gates here, checked by the same driver so the mark cannot pass
// without it. The check runs alongside the tokens.css checks (both validate a CANON file), ahead
// of the approved-mock/matrix checks that validate the MOCKS.
// NOTE: this paragraph describes a mark (`tokens-landed`) retired by
// specs/20260902/08-genesis-shrink-brief-state.md D1 — kept here only as history for the
// shell-canon fact it recorded; `design/shell/app.html` is not re-checked by BRIEF (spec 11 is
// expected to fold shell extraction into SCAFFOLD).
//
// specs/20260902/08-genesis-shrink-brief-state.md D1-D8, D11: genesis loses its design
// states. The chain becomes DISCOVERY -> BRIEF -> MENUS -> tournament -> DECIDE -> SCAFFOLD ->
// SKELETON -> GATE -> ROADMAP -> HANDOFF -> GROUNDED. DISCOVERY now also names the archetype
// (`- archetype: <registry key>` in `## Picks`, moved here from menus-done) and hands off to
// `/spec:mocks` for a visual archetype. BRIEF sits between DISCOVERY and MENUS: for
// DESIGN_SKIPPED_ARCHETYPES (backend-api/data-ml) it is a pass-through (D4); every other
// archetype ratifies a design canon there — doctrine + category-only design-rules for every
// archetype, plus (visual only) `design/mocks/status.json` APPROVED with an open provenance
// ledger (D3, spec 06's lib) and `design/tokens.css` (written by THEME). The pick record lives
// in the mocks status (`status.brief`) — RETIRED_MARKS (below) all refuse with exit 2 naming
// `/spec:mocks` as the remedy. A legacy `status.json` past MENUS with no `marks.briefWritten`
// resumes at BRIEF and accepts `--mark brief-written --legacy`, which skips the mocks
// precondition (D3) but still ratifies D4's doctrine/design-rules artifacts, requiring only a
// non-empty `## Dissents` (there is no pick record for a legacy run to name candidates from).
//
// What the BRIEF addition deliberately does NOT do:
//   - author the doctrine, the design-rules manifest, or approve a mocks set itself — those stay
//     session (or `/spec:mocks`) judgment; the driver only closes brief-written once the
//     artifacts exist and validate.
//   - re-derive whether a mocks set was ever needed after DISCOVERY — that fact is fixed the
//     moment discovery-done records `status.archetype`.
//
// specs/20260902/11-brief-from-approved-set.md D1-D5 (Behavior: Applicability — a fresh visual
// run only, `status.brief.mocks` set; legacy and non-visual runs are untouched): `brief-written`
// additionally requires brief.md's `## Journeys` to cover every design/mocks/seed.md journey and
// label, and `## Non-UI Coverage`'s six closed keys to carry none dark or missing (D1); the
// BRIEF step text prints the derivation sources (confirmed product ledger row ids, the seed's
// journey count, unresolved notes) so the session writes the brief from the approved set, never
// from the discovery interview alone (D2); the MENUS step text prints the seed's
// primary-surface/platforms-horizon rows above an open `framework` dimension (D3);
// `roadmap-written` additionally requires every seed-declared label to land in exactly one
// brief's ```surfaces block (D4); `skeleton-landed` additionally requires design/shell/app.html
// to pass `check`, every top-level design/mocks/*.html to declare `data-shell`,
// `check --matrix design/mocks` to exit 0, and design/components.json to name every
// design/mocks/canon.md primitive (D5).
//
// What the D1-D5 additions deliberately do NOT do:
//   - author brief.md's prose, the shell canon, or the component manifest — those stay session
//     judgment; the driver only closes each mark once the artifacts exist and cover the seed.
//   - run `design-atlas.js shell adopt --apply` itself — SKELETON's step text instructs the
//     session to run it; `skeleton-landed` only verifies its result.
//
// Fixing that overflow only at the child's own capture is insufficient: `logTail`, which builds the
// SCAFFOLD_RED/GATE_RED excerpt embedded in the driver's OWN stdout, bounds its excerpt by BYTES,
// not lines (`text.split('\n').slice(-n)` cannot: a caller's buffer is measured in bytes). A single
// unbroken multi-megabyte line (realistic `\r`-driven install/progress output, exactly the class
// the streaming fix above targets) makes "the last 20 lines" the WHOLE file, and a caller capturing
// the driver's own stdout through a pipe (e.g. a test's default 1 MiB maxBuffer) hits the identical
// ENOBUFS one layer up. `logTail` reads only the last LOGTAIL_MAX_BYTES of the file via
// `fs.openSync`/`fs.readSync`, never the whole thing, and marks the excerpt as truncated when it is
// (specs/20260825/04-genesis-driver.md — bounding a printed excerpt by line count alone is not a
// bound, because a caller's buffer is measured in bytes).
//
// Exit codes:
//   0  a bare invocation printed the current step (or `--state` printed the state name — a
//      read-only derivation that never executes scaffoldCommand/gateCommand, and never writes
//      status.json beyond `loadStatus()`'s own cold-root creation), or an accepted `--mark`
//      recorded its result and printed the checkpoint line.
//   2  a precondition failure or a refused mark — stderr names the missing/invalid artifact and
//      the remedy command — or a wrapped child process dying with no exit code (runChild's
//      fail-closed refusal: signal-killed, never spawned, or maxBuffer-overflowed).

'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { CONFIG_RELPATH } = require('./lib/host-config')
const mocksLedgerLib = require('./lib/mocks-ledger')
// specs/20260902/11-brief-from-approved-set.md D2: the BRIEF step text's "notes unresolved"
// derivation source reads design/mocks/notes.json through the same validated reader
// design-atlas.js's serve endpoints and mocks-driver.js's `notes` subcommands share.
const mocksNotesLib = require('./lib/mocks-notes')

// The 64 KiB process.exit stdout truncation this synchronous writer avoids is explained in full
// at spec/scripts/lib/driver-io.js's writeOut.
function writeOut(fd, str) {
  const buf = Buffer.from(str + '\n', 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

function die(msg) { writeOut(2, 'genesis-driver: ' + msg); process.exit(2) }

// spawnSync's `status` is null when the child dies by signal, fails to spawn, or overflows
// maxBuffer — the ONE place that death is handled; every spawnSync call in this file routes
// through here. A legitimate non-zero exit (a failing gateCommand, a dropped registry option)
// still comes back as a normal result for the caller's own branch to read.
function runChild(cmd, args, opts, what) {
  const r = spawnSync(cmd, args, opts)
  if (r.error || r.status === null) {
    const reason = r.error ? r.error.message
      : r.signal ? 'killed by signal ' + r.signal
      : 'exited with no status (spawn failure)'
    die(what + ' died without an exit code (' + reason + ') — nothing it was meant to produce ' +
      'can be trusted; fix the cause and re-run `node ' + __filename + ' --root ' + root + '`')
  }
  return r
}

// ---------------------------------------------------------------------------
// Arg parsing — hand-rolled, no library.
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
function flag(name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null }
const root = path.resolve(flag('--root') || process.cwd())
const MARK = flag('--mark')
const FILE = flag('--file')
const STATE_ONLY = argv.includes('--state')
const REFRESH = argv.includes('--refresh')

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  die('--root ' + root + ' is not a directory — pass a real project root, or omit --root to use the current directory')
}

const genesisDir = path.join(root, '.claude/genesis')
const statusPath = path.join(genesisDir, 'status.json')

function genesisRel(name) { return '.claude/genesis/' + name }

// ---------------------------------------------------------------------------
// status.json (v3, specs/20260902/08-genesis-shrink-brief-state.md D11) — created fresh on a
// cold root; an existing v1/v2 file is read as-is (missing keys default in memory, and any
// legacy-only keys such as `explore` or `exploreRecord` are kept untouched — see loadStatus())
// and rewritten as v3 only on the next accepted mark.
// ---------------------------------------------------------------------------
function freshStatus() {
  return {
    schemaVersion: 3,
    architect: 'pending', design: 'pending',
    archetype: null, localeScope: null, brief: null,
    stackDescriptorPath: '.claude/genesis/stack-descriptor.json',
    designManifestPath: '.claude/genesis/design-rules.json',
    gateCommand: null, lastUpdated: null,
    marks: {}, menus: {}, scaffold: null, zeroDayGate: null,
    handoff: null,
  }
}

function loadStatus() {
  if (!fs.existsSync(statusPath)) {
    const f = freshStatus()
    fs.mkdirSync(genesisDir, { recursive: true })
    fs.writeFileSync(statusPath, JSON.stringify(f, null, 2) + '\n')
    return f
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
  } catch (e) {
    die('status.json at ' + statusPath + ' is not valid JSON (' + e.message + ') — restore it ' +
      'from git history, or delete it (a fresh empty root is a valid starting point) and re-run')
    return null // unreachable, die() exits
  }
  const merged = Object.assign(freshStatus(), raw)
  merged.marks = Object.assign({}, raw.marks || {})
  merged.menus = Object.assign({}, raw.menus || {})
  return merged
}

function saveStatus() {
  status.schemaVersion = 3
  status.lastUpdated = new Date().toISOString()
  fs.mkdirSync(genesisDir, { recursive: true })
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n')
}

let status = loadStatus()

// ---------------------------------------------------------------------------
// Section parsing — brief.md's grammar (spec/templates/genesis-brief.md's section comments):
//   ## Coverage        -> `- <key>: covered|dark|n/a [— note]`
//   ## Open Dimensions -> `- <key>: open|constrained [— note]`
//   ## Picks           -> `- <key>: <label>` (indented continuation lines are provenance, skipped)
// ---------------------------------------------------------------------------
function section(text, name) {
  const re = new RegExp('^## ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')
  const m = re.exec(text)
  if (!m) return null
  const rest = text.slice(m.index + m[0].length)
  const next = rest.search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next)
}

// specs/20260902/11-brief-from-approved-set.md Assumption A4: the `covered|dark|n/a` line
// grammar is shared by ## Coverage and ## Non-UI Coverage — one parser, parameterized by
// section name, never a second copy of the regex.
function parseKeyedSection(text, sectionName) {
  const sec = section(text, sectionName)
  const keys = {}
  const unparseable = []
  if (sec === null) return { keys, unparseable }
  for (const raw of sec.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^- ([a-z0-9-]+):\s*(.+)$/)
    if (!m) { unparseable.push(line); continue }
    keys[m[1]] = m[2].split(/\s+—/)[0].trim().split(/\s+/)[0]
  }
  return { keys, unparseable }
}

function parseCoverage(text) { return parseKeyedSection(text, 'Coverage') }

function parseOpenDimensions(text) {
  const sec = section(text, 'Open Dimensions')
  const dims = {}
  if (sec === null) return dims
  for (const raw of sec.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^- ([a-z0-9-]+):\s*(open|constrained)\b/)
    if (m) dims[m[1]] = m[2]
  }
  return dims
}

function parsePicks(text) {
  const sec = section(text, 'Picks')
  const picks = {}
  if (sec === null) return picks
  for (const raw of sec.split('\n')) {
    if (/^\s+\S/.test(raw)) continue // indented continuation line (provenance) — not a pick
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^- ([a-z0-9-]+):\s*(.+)$/)
    if (m) picks[m[1]] = m[2].trim()
  }
  return picks
}

function briefPath() { return path.join(genesisDir, 'brief.md') }
function briefText() { try { return fs.readFileSync(briefPath(), 'utf8') } catch { return null } }
function openDimensions() { const t = briefText(); return t === null ? {} : parseOpenDimensions(t) }
function allDimensionKeys() { return Object.keys(openDimensions()) }
function openDimensionKeys() { const d = openDimensions(); return Object.keys(d).filter((k) => d[k] === 'open') }
function picks() { const t = briefText(); return t === null ? {} : parsePicks(t) }
function hasMenuFile(key) { return fs.existsSync(path.join(genesisDir, 'interview-research', key + '.json')) }

// ---------------------------------------------------------------------------
// specs/20260902/11-brief-from-approved-set.md D1-D3: design/mocks/seed.md and
// design/mocks/ledger.md readers shared by BRIEF's journey/coverage derivation (D1/D2), MENUS'
// framework pricing print (D3), and ROADMAP's journey-placement check (D4).
// ---------------------------------------------------------------------------
function seedPath() { return path.join(root, 'design/mocks/seed.md') }
function seedText() { try { return fs.readFileSync(seedPath(), 'utf8') } catch (e) { return null } }

// Assumption A1: design-atlas.js's own `parseSeedJourneys` is not exported (a plain CLI
// entrypoint, no module.exports) — duplicated here rather than adding a require-time coupling
// to a script this file's own conventions forbid importing as a library. Same tiny grammar:
// `### <journey-kebab>` header, first non-blank line is the persona, a ```surfaces fenced block
// whose lines are a bare label or an `a -> b` edge (both ends declare a label).
function parseSeedJourneysLocal(text) {
  const journeys = new Map() // kebab -> {persona, labels}
  if (text === null) return journeys
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '')
  const starts = []
  const re = /^### ([a-z0-9-]+)\s*$/gm
  let m
  while ((m = re.exec(stripped))) starts.push({ name: m[1], index: m.index, headerEnd: m.index + m[0].length })
  for (let i = 0; i < starts.length; i++) {
    const body = stripped.slice(starts[i].headerEnd, i + 1 < starts.length ? starts[i + 1].index : stripped.length)
    let persona = ''
    for (const l of body.split('\n')) { if (l.trim()) { persona = l.trim(); break } }
    const surf = body.match(/```surfaces\n([\s\S]*?)```/)
    const labels = []
    if (surf) {
      for (const raw of surf[1].split('\n')) {
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
function seedJourneysMap() { return parseSeedJourneysLocal(seedText()) }

// design/mocks/seed.md's `## Facts` section: `- <key>: <value>` lines (D3 reads
// `primary-surface`/`platforms-horizon`, whose value is a product ledger row id).
function seedFacts() {
  const t = seedText()
  const sec = t === null ? null : section(t, 'Facts')
  const facts = {}
  if (sec === null) return facts
  for (const raw of sec.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^- ([a-z0-9-]+):\s*(.+)$/)
    if (m) facts[m[1]] = m[2].trim()
  }
  return facts
}

// D2: every confirmed said-by-user/ratified-doc product row — the derivation sources the BRIEF
// step text must list by id, never the discovery interview alone. Read/parse failure degrades
// to [] (the step text falls back to "none"), never a throw.
function confirmedProductRows() {
  let text
  try { text = fs.readFileSync(mocksLedgerPath(), 'utf8') } catch (e) { return [] }
  const ledger = mocksLedgerLib.parseLedger(text)
  if (ledger.errors.length) return []
  return ledger.assumptions
    .filter((r) => r.kind === 'product' && r.status === 'confirmed' &&
      (r.tag === 'said-by-user' || r.tag === 'ratified-doc'))
    .map((r) => ({ id: r.id, claim: r.claim, tag: r.tag }))
}

// D3: look up one product ledger row by id (the seed's primary-surface/platforms-horizon facts
// name a row id, not a claim — the MENUS step reads the claim text off the ledger itself).
function productRowById(id) {
  let text
  try { text = fs.readFileSync(mocksLedgerPath(), 'utf8') } catch (e) { return null }
  const ledger = mocksLedgerLib.parseLedger(text)
  if (ledger.errors.length) return null
  return ledger.assumptions.find((r) => r.id === id) || null
}

// D1: does brief.md's own ## Journeys section cover every seed journey and every one of its
// labels? Walked in seed-file order so the refusal names the FIRST offender (Contracts: "the
// first missing journey").
function briefJourneysCheck(text, seedJourneys) {
  const sec = section(text, 'Journeys') || ''
  for (const [name, j] of seedJourneys) {
    const re = new RegExp('^### ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')
    const m = re.exec(sec)
    if (!m) return { ok: false, reason: 'missing-journey', journey: name }
    const rest = sec.slice(m.index + m[0].length)
    const next = rest.search(/^### /m)
    const block = next === -1 ? rest : rest.slice(0, next)
    for (const label of j.labels) {
      const lre = new RegExp('\\b' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b')
      if (!lre.test(block)) return { ok: false, reason: 'missing-label', label, journey: name }
    }
  }
  return { ok: true }
}

// D1: ## Non-UI Coverage's six closed keys, none dark or missing — Assumption A4's
// parameterized reuse of ## Coverage's own grammar.
const NON_UI_COVERAGE_KEYS = ['jobs', 'notifications', 'retention', 'integrations', 'admin', 'pricing']
function briefNonUiCheck(text) {
  const { keys } = parseKeyedSection(text, 'Non-UI Coverage')
  const missing = NON_UI_COVERAGE_KEYS.filter((k) => !(k in keys) || keys[k] === 'dark')
  return { missing }
}

// D4: every seed-declared label placed in exactly one brief's ```surfaces block. A local
// duplicate of design-atlas.js's `parseSurfaces` grammar (Assumption A1 — same reasoning as
// parseSeedJourneysLocal above: no module.exports to import), extended to track EVERY brief
// declaring a label (design-atlas.js's own version keeps only the first) since D4 must also
// catch a double-placement, not just an absence.
function parseSurfacesPlacementLocal(roadmapDir) {
  const byLabel = new Map() // label -> [brief file name, ...]
  let files = []
  try { files = fs.readdirSync(roadmapDir).sort().filter((f) => f.endsWith('.md')) } catch (e) { files = [] }
  for (const f of files) {
    const text = fs.readFileSync(path.join(roadmapDir, f), 'utf8')
    const seenInFile = new Set()
    for (const m of text.matchAll(/```surfaces\n([\s\S]*?)```/g)) {
      for (const raw of m[1].split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const edge = line.split('->').map((s) => s.trim())
        const labels = (edge.length === 2 && edge[0] && edge[1]) ? edge
          : (/^[\w][\w-]*$/.test(line) ? [line] : [])
        for (const l of labels) {
          if (seenInFile.has(l)) continue
          seenInFile.add(l)
          if (!byLabel.has(l)) byLabel.set(l, [])
          byLabel.get(l).push(f)
        }
      }
    }
  }
  return byLabel
}

function journeyPlacementCheck() {
  const seedJourneys = seedJourneysMap()
  const seedLabels = []
  const seen = new Set()
  for (const [, j] of seedJourneys) {
    for (const l of j.labels) { if (!seen.has(l)) { seen.add(l); seedLabels.push(l) } }
  }
  const byLabel = parseSurfacesPlacementLocal(path.join(root, 'docs/roadmap'))
  const unplaced = seedLabels.filter((l) => !byLabel.has(l) || byLabel.get(l).length === 0)
  if (unplaced.length) return { ok: false, reason: 'unplaced', labels: unplaced }
  for (const l of seedLabels) {
    const files = byLabel.get(l)
    if (files.length > 1) return { ok: false, reason: 'double', label: l, files }
  }
  return { ok: true }
}

// D4: on registryExit === 1 the step re-print names the dropped labels, read from the menu
// file's `droppedForCurrency` (registry-check.js --write's shape: [{label, packages: [...]}]).
// Read defensively — a missing/unparseable menu file or an absent/empty array degrades to null
// so the caller falls back to the generic wording; it must never throw.
function droppedLabelsFor(key) {
  try {
    const menuPath = path.join(genesisDir, 'interview-research', key + '.json')
    const menu = JSON.parse(fs.readFileSync(menuPath, 'utf8'))
    const dropped = Array.isArray(menu.droppedForCurrency) ? menu.droppedForCurrency : []
    const labels = dropped.map((d) => d && d.label).filter((l) => typeof l === 'string' && l)
    return labels.length ? labels : null
  } catch (e) {
    return null
  }
}

// ---------------------------------------------------------------------------
// DISCOVERY (D3): the coverage-audit gate.
// ---------------------------------------------------------------------------
const COVERAGE_KEYS = [
  'payer', 'tenancy', 'data-sensitivity', 'residency', 'ai-use', 'unattended',
  'integrations', 'scale-outage', 'vendor-budget', 'offline-mobile',
]
const TEMPLATE_BRIEF_PATH = path.join(__dirname, '..', 'templates', 'genesis-brief.md')

function discoveryCheck() {
  const text = briefText()
  if (text === null) return { ok: false, reason: 'no-brief' }
  const { keys, unparseable } = parseCoverage(text)
  if (unparseable.length) return { ok: false, reason: 'unparseable', detail: unparseable }
  const missing = COVERAGE_KEYS.filter((k) => !(k in keys))
  if (missing.length) return { ok: false, reason: 'missing', detail: missing }
  const dark = COVERAGE_KEYS.filter((k) => keys[k] === 'dark')
  if (dark.length) return { ok: false, reason: 'dark', detail: dark }
  return { ok: true }
}

function handleDiscoveryDone() {
  const check = discoveryCheck()
  if (!check.ok) {
    if (check.reason === 'no-brief') {
      die('brief.md not found at ' + genesisRel('brief.md') + ' — start from the template at ' +
        TEMPLATE_BRIEF_PATH + ', then re-mark discovery-done')
    }
    if (check.reason === 'unparseable') {
      die('brief.md ## Coverage has unparseable line(s): ' + check.detail.join('; ') + ' — fix ' +
        'the grammar `- <key>: covered|dark|n/a` and re-mark discovery-done')
    }
    if (check.reason === 'missing') {
      die('brief.md ## Coverage is missing required key(s): ' + check.detail.join(', ') + ' — ' +
        'add them (covered/dark/n/a) and re-mark discovery-done')
    }
    if (check.reason === 'dark') {
      die('brief.md ## Coverage still has dark key(s): ' + check.detail.join(', ') + ' — ask ' +
        'them, in the user\'s words, then re-mark discovery-done')
    }
  }
  // specs/20260902/08-genesis-shrink-brief-state.md D2: the archetype gate moves here from
  // menus-done — BRIEF (the very next state) must already know whether a mocks set is owed.
  const archetype = picks().archetype
  if (!archetype) {
    die('brief.md ## Picks is missing a `- archetype: <key>` line — add one of: ' +
      REGISTRY_KEYS.join(', ') + ', then re-mark discovery-done')
  }
  if (!REGISTRY_KEYS.includes(archetype)) {
    die('brief.md ## Picks names an unknown archetype "' + archetype + '" — pick one of: ' +
      REGISTRY_KEYS.join(', ') + ', then re-mark discovery-done')
  }
  status.marks.discoveryDone = true
  status.archetype = archetype
  saveStatus()
  return { prev: 'DISCOVERY', next: 'BRIEF' }
}

// ---------------------------------------------------------------------------
// MENUS (D4): registry-check.js per menu, then the picks gate.
// ---------------------------------------------------------------------------
function menusCheck() {
  const open = openDimensionKeys()
  const pks = picks()
  const missing = open.filter((k) => !hasMenuFile(k) || !(k in pks))
  return { ok: missing.length === 0, missing }
}

function handleMenuWritten() {
  if (!status.marks.discoveryDone) die('discovery-done has not been marked yet — mark discovery-done first')
  if (!FILE) die('--mark menu-written needs --file <menu.json> (relative to .claude/genesis/, or an absolute path)')
  const resolved = path.isAbsolute(FILE) ? FILE : path.join(genesisDir, FILE)
  if (!fs.existsSync(resolved)) {
    die('--file ' + FILE + ' does not exist at ' + resolved + ' — write the menu file, then re-mark menu-written')
  }
  const registryCheckBin = path.join(__dirname, 'registry-check.js')
  const r = runChild(process.execPath, [registryCheckBin, '--menu', resolved, '--write'],
    { encoding: 'utf8' }, 'registry-check.js (' + resolved + ')')
  if (r.status === 2) die('registry-check.js refused ' + resolved + ': ' + (r.stderr || r.stdout || '').trim())
  if (![0, 1, 3].includes(r.status)) {
    die('registry-check.js exited unexpected code ' + r.status + ' for ' + resolved + ': ' + (r.stderr || r.stdout || '').trim())
  }
  let menu
  try {
    menu = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  } catch (e) {
    die(resolved + ' is not valid JSON after registry-check.js ran (' + e.message + ') — this ' +
      'should not happen; restore the file and re-run the research round')
    return null // unreachable
  }
  const dimension = menu.dimension || path.basename(resolved, '.json')
  status.menus[dimension] = { registryExit: r.status, at: new Date().toISOString() }
  saveStatus()
  return { prev: 'MENUS', next: 'MENUS' }
}

// specs/20260827/01-genesis-tournament.md D2: the eight registry archetype keys — the grammar
// `--mark menus-done` now requires a `- archetype: <key>` ## Picks line to name. D1: five of the
// eight are TOURNAMENT archetypes; every other archetype's MENUS -> DECIDE path is unchanged.
const REGISTRY_KEYS = [
  'web-app', 'mobile-app', 'conversational-bot', 'backend-api',
  'realtime-trading', 'cli-devtool', 'data-ml', 'desktop-app',
]
const TOURNAMENT_ARCHETYPES = ['web-app', 'realtime-trading', 'backend-api', 'mobile-app', 'desktop-app']
function isTournamentArchetype(a) { return TOURNAMENT_ARCHETYPES.includes(a) }

// specs/20260827/02-genesis-explore-state.md D1: the four VISUAL archetypes are every tournament
// archetype except backend-api (headless — no UI, no taste funnel). Every other archetype (the
// three TOURNAMENT_ARCHETYPES are a superset check, not a subset — data-ml/cli-devtool/
// conversational-bot are neither tournament nor visual) gets explore: "skipped" the moment
// menus-done resolves it and is never routed through EXPLORE.
const VISUAL_ARCHETYPES = ['web-app', 'realtime-trading', 'mobile-app', 'desktop-app']
function isVisualArchetype(a) { return VISUAL_ARCHETYPES.includes(a) }

// specs/20260827/03-genesis-design-state.md D1: backend-api/data-ml never enter DESIGN at all —
// design: "skipped" is written by handleRoadmapWritten the moment roadmap-written is accepted for
// them (the "first derivation past ROADMAP"). Every other archetype (visual or not) enters DESIGN.
const DESIGN_SKIPPED_ARCHETYPES = ['backend-api', 'data-ml']
function isDesignSkipped(a) { return DESIGN_SKIPPED_ARCHETYPES.includes(a) }

function handleMenusDone() {
  if (!status.marks.discoveryDone) die('discovery-done has not been marked yet — mark discovery-done first')
  if (!status.marks.briefWritten) die('brief-written has not been marked yet — mark brief-written first')
  const check = menusCheck()
  if (!check.ok) {
    die('open dimension(s) missing a menu file or a ## Picks line: ' + check.missing.join(', ') +
      ' — finish the interview, then re-mark menus-done')
  }
  // specs/20260902/08-genesis-shrink-brief-state.md D2: the archetype was already validated
  // and recorded at discovery-done — AC-20260902-08-13 requires a ## Picks archetype line
  // still present here (never removed from the grammar) to keep being accepted, never re-parsed
  // or re-validated a second time.
  status.marks.menusDone = true
  saveStatus()
  const archetype = status.archetype
  let next
  if (isTournamentArchetype(archetype)) next = 'FINALISTS'
  else next = 'DECIDE'
  return { prev: 'MENUS', next }
}

// ---------------------------------------------------------------------------
// BRIEF (specs/20260902/08-genesis-shrink-brief-state.md D3/D4/D6): sits between DISCOVERY and
// MENUS. `--mark brief-written` is the ONLY mark this state accepts (the retired EXPLORE/DESIGN
// marks are refused elsewhere, in handleMark's default branch). For DESIGN_SKIPPED_ARCHETYPES
// (backend-api/data-ml) it is a pass-through: nothing beyond DISCOVERY is owed. Every other
// archetype ratifies doctrine + category-only design-rules; a VISUAL archetype additionally
// requires an APPROVED `design/mocks/status.json` with an open provenance ledger (D3, spec 06's
// `lib/mocks-ledger.js`) and `design/tokens.css` (written by THEME). `--legacy` skips D3's mocks
// precondition (never D4's ratification artifacts) for a status.json that resumed at BRIEF with
// pre-existing explore/design artifacts (D6).
// ---------------------------------------------------------------------------
function mocksStatusPath() { return path.join(root, 'design/mocks/status.json') }
function mocksLedgerPath() { return path.join(root, 'design/mocks/ledger.md') }
function readMocksStatus() {
  try { return JSON.parse(fs.readFileSync(mocksStatusPath(), 'utf8')) } catch (e) { return null }
}

// D3: design/mocks/status.json must exist, be APPROVED, and its own provenance ledger must have
// no open blocking row (spec 06's gateVerdict) — the same closure /spec:mocks itself enforces at
// its own APPROVED mark, re-checked here so BRIEF never trusts a state that regressed after
// approval.
function briefPreconditionCheck() {
  const p = mocksStatusPath()
  if (!fs.existsSync(p)) return { ok: false, reason: 'no-status' }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    return { ok: false, reason: 'bad-json', detail: e.message }
  }
  if (parsed.state !== 'APPROVED') return { ok: false, reason: 'not-approved', detail: parsed.state }
  let ledgerText = ''
  try { ledgerText = fs.readFileSync(mocksLedgerPath(), 'utf8') } catch (e) { /* treated as empty */ }
  const verdict = mocksLedgerLib.gateVerdict(mocksLedgerLib.parseLedger(ledgerText))
  if (!verdict.open) return { ok: false, reason: 'blocked', detail: verdict.blocking }
  return { ok: true, status: parsed }
}

function handleBriefWritten() {
  if (!status.marks.discoveryDone) die('discovery-done has not been marked yet — mark discovery-done first')
  const archetype = status.archetype
  const legacy = argv.includes('--legacy')

  let mocksStatus = null
  if (isVisualArchetype(archetype) && !legacy) {
    const check = briefPreconditionCheck()
    if (!check.ok) {
      if (check.reason === 'no-status') {
        die('design/mocks/status.json does not exist — run /spec:mocks first, then re-mark brief-written')
      }
      if (check.reason === 'bad-json') {
        die('design/mocks/status.json is not valid JSON (' + check.detail + ') — run /spec:mocks first, then re-mark brief-written')
      }
      if (check.reason === 'not-approved') {
        die('design/mocks/status.json is not APPROVED yet (state: ' + check.detail + ') — run /spec:mocks first, then re-mark brief-written')
      }
      if (check.reason === 'blocked') {
        die('design/mocks/ledger.md still has open blocking row(s): ' +
          check.detail.map((b) => b.id).join(', ') + ' — run /spec:mocks first, then re-mark brief-written')
      }
    }
    mocksStatus = check.status

    // specs/20260902/11-brief-from-approved-set.md D1: the brief is generated from the
    // approved set, not from memory — ## Journeys must cover every seed journey and label, and
    // ## Non-UI Coverage must carry none dark or missing. Applies only to a fresh visual run
    // (Behavior: Applicability) — the `legacy`/`isVisualArchetype` guard above already scopes
    // this whole block to that condition.
    const text = briefText() || ''
    const jCheck = briefJourneysCheck(text, seedJourneysMap())
    if (!jCheck.ok) {
      if (jCheck.reason === 'missing-journey') {
        die('## Journeys is missing journey ' + jCheck.journey + ' — add a `### ' + jCheck.journey +
          '` block (persona line, the seed\'s surfaces block verbatim, one states: line per screen), ' +
          'then re-mark brief-written')
      }
      if (jCheck.reason === 'missing-label') {
        die('label ' + jCheck.label + ' (journey ' + jCheck.journey + ') is missing from ## Journeys' +
          ' — add it to the `### ' + jCheck.journey + '` block, then re-mark brief-written')
      }
    }
    const nCheck = briefNonUiCheck(text)
    if (nCheck.missing.length) {
      die('## Non-UI Coverage key(s) dark or missing: ' + nCheck.missing.join(', ') +
        ' — answer them, in the user\'s words, then re-mark brief-written')
    }
  }

  // specs/20260902/08-genesis-shrink-brief-state.md D4: DESIGN_SKIPPED_ARCHETYPES
  // (backend-api/data-ml) own nothing beyond DISCOVERY — record design: "skipped" straight away.
  if (isDesignSkipped(archetype)) {
    status.marks.briefWritten = true
    status.brief = { mocks: null, legacy: false, ratifiedAt: new Date().toISOString() }
    status.design = 'skipped'
    saveStatus()
    return { prev: 'BRIEF', next: 'MENUS' }
  }

  const p = doctrinePath()
  if (!fs.existsSync(p)) {
    die('docs/design/doctrine.md does not exist — draft the one-page doctrine with a ## Dissents ' +
      'section naming every rejected direction, then re-mark brief-written')
  }
  const text = fs.readFileSync(p, 'utf8')
  const lineCount = text.split('\n').length
  if (lineCount > DOCTRINE_LINE_CAP) {
    die('docs/design/doctrine.md is ' + lineCount + ' lines — the one-page cap is ' + DOCTRINE_LINE_CAP +
      ' lines — trim it, then re-mark brief-written')
  }
  if (!dissentsNonEmpty(text)) {
    die('docs/design/doctrine.md ## Dissents has no non-blank line — record every rejected ' +
      'direction there, then re-mark brief-written')
  }

  // D4/D6: ## Dissents must name every composed-but-unpicked direction from the mocks status —
  // the pick record lives there now, never in a per-candidate file. A `--legacy` ratification has
  // no mocks status to read directions from, so D4's non-empty-Dissents check above is the whole
  // requirement for it; there is no pick record left to name candidates from.
  if (!legacy && isVisualArchetype(archetype)) {
    const directions = (mocksStatus && mocksStatus.directions) || {}
    const theme = mocksStatus && mocksStatus.theme
    const body = dissentsBody(text) || ''
    for (const key of Object.keys(directions)) {
      if (key === theme) continue
      if (!body.includes(key)) {
        die('docs/design/doctrine.md ## Dissents does not name composed direction "' + key +
          '" — add it, then re-mark brief-written')
      }
    }
  }

  const rulesCheck = designRulesCheck()
  if (!rulesCheck.ok) {
    if (rulesCheck.reason === 'unreadable') {
      die('.claude/genesis/design-rules.json does not exist or is not valid JSON (' + rulesCheck.detail +
        ') — write it, then re-mark brief-written')
    }
    if (rulesCheck.reason === 'no-rules-array') {
      die('.claude/genesis/design-rules.json has no "rules" array — write it (an empty array is ' +
        'valid), then re-mark brief-written')
    }
    if (rulesCheck.reason === 'bad-id') {
      die('.claude/genesis/design-rules.json has a rule with a missing or empty "id" — fix it, then re-mark brief-written')
    }
    if (rulesCheck.reason === 'bad-category') {
      die('.claude/genesis/design-rules.json rule "' + rulesCheck.rule.id + '" has targetCategory "' +
        rulesCheck.rule.targetCategory + '" — must be one of: ' + DESIGN_RULE_CATEGORIES.join(', ') +
        ' — fix it, then re-mark brief-written')
    }
    if (rulesCheck.reason === 'bad-grounding') {
      die('.claude/genesis/design-rules.json rule "' + rulesCheck.rule.id + '" has grounding "' +
        rulesCheck.rule.grounding + '" — must be "grounded" or "taste" — fix it, then re-mark brief-written')
    }
    if (rulesCheck.reason === 'bad-severity') {
      die('.claude/genesis/design-rules.json rule "' + rulesCheck.rule.id + '" has a missing or empty ' +
        '"severity" — fix it, then re-mark brief-written')
    }
    if (rulesCheck.reason === 'bad-appliesto') {
      die('.claude/genesis/design-rules.json rule "' + rulesCheck.rule.id + '" has no "appliesTo" array — fix it, then re-mark brief-written')
    }
  }

  if (isVisualArchetype(archetype) && !fs.existsSync(tokensCssPath())) {
    die('design/tokens.css does not exist — ratify THEME\'s tokens.css, then re-mark brief-written')
  }

  status.marks.briefWritten = true
  status.brief = {
    mocks: mocksStatus ? 'design/mocks/status.json' : null,
    legacy,
    ratifiedAt: new Date().toISOString(),
  }
  status.design = 'ratified'
  saveStatus()
  return { prev: 'BRIEF', next: 'MENUS' }
}

// ---------------------------------------------------------------------------
// FINALISTS / RACE / PROBE / PICK (specs/20260827/01 D1, D3-D9): the tournament of scaffolds,
// entered only for TOURNAMENT_ARCHETYPES. RACE is driver-only (D5): a bare invocation races every
// not-yet-raced finalist for real — scaffold, then (if scaffold is green) gate, then boot through
// spec/scripts/smoke.sh's own contract, unchanged (Assumption A1). PROBE is a session-judgment
// step whose closure (`probe-done`) re-runs gate+boot per finalist and assembles the benchmark
// (D7). PICK (`picked`) never ranks finalists itself — it matches the brief's own ## Picks
// against each finalist's `picks` (D8).
// ---------------------------------------------------------------------------
// specs/20260902/08-genesis-shrink-brief-state.md D7: PROBE_TASKS carries only the
// archetype's own task set — no per-archetype tile-rendering task exists.
const PROBE_TASKS = {
  'web-app': ['authed-crud-screen', 'background-job'],
  'realtime-trading': ['authed-crud-screen', 'background-job'],
  'backend-api': ['authed-crud-resource', 'background-job'],
  'mobile-app': ['authed-list-detail-screen', 'async-task'],
  'desktop-app': ['authed-list-detail-screen', 'async-task'],
}

function tournamentDir() { return path.join(genesisDir, 'tournament') }
function finalistsRootDir() { return path.join(tournamentDir(), 'finalists') }
function finalistDir(name) { return path.join(finalistsRootDir(), name) }
function tournamentLogsDir() { return path.join(tournamentDir(), 'logs') }
function tournamentEvidenceDir(name) { return path.join(tournamentDir(), 'evidence', name) }
function benchmarkJsonPath() { return path.join(tournamentDir(), 'benchmark.json') }
function benchmarkMdPath() { return path.join(tournamentDir(), 'benchmark.md') }
function galleryPath() { return path.join(tournamentDir(), 'gallery.html') }

function expectedTasksFor(archetype) {
  return (PROBE_TASKS[archetype] || []).slice()
}

// D4: "last measured" reads an existing tournament/benchmark.json's average tokens/finalist, or
// falls back to "no figure yet" — a session must never see a fabricated cost figure.
function lastMeasuredLine() {
  try {
    const b = JSON.parse(fs.readFileSync(benchmarkJsonPath(), 'utf8'))
    const rows = (b.finalists || []).filter((f) => typeof f.tokens === 'number')
    if (!rows.length) return 'last measured: no figure yet'
    const avg = Math.round(rows.reduce((s, f) => s + f.tokens, 0) / rows.length)
    return 'last measured: ' + avg + ' tokens/finalist'
  } catch (e) {
    return 'last measured: no figure yet'
  }
}

function finalistMatchesCurrentPicks(f) {
  const p = (f && f.picks) || {}
  const current = picks()
  return Object.keys(p).every((k) => current[k] === p[k])
}

function handleFinalistsSkipped() {
  if (!status.marks.menusDone) die('menus-done has not been marked yet — mark menus-done first')
  if (!isTournamentArchetype(status.archetype)) {
    die('archetype "' + status.archetype + '" is not a tournament archetype (' +
      TOURNAMENT_ARCHETYPES.join(', ') + ') — finalists-skipped only applies once a tournament archetype has reached FINALISTS')
  }
  status.tournament = Object.assign({}, status.tournament, { skipped: true, at: new Date().toISOString() })
  saveStatus()
  return { prev: 'FINALISTS', next: 'DECIDE' }
}

function handleFinalistsWritten() {
  if (!status.marks.menusDone) die('menus-done has not been marked yet — mark menus-done first')
  if (!isTournamentArchetype(status.archetype)) {
    die('archetype "' + status.archetype + '" is not a tournament archetype (' +
      TOURNAMENT_ARCHETYPES.join(', ') + ') — finalists-written only applies once a tournament archetype has reached FINALISTS')
  }
  if (!FILE) die('--mark finalists-written needs --file <finalists.json> (relative to .claude/genesis/, or an absolute path)')
  const resolved = path.isAbsolute(FILE) ? FILE : path.join(genesisDir, FILE)
  if (!fs.existsSync(resolved)) {
    die('--file ' + FILE + ' does not exist at ' + resolved + ' — write the finalists file, then re-mark finalists-written')
  }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  } catch (e) {
    die(resolved + ' is not valid JSON (' + e.message + ') — fix it and re-mark finalists-written')
    return null // unreachable
  }
  const list = Array.isArray(parsed.finalists) ? parsed.finalists : null
  if (!list) die(resolved + ' must have a top-level "finalists" array — fix it and re-mark finalists-written')
  if (list.length < 2) die(resolved + ' names ' + list.length + ' finalist(s) — at least 2 finalists are required for a comparison')
  if (list.length > 3) die(resolved + ' names ' + list.length + ' finalist(s) — at most 3 finalists are allowed (the brief caps the race\'s cost)')

  const openKeys = new Set(allDimensionKeys())
  const seenNames = new Set()
  for (const f of list) {
    const label = (f && typeof f.name === 'string' && f.name) ? f.name : '(unnamed finalist)'
    if (!f || typeof f.name !== 'string' || !/^[a-z0-9-]+$/.test(f.name)) {
      die('finalist "' + label + '" has an invalid or missing "name" (must match /^[a-z0-9-]+$/) — fix it and re-mark finalists-written')
    }
    if (seenNames.has(f.name)) die('finalist "' + f.name + '" is a duplicate name — finalist names must be unique')
    seenNames.add(f.name)
    for (const key of ['scaffoldCommand', 'gateCommand', 'bootCommand', 'readyCheck']) {
      if (typeof f[key] !== 'string' || !f[key].trim()) {
        die('finalist "' + f.name + '" is missing a non-empty "' + key + '" — fix it and re-mark finalists-written')
      }
    }
    if (f.picks !== undefined && (typeof f.picks !== 'object' || f.picks === null || Array.isArray(f.picks))) {
      die('finalist "' + f.name + '" has a "picks" that is not an object')
    }
    for (const k of Object.keys(f.picks || {})) {
      if (!openKeys.has(k)) {
        die('finalist "' + f.name + '" picks names unknown dimension "' + k + '" — dimension keys must be a subset of ## Open Dimensions')
      }
    }
  }
  const hasIncumbent = list.some(finalistMatchesCurrentPicks)
  if (!hasIncumbent) {
    die('no finalist\'s picks matches the brief\'s current ## Picks on every key it names — at least one finalist must be the incumbent; add one and re-mark finalists-written')
  }

  status.tournament = Object.assign({}, status.tournament, {
    finalists: list.map((f) => f.name),
    finalistDefs: list,
    at: new Date().toISOString(),
  })
  saveStatus()
  return { prev: 'FINALISTS', next: 'RACE' }
}

// D5: races every finalist in `status.tournament.finalistDefs` that has no `race[name]` yet, in
// file order. A finalist whose scaffold fails records `race[name] = {scaffold, at}` and spends
// nothing further — no gate, no boot. Persisted after every finalist so a crash mid-race never
// re-spends an already-recorded step. Driver-only: called from deriveState on a bare (non-peek)
// invocation reaching RACE, never from `--state`.
function runRace() {
  fs.mkdirSync(tournamentDir(), { recursive: true })
  const gitignorePath = path.join(tournamentDir(), '.gitignore')
  if (!fs.existsSync(gitignorePath)) fs.writeFileSync(gitignorePath, 'finalists/\nlogs/\n')

  const defs = (status.tournament && status.tournament.finalistDefs) || []
  const smokeSh = path.join(__dirname, 'smoke.sh')
  for (const f of defs) {
    const race = (status.tournament && status.tournament.race) || {}
    if (race[f.name]) continue
    const fDir = finalistDir(f.name)
    fs.mkdirSync(fDir, { recursive: true })

    const scaffoldLog = path.join(tournamentLogsDir(), f.name + '.scaffold.log')
    const sResult = runShell(f.scaffoldCommand, scaffoldLog, { cwd: fDir })
    if (sResult.status !== 0) {
      race[f.name] = { scaffold: { exit: sResult.status }, at: new Date().toISOString() }
      status.tournament = Object.assign({}, status.tournament, { race })
      saveStatus()
      continue
    }

    const gateLog = path.join(tournamentLogsDir(), f.name + '.gate.log')
    const gResult = runShell(f.gateCommand, gateLog, { cwd: fDir })

    const smokeConfigPath = path.join(fDir, '.genesis-smoke.json')
    fs.writeFileSync(smokeConfigPath, JSON.stringify({
      runtime: {
        bootCommand: f.bootCommand,
        readyCheck: f.readyCheck,
        readyTimeout: f.readyTimeout || 120,
        stopExitCodes: [0, 143],
      },
    }, null, 2) + '\n')
    const bootLog = path.join(tournamentLogsDir(), f.name + '.boot.log')
    const bResult = runLogged('bash', [smokeSh, '--config', smokeConfigPath], bootLog,
      { cwd: fDir, what: 'smoke.sh boot for finalist ' + f.name })
    const sentinelMatch = /^__SMOKE_.*$/m.exec(safeReadFile(bootLog))

    race[f.name] = {
      scaffold: { exit: sResult.status },
      gate: { exit: gResult.status },
      boot: { exit: bResult.status, sentinel: sentinelMatch ? sentinelMatch[0] : null },
      at: new Date().toISOString(),
    }
    status.tournament = Object.assign({}, status.tournament, { race })
    saveStatus()
  }
}

function safeReadFile(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return '' } }

// D7: probe-done validates every finalist that reached a green scaffold, then re-runs its gate
// and boot as an executed fact (never trusted from the race's own earlier run) before assembling
// the benchmark. A finalist whose scaffold failed owes no probe.json — D5's "nothing further is
// spent" extends through PROBE.
function handleProbeDone() {
  if (!(status.tournament && status.tournament.finalists)) die('the finalists have not been raced yet — reach RACE/PROBE first')
  const race = status.tournament.race || {}
  const archetype = status.archetype
  const expected = expectedTasksFor(archetype)
  const finalistDefs = status.tournament.finalistDefs || []
  const post = Object.assign({}, status.tournament.post || {})
  const smokeSh = path.join(__dirname, 'smoke.sh')

  for (const name of status.tournament.finalists) {
    const r = race[name]
    if (!r || r.scaffold.exit !== 0) continue // never spent further at RACE — owes no probe.json

    const probePath = path.join(tournamentEvidenceDir(name), 'probe.json')
    if (!fs.existsSync(probePath)) {
      die('finalist "' + name + '" is missing ' + genesisRel('tournament/evidence/' + name + '/probe.json') +
        ' — build the probe slice and write it, then re-mark probe-done')
    }
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(probePath, 'utf8'))
    } catch (e) {
      die('finalist "' + name + '"\'s probe.json is not valid JSON (' + e.message + ') — fix it and re-mark probe-done')
      return null // unreachable
    }
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : null
    if (!tasks) die('finalist "' + name + '"\'s probe.json must have a top-level "tasks" array')

    const seenTasks = new Set()
    for (const t of tasks) {
      if (!t || typeof t.task !== 'string' || !expected.includes(t.task)) {
        die('finalist "' + name + '"\'s probe.json names an unexpected task "' + (t && t.task) +
          '" — the expected task set for ' + archetype + ' is: ' + expected.join(', '))
      }
      if (seenTasks.has(t.task)) die('finalist "' + name + '"\'s probe.json has a duplicate task "' + t.task + '"')
      seenTasks.add(t.task)
      if (typeof t.passed !== 'boolean') {
        die('finalist "' + name + '"\'s probe.json task "' + t.task + '" is missing a boolean "passed"')
      }
      if (!Number.isInteger(t.retries) || t.retries < 0 || t.retries > 2) {
        die('finalist "' + name + '"\'s probe.json task "' + t.task + '" has an out-of-range "retries" (' +
          t.retries + ') — the retry cap is 2 per task')
      }
      if (!Number.isInteger(t.tokens) || t.tokens < 0) {
        die('finalist "' + name + '"\'s probe.json task "' + t.task + '" has an invalid "tokens" (must be an integer >= 0)')
      }
      if (t.screenshot !== null) {
        const shotAbs = path.isAbsolute(t.screenshot) ? t.screenshot : path.join(root, String(t.screenshot))
        if (typeof t.screenshot !== 'string' || !fs.existsSync(shotAbs)) {
          die('finalist "' + name + '"\'s probe.json task "' + t.task + '" has a "screenshot" that is neither null nor an existing file')
        }
      }
    }
    const missing = expected.filter((e) => !seenTasks.has(e))
    if (missing.length) {
      die('finalist "' + name + '"\'s probe.json is missing task(s): ' + missing.join(', ') +
        ' — build the missing probe slice(s), then re-mark probe-done')
    }

    const def = finalistDefs.find((fd) => fd.name === name) || {}
    const fDir = finalistDir(name)
    const gatePostLog = path.join(tournamentLogsDir(), name + '.gate.post.log')
    const gPost = runShell(def.gateCommand, gatePostLog, { cwd: fDir })
    const smokeConfigPath = path.join(fDir, '.genesis-smoke.json')
    const bootPostLog = path.join(tournamentLogsDir(), name + '.boot.post.log')
    const bPost = runLogged('bash', [smokeSh, '--config', smokeConfigPath], bootPostLog,
      { cwd: fDir, what: 'smoke.sh post-probe boot for finalist ' + name })
    const sentinelMatch = /^__SMOKE_.*$/m.exec(safeReadFile(bootPostLog))

    post[name] = {
      gate: { exit: gPost.status },
      boot: { exit: bPost.status, sentinel: sentinelMatch ? sentinelMatch[0] : null },
      tasks,
      at: new Date().toISOString(),
    }
  }

  status.tournament = Object.assign({}, status.tournament, { post })
  saveStatus()
  writeBenchmark()
  return { prev: 'PROBE', next: 'PICK' }
}

function benchmarkRows() {
  const t = status.tournament || {}
  const race = t.race || {}
  const post = t.post || {}
  return (t.finalists || []).map((name) => {
    const r = race[name] || {}
    const p = post[name] || null
    const tasks = p ? p.tasks || [] : []
    return {
      name,
      scaffold: r.scaffold ? r.scaffold.exit : null,
      gatePre: r.gate ? r.gate.exit : null,
      bootPre: r.boot ? r.boot.exit : null,
      gatePost: p ? p.gate.exit : null,
      bootPost: p ? p.boot.exit : null,
      probePassed: p ? tasks.filter((tk) => tk.passed).length : null,
      probeTotal: p ? tasks.length : null,
      retries: p ? tasks.reduce((s, tk) => s + tk.retries, 0) : null,
      tokens: p ? tasks.reduce((s, tk) => s + tk.tokens, 0) : null,
      screenshots: tasks.filter((tk) => tk.screenshot).map((tk) => tk.screenshot),
    }
  })
}

function renderBenchmarkMd(rows) {
  const dash = (v) => (v === null || v === undefined ? '—' : v)
  const header = '| finalist | scaffold exit | gate pre/post | booted pre/post | probe passed | retries | tokens | screenshots |\n' +
    '|---|---|---|---|---|---|---|---|\n'
  const body = rows.map((r) => {
    const probe = r.probeTotal === null ? '—' : (r.probePassed + '/' + r.probeTotal)
    const shots = r.screenshots.length ? r.screenshots.join(', ') : '—'
    return '| ' + r.name + ' | ' + dash(r.scaffold) + ' | ' + dash(r.gatePre) + '/' + dash(r.gatePost) +
      ' | ' + dash(r.bootPre) + '/' + dash(r.bootPost) + ' | ' + probe + ' | ' + dash(r.retries) +
      ' | ' + dash(r.tokens) + ' | ' + shots + ' |'
  }).join('\n')
  return header + body + '\n'
}

// specs/20260902/08-genesis-shrink-brief-state.md D7: every probe.json task carries exactly
// one entry per task name — the gallery row key is the task name alone.
function taskRowKey(t) { return t.task }

function renderGalleryHtml(rows) {
  const post = (status.tournament && status.tournament.post) || {}
  const taskOrder = []
  const seen = new Set()
  for (const r of rows) {
    const tasks = (post[r.name] && post[r.name].tasks) || []
    for (const t of tasks) {
      const key = taskRowKey(t)
      if (t.screenshot && !seen.has(key)) { seen.add(key); taskOrder.push(key) }
    }
  }
  const names = rows.map((r) => r.name)
  let html = '<!doctype html>\n<html><head><meta charset="utf-8"><title>Tournament gallery</title></head><body>\n' +
    '<table border="1">\n<tr><th>task</th>' + names.map((n) => '<th>' + n + '</th>').join('') + '</tr>\n'
  for (const task of taskOrder) {
    html += '<tr><td>' + task + '</td>'
    for (const name of names) {
      const tasks = (post[name] && post[name].tasks) || []
      const t = tasks.find((x) => taskRowKey(x) === task)
      html += '<td>' + (t && t.screenshot ? '<img src="' + t.screenshot + '">' : '') + '</td>'
    }
    html += '</tr>\n'
  }
  html += '</table>\n</body></html>\n'
  return html
}

function writeBenchmark() {
  const rows = benchmarkRows()
  fs.mkdirSync(tournamentDir(), { recursive: true })
  fs.writeFileSync(benchmarkJsonPath(), JSON.stringify({ finalists: rows, at: new Date().toISOString() }, null, 2) + '\n')
  fs.writeFileSync(benchmarkMdPath(), renderBenchmarkMd(rows))
  fs.writeFileSync(galleryPath(), renderGalleryHtml(rows))
}

// D8: the driver never ranks finalists — it matches the brief's CURRENT ## Picks against each
// finalist's own `picks`. Exactly one match records the winner; zero or several is refused.
// specs/20260902/08-genesis-shrink-brief-state.md D1/D7: the design pick this mark used
// to also validate (specs/20260827/02's EXPLORE tile winner) is retired outright — the design
// canon is ratified at BRIEF, before the tournament ever runs, so PICK is a stack-only decision.
function handlePicked() {
  if (!(status.tournament && status.tournament.finalists)) die('the tournament has not reached PICK yet')
  const finalistDefs = status.tournament.finalistDefs || []
  const matches = finalistDefs.filter(finalistMatchesCurrentPicks)
  if (matches.length !== 1) {
    die('## Picks matches ' + matches.length + ' finalist(s) — exactly 1 match is required to record a winner; rewrite ## Picks to the winner\'s labels, then re-mark picked')
  }
  status.tournament = Object.assign({}, status.tournament, { winner: matches[0].name, at: new Date().toISOString() })
  saveStatus()
  return { prev: 'PICK', next: 'DECIDE' }
}

// ---------------------------------------------------------------------------
// DECIDE (D5): the decision-record closure check.
// ---------------------------------------------------------------------------
const REQUIRED_DESCRIPTOR_KEYS = [
  'archetype', 'language', 'framework', 'packageManager', 'testRunner', 'linter',
  'typechecker', 'gateCommand', 'scaffoldCommand',
]

function descriptorRelPath() { return status.stackDescriptorPath || '.claude/genesis/stack-descriptor.json' }
function descriptorAbsPath() {
  const p = descriptorRelPath()
  return path.isAbsolute(p) ? p : path.join(root, p)
}
function readStackDescriptor() {
  try { return JSON.parse(fs.readFileSync(descriptorAbsPath(), 'utf8')) } catch { return null }
}
function resolveAdrPath(p) { return path.isAbsolute(p) ? p : path.join(root, p) }

// specs/20260827/03-genesis-design-state.md D2 reuses this section extraction against
// docs/design/doctrine.md's own ## Dissents heading (same grammar as an ADR's).
function dissentsBody(text) {
  const m = /^##\s+Dissents\s*$/m.exec(text)
  if (!m) return null
  const rest = text.slice(m.index + m[0].length)
  const next = rest.search(/^##\s/m)
  return next === -1 ? rest : rest.slice(0, next)
}

function dissentsNonEmpty(text) {
  const body = dissentsBody(text)
  return body !== null && body.split('\n').some((l) => l.trim().length > 0)
}

// specs/20260827/04-genesis-conventions-handoff.md D1/D2: the nine floor keys every
// `.claude/genesis/conventions.json` must carry a row for, decided or deferred.
const CONVENTIONS_FLOOR_KEYS = [
  'error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations',
  'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric',
]

function conventionsPath() { return path.join(genesisDir, 'conventions.json') }
function readConventions() {
  try { return JSON.parse(fs.readFileSync(conventionsPath(), 'utf8')) } catch (e) { return null }
}

// D2: `decided` gains this as an ADDITIONAL gate, run only once the pre-existing decideCheck()
// below has already passed (D8's regression pin: the ADR/Dissents/dimension checks must keep
// firing exactly as before, never superseded or reordered away by this new gate). Walks rows in
// file order and returns the FIRST offender, named by key, per D2's own wording.
function conventionsCheck() {
  const conv = readConventions()
  if (!conv) return { ok: false, reason: 'unreadable' }
  const testTree = (typeof conv.testTree === 'string' && conv.testTree) ? conv.testTree : null
  if (!testTree) return { ok: false, reason: 'no-test-tree' }
  const rows = Array.isArray(conv.rows) ? conv.rows : []
  const byKey = {}
  for (const r of rows) { if (r && typeof r.key === 'string') byKey[r.key] = r }
  for (const floorKey of CONVENTIONS_FLOOR_KEYS) {
    if (!(floorKey in byKey)) return { ok: false, reason: 'missing-floor-key', detail: floorKey }
  }
  for (const r of rows) {
    if (r.status !== 'DECIDED' && r.status !== 'DEFERRED') {
      return { ok: false, reason: 'bad-status', detail: r.key }
    }
    if (r.status === 'DEFERRED' && (typeof r.reason !== 'string' || !r.reason.trim())) {
      return { ok: false, reason: 'empty-reason', detail: r.key }
    }
    if (r.status === 'DECIDED') {
      if (typeof r.enforceable !== 'boolean') {
        return { ok: false, reason: 'bad-enforceable', detail: r.key }
      }
      if (r.enforceable === true && (typeof r.probe !== 'string' || !r.probe.startsWith(testTree + '/'))) {
        return { ok: false, reason: 'bad-probe', detail: r.key, testTree }
      }
    }
    if (typeof r.adr !== 'string' || !r.adr.trim() || !fs.existsSync(resolveAdrPath(r.adr))) {
      return { ok: false, reason: 'adr-missing', detail: r.key }
    }
  }
  return { ok: true, testTree, rows }
}

function describeConventionsGap(check) {
  if (check.reason === 'unreadable') return conventionsPath() + ' does not exist or is not valid JSON'
  if (check.reason === 'no-test-tree') return conventionsPath() + ' is missing a non-empty "testTree" string'
  if (check.reason === 'missing-floor-key') return conventionsPath() + ' is missing required floor key "' + check.detail + '"'
  if (check.reason === 'bad-status') return conventionsPath() + ' row "' + check.detail + '" has a "status" that is not DECIDED or DEFERRED'
  if (check.reason === 'empty-reason') return conventionsPath() + ' DEFERRED row "' + check.detail + '" has an empty "reason"'
  if (check.reason === 'bad-enforceable') return conventionsPath() + ' DECIDED row "' + check.detail + '" has a non-boolean "enforceable"'
  if (check.reason === 'bad-probe') return conventionsPath() + ' row "' + check.detail + '" has an enforceable "probe" that does not begin with "' + check.testTree + '/"'
  if (check.reason === 'adr-missing') return conventionsPath() + ' row "' + check.detail + '" names an "adr" that does not exist'
  return conventionsPath() + ' is not valid'
}

function decideCheck() {
  const desc = readStackDescriptor()
  if (!desc) return { ok: false, reason: 'no-descriptor' }
  for (const k of REQUIRED_DESCRIPTOR_KEYS) {
    if (!desc[k] || typeof desc[k] !== 'string' || !desc[k].trim()) {
      return { ok: false, reason: 'missing-key', detail: k }
    }
  }
  if (!Array.isArray(desc.decisionRecords) || desc.decisionRecords.length === 0) {
    return { ok: false, reason: 'missing-key', detail: 'decisionRecords' }
  }
  const adrTexts = []
  for (const rawPath of desc.decisionRecords) {
    const adrPath = resolveAdrPath(rawPath)
    if (!fs.existsSync(adrPath)) return { ok: false, reason: 'adr-missing', detail: adrPath }
    const text = fs.readFileSync(adrPath, 'utf8')
    if (!dissentsNonEmpty(text)) return { ok: false, reason: 'adr-empty-dissents', detail: adrPath }
    adrTexts.push(text)
  }
  const combined = adrTexts.join('\n')
  for (const key of allDimensionKeys()) {
    if (!combined.includes('`' + key + '`')) return { ok: false, reason: 'dim-unnamed', detail: key }
  }
  return { ok: true, descriptor: desc, adrTexts }
}

function describeDecideGap(check) {
  if (check.reason === 'no-descriptor') return 'stack descriptor not found at ' + descriptorAbsPath()
  if (check.reason === 'missing-key') return 'stack descriptor is missing required key "' + check.detail + '"'
  if (check.reason === 'adr-missing') return 'decision record ' + check.detail + ' does not exist'
  if (check.reason === 'adr-empty-dissents') return 'decision record ' + check.detail + ' has an empty ## Dissents section'
  if (check.reason === 'dim-unnamed') return 'open dimension `' + check.detail + '` is not named in any decision record'
  return 'the decision record is not yet closed'
}

// specs/20260827/01-genesis-tournament.md D9: once a tournament winner is recorded, `decided`
// gains two more checks on top of the base decideCheck() closure: the descriptor's
// scaffoldCommand must be the winner's own (the descriptor must scaffold exactly what the race
// validated, never something the race never touched), and at least one listed ADR must cite the
// literal `.claude/genesis/tournament/benchmark.md` path (the durable link back to the executed
// evidence). On success the raced `finalists/` and `logs/` are deleted (A3) — scratch race
// output, never durable evidence; `benchmark.json/.md`, `gallery.html`, and `evidence/` survive.
function handleDecided() {
  if (!status.marks.menusDone) die('menus-done has not been marked yet — mark menus-done first')
  const check = decideCheck()
  if (!check.ok) die(describeDecideGap(check) + ' — fix it, then re-mark decided')
  // D2: an ADDITIONAL gate, run only once decideCheck() above has already passed — D8's
  // regression pin requires the pre-existing ADR/Dissents/dimension checks to keep firing
  // exactly as before, never superseded or reordered away by this new conventions.json gate.
  const convCheck = conventionsCheck()
  if (!convCheck.ok) die(describeConventionsGap(convCheck) + ' — fix it, then re-mark decided')
  if (status.tournament && status.tournament.winner) {
    const winnerDef = (status.tournament.finalistDefs || []).find((f) => f.name === status.tournament.winner)
    if (winnerDef && check.descriptor.scaffoldCommand !== winnerDef.scaffoldCommand) {
      die('stack-descriptor.json\'s scaffoldCommand does not match the tournament winner\'s ("' +
        status.tournament.winner + '") scaffoldCommand — set scaffoldCommand to exactly the winner\'s value, then re-mark decided')
    }
    const combined = (check.adrTexts || []).join('\n')
    if (!combined.includes('.claude/genesis/tournament/benchmark.md')) {
      die('no listed decision record cites `.claude/genesis/tournament/benchmark.md` — add the citation to at least one ADR, then re-mark decided')
    }
  }
  status.marks.decided = true
  status.architect = 'decisions-recorded'
  if (status.tournament && status.tournament.winner) {
    try { fs.rmSync(finalistsRootDir(), { recursive: true, force: true }) } catch (e) { /* already gone */ }
    try { fs.rmSync(tournamentLogsDir(), { recursive: true, force: true }) } catch (e) { /* already gone */ }
  }
  saveStatus()
  return { prev: 'DECIDE', next: 'SCAFFOLD' }
}

// ---------------------------------------------------------------------------
// SCAFFOLD / SKELETON / GATE (D6/D7, driver-only): run scaffoldCommand and gateCommand via
// `bash -c` in --root (the idiom smoke.sh uses for bootCommand/readyCheck).
// ---------------------------------------------------------------------------
function scaffoldLogPath() { return path.join(genesisDir, 'scaffold.log') }
function gateLogPath() { return path.join(genesisDir, 'gate.log') }

// specs/20260827/01-genesis-tournament.md A5: `cwd` is an ADDITIVE option (default `root`,
// byte-identical to the pre-spec behavior) — the tournament's RACE/PROBE legs run every finalist
// command inside its own `tournament/finalists/<name>/`, never in `--root` itself.
function runLogged(cmd, args, logPath, opts) {
  const cwd = (opts && opts.cwd) || root
  // The log fd is opened and truncated BEFORE the child spawns, then handed straight to
  // spawnSync's stdio for both stdout and stderr — the child's output never transits a Node
  // pipe, so it can never overflow one (see the header's runChild paragraph). Closed on every
  // path, including a die() inside runChild (the process is exiting anyway; the OS reclaims it).
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  let fd
  try {
    fd = fs.openSync(logPath, 'w')
  } catch (e) {
    die('could not open log file ' + logPath + ' for writing (' + e.message + ') — check the ' +
      'directory is writable and re-run')
  }
  let r
  try {
    const what = (opts && opts.what) || ('command "' + [cmd].concat(args).join(' ') + '"')
    r = runChild(cmd, args, { cwd, stdio: ['ignore', fd, fd] }, what)
  } finally {
    try { fs.closeSync(fd) } catch (e) { /* already closed */ }
  }
  return r
}

function runShell(cmd, logPath, opts) {
  return runLogged('bash', ['-c', cmd], logPath, Object.assign({ what: 'shell command "' + cmd + '"' }, opts))
}

function runScaffoldIfDue() {
  if (status.scaffold && status.scaffold.exit === 0) return status.scaffold
  const desc = readStackDescriptor()
  const r = runShell(desc.scaffoldCommand, scaffoldLogPath())
  status.scaffold = { exit: r.status, at: new Date().toISOString() }
  saveStatus()
  return status.scaffold
}

function runGateIfDue() {
  const desc = readStackDescriptor()
  const r = runShell(desc.gateCommand, gateLogPath())
  status.zeroDayGate = { exit: r.status, at: new Date().toISOString() }
  if (r.status === 0) {
    status.architect = 'scaffold-complete'
    status.gateCommand = desc.gateCommand
  }
  saveStatus()
  return status.zeroDayGate
}

// specs/20260827/04-genesis-conventions-handoff.md D3: every enforceable DECIDED row's probe
// file must exist and be non-empty, checked at `skeleton-landed` (not at `decided` — probes are
// landed WITH the skeleton, per Behavior). Re-reads conventions.json fresh, never trusts the
// `decided` mark's earlier validation alone.
function probeCheck() {
  const conv = readConventions()
  const rows = (conv && Array.isArray(conv.rows)) ? conv.rows : []
  for (const r of rows) {
    if (r && r.status === 'DECIDED' && r.enforceable === true) {
      const p = path.join(root, r.probe)
      if (!fs.existsSync(p) || !fs.readFileSync(p, 'utf8').trim()) {
        return { ok: false, key: r.key, probe: r.probe }
      }
    }
  }
  return { ok: true }
}

function describeProbeGap(check) {
  return 'conventions.json row "' + check.key + '" is enforceable but its probe file ' +
    check.probe + ' does not exist or is empty'
}

// D3: the binding-subset file (CLAUDE.md, or AGENTS.md when CLAUDE.md is absent) must exist,
// be <= 150 lines, and name the descriptor's gateCommand and the conventions testTree as
// literals — the doc agents actually read, not judged on content beyond that.
const BINDING_SUBSET_LINE_CAP = 150

function bindingSubsetCheck(desc, testTree) {
  const claudePath = path.join(root, 'CLAUDE.md')
  const agentsPath = path.join(root, 'AGENTS.md')
  let file = null
  let text = null
  if (fs.existsSync(claudePath)) { file = 'CLAUDE.md'; text = fs.readFileSync(claudePath, 'utf8') }
  else if (fs.existsSync(agentsPath)) { file = 'AGENTS.md'; text = fs.readFileSync(agentsPath, 'utf8') }
  if (!file) return { ok: false, reason: 'no-file' }
  const lineCount = text.split('\n').length
  if (lineCount > BINDING_SUBSET_LINE_CAP) return { ok: false, reason: 'too-long', file, lineCount }
  if (typeof desc.gateCommand !== 'string' || !text.includes(desc.gateCommand)) {
    return { ok: false, reason: 'no-gate-literal', file }
  }
  if (!text.includes(testTree)) return { ok: false, reason: 'no-testtree-literal', file }
  return { ok: true, file }
}

function describeBindingSubsetGap(check) {
  if (check.reason === 'no-file') return 'no root CLAUDE.md or AGENTS.md exists'
  if (check.reason === 'too-long') {
    return check.file + ' is ' + check.lineCount + ' lines — the binding-subset cap is ' + BINDING_SUBSET_LINE_CAP + ' lines'
  }
  if (check.reason === 'no-gate-literal') return check.file + ' does not contain the descriptor\'s gateCommand literal'
  if (check.reason === 'no-testtree-literal') return check.file + ' does not contain the conventions testTree literal'
  return 'the binding-subset file is not valid'
}

function handleSkeletonLanded() {
  if (!status.marks.decided) die('decided has not been recorded yet — mark decided first')
  if (!(status.scaffold && status.scaffold.exit === 0)) {
    die('the scaffold has not completed successfully yet — resolve SCAFFOLD/SCAFFOLD_RED before marking skeleton-landed')
  }
  if (status.architect === 'scaffold-complete') {
    die('the zero-day gate has already passed — nothing to re-run; continue with the ROADMAP step')
  }
  const desc = readStackDescriptor() || {}
  const conv = readConventions()
  const testTree = (conv && typeof conv.testTree === 'string' && conv.testTree) ? conv.testTree : 'tests'
  const pc = probeCheck()
  if (!pc.ok) die(describeProbeGap(pc) + ' — land it, then re-mark skeleton-landed')
  const bc = bindingSubsetCheck(desc, testTree)
  if (!bc.ok) die(describeBindingSubsetGap(bc) + ' — fix it, then re-mark skeleton-landed')
  // specs/20260902/08-genesis-shrink-brief-state.md D5: the components manifest check
  // relocates here from the retired DESIGN state's tokens-landed/rules-locked marks — the
  // manifest is a skeleton artifact (spec 11 will make SCAFFOLD extract it from the approved
  // mocks set; until then the session seeds it here per the surviving doctrine, Assumption A2).
  if (isVisualArchetype(status.archetype)) {
    if (!fs.existsSync(componentsJsonPath())) {
      die('design/components.json does not exist — seed the component vocabulary, then re-mark skeleton-landed')
    }
    const componentsCheckBin = path.join(__dirname, 'components-check.js')
    const r = runChild(process.execPath, [componentsCheckBin, componentsJsonPath()],
      { encoding: 'utf8' }, 'components-check.js (design/components.json)')
    if (r.status !== 0) {
      die('components-check.js failed for design/components.json: ' + (r.stdout || r.stderr || '').trim())
    }
  }
  // specs/20260902/11-brief-from-approved-set.md D5: on a fresh visual run (status.brief.mocks
  // set — Behavior: Applicability), the shell canon and the component inventory must be
  // EXTRACTED from the composed set: design/shell/app.html passes `check`, every top-level
  // design/mocks/*.html declares data-shell, `check --matrix design/mocks` exits 0, and
  // design/components.json carries an entry for every canon.md primitive. Runs after the
  // pre-existing components.json existence/duplicate-name check above so a missing manifest is
  // still reported by that check's own message, never masked by this block's primitive-coverage
  // read of the same file.
  if (status.brief && status.brief.mocks) {
    const designAtlasBin = path.join(__dirname, 'design-atlas.js')
    const shellHtmlPath = path.join(root, 'design/shell/app.html')
    if (!fs.existsSync(shellHtmlPath)) {
      die('design/shell/app.html does not exist — author it from the densest composed screen, then run design-atlas.js shell adopt --apply')
    }
    const shellCheck = runChild(process.execPath, [designAtlasBin, 'check', shellHtmlPath],
      { encoding: 'utf8' }, 'design-atlas.js check (design/shell/app.html)')
    if (shellCheck.status !== 0) {
      die('design/shell/app.html failed design-atlas.js check: ' + (shellCheck.stdout || shellCheck.stderr || '').trim())
    }

    const mocksDirPath = path.join(root, 'design/mocks')
    let mockFiles = []
    try { mockFiles = fs.readdirSync(mocksDirPath).filter((f) => f.endsWith('.html')) } catch (e) { mockFiles = [] }
    const undeclared = mockFiles.filter((f) => !/data-shell\s*=\s*"[^"]*"/.test(fs.readFileSync(path.join(mocksDirPath, f), 'utf8')))
    if (undeclared.length) {
      die('mock(s) without data-shell: ' + undeclared.join(', ') + ' — run design-atlas.js shell adopt --apply, then re-mark skeleton-landed')
    }

    const matrixCheck = runChild(process.execPath, [designAtlasBin, 'check', '--matrix', mocksDirPath],
      { encoding: 'utf8' }, 'design-atlas.js check --matrix (design/mocks)')
    if (matrixCheck.status !== 0) {
      die('design-atlas.js check --matrix design/mocks failed: ' + (matrixCheck.stdout || matrixCheck.stderr || '').trim())
    }

    let canonText = null
    try { canonText = fs.readFileSync(path.join(root, 'design/mocks/canon.md'), 'utf8') } catch (e) { canonText = null }
    if (canonText !== null) {
      const primSec = section(canonText, 'Primitives') || ''
      const primitives = []
      for (const raw of primSec.split('\n')) {
        const m = raw.trim().match(/^-\s+\*\*(.+?)\*\*/)
        if (m) primitives.push(m[1])
      }
      let manifest = []
      try { manifest = JSON.parse(fs.readFileSync(componentsJsonPath(), 'utf8')) } catch (e) { manifest = [] }
      const manifestNames = new Set((Array.isArray(manifest) ? manifest : []).map((c) => c && c.name))
      const missingPrimitives = primitives.filter((p) => !manifestNames.has(p))
      if (missingPrimitives.length) {
        die('components.json is missing primitive(s) from canon.md: ' + missingPrimitives.join(', ') +
          ' — add them, then re-mark skeleton-landed')
      }
    }
  }
  status.marks.skeletonLanded = true
  saveStatus()
  const g = runGateIfDue()
  return { prev: 'SKELETON', next: g.exit === 0 ? 'ROADMAP' : 'GATE_RED' }
}

// Caps the byte window logTail reads off disk before it ever looks at lines. A few KB is enough
// to show a failing gate's last output; it is far below any caller's stdout-capture buffer (a
// test's default 1 MiB spawnSync maxBuffer among them) — see the header's F7 paragraph.
const LOGTAIL_MAX_BYTES = 4096

function logTail(p, n) {
  let fd
  try {
    fd = fs.openSync(p, 'r')
  } catch {
    return ''
  }
  let text = ''
  let byteTruncated = false
  try {
    const size = fs.fstatSync(fd).size
    const readLen = Math.min(size, LOGTAIL_MAX_BYTES)
    const buf = Buffer.alloc(readLen)
    if (readLen > 0) fs.readSync(fd, buf, 0, readLen, size - readLen)
    text = buf.toString('utf8')
    // A byte-offset cut can land mid-character; Node's UTF-8 decoder renders the resulting
    // partial sequence at the start of the string as one or more U+FFFD, never a throw. Strip
    // them so the excerpt doesn't open with visible mojibake.
    while (text.length && text.charCodeAt(0) === 0xfffd) text = text.slice(1)
    byteTruncated = size > readLen
  } catch {
    text = ''
  } finally {
    try { fs.closeSync(fd) } catch { /* already closed */ }
  }
  // The line slice runs BEFORE the truncation marker is attached, never after: prepending the
  // marker and then slicing the last N lines would make the marker itself a slice candidate —
  // on any byte window holding more than N lines (the ordinary large multi-line failing-gate
  // log, not just the single-giant-line case), the marker would sit far enough back in the
  // window that the line slice discards it, and the reader would see a plain, confident-looking
  // excerpt with no sign it's partial. A line dropped by the slice is exactly as much "there is
  // more, on disk" as a byte dropped by the read window, so either condition attaches the marker
  // to the final text.
  const lines = text.split('\n')
  const wanted = n || 20
  const tail = lines.slice(-wanted)
  const lineTruncated = tail.length < lines.length
  const body = tail.join('\n')
  return (byteTruncated || lineTruncated) ? '… truncated, full log at ' + p + ' …\n' + body : body
}

// ---------------------------------------------------------------------------
// ROADMAP (D8): the roadmap closure check — headers present, Depends-on graph acyclic.
// ---------------------------------------------------------------------------
function roadmapFiles() {
  const roadmapDir = path.join(root, 'docs/roadmap')
  let files = []
  try { files = fs.readdirSync(roadmapDir) } catch { files = [] }
  return { roadmapDir, files }
}
function briefFileNames() {
  return roadmapFiles().files.filter((f) => /^\d\d-.*\.md$/.test(f) && f !== '00-overview.md')
}

function findCycle(graph) {
  const color = {}
  let cyclePath = null
  function visit(node, stack) {
    if (cyclePath) return
    color[node] = 1
    stack.push(node)
    for (const dep of graph[node] || []) {
      if (!(dep in graph)) continue
      if (color[dep] === 1) { cyclePath = stack.slice(stack.indexOf(dep)).concat(dep); return }
      if (color[dep] !== 2) visit(dep, stack)
      if (cyclePath) return
    }
    stack.pop()
    color[node] = 2
  }
  for (const node of Object.keys(graph)) {
    if (color[node] === undefined) visit(node, [])
    if (cyclePath) return cyclePath
  }
  return null
}

function roadmapCheck() {
  const { roadmapDir, files } = roadmapFiles()
  if (!files.includes('00-overview.md')) return { ok: false, reason: 'no-overview' }
  const briefs = briefFileNames()
  if (briefs.length === 0) return { ok: false, reason: 'no-briefs' }
  const graph = {}
  for (const f of briefs) {
    const text = fs.readFileSync(path.join(roadmapDir, f), 'utf8')
    const beforeFirstHeading = text.split(/^##\s/m)[0]
    const phaseM = /Phase:\s*([^\n·]+)/m.exec(beforeFirstHeading)
    const dependsM = /Depends on:\s*([^\n]+)/m.exec(beforeFirstHeading)
    if (!phaseM || !dependsM) return { ok: false, reason: 'missing-headers', detail: f }
    const idM = f.match(/^(\d\d)-/)
    const id = idM ? idM[1] : f
    const deps = dependsM[1].split(',').map((s) => s.trim())
      .filter((s) => s && s !== '—' && s !== '-' && s.toLowerCase() !== 'none')
      .map((s) => { const m2 = s.match(/\d\d/); return m2 ? m2[0] : s })
    graph[id] = deps
  }
  const cycle = findCycle(graph)
  if (cycle) return { ok: false, reason: 'cycle', detail: cycle }
  return { ok: true }
}

function handleRoadmapWritten() {
  if (status.architect !== 'scaffold-complete') {
    die('the zero-day gate has not passed yet (architect: ' + status.architect + ') — finish SKELETON/GATE first')
  }
  const check = roadmapCheck()
  if (!check.ok) {
    if (check.reason === 'no-overview') die('docs/roadmap/00-overview.md does not exist — write it, then re-mark roadmap-written')
    if (check.reason === 'no-briefs') die('no docs/roadmap/NN-*.md brief exists — decompose at least one, then re-mark roadmap-written')
    if (check.reason === 'missing-headers') {
      die('docs/roadmap/' + check.detail + ' is missing a Phase: or Depends on: header before its first ## heading — add both, then re-mark roadmap-written')
    }
    if (check.reason === 'cycle') {
      die('docs/roadmap has a Depends-on cycle: ' + check.detail.join(' -> ') + ' — break the cycle, then re-mark roadmap-written')
    }
  }
  // specs/20260902/11-brief-from-approved-set.md D4: on a fresh visual run (status.brief.mocks
  // set — Behavior: Applicability; legacy and non-visual runs see none of this), every seed
  // label must land in exactly one brief's ```surfaces block — the atlas's gap/orphan badges
  // then mean what they say from day one.
  if (status.brief && status.brief.mocks) {
    const pc = journeyPlacementCheck()
    if (!pc.ok) {
      if (pc.reason === 'unplaced') {
        die('seed label(s) not placed in any brief\'s surfaces block: ' + pc.labels.join(', ') +
          ' — add each to a brief\'s ```surfaces block, then re-mark roadmap-written')
      }
      if (pc.reason === 'double') {
        die('seed label(s) placed in two briefs: ' + pc.label + ' (' + pc.files.join(', ') + ')' +
          ' — remove it from every brief but one, then re-mark roadmap-written')
      }
    }
  }
  status.marks.roadmapWritten = true
  // specs/20260902/08-genesis-shrink-brief-state.md D9: the design canon (doctrine,
  // design-rules, tokens) is ratified at BRIEF now, long before ROADMAP — there is no DESIGN
  // state left to route into here for any archetype; ROADMAP hands straight to HANDOFF.
  saveStatus()
  return { prev: 'ROADMAP', next: 'HANDOFF' }
}

// ---------------------------------------------------------------------------
// Design-canon helpers shared by BRIEF (handleBriefWritten, above) and by SKELETON's
// components.json check (handleSkeletonLanded, below). specs/20260902/08-genesis-shrink-
// brief-state.md D3/D4: the design canon (doctrine length/Dissents, the design-rules enum) is
// ratified at BRIEF now; the pick record lives in the mocks status (status.brief), never in a
// per-candidate file, and there is no candidate directory left anywhere to prune.
// ---------------------------------------------------------------------------
const DOCTRINE_LINE_CAP = 120
const DESIGN_RULE_CATEGORIES = ['color', 'typography', 'i18n', 'structure', 'a11y', 'density', 'layout']

function doctrinePath() { return path.join(root, 'docs/design/doctrine.md') }
function tokensCssPath() { return path.join(root, 'design/tokens.css') }
function componentsJsonPath() { return path.join(root, 'design/components.json') }
function designRulesPath() { return path.join(genesisDir, 'design-rules.json') }

// D4: design-rules.json's rules[] must carry only the seven closed targetCategory values and
// grounding ∈ grounded|taste (an empty rules array is valid — every archetype this check now
// runs for, visual or not, may have nothing category-specific to say).
function designRulesCheck() {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(designRulesPath(), 'utf8'))
  } catch (e) {
    return { ok: false, reason: 'unreadable', detail: e.message }
  }
  if (!Array.isArray(parsed.rules)) return { ok: false, reason: 'no-rules-array' }
  for (const rule of parsed.rules) {
    if (!rule || typeof rule.id !== 'string' || !rule.id.trim()) return { ok: false, reason: 'bad-id', rule }
    if (!DESIGN_RULE_CATEGORIES.includes(rule.targetCategory)) return { ok: false, reason: 'bad-category', rule }
    if (rule.grounding !== 'grounded' && rule.grounding !== 'taste') return { ok: false, reason: 'bad-grounding', rule }
    if (typeof rule.severity !== 'string' || !rule.severity.trim()) return { ok: false, reason: 'bad-severity', rule }
    if (!Array.isArray(rule.appliesTo)) return { ok: false, reason: 'bad-appliesto', rule }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// HANDOFF -> GROUNDED (specs/20260827/04-genesis-conventions-handoff.md D4): the greenfield
// grounding closure. `profile-written` is the last mark of the whole genesis driver — it runs
// init-gen.js generate itself (the way /spec:init's own Phase 5 does) instead of handing off to
// a separate command, and its acceptance is what reaches the new terminal state GROUNDED.
// ---------------------------------------------------------------------------
function initGenLogPath() { return path.join(genesisDir, 'init-gen.log') }

// The exit-code-keyed remedy D4 lists verbatim (1: manifest row, 2: profile field, 3: hand
// edits differ from what the profile would produce, 4: internal error — never a verdict).
function remedyForExit(code) {
  switch (code) {
    case 1: return 'fix the manifest row init-gen.log names, then re-mark profile-written'
    case 2: return 'fix the profile field it names, then re-mark profile-written'
    case 3: return 'fold the hand edits into the profile and re-mark profile-written with --refresh'
    case 4: return 're-mark profile-written (internal error, never a verdict)'
    default: return 're-mark profile-written'
  }
}

// Bash-quotes a single argument for the shell command string runShell (D4's own idiom) executes
// via `bash -c` — every path here can contain spaces even though none of the fixtures do.
function shQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }

function handleProfileWritten() {
  if (!FILE) die('--mark profile-written needs --file <profile.json> (relative to the project root, or an absolute path)')
  const resolved = path.isAbsolute(FILE) ? FILE : path.join(root, FILE)
  if (!fs.existsSync(resolved)) {
    die('--file ' + FILE + ' does not exist at ' + resolved + ' — write the init profile ' +
      '(init.md Phase 4\'s shape), then re-mark profile-written')
  }
  try {
    JSON.parse(fs.readFileSync(resolved, 'utf8'))
  } catch (e) {
    die(resolved + ' is not valid JSON (' + e.message + ') — fix it and re-mark profile-written')
  }
  const initGenBin = path.join(__dirname, 'init-gen.js')
  const cmd = [shQuote(process.execPath), shQuote(initGenBin), 'generate', '--root', shQuote(root),
    '--profile', shQuote(resolved)].concat(REFRESH ? ['--refresh'] : []).join(' ')
  const logPath = initGenLogPath()
  const r = runShell(cmd, logPath)
  if (r.status === 0) {
    status.handoff = { initGenExit: 0, at: new Date().toISOString() }
    saveStatus()
    return { prev: 'HANDOFF', next: 'GROUNDED' }
  }
  die('init-gen generate exited ' + r.status + ' — ' + remedyForExit(r.status) + ':\n' +
    'log: ' + genesisRel('init-gen.log') + '\n' + logTail(logPath))
}

// ---------------------------------------------------------------------------
// deriveState (D2) — side-effecting by default: runs the driver-only SCAFFOLD/GATE stages as
// needed, idempotent on scaffold.exit === 0; every check re-reads the artifacts, never trusts a
// mark whose backing file has vanished or regressed.
//
// `{ peek: true }` (used only by `--state`, F3) derives the SAME state without ever invoking
// runScaffoldIfDue/runGateIfDue or writing status.json: it reads back whatever scaffold/gate
// result is already on disk instead of running the command. When no result is on disk yet, it
// reports the transient driver-only name (`SCAFFOLD`/`GATE`, both in D2's state enum) that a
// bare invocation would immediately resolve by running the command — never runs it itself.
// ---------------------------------------------------------------------------
function deriveState(opts) {
  const peek = !!(opts && opts.peek)

  // specs/20260902/08-genesis-shrink-brief-state.md D6: a status.json carrying
  // `marks.menusDone` with no `marks.briefWritten` resumes at BRIEF on its existing artifacts;
  // `discoveryDone` is trusted from the recorded mark alone for this one resume path, since
  // its own brief.md is not required to satisfy discoveryCheck()'s current grammar or even to
  // exist.
  const legacyResume = !!(status.marks && status.marks.menusDone && !status.marks.briefWritten)

  const disc = discoveryCheck()
  if (!status.marks.discoveryDone || (!legacyResume && !disc.ok)) return 'DISCOVERY'

  // specs/20260902/08-genesis-shrink-brief-state.md D1/D6: BRIEF sits between DISCOVERY
  // and MENUS — a legacy status.json past MENUS with no `marks.briefWritten` still derives BRIEF
  // here, regardless of any later legacy marks already recorded (D6's "resumes at BRIEF").
  if (!status.marks.briefWritten) return 'BRIEF'

  const menus = menusCheck()
  if (!status.marks.menusDone || !menus.ok) return 'MENUS'

  // specs/20260827/01-genesis-tournament.md D1: FINALISTS -> RACE -> PROBE -> PICK sits between
  // MENUS and DECIDE for a tournament archetype that hasn't been skipped or resolved yet. Once
  // skipped (tournament.skipped) or resolved (tournament.winner), fall straight through to the
  // unchanged decideCheck() derivation below — a non-tournament archetype never enters this block
  // at all (status.archetype stays outside TOURNAMENT_ARCHETYPES). specs/20260902/08's D6
  // legacy resume additionally exempts a host whose `decided` mark is already recorded — a
  // legacy record past DECIDE has necessarily already resolved (or predates) the tournament, and
  // must never be routed backward into FINALISTS just because it carries no tournament record.
  if (isTournamentArchetype(status.archetype) && !status.marks.decided &&
      !(status.tournament && (status.tournament.skipped || status.tournament.winner))) {
    const t = status.tournament || {}
    if (!t.finalists) return 'FINALISTS'
    const race = t.race || {}
    const allRaced = t.finalists.every((n) => race[n])
    if (!allRaced) {
      if (peek) return 'RACE'
      runRace()
      return 'PROBE'
    }
    const post = t.post || {}
    const activeFinalists = t.finalists.filter((n) => race[n] && race[n].scaffold.exit === 0)
    const allProbed = activeFinalists.every((n) => post[n])
    if (!allProbed) return 'PROBE'
    return 'PICK'
  }

  // specs/20260902/08-genesis-shrink-brief-state.md D6: a legacy-ratified status
  // (`status.brief.legacy === true`) trusts its own recorded `decided`/`roadmapWritten` marks
  // for these two closure checks instead of re-validating their backing artifacts — a legacy
  // host is never asked to reconstruct them (AC-20260902-08-7: "every downstream legacy mark
  // stays valid so the run lands on its real next state after one mark").
  const legacyTrusted = !!(status.brief && status.brief.legacy)

  const decide = decideCheck()
  if (!status.marks.decided || (!legacyTrusted && !decide.ok)) return 'DECIDE'

  if (!(status.scaffold && status.scaffold.exit === 0)) {
    if (peek) return status.scaffold ? 'SCAFFOLD_RED' : 'SCAFFOLD'
    const s = runScaffoldIfDue()
    return s.exit === 0 ? 'SKELETON' : 'SCAFFOLD_RED'
  }

  if (status.architect !== 'scaffold-complete') {
    if (!status.marks.skeletonLanded) return 'SKELETON'
    if (peek) return status.zeroDayGate ? 'GATE_RED' : 'GATE'
    const g = runGateIfDue()
    return g.exit === 0 ? 'ROADMAP' : 'GATE_RED'
  }

  const rm = roadmapCheck()
  if (!status.marks.roadmapWritten || (!legacyTrusted && !rm.ok)) return 'ROADMAP'

  // specs/20260902/08-genesis-shrink-brief-state.md D9: ROADMAP hands directly to HANDOFF —
  // the design canon is ratified at BRIEF, before ROADMAP is ever reached.

  // specs/20260827/04-genesis-conventions-handoff.md D4: HANDOFF is not terminal — once
  // `profile-written` records a successful init-gen generate run, the derived state advances to
  // the new terminal state GROUNDED. No `peek` branch is needed here (unlike SCAFFOLD/GATE):
  // this reads a value status.handoff already persisted, with no side effect either way.
  if (status.handoff && status.handoff.initGenExit === 0) return 'GROUNDED'

  return 'HANDOFF'
}

// ---------------------------------------------------------------------------
// Step text per state (D9: every step opens with a Read only: file list).
// ---------------------------------------------------------------------------
// specs/20260827/02-genesis-explore-state.md D10: /spec:genesis-explore is deleted — the explore
// funnel is now a driver state this session already ran, not a separate command HANDOFF hands
// off into. specs/20260827/03-genesis-design-state.md D5: the design lock folds into the driver
// too (the DESIGN state) — there is no separate command left to hand off into for ANY archetype
// or designCatalog. specs/20260827/04-genesis-conventions-handoff.md D4/D5: HANDOFF itself stops
// being terminal and stops printing a next command at all — it is a judgment step that closes
// with `--mark profile-written`, and only the new terminal state GROUNDED prints `next:
// /spec:enforce` (nextCommandLine() is retired along with it — greenfield genesis is now
// init + enforce, with nothing left for /spec:init to hand off into).

// D2/D3/D4 share this count: the enforceable, checker-backed DECIDED rows conventions.json
// carries — read fresh off disk, never cached in status.json.
function enforceableProbeCount() {
  const conv = readConventions()
  const rows = (conv && Array.isArray(conv.rows)) ? conv.rows : []
  return rows.filter((r) => r && r.status === 'DECIDED' && r.enforceable === true).length
}

const STEPS = {
  DISCOVERY: () => {
    const exists = fs.existsSync(briefPath())
    const lines = ['## Step: run (or continue) the discovery interview']
    if (!exists) {
      lines.push('Read only: ' + TEMPLATE_BRIEF_PATH)
      lines.push('Doctrine: spec/doctrine/genesis.md § Genesis: Discovery Interview')
      lines.push(genesisRel('brief.md') + ' does not exist yet — start from the template above.')
    } else {
      lines.push('Read only: ' + genesisRel('brief.md') + ' (## Coverage, ## Picks)')
      lines.push('Doctrine: spec/doctrine/genesis.md § Genesis: Discovery Interview')
      const check = discoveryCheck()
      if (check.reason === 'unparseable') lines.push('unparseable coverage line(s): ' + check.detail.join('; '))
      if (check.reason === 'missing') lines.push('missing coverage key(s): ' + check.detail.join(', '))
      if (check.reason === 'dark') lines.push('dark coverage key(s) — ask, in the user\'s words: ' + check.detail.join(', '))
      // specs/20260902/08-genesis-shrink-brief-state.md D2: the archetype gate moved here from
      // menus-done — this step must tell the session the exact `## Picks` line it still owes.
      if (check.ok && !picks().archetype) {
        lines.push('missing ## Picks line: - archetype: <key> (one of: ' + REGISTRY_KEYS.join(', ') + ')')
      }
    }
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark discovery-done')
    return lines.join('\n')
  },

  MENUS: () => {
    const openKeys = openDimensionKeys()
    const pks = picks()
    const noMenu = []
    const noPick = []
    for (const k of openKeys) {
      if (!hasMenuFile(k)) noMenu.push(k)
      else if (!(k in pks)) noPick.push(k)
    }
    const readFiles = [genesisRel('brief.md') + ' (## Open Dimensions, ## Picks)']
      .concat(openKeys.filter(hasMenuFile).map((k) => genesisRel('interview-research/' + k + '.json')))
    const lines = ['## Step: research and pick the open dimensions', 'Read only: ' + readFiles.join(', '),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Discovery Interview']
    if (noMenu.length) lines.push('open, no menu yet: ' + noMenu.join(', '))
    if (noPick.length) lines.push('open, menu written, no pick: ' + noPick.join(', '))
    for (const k of openKeys) {
      const rec = status.menus[k]
      if (!rec) continue
      if (rec.registryExit === 1) {
        const labels = droppedLabelsFor(k)
        lines.push(labels
          ? k + ': dropped for currency — ' + labels.join(', ') + ' (see the menu file\'s droppedForCurrency)'
          : k + ': some option(s) dropped for currency — see the menu file\'s droppedForCurrency')
      }
      if (rec.registryExit === 3) lines.push('⚠️ unverified: ' + k + ' (registry unreachable — options kept, currency unconfirmed)')
    }
    // specs/20260902/11-brief-from-approved-set.md D3: for a fresh visual run
    // (status.brief.mocks set — never a legacy or non-visual run, Behavior: Applicability) with
    // `framework` still open, print the seed's primary-surface/platforms-horizon rows above the
    // framework dimension and the literal pricing instruction — the framework pick must be priced
    // against a second platform the seed already knows is coming, not decided blind to it.
    if (status.brief && status.brief.mocks && openKeys.includes('framework')) {
      const facts = seedFacts()
      const psRow = facts['primary-surface'] ? productRowById(facts['primary-surface']) : null
      const phRow = facts['platforms-horizon'] ? productRowById(facts['platforms-horizon']) : null
      if (psRow) lines.push('seed: primary-surface (' + psRow.id + ') — ' + psRow.claim)
      if (phRow) lines.push('seed: platforms-horizon (' + phRow.id + ') — ' + phRow.claim)
      if (psRow || phRow) {
        lines.push('price every framework option against these two rows (research contextPaths include design/mocks/seed.md)')
      }
    }
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark menu-written --file <menu.json>' +
      '\n  node ' + __filename + ' --root ' + root + ' --mark menus-done')
    return lines.join('\n')
  },

  // specs/20260902/08-genesis-shrink-brief-state.md D2/D3/D4/D6: sits between DISCOVERY and
  // MENUS. A legacy resume (status.marks.menusDone already true, briefWritten not yet) opens with
  // `legacy:` and names `--legacy`; DESIGN_SKIPPED_ARCHETYPES owe nothing beyond DISCOVERY; a
  // visual archetype whose mocks set is not yet APPROVED is sent to `/spec:mocks`; otherwise the
  // step renders D4's ratification instructions (Contracts' "BRIEF step text" example).
  BRIEF: () => {
    const archetype = status.archetype
    const doctrineLine = 'Doctrine: spec/doctrine/genesis.md § Genesis: Brief State'
    const legacyResume = !!(status.marks && status.marks.menusDone && !status.marks.briefWritten)

    if (legacyResume) {
      return [
        '## Step: brief — ratify the approved set into the design canon',
        'Read only: docs/design/doctrine.md, .claude/genesis/design-rules.json' +
          (isVisualArchetype(archetype) ? ', design/tokens.css' : ''),
        doctrineLine,
        'legacy: explore/design artifacts accepted in place of a mocks set (explore: ' +
          (status.explore || 'n/a') + ', design: ' + (status.design || 'pending') + ')',
        'Write docs/design/doctrine.md (one page, ## Dissents) and .claude/genesis/design-rules.json, then:',
        '  node ' + __filename + ' --root ' + root + ' --mark brief-written --legacy',
      ].join('\n')
    }

    if (isDesignSkipped(archetype)) {
      return [
        '## Step: brief — nothing owed beyond discovery',
        'Read only: ' + genesisRel('brief.md') + ' (## Picks)',
        doctrineLine,
        'archetype "' + archetype + '" owes nothing beyond DISCOVERY — no mocks set, no doctrine, no design canon.',
        'Then:\n  node ' + __filename + ' --root ' + root + ' --mark brief-written',
      ].join('\n')
    }

    const visual = isVisualArchetype(archetype)
    const mocksStatus = readMocksStatus()
    if (visual && !(mocksStatus && mocksStatus.state === 'APPROVED')) {
      return [
        '## Step: brief — approve the mocks set first',
        'Read only: design/mocks/seed.md, design/mocks/ledger.md, design/mocks/status.json',
        doctrineLine,
        mocksStatus ? ('mocks: ' + mocksStatus.state + ' — not yet approved') : 'no design/mocks/status.json yet',
        'next: run /spec:mocks in this repo (seed → shapes → wireframes → theme → skin → review → ' +
          'approved), then --mark brief-written',
      ].join('\n')
    }

    const directions = visual ? Object.keys((mocksStatus && mocksStatus.directions) || {}) : []
    const theme = visual ? (mocksStatus && mocksStatus.theme) : null
    const journeys = (visual && mocksStatus && mocksStatus.journeys) ? Object.keys(mocksStatus.journeys).length : 0
    const readFiles = visual
      ? ['design/mocks/seed.md', 'design/mocks/ledger.md', 'design/mocks/status.json', 'design/tokens.css', genesisRel('brief.md')]
      : [genesisRel('brief.md')]
    const dissentsClause = visual
      ? (directions.filter((d) => d !== theme).join(', ') || 'none')
      : 'none — no directions composed'
    const lines = [
      '## Step: brief — ratify the approved set into the design canon',
      'Read only: ' + readFiles.join(', '),
      doctrineLine,
    ]
    if (visual) {
      lines.push('mocks: APPROVED · journeys: ' + journeys + ' · directions composed: ' +
        (directions.join(', ') || 'none') + ' (picked: ' + (theme || 'none') + ') · open product rows: 0')
      // D2: the derivation sources for `## What I think you're building` and the two new
      // sections — every confirmed product ledger row by id, and the seed's own journey count —
      // read from the seed and the ledger, never from the discovery interview alone.
      const productRows = confirmedProductRows()
      const seedCount = seedJourneysMap().size
      let notesUnresolved = 0
      try {
        notesUnresolved = mocksNotesLib.readNotes(root).filter((n) => n && n.status !== 'resolved').length
      } catch (e) { notesUnresolved = 0 }
      lines.push('derived from: product ledger row(s) ' +
        (productRows.length ? productRows.map((r) => r.id).join(', ') : 'none') +
        ' · seed journeys: ' + seedCount + ' · notes unresolved: ' + notesUnresolved +
        ' — write ## What I think you\'re building, ## Journeys, and ## Non-UI Coverage from these, never from the interview alone')
    }
    lines.push('Write docs/design/doctrine.md (one page, ## Dissents naming: ' + dissentsClause +
      ') and .claude/genesis/design-rules.json, then:')
    lines.push('  node ' + __filename + ' --root ' + root + ' --mark brief-written')
    return lines.join('\n')
  },

  DECIDE: () => {
    const check = decideCheck()
    const lines = [
      '## Step: record the stack descriptor and decision records',
      'Read only: ' + genesisRel('brief.md') + ' (## Open Dimensions), ' + descriptorRelPath(),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Decision Record (one proposer)',
    ]
    if (!check.ok) lines.push(describeDecideGap(check) + '.')
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark decided')
    return lines.join('\n')
  },

  // specs/20260827/01-genesis-tournament.md D4: the go/no-go line — the archetype's probe tasks
  // (D6), the retry cap, the cost estimate, and the last-measured tokens/finalist figure (or "no
  // figure yet" when tournament/benchmark.json does not exist yet).
  FINALISTS: () => {
    const archetype = status.archetype
    const tasks = expectedTasksFor(archetype)
    return [
      '## Step: name the finalists to race (or skip the race)',
      'Read only: ' + genesisRel('brief.md') + ' (## Open Dimensions, ## Picks), ' + genesisRel('interview-research/*.json'),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Tournament of Scaffolds',
      'probe tasks (' + archetype + '): ' + tasks.join(', ') + ' · retry cap: 2 per task',
      'cost: roughly one mini-build per finalist (scaffold + gate + boot + probe slice)',
      lastMeasuredLine(),
      'Then:\n  node ' + __filename + ' --root ' + root + ' --mark finalists-written --file <finalists.json>' +
        '\n  node ' + __filename + ' --root ' + root + ' --mark finalists-skipped',
    ].join('\n')
  },

  // RACE is driver-only (D5): a bare invocation runs it and lands directly on PROBE, so this
  // entry is only ever rendered by acceptedOutput() right after finalists-written accepts —
  // never by deriveState() itself (which resolves RACE before returning, exactly like the
  // existing SCAFFOLD entry below resolves SCAFFOLD before returning).
  RACE: () => [
    '## Step: race the finalists',
    'Read only: ' + genesisRel('tournament/'),
    'Doctrine: spec/doctrine/genesis.md § Genesis: Tournament of Scaffolds',
    'The driver races every finalist (scaffold, then gate + boot on a green scaffold) on the next invocation — no session action needed.',
    'Then:\n  node ' + __filename + ' --root ' + root,
  ].join('\n'),

  // D6: race results per finalist (a failed scaffold prints "failed at scaffold — spent no
  // further" and owes no probe.json), the archetype's expected task set, the retry cap, each
  // raced finalist's evidence dir, and the probe.json shape.
  PROBE: () => {
    const archetype = status.archetype
    const expected = expectedTasksFor(archetype)
    const t = status.tournament || {}
    const race = t.race || {}
    const names = t.finalists || []
    const lines = [
      '## Step: build one probe slice per finalist',
      'Read only: ' + genesisRel('tournament/'),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Tournament of Scaffolds',
    ]
    for (const name of names) {
      const r = race[name]
      if (!r) continue
      lines.push(r.scaffold.exit !== 0
        ? name + ': failed at scaffold — spent no further'
        : name + ': scaffold ok, gate ' + r.gate.exit + ', boot ' + r.boot.exit +
          (r.boot.sentinel ? ' (' + r.boot.sentinel + ')' : ''))
    }
    lines.push('expected tasks: ' + expected.join(', '))
    lines.push('retry cap: 2 per task')
    for (const name of names) {
      const r = race[name]
      if (r && r.scaffold.exit === 0) lines.push('evidence dir: ' + genesisRel('tournament/evidence/' + name + '/'))
    }
    lines.push('probe.json shape: {"tasks": [{"task", "passed", "retries", "tokens", "screenshot"}]}')
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark probe-done')
    return lines.join('\n')
  },

  // D8: benchmark.md printed verbatim (never paraphrased — reading it verbatim is the whole
  // point of not making the session open a second file mid-decision) plus the evidence-informs
  // line, so a session cannot read this step and think a benchmark number decides anything.
  PICK: () => {
    const benchmarkMd = fs.existsSync(benchmarkMdPath()) ? fs.readFileSync(benchmarkMdPath(), 'utf8').trimEnd() : '(no benchmark.md yet)'
    return [
      '## Step: pick the winner',
      'Read only: ' + genesisRel('tournament/benchmark.md') + ', ' + genesisRel('brief.md') + ' (## Picks)',
      'Doctrine: spec/doctrine/genesis.md § Genesis: Tournament of Scaffolds',
      benchmarkMd,
      'executed evidence informs the pick; it never makes it — two finalists that both pass are ranked by the coverage answers, stated',
      'Then:\n  node ' + __filename + ' --root ' + root + ' --mark picked',
    ].join('\n')
  },

  SCAFFOLD: () => {
    const desc = readStackDescriptor() || {}
    return [
      '## Step: scaffold the project',
      'Read only: ' + descriptorRelPath(),
      'The driver runs scaffoldCommand ("' + (desc.scaffoldCommand || '') + '") inside ' + root +
        ' on the next invocation — no session action needed.',
      'Then:\n  node ' + __filename + ' --root ' + root,
    ].join('\n')
  },

  SKELETON: () => [
    '## Step: land the day-zero skeleton',
    'Read only: ' + descriptorRelPath() + ', ' + genesisRel('scaffold.log'),
    'Doctrine: spec/doctrine/genesis.md § Genesis: Day-Zero Skeleton',
    'See spec/doctrine/genesis.md § Genesis: Day-Zero Skeleton for what to land (tests, CI, runtime substrate).',
    'Then:\n  node ' + __filename + ' --root ' + root + ' --mark skeleton-landed',
  ].join('\n'),

  SCAFFOLD_RED: () => [
    '## SCAFFOLD_RED — the scaffold command failed',
    'Read only: ' + genesisRel('scaffold.log'),
    logTail(scaffoldLogPath()),
    'Remedy: fix the command in stack-descriptor.json, delete the scaffold key, re-run:',
    '  node ' + __filename + ' --root ' + root,
  ].join('\n'),

  GATE_RED: () => [
    '## GATE_RED — the zero-day gate failed',
    'Read only: ' + genesisRel('gate.log'),
    logTail(gateLogPath()),
    'Remedy: fix scaffold-level issues only, then re-run — the gate re-executes, the scaffold does not:',
    '  node ' + __filename + ' --root ' + root,
  ].join('\n'),

  ROADMAP: () => [
    '## Step: decompose the roadmap',
    'Read only: ' + descriptorRelPath() + ', docs/roadmap/',
    'Doctrine: spec/doctrine/genesis.md § Genesis: Roadmap Decomposition',
    'Write docs/roadmap/00-overview.md plus one or more docs/roadmap/NN-*.md briefs, each with ' +
      'Phase: and Depends on: header lines before its first ## heading, acyclic. See ' +
      'spec/doctrine/genesis.md § Genesis: Roadmap Decomposition.',
    'Then:\n  node ' + __filename + ' --root ' + root + ' --mark roadmap-written',
  ].join('\n'),

  // specs/20260902/08-genesis-shrink-brief-state.md D9: the DESIGN state (its own
  // doctrine-drafted -> tokens-landed -> rules-locked progression) is retired — the design canon
  // is ratified at BRIEF, long before ROADMAP.

  // specs/20260827/04-genesis-conventions-handoff.md D4: HANDOFF becomes a judgment step — the
  // session authors .claude/genesis/init-profile.json (init.md Phase 4's shape) and closes with
  // `--mark profile-written`, which the driver runs init-gen.js generate for itself. D8's
  // regression pin still requires archetype/resolved gate/ADR count/brief count to print here —
  // this step keeps ALL of them, on top of the new profile-authoring instructions.
  HANDOFF: () => {
    const desc = readStackDescriptor() || {}
    const adrCount = Array.isArray(desc.decisionRecords) ? desc.decisionRecords.length : 0
    const readFiles = [
      'spec/commands/init.md (Phase 4 — the profile schema)',
      descriptorRelPath(),
      genesisRel('conventions.json'),
    ]
    if (fs.existsSync(designRulesPath())) readFiles.push(genesisRel('design-rules.json'))
    readFiles.push('docs/adr/')
    return [
      '## Step: handoff — author the init profile; the driver grounds the repo',
      'Read only: ' + readFiles.join(', '),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Enforcement Handoff to the spec pipeline',
      'archetype: ' + (status.archetype || desc.archetype || 'unknown'),
      'resolved gate: ' + (status.gateCommand || desc.gateCommand || 'unknown'),
      'ADR count: ' + adrCount,
      'brief count: ' + briefFileNames().length,
      'Write ' + genesisRel('init-profile.json') + ' (init.md Phase 4\'s shape; ' +
        'config.genesisStackDescriptor and design.rulesManifest set from the genesis artifacts; ' +
        'manifestExtras claiming the skeleton\'s substrate and the probe suite), then:',
      '  node ' + __filename + ' --root ' + root + ' --mark profile-written --file ' + genesisRel('init-profile.json'),
    ].join('\n')
  },

  // D4: the terminal state — printed once profile-written records a successful init-gen
  // generate run. archetype/resolved gate/ADR count/brief count carry over from HANDOFF's own
  // report inputs; convention probes is new (D4's report-inputs list).
  GROUNDED: () => {
    const desc = readStackDescriptor() || {}
    const adrCount = Array.isArray(desc.decisionRecords) ? desc.decisionRecords.length : 0
    return [
      '## Step: grounded — genesis is complete',
      'Read only: ' + CONFIG_RELPATH + ', docs/roadmap/00-overview.md',
      'archetype: ' + (status.archetype || desc.archetype || 'unknown') +
        ' · resolved gate: ' + (status.gateCommand || desc.gateCommand || 'unknown') +
        ' · ADR count: ' + adrCount +
        ' · convention probes: ' + enforceableProbeCount() +
        ' · brief count: ' + briefFileNames().length,
      'next: /spec:enforce',
    ].join('\n')
  },
}

const TERMINAL_STATES = new Set(['GROUNDED'])

function renderFull(state) {
  const header = '[genesis-driver] state: ' + state + '  root: ' + root
  const note = TERMINAL_STATES.has(state)
    ? ''
    : '\n(re-run this driver after completing the step; it verifies artifacts and prints the next one)'
  return header + note + '\n\n' + STEPS[state]()
}

function acceptedOutput(prevNext) {
  return renderFull(prevNext.next) + '\n\n✅ checkpoint — genesis state saved (' + prevNext.prev +
    ' → ' + prevNext.next + '); safe to /clear and re-run /spec:genesis'
}

// specs/20260902/08-genesis-shrink-brief-state.md D1: the eight EXPLORE/DESIGN marks are
// retired outright — the design stage is /spec:mocks now, ratified at BRIEF's own single mark.
// D14: this refusal table is the sanctioned live surface for `positions-authored` and
// `tiles-culled` — AC-20260902-08-12's sweep waives this file by path for those two names.
const RETIRED_MARKS = [
  'research-done', 'positions-authored', 'tiles-built', 'tiles-culled', 'external',
  'doctrine-drafted', 'tokens-landed', 'rules-locked',
]

function handleMark() {
  let result
  switch (MARK) {
    case 'discovery-done': result = handleDiscoveryDone(); break
    case 'brief-written': result = handleBriefWritten(); break
    case 'menu-written': result = handleMenuWritten(); break
    case 'menus-done': result = handleMenusDone(); break
    case 'finalists-written': result = handleFinalistsWritten(); break
    case 'finalists-skipped': result = handleFinalistsSkipped(); break
    case 'probe-done': result = handleProbeDone(); break
    case 'picked': result = handlePicked(); break
    case 'decided': result = handleDecided(); break
    case 'skeleton-landed': result = handleSkeletonLanded(); break
    case 'roadmap-written': result = handleRoadmapWritten(); break
    case 'profile-written': result = handleProfileWritten(); break
    default:
      if (RETIRED_MARKS.includes(MARK)) {
        die('mark "' + MARK + '" was retired with the genesis design states (specs/20260902/08) — ' +
          'the design stage is /spec:mocks; run it, then --mark brief-written')
      }
      die('unknown mark "' + MARK + '" (discovery-done | brief-written [--legacy] | menu-written --file <f> | ' +
        'menus-done | finalists-written --file <f> | finalists-skipped | probe-done | picked | ' +
        'decided | skeleton-landed | roadmap-written | profile-written --file <f> [--refresh])')
      return
  }
  writeOut(1, acceptedOutput(result))
  process.exit(0)
}

// ---- run -------------------------------------------------------------------------------------
if (MARK) {
  handleMark()
} else if (STATE_ONLY) {
  // Read-only peek (F3, D1/Behavior): never runs scaffoldCommand/gateCommand, never writes
  // status.json beyond loadStatus()'s own cold-root creation.
  writeOut(1, deriveState({ peek: true }))
  process.exit(0)
} else {
  const state = deriveState()
  writeOut(1, renderFull(state))
  process.exit(0)
}
