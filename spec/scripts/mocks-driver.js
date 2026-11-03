#!/usr/bin/env node
// mocks-driver.js [--root <dir>] [--state]
// mocks-driver.js --root <dir> --mark seed-done|journey-drawn|journey-approved|approved [--journey <j>] [--waive --reason <r>]
// mocks-driver.js --root <dir> round push | round pull
// mocks-driver.js --root <dir> --reopen journey:<j>
//
// Owner: specs/20261002/01-the-wireframe-command-runs-over-the-service.md.
//
// WHY: ADR-0029's
// confirm gate, amended; ADR-0030; ADR-0031's one door to the network. This driver derives
// SEED -> SCREENS -> APPROVED on every invocation from design/mocks/status.json (schemaVersion 3)
// plus the seed (`design/mocks/seed.md`, parsed by lib/surfaces.js) and prints the one step that
// needs the session's judgment. A project whose config carries a `walkthrough` object block is in
// service mode: the session draws one json-render file per screen under design/mocks/screens/,
// `round push` sends the round, `round pull` prints the worklist, and the client's confirmation
// on the service is read back from design/rounds/<n>/approvals.json. Any other project is in
// terminal mode: nothing is drawn or sent, and each story is confirmed by the user's literal
// `approve`. The round itself is lib/mocks-round.js's; every request is made by running
// scripts/walkthrough.js as a child process.
//
// What this deliberately does NOT do:
//   - author the seed or a screen, or judge whether a screen looks right — session work;
//   - require the walkthrough client as a library, make a request itself, or print or write the
//     token (the child reads it from the environment variable the config names);
//   - re-derive the story hash (lib/surfaces.js beatHash is the one), or trust a mark over the
//     artifact it closed (a seed edit reopens its journey by itself);
//   - delete a file on `--reopen`, relocate the session CWD, or move aside or refuse a status file of
//     another schemaVersion (it is read as-is);
//   - keep any provenance record besides the story hash a journey approval stores, or read a
//     design/mocks/ledger.md left on disk.
// Every accepted mark ends with the checkpoint line the contract in spec/doctrine/mocks.md binds.
//
// Exit codes:
//   0  a bare run printed the current step, `--state` printed the state, an accepted mark or
//      reopen recorded its result, or a push or pull finished;
//   1  `--mark seed-done` refused a seed journey with no job story first line or no
//      `@first-run`/`@empty` beat;
//   2  every refusal: an unknown command, a failed mark precondition, a round with findings,
//      or a failed child call to the service.

'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const core = require('./lib/driver-core')
const { writeOut, nowIso, flagArg } = core
const { parseSeedJourneys, beatHash, JOB_STORY_RE, OFF_PATH_STATES } = require('./lib/surfaces')
const { readConfig, policy } = require('./lib/host-config')
const round = require('./lib/mocks-round')

const die = core.makeDie('mocks-driver')
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const { root, rest } = core.takeRoot(process.argv.slice(2), die)

const mocksDir = path.join(root, 'design/mocks')
const statusPath = path.join(mocksDir, 'status.json')
const seedPath = path.join(mocksDir, 'seed.md')
const screensRel = 'design/mocks/screens'
const templatesRoot = path.join(__dirname, '..', 'templates')
const WALK = path.join(__dirname, 'walkthrough.js')

const SKILL_LINE = 'Skill: mock-authoring — load it before the first edit'

// ---------------------------------------------------------------------------
// Unknown commands refuse before any file is read or written.
// ---------------------------------------------------------------------------
function checkRetired() {
  const first = rest[0]
  if (first !== undefined && !['--state', '--mark', '--reopen', 'round'].includes(first)) {
    die('unknown command "' + first + '" — remedy: run with no argument to print the current step')
  }
}
checkRetired()

// ---------------------------------------------------------------------------
// status.json (schemaVersion 3). A cold root creates the status file and the seed.
// ---------------------------------------------------------------------------
function freshStatus() {
  return {
    schemaVersion: 3, state: 'SEED', marks: { seedDone: null, approved: null },
    journeys: {}, pushed: null, reopens: [], lastUpdated: null,
  }
}

function readStatusFile() {
  if (!fs.existsSync(statusPath)) {
    fs.mkdirSync(mocksDir, { recursive: true })
    if (!fs.existsSync(seedPath)) fs.copyFileSync(path.join(templatesRoot, 'mocks-seed.md'), seedPath)
    const f = freshStatus()
    core.writeJson(statusPath, f)
    return f
  }
  return core.readJsonOrNull(statusPath, die, (e) => 'design/mocks/status.json is not valid JSON (' + e.message + ') — remedy: restore it from git history, or delete it (a fresh root is a valid starting point) and re-run')
}

const rawStatus = readStatusFile()

function normalise(raw0) {
  // A file of another schemaVersion (the retired flow) carries no marks this driver honours: it derives SEED.
  const raw = isObj(raw0) && raw0.schemaVersion === 3 ? raw0 : {}
  const marks = isObj(raw.marks) ? raw.marks : {}
  return {
    schemaVersion: 3, state: raw.state,
    marks: { seedDone: marks.seedDone || null, approved: marks.approved || null },
    journeys: isObj(raw.journeys) ? raw.journeys : {},
    pushed: isObj(raw.pushed) ? raw.pushed : null,
    reopens: Array.isArray(raw.reopens) ? raw.reopens : [],
    lastUpdated: raw.lastUpdated || null,
  }
}

let status = normalise(rawStatus)

function saveStatus() {
  status.schemaVersion = 3
  status.state = deriveState()
  core.saveStatusFile(statusPath, status)
}

// ---------------------------------------------------------------------------
// Mode: the config block's presence — a non-null, non-array object — is service mode.
// ---------------------------------------------------------------------------
function walkBlock() { return readConfig(root).walkthrough }
function serviceMode() { const b = walkBlock(); return isObj(b) }
function requireService() {
  if (!serviceMode()) {
    die('this project has no walkthrough block, so nothing is drawn or sent — remedy: confirm the story in the terminal with --mark journey-approved --journey <j>')
  }
}
function projectLink() {
  const b = walkBlock()
  const base = isObj(b) && typeof b.baseUrl === 'string' ? b.baseUrl.trim().replace(/\/+$/, '') : ''
  const project = isObj(b) && typeof b.project === 'string' ? b.project : ''
  return base + '/p/' + project
}

// ---------------------------------------------------------------------------
// seed.md — the journey set: `### <journey>` blocks, in seed order, via lib/surfaces.js.
// ---------------------------------------------------------------------------
function seedTextOrNull() {
  try { return fs.readFileSync(seedPath, 'utf8') } catch { return null }
}
function currentSeedJourneys() { return parseSeedJourneys(seedTextOrNull()) }

function journeyIsDrawn(name) {
  const st = status.journeys[name]
  return !!(st && st.drawn)
}

// A journey counts as approved only while its stored hash still matches the seed's CURRENT beats.
function journeyIsApproved(name, beats) {
  const st = status.journeys[name]
  return !!(st && st.approved && st.beats === beatHash(beats))
}

function seedProblem(seedJourneys) {
  for (const [name, j] of seedJourneys) {
    if (j.malformed.length > 0) {
      return 'design/mocks/seed.md journey "' + name + '" has malformed beat line(s), first: ' + j.malformed[0] +
        ' — remedy: rewrite the block as numbered "sentence" -> screen[@state] lines (spec/doctrine/mocks.md § Mocks: Seed)'
    }
    if (j.beats.length === 0) {
      return 'design/mocks/seed.md journey "' + name + '" declares zero beats' +
        ' — remedy: rewrite the block as numbered "sentence" -> screen[@state] lines (spec/doctrine/mocks.md § Mocks: Seed)'
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// State derivation — the only place SEED/SCREENS/APPROVED is decided.
// ---------------------------------------------------------------------------
function deriveState() {
  if (!status.marks.seedDone) return 'SEED'
  const seed = currentSeedJourneys()
  if (seed.size === 0 || seedProblem(seed)) return 'SEED'
  for (const [name, j] of seed) if (!journeyIsApproved(name, j.beats)) return 'SCREENS'
  if (!status.marks.approved) return 'SCREENS'
  for (const [name] of seed) {
    if (status.journeys[name].approved > status.marks.approved) return 'SCREENS'
  }
  return 'APPROVED'
}

// The checkpoint contract: the checkpoint line, last.
function printAcceptedTail(prevState, nextState) {
  core.checkpoint('mocks', prevState, nextState, '/spec:mocks')
}

// ---------------------------------------------------------------------------
// The child calls: every request is `walkthrough.js` run as a child process.
// ---------------------------------------------------------------------------
function walk(args) {
  const r = spawnSync(process.execPath, [WALK, ...args, '--root', root, '--json'],
    { encoding: 'utf8', env: process.env, maxBuffer: 256 * 1024 * 1024 })
  if (r.error || r.status === null) {
    die('walkthrough.js could not run (' + (r.error ? r.error.message : 'killed by signal ' + r.signal) + ') — remedy: run `node ' + WALK + ' hello --root ' + root + '` to see the raw error')
  }
  let ans = null
  try { ans = JSON.parse(r.stdout) } catch { ans = null }
  return { status: r.status, stderr: r.stderr || '', ans }
}

function finish(r, verb) {
  if (r.stderr) writeOut(2, r.stderr)
  if (r.ans && Array.isArray(r.ans.findings)) for (const f of r.ans.findings) writeOut(2, findingLine(f) + '\n')
  if (!r.stderr && !(r.ans && Array.isArray(r.ans.findings) && r.ans.findings.length)) {
    writeOut(2, 'mocks-driver: walkthrough ' + verb + ' failed with exit ' + r.status + ' and no message — remedy: run `node ' + WALK + ' ' + verb + ' --root ' + root + '` to see the raw error\n')
  }
  process.exit(2)
}

function walkOrDie(args) {
  const r = walk(args)
  if (r.status !== 0) finish(r, args[0])
  return r
}

function findingLine(f) {
  const place = f.screen ? f.screen + (f.state ? '@' + f.state : '') : 'round'
  return f.code + ' — ' + place + (f.element ? ' [' + f.element + ']' : '') + ': ' + f.detail
}

let walkFiles = null
function walkContract() {
  if (!walkFiles) {
    const dir = path.join(templatesRoot, 'walkthrough')
    walkFiles = {
      contract: JSON.parse(fs.readFileSync(path.join(dir, 'contract.json'), 'utf8')),
      catalog: JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8')),
    }
  }
  return walkFiles
}

function drawnIds(seed, extra) {
  const ids = []
  for (const [name] of seed) if (journeyIsDrawn(name) || name === extra) ids.push(name)
  return ids
}

// Assembles the would-be round of `ids`; refuses (exit 2) with one stderr line per finding.
function assembledOrDie(seed, ids, remedy) {
  const { screens, findings: fileFindings } = round.readScreens(root)
  const assembled = round.assembleRound(seed, ids, screens)
  const { contract, catalog } = walkContract()
  const findings = round.roundFindings(contract, catalog, assembled, seed, fileFindings)
  if (findings.length) {
    for (const f of findings) writeOut(2, findingLine(f) + '\n')
    die('the round has ' + findings.length + ' finding(s) — remedy: ' + remedy)
  }
  return assembled
}

// ---------------------------------------------------------------------------
// --mark seed-done.
// ---------------------------------------------------------------------------
// The two job-story refusals, in seed order; exit 1 (findings), unlike `die`'s exit 2 (precondition).
function offPathProblem(seedJourneys) {
  for (const [name, j] of seedJourneys) {
    if (!JOB_STORY_RE.test(j.persona)) {
      return 'design/mocks/seed.md journey "' + name + '" has no job story — its first line must read `When <situation>, I want <motivation>, so I can <outcome>.` — remedy: write the job story as the block\'s first line, then re-run `--mark seed-done` (spec/doctrine/mocks.md § Mocks: Seed)'
    }
    if (!j.beats.some((b) => OFF_PATH_STATES.includes(b.state))) {
      return 'design/mocks/seed.md journey "' + name + '" has no off-path beat — one beat must land on `<screen>@first-run` or `<screen>@empty` — remedy: add the first-run or empty-state beat, then re-run `--mark seed-done` (spec/doctrine/mocks.md § Mocks: Seed)'
    }
  }
  return null
}

function cmdSeedDone() {
  const prevState = deriveState()
  const seed = currentSeedJourneys()
  if (seed.size === 0) {
    die('design/mocks/seed.md declares no journeys — remedy: add one "### <journey>" block per journey the product supports under "## Journeys", then re-run `--mark seed-done`')
  }
  const problem = seedProblem(seed)
  if (problem) die(problem)
  const offPath = offPathProblem(seed)
  if (offPath) { writeOut(2, 'mocks-driver: ' + offPath + '\n'); process.exit(1) }
  status.marks.seedDone = nowIso()
  saveStatus()
  writeOut(1, '✅ seed-done recorded\n')
  printAcceptedTail(prevState, deriveState())
}

function undeclared(journeyArg, seed) {
  die('--journey ' + journeyArg + ' is not declared in design/mocks/seed.md — remedy: use one of the seed journeys: ' + [...seed.keys()].join(', '))
}

// ---------------------------------------------------------------------------
// --mark journey-drawn --journey <j> — service mode only; sends nothing.
// ---------------------------------------------------------------------------
function cmdJourneyDrawn(journeyArg) {
  requireService()
  if (!journeyArg) die('--mark journey-drawn needs --journey <j> — remedy: --mark journey-drawn --journey <j>')
  const prevState = deriveState()
  const seed = currentSeedJourneys()
  if (!seed.has(journeyArg)) undeclared(journeyArg, seed)
  for (const b of seed.get(journeyArg).beats) {
    const file = b.screen + (b.state ? '@' + b.state : '') + '.json'
    if (!fs.existsSync(path.join(root, screensRel, file))) {
      die('journey ' + journeyArg + ' beat ' + b.n + ' needs ' + screensRel + '/' + file +
        ' — remedy: write that screen file (spec-paths walkthrough-catalog lists the components)')
    }
  }
  assembledOrDie(seed, drawnIds(seed, journeyArg),
    'fix the screen files, then re-run --mark journey-drawn --journey ' + journeyArg)
  status.journeys[journeyArg] = status.journeys[journeyArg] || { drawn: null, approved: null }
  status.journeys[journeyArg].drawn = nowIso()
  saveStatus()
  writeOut(1, '✅ journey-drawn recorded for ' + journeyArg + '\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// round push.
// ---------------------------------------------------------------------------
function cmdRoundPush() {
  requireService()
  const seed = currentSeedJourneys()
  const ids = drawnIds(seed, null)
  if (ids.length === 0) die('no journey is drawn yet — remedy: --mark journey-drawn --journey <j>')
  const assembled = assembledOrDie(seed, ids,
    'fix the screen files, re-run --mark journey-drawn for the journey they belong to, then round push')
  const digest = round.roundDigest(assembled)
  if (status.pushed && status.pushed.digest === digest) {
    writeOut(1, 'round ' + status.pushed.round + ' already carries this content — nothing sent (' + projectLink() + ')\n')
    process.exit(0)
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocks-round-'))
  let r
  try {
    const file = path.join(dir, 'round.json')
    fs.writeFileSync(file, JSON.stringify(assembled))
    r = walk(['push', '--round-file', file])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  if (r.status === 0 && r.ans && Number.isInteger(r.ans.round)) {
    status.pushed = { round: r.ans.round, digest }
    saveStatus()
    writeOut(1, 'pushed round ' + r.ans.round + ' — open at ' + projectLink() + '\n')
    process.exit(0)
  }
  finish(r, 'push')
}

// ---------------------------------------------------------------------------
// round pull — the worklist.
// ---------------------------------------------------------------------------
function confirmer(a) {
  if (typeof a.who === 'string' && a.who) return a.who
  return a.by === 'owner' ? 'the owner' : 'the client'
}

function approvalsFor(n, name) {
  const doc = round.readApprovals(root, n)
  return doc && Array.isArray(doc.approvals) ? doc.approvals.filter((a) => a && a.journey === name) : []
}

function cmdRoundPull() {
  requireService()
  const n = round.latestRound(root)
  if (!n) die('design/rounds/ holds no pushed round — remedy: round push')
  walkOrDie(['pull-notes', '--round', String(n)])
  walkOrDie(['pull-approvals', '--round', String(n)])
  const items = round.waitingItems(round.readNotes(root, n))
  const out = ['round ' + n + ' — ' + items.length + ' note' + (items.length === 1 ? '' : 's') + ' waiting for an answer']
  for (const it of items) {
    out.push('  ' + it.id + ' [' + it.where + '] "' + it.text + '"' + (it.picked ? ' (on: "' + it.picked + '")' : '') +
      (it.spot ? ' (spot: ' + Math.round(it.spot.x * 100) + '% across, ' + Math.round(it.spot.y * 100) + '% down the ' + it.spot.width + '-wide picture)' : ''))
  }
  out.push('journeys:')
  for (const [name, j] of currentSeedJourneys()) {
    const hash = beatHash(j.beats)
    const apps = approvalsFor(n, name)
    const match = apps.find((a) => a.beats === hash)
    if (match) out.push('  ' + name + ' — confirmed by ' + confirmer(match) + ' (story ' + hash + ')')
    else if (apps.length) out.push('  ' + name + ' — confirmed an older story (' + apps[0].beats + ', now ' + hash + ')')
    else out.push('  ' + name + ' — not confirmed')
  }
  writeOut(1, out.join('\n') + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// --mark journey-approved --journey <j> [--waive --reason <r>].
// ---------------------------------------------------------------------------
function recordApproval(name, hash, by, reason) {
  const prior = status.journeys[name] || {}
  const entry = { drawn: prior.drawn || null, approved: nowIso(), beats: hash, by }
  if (reason) entry.reason = reason
  status.journeys[name] = entry
}

function cmdJourneyApproved(journeyArg, waive, reasonArg) {
  if (!journeyArg) die('--mark journey-approved needs --journey <j> — remedy: --mark journey-approved --journey <j>')
  const prevState = deriveState()
  const seed = currentSeedJourneys()
  const seedJourney = seed.get(journeyArg)
  if (!seedJourney) undeclared(journeyArg, seed)
  const hash = beatHash(seedJourney.beats)
  const mark = '--mark journey-approved --journey ' + journeyArg

  if (!serviceMode()) {
    if (waive) die('--waive is for a project that uses the service — remedy: --mark journey-approved --journey <j>')
      recordApproval(journeyArg, hash, 'terminal')
    saveStatus()
    writeOut(1, '✅ journey-approved recorded for ' + journeyArg + ' (confirmed in the terminal)\n')
    printAcceptedTail(prevState, deriveState())
  }

  const reason = typeof reasonArg === 'string' ? reasonArg.trim() : ''
  if (waive && !reason) die('--waive needs --reason <r> — remedy: --mark journey-approved --journey <j> --waive --reason <r>')
  if (!journeyIsDrawn(journeyArg)) {
    die('journey "' + journeyArg + '" is not drawn yet — remedy: --mark journey-drawn --journey ' + journeyArg)
  }
  const link = projectLink()
  let by = 'waived'
  if (!waive) {
    if (!status.pushed) die('nothing has been sent to the service yet — remedy: round push')
    const n = round.latestRound(root)
    if (!n) die('design/rounds/ holds no pushed round — remedy: round push')
    const listed = ((round.readRound(root, n) || {}).journeys || []).find((j) => j && j.id === journeyArg)
    if (!listed || listed.beats !== hash) {
      die('the service does not show the current story for "' + journeyArg + '" yet (the seed is now ' + hash + ') — remedy: round push')
    }
    walkOrDie(['pull-approvals', '--round', String(n)])
    const apps = approvalsFor(n, journeyArg)
    if (apps.length === 0) {
      die('journey "' + journeyArg + '" is not confirmed yet — remedy: the client visits ' + link + ' and confirms, or ' + mark + ' --waive --reason <r>')
    }
    const match = apps.find((a) => a.beats === hash)
    if (!match) {
      die('journey "' + journeyArg + '" was confirmed on an older story (' + apps[0].beats + ', now ' + hash + ') — remedy: the client confirms again on ' + link + ', or ' + mark + ' --waive --reason <r>')
    }
    by = match.by
  }
  recordApproval(journeyArg, hash, by, waive ? reason : null)
  saveStatus()
  const who = waive ? 'waived: ' + reason : 'confirmed by the ' + (by === 'owner' ? 'owner' : 'client')
  writeOut(1, '✅ journey-approved recorded for ' + journeyArg + ' (' + who + ')\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --mark approved. The round is closed before the end is recorded, so a failed close never
// leaves a finished stage over an open round.
// ---------------------------------------------------------------------------
function cmdApproved() {
  const prevState = deriveState()
  const seed = currentSeedJourneys()
  if (seed.size === 0) {
    die('design/mocks/seed.md declares no journeys — remedy: add one "### <journey>" block per journey the product supports under "## Journeys"')
  }
  for (const [name, j] of seed) {
    if (!journeyIsApproved(name, j.beats)) {
      die('journey "' + name + '" is not confirmed — remedy: --mark journey-approved --journey ' + name)
    }
  }
  const n = serviceMode() ? round.latestRound(root) : 0
  if (n) {
    walkOrDie(['pull-notes', '--round', String(n)])
    const notes = round.readNotes(root, n)
    const first = round.waitingItems(notes)[0]
    if (first) {
      die(first.id + ' [' + first.where + '] is waiting for an answer — remedy: answer it (walkthrough reply --note ' + first.id + ' --text-file <file>), then re-run --mark approved')
    }
  }
  if (n) walkOrDie(['mark', '--round', String(n), '--status', 'closed'])
  status.marks.approved = nowIso()
  saveStatus()
  writeOut(1, '✅ approved recorded\n')
  printAcceptedTail(prevState, deriveState())
}

// ---------------------------------------------------------------------------
// --reopen journey:<j>.
// ---------------------------------------------------------------------------
function cmdReopen(target) {
  if (target && target.startsWith('journey:')) {
    const j = target.slice('journey:'.length)
    const cleared = ['approved', 'marks.approved', 'pushed.digest']
    if (status.journeys[j]) status.journeys[j].approved = null
    status.marks.approved = null
    if (status.pushed) status.pushed.digest = null
    status.reopens.push({ at: nowIso(), target, cleared })
    saveStatus()
    writeOut(1, '↩ reopened ' + target + ' — cleared: ' + cleared.join(', ') + '\n')
    process.exit(0)
  }
  die('--reopen must be journey:<j> — remedy: --reopen journey:<j>')
}

// ---------------------------------------------------------------------------
// Bare-invocation step printer — one step block per run.
// ---------------------------------------------------------------------------
function driverCmd(extra) { return 'node ' + __filename + ' --root ' + root + ' ' + extra }

// The genesis brief's first building paragraph, when the brief carries that section.
function genesisIdeaLine() {
  const none = 'idea: ask the user for the product idea (no .claude/genesis/brief.md)'
  let text
  try { text = fs.readFileSync(path.join(root, '.claude/genesis/brief.md'), 'utf8') } catch { return none }
  const m = text.match(/^## What I think you're building[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m)
  const para = m && m[1].trim().split(/\r?\n\s*\r?\n/)[0].trim().replace(/\s*\r?\n\s*/g, ' ')
  return para ? 'idea (from genesis brief): ' + para : none
}

function printStepBlock(state, title, readOnlyList, doctrineSection, thenLines, withSkill, extraLines) {
  const lines = []
  lines.push('[mocks-driver] state: ' + state + '  root: ' + root)
  lines.push('(re-run this driver after completing the step; it verifies artifacts and prints the next one)')
  lines.push('')
  lines.push('## Step: ' + title)
  lines.push('Read only: ' + readOnlyList.join(', '))
  lines.push('Doctrine: spec/doctrine/mocks.md § ' + doctrineSection)
  if (extraLines) for (const l of extraLines) lines.push(l)
  if (withSkill) lines.push(SKILL_LINE)
  lines.push('Then:')
  for (const t of thenLines) lines.push('  ' + t)
  core.emit(lines)
}

function printSeedStep() {
  printStepBlock('SEED', 'write the seed — the client\'s own stories, one journey block each',
    ['design/mocks/seed.md'],
    'Mocks: Seed',
    ['write design/mocks/seed.md: the product, then one "### <journey>" block per journey (a job story line, then numbered "sentence" -> screen[@state] beats — one beat @first-run or @empty)',
      driverCmd('--mark seed-done')],
    false,
    [genesisIdeaLine()])
}

function printScreensStep(seed) {
  const service = serviceMode()
  const todo = [...seed].filter(([name, j]) => !journeyIsApproved(name, j.beats))
  if (service) {
    for (const [name] of todo) {
      if (journeyIsDrawn(name)) continue
      printStepBlock('SCREENS', 'draw journey ' + name,
        ['design/mocks/seed.md (### ' + name + ')', 'the catalog (spec-paths walkthrough-catalog)'],
        'Mocks: Authoring Rules',
        ['write one ' + screensRel + '/<screen>[@<state>].json per screen and state the beats name, copying the beats verbatim',
          driverCmd('--mark journey-drawn --journey ' + name)],
        true)
    }
  }
  if (todo.length) {
    const name = todo[0][0]
    if (service) {
      printStepBlock('SCREENS', 'confirm journey ' + name,
        ['design/mocks/seed.md (### ' + name + ')', 'design/rounds/ (the latest round\'s notes.json and approvals.json)'],
        'Mocks: Rounds and Notes',
        [driverCmd('round push') + '   (sends everything drawn and prints the link; print "🎨 ready for review — <link>" and end the turn)',
          driverCmd('round pull') + '   (what waits for an answer, and which journeys the client has confirmed)',
          driverCmd('--mark journey-approved --journey ' + name) + '   (once round pull shows the journey confirmed; or add --waive --reason <r> for an absent client)'],
        false)
    }
    printStepBlock('SCREENS', 'confirm ' + todo.length + ' journeys in the terminal',
      ['design/mocks/seed.md'],
      'Mocks: Confirmation',
      ['end the turn and wait for the user\'s reply',
        'approve all, or name the ones to change',
        'on `approve`, run each:',
        ...todo.map(([n]) => '  ' + driverCmd('--mark journey-approved --journey ' + n)),
        ...(service || policy(root).reviewService !== 'hosted' ? [] : ['(this project is not connected to the review service — /spec:connect connects it, and the screens are then drawn and sent)'])],
      false,
      ['show the user exactly this:',
        ...todo.flatMap(([n, j]) => ['### ' + n, j.persona, ...j.beats.map((b) => b.n + '. "' + b.beat + '"')])])
  }
  const then = []
  if (service) then.push(driverCmd('round pull') + '   (nothing may wait for an answer; answer each with walkthrough reply --note <id> --text-file <file>, then push again)')
  then.push(driverCmd('--mark approved'))
  printStepBlock('SCREENS', 'close the wireframe',
    service ? ['design/rounds/ (the latest round\'s notes.json)'] : ['design/mocks/status.json'],
    'Mocks: Confirmation',
    then,
    false)
}

function printApprovedStep() {
  writeOut(1, '[mocks-driver] state: APPROVED  root: ' + root + '\nthe wireframe is approved — nothing further to do.\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------
if (rest.includes('--state')) {
  writeOut(1, deriveState() + '\n')
  process.exit(0)
}

if (rest[0] === '--reopen') cmdReopen(rest[1])

if (rest[0] === '--mark') {
  const mark = rest[1]
  const journeyArg = flagArg(rest, '--journey')
  if (mark === 'seed-done') cmdSeedDone()
  else if (mark === 'journey-drawn') cmdJourneyDrawn(journeyArg)
  else if (mark === 'journey-approved') cmdJourneyApproved(journeyArg, rest.includes('--waive'), flagArg(rest, '--reason'))
  else if (mark === 'approved') cmdApproved()
  else die('--mark ' + mark + ' is unknown — remedy: --mark seed-done|journey-drawn|journey-approved|approved')
}

if (rest[0] === 'round') {
  if (rest[1] === 'push') cmdRoundPush()
  else if (rest[1] === 'pull') cmdRoundPull()
  else die('round: unknown subcommand "' + rest[1] + '" — remedy: use `round push` or `round pull`')
}

// Bare run: print exactly one step block for the current state.
const state = deriveState()
if (state === 'SEED') printSeedStep()
else if (state === 'SCREENS') printScreensStep(currentSeedJourneys())
else printApprovedStep()
