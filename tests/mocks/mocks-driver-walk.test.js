'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS,
  bare, mark, stateOf, statusJson,
  writeFile, decideLook, writeWireframe,
  advanceToSeedDone, advanceToCanonWritten, advanceToJourneyApproved, advanceToThemePicked, advanceToApproved,
} = require('./mocks-driver-fixtures')

// specs/20260907/08-walk-critic.md D1/D2/D6/D7. `deriveState`'s WALK step, `allJourneysWalked`,
// `handleJourneyWalked`, `--reopen walk:<j>`, and `printWalkStep` do not exist yet on
// spec/scripts/mocks-driver.js — every test below is red until D1/D2/D6/D7 land. Split out from
// mocks-driver-2/3.test.js per this spec's own orchestrator duty (specs/20260903/07's per-file
// 45s budget guard): WALK's own arms land here rather than growing either of the two largest
// driver files.

// ---------------------------------------------------------------------------
// AC-20260907-08-1
// ---------------------------------------------------------------------------
test('AC-20260907-10-1 (setup assertion retag of AC-20260907-08-1): a seed that declares a new journey after the others were walked derives WALK again, even though the state had already reached CLIENT', () => {
  const dir = tmpdir('mocks-driver-walk')
  advanceToThemePicked(dir)
  assert.strictEqual(stateOf(dir).stdout.trim(), 'CLIENT',
    'test setup requires the only declared journey to be walked, the theme picked, and the state to already read CLIENT, or the "derives WALK again" assertion below is vacuous')

  const seedPath = path.join(dir, 'design/mocks/seed.md')
  const seedText = fs.readFileSync(seedPath, 'utf8')
  const secondJourney = '\n### second-journey\nA second persona moves through a second short flow.\n```surfaces\nsecond-a -> second-b\n```\n\n'
  assert.ok(seedText.includes('## Dense screen'), 'test setup requires seed.md to still carry "## Dense screen" to anchor the new journey insertion')
  fs.writeFileSync(seedPath, seedText.replace('## Dense screen', secondJourney + '## Dense screen'))

  writeWireframe(dir, 'second-a', { to: 'second-b' })
  writeWireframe(dir, 'second-b')
  const drawn = mark(dir, 'journey-drawn', ['--journey', 'second-journey'])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted for the newly declared journey: ' + drawn.stdout + drawn.stderr)
  decideLook(dir, 'journey-approved:second-journey', 'approve', { by: 'jj' })
  const approved = mark(dir, 'journey-approved', ['--journey', 'second-journey'])
  assert.strictEqual(approved.status, 0, 'test setup requires journey-approved to be accepted for the newly declared journey: ' + approved.stdout + approved.stderr)

  const s = stateOf(dir)
  assert.strictEqual(s.stdout.trim(), 'WALK',
    'AC-20260907-08-1: a seed declaring a journey added after the others were walked must derive WALK again — not every declared journey carries walked: ' + s.stdout + s.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260907-08-2
// ---------------------------------------------------------------------------
test('AC-20260907-08-2: --mark journey-walked refuses with no --journey, an undeclared journey, a journey whose approved is unset (naming journey-approved --journey), and an open walk finding on the journey (naming each id and the notes address remedy), then records journeys[j].walked and prints the checkpoint tail once accepted', () => {
  const dir = tmpdir('mocks-driver-walk-2')
  advanceToJourneyApproved(dir)

  const noJourney = mark(dir, 'journey-walked')
  assert.strictEqual(noJourney.status, 2, 'D2: --mark journey-walked with no --journey must exit 2: ' + noJourney.stdout + noJourney.stderr)

  const undeclared = mark(dir, 'journey-walked', ['--journey', 'nowhere'])
  assert.strictEqual(undeclared.status, 2, 'D2: --mark journey-walked --journey nowhere (not declared in seed.md) must exit 2: ' + undeclared.stdout + undeclared.stderr)

  const dirUnapproved = tmpdir('mocks-driver-walk-unapproved')
  advanceToCanonWritten(dirUnapproved)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dirUnapproved, LABELS[i], { to: LABELS[i + 1] })
  const drawnOnly = mark(dirUnapproved, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawnOnly.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawnOnly.stdout + drawnOnly.stderr)
  const unapproved = mark(dirUnapproved, 'journey-walked', ['--journey', JOURNEY])
  assert.strictEqual(unapproved.status, 2, 'D2: --mark journey-walked while journeys[j].approved is unset must exit 2: ' + unapproved.stdout + unapproved.stderr)
  assert.match(unapproved.stdout + unapproved.stderr, /journey-approved --journey/,
    'D2: the unapproved-journey refusal must name the remedy "journey-approved --journey <j>": ' + unapproved.stdout + unapproved.stderr)

  const dirOpenFinding = tmpdir('mocks-driver-walk-openfinding')
  advanceToJourneyApproved(dirOpenFinding)
  const walkNote = (id, screen) => ({
    id, scope: 'mock', screen, state: 'error', text: 'no way back', by: 'walk-critic',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    kind: 'walk', reason: 'no-path-back',
  })
  writeFile(path.join(dirOpenFinding, 'design/mocks/notes.json'), JSON.stringify([walkNote('N003', LABELS[0]), walkNote('N004', LABELS[1])]))
  const blocked = mark(dirOpenFinding, 'journey-walked', ['--journey', JOURNEY])
  assert.strictEqual(blocked.status, 2, 'D2: --mark journey-walked must refuse while an open kind:"walk" note is anchored to one of the journey\'s declared labels: ' + blocked.stdout + blocked.stderr)
  assert.match(blocked.stdout + blocked.stderr, new RegExp('walk finding\\(s\\) still open on ' + JOURNEY + ': N003, N004'),
    'D2: the refusal must carry the exact "walk finding(s) still open on <j>: N003, N004" prefix: ' + blocked.stdout + blocked.stderr)
  assert.match(blocked.stdout + blocked.stderr, /notes address --id <id> --change/,
    'D2: the refusal must name the "notes address --id <id> --change" remedy: ' + blocked.stdout + blocked.stderr)

  writeFile(path.join(dirOpenFinding, 'design/mocks/notes.json'), JSON.stringify([]))
  const accepted = mark(dirOpenFinding, 'journey-walked', ['--journey', JOURNEY])
  assert.strictEqual(accepted.status, 0, 'D2: --mark journey-walked must be accepted once no open walk finding is anchored to the journey and its approved mark is set: ' + accepted.stdout + accepted.stderr)
  assert.match(accepted.stdout, /checkpoint/, 'D1: an accepted journey-walked mark must print the D1 checkpoint tail: ' + accepted.stdout)
  assert.ok(statusJson(dirOpenFinding).journeys[JOURNEY].walked,
    'an accepted journey-walked mark must record journeys[j].walked: ' + JSON.stringify(statusJson(dirOpenFinding).journeys))
})

// ---------------------------------------------------------------------------
// AC-20260907-08-3
// ---------------------------------------------------------------------------
test('AC-20260907-08-3: --mark <unknown> names "journey-walked" in the known-mark list, in chain position directly after "journey-approved"', () => {
  const dir = tmpdir('mocks-driver-walk-3')
  advanceToSeedDone(dir)
  const r = mark(dir, 'bogus-mark')
  assert.strictEqual(r.status, 2, 'an unrecognized --mark value must exit 2: ' + r.stdout + r.stderr)
  const msg = r.stdout + r.stderr
  assert.match(msg, /unknown mark/, 'the refusal must say "unknown mark": ' + msg)
  const approvedIdx = msg.indexOf('journey-approved')
  assert.ok(approvedIdx > -1, 'the known-mark list must name "journey-approved": ' + msg)
  const walkedIdx = msg.indexOf('journey-walked', approvedIdx)
  assert.ok(walkedIdx > approvedIdx,
    'D2: "journey-walked" must appear in the known-mark list directly after "journey-approved" (chain position): ' + msg)
})

// ---------------------------------------------------------------------------
// AC-20260907-08-8
// ---------------------------------------------------------------------------
test('AC-20260907-08-8: --reopen walk:<j> clears that journey\'s walked, marks.approved and decider while leaving journeys[*].approved untouched and prints the exact invalidated line; --reopen journey:<j> additionally clears walked and names walk:<j>; --reopen shapes clears every walked and names walk(all); an unknown target exits 2 with the exact live target list', () => {
  const dir = tmpdir('mocks-driver-walk-8a')
  advanceToApproved(dir)
  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'walk:' + JOURNEY])
  assert.strictEqual(r.status, 0, '--reopen walk:<j> must exit 0 on an approved+walked root: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout, '↩ reopened walk:' + JOURNEY + ' — invalidated: walk:' + JOURNEY + ', approved(all)\n',
    'D6: the reopen output must be the exact invalidated line: ' + JSON.stringify(r.stdout))
  const status = statusJson(dir)
  assert.strictEqual(status.journeys[JOURNEY].walked, null, '--reopen walk:<j> must clear that journey\'s walked: ' + JSON.stringify(status.journeys))
  assert.strictEqual(status.marks.approved, null, '--reopen walk:<j> must clear marks.approved: ' + JSON.stringify(status.marks))
  assert.strictEqual(status.decider, null, '--reopen walk:<j> must clear decider: ' + JSON.stringify({ decider: status.decider }))
  assert.ok(status.journeys[JOURNEY].approved, '--reopen walk:<j> must leave journeys[j].approved untouched: ' + JSON.stringify(status.journeys))

  const dir2 = tmpdir('mocks-driver-walk-8b')
  advanceToApproved(dir2)
  const r2 = runNode(SCRIPT, ['--root', dir2, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(r2.status, 0, '--reopen journey:<j> must exit 0 on an approved+walked root: ' + r2.stdout + r2.stderr)
  assert.match(r2.stdout, /walk:/, 'D6: --reopen journey:<j> must additionally name walk:<j> among the invalidated targets: ' + r2.stdout)
  const status2 = statusJson(dir2)
  assert.strictEqual(status2.journeys[JOURNEY].walked, null, '--reopen journey:<j> must additionally clear that journey\'s walked: ' + JSON.stringify(status2.journeys))

  const dir3 = tmpdir('mocks-driver-walk-8c')
  advanceToApproved(dir3)
  const r3 = runNode(SCRIPT, ['--root', dir3, '--reopen', 'shapes'])
  assert.strictEqual(r3.status, 0, '--reopen shapes must exit 0 on an approved+walked root: ' + r3.stdout + r3.stderr)
  assert.match(r3.stdout, /walk\(all\)/, 'D6: --reopen shapes must additionally name walk(all) among the invalidated targets: ' + r3.stdout)
  const status3 = statusJson(dir3)
  assert.strictEqual(status3.journeys[JOURNEY].walked, null, '--reopen shapes must clear every journey\'s walked: ' + JSON.stringify(status3.journeys))

  const dir4 = tmpdir('mocks-driver-walk-8d')
  advanceToSeedDone(dir4)
  const r4 = runNode(SCRIPT, ['--root', dir4, '--reopen', 'bogus'])
  assert.strictEqual(r4.status, 2, 'an unknown --reopen target must exit 2: ' + r4.stdout + r4.stderr)
  assert.strictEqual((r4.stderr + r4.stdout).trim(), 'mocks-driver: --reopen must be journey:<j>, walk:<j>, shapes, kit, or theme',
    'D6/D3 (specs/20260910/04-theme-before-the-client-walk.md, ADR-0013): the refusal must be the exact live target list, with "walk:<j>" and "theme" both in it (theme reinstated as a live --reopen target): ' + JSON.stringify({ stdout: r4.stdout, stderr: r4.stderr }))
})

// ---------------------------------------------------------------------------
// AC-20260907-08-9
// ---------------------------------------------------------------------------
test('AC-20260907-08-9: the bare driver in WALK prints the exact step heading, a walked: <n>/<N> progress line, and Then: lines naming the design-critic dispatch, "notes add --kind walk", and "--mark journey-walked --journey <j>"', () => {
  const dir = tmpdir('mocks-driver-walk-9')
  advanceToJourneyApproved(dir) // approved but not walked -> derives WALK
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation at WALK must exit 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, new RegExp('## Step: walk journey ' + JOURNEY + ' — one fresh critic, flow breaks only'),
    'D7: the WALK block must open with the exact D7 heading naming the journey: ' + r.stdout)
  assert.match(r.stdout, /walked: 0\/1/,
    'D7: the WALK block must print a "walked: <n>/<N>" progress line — 0 of 1 declared journeys walked: ' + r.stdout)
  const thenIdx = r.stdout.indexOf('Then:')
  assert.ok(thenIdx > -1, 'the WALK block must carry a "Then:" block: ' + r.stdout)
  const thenBlock = r.stdout.slice(thenIdx)
  assert.match(thenBlock, /design-critic/,
    'D7: the Then: block must name the design-critic dispatch: ' + thenBlock)
  assert.match(thenBlock, /notes add[\s\S]*--kind walk/,
    'D7: the Then: block must name a "notes add … --kind walk" line: ' + thenBlock)
  assert.match(thenBlock, new RegExp('--mark journey-walked --journey ' + JOURNEY),
    'D7: the Then: block must name "--mark journey-walked --journey ' + JOURNEY + '": ' + thenBlock)
})
