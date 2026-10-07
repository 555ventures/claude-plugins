'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { runNode } = require('../helpers')
const {
  setupHost, patchConfig, writeStates, statusOf, designDir, worktreePath, bare, mark,
  advanceToApproved, advanceToTests, markContracted, markTestsDerived, authorDerivedTests,
  contractPath, readContract, pictureCalls, e2eEnv, onlyLookPins, DRIVER, BRIEF_REL, BRANCH, STEM, E2E_FILE,
} = require('./fixture')

// specs/20261007/01-approve-writes-a-behaviour-contract.md D4-D9 — AC-20261007-01-2 .. AC-20261007-01-8:
// --mark contracted writes pictures + contract.json, --mark tests-derived verifies and copies the
// tests, queues the plan paste, --mark closed deletes the worktree.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CAPTURES = ['women--default.png', 'women--empty.png', 'women_new--default.png', 'women_new--error.png']
const CONTRACT_REL = 'design/prototypes/' + STEM + '/contract.json'
const LOCAL_TESTS_REL = 'design/prototypes/' + STEM + '/tests/' + path.basename(E2E_FILE)

function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }) }
function ledgerRows(dir) {
  const p = path.join(dir, '.claude/spec-runs.jsonl')
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
function queueList(dir) { return runNode('scripts/spec-queue.js', ['list'], { cwd: dir }) }
function stateOf(dir) { return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--state']).stdout }
function pngFiles(dir) {
  const d = path.join(designDir(dir), 'captures')
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.png')) : []
}
function advanceToContracted(dir) {
  advanceToTests(dir)
  authorDerivedTests(dir)
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 0, 'test setup requires --mark tests-derived to succeed with both pin tests committed and the run stub green: ' + r.stderr)
}

test('AC-20261007-01-2: --mark contracted pictures every route x state through the host picture command and writes contract.json with every pin as a record', () => {
  const dir = setupHost()
  const status = advanceToApproved(dir)
  const r = markContracted(dir)
  assert.strictEqual(r.status, 0, 'the contracted mark must succeed on a fixture host with behaviour pins and a picture command: ' + JSON.stringify(r))
  assert.match(r.stdout, /\(APPROVED\s*(→|->)\s*TESTS\)/, 'the accepted mark must print the APPROVED to TESTS checkpoint so the session knows the next state: ' + r.stdout)

  for (const f of CAPTURES) {
    const abs = path.join(designDir(dir), 'captures', f)
    assert.ok(fs.existsSync(abs), 'the contract needs one picture per route x state — missing ' + f)
    assert.ok(fs.readFileSync(abs).subarray(0, 8).equals(PNG_SIG), f + ' must start with the PNG signature the driver verifies')
  }

  const c = readContract(dir)
  assert.strictEqual(c.schemaVersion, 2, 'contract.json must carry schemaVersion 2 so a reader can tell it from a frozen-era contract: ' + JSON.stringify(c))
  assert.strictEqual(c.routes['/women'].empty.capture, 'captures/women--empty.png', 'routes must map each state to its capture path: ' + JSON.stringify(c.routes))
  assert.strictEqual(c.pins.length, 3, 'every pin, look pins included, must be a record in the contract: ' + JSON.stringify(c.pins))
  assert.deepStrictEqual(c.pins[0], {
    id: 'p1', kind: 'behaviour', screen: '/women', state: 'default',
    anchor: 'WomanRow[w_01]<WomenList<WomenScreen#0', note: '保存すると行が緑になる', round: 1,
  }, 'a pin record carries id, kind, screen, state, anchor, note and round in pin order: ' + JSON.stringify(c.pins[0]))
  assert.strictEqual(c.pins[1].anchor, null, 'a screen-note pin must record anchor null, not omit it: ' + JSON.stringify(c.pins[1]))
  assert.strictEqual(c.tests, null, 'tests stays null until tests-derived completes the contract: ' + JSON.stringify(c))
  for (const k of ['spec', 'ids', 'composites', 'frozenAt']) {
    assert.ok(!(k in c), 'the contract carries no ' + k + ' — no spec is reserved, no composite is captured, nothing is frozen: ' + JSON.stringify(Object.keys(c)))
  }
  assert.ok(!fs.existsSync(path.join(designDir(dir), 'gate.log')), 'no gate runs on the prototype tree, so no gate.log may be written')
  assert.ok(!fs.existsSync(path.join(dir, 'specs')) || fs.readdirSync(path.join(dir, 'specs')).length === 0,
    'approve reserves no spec number — plan owns the spec')

  const call = pictureCalls(dir).find((x) => /\/women\?proto=empty$/.test(x.argv[0]))
  assert.ok(call, 'the picture command must be run for /women (empty): ' + JSON.stringify(pictureCalls(dir)))
  assert.strictEqual(call.argv[0], 'http://127.0.0.1:' + status.appPort + '/women?proto=empty',
    'the picture url is the resolved app address joined to the state path — a wrong address pictures nothing: ' + call.argv[0])
  assert.strictEqual(fs.realpathSync(path.dirname(call.argv[1])), fs.realpathSync(path.join(designDir(dir), 'captures')),
    '{out} must be an absolute path inside design/prototypes/<stem>/captures: ' + call.argv[1])
  assert.strictEqual(path.basename(call.argv[1]), 'women--empty.png', '{out} must be <slug>--<state>.png: ' + call.argv[1])
  assert.deepStrictEqual(call.argv.slice(2), ['1280', '800'], '{width} and {height} come from states.json viewport: ' + JSON.stringify(call.argv))
  assert.strictEqual(fs.realpathSync(call.cwd), fs.realpathSync(worktreePath(dir)), 'the picture command runs with cwd = the prototype worktree: ' + call.cwd)
  assert.strictEqual(call.env.PROTO_BRANCH, BRANCH, 'the picture command gets PROTO_BRANCH as dbCreate does: ' + JSON.stringify(call.env))

  const frozen = mark(dir, 'frozen')
  assert.strictEqual(frozen.status, 2, 'frozen is retired and must refuse: ' + JSON.stringify(frozen))
  assert.ok(frozen.stderr.includes('--mark frozen is unknown'), 'the retired mark must be reported unknown, not silently accepted: ' + frozen.stderr)
})

test('AC-20261007-01-3: --mark contracted refuses before approved, naming approved', () => {
  const dir = setupHost()
  writeStates(dir)
  assert.strictEqual(mark(dir, 'opened').status, 0, 'test setup requires --mark opened to succeed')
  const r = markContracted(dir)
  assert.strictEqual(r.status, 2, 'contracting an unapproved prototype would picture an unreviewed round: ' + JSON.stringify(r))
  assert.match(r.stderr, /approved/, 'the refusal must name the missing approved mark: ' + r.stderr)
  assert.ok(!/is unknown/.test(r.stderr), 'the refusal must be the precondition check, not the generic unknown-mark failure: ' + r.stderr)
  assert.ok(!fs.existsSync(contractPath(dir)), 'a refused mark writes no contract.json')
})

test('AC-20261007-01-3: --mark contracted refuses a prototype with only look pins, naming --mark closed, and writes no contract', () => {
  const dir = setupHost()
  advanceToApproved(dir, null, onlyLookPins())
  const r = markContracted(dir)
  assert.strictEqual(r.status, 2, 'a prototype that changed no behaviour is the direct lane and must not produce a contract: ' + JSON.stringify(r))
  assert.match(r.stderr, /no behaviour pins/, 'the refusal must carry the phrase "no behaviour pins": ' + r.stderr)
  assert.ok(r.stderr.includes('--mark closed'), 'the refusal must name --mark closed as the way out: ' + r.stderr)
  assert.ok(!fs.existsSync(contractPath(dir)), 'a refused mark writes no contract.json')
})

test('AC-20261007-01-3: --mark contracted refuses an undeclared prototype.picture, naming it, and writes no picture', () => {
  const dir = setupHost()
  advanceToApproved(dir)
  patchConfig(dir, (cfg) => { delete cfg.prototype.picture })
  const r = markContracted(dir)
  assert.strictEqual(r.status, 2, 'no picture command means no design reference — the mark must refuse: ' + JSON.stringify(r))
  assert.match(r.stderr, /prototype\.picture/, 'the refusal must name prototype.picture so the remedy is discoverable: ' + r.stderr)
  assert.deepStrictEqual(pngFiles(dir), [], 'a refusal at the picture precondition writes no PNG')
  assert.ok(!fs.existsSync(contractPath(dir)), 'a refused mark writes no contract.json')
})

test('AC-20261007-01-3: a picture command that exits non-zero for one state fails the mark naming the route, state, url and exit code, and writes no contract', () => {
  const dir = setupHost()
  const status = advanceToApproved(dir)
  const r = markContracted(dir, { PICTURE_RED: 'women--empty' })
  assert.strictEqual(r.status, 2, 'a failed picture must stop the mark, or the contract points at a picture that does not exist: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('prototype.picture failed for /women (empty) at http://127.0.0.1:' + status.appPort + '/women?proto=empty (exit 2)'),
    'the refusal must name the route, state, url and exit code so the host can reproduce the failing picture: ' + r.stderr)
  assert.ok(!fs.existsSync(contractPath(dir)), 'a mark that failed mid-picture writes no contract.json')
})

test('AC-20261007-01-3: a picture command that writes a zero-byte file fails the mark with "wrote no PNG at" and the path', () => {
  const dir = setupHost()
  advanceToApproved(dir)
  const r = markContracted(dir, { PICTURE_EMPTY: '1' })
  assert.strictEqual(r.status, 2, 'an empty file is not a picture and must fail the mark: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('wrote no PNG at'), 'the refusal must say no PNG was written: ' + r.stderr)
  assert.ok(r.stderr.includes('design/prototypes/' + STEM + '/captures/women--default.png'),
    'the refusal must name the file path the command was told to write: ' + r.stderr)
  assert.ok(!fs.existsSync(contractPath(dir)), 'a mark whose picture is not a PNG writes no contract.json')
})

test('AC-20261007-01-4: the bare TESTS run prints one line per behaviour pin, the File: line, both Session: lines and the tests-derived mark, with no AC id or tier', () => {
  const dir = setupHost()
  advanceToTests(dir)
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'the TESTS step is informational: ' + JSON.stringify(r))
  assert.match(r.stdout, /state:\s*TESTS/, 'after contracted the bare run must report TESTS: ' + r.stdout)
  const p1 = r.stdout.indexOf('pin p1 · /women (default) · WomanRow[w_01]<WomenList<WomenScreen#0 · "保存すると行が緑になる"')
  const p3 = r.stdout.indexOf('pin p3 · /women/new (error) · screen note · "空欄で保存すると赤い注意"')
  assert.ok(p1 > -1, 'the step must list behaviour pin p1 with its anchor and note: ' + r.stdout)
  assert.ok(p3 > p1, 'the step must list behaviour pin p3 after p1, and never the look pin p2: ' + r.stdout)
  assert.ok(!r.stdout.includes('pin p2 ·'), 'a look pin carries no test and must not be listed: ' + r.stdout)
  const file = r.stdout.split('\n').find((l) => l.startsWith('File:'))
  assert.ok(file && file.includes('.claude/worktrees/proto-' + STEM + '/' + E2E_FILE),
    'the File: line must name the test file inside the prototype worktree: ' + r.stdout)
  assert.ok(file.includes('title: `pin <id>: <note>`'), 'the File: line must carry the title grammar the verifier greps for: ' + file)
  assert.match(r.stdout, /Session:.*node scripts\/dev-server\.js/, 'a Session: line must carry the host bootCommand: ' + r.stdout)
  assert.match(r.stdout, /Session:.*must pass against the prototype and fail against main/,
    'a Session: line must state both halves of what makes a derived test a contract: ' + r.stdout)
  assert.ok(r.stdout.includes('--mark tests-derived'), 'the step must end naming the tests-derived mark: ' + r.stdout)
  assert.ok(!r.stdout.includes('AC-'), 'the AC ids belong to the spec plan writes later — the step must print none: ' + r.stdout)
  assert.ok(!r.stdout.includes('--tier'), 'the tier is retired with the generated spec: ' + r.stdout)
})

test('AC-20261007-01-5: --mark tests-derived refuses when no test file is committed on the prototype branch, naming the file and the branch', () => {
  const dir = setupHost()
  advanceToTests(dir)
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 2, 'a contract without tests must not complete: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('e2e/proto-' + STEM + '.spec.ts') && r.stderr.includes(BRANCH),
    'the refusal must name the file and the branch the session must commit it on: ' + r.stderr)
})

test('AC-20261007-01-5: --mark tests-derived refuses a copy sitting in the main working tree', () => {
  const dir = setupHost()
  advanceToTests(dir)
  authorDerivedTests(dir, { where: 'main' })
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 2, 'a test written outside the prototype worktree never reaches proto/<stem>: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('is in the main working tree'), 'the refusal must say the file is in the main working tree: ' + r.stderr)
})

test('AC-20261007-01-5: --mark tests-derived refuses a committed file that carries only pin p1:, naming pin p3:', () => {
  const dir = setupHost()
  advanceToTests(dir)
  authorDerivedTests(dir, { ids: ['p1'] })
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 2, 'a behaviour pin with no test must block the contract: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('does not carry pin p3:'), 'the refusal must name the missing pin title: ' + r.stderr)
})

test('AC-20261007-01-5: --mark tests-derived refuses when the runner lists only pin p1:, naming e2eList and pin p3:', () => {
  const dir = setupHost()
  advanceToTests(dir)
  authorDerivedTests(dir)
  const r = markTestsDerived(dir, { LIST_TESTS_LIMIT: '1' })
  assert.strictEqual(r.status, 2, 'a test the runner does not list will never run — the mark must refuse: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('e2eList') && r.stderr.includes('pin p3:'), 'the refusal must name e2eList and the unlisted pin: ' + r.stderr)
})

test('AC-20261007-01-5: --mark tests-derived refuses tests red against the prototype, writing e2e.log but no copy, no ledger row and no contract.tests', () => {
  const dir = setupHost()
  advanceToTests(dir)
  authorDerivedTests(dir)
  const r = markTestsDerived(dir, { E2E_RED: '1' })
  assert.strictEqual(r.status, 2, 'a test that fails on the prototype it describes proves nothing: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('contract tests red against the prototype (e2eRun exited 1)'), 'the refusal must carry the exit code: ' + r.stderr)
  assert.ok(fs.existsSync(path.join(designDir(dir), 'e2e.log')), 'the run output must be kept in e2e.log so the session can read why it is red')
  assert.ok(!fs.existsSync(path.join(designDir(dir), 'tests')) || fs.readdirSync(path.join(designDir(dir), 'tests')).length === 0,
    'a red run copies no test into the contract directory')
  assert.deepStrictEqual(ledgerRows(dir), [], 'a refused mark appends no ledger row')
  assert.strictEqual(readContract(dir).tests, null, 'contract.json.tests stays null until the tests are proven green')
})

test('AC-20261007-01-5: --mark tests-derived refuses an undeclared prototype.e2eRun, naming it', () => {
  const dir = setupHost()
  advanceToTests(dir)
  authorDerivedTests(dir)
  patchConfig(dir, (cfg) => { delete cfg.prototype.e2eRun })
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 2, 'without e2eRun the tests cannot be proven green on the prototype: ' + JSON.stringify(r))
  assert.match(r.stderr, /prototype\.e2eRun/, 'the refusal must name prototype.e2eRun: ' + r.stderr)
})

test('AC-20261007-01-6: --mark tests-derived copies the green tests into the contract, completes it, records one ledger row and queues the plan paste once', () => {
  const dir = setupHost()
  advanceToTests(dir)
  const status = statusOf(dir)
  authorDerivedTests(dir)
  const r = markTestsDerived(dir)
  assert.strictEqual(r.status, 0, 'both titles listed and the run green must complete the contract: ' + JSON.stringify(r))
  assert.match(r.stdout, /\(TESTS\s*(→|->)\s*CONTRACTED\)/, 'the accepted mark must print the TESTS to CONTRACTED checkpoint: ' + r.stdout)

  const copy = path.join(dir, LOCAL_TESTS_REL)
  assert.ok(fs.existsSync(copy), 'the test file must be copied under design/prototypes/<stem>/tests/: ' + copy)
  assert.strictEqual(fs.readFileSync(copy, 'utf8'), git(dir, 'show', BRANCH + ':' + E2E_FILE),
    'the copy must be byte-equal to the committed file — spec 03 builds from it, not from the branch')
  assert.deepStrictEqual(readContract(dir).tests, {
    file: 'tests/' + path.basename(E2E_FILE), source: E2E_FILE, run: 'node run-tests.js {file}', pins: ['p1', 'p3'],
  }, 'contract.json.tests must carry the copy, its source, the run command and the pin ids: ' + JSON.stringify(readContract(dir).tests))
  assert.strictEqual(e2eEnv(dir), 'http://127.0.0.1:' + status.appPort,
    'e2eRun must receive PROTO_URL = the app address, or the tests run against nothing: ' + e2eEnv(dir))
  assert.ok(git(dir, 'worktree', 'list', '--porcelain').includes('proto-' + STEM), 'the prototype worktree stays registered until --mark closed')
  assert.ok(git(dir, 'branch', '--list', BRANCH).trim() !== '', 'the prototype branch stays until --mark closed')
  assert.strictEqual(git(dir, 'branch', '--list', 'harden/*').trim(), '', 'no harden branch is created — nothing is exported')

  const rows = ledgerRows(dir)
  assert.strictEqual(rows.length, 1, 'exactly one ledger row: ' + JSON.stringify(rows))
  const row = rows[0]
  assert.strictEqual(row.stage, 'prototype', JSON.stringify(row))
  assert.strictEqual(row.stem, STEM, JSON.stringify(row))
  assert.strictEqual(row.brief, '28', JSON.stringify(row))
  assert.strictEqual(row.rounds, 1, JSON.stringify(row))
  assert.deepStrictEqual(row.pins, { total: 3, behaviour: 2, look: 1 }, JSON.stringify(row))
  assert.strictEqual(row.routes, 2, JSON.stringify(row))
  assert.strictEqual(row.states, 4, JSON.stringify(row))
  assert.strictEqual(row.captures, 4, JSON.stringify(row))
  assert.strictEqual(row.contract, CONTRACT_REL, JSON.stringify(row))
  assert.strictEqual(row.verdict, 'contracted', JSON.stringify(row))
  for (const k of ['spec', 'exported', 'harden']) {
    assert.ok(!(k in row), 'the row names a contract, not a ' + k + ' — a stale key sends the fleet census to a file that does not exist: ' + JSON.stringify(row))
  }

  const q = queueList(dir)
  assert.strictEqual(q.status, 0, 'spec-queue list must run in the host: ' + q.stderr)
  const paste = '/spec:plan ' + CONTRACT_REL
  assert.strictEqual(q.stdout.split(paste).length - 1, 1, 'the plan paste must be queued exactly once: ' + q.stdout)
  const line = q.stdout.split('\n').find((l) => l.includes(paste))
  assert.match(line, /^\s*1\b/, 'the paste must sit at position 1 (--top): ' + q.stdout)
  assert.strictEqual(stateOf(dir), 'CONTRACTED\n', '--state must print CONTRACTED once the tests are derived')

  const again = markTestsDerived(dir)
  assert.strictEqual(again.status, 0, 'a re-run of a completed mark must exit 0, not refuse: ' + JSON.stringify(again))
  assert.strictEqual(ledgerRows(dir).length, 1, 'a re-run must not append a second ledger row')
  const q2 = queueList(dir)
  assert.strictEqual(q2.stdout.split(paste).length - 1, 1, 'a re-run must not queue the paste a second time: ' + q2.stdout)
})

test('AC-20261007-01-7: the bare CONTRACTED run prints the contract, the plan paste and the close line, and still does so with the worktree removed by hand', () => {
  const dir = setupHost()
  advanceToContracted(dir)
  const r = bare(dir)
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  assert.match(r.stdout, /state:\s*CONTRACTED/, 'a contracted prototype must report CONTRACTED: ' + r.stdout)
  assert.ok(r.stdout.includes('Read only: ' + CONTRACT_REL), 'the step must name the one file to read: ' + r.stdout)
  assert.ok(r.stdout.includes('Next: /spec:plan ' + CONTRACT_REL), 'the step must hand the contract to plan: ' + r.stdout)
  assert.match(r.stdout, /Close \(.*--mark closed/, 'the step must print the close mark: ' + r.stdout)

  git(dir, 'worktree', 'remove', '--force', worktreePath(dir))
  const after = bare(dir)
  assert.match(after.stdout, /state:\s*CONTRACTED/,
    'CONTRACTED is a resting state for weeks — an unregistered worktree must not shadow it with OPEN: ' + after.stdout)
})

test('AC-20261007-01-8: --mark closed in CONTRACTED destroys the database, removes the worktree and branch, keeps the contract, and --state prints CLOSED', () => {
  const dir = setupHost()
  advanceToContracted(dir)
  const r = mark(dir, 'closed')
  assert.strictEqual(r.status, 0, 'closing a contracted prototype must succeed: ' + JSON.stringify(r))
  assert.match(r.stdout, /\(CONTRACTED\s*(→|->)\s*CLOSED\)/, 'the accepted mark must print the CONTRACTED to CLOSED checkpoint: ' + r.stdout)
  assert.ok(fs.existsSync(path.join(dir, 'db-dropped')), 'dbDestroy must have run once (the fixture writes db-dropped in the host root)')
  assert.ok(!git(dir, 'worktree', 'list', '--porcelain').includes('proto-' + STEM), 'the prototype worktree must be gone')
  assert.strictEqual(git(dir, 'branch', '--list', 'proto/*').trim(), '', 'the prototype branch must be gone')
  assert.ok(fs.existsSync(contractPath(dir)), 'closing never touches the contract — it lives on main')
  assert.ok(fs.existsSync(path.join(designDir(dir), 'captures', 'women--default.png')), 'closing never touches the pictures')
  assert.strictEqual(stateOf(dir), 'CLOSED\n', '--state must print CLOSED')
  assert.match(bare(dir).stdout, /Next:/, 'the CLOSED step must print a Next: line (spec-status --next verbatim)')
})

test('AC-20261007-01-8: --mark closed refuses a dirty worktree naming the remedy, and the re-run after cleaning does not run dbDestroy again', () => {
  const dir = setupHost()
  advanceToContracted(dir)
  patchConfig(dir, (cfg) => {
    // Non-idempotent stand-in: exits 1 when its own marker already exists, so a second run fails.
    cfg.prototype.dbDestroy =
      'root="$(cd "$PROTO_WORKTREE/../../.." && pwd)"; ' +
      'if [ -f "$root/db-dropped" ]; then echo "dbDestroy is not idempotent" >&2; exit 1; fi; ' +
      'node scripts/destroy-db.js'
  })
  const scratch = path.join(worktreePath(dir), 'scratch.txt')
  fs.writeFileSync(scratch, 'uncommitted\n')
  const first = mark(dir, 'closed')
  assert.strictEqual(first.status, 2, 'a dirty worktree must refuse rather than discard uncommitted work: ' + JSON.stringify(first))
  assert.ok(first.stderr.includes('commit or discard on proto/' + STEM), 'the refusal must name its remedy: ' + first.stderr)
  fs.rmSync(scratch)
  const second = mark(dir, 'closed')
  assert.strictEqual(second.status, 0, 'the re-run must resume at the worktree removal without running dbDestroy again: ' + JSON.stringify(second))
  assert.strictEqual(stateOf(dir), 'CLOSED\n', 'the resumed run must reach CLOSED')
})

test('AC-20261007-01-8: --mark closed is accepted from ROUND, abandoning the prototype', () => {
  const dir = setupHost()
  writeStates(dir)
  assert.strictEqual(mark(dir, 'opened').status, 0, 'test setup requires --mark opened to succeed')
  const r = mark(dir, 'closed')
  assert.strictEqual(r.status, 0, 'a prototype abandoned mid-round must be closable: ' + JSON.stringify(r))
  assert.match(r.stdout, /\(ROUND\s*(→|->)\s*CLOSED\)/, 'the accepted mark must print the ROUND to CLOSED checkpoint: ' + r.stdout)
  assert.ok(!fs.existsSync(worktreePath(dir)), 'the worktree must be gone')
})
