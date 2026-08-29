#!/usr/bin/env node
// genesis-driver.js [--root <dir>] [--mark <mark> [--file <path>]] [--state]
//
// WHY: specs/20260825/04-genesis-driver.md — genesis's architect stage used to be three phases
// of hand-performed choreography inside /spec:genesis-architect: run the coverage-audit gate,
// invoke registry-check.js per research menu, close the decision record, run the scaffold
// command, run the zero-day gate, close the roadmap — each a deterministic check a session could
// (and, measured, did) skip or fabricate while reporting success. Procedural hallucination is
// the largest agent-failure class (38.5%, agenticrail.nz 2026-08-08). On the spec-review-driver.js
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
// hits the identical wall (incident 2026-08-26, found at review of
// specs/20260825/04-genesis-driver.md). Streamed output can never overflow a buffer that no
// longer exists in the parent; runChild's fail-closed guard for a genuine signal death or spawn
// failure is unchanged.
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
// specs/20260827/01-genesis-tournament.md (2026-08-27): between MENUS and DECIDE, five archetypes
// (web-app, realtime-trading, backend-api, mobile-app, desktop-app) gain a tournament —
// FINALISTS -> RACE (driver-only) -> PROBE -> PICK. The driver races 2-3 session-composed
// finalist stacks for real (scaffold, zero-day gate, boot through smoke.sh's own contract) into
// `.claude/genesis/tournament/finalists/<name>/`, hands the session one probe slice per finalist
// to build under a two-retry cap, re-runs gate+boot once the slice lands, and assembles a
// benchmark table + screenshot gallery. Executed evidence INFORMS the pick; `--mark picked`
// records whichever finalist the brief's own `## Picks` already names — the driver never ranks
// or chooses. The winner is re-scaffolded clean into the project root on `decided` (JJ ruling
// 2026-08-27): the probe slice was built under retry caps with no spec and no review, and must
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
// specs/20260827/02-genesis-explore-state.md (2026-08-27): between MENUS and the tournament's
// FINALISTS, four VISUAL archetypes (web-app, mobile-app, realtime-trading, desktop-app) gain an
// EXPLORE state — Round 0 of the taste funnel that used to be its own command
// (/spec:genesis-explore, now deleted). Marks progress research-done -> positions-authored ->
// tiles-built -> tiles-culled, or `external --file <dir>` for a design the session already has.
// The two culled looks (or the one external candidate) become the tournament's `style-tile`
// task's tile sources, rendered inside each finalist with its real component library — replacing
// spec 01 D6's `.claude/genesis/sketch.html`, which is never a tile source again. Every other
// archetype gets `explore: "skipped"` recorded the moment menus-done resolves it, and is never
// routed through EXPLORE at all.
//
// What EXPLORE deliberately does NOT do:
//   - render a tile, screenshot it, or judge a position's quality — `design-atlas.js check` is
//     the only deterministic gate; the render -> screenshot -> critique loop, and the cull to
//     two, are the session's.
//   - extract literals out of an external candidate — no `dc-extract` (deleted 20260824/05); the
//     bundle's own literals are what the later design state authors tokens from.
//   - trust a builder-edited tokens.css: `tiles-built` diffs the CURRENT file against the
//     `.claude/genesis/explore/authored/<kebab>.css` snapshot `positions-authored` wrote, via
//     `startsWith` (additions-only, no git in play — Assumption A2).
//
// specs/20260827/03-genesis-design-state.md (2026-08-29): between ROADMAP and HANDOFF, every
// archetype except backend-api/data-ml gains a DESIGN state — the design lock that used to be its
// own retired command. Marks progress doctrine-drafted (one-page
// `docs/design/doctrine.md`, `## Dissents` naming every rejected direction from
// `.claude/genesis/design-pick.json`) -> [tokens-landed, visual archetypes only:
// `design/tokens.css` ratified verbatim from the winner's, an approved matrix-clean mock in
// `design/mocks/`, `design/components.json` seeded] -> rules-locked
// (`.claude/genesis/design-rules.json`'s category/grounding enums valid, `components-check.js`
// green on `design/components.json` for visual archetypes). `backend-api`/`data-ml` are recorded
// `design: "skipped"` by `handleRoadmapWritten` the moment `roadmap-written` is accepted and never
// enter DESIGN; non-visual archetypes (`conversational-bot`, `cli-devtool`) enter DESIGN but skip
// the tokens mark entirely (refused: "no tokens step"). HANDOFF's `next:` is always `/spec:init`
// now — there is no separate command left to hand off into for any archetype or designCatalog.
//
// What DESIGN deliberately does NOT do:
//   - author the doctrine, ratify the tokens, promote the signature screen, or write the
//     design-rules manifest itself — those stay session judgment; the driver only closes each
//     mark once the artifact exists and validates.
//   - judge a design decision's taste — its checks are closure checks (a line count, a non-empty
//     section, a byte-for-byte prefix, a closed enum, a green child process), never opinions on
//     which direction won.
//
// Fixing that overflow only at the child's own capture wasn't enough: `logTail`, which builds the
// SCAFFOLD_RED/GATE_RED excerpt embedded in the driver's OWN stdout, used to bound its excerpt by
// line count alone (`text.split('\n').slice(-n)`). A caller's buffer is measured in BYTES, not
// lines — a single unbroken multi-megabyte line (realistic `\r`-driven install/progress output,
// exactly the class the streaming fix above targets) makes "the last 20 lines" the WHOLE file, and
// a caller capturing the driver's own stdout through a pipe (e.g. a test's default 1 MiB
// maxBuffer) hits the identical ENOBUFS one layer up. `logTail` now reads only the last
// LOGTAIL_MAX_BYTES of the file via `fs.openSync`/`fs.readSync`, never the whole thing, and marks
// the excerpt as truncated when it is (incident 2026-08-26, found in the fix-delta pass of the
// review of specs/20260825/04-genesis-driver.md — bounding a printed excerpt by line count alone
// is not a bound, because a caller's buffer is measured in bytes).
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

// Node's stdout write to a pipe is ASYNCHRONOUS; process.exit() tears the process down before a
// large console.log() payload finishes flushing, silently truncating at the 64 KiB pipe buffer
// while the exit code still reads 0 (recorded incident, specs/20260823/08 repair round —
// spec-status.js's --json truncated its ~75 KB dashboard at exactly 65536 bytes). Every site here
// that prints a payload and then exits routes through this synchronous, EAGAIN-retrying writer.
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

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  die('--root ' + root + ' is not a directory — pass a real project root, or omit --root to use the current directory')
}

const genesisDir = path.join(root, '.claude/genesis')
const statusPath = path.join(genesisDir, 'status.json')

function genesisRel(name) { return '.claude/genesis/' + name }

// ---------------------------------------------------------------------------
// status.json (v2, D10) — created fresh on a cold root; an existing v1 file is read as-is
// (missing keys default in memory) and rewritten as v2 only on the next accepted mark.
// ---------------------------------------------------------------------------
function freshStatus() {
  return {
    schemaVersion: 2,
    architect: 'pending', explore: 'pending', design: 'pending',
    archetype: null, localeScope: null,
    stackDescriptorPath: '.claude/genesis/stack-descriptor.json',
    designManifestPath: '.claude/genesis/design-rules.json',
    gateCommand: null, lastUpdated: null,
    marks: {}, menus: {}, scaffold: null, zeroDayGate: null,
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
  status.schemaVersion = 2
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

function parseCoverage(text) {
  const sec = section(text, 'Coverage')
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
  status.marks.discoveryDone = true
  saveStatus()
  return { prev: 'DISCOVERY', next: 'MENUS' }
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
  const check = menusCheck()
  if (!check.ok) {
    die('open dimension(s) missing a menu file or a ## Picks line: ' + check.missing.join(', ') +
      ' — finish the interview, then re-mark menus-done')
  }
  const archetype = picks().archetype
  if (!archetype) {
    die('brief.md ## Picks is missing a `- archetype: <key>` line — add one of: ' +
      REGISTRY_KEYS.join(', ') + ', then re-mark menus-done')
  }
  if (!REGISTRY_KEYS.includes(archetype)) {
    die('brief.md ## Picks names an unknown archetype "' + archetype + '" — pick one of: ' +
      REGISTRY_KEYS.join(', ') + ', then re-mark menus-done')
  }
  status.marks.menusDone = true
  status.archetype = archetype
  // D1: every non-visual archetype's explore stays "skipped" — recorded here, on the FIRST
  // derivation past MENUS, so a session (or the hook, per A3) has a durable record that this
  // project was never offered the taste funnel.
  if (!isVisualArchetype(archetype)) status.explore = 'skipped'
  saveStatus()
  let next
  if (isVisualArchetype(archetype)) next = 'EXPLORE'
  else if (isTournamentArchetype(archetype)) next = 'FINALISTS'
  else next = 'DECIDE'
  return { prev: 'MENUS', next }
}

// D1/D6: EXPLORE resolves to tiles-culled (the funnel) or external (a supplied design); once
// picked, both read as resolved too (PICK has already recorded the winning tile source).
function exploreResolved() {
  return status.explore === 'tiles-culled' || status.explore === 'external' ||
    status.explore === 'picked' || status.explore === 'skipped'
}

function tileSourcesFor() {
  const rec = status.exploreRecord
  return (rec && Array.isArray(rec.finalists)) ? rec.finalists : []
}

// ---------------------------------------------------------------------------
// EXPLORE (specs/20260827/02-genesis-explore-state.md D1-D6): the taste funnel's Round 0, folded
// into the driver as mark-driven internal progression (research-done -> positions-authored ->
// tiles-built -> tiles-culled), or `external --file <dir>` for a design the session already has.
// Entered only for VISUAL_ARCHETYPES; every other archetype never reaches this block at all
// (handleMenusDone already wrote explore: "skipped" and routed past it).
// ---------------------------------------------------------------------------
const EXPLORE_FUNNEL_MARKS = ['research-done', 'positions-authored', 'tiles-built', 'tiles-culled']

function targetsPath() { return path.join(root, 'design/targets.json') }
function researchBriefPath() { return path.join(root, 'docs/design/research-brief.md') }
function positionsPath() { return path.join(root, 'design/explore/positions.md') }
function positionDir(kebab) { return path.join(root, 'design/explore/r0-' + kebab) }
function exploreAuthoredDir() { return path.join(genesisDir, 'explore/authored') }
function exploreGalleryPath() { return path.join(root, 'design/explore/gallery.html') }

// D2: design/targets.json parses with non-empty themes/viewports arrays, each viewport a
// {name, width, height} object. Shared by research-done and external (D6 owes it too).
function checkExploreTargets() {
  const p = targetsPath()
  if (!fs.existsSync(p)) return { ok: false, msg: 'design/targets.json does not exist' }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    return { ok: false, msg: 'design/targets.json is not valid JSON (' + e.message + ')' }
  }
  if (!Array.isArray(parsed.themes) || parsed.themes.length === 0) {
    return { ok: false, msg: 'design/targets.json has an empty or missing "themes" array' }
  }
  if (!Array.isArray(parsed.viewports) || parsed.viewports.length === 0) {
    return { ok: false, msg: 'design/targets.json has an empty or missing "viewports" array' }
  }
  for (const v of parsed.viewports) {
    if (!v || typeof v.name !== 'string' || typeof v.width !== 'number' || typeof v.height !== 'number') {
      return { ok: false, msg: 'design/targets.json has a viewport missing name/width/height' }
    }
  }
  return { ok: true }
}

// D6: the external path is only refused once a FUNNEL mark has actually recorded progress —
// "the funnel has started". A prior "skipped"/"pending" explore value never blocks it.
function funnelStarted() { return EXPLORE_FUNNEL_MARKS.includes(status.explore) }

function handleResearchDone() {
  if (status.explore === 'external') die('explore is external — no funnel — the external candidate skips research-done entirely')
  const t = checkExploreTargets()
  if (!t.ok) die(t.msg + ' — write it, then re-mark research-done')
  const briefP = researchBriefPath()
  if (!fs.existsSync(briefP)) {
    die('docs/design/research-brief.md does not exist — write it (ux-research-brief.md template) with at least one ## heading, then re-mark research-done')
  }
  const text = fs.readFileSync(briefP, 'utf8')
  if (!text.trim()) die('docs/design/research-brief.md is empty — write it, then re-mark research-done')
  if (!/^##\s/m.test(text)) die('docs/design/research-brief.md has no "## " heading — add one, then re-mark research-done')
  status.explore = 'research-done'
  saveStatus()
  return { prev: 'EXPLORE', next: 'EXPLORE' }
}

// positions.md's `## Position: <kebab>` blocks (D3). Reused by positions-authored, tiles-built,
// and tiles-culled — always re-read from disk, never cached in status.json.
const POSITION_LABELS = [
  'Stance', 'Rules cited', 'Anti-defaults', 'Reference direction',
  'Motion character', 'Density & layout intent', 'Starter tokens',
]

function readPositionsMd() {
  try { return fs.readFileSync(positionsPath(), 'utf8') } catch (e) { return null }
}

function parsePositions(text) {
  const starts = []
  const re = /^## Position: ([a-z0-9-]+)\s*$/gm
  let m
  while ((m = re.exec(text))) starts.push({ kebab: m[1], index: m.index, headerEnd: m.index + m[0].length })
  return starts.map((s, i) => ({
    kebab: s.kebab,
    body: text.slice(s.headerEnd, i + 1 < starts.length ? starts[i + 1].index : text.length),
  }))
}

function handlePositionsAuthored() {
  if (status.explore === 'external') die('explore is external — no funnel — the external candidate skips positions-authored entirely')
  if (status.explore !== 'research-done') die('research-done has not been marked yet — mark research-done first')
  const text = readPositionsMd()
  if (text === null) die('design/explore/positions.md does not exist — author 6-8 ## Position: <kebab> blocks, then re-mark positions-authored')
  const blocks = parsePositions(text)
  if (blocks.length < 6 || blocks.length > 8) {
    die('design/explore/positions.md has ' + blocks.length + ' position block(s) — the floor is 6 (6-8 complete positions are required), then re-mark positions-authored')
  }
  for (const b of blocks) {
    for (const label of POSITION_LABELS) {
      if (!b.body.includes('**' + label + ':**')) {
        die('position "' + b.kebab + '" is missing the "**' + label + ':**" label — add it, then re-mark positions-authored')
      }
    }
  }
  for (const b of blocks) {
    const tokensPath = path.join(positionDir(b.kebab), 'tokens.css')
    if (!fs.existsSync(tokensPath) || !fs.readFileSync(tokensPath, 'utf8').trim()) {
      die(tokensPath + ' does not exist or is empty — write it, then re-mark positions-authored')
    }
  }
  fs.mkdirSync(exploreAuthoredDir(), { recursive: true })
  for (const b of blocks) {
    fs.copyFileSync(path.join(positionDir(b.kebab), 'tokens.css'), path.join(exploreAuthoredDir(), b.kebab + '.css'))
  }
  status.explore = 'positions-authored'
  saveStatus()
  return { prev: 'EXPLORE', next: 'EXPLORE' }
}

// D4: each tile passes design-atlas.js check, each current tokens.css still startsWith its
// authored baseline (A2 — additions-only, no git), then the gallery is built. Refused as a whole
// on the first failure — no partial gallery.
function handleTilesBuilt() {
  if (status.explore === 'external') die('explore is external — no funnel — the external candidate skips tiles-built entirely')
  if (status.explore !== 'positions-authored') die('positions-authored has not been marked yet — mark positions-authored first')
  const text = readPositionsMd()
  const blocks = parsePositions(text || '')
  const designAtlasBin = path.join(__dirname, 'design-atlas.js')
  for (const b of blocks) {
    const dir = positionDir(b.kebab)
    const tokensPath = path.join(dir, 'tokens.css')
    const authoredPath = path.join(exploreAuthoredDir(), b.kebab + '.css')
    let current
    try {
      current = fs.readFileSync(tokensPath, 'utf8')
    } catch (e) {
      die(tokensPath + ' does not exist — write it, then re-mark tiles-built')
      return null // unreachable
    }
    const authored = (() => { try { return fs.readFileSync(authoredPath, 'utf8') } catch (e) { return '' } })()
    if (!current.startsWith(authored)) {
      die(tokensPath + ' no longer starts with its authored baseline at ' + authoredPath +
        ' — builders append, never alter; restore the authored lines and only add after them, then re-mark tiles-built')
    }
    if (!fs.existsSync(path.join(dir, 'tile.html'))) {
      die(path.join(dir, 'tile.html') + ' does not exist — build the tile, then re-mark tiles-built')
    }
    const r = runChild(process.execPath, [designAtlasBin, 'check', dir], { encoding: 'utf8' }, 'design-atlas.js check (' + dir + ')')
    if (r.status !== 0) {
      die('design-atlas.js check failed for ' + dir + ': ' + (r.stdout || r.stderr || '').trim())
    }
  }
  const g = runChild(process.execPath,
    [designAtlasBin, 'gallery', path.join(root, 'design/explore'), '--out', exploreGalleryPath()],
    { encoding: 'utf8' }, 'design-atlas.js gallery (design/explore)')
  if (g.status !== 0) die('design-atlas.js gallery failed: ' + (g.stdout || g.stderr || '').trim())
  status.explore = 'tiles-built'
  saveStatus()
  return { prev: 'EXPLORE', next: 'EXPLORE' }
}

// D5: positions.md's `## Cull record` names every position EXCEPT exactly two survivors, which
// are recorded (in position order) as exploreRecord.finalists — PROBE's tile source list (D7).
function handleTilesCulled() {
  if (status.explore === 'external') die('explore is external — no funnel — the external candidate skips tiles-culled entirely')
  if (status.explore !== 'tiles-built') die('tiles-built has not been marked yet — mark tiles-built first')
  const text = readPositionsMd() || ''
  const blocks = parsePositions(text)
  const cullSection = section(text, 'Cull record')
  const culled = new Set()
  if (cullSection) {
    const re = /^-\s+\*\*([a-z0-9-]+)\*\*\s+—\s+culled:/gm
    let m
    while ((m = re.exec(cullSection))) culled.add(m[1])
  }
  for (const k of culled) {
    if (!fs.existsSync(positionDir(k))) {
      die('## Cull record names "' + k + '" but ' + positionDir(k) + ' does not exist — fix the cull record, then re-mark tiles-culled')
    }
  }
  const survivors = blocks.filter((b) => !culled.has(b.kebab)).map((b) => b.kebab)
  if (survivors.length !== 2) {
    die('## Cull record leaves ' + survivors.length + ' survivor(s) (' + (survivors.join(', ') || 'none') +
      ') — exactly 2 are required, then re-mark tiles-culled')
  }
  status.exploreRecord = Object.assign({}, status.exploreRecord, { finalists: survivors, culledAt: new Date().toISOString() })
  status.explore = 'tiles-culled'
  saveStatus()
  return { prev: 'EXPLORE', next: 'FINALISTS' }
}

// D6: a supplied design skips the funnel entirely — location plus a root data-screen-label per
// file is admission; targets.json is still owed (the matrix is a declaration, not research), but
// docs/design/research-brief.md is never owed. Markable at any point before a funnel mark starts;
// refused afterwards.
function handleExternal() {
  if (funnelStarted()) die('the funnel has started — finish it or delete design/explore/ and re-mark')
  if (!FILE) die('--mark external needs --file <dir> (relative to the project root, or an absolute path)')
  const resolved = path.isAbsolute(FILE) ? FILE : path.join(root, FILE)
  const externalRoot = path.join(root, 'design/explore/external') + path.sep
  if (!(resolved + path.sep).startsWith(externalRoot) || resolved + path.sep === externalRoot) {
    die('--file ' + FILE + ' must be a directory under design/explore/external/ — fix the path and re-mark external')
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    die('--file ' + FILE + ' does not exist at ' + resolved + ' — create the dir with your design bundle, then re-mark external')
  }
  const htmlFiles = fs.readdirSync(resolved).filter((f) => f.endsWith('.html')).map((f) => path.join(resolved, f))
  if (!htmlFiles.length) die(resolved + ' holds no .html file — add at least one labelled screen, then re-mark external')
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8')
    if (!/data-screen-label\s*=\s*"[^"]*"/.test(html)) {
      die(f + ' has no data-screen-label attribute — every screen must carry one, then re-mark external')
    }
  }
  const t = checkExploreTargets()
  if (!t.ok) die(t.msg + ' — write it, then re-mark external')
  const name = path.basename(resolved)
  status.exploreRecord = Object.assign({}, status.exploreRecord, { finalists: ['external/' + name], authoredAt: new Date().toISOString() })
  status.explore = 'external'
  saveStatus()
  return { prev: 'EXPLORE', next: 'FINALISTS' }
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
const PROBE_TASKS = {
  'web-app': ['authed-crud-screen', 'background-job', 'style-tile'],
  'realtime-trading': ['authed-crud-screen', 'background-job', 'style-tile'],
  'backend-api': ['authed-crud-resource', 'background-job'],
  'mobile-app': ['authed-list-detail-screen', 'async-task', 'style-tile'],
  'desktop-app': ['authed-list-detail-screen', 'async-task', 'style-tile'],
}

function tournamentDir() { return path.join(genesisDir, 'tournament') }
function finalistsRootDir() { return path.join(tournamentDir(), 'finalists') }
function finalistDir(name) { return path.join(finalistsRootDir(), name) }
function tournamentLogsDir() { return path.join(tournamentDir(), 'logs') }
function tournamentEvidenceDir(name) { return path.join(tournamentDir(), 'evidence', name) }
function benchmarkJsonPath() { return path.join(tournamentDir(), 'benchmark.json') }
function benchmarkMdPath() { return path.join(tournamentDir(), 'benchmark.md') }
function galleryPath() { return path.join(tournamentDir(), 'gallery.html') }

// specs/20260827/02-genesis-explore-state.md D7: tile source derivation replaces spec 01 D6's
// sketch source — `.claude/genesis/sketch.html` is never a tile source again. style-tile's tiles
// are `exploreRecord.finalists` (tileSourcesFor()); when that list is empty (explore: "skipped",
// or a visual archetype that hasn't resolved EXPLORE yet), style-tile is dropped from the
// expected task set entirely — never listed, never required by probe-done.
function expectedTasksFor(archetype) {
  const all = PROBE_TASKS[archetype] || []
  return tileSourcesFor().length ? all.slice() : all.filter((t) => t !== 'style-tile')
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

// specs/20260827/02-genesis-explore-state.md D1: a visual archetype must resolve EXPLORE before
// it can ever reach FINALISTS — deriveState() already gates the bare-invocation path, but these
// two marks are invoked directly and must refuse the same way if called early.
function requireExploreResolvedForFinalists() {
  if (isVisualArchetype(status.archetype) && !exploreResolved()) {
    die('the explore taste funnel has not resolved yet (research-done → positions-authored → ' +
      'tiles-built → tiles-culled, or external) — finish EXPLORE first')
  }
}

function handleFinalistsSkipped() {
  if (!status.marks.menusDone) die('menus-done has not been marked yet — mark menus-done first')
  if (!isTournamentArchetype(status.archetype)) {
    die('archetype "' + status.archetype + '" is not a tournament archetype (' +
      TOURNAMENT_ARCHETYPES.join(', ') + ') — finalists-skipped only applies once a tournament archetype has reached FINALISTS')
  }
  requireExploreResolvedForFinalists()
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
  requireExploreResolvedForFinalists()
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

    // specs/20260827/02-genesis-explore-state.md D7: style-tile is no longer a single task — it
    // is ONE entry per tile source (exploreRecord.finalists), keyed `tile: "<kebab>"` or
    // `"external/<name>"`. Every other task keeps the old single-entry-per-task contract.
    const tileSources = tileSourcesFor()
    const seenTasks = new Set()
    const seenTiles = new Set()
    for (const t of tasks) {
      if (!t || typeof t.task !== 'string' || !expected.includes(t.task)) {
        die('finalist "' + name + '"\'s probe.json names an unexpected task "' + (t && t.task) +
          '" — the expected task set for ' + archetype + ' is: ' + expected.join(', '))
      }
      if (t.task === 'style-tile') {
        if (typeof t.tile !== 'string' || !tileSources.includes(t.tile)) {
          die('finalist "' + name + '"\'s probe.json has a style-tile entry with an unexpected "tile" (' +
            (t && t.tile) + ') — expected one of: ' + tileSources.join(', '))
        }
        if (seenTiles.has(t.tile)) die('finalist "' + name + '"\'s probe.json has a duplicate style-tile entry for tile "' + t.tile + '"')
        seenTiles.add(t.tile)
      } else {
        if (seenTasks.has(t.task)) die('finalist "' + name + '"\'s probe.json has a duplicate task "' + t.task + '"')
        seenTasks.add(t.task)
      }
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
    const missingTasks = expected.filter((e) => e !== 'style-tile' && !seenTasks.has(e))
    const missingTiles = expected.includes('style-tile') ? tileSources.filter((s) => !seenTiles.has(s)) : []
    const missing = missingTasks.concat(missingTiles)
    if (missing.length) {
      die('finalist "' + name + '"\'s probe.json is missing task(s)/tile(s): ' + missing.join(', ') +
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

// specs/20260827/02-genesis-explore-state.md D7: style-tile can carry several entries per
// finalist (one per tile source), so the gallery row key is task+tile, never task alone — task
// alone would collapse every style-tile entry but the first onto one row.
function taskRowKey(t) { return t.task + (t.tile ? ':' + t.tile : '') }

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
// specs/20260827/02-genesis-explore-state.md D8: when explore has left tile sources
// (exploreRecord.finalists non-empty), picked ALSO requires .claude/genesis/design-pick.json —
// its "winner" must equal one tile source path and every other tile must appear in rejected[]
// with a non-empty reason. Stack and design are picked together: success writes
// explore: "picked" alongside tournament.winner.
function tileSourcePath(s) { return s.startsWith('external/') ? 'design/explore/' + s : 'design/explore/r0-' + s }

function handlePicked() {
  if (!(status.tournament && status.tournament.finalists)) die('the tournament has not reached PICK yet')
  const finalistDefs = status.tournament.finalistDefs || []
  const matches = finalistDefs.filter(finalistMatchesCurrentPicks)
  if (matches.length !== 1) {
    die('## Picks matches ' + matches.length + ' finalist(s) — exactly 1 match is required to record a winner; rewrite ## Picks to the winner\'s labels, then re-mark picked')
  }

  const tileSources = tileSourcesFor()
  if (tileSources.length) {
    const pickPath = path.join(genesisDir, 'design-pick.json')
    if (!fs.existsSync(pickPath)) {
      die('.claude/genesis/design-pick.json does not exist — record the design pick (winner + rejected[] with reasons), then re-mark picked')
    }
    let pick
    try {
      pick = JSON.parse(fs.readFileSync(pickPath, 'utf8'))
    } catch (e) {
      die('.claude/genesis/design-pick.json is not valid JSON (' + e.message + ') — fix it and re-mark picked')
      return null // unreachable
    }
    const expectedPaths = tileSources.map(tileSourcePath)
    if (typeof pick.winner !== 'string' || !expectedPaths.includes(pick.winner)) {
      die('design-pick.json "winner" (' + pick.winner + ') is not one of the tile sources (' +
        expectedPaths.join(', ') + ') — fix winner, then re-mark picked')
    }
    const rejected = Array.isArray(pick.rejected) ? pick.rejected : []
    const rejectedWithReason = new Set(rejected
      .filter((r) => r && typeof r.reason === 'string' && r.reason.trim())
      .map((r) => r.candidate))
    const missingRejected = expectedPaths.filter((p) => p !== pick.winner && !rejectedWithReason.has(p))
    if (missingRejected.length) {
      die('design-pick.json "rejected[]" is missing a non-empty reason for: ' + missingRejected.join(', ') +
        ' — fix it, then re-mark picked')
    }
  }

  status.tournament = Object.assign({}, status.tournament, { winner: matches[0].name, at: new Date().toISOString() })
  if (tileSources.length) status.explore = 'picked'
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

function handleSkeletonLanded() {
  if (!status.marks.decided) die('decided has not been recorded yet — mark decided first')
  if (!(status.scaffold && status.scaffold.exit === 0)) {
    die('the scaffold has not completed successfully yet — resolve SCAFFOLD/SCAFFOLD_RED before marking skeleton-landed')
  }
  if (status.architect === 'scaffold-complete') {
    die('the zero-day gate has already passed — nothing to re-run; continue with the ROADMAP step')
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
  // marker and then slicing the last N lines (the original shape of this fix) makes the marker
  // itself a slice candidate — on any byte window holding more than N lines (the ordinary
  // large multi-line failing-gate log, not just the single-giant-line case), the marker sits far
  // enough back in the window that the line slice discards it, and the reader sees a plain,
  // confident-looking excerpt with no sign it's partial (defect found in review of this same
  // fix, 2026-08-26). A line dropped by the slice is exactly as much "there is more, on disk" as
  // a byte dropped by the read window, so either condition attaches the marker to the final text.
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
  status.marks.roadmapWritten = true
  // specs/20260827/03-genesis-design-state.md D1: this IS "the first derivation past ROADMAP" —
  // backend-api/data-ml are recorded design: "skipped" right here and never routed through
  // DESIGN; every other archetype is handed the new DESIGN state next instead of HANDOFF.
  const designSkip = isDesignSkipped(status.archetype)
  if (designSkip) status.design = 'skipped'
  saveStatus()
  return { prev: 'ROADMAP', next: designSkip ? 'HANDOFF' : 'DESIGN' }
}

// ---------------------------------------------------------------------------
// DESIGN (specs/20260827/03-genesis-design-state.md D1-D4): the design lock's own mark-driven
// progression, folded from the retired design-lock command — doctrine-drafted (one-page
// doctrine, Dissents naming every rejected direction) -> [tokens-landed, visual only: the
// winner's tokens.css ratified verbatim, an approved matrix-clean mock, design/components.json
// seeded] -> rules-locked (design-rules.json category/grounding enums valid, components-check.js
// green on design/components.json for visual archetypes, then the prune of the losing
// candidates/gallery/sketch/authored-snapshot). Entered only for archetypes NOT in
// DESIGN_SKIPPED_ARCHETYPES — handleRoadmapWritten already wrote design: "skipped" and routed
// past it for backend-api/data-ml.
// ---------------------------------------------------------------------------
const DOCTRINE_LINE_CAP = 120
const DESIGN_RULE_CATEGORIES = ['color', 'typography', 'i18n', 'structure', 'a11y', 'density', 'layout']

function doctrinePath() { return path.join(root, 'docs/design/doctrine.md') }
function designPickPath() { return path.join(genesisDir, 'design-pick.json') }
function readDesignPick() {
  try { return JSON.parse(fs.readFileSync(designPickPath(), 'utf8')) } catch (e) { return null }
}
function mocksDir() { return path.join(root, 'design/mocks') }
function tokensCssPath() { return path.join(root, 'design/tokens.css') }
function componentsJsonPath() { return path.join(root, 'design/components.json') }
function designRulesPath() { return path.join(genesisDir, 'design-rules.json') }

// D2: design-pick.json's rejected[].candidate paths are `design/explore/r0-<kebab>` (or an
// external dir) — Dissents is authored against the bare kebab throughout the funnel (Cull
// record, positions.md), never against the `r0-` directory prefix, so the prefix is stripped
// before matching against the doctrine's Dissents body.
function candidateKebab(candidate) {
  const base = path.basename(String(candidate || ''))
  return base.startsWith('r0-') ? base.slice(3) : base
}

function hasApprovedMock() {
  const dir = mocksDir()
  if (!fs.existsSync(dir)) return false
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'))
  return files.some((f) => {
    try { return /data-status\s*=\s*"approved"/.test(fs.readFileSync(path.join(dir, f), 'utf8')) } catch (e) { return false }
  })
}

// D2: `docs/design/doctrine.md` exists, ≤ DOCTRINE_LINE_CAP lines, with a non-empty ## Dissents
// naming every rejected candidate the current design-pick.json (if any) records.
function handleDoctrineDrafted() {
  if (!status.marks.roadmapWritten) die('roadmap-written has not been marked yet — mark roadmap-written first')
  if (isDesignSkipped(status.archetype)) {
    die('archetype "' + status.archetype + '" never enters the design state — doctrine-drafted does not apply')
  }
  const p = doctrinePath()
  if (!fs.existsSync(p)) {
    die('docs/design/doctrine.md does not exist — draft the one-page doctrine with a ## Dissents ' +
      'section naming every rejected direction, then re-mark doctrine-drafted')
  }
  const text = fs.readFileSync(p, 'utf8')
  const lineCount = text.split('\n').length
  if (lineCount > DOCTRINE_LINE_CAP) {
    die('docs/design/doctrine.md is ' + lineCount + ' lines — the one-page cap is ' + DOCTRINE_LINE_CAP +
      ' lines — trim it, then re-mark doctrine-drafted')
  }
  if (!dissentsNonEmpty(text)) {
    die('docs/design/doctrine.md ## Dissents has no non-blank line — record every rejected ' +
      'direction there, then re-mark doctrine-drafted')
  }
  const pick = readDesignPick()
  if (pick && Array.isArray(pick.rejected)) {
    const body = dissentsBody(text) || ''
    for (const r of pick.rejected) {
      const kebab = candidateKebab(r && r.candidate)
      if (kebab && !body.includes(kebab)) {
        die('docs/design/doctrine.md ## Dissents does not name rejected candidate "' + kebab +
          '" — add it, then re-mark doctrine-drafted')
      }
    }
  }
  status.design = 'doctrine-drafted'
  saveStatus()
  return { prev: 'DESIGN', next: 'DESIGN' }
}

// D3 (visual only — refused for non-visual, "no tokens step"): design/tokens.css ratified
// verbatim from the winner's tokens.css (no prefix rule for an external winner), an approved
// mock in design/mocks/ passing design-atlas.js check --matrix, and design/components.json
// present.
function handleTokensLanded() {
  if (!isVisualArchetype(status.archetype)) {
    die('no tokens step for ' + status.archetype + ' — non-visual archetypes skip tokens-landed ' +
      'entirely and mark rules-locked directly')
  }
  if (status.design !== 'doctrine-drafted') die('doctrine-drafted has not been marked yet — mark doctrine-drafted first')

  const tokensPath = tokensCssPath()
  if (!fs.existsSync(tokensPath)) {
    die('design/tokens.css does not exist — ratify the winner\'s tokens.css verbatim, then re-mark tokens-landed')
  }
  const pick = readDesignPick()
  const winner = pick && typeof pick.winner === 'string' ? pick.winner : null
  if (winner && winner.startsWith('design/explore/r0-')) {
    const winnerPath = path.join(root, winner, 'tokens.css')
    let winnerTokens
    try {
      winnerTokens = fs.readFileSync(winnerPath, 'utf8')
    } catch (e) {
      die(winnerPath + ' does not exist — the winning candidate\'s tokens.css is missing; restore it, then re-mark tokens-landed')
      return null // unreachable
    }
    const current = fs.readFileSync(tokensPath, 'utf8')
    if (!current.startsWith(winnerTokens)) {
      die('design/tokens.css does not start with the winner\'s tokens.css (' + winnerPath +
        ') verbatim — ratify the winner\'s file byte-for-byte, then re-mark tokens-landed')
    }
  }

  if (!hasApprovedMock()) {
    die('design/mocks/ holds no .html with data-status="approved" — promote and approve the ' +
      'winner\'s signature screen, then re-mark tokens-landed')
  }

  const designAtlasBin = path.join(__dirname, 'design-atlas.js')
  const r = runChild(process.execPath, [designAtlasBin, 'check', '--matrix', mocksDir()],
    { encoding: 'utf8' }, 'design-atlas.js check --matrix (design/mocks)')
  if (r.status !== 0) {
    die('design-atlas.js check --matrix failed for design/mocks: ' + (r.stdout || r.stderr || '').trim())
  }

  if (!fs.existsSync(componentsJsonPath())) {
    die('design/components.json does not exist — seed the component vocabulary, then re-mark tokens-landed')
  }

  status.design = 'tokens-landed'
  saveStatus()
  return { prev: 'DESIGN', next: 'DESIGN' }
}

// D4: after the prerequisite mark (tokens-landed for visual, doctrine-drafted for non-visual —
// tokens-landed never applies to it), design-rules.json's rules[] must carry only the seven
// closed targetCategory values and grounding ∈ grounded|taste (an empty rules array is valid for
// a non-visual archetype); visual archetypes additionally run components-check.js on
// design/components.json. Success prunes the losing explore candidates — never on a refusal.
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

// D4: delete every losing design/explore/r0-*  and design/explore/external/* dir except the
// winner's, plus the explore gallery, a legacy sketch.html, and the authored-tokens snapshot —
// positions.md and the winner's own dir are never touched.
function pruneDesignExplore() {
  const pick = readDesignPick()
  const winner = pick && typeof pick.winner === 'string' ? pick.winner : null
  const exploreDir = path.join(root, 'design/explore')
  if (fs.existsSync(exploreDir)) {
    for (const e of fs.readdirSync(exploreDir)) {
      if (e.startsWith('r0-') && 'design/explore/' + e !== winner) {
        fs.rmSync(path.join(exploreDir, e), { recursive: true, force: true })
      }
    }
    const externalDir = path.join(exploreDir, 'external')
    if (fs.existsSync(externalDir)) {
      for (const e of fs.readdirSync(externalDir)) {
        if ('design/explore/external/' + e !== winner) {
          fs.rmSync(path.join(externalDir, e), { recursive: true, force: true })
        }
      }
    }
  }
  fs.rmSync(exploreGalleryPath(), { force: true })
  fs.rmSync(path.join(genesisDir, 'sketch.html'), { force: true })
  fs.rmSync(exploreAuthoredDir(), { recursive: true, force: true })
}

function handleRulesLocked() {
  if (isDesignSkipped(status.archetype)) {
    die('archetype "' + status.archetype + '" never enters the design state — rules-locked does not apply')
  }
  if (isVisualArchetype(status.archetype)) {
    if (status.design !== 'tokens-landed') die('tokens-landed has not been marked yet — mark tokens-landed first')
  } else if (status.design !== 'doctrine-drafted') {
    die('doctrine-drafted has not been marked yet — mark doctrine-drafted first')
  }

  const check = designRulesCheck()
  if (!check.ok) {
    if (check.reason === 'unreadable') {
      die('.claude/genesis/design-rules.json does not exist or is not valid JSON (' + check.detail +
        ') — write it, then re-mark rules-locked')
    }
    if (check.reason === 'no-rules-array') {
      die('.claude/genesis/design-rules.json has no "rules" array — write it (an empty array is ' +
        'valid for a non-visual archetype), then re-mark rules-locked')
    }
    if (check.reason === 'bad-id') {
      die('.claude/genesis/design-rules.json has a rule with a missing or empty "id" — fix it, then re-mark rules-locked')
    }
    if (check.reason === 'bad-category') {
      die('.claude/genesis/design-rules.json rule "' + check.rule.id + '" has targetCategory "' +
        check.rule.targetCategory + '" — must be one of: ' + DESIGN_RULE_CATEGORIES.join(', ') +
        ' — fix it, then re-mark rules-locked')
    }
    if (check.reason === 'bad-grounding') {
      die('.claude/genesis/design-rules.json rule "' + check.rule.id + '" has grounding "' +
        check.rule.grounding + '" — must be "grounded" or "taste" — fix it, then re-mark rules-locked')
    }
    if (check.reason === 'bad-severity') {
      die('.claude/genesis/design-rules.json rule "' + check.rule.id + '" has a missing or empty ' +
        '"severity" — fix it, then re-mark rules-locked')
    }
    if (check.reason === 'bad-appliesto') {
      die('.claude/genesis/design-rules.json rule "' + check.rule.id + '" has no "appliesTo" array — fix it, then re-mark rules-locked')
    }
  }

  if (isVisualArchetype(status.archetype)) {
    const componentsCheckBin = path.join(__dirname, 'components-check.js')
    const r = runChild(process.execPath, [componentsCheckBin, componentsJsonPath()],
      { encoding: 'utf8' }, 'components-check.js (design/components.json)')
    if (r.status !== 0) {
      die('components-check.js failed for design/components.json: ' + (r.stdout || r.stderr || '').trim())
    }
  }

  status.design = 'rules-locked'
  saveStatus()
  pruneDesignExplore() // D4: only after the components check passes and the rules validate — a refused mark deletes nothing
  return { prev: 'DESIGN', next: 'HANDOFF' }
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

  const disc = discoveryCheck()
  if (!status.marks.discoveryDone || !disc.ok) return 'DISCOVERY'

  const menus = menusCheck()
  if (!status.marks.menusDone || !menus.ok) return 'MENUS'

  // specs/20260827/02-genesis-explore-state.md D1: EXPLORE sits between MENUS and FINALISTS for
  // the four VISUAL archetypes, until the taste funnel (or the external path) resolves it.
  // handleMenusDone already wrote explore: "skipped" for every other archetype, so this never
  // fires for them.
  if (isVisualArchetype(status.archetype) && !exploreResolved()) return 'EXPLORE'

  // specs/20260827/01-genesis-tournament.md D1: FINALISTS -> RACE -> PROBE -> PICK sits between
  // MENUS and DECIDE for a tournament archetype that hasn't been skipped or resolved yet. Once
  // skipped (tournament.skipped) or resolved (tournament.winner), fall straight through to the
  // unchanged decideCheck() derivation below — a non-tournament archetype never enters this block
  // at all (status.archetype stays outside TOURNAMENT_ARCHETYPES).
  if (isTournamentArchetype(status.archetype) &&
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

  const decide = decideCheck()
  if (!status.marks.decided || !decide.ok) return 'DECIDE'

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
  if (!status.marks.roadmapWritten || !rm.ok) return 'ROADMAP'

  // specs/20260827/03-genesis-design-state.md D1: DESIGN sits between ROADMAP and HANDOFF for
  // every archetype except backend-api/data-ml, which handleRoadmapWritten already recorded
  // design: "skipped" for and which never enter DESIGN at all.
  if (isDesignSkipped(status.archetype)) return 'HANDOFF'
  if (status.design !== 'rules-locked') return 'DESIGN'

  return 'HANDOFF'
}

// ---------------------------------------------------------------------------
// Step text per state (D9: every step opens with a Read only: file list).
// ---------------------------------------------------------------------------
// specs/20260827/02-genesis-explore-state.md D10: /spec:genesis-explore is deleted — the explore
// funnel is now a driver state this session already ran, not a separate command HANDOFF hands
// off into. specs/20260827/03-genesis-design-state.md D5: the design lock folds into the driver
// too (the DESIGN state) — there is no separate command left to hand off into for ANY archetype
// or designCatalog; HANDOFF's next command is always /spec:init.
function nextCommandLine() {
  return 'next: /spec:init'
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
      lines.push('Read only: ' + genesisRel('brief.md') + ' (## Coverage)')
      lines.push('Doctrine: spec/doctrine/genesis.md § Genesis: Discovery Interview')
      const check = discoveryCheck()
      if (check.reason === 'unparseable') lines.push('unparseable coverage line(s): ' + check.detail.join('; '))
      if (check.reason === 'missing') lines.push('missing coverage key(s): ' + check.detail.join(', '))
      if (check.reason === 'dark') lines.push('dark coverage key(s) — ask, in the user\'s words: ' + check.detail.join(', '))
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
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark menu-written --file <menu.json>' +
      '\n  node ' + __filename + ' --root ' + root + ' --mark menus-done')
    return lines.join('\n')
  },

  // specs/20260827/02-genesis-explore-state.md D1/D9: the taste funnel's own mark-driven
  // progression, rendered per status.explore substate. `nothing marked yet` matches the Contracts
  // step-text excerpt verbatim (funnel/external inline, no separate Then: block needed there —
  // both marks are already spelled out on their own lines).
  EXPLORE: () => {
    const doctrineLine = 'Doctrine: spec/doctrine/genesis.md § Genesis: Explore State'
    const lines = []
    switch (status.explore) {
      case 'research-done':
        lines.push('## Step: author 6-8 explore positions')
        lines.push('Read only: docs/design/research-brief.md, design/targets.json')
        lines.push(doctrineLine)
        lines.push('write design/explore/positions.md with 6-8 `## Position: <kebab>` blocks (Stance, ' +
          'Rules cited, Anti-defaults, Reference direction, Motion character, Density & layout intent, ' +
          'Starter tokens) and each design/explore/r0-<kebab>/tokens.css')
        lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark positions-authored')
        break
      case 'positions-authored':
        lines.push('## Step: build and check the tiles')
        lines.push('Read only: design/explore/positions.md, .claude/genesis/explore/authored/')
        lines.push(doctrineLine)
        lines.push('build each design/explore/r0-<kebab>/tile.html rendering the position\'s tokens — ' +
          'builders append tokens.css, never alter the authored baseline')
        lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark tiles-built')
        break
      case 'tiles-built':
        lines.push('## Step: open the gallery and cull to two')
        lines.push('Read only: design/explore/gallery.html')
        lines.push(doctrineLine)
        lines.push('open the gallery, then record a `## Cull record` in design/explore/positions.md ' +
          'leaving exactly two survivors')
        lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark tiles-culled')
        break
      default:
        lines.push('## Step: research the constraints floor and declare the matrix')
        lines.push('Read only: ' + genesisRel('brief.md') + ' (## What I think you\'re building, ## Research Angles), ' +
          genesisRel('stack-descriptor.json') + ' (absent — the stack is not decided yet; archetype from status.json)')
        lines.push(doctrineLine)
        lines.push('funnel: write docs/design/research-brief.md (ux-research-brief.md template) and design/targets.json, then --mark research-done')
        lines.push('external: a design you already have → --mark external --file design/explore/external/<name>')
        lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark research-done' +
          '\n  node ' + __filename + ' --root ' + root + ' --mark external --file design/explore/external/<name>')
    }
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

  // D6/D7: race results per finalist (a failed scaffold prints "failed at scaffold — spent no
  // further" and owes no probe.json), the expected task set (tile-source-conditioned, D7), one
  // style-tile source line per tile (a position's tile.html, or an external candidate's dir —
  // never sketch.html, per specs/20260827/02 D7), the retry cap, each raced finalist's evidence
  // dir, and the probe.json shape.
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
    if (expected.includes('style-tile')) {
      for (const src of tileSourcesFor()) {
        const p = src.startsWith('external/') ? 'design/explore/' + src + '/' : 'design/explore/r0-' + src + '/tile.html'
        lines.push('style-tile source (' + src + '): ' + p + ' (render inside the finalist, with its own real component library)')
      }
    }
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

  // specs/20260827/03-genesis-design-state.md D1/D9: the design lock's own mark-driven
  // progression, rendered per status.design substate — same pattern as EXPLORE above. The
  // "nothing marked" case matches the Contracts step-text excerpt for a visual archetype
  // verbatim; a non-visual archetype (no tokens step) gets an adapted Read only: list, since it
  // never runs the taste funnel and so has no design-pick.json/positions.md/research-brief.md to
  // read.
  DESIGN: () => {
    const doctrineLine = 'Doctrine: spec/doctrine/genesis.md § Genesis: Design State'
    const visual = isVisualArchetype(status.archetype)
    const pick = readDesignPick()
    const winnerDir = (pick && typeof pick.winner === 'string') ? pick.winner : '<winner dir>'
    const lines = []
    switch (status.design) {
      case 'doctrine-drafted':
        if (visual) {
          lines.push('## Step: ratify the tokens and promote the signature screen')
          lines.push('Read only: ' + winnerDir + '/tokens.css, design/targets.json, docs/design/doctrine.md')
          lines.push(doctrineLine)
          lines.push('ratify design/tokens.css verbatim from the winner\'s tokens.css, promote the winner\'s ' +
            'signature screen to design/mocks/ (data-status="approved") expanded across design/targets.json\'s ' +
            'declared matrix, and seed design/components.json')
          lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark tokens-landed')
        } else {
          lines.push('## Step: lock the category-only design rules')
          lines.push('Read only: docs/design/doctrine.md')
          lines.push(doctrineLine)
          lines.push('write .claude/genesis/design-rules.json (id/targetCategory/grounding/severity/appliesTo per ' +
            'rule; an empty rules array is valid — this archetype has no tokens step)')
          lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark rules-locked')
        }
        break
      case 'tokens-landed':
        lines.push('## Step: lock the category-only design rules')
        lines.push('Read only: docs/design/doctrine.md, design/components.json')
        lines.push(doctrineLine)
        lines.push('write .claude/genesis/design-rules.json (id/targetCategory/grounding/severity/appliesTo ' +
          'per rule) — components-check.js must pass on design/components.json')
        lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark rules-locked')
        break
      default:
        if (visual) {
          lines.push('## Step: ratify the pick — doctrine first')
          lines.push('Read only: .claude/genesis/design-pick.json, design/explore/positions.md, ' +
            'docs/design/research-brief.md, ' + winnerDir + '/tokens.css')
        } else {
          lines.push('## Step: distill the design doctrine')
          lines.push('Read only: ' + genesisRel('brief.md'))
        }
        lines.push(doctrineLine)
        lines.push('distill docs/design/doctrine.md (one page, ## Dissents naming every rejected direction)' +
          (visual ? '' : ' — no tokens step for this archetype; doctrine-drafted advances straight to rules-locked'))
        lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark doctrine-drafted')
    }
    return lines.join('\n')
  },

  HANDOFF: () => {
    const desc = readStackDescriptor() || {}
    const adrCount = Array.isArray(desc.decisionRecords) ? desc.decisionRecords.length : 0
    return [
      '## Step: handoff — genesis\'s architect stage is complete',
      'Read only: ' + descriptorRelPath() + ', docs/roadmap/00-overview.md',
      'archetype: ' + (status.archetype || desc.archetype || 'unknown'),
      'resolved gate: ' + (status.gateCommand || desc.gateCommand || 'unknown'),
      'ADR count: ' + adrCount,
      'brief count: ' + briefFileNames().length,
      nextCommandLine(),
    ].join('\n')
  },
}

const TERMINAL_STATES = new Set(['HANDOFF'])

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

function handleMark() {
  let result
  switch (MARK) {
    case 'discovery-done': result = handleDiscoveryDone(); break
    case 'menu-written': result = handleMenuWritten(); break
    case 'menus-done': result = handleMenusDone(); break
    case 'research-done': result = handleResearchDone(); break
    case 'positions-authored': result = handlePositionsAuthored(); break
    case 'tiles-built': result = handleTilesBuilt(); break
    case 'tiles-culled': result = handleTilesCulled(); break
    case 'external': result = handleExternal(); break
    case 'finalists-written': result = handleFinalistsWritten(); break
    case 'finalists-skipped': result = handleFinalistsSkipped(); break
    case 'probe-done': result = handleProbeDone(); break
    case 'picked': result = handlePicked(); break
    case 'decided': result = handleDecided(); break
    case 'skeleton-landed': result = handleSkeletonLanded(); break
    case 'roadmap-written': result = handleRoadmapWritten(); break
    case 'doctrine-drafted': result = handleDoctrineDrafted(); break
    case 'tokens-landed': result = handleTokensLanded(); break
    case 'rules-locked': result = handleRulesLocked(); break
    default:
      die('unknown mark "' + MARK + '" (discovery-done | menu-written --file <f> | menus-done | ' +
        'research-done | positions-authored | tiles-built | tiles-culled | external --file <dir> | ' +
        'finalists-written --file <f> | finalists-skipped | probe-done | picked | ' +
        'decided | skeleton-landed | roadmap-written | doctrine-drafted | tokens-landed | rules-locked)')
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
