#!/usr/bin/env node
// prototype-driver.js <brief path> [--root <dir>] [--state]
// prototype-driver.js <brief path> [--root <dir>] --mark opened|round-done|approved
// prototype-driver.js <brief path> [--root <dir>] serve --port <n>
// prototype-driver.js <brief path> [--root <dir>] check [--json]
// prototype-driver.js check [--root <dir>] [--json]   (brief-less: doctor check 23's own
//   invocation has no brief — a host-wide config check needs none)
//
// WHY: specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D2-D5/D8 — /spec:prototype
// derives OPEN -> ROUND -> APPROVED from design/prototypes/<stem>/status.json plus disk and the
// host's declared `prototype` config block (spec/templates/grounding-contract.md), the way
// genesis-driver.js and mocks-driver.js derive their own state machines. The brief STEM is the
// brief path's basename without extension; branch `proto/<stem>`; worktree
// `.claude/worktrees/proto-<stem>` (created through merge-back.sh create, which owns the
// worktree path and the .worktreeinclude manifest); status/pins/states all live under
// `design/prototypes/<stem>/` in the MAIN working tree, never on the prototype branch (ADR-0030 h
// — nothing on proto/* is read after close).
//
// D3: OPEN while marks.opened is unset OR the worktree is absent from `git worktree list
// --porcelain`; ROUND while opened and not yet approved; APPROVED once marks.approved. `--mark
// opened` refuses a stale branch (proto/<stem> exists, status.json absent), refuses an empty
// states.json, THEN creates the worktree, bakes the pins URL into the copied overlay + stable-id
// module, runs dbCreate, and refuses if no tracked file in the worktree imports the overlay's
// basename. D4: the ROUND step prints the session boot lines unconditionally, probes
// prototype.url with `curl -sf -m 3`, and gates the pin-ready/route lines on that probe succeeding
// — never a driver crash on an unreachable dev server. D5: `serve --port N` is a plain
// `node:http` server bound to 127.0.0.1, live only for the caller's own process lifetime (SIGTERM
// -> exit 0); a pin failing its shape check writes nothing in the batch. D8: `check` is doctor
// check 23 (advisory) — a host with no `prototype` block reads as clean, unlike every other
// subcommand which refuses without one.
//
// What this deliberately does NOT do:
//   - author states.json, wire the dev-entry import, run the host's dev server, or decide when a
//     round is "done" — those stay session judgment; the driver only verifies artifacts already on
//     disk and records the marks a session asks it to record.
//   - write spec/templates/proto-overlay.js or proto-stable-id.js — it only copies them (D6).
//   - relocate the session CWD, delete the prototype branch, or run the freeze — spec 02 owns
//     FROZEN/CLOSED; this driver's APPROVED step prints "not available in this version".
//
// Exit codes:
//   0  a bare run printed the current step, --state printed the state name, an accepted --mark
//      recorded its result and printed the checkpoint line, `serve` ran until SIGTERM, or `check`
//      found nothing (including when the `prototype` block is absent).
//   1  `check` found finding(s) (one line per finding on stdout, or `--json` with a `findings`
//      array).
//   2  usage error, a missing/invalid `prototype` config block (naming `prototype` or
//      `prototype.export`), a refused `--mark` precondition (stale branch, empty states.json,
//      missing overlay import), a malformed status.json/states.json, or `serve --port N`
//      refusing an already-bound port (named, with a remedy — never an unhandled EADDRINUSE
//      crash).

'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')
const { writeOut } = require('./lib/driver-io')
const { readConfigStrict, CONFIG_RELPATH } = require('./lib/host-config')

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
  die('usage: prototype-driver <brief path> [--root <dir>] [--state] [--mark opened|round-done|approved] [serve --port <n>] [check [--json]] | prototype-driver check [--root <dir>] [--json]')
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
const briefNumMatch = stem.match(/^(\d+)/)
const brief = briefNumMatch ? briefNumMatch[1] : stem
const branch = 'proto/' + stem
const worktreeName = 'proto-' + stem
const worktreeRel = '.claude/worktrees/' + worktreeName
const worktreePath = path.join(root, '.claude/worktrees', worktreeName)
const designDir = path.join(root, 'design/prototypes', stem)
const statusPath = path.join(designDir, 'status.json')
const statesPath = path.join(designDir, 'states.json')
const pinsPath = path.join(designDir, 'pins.json')
const statusRel = 'design/prototypes/' + stem + '/status.json'
const statesRel = 'design/prototypes/' + stem + '/states.json'
const pinsRel = 'design/prototypes/' + stem + '/pins.json'
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
  if (!status || !status.marks || !status.marks.opened || !worktreeIsRegistered()) return 'OPEN'
  if (!status.marks.approved) return 'ROUND'
  return 'APPROVED'
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

function worktreeImportsOverlay(wtPath, basename, excludedAbsPaths) {
  // '.claude' is skipped along with node_modules/.git: .claude/spec.config.json always contains
  // prototype.overlay's own path string (D1's own config schema literally names it) and a fresh
  // worktree always materializes it as a tracked file — searching it would make the "no tracked
  // file imports the overlay" refusal below unsatisfiable on every real host, not just this
  // fixture's crafted case.
  const skip = new Set(['node_modules', '.git', '.claude'])
  const excluded = new Set(excludedAbsPaths)
  let found = false
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
      if (content.includes(basename)) { found = true; return }
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

  if (!worktreeImportsOverlay(wtPath, path.basename(proto.overlay), [overlayDest, stableIdDest])) {
    die('prototype.overlay (' + proto.overlay + ') is not imported by any tracked file in the worktree — remedy: wire `import(\'./' +
      path.basename(proto.overlay) + '\')` behind the host\'s dev flag into the dev entry, commit it on ' + branch + ', then re-run --mark opened')
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
function cmdMarkRoundDone() {
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: run --mark opened first')
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

function cmdMark(name) {
  if (name === 'opened') return cmdMarkOpened()
  if (name === 'round-done') return cmdMarkRoundDone()
  if (name === 'approved') return cmdMarkApproved()
  die('--mark ' + name + ' is unknown — remedy: --mark opened|round-done|approved')
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
  lines.push('Wire the dev-only overlay import into the host\'s dev entry once the worktree exists: ' +
    '`if (import.meta.env.DEV) import(\'./' + path.basename(proto.overlay) + '\')` or the stack equivalent.')
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
  lines.push('Session: in ' + worktreeRel + ', start the dev server in the background (tracked): ' + (cfg.runtime && cfg.runtime.bootCommand))
  lines.push('Session: start the pin endpoint in the background (tracked): node ' + driverAbs + ' ' + briefPath + ' serve --port ' + status.pinsPort)
  const reachable = probeUrl(proto.url)
  let tailscalePort = ''
  try { tailscalePort = new URL(proto.url).port } catch { tailscalePort = '' }
  if (reachable) {
    lines.push('🎨 ready for pins — ' + proto.url)
    if (statesDoc && statesDoc.routes) {
      for (const [routePath, states] of Object.entries(statesDoc.routes)) {
        lines.push('route: ' + routePath + ' (' + Object.keys(states).join(', ') + ')')
      }
    }
  } else {
    lines.push('dev server is not answering on ' + proto.url)
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
  writeOut(1, '[prototype-driver] state: APPROVED  brief: ' + briefPath + '\n' +
    '## Step: freeze — not available in this version\n')
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
  else printApprovedStep()
}
