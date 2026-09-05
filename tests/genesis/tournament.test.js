'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { DIM, bare, mark, writeJSON, statusOf, writeBrief, advanceToMenusReady, advanceToFinalists, finalist, BOOT_CMD, state } = require('./tournament.fixtures')

// specs/20260827/01-genesis-tournament.md (TDD red): genesis-driver.js gains the
// tournament of scaffolds — FINALISTS -> RACE (driver-only) -> PROBE -> PICK between MENUS and
// DECIDE for the five tournament archetypes. Owns AC-20260827-01-1, AC-20260902-08-3,
// AC-20260827-01-3, AC-20260827-01-4 (D7); shard of tournament.test.js, split by
// specs/20260903/07-test-file-budget-guard.md D7. Shared constants/helpers live in
// tests/genesis/tournament.fixtures.js.

test('AC-20260827-01-1: menus-done with a non-tournament archetype reaches DECIDE with no tournament/ directory ever created, a tournament archetype prints FINALISTS with the cost and last-measured lines, and finalists-skipped records the skip and hands the state back to DECIDE', () => {
  const dataMl = tmpdir('tourn-ac1-datamL')
  advanceToMenusReady(dataMl, 'data-ml')
  writeBrief(dataMl, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
  const done1 = mark(dataMl, 'menus-done')
  assert.strictEqual(done1.status, 0, 'a fully-covered, fully-picked brief with a valid archetype must be accepted: ' + done1.stderr)
  assert.match(done1.stdout, /state: DECIDE/, 'D1: a non-tournament archetype (data-ml) must derive straight to DECIDE, unchanged from before this spec — a FINALISTS print here means every non-tournament project now gets routed into a race it never asked for')
  assert.strictEqual(fs.existsSync(path.join(dataMl, '.claude/genesis/tournament')), false, 'D1: a non-tournament archetype must never create .claude/genesis/tournament/ — its existence would mean race bookkeeping was set up for a project that will never run one')

  const backend = tmpdir('tourn-ac1-backend')
  advanceToMenusReady(backend, 'backend-api')
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

// specs/20260902/08-genesis-shrink-brief-state.md D2: the archetype gate this AC pinned at
// menus-done is RELOCATED to discovery-done ("moved here from menus-done, which SHALL CONTINUE
// TO accept it when already present") — the missing-line and valid-archetype-recorded cases are
// now AC-20260902-08-3's own pins in tests/genesis/brief-state.test.js. The one assertion that
// still belongs to this file's tournament-archetype-registry concern — an unknown value being
// refused by name, with a real key offered — is retargeted in place to the mark that now performs
// it, never weakened, never left orphan-red at its old location.
test('AC-20260902-08-3 (regression, retargeted from AC-20260827-01-2): discovery-done refuses an archetype value outside the eight registry keys by naming the bad value and a real key', () => {
  const bogus = tmpdir('tourn-ac2-bogus')
  bare(bogus)
  writeBrief(bogus, { picks: ['- archetype: bogus'] })
  const r2 = mark(bogus, 'discovery-done')
  assert.strictEqual(r2.status, 2, 'D2: an archetype value outside the eight registry keys must be refused at discovery-done, the gate\'s new home — accepting it would let a typo silently become the project\'s permanent, load-bearing archetype: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /bogus/, 'the refusal must name the offending value "bogus" so the session knows what it wrote was rejected, not just that something was wrong')
  assert.match(r2.stderr, /web-app/, 'the refusal must name at least one real registry key (e.g. web-app) so the session has the actual eight-key vocabulary in front of it instead of having to go look up the registry table')
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
