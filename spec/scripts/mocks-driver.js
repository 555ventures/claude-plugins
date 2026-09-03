#!/usr/bin/env node
// mocks-driver.js [--root <dir>] [--state]
// mocks-driver.js --root <dir> --mark <mark> [--journey <j>] [--direction <k>] [--shape <k>] [--decider "<name>"]
// mocks-driver.js --root <dir> --reopen journey:<j>|shapes|theme
// mocks-driver.js --root <dir> ledger (add|set|catch|check|counts) [flags]
// mocks-driver.js --root <dir> look <label> [--state <s>] [--out <png>]
// mocks-driver.js --root <dir> look-probe | look-via <playwright|browser>
//
// WHY: specs/20260902/07-mocks-command-driver.md — `/spec:mocks` is the standalone design
// stage; this driver derives SEED -> SHAPES -> WIREFRAMES -> THEME -> SKIN -> REVIEW ->
// APPROVED on every invocation from `design/mocks/status.json` plus the artifacts actually on
// disk (a recorded mark whose artifact vanished is demanded again), prints exactly one step,
// gates every advancing mark on the provenance ledger (spec 06, lib/mocks-ledger.js), and
// checkpoints every accepted mark so a run survives any number of `/clear`s (the genesis
// driver's discipline verbatim — spec/scripts/genesis-driver.js).
//
// What this deliberately does NOT do:
//   - author the seed, canon, screens, theme directions, or the review itself — those stay
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
//      printed what it invalidated, or a ledger/look subcommand succeeded.
//   1  `ledger check` found a blocked gate (rows printed).
//   2  a refused mark, a failed precondition (missing artifact, blocked gate, unreachable look
//      probe), a usage error, `ledger check` grammar errors, or a dead child process (runChild's
//      fail-closed refusal).

'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { runChild, writeOut } = require('./lib/driver-io')
const { parseLedger, gateVerdict, countsLine, appendAssumption, appendCatch, setStatus } = require('./lib/mocks-ledger')

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
    marks: { seedDone: null, shapePicked: null, canonWritten: null, themePicked: null, reviewOpened: null, approved: null },
    shape: null, theme: null, decider: null, look: 'playwright',
    journeys: {}, directions: {}, reopens: [], lastUpdated: null,
  }
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
  return merged
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
function allJourneysSkinned() {
  const journeys = currentSeedJourneys()
  if (journeys.size === 0) return false
  for (const [jn] of journeys) { const st = status.journeys[jn]; if (!st || !st.skinned) return false }
  return true
}
function deriveState() {
  if (!status.marks.seedDone) return 'SEED'
  if (!shapeValid()) return 'SHAPES'
  if (!(status.marks.canonWritten && allJourneysApproved())) return 'WIREFRAMES'
  if (!status.theme) return 'THEME'
  if (!allJourneysSkinned()) return 'SKIN'
  if (!status.marks.approved) return 'REVIEW'
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
  if (!shapeArg) die('--shape <kebab> is required')
  const shapesDir = path.join(root, 'design/shapes')
  let files = []
  try { files = fs.readdirSync(shapesDir).filter((f) => f.endsWith('.html')) } catch { /* none yet */ }
  const kebabs = files.map((f) => path.basename(f, '.html'))
  if (kebabs.length < 2 || kebabs.length > 3) die('design/shapes/ has ' + kebabs.length + ' candidate(s) — 2-3 are required before a pick')
  if (!kebabs.includes(shapeArg)) die('"' + shapeArg + '" is not among the shape candidates (' + kebabs.join(', ') + ')')

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

  const row = findAssumption((a) => a.kind === 'product' && a.tag === 'said-by-user' && a.status === 'confirmed' && a.claim === 'shape: ' + shapeArg)
  if (!row) die('design/mocks/ledger.md has no confirmed said-by-user product row with claim "shape: ' + shapeArg + '"')
  const rejectedTokens = (row.rejected || '').split(/[,\s]+/).filter(Boolean)
  const missing = kebabs.filter((k) => k !== shapeArg).filter((o) => !rejectedTokens.includes(o))
  if (missing.length) die('the "shape: ' + shapeArg + '" ledger row\'s rejected cell does not name every other shape candidate — missing: ' + missing.join(', '))

  status.shape = shapeArg
  status.marks.shapePicked = nowIso()
  saveStatus()
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
  status.journeys[j] = Object.assign({ drawn: null, approved: null, skinned: null, reviewed: null }, status.journeys[j] || {})
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
    if (labelOf(html) !== label) die(file + ': data-screen-label must equal "' + label + '"')
    if (statusOf(html) !== 'sketch') die(file + ': data-status must be "sketch" at journey-drawn time')
    if (!/wire\/tokens\.css/.test(html)) die(file + ': does not link ../wire/tokens.css')
    if (!/wire\/wire\.css/.test(html)) die(file + ': does not link ../wire/wire.css')
    const r = runDesignAtlasCheck([file])
    if (r.status !== 0) die(file + ': design-atlas.js check failed for label "' + label + '": ' + childOutput(r))
  }
  ensureJourneyRecord(journeyName).drawn = nowIso()
  saveStatus()
}

function handleJourneyApproved(journeyName) {
  requireGateOpen()
  if (!journeyName) die('--journey <name> is required')
  const st = status.journeys[journeyName]
  if (!st || !st.drawn) die('journey "' + journeyName + '" has not been drawn yet — mark journey-drawn --journey ' + journeyName + ' first')
  st.approved = nowIso()
  saveStatus()
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
  if (htmlFiles.length < 3) die('design/theme/' + kebab + ' has ' + htmlFiles.length + ' screen(s) composed — at least 3 are required, including the dense screen "' + dense + '"')
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

function handleThemePicked(kebab) {
  requireGateOpen()
  if (!kebab) die('--direction <kebab> is required')
  const composed = Object.keys(status.directions || {})
  if (composed.length < 2) die('only ' + composed.length + ' direction(s) composed — at least 2 are required before a pick')
  if (!composed.includes(kebab)) die('direction "' + kebab + '" has not been composed yet — mark direction-composed --direction ' + kebab + ' first')
  const row = findAssumption((a) => a.kind === 'product' && a.tag === 'said-by-user' && a.status === 'confirmed' && a.claim === 'theme: ' + kebab)
  if (!row) die('design/mocks/ledger.md has no confirmed said-by-user product row with claim "theme: ' + kebab + '" naming the pick')
  const rejectedTokens = (row.rejected || '').split(/[,\s]+/).filter(Boolean)
  const missing = composed.filter((k) => k !== kebab).filter((o) => !rejectedTokens.includes(o))
  if (missing.length) die('the "theme: ' + kebab + '" ledger row\'s rejected cell does not name every other composed direction — missing: ' + missing.join(', '))

  fs.copyFileSync(path.join(root, 'design/theme', kebab, 'tokens.css'), path.join(root, 'design/tokens.css'))
  status.theme = kebab
  status.marks.themePicked = nowIso()
  saveStatus()
}

function handleJourneySkinned(journeyName) {
  requireGateOpen()
  if (!status.marks.themePicked) die('theme-picked has not been marked yet — mark theme-picked first')
  if (!journeyName) die('--journey <name> is required')
  const journeys = currentSeedJourneys()
  const j = journeys.get(journeyName)
  if (!j) die('journey "' + journeyName + '" is not declared in design/mocks/seed.md')
  for (const label of j.labels) {
    const file = mockFile(label)
    if (!fs.existsSync(file)) die('design/mocks/' + label + '.html does not exist')
    const html = fs.readFileSync(file, 'utf8')
    if (/wire\//.test(html)) die(file + ': still links a wire/ stylesheet — journey-skinned requires every screen to link only ../tokens.css, never wire/')
    if (!/tokens\.css/.test(html)) die(file + ': does not link ../tokens.css')
  }
  const r = runDesignAtlasCheck(j.labels.map(mockFile))
  if (r.status !== 0) die('design-atlas.js check failed for journey "' + journeyName + '": ' + childOutput(r))
  ensureJourneyRecord(journeyName).skinned = nowIso()
  saveStatus()
}

function handleReviewOpened(decider) {
  if (!decider) die('--decider "<name>" is required')
  status.decider = decider
  status.marks.reviewOpened = nowIso()
  saveStatus()
}

function handleJourneyReviewed(journeyName) {
  requireGateOpen()
  if (!status.marks.reviewOpened) die('review-opened --decider "<name>" has not been marked yet — run --mark review-opened --decider "<name>" first')
  if (!journeyName) die('--journey <name> is required')
  const st = status.journeys[journeyName]
  if (!st || !st.skinned) die('journey "' + journeyName + '" has not been skinned yet — mark journey-skinned --journey ' + journeyName + ' first')
  st.reviewed = nowIso()
  saveStatus()
}

function handleApproved() {
  requireGateOpen()
  const journeys = currentSeedJourneys()
  for (const [jn] of journeys) {
    const st = status.journeys[jn]
    if (!st || !st.reviewed) die('journey "' + jn + '" has not been reviewed yet — mark journey-reviewed --journey ' + jn + ' first')
  }
  const files = mocksTopLevelHtmlFiles()
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8')
    if (statusOf(html) !== 'approved') die(path.basename(f) + ' is still data-status="' + statusOf(html) + '" — every screen must be approved before --mark approved')
  }
  const targets = loadTargetsOrNull()
  if (targets && Array.isArray(targets.viewports) && targets.viewports.length) {
    for (const f of files) {
      const html = fs.readFileSync(f, 'utf8')
      if (!/<meta[^>]+name="viewport"/.test(html)) die(path.basename(f) + ': no <meta name="viewport"> — every mock is one responsive file')
    }
  }
  const r = runDesignAtlasCheck([mocksDir, '--matrix'])
  if (r.status !== 0) die('design-atlas.js check --matrix design/mocks failed: ' + childOutput(r))

  status.marks.approved = nowIso()
  saveStatus()
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
    case 'journey-skinned': handleJourneySkinned(opts.journey); break
    case 'review-opened': handleReviewOpened(opts.decider); break
    case 'journey-reviewed': handleJourneyReviewed(opts.journey); break
    case 'approved': handleApproved(); break
    default: die('unknown --mark "' + mark + '" — one of: seed-done, shape-picked, canon-written, journey-drawn, journey-approved, direction-composed, theme-picked, journey-skinned, review-opened, journey-reviewed, approved')
  }
  const nextState = deriveState()
  printAcceptedTail(prevState, nextState)
}

// ---------------------------------------------------------------------------
// --reopen (D11) — clears marks, deletes nothing on disk.
// ---------------------------------------------------------------------------
function doReopen(target) {
  const at = nowIso()
  let m
  if ((m = /^journey:(.+)$/.exec(target))) {
    const j = m[1]
    const st = ensureJourneyRecord(j)
    st.approved = null
    st.skinned = null
    st.reviewed = null
    status.marks.approved = null
    const invalidated = ['approved', 'skinned', 'reviewed', 'approved(all)']
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
      st.drawn = null; st.approved = null; st.skinned = null; st.reviewed = null
    }
    status.marks.reviewOpened = null
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
    for (const j of Object.keys(status.journeys || {})) {
      const st = status.journeys[j]
      st.skinned = null; st.reviewed = null
    }
    status.marks.approved = null
    const invalidated = ['theme', 'skinned(all journeys)', 'reviewed(all journeys)', 'approved(all)']
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
function cmdLedger(sub, args) {
  const larg = (name) => flagArg(args, name)
  if (sub === 'add') {
    let out
    try {
      out = appendAssumption(ledgerTextOrDie(), {
        id: larg('--id'), step: larg('--step'), kind: larg('--kind'), claim: larg('--claim'),
        tag: larg('--tag'), status: larg('--status'), rejected: larg('--rejected'),
        dependents: larg('--dependents'), note: larg('--note'),
      })
    } catch (e) { die('ledger add: ' + e.message) }
    fs.writeFileSync(ledgerPath, out)
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
    writeOut(1, countsLine(parseLedger(ledgerTextOrDie())) + '\n')
    process.exit(0)
  }
  die('ledger: unknown subcommand "' + sub + '" — one of: add, set, catch, check, counts')
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
function cmdLook(label, args) {
  if (!label) die('look needs a <label>')
  const file = mockFile(label)
  if (!fs.existsSync(file)) die('design/mocks/' + label + '.html does not exist')
  const stateArg = flagArg(args, '--state')
  const outArg = flagArg(args, '--out')
  const targets = loadTargetsOrNull()
  const vp = (targets && Array.isArray(targets.viewports) && targets.viewports[0]) || { width: 390, height: 844 }
  const outPath = outArg ? path.resolve(outArg) : path.join(mocksDir, '.looks', label + (stateArg ? '.' + stateArg : '') + '.png')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const siblingPath = path.join(mocksDir, '.look-' + label + '.html')
  let content = fs.readFileSync(file, 'utf8')
  if (stateArg) {
    const script = '<script>document.addEventListener(\'DOMContentLoaded\',function(){var b=document.querySelector(\'[data-state-btn="' + stateArg + '"]\');if(b)b.click()})</script>'
    content = /<\/body>/i.test(content) ? content.replace(/<\/body>/i, script + '</body>') : content + script
  }
  fs.writeFileSync(siblingPath, content)
  try {
    const screenshotArgs = ['--no-install', 'playwright', 'screenshot', '--viewport-size=' + (vp.width | 0) + ',' + (vp.height | 0), 'file://' + siblingPath, outPath]
    const r = spawnSync('npx', screenshotArgs, { encoding: 'utf8' })
    if (r.error || r.status !== 0) {
      die('look: playwright screenshot failed: ' + (childOutput(r) || (r.error && r.error.message) || 'unknown error'))
    }
  } finally {
    try { fs.unlinkSync(siblingPath) } catch { /* best-effort cleanup */ }
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

function printStepBlock(state, title, readOnlyList, doctrineSection, progressLine, thenLines) {
  const lines = []
  lines.push('[mocks-driver] state: ' + state + '  root: ' + root)
  lines.push('(re-run this driver after completing the step; it verifies artifacts and prints the next one)')
  lines.push('')
  lines.push('## Step: ' + title)
  lines.push('Read only: ' + readOnlyList.join(', '))
  lines.push('Doctrine: spec/doctrine/mocks.md § ' + doctrineSection)
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
  printStepBlock('SHAPES', 'pick a shape — 2 to 3 candidates, one wins',
    ['design/mocks/seed.md', 'design/shapes/*.html', 'design/mocks/ledger.md'],
    'Mocks: State Machine', openRowsLine(),
    [driverCmd('--mark shape-picked --shape <kebab>')])
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
        'Mocks: State Machine', journeysProgressLine(journeys),
        [driverCmd('--mark journey-drawn --journey ' + jn)])
      return
    }
  }
  for (const [jn] of journeys) {
    const st = status.journeys[jn]
    if (!st.approved) {
      printStepBlock('WIREFRAMES', 'approve journey ' + jn + ' — look, then approve',
        ['design/mocks/ledger.md'],
        'Mocks: State Machine', journeysProgressLine(journeys),
        [driverCmd('--mark journey-approved --journey ' + jn)])
      return
    }
  }
}

function printThemeStep() {
  const composed = Object.keys(status.directions || {})
  if (composed.length < 2) {
    const title = composed.length === 0
      ? 'compose theme directions — derive 2-3 candidates from the seed, then ASK which to compose'
      : 'compose another theme direction — at least 2 are required before a pick'
    printStepBlock('THEME', title,
      ['design/mocks/seed.md', 'design/mocks/canon.md', 'design/mocks/references/', 'docs/design/research-brief.md'],
      'Mocks: State Machine', 'directions composed: ' + (composed.join(', ') || 'none'),
      [driverCmd('--mark direction-composed --direction <kebab>')])
    return
  }
  printStepBlock('THEME', 'pick the theme — reject every other composed direction by name',
    ['design/mocks/seed.md', 'design/mocks/ledger.md'],
    'Mocks: State Machine', 'composed: ' + composed.join(', '),
    [driverCmd('--mark theme-picked --direction <kebab>')])
}

function printSkinStep() {
  const journeys = currentSeedJourneys()
  for (const [jn, j] of journeys) {
    const st = status.journeys[jn]
    if (!st || !st.skinned) {
      printStepBlock('SKIN', 'skin journey ' + jn + ' — theme tokens only, no wire/ links left',
        j.labels.map((l) => 'design/mocks/' + l + '.html').concat(['design/tokens.css']),
        'Mocks: State Machine', journeysProgressLine(journeys),
        [driverCmd('--mark journey-skinned --journey ' + jn)])
      return
    }
  }
}

function printReviewStep() {
  if (!status.marks.reviewOpened) {
    printStepBlock('REVIEW', 'open review — name the decider',
      ['design/mocks/ledger.md'], 'Mocks: State Machine', '',
      [driverCmd('--mark review-opened --decider "<name>"')])
    return
  }
  const journeys = currentSeedJourneys()
  for (const [jn, j] of journeys) {
    const st = status.journeys[jn]
    if (!st || !st.reviewed) {
      printStepBlock('REVIEW', 'review journey ' + jn + ' with ' + status.decider,
        j.labels.map((l) => 'design/mocks/' + l + '.html'), 'Mocks: State Machine', '',
        [driverCmd('--mark journey-reviewed --journey ' + jn)])
      return
    }
  }
  printStepBlock('REVIEW', 'sign off — approval of understanding, not of scope',
    ['design/mocks/*.html'], 'Mocks: State Machine', '',
    [driverCmd('--mark approved')])
}

function printApprovedTerminal() {
  writeOut(1, '[mocks-driver] state: APPROVED  root: ' + root + '\n\n## Step: done — every screen approved and reviewed\nnext: /spec:genesis\n')
  process.exit(0)
}

function doBareStep() {
  const state = deriveState()
  if (['SHAPES', 'WIREFRAMES', 'THEME', 'SKIN'].includes(state) && status.look !== 'browser' && !probeOk()) {
    dieProbeFailed()
  }
  if (state === 'SEED') return printSeedStep()
  if (state === 'SHAPES') return printShapesStep()
  if (state === 'WIREFRAMES') return printWireframesStep()
  if (state === 'THEME') return printThemeStep()
  if (state === 'SKIN') return printSkinStep()
  if (state === 'REVIEW') return printReviewStep()
  return printApprovedTerminal()
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------
if (rest[0] === 'ledger') {
  cmdLedger(rest[1], rest.slice(2))
} else if (rest[0] === 'look-probe') {
  cmdLookProbe()
} else if (rest[0] === 'look-via') {
  cmdLookVia(rest[1])
} else if (rest[0] === 'look') {
  cmdLook(rest[1], rest.slice(2))
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
      decider: flagArg(rest, '--decider'),
    })
  } else if (STATE_ONLY) {
    writeOut(1, deriveState() + '\n')
    process.exit(0)
  } else {
    doBareStep()
  }
}
