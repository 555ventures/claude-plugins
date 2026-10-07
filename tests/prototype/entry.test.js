'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { runNode } = require('../helpers')
const { setupHost, DRIVER, BRIEF_REL, TWO_ROUTE_STATES, threePins, withEnv } = require('./fixture')

// Owner: specs/20261007/02-the-prototype-opens-from-words-a-brief-or-a-stem.md
// (AC-20261007-02-1, AC-20261007-02-2, AC-20261007-02-4): the driver opens from words, a brief or a
// stem; the idea and the input kind land in status.json; {stem} reaches e2eFile and the contract.

const WORDS = 'A collector flow: women save → row turns green!'
const AUTO_STEM = 'a-collector-flow-women-save-row-turns-green'
const STEM = 'collector-flow'
const E2E = 'e2e/proto-collector-flow.spec.ts'

function drive(dir, arg, extra, opts) {
  return runNode(DRIVER, [arg, '--root', dir, ...(extra || [])], opts)
}
function designOf(dir, stem) { return path.join(dir, 'design/prototypes', stem) }
function writeStatesFor(dir, stem, routes) {
  fs.mkdirSync(designOf(dir, stem), { recursive: true })
  fs.writeFileSync(path.join(designOf(dir, stem), 'states.json'), JSON.stringify({
    schemaVersion: 1, viewport: { width: 1280, height: 800 }, routes: routes || { '/home': { default: '/home' } },
  }, null, 2) + '\n')
}
function statusFor(dir, stem) { return JSON.parse(fs.readFileSync(path.join(designOf(dir, stem), 'status.json'), 'utf8')) }
function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }) }
function ledgerRows(dir) {
  const p = path.join(dir, '.claude/spec-runs.jsonl')
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

test('AC-20261007-02-1: the bare run from words prints the auto-picked stem before OPEN, --stem replaces it silently, a bad --stem and an empty slug exit 2', () => {
  const dir = setupHost()
  const r = drive(dir, WORDS)
  assert.strictEqual(r.status, 0, 'a words argument must open the OPEN step, not refuse: ' + r.stderr)
  const pick = '📌 Auto-picked stem ' + AUTO_STEM + ' — from your words (veto: re-run with --stem <name>)'
  const pickAt = r.stdout.indexOf(pick)
  const openAt = r.stdout.indexOf('state: OPEN')
  assert.ok(pickAt !== -1, 'the derived slug must be printed as an auto-pick the user may veto: ' + r.stdout)
  assert.ok(openAt > pickAt, 'the auto-pick line must precede the state line so the veto is seen first: ' + r.stdout)
  assert.ok(r.stdout.split('\n').some((l) => l.includes('--mark opened') && l.includes('"' + WORDS + '"')),
    'the --mark opened line must carry the quoted argument or the next session cannot re-run it: ' + r.stdout)

  const NASTY = 'Save "my" $HOME `x` row\\ end'
  const nd = drive(dir, NASTY)
  assert.strictEqual(nd.status, 0, 'an idea with shell metacharacters must still open the OPEN step: ' + nd.stderr)
  const line = nd.stdout.split('\n').find((l) => /^\s*node\s/.test(l) && l.includes('--mark opened'))
  assert.ok(line,'the OPEN step must print a --mark opened line: ' + nd.stdout)
  const rest = line.trim().replace(/^node\s+\S+\s+/, '').replace(/\s+--mark opened\s*$/, '')
  const back = spawnSync('/bin/bash', ['-c', 'printf %s ' + rest], { encoding: 'utf8' })
  assert.strictEqual(back.stdout, NASTY,
    'the shell must read the printed argument back as the original idea, or re-running the printed command opens a different prototype: ' + JSON.stringify(back.stdout))

  const named = drive(dir, WORDS, ['--stem', STEM])
  assert.strictEqual(named.status, 0, '--stem on the words shape must open the OPEN step: ' + named.stderr)
  assert.match(named.stdout, /prototype: collector-flow/, 'the step must name the chosen stem: ' + named.stdout)
  assert.ok(!named.stdout.includes('📌'), 'an explicit --stem is no auto-pick and must print no veto line: ' + named.stdout)
  assert.ok(named.stdout.includes('design/prototypes/collector-flow/states.json'),
    'the OPEN step must name the states.json path under the chosen stem: ' + named.stdout)

  const bad = drive(dir, WORDS, ['--stem', 'Bad Name'])
  assert.strictEqual(bad.status, 2, 'a stem outside ^[a-z0-9][a-z0-9-]{0,47}$ must be refused: ' + JSON.stringify(bad))
  assert.match(bad.stderr, /--stem/, 'the refusal must name the --stem flag so the remedy is clear: ' + bad.stderr)

  const empty = drive(dir, '   ')
  assert.strictEqual(empty.status, 2, 'an idea with no letter or digit must be refused, not slugged to nothing: ' + JSON.stringify(empty))
  assert.match(empty.stderr, /usage: give the idea in a few words/, 'the refusal must tell the user what to pass: ' + empty.stderr)
})

test('AC-20261007-02-2: --mark opened persists the words input, a stem re-opens it, --stem after opened is refused, and a brief stamps its own number and path', () => {
  const dir = setupHost()
  writeStatesFor(dir, STEM)
  const opened = drive(dir, WORDS, ['--stem', STEM, '--mark', 'opened'])
  assert.strictEqual(opened.status, 0, '--mark opened from words with a valid states.json must succeed: ' + opened.stderr)
  assert.ok(git(dir, 'branch', '--list', 'proto/collector-flow').trim() !== '', 'the prototype branch must be named for the stem: ' + git(dir, 'branch', '--list'))
  assert.ok(fs.existsSync(path.join(dir, '.claude/worktrees/proto-collector-flow')), 'the prototype worktree must be named for the stem')
  const st = statusFor(dir, STEM)
  assert.strictEqual(st.brief, 'n/a', 'a words prototype has no brief number — the ledger and contract read this: ' + JSON.stringify(st))
  assert.strictEqual(st.stem, STEM, 'status must carry the stem every later invocation echoes: ' + JSON.stringify(st))
  assert.deepStrictEqual(st.input, { kind: 'words', brief: null, idea: WORDS },
    'the spoken idea must be on disk before any round, verbatim: ' + JSON.stringify(st))

  const again = drive(dir, STEM)
  assert.strictEqual(again.status, 0, 'the stem alone must re-open a prototype: ' + again.stderr)
  assert.match(again.stdout, /state: ROUND/, 'a re-opened opened prototype is at ROUND: ' + again.stdout)
  assert.match(again.stdout, /prototype: collector-flow/, 'the step must name the stem: ' + again.stdout)

  const renamed = drive(dir, WORDS, ['--stem', 'other'])
  assert.strictEqual(renamed.status, 2, 'the stem is fixed once opened: ' + JSON.stringify(renamed))
  assert.match(renamed.stderr, /the stem is fixed once opened/, 'the refusal must say why: ' + renamed.stderr)

  const bdir = setupHost()
  writeStatesFor(bdir, '28-functional-prototype')
  const b = drive(bdir, BRIEF_REL, ['--mark', 'opened'])
  assert.strictEqual(b.status, 0, '--mark opened from a brief must succeed: ' + b.stderr)
  const bs = statusFor(bdir, '28-functional-prototype')
  assert.strictEqual(bs.brief, '28', 'a brief prototype stamps the brief number: ' + JSON.stringify(bs))
  assert.strictEqual(bs.stem, '28-functional-prototype', 'a brief prototype takes the brief stem: ' + JSON.stringify(bs))
  assert.deepStrictEqual(bs.input, { kind: 'brief', brief: BRIEF_REL, idea: null },
    'the input kind and brief path must be persisted: ' + JSON.stringify(bs))
})

test('AC-20261007-02-4: a words prototype substitutes {stem} into the test file, the contract and the ledger row, and prints no placeholder', () => {
  const dir = setupHost()
  writeStatesFor(dir, STEM, TWO_ROUTE_STATES)
  const must = (r, what) => assert.strictEqual(r.status, 0, 'test setup requires ' + what + ' to succeed: ' + r.stderr)
  must(drive(dir, WORDS, ['--stem', STEM, '--mark', 'opened']), '--mark opened from words')
  fs.writeFileSync(path.join(designOf(dir, STEM), 'pins.json'), JSON.stringify({ schemaVersion: 1, pins: threePins() }, null, 2) + '\n')
  must(drive(dir, STEM, ['--mark', 'round-done']), '--mark round-done')
  must(drive(dir, STEM, ['--mark', 'approved']), '--mark approved')
  must(drive(dir, STEM, ['--mark', 'contracted'], withEnv()), '--mark contracted')

  const contract = JSON.parse(fs.readFileSync(path.join(designOf(dir, STEM), 'contract.json'), 'utf8'))
  assert.strictEqual(contract.stem, STEM, 'the contract must carry the stem: ' + JSON.stringify(contract))
  assert.strictEqual(contract.brief, 'n/a', 'a words contract has no brief number: ' + JSON.stringify(contract))
  assert.strictEqual(contract.idea, WORDS, 'the contract idea is the persisted spoken idea: ' + JSON.stringify(contract))

  const tests = drive(dir, STEM)
  assert.strictEqual(tests.status, 0, 'the bare TESTS run must print its step: ' + tests.stderr)
  const file = tests.stdout.split('\n').find((l) => l.startsWith('File:')) || ''
  assert.ok(file.includes(E2E), 'the File: line must name the stem-keyed test file: ' + tests.stdout)
  assert.ok(!file.includes('{stem}') && !file.includes('{brief}'), 'no placeholder may survive into the printed path: ' + file)

  const wt = path.join(dir, '.claude/worktrees/proto-collector-flow')
  fs.mkdirSync(path.dirname(path.join(wt, E2E)), { recursive: true })
  fs.writeFileSync(path.join(wt, E2E), ['p1', 'p3'].map((id, i) => "test('pin " + id + ': n' + (i + 1) + "', () => {})\n").join(''))
  git(wt, 'add', E2E)
  git(wt, 'commit', '-q', '-m', 'derived tests on proto/collector-flow')
  must(drive(dir, STEM, ['--mark', 'tests-derived'], withEnv()), '--mark tests-derived')

  const done = JSON.parse(fs.readFileSync(path.join(designOf(dir, STEM), 'contract.json'), 'utf8'))
  assert.strictEqual(done.tests && done.tests.source, E2E, 'contract.tests.source must be the stem-keyed path: ' + JSON.stringify(done.tests))
  const rows = ledgerRows(dir)
  assert.strictEqual(rows.length, 1, 'exactly one ledger row is appended: ' + JSON.stringify(rows))
  assert.strictEqual(rows[0].brief, 'n/a', 'the ledger row carries the words brief spelling: ' + JSON.stringify(rows[0]))
  assert.strictEqual(rows[0].stem, STEM, 'the ledger row carries the stem: ' + JSON.stringify(rows[0]))
})
