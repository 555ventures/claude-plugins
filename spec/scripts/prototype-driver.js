#!/usr/bin/env node
// prototype-driver.js <idea in words | brief path | stem> [--stem <name>] [--root <dir>] [--state]
// prototype-driver.js <idea | brief path | stem> [--stem <name>] [--root <dir>] --mark opened|round-done|approved|contracted|tests-derived|closed
// prototype-driver.js <idea | brief path | stem> [--root <dir>] serve --port <n>
// prototype-driver.js <idea | brief path | stem> [--root <dir>] check [--json]
// prototype-driver.js check [--root <dir>] [--json]   (brief-less: doctor check 23's own
//   invocation has no brief — a host-wide config check needs none)
//
// WHY: specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D2-D5/D8, reshaped by
// specs/20261007/01-approve-writes-a-behaviour-contract.md D2-D9 and
// specs/20261007/02-the-prototype-opens-from-words-a-brief-or-a-stem.md D1-D4 — /spec:prototype derives
// OPEN -> ROUND -> APPROVED -> TESTS -> CONTRACTED -> CLOSED from design/prototypes/<stem>/
// status.json plus disk and the host's declared `prototype` config block
// (spec/templates/grounding-contract.md § Prototype), the way genesis-driver.js and
// mocks-driver.js derive their own state machines. The first argument takes three shapes, tried in
// order: a brief (an existing .md file under --root; stem = its basename without extension), a stem
// (design/prototypes/<arg>/status.json exists; brief and idea read from it), else words (the
// argument is the idea; the stem is its slug cut to 48 characters at a `-`, printed as a 📌
// auto-pick the user may rename once with --stem before --mark opened; brief = n/a). `--mark
// opened` writes status.input = { kind, brief, idea }. The brief's `Lane:` header is never read.
// Every printed `node <driver> <arg>` line echoes the stem once opened. Branch `proto/<stem>`; worktree `.claude/worktrees/proto-<stem>` (created
// through merge-back.sh create, which owns the worktree path and the .worktreeinclude manifest);
// status/pins/states/contract all live under `design/prototypes/<stem>/` in the MAIN working tree,
// never on the prototype branch. The contract's step primitives (pictures, contract.json, test
// copy, deletion, ledger row) live in lib/contract.js — this file owns only the ordering,
// status.json/marks bookkeeping and the printed steps.
//
// States (deriveState, in order): CLOSED once marks.closed; CONTRACTED once marks.testsDerived;
// OPEN while marks.opened is unset or the worktree is absent from `git worktree list --porcelain`
// (CLOSED and CONTRACTED are checked first, so a worktree removed by hand never shadows them);
// ROUND until approved; APPROVED until marks.contracted; else TESTS.
//
// Marks: `opened` refuses a stale branch and an empty states.json, then creates the worktree,
// bakes the pins URL into the copied overlay and runs dbCreate. `round-done` refuses until a file
// in the worktree imports the overlay. `contracted` (D4) refuses without an approved round, a
// behaviour pin, valid states.json or a declared `prototype.picture`, pictures every route x state
// through the host's own command (PNG signature verified), and writes contract.json. `tests-derived`
// (D6) verifies the session's test file is committed on proto/<stem>, carries `pin <id>:` for every
// behaviour pin, is listed by `prototype.e2eList` and passes `prototype.e2eRun` against the
// prototype, then copies it into the contract, appends one ledger row and queues the
// `/spec:plan` paste through spec-queue.js; a re-run resumes at the first undone step. `closed`
// (D9) runs dbDestroy once, removes the worktree and branch, and is accepted from ROUND,
// APPROVED, TESTS and CONTRACTED.
//
// `check` is doctor check 23 (advisory): findings are the keys a mark will read —
// prototype.e2eFile without {stem}, e2eList without {file}, e2eRun undeclared or without {file},
// picture undeclared or without {url}/{out}. A host with no `prototype` block reads as clean,
// unlike every other subcommand, which refuses without one. `serve --port N` is a plain
// `node:http` server bound to 127.0.0.1, live only for the caller's own process lifetime
// (SIGTERM -> exit 0); a pin failing its shape check writes nothing in the batch.
//
// specs/20261005/03-one-port-per-launch.md D5-D7: when `prototype.url` carries `{port}` the driver
// keeps one app port per prototype as `appPort` in status.json (allocated at --mark opened, or on
// first need), prints `PORT=<appPort> <bootCommand>` in the ROUND and TESTS steps, and probes,
// pictures and runs the tests at the resolved address; contract.json state urls stay relative.
// The port is never re-allocated (delete `appPort` to re-pick by hand).
//
// What this deliberately does NOT do:
//   - author states.json or the derived tests, wire the dev-entry import, run the host's dev
//     server, or decide when a round is "done" — those stay session judgment.
//   - run a gate, require a kit, capture structure, export code, reserve a spec number or
//     generate a spec — the contract is pins, pictures and tests only.
//   - write spec/templates/proto-overlay.js or proto-stable-id.js — it only copies/injects them.
//   - name a browser or a test tool: pictures and test runs are the host's own commands.
//
// Exit codes:
//   0  a bare run printed the current step, --state printed the state name, an accepted --mark
//      recorded its result and printed the checkpoint line, `serve` ran until SIGTERM, or `check`
//      found nothing (including when the `prototype` block is absent).
//   1  `check` found finding(s) (one line per finding on stdout, or `--json` with a `findings`
//      array).
//   2  usage error (an idea with no letter or digit, an invalid or too-late `--stem`, `--stem` on a
//      brief or stem argument), a missing `prototype` config block (naming `prototype`), a refused `--mark`
//      precondition (stale branch, empty states.json, missing overlay import at round-done,
//      unapproved or already-contracted prototype, no behaviour pins, an undeclared
//      picture/e2eList/e2eRun, a failed or non-PNG picture, a test file missing, uncommitted, not
//      carrying or not listing a behaviour pin's title, tests red against the prototype, a failed
//      spec-queue add, a dirty prototype worktree at close, or a mark from a state that does not
//      accept it), a malformed status.json/states.json/contract.json, or `serve --port N` refusing
//      an already-bound port (named, with a remedy — never an unhandled EADDRINUSE crash).

'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')
const { writeOut, appendLedger } = require('./lib/driver-io')
const { readConfigStrict, CONFIG_RELPATH } = require('./lib/host-config')
const contractLib = require('./lib/contract')
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
  die('usage: prototype-driver <idea in words | brief path | stem> [--stem <name>] [--root <dir>] [--state] [--mark opened|round-done|approved|contracted|tests-derived|closed] [serve --port <n>] [check [--json]] | prototype-driver check [--root <dir>] [--json]')
}
// `check` is the one subcommand doctor check 23 invokes with no brief (a host-wide config check
// has no brief to derive a stem/branch/worktree from) — every other form still needs one.
const briefLess = argv[0] === 'check'
const inputArg = briefLess ? null : argv[0]
let rest = briefLess ? argv.slice(0) : argv.slice(1)
const root = path.resolve(flagArg(rest, '--root') || process.cwd())
rest = withoutFlagPair(rest, '--root')
const stemFlagGiven = rest.includes('--stem')
const stemFlag = flagArg(rest, '--stem')
rest = withoutFlagPair(rest, '--stem')
if (stemFlagGiven && (stemFlag === undefined || stemFlag === null || stemFlag.startsWith('--'))) {
  die('--stem needs a name — remedy: --stem <name> (lowercase letters, digits and `-`, at most 48 characters)')
}

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
    die('no "prototype" config block in ' + CONFIG_RELPATH + ' — the block declares how a throwaway build of this app runs: where it answers (url), where the pin overlay goes (overlay), how its pictures and contract tests are made (picture, e2eFile, e2eList, e2eRun); remedy: declare it (spec/templates/grounding-contract.md § Prototype), then run /spec:doctor')
  }
}

const cfg = loadConfig()

// ---------------------------------------------------------------------------
// check [--json] (D2, doctor check 23) — the one subcommand that runs even with no `prototype`
// block (an absent block reads as clean: "0 when clean or when the block is absent"). Findings
// are the keys a mark will read: a key no step uses is never a finding.
// ---------------------------------------------------------------------------
function cmdCheck(args) {
  const asJson = args.includes('--json')
  const findings = []
  const proto = cfg.prototype
  if (proto) {
    if (typeof proto.e2eFile === 'string' && !proto.e2eFile.includes('{stem}')) {
      findings.push({ key: 'prototype.e2eFile', message: 'prototype.e2eFile lacks the {stem} placeholder: ' + proto.e2eFile })
    }
    if (typeof proto.e2eList === 'string' && !proto.e2eList.includes('{file}')) {
      findings.push({ key: 'prototype.e2eList', message: 'prototype.e2eList lacks the {file} placeholder: ' + proto.e2eList })
    }
    if (typeof proto.e2eRun !== 'string' || proto.e2eRun === '') {
      findings.push({ key: 'prototype.e2eRun', message: 'prototype.e2eRun is not declared — the tests-derived mark cannot run the tests against the prototype without it' })
    } else if (!proto.e2eRun.includes('{file}')) {
      findings.push({ key: 'prototype.e2eRun', message: 'prototype.e2eRun lacks the {file} placeholder: ' + proto.e2eRun })
    }
    if (typeof proto.picture !== 'string' || proto.picture === '') {
      findings.push({ key: 'prototype.picture', message: 'prototype.picture is not declared — the contracted mark cannot make a picture of a screen without it' })
    } else {
      const missing = ['{url}', '{out}'].filter((t) => !proto.picture.includes(t))
      if (missing.length > 0) {
        findings.push({ key: 'prototype.picture', message: 'prototype.picture lacks the ' + missing.join(' and ') + ' placeholder: ' + proto.picture })
      }
    }
  }
  if (asJson) {
    writeOut(1, JSON.stringify({ findings }) + '\n')
  } else {
    for (const f of findings) writeOut(1, f.message + '\n')
  }
  process.exit(findings.length === 0 ? 0 : 1)
}

if (rest[0] === 'check') cmdCheck(rest.slice(1))

// Every other subcommand needs a brief path — `check` above is the sole brief-less form.
if (briefLess) {
  die('usage: prototype-driver check [--root <dir>] [--json] — every other subcommand needs an idea, a brief path or a stem: prototype-driver <idea | brief path | stem> [--root <dir>] ...')
}

// ---------------------------------------------------------------------------
// Derived paths (D2) — all on the MAIN tree, never the prototype branch.
// ---------------------------------------------------------------------------
const STEM_RE = /^[a-z0-9][a-z0-9-]{0,47}$/
function slugOf(text) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (slug.length <= 48) return slug
  const cut = slug.slice(0, 48)
  if (slug[48] === '-') return cut
  const at = cut.lastIndexOf('-')
  return (at > 0 ? cut.slice(0, at) : cut).replace(/-+$/, '')
}
function statusOfStem(s) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'design/prototypes', s, 'status.json'), 'utf8')) } catch { return null }
}
// The stem a words idea was opened under, if any — the stem is fixed from `--mark opened` on.
function openedStemFor(idea) {
  let names = []
  try { names = fs.readdirSync(path.join(root, 'design/prototypes')) } catch { return null }
  for (const n of names) {
    const st = statusOfStem(n)
    if (st && st.marks && st.marks.opened && st.input && st.input.kind === 'words' && st.input.idea === idea) return n
  }
  return null
}
function resolveInput(arg) {
  // (a) brief — an existing .md file against --root.
  const abs = path.resolve(root, arg)
  let isBrief = false
  try { isBrief = abs.endsWith('.md') && fs.statSync(abs).isFile() } catch { isBrief = false }
  if (isBrief) {
    const base = path.basename(abs, path.extname(abs))
    return { kind: 'brief', stem: base, briefRel: path.relative(root, abs).split(path.sep).join('/'), idea: null }
  }
  // (b) stem — design/prototypes/<arg>/status.json exists.
  const st = STEM_RE.test(arg) ? statusOfStem(arg) : null
  if (st) {
    return { kind: 'stem', stem: arg, briefRel: st.input && st.input.brief ? st.input.brief : null,
      idea: st.input && typeof st.input.idea === 'string' ? st.input.idea : null, storedBrief: st.brief }
  }
  // (c) words.
  const slug = slugOf(arg)
  if (slug === '') die('usage: give the idea in a few words, a brief path, or a prototype stem')
  return { kind: 'words', stem: slug, briefRel: null, idea: arg }
}
const input = resolveInput(inputArg)
if (stemFlagGiven) {
  if (input.kind === 'words') {
    const fixed = openedStemFor(input.idea)
    if (fixed && fixed !== stemFlag) {
      die('the stem is fixed once opened — re-open with ' + fixed)
    }
    if (!STEM_RE.test(stemFlag)) {
      die('--stem ' + JSON.stringify(stemFlag) + ' is not a valid stem — remedy: --stem <name> matching ^[a-z0-9][a-z0-9-]{0,47}$ (lowercase letters, digits and `-`)')
    }
    input.stem = stemFlag
  } else {
    const st = statusOfStem(input.stem)
    if (st && st.marks && st.marks.opened) die('the stem is fixed once opened — re-open with ' + input.stem)
    die('--stem applies to the words shape only — remedy: drop --stem, or pass the idea in words instead of ' + inputArg)
  }
}
if (input.kind === 'words') {
  const taken = statusOfStem(input.stem)
  if (taken && !(taken.input && taken.input.idea === input.idea)) {
    die('the stem ' + input.stem + ' already belongs to another prototype — remedy: re-run with --stem <name> for a new name, or pass the stem ' + input.stem + ' to re-open it')
  }
}
const stem = input.stem
// A brief id is NN plus an optional letter (04, 04a) — spec-status.js's normBrief shape. Taking the
// digits alone stamps a lettered brief with its neighbour's id. A words prototype has no brief: n/a.
const briefNumMatch = stem.match(/^(\d+[a-z]?)(?:-|$)/)
const brief = input.kind === 'words' ? 'n/a'
  : input.kind === 'stem' ? (input.storedBrief || 'n/a')
    : (briefNumMatch ? briefNumMatch[1] : stem)
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
// The argument every printed `node <driver> <arg>` line carries: the stem once opened (whatever
// shape opened it), before that the shape's own argument (words quoted, plus --stem when chosen).
let lastStatus = null
function shellQuote(text) { return '"' + text.replace(/(["\\$`])/g, '\\$1') + '"' }
function argText(status) {
  const st = status === undefined ? lastStatus : status
  if (st && st.marks && st.marks.opened) return stem
  if (input.kind === 'words') return shellQuote(input.idea) + (stemFlagGiven ? ' --stem ' + stem : '')
  return inputArg
}
function loadStatus() {
  if (!fs.existsSync(statusPath)) return null
  try {
    return (lastStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8')))
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
  lastStatus = status
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

// The session stays anchored in the main checkout for every step (each driver call is
// `--root .`) yet ROUND and TESTS have it Edit files inside the prototype worktree — a write
// block-cross-worktree-writes.sh refuses unless the TARGET tree's private git dir carries the
// `scratch-worktree` marker. The prototype worktree is exactly that kind of harness-made
// throwaway sink, so the driver plants the marker: at open, and again on every ROUND/TESTS
// step print so a prototype opened before this existed (or a re-attached worktree) heals.
// Returns false when the tree has no linked private git dir to hold it.
function plantScratchMarker(wtPath) {
  const r = spawnSync('git', ['-C', wtPath, 'rev-parse', '--git-dir'], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout.trim()) return false
  const raw = r.stdout.trim()
  const gitDirAbs = path.isAbsolute(raw) ? raw : path.resolve(wtPath, raw)
  if (!gitDirAbs.split(path.sep).includes('worktrees')) return false
  try { fs.writeFileSync(path.join(gitDirAbs, 'scratch-worktree'), '') } catch { return false }
  return true
}

function deriveState(status) {
  // marks.closed and marks.testsDerived are checked BEFORE the worktreeIsRegistered() probe: by
  // CLOSED the worktree is gone, and CONTRACTED is a resting state the worktree may not outlive
  // (removed by hand) — probing first would misreport either as OPEN (specs/20261007/01 D7).
  if (status && status.marks && status.marks.closed) return 'CLOSED'
  if (status && status.marks && status.marks.testsDerived) return 'CONTRACTED'
  if (!status || !status.marks || !status.marks.opened || !worktreeIsRegistered()) return 'OPEN'
  if (!status.marks.approved) return 'ROUND'
  if (!status.marks.contracted) return 'APPROVED'
  return 'TESTS'
}

function printCheckpoint(prevState, nextState) {
  writeOut(1, '✅ checkpoint — prototype state saved (' + prevState + ' → ' + nextState +
    '); safe to /clear and re-run /spec:prototype ' + argText() + '\n')
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

  if (!plantScratchMarker(wtPath)) {
    die('could not mark ' + worktreeRel + ' as a scratch worktree — the session\'s edits into it would be blocked; remedy: confirm it is a linked worktree with git worktree list, then re-run --mark opened')
  }

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
  status.input = existingStatus && existingStatus.input
    ? existingStatus.input
    : { kind: input.kind, brief: input.briefRel, idea: input.idea }
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
// --mark contracted (D4, specs/20261007/01-approve-writes-a-behaviour-contract.md).
// ---------------------------------------------------------------------------
function readContractOrDie() {
  let raw
  try {
    raw = fs.readFileSync(contractPath, 'utf8')
  } catch (e) {
    die(contractRel + ' does not exist (' + e.message + ') — remedy: run --mark contracted first')
    return null // unreachable
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    die(contractRel + ' is not valid JSON (' + e.message + ')')
    return null // unreachable
  }
}

// A pin's anchor is a bare id string in a contract, an `{ id }` object as the pin endpoint stores
// it, or absent (a screen note).
function anchorIdOf(anchor) {
  if (typeof anchor === 'string' && anchor !== '') return anchor
  if (anchor && typeof anchor.id === 'string' && anchor.id !== '') return anchor.id
  return null
}

function e2eFileOf() {
  return (proto.e2eFile || '').split('{stem}').join(stem)
}

function cmdMarkContracted() {
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: run --mark opened first')
  // D4(1)
  if (!status.marks || !status.marks.approved) {
    die('prototype is not yet approved — remedy: run --mark round-done then --mark approved before --mark contracted')
  }
  if (status.marks.contracted) {
    die(contractRel + ' is already written — remedy: run --mark tests-derived (or --mark closed to abandon the prototype)')
  }
  const prevState = deriveState(status)

  // D4(2): at least one behaviour pin.
  const pins = loadPinsDoc().pins || []
  if (!pins.some((p) => p.kind === 'behaviour')) {
    die('no behaviour pins — a prototype that changed no behaviour is the direct lane; mark a pin behaviour or close the prototype with --mark closed')
  }

  // D4(3): states.json with a route and a valid viewport.
  const statesDoc = loadStatesOrNull()
  if (!statesHasRoutes(statesDoc)) {
    die(statesRel + ' has no routes — remedy: author it with at least one route carrying at least one state')
  }
  // A malformed value is refused, never silently replaced by the default: the default would
  // picture at a size the author did not ask for.
  const isPosInt = (n) => Number.isInteger(n) && n > 0
  let viewport = { width: 1280, height: 800 }
  if (statesDoc.viewport !== undefined) {
    const v = statesDoc.viewport
    if (!v || typeof v !== 'object' || !isPosInt(v.width) || !isPosInt(v.height)) {
      die(statesRel + ': viewport must be { width, height } positive integers — got ' + JSON.stringify(v) +
        '; remedy: fix or remove it (absent = 1280x800), then re-run --mark contracted')
    }
    viewport = { width: v.width, height: v.height }
  }

  // D4(4)
  if (typeof proto.picture !== 'string' || proto.picture === '') {
    die('prototype.picture is not declared — remedy: declare it (spec/templates/grounding-contract.md § Prototype), then run /spec:doctor')
  }

  // D4(5): one picture per route x state at the resolved app address.
  const address = appAddress(status)
  const pictured = contractLib.pictureAll({
    root, worktreePath, designDir, config: cfg, statesDoc, viewport, baseUrl: address.url,
    env: { PROTO_BRANCH: branch, PROTO_WORKTREE: worktreePath, PROTO_BRIEF: brief },
  })
  if (!pictured.ok) die(pictured.message)

  // D4(6): contract.json — every pin as a record, tests null until tests-derived.
  contractLib.writeContract({
    designDir, stem, brief: status.brief || brief, idea: status.input && typeof status.input.idea === 'string' ? status.input.idea : null,
    approvedAt: status.marks.approved, base: status.base, viewport, routes: pictured.routes,
    pins: pins.map((p) => ({
      id: p.id, kind: p.kind, screen: p.screen, state: p.state,
      anchor: anchorIdOf(p.anchor), note: p.note, round: p.round,
    })),
    tests: null,
  })

  // D4(7)
  status.marks.contracted = nowIso()
  saveStatus(status)
  printCheckpoint(prevState, deriveState(status))
}

// ---------------------------------------------------------------------------
// --mark tests-derived (D6).
// ---------------------------------------------------------------------------
function cmdMarkTestsDerived() {
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: run --mark opened first')
  // D6(1)
  if (!status.marks || !status.marks.contracted) {
    die('prototype is not yet contracted — remedy: run --mark contracted first')
  }
  const prevState = deriveState(status)
  const contract = readContractOrDie()
  // Everything below already ran to completion: a re-run is a no-op checkpoint.
  if (status.marks.testsDerived) printCheckpoint(prevState, deriveState(status))

  const e2eFile = e2eFileOf()
  const behaviourPins = (contract.pins || []).filter((p) => p.kind === 'behaviour')
  const gitOk = (args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }).status === 0
  const wtRel = status.worktree || worktreeRel
  const wtAbs = path.join(root, wtRel)
  const rerun = ', then re-run --mark tests-derived'

  // D6(2): the test file is committed on proto/<stem>.
  if (fs.existsSync(path.join(root, e2eFile)) && !gitOk(['cat-file', '-e', status.base + ':' + e2eFile])) {
    die(e2eFile + ' is in the main working tree — derived tests live on ' + branch + ', never on ' + status.base +
      '; remedy: move it to ' + wtRel + '/' + e2eFile + ', commit it on ' + branch + rerun)
  }
  if (!gitOk(['cat-file', '-e', branch + ':' + e2eFile])) {
    die(e2eFile + ' is not committed on ' + branch + ' — remedy: write the derived tests at ' + wtRel + '/' + e2eFile +
      ', commit them on ' + branch + rerun)
  }
  const dirty = spawnSync('git', ['-C', wtAbs, 'status', '--porcelain', '--', e2eFile], { encoding: 'utf8' })
  if ((dirty.stdout || '').trim() !== '') {
    die(e2eFile + ' has uncommitted edits in ' + wtRel + ' — remedy: commit them on ' + branch + rerun)
  }

  // D6(3): every behaviour pin has a test title in the committed file.
  const shown = spawnSync('git', ['-C', root, 'show', branch + ':' + e2eFile], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
  const e2eText = shown.stdout || ''
  for (const p of behaviourPins) {
    if (!e2eText.includes('pin ' + p.id + ':')) {
      die(e2eFile + ' does not carry pin ' + p.id + ': — remedy: add a test whose title starts with pin ' + p.id + ':' + rerun)
    }
  }

  // D6(4): the host runner lists every pin's test (the runner is the oracle, never the file alone).
  if (typeof proto.e2eList !== 'string' || !proto.e2eList) {
    die('prototype.e2eList is not declared — remedy: declare it (spec/templates/grounding-contract.md § Prototype)')
  }
  const listCmd = proto.e2eList.split('{file}').join(e2eFile)
  const listRun = spawnSync('bash', ['-c', listCmd], { cwd: wtAbs, encoding: 'utf8' })
  const listedOut = listRun.stdout || ''
  if (listRun.status !== 0) {
    die('e2eList (' + listCmd + ') exited ' + listRun.status + ': ' + (listedOut + (listRun.stderr || '')).trim())
  }
  for (const p of behaviourPins) {
    if (!listedOut.includes('pin ' + p.id + ':')) {
      die('e2eList (' + listCmd + ') did not report pin ' + p.id + ': as listed — the host runner is the oracle, not the file content: confirm ' +
        e2eFile + ' matches the runner\'s own test-discovery pattern')
    }
  }

  // D6(5): the tests are green against the prototype they describe.
  if (typeof proto.e2eRun !== 'string' || !proto.e2eRun) {
    die('prototype.e2eRun is not declared — remedy: declare it (spec/templates/grounding-contract.md § Prototype)')
  }
  const runCmd = proto.e2eRun.split('{file}').join(e2eFile)
  const address = appAddress(status)
  const run = spawnSync('bash', ['-c', runCmd], {
    cwd: wtAbs, encoding: 'utf8', env: Object.assign({}, process.env, { PROTO_URL: address.url }),
  })
  const logPath = path.join(designDir, 'e2e.log')
  fs.mkdirSync(designDir, { recursive: true })
  fs.writeFileSync(logPath, (run.stdout || '') + (run.stderr || ''))
  if (run.status !== 0) {
    die('contract tests red against the prototype (e2eRun exited ' + run.status + ') — a derived test must pass on the prototype it describes; see ' +
      path.relative(root, logPath))
  }

  // D6(6): the copy that reaches the production build without the branch.
  const copied = contractLib.copyContractTests({ root, branch, e2eFile, designDir })
  if (!copied.ok) die(copied.message)

  // D6(7): complete the contract.
  contract.tests = { file: copied.file, source: e2eFile, run: proto.e2eRun, pins: behaviourPins.map((p) => p.id) }
  fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2) + '\n')

  // D6(8): the ledger row, once. marks.testsDerived is set last (step 10), so a crash between this
  // append and that mark is guarded by status.ledgered rather than appending a second row.
  if (!status.ledgered) {
    let stateCount = 0
    for (const states of Object.values(contract.routes || {})) stateCount += Object.keys(states || {}).length
    const row = contractLib.ledgerRow({
      stem, brief: contract.brief || brief, branch, rounds: (status.rounds || []).length,
      pinsTotal: (contract.pins || []).length, pinsBehaviour: behaviourPins.length,
      pinsLook: (contract.pins || []).length - behaviourPins.length,
      routes: Object.keys(contract.routes || {}).length, states: stateCount, captures: stateCount,
      contract: contractRel,
    })
    appendLedger(root, JSON.stringify(row))
    status.ledgered = nowIso()
    saveStatus(status)
  }

  // D6(9): queue the plan paste at the top, once.
  const paste = '/spec:plan ' + contractRel
  if (!status.queued) {
    const queued = spawnSync(process.execPath, [path.join(__dirname, 'spec-queue.js'), 'add', paste, '--top'], { cwd: root, encoding: 'utf8' })
    if (queued.status !== 0) {
      die('spec-queue add failed (exit ' + queued.status + '): ' + ((queued.stdout || '') + (queued.stderr || '')).trim() +
        ' — remedy: fix the queue, then re-run --mark tests-derived')
    }
    status.queued = (queued.stdout || '').trim() || 'added'
    saveStatus(status)
  }

  // D6(10)
  status.marks.testsDerived = nowIso()
  saveStatus(status)
  writeOut(1, 'Next: ' + paste + '\n')
  printCheckpoint(prevState, deriveState(status))
}

// ---------------------------------------------------------------------------
// --mark closed (D9).
// ---------------------------------------------------------------------------
function cmdMarkClosed() {
  const status = loadStatus()
  if (!status) die(statusRel + ' does not exist — remedy: nothing to close; run --mark opened to start a prototype')
  const prevState = deriveState(status)
  if (!['ROUND', 'APPROVED', 'TESTS', 'CONTRACTED'].includes(prevState)) {
    die('--mark closed is accepted from ROUND, APPROVED, TESTS or CONTRACTED — this prototype is ' + prevState +
      '; remedy: run the bare command to see the current step')
  }
  // dbDestroy is recorded as its own postcondition (marks.dbDestroyed), persisted immediately after
  // it succeeds and BEFORE worktree removal is attempted, so a resume after a dirty-worktree
  // refusal never re-invokes a non-idempotent dbDestroy.
  const dbResult = contractLib.runDbDestroy({
    config: cfg, worktreePath, branch, brief, alreadyRan: !!(status.marks && status.marks.dbDestroyed),
  })
  if (!dbResult.ok) die(dbResult.message)
  if (dbResult.ran) {
    status.marks.dbDestroyed = nowIso()
    saveStatus(status)
  }
  const removed = contractLib.removeProtoWorktreeAndBranch({ root, worktreePath, branch, stem, rerun: '--mark closed' })
  if (!removed.ok) die(removed.message)
  status.marks.closed = nowIso()
  saveStatus(status)
  printCheckpoint(prevState, deriveState(status))
}

function cmdMark(name) {
  if (name === 'opened') return cmdMarkOpened()
  if (name === 'round-done') return cmdMarkRoundDone()
  if (name === 'approved') return cmdMarkApproved()
  if (name === 'contracted') return cmdMarkContracted()
  if (name === 'tests-derived') return cmdMarkTestsDerived()
  if (name === 'closed') return cmdMarkClosed()
  die('--mark ' + name + ' is unknown — remedy: --mark opened|round-done|approved|contracted|tests-derived|closed')
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
        '`), then re-run: node ' + driverAbs + ' ' + argText(loadStatus()) + ' serve --port ' + port)
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
  if (input.kind === 'words' && !stemFlagGiven) {
    lines.push('📌 Auto-picked stem ' + stem + ' — from your words (veto: re-run with --stem <name>)')
  }
  lines.push('[prototype-driver] state: OPEN  prototype: ' + stem)
  lines.push('## Step: author states.json, then --mark opened')
  lines.push('Author ' + statesRel + ' with at least one route carrying at least one state:')
  lines.push(template)
  lines.push('The overlay import is wired in the ROUND step, once the worktree exists.')
  lines.push('Then:')
  lines.push('  node ' + driverAbs + ' ' + argText() + ' --mark opened')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function probeUrl(url) {
  const r = spawnSync('curl', ['-sf', '-m', '3', url], { encoding: 'utf8' })
  return r.status === 0
}

function printRoundStep(status) {
  if (worktreeIsRegistered()) plantScratchMarker(worktreePath)
  const roundNum = (status.rounds || []).length + 1
  const statesDoc = loadStatesOrNull()
  const lines = []
  lines.push('[prototype-driver] state: ROUND  prototype: ' + stem + '  round: ' + roundNum)
  lines.push('## Step: pin round ' + roundNum + ' on ' + branch)
  lines.push('Read only: ' + pinsRel + ', ' + statesRel)
  if (!status.wiring) {
    lines.push('Session: wire the dev-only overlay import into the host\'s dev entry in ' + worktreeRel + ' and commit it on ' +
      branch + ' (skip if main already carries it): ' + overlayImportLine())
  }
  const address = appAddress(status)
  lines.push('Session: in ' + worktreeRel + ', start the dev server in the background (tracked): ' +
    (address.port ? 'PORT=' + address.port + ' ' : '') + (cfg.runtime && cfg.runtime.bootCommand))
  lines.push('Session: start the pin endpoint in the background (tracked): node ' + driverAbs + ' ' + argText() + ' serve --port ' + status.pinsPort)
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
  lines.push('Reply `approve` to write the contract; anything else is a change for this session to apply on ' + branch + ', then:')
  lines.push('  node ' + driverAbs + ' ' + argText() + ' --mark round-done')
  lines.push('Then (only on the literal `approve`):')
  lines.push('  node ' + driverAbs + ' ' + argText() + ' --mark approved')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

function printApprovedStep() {
  const lines = []
  lines.push('[prototype-driver] state: APPROVED  prototype: ' + stem)
  lines.push('## Step: write the behaviour contract')
  lines.push('Read only: pins.json, states.json')
  lines.push('Then:')
  lines.push('  node ' + driverAbs + ' ' + argText() + ' --mark contracted')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// TESTS bare-run printer (D5).
// ---------------------------------------------------------------------------
function printTestsStep() {
  if (worktreeIsRegistered()) plantScratchMarker(worktreePath)
  const contract = readContractOrDie()
  const st = loadStatus() || {}
  const e2eFile = e2eFileOf()
  const lines = []
  lines.push('[prototype-driver] state: TESTS  prototype: ' + stem)
  lines.push('## Step: derive one end-to-end test per behaviour pin')
  lines.push('Read only: ' + contractRel + ', ' + pinsRel)
  for (const p of (contract.pins || []).filter((x) => x.kind === 'behaviour')) {
    lines.push('pin ' + p.id + ' · ' + (p.screen || '?') + ' (' + (p.state || '?') + ') · ' +
      (anchorIdOf(p.anchor) || 'screen note') + ' · "' + (p.note || '') + '"')
  }
  lines.push('File: ' + (st.worktree || worktreeRel) + '/' + e2eFile + ' (prototype worktree — commit it on ' + branch + ') · title: `pin <id>: <note>`')
  const address = appAddress(st)
  lines.push('Session: start the dev server in the background (tracked): ' +
    (address.port ? 'PORT=' + address.port + ' ' : '') + (cfg.runtime && cfg.runtime.bootCommand))
  lines.push('Session: write one test per line above in the prototype worktree and commit the file on ' + branch +
    '; each test must pass against the prototype and fail against ' + (st.base || contract.base))
  lines.push('Then:')
  lines.push('  node ' + driverAbs + ' ' + argText() + ' --mark tests-derived')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// CONTRACTED bare-run printer (D7): the resting state — hands the contract to /spec:plan.
// ---------------------------------------------------------------------------
function printContractedStep() {
  const lines = []
  lines.push('[prototype-driver] state: CONTRACTED  prototype: ' + stem)
  lines.push('Read only: ' + contractRel)
  lines.push('Next: /spec:plan ' + contractRel)
  lines.push('Close (when every spec citing ' + stem + ' is done, or to abandon): node ' + driverAbs + ' ' + argText() + ' --root ' + root + ' --mark closed')
  writeOut(1, lines.join('\n') + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// CLOSED bare-run printer (D7): `Read only:` + `Next:` (spec-status --next, verbatim).
// ---------------------------------------------------------------------------
function printClosedStep() {
  const lines = []
  lines.push('[prototype-driver] state: CLOSED  prototype: ' + stem)
  lines.push('Read only: ' + contractRel)
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
  else if (state === 'CONTRACTED') printContractedStep()
  else printClosedStep()
}
