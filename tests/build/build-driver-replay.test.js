'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode } = require('../helpers')
const { DRIVER, specBody, makeHost, run, stateOf, toGreenGate, toCommit } = require('./build-driver.fixtures')

// specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md — AC-20261007-03-1 through -5.

const STEM = '28-functional-prototype'
const E2E_FILE = 'e2e/proto-' + STEM + '.spec.ts'
const CONTRACT = 'design/prototypes/' + STEM + '/contract.json'

const protoHost = (extra = {}) => makeHost({ brief: 28, prototype: STEM, ...extra })
const runEnv = (host, env, ...args) =>
  runNode(DRIVER, [host.spec, ...args], { cwd: host.root, env: { ...process.env, ...env } })
const sidecarRel = (host, name) => path.relative(host.root, path.join(host.sidecar, name))
const portOf = (host) => JSON.parse(fs.readFileSync(path.join(host.sidecar, 'replay-port.json'), 'utf8')).port

test('AC-20261007-03-1: a spec with brief 28 is admitted at TESTS while proto/28-functional-prototype exists, and the retired harden-merged mark is unknown for a lane: behaviour spec that carries no prototype:', () => {
  const host = makeHost({ brief: 28 })
  host.g('branch', 'proto/' + STEM)
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0,
    'an open proto/ branch must not refuse a spec — the prototype worktree now lives through the build, so every prototype-citing spec would be unbuildable: ' + r.stderr)
  assert.match(r.stdout, /state: TESTS/, 'the admitted spec must start at TESTS: ' + r.stdout + r.stderr)
  assert.ok(!r.stderr.includes('is still open for brief'),
    'the retired admission refusal must be gone from stderr, or the build is blocked for the whole life of the prototype: ' + r.stderr)

  const laneHost = makeHost({ brief: 28 })
  fs.writeFileSync(laneHost.spec, specBody({ brief: 28, lane: 'behaviour' }))
  const first = run(laneHost.root, laneHost.spec)
  assert.match(first.stdout, /state: TESTS/,
    'a lane: behaviour spec with no prototype: must print TESTS first — lane: is never read, so a leftover HARDEN_MERGE state would strand it: ' + first.stdout + first.stderr)
  const mark = run(laneHost.root, laneHost.spec, '--mark', 'harden-merged')
  assert.strictEqual(mark.status, 2,
    'the harden-merged mark is deleted — accepting it would revive a branch merge the prototype no longer produces: ' + mark.stdout + mark.stderr)
  assert.match(mark.stderr, /--mark harden-merged is unknown|unknown mark "harden-merged"/,
    'the deleted mark must be reported unknown, not silently accepted or refused for an unrelated reason: ' + mark.stderr)
})

test('AC-20261007-03-2: a prototype: spec at a green gate prints state REPLAY with the contract as Read only, a Session line carrying PORT= and runtime.bootCommand, and --mark replayed, keeping one replay-port.json port across bare runs', () => {
  const host = protoHost()
  toGreenGate(host)
  const r = run(host.root, host.spec)
  assert.match(r.stdout, /state: REPLAY/,
    'a prototype: spec reaching a green gate must derive REPLAY — otherwise the contract tests never run against the production build: ' + r.stdout + r.stderr)
  assert.match(r.stdout, new RegExp('^Read only: .*' + CONTRACT.replace(/[.\/]/g, '\\$&'), 'm'),
    'the step must name the contract as the one file to read, or the session reads the prototype tree instead: ' + r.stdout)
  const session = /^Session: .*PORT=(\d+) node scripts\/dev-server\.js/m.exec(r.stdout)
  assert.ok(session,
    'the Session line must carry PORT=<n> and the host bootCommand, or the session cannot boot the app where the replay will look: ' + r.stdout)
  assert.match(r.stdout, /--mark replayed/, 'the step must name the --mark replayed command that ends it: ' + r.stdout)
  const written = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'replay-port.json'), 'utf8'))
  assert.deepStrictEqual(written, { port: Number(session[1]) },
    'replay-port.json must hold exactly the printed port, or the replay would probe an address the session never booted: ' + JSON.stringify(written))
  const again = run(host.root, host.spec)
  assert.match(again.stdout, new RegExp('PORT=' + session[1] + ' node scripts/dev-server\\.js'),
    'a second bare run must reuse the stored port — a re-allocated port would strand the app the session already started: ' + again.stdout)
})

test('AC-20261007-03-3: a green --mark replayed copies the contract test to the e2eFile path, runs e2eRun with PROTO_URL, writes replay-state.json and prints the look stop; --mark looked then moves REPLAY to COMMIT', () => {
  const host = protoHost()
  toGreenGate(host)
  const bare = run(host.root, host.spec)
  assert.match(bare.stdout, /state: REPLAY/,
    'setup requires the REPLAY state before --mark replayed can be exercised: ' + bare.stdout + bare.stderr)
  const port = portOf(host)
  const base = 'http://127.0.0.1:' + port

  const r = run(host.root, host.spec, '--mark', 'replayed')
  assert.strictEqual(r.status, 0, 'a green contract replay must be accepted: ' + r.stdout + r.stderr)

  const copied = path.join(host.root, E2E_FILE)
  assert.ok(fs.existsSync(copied),
    'the driver must write the contract test to the host e2eFile path, or e2eRun has nothing to run: ' + E2E_FILE)
  assert.strictEqual(fs.readFileSync(copied, 'utf8'),
    fs.readFileSync(path.join(host.root, 'design/prototypes', STEM, 'tests/proto-' + STEM + '.spec.ts'), 'utf8'),
    'the copied test must be byte-equal to the contract\'s own file, or the replay judges a different test than the user approved')
  const env = fs.readFileSync(path.join(host.root, 'e2e-env.txt'), 'utf8')
  assert.match(env, new RegExp('^file=' + E2E_FILE.replace(/[.\/]/g, '\\$&') + '$', 'm'),
    'e2eRun must receive the repo-relative e2eFile as {file}: ' + env)
  assert.match(env, new RegExp('^PROTO_URL=' + base.replace(/\./g, '\\.') + '$', 'm'),
    'e2eRun must run with PROTO_URL = the resolved app address, or the tests hit nothing: ' + env)

  const state = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'replay-state.json'), 'utf8'))
  assert.deepStrictEqual(state, { tests: 2, passed: true, looked: false, log: sidecarRel(host, 'replay-1.log') },
    'replay-state.json must record the pin count, the pass and looked:false, or the COMMIT gate has no evidence: ' + JSON.stringify(state))

  assert.ok(r.stdout.includes('✅ contract tests green against the production build — 2 tests'),
    'the look stop must open with the green line and the pin count: ' + r.stdout)
  assert.ok(r.stdout.includes('🎨 production screens beside the prototype captures — ' + base),
    'the look stop must name the production address the screens are at: ' + r.stdout)
  const routes = r.stdout.split('\n').filter((l) => l.startsWith('route '))
  assert.strictEqual(routes.length, 4,
    'every route x state of the contract needs its own production-beside-picture line, or a screen goes unjudged: ' + r.stdout)
  assert.strictEqual(routes[1],
    'route /women (empty): ' + base + '/women?proto=empty · design/prototypes/' + STEM + '/captures/women--empty.png',
    'a route line must pair the production address with the prototype picture: ' + routes[1])
  assert.match(r.stdout, /close enough/, 'the look stop must name the literal close enough reply: ' + r.stdout)
  assert.match(r.stdout, /--mark looked/, 'the look stop must name the --mark looked command: ' + r.stdout)

  assert.match(run(host.root, host.spec).stdout, /state: REPLAY/,
    'a green replay alone must leave the state REPLAY — the look stop waits for the literal close enough: ' + sidecarRel(host, 'replay-state.json'))

  const looked = run(host.root, host.spec, '--mark', 'looked')
  assert.strictEqual(looked.status, 0, '--mark looked after a green replay must be accepted: ' + looked.stdout + looked.stderr)
  assert.ok(looked.stdout.includes('(REPLAY → COMMIT)'),
    'the success sentence must name the transition to COMMIT: ' + looked.stdout)
  assert.match(run(host.root, host.spec).stdout, /state: COMMIT/,
    'after looked the next bare run must derive COMMIT, or the build is stuck at the look stop: ' + stateOf(host.root, host.spec))
})

test('AC-20261007-03-4: a red replay, an unreplayed looked, a contract with tests null and an undeclared e2eRun each exit 2 naming their remedy and leave the build at REPLAY', () => {
  const red = protoHost()
  toGreenGate(red)
  run(red.root, red.spec)
  const early = run(red.root, red.spec, '--mark', 'looked')
  assert.strictEqual(early.status, 2,
    '--mark looked before any green replay must refuse, or the contract tests never gate the build: ' + early.stdout + early.stderr)
  assert.match(early.stdout + early.stderr, /replay has not passed/,
    'the refusal must say the replay has not passed so the session knows to run --mark replayed: ' + early.stdout + early.stderr)

  const r = runEnv(red, { E2E_RED: '1' }, '--mark', 'replayed')
  assert.strictEqual(r.status, 2, 'a red contract run must stop the build with exit 2: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes('contract tests red against the production build (e2eRun exited 1)'),
    'the refusal must say the contract is red against production and carry the exit code: ' + r.stderr)
  assert.ok(r.stderr.includes('replay-1.log'), 'the refusal must name the log to read: ' + r.stderr)
  assert.ok(fs.existsSync(path.join(red.sidecar, 'replay-1.log')),
    'the red run\'s output must be on disk at the named log, or the session has nothing to fix from: ' + red.sidecar)
  assert.ok(!fs.existsSync(path.join(red.sidecar, 'replay-state.json')),
    'a red replay must write no replay-state.json, or COMMIT would read a pass that never happened')
  assert.match(stateOf(red.root, red.spec), /^REPLAY$/, 'a red replay must leave the state at REPLAY')

  const noTests = protoHost()
  const doc = JSON.parse(fs.readFileSync(noTests.contractPath, 'utf8'))
  doc.tests = null
  fs.writeFileSync(noTests.contractPath, JSON.stringify(doc, null, 2) + '\n')
  toGreenGate(noTests)
  const nt = run(noTests.root, noTests.spec, '--mark', 'replayed')
  assert.strictEqual(nt.status, 2, 'a contract with tests: null has nothing to replay — it must refuse: ' + nt.stdout + nt.stderr)
  assert.ok(nt.stderr.includes('contract.json') && nt.stderr.includes('--mark tests-derived'),
    'the refusal must name contract.json and the --mark tests-derived remedy: ' + nt.stderr)

  const noRun = protoHost({ e2eRun: false })
  toGreenGate(noRun)
  const nr = run(noRun.root, noRun.spec, '--mark', 'replayed')
  assert.strictEqual(nr.status, 2, 'a host with no prototype.e2eRun cannot replay — it must refuse: ' + nr.stdout + nr.stderr)
  assert.ok(nr.stderr.includes('prototype.e2eRun'),
    'the refusal must name the undeclared prototype.e2eRun key so the host knows what to declare: ' + nr.stderr)
})

test('AC-20261007-03-5: a prototype: build row carries replay { tests, passed, looked } and no capture key, while a build of a spec without prototype: carries no replay key', () => {
  const commitAndMark = (host, extraPaths) => {
    host.g('add', 'src/foo.js', 'src/bar.js', 'other.txt', 'tests/foo.test.js', path.relative(host.root, host.spec), ...extraPaths)
    host.g('commit', '-q', '-m', 'checkpoint')
    const r = run(host.root, host.spec, '--mark', 'committed')
    assert.strictEqual(r.status, 0, '--mark committed on a clean, advanced tree must be accepted: ' + r.stdout + r.stderr)
    const rows = fs.readFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    return JSON.parse(rows[rows.length - 1])
  }

  const host = protoHost()
  toGreenGate(host)
  run(host.root, host.spec)
  const replayed = run(host.root, host.spec, '--mark', 'replayed')
  assert.strictEqual(replayed.status, 0, 'setup requires a green replay: ' + replayed.stdout + replayed.stderr)
  const looked = run(host.root, host.spec, '--mark', 'looked')
  assert.strictEqual(looked.status, 0, 'setup requires the look to be marked: ' + looked.stdout + looked.stderr)
  const row = commitAndMark(host, [E2E_FILE])
  assert.strictEqual(row.stage, 'build', 'the appended row must be the build row: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.replay, { tests: 2, passed: true, looked: true },
    'the build row must carry the replay evidence the review contract leg reads, or CLEAN is reachable without an executed replay: ' + JSON.stringify(row))
  assert.ok(!('capture' in row),
    'the retired capture key must not appear on a build row: ' + JSON.stringify(row))

  const plain = makeHost()
  toCommit(plain)
  const plainRow = commitAndMark(plain, [])
  assert.ok(!('replay' in plainRow),
    'a spec without prototype: must append a row with no replay key, or every build row changes shape: ' + JSON.stringify(plainRow))
})
