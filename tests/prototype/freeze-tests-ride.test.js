'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { runNode, tmpdir } = require('../helpers')
const {
  setupHost, patchConfig, writeStates, writePins, statusOf, statusPath, designDir, worktreePath,
  authorDerivedTests, DRIVER, BRIEF_REL, STEM,
} = require('./fixture')

// specs/20261005/05-derived-tests-ride-on-the-export-branch.md — the freeze reads the derived e2e
// file from proto/<stem>, carries it onto harden/<stem> as a second commit, and never leaves it
// in the main working tree.

const E2E = 'e2e/proto-28.smoke.spec.ts'
const WT_REL = '.claude/worktrees/proto-' + STEM
const HARDEN = 'harden/' + STEM
const TESTS_SUBJECT = 'harden(' + STEM + '): derived behaviour tests from proto/' + STEM
const RULES_REL = '.claude/rules/spec-pipeline.md'
const ROUTES = {
  '/women': { default: '/women', empty: '/women?proto=empty' },
  '/women/new': { default: '/women/new', error: '/women/new?proto=error' },
}

function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }) }
function branchList(dir, pattern) { return git(dir, 'branch', '--list', pattern).trim() }
function captureEnv(dir) { return Object.assign({}, process.env, { PROTO_CAPTURE_BIN: path.join(dir, 'capture-stub.js') }) }
function drive(dir, name, extra) {
  return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', name, ...(extra || [])], { env: captureEnv(dir) })
}
function markTests(dir, extra) { return drive(dir, 'tests-derived', extra) }
function stateOf(dir) { return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--state'], { env: captureEnv(dir) }).stdout }
function subjects(dir) { return git(dir, 'log', '--format=%s', 'main..' + HARDEN).trim().split('\n').filter(Boolean) }

// Brings a fixture host to just before `--mark tests-derived`: a base-tracked src/db/old.js, the
// prototype approved and frozen, then on proto/<stem> one modified, one added, one deleted export
// path and one path outside the export. rules (optional) replaces the host's pipeline rules file.
function frozenHost(opts) {
  opts = opts || {}
  const dir = setupHost()
  if (opts.rules) fs.writeFileSync(path.join(dir, RULES_REL), opts.rules)
  fs.writeFileSync(path.join(dir, 'src/db/old.js'), 'module.exports = { legacy: true }\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'seed base')
  writeStates(dir, ROUTES)
  const now = new Date().toISOString()
  const step = (n) => {
    const r = drive(dir, n)
    assert.strictEqual(r.status, 0, 'test setup requires --mark ' + n + ' to succeed: ' + r.stderr)
  }
  step('opened')
  writePins(dir, [
    { id: 'p1', round: 1, screen: '/women', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'behaviour', at: now },
    { id: 'p2', round: 1, screen: '/women', state: 'empty', anchor: null, note: 'n2', who: 'JJ', kind: 'look', at: now },
    { id: 'p3', round: 1, screen: '/women/new', state: 'error', anchor: null, note: 'n3', who: 'JJ', kind: 'behaviour', at: now },
  ])
  step('round-done')
  step('approved')
  patchConfig(dir, (cfg) => { cfg.prototype.export = ['src/db/**', 'drizzle/**'] })
  step('frozen')
  const contract = JSON.parse(fs.readFileSync(path.join(designDir(dir), 'contract.json'), 'utf8'))
  const wt = worktreePath(dir)
  fs.appendFileSync(path.join(wt, 'src/db/schema.js'), '// modified on proto\n')
  fs.mkdirSync(path.join(wt, 'drizzle'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'drizzle/0001.sql'), '-- migration\n')
  fs.rmSync(path.join(wt, 'src/db/old.js'))
  fs.mkdirSync(path.join(wt, 'src/ui'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'src/ui/a.js'), 'export const A = 2\n')
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'edits on proto')
  return { dir, contract }
}

// A completed freeze: tests committed on the prototype branch, the mark run once.
function completedFreeze(opts) {
  const host = frozenHost(opts)
  const abs = authorDerivedTests(host.dir, host.contract)
  host.content = fs.readFileSync(abs, 'utf8')
  host.first = markTests(host.dir, opts && opts.markArgs)
  return host
}

function rulesNaming(span) {
  return '# Rules\n\n## Risk Tiers\n\nTriggers:\n\n- `' + span + '` — why.\n\n## Planning\n\nnothing\n'
}

test('AC-20261005-05-1: the bare run at TESTS prints a File: line naming the prototype worktree path and the commit-on-proto instruction, a Session: line saying must fail against main, and never "main working tree"', () => {
  const { dir } = frozenHost()
  const r = runNode(DRIVER, [BRIEF_REL, '--root', dir])
  assert.strictEqual(r.status, 0, 'the TESTS step is informational: ' + JSON.stringify(r))
  assert.match(r.stdout, /state:\s*TESTS/, 'a frozen prototype must report state TESTS: ' + r.stdout)
  const fileLine = r.stdout.split('\n').find((l) => l.startsWith('File:')) || ''
  assert.ok(fileLine.includes(WT_REL + '/' + E2E),
    'the File: line must name the test file under the prototype worktree, or the session writes it on main again: ' + fileLine)
  assert.ok(fileLine.includes('commit it on proto/' + STEM),
    'the File: line must tell the session to commit the file on the prototype branch: ' + fileLine)
  const sessionLines = r.stdout.split('\n').filter((l) => l.startsWith('Session:'))
  assert.ok(sessionLines.some((l) => l.includes('must fail against main')),
    'a Session: line must state the red oracle against the base branch: ' + sessionLines.join(' | '))
  assert.ok(!r.stdout.includes('main working tree'),
    'the printed step must never send the session to write the tests in the main working tree: ' + r.stdout)
})

test('AC-20261005-05-2: a derived file written only in the main working tree refuses naming the stray copy and the worktree path, creates no harden branch and no spec; a committed prototype copy with the main copy remaining refuses the same way', () => {
  const only = frozenHost()
  authorDerivedTests(only.dir, only.contract, { where: 'main' })
  const r = markTests(only.dir)
  assert.strictEqual(r.status, 2, 'a derived test file left in the main working tree must refuse, never be exported or ignored: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes(E2E + ' is in the main working tree'), 'the refusal must name the stray copy: ' + r.stderr)
  assert.ok(r.stderr.includes(WT_REL + '/' + E2E), 'the refusal must name where the file belongs: ' + r.stderr)
  assert.strictEqual(branchList(only.dir, 'harden/*'), '', 'a refused mark must leave no harden branch behind: ' + branchList(only.dir, 'harden/*'))
  assert.ok(!fs.existsSync(path.join(only.dir, only.contract.spec)), 'a refused mark must write no spec: ' + only.contract.spec)

  const both = frozenHost()
  authorDerivedTests(both.dir, both.contract)
  authorDerivedTests(both.dir, both.contract, { where: 'main' })
  const r2 = markTests(both.dir)
  assert.strictEqual(r2.status, 2, 'a main-tree copy beside a committed prototype copy must still refuse — the stray copy is the defect: ' + JSON.stringify(r2))
  assert.ok(r2.stderr.includes(E2E + ' is in the main working tree'), 'the second leg must give the same refusal sentence: ' + r2.stderr)
})

test('AC-20261005-05-3: a derived file written in the worktree but not committed refuses with "is not committed on proto/<stem>"; a committed file edited without a commit refuses with "has uncommitted edits in <worktree>"', () => {
  const unc = frozenHost()
  authorDerivedTests(unc.dir, unc.contract, { commit: false })
  const r = markTests(unc.dir)
  assert.strictEqual(r.status, 2, 'an uncommitted file cannot be exported and must refuse: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('is not committed on proto/' + STEM),
    'the refusal must say the file is not committed on the prototype branch: ' + r.stderr)

  const edited = frozenHost()
  authorDerivedTests(edited.dir, edited.contract)
  authorDerivedTests(edited.dir, edited.contract, { commit: false, extra: '// edited, not committed\n' })
  const r2 = markTests(edited.dir)
  assert.strictEqual(r2.status, 2, 'edits on top of a committed copy would be dropped by the export and must refuse: ' + JSON.stringify(r2))
  assert.ok(r2.stderr.includes('has uncommitted edits in ' + WT_REL),
    'the refusal must name the worktree holding the uncommitted edits: ' + r2.stderr)
})

test('AC-20261005-05-4: a file committed on the prototype branch is carried to harden/<stem> as a second commit byte for byte, leaves the main tree clean of e2e/, removes the transient worktree, and the ledger still counts only the three export paths', () => {
  const { dir, contract, content, first } = completedFreeze()
  assert.strictEqual(first.status, 0, 'a committed derived file with both ids must let the mark complete: ' + JSON.stringify(first))
  assert.strictEqual(stateOf(dir), 'CLOSED\n', '--state must print CLOSED once the mark completes: ' + stateOf(dir))
  assert.strictEqual(git(dir, 'show', HARDEN + ':' + E2E), content,
    'the carried file must equal the committed content byte for byte, or the hardening spec builds against different tests: ' + HARDEN)
  const subs = subjects(dir)
  assert.strictEqual(subs.length, 2, 'harden/<stem> must hold exactly the data commit and the tests commit: ' + subs.join(' | '))
  assert.strictEqual(subs[0], TESTS_SUBJECT, 'the newer commit must be the derived-tests commit with the documented subject: ' + subs.join(' | '))
  assert.ok(!fs.existsSync(path.join(dir, E2E)), 'the main working tree must hold no derived test file: ' + path.join(dir, E2E))
  const porcelain = git(dir, 'status', '--porcelain').split('\n').filter((l) => /^.. e2e\//.test(l))
  assert.deepStrictEqual(porcelain, [], 'git status on main must list nothing under e2e/: ' + porcelain.join(' | '))
  assert.ok(!git(dir, 'worktree', 'list', '--porcelain').includes('harden-' + STEM),
    'the transient harden-<stem> worktree must be removed after the carry: ' + git(dir, 'worktree', 'list', '--porcelain'))
  const rows = fs.readFileSync(path.join(dir, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const row = rows.find((x) => x.stage === 'prototype' && x.spec === contract.spec)
  assert.ok(row, 'the ledger row must be written: ' + JSON.stringify(rows))
  assert.strictEqual(row.exported && row.exported.files, 3,
    'exported.files must keep counting the data and API layer only, never the test file: ' + JSON.stringify(row))
})

test('AC-20261005-05-6: the generated spec carries exactly one File Plan row for the e2e file, a tests-layer CREATE row', () => {
  const { dir, contract, first } = completedFreeze()
  assert.strictEqual(first.status, 0, 'test setup requires the mark to complete: ' + JSON.stringify(first))
  const text = fs.readFileSync(path.join(dir, contract.spec), 'utf8')
  const rows = text.split('\n').filter((l) => l.startsWith('| ' + E2E + ' |'))
  assert.strictEqual(rows.length, 1,
    'the file now sits in the prototype branch diff, and a second row would give the build two actions for one path: ' + rows.join(' || '))
  assert.ok(rows[0].startsWith('| ' + E2E + ' | CREATE | tests |'),
    'the single row must be the tests-layer CREATE row: ' + rows[0])
})

test('AC-20261005-05-7: a risk-tier refusal then --tier critical ends with exactly two commits on harden/<stem>, and a branch moved back one commit gains its tests commit on the re-run', () => {
  const rules = rulesNaming('drizzle/*.sql')
  const a = frozenHost({ rules })
  authorDerivedTests(a.dir, a.contract)
  const first = markTests(a.dir)
  assert.strictEqual(first.status, 2, 'test setup requires the risk-tier refusal on the first run: ' + JSON.stringify(first))
  assert.ok(first.stderr.includes('Risk Tiers'), 'the first stop must be the tier refusal, not another one: ' + first.stderr)
  const again = markTests(a.dir, ['--tier', 'critical'])
  assert.strictEqual(again.status, 0, 'the confirmed re-run must complete: ' + JSON.stringify(again))
  assert.strictEqual(stateOf(a.dir), 'CLOSED\n', 'the re-run must reach CLOSED: ' + stateOf(a.dir))
  assert.strictEqual(subjects(a.dir).length, 2, 'the resume must leave exactly the data and tests commits: ' + subjects(a.dir).join(' | '))

  const b = frozenHost({ rules })
  authorDerivedTests(b.dir, b.contract)
  const stop = markTests(b.dir)
  assert.strictEqual(stop.status, 2, 'test setup requires the risk-tier refusal on the first run: ' + JSON.stringify(stop))
  git(b.dir, 'branch', '-f', HARDEN, HARDEN + '~1')
  const resumed = markTests(b.dir, ['--tier', 'critical'])
  assert.strictEqual(resumed.status, 0,
    'a branch exported by an older plugin (data commit only) must still gain its tests on the re-run: ' + JSON.stringify(resumed))
  const probe = (() => { try { git(b.dir, 'cat-file', '-e', HARDEN + ':' + E2E); return 0 } catch (e) { return e.status } })()
  assert.strictEqual(probe, 0, 'harden/<stem> must carry the derived test file after the resume: ' + E2E)
  assert.strictEqual(subjects(b.dir).length, 2, 'the resume must add exactly one commit: ' + subjects(b.dir).join(' | '))
})

test('AC-20261005-05-7: a stale harden worktree left by an interrupted carry refuses exit 2 naming the re-run remedy, and the plain re-run completes to CLOSED', () => {
  const { dir, contract } = frozenHost({ rules: rulesNaming('drizzle/*.sql') })
  authorDerivedTests(dir, contract)
  const stop = markTests(dir)
  assert.strictEqual(stop.status, 2, 'test setup requires the risk-tier refusal on the first run: ' + JSON.stringify(stop))
  git(dir, 'branch', '-f', HARDEN, HARDEN + '~1')
  const stale = path.join(dir, '.claude/worktrees/harden-' + STEM)
  git(dir, 'worktree', 'add', stale, HARDEN)
  const refused = markTests(dir, ['--tier', 'critical'])
  assert.strictEqual(refused.status, 2, 'a stale harden worktree must refuse instead of exporting, or the carry could half-run: ' + JSON.stringify(refused))
  assert.ok(refused.stderr.includes('re-run --mark tests-derived'),
    'the refusal must name the re-run remedy, or the operator is left with a bare git error and no next step: ' + refused.stderr)
  const again = markTests(dir, ['--tier', 'critical'])
  assert.strictEqual(again.status, 0, 'the plain re-run after the forced removal must complete the carry: ' + JSON.stringify(again))
  assert.strictEqual(stateOf(dir), 'CLOSED\n', 'the re-run must reach CLOSED, or the freeze stays stuck behind the stale worktree: ' + stateOf(dir))
})

test('AC-20261005-05-8: with marks.closed cleared, the prototype branch gone and harden/<stem> lacking the tests, the re-run refuses "by hand"; once the file is committed on harden/<stem> it exits 0 and reaches CLOSED', () => {
  const { dir, contract, first } = completedFreeze()
  assert.strictEqual(first.status, 0, 'test setup requires a completed freeze: ' + JSON.stringify(first))
  const sp = statusPath(dir)
  const st = statusOf(dir)
  delete st.marks.closed
  fs.writeFileSync(sp, JSON.stringify(st, null, 2) + '\n')
  git(dir, 'branch', '-f', HARDEN, HARDEN + '~1')
  const r = markTests(dir)
  assert.strictEqual(r.status, 2, 'a harden branch lacking the tests with no prototype branch to carry them from must refuse: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('does not carry ' + E2E + ' and proto/' + STEM + ' is gone'),
    'the refusal must say both facts: ' + r.stderr)
  assert.ok(r.stderr.includes('by hand'), 'the refusal must name the by-hand remedy: ' + r.stderr)

  const hand = tmpdir('harden-by-hand')
  fs.rmSync(hand, { recursive: true, force: true })
  git(dir, 'worktree', 'add', hand, HARDEN)
  const abs = authorDerivedTests(dir, contract, { where: 'main' })
  fs.mkdirSync(path.join(hand, path.dirname(E2E)), { recursive: true })
  fs.copyFileSync(abs, path.join(hand, E2E))
  fs.rmSync(abs)
  git(hand, 'add', E2E)
  git(hand, 'commit', '-q', '-m', 'derived tests by hand')
  git(dir, 'worktree', 'remove', '--force', hand)

  const done = markTests(dir)
  assert.strictEqual(done.status, 0, 'once harden/<stem> carries the file the re-run must proceed: ' + JSON.stringify(done))
  assert.strictEqual(stateOf(dir), 'CLOSED\n', 'the resumed mark must reach CLOSED: ' + stateOf(dir))
})

test('AC-20261005-05-9: the generated spec says the tests are carried on harden/<stem> (twice), reach the spec only through its merge, and never claims they are red on main', () => {
  const { dir, contract, first } = completedFreeze()
  assert.strictEqual(first.status, 0, 'test setup requires the mark to complete: ' + JSON.stringify(first))
  const text = fs.readFileSync(path.join(dir, contract.spec), 'utf8')
  const carried = text.split('carried on `' + HARDEN + '`').length - 1
  assert.ok(carried >= 2, 'a cold reader must be told twice that the tests are carried on the harden branch, not on main: found ' + carried)
  assert.ok(text.includes('only through the `' + HARDEN + '` merge'),
    'the Rationale must say the tests arrive only through the harden merge: ' + text)
  assert.ok(!text.includes('red on `main`'), 'the old claim that the tests sit red on main must be gone: ' + text)
})
