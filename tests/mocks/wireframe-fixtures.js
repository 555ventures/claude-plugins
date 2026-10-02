'use strict'
// Shared setup for tests/mocks/wireframe-*.test.js — specs/20261002/01-the-wireframe-command-runs-over-the-service.md
// (File Plan: tests/mocks/wireframe-fixtures.js). Not a *.test.js file, so node's discovery skips it.
//
// Builds a tmp host with or without the walkthrough config block, the two-journey seed of the
// spec's Contracts, the four screen files copied out of tests/fixtures/walkthrough/hearwell-round.json,
// a status writer, round-folder writers, and a driver runner that sets the token variable and TMPDIR.
// The stub service lives in tests/walkthrough/stub-service.js (its own process, so the driver may
// run through the synchronous runNode).
//
// Exit codes: n/a (library).

const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash } = require('../helpers')
const walk = require('../walkthrough/fixture')

const DRIVER = 'scripts/mocks-driver.js'
const TOKEN = walk.TOKEN
const H_OWNER = '08363cd98ef8'
const H_OWNER_EDITED = '48a07781b5ed'
const H_TEAM = '2e74ae02ca58'
const PERSONA = 'Mika (clinic owner) is invited, confirms her roster, and ends at the brief.'
const T = '2026-10-02T04:00:00.000Z'

// ---- the seed -------------------------------------------------------------------------------

// opts: beat2 (replaces owner-onboarding's second sentence), persona (replaces its persona line),
// unquoted (beat 2 written without quotes), teamBeats (false = team-invite holds a persona and no
// beat), noJourneys (a seed with no journey block at all), records (appends a ## Records section).
function seedText(opts = {}) {
  const beat2 = opts.beat2 || 'I check who is on my team'
  const line2 = opts.unquoted ? `2. ${beat2} -> roster-confirm` : `2. "${beat2}" -> roster-confirm`
  let out = '# Seed — Hearwell\n\n## Product\n\nA clinic roster tool.\n\n'
  if (opts.records) out += '## Records\n- customer\n\n'
  out += '## Journeys\n\n'
  if (opts.noJourneys) return out
  out += '### owner-onboarding\n' + (opts.persona || PERSONA) + '\n' +
    '1. "I open the invitation" -> owner-intro\n' + line2 + '\n' +
    '3. "I see nobody is listed yet" -> roster-confirm@empty\n' +
    '4. "I read what happens next" -> reciprocity-brief\n\n'
  out += '### team-invite\nBen (front desk) accepts an invite and sees the team.\n'
  if (opts.teamBeats !== false) out += '1. "I open my invite" -> owner-intro\n2. "I see my team" -> roster-confirm\n'
  return out + '\n'
}

function writeSeed(root, opts) {
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(root, 'design/mocks/seed.md'), seedText(opts))
}

// ---- the ledger -----------------------------------------------------------------------------

function writeLedger(root, rows = []) {
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(root, 'design/mocks/ledger.md'),
    '# Provenance ledger — Hearwell\n\n## Assumptions\n\n' +
    '| id | step | kind | claim | tag | status | rejected | dependents | note |\n' +
    '| - | - | - | - | - | - | - | - | - |\n' +
    rows.map((r) => r + '\n').join('') +
    '\n## Misunderstandings\n\n| id | what | step | cost | note |\n| - | - | - | - | - |\n')
}

const BLOCKING_ROW = '| A1 | SCREENS | product | x | invented | open | - | - | - |'

function readLedger(root) {
  return fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
}

// ---- the status file ------------------------------------------------------------------------

function defaultStatus(over = {}) {
  return {
    schemaVersion: 3, state: 'SCREENS',
    marks: { seedDone: T, approved: null },
    journeys: {}, pushed: null, reopens: [], lastUpdated: T, ...over,
  }
}

function statusPath(root) { return path.join(root, 'design/mocks/status.json') }

function writeStatus(root, over = {}) {
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  fs.writeFileSync(statusPath(root), JSON.stringify(defaultStatus(over), null, 2) + '\n')
}

function readStatus(root) { return JSON.parse(fs.readFileSync(statusPath(root), 'utf8')) }

// A journey entry: drawn (a time or null), approved (a time or null), the hash it was approved on.
function journeyEntry(over = {}) {
  return { drawn: T, approved: '2026-10-02T04:30:00.000Z', beats: H_OWNER, by: 'client', ...over }
}

const DIGEST = 'a'.repeat(64)

// ---- the host -------------------------------------------------------------------------------

// block: undefined/null = no config file at all; false = a config file with no walkthrough key; a url string = service mode against that url; any
// other value is written as the key's value (the string "yes" proves a non-object is terminal mode).
function makeRoot(opts = {}) {
  const root = tmpdir('wireframe')
  if (opts.block === false) walk.writeConfig(root, null)
  else if (typeof opts.block === 'string' && /^https?:/.test(opts.block)) walk.writeConfig(root, walk.block(opts.block))
  else if (opts.block !== undefined && opts.block !== null) walk.writeConfig(root, opts.block)
  if (opts.seed !== false) writeSeed(root, opts.seed)
  if (opts.ledger !== false) writeLedger(root, opts.rows)
  return root
}

// ---- the screen files -----------------------------------------------------------------------

function fixtureScreens() {
  return walk.loadJson(walk.HEARWELL).screens
}

function screenFile(name, state) { return state ? `${name}@${state}.json` : `${name}.json` }

function screensDir(root) { return path.join(root, 'design/mocks/screens') }

// Writes the four hearwell screen specs as design/mocks/screens/<screen>[@<state>].json.
function writeScreens(root) {
  fs.mkdirSync(screensDir(root), { recursive: true })
  for (const s of fixtureScreens()) {
    fs.writeFileSync(path.join(screensDir(root), screenFile(s.name, s.state)), JSON.stringify(s.spec, null, 2) + '\n')
  }
}

function readScreen(root, file) { return JSON.parse(fs.readFileSync(path.join(screensDir(root), file), 'utf8')) }

function editScreen(root, file, fn) {
  const spec = readScreen(root, file)
  fn(spec)
  fs.writeFileSync(path.join(screensDir(root), file), JSON.stringify(spec, null, 2) + '\n')
}

// ---- round folders --------------------------------------------------------------------------

function roundDir(root, n) { return path.join(root, 'design/rounds', String(n)) }

// design/rounds/<n>/round.json as a pushed wireframe round leaves it; `journeys` maps id -> hash.
function writeRound(root, n, journeys = { 'owner-onboarding': H_OWNER }) {
  walk.writeJson(path.join(roundDir(root, n), 'round.json'), {
    apiVersion: 1, round: n, kind: 'wireframe', status: 'open', contentHash: '0'.repeat(64),
    journeys: Object.entries(journeys).map(([id, beats]) => ({ id, beats })),
    screens: [{ name: 'owner-intro', state: null }],
  })
}

function note(id, over = {}) {
  const text = over.text || 'text ' + id
  return {
    id, round: 2, screen: 'roster-confirm', anchor: null, pickedText: null, status: 'open', text, author: 'client',
    thread: [{ by: 'client', text, at: '2026-10-02T05:00:00Z' }], at: '2026-10-02T05:00:00Z', ...over,
  }
}

function journeyThread(id, status, texts) {
  return { id, status, thread: texts.map((text, i) => ({ by: i % 2 ? 'session' : 'client', text, at: `2026-10-02T05:0${i}:00Z` })) }
}

function approval(journey, over = {}) {
  return { journey, by: 'client', round: 2, beats: H_OWNER, at: '2026-10-02T06:00:00Z', ...over }
}

function writeNotesFile(root, n, notes, journeys = []) {
  walk.writeJson(path.join(roundDir(root, n), 'notes.json'), { apiVersion: 1, round: n, cursor: 'c-1', notes, journeys })
}

// ---- the stub's answers ---------------------------------------------------------------------

const KEY = {
  hello: 'GET /v1',
  push: 'POST /v1/projects/hearwell/rounds',
  notes: 'GET /v1/projects/hearwell/notes',
  approvals: 'GET /v1/projects/hearwell/approvals',
  mark: (n) => `POST /v1/projects/hearwell/rounds/${n}/mark`,
}

const notesAnswer = (notes, journeys = [], cursor = 'c-1') => ({ status: 200, body: { apiVersion: 1, notes, journeys, cursor } })
const approvalsAnswer = (approvals) => ({ status: 200, body: { apiVersion: 1, approvals } })
const pushedAnswer = (round) => ({ status: 201, body: { apiVersion: 1, round, kind: 'wireframe', status: 'open', journeys: [] } })
const markedAnswer = (round, status = 'closed') => ({ status: 200, body: { apiVersion: 1, round, status } })

// answers: extra "METHOD /path" entries merged over a hello answer.
function startStub(t, answers) {
  return walk.startStub(t, { [KEY.hello]: [walk.HELLO_OK], ...answers })
}

// ---- running the driver ---------------------------------------------------------------------

// Runs mocks-driver.js against `root` with the token variable set and TMPDIR pointing at a fresh
// empty directory (returned as r.tmp so a test can prove the driver cleaned up after itself).
function runDriver(root, args, opts = {}) {
  const tmp = tmpdir('driver-tmp')
  const env = { ...process.env, WALKTHROUGH_TOKEN: TOKEN, TMPDIR: tmp, ...(opts.env || {}) }
  const r = runNode(DRIVER, ['--root', root, ...args], { cwd: opts.cwd || root, env })
  r.tmp = tmp
  return r
}

// Runs the driver with no --root, from `cwd` (a bare run on the current directory).
function runDriverIn(cwd, args) {
  return runNode(DRIVER, args, { cwd, env: { ...process.env, WALKTHROUGH_TOKEN: TOKEN } })
}

// The sections of `spec-paths shared-mocks --section "<name>"`.
function sharedMocks(name) {
  return runBash('bin/spec-paths', ['shared-mocks', '--section', name]).stdout
}

// Every file under dir (recursive); a missing dir lists nothing.
function filesUnder(dir) { return fs.existsSync(dir) ? walk.allFiles(dir) : [] }

module.exports = {
  DRIVER, TOKEN, H_OWNER, H_OWNER_EDITED, H_TEAM, PERSONA, T, DIGEST, BLOCKING_ROW, KEY,
  seedText, writeSeed, writeLedger, readLedger, defaultStatus, statusPath, writeStatus, readStatus, journeyEntry,
  makeRoot, fixtureScreens, screenFile, screensDir, writeScreens, readScreen, editScreen,
  roundDir, writeRound, note, journeyThread, approval, writeNotesFile,
  notesAnswer, approvalsAnswer, pushedAnswer, markedAnswer, startStub, runDriver, runDriverIn, sharedMocks, filesUnder,
  block: walk.block, loadJson: walk.loadJson, writeJson: walk.writeJson,
}
