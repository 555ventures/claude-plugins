'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260827/01-genesis-tournament.md (2026-08-27, TDD red): genesis-driver.js gains the
// tournament of scaffolds — FINALISTS -> RACE (driver-only) -> PROBE -> PICK between MENUS and
// DECIDE for the five tournament archetypes (web-app, realtime-trading, backend-api,
// mobile-app, desktop-app); every other archetype still derives MENUS -> DECIDE unchanged. None
// of AC-20260827-01-1..8 can pass yet: the driver has no FINALISTS/RACE/PROBE/PICK states, no
// tournament marks, --mark menus-done does not yet require an archetype line, and
// spec/templates/finalists.json does not exist (a bare `--mark finalists-written` today falls
// through handleMark's default case and dies with "unknown mark").
//
// Fixtures use the spec's own Assumptions A1 fake shell commands — `touch`, `exit N`, and the
// executed boot line `touch booted; trap 'exit 0' TERM; while :; do sleep 1; done` with
// `readyCheck: "test -f booted"` — never a real package manager or the network. RACE's boot leg
// drives the real spec/scripts/smoke.sh so AC-20260827-01-4's race is genuinely executed, not
// narrated; readiness is observed within a couple of seconds since the fake boot command touches
// its ready file as its very first statement.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'
const COVERAGE_KEYS = [
  'payer', 'tenancy', 'data-sensitivity', 'residency', 'ai-use', 'unattended',
  'integrations', 'scale-outage', 'vendor-budget', 'offline-mobile',
]

function bare(dir) {
  return runNode(SCRIPT, ['--root', dir])
}

function state(dir) {
  return runNode(SCRIPT, ['--root', dir, '--state'])
}

function mark(dir, name, file) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv)
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function writeJSON(p, obj) {
  writeFile(p, JSON.stringify(obj, null, 2) + '\n')
}

function statusOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/status.json'), 'utf8'))
}

// Same shape as tests/genesis/genesis-driver.test.js's own writeBrief — this file cannot require
// that one (workflow-script-style file-local helpers, no shared module beyond tests/helpers.js).
function writeBrief(dir, { coverage = {}, dims = { [DIM]: 'open' }, picks = [] } = {}) {
  const cov = COVERAGE_KEYS.map((k) => `- ${k}: ${coverage[k] || 'covered — synthetic test value'}`).join('\n')
  const dimLines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for tournament.test.js.

## Coverage
${cov}

## Non-goals
none

## Open Dimensions
${dimLines}

## Research Angles
none — synthetic host, no research needed.

## Picks
${picks.join('\n')}
`)
}

function writeHostingMenu(dir) {
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM,
    options: [{ label: 'AWS', packages: [] }],
  })
}

// Drives from an empty root to a MENUS state whose hosting menu file is already written (the
// registry-check pass recorded) — everything AC-1/AC-2 need before they exercise the archetype
// line themselves.
function advanceToMenusReady(dir) {
  bare(dir)
  writeBrief(dir)
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief: ' + disco.stderr)
  writeHostingMenu(dir)
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
}

// Drives all the way through menus-done with a named TOURNAMENT archetype, asserting the driver
// actually lands in FINALISTS — the shared setup every AC-3..AC-8 test in this file builds on.
function advanceToFinalists(dir, archetype) {
  advanceToMenusReady(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted with a valid archetype and every open dimension picked: ' + done.stderr)
  assert.match(done.stdout, /state: FINALISTS/, 'test setup requires the tournament archetype "' + archetype + '" to reach FINALISTS straight after menus-done: ' + done.stdout)
  return done
}

function finalist(name, picks, overrides = {}) {
  return Object.assign({
    name,
    picks,
    scaffoldCommand: 'true',
    gateCommand: 'true',
    bootCommand: 'true',
    readyCheck: 'true',
  }, overrides)
}

const BOOT_CMD = "touch booted; trap 'exit 0' TERM; while :; do sleep 1; done"

test('AC-20260827-01-1: menus-done with a non-tournament archetype reaches DECIDE with no tournament/ directory ever created, a tournament archetype prints FINALISTS with the cost and last-measured lines, and finalists-skipped records the skip and hands the state back to DECIDE', () => {
  const dataMl = tmpdir('tourn-ac1-datamL')
  advanceToMenusReady(dataMl)
  writeBrief(dataMl, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
  const done1 = mark(dataMl, 'menus-done')
  assert.strictEqual(done1.status, 0, 'a fully-covered, fully-picked brief with a valid archetype must be accepted: ' + done1.stderr)
  assert.match(done1.stdout, /state: DECIDE/, 'D1: a non-tournament archetype (data-ml) must derive straight to DECIDE, unchanged from before this spec — a FINALISTS print here means every non-tournament project now gets routed into a race it never asked for')
  assert.strictEqual(fs.existsSync(path.join(dataMl, '.claude/genesis/tournament')), false, 'D1: a non-tournament archetype must never create .claude/genesis/tournament/ — its existence would mean race bookkeeping was set up for a project that will never run one')

  const backend = tmpdir('tourn-ac1-backend')
  advanceToMenusReady(backend)
  writeBrief(backend, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
  const done2 = mark(backend, 'menus-done')
  assert.strictEqual(done2.status, 0, 'a fully-covered, fully-picked brief with a valid tournament archetype must be accepted: ' + done2.stderr)
  assert.match(done2.stdout, /state: FINALISTS/, 'D1: a tournament archetype (backend-api) must derive to FINALISTS, not straight to DECIDE — its absence means the tournament never gets offered for archetypes D1 names')
  assert.match(done2.stdout, /^cost: roughly one mini-build per finalist/m, 'D4: the FINALISTS step is a go/no-go line that must state its cost up front — its absence leaves the session guessing what racing finalists will spend before agreeing to it')
  assert.match(done2.stdout, /^last measured: no figure yet/m, 'D4: with no prior tournament/benchmark.json on disk, the cost line must read "no figure yet", not a fabricated number or silence — a session reading a made-up figure would be told a cost that was never actually measured')

  const skip = mark(backend, 'finalists-skipped')
  assert.strictEqual(skip.status, 0, 'finalists-skipped must be a valid, accepted mark for a session that opts out of racing: ' + skip.stderr)
  assert.strictEqual(statusOf(backend).tournament.skipped, true, 'finalists-skipped must record tournament.skipped === true so a re-invocation never re-offers the race it was explicitly told to skip')
  assert.match(skip.stdout, /\(FINALISTS → DECIDE\)/, 'the checkpoint line must read (FINALISTS → DECIDE) — a skipped race still needs the same /clear-safe checkpoint contract every other mark gets')
  const afterSkip = bare(backend)
  assert.match(afterSkip.stdout, /state: DECIDE/, 'a skipped tournament must resume at DECIDE on the very next bare invocation — landing anywhere else means the skip was not actually honored by state re-derivation')
})

test('AC-20260827-01-2: menus-done refuses a missing archetype line by name, refuses an unknown archetype value by naming the bad value and a real key, and accepts a known archetype, recording it into status.json', () => {
  const missing = tmpdir('tourn-ac2-missing')
  advanceToMenusReady(missing)
  writeBrief(missing, { picks: ['- ' + DIM + ': AWS'] })
  const r1 = mark(missing, 'menus-done')
  assert.strictEqual(r1.status, 2, 'D2: menus-done must refuse a brief whose ## Picks carries every dimension pick but no archetype line — the driver has no way to know which archetype the tournament (and later the explore stage) should condition on: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /archetype/, 'the refusal must name "archetype" so the session knows exactly which pick line is missing, not a generic "brief incomplete" message')

  const bogus = tmpdir('tourn-ac2-bogus')
  advanceToMenusReady(bogus)
  writeBrief(bogus, { picks: ['- archetype: bogus', '- ' + DIM + ': AWS'] })
  const r2 = mark(bogus, 'menus-done')
  assert.strictEqual(r2.status, 2, 'D2: an archetype value outside the eight registry keys must be refused — accepting it would let a typo silently become the project\'s permanent, load-bearing archetype: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /bogus/, 'the refusal must name the offending value "bogus" so the session knows what it wrote was rejected, not just that something was wrong')
  assert.match(r2.stderr, /web-app/, 'the refusal must name at least one real registry key (e.g. web-app) so the session has the actual eight-key vocabulary in front of it instead of having to go look up the registry table')

  const ok = tmpdir('tourn-ac2-ok')
  advanceToMenusReady(ok)
  writeBrief(ok, { picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
  const r3 = mark(ok, 'menus-done')
  assert.strictEqual(r3.status, 0, 'a brief naming a real registry archetype must be accepted: ' + r3.stderr)
  assert.strictEqual(statusOf(ok).archetype, 'web-app', 'D2: a successful menus-done must store the archetype into status.json — its absence means the tournament routing (D1) and the later explore stage have no durable record of which archetype this project is, and would have to re-parse the brief every time')
})

test('AC-20260827-01-3: finalists-written refuses one finalist, four finalists, a finalist missing readyCheck, and a set with no incumbent, each by name, and accepts two valid finalists that include the incumbent, recording their names in order and printing the FINALISTS to RACE checkpoint', () => {
  const one = tmpdir('tourn-ac3-one')
  advanceToFinalists(one, 'backend-api')
  writeJSON(path.join(one, '.claude/genesis/finalists.json'), { finalists: [finalist('stack-a', { hosting: 'AWS' })] })
  const r1 = mark(one, 'finalists-written', 'finalists.json')
  assert.strictEqual(r1.status, 2, 'D3: a single finalist gives no comparison at all — racing one stack is not a tournament, so the mark must refuse it: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /at least 2 finalists/, 'the refusal must name the floor "at least 2 finalists" so the session knows exactly how many more to add')

  const four = tmpdir('tourn-ac3-four')
  advanceToFinalists(four, 'backend-api')
  writeJSON(path.join(four, '.claude/genesis/finalists.json'), {
    finalists: [
      finalist('stack-a', { hosting: 'AWS' }),
      finalist('stack-b', { hosting: 'GCP' }),
      finalist('stack-c', { hosting: 'Azure' }),
      finalist('stack-d', { hosting: 'Fly' }),
    ],
  })
  const r2 = mark(four, 'finalists-written', 'finalists.json')
  assert.strictEqual(r2.status, 2, 'D3: the brief caps the race at 3 finalists — the cost is per-finalist (D4), so a fourth is a cost decision no one signed off on: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /at most 3 finalists/, 'the refusal must name the ceiling "at most 3 finalists" so the session knows exactly how many to cut')

  const noReady = tmpdir('tourn-ac3-noready')
  advanceToFinalists(noReady, 'backend-api')
  const missingReadyCheck = finalist('stack-b', { hosting: 'GCP' })
  delete missingReadyCheck.readyCheck
  writeJSON(path.join(noReady, '.claude/genesis/finalists.json'), {
    finalists: [finalist('stack-a', { hosting: 'AWS' }), missingReadyCheck],
  })
  const r3 = mark(noReady, 'finalists-written', 'finalists.json')
  assert.strictEqual(r3.status, 2, 'D3: RACE cannot boot-check a finalist with no readyCheck — the mark must refuse before the race ever starts, not fail mid-race with nothing to poll: ' + JSON.stringify(r3))
  assert.match(r3.stderr, /stack-b/, 'the refusal must name the offending finalist "stack-b" so the session knows which entry in finalists.json to fix')
  assert.match(r3.stderr, /readyCheck/, 'the refusal must name the missing field "readyCheck" so the session knows exactly what to add, not just that the finalist is invalid')

  const noIncumbent = tmpdir('tourn-ac3-noincumbent')
  advanceToFinalists(noIncumbent, 'backend-api')
  writeJSON(path.join(noIncumbent, '.claude/genesis/finalists.json'), {
    finalists: [finalist('stack-a', { hosting: 'GCP' }), finalist('stack-b', { hosting: 'Azure' })],
  })
  const r4 = mark(noIncumbent, 'finalists-written', 'finalists.json')
  assert.strictEqual(r4.status, 2, 'D3: at least one finalist must be the incumbent — a race where every finalist diverges from the brief\'s own ## Picks abandons the decisions already made, silently: ' + JSON.stringify(r4))
  assert.match(r4.stderr, /## Picks/, 'the refusal must name "## Picks" so the session understands the fix is to align one finalist with the brief\'s current picks, not just add another arbitrary stack')

  const ok = tmpdir('tourn-ac3-ok')
  advanceToFinalists(ok, 'backend-api')
  writeJSON(path.join(ok, '.claude/genesis/finalists.json'), {
    finalists: [finalist('stack-a', { hosting: 'AWS' }), finalist('stack-b', { hosting: 'GCP' })],
  })
  const r5 = mark(ok, 'finalists-written', 'finalists.json')
  assert.strictEqual(r5.status, 0, 'two finalists including the incumbent must be accepted: ' + r5.stderr)
  assert.deepStrictEqual(statusOf(ok).tournament.finalists, ['stack-a', 'stack-b'], 'D3: a successful finalists-written must record the finalist names, in file order, into tournament.finalists — a wrong order or a missing name here means RACE (D5) has no reliable roster to iterate')
  assert.match(r5.stdout, /\(FINALISTS → RACE\)/, 'the checkpoint line must read (FINALISTS → RACE) so a /clear-ing session knows the next re-invocation will actually spend the race\'s cost')
})

test('AC-20260827-01-4: a bare invocation in RACE scaffolds, gates, and boots a green finalist for real while a finalist whose scaffold fails spends nothing further, writes the tournament .gitignore and the three per-finalist logs, prints PROBE, and never re-races on a second invocation or under --state', () => {
  const dir = tmpdir('tourn-ac4')
  advanceToFinalists(dir, 'backend-api')
  writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
    finalists: [
      finalist('stack-a', { hosting: 'AWS' }, {
        scaffoldCommand: 'touch scaffolded.txt',
        gateCommand: 'exit 0',
        bootCommand: BOOT_CMD,
        readyCheck: 'test -f booted',
        readyTimeout: 10,
      }),
      finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
    ],
  })
  const written = mark(dir, 'finalists-written', 'finalists.json')
  assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)

  const raced = bare(dir)
  assert.strictEqual(raced.status, 0, 'D5: a bare invocation reaching RACE must execute the race and exit 0 — an error here means the driver-only race step itself is broken, not any finalist\'s own command: ' + raced.stderr)
  assert.match(raced.stdout, /state: PROBE/, 'D5: once every finalist has been raced (scaffolded, gated, and booted-or-failed), the driver must advance to PROBE — anything else means the race never actually finished')

  const scaffoldedPath = path.join(dir, '.claude/genesis/tournament/finalists/stack-a/scaffolded.txt')
  assert.ok(fs.existsSync(scaffoldedPath), 'D5: scaffoldCommand must actually run with cwd inside tournament/finalists/stack-a/ — its absence means the race only narrated the scaffold instead of executing it')

  const st = statusOf(dir)
  assert.strictEqual(st.tournament.race['stack-a'].scaffold.exit, 0, 'a green scaffoldCommand must record scaffold.exit === 0 for stack-a')
  assert.strictEqual(st.tournament.race['stack-a'].gate.exit, 0, 'D5: once scaffold succeeds, the race must also run gateCommand and record its real exit — a missing or wrong gate.exit means the race skipped a step it owes every scaffolded finalist')
  assert.strictEqual(st.tournament.race['stack-a'].boot.exit, 0, 'D5: the race must also boot the finalist through smoke.sh and record the real boot exit — anything other than 0 here means the fake boot command that touches its own ready file and exits cleanly on TERM was not actually driven to completion')
  assert.match(st.tournament.race['stack-a'].boot.sentinel, /^__SMOKE_PASS__/, 'D5: the recorded boot.sentinel must be smoke.sh\'s own __SMOKE_PASS__ line — a driver that fabricates or drops the sentinel would let a broken boot look identical to a real pass')
  assert.strictEqual(st.tournament.race['stack-b'].scaffold.exit, 3, 'a failing scaffoldCommand must record its real exit code (3), never silently coerced to something else')
  assert.ok(!('gate' in st.tournament.race['stack-b']), 'D5: "nothing further is spent" on a finalist whose scaffold fails — a recorded gate result for stack-b means the driver ran (and paid for) a gate command on a finalist that never got past its own scaffold')
  assert.ok(!('boot' in st.tournament.race['stack-b']), 'D5: nothing further is spent on a finalist whose scaffold fails — a recorded boot result for stack-b means the driver spent a real boot cycle on a finalist that never got past its own scaffold')

  const gitignorePath = path.join(dir, '.claude/genesis/tournament/.gitignore')
  assert.strictEqual(fs.readFileSync(gitignorePath, 'utf8'), 'finalists/\nlogs/\n', 'D5/A2: tournament/.gitignore must read exactly "finalists/\\nlogs/\\n" — any other pattern either leaves the raced copies\' node_modules/build artifacts tracked, or (per the executed A2 spike) re-excludes evidence/ screenshots and benchmark.json that must stay tracked')

  for (const suffix of ['scaffold', 'gate', 'boot']) {
    const logPath = path.join(dir, '.claude/genesis/tournament/logs/stack-a.' + suffix + '.log')
    assert.ok(fs.existsSync(logPath), 'D5: the race must write tournament/logs/stack-a.' + suffix + '.log for the ' + suffix + ' leg — its absence leaves a failed race with no diagnostic evidence for a step that was supposedly run')
  }

  fs.unlinkSync(scaffoldedPath)
  const second = bare(dir)
  assert.strictEqual(fs.existsSync(scaffoldedPath), false, 'D5: "a finalist with a recorded race is never re-raced" — scaffolded.txt reappearing here means the second bare invocation re-ran scaffoldCommand instead of trusting the already-recorded race result')
  assert.match(second.stdout, /state: PROBE/, 'a second bare invocation in the already-raced state must still print PROBE, derived from the recorded race, not error or regress to RACE')

  const peek = state(dir)
  assert.strictEqual(peek.stdout, 'PROBE\n', '--state must report PROBE for the driver-only RACE state exactly like the existing SCAFFOLD/GATE peek contract (F3) — a --state call that races or reports something else breaks the read-only peek invariant this driver already guarantees elsewhere')
})

// specs/20260827/02-genesis-explore-state.md D7 (2026-08-27): tile source derivation replaces
// this spec's own D6 sketch source — the style-tile task's tiles are now `explore.finalists`
// (a position's tile.html + tokens.css, or an external candidate's dir), never
// .claude/genesis/sketch.html. web-app is also one of D1's four VISUAL archetypes, so it must
// now resolve the new EXPLORE state (between MENUS and FINALISTS) before it can ever reach
// FINALISTS at all — advanceToFinalists()'s "menus-done reaches FINALISTS straight away"
// contract no longer holds for web-app specifically (it still holds for every archetype used
// elsewhere in this file, all of which are the non-visual backend-api). This test's own
// "sketch-tile" setup is retargeted in place to resolve EXPLORE via `--mark external` — the
// funnel-skipping path D6 introduces — and merges the old two-directory noSketch/withSketch
// shape into one flow that ALSO writes a decoy sketch.html, so the pin gets STRICTLY stronger:
// it now proves sketch.html is ignored even when present on disk, not merely when absent. Never
// weakened, no new AC-ID (this row carries none per the File Plan).
test('AC-20260827-01-5: PROBE lists the archetype\'s task set and the tile source, dropping style-tile when no sketch.html exists, and probe-done refuses a task over the retry cap and a probe.json missing an expected task before accepting a valid one that re-executes the finalist\'s gate, writes the benchmark and gallery, and advances to PICK', () => {
  function raceWebAppViaExternal(dir) {
    advanceToMenusReady(dir)
    writeBrief(dir, { picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
    const done = mark(dir, 'menus-done')
    assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted: ' + done.stderr)
    assert.match(done.stdout, /state: EXPLORE/, 'specs/20260827/02 D1: menus-done for the visual archetype web-app must now reach EXPLORE, not FINALISTS — this test\'s own setup must track that routing change or every assertion below is exercising a state the driver would never actually reach')

    // A decoy sketch.html PROVES D7's "sketch.html is never a tile source" claim: it must never
    // be named by PROBE even though it genuinely exists on disk.
    writeFile(path.join(dir, '.claude/genesis/sketch.html'), '<html><body>decoy sketch.html — must never be named by PROBE</body></html>')
    writeFile(path.join(dir, 'design/explore/external/mine/index.html'),
      '<html><body><div data-screen-label="mine"></div></body></html>')
    writeJSON(path.join(dir, 'design/targets.json'), { themes: ['light'], viewports: [{ name: 'mobile', width: 390, height: 844 }] })
    const external = mark(dir, 'external', 'design/explore/external/mine')
    assert.strictEqual(external.status, 0, 'test setup requires --mark external to be accepted: ' + external.stderr)

    const finalistsStep = bare(dir)
    assert.match(finalistsStep.stdout, /state: FINALISTS/, 'test setup requires explore: external to hand EXPLORE off to FINALISTS: ' + finalistsStep.stdout)

    writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
      finalists: [
        finalist('stack-a', { hosting: 'AWS' }, {
          scaffoldCommand: 'touch scaffolded.txt',
          gateCommand: 'echo run >> gate-runs.txt',
          bootCommand: BOOT_CMD,
          readyCheck: 'test -f booted',
          readyTimeout: 10,
        }),
        finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
      ],
    })
    const written = mark(dir, 'finalists-written', 'finalists.json')
    assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
    const raced = bare(dir)
    assert.match(raced.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + raced.stdout)
    return raced
  }

  const dir = tmpdir('tourn-ac5-external')
  const probeStep = raceWebAppViaExternal(dir)
  assert.match(probeStep.stdout, /authed-crud-screen/, 'D6: web-app\'s PROBE step must list authed-crud-screen — its absence means the probe-task table is not actually wired to the printed step')
  assert.match(probeStep.stdout, /background-job/, 'D6: web-app\'s PROBE step must list background-job')
  assert.match(probeStep.stdout, /style-tile/, 'specs/20260827/02 D7: once explore has resolved to an external candidate, style-tile must be listed as an expected task — its absence means a real tile source is being silently dropped')
  assert.match(probeStep.stdout, /design\/explore\/external\/mine/, 'specs/20260827/02 D7: the PROBE step must print the external candidate\'s own dir as the style-tile task\'s tile source — a session that has to go find the source on its own defeats the point of the printed step')
  assert.doesNotMatch(probeStep.stdout, /sketch\.html/, 'specs/20260827/02 D7: "sketch.html is never a tile source" — its mention here would mean the retired spec 01 D6 mechanism is still being read even though a decoy sketch.html exists on disk and an external candidate was properly marked')

  function probeJsonPath(dir) {
    return path.join(dir, '.claude/genesis/tournament/evidence/stack-a/probe.json')
  }
  function shotAt(dir, filename) {
    const rel = '.claude/genesis/tournament/evidence/stack-a/' + filename
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, Buffer.from([0]))
    return rel
  }

  // over-cap retries — reuses the same dir: a refused mark records nothing, so PROBE
  // is still the derived state for the next attempt.
  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 3, tokens: 100, screenshot: null },
      { task: 'background-job', passed: true, retries: 0, tokens: 200, screenshot: null },
      { task: 'style-tile', tile: 'external/mine', passed: true, retries: 0, tokens: 50, screenshot: null },
    ],
  })
  const r1 = mark(dir, 'probe-done')
  assert.strictEqual(r1.status, 2, 'D7: retries must be capped at 2 per task (D6\'s "retry cap: 2 per task") — a probe.json claiming 3 retries on authed-crud-screen must be refused, not silently accepted as evidence: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /stack-a/, 'the refusal must name the offending finalist "stack-a"')
  assert.match(r1.stderr, /retries/, 'the refusal must name the offending field "retries" so the session knows exactly what is out of range')

  // missing background-job
  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 0, tokens: 100, screenshot: null },
      { task: 'style-tile', tile: 'external/mine', passed: true, retries: 0, tokens: 50, screenshot: null },
    ],
  })
  const r2 = mark(dir, 'probe-done')
  assert.strictEqual(r2.status, 2, 'D7: probe.json must cover exactly the expected task set — a probe.json missing background-job must be refused, not accepted as if the missing task were simply skipped: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /background-job/, 'the refusal must name the missing task "background-job" so the session knows exactly which probe slice still needs building')

  // valid
  const shot1 = shotAt(dir, 'authed-crud-screen.png')
  const shot3 = shotAt(dir, 'style-tile.external.png')
  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 1, tokens: 100, screenshot: shot1 },
      { task: 'background-job', passed: true, retries: 0, tokens: 200, screenshot: null },
      { task: 'style-tile', tile: 'external/mine', passed: true, retries: 0, tokens: 50, screenshot: shot3 },
    ],
  })
  const r3 = mark(dir, 'probe-done')
  assert.strictEqual(r3.status, 0, 'a probe.json covering exactly the expected tasks, with retries and screenshots inside the contract, must be accepted: ' + r3.stderr)
  assert.match(r3.stdout, /state: PICK/, 'D7: a successful probe-done must advance the driver to PICK — anything else means the benchmark assembly this mark owns never actually ran')

  const gateRunsPath = path.join(dir, '.claude/genesis/tournament/finalists/stack-a/gate-runs.txt')
  const gateRunsLines = fs.readFileSync(gateRunsPath, 'utf8').trim().split('\n')
  assert.strictEqual(gateRunsLines.length, 2, 'D7: probe-done must re-execute the finalist\'s gateCommand once more on top of the race\'s own run — one line in gate-runs.txt means the post-probe gate never actually ran, leaving the benchmark\'s "gate: post" column reporting a fact nobody observed')

  const benchmark = JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/tournament/benchmark.json'), 'utf8'))
  const row = benchmark.finalists.find((f) => f.name === 'stack-a')
  assert.ok(row, 'D7: benchmark.json must carry a row for stack-a — its absence means the one finalist that actually reached PROBE has no recorded benchmark evidence at all')
  assert.strictEqual(row.tokens, 350, 'D7: tokens must be summed from probe.json (100 + 200 + 50 = 350) — any other figure means tokens were estimated or mis-summed instead of read straight from the harness-reported values A4 documents')
  assert.strictEqual(row.probePassed, 3, 'D7: probePassed must count the 3 passing tasks in probe.json')
  assert.strictEqual(row.probeTotal, 3, 'D7: probeTotal must count all 3 expected tasks')
  assert.ok(fs.existsSync(path.join(dir, '.claude/genesis/tournament/benchmark.md')), 'D7: benchmark.md must be written as the human-readable render of benchmark.json — its absence leaves PICK (D8) with no table to print verbatim')
  const gallery = fs.readFileSync(path.join(dir, '.claude/genesis/tournament/gallery.html'), 'utf8')
  assert.ok(gallery.includes(shot1), 'D7: gallery.html must contain the recorded authed-crud-screen screenshot\'s path — its absence means the gallery is missing an <img> cell for evidence that was actually captured')
  assert.ok(gallery.includes(shot3), 'D7: gallery.html must contain the recorded style-tile screenshot\'s path')
})

test('AC-20260827-01-6: picked refuses a ## Picks that matches zero finalists by naming the zero count and ## Picks, and once exactly one finalist matches it records the winner and the PICK to DECIDE checkpoint; the PICK step text carries the benchmark.md table and the evidence-informs-never-decides line', () => {
  const dir = tmpdir('tourn-ac6')
  advanceToFinalists(dir, 'backend-api')
  writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
    finalists: [
      finalist('stack-a', { hosting: 'AWS' }, {
        scaffoldCommand: 'touch scaffolded.txt',
        gateCommand: 'exit 0',
        bootCommand: BOOT_CMD,
        readyCheck: 'test -f booted',
        readyTimeout: 10,
      }),
      finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
    ],
  })
  const written = mark(dir, 'finalists-written', 'finalists.json')
  assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
  const raced = bare(dir)
  assert.match(raced.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + raced.stdout)

  const shotPath = path.join(dir, '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png')
  fs.mkdirSync(path.dirname(shotPath), { recursive: true })
  fs.writeFileSync(shotPath, Buffer.from([0]))
  writeJSON(path.join(dir, '.claude/genesis/tournament/evidence/stack-a/probe.json'), {
    tasks: [
      { task: 'authed-crud-resource', passed: true, retries: 0, tokens: 10, screenshot: '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png' },
      { task: 'background-job', passed: true, retries: 0, tokens: 20, screenshot: null },
    ],
  })
  const probed = mark(dir, 'probe-done')
  assert.strictEqual(probed.status, 0, 'test setup requires probe-done to be accepted: ' + probed.stderr)
  assert.match(probed.stdout, /state: PICK/, 'test setup requires probe-done to reach PICK: ' + probed.stdout)

  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': Azure'] })
  const noMatch = mark(dir, 'picked')
  assert.strictEqual(noMatch.status, 2, 'D8: a ## Picks that matches neither finalist\'s picks must be refused — accepting it would record a winner the user never actually chose: ' + JSON.stringify(noMatch))
  assert.match(noMatch.stderr, /\b0\b/, 'the refusal must name the match count (0) so the session understands no finalist was found, not that something else went wrong')
  assert.match(noMatch.stderr, /## Picks/, 'the refusal must name "## Picks" so the session knows to rewrite the brief\'s picks to match one finalist, per D8\'s own remedy')

  const pickStep = bare(dir)
  assert.match(pickStep.stdout, /executed evidence informs the pick; it never makes it/, 'D8: the PICK step text must carry this exact line — its absence means the driver stops reminding the session that the benchmark numbers inform, and never automatically decide, the winner')
  const benchmarkMd = fs.readFileSync(path.join(dir, '.claude/genesis/tournament/benchmark.md'), 'utf8')
  assert.ok(pickStep.stdout.includes(benchmarkMd.trimEnd()), 'D8: the PICK step must print benchmark.md verbatim — a step text that omits or paraphrases the table forces the session to go open a second file mid-decision')

  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': GCP'] })
  const matched = mark(dir, 'picked')
  assert.strictEqual(matched.status, 0, 'a ## Picks matching exactly one finalist (stack-b) must be accepted: ' + matched.stderr)
  assert.strictEqual(statusOf(dir).tournament.winner, 'stack-b', 'D8: a successful picked mark must record tournament.winner as the matching finalist\'s name — its absence or a wrong name means decided (D9) has no reliable winner to enforce against')
  assert.match(matched.stdout, /\(PICK → DECIDE\)/, 'the checkpoint line must read (PICK → DECIDE) so a /clear-ing session knows the decision record step comes next')
})

test('AC-20260827-01-7: decided refuses a descriptor scaffoldCommand that differs from the recorded winner\'s, refuses when no ADR cites benchmark.md, and once both hold deletes the raced finalists/ and logs/ while keeping the benchmark, gallery, and evidence, then re-scaffolds the winner clean into --root on the next bare run', () => {
  const winnerCmd = 'touch root-scaffolded.txt'

  function fullFlowToPickedWinner(dir) {
    advanceToFinalists(dir, 'backend-api')
    writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
      finalists: [
        finalist('stack-a', { hosting: 'AWS' }, {
          scaffoldCommand: winnerCmd,
          gateCommand: 'exit 0',
          bootCommand: BOOT_CMD,
          readyCheck: 'test -f booted',
          readyTimeout: 10,
        }),
        finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
      ],
    })
    const written = mark(dir, 'finalists-written', 'finalists.json')
    assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
    const raced = bare(dir)
    assert.match(raced.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + raced.stdout)

    const shotPath = path.join(dir, '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png')
    fs.mkdirSync(path.dirname(shotPath), { recursive: true })
    fs.writeFileSync(shotPath, Buffer.from([0]))
    writeJSON(path.join(dir, '.claude/genesis/tournament/evidence/stack-a/probe.json'), {
      tasks: [
        { task: 'authed-crud-resource', passed: true, retries: 0, tokens: 10, screenshot: '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png' },
        { task: 'background-job', passed: true, retries: 0, tokens: 20, screenshot: null },
      ],
    })
    const probed = mark(dir, 'probe-done')
    assert.strictEqual(probed.status, 0, 'test setup requires probe-done to be accepted: ' + probed.stderr)

    writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
    const picked = mark(dir, 'picked')
    assert.strictEqual(picked.status, 0, 'test setup requires picked to be accepted: ' + picked.stderr)
    assert.strictEqual(statusOf(dir).tournament.winner, 'stack-a', 'test setup requires stack-a to be recorded as the winner')
  }

  function descriptorFor(scaffoldCommand) {
    return {
      schemaVersion: 1, archetype: 'backend-api', language: 'typescript', framework: 'hono',
      packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
      designCatalog: 'none', gateCommand: 'exit 0', scaffoldCommand,
      decisionRecords: ['docs/adr/0001-hosting.md'],
    }
  }

  function writeAdr(dir, citeBenchmark) {
    writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.
${citeBenchmark ? 'Race evidence: `.claude/genesis/tournament/benchmark.md`.\n' : ''}
## Dissents
GCP was considered and rejected — no other minority option surfaced.
`)
  }

  const mismatch = tmpdir('tourn-ac7-mismatch')
  fullFlowToPickedWinner(mismatch)
  writeJSON(path.join(mismatch, '.claude/genesis/stack-descriptor.json'), descriptorFor('touch different.txt'))
  writeAdr(mismatch, true)
  const r1 = mark(mismatch, 'decided')
  assert.strictEqual(r1.status, 2, 'D9: once a tournament winner is recorded, the descriptor\'s scaffoldCommand must equal the winner\'s exactly — a descriptor scaffolding something the race never actually validated must be refused: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /scaffoldCommand/, 'the refusal must name "scaffoldCommand" so the session knows exactly which descriptor field disagrees with the winner')

  const noCite = tmpdir('tourn-ac7-nocite')
  fullFlowToPickedWinner(noCite)
  writeJSON(path.join(noCite, '.claude/genesis/stack-descriptor.json'), descriptorFor(winnerCmd))
  writeAdr(noCite, false)
  const r2 = mark(noCite, 'decided')
  assert.strictEqual(r2.status, 2, 'D9: at least one listed ADR must cite the literal benchmark.md path — without it the decision record has no durable link back to the executed evidence the tournament produced: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /benchmark\.md/, 'the refusal must name "benchmark.md" so the session knows exactly what citation is missing')

  const ok = tmpdir('tourn-ac7-ok')
  fullFlowToPickedWinner(ok)
  writeJSON(path.join(ok, '.claude/genesis/stack-descriptor.json'), descriptorFor(winnerCmd))
  writeAdr(ok, true)
  const r3 = mark(ok, 'decided')
  assert.strictEqual(r3.status, 0, 'a descriptor matching the winner\'s scaffoldCommand, with an ADR citing benchmark.md, must be accepted: ' + r3.stderr)

  const finalistsDir = path.join(ok, '.claude/genesis/tournament/finalists')
  const logsDir = path.join(ok, '.claude/genesis/tournament/logs')
  assert.strictEqual(fs.existsSync(finalistsDir), false, 'D9/A3: a successful decided must delete tournament/finalists/ — the probe slice was built under retry caps with no spec and no review, and JJ\'s re-scaffold-clean ruling means it must not survive as the project foundation')
  assert.strictEqual(fs.existsSync(logsDir), false, 'D9: a successful decided must delete tournament/logs/ along with finalists/ — both were scratch race output, never durable evidence')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/benchmark.json')), 'D9/A3: benchmark.json must survive the finalists/logs deletion — it is the ADR\'s cited evidence, not scratch output')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/benchmark.md')), 'D9/A3: benchmark.md must survive the finalists/logs deletion')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/gallery.html')), 'D9/A3: gallery.html must survive the finalists/logs deletion')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/evidence')), 'D9/A3: evidence/ must survive the finalists/logs deletion')

  const scaffoldRun = bare(ok)
  assert.ok(fs.existsSync(path.join(ok, 'root-scaffolded.txt')), 'D9: the next bare invocation after decided must run the winner\'s scaffoldCommand fresh, in --root itself — the raced copy under tournament/finalists/ (already deleted) is never moved or promoted into the project root')
  assert.match(scaffoldRun.stdout, /SKELETON/, 'a freshly-completed root scaffold must advance the driver to SKELETON exactly as the non-tournament path already does')
})

test('AC-20260827-01-8: every state from DISCOVERY through ROADMAP prints a Doctrine: spec/doctrine/genesis.md § Genesis: line naming the section governing that step', () => {
  const DOCTRINE_LINE = /^Doctrine: spec\/doctrine\/genesis\.md § Genesis: /m

  const dir = tmpdir('tourn-ac8')
  const discovery = bare(dir)
  assert.match(discovery.stdout, DOCTRINE_LINE, 'D10: DISCOVERY must print a Doctrine: line — its absence leaves the session with no printed pointer to the section governing this step, the entire reason D10 deletes the command\'s own per-state pointer list')

  writeBrief(dir)
  const menus = mark(dir, 'discovery-done')
  assert.strictEqual(menus.status, 0, 'test setup requires discovery-done to be accepted: ' + menus.stderr)
  assert.match(menus.stdout, DOCTRINE_LINE, 'D10: MENUS must print a Doctrine: line')

  writeHostingMenu(dir)
  const menuWritten = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(menuWritten.status, 0, 'test setup requires menu-written to be accepted: ' + menuWritten.stderr)
  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
  const finalistsStep = mark(dir, 'menus-done')
  assert.strictEqual(finalistsStep.status, 0, 'test setup requires menus-done to be accepted: ' + finalistsStep.stderr)
  assert.match(finalistsStep.stdout, DOCTRINE_LINE, 'D10: FINALISTS must print a Doctrine: line')

  writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
    finalists: [
      finalist('stack-a', { hosting: 'AWS' }, {
        scaffoldCommand: 'touch scaffolded.txt',
        gateCommand: 'exit 0',
        bootCommand: BOOT_CMD,
        readyCheck: 'test -f booted',
        readyTimeout: 10,
      }),
      finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
    ],
  })
  const written = mark(dir, 'finalists-written', 'finalists.json')
  assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
  const probeStep = bare(dir)
  assert.match(probeStep.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + probeStep.stdout)
  assert.match(probeStep.stdout, DOCTRINE_LINE, 'D10: PROBE must print a Doctrine: line')

  const shotPath = path.join(dir, '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png')
  fs.mkdirSync(path.dirname(shotPath), { recursive: true })
  fs.writeFileSync(shotPath, Buffer.from([0]))
  writeJSON(path.join(dir, '.claude/genesis/tournament/evidence/stack-a/probe.json'), {
    tasks: [
      { task: 'authed-crud-resource', passed: true, retries: 0, tokens: 10, screenshot: '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png' },
      { task: 'background-job', passed: true, retries: 0, tokens: 20, screenshot: null },
    ],
  })
  const pickStep = mark(dir, 'probe-done')
  assert.strictEqual(pickStep.status, 0, 'test setup requires probe-done to be accepted: ' + pickStep.stderr)
  assert.match(pickStep.stdout, DOCTRINE_LINE, 'D10: PICK must print a Doctrine: line')

  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
  const decideStep = mark(dir, 'picked')
  assert.strictEqual(decideStep.status, 0, 'test setup requires picked to be accepted: ' + decideStep.stderr)
  assert.match(decideStep.stdout, DOCTRINE_LINE, 'D10: DECIDE must print a Doctrine: line')

  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1, archetype: 'backend-api', language: 'typescript', framework: 'hono',
    packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
    designCatalog: 'none', gateCommand: 'exit 0', scaffoldCommand: 'touch scaffolded.txt',
    decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.
Race evidence: \`.claude/genesis/tournament/benchmark.md\`.

## Dissents
GCP was considered and rejected — no other minority option surfaced.
`)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
  const skeletonStep = bare(dir)
  assert.match(skeletonStep.stdout, /SKELETON/, 'test setup requires the post-decided root scaffold to reach SKELETON: ' + skeletonStep.stdout)
  assert.match(skeletonStep.stdout, DOCTRINE_LINE, 'D10: SKELETON must print a Doctrine: line')

  const gateStep = mark(dir, 'skeleton-landed')
  assert.strictEqual(gateStep.status, 0, 'test setup requires skeleton-landed to be accepted: ' + gateStep.stderr)
  assert.match(gateStep.stdout, /ROADMAP/, 'test setup requires a green zero-day gate to reach ROADMAP: ' + gateStep.stdout)
  assert.match(gateStep.stdout, DOCTRINE_LINE, 'D10: ROADMAP must print a Doctrine: line')
})
