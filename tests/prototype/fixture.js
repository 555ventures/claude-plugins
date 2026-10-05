'use strict'
// Shared setup for the prototype-driver test files (spec 20260928/01-the-prototype-command-and-
// the-pin-overlay.md). Not a *.test.js file itself — node:test's default discovery never picks
// it up, and it carries no `test(...)` calls of its own (§ Gotchas: no script/file this repo
// ships may match node's test-discovery globs, but this one isn't discovered at all since it
// matches none of them).
const fs = require('node:fs')
const path = require('node:path')
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

function mark(dir, name, extra = []) {
  return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', name, ...extra])
}

// Authors the derived e2e file the way the TESTS step prints it: in the prototype worktree,
// committed on the prototype branch. opts.commit === false leaves it uncommitted; opts.where ===
// 'main' writes it in the main working tree instead (nothing committed); opts.count keeps only the
// first N reserved ids; opts.extra appends a line (an edit on top of a committed copy).
function authorDerivedTests(dir, contract, opts) {
  opts = opts || {}
  const tests = opts.count ? contract.tests.slice(0, opts.count) : contract.tests
  const body = tests.map((t, i) => "test('" + t.ac + ' pin ' + t.pin + ': n' + (i + 1) + "', () => {})\n").join('') +
    (opts.extra || '')
  const root = opts.where === 'main' ? dir : worktreePath(dir)
  const abs = path.join(root, contract.e2eFile)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
  if (opts.where !== 'main' && opts.commit !== false) {
    execFileSync('git', ['-C', root, 'add', contract.e2eFile], { encoding: 'utf8' })
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'derived tests on ' + BRANCH], { encoding: 'utf8' })
  }
  return abs
}

module.exports = {
  FIXTURE_DIR, DRIVER, BRIEF_REL, STEM, BRANCH, WORKTREE_NAME,
  setupHost, readConfig, writeConfig, patchConfig,
  designDir, statusPath, statesPath, pinsPath, worktreePath, statusOf,
  writeStates, writeStatus, writePins, bare, mark, authorDerivedTests,
}
