'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const fx = require('./wireframe-fixtures')

// specs/20261002/01-the-wireframe-command-runs-over-the-service.md — AC-20261002-01-1 through -4,
// -12 and -13 (D1, D2, D4, D10, D11): the three derived states, terminal mode, the freshness
// rule, retired verbs, unknown commands, old status files, and the step blocks' doctrine lines.

const PAST_APPROVED = '2026-09-30T10:00:00.000Z'
const PAST_FINAL = '2026-10-01T00:00:00.000Z'
const DEAD_URL = 'http://127.0.0.1:1'

function lines(text) { return text.split('\n').filter((l) => l.trim() !== '') }

// The two-line tail every accepted mark keeps: the ledger's counts line, then the checkpoint line.
function assertTail(r, transition, what) {
  const out = lines(r.stdout)
  assert.match(out[out.length - 2] || '', /^📒 ledger:/, what + ': the second-to-last line must be the ledger counts line — the checkpoint contract is how a session learns disk is the source of truth: ' + r.stdout)
  assert.ok((out[out.length - 1] || '').includes('(' + transition + ')'),
    what + ': the last line must be the checkpoint line naming (' + transition + ') — without it the session cannot tell the mark moved the state: ' + r.stdout)
}

test('AC-20261002-01-1: a bare run on a root with no design/mocks/ exits 0, writes a schemaVersion 3 SEED status with no app key plus seed.md and ledger.md, and prints a SEED block with no scaffold, install or copy line; --state prints SEED', () => {
  const root = tmpdir('wireframe-cold')
  const r = fx.runDriver(root, [])
  assert.strictEqual(r.status, 0, 'a cold root must be bootstrapped, not refused — the first /spec:mocks on a project would stop dead: ' + r.stderr)
  const status = fx.readStatus(root)
  assert.strictEqual(status.schemaVersion, 3, 'the status file must be written as schemaVersion 3 — any other version is refused by the next run')
  assert.strictEqual(status.state, 'SEED', 'a cold root starts at SEED')
  assert.deepStrictEqual(status.marks, { seedDone: null, approved: null }, 'the marks object must hold exactly seedDone and approved, both null — a stale shellDrawn/themePicked key means the retired steps are still derived')
  assert.deepStrictEqual(status.journeys, {}, 'a cold root has recorded no journey')
  assert.strictEqual(status.pushed, null, 'nothing has been pushed on a cold root')
  assert.ok(!('app' in status), 'the status file must carry no app key — the mock app is gone and a key naming it sends genesis to a directory that does not exist')
  assert.ok(fs.existsSync(path.join(root, 'design/mocks/seed.md')), 'the seed must be created from its template on a cold root — the session has nothing to write into otherwise')
  assert.ok(fs.existsSync(path.join(root, 'design/mocks/ledger.md')), 'the ledger must be created from its template on a cold root — every later gate reads it')
  assert.ok(lines(r.stdout)[0].startsWith('[mocks-driver] state: SEED'), 'the first printed line must name the SEED state: ' + r.stdout)
  assert.ok(r.stdout.includes('design/mocks/seed.md') && r.stdout.includes('--mark seed-done'), 'the SEED block must name the seed file and the seed-done mark — without them the session does not know what to write or how to close the step: ' + r.stdout)
  for (const banned of ['npx', 'npm i', 'cp ', 'mock.config']) {
    assert.ok(!r.stdout.includes(banned), 'the SEED block must not contain "' + banned + '" — a scaffold, install or copy line sends the session to build the retired mock app: ' + r.stdout)
  }
  const st = fx.runDriver(root, ['--state'])
  assert.strictEqual(st.status, 0, '--state must exit 0 on a SEED root: ' + st.stderr)
  assert.strictEqual(st.stdout.trim(), 'SEED', '--state must print exactly SEED — scripts that read the state compare the whole word: ' + st.stdout)
})

test('AC-20261002-01-2: --mark seed-done accepts a two-journey seed with no Records section, no app and no config, and refuses an empty seed, a malformed line, a beatless journey and an open ledger row without recording', () => {
  const ok = fx.makeRoot()
  fx.writeStatus(ok, { state: 'SEED', marks: { seedDone: null, approved: null } })
  const accepted = fx.runDriver(ok, ['--mark', 'seed-done'])
  assert.strictEqual(accepted.status, 0, 'a seed holding the two journey blocks must be accepted with no app directory, config file or Records section — the mock app is gone, so requiring any of them strands every host: ' + accepted.stderr)
  assert.strictEqual(lines(accepted.stdout)[0], '✅ seed-done recorded', 'the first printed line must be the seed-done sentence: ' + accepted.stdout)
  assertTail(accepted, 'SEED → SCREENS', 'seed-done')
  assert.ok(fx.readStatus(ok).marks.seedDone, 'an accepted seed-done must store marks.seedDone')

  const refusals = [
    ['a seed declaring no journey', { seed: { noJourneys: true } }, [/declares no journeys/]],
    ['an unquoted beat line', { seed: { unquoted: true } }, [/owner-onboarding/, /malformed/]],
    ['a journey with a persona and no beat', { seed: { teamBeats: false } }, [/team-invite/, /declares zero beats/]],
    ['an open invented ledger row', { rows: ['| A1 | SEED | product | x | invented | open | - | - | - |'] }, [/A1/]],
  ]
  for (const [label, opts, patterns] of refusals) {
    const root = fx.makeRoot(opts)
    fx.writeStatus(root, { state: 'SEED', marks: { seedDone: null, approved: null } })
    const r = fx.runDriver(root, ['--mark', 'seed-done'])
    assert.strictEqual(r.status, 2, 'seed-done must refuse ' + label + ' — accepting it hands the next step a seed it cannot draw from: ' + r.stdout + r.stderr)
    for (const p of patterns) assert.match(r.stderr, p, 'the refusal for ' + label + ' must match ' + p + ' so the session knows what to fix: ' + r.stderr)
    assert.strictEqual(fx.readStatus(root).marks.seedDone, null, 'a refused seed-done must leave marks.seedDone null (' + label + ') — a recorded mark over a bad seed is never re-asked')
  }
})

test('AC-20261002-01-3: with no walkthrough block (absent key or the string "yes") the SCREENS block asks for the terminal confirm, nothing is drawn or sent, --waive is refused, and a terminal-approved wireframe reaches APPROVED without design/rounds or design/mocks/screens', () => {
  for (const [label, opts] of [['a config with no walkthrough key', { block: false }], ['a walkthrough value of "yes"', { block: 'yes' }]]) {
    const root = fx.makeRoot(opts)
    fx.writeStatus(root)
    const r = fx.runDriver(root, [])
    assert.strictEqual(r.status, 0, 'a bare run in SCREENS must print the step for ' + label + ': ' + r.stderr)
    for (const needle of ['confirm journey owner-onboarding in the terminal', fx.PERSONA, '1. "I open the invitation"', '2. "I check who is on my team"',
      '3. "I see nobody is listed yet"', '4. "I read what happens next"', '--mark journey-approved --journey owner-onboarding']) {
      assert.ok(r.stdout.includes(needle), 'the terminal block for ' + label + ' must contain "' + needle + '" — the session shows the client\'s own sentences and needs the mark to close the step: ' + r.stdout)
    }
    assert.ok(!/^Skill:/m.test(r.stdout), 'the terminal block must carry no Skill line — nothing is drawn, so loading the drawing skill wastes the session\'s read budget: ' + r.stdout)
  }

  const root = fx.makeRoot({ block: false })
  fx.writeStatus(root)
  for (const args of [['--mark', 'journey-drawn', '--journey', 'owner-onboarding'], ['round', 'push'], ['round', 'pull']]) {
    const r = fx.runDriver(root, args)
    assert.strictEqual(r.status, 2, args.join(' ') + ' must refuse in terminal mode — drawing or sending with no service block is the retired flow: ' + r.stdout)
    assert.match(r.stderr, /no walkthrough block/, args.join(' ') + ' must name "no walkthrough block" so the session knows why: ' + r.stderr)
  }
  const waive = fx.runDriver(root, ['--mark', 'journey-approved', '--journey', 'owner-onboarding', '--waive', '--reason', 'x'])
  assert.strictEqual(waive.status, 2, '--waive must be refused in terminal mode — the waiver is the escape for an absent client, and terminal mode has none')
  assert.match(waive.stderr, /--waive is for a project that uses the service/, 'the waive refusal must say why: ' + waive.stderr)

  const approve = fx.runDriver(root, ['--mark', 'journey-approved', '--journey', 'owner-onboarding'])
  assert.strictEqual(approve.status, 0, 'a terminal approval must be accepted: ' + approve.stderr)
  assert.ok(approve.stdout.includes('✅ journey-approved recorded for owner-onboarding (confirmed in the terminal)'), 'the success sentence must name the terminal confirm: ' + approve.stdout)
  const entry = fx.readStatus(root).journeys['owner-onboarding']
  assert.ok(entry && entry.drawn === null && entry.beats === fx.H_OWNER && entry.by === 'terminal',
    'a terminal approval must store drawn null, the current story hash and by "terminal" — anything else misreports who confirmed: ' + JSON.stringify(entry))
  assert.strictEqual(fx.runDriver(root, ['--mark', 'journey-approved', '--journey', 'team-invite']).status, 0, 'team-invite must be approvable the same way')
  const closed = fx.runDriver(root, ['--mark', 'approved'])
  assert.strictEqual(closed.status, 0, '--mark approved must close a terminal-approved wireframe with no round on disk: ' + closed.stderr)
  assert.strictEqual(fx.runDriver(root, ['--state']).stdout.trim(), 'APPROVED', '--state must print APPROVED once the final mark is recorded')
  assert.ok(fx.runDriver(root, []).stdout.includes('the wireframe is approved — nothing further to do.'), 'a bare run on an APPROVED root must say there is nothing further to do')
  assert.ok(!fs.existsSync(path.join(root, 'design/rounds')), 'terminal mode must never create design/rounds/ — it sends and pulls nothing')
  assert.ok(!fs.existsSync(path.join(root, 'design/mocks/screens')), 'terminal mode must never create design/mocks/screens/ — it draws nothing')
})

test('AC-20261002-01-4: a seed edit reopens its journey, a re-approval newer than the final mark still needs the final mark, and removing every journey returns to SEED', () => {
  const root = fx.makeRoot({ block: false })
  fx.writeStatus(root, {
    state: 'APPROVED',
    marks: { seedDone: fx.T, approved: PAST_FINAL },
    journeys: {
      'owner-onboarding': fx.journeyEntry({ drawn: null, approved: PAST_APPROVED, by: 'terminal' }),
      'team-invite': fx.journeyEntry({ drawn: null, approved: PAST_APPROVED, beats: fx.H_TEAM, by: 'terminal' }),
    },
  })
  assert.strictEqual(fx.runDriver(root, ['--state']).stdout.trim(), 'APPROVED', 'test setup requires the unedited, fully approved root to derive APPROVED')

  fx.writeSeed(root, { beat2: 'I check who is on my clinic team' })
  assert.strictEqual(fx.runDriver(root, ['--state']).stdout.trim(), 'SCREENS', 'editing a beat changes the story hash, so --state must fall back to SCREENS — a mark is never trusted over the artifact it closed')
  assert.ok(fx.runDriver(root, []).stdout.includes('confirm journey owner-onboarding'), 'a bare run must ask for owner-onboarding to be confirmed again')

  const again = fx.runDriver(root, ['--mark', 'journey-approved', '--journey', 'owner-onboarding'])
  assert.strictEqual(again.status, 0, 're-approving the edited story must be accepted: ' + again.stderr)
  assert.strictEqual(fx.readStatus(root).journeys['owner-onboarding'].beats, fx.H_OWNER_EDITED, 'the re-approval must store the edited story\'s hash')
  assert.strictEqual(fx.runDriver(root, ['--state']).stdout.trim(), 'SCREENS',
    'a journey approved after marks.approved must keep the state at SCREENS — otherwise a re-confirmed story skips the final checks')
  assert.ok(fx.runDriver(root, []).stdout.includes('close the wireframe'), 'a bare run must ask to close the wireframe once every journey is approved again')

  const closed = fx.runDriver(root, ['--mark', 'approved'])
  assert.strictEqual(closed.status, 0, '--mark approved must be accepted after the re-approval: ' + closed.stderr)
  assert.strictEqual(fx.runDriver(root, ['--state']).stdout.trim(), 'APPROVED', 'the final mark must restore APPROVED')

  fx.writeSeed(root, { noJourneys: true })
  assert.strictEqual(fx.runDriver(root, ['--state']).stdout.trim(), 'SEED', 'a seed that declares no journey must demand the seed again — SEED, never APPROVED over nothing')
})

test('AC-20261002-01-12: --reopen journey:<j> on an APPROVED service-mode root clears the approval, the final mark and the digest, keeps the round number, appends one reopens row and deletes no file', () => {
  const reopenRoot = fx.makeRoot({ block: 'http://127.0.0.1:1' })
  fx.writeScreens(reopenRoot)
  fx.writeStatus(reopenRoot, {
    state: 'APPROVED', marks: { seedDone: fx.T, approved: PAST_FINAL }, pushed: { round: 2, digest: fx.DIGEST },
    journeys: {
      'owner-onboarding': fx.journeyEntry({ approved: PAST_APPROVED }),
      'team-invite': fx.journeyEntry({ approved: PAST_APPROVED, beats: fx.H_TEAM }),
    },
  })
  fx.writeRound(reopenRoot, 1)
  fx.writeRound(reopenRoot, 2)
  const before = fx.filesUnder(path.join(reopenRoot, 'design/rounds')).sort()
  const re = fx.runDriver(reopenRoot, ['--reopen', 'journey:owner-onboarding'])
  assert.strictEqual(re.status, 0, '--reopen journey:<j> must be accepted: ' + re.stderr)
  assert.ok(lines(re.stdout).some((l) => l.startsWith('↩ reopened journey:owner-onboarding')), 'the reopen must print a line starting "↩ reopened journey:owner-onboarding": ' + re.stdout)
  const reopened = fx.readStatus(reopenRoot)
  assert.strictEqual(reopened.journeys['owner-onboarding'].approved, null, 'the reopened journey\'s approved must be cleared')
  assert.strictEqual(reopened.marks.approved, null, 'marks.approved must be cleared — the final checks must run again')
  assert.deepStrictEqual(reopened.pushed, { round: 2, digest: null }, 'pushed.digest must be cleared and pushed.round kept — a cleared digest is what lets the next push open a fresh round')
  assert.strictEqual(reopened.reopens.length, 1, 'one reopens row must be appended')
  assert.deepStrictEqual(fx.filesUnder(path.join(reopenRoot, 'design/rounds')).sort(), before, 'a reopen must delete no file — rounds are the record of what the client saw')
})

test('AC-20261002-01-12: the next round push after a reopen sends round 3 when design/rounds holds folders 1 and 2', async (t) => {
  const stub = await fx.startStub(t, { [fx.KEY.push]: [fx.pushedAnswer(3)] })
  const root = fx.makeRoot({ block: stub.url })
  fx.writeScreens(root)
  fx.writeStatus(root, {
    state: 'SCREENS', pushed: { round: 2, digest: null },
    journeys: {
      'owner-onboarding': fx.journeyEntry({ approved: null }),
      'team-invite': fx.journeyEntry({ approved: PAST_APPROVED, beats: fx.H_TEAM }),
    },
  })
  fx.writeRound(root, 1)
  fx.writeRound(root, 2)
  const push = fx.runDriver(root, ['round', 'push'])
  assert.strictEqual(push.status, 0, 'a push after a reopen must be accepted: ' + push.stderr)
  const post = stub.log().find((l) => l.method === 'POST')
  assert.ok(post && post.json && post.json.round === 3, 'the round after folders 1 and 2 must be numbered 3 — a stale digest that skipped the send would leave the client looking at the old round: ' + JSON.stringify(post))
})

test('AC-20261002-01-12: every retired verb refuses at exit 2 with its own one-line replacement and leaves status.json byte-identical', () => {
  const root = fx.makeRoot({ block: false })
  fx.writeStatus(root)
  const before = fs.readFileSync(fx.statusPath(root), 'utf8')
  const cases = [
    [['--mark', 'shell-drawn'], '--mark shell-drawn is retired — the wireframe has no shell step (ADR-0030)'],
    [['--mark', 'theme-picked'], '--mark theme-picked is retired — the wireframe has no theme step (ADR-0030)'],
    [['--reopen', 'shell'], '--reopen shell is retired — the wireframe has no shell step (ADR-0030)'],
    [['--reopen', 'theme'], '--reopen theme is retired — the wireframe has no theme step (ADR-0030)'],
    [['client', 'open'], 'client open is retired — remedy: round push (it prints the link)'],
    [['client', 'waive', '--journey', 'x', '--reason', 'y'], 'client waive is retired — remedy: --mark journey-approved --journey <j> --waive --reason <r>'],
  ]
  for (const [args, line] of cases) {
    const r = fx.runDriver(root, args)
    assert.strictEqual(r.status, 2, args.join(' ') + ' must refuse at exit 2 — a session following an old doc must be told the verb is gone: ' + r.stdout)
    assert.ok(r.stderr.includes('mocks-driver: ' + line), args.join(' ') + ' must print its own replacement line "' + line + '": ' + r.stderr)
    assert.strictEqual(fs.readFileSync(fx.statusPath(root), 'utf8'), before, args.join(' ') + ' must leave status.json byte-identical — a retired verb refuses before any file is read or written')
  }
  for (const word of ['notes', 'look']) {
    const r = fx.runDriver(root, [word])
    assert.strictEqual(r.status, 2, 'the unknown command "' + word + '" must refuse at exit 2 — falling through to a bare run hides the mistake')
    assert.ok(r.stderr.includes('unknown command "' + word + '"'), 'the refusal must name the unknown command "' + word + '": ' + r.stderr)
    assert.ok(!r.stdout.includes('[mocks-driver] state:'), 'an unknown command must print no step block — the session would act on a step it never asked for: ' + r.stdout)
  }
})

test('AC-20261002-01-12: an old-shape status file refuses every command but ledger, and an old APPROVED one stays readable and byte-identical', () => {
  for (const [version, state] of [[2, 'SCREENS'], [1, 'WIREFRAMES']]) {
    const root = fx.makeRoot({ block: false })
    fx.writeJson(fx.statusPath(root), { schemaVersion: version, state, marks: { seedDone: fx.T }, journeys: {}, reopens: [] })
    for (const args of [[], ['--state'], ['--mark', 'seed-done']]) {
      const r = fx.runDriver(root, args)
      assert.strictEqual(r.status, 2, 'schemaVersion ' + version + ' ' + state + ' must refuse "' + args.join(' ') + '" — reinterpreting a retired flow\'s file corrupts it: ' + r.stdout)
      assert.match(r.stderr, new RegExp('schemaVersion ' + version), 'the refusal must name the version found: ' + r.stderr)
      assert.ok(r.stderr.includes('rm design/mocks/status.json'), 'the refusal must name its remedy, rm design/mocks/status.json: ' + r.stderr)
    }
    assert.strictEqual(fx.runDriver(root, ['ledger', 'counts']).status, 0, 'ledger counts must keep working on an old-shape root — the ledger is a plain text file this spec does not change')
  }

  const root = fx.makeRoot({ block: false })
  fx.writeJson(fx.statusPath(root), { schemaVersion: 2, state: 'APPROVED', app: 'app', marks: { seedDone: fx.T, shellDrawn: fx.T, themePicked: fx.T, approved: fx.T }, journeys: {}, reopens: [] })
  const before = fs.readFileSync(fx.statusPath(root), 'utf8')
  const st = fx.runDriver(root, ['--state'])
  assert.strictEqual(st.stdout.trim(), 'APPROVED', '--state must print the old file\'s APPROVED — genesis still reads one host approved under the retired flow: ' + st.stderr)
  const bare = fx.runDriver(root, [])
  assert.strictEqual(bare.status, 0, 'a bare run on an old APPROVED root must exit 0: ' + bare.stderr)
  assert.ok(bare.stdout.includes('approved under the retired mock-app flow'), 'the bare run must say the record is from the retired flow: ' + bare.stdout)
  const mark = fx.runDriver(root, ['--mark', 'approved'])
  assert.strictEqual(mark.status, 2, '--mark approved must refuse on an old-shape root — a write would corrupt the one surviving record')
  assert.strictEqual(fs.readFileSync(fx.statusPath(root), 'utf8'), before, 'the old file must stay byte-identical after all three commands — deleting its record would be data loss')
})

test('AC-20261002-01-13: each of the five step blocks names a Doctrine heading that exists in doctrine, and the draw, confirm, close and skip-the-finished-journey rules hold', () => {
  const T1 = fx.journeyEntry()
  const situations = [
    ['SEED', () => { const r = fx.makeRoot({ block: false }); fx.writeStatus(r, { state: 'SEED', marks: { seedDone: null, approved: null } }); return r }],
    ['SCREENS service mode with an undrawn journey', () => { const r = fx.makeRoot({ block: DEAD_URL }); fx.writeStatus(r); return r }],
    ['SCREENS service mode with every journey drawn', () => {
      const r = fx.makeRoot({ block: DEAD_URL })
      fx.writeStatus(r, { journeys: { 'owner-onboarding': { ...T1, approved: null }, 'team-invite': { ...T1, approved: null, beats: fx.H_TEAM } } })
      return r
    }],
    ['SCREENS terminal mode', () => { const r = fx.makeRoot({ block: false }); fx.writeStatus(r); return r }],
    ['SCREENS with every journey approved', () => {
      const r = fx.makeRoot({ block: DEAD_URL })
      fx.writeStatus(r, { journeys: { 'owner-onboarding': T1, 'team-invite': { ...T1, beats: fx.H_TEAM } } })
      return r
    }],
  ]
  const printed = {}
  for (const [label, build] of situations) {
    const r = fx.runDriver(build(), [])
    assert.strictEqual(r.status, 0, 'a bare run in ' + label + ' must exit 0: ' + r.stderr)
    printed[label] = r.stdout
    const m = /^Doctrine: spec\/doctrine\/mocks\.md § Mocks: (.+)$/m.exec(r.stdout)
    assert.ok(m, 'the ' + label + ' block must carry a "Doctrine: spec/doctrine/mocks.md § Mocks: <name>" line — it is how the session finds the rules for the step: ' + r.stdout)
    const served = fx.sharedMocks(m[1].trim()).split('\n')
    assert.ok(served.includes('## Mocks: ' + m[1].trim()),
      'the ' + label + ' block cites "' + m[1] + '" but spec-paths shared-mocks serves no such section — the session would read an empty slice: ' + served.slice(0, 3).join(' | '))
  }
  const undrawn = printed['SCREENS service mode with an undrawn journey']
  assert.ok(undrawn.includes('Skill: mock-authoring — load it before the first edit'), 'the draw block must carry the skill line — drawing without it breaks the five drawing rules')
  assert.ok(undrawn.includes('--mark journey-drawn --journey owner-onboarding'), 'the draw block must name the mark that closes the step: ' + undrawn)
  const drawn = printed['SCREENS service mode with every journey drawn']
  for (const needle of ['round push', 'round pull', '--mark journey-approved --journey owner-onboarding']) {
    assert.ok(drawn.includes(needle), 'the confirm block must name "' + needle + '": ' + drawn)
  }
  assert.ok(!/^Skill:/m.test(drawn), 'the confirm block must carry no Skill line — nothing is drawn at that step')
  const closing = printed['SCREENS with every journey approved']
  assert.ok(closing.includes('close the wireframe') && closing.includes('--mark approved'), 'the closing block must say "close the wireframe" and name --mark approved: ' + closing)

  const skip = fx.makeRoot({ block: DEAD_URL })
  fx.writeStatus(skip, { journeys: { 'owner-onboarding': { ...T1, drawn: null } } })
  const next = fx.runDriver(skip, []).stdout
  assert.ok(next.includes('draw journey team-invite'), 'an approved journey is finished, so the draw block must move to team-invite: ' + next)
  assert.ok(!next.includes('draw journey owner-onboarding'), 'the draw block must never ask to redraw a journey already approved on the current story: ' + next)
})
