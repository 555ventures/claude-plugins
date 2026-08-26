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
// `status` is null when a child dies by signal, never spawns, or overflows maxBuffer — treating
// that null as a pass (or reading `.stdout` off a child that never ran) is the exact
// silent-success failure this driver exists to prevent.
//
// What this deliberately does NOT do:
//   - hold the interview, write the picks, author the ADRs, land the skeleton, or decompose the
//     roadmap itself — those stay session judgment; the driver only closes them once they exist.
//   - assert a design or roadmap judgment as "correct" — its checks are closure checks on
//     artifacts (a key is not dark, a file parses, a Dissents section is non-empty, a dimension
//     is named somewhere, a roadmap has no cycle), never opinions on their content.
//   - relocate the session CWD, or touch any file outside `--root`'s `.claude/genesis/`,
//     `docs/roadmap/`, and whatever `scaffoldCommand`/`gateCommand` themselves write.
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

function handleMenusDone() {
  if (!status.marks.discoveryDone) die('discovery-done has not been marked yet — mark discovery-done first')
  const check = menusCheck()
  if (!check.ok) {
    die('open dimension(s) missing a menu file or a ## Picks line: ' + check.missing.join(', ') +
      ' — finish the interview, then re-mark menus-done')
  }
  status.marks.menusDone = true
  saveStatus()
  return { prev: 'MENUS', next: 'DECIDE' }
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
  return { ok: true, descriptor: desc }
}

function describeDecideGap(check) {
  if (check.reason === 'no-descriptor') return 'stack descriptor not found at ' + descriptorAbsPath()
  if (check.reason === 'missing-key') return 'stack descriptor is missing required key "' + check.detail + '"'
  if (check.reason === 'adr-missing') return 'decision record ' + check.detail + ' does not exist'
  if (check.reason === 'adr-empty-dissents') return 'decision record ' + check.detail + ' has an empty ## Dissents section'
  if (check.reason === 'dim-unnamed') return 'open dimension `' + check.detail + '` is not named in any decision record'
  return 'the decision record is not yet closed'
}

function handleDecided() {
  if (!status.marks.menusDone) die('menus-done has not been marked yet — mark menus-done first')
  const check = decideCheck()
  if (!check.ok) die(describeDecideGap(check) + ' — fix it, then re-mark decided')
  status.marks.decided = true
  status.architect = 'decisions-recorded'
  saveStatus()
  return { prev: 'DECIDE', next: 'SCAFFOLD' }
}

// ---------------------------------------------------------------------------
// SCAFFOLD / SKELETON / GATE (D6/D7, driver-only): run scaffoldCommand and gateCommand via
// `bash -c` in --root (the idiom smoke.sh uses for bootCommand/readyCheck).
// ---------------------------------------------------------------------------
function scaffoldLogPath() { return path.join(genesisDir, 'scaffold.log') }
function gateLogPath() { return path.join(genesisDir, 'gate.log') }

function runShell(cmd, logPath) {
  const r = runChild('bash', ['-c', cmd], { cwd: root, encoding: 'utf8' }, 'shell command "' + cmd + '"')
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.writeFileSync(logPath, (r.stdout || '') + (r.stderr || ''))
  return r
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

function logTail(p, n) {
  let text = ''
  try { text = fs.readFileSync(p, 'utf8') } catch { text = '' }
  return text.split('\n').slice(-(n || 20)).join('\n')
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
// deriveState (D2) — side-effecting: runs the driver-only SCAFFOLD/GATE stages as needed,
// idempotent on scaffold.exit === 0; every check re-reads the artifacts, never trusts a mark
// whose backing file has vanished or regressed.
// ---------------------------------------------------------------------------
function deriveState() {
  const disc = discoveryCheck()
  if (!status.marks.discoveryDone || !disc.ok) return 'DISCOVERY'

  const menus = menusCheck()
  if (!status.marks.menusDone || !menus.ok) return 'MENUS'

  const decide = decideCheck()
  if (!status.marks.decided || !decide.ok) return 'DECIDE'

  if (!(status.scaffold && status.scaffold.exit === 0)) {
    const s = runScaffoldIfDue()
    return s.exit === 0 ? 'SKELETON' : 'SCAFFOLD_RED'
  }

  if (status.architect !== 'scaffold-complete') {
    if (!status.marks.skeletonLanded) return 'SKELETON'
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
      lines.push(genesisRel('brief.md') + ' does not exist yet — start from the template above.')
    } else {
      lines.push('Read only: ' + genesisRel('brief.md') + ' (## Coverage)')
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
    const lines = ['## Step: research and pick the open dimensions', 'Read only: ' + readFiles.join(', ')]
    if (noMenu.length) lines.push('open, no menu yet: ' + noMenu.join(', '))
    if (noPick.length) lines.push('open, menu written, no pick: ' + noPick.join(', '))
    for (const k of openKeys) {
      const rec = status.menus[k]
      if (!rec) continue
      if (rec.registryExit === 1) lines.push(k + ': some option(s) dropped for currency — see the menu file\'s droppedForCurrency')
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
    ]
    if (!check.ok) lines.push(describeDecideGap(check) + '.')
    lines.push('Then:\n  node ' + __filename + ' --root ' + root + ' --mark decided')
    return lines.join('\n')
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
    case 'decided': result = handleDecided(); break
    case 'skeleton-landed': result = handleSkeletonLanded(); break
    case 'roadmap-written': result = handleRoadmapWritten(); break
    default:
      die('unknown mark "' + MARK + '" (discovery-done | menu-written --file <f> | menus-done | ' +
        'decided | skeleton-landed | roadmap-written)')
      return
  }
  writeOut(1, acceptedOutput(result))
  process.exit(0)
}

// ---- run -------------------------------------------------------------------------------------
if (MARK) {
  handleMark()
} else {
  const state = deriveState()
  if (STATE_ONLY) { writeOut(1, state); process.exit(0) }
  writeOut(1, renderFull(state))
  process.exit(0)
}
