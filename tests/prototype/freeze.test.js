'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { runNode } = require('../helpers')
const {
  setupHost, patchConfig, writeStates, writePins, statusOf,
  designDir, statusPath, worktreePath, DRIVER, BRIEF_REL, BRANCH, STEM,
} = require('./fixture')

// specs/20260928/02-freeze-export-and-the-contract.md D3-D8, AC-20260928-02-4 .. AC-20260928-
// 02-11 — spec/scripts/prototype-driver.js has no `frozen` or `tests-derived` mark and no
// TESTS/CLOSED state yet (cmdMark's default branch dies "--mark <name> is unknown" for both;
// deriveState never returns anything past APPROVED) and spec/scripts/lib/freeze.js does not
// exist: every case below is genuinely RED.
//
// TEST-OWNED URL-JOIN CONTRACT (not stated verbatim by any Decision, recorded here and in this
// spec's deviations sidecar): a state's full capture URL is prototype.url + the state's own
// states.json path value (simple string concatenation, no double-slash handling needed since
// every path value here already starts with "/") — the only way contract.json's own Contracts
// example can store a relative "url" per state while proto-capture.js still needs a real
// navigable URL to hand Playwright.

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const BRIEF_SLUG = STEM.replace(/^\d+-/, '') // "functional-prototype"

function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }) }
function branchExists(dir, name) { return git(dir, 'branch', '--list', name).trim() !== '' }
function worktreeListLines(dir) { return git(dir, 'worktree', 'list', '--porcelain') }

const TWO_ROUTE_STATES = {
  '/women': { default: '/women', empty: '/women?proto=empty' },
  '/women/new': { default: '/women/new', error: '/women/new?proto=error' },
}

function threePins() {
  const now = new Date().toISOString()
  return [
    { id: 'p1', round: 1, screen: '/women', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'behaviour', at: now },
    { id: 'p2', round: 1, screen: '/women', state: 'empty', anchor: null, note: 'n2', who: 'JJ', kind: 'look', at: now },
    { id: 'p3', round: 1, screen: '/women/new', state: 'error', anchor: null, note: 'n3', who: 'JJ', kind: 'behaviour', at: now },
  ]
}

function onlyLookPins() {
  const now = new Date().toISOString()
  return [{ id: 'p1', round: 1, screen: '/women', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'look', at: now }]
}

// Reaches real APPROVED via spec 01's already-working driver mechanics — the setup every
// AC-4..AC-11 case below needs before it can even attempt --mark frozen.
function advanceToApproved(dir, routes, pins, afterOpened) {
  writeStates(dir, routes || TWO_ROUTE_STATES)
  const opened = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'opened'])
  assert.strictEqual(opened.status, 0, 'test setup requires --mark opened to succeed: ' + opened.stderr)
  if (afterOpened) afterOpened()
  writePins(dir, pins || threePins())
  const rd = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'round-done'])
  assert.strictEqual(rd.status, 0, 'test setup requires --mark round-done to succeed: ' + rd.stderr)
  const approved = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'approved'])
  assert.strictEqual(approved.status, 0, 'test setup requires --mark approved to succeed: ' + approved.stderr)
  return statusOf(dir)
}

function captureEnv(dir, extra) {
  return Object.assign({}, process.env, { PROTO_CAPTURE_BIN: path.join(dir, 'capture-stub.js') }, extra || {})
}

function markFrozen(dir, envExtra) {
  return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'frozen'], { env: captureEnv(dir, envExtra) })
}

function markTestsDerived(dir, envExtra) {
  return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'tests-derived'], { env: captureEnv(dir, envExtra) })
}

function readContract(dir) {
  return JSON.parse(fs.readFileSync(path.join(designDir(dir), 'contract.json'), 'utf8'))
}

function contractPath(dir) { return path.join(designDir(dir), 'contract.json') }

test('AC-20260928-02-4: --mark frozen exits 2 naming "approved" when run before the prototype is approved', () => {
  const dir = setupHost()
  writeStates(dir)
  const opened = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'opened'])
  assert.strictEqual(opened.status, 0, 'test setup requires --mark opened to succeed: ' + opened.stderr)
  const r = markFrozen(dir)
  assert.strictEqual(r.status, 2, 'freezing a not-yet-approved prototype must refuse rather than run the gate/capture pipeline on an unreviewed round: ' + JSON.stringify(r))
  assert.match(r.stderr, /approved/, 'the refusal must name "approved" as the missing precondition: ' + r.stderr)
  // The pre-image's cmdMark dispatch also exits 2 with a message that happens to CONTAIN the
  // word "approved" (its own usage list: "--mark opened|round-done|approved") — this second
  // assertion tells that false-positive apart from the real "not yet approved" precondition
  // refusal AC-4 actually names.
  assert.ok(!/is unknown/.test(r.stderr), 'the refusal must be the "not yet approved" precondition check, not the driver\'s generic "--mark <name> is unknown" dispatch failure (which also happens to mention "approved" in its own usage list): ' + r.stderr)
  assert.ok(!fs.existsSync(contractPath(dir)), 'a refused frozen mark must write no contract.json: ' + contractPath(dir))
})

test('AC-20260928-02-4: --mark frozen exits 2 with "no behaviour pins" and writes no contract.json when every approved pin is kind "look"', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, onlyLookPins())
  const r = markFrozen(dir)
  assert.strictEqual(r.status, 2, 'a prototype with zero behaviour pins is the direct lane in disguise and must refuse the freeze: ' + JSON.stringify(r))
  assert.match(r.stderr, /no behaviour pins/, 'the refusal must carry the literal phrase "no behaviour pins" (D3): ' + r.stderr)
  assert.ok(!fs.existsSync(contractPath(dir)), 'a refused-for-no-behaviour-pins frozen mark must write no contract.json: ' + contractPath(dir))
})

test('AC-20260928-02-4: --mark frozen exits 2 with "no composites declared" when docs/design/approval.json is absent and the kit directory is empty', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  fs.rmSync(path.join(dir, 'docs/design/approval.json'))
  const r = markFrozen(dir)
  assert.strictEqual(r.status, 2, 'freezing with no declared composites (approval.json absent, no kit dir configured) must refuse: ' + JSON.stringify(r))
  assert.match(r.stderr, /no composites declared/, 'the refusal must carry the literal phrase "no composites declared" (D2): ' + r.stderr)
})

test('AC-20260928-02-5: --mark frozen exits 2 naming "kit gates red on proto/<stem>" when the gate is red, writes gate.log, and writes no capture', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const r = markFrozen(dir, { GATE_RED: '1' })
  assert.strictEqual(r.status, 2, 'a red gate on the prototype tree must refuse the freeze before any capture runs: ' + JSON.stringify(r))
  assert.match(r.stderr, new RegExp('kit gates red on proto/' + STEM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the refusal must carry the literal phrase "kit gates red on proto/<stem>" (D3(4)): ' + r.stderr)
  assert.ok(fs.existsSync(path.join(designDir(dir), 'gate.log')), 'the gate\'s combined output must be written to design/prototypes/<stem>/gate.log even on a red gate: ' + designDir(dir))
  const capturesDir = path.join(designDir(dir), 'captures')
  assert.ok(!fs.existsSync(capturesDir) || fs.readdirSync(capturesDir).length === 0,
    'no capture file may be written once the gate has failed: ' + capturesDir)
})

test('AC-20260928-02-5: --mark frozen exits 2 naming prototype.gate and runs no gate when gateCommand carries {testDirs} and no prototype.gate is declared', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  patchConfig(dir, (cfg) => { cfg.gateCommand = 'node --test {testDirs}'; delete cfg.prototype.gate })
  const r = markFrozen(dir)
  assert.strictEqual(r.status, 2, 'a host gateCommand carrying an unresolved {testDirs}/{scopeDirs} placeholder with no prototype.gate declared must refuse rather than run the literal placeholder text as a command: ' + JSON.stringify(r))
  assert.match(r.stderr, /prototype\.gate/, 'the refusal must name prototype.gate as the missing config key: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(designDir(dir), 'gate.log')), 'no gate may have run at all — gate.log must not exist: ' + designDir(dir))
})

test('AC-20260928-02-6: --mark frozen exits 0, writes four correctly-named captures, and writes contract.json with pins.test/tests/spec in the documented shape', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const r = markFrozen(dir)
  assert.strictEqual(r.status, 0, 'a green gate, declared composites, at least one behaviour pin, and a working capture stub must let the freeze succeed: ' + JSON.stringify(r))
  assert.match(r.stdout, /\(APPROVED\s*(→|->)\s*TESTS\)/, 'a successful frozen mark must print the (APPROVED → TESTS) checkpoint transition line: ' + r.stdout)

  const capturesDir = path.join(designDir(dir), 'captures')
  for (const name of ['women--default.json', 'women--empty.json', 'women_new--default.json', 'women_new--error.json']) {
    assert.ok(fs.existsSync(path.join(capturesDir, name)),
      'one capture file per route × state, named "<route slug>--<state>.json" (slug rule: "/" -> "_", leading "_" dropped), must exist: missing ' + name)
  }

  const contract = readContract(dir)
  assert.deepStrictEqual(contract.pins.test, ['p1', 'p3'], 'pins.test must list exactly the behaviour pin ids, in pin order: ' + JSON.stringify(contract.pins))
  assert.deepStrictEqual(contract.pins.look, ['p2'], 'pins.look must list exactly the non-behaviour pin ids: ' + JSON.stringify(contract.pins))
  assert.strictEqual(contract.tests.length, 2, 'contract.tests must carry one entry per behaviour pin: ' + JSON.stringify(contract.tests))
  assert.match(contract.tests[0].ac, new RegExp('^AC-' + TODAY + '-\\d{2}-1$'), 'the first reserved AC id must follow AC-<today>-<NN>-1: ' + JSON.stringify(contract.tests))
  assert.match(contract.tests[1].ac, new RegExp('^AC-' + TODAY + '-\\d{2}-2$'), 'the second reserved AC id must follow AC-<today>-<NN>-2: ' + JSON.stringify(contract.tests))
  assert.strictEqual(contract.spec, 'specs/' + TODAY + '/01-' + BRIEF_SLUG + '.md',
    'on an empty date directory the reserved spec number must be 01: ' + contract.spec)
})

// A lettered brief (04a) sits beside its numbered neighbour (04) in docs/roadmap — spec-status.js's
// normBrief is the id shape. Every other case here uses brief 28, which carries no letter.
test('a lettered brief freezes under its own id: status, contract, the e2e file name and the reserved spec name all carry 04a, never the neighbouring brief 04', () => {
  const dir = setupHost()
  const stem = '04a-project-notes'
  const briefRel = 'docs/roadmap/' + stem + '.md'
  fs.writeFileSync(path.join(dir, 'docs/roadmap/04-notes.md'), 'Phase: 1\nDepends on: none\n\n# Notes\n')
  fs.writeFileSync(path.join(dir, briefRel), 'Phase: 1\nDepends on: none\n\n# Project notes\n')
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'briefs 04 and 04a')
  const design = path.join(dir, 'design/prototypes', stem)
  fs.mkdirSync(design, { recursive: true })
  fs.writeFileSync(path.join(design, 'states.json'), JSON.stringify({
    schemaVersion: 1, viewport: { width: 1280, height: 800 }, routes: TWO_ROUTE_STATES,
  }, null, 2) + '\n')
  const drive = (name) => runNode(DRIVER, [briefRel, '--root', dir, '--mark', name], { env: captureEnv(dir) })

  const opened = drive('opened')
  assert.strictEqual(opened.status, 0, 'test setup requires --mark opened to succeed on the lettered brief: ' + opened.stderr)
  fs.writeFileSync(path.join(design, 'pins.json'), JSON.stringify({ schemaVersion: 1, pins: threePins() }, null, 2) + '\n')
  for (const name of ['round-done', 'approved']) {
    const r = drive(name)
    assert.strictEqual(r.status, 0, 'test setup requires --mark ' + name + ' to succeed on the lettered brief: ' + r.stderr)
  }
  const frozen = drive('frozen')
  assert.strictEqual(frozen.status, 0, 'a lettered brief must freeze like any other: ' + JSON.stringify(frozen))

  const status = JSON.parse(fs.readFileSync(path.join(design, 'status.json'), 'utf8'))
  const contract = JSON.parse(fs.readFileSync(path.join(design, 'contract.json'), 'utf8'))
  assert.strictEqual(status.brief, '04a',
    'status.json must record the lettered id — "04" names the neighbouring brief, so its prototype database and derived test file would collide: ' + status.brief)
  assert.strictEqual(contract.brief, '04a',
    'contract.json must record the lettered id — the generated spec stamps this value, and the build then resolves docs/roadmap/<brief>-*.md from it: ' + contract.brief)
  assert.strictEqual(contract.e2eFile, 'e2e/proto-04a.smoke.spec.ts',
    'the derived test file must be named for the lettered brief — brief 04\'s own prototype would otherwise overwrite it: ' + contract.e2eFile)
  assert.strictEqual(contract.spec, 'specs/' + TODAY + '/01-project-notes.md',
    'the reserved spec name must drop the whole brief id, letter included, exactly as it drops a plain number: ' + contract.spec)
})

test('AC-20260928-02-6: --mark frozen reserves spec number 03 when specs 01 and 02 already exist in today\'s date directory', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const specsDir = path.join(dir, 'specs', TODAY)
  fs.mkdirSync(specsDir, { recursive: true })
  fs.writeFileSync(path.join(specsDir, '01-unrelated.md'), '---\nstatus: hardened\n---\n# 01\n')
  fs.writeFileSync(path.join(specsDir, '02-unrelated.md'), '---\nstatus: hardened\n---\n# 02\n')
  const r = markFrozen(dir)
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  const contract = readContract(dir)
  assert.strictEqual(contract.spec, 'specs/' + TODAY + '/03-' + BRIEF_SLUG + '.md',
    'with 01 and 02 already occupied, the next free two-digit number (03) must be reserved (spec-number-check.js is the reference derivation): ' + contract.spec)
})

test('AC-20260928-02-6: --mark frozen exits 2 forwarding the capture stub\'s stderr verbatim and writes no contract.json when the capture exits 2 for one state', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const failUrl = 'http://127.0.0.1:1' + '/women?proto=empty'
  const r = markFrozen(dir, { PROTO_CAPTURE_FAIL_URL: failUrl })
  assert.strictEqual(r.status, 2, 'a capture that exits 2 for one route/state must abort the whole freeze: ' + JSON.stringify(r))
  assert.match(r.stderr, /capture-stub: forced failure/, 'the capture child\'s own stderr must be forwarded verbatim as the refusal (D3(6)): ' + r.stderr)
  assert.ok(!fs.existsSync(contractPath(dir)), 'a mid-capture failure must write no contract.json: ' + contractPath(dir))
})

test('AC-20260928-02-7: the bare run at TESTS prints one "pin <id> → <AC-ID>" line per behaviour pin, the substituted e2e file path, and a Session: line', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, 'test setup requires --mark frozen to succeed and reach TESTS: ' + frozen.stderr)
  const r = runNode(DRIVER, [BRIEF_REL, '--root', dir])
  assert.strictEqual(r.status, 0, 'the TESTS step is informational, not a refusal: ' + JSON.stringify(r))
  assert.match(r.stdout, /state:\s*TESTS/, 'once frozen, the bare run must report state TESTS: ' + r.stdout)
  const contract = readContract(dir)
  for (const t of contract.tests) {
    const re = new RegExp('pin ' + t.pin + ' (→|->) ' + t.ac.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    assert.match(r.stdout, re, 'one "pin <id> → <AC-ID>" line per behaviour pin, in pin order, must be printed (D4): missing for pin ' + t.pin + ' — stdout: ' + r.stdout)
  }
  assert.match(r.stdout, /e2e\/proto-28\.smoke\.spec\.ts/, 'the {brief}-substituted e2eFile path must be printed so the session knows where to write the tests (D4): ' + r.stdout)
  assert.match(r.stdout, /Session:/, 'a Session: line telling the session to write the tests must be printed: ' + r.stdout)
})

test('AC-20260928-02-7: --mark tests-derived refuses naming the e2e file when it does not exist on main', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, frozen.stderr)
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 2, 'tests-derived must refuse when the reserved e2e file has not been authored yet: ' + JSON.stringify(r))
  assert.match(r.stderr, /e2e\/proto-28\.smoke\.spec\.ts/, 'the refusal must name the missing e2e file path: ' + r.stderr)
})

test('AC-20260928-02-7: --mark tests-derived refuses naming the second AC id when the e2e file carries only the first', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, frozen.stderr)
  const contract = readContract(dir)
  const e2eAbs = path.join(dir, 'e2e/proto-28.smoke.spec.ts')
  fs.mkdirSync(path.dirname(e2eAbs), { recursive: true })
  fs.writeFileSync(e2eAbs, "test('" + contract.tests[0].ac + " pin " + contract.tests[0].pin + ": n1', () => {})\n")
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 2, 'a file carrying only the first reserved AC id must refuse tests-derived: ' + JSON.stringify(r))
  assert.match(r.stderr, new RegExp(contract.tests[1].ac), 'the refusal must name the still-missing second AC id: ' + r.stderr)
})

test('AC-20260928-02-7: --mark tests-derived refuses containing "e2eList" and the missing id when the file carries both ids but the list stub under-reports', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, frozen.stderr)
  const contract = readContract(dir)
  const e2eAbs = path.join(dir, 'e2e/proto-28.smoke.spec.ts')
  fs.mkdirSync(path.dirname(e2eAbs), { recursive: true })
  fs.writeFileSync(e2eAbs,
    "test('" + contract.tests[0].ac + " pin " + contract.tests[0].pin + ": n1', () => {})\n" +
    "test('" + contract.tests[1].ac + " pin " + contract.tests[1].pin + ": n3', () => {})\n")
  const r = markTestsDerived(dir, { LIST_TESTS_LIMIT: '1' })
  assert.strictEqual(r.status, 2, 'a file carrying both ids but whose e2eList stub prints only one title must still refuse (the host runner is the oracle, not the file content): ' + JSON.stringify(r))
  assert.match(r.stderr, /e2eList/, 'the refusal must name e2eList as the check that failed: ' + r.stderr)
  assert.match(r.stderr, new RegExp(contract.tests[1].ac), 'the refusal must name the id the list stub failed to report: ' + r.stderr)
})

// Drives a host all the way through a successful tests-derived run: authors extra base-tracked
// files (so the export diff has something to carry — an "old" file that gets deleted on the
// prototype branch must already exist at base), advances to APPROVED, freezes, makes the
// data/API-layer edits on proto/<stem>, authors the derived e2e file with both AC ids, and marks
// tests-derived. Returns { dir, contract }.
// opts.wireOnProto: main carries no overlay import; the session wires it on proto/<stem> after
// opening (the import-only dev-entry diff). opts.briefArg: the brief path the tests-derived run
// is given (default BRIEF_REL).
function driveToTestsDerived(dir, opts) {
  opts = opts || {}
  fs.writeFileSync(path.join(dir, 'src/db/old.js'), 'module.exports = { legacy: true }\n')
  if (opts.wireOnProto) fs.writeFileSync(path.join(dir, 'src/main.js'), 'export function main() { return 1 }\n')
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'seed src/db/old.js on base'], { encoding: 'utf8' })

  advanceToApproved(dir, TWO_ROUTE_STATES, threePins(), opts.wireOnProto ? () => {
    const wtDir = worktreePath(dir)
    fs.writeFileSync(path.join(wtDir, 'src/main.js'), "if (import.meta.env.DEV) import('./proto-overlay.js')\nexport function main() { return 1 }\n")
    execFileSync('git', ['-C', wtDir, 'commit', '-q', '-am', 'wire overlay'], { encoding: 'utf8' })
  } : null)
  patchConfig(dir, (cfg) => { cfg.prototype.export = ['src/db/**', 'drizzle/**'] })
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, 'test setup requires --mark frozen to succeed: ' + frozen.stderr)
  const contract = readContract(dir)

  const wt = worktreePath(dir)
  fs.appendFileSync(path.join(wt, 'src/db/schema.js'), '// modified on proto/' + STEM + '\n')
  fs.mkdirSync(path.join(wt, 'drizzle'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'drizzle/0001.sql'), '-- migration\n')
  fs.rmSync(path.join(wt, 'src/db/old.js'))
  fs.mkdirSync(path.join(wt, 'src/ui'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'src/ui/a.js'), 'export const A = 2\n')
  execFileSync('git', ['-C', wt, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', wt, 'commit', '-q', '-m', 'data/API + UI edits on ' + BRANCH], { encoding: 'utf8' })

  const e2eAbs = path.join(dir, 'e2e/proto-28.smoke.spec.ts')
  fs.mkdirSync(path.dirname(e2eAbs), { recursive: true })
  fs.writeFileSync(e2eAbs,
    "test('" + contract.tests[0].ac + " pin " + contract.tests[0].pin + ": n1', () => {})\n" +
    "test('" + contract.tests[1].ac + " pin " + contract.tests[1].pin + ": n3', () => {})\n")

  const r = opts.briefArg
    ? runNode(DRIVER, [opts.briefArg, '--root', dir, '--mark', 'tests-derived'], { env: captureEnv(dir) })
    : markTestsDerived(dir)
  return { dir, contract, r }
}

test('AC-20260928-02-8: --mark tests-derived creates harden/<stem> holding exactly the export globs\' diff, leaves no harden-<stem> worktree, appends the brief\'s sub-plan, and is a no-op on a second run', () => {
  const dir = setupHost()
  const { r } = driveToTestsDerived(dir)
  assert.strictEqual(r.status, 0, 'a fully-satisfied tests-derived run (both AC ids listed by the host runner) must succeed: ' + JSON.stringify(r))

  assert.ok(branchExists(dir, 'harden/' + STEM), 'a harden/<stem> branch must exist after export: ' + git(dir, 'branch', '--list'))
  assert.ok(!worktreeListLines(dir).includes('harden-' + STEM),
    'the transient harden-<stem> worktree must be removed once the export commit lands: ' + worktreeListLines(dir))

  const diff = git(dir, 'diff', '--name-status', 'main', 'harden/' + STEM, '--', 'src/db/**', 'drizzle/**')
  const lines = diff.trim().split('\n').filter(Boolean).sort()
  assert.deepStrictEqual(lines, ['A\tdrizzle/0001.sql', 'D\tsrc/db/old.js', 'M\tsrc/db/schema.js'].sort(),
    'harden/<stem>\'s diff against base, restricted to the export globs, must be exactly one M, one A and one D — no more, no fewer: ' + diff)
  const uiDiff = git(dir, 'diff', '--name-status', 'main', 'harden/' + STEM, '--', 'src/ui/**')
  assert.strictEqual(uiDiff.trim(), '', 'a file outside the export globs (src/ui/a.js) must never reach harden/<stem>: ' + uiDiff)

  const brief = fs.readFileSync(path.join(dir, 'docs/roadmap/28-functional-prototype.md'), 'utf8')
  assert.match(brief, /## Data\/API sub-plan/, 'the brief file must gain a "## Data/API sub-plan" section: ' + brief)
  assert.match(brief, /```harden/, 'the sub-plan must be a fenced ```harden block: ' + brief)
  for (const p of ['src/db/schema.js', 'drizzle/0001.sql', 'src/db/old.js']) {
    assert.ok(brief.includes(p), 'the sub-plan must list the exported path ' + p + ': ' + brief)
  }

  const shaBefore = git(dir, 'rev-parse', 'harden/' + STEM).trim()
  const second = markTestsDerived(dir)
  const shaAfter = git(dir, 'rev-parse', 'harden/' + STEM).trim()
  assert.strictEqual(shaAfter, shaBefore, 'a second tests-derived run with marks.exported already set must not touch harden/<stem> again: ' + JSON.stringify(second))
})

test('AC-20260928-02-8: --mark tests-derived replaces a whole previous Data/API sub-plan section, not just its heading line, when one already exists on the brief', () => {
  const dir = setupHost()
  const briefAbsPath = path.join(dir, 'docs/roadmap/28-functional-prototype.md')
  const existingBrief = fs.readFileSync(briefAbsPath, 'utf8')
  fs.writeFileSync(briefAbsPath, existingBrief.replace(/\n*$/, '\n') + '\n' +
    '## Data/API sub-plan\n\n```harden\nsrc/old/**\n  M src/old/stale.js\n  A src/old/another-stale.js\n```\n')
  const { r } = driveToTestsDerived(dir)
  assert.strictEqual(r.status, 0, 'test setup requires a full tests-derived run to succeed: ' + JSON.stringify(r))

  const brief = fs.readFileSync(briefAbsPath, 'utf8')
  const blocks = brief.match(/```harden[\s\S]*?```/g) || []
  assert.strictEqual(blocks.length, 1,
    'a re-export must replace a previous Data/API sub-plan section wholesale (D5: "replacing a previous one"), not leave a stale ```harden block stacked beneath a truncated new heading: ' + brief)
  assert.ok(!brief.includes('src/old/stale.js'),
    'the stale sub-plan\'s content (not just its heading line) must be gone once the section is replaced — a heading-only replace regex leaves this line behind: ' + brief)
  assert.ok(!brief.includes('src/old/another-stale.js'),
    'the stale sub-plan\'s second content line must also be gone: ' + brief)
  for (const p of ['src/db/schema.js', 'drizzle/0001.sql', 'src/db/old.js']) {
    assert.ok(brief.includes(p), 'the new sub-plan must still list the freshly exported path ' + p + ': ' + brief)
  }
})

test('AC-20260928-02-9: the generated spec\'s Goal carries the brief\'s whole hard-wrapped ## Result first paragraph, not just its first line', () => {
  const dir = setupHost()
  const briefAbsPath = path.join(dir, 'docs/roadmap/28-functional-prototype.md')
  const existingBrief = fs.readFileSync(briefAbsPath, 'utf8')
  fs.writeFileSync(briefAbsPath, existingBrief.replace(/\n*$/, '\n') +
    '\n## Result\n\n' +
    'The functional prototype proves the women list can be filtered live\n' +
    'and every filtered row still opens its own record sheet correctly.\n\n' +
    '## Another section\n\nunrelated content that must never reach the Goal\n')
  const { r, contract } = driveToTestsDerived(dir)
  assert.strictEqual(r.status, 0, 'test setup requires a full tests-derived run to succeed: ' + JSON.stringify(r))
  const specText = fs.readFileSync(path.join(dir, contract.spec), 'utf8')
  const goalMatch = /## Goal\n\n([^\n]*)\n/.exec(specText)
  assert.ok(goalMatch, 'the generated spec must carry a ## Goal section with a one-line paragraph: ' + specText.slice(0, 400))
  assert.match(goalMatch[1], /filtered live/,
    'the Goal must carry the first line of the brief\'s ## Result paragraph: ' + goalMatch[1])
  assert.match(goalMatch[1], /record sheet correctly/,
    'the Goal must also carry the SECOND line of the hard-wrapped ## Result paragraph (D6: "the brief\'s ## Result first paragraph") — a regex that stops at the first line break truncates it: ' + goalMatch[1])
  assert.ok(!/unrelated content/.test(goalMatch[1]),
    'the Goal must stop at the blank line ending the paragraph and never pull in the next section\'s content: ' + goalMatch[1])
})

test('AC-20260928-02-10: a dbDestroy that fails on a second invocation still reaches CLOSED after a dirty-worktree resume, because dbDestroy runs at most once', () => {
  const dir = setupHost()
  fs.writeFileSync(path.join(dir, 'src/db/old.js'), 'module.exports = { legacy: true }\n')
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'seed src/db/old.js on base'], { encoding: 'utf8' })
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  patchConfig(dir, (cfg) => {
    cfg.prototype.export = ['src/db/**', 'drizzle/**']
    // A non-idempotent stand-in for prototype.dbDestroy (patched on this test's own host copy,
    // never the shared fixture script): it exits 1 if its own marker already exists, so a
    // driver that re-invokes dbDestroy on a resumed --mark tests-derived run fails the resume.
    cfg.prototype.dbDestroy =
      'root="$(cd "$PROTO_WORKTREE/../../.." && pwd)"; ' +
      'if [ -f "$root/db-dropped" ]; then echo "dbDestroy is not idempotent -- db-dropped already exists" >&2; exit 1; fi; ' +
      'node scripts/destroy-db.js'
  })
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, frozen.stderr)
  const contract = readContract(dir)
  const wt = worktreePath(dir)
  fs.appendFileSync(path.join(wt, 'src/db/schema.js'), '// modified\n')
  fs.rmSync(path.join(wt, 'src/db/old.js'))
  execFileSync('git', ['-C', wt, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', wt, 'commit', '-q', '-m', 'exported edits'], { encoding: 'utf8' })
  const e2eAbs = path.join(dir, 'e2e/proto-28.smoke.spec.ts')
  fs.mkdirSync(path.dirname(e2eAbs), { recursive: true })
  fs.writeFileSync(e2eAbs,
    "test('" + contract.tests[0].ac + " pin " + contract.tests[0].pin + ": n1', () => {})\n" +
    "test('" + contract.tests[1].ac + " pin " + contract.tests[1].pin + ": n3', () => {})\n")
  // Dirty the worktree AFTER the export-worthy commit, so the deletion step (which runs
  // dbDestroy first) refuses on the worktree-remove step, after dbDestroy has already run once.
  fs.writeFileSync(path.join(wt, 'src/ui-scratch.txt'), 'uncommitted\n')

  const first = markTestsDerived(dir)
  assert.strictEqual(first.status, 2, 'a dirty prototype worktree at the deletion step must still refuse: ' + JSON.stringify(first))
  assert.match(first.stderr, /commit or discard on proto\//, 'the refusal must carry the literal phrase "commit or discard on proto/<stem>": ' + first.stderr)
  assert.ok(fs.existsSync(path.join(dir, 'db-dropped')), 'dbDestroy must have run once before the dirty-worktree refusal: ' + dir)

  fs.rmSync(path.join(wt, 'src/ui-scratch.txt'))
  const second = markTestsDerived(dir)
  assert.strictEqual(second.status, 0,
    'a re-run after cleaning the dirty worktree must resume at the undone deletion step without re-invoking the already-succeeded, non-idempotent dbDestroy a second time (D7: "each step checks its own postcondition first"): ' + JSON.stringify(second))
  const state = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--state'])
  assert.strictEqual(state.stdout, 'CLOSED\n',
    'the resumed run must reach CLOSED once deletion completes without dbDestroy erroring on its non-idempotent second call: ' + JSON.stringify(state))
})

test('AC-20260928-02-8: --mark tests-derived exits 2 containing "harden/<stem> exists" when the branch pre-exists with marks.exported unset', () => {
  const dir = setupHost()
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, frozen.stderr)
  const contract = readContract(dir)
  const e2eAbs = path.join(dir, 'e2e/proto-28.smoke.spec.ts')
  fs.mkdirSync(path.dirname(e2eAbs), { recursive: true })
  fs.writeFileSync(e2eAbs,
    "test('" + contract.tests[0].ac + " pin " + contract.tests[0].pin + ": n1', () => {})\n" +
    "test('" + contract.tests[1].ac + " pin " + contract.tests[1].pin + ": n3', () => {})\n")
  execFileSync('git', ['-C', dir, 'branch', 'harden/' + STEM], { encoding: 'utf8' })
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 2, 'a pre-existing harden/<stem> with marks.exported unset must refuse rather than silently reuse or overwrite it: ' + JSON.stringify(r))
  assert.match(r.stderr, new RegExp('harden/' + STEM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' exists'),
    'the refusal must carry the literal phrase "harden/<stem> exists": ' + r.stderr)
})

test('AC-20260928-02-9: the same mark writes the reserved spec with the documented frontmatter, Decisions, File Plan and ACs, and both ac-matrix --lint and promise-sweep exit 0 with zero findings — AC-20261001-01-18', () => {
  const dir = setupHost()
  const { r, contract } = driveToTestsDerived(dir)
  assert.strictEqual(r.status, 0, JSON.stringify(r))

  const specAbsPath = path.join(dir, contract.spec)
  assert.ok(fs.existsSync(specAbsPath), 'the reserved spec path must exist on disk once tests-derived completes: ' + specAbsPath)
  const specText = fs.readFileSync(specAbsPath, 'utf8')

  assert.match(specText, /status:\s*hardened/, 'the generated spec\'s frontmatter must carry status: hardened: ' + specText.slice(0, 300))
  assert.match(specText, /brief:\s*['"]?28['"]?/, 'the generated spec\'s frontmatter must carry brief: 28: ' + specText.slice(0, 300))
  assert.match(specText, /lane:\s*behaviour/, 'the generated spec\'s frontmatter must carry lane: behaviour: ' + specText.slice(0, 300))
  assert.match(specText, /open_markers:\s*0/, 'the generated spec\'s frontmatter must carry open_markers: 0: ' + specText.slice(0, 300))

  assert.match(specText, new RegExp(contract.tests[0].ac), 'Decisions row D1 must cite the first reserved AC id: ' + specText)
  assert.match(specText, new RegExp(contract.tests[1].ac), 'Decisions row D1 must cite the second reserved AC id: ' + specText)

  assert.match(specText, /src\/db\/schema\.js\s*\|\s*MODIFY/, 'the File Plan must carry src/db/schema.js | MODIFY: ' + specText)
  assert.match(specText, /drizzle\/0001\.sql\s*\|\s*CREATE/, 'the File Plan must carry drizzle/0001.sql | CREATE: ' + specText)
  assert.match(specText, /src\/db\/old\.js\s*\|\s*DELETE/, 'the File Plan must carry src/db/old.js | DELETE: ' + specText)
  assert.match(specText, /src\/ui\/a\.js\s*\|\s*MODIFY/, 'the File Plan must carry the outside-export proto/<stem> edit src/ui/a.js | MODIFY: ' + specText)
  assert.ok(!specText.includes('src/proto-overlay.js'), 'the overlay file must never appear as a File Plan row in the generated spec: ' + specText)
  assert.match(specText, /e2e\/proto-28\.smoke\.spec\.ts\s*\|\s*CREATE\s*\|\s*tests/, 'the e2e file must be a File Plan tests row: ' + specText)

  const acBullets = specText.match(/- \*\*AC-[^*]+\*\*[^\n]*/g) || []
  assert.strictEqual(acBullets.length, 2, 'the generated spec must carry exactly one AC bullet per behaviour pin: ' + JSON.stringify(acBullets))
  for (const bullet of acBullets) {
    assert.match(bullet, /→ writes e2e\/proto-28\.smoke\.spec\.ts$/, 'every AC bullet must end "→ writes e2e/proto-28.smoke.spec.ts": ' + bullet)
  }

  const lint = runNode('scripts/ac-matrix.js', ['--spec', contract.spec, '--lint', '--resolve-root', dir], { cwd: dir })
  assert.strictEqual(lint.status, 0, 'ac-matrix.js --lint --resolve-root <root> must accept the generated spec with zero findings: ' + JSON.stringify(lint))
  const sweep = runNode('scripts/promise-sweep.js', ['--spec', contract.spec], { cwd: dir })
  assert.strictEqual(sweep.status, 0, 'promise-sweep.js must accept the generated spec\'s Decisions with zero orphans: ' + JSON.stringify(sweep))
})

test('AC-20260928-02-10: the same mark destroys the database, removes the prototype worktree and branch, leaves harden/<stem>, and --state prints CLOSED', () => {
  const dir = setupHost()
  const { r } = driveToTestsDerived(dir)
  assert.strictEqual(r.status, 0, JSON.stringify(r))

  assert.ok(fs.existsSync(path.join(dir, 'db-dropped')), 'prototype.dbDestroy must have run with cwd = the prototype worktree, writing db-dropped into the host root (D7): ' + dir)
  assert.ok(!worktreeListLines(dir).includes(worktreePath(dir)), 'the prototype worktree must be removed from git worktree list: ' + worktreeListLines(dir))
  assert.ok(!branchExists(dir, BRANCH), 'the proto/<stem> branch must be deleted (git branch -D): ' + git(dir, 'branch', '--list'))
  assert.ok(branchExists(dir, 'harden/' + STEM), 'harden/<stem> must be the one survivor — it must still exist after deletion: ' + git(dir, 'branch', '--list'))

  const state = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--state'])
  assert.strictEqual(state.stdout, 'CLOSED\n', '--state must print exactly "CLOSED\\n" once the deletion step has completed: ' + JSON.stringify(state))
})

test('AC-20260928-02-10: the same mark exits 2 containing "commit or discard on proto/<stem>" when the prototype worktree is dirty, leaving harden/<stem> and the spec already written; a re-run after cleaning exits 0', () => {
  const dir = setupHost()
  fs.writeFileSync(path.join(dir, 'src/db/old.js'), 'module.exports = { legacy: true }\n')
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'seed src/db/old.js on base'], { encoding: 'utf8' })
  advanceToApproved(dir, TWO_ROUTE_STATES, threePins())
  patchConfig(dir, (cfg) => { cfg.prototype.export = ['src/db/**', 'drizzle/**'] })
  const frozen = markFrozen(dir)
  assert.strictEqual(frozen.status, 0, frozen.stderr)
  const contract = readContract(dir)
  const wt = worktreePath(dir)
  fs.appendFileSync(path.join(wt, 'src/db/schema.js'), '// modified\n')
  fs.rmSync(path.join(wt, 'src/db/old.js'))
  execFileSync('git', ['-C', wt, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', wt, 'commit', '-q', '-m', 'exported edits'], { encoding: 'utf8' })
  const e2eAbs = path.join(dir, 'e2e/proto-28.smoke.spec.ts')
  fs.mkdirSync(path.dirname(e2eAbs), { recursive: true })
  fs.writeFileSync(e2eAbs,
    "test('" + contract.tests[0].ac + " pin " + contract.tests[0].pin + ": n1', () => {})\n" +
    "test('" + contract.tests[1].ac + " pin " + contract.tests[1].pin + ": n3', () => {})\n")
  // Dirty the worktree AFTER the export-worthy commit: an uncommitted change must still block
  // deletion even though export/spec-write already succeeded.
  fs.writeFileSync(path.join(wt, 'src/ui-scratch.txt'), 'uncommitted\n')

  const first = markTestsDerived(dir)
  assert.strictEqual(first.status, 2, 'a dirty prototype worktree at the deletion step must refuse rather than discard the uncommitted change: ' + JSON.stringify(first))
  assert.match(first.stderr, /commit or discard on proto\//, 'the refusal must carry the literal phrase "commit or discard on proto/<stem>": ' + first.stderr)
  assert.ok(branchExists(dir, 'harden/' + STEM), 'harden/<stem> must already exist — export ran before the deletion step that refused: ' + git(dir, 'branch', '--list'))
  assert.ok(fs.existsSync(path.join(dir, contract.spec)), 'the generated spec must already exist — writeSpec ran before the deletion step that refused: ' + contract.spec)

  fs.rmSync(path.join(wt, 'src/ui-scratch.txt'))
  const second = markTestsDerived(dir)
  assert.strictEqual(second.status, 0, 'a re-run after cleaning the dirty worktree must resume at the undone deletion step and succeed: ' + JSON.stringify(second))
})

test('AC-20260928-02-11: the same mark appends one .claude/spec-runs.jsonl ledger row in the documented shape, visible to fleet-reader.js with no drift, and CLOSED prints "Next:"', () => {
  const dir = setupHost()
  const { r, contract } = driveToTestsDerived(dir)
  assert.strictEqual(r.status, 0, JSON.stringify(r))

  const ledgerPath = path.join(dir, '.claude/spec-runs.jsonl')
  assert.ok(fs.existsSync(ledgerPath), 'the freeze must append to .claude/spec-runs.jsonl: ' + ledgerPath)
  const rows = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const row = rows.find((x) => x.stage === 'prototype' && x.spec === contract.spec)
  assert.ok(row, 'a stage:"prototype" row naming the reserved spec path must be appended: ' + JSON.stringify(rows))
  assert.strictEqual(row.brief, '28', 'the ledger row must carry brief: "28": ' + JSON.stringify(row))
  assert.strictEqual(row.rounds, 1, 'the ledger row must carry rounds: 1 (this run recorded exactly one round): ' + JSON.stringify(row))
  assert.deepStrictEqual(row.pins, { total: 3, behaviour: 2, look: 1 }, 'the ledger row must carry the exact pin counts (D8): ' + JSON.stringify(row))
  assert.strictEqual(row.routes, 2, 'the ledger row must carry routes: 2: ' + JSON.stringify(row))
  assert.strictEqual(row.states, 4, 'the ledger row must carry states: 4 (two routes x two states each): ' + JSON.stringify(row))
  assert.strictEqual(row.captures, 4, 'the ledger row must carry captures: 4: ' + JSON.stringify(row))
  assert.strictEqual(row.exported && row.exported.files, 3, 'the ledger row must carry exported.files: 3 (M schema.js, A 0001.sql, D old.js): ' + JSON.stringify(row))
  assert.strictEqual(row.harden, 'harden/' + STEM, 'the ledger row must carry harden: "harden/<stem>": ' + JSON.stringify(row))
  assert.strictEqual(row.verdict, 'frozen', 'the ledger row must carry verdict: "frozen": ' + JSON.stringify(row))

  const fleet = runNode('scripts/fleet-reader.js', ['--repos-root', path.dirname(dir), '--json'])
  assert.strictEqual(fleet.status, 0, 'fleet-reader.js --json must exit 0 reading a ledger that carries this row: ' + fleet.stderr)
  const parsed = JSON.parse(fleet.stdout)
  const repo = parsed.driftCensus.byRepo.find((x) => x.name === path.basename(dir))
  assert.ok(repo, 'the fixture host must appear in fleet-reader\'s drift census: ' + JSON.stringify(parsed.driftCensus))
  assert.strictEqual(repo.drift['missing-spec'] || 0, 0, 'a prototype row carrying spec must never be counted under missing-spec: ' + JSON.stringify(repo.drift))
  assert.strictEqual(repo.drift['stage-unknown'] || 0, 0, 'the prototype stage is known — it must never count as stage-unknown: ' + JSON.stringify(repo.drift))

  const state = runNode(DRIVER, [BRIEF_REL, '--root', dir])
  assert.match(state.stdout, /Next:/, 'the CLOSED step must print a "Next:" line (spec-status --next verbatim): ' + state.stdout)
})

test('tests-derived accepts the brief as an absolute path: the sub-plan lands in the real brief and harden/<stem> is created', () => {
  const dir = setupHost()
  const briefAbs = path.join(dir, BRIEF_REL)
  const { r } = driveToTestsDerived(dir, { briefArg: briefAbs })
  assert.strictEqual(r.status, 0, 'an absolute brief path must not be re-joined under the root: ' + JSON.stringify(r))
  assert.match(fs.readFileSync(briefAbs, 'utf8'), /## Data\/API sub-plan/, 'the sub-plan must land in the brief the path names')
  assert.ok(branchExists(dir, 'harden/' + STEM), 'harden/<stem> must exist after export')
})

test('tests-derived leaves no harden/<stem> behind when the sub-plan cannot be written, so the rerun is not refused as "exists"', () => {
  const dir = setupHost()
  const { r } = driveToTestsDerived(dir, { briefArg: path.join(dir, 'no-such-dir', STEM + '.md') })
  assert.strictEqual(r.status, 2, 'an unwritable brief path must refuse: ' + JSON.stringify(r))
  assert.match(r.stderr, /sub-plan/, 'the refusal must name the sub-plan write: ' + r.stderr)
  assert.ok(!branchExists(dir, 'harden/' + STEM), 'no harden/<stem> may be left behind: ' + git(dir, 'branch', '--list'))
  const rerun = markTestsDerived(dir)
  assert.strictEqual(rerun.status, 0, 'the rerun with a good brief path must succeed: ' + JSON.stringify(rerun))
})

test('the generated File Plan drops the dev-entry file whose prototype-branch diff is only the overlay import', () => {
  const dir = setupHost()
  const { r, contract } = driveToTestsDerived(dir, { wireOnProto: true })
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  const specText = fs.readFileSync(path.join(dir, contract.spec), 'utf8')
  assert.ok(!specText.includes('src/main.js'), 'the overlay wiring is prototype tooling and must not ship as a File Plan row: ' + specText)
  assert.match(specText, /src\/ui\/a\.js\s*\|\s*MODIFY/, 'real outside-export edits must still be listed: ' + specText)
})
