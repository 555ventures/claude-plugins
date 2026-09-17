#!/usr/bin/env node
// mocks-driver.js [--root <dir>] [--state]
// mocks-driver.js --root <dir> --mark seed-done|shell-drawn|journey-drawn|journey-approved|theme-picked|approved [--journey <j>]
// mocks-driver.js --root <dir> --reopen journey:<j>|shell|theme
// mocks-driver.js --root <dir> ledger (add|set|catch|check|counts) [flags]
// mocks-driver.js --root <dir> client open | client waive --journey <j> --reason <r>
//
// WHY: specs/20260914/01-the-mock-contract-and-the-driver.md (ADR-0028) — `/spec:mocks` drives a
// greenfield product's own Vite + React + shadcn app instead of gray HTML wireframes. This driver
// derives SEED -> SHELL -> SCREENS -> THEME -> CLIENT -> APPROVED on every invocation from
// design/mocks/status.json (schemaVersion 2) plus the reviewer package's own `check --json`,
// `design/notes.json` and `design/approval.json` — never from a second, hand-rolled read of any
// of those three. `lib/mock-cli.js` is the only caller of the package (`@555-ventures/mock-review`); this
// driver never spawns it directly. The provenance ledger (spec/scripts/lib/mocks-ledger.js) and
// its verbs/gate are kept verbatim (D16) — this file is the only thing rewritten.
//
// D3: SEED until `marks.seedDone` (no run spawns the package while it is null — `contractOrDie`
// first runs at `--mark seed-done`); SHELL until `marks.shellDrawn`; SCREENS until every journey
// the seed declares (`### <journey>` blocks, in seed order, via lib/surfaces.js's
// `parseSeedJourneys`) is both drawn and approved — a journey added to the seed mid-SCREENS
// reopens the state; THEME until `marks.themePicked`; CLIENT until `marks.approved`; then
// APPROVED. A status.json carrying `schemaVersion: 1` refuses outright (ADR-0028: no host holds
// data on the old path) rather than being reinterpreted.
//
// D4: the SEED step block prints the scaffold command, the install line and one `cp` line per
// template file (spec/templates/mock/*), verbatim and in that order; `--mark seed-done` refuses
// on a missing `## Records` entity file or a missing `mock.config.ts`, never asks the user for
// data. D5: `--mark shell-drawn` refuses on an error-severity `check --json` finding, else
// accepts (warn findings never refuse) once some shell carries a non-empty `examples` list. D6:
// `--mark journey-drawn` refuses an out-of-seed `--journey`, a journey `check --json` does not
// list, or an unresolved edge; it runs no ledger gate. D7: `--mark journey-approved` walks the
// approvedAt/screen/notes/project-note/journey-thread chain before running the ledger gate and
// recording. D8: `--mark theme-picked` refuses until `mock.config.ts`'s applied theme matches the
// page's pick. D9: `--mark approved` refuses on any journey lacking a client verdict or any note
// not resolved the way its kind requires; `client open` prints the served URL with the client
// token, `client waive` is the only write this driver makes to `approval.json`. D10: `--reopen`
// clears marks (and cascades — a shell reopen invalidates the theme and every approval; a re-
// picked theme invalidates every approval too) and appends one `reopens` row; it never deletes a
// file. D11: every retired verb refuses (exit 2) with a one-line replacement, checked before
// anything else runs — a retired verb spawns nothing and touches no file. D12: SHELL, SCREENS and
// THEME print the mock-authoring skill line; SEED, CLIENT and APPROVED never do. D16: the ledger
// subcommand and the `gateVerdict` calls before seed-done/journey-approved/theme-picked/approved
// keep their exact flags, output and exit codes — the ledger is a plain text file, untouched by
// the package.
//
// What this deliberately does NOT do:
//   - author the seed, the shell, screens, theme candidates, or run the scaffold itself — those
//     stay session judgment; this driver only closes each mark once `check --json` and the
//     reviewer's own JSON files agree the artifact is there.
//   - read `sweep` — the driver reads `check --json`, `design/notes.json` and
//     `design/approval.json` only; the sweep is the session's own loop (Behavior).
//   - write into the host's `src/` (the theme pick is applied by the session editing one config
//     line, D8) or delete a file on `--reopen` (marks are cleared, disk is never touched).
//   - relocate the session CWD, or migrate a legacy status.json (a schemaVersion 1 host refuses
//     outright — there is nothing to migrate to, ADR-0028).
//   - hand-write a ledger row: `ledger add/set/catch` are the only writers of
//     design/mocks/ledger.md, routed through spec/scripts/lib/mocks-ledger.js exactly as before.
//
// Exit codes:
//   0  a bare invocation printed the current step (or `--state` printed the state name), an
//      accepted `--mark` recorded its result, a `--reopen` printed what it invalidated, a ledger
//      subcommand succeeded, `client open` printed the served URL, or `client waive` recorded a
//      waiver.
//   1  `ledger check` found a blocked gate (rows printed).
//   2  a refused mark (an unknown or retired mark, or a failed D3-D9 precondition), a
//      `contractOrDie`/spawn refusal (a `contractVersion` mismatch or no `mock-review` reachable),
//      a shape-invalid `check`/`contract` response, a schemaVersion 1 status.json, an unknown
//      `--reopen`/`ledger`/`client` subcommand, `ledger check` grammar errors, or any retired verb
//      (D11).

'use strict'
const fs = require('fs')
const path = require('path')
const { writeOut } = require('./lib/driver-io')
const { parseLedger, gateVerdict, countsLine, appendAssumption, appendCatch, setStatus } = require('./lib/mocks-ledger')
const { parseSeedJourneys } = require('./lib/surfaces')
const { contractOrDie, checkJson, loadContract } = require('./lib/mock-cli')

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
  die('--root ' + root + ' is not a directory — remedy: pass a real project root, or omit --root to use the current directory')
}

const mocksDir = path.join(root, 'design/mocks')
const statusPath = path.join(mocksDir, 'status.json')
const ledgerPath = path.join(mocksDir, 'ledger.md')
const seedPath = path.join(mocksDir, 'seed.md')
const templatesRoot = path.join(__dirname, '..', 'templates')
const mockTemplatesDir = path.join(templatesRoot, 'mock')

// D4: source file -> destination relative to the app dir, in the order the SEED block prints
// them. Both examples land under design/examples/ — outside every contract host glob (D4) — never
// under src/.
const TEMPLATE_FILES = [
  { src: 'mock.config.ts', dest: 'mock.config.ts' },
  { src: 'journeys.ts', dest: 'src/journeys.ts' },
  { src: 'screen.example.tsx', dest: 'design/examples/screen.example.tsx' },
  { src: 'records.example.ts', dest: 'design/examples/records.example.ts' },
]

const SKILL_LINE = 'Skill: mock-authoring — load it before the first edit'

// ---------------------------------------------------------------------------
// D11: retired verbs refuse before anything else — no status load, no spawn, no write. Checked
// first so a stale command in a doctrine file or a memory fails loudly with the new spelling.
// ---------------------------------------------------------------------------
function checkRetired() {
  if (rest[0] === 'notes') {
    die('notes are read with `npx mock-review sweep` and answered with `npx mock-review answer`')
  }
  if (rest[0] === 'stop') {
    die('approvals are recorded on the served page')
  }
  if (rest[0] === 'theme' && ['state', 'compose', 'shortlist'].includes(rest[1])) {
    die('author `src/themes/<k>.css`, pick on the page, then `--mark theme-picked`')
  }
  if (rest[0] === 'look' || rest[0] === 'look-probe' || rest[0] === 'look-via') {
    die('npx mock-review check --look <screen>')
  }
  if (rest.includes('--refresh-register')) {
    die('--refresh-register is retired (ADR-0028)')
  }
  if (rest[0] === '--mark' && ['kit-signed', 'shape-picked', 'canon-written'].includes(rest[1])) {
    die('--mark ' + rest[1] + ' is retired (ADR-0028)')
  }
  if (rest[0] === 'ledger' && rest[1] === 'derive') {
    die('ledger derive is retired (ADR-0028)')
  }
  if (rest[0] === 'client' && rest[1] === 'log') {
    die('client log is retired (ADR-0028)')
  }
  if (rest[0] === '--reopen' && ['kit', 'shapes'].includes(rest[1])) {
    die('--reopen ' + rest[1] + ' is retired (ADR-0028)')
  }
}
checkRetired()

// ---------------------------------------------------------------------------
// status.json (schemaVersion 2).
// ---------------------------------------------------------------------------
function freshStatus() {
  return {
    schemaVersion: 2, state: 'SEED', app: 'app',
    marks: { seedDone: null, shellDrawn: null, themePicked: null, approved: null },
    journeys: {}, reopens: [], lastUpdated: null,
  }
}

function loadStatus() {
  if (!fs.existsSync(statusPath)) {
    fs.mkdirSync(mocksDir, { recursive: true })
    if (!fs.existsSync(ledgerPath)) fs.copyFileSync(path.join(templatesRoot, 'mocks-ledger.md'), ledgerPath)
    if (!fs.existsSync(seedPath)) fs.copyFileSync(path.join(templatesRoot, 'mocks-seed.md'), seedPath)
    const f = freshStatus()
    fs.writeFileSync(statusPath, JSON.stringify(f, null, 2) + '\n')
    return f
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
  } catch (e) {
    die('design/mocks/status.json is not valid JSON (' + e.message + ') — remedy: restore it from git history, or delete it (a fresh root is a valid starting point) and re-run')
    return null // unreachable
  }
  if (raw.schemaVersion !== 2) {
    die('design/mocks/status.json carries schemaVersion ' + raw.schemaVersion +
      ' — remedy: rm design/mocks/status.json — no host holds data on the old path (ADR-0028)')
  }
  raw.marks = Object.assign({}, freshStatus().marks, raw.marks || {})
  raw.journeys = Object.assign({}, raw.journeys || {})
  raw.reopens = Array.isArray(raw.reopens) ? raw.reopens : []
  return raw
}

let status = loadStatus()

function appDir() { return path.join(root, status.app) }

function saveStatus() {
  status.schemaVersion = 2
  status.state = deriveState()
  status.lastUpdated = nowIso()
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// seed.md — the journey set (D3): `### <journey>` blocks, in seed order, via lib/surfaces.js.
// ---------------------------------------------------------------------------
function seedTextOrNull() {
  try { return fs.readFileSync(seedPath, 'utf8') } catch { return null }
}
function currentSeedJourneys() { return parseSeedJourneys(seedTextOrNull()) }

function sectionOf(text, name) {
  const re = new RegExp('^## ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')
  const m = re.exec(text)
  if (!m) return null
  const rest2 = text.slice(m.index + m[0].length)
  const next = rest2.search(/^## /m)
  return next === -1 ? rest2 : rest2.slice(0, next)
}

// D4/deviations sidecar: `## Records` carries one bare `- <entity>` line per entity; returns null
// when the section itself is missing (never when it is merely empty).
function parseRecordEntities(text) {
  const sec = sectionOf(text, 'Records')
  if (sec === null) return null
  const out = []
  for (const raw of sec.split('\n')) {
    const m = raw.trim().match(/^- ([a-z0-9-]+)\s*$/)
    if (m) out.push(m[1])
  }
  return out
}

// ---------------------------------------------------------------------------
// Ledger I/O — lib/mocks-ledger.js is the one writer (D16, verbatim).
// ---------------------------------------------------------------------------
function ledgerTextOrDie() {
  try { return fs.readFileSync(ledgerPath, 'utf8') } catch {
    die('design/mocks/ledger.md does not exist — remedy: run the driver once with --root ' + root + ' to create it')
    return null // unreachable
  }
}

// D16: seed-done, journey-approved, theme-picked and approved all run this before recording —
// the remedy names the exact blocking row so a session never has to look the id up itself.
function requireGateOpen() {
  const parsed = parseLedger(ledgerTextOrDie())
  if (parsed.errors.length) {
    die('design/mocks/ledger.md has grammar error(s): ' + parsed.errors.map((e) => e.message).join('; ') + ' — remedy: fix the ledger and re-run')
  }
  const verdict = gateVerdict(parsed)
  if (!verdict.open) {
    const remedies = verdict.blocking.map((b) =>
      b.id + ' ' + b.tag + ' ' + b.status +
      ' — remedy: `ledger set --id ' + b.id + ' --status confirmed --tag said-by-user` (or `--status overridden`)'
    ).join('; ')
    die('provenance ledger is blocked: ' + remedies)
  }
}

// ---------------------------------------------------------------------------
// The app-side reviewer files (D1 host layout): design/notes.json, design/approval.json.
// ---------------------------------------------------------------------------
function readNotesRaw() {
  try { return JSON.parse(fs.readFileSync(path.join(appDir(), 'design/notes.json'), 'utf8')) } catch (e) {
    die('design/notes.json is not valid JSON (' + e.message + ') — remedy: restore it from git history, or delete it (no notes is a valid starting point) and re-run')
    return null // unreachable
  }
}
function readApprovalRaw() {
  try { return JSON.parse(fs.readFileSync(path.join(appDir(), 'design/approval.json'), 'utf8')) } catch (e) {
    die('design/approval.json is not valid JSON (' + e.message + ') — remedy: restore it from git history, or delete it (no approval is a valid starting point) and re-run')
    return null // unreachable
  }
}
function writeApprovalRaw(obj) {
  fs.writeFileSync(path.join(appDir(), 'design/approval.json'), JSON.stringify(obj, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// D3: state derivation — the only place SEED/SHELL/SCREENS/THEME/CLIENT/APPROVED is decided.
// ---------------------------------------------------------------------------
function deriveState() {
  if (!status.marks.seedDone) return 'SEED'
  if (!status.marks.shellDrawn) return 'SHELL'
  for (const [name] of currentSeedJourneys()) {
    const st = status.journeys[name]
    if (!st || !st.drawn || !st.approved) return 'SCREENS'
  }
  if (!status.marks.themePicked) return 'THEME'
  if (!status.marks.approved) return 'CLIENT'
  return 'APPROVED'
}

// ---------------------------------------------------------------------------
// spec/doctrine/mocks.md § Mocks: Checkpoint contract (D13, unchanged, binding): every accepted
// `--mark` prints, as its last two non-blank lines, the ledger's counts line and the checkpoint
// line naming the derived state before and after the mark — the sole signal that disk, not chat
// context, is now the source of truth.
// ---------------------------------------------------------------------------
function printAcceptedTail(prevState, nextState) {
  const parsed = parseLedger(ledgerTextOrDie())
  writeOut(1, countsLine(parsed) + '\n')
  writeOut(1, '✅ checkpoint — mocks state saved (' + prevState + ' → ' + nextState + '); safe to /clear and re-run /spec:mocks\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// --mark seed-done (D4).
// ---------------------------------------------------------------------------
function cmdSeedDone() {
  contractOrDie(appDir())
  const prevState = deriveState()
  const seedText = seedTextOrNull() || ''
  const entities = parseRecordEntities(seedText)
  if (entities === null) {
    die('design/mocks/seed.md is missing "## Records" — remedy: add one "- <entity>" line per entity the product handles, then write app/src/records/<entity>.ts for each')
  }
  for (const entity of entities) {
    const rel = path.posix.join(status.app, 'src/records', entity + '.ts')
    if (!fs.existsSync(path.join(root, status.app, 'src/records', entity + '.ts'))) {
      die('design/mocks/seed.md ## Records names "' + entity + '" but ' + rel + ' does not exist — remedy: write ' + rel)
    }
  }
  // deriveState's SCREENS loop iterates the seed's journeys, so a seed that declares none makes
  // SCREENS unreachable — the mock would walk straight to APPROVED with no screen ever drawn.
  // Refuse here rather than let an empty journey set read as a satisfied one.
  if (parseSeedJourneys(seedText).size === 0) {
    die('design/mocks/seed.md declares no journeys — remedy: add one "### <journey>" block per journey the product supports under "## Journeys", then re-run `--mark seed-done`')
  }
  if (!fs.existsSync(path.join(appDir(), 'mock.config.ts'))) {
    const rel = path.posix.join(status.app, 'mock.config.ts')
    die(rel + ' does not exist — remedy: cp "$(spec-paths templates)"/mock/mock.config.ts ' + rel)
  }
  requireGateOpen()
  status.marks.seedDone = nowIso()
  saveStatus()
  writeOut(1, '✅ seed-done recorded\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --mark shell-drawn (D5).
// ---------------------------------------------------------------------------
function cmdShellDrawn() {
  contractOrDie(appDir())
  const prevState = deriveState()
  const check = checkJson(appDir())
  if (!check.ok) {
    const errs = (check.findings || []).filter((f) => f.severity === 'error')
    die((errs.map((f) => f.file + ': ' + f.message).join('; ') || 'check --json reports ok:false') +
      ' — remedy: fix the finding(s) above, then re-run `--mark shell-drawn`')
  }
  const hasExamples = (check.shells || []).some((s) => Array.isArray(s.examples) && s.examples.length > 0)
  if (!hasExamples) {
    die('no shell in check --json carries a non-empty examples list — remedy: add an example to a shell in src/, then re-run `--mark shell-drawn`')
  }
  status.marks.shellDrawn = nowIso()
  saveStatus()
  writeOut(1, '✅ shell-drawn recorded\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --mark journey-drawn --journey <j> (D6) — no ledger gate.
// ---------------------------------------------------------------------------
function cmdJourneyDrawn(journeyArg) {
  contractOrDie(appDir())
  if (!journeyArg) die('--mark journey-drawn needs --journey <j> — remedy: --mark journey-drawn --journey <j>')
  const prevState = deriveState()
  const seedJourneys = currentSeedJourneys()
  if (!seedJourneys.has(journeyArg)) {
    die('--journey ' + journeyArg + ' is not declared in design/mocks/seed.md — remedy: use one of the seed journeys: ' + [...seedJourneys.keys()].join(', '))
  }
  const check = checkJson(appDir())
  const cj = (check.journeys || []).find((j) => j.id === journeyArg)
  if (!cj) {
    die('check --json lists no journey with id ' + journeyArg + ' — remedy: add journey ' + journeyArg + ' to src/journeys.ts')
  }
  if (!cj.resolved) {
    const lines = (cj.unresolved || []).map((u) => 'step ' + u.from + ' → ' + u.to + ': ' + u.reason)
    die('journey ' + journeyArg + ' has unresolved edge(s):\n' + lines.join('\n') +
      '\nremedy: resolve the edge(s) in src/journeys.ts, then re-run `--mark journey-drawn --journey ' + journeyArg + '`')
  }
  status.journeys[journeyArg] = status.journeys[journeyArg] || { drawn: null, approved: null }
  status.journeys[journeyArg].drawn = nowIso()
  saveStatus()
  writeOut(1, '✅ journey-drawn recorded for ' + journeyArg + '\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --mark journey-approved --journey <j> (D7).
// ---------------------------------------------------------------------------
function cmdJourneyApproved(journeyArg) {
  contractOrDie(appDir())
  if (!journeyArg) die('--mark journey-approved needs --journey <j> — remedy: --mark journey-approved --journey <j>')
  const prevState = deriveState()
  const check = checkJson(appDir())
  const cj = (check.journeys || []).find((j) => j.id === journeyArg)
  if (!cj) die('check --json lists no journey with id ' + journeyArg + ' — remedy: add journey ' + journeyArg + ' to src/journeys.ts')
  const approval = readApprovalRaw()
  const jApproval = (approval.journeys && approval.journeys[journeyArg]) || {}
  if (!jApproval.approvedAt) {
    die('approval.journeys["' + journeyArg + '"].approvedAt is missing — remedy: approve the journey on the served page (`npx mock-review serve`), then re-run `--mark journey-approved --journey ' + journeyArg + '`')
  }
  const screens = (cj.steps || []).map((s) => s.screen)
  for (const screen of screens) {
    const sApproval = (approval.screens && approval.screens[screen]) || {}
    if (!sApproval.approvedAt) {
      die('screen "' + screen + '" (a step on journey ' + journeyArg + ') is missing approval.screens["' + screen + '"].approvedAt — remedy: approve it on the served page (`npx mock-review serve`), then re-run `--mark journey-approved --journey ' + journeyArg + '`')
    }
  }
  const notes = readNotesRaw()
  const openOnScreen = (notes.notes || []).find((n) => n.status === 'open' && screens.includes(n.screen))
  if (openOnScreen) {
    die('note ' + openOnScreen.id + ' is open on screen "' + openOnScreen.screen + '" — remedy: resolve it (`npx mock-review answer`), then re-run `--mark journey-approved --journey ' + journeyArg + '`')
  }
  const openProject = (notes.notes || []).find((n) => n.project === true && n.status === 'open')
  if (openProject) {
    die('project note ' + openProject.id + ' is open — remedy: resolve it (`npx mock-review answer`), then re-run `--mark journey-approved --journey ' + journeyArg + '`')
  }
  const journeyThread = (notes.journeys && notes.journeys[journeyArg]) || {}
  if (journeyThread.status === 'open') {
    die('the conversation on journey ' + journeyArg + ' is still open — remedy: resolve it (`npx mock-review answer`), then re-run `--mark journey-approved --journey ' + journeyArg + '`')
  }
  requireGateOpen()
  status.journeys[journeyArg] = status.journeys[journeyArg] || { drawn: null, approved: null }
  status.journeys[journeyArg].approved = nowIso()
  saveStatus()
  writeOut(1, '✅ journey-approved recorded for ' + journeyArg + '\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --mark theme-picked (D8).
// ---------------------------------------------------------------------------
function cmdThemePicked() {
  contractOrDie(appDir())
  const prevState = deriveState()
  const approval = readApprovalRaw()
  const k = approval.theme
  if (!k) die('approval.theme is missing — remedy: pick a theme on the served page (`npx mock-review serve`), then re-run `--mark theme-picked`')
  const check = checkJson(appDir())
  if (!check.config || check.config.theme !== k) {
    die('remedy: set theme: "' + k + '" in mock.config.ts')
  }
  if (!Array.isArray(check.themes) || !check.themes.includes(k)) {
    die('theme "' + k + '" is not listed under check --json\'s themes — remedy: author src/themes/' + k + '.css, then re-run `--mark theme-picked`')
  }
  requireGateOpen()
  status.marks.themePicked = nowIso()
  saveStatus()
  writeOut(1, '✅ theme-picked recorded\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --mark approved (D9).
// ---------------------------------------------------------------------------
function cmdApproved() {
  contractOrDie(appDir())
  const prevState = deriveState()
  const approval = readApprovalRaw()
  for (const [name] of currentSeedJourneys()) {
    const jApproval = (approval.journeys && approval.journeys[name]) || {}
    if (jApproval.client !== 'ok' && jApproval.client !== 'waived') {
      die('journey "' + name + '" has no recorded client verdict — remedy: client waive --journey <j> --reason <r>')
    }
  }
  const notes = readNotesRaw()
  const openNote = (notes.notes || []).find((n) => n.status === 'open')
  if (openNote) die('note ' + openNote.id + ' is open — remedy: resolve it (`npx mock-review answer`), then re-run `--mark approved`')
  const badProject = (notes.notes || []).find((n) => n.project === true && n.status !== 'approved')
  if (badProject) die('project note ' + badProject.id + ' is not approved — remedy: resolve it (`npx mock-review answer`), then re-run `--mark approved`')
  requireGateOpen()
  status.marks.approved = nowIso()
  saveStatus()
  writeOut(1, '✅ approved recorded\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --reopen journey:<j>|shell|theme (D10). kit/shapes are handled by checkRetired above.
// ---------------------------------------------------------------------------
function cmdReopen(target) {
  const at = nowIso()
  if (target === 'shell') {
    const cleared = ['shellDrawn', 'themePicked', 'approved']
    status.marks.shellDrawn = null
    status.marks.themePicked = null
    status.marks.approved = null
    for (const j of Object.keys(status.journeys)) status.journeys[j].approved = null
    status.reopens.push({ at, target: 'shell', cleared })
    saveStatus()
    writeOut(1, '↩ reopened shell — cleared: ' + cleared.join(', ') + '\n')
    process.exit(0)
  }
  if (target === 'theme') {
    const cleared = ['themePicked', 'approved']
    status.marks.themePicked = null
    status.marks.approved = null
    status.reopens.push({ at, target: 'theme', cleared })
    saveStatus()
    writeOut(1, '↩ reopened theme — cleared: ' + cleared.join(', ') + '\n')
    process.exit(0)
  }
  if (target && target.startsWith('journey:')) {
    const j = target.slice('journey:'.length)
    const cleared = ['approved', 'approved(all)']
    if (status.journeys[j]) status.journeys[j].approved = null
    status.marks.approved = null
    status.reopens.push({ at, target, cleared })
    saveStatus()
    writeOut(1, '↩ reopened ' + target + ' — cleared: ' + cleared.join(', ') + '\n')
    process.exit(0)
  }
  die('--reopen must be journey:<j>, shell, or theme — remedy: --reopen journey:<j>|shell|theme')
}

// ---------------------------------------------------------------------------
// ledger subcommand (D16, verbatim over the mock-app host).
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
    } catch (e) { die('ledger add: ' + e.message + ' — remedy: fix the `ledger add` flags (--id/--step/--kind/--claim/--tag/--status) and re-run') }
    fs.writeFileSync(ledgerPath, out)
    process.exit(0)
  }
  if (sub === 'set') {
    let out
    try { out = setStatus(ledgerTextOrDie(), larg('--id'), larg('--status'), larg('--tag')) } catch (e) { die('ledger set: ' + e.message + ' — remedy: fix the `ledger set` flags (--id/--status/--tag) and re-run') }
    fs.writeFileSync(ledgerPath, out)
    process.exit(0)
  }
  if (sub === 'catch') {
    let out
    try {
      out = appendCatch(ledgerTextOrDie(), { id: larg('--id'), what: larg('--what'), step: larg('--step'), cost: larg('--cost'), note: larg('--note') })
    } catch (e) { die('ledger catch: ' + e.message + ' — remedy: fix the `ledger catch` flags (--id/--what/--step/--cost) and re-run') }
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
    writeOut(1, countsLine(parsed) + '\n')
    process.exit(0)
  }
  die('ledger: unknown subcommand "' + sub + '" — remedy: use one of: add, set, catch, check, counts')
}

// ---------------------------------------------------------------------------
// client open | client waive (D9).
// ---------------------------------------------------------------------------
function cmdClientOpen() {
  contractOrDie(appDir())
  const state = deriveState()
  if (state !== 'CLIENT') die('client open only runs in CLIENT (current state: ' + state + ') — remedy: re-run `node ' + __filename + ' --root ' + root + '` bare and complete the printed step until state reaches CLIENT')
  const check = checkJson(appDir())
  if (!check.serve || check.serve.url === null) die('remedy: npx mock-review serve')
  const token = check.config && check.config.client && check.config.client.token
  writeOut(1, check.serve.url + '/?client=' + token + '\n')
  process.exit(0)
}

function cmdClientWaive(journeyArg, reason) {
  if (!journeyArg) die('client waive needs --journey <j> — remedy: client waive --journey <j> --reason <r>')
  if (!reason) die('client waive needs --reason <r> — remedy: client waive --journey <j> --reason <r>')
  const approval = readApprovalRaw()
  approval.journeys = approval.journeys || {}
  approval.journeys[journeyArg] = Object.assign({}, approval.journeys[journeyArg], {
    client: 'waived', reason, at: nowIso(),
  })
  writeApprovalRaw(approval)
  writeOut(1, '✅ client waive recorded for ' + journeyArg + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Bare-invocation step printer — one step block per run.
// ---------------------------------------------------------------------------
function driverCmd(extra) { return 'node ' + __filename + ' --root ' + root + ' ' + extra }

function printStepBlock(state, title, readOnlyList, doctrineSection, thenLines, withSkill) {
  const lines = []
  lines.push('[mocks-driver] state: ' + state + '  root: ' + root)
  lines.push('(re-run this driver after completing the step; it verifies artifacts and prints the next one)')
  lines.push('')
  lines.push('## Step: ' + title)
  lines.push('Read only: ' + readOnlyList.join(', '))
  lines.push('Doctrine: spec/doctrine/mocks.md § ' + doctrineSection)
  if (withSkill) lines.push(SKILL_LINE)
  lines.push('Then:')
  for (const t of thenLines) lines.push('  ' + t)
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function printSeedStep() {
  const lines = []
  lines.push('[mocks-driver] state: SEED  root: ' + root)
  lines.push('(re-run this driver after completing the step; it verifies artifacts and prints the next one)')
  lines.push('')
  lines.push('## Step: seed the product — scaffold the app, then declare records')
  lines.push('Read only: design/mocks/seed.md')
  lines.push('Doctrine: spec/doctrine/mocks.md § Mocks: Seed')
  lines.push('')
  lines.push('npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s')
  lines.push('cd app && npm i -D ' + loadContract().package)
  for (const f of TEMPLATE_FILES) {
    lines.push('cp "$(spec-paths templates)"/mock/' + f.src + ' app/' + f.dest)
  }
  lines.push('')
  lines.push('Once every "## Records" entity in design/mocks/seed.md has a matching app/src/records/<entity>.ts and app/mock.config.ts exists, run:')
  lines.push('  ' + driverCmd('--mark seed-done'))
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function printShellStep() {
  printStepBlock('SHELL', 'draw the shell — one component, every screen imports it',
    ['design/mocks/seed.md'],
    'Mocks: State Machine',
    [driverCmd('--mark shell-drawn')],
    true)
}

function printScreensStep(journeys) {
  for (const [name] of journeys) {
    const st = status.journeys[name]
    if (!st || !st.drawn) {
      printStepBlock('SCREENS', 'draw journey ' + name,
        ['design/mocks/seed.md (### ' + name + ')'],
        'Mocks: State Machine',
        [driverCmd('--mark journey-drawn --journey ' + name)],
        true)
      return
    }
  }
  for (const [name] of journeys) {
    const st = status.journeys[name]
    if (!st.approved) {
      printStepBlock('SCREENS', 'approve journey ' + name,
        ['design/notes.json', 'design/approval.json'],
        'Mocks: State Machine',
        [driverCmd('--mark journey-approved --journey ' + name)],
        true)
      return
    }
  }
}

function printThemeStep() {
  printStepBlock('THEME', 'pick a theme',
    ['mock.config.ts'],
    'Mocks: State Machine',
    ['author two src/themes/<k>.css candidates',
      'pick a theme on the served page, then set theme: "<k>" in mock.config.ts',
      driverCmd('--mark theme-picked')],
    true)
}

function printClientStep() {
  printStepBlock('CLIENT', 'walk the client role',
    ['design/approval.json'],
    'Mocks: Client Player',
    [driverCmd('client open'), driverCmd('--mark approved')],
    false)
}

function printApprovedStep() {
  writeOut(1, '[mocks-driver] state: APPROVED  root: ' + root + '\nmocks are approved — nothing further to do.\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------
// D16: the ledger subcommand is a plain text-file operation, untouched by the package — dispatch
// it before any contract check, exactly like the "while seedDone is null no run spawns the
// package" carve-out below.
if (rest[0] === 'ledger') {
  cmdLedger(rest[1], rest.slice(2))
}

// D3: from --mark seed-done on, a contractOrDie refusal precedes every other refusal in a run;
// `--mark seed-done` itself runs contractOrDie as its own first step (below), so this generic
// gate only fires for every OTHER command once seedDone is already recorded.
if (status.marks.seedDone) contractOrDie(appDir())

if (rest.includes('--state')) {
  writeOut(1, deriveState() + '\n')
  process.exit(0)
}

if (rest[0] === '--reopen') {
  cmdReopen(rest[1])
}

if (rest[0] === '--mark') {
  const mark = rest[1]
  const journeyArg = flagArg(rest, '--journey')
  if (mark === 'seed-done') cmdSeedDone()
  else if (mark === 'shell-drawn') cmdShellDrawn()
  else if (mark === 'journey-drawn') cmdJourneyDrawn(journeyArg)
  else if (mark === 'journey-approved') cmdJourneyApproved(journeyArg)
  else if (mark === 'theme-picked') cmdThemePicked()
  else if (mark === 'approved') cmdApproved()
  else die('--mark ' + mark + ' is unknown — remedy: --mark seed-done|shell-drawn|journey-drawn|journey-approved|theme-picked|approved')
}

if (rest[0] === 'client') {
  if (rest[1] === 'open') cmdClientOpen()
  else if (rest[1] === 'waive') cmdClientWaive(flagArg(rest, '--journey'), flagArg(rest, '--reason'))
  else die('client: unknown subcommand "' + rest[1] + '" — remedy: use `client open` or `client waive --journey <j> --reason <r>`')
}

// Bare run: print exactly one step block for the current state.
const state = deriveState()
if (state === 'SEED') printSeedStep()
else if (state === 'SHELL') printShellStep()
else if (state === 'SCREENS') printScreensStep(currentSeedJourneys())
else if (state === 'THEME') printThemeStep()
else if (state === 'CLIENT') printClientStep()
else printApprovedStep()
