#!/usr/bin/env node
// genesis-driver.js [--root <dir>] [--mark <mark> [--file <path>]] [--state]
//
// Owner: specs/20260825/04-genesis-driver.md.
//
// EXECUTES every deterministic check of greenfield genesis itself (the coverage-audit gate,
// registry-check.js per research menu, the decision-record closure, the scaffold command, the
// zero-day gate, the roadmap closure, init-gen) and prints only the ONE step that still needs the
// session's judgment. State is re-derived from `.claude/genesis/status.json` plus the artifacts on
// disk on EVERY invocation — a mark whose artifact vanished is demanded again. Every accepted mark
// prints a checkpoint line, so the session may /clear and re-invoke at any point.
//
// Chain: DISCOVERY -> BRIEF -> MENUS -> [FINALISTS -> RACE -> PROBE -> PICK] -> DECIDE -> SCAFFOLD
// -> SKELETON -> GATE -> [DESIGN_BRIEF -> DESIGN_KIT -> DESIGN_JOURNEYS -> AWAITING_DESIGN_APPROVAL]
// -> ROADMAP -> HANDOFF -> GROUNDED.
//   - BRIEF: a pass-through for DESIGN_SKIPPED_ARCHETYPES; a visual archetype needs an APPROVED
//     design/mocks/status.json and records design: "ratified".
//   - Tournament (TOURNAMENT_ARCHETYPES only): the driver races 2-3 session-composed finalist
//     stacks for real (scaffold, gate, boot through smoke.sh's contract) under
//     `.claude/genesis/tournament/finalists/<name>/`, re-runs gate+boot after each probe slice,
//     and assembles benchmark.json/.md + gallery.html. `--mark picked` records whichever finalist
//     the brief's own `## Picks` names — the driver never ranks. The winner is re-scaffolded clean
//     in --root on `decided`; finalists/ and logs/ are deleted, the benchmark and evidence survive.
//   - `decided` also validates `.claude/genesis/conventions.json`; `skeleton-landed` requires every
//     enforceable convention's probe file and a root CLAUDE.md/AGENTS.md (<= 150 lines) naming the
//     gateCommand and testTree.
//   - Design stage (a visual archetype whose descriptor names Storybook): kit-landed and
//     journeys-drawn are proven by an EXECUTED Storybook static build and lib/storybook-index.js
//     (a build with no iframe.html is a refusal); AWAITING_DESIGN_APPROVAL probes the served
//     index by CONTENT, never a story URL's status, and `--mark design-approved` (on the user's
//     literal `approve`) freezes docs/design/approval.json, which ROADMAP then derives from.
//   - HANDOFF closes with `profile-written --file <f> [--refresh]`, which runs init-gen.js generate
//     (streamed to `.claude/genesis/init-gen.log`); exit 0 reaches the terminal GROUNDED
//     (`next: /spec:enforce`).
//
// Every child process routes through driver-io.js's fail-closed runChild. scaffoldCommand,
// gateCommand and the Storybook build run through runShell, which streams stdout+stderr straight
// to the log file's fd — never a Node pipe, which a real scaffold would overflow (ENOBUFS).
// logTail reads only the last LOGTAIL_MAX_BYTES of a log, so a single huge line can never flood
// this driver's own stdout.
//
// What this deliberately does NOT do:
//   - hold the interview, write the picks, author ADRs/conventions/probes/CLAUDE.md/the profile,
//     land the skeleton, author the kit or journeys, or decompose the roadmap — session judgment;
//     the driver only closes each step once its artifact exists and validates.
//   - assert a design or roadmap judgment as "correct" — its checks are closure checks on
//     artifacts, never opinions on their content; it never executes a story's `play` function.
//   - pick a tournament winner from benchmark numbers, or promote a raced copy into --root.
//   - relocate the session CWD, or touch any file outside `--root`'s `.claude/genesis/`,
//     `docs/roadmap/`, `docs/design/`, and whatever the host's own commands write.
//   - run any command or write status.json (beyond loadStatus()'s cold-root creation) for a
//     `--state` invocation: a read-only peek that may report the transient SCAFFOLD/GATE states.
//
// Exit codes:
//   0  a bare invocation printed the current step (or `--state` printed the state name), or an
//      accepted `--mark` recorded its result and printed the checkpoint line.
//   2  a precondition failure or a refused mark — stderr names the missing/invalid artifact and
//      the remedy command — or a wrapped child process dying with no exit code (runChild's
//      fail-closed refusal: signal-killed, never spawned, or maxBuffer-overflowed).

'use strict'
const fs = require('fs')
const path = require('path')
const { CONFIG_RELPATH, readConfig } = require('./lib/host-config')
// The BRIEF step's seed-journey and open-note counts come from lib/mocks-round.js.
const mocksRoundLib = require('./lib/mocks-round')
const surfacesLib = require('./lib/surfaces')
const driverIo = require('./lib/driver-io')
const storybookIndexLib = require('./lib/storybook-index')
const { compositeNames } = require('./design-contract-check')

// The 64 KiB process.exit stdout truncation this synchronous writer avoids is explained in full
// at spec/scripts/lib/driver-io.js's writeOut. Callers here pass unterminated lines.
function writeOut(fd, str) { driverIo.writeOut(fd, str + '\n') }

function die(msg) { writeOut(2, 'genesis-driver: ' + msg); process.exit(2) }

// driver-io.js's runChild is the ONE place a child's null status (signal, spawn failure) is handled.
const runChild = driverIo.runChild

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
// status.json (v3) — created fresh on a cold root; an older file is read as-is (missing keys
// default in memory, legacy keys kept) and rewritten as v3 on the next accepted mark.
// ---------------------------------------------------------------------------
function freshStatus() {
  return {
    schemaVersion: 3,
    architect: 'pending', design: 'pending',
    archetype: null, localeScope: null, brief: null,
    stackDescriptorPath: '.claude/genesis/stack-descriptor.json',
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

// The `covered|dark|n/a` grammar is shared by ## Coverage and ## Non-UI Coverage — one parser.
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
// Dimension keys in brief.md's ## Open Dimensions are kebab-case (parseOpenDimensions's
// `/^- ([a-z0-9-]+):/`) — package-manager, never the stack-descriptor's camelCase packageManager.
function openDimensionKeys() { const d = openDimensions(); return Object.keys(d).filter((k) => d[k] === 'open') }
function picks() { const t = briefText(); return t === null ? {} : parsePicks(t) }
function hasMenuFile(key) { return fs.existsSync(path.join(genesisDir, 'interview-research', key + '.json')) }

// ---------------------------------------------------------------------------
// The design/mocks/seed.md reader shared by BRIEF's seed-journey count and ROADMAP's
// journey-placement check.
// ---------------------------------------------------------------------------
function seedPath() { return path.join(root, 'design/mocks/seed.md') }
function seedText() { try { return fs.readFileSync(seedPath(), 'utf8') } catch (e) { return null } }

function seedJourneysMap() { return surfacesLib.parseSeedJourneys(seedText()) }

// Every declared label placed in exactly one brief's ```surfaces block (a double placement fails
// too). The label source is docs/design/approval.json's `screens` once it exists, else the seed.
function journeyPlacementCheck() {
  const approval = readDocsDesignApproval()
  const seedLabels = []
  const seen = new Set()
  if (approval && approval.journeys && typeof approval.journeys === 'object') {
    for (const j of Object.values(approval.journeys)) {
      for (const l of (Array.isArray(j.screens) ? j.screens : [])) {
        if (!seen.has(l)) { seen.add(l); seedLabels.push(l) }
      }
    }
  } else {
    const seedJourneys = seedJourneysMap()
    for (const [, j] of seedJourneys) {
      for (const l of j.labels) { if (!seen.has(l)) { seen.add(l); seedLabels.push(l) } }
    }
  }
  const byLabel = surfacesLib.parseSurfacesPlacement(path.join(root, 'docs/roadmap'))
  const unplaced = seedLabels.filter((l) => !byLabel.has(l) || byLabel.get(l).length === 0)
  if (unplaced.length) return { ok: false, reason: 'unplaced', labels: unplaced }
  for (const l of seedLabels) {
    const files = byLabel.get(l)
    if (files.length > 1) return { ok: false, reason: 'double', label: l, files }
  }
  return { ok: true }
}

// On registryExit === 1 the re-print names the dropped labels from the menu file's
// `droppedForCurrency`; any read problem degrades to null (generic wording), never a throw.
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
// DISCOVERY: the coverage-audit gate.
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
  // The archetype gate moves here from
  // menus-done — BRIEF (the very next state) must already know whether a mocks set is owed.
  const archetype = picks().archetype
  if (!archetype) {
    die('brief.md ## Picks is missing a `- archetype: <key>` line — derive it from the idea and print ' +
      '📌 Auto-picked archetype <key> — <reason> (veto anytime), then add one of: ' +
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
// MENUS: registry-check.js per menu, then the picks gate.
// ---------------------------------------------------------------------------
function menusCheck() {
  const open = openDimensionKeys()
  const pks = picks()
  const missing = open.filter((k) => !(k in status.menus) || !(k in pks))
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

// The eight registry archetype keys a `- archetype: <key>` ## Picks line may name.
const REGISTRY_KEYS = [
  'web-app', 'mobile-app', 'conversational-bot', 'backend-api',
  'realtime-trading', 'cli-devtool', 'data-ml', 'desktop-app',
]
const TOURNAMENT_ARCHETYPES = ['web-app', 'realtime-trading', 'backend-api', 'mobile-app', 'desktop-app']
function isTournamentArchetype(a) { return TOURNAMENT_ARCHETYPES.includes(a) }

// The visual archetypes: every tournament archetype except headless backend-api.
const VISUAL_ARCHETYPES = ['web-app', 'realtime-trading', 'mobile-app', 'desktop-app']
function isVisualArchetype(a) { return VISUAL_ARCHETYPES.includes(a) }

// These archetypes carry no design record; every other archetype ratifies at BRIEF behind the mocks precondition.
const DESIGN_SKIPPED_ARCHETYPES = ['backend-api', 'data-ml', 'conversational-bot', 'cli-devtool']
function isDesignSkipped(a) { return DESIGN_SKIPPED_ARCHETYPES.includes(a) }

// ---------------------------------------------------------------------------
// DESIGN_BRIEF: between the green zero-day gate and ROADMAP, for a visual archetype whose stack
// descriptor names Storybook. Applicability is recomputed on every call; only SKIP is persisted.
// ---------------------------------------------------------------------------
function designStageApplies() {
  const desc = readStackDescriptor() || {}
  return isVisualArchetype(status.archetype) && desc.designCatalog === 'storybook'
}

// Called only where the zero-day gate first turns green — never from a `--state` peek. A no-op once
// status.designStage is set.
function recordDesignStageSkipIfNeeded() {
  if (status.designStage) return
  if (designStageApplies()) return
  const reason = isVisualArchetype(status.archetype) ? 'non-storybook' : 'non-visual'
  status.designStage = { skipped: reason, at: new Date().toISOString() }
  saveStatus()
}

function designPathsJsonPath() { return path.join(genesisDir, 'design-paths.json') }
function readDesignPathsJson() {
  try { return JSON.parse(fs.readFileSync(designPathsJsonPath(), 'utf8')) } catch (e) { return null }
}
function designBriefMdPath() { return path.join(root, 'docs/design/brief.md') }
function catalogMdPath() { return path.join(root, 'docs/design/catalog.md') }

// The designed-set record the user's `approve` freezes (docs/design/approval.json), written once by
// design-approved and read by AWAITING_DESIGN_APPROVAL, ROADMAP and roadmap-written.
function docsDesignApprovalPath() { return path.join(root, 'docs/design/approval.json') }
function readDocsDesignApproval() {
  try { return JSON.parse(fs.readFileSync(docsDesignApprovalPath(), 'utf8')) } catch (e) { return null }
}

// design-paths.json's required shape — every top-level path key non-empty, plus
// storybook.port (integer 1024-65535), storybook.buildCommand, storybook.staticDir. Walked in
// the Contracts' own key order so the refusal names the first missing/invalid key.
const DESIGN_PATHS_REQUIRED_KEYS = ['kit', 'tokens', 'rules', 'primitives', 'primitivesAlias', 'journeys']

function designPathsCheck() {
  if (!fs.existsSync(designPathsJsonPath())) return { ok: false, reason: 'missing' }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(designPathsJsonPath(), 'utf8'))
  } catch (e) {
    return { ok: false, reason: 'unparseable', detail: e.message }
  }
  for (const k of DESIGN_PATHS_REQUIRED_KEYS) {
    if (typeof parsed[k] !== 'string' || !parsed[k].trim()) return { ok: false, reason: 'missing-key', key: k }
  }
  if (!parsed.storybook || typeof parsed.storybook !== 'object') return { ok: false, reason: 'missing-key', key: 'storybook' }
  if (typeof parsed.storybook.port !== 'number' || !Number.isInteger(parsed.storybook.port) ||
      parsed.storybook.port < 1024 || parsed.storybook.port > 65535) {
    return { ok: false, reason: 'bad-port', key: 'storybook.port' }
  }
  if (typeof parsed.storybook.buildCommand !== 'string' || !parsed.storybook.buildCommand.trim()) {
    return { ok: false, reason: 'missing-key', key: 'storybook.buildCommand' }
  }
  if (typeof parsed.storybook.staticDir !== 'string' || !parsed.storybook.staticDir.trim()) {
    return { ok: false, reason: 'missing-key', key: 'storybook.staticDir' }
  }
  return { ok: true, parsed }
}

// design-paths.json is re-validated at both kit-landed and journeys-drawn, with the remedy naming
// the right re-mark command.
function requireDesignPaths(markName) {
  const dp = designPathsCheck()
  if (dp.ok) return dp.parsed
  if (dp.reason === 'missing') {
    die(genesisRel('design-paths.json') + ' does not exist — write it (template: spec-paths design-paths-template), then re-mark ' + markName)
  }
  if (dp.reason === 'unparseable') {
    die(genesisRel('design-paths.json') + ' is not valid JSON (' + dp.detail + ') — fix it, then re-mark ' + markName)
  }
  if (dp.reason === 'missing-key') {
    die(genesisRel('design-paths.json') + ' is missing required key "' + dp.key + '" — add it, then re-mark ' + markName)
  }
  if (dp.reason === 'bad-port') {
    die(genesisRel('design-paths.json') + '\'s storybook.port is out of the 1024–65535 range — fix it, then re-mark ' + markName)
  }
  return null // unreachable, die() exits
}

// docs/design/brief.md's own ## Composites table — one composite per row, `{ composite, states }`
// in brief order, states split on `,` and trimmed. Shared by the DESIGN_KIT step text and
// kit-landed's stateStoriesCheck call.
function briefCompositesWithStates() {
  const text = fs.readFileSync(designBriefMdPath(), 'utf8')
  const sec = section(text, 'Composites') || ''
  return findMdTableRows(sec)
    .filter((r) => r[0])
    .map((r) => ({ composite: r[0], states: (r[2] || '').split(',').map((s) => s.trim()).filter(Boolean) }))
}

// Runs catalog-inventory.js only when docs/design/catalog.md is absent and no FAILED run is
// recorded (a failed run never writes the file, so gating on the file alone would re-run it on
// every print). GENESIS_SHADCN_COMMAND is threaded to --shadcn. Records status.designStage.catalog
// {exit, components, unavailable, at} for a run it performs; a pre-existing file with no record
// prints no catalog line. Never blocks the mark.
function ensureCatalogGenerated() {
  const rec = status.designStage && status.designStage.catalog
  if (rec && rec.exit !== 0) return
  if (fs.existsSync(catalogMdPath())) return
  const catalogInventoryBin = path.join(__dirname, 'catalog-inventory.js')
  const args = [catalogInventoryBin, '--root', root, '--out', catalogMdPath(), '--json']
  const shadcnOverride = process.env.GENESIS_SHADCN_COMMAND
  if (shadcnOverride) args.push('--shadcn', shadcnOverride)
  const r = runChild(process.execPath, args, { encoding: 'utf8' }, 'catalog-inventory.js')
  let components = 0
  let unavailable = 0
  if (r.status === 0) {
    let parsed = null
    try { parsed = JSON.parse(r.stdout) } catch (e) { parsed = null }
    if (parsed && parsed.catalog === 'shadcn' && Array.isArray(parsed.components)) {
      components = parsed.components.length
      unavailable = parsed.unavailable || 0
    }
  }
  status.designStage = Object.assign({}, status.designStage, {
    catalog: { exit: r.status, components, unavailable, at: new Date().toISOString() },
  })
  saveStatus()
}

// A small markdown-table reader — a second small copy of design-contract-check.js's findTable(),
// since requiring that CLI script would pull in its argv parsing.
function findMdTableRows(text) {
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) { start = i; break }
  }
  if (start === -1) return []
  let end = start
  while (end < lines.length && /^\s*\|.*\|\s*$/.test(lines[end])) end++
  const tableLines = lines.slice(start, end)
  if (tableLines.length < 2) return []
  const dataLines = tableLines.slice(2)
  return dataLines.map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
}

function extractMdSubHeading(text, name) {
  const re = new RegExp('^### ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')
  const m = re.exec(text)
  if (!m) return null
  const rest = text.slice(m.index + m[0].length)
  const next = rest.search(/^(### |## )/m)
  return next === -1 ? rest : rest.slice(0, next)
}

// docs/design/brief.md's grammar — heading presence/order, one JTBD line per seed journey, no
// entity-shaped heading, a ## Composites table equal to the rules file's Composite column, every
// ### Used name in docs/design/catalog.md. Returns { ok } or { ok: false, message } (first failure).
const DESIGN_BRIEF_REQUIRED_HEADINGS = ['## Users and context', '## Direction', '## Journeys', '## Navigation', '## Catalog', '## Composites', '## Contract']

function designBriefCheck(paths) {
  if (!fs.existsSync(designBriefMdPath())) {
    return { ok: false, message: 'docs/design/brief.md does not exist — write it (template: design-brief.md via spec-paths templates), then re-mark design-brief-written' }
  }
  const text = fs.readFileSync(designBriefMdPath(), 'utf8')

  const positions = DESIGN_BRIEF_REQUIRED_HEADINGS.map((h) => text.indexOf(h))
  for (let i = 0; i < DESIGN_BRIEF_REQUIRED_HEADINGS.length; i++) {
    if (positions[i] === -1) {
      return { ok: false, message: 'docs/design/brief.md is missing heading "' + DESIGN_BRIEF_REQUIRED_HEADINGS[i] + '" — add it in order, then re-mark design-brief-written' }
    }
  }
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] < positions[i - 1]) {
      return {
        ok: false,
        message: 'docs/design/brief.md has "' + DESIGN_BRIEF_REQUIRED_HEADINGS[i] + '" out of order (before "' +
          DESIGN_BRIEF_REQUIRED_HEADINGS[i - 1] + '") — fix the order, then re-mark design-brief-written',
      }
    }
  }
  const entityHeading = /^## (Entities|Records|Data model)/im.exec(text)
  if (entityHeading) {
    return {
      ok: false,
      message: 'docs/design/brief.md has a heading "## ' + entityHeading[1] +
        '" — journeys are locked before any entity, remove it, then re-mark design-brief-written',
    }
  }

  const seedJourneys = seedJourneysMap()
  const journeysSection = section(text, 'Journeys') || ''
  for (const [name] of seedJourneys) {
    const re = new RegExp('^### ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')
    const m = re.exec(journeysSection)
    if (!m) {
      return {
        ok: false,
        message: 'docs/design/brief.md ## Journeys is missing journey "' + name +
          '" — add a "### ' + name + '" block with a "JTBD: When " line, then re-mark design-brief-written',
      }
    }
    const rest = journeysSection.slice(m.index + m[0].length)
    const next = rest.search(/^### /m)
    const block = next === -1 ? rest : rest.slice(0, next)
    if (!/^JTBD: When /m.test(block)) {
      return {
        ok: false,
        message: 'docs/design/brief.md journey "' + name + '" has no line starting "JTBD: When " — add one, then re-mark design-brief-written',
      }
    }
  }

  const rulesRel = paths.rules
  let rulesText = ''
  try { rulesText = fs.readFileSync(path.join(root, rulesRel), 'utf8') } catch (e) { rulesText = '' }
  const intentSection = section(rulesText, 'Intent to pattern')
  const rulesComposites = intentSection === null ? [] : [...new Set(findMdTableRows(intentSection).flatMap((r) => compositeNames(r[2])))]

  const compositesSection = section(text, 'Composites') || ''
  const briefComposites = [...new Set(findMdTableRows(compositesSection).flatMap((r) => compositeNames(r[0])))]

  if (briefComposites.length === 0) {
    return { ok: false, message: 'docs/design/brief.md ## Composites table is empty — add at least one row, then re-mark design-brief-written' }
  }
  for (const c of rulesComposites) {
    if (!briefComposites.includes(c)) {
      return {
        ok: false,
        message: 'docs/design/brief.md ## Composites is missing "' + c +
          '" (present in the rules file\'s Composite column) — add it, then re-mark design-brief-written',
      }
    }
  }
  for (const c of briefComposites) {
    if (!rulesComposites.includes(c)) {
      return {
        ok: false,
        message: 'docs/design/brief.md ## Composites names "' + c +
          '" which is not in the rules file\'s Composite column — fix one side, then re-mark design-brief-written',
      }
    }
  }

  const catalogSection = section(text, 'Catalog') || ''
  const usedSection = extractMdSubHeading(catalogSection, 'Used') || ''
  const usedNames = usedSection.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim())
  let catalogText = ''
  try { catalogText = fs.readFileSync(catalogMdPath(), 'utf8') } catch (e) { catalogText = '' }
  const catalogNames = [...catalogText.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim())
  if (catalogNames.length) {
    for (const u of usedNames) {
      if (!catalogNames.includes(u)) {
        return {
          ok: false,
          message: 'docs/design/brief.md ### Used names "' + u + '" which is not in docs/design/catalog.md — fix it, then re-mark design-brief-written',
        }
      }
    }
  }

  return { ok: true }
}

// Findings that block the mark; kit-missing/tokens-missing/composite-missing are tolerated here.
const DESIGN_CONTRACT_BLOCKING_KINDS = ['table-missing', 'table-empty', 'naming-section-missing']

function handleDesignBriefWritten() {
  if (!designStageApplies()) {
    const desc = readStackDescriptor() || {}
    die('the design stage does not apply to this host (archetype "' + status.archetype +
      '", designCatalog "' + (desc.designCatalog || 'unset') + '") — nothing to mark here')
  }
  const dp = designPathsCheck()
  if (!dp.ok) {
    if (dp.reason === 'missing') {
      die(genesisRel('design-paths.json') + ' does not exist — write it (template: spec-paths design-paths-template), then re-mark design-brief-written')
    }
    if (dp.reason === 'unparseable') {
      die(genesisRel('design-paths.json') + ' is not valid JSON (' + dp.detail + ') — fix it, then re-mark design-brief-written')
    }
    if (dp.reason === 'missing-key') {
      die(genesisRel('design-paths.json') + ' is missing required key "' + dp.key + '" — add it, then re-mark design-brief-written')
    }
    if (dp.reason === 'bad-port') {
      die(genesisRel('design-paths.json') + '\'s storybook.port is out of the 1024–65535 range — fix it, then re-mark design-brief-written')
    }
    return null // unreachable, die() exits
  }
  const paths = dp.parsed

  const briefCheck = designBriefCheck(paths)
  if (!briefCheck.ok) die(briefCheck.message)

  const contractCheckBin = path.join(__dirname, 'design-contract-check.js')
  const r = runChild(process.execPath, [
    contractCheckBin, '--root', root,
    '--rules', paths.rules, '--kit', paths.kit, '--tokens', paths.tokens, '--json',
  ], { encoding: 'utf8' }, 'design-contract-check.js')
  if (![0, 1].includes(r.status)) {
    die('design-contract-check.js exited unexpected code ' + r.status + ': ' + (r.stderr || r.stdout || '').trim())
  }
  let result
  try {
    result = JSON.parse(r.stdout)
  } catch (e) {
    die('design-contract-check.js printed unparseable JSON: ' + (r.stdout || '').trim())
    return null // unreachable
  }
  const blocking = (result.findings || []).filter((f) => DESIGN_CONTRACT_BLOCKING_KINDS.includes(f.kind))
  if (blocking.length) {
    const f = blocking[0]
    die('design contract check found ' + f.kind + (f.layer ? ' (' + f.layer + ')' : '') + ' in ' +
      f.path + ' — ' + f.remedy + ', then re-mark design-brief-written')
  }

  status.marks.designBriefWritten = true
  status.designStage = Object.assign({}, status.designStage, {
    paths: genesisRel('design-paths.json'),
    brief: 'docs/design/brief.md',
    briefAt: new Date().toISOString(),
  })
  saveStatus()
  // design-brief-written now hands off
  // to DESIGN_KIT, never straight to ROADMAP — the kit and the journey stories land first.
  return { prev: 'DESIGN_BRIEF', next: 'DESIGN_KIT' }
}

// ---------------------------------------------------------------------------
// DESIGN_KIT / DESIGN_JOURNEYS: shared plumbing first, then the two mark handlers.
// ---------------------------------------------------------------------------

function storybookBuildLogPath() { return path.join(genesisDir, 'storybook-build.log') }

const STORYBOOK_MAIN_EXTS = ['ts', 'js', 'mts', 'mjs', 'cjs']
function storybookMainExists() {
  return STORYBOOK_MAIN_EXTS.some((ext) => fs.existsSync(path.join(root, '.storybook', 'main.' + ext)))
}

// Runs design-paths.storybook.buildCommand through runShell (streamed to storybook-build.log),
// writes `<staticDir>/.gitignore` (`*`) before every attempt, and returns `{ exit, ms, index }`;
// refusing is refuseOnStorybookBuild's job.
function runStorybookBuild(paths) {
  const staticDir = path.join(root, paths.storybook.staticDir)
  fs.mkdirSync(staticDir, { recursive: true })
  fs.writeFileSync(path.join(staticDir, '.gitignore'), '*\n')
  const logPath = storybookBuildLogPath()
  const start = Date.now()
  const r = runShell(paths.storybook.buildCommand, logPath)
  const ms = Date.now() - start
  const index = storybookIndexLib.readIndex(staticDir)
  return { exit: r.status, ms, index }
}

// Shared refusal: a non-zero exit quotes the log's tail and names "storybook build"; an ok:false
// index names the missing file (`iframe.html` or `index.json`).
function refuseOnStorybookBuild(build, markName) {
  if (build.exit !== 0) {
    die('storybook build exited ' + build.exit + ' — ' + logTail(storybookBuildLogPath()) +
      '\nfix the build, then re-mark ' + markName)
  }
  if (!build.index.ok) {
    if (build.index.reason === 'no-iframe') {
      die('storybook build succeeded but wrote no iframe.html under the static export — a builder ' +
        'that drops the iframe input (e.g. a TanStack Start host) needs it restored in ' +
        '.storybook/main.ts viteFinal, then re-mark ' + markName)
    }
    die('storybook build wrote no readable index.json under the static export — check ' +
      'the build command, then re-mark ' + markName)
  }
}

// The journey-story finder: exactly one file matching `<journeysDir>/<name>.journey.stories.*`.
function findJourneyStoryFile(journeysAbsDir, name) {
  let files = []
  try { files = fs.readdirSync(journeysAbsDir) } catch (e) { files = [] }
  const re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.journey\\.stories\\.[^.]+$')
  const matches = files.filter((f) => re.test(f))
  return matches.length === 1 ? path.join(journeysAbsDir, matches[0]) : null
}

function walkFilesRecursive(dir) {
  let out = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out = out.concat(walkFilesRecursive(p))
    else if (e.isFile()) out.push(p)
  }
  return out
}

// The primitive ban: every `.ts/.tsx/.js/.jsx` file under <journeysDir> (by location, never by
// filename shape) is scanned for an import of `primitivesAlias` (or a path under it) or a relative
// specifier resolving inside `primitives`. Returns the first `{ file, specifier }` hit, or null.
function primitiveBanCheck(journeysAbsDir, primitivesAlias, primitivesAbs) {
  const files = walkFilesRecursive(journeysAbsDir).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f)).sort()
  for (const f of files) {
    let text
    try { text = fs.readFileSync(f, 'utf8') } catch (e) { continue }
    for (const s of storybookIndexLib.importSpecifiers(text)) {
      let hit = s === primitivesAlias || s.startsWith(primitivesAlias + '/')
      if (!hit && s.startsWith('.')) {
        const resolved = path.resolve(path.dirname(f), s)
        const rel = path.relative(primitivesAbs, resolved)
        hit = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
      }
      if (hit) return { file: path.relative(root, f), specifier: s }
    }
  }
  return null
}

// `<journeysDir>/<name>.beats.json` — the driver's own derivation of a journey. Written only at
// DESIGN_JOURNEYS' print (never `--state`); rewritten only when its beatHash no longer matches.
function beatsFilePath(journeysRel, name) { return path.join(root, journeysRel, name + '.beats.json') }

function writeBeatsFilesIfNeeded(journeysRel) {
  if (!journeysRel) return
  fs.mkdirSync(path.join(root, journeysRel), { recursive: true })
  for (const [name, j] of seedJourneysMap()) {
    const hash = surfacesLib.beatHash(j.beats)
    const p = beatsFilePath(journeysRel, name)
    let existingHash = null
    try { existingHash = JSON.parse(fs.readFileSync(p, 'utf8')).beatHash } catch (e) { existingHash = null }
    if (existingHash === hash) continue
    const beats = j.beats.map((b) => ({ n: b.n, sentence: b.beat, screen: b.screen, state: b.state }))
    fs.writeFileSync(p, JSON.stringify({ journey: name, beatHash: hash, beats }, null, 2) + '\n')
  }
}

// A journey story file vanishing after journeys-drawn re-derives DESIGN_JOURNEYS — checked
// against design-paths.json's own journeys dir, never cached.
function anyJourneyStoryVanished() {
  const dp = readDesignPathsJson()
  if (!dp || typeof dp.journeys !== 'string') return true
  const journeysAbsDir = path.join(root, dp.journeys)
  for (const [name] of seedJourneysMap()) {
    if (!findJourneyStoryFile(journeysAbsDir, name)) return true
  }
  return false
}

// `--mark kit-landed` — design-paths.json valid, then design-contract-check.js's full check
// (every composite present, tables filled, tokens file present) exits 0, then .storybook/main.*
// exists, then the Storybook build succeeds, then stateStoriesCheck finds every declared state.
function handleKitLanded() {
  if (!status.marks.designBriefWritten) die('design-brief-written has not been marked yet — mark design-brief-written first')
  if (!designStageApplies()) {
    const desc = readStackDescriptor() || {}
    die('the design stage does not apply to this host (archetype "' + status.archetype +
      '", designCatalog "' + (desc.designCatalog || 'unset') + '") — nothing to mark here')
  }
  const paths = requireDesignPaths('kit-landed')

  const contractCheckBin = path.join(__dirname, 'design-contract-check.js')
  const cr = runChild(process.execPath, [
    contractCheckBin, '--root', root,
    '--rules', paths.rules, '--kit', paths.kit, '--tokens', paths.tokens, '--json',
  ], { encoding: 'utf8' }, 'design-contract-check.js')
  if (![0, 1].includes(cr.status)) {
    die('design-contract-check.js exited unexpected code ' + cr.status + ': ' + (cr.stderr || cr.stdout || '').trim())
  }
  let cresult
  try {
    cresult = JSON.parse(cr.stdout)
  } catch (e) {
    die('design-contract-check.js printed unparseable JSON: ' + (cr.stdout || '').trim())
    return null // unreachable
  }
  if (cresult.findings && cresult.findings.length) {
    const f = cresult.findings[0]
    die('design contract check found ' + f.kind + (f.layer ? ' (' + f.layer + ')' : '') + ' — ' +
      f.remedy + ', then re-mark kit-landed')
  }

  if (!storybookMainExists()) {
    die('.storybook/main.{ts,js,mts,mjs,cjs} does not exist — run the init recipe ' +
      '(storybook@latest init --yes --no-dev …), then re-mark kit-landed')
  }

  const build = runStorybookBuild(paths)
  refuseOnStorybookBuild(build, 'kit-landed')

  const missing = storybookIndexLib.stateStoriesCheck(build.index.entries, briefCompositesWithStates(), paths.kit)
  if (missing) {
    die('composite ' + missing.composite + ': no state story ' + missing.state + ' under ' + paths.kit +
      ' — export a story named ' + missing.state + ' in ' + missing.composite + '.stories.tsx')
  }

  status.marks.kitLanded = true
  status.designStage = Object.assign({}, status.designStage, {
    kit: { build: { exit: build.exit, ms: build.ms, stories: build.index.entries.length }, at: new Date().toISOString() },
  })
  saveStatus()
  return { prev: 'DESIGN_KIT', next: 'DESIGN_JOURNEYS' }
}

// `--mark journeys-drawn` — per seed journey, the beats hash still holds, exactly one story file,
// it imports its own beats.json and calls step(), then the primitive ban over the whole journeys
// directory, then the Storybook build and journeyStoriesCheck.
function handleJourneysDrawn() {
  if (!status.marks.kitLanded) die('kit-landed has not been marked yet — mark kit-landed first')
  if (!designStageApplies()) {
    const desc = readStackDescriptor() || {}
    die('the design stage does not apply to this host (archetype "' + status.archetype +
      '", designCatalog "' + (desc.designCatalog || 'unset') + '") — nothing to mark here')
  }
  const paths = requireDesignPaths('journeys-drawn')
  const journeysAbsDir = path.join(root, paths.journeys)
  const primitivesAbs = path.join(root, paths.primitives)
  const seedJourneys = seedJourneysMap()

  for (const [name, j] of seedJourneys) {
    const expectedHash = surfacesLib.beatHash(j.beats)
    let storedHash = null
    try { storedHash = JSON.parse(fs.readFileSync(beatsFilePath(paths.journeys, name), 'utf8')).beatHash } catch (e) { storedHash = null }
    if (storedHash !== expectedHash) {
      die('beats for ' + name + ' changed since the last print — re-run the driver, then re-draw')
    }

    const storyFile = findJourneyStoryFile(journeysAbsDir, name)
    if (!storyFile) {
      die('journey ' + name + ': no journey story found matching ' + paths.journeys + '/' + name +
        '.journey.stories.* — draw it, then re-mark journeys-drawn')
    }
    const relStoryFile = path.relative(root, storyFile)
    const text = fs.readFileSync(storyFile, 'utf8')
    const specs = storybookIndexLib.importSpecifiers(text)
    const wantExact = './' + name + '.beats.json'
    const wantSuffix = '/' + name + '.beats.json'
    if (!specs.some((s) => s === wantExact || s.endsWith(wantSuffix))) {
      die('journey file ' + relStoryFile + ' does not import ./' + name + '.beats.json — import it ' +
        'and call step() per beat, then re-mark journeys-drawn')
    }
    if (!/\bstep\s*\(/.test(storybookIndexLib.stripComments(text))) {
      die('journey file ' + relStoryFile + ' has no step( call in its play function — add one per ' +
        'beat, then re-mark journeys-drawn')
    }
  }

  const banHit = primitiveBanCheck(journeysAbsDir, paths.primitivesAlias, primitivesAbs)
  if (banHit) {
    die('journey file ' + banHit.file + ' imports a primitive (' + banHit.specifier +
      ') — import composites from ' + paths.kit + ' only')
  }

  const build = runStorybookBuild(paths)
  refuseOnStorybookBuild(build, 'journeys-drawn')
  const jCheck = storybookIndexLib.journeyStoriesCheck(build.index.entries, [...seedJourneys.keys()], paths.journeys)
  if (!jCheck.ok) {
    die('journey ' + jCheck.journey + ': no story tagged journey with a play function in the index')
  }

  status.marks.journeysDrawn = true
  status.designStage = Object.assign({}, status.designStage, {
    journeys: {
      build: { exit: build.exit, ms: build.ms, stories: build.index.entries.length },
      stories: jCheck.stories,
      at: new Date().toISOString(),
    },
  })
  saveStatus()
  // journeys-drawn hands off to the
  // approval stop now, never straight to ROADMAP.
  return { prev: 'DESIGN_JOURNEYS', next: 'AWAITING_DESIGN_APPROVAL' }
}

// ---------------------------------------------------------------------------
// AWAITING_DESIGN_APPROVAL: the look stop. The probe proves by CONTENT — index.json's entries —
// never by a story URL's HTTP status (Storybook answers 200 for a story id that does not exist).
// ---------------------------------------------------------------------------

// `curl -sf -m 3 <url>` through runChild; any ordinary non-zero curl exit reads as 'unreachable'.
// curl reads `file:` URLs too, so test fixtures use the same path.
function probeStorybookIndex(url) {
  const r = runChild('curl', ['-sf', '-m', '3', url], { encoding: 'utf8' }, 'curl ' + url)
  if (r.status !== 0) return { ok: false, reason: 'unreachable' }
  let parsed
  try { parsed = JSON.parse(r.stdout) } catch (e) { parsed = null }
  if (!parsed || !parsed.entries || typeof parsed.entries !== 'object') return { ok: false, reason: 'unparseable' }
  return { ok: true, entriesById: parsed.entries }
}

// `design-paths.storybook.indexUrl` when set, else the port URL.
function storybookIndexUrl(paths) {
  const sb = paths.storybook || {}
  return (typeof sb.indexUrl === 'string' && sb.indexUrl) || ('http://127.0.0.1:' + sb.port + '/index.json')
}

// The journey story ids the served index must carry, in seed order (journeys-drawn's recorded result).
function requiredJourneyStoryIds() {
  return (status.designStage && status.designStage.journeys && status.designStage.journeys.stories) || {}
}

// Probes the index, then names the FIRST seed-order journey the served index does not carry.
function checkStorybookServingJourneys(paths) {
  const probe = probeStorybookIndex(storybookIndexUrl(paths))
  if (!probe.ok) return probe
  const stories = requiredJourneyStoryIds()
  for (const [name, id] of Object.entries(stories)) {
    if (!probe.entriesById[id]) return { ok: false, reason: 'missing-story', story: id, journey: name }
  }
  return { ok: true, entriesById: probe.entriesById }
}

// `--mark design-approved` — re-runs the build and both story checks against a FRESH index, then
// freezes docs/design/approval.json. No per-file hash is recorded: the set is never gated later.
function handleDesignApproved() {
  if (!status.marks.journeysDrawn) die('journeys-drawn has not been marked yet — mark journeys-drawn first')
  if (!designStageApplies()) {
    const desc = readStackDescriptor() || {}
    die('the design stage does not apply to this host (archetype "' + status.archetype +
      '", designCatalog "' + (desc.designCatalog || 'unset') + '") — nothing to mark here')
  }
  const paths = requireDesignPaths('design-approved')

  const build = runStorybookBuild(paths)
  refuseOnStorybookBuild(build, 'design-approved')

  const composites = briefCompositesWithStates()
  const missingState = storybookIndexLib.stateStoriesCheck(build.index.entries, composites, paths.kit)
  if (missingState) {
    die('composite ' + missingState.composite + ': no state story ' + missingState.state + ' under ' +
      paths.kit + ' — export a story named ' + missingState.state + ' in ' + missingState.composite + '.stories.tsx')
  }

  const seedJourneys = seedJourneysMap()
  const jCheck = storybookIndexLib.journeyStoriesCheck(build.index.entries, [...seedJourneys.keys()], paths.journeys)
  if (!jCheck.ok) {
    die('journey ' + jCheck.journey + ': no story tagged journey with a play function in the index')
  }

  const journeysOut = {}
  for (const [name, j] of seedJourneys) {
    let beatHash = null
    try { beatHash = JSON.parse(fs.readFileSync(beatsFilePath(paths.journeys, name), 'utf8')).beatHash } catch (e) { beatHash = null }
    const storyFile = findJourneyStoryFile(path.join(root, paths.journeys), name)
    journeysOut[name] = {
      story: jCheck.stories[name],
      file: storyFile ? path.relative(root, storyFile) : null,
      beats: beatHash,
      screens: j.labels.slice(),
    }
  }
  const compositesOut = {}
  for (const c of composites) compositesOut[c.composite] = c.states.slice()

  const record = {
    schemaVersion: 1,
    approvedAt: new Date().toISOString(),
    storybook: { port: paths.storybook.port },
    journeys: journeysOut,
    composites: compositesOut,
  }
  fs.mkdirSync(path.dirname(docsDesignApprovalPath()), { recursive: true })
  fs.writeFileSync(docsDesignApprovalPath(), JSON.stringify(record, null, 2) + '\n')

  status.marks.designApproved = true
  status.designStage = Object.assign({}, status.designStage, { approvedAt: record.approvedAt })
  saveStatus()
  return { prev: 'AWAITING_DESIGN_APPROVAL', next: 'ROADMAP' }
}

function handleMenusDone() {
  if (!status.marks.discoveryDone) die('discovery-done has not been marked yet — mark discovery-done first')
  if (!status.marks.briefWritten) die('brief-written has not been marked yet — mark brief-written first')
  const check = menusCheck()
  if (!check.ok) {
    die('open dimension(s) with no recorded menu (--mark menu-written --file <menu.json>) or no ## Picks line: ' + check.missing.join(', ') +
      ' — finish the interview, then re-mark menus-done')
  }
  // The archetype was validated at discovery-done; the ## Picks line is still required, never re-parsed.
  status.marks.menusDone = true
  saveStatus()
  const archetype = status.archetype
  // Once the mock app exists the tournament is recorded skipped at MENUS.
  let next
  if (isTournamentArchetype(archetype) && !(status.tournament && status.tournament.skipped)) next = 'FINALISTS'
  else next = 'DECIDE'
  return { prev: 'MENUS', next }
}

// ---------------------------------------------------------------------------
// BRIEF: `--mark brief-written` is the only mark. A pass-through for DESIGN_SKIPPED_ARCHETYPES; a
// visual archetype requires an APPROVED design/mocks/status.json, then records design: "ratified".
// ---------------------------------------------------------------------------
function mocksStatusPath() { return path.join(root, 'design/mocks/status.json') }
function readMocksStatus() {
  try { return JSON.parse(fs.readFileSync(mocksStatusPath(), 'utf8')) } catch (e) { return null }
}

// "notes open" is the waiting items of the latest round's notes.json (0 with none).
function seedJourneyCount() { return seedJourneysMap().size }
function notesOpenCount() { return mocksRoundLib.openNoteCount(root) }

// design/mocks/status.json must exist and be APPROVED — re-checked here so BRIEF never trusts a
// state that regressed after approval.
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
  return { ok: true, status: parsed }
}

function handleBriefWritten() {
  if (!status.marks.discoveryDone) die('discovery-done has not been marked yet — mark discovery-done first')
  const archetype = status.archetype

  let mocksStatus = null
  if (isVisualArchetype(archetype)) {
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
    }
    mocksStatus = check.status
  }

  // DESIGN_SKIPPED_ARCHETYPES
  // (backend-api/data-ml/conversational-bot/cli-devtool) own nothing beyond DISCOVERY — record design: "skipped" straight away.
  if (isDesignSkipped(archetype)) {
    status.marks.briefWritten = true
    status.brief = { mocks: null, ratifiedAt: new Date().toISOString() }
    status.design = 'skipped'
    saveStatus()
    return { prev: 'BRIEF', next: 'MENUS' }
  }

  status.marks.briefWritten = true
  status.brief = {
    mocks: mocksStatus ? 'design/mocks/status.json' : null,
    ratifiedAt: new Date().toISOString(),
  }
  status.design = 'ratified'
  saveStatus()
  return { prev: 'BRIEF', next: 'MENUS' }
}

// ---------------------------------------------------------------------------
// FINALISTS / RACE / PROBE / PICK: the tournament, TOURNAMENT_ARCHETYPES only. RACE is driver-only
// (scaffold, then gate, then boot via smoke.sh's contract); `probe-done` re-runs gate+boot and
// assembles the benchmark; `picked` matches the brief's ## Picks against each finalist's `picks`.
// ---------------------------------------------------------------------------
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

// "last measured" reads an existing tournament/benchmark.json's average tokens/finalist, or
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
  // A mock-app host records the tournament skipped at MENUS and never derives FINALISTS —
  // there is nothing left for finalists-skipped to do; DECIDE is already the next step.
  if (status.tournament && status.tournament.skipped) {
    die('the tournament was already skipped for this host (' + JSON.stringify(status.tournament.skipped) +
      ') — the mock app fixes the frontend dimensions and FINALISTS is never reached; run --mark decided instead')
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
  // Same refusal as finalists-skipped above — a mock-app host never reaches FINALISTS.
  if (status.tournament && status.tournament.skipped) {
    die('the tournament was already skipped for this host (' + JSON.stringify(status.tournament.skipped) +
      ') — the mock app fixes the frontend dimensions and FINALISTS is never reached; run --mark decided instead')
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

// Races every finalist with no `race[name]` yet, in file order; a failed scaffold spends nothing
// further. Persisted after every finalist. Called only on a bare invocation reaching RACE.
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

// Re-runs each green-scaffold finalist's gate and boot as an executed fact before assembling the
// benchmark; a finalist whose scaffold failed owes no probe.json.
function handleProbeDone() {
  // A mock-app host records the tournament skipped — name that remedy before the generic message.
  if (status.tournament && status.tournament.skipped) {
    die('the tournament was skipped for this host (' + JSON.stringify(status.tournament.skipped) +
      ') — the mock app fixes the frontend dimensions and PROBE is never reached; run --mark decided instead')
  }
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

// Every probe.json task carries exactly
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

// The driver never ranks finalists — exactly one finalist whose `picks` match the brief's current
// ## Picks records the winner; zero or several is refused. PICK is a stack-only decision.
function handlePicked() {
  // Same remedy as handleProbeDone's guard above — a skipped tournament never reaches PICK.
  if (status.tournament && status.tournament.skipped) {
    die('the tournament was skipped for this host (' + JSON.stringify(status.tournament.skipped) +
      ') — the mock app fixes the frontend dimensions and PICK is never reached; run --mark decided instead')
  }
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
// DECIDE: the decision-record closure check.
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

// The ADR check reads an ADR's `## Dissents` section through this extraction.
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

// The nine floor keys every
// `.claude/genesis/conventions.json` must carry a row for, decided or deferred.
const CONVENTIONS_FLOOR_KEYS = [
  'error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations',
  'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric',
]

function conventionsPath() { return path.join(genesisDir, 'conventions.json') }
function readConventions() {
  try { return JSON.parse(fs.readFileSync(conventionsPath(), 'utf8')) } catch (e) { return null }
}

// An ADDITIONAL gate on `decided`, run only after decideCheck() passes; returns the first
// offending row, named by key.
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

// With a tournament winner, `decided` also requires the descriptor's scaffoldCommand to be the
// winner's own and an ADR citing `.claude/genesis/tournament/benchmark.md`. On success the raced
// `finalists/` and `logs/` are deleted; benchmark, gallery and evidence survive.
function handleDecided() {
  if (!status.marks.menusDone) die('menus-done has not been marked yet — mark menus-done first')
  const check = decideCheck()
  if (!check.ok) die(describeDecideGap(check) + ' — fix it, then re-mark decided')
  // Run only after decideCheck() passes, so the ADR/Dissents/dimension checks keep firing first.
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
// SCAFFOLD / SKELETON / GATE (driver-only): run scaffoldCommand and gateCommand via
// `bash -c` in --root (the idiom smoke.sh uses for bootCommand/readyCheck).
// ---------------------------------------------------------------------------
function scaffoldLogPath() { return path.join(genesisDir, 'scaffold.log') }
function gateLogPath() { return path.join(genesisDir, 'gate.log') }

// `cwd` defaults to root; the tournament runs each finalist's commands inside its own directory.
function runLogged(cmd, args, logPath, opts) {
  const cwd = (opts && opts.cwd) || root
  const what = (opts && opts.what) || ('command "' + [cmd].concat(args).join(' ') + '"')
  return runLoggedWith(logPath, (fd) => runChild(cmd, args, { cwd, stdio: ['ignore', fd, fd] }, what))
}

function runLoggedWith(logPath, spawnWith) {
  // The log fd is opened and truncated before the child spawns and handed to stdio for stdout and
  // stderr — output never transits a Node pipe. Closed on every path.
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
    r = spawnWith(fd)
  } finally {
    try { fs.closeSync(fd) } catch (e) { /* already closed */ }
  }
  return r
}

function runShell(cmd, logPath, opts) {
  const cwd = (opts && opts.cwd) || root
  const what = (opts && opts.what) || ('shell command "' + cmd + '"')
  return runLoggedWith(logPath, (fd) => driverIo.runHost(cmd, { cwd, stdio: ['ignore', fd, fd] }, what))
}

// The mock app no longer pre-empts the scaffold — a
// scaffold record is "succeeded" only the one way now (scaffoldCommand exited 0).
function scaffoldSucceeded(s) { return !!(s && s.exit === 0) }

function runScaffoldIfDue() {
  if (scaffoldSucceeded(status.scaffold)) return status.scaffold
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

// Every enforceable DECIDED convention's probe file must exist and be non-empty (re-read fresh).
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

// The binding-subset file (CLAUDE.md, else AGENTS.md) must exist, be <= 150 lines, and name the
// gateCommand and the testTree as literals.
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
  if (!scaffoldSucceeded(status.scaffold)) {
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
  status.marks.skeletonLanded = true
  saveStatus()
  const g = runGateIfDue()
  if (g.exit !== 0) return { prev: 'SKELETON', next: 'GATE_RED' }
  recordDesignStageSkipIfNeeded()
  return { prev: 'SKELETON', next: designStageApplies() ? 'DESIGN_BRIEF' : 'ROADMAP' }
}

// Caps the byte window logTail reads, far below any caller's stdout-capture buffer.
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
    // A byte-offset cut can land mid-character; strip the leading U+FFFD replacement characters.
    while (text.length && text.charCodeAt(0) === 0xfffd) text = text.slice(1)
    byteTruncated = size > readLen
  } catch {
    text = ''
  } finally {
    try { fs.closeSync(fd) } catch { /* already closed */ }
  }
  // The line slice runs BEFORE the truncation marker is attached, so the marker can never be sliced
  // away; either a dropped line or a dropped byte attaches it.
  const lines = text.split('\n')
  const wanted = n || 20
  const tail = lines.slice(-wanted)
  const lineTruncated = tail.length < lines.length
  const body = tail.join('\n')
  return (byteTruncated || lineTruncated) ? '… truncated, full log at ' + p + ' …\n' + body : body
}

// ---------------------------------------------------------------------------
// ROADMAP: the roadmap closure check — headers present, Depends-on graph acyclic.
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
  const beforeFirstHeadingByFile = {}
  for (const f of briefs) {
    const text = fs.readFileSync(path.join(roadmapDir, f), 'utf8')
    const beforeFirstHeading = text.split(/^##\s/m)[0]
    beforeFirstHeadingByFile[f] = beforeFirstHeading
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
  // Brief 01's header must name the one real record through the deployed production path. A
  // roadmap with no 01-*.md brief is not refused by this check.
  const firstBrief = briefs.find((f) => /^01-.*\.md$/.test(f))
  if (firstBrief && !/First light:\s*\S/.test(beforeFirstHeadingByFile[firstBrief])) {
    return { ok: false, reason: 'first-light-missing', detail: firstBrief }
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
    if (check.reason === 'first-light-missing') {
      die('docs/roadmap/' + check.detail + ' has no "First light:" header — brief 01 is the ' +
        'first-light brief: name the one real record that proves the production path end to ' +
        'end (one line), then re-mark roadmap-written')
    }
    if (check.reason === 'cycle') {
      die('docs/roadmap has a Depends-on cycle: ' + check.detail.join(' -> ') + ' — break the cycle, then re-mark roadmap-written')
    }
  }
  // On a fresh visual run every seed label must land in exactly one brief's ```surfaces block.
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
  // There is no DESIGN state left to route
  // into here for any archetype; ROADMAP hands straight to HANDOFF.
  saveStatus()
  return { prev: 'ROADMAP', next: 'HANDOFF' }
}

// ---------------------------------------------------------------------------
// HANDOFF -> GROUNDED: `profile-written` runs init-gen.js generate itself; its acceptance reaches
// the terminal state GROUNDED.
// ---------------------------------------------------------------------------
function initGenLogPath() { return path.join(genesisDir, 'init-gen.log') }

// The exit-code-keyed remedy the handoff lists verbatim (1: manifest row, 2: profile field, 3: hand
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

// Bash-quotes a single argument for the shell command string runShell executes
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
// deriveState — side-effecting by default: runs the driver-only SCAFFOLD/GATE stages as needed.
// `{ peek: true }` (--state only) derives the same state without running anything or writing
// status.json, reporting SCAFFOLD/GATE when no result is on disk yet.
// ---------------------------------------------------------------------------
function deriveState(opts) {
  const peek = !!(opts && opts.peek)

  const disc = discoveryCheck()
  if (!status.marks.discoveryDone || !disc.ok) return 'DISCOVERY'

  // BRIEF sits between DISCOVERY
  // and MENUS.
  if (!status.marks.briefWritten) return 'BRIEF'

  const menus = menusCheck()
  if (!status.marks.menusDone || !menus.ok) return 'MENUS'

  // The tournament sits between MENUS and DECIDE until skipped or resolved; a host whose `decided`
  // mark is recorded is never routed backward into FINALISTS.
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

  const decide = decideCheck()
  if (!status.marks.decided || !decide.ok) return 'DECIDE'

  if (!scaffoldSucceeded(status.scaffold)) {
    if (peek) return status.scaffold ? 'SCAFFOLD_RED' : 'SCAFFOLD'
    const s = runScaffoldIfDue()
    return scaffoldSucceeded(s) ? 'SKELETON' : 'SCAFFOLD_RED'
  }

  if (status.architect !== 'scaffold-complete') {
    if (!status.marks.skeletonLanded) return 'SKELETON'
    if (peek) return status.zeroDayGate ? 'GATE_RED' : 'GATE'
    const g = runGateIfDue()
    if (g.exit !== 0) return 'GATE_RED'
    recordDesignStageSkipIfNeeded()
    return designStageApplies() ? 'DESIGN_BRIEF' : 'ROADMAP'
  }

  // DESIGN_BRIEF is derived from the mark alone; the handler verifies brief.md and design-paths.json.
  if (designStageApplies() && !status.marks.designBriefWritten) {
    return 'DESIGN_BRIEF'
  }

  // DESIGN_KIT / DESIGN_JOURNEYS re-derive from disk on every call — a vanished `.storybook/main.*`
  // or journey story is demanded again.
  if (designStageApplies()) {
    if (!status.marks.kitLanded || !storybookMainExists()) return 'DESIGN_KIT'
    if (!status.marks.journeysDrawn || anyJourneyStoryVanished()) return 'DESIGN_JOURNEYS'
    // Derived from the mark alone; the
    // design-approved handler verifies docs/design/approval.json before setting it.
    if (!status.marks.designApproved) return 'AWAITING_DESIGN_APPROVAL'
  }

  const rm = roadmapCheck()
  if (!status.marks.roadmapWritten || !rm.ok) return 'ROADMAP'

  // ROADMAP hands directly to HANDOFF —
  // the design canon is ratified at BRIEF, before ROADMAP is ever reached.

  // HANDOFF advances to GROUNDED once profile-written recorded a successful init-gen run.
  if (status.handoff && status.handoff.initGenExit === 0) return 'GROUNDED'

  return 'HANDOFF'
}

// ---------------------------------------------------------------------------
// Step text per state (every step opens with a Read only: file list).
// ---------------------------------------------------------------------------

// These share this count: the enforceable, checker-backed DECIDED rows conventions.json
// carries — read fresh off disk, never cached in status.json.
function enforceableProbeCount() {
  const conv = readConventions()
  const rows = (conv && Array.isArray(conv.rows)) ? conv.rows : []
  return rows.filter((r) => r && r.status === 'DECIDED' && r.enforceable === true).length
}

// The fifteen asked keys in fixed order, four per round. `integrations` and `pricing` under
// ## Non-UI Coverage are copied from the coverage answers (`integrations`, `payer`), never asked.
const DISCOVERY_ROUNDS = [
  ['payer', 'tenancy', 'data-sensitivity', 'residency'],
  ['ai-use', 'unattended', 'integrations', 'scale-outage'],
  ['vendor-budget', 'offline-mobile', 'jobs', 'notifications'],
  ['retention', 'admin', 'success-metric'],
]
const NON_UI_ASKED_KEYS = ['jobs', 'notifications', 'retention', 'admin']

function discoveryRoundLines() {
  const text = briefText()
  if (text === null) return []
  const coverage = parseKeyedSection(text, 'Coverage').keys
  const nonUi = parseKeyedSection(text, 'Non-UI Coverage').keys
  const pks = parsePicks(text)
  const current = (k) => {
    if (k === 'success-metric') return pks[k] || 'dark'
    if (NON_UI_ASKED_KEYS.includes(k)) return nonUi[k] || 'dark'
    return coverage[k] || 'dark'
  }
  const lines = ['ask in rounds of four — one AskUserQuestion per round, every question naming its key in parentheses, options "confirm: <guess> (Recommended)" / "correct it" / "not applicable"; copy ## Non-UI Coverage integrations from the integrations answer and pricing from the payer answer; write success-metric as - success-metric: <label> under ## Picks:']
  DISCOVERY_ROUNDS.forEach((keys, i) => {
    lines.push('round ' + (i + 1) + ' of 4')
    for (const k of keys) lines.push('  - ' + k + ': ' + current(k) + ' · guess:')
  })
  return lines
}

// MENUS classification of one dimension's recorded research menu: auto-pick only a sole,
// non-minority, unpriced rank-1 leader; everything else is asked. Returns null without a menu.
const DIRECTION_NAV_BY_ARCHETYPE = { 'web-app': 'sidebar', 'desktop-app': 'sidebar', 'realtime-trading': 'sidebar', 'mobile-app': 'tabs' }
function directionRoundLines(archetype) {
  const mobile = archetype === 'mobile-app'
  const nav = DIRECTION_NAV_BY_ARCHETYPE[archetype] || 'sidebar'
  const layout = mobile ? 'single column, safe-area insets' : 'responsive grid, 3 breakpoints'
  return [
    '## Direction round — ask once, recommended first, then hand the answers to the dispatch',
    '- navigation shell: ' + nav + ' (Recommended) | ' + ['sidebar', 'top-nav', 'tabs'].filter((n) => n !== nav).join(' | '),
    '- layout system: ' + layout + ' (Recommended) | ' + (mobile ? 'responsive grid, 3 breakpoints' : 'single column, safe-area insets'),
    '- color schemes: system (Recommended) | light | dark',
    '- accessibility baseline: WCAG 2.2 AA (Recommended) | WCAG 2.2 AAA',
    '- token tiers: 2 (Recommended) | 3',
    'ask the forks above in one AskUserQuestion (token tiers joins only when the kit catalogue offers more than one tier model; otherwise print it as a 📌 line), then write ## Direction in docs/design/brief.md after ## Users and context',
  ]
}

function classifyMenu(dim) {
  let menu
  try { menu = JSON.parse(fs.readFileSync(path.join(genesisDir, 'interview-research', dim + '.json'), 'utf8')) } catch { return null }
  const options = menu && Array.isArray(menu.options) ? menu.options.filter((o) => o && typeof o === 'object') : []
  if (!options.length) return null
  if (options.some((o) => !Number.isInteger(o.rank))) return { kind: 'ask', reason: 'no rank' }
  const leaders = options.filter((o) => o.rank === 1)
  if (leaders.length !== 1) return { kind: 'ask', reason: 'rank tie' }
  const lead = leaders[0]
  if (lead.is_minority === true) return { kind: 'ask', reason: 'minority leader' }
  if (!/^n\/a\b/i.test(String(lead.priced))) return { kind: 'ask', reason: 'priced: ' + lead.priced }
  const why = lead.why_recommended || menu.why_recommended || 'ranked first in the research'
  return { kind: 'auto', label: lead.label, why }
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
      // Reminds the
      // session to render the brief in full once, replacing genesis.md's per-round restatement.
      lines.push('Before marking: print ## What I think you\'re building and ## Coverage once, in full — the user reads this render as the brief.')
      const check = discoveryCheck()
      if (check.reason === 'unparseable') lines.push('unparseable coverage line(s): ' + check.detail.join('; '))
      if (check.reason === 'missing') lines.push('missing coverage key(s): ' + check.detail.join(', '))
      if (check.reason === 'dark') lines.push('dark coverage key(s) — ask, in the user\'s words: ' + check.detail.join(', '))
      // The archetype gate moved here from
      // menus-done — this step must tell the session the exact `## Picks` line it still owes.
      if (check.ok && !picks().archetype) {
        lines.push('📌 derive the archetype from the idea, print "📌 Auto-picked archetype <key> — <one-line reason> (veto anytime)", ' +
          'then write - archetype: <key> under ## Picks (one of: ' + REGISTRY_KEYS.join(', ') + ')')
      }
      lines.push(...discoveryRoundLines())
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
      if (!(k in status.menus)) noMenu.push(k)
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
    if (noPick.length) {
      const asked = []
      for (const k of noPick) {
        const c = classifyMenu(k)
        if (!c) continue
        if (c.kind === 'auto') {
          lines.push('📌 Auto-picked ' + k + ': ' + c.label + ' — ' + c.why + ' (veto anytime)')
          lines.push('  write: - ' + k + ': ' + c.label)
        } else asked.push(k + ' (' + c.reason + ')')
      }
      lines.push(asked.length ? 'ask (' + asked.length + '): ' + asked.join(', ') : 'ask (0): none')
    }
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark menu-written --file <menu.json>' +
      '\n  node ' + __filename + ' --root ' + root + ' --mark menus-done')
    return lines.join('\n')
  },

  // DESIGN_SKIPPED_ARCHETYPES owe nothing beyond DISCOVERY; a visual archetype whose mocks set is not
  // APPROVED is sent to `/spec:mocks`; otherwise the step prints the brief-written mark.
  BRIEF: () => {
    const archetype = status.archetype
    const doctrineLine = 'Doctrine: spec/doctrine/genesis.md § Genesis: Brief State'
    if (isDesignSkipped(archetype)) {
      return [
        '## Step: brief — nothing owed beyond discovery',
        'Read only: ' + genesisRel('brief.md') + ' (## Picks)',
        doctrineLine,
        'archetype "' + archetype + '" owes nothing beyond DISCOVERY — no mocks set and no design canon.',
        'Then:\n  node ' + __filename + ' --root ' + root + ' --mark brief-written',
      ].join('\n')
    }

    const visual = isVisualArchetype(archetype)
    const mocksStatus = readMocksStatus()
    if (visual && !(mocksStatus && mocksStatus.state === 'APPROVED')) {
      return [
        '## Step: brief — approve the mocks set first',
        'Read only: design/mocks/seed.md, design/mocks/status.json',
        doctrineLine,
        mocksStatus ? ('mocks: ' + mocksStatus.state + ' — not yet approved') : 'no design/mocks/status.json yet',
        'next: run /spec:mocks in this repo until it reports APPROVED, then --mark brief-written',
      ].join('\n')
    }

    const journeys = (visual && mocksStatus && mocksStatus.journeys) ? Object.keys(mocksStatus.journeys).length : 0
    const readFiles = visual
      ? ['design/mocks/seed.md', 'design/mocks/status.json', genesisRel('brief.md')]
      : [genesisRel('brief.md')]
    const lines = [
      '## Step: brief — ratify the approved set into the design canon',
      'Read only: ' + readFiles.join(', '),
      doctrineLine,
    ]
    if (visual) {
      lines.push('mocks: APPROVED · journeys: ' + journeys)
      lines.push('seed journeys: ' + seedJourneyCount() + ' · notes open: ' + notesOpenCount())
    }
    lines.push('  node ' + __filename + ' --root ' + root + ' --mark brief-written')
    return lines.join('\n')
  },

  DECIDE: () => {
    const check = decideCheck()
    const lines = [
      '## Step: record the stack descriptor and decision records',
      'Read only: ' + genesisRel('brief.md') + ' (## Open Dimensions, ## Picks), ' + descriptorRelPath(),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Decision Record (one proposer)',
    ]
    if (!check.ok) lines.push(describeDecideGap(check) + '.')
    lines.push('conventions auto-pick (8): error-taxonomy, logging, naming-identifiers, wire-representations, cross-plane-constants, env-config, ci, background-async — derive each from the stack and print 📌 Auto-picked <key> — <reason> (veto anytime)')
    const metric = picks()['success-metric']
    lines.push(metric ? 'success-metric: ' + metric + ' (from ## Picks)' : 'success-metric: not in ## Picks — ask it, in the user\'s words')
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark decided')
    return lines.join('\n')
  },

  // The go/no-go line — the archetype's probe tasks,
  // the retry cap, the cost estimate, and the last-measured tokens/finalist figure (or "no
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
      '📌 Auto-picked skip — the race costs one mini-build per finalist and ## Picks already names the stack (veto anytime)',
      lastMeasuredLine(),
      'Then:\n  node ' + __filename + ' --root ' + root + ' --mark finalists-skipped' +
        '\n  node ' + __filename + ' --root ' + root + ' --mark finalists-written --file <finalists.json>',
    ].join('\n')
  },

  // RACE is driver-only: rendered only by acceptedOutput() right after finalists-written accepts,
  // never by deriveState() itself.
  RACE: () => [
    '## Step: race the finalists',
    'Read only: ' + genesisRel('tournament/'),
    'Doctrine: spec/doctrine/genesis.md § Genesis: Tournament of Scaffolds',
    'The driver races every finalist (scaffold, then gate + boot on a green scaffold) on the next invocation — no session action needed.',
    'Then:\n  node ' + __filename + ' --root ' + root,
  ].join('\n'),

  // Race results per finalist (a failed scaffold prints "failed at scaffold — spent no
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

  // benchmark.md printed verbatim plus the evidence-informs line — a benchmark number never decides.
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

  // The Agent dispatch line, the design-brief
  // skill line, one journey line per seed journey, and the catalog line; the step also
  // adds design/mocks/screens/ to the reads when it exists.
  DESIGN_BRIEF: () => {
    ensureCatalogGenerated()
    const seedJourneys = seedJourneysMap()
    const dp = readDesignPathsJson()
    const rulesFile = (dp && typeof dp.rules === 'string' && dp.rules) || '.claude/rules/design.md'
    const lines = [
      '## Step: write the design brief',
      'Read only: design/mocks/seed.md, ' +
        (fs.existsSync(path.join(root, 'design/mocks/screens')) ? 'design/mocks/screens/ (the confirmed wireframes), ' : '') +
        'docs/design/catalog.md, ' +
        genesisRel('design-paths.json') + ', ' + rulesFile,
      'Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage',
      ...directionRoundLines(status.archetype),
      'Dispatch: Agent {model: "fable", effort: "high"} — fresh context; hand it this step\'s read list, doctrine and skill lines verbatim (authors the brief and the tables); append the direction answers to the hand-off',
      'Skill: design-brief — load it before the first line',
    ]
    if (status.designStage && status.designStage.catalog) {
      const c = status.designStage.catalog
      lines.push(c.exit !== 0
        ? '⚠️ catalog inventory failed (exit ' + c.exit + ') — write ## Catalog by hand from the installed components'
        : 'catalog: ' + c.components + ' components · ' + c.unavailable + ' compositions unavailable')
    }
    for (const [name, j] of seedJourneys) {
      lines.push('journey: ' + name + ' (' + j.beats.length + ' beats)')
    }
    lines.push('Write docs/design/brief.md (template: design-brief.md via spec-paths templates), ' +
      genesisRel('design-paths.json') + ' (template: design-paths.json), and fill ## Intent to pattern and ## Naming in the rules file.')
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark design-brief-written')
    return lines.join('\n')
  },

  // The Agent dispatch line, the
  // frontend-design skill line (warn, never block — the standing theme-authoring skill), one
  // composite line per brief row, the Storybook setup recipe (Contracts), and --mark kit-landed.
  DESIGN_KIT: () => {
    const dp = readDesignPathsJson() || {}
    const rulesFile = typeof dp.rules === 'string' ? dp.rules : '.claude/rules/design.md'
    const lines = [
      '## Step: author the tokens, the shell and the kit',
      'Read only: docs/design/brief.md, docs/design/catalog.md, ' + rulesFile + ', ' + genesisRel('design-paths.json'),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage',
      'Dispatch: Agent {model: "fable", effort: "high"} — fresh context; hand it this step\'s read list, doctrine and skill lines verbatim (authors tokens, shell and composites)',
      'Skill: frontend-design — load it if installed; ⚠️ missing = warn and continue',
    ]
    for (const c of briefCompositesWithStates()) {
      lines.push('composite: ' + c.composite + ' — states: ' + c.states.join(', '))
    }
    lines.push(
      'Storybook setup:',
      '  npx -y storybook@latest init --yes --no-dev --features docs test --disable-telemetry --package-manager <pm> </dev/null',
      '    -> .storybook/main.ts + preview.tsx, scripts "storybook"/"build-storybook", example stories under src/stories/ (delete them)',
      '  Add `import \'<tokens css or app css>\'` to .storybook/preview.tsx (init does not import the app\'s CSS).',
      '  Re-pin the devDependencies init left at "latest" (@chromatic-com/storybook, vitest, playwright, @vitest/browser-playwright, @vitest/coverage-v8).',
      '  TanStack Start hosts: if the build emits no iframe.html, restore builder-vite\'s iframe.html input in .storybook/main.ts viteFinal.',
    )
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark kit-landed')
    return lines.join('\n')
  },

  // The Agent dispatch line (fable model), one journey line per seed journey, the primitive-ban
  // rule, the CSF/router recipe, and --mark journeys-drawn. The beats-file writer runs at this print.
  DESIGN_JOURNEYS: () => {
    const dp = readDesignPathsJson() || {}
    const journeysRel = typeof dp.journeys === 'string' ? dp.journeys : 'src/journeys'
    writeBeatsFilesIfNeeded(journeysRel)
    const rulesFile = typeof dp.rules === 'string' ? dp.rules : '.claude/rules/design.md'
    const seedJourneys = seedJourneysMap()
    const beatsFiles = [...seedJourneys.keys()].map((name) => journeysRel + '/' + name + '.beats.json')
    const lines = [
      '## Step: rebuild every approved journey as a journey story',
      'Read only: docs/design/brief.md, ' + rulesFile + ', ' + beatsFiles.join(', ') + ', ' + (dp.kit || 'src/components/kit'),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage',
      'Dispatch: Agent {model: "fable", effort: "high"} — fresh context; hand it this step\'s read list, doctrine and skill lines verbatim (composes every approved journey from the kit; all journeys in this one session)',
    ]
    for (const [name, j] of seedJourneys) {
      lines.push('journey: ' + name + ' — ' + j.beats.length + ' beats → ' + journeysRel + '/' + name + '.journey.stories.tsx')
    }
    lines.push(
      'Rules: import composites from ' + (dp.kit || 'the kit') + ' only, never ' + (dp.primitivesAlias || 'the primitives alias') + '.',
      "meta: title: 'Journeys/<j>', tags: ['journey']; import beats from './<j>.beats.json'; " +
        'play iterates beats calling step(b.sentence, …); the host\'s real router in memory mode; fixtures from the records.',
    )
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark journeys-drawn')
    return lines.join('\n')
  },

  // On a served index carrying every journey story: the 🎨 line with the first journey's verified
  // URL, one `journey:` line per journey, the composite count, the reply line, and
  // `--mark design-approved`. On any probe failure: the refusal, a `Session:` line, and no URL.
  AWAITING_DESIGN_APPROVAL: () => {
    const paths = readDesignPathsJson() || {}
    const port = paths.storybook && paths.storybook.port
    const desc = readStackDescriptor() || {}
    const pm = (typeof desc.packageManager === 'string' && desc.packageManager) || 'npm'
    const check = checkStorybookServingJourneys(paths)
    if (!check.ok) {
      const reasonText = check.reason === 'unreachable' ? 'unreachable'
        : check.reason === 'unparseable' ? 'index unparseable'
        : 'missing story ' + check.story
      return [
        '## Step: JJ approves the designed set in Storybook',
        'Storybook is not serving the journey stories on port ' + port + ' — ' + reasonText,
        'Session: start it in the background and re-run the driver: ' + pm +
          ' exec storybook dev -p ' + port + ' --ci --no-open',
      ].join('\n')
    }
    const stories = requiredJourneyStoryIds()
    const names = Object.keys(stories)
    const total = Object.keys(check.entriesById).length
    const composites = Math.max(0, total - names.length)
    const lines = [
      '## Step: JJ approves the designed set in Storybook',
      'Read only: docs/design/brief.md, ' + genesisRel('design-paths.json'),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage',
    ]
    if (names.length) {
      lines.push('🎨 ready for review — http://localhost:' + port + '/?path=/story/' + stories[names[0]])
      for (const name of names) {
        lines.push('journey: ' + name + ' → http://localhost:' + port + '/?path=/story/' + stories[name])
      }
    }
    lines.push(
      'composites: ' + composites + ' state stories',
      'Reply `approve` to record the approval; anything else is a note for this session to act on, then re-run the driver.',
      'Then (only on the literal `approve`):\n  node ' + __filename + ' --root ' + root + ' --mark design-approved',
    )
    return lines.join('\n')
  },

  ROADMAP: () => {
    const lines = [
      '## Step: decompose the roadmap',
      'Read only: ' + descriptorRelPath() + ', docs/roadmap/, docs/design/approval.json, docs/design/brief.md',
      'Doctrine: spec/doctrine/genesis.md § Genesis: Roadmap Decomposition',
      'proceeding unless vetoed: brief order and dependencies (reorder later with spec-queue move)',
      'ask once: milestone gates — one AskUserQuestion',
    ]
    // The roadmap derives from docs/design/approval.json when it exists; otherwise no `approved:` line.
    const approval = readDocsDesignApproval()
    if (approval && approval.journeys && typeof approval.journeys === 'object') {
      const dp = readDesignPathsJson() || {}
      for (const [name, j] of Object.entries(approval.journeys)) {
        const screens = Array.isArray(j.screens) ? j.screens : []
        let beatCount = screens.length
        if (typeof dp.journeys === 'string') {
          try {
            const b = JSON.parse(fs.readFileSync(beatsFilePath(dp.journeys, name), 'utf8'))
            if (Array.isArray(b.beats)) beatCount = b.beats.length
          } catch (e) { /* fall back to screens.length above */ }
        }
        lines.push('approved: ' + name + ' — ' + beatCount + ' beats · screens: ' + screens.join(', ') +
          ' · story: ' + j.story)
      }
    }
    // Optional, never a gate.
    const hostCfg = readConfig(root)
    const isObjCfg = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
    if (approval && isObjCfg(hostCfg.pictures) && isObjCfg(hostCfg.walkthrough)) {
      lines.push('Optional — show the client the designed screens: node ' + path.join(__dirname, 'pictures.js') + ' --root ' + root)
    }
    lines.push(
      'Write docs/roadmap/00-overview.md plus one or more docs/roadmap/NN-*.md briefs, each with ' +
        'Phase: and Depends on: header lines before its first ## heading, acyclic. Brief 01 is the ' +
        'first-light brief — its header also carries a First light: line naming the one real ' +
        'record through the deployed production path, observed by a person. See ' +
        'spec/doctrine/genesis.md § Genesis: Roadmap Decomposition.',
      'Then:\n  node ' + __filename + ' --root ' + root + ' --mark roadmap-written',
    )
    return lines.join('\n')
  },

  // HANDOFF is a judgment step: the session authors .claude/genesis/init-profile.json and closes with
  // `--mark profile-written`; archetype/gate/ADR count/brief count still print here.
  HANDOFF: () => {
    const desc = readStackDescriptor() || {}
    const adrCount = Array.isArray(desc.decisionRecords) ? desc.decisionRecords.length : 0
    const readFiles = [
      'spec/commands/init.md (Phase 4 — the profile schema)',
      descriptorRelPath(),
      genesisRel('conventions.json'),
    ]
    readFiles.push('docs/adr/')
    // HANDOFF writes the contract's design block: design-paths.json's { kit, tokens, rules } (+ app)
    // once a kit landed, else { app } when the mocks stage ran; otherwise nothing.
    const mocksStatus = readMocksStatus()
    let designLine = ''
    if (status.designStage && status.designStage.kit) {
      const dp = readDesignPathsJson() || {}
      readFiles.push(genesisRel('design-paths.json'))
      let inner = '"kit": "' + dp.kit + '", "tokens": "' + dp.tokens + '", "rules": "' + dp.rules + '"'
      if (mocksStatus && mocksStatus.app) inner += ', "app": "' + mocksStatus.app + '"'
      designLine = 'config.design set to { ' + inner + ' }; '
    } else if (mocksStatus && mocksStatus.app) {
      designLine = 'config.design set to { "app": "' + mocksStatus.app + '" } (D1); '
    }
    return [
      '## Step: handoff — author the init profile; the driver grounds the repo',
      'Read only: ' + readFiles.join(', '),
      'Doctrine: spec/doctrine/genesis.md § Genesis: Enforcement Handoff to the spec pipeline',
      'archetype: ' + (status.archetype || desc.archetype || 'unknown'),
      'resolved gate: ' + (status.gateCommand || desc.gateCommand || 'unknown'),
      'ADR count: ' + adrCount,
      'brief count: ' + briefFileNames().length,
      'Write ' + genesisRel('init-profile.json') + ' (init.md Phase 4\'s shape; ' +
        'config.genesisStackDescriptor set from the genesis artifacts; ' + designLine +
        'manifestExtras claiming the skeleton\'s substrate and the probe suite), then:',
      '  node ' + __filename + ' --root ' + root + ' --mark profile-written --file ' + genesisRel('init-profile.json'),
    ].join('\n')
  },

  // The terminal state — printed once profile-written records a successful init-gen
  // generate run. archetype/resolved gate/ADR count/brief count carry over from HANDOFF's own
  // report inputs; convention probes is new.
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
  // Every `Doctrine: … § Genesis: <section>` line gains a `print:` line naming the spec-paths
  // slice of exactly that section, so the session loads one section per step instead of the
  // whole supplement (core § Session Execution). Parentheticals drop: the slice prefix-matches.
  const body = STEPS[state]().replace(/^(Doctrine: spec\/doctrine\/genesis\.md § Genesis: ([^\n(]+?))\s*(\([^)]*\))?$/gm,
    (m, line, name) => line + '\nprint: spec-paths shared-genesis --section "' + name + '"')
  return header + note + '\n\n' + body
}

function acceptedOutput(prevNext) {
  return renderFull(prevNext.next) + '\n\n✅ checkpoint — genesis state saved (' + prevNext.prev +
    ' → ' + prevNext.next + '); safe to /clear and re-run /spec:genesis'
}

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
    case 'design-brief-written': result = handleDesignBriefWritten(); break
    case 'kit-landed': result = handleKitLanded(); break
    case 'journeys-drawn': result = handleJourneysDrawn(); break
    case 'design-approved': result = handleDesignApproved(); break
    case 'roadmap-written': result = handleRoadmapWritten(); break
    case 'profile-written': result = handleProfileWritten(); break
    default:
      die('unknown mark "' + MARK + '" (discovery-done | brief-written | menu-written --file <f> | ' +
        'menus-done | finalists-written --file <f> | finalists-skipped | probe-done | picked | ' +
        'decided | skeleton-landed | design-brief-written | kit-landed | journeys-drawn | ' +
        'design-approved | roadmap-written | profile-written --file <f> [--refresh])')
      return
  }
  writeOut(1, acceptedOutput(result))
  process.exit(0)
}

// ---- run -------------------------------------------------------------------------------------
if (MARK) {
  handleMark()
} else if (STATE_ONLY) {
  // Read-only peek (never runs scaffoldCommand/gateCommand, never writes
  // status.json beyond loadStatus()'s own cold-root creation.
  writeOut(1, deriveState({ peek: true }))
  process.exit(0)
} else {
  const state = deriveState()
  writeOut(1, renderFull(state))
  process.exit(0)
}
