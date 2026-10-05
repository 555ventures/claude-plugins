#!/usr/bin/env node
// prototype-driver.js <brief path> [--root <dir>] [--state]
// prototype-driver.js <brief path> [--root <dir>] --mark opened|round-done|approved|frozen
// prototype-driver.js <brief path> [--root <dir>] --mark tests-derived [--tier standard|critical]
// prototype-driver.js <brief path> [--root <dir>] serve --port <n>
// prototype-driver.js <brief path> [--root <dir>] check [--json]
// prototype-driver.js check [--root <dir>] [--json]   (brief-less: doctor check 23's own
//   invocation has no brief — a host-wide config check needs none)
//
// WHY: specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D2-D5/D8, extended by
// specs/20260928/02-freeze-export-and-the-contract.md D3-D8 — /spec:prototype derives
// OPEN -> ROUND -> APPROVED -> TESTS -> CLOSED from design/prototypes/<stem>/status.json plus
// disk and the host's declared `prototype` config block (spec/templates/grounding-contract.md),
// the way genesis-driver.js and mocks-driver.js derive their own state machines. The brief STEM
// is the brief path's basename without extension; branch `proto/<stem>`; worktree
// `.claude/worktrees/proto-<stem>` (created through merge-back.sh create, which owns the
// worktree path and the .worktreeinclude manifest); status/pins/states/contract all live under
// `design/prototypes/<stem>/` in the MAIN working tree, never on the prototype branch (ADR-0030 h
// — nothing on proto/* is read after close). The freeze's own step primitives (gate, composite
// discovery, capture, contract/spec write, export, deletion, ledger) live in lib/freeze.js — this
// file owns only the ordering, status.json/marks bookkeeping, and the printed steps.
//
// D3: OPEN while marks.opened is unset OR the worktree is absent from `git worktree list
// --porcelain`; ROUND while opened and not yet approved; APPROVED once marks.approved but not yet
// frozen; TESTS once frozen but not yet closed; CLOSED once marks.closed (checked FIRST in
// deriveState, before the worktree-registration probe — by CLOSED the worktree is gone). `--mark
// opened` refuses a stale branch (proto/<stem> exists, status.json absent), refuses an empty
// states.json, THEN creates the worktree, bakes the pins URL into the copied overlay + stable-id
// module, and runs dbCreate. The overlay-import check is NOT an opened precondition: the import
// lives on proto/<stem>, which exists only once opened succeeds, so checking it there wedged
// every host without the import on main (the failed open left the branch behind and the rerun was
// refused as stale). `--mark round-done` refuses instead until some file in the worktree imports
// the overlay's basename, and records that file as status.wiring so the generated spec's File
// Plan drops it when its diff is the import line alone. D4: the ROUND step prints the session boot lines unconditionally, probes
// prototype.url with `curl -sf -m 3`, and gates the pin-ready/route lines on that probe succeeding
// — never a driver crash on an unreachable dev server. D5: `serve --port N` is a plain
// `node:http` server bound to 127.0.0.1, live only for the caller's own process lifetime (SIGTERM
// -> exit 0); a pin failing its shape check writes nothing in the batch. D8: `check` is doctor
// check 23 (advisory) — a host with no `prototype` block reads as clean, unlike every other
// subcommand which refuses without one.
//
// `--mark frozen` (spec 02 D3) runs the gate on the prototype tree, captures every declared
// route x state, writes contract.json, and reserves the generated spec's number and AC ids —
// each ordered precondition refuses loudly and writes nothing past its own failure point.
// `--mark tests-derived` (spec 02 D4-D8) refuses until the session's own derived e2e file on
// main carries every reserved AC id AND the host's own e2eList command reports it (the runner is
// the oracle, never the file content alone), then runs the export, the generated spec + its
// lints, the prototype's deletion, and the ledger row in that order — each step re-checks its own
// postcondition first, so a re-run after a partial failure (e.g. a dirty worktree at deletion)
// resumes at the first undone step rather than repeating already-committed work.
//
// specs/20261001/01-the-freeze-signs-in-and-derives-its-tier.md D4-D6: `check` also flags a
// `prototype.storageState` file that the VCS tracks (a saved sign-in holds live session cookies;
// an absent or untracked file is not a finding). `--mark tests-derived` derives the generated
// spec's tier from lib/freeze.js `riskTierHits` over every generated File Plan path: a hit with
// no `--tier` refuses (the user confirms the lock), `--tier critical|standard` records the answer
// in the spec's Rationale, and a spec already on disk is never rewritten.
//
// specs/20261005/03-one-port-per-launch.md D5-D7: when `prototype.url` carries `{port}` the driver
// keeps one app port per prototype as `appPort` in status.json (allocated at --mark opened, or on
// first need), prints `PORT=<appPort> <bootCommand>` in the ROUND step, and probes, prints and
// captures (--mark frozen) at the resolved address; contract.json state urls stay relative. A URL
// without the placeholder is a fixed address and behaves unchanged. The port is never
// re-allocated — a bound port may be the session's own server mid-boot (delete `appPort` to
// re-pick by hand); a bare ROUND run is therefore the one bare run that may write status.json.
//
// What this deliberately does NOT do:
//   - author states.json, wire the dev-entry import, run the host's dev server, or decide when a
//     round is "done" — those stay session judgment; the driver only verifies artifacts already on
//     disk and records the marks a session asks it to record.
//   - write spec/templates/proto-overlay.js, proto-stable-id.js or proto-capture-page.js — it only
//     copies/injects them (D6).
//   - author the derived e2e tests themselves — the session writes them; the driver only verifies
//     every reserved AC id is present and listed by the host's own runner (D4).
//
// Exit codes:
//   0  a bare run printed the current step, --state printed the state name, an accepted --mark
//      recorded its result and printed the checkpoint line, `serve` ran until SIGTERM, or `check`
//      found nothing (including when the `prototype` block is absent).
//   1  `check` found finding(s) (one line per finding on stdout, or `--json` with a `findings`
//      array).
//   2  usage error, a missing/invalid `prototype` config block (naming `prototype` or
//      `prototype.export`), a refused `--mark` precondition (stale branch, empty states.json,
//      missing overlay import at round-done, unapproved/unfrozen prototype, red gate, no composites, no
//      behaviour pins, a failed capture, a missing/incomplete derived e2e file, a pre-existing
//      `harden/<stem>` with marks.exported unset, a lint/sweep finding on the generated spec, or a
//      dirty prototype worktree at deletion, a `--tier` other than standard|critical, a File Plan
//      path named in the host's pipeline rules § Risk Tiers with no `--tier`, or a pipeline rules
//      file that is unreadable or has no `## Risk Tiers` section), a malformed status.json/states.json/contract.json,
//      or `serve --port N` refusing an already-bound port (named, with a remedy — never an
//      unhandled EADDRINUSE crash).

'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')
const { writeOut, appendLedger } = require('./lib/driver-io')
const { readConfigStrict, CONFIG_RELPATH } = require('./lib/host-config')
const { globMatch } = require('./lib/glob-match')
const freeze = require('./lib/freeze')
const appPortLib = require('./lib/app-port')

function die(msg) { writeOut(2, 'prototype-driver: ' + msg + '\n'); process.exit(2) }
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

if (argv.length === 0) {
  die('usage: prototype-driver <brief path> [--root <dir>] [--state] [--mark opened|round-done|approved|frozen|tests-derived] [serve --port <n>] [check [--json]] | prototype-driver check [--root <dir>] [--json]')
}
// `check` is the one subcommand doctor check 23 invokes with no brief (a host-wide config check
// has no brief to derive a stem/branch/worktree from) — every other form still needs one.
const briefLess = argv[0] === 'check'
const briefPath = briefLess ? null : argv[0]
let rest = briefLess ? argv.slice(0) : argv.slice(1)
const root = path.resolve(flagArg(rest, '--root') || process.cwd())
rest = withoutFlagPair(rest, '--root')

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  die('--root ' + root + ' is not a directory — remedy: pass a real project root, or omit --root to use the current directory')
}

// ---------------------------------------------------------------------------
// Host config (D1).
// ---------------------------------------------------------------------------
function loadConfig() {
  try {
    return readConfigStrict(root)
  } catch (e) {
    die(e.message + ' — remedy: run /spec:init first, or fix the host config')
    return null // unreachable
  }
}

function requirePrototypeConfig(cfg) {
  if (!cfg.prototype) {
    die('no "prototype" config block in ' + CONFIG_RELPATH + ' — remedy: declare it (spec/templates/grounding-contract.md § Required config keys), then run /spec:doctor')
  }
  if (!Array.isArray(cfg.prototype.export) || cfg.prototype.export.length === 0) {
    die('prototype.export is empty — remedy: declare at least one git pathspec glob naming the data/API layer in prototype.export, then run /spec:doctor')
  }
}

const cfg = loadConfig()

// ---------------------------------------------------------------------------
// check [--json] (D8, doctor check 23) — the one subcommand that runs even with no `prototype`
// block (an absent block reads as clean, per D8: "0 when clean or when the block is absent").
// ---------------------------------------------------------------------------
function globToRegExp(glob) {
  let re = '^'
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i++
      if (glob[i + 1] === '/') i++
    } else if (c === '*') {
      re += '[^/]*'
    } else if ('.+^$()|[]{}\\'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp(re + '$')
}

function gitLsFilesGlob(glob) {
  const r = spawnSync('git', ['-C', root, 'ls-files', '--', ':(glob)' + glob], { encoding: 'utf8' })
  if (r.status !== 0) return []
  return r.stdout.split('\n').filter(Boolean)
}

function cmdCheck(args) {
  const asJson = args.includes('--json')
  const findings = []
  const proto = cfg.prototype
  if (proto) {
    for (const g of proto.export || []) {
      if (gitLsFilesGlob(g).length === 0) {
        findings.push({ key: 'prototype.export', message: 'prototype.export glob matches no tracked file: ' + g })
      }
    }
    if (proto.overlay && (proto.export || []).some((g) => globToRegExp(g).test(proto.overlay))) {
      findings.push({ key: 'prototype.overlay', message: 'prototype.overlay (' + proto.overlay + ') is matched by a prototype.export glob — it would ship into the frozen data/API layer' })
    }
    if (typeof proto.e2eFile === 'string' && !proto.e2eFile.includes('{brief}')) {
      findings.push({ key: 'prototype.e2eFile', message: 'prototype.e2eFile lacks the {brief} placeholder: ' + proto.e2eFile })
    }
    if (typeof proto.e2eList === 'string' && !proto.e2eList.includes('{file}')) {
      findings.push({ key: 'prototype.e2eList', message: 'prototype.e2eList lacks the {file} placeholder: ' + proto.e2eList })
    }
    if (typeof proto.storageState === 'string' && proto.storageState !== '') {
      const tracked = spawnSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', proto.storageState], { encoding: 'utf8' })
      if (tracked.status === 0) {
        findings.push({ key: 'prototype.storageState', message: 'prototype.storageState (' + proto.storageState +
          ') is tracked by git — a saved sign-in holds live session cookies; remedy: git rm --cached ' +
          proto.storageState + ' and add it to .gitignore' })
      }
    }
  }
  if (findings.length === 0) process.exit(0)
  if (asJson) {
    writeOut(1, JSON.stringify({ findings }) + '\n')
  } else {
    for (const f of findings) writeOut(1, f.message + '\n')
  }
  process.exit(1)
}

if (rest[0] === 'check') cmdCheck(rest.slice(1))

// Every other subcommand needs a brief path — `check` above is the sole brief-less form.
if (briefLess) {
  die('usage: prototype-driver check [--root <dir>] [--json] — every other subcommand needs a brief path: prototype-driver <brief path> [--root <dir>] ...')
}

// ---------------------------------------------------------------------------
// Derived paths (D2) — all on the MAIN tree, never the prototype branch.
// ---------------------------------------------------------------------------
const stem = path.basename(briefPath, path.extname(briefPath))
// A brief id is NN plus an optional letter (04, 04a) — spec-status.js's normBrief shape. Taking the
// digits alone stamps a lettered brief with its neighbour's id.
const briefNumMatch = stem.match(/^(\d+[a-z]?)(?:-|$)/)
const brief = briefNumMatch ? briefNumMatch[1] : stem
const briefSlug = stem.replace(/^\d+[a-z]?-/, '')
const branch = 'proto/' + stem
const worktreeName = 'proto-' + stem
const worktreeRel = '.claude/worktrees/' + worktreeName
const worktreePath = path.join(root, '.claude/worktrees', worktreeName)
const designDir = path.join(root, 'design/prototypes', stem)
const statusPath = path.join(designDir, 'status.json')
const statesPath = path.join(designDir, 'states.json')
const pinsPath = path.join(designDir, 'pins.json')
const contractPath = path.join(designDir, 'contract.json')
const statusRel = 'design/prototypes/' + stem + '/status.json'
const statesRel = 'design/prototypes/' + stem + '/states.json'
const pinsRel = 'design/prototypes/' + stem + '/pins.json'
const contractRel = 'design/prototypes/' + stem + '/contract.json'
const driverAbs = path.resolve(__filename)

// Every other subcommand needs the block.
requirePrototypeConfig(cfg)
const proto = cfg.prototype

// ---------------------------------------------------------------------------
// status.json / states.json / pins.json I/O.
// ---------------------------------------------------------------------------
function loadStatus() {
  if (!fs.existsSync(statusPath)) return null
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'))
  } catch (e) {
    die(statusRel + ' is not valid JSON (' + e.message + ') — remedy: restore it from git history, or delete it and re-run --mark opened')
    return null // unreachable
  }
}

// specs/20261005/03-one-port-per-launch.md D6: when prototype.url carries {port}, status.appPort
// is the one app port for this prototype — allocated once, never re-allocated. Returns the
// resolved address, the port to boot on (null for a fixed address) and whether it was just minted.
function appAddress(status) {
  if (!appPortLib.hasPortSlot(proto.url)) return { url: proto.url, port: null }
  if (!Number.isInteger(status.appPort)) {
    let port
    try { port = appPortLib.freePort() } catch (e) {
      die('could not allocate an app port (' + e.message + ') — remedy: free a loopback port, then re-run')
    }
    status.appPort = port
    saveStatus(status)
  }
  return { url: appPortLib.resolveUrl(proto.url, status.appPort), port: status.appPort }
}

function saveStatus(status) {
  fs.mkdirSync(designDir, { recursive: true })
  status.lastUpdated = nowIso()
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n')
}

function loadStatesOrNull() {
  let raw
  try {
    raw = fs.readFileSync(statesPath, 'utf8')
  } catch {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function loadPinsDoc() {
  try {
    return JSON.parse(fs.readFileSync(pinsPath, 'utf8'))
  } catch {
    return { schemaVersion: 1, pins: [] }
  }
}

function writePinsAtomic(doc) {
  fs.mkdirSync(designDir, { recursive: true })
  const tmp = pinsPath + '.tmp-' + process.pid
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n')
  fs.renameSync(tmp, pinsPath)
}

// ---------------------------------------------------------------------------
// State derivation (D3).
// ---------------------------------------------------------------------------
function safeRealpath(p) { try { return fs.realpathSync(p) } catch { return path.resolve(p) } }

function worktreeIsRegistered() {
  const r = spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout) return false
  const target = safeRealpath(worktreePath)
  for (const line of r.stdout.split('\n')) {
    if (!line.startsWith('worktree ')) continue
    if (safeRealpath(line.slice('worktree '.length)) === target) return true
  }
  return false
}

function deriveState(status) {
  // marks.closed is checked FIRST and short-circuits the worktreeIsRegistered() probe below —
  // by CLOSED the prototype worktree is gone (D7), so testing for it would misreport OPEN.
  if (status && status.marks && status.marks.closed) return 'CLOSED'
  if (!status || !status.marks || !status.marks.opened || !worktreeIsRegistered()) return 'OPEN'
  if (!status.marks.approved) return 'ROUND'
  if (!status.marks.frozen) return 'APPROVED'
  return 'TESTS'
}

function printCheckpoint(prevState, nextState) {
  writeOut(1, '✅ checkpoint — prototype state saved (' + prevState + ' → ' + nextState +
    '); safe to /clear and re-run /spec:prototype ' + briefPath + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// --mark opened (D3).
// ---------------------------------------------------------------------------
function gitBranchExists(name) {
  const r = spawnSync('git', ['-C', root, 'branch', '--list', name], { encoding: 'utf8' })
  return r.status === 0 && r.stdout.trim() !== ''
}

function currentRootBranch() {
  const r = spawnSync('git', ['-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

function portFree(p) {
  const r = spawnSync(process.execPath, ['-e',
    'const net=require("net");const s=net.createServer();' +
    's.on("error",()=>process.exit(1));' +
    's.listen(process.argv[1],"127.0.0.1",()=>{s.close(()=>process.exit(0))})',
    String(p)], { encoding: 'utf8' })
  return r.status === 0
}

function findFreePortFrom(start) {
  let p = start
  while (!portFree(p)) p++
  return p
}

// Returns the worktree-relative path of the first file importing the overlay, or null.
function worktreeImportsOverlay(wtPath, basename, excludedAbsPaths) {
  // '.claude' is skipped along with node_modules/.git: .claude/spec.config.json always contains
  // prototype.overlay's own path string (D1's own config schema literally names it) and a fresh
  // worktree always materializes it as a tracked file — searching it would make the "no tracked
  // file imports the overlay" refusal below unsatisfiable on every real host, not just this
  // fixture's crafted case.
  const skip = new Set(['node_modules', '.git', '.claude'])
  const excluded = new Set(excludedAbsPaths)
  let found = null
  function walk(dir) {
    if (found) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (found) return
      if (skip.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { walk(full); continue }
      if (!e.isFile()) continue
      // The copied overlay and the stable-id module beside it both cite the overlay's own
      // basename in their own header comments (self-citation, never an import) — both are
      // excluded so only a THIRD file's real import counts.
      if (excluded.has(full)) continue
      let content
      try { content = fs.readFileSync(full, 'utf8') } catch { continue }
      if (content.includes(basename)) { found = path.relative(wtPath, full).split(path.sep).join('/'); return }
    }
  }
  walk(wtPath)
  return found
}

function statesHasRoutes(statesDoc) {
  if (!statesDoc || typeof statesDoc.routes !== 'object' || statesDoc.routes === null) return false
  const routes = Object.values(statesDoc.routes)
  if (routes.length === 0) return false
  return routes.some((s) => s && typeof s === 'object' && Object.keys(s).length > 0)
}

function cmdMarkOpened() {
  // D3: stale-branch refusal runs first — before even looking at states.json — because the fixed
  // stale-branch test seeds no states.json at all.
  const existingStatus = loadStatus()
  if (gitBranchExists(branch) && !existingStatus) {
    die('stale prototype branch ' + branch + ' — delete it or restore ' + statusRel)
  }

  const statesDoc = loadStatesOrNull()
  if (!statesHasRoutes(statesDoc)) {
    die(statesRel + ' has no routes — remedy: author it with at least one route carrying at least one state, then re-run --mark opened')
  }

  const baseBranch = currentRootBranch()
  const mergeBackPath = path.join(__dirname, 'merge-back.sh')
  const created = spawnSync('bash', [mergeBackPath, 'create', '--source', branch, '--root', root], { encoding: 'utf8' })
  if (created.status !== 0) {
    die('worktree creation failed (merge-back.sh create --source ' + branch + '): ' + (created.stderr || '').trim())
  }
  const createdLines = created.stdout.split('\n').filter(Boolean)
  const wtPath = createdLines.length ? createdLines[createdLines.length - 1].trim() : worktreePath

  const pinsPort = findFreePortFrom(4711)

  const overlaySrc = path.join(__dirname, '..', 'templates', 'proto-overlay.js')
  const stableIdSrc = path.join(__dirname, '..', 'templates', 'proto-stable-id.js')
  if (!fs.existsSync(overlaySrc) || !fs.existsSync(stableIdSrc)) {
    die('spec/templates/proto-overlay.js or proto-stable-id.js does not exist — remedy: these are copied, never authored by this driver (D6); wait for them to land, then re-run --mark opened')
  }
  const overlayDest = path.join(wtPath, proto.overlay)
  fs.mkdirSync(path.dirname(overlayDest), { recursive: true })
  const overlayText = fs.readFileSync(overlaySrc, 'utf8').split('__PROTO_PINS_URL__').join('http://127.0.0.1:' + pinsPort)
  fs.writeFileSync(overlayDest, overlayText)
  const stableIdDest = path.join(path.dirname(overlayDest), 'proto-stable-id.js')
  fs.copyFileSync(stableIdSrc, stableIdDest)

  if (proto.dbCreate) {
    const dbEnv = Object.assign({}, process.env, { PROTO_BRANCH: branch, PROTO_WORKTREE: wtPath, PROTO_BRIEF: brief })
    const dbRun = spawnSync('bash', ['-c', proto.dbCreate], { cwd: wtPath, encoding: 'utf8', env: dbEnv })
    if (dbRun.status !== 0) {
      die('prototype.dbCreate failed (exit ' + dbRun.status + '): ' + ((dbRun.stdout || '') + (dbRun.stderr || '')).trim())
    }
  }

  const prevState = deriveState(existingStatus)
  const status = existingStatus || {}
  status.schemaVersion = 1
  status.brief = brief
  status.stem = stem
  status.branch = branch
  status.worktree = worktreeRel
  status.base = baseBranch
  status.pinsPort = pinsPort
  appAddress(status)
  status.marks = Object.assign({ opened: null, approved: null }, status.marks)
  status.marks.opened = nowIso()
  status.rounds = status.rounds || []
  saveStatus(status)
  const nextState = deriveState(status)
  printCheckpoint(prevState, nextState)
}

// ---------------------------------------------------------------------------
// --mark round-done / --mark approved (D4).
// ---------------------------------------------------------------------------
function overlayImportLine() {
  return '`if (import.meta.env.DEV) import(\'./' + path.basename(proto.overlay) + '\')` or the stack equivalent'
}

function cmdMarkRoundDone() {
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: run --mark opened first')
  const overlayDest = path.join(worktreePath, proto.overlay)
  const stableIdDest = path.join(path.dirname(overlayDest), 'proto-stable-id.js')
  const wiring = worktreeImportsOverlay(worktreePath, path.basename(proto.overlay), [overlayDest, stableIdDest])
  if (!wiring) {
    die('prototype.overlay (' + proto.overlay + ') is not imported by any file in ' + worktreeRel +
      ' — remedy: wire ' + overlayImportLine() + ' into the host\'s dev entry, commit it on ' + branch + ', then re-run --mark round-done')
  }
  status.wiring = wiring
  const prevState = deriveState(status)
  status.rounds = status.rounds || []
  const counted = new Set()
  for (const r of status.rounds) for (const id of r.pins || []) counted.add(id)
  const pinsDoc = loadPinsDoc()
  const newPinIds = (pinsDoc.pins || []).filter((p) => !counted.has(p.id)).map((p) => p.id)
  const startedAt = status.rounds.length === 0
    ? (status.marks && status.marks.opened) || nowIso()
    : status.rounds[status.rounds.length - 1].endedAt
  const endedAt = nowIso()
  status.rounds.push({ n: status.rounds.length + 1, startedAt, endedAt, pins: newPinIds })
  saveStatus(status)
  const nextState = deriveState(status)
  printCheckpoint(prevState, nextState)
}

function cmdMarkApproved() {
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: run --mark opened first')
  if (!status.rounds || status.rounds.length < 1) {
    die('no round has been recorded yet — remedy: run --mark round-done at least once before --mark approved')
  }
  const prevState = deriveState(status)
  status.marks.approved = nowIso()
  saveStatus(status)
  const nextState = deriveState(status)
  printCheckpoint(prevState, nextState)
}

// ---------------------------------------------------------------------------
// --mark frozen (D3, specs/20260928/02-freeze-export-and-the-contract.md).
// ---------------------------------------------------------------------------
function readContractOrDie() {
  let raw
  try {
    raw = fs.readFileSync(contractPath, 'utf8')
  } catch (e) {
    die(contractRel + ' does not exist (' + e.message + ') — remedy: run --mark frozen first')
    return null // unreachable
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    die(contractRel + ' is not valid JSON (' + e.message + ')')
    return null // unreachable
  }
}

function cmdMarkFrozen() {
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: run --mark opened first')
  if (!status.marks || !status.marks.approved) {
    die('prototype is not yet approved — remedy: run --mark round-done then --mark approved before freezing')
  }
  const prevState = deriveState(status)

  // D3(2): composites.
  const composites = freeze.compositeNames(root, cfg)
  if (composites.length === 0) {
    die('no composites declared — the kit must exist before a prototype (brief 30)')
  }

  // D3(3): at least one behaviour pin.
  const pinsDoc = loadPinsDoc()
  const pins = pinsDoc.pins || []
  const behaviourPins = pins.filter((p) => p.kind === 'behaviour')
  if (behaviourPins.length === 0) {
    die('no behaviour pins — a prototype that changed no behaviour is the direct lane; mark a pin behaviour or close the prototype by hand')
  }
  const lookPins = pins.filter((p) => p.kind !== 'behaviour')

  // D3(4): gate.
  const gateResult = freeze.gateCheck({ root, worktreePath, config: cfg, designDir, stem })
  if (!gateResult.ok) die(gateResult.message)

  // D3(5): prototype.url is probed with curl -sf -m 3 — informational only (mirrors the ROUND
  // step's own probe, D4: "never a driver crash on an unreachable dev server"). The real
  // reachability gate is proto-capture.js's own navigation failure in D3(6) below: a driver-level
  // refusal here would duplicate that check with a different, less precise error and would make
  // a PROTO_CAPTURE_BIN test seam (which never touches the network) spuriously refuse.
  const address = appAddress(status)
  probeUrl(address.url)

  // D3(6): captures.
  const statesDoc = loadStatesOrNull()
  if (!statesHasRoutes(statesDoc)) {
    die(statesRel + ' has no routes — remedy: author it with at least one route carrying at least one state')
  }
  // One resolved size, used for both the captures and the contract: a contract size the
  // captures did not use makes every build-time pair a false difference. A malformed value is
  // refused, never silently replaced by the default: the default would freeze at a size the
  // author did not ask for.
  const isPosInt = (n) => Number.isInteger(n) && n > 0
  let viewport = { width: 1280, height: 800 }
  if (statesDoc.viewport !== undefined) {
    const v = statesDoc.viewport
    if (!v || typeof v !== 'object' || !isPosInt(v.width) || !isPosInt(v.height)) {
      die(statesRel + ': viewport must be { width, height } positive integers — got ' + JSON.stringify(v) +
        '; remedy: fix or remove it (absent = 1280x800), then re-run --mark frozen')
    }
    viewport = { width: v.width, height: v.height }
  }
  const captureResult = freeze.captureAll({ root, designDir, config: cfg, statesDoc, composites, viewport, baseUrl: address.url })
  if (!captureResult.ok) die(captureResult.message)

  // D3(8): reserve the spec number and this freeze's AC ids, before D3(7) writes the contract.
  const reserved = freeze.reserveSpec(root, brief, briefSlug, behaviourPins.map((p) => p.id))
  const e2eFile = (proto.e2eFile || '').split('{brief}').join(brief)

  // D3(7): contract.json.
  freeze.writeContract({
    designDir, brief, stem, base: status.base,
    viewport,
    routes: captureResult.routes, composites, ids: captureResult.ids,
    pinsTest: behaviourPins.map((p) => p.id), pinsLook: lookPins.map((p) => p.id),
    spec: reserved.specPath, e2eFile, tests: reserved.tests,
  })

  // D3(9).
  status.marks.frozen = nowIso()
  saveStatus(status)
  const nextState = deriveState(status)
  printCheckpoint(prevState, nextState)
}

// ---------------------------------------------------------------------------
// --mark tests-derived (D4-D8).
// ---------------------------------------------------------------------------
const OVERLAY_BASENAMES_CACHE = () => {
  const names = new Set(['proto-stable-id.js'])
  if (proto.overlay) names.add(path.basename(proto.overlay))
  return names
}

// The dev-entry file carrying the overlay import is prototype tooling, not product: dropped from
// the File Plan when every line its proto/<stem> diff adds or removes names the overlay. A file
// that also carries real edits keeps its row.
function isWiringOnly(base, p, wiring) {
  if (!wiring || p !== wiring) return false
  const basename = path.basename(proto.overlay)
  const d = spawnSync('git', ['-C', root, 'diff', '--unified=0', base + '...' + branch, '--', p], { encoding: 'utf8' })
  const changed = (d.stdout || '').split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)( |$)/.test(l))
  return changed.length > 0 && changed.every((l) => l.includes(basename))
}

function buildFilePlanRows(base, exportFiles, exportGlobs, wiring) {
  const exportPaths = new Set(exportFiles.map((f) => f.path))
  const overlayNames = OVERLAY_BASENAMES_CACHE()
  const rows = exportFiles.map((f) => ({
    path: f.path,
    action: f.status === 'A' ? 'CREATE' : f.status === 'D' ? 'DELETE' : 'MODIFY',
    layer: 'other',
  }))
  const full = spawnSync('git', ['-C', root, 'diff', '--name-status', base + '...' + branch], { encoding: 'utf8' })
  const lines = (full.stdout || '').trim().split('\n').filter(Boolean)
  for (const line of lines) {
    const [status, ...rest] = line.split('\t')
    const p = rest.join('\t')
    if (exportPaths.has(p)) continue
    if (overlayNames.has(path.basename(p))) continue
    if ((exportGlobs || []).some((g) => globMatch(g, p))) continue
    if (isWiringOnly(base, p, wiring)) continue
    // D6: outside-export proto/<stem> edits take their action from the diff status too.
    const st = status.charAt(0)
    rows.push({ path: p, action: st === 'A' ? 'CREATE' : st === 'D' ? 'DELETE' : 'MODIFY', layer: 'other' })
  }
  return rows
}

function cmdMarkTestsDerived() {
  // D6: the flag is checked before any other work in the mark.
  const tierIdx = rest.indexOf('--tier')
  const tierFlag = tierIdx > -1 ? rest[tierIdx + 1] : null
  if (tierIdx > -1 && tierFlag !== 'standard' && tierFlag !== 'critical') {
    die('--tier must be standard or critical — remedy: re-run --mark tests-derived with --tier standard or --tier critical')
  }
  let tierLine = null
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: run --mark opened first')
  if (!status.marks || !status.marks.frozen) {
    die('prototype is not yet frozen — remedy: run --mark frozen first')
  }
  const prevState = deriveState(status)
  const contract = readContractOrDie()

  // D4: the e2e file must exist on main and carry every reserved AC id.
  const e2eAbs = path.join(root, contract.e2eFile)
  if (!fs.existsSync(e2eAbs)) {
    die(contract.e2eFile + ' does not exist on main — remedy: write the derived tests at ' + contract.e2eFile + ' (see the TESTS step), then re-run --mark tests-derived')
  }
  const e2eText = fs.readFileSync(e2eAbs, 'utf8')
  for (const t of contract.tests) {
    if (!e2eText.includes(t.ac)) {
      die(contract.e2eFile + ' does not carry ' + t.ac + ' — remedy: add a derived test whose title includes ' + t.ac + ', then re-run --mark tests-derived')
    }
  }
  if (typeof proto.e2eList !== 'string' || !proto.e2eList) {
    die('prototype.e2eList is not declared — remedy: declare it (spec/templates/grounding-contract.md § Required config keys)')
  }
  const listCmd = proto.e2eList.split('{file}').join(contract.e2eFile)
  const listRun = spawnSync('bash', ['-c', listCmd], { cwd: root, encoding: 'utf8' })
  const listedOut = listRun.stdout || ''
  if (listRun.status !== 0) {
    die('e2eList (' + listCmd + ') exited ' + listRun.status + ': ' + ((listedOut) + (listRun.stderr || '')).trim())
  }
  for (const t of contract.tests) {
    if (!listedOut.includes(t.ac)) {
      die('e2eList (' + listCmd + ') did not report ' + t.ac + ' as listed — the host runner is the oracle, not the file content: confirm ' + contract.e2eFile + ' matches the runner\'s own test-discovery pattern')
    }
  }

  // D5: export.
  const alreadyExported = !!(status.marks.exported)
  const briefAbsPath = path.resolve(root, briefPath)
  const exportResult = freeze.exportHarden({
    root, branch, stem, base: status.base, exportGlobs: proto.export || [], alreadyExported, briefPath: briefAbsPath,
  })
  if (exportResult.ok === false) die(exportResult.message)
  if (!exportResult.skipped) {
    status.marks.exported = nowIso()
    status.exported = { files: exportResult.files.map((f) => f.path), commit: exportResult.commit }
    saveStatus(status)
  }

  // D6: the generated spec — written once (idempotent by file existence), then lint-checked.
  const specAbs = path.join(root, contract.spec)
  if (!fs.existsSync(specAbs)) {
    const exportFiles = (status.exported && status.exported.files) || []
    const exportFileObjs = exportFiles.map((p) => {
      const found = (exportResult.files || []).find((f) => f.path === p)
      return found || { path: p, status: 'M' }
    })
    const filePlanRows = buildFilePlanRows(status.base, exportFileObjs, proto.export || [], status.wiring)
    const briefText = fs.existsSync(briefAbsPath) ? fs.readFileSync(briefAbsPath, 'utf8') : ''
    const pinsDoc = loadPinsDoc()
    const pinsById = {}
    for (const p of pinsDoc.pins || []) pinsById[p.id] = p

    // D6: tier — over every generated File Plan row's path, the e2e file included.
    const tierPaths = [...filePlanRows.map((r) => r.path), contract.e2eFile]
    const risk = freeze.riskTierHits({ root, config: cfg, paths: tierPaths })
    if (!risk.ok) die(risk.message)
    if (risk.hits.length > 0 && !tierFlag) {
      die(risk.hits.length + ' File Plan path' + (risk.hits.length === 1 ? '' : 's') + ' named in ' + risk.rulesPath +
        ' § Risk Tiers:\n' + risk.hits.map((h) => '  ' + h.path + ' ← `' + h.trigger + '`').join('\n') +
        '\nremedy: the user confirms the lock — re-run --mark tests-derived with --tier critical, or with --tier standard ' +
        'when the user rules none of these is a risk change')
    }
    const tier = tierFlag || 'standard'
    tierLine = '🚦 generated spec tier: ' + tier + ' (' + risk.hits.length + ' risk-listed path' +
      (risk.hits.length === 1 ? '' : 's') + ')\n'
    freeze.writeSpec({
      root, specPath: contract.spec, brief, briefSlug, briefText, contract,
      filePlanRows, e2eFile: contract.e2eFile, pinsById, tier, tierHits: risk.hits,
    })
    const lint = spawnSync(process.execPath, [path.join(__dirname, 'ac-matrix.js'), '--spec', contract.spec, '--lint', '--resolve-root', root], { cwd: root, encoding: 'utf8' })
    if (lint.status !== 0) {
      die('ac-matrix.js --lint refused the generated spec ' + contract.spec + ' (left on disk for inspection): ' + ((lint.stdout || '') + (lint.stderr || '')).trim())
    }
    const sweep = spawnSync(process.execPath, [path.join(__dirname, 'promise-sweep.js'), '--spec', contract.spec], { cwd: root, encoding: 'utf8' })
    if (sweep.status !== 0) {
      die('promise-sweep.js refused the generated spec ' + contract.spec + ' (left on disk for inspection): ' + ((sweep.stdout || '') + (sweep.stderr || '')).trim())
    }
    writeOut(1, tierLine)
  }

  // D7: deletion, then D8: the ledger row — only once, guarded by marks.closed. dbDestroy is
  // recorded as its own postcondition (marks.dbDestroyed), persisted immediately after it
  // succeeds and BEFORE worktree removal is attempted, so a resume after a dirty-worktree
  // refusal never re-invokes a non-idempotent dbDestroy a second time.
  if (!status.marks.closed) {
    const dbResult = freeze.runDbDestroy({
      config: cfg, worktreePath, branch, brief, alreadyRan: !!(status.marks && status.marks.dbDestroyed),
    })
    if (!dbResult.ok) die(dbResult.message)
    if (dbResult.ran) {
      status.marks.dbDestroyed = nowIso()
      saveStatus(status)
    }
    const deleteResult = freeze.removeProtoWorktreeAndBranch({ root, worktreePath, branch, stem })
    if (!deleteResult.ok) die(deleteResult.message)

    let routeCount = 0
    let stateCount = 0
    for (const states of Object.values(contract.routes || {})) {
      routeCount++
      stateCount += Object.keys(states || {}).length
    }
    const row = freeze.ledgerRow({
      specPath: contract.spec, brief, branch, rounds: (status.rounds || []).length,
      pinsTotal: contract.pins.test.length + contract.pins.look.length,
      pinsBehaviour: contract.pins.test.length, pinsLook: contract.pins.look.length,
      routes: routeCount, states: stateCount, captures: stateCount,
      exportedFiles: ((status.exported && status.exported.files) || []).length,
      exportedCommit: (status.exported && status.exported.commit) || null,
      hardenBranch: 'harden/' + stem,
    })
    appendLedger(root, JSON.stringify(row))
    status.marks.closed = nowIso()
    saveStatus(status)
  }

  const nextState = deriveState(status)
  printCheckpoint(prevState, nextState)
}

function cmdMark(name) {
  if (name === 'opened') return cmdMarkOpened()
  if (name === 'round-done') return cmdMarkRoundDone()
  if (name === 'approved') return cmdMarkApproved()
  if (name === 'frozen') return cmdMarkFrozen()
  if (name === 'tests-derived') return cmdMarkTestsDerived()
  die('--mark ' + name + ' is unknown — remedy: --mark opened|round-done|approved|frozen|tests-derived')
}

// ---------------------------------------------------------------------------
// serve --port <n> (D5).
// ---------------------------------------------------------------------------
function validatePin(p) {
  if (!p || typeof p.note !== 'string' || p.note.length === 0) return { field: 'note', message: 'pin is missing "note"' }
  if (p.kind !== 'behaviour' && p.kind !== 'look') return { field: 'kind', message: 'pin "kind" must be "behaviour" or "look", got: ' + JSON.stringify(p.kind) }
  if (p.anchor !== null && p.anchor !== undefined) {
    if (typeof p.anchor.id !== 'string' || p.anchor.id.length === 0) return { field: 'anchor.id', message: 'pin "anchor.id" is required when anchor is present' }
  }
  return null
}

// One shape for every POST /pins refusal: JSON `{ "error": "<message>" }`, content-type
// application/json (the overlay reads `body.error`; the message text itself is unchanged, so
// every existing "the 400 body must name X" pin still matches it as a substring of the JSON).
function refuse400(res, message) {
  res.writeHead(400, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: message }))
}

function cmdServe(args) {
  const portArg = flagArg(args, '--port')
  const port = parseInt(portArg, 10)
  if (!portArg || Number.isNaN(port)) die('serve needs --port <n> — remedy: serve --port <n>')

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'content-type')
      res.writeHead(204)
      res.end()
      return
    }
    if (req.method === 'GET' && req.url === '/pins') {
      res.setHeader('content-type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify(loadPinsDoc()))
      return
    }
    if (req.method === 'POST' && req.url === '/pins') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        let batch
        try {
          batch = JSON.parse(body)
        } catch (e) {
          refuse400(res, 'invalid JSON body: ' + e.message)
          return
        }
        if (!Array.isArray(batch)) {
          refuse400(res, 'body must be a JSON array of pins')
          return
        }
        for (const p of batch) {
          const err = validatePin(p)
          if (err) { refuse400(res, err.message); return }
        }
        const doc = loadPinsDoc()
        doc.schemaVersion = doc.schemaVersion || 1
        doc.pins = doc.pins || []
        const status = loadStatus() || { rounds: [] }
        const roundNum = (status.rounds || []).length + 1
        const startN = doc.pins.length + 1
        const stampedAt = nowIso()
        const accepted = []
        batch.forEach((p, i) => {
          const id = 'p' + (startN + i)
          doc.pins.push({
            id, round: roundNum, screen: p.screen, state: p.state,
            anchor: p.anchor === undefined ? null : p.anchor,
            note: p.note, who: p.who, kind: p.kind, at: stampedAt,
          })
          accepted.push(id)
        })
        writePinsAtomic(doc)
        res.setHeader('content-type', 'application/json')
        res.writeHead(200)
        res.end(JSON.stringify({ accepted }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })

  // An already-bound port is a routine condition (a stale round's serve still running, a second
  // session racing the same round) — never an unhandled 'error' event crash. die() exits 2 and
  // names both the port and a real remedy.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      die('port ' + port + ' is already in use — stop whatever is holding it (e.g. `lsof -i :' + port +
        '`), then re-run: node ' + driverAbs + ' ' + briefPath + ' serve --port ' + port)
    }
    die('serve --port ' + port + ' failed: ' + err.message)
  })

  server.listen(port, '127.0.0.1')
  process.on('SIGTERM', () => { server.close(() => process.exit(0)) })
}

// ---------------------------------------------------------------------------
// Bare-invocation step printer (D3/D4).
// ---------------------------------------------------------------------------
function printOpenStep() {
  const template = JSON.stringify({
    schemaVersion: 1,
    viewport: { width: 1280, height: 800 },
    routes: { '/example': { default: '/example' } },
  }, null, 2)
  const lines = []
  lines.push('[prototype-driver] state: OPEN  brief: ' + briefPath)
  lines.push('## Step: author states.json, then --mark opened')
  lines.push('Author ' + statesRel + ' with at least one route carrying at least one state:')
  lines.push(template)
  lines.push('The overlay import is wired in the ROUND step, once the worktree exists.')
  lines.push('Then:')
  lines.push('  node ' + driverAbs + ' ' + briefPath + ' --mark opened')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function probeUrl(url) {
  const r = spawnSync('curl', ['-sf', '-m', '3', url], { encoding: 'utf8' })
  return r.status === 0
}

function printRoundStep(status) {
  const roundNum = (status.rounds || []).length + 1
  const statesDoc = loadStatesOrNull()
  const lines = []
  lines.push('[prototype-driver] state: ROUND  brief: ' + briefPath + '  round: ' + roundNum)
  lines.push('## Step: pin round ' + roundNum + ' on ' + branch)
  lines.push('Read only: ' + pinsRel + ', ' + statesRel)
  if (!status.wiring) {
    lines.push('Session: wire the dev-only overlay import into the host\'s dev entry in ' + worktreeRel + ' and commit it on ' +
      branch + ' (skip if main already carries it): ' + overlayImportLine())
  }
  const address = appAddress(status)
  lines.push('Session: in ' + worktreeRel + ', start the dev server in the background (tracked): ' +
    (address.port ? 'PORT=' + address.port + ' ' : '') + (cfg.runtime && cfg.runtime.bootCommand))
  lines.push('Session: start the pin endpoint in the background (tracked): node ' + driverAbs + ' ' + briefPath + ' serve --port ' + status.pinsPort)
  const reachable = probeUrl(address.url)
  let tailscalePort = ''
  try { tailscalePort = new URL(address.url).port } catch { tailscalePort = '' }
  if (reachable) {
    lines.push('🎨 ready for pins — ' + address.url)
    if (statesDoc && statesDoc.routes) {
      for (const [routePath, states] of Object.entries(statesDoc.routes)) {
        lines.push('route: ' + routePath + ' (' + Object.keys(states).join(', ') + ')')
      }
    }
  } else {
    lines.push('dev server is not answering on ' + address.url + (address.port ? ' — the boot command must serve on $PORT' : ''))
  }
  lines.push('Share (only when someone else must see it): tailscale serve --bg ' + (tailscalePort || '<port>'))
  lines.push('Reply `approve` to freeze; anything else is a change for this session to apply on ' + branch + ', then:')
  lines.push('  node ' + driverAbs + ' ' + briefPath + ' --mark round-done')
  lines.push('Then (only on the literal `approve`):')
  lines.push('  node ' + driverAbs + ' ' + briefPath + ' --mark approved')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function printApprovedStep() {
  const lines = []
  lines.push('[prototype-driver] state: APPROVED  brief: ' + briefPath)
  lines.push('## Step: freeze')
  lines.push('Session: on the literal `approve` this prototype is ready to freeze — the driver refuses ' +
    'unless the kit gates are green on ' + branch + ', then captures every declared route x state and ' +
    'reserves the derived behaviour-lane spec.')
  lines.push('Then:')
  lines.push('  node ' + driverAbs + ' ' + briefPath + ' --mark frozen')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// TESTS bare-run printer (D4).
// ---------------------------------------------------------------------------
function printTestsStep() {
  const contract = readContractOrDie()
  const pinsDoc = loadPinsDoc()
  const pinsById = {}
  for (const p of pinsDoc.pins || []) pinsById[p.id] = p

  const lines = []
  lines.push('[prototype-driver] state: TESTS  brief: ' + briefPath)
  lines.push('## Step: derive one end-to-end test per behaviour pin')
  lines.push('Read only: ' + contractRel + ', ' + pinsRel)
  for (const t of contract.tests) {
    const p = pinsById[t.pin] || {}
    const anchorId = p.anchor && p.anchor.id ? p.anchor.id : 'screen note'
    lines.push('pin ' + t.pin + ' → ' + t.ac + ' · ' + (p.screen || '?') + ' (' + (p.state || '?') + ') · ' +
      anchorId + ' · "' + (p.note || '') + '"')
  }
  lines.push('File: ' + contract.e2eFile + ' (main working tree) · title: `<AC-ID> pin <id>: <note>`')
  lines.push('Session: write one test per line above; it must fail on main today.')
  lines.push('Then:')
  lines.push('  node ' + driverAbs + ' ' + briefPath + ' --mark tests-derived')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// CLOSED bare-run printer (D8): `Read only:` + `Next:` (spec-status --next, verbatim).
// ---------------------------------------------------------------------------
function printClosedStep() {
  const contract = readContractOrDie()
  const lines = []
  lines.push('[prototype-driver] state: CLOSED  brief: ' + briefPath)
  lines.push('Read only: ' + contractRel + ', ' + contract.spec)
  const specStatusPath = path.join(__dirname, 'spec-status.js')
  const r = spawnSync(process.execPath, [specStatusPath, '--root', root, '--next'], { encoding: 'utf8' })
  lines.push('Next:')
  lines.push((r.stdout || '').trim() || '(spec-status --next produced no output)')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Dispatch — exactly one branch runs. `serve` must be the exclusive terminal branch: it never
// calls process.exit itself (the server keeps the event loop alive until SIGTERM), so falling
// through to any later branch here would print a step and exit the process out from under it.
// ---------------------------------------------------------------------------
if (rest[0] === 'serve') {
  cmdServe(rest.slice(1))
} else if (rest[0] === '--mark') {
  cmdMark(rest[1])
} else if (rest.includes('--state')) {
  writeOut(1, deriveState(loadStatus()) + '\n')
  process.exit(0)
} else {
  const status = loadStatus()
  const state = deriveState(status)
  if (state === 'OPEN') printOpenStep()
  else if (state === 'ROUND') printRoundStep(status)
  else if (state === 'APPROVED') printApprovedStep()
  else if (state === 'TESTS') printTestsStep()
  else printClosedStep()
}
