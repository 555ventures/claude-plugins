'use strict'
// Shared setup for the prototype-driver test files (specs/20261007/01-approve-writes-a-behaviour-
// contract.md; the fixture host's stubs: picture-stub.js, list-tests.js, run-tests.js). Not a *.test.js file itself — node:test's default discovery never picks
// it up, and it carries no `test(...)` calls of its own (§ Gotchas: no script/file this repo
// ships may match node's test-discovery globs, but this one isn't discovered at all since it
// matches none of them).
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo, ROOT, runNode } = require('../helpers')

const FIXTURE_DIR = path.join(ROOT, 'tests/fixtures/prototype/host')
const DRIVER = 'scripts/prototype-driver.js'
const BRIEF_REL = 'docs/roadmap/28-functional-prototype.md'
const STEM = '28-functional-prototype'
const BRANCH = 'proto/' + STEM
const WORKTREE_NAME = 'proto-' + STEM

// Copies the synthetic host fixture into a fresh tmpdir and seeds it as a git repo on `main`
// with one commit — gitRepo() only clones its own template into an EMPTY target dir, so the
// fixture is copied first and gitRepo() then `git add -A`s everything it finds (tests/helpers.js
// seedGitRepo), which is what actually commits the fixture's files.
function setupHost() {
  const dir = tmpdir('proto-host')
  fs.cpSync(FIXTURE_DIR, dir, { recursive: true })
  gitRepo(dir)
  // A real host git-ignores the files the fixture's dbCreate and the driver plant in the worktree;
  // without this `git worktree remove` refuses every close on them. seedGitRepo overwrites any
  // shipped .gitignore, so the entries are appended after the seed commit.
  fs.appendFileSync(path.join(dir, '.gitignore'), 'db-created\nsrc/proto-*.js\n')
  execFileSync('git', ['-C', dir, 'add', '.gitignore'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'ignore prototype scratch files'], { encoding: 'utf8' })
  return dir
}

function configPath(dir) { return path.join(dir, '.claude/spec.config.json') }
function readConfig(dir) { return JSON.parse(fs.readFileSync(configPath(dir), 'utf8')) }
function writeConfig(dir, cfg) { fs.writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2) + '\n') }
function patchConfig(dir, fn) {
  const cfg = readConfig(dir)
  fn(cfg)
  writeConfig(dir, cfg)
}

function designDir(dir) { return path.join(dir, 'design/prototypes', STEM) }
function statusPath(dir) { return path.join(designDir(dir), 'status.json') }
function statesPath(dir) { return path.join(designDir(dir), 'states.json') }
function pinsPath(dir) { return path.join(designDir(dir), 'pins.json') }
function worktreePath(dir) { return path.join(dir, '.claude/worktrees', WORKTREE_NAME) }

function statusOf(dir) { return JSON.parse(fs.readFileSync(statusPath(dir), 'utf8')) }

function writeStates(dir, routes) {
  fs.mkdirSync(designDir(dir), { recursive: true })
  fs.writeFileSync(statesPath(dir), JSON.stringify({
    schemaVersion: 1,
    viewport: { width: 1280, height: 800 },
    routes: routes || { '/home': { default: '/home' } },
  }, null, 2) + '\n')
}

function writeStatus(dir, overrides) {
  fs.mkdirSync(designDir(dir), { recursive: true })
  const base = {
    schemaVersion: 1, brief: '28', stem: STEM, branch: BRANCH,
    worktree: '.claude/worktrees/' + WORKTREE_NAME, base: 'main', pinsPort: 4711,
    marks: { opened: null, approved: null }, rounds: [], lastUpdated: new Date().toISOString(),
  }
  fs.writeFileSync(statusPath(dir), JSON.stringify({ ...base, ...overrides }, null, 2) + '\n')
}

function writePins(dir, pins) {
  fs.mkdirSync(designDir(dir), { recursive: true })
  fs.writeFileSync(pinsPath(dir), JSON.stringify({ schemaVersion: 1, pins }, null, 2) + '\n')
}

function bare(dir, extra = []) {
  return runNode(DRIVER, [BRIEF_REL, '--root', dir, ...extra])
}

function mark(dir, name, extra = [], opts = {}) {
  return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', name, ...extra], opts)
}

const E2E_FILE = 'e2e/proto-' + STEM + '.spec.ts'
const BEHAVIOUR_IDS = ['p1', 'p3']

const TWO_ROUTE_STATES = {
  '/women': { default: '/women', empty: '/women?proto=empty' },
  '/women/new': { default: '/women/new', error: '/women/new?proto=error' },
}

// Three pins in the shape the pin endpoint writes (p1 and p3 behaviour, p2 look; p1 carries an
// anchor, the others are screen notes).
function threePins() {
  const now = new Date().toISOString()
  return [
    { id: 'p1', round: 1, screen: '/women', state: 'default', anchor: 'WomanRow[w_01]<WomenList<WomenScreen#0', note: '保存すると行が緑になる', who: 'JJ', kind: 'behaviour', at: now },
    { id: 'p2', round: 1, screen: '/women', state: 'empty', anchor: null, note: '空のときは案内文だけ', who: 'JJ', kind: 'look', at: now },
    { id: 'p3', round: 1, screen: '/women/new', state: 'error', anchor: null, note: '空欄で保存すると赤い注意', who: 'JJ', kind: 'behaviour', at: now },
  ]
}

function onlyLookPins() {
  return [{ id: 'p1', round: 1, screen: '/women', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'look', at: new Date().toISOString() }]
}

// Reaches a real APPROVED through the driver's own marks (opened, round-done, approved).
function advanceToApproved(dir, routes, pins) {
  writeStates(dir, routes || TWO_ROUTE_STATES)
  const opened = mark(dir, 'opened')
  assert.strictEqual(opened.status, 0, 'test setup requires --mark opened to succeed: ' + opened.stderr)
  writePins(dir, pins || threePins())
  const rd = mark(dir, 'round-done')
  assert.strictEqual(rd.status, 0, 'test setup requires --mark round-done to succeed: ' + rd.stderr)
  const approved = mark(dir, 'approved')
  assert.strictEqual(approved.status, 0, 'test setup requires --mark approved to succeed: ' + approved.stderr)
  return statusOf(dir)
}

// env overrides ride on top of the parent env (PICTURE_RED, PICTURE_EMPTY, E2E_RED,
// LIST_TESTS_LIMIT are read by the fixture host's stubs).
function withEnv(extra) { return { env: Object.assign({}, process.env, extra || {}) } }
function markContracted(dir, envExtra) { return mark(dir, 'contracted', [], withEnv(envExtra)) }
function markTestsDerived(dir, envExtra) { return mark(dir, 'tests-derived', [], withEnv(envExtra)) }

// Reaches real TESTS: approved, then a successful --mark contracted.
function advanceToTests(dir, routes, pins) {
  advanceToApproved(dir, routes, pins)
  const r = markContracted(dir)
  assert.strictEqual(r.status, 0, 'test setup requires --mark contracted to succeed on the fixture host: ' + r.stderr)
}

function contractPath(dir) { return path.join(designDir(dir), 'contract.json') }
function readContract(dir) { return JSON.parse(fs.readFileSync(contractPath(dir), 'utf8')) }

// The picture stub appends one JSON line per call to <host root>/picture-calls.jsonl.
function pictureCalls(dir) {
  const p = path.join(dir, 'picture-calls.jsonl')
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

// The e2eRun stub writes the PROTO_URL it saw to design/prototypes/<stem>/e2e-env.txt (host
// root, beside e2e.log); null when the stub never ran.
function e2eEnv(dir) {
  const p = path.join(designDir(dir), 'e2e-env.txt')
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

// Authors the derived e2e file the way the TESTS step prints it: in the prototype worktree at
// E2E_FILE (opts.file overrides), committed on the prototype branch, one `pin <id>: nN` test per
// id (opts.ids, default p1 and p3). opts.commit === false leaves it uncommitted; opts.where ===
// 'main' writes it in the main working tree instead (nothing committed).
function authorDerivedTests(dir, opts) {
  opts = opts || {}
  const ids = opts.ids || BEHAVIOUR_IDS
  const rel = opts.file || E2E_FILE
  const body = ids.map((id, i) => "test('pin " + id + ': n' + (i + 1) + "', () => {})\n").join('')
  const root = opts.where === 'main' ? dir : worktreePath(dir)
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
  if (opts.where !== 'main' && opts.commit !== false) {
    execFileSync('git', ['-C', root, 'add', rel], { encoding: 'utf8' })
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'derived tests on ' + BRANCH], { encoding: 'utf8' })
  }
  return abs
}

module.exports = {
  FIXTURE_DIR, DRIVER, BRIEF_REL, STEM, BRANCH, WORKTREE_NAME,
  setupHost, readConfig, writeConfig, patchConfig,
  designDir, statusPath, statesPath, pinsPath, worktreePath, statusOf,
  writeStates, writeStatus, writePins, bare, mark, authorDerivedTests,
  E2E_FILE, TWO_ROUTE_STATES, threePins, onlyLookPins, advanceToApproved, advanceToTests,
  markContracted, markTestsDerived, contractPath, readContract, pictureCalls, e2eEnv, withEnv,
}
