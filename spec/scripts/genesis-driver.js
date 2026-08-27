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
  saveStatus()
  return { prev: 'MENUS', next: isTournamentArchetype(archetype) ? 'FINALISTS' : 'DECIDE' }
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
function sketchPath() { return path.join(genesisDir, 'sketch.html') }

// D6: the sketch is this spec's only tile source — when it does not exist, style-tile is dropped
// from the expected task set entirely (never listed, never required by probe-done).
function expectedTasksFor(archetype) {
  const all = PROBE_TASKS[archetype] || []
  return fs.existsSync(sketchPath()) ? all.slice() : all.filter((t) => t !== 'style-tile')
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

    const seen = new Set()
    for (const t of tasks) {
      if (!t || typeof t.task !== 'string' || !expected.includes(t.task)) {
        die('finalist "' + name + '"\'s probe.json names an unexpected task "' + (t && t.task) +
          '" — the expected task set for ' + archetype + ' is: ' + expected.join(', '))
      }
      if (seen.has(t.task)) die('finalist "' + name + '"\'s probe.json has a duplicate task "' + t.task + '"')
      seen.add(t.task)
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
    const missing = expected.filter((e) => !seen.has(e))
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

function renderGalleryHtml(rows) {
  const post = (status.tournament && status.tournament.post) || {}
  const taskOrder = []
  const seen = new Set()
  for (const r of rows) {
    const tasks = (post[r.name] && post[r.name].tasks) || []
    for (const t of tasks) {
      if (t.screenshot && !seen.has(t.task)) { seen.add(t.task); taskOrder.push(t.task) }
    }
  }
  const names = rows.map((r) => r.name)
  let html = '<!doctype html>\n<html><head><meta charset="utf-8"><title>Tournament gallery</title></head><body>\n' +
    '<table border="1">\n<tr><th>task</th>' + names.map((n) => '<th>' + n + '</th>').join('') + '</tr>\n'
  for (const task of taskOrder) {
    html += '<tr><td>' + task + '</td>'
    for (const name of names) {
      const tasks = (post[name] && post[name].tasks) || []
      const t = tasks.find((x) => x.task === task)
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

function dissentsNonEmpty(text) {
  const m = /^##\s+Dissents\s*$/m.exec(text)
  if (!m) return false
  const rest = text.slice(m.index + m[0].length)
  const next = rest.search(/^##\s/m)
  const body = next === -1 ? rest : rest.slice(0, next)
  return body.split('\n').some((l) => l.trim().length > 0)
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
  saveStatus()
  return { prev: 'ROADMAP', next: 'HANDOFF' }
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

  return 'HANDOFF'
}

// ---------------------------------------------------------------------------
// Step text per state (D9: every step opens with a Read only: file list).
// ---------------------------------------------------------------------------
function nextCommandLine() {
  const desc = readStackDescriptor() || {}
  const catalog = desc.designCatalog
  if (catalog && catalog !== 'none') {
    return 'next: /spec:genesis-explore <the project idea — see ' + genesisRel('brief.md') + '>'
  }
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
  // further" and owes no probe.json), the expected task set (sketch-conditioned, D6), the
  // style-tile source path when style-tile is expected, the retry cap, each raced finalist's
  // evidence dir, and the probe.json shape.
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
      lines.push('style-tile source: ' + genesisRel('sketch.html') + ' (render inside the finalist, with its own real component library)')
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
    case 'finalists-written': result = handleFinalistsWritten(); break
    case 'finalists-skipped': result = handleFinalistsSkipped(); break
    case 'probe-done': result = handleProbeDone(); break
    case 'picked': result = handlePicked(); break
    case 'decided': result = handleDecided(); break
    case 'skeleton-landed': result = handleSkeletonLanded(); break
    case 'roadmap-written': result = handleRoadmapWritten(); break
    default:
      die('unknown mark "' + MARK + '" (discovery-done | menu-written --file <f> | menus-done | ' +
        'finalists-written --file <f> | finalists-skipped | probe-done | picked | ' +
        'decided | skeleton-landed | roadmap-written)')
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
