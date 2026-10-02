'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./wireframe-fixtures')

// specs/20261002/01-the-wireframe-command-runs-over-the-service.md — AC-20261002-01-5 and
// AC-20261002-01-6 (D3, D5): --mark journey-drawn checks the screen files and the whole would-be
// round offline, sends nothing, and refuses for every reason the service would refuse later.

const DRAW = (j) => ['--mark', 'journey-drawn', '--journey', j]

// A service-mode host with the four screens, a dotfile beside them, and the blocking ledger row.
async function drawHost(t, over = {}) {
  const stub = await fx.startStub(t, {})
  const root = fx.makeRoot({ block: stub.url, rows: [fx.BLOCKING_ROW], ...over })
  fx.writeStatus(root)
  fx.writeScreens(root)
  fs.writeFileSync(path.join(fx.screensDir(root), '.DS_Store'), 'not json at all')
  return { stub, root }
}

function lineWith(text, ...needles) {
  return text.split('\n').find((l) => needles.every((n) => l.includes(n))) || null
}

function drawnOf(root, j) {
  const e = fx.readStatus(root).journeys[j]
  return e ? e.drawn : null
}

test('AC-20261002-01-5: marking a journey drawn accepts four valid screen files beside a dotfile and a blocking ledger row, stores a drawn time and sends no request', async (t) => {
  const { stub, root } = await drawHost(t)
  const r = fx.runDriver(root, DRAW('owner-onboarding'))
  assert.strictEqual(r.status, 0, 'a drawn journey must be accepted — a stray .DS_Store or an open ledger row must never block the draw mark (the ledger gate belongs to confirmation): ' + r.stderr)
  assert.ok(r.stdout.includes('✅ journey-drawn recorded for owner-onboarding'), 'the success sentence must name the journey: ' + r.stdout)
  assert.ok(drawnOf(root, 'owner-onboarding'), 'an accepted mark must store a drawn time — without it the next step never advances')
  assert.deepStrictEqual(stub.log(), [], 'the draw mark must send no request — a typo must cost nothing and the check is offline')
})

test('AC-20261002-01-5: a missing screen file for a beat refuses naming the beat and the expected path, and records nothing', async (t) => {
  const { root } = await drawHost(t)
  fs.rmSync(path.join(fx.screensDir(root), 'roster-confirm@empty.json'))
  const r = fx.runDriver(root, DRAW('owner-onboarding'))
  assert.strictEqual(r.status, 2, 'a beat whose screen file is absent must refuse — drawing the journey without it would fail the whole round at the service: ' + r.stdout)
  assert.ok(r.stderr.includes('beat 3') && r.stderr.includes('design/mocks/screens/roster-confirm@empty.json'),
    'the refusal must name beat 3 and the exact missing path so the session writes the right file: ' + r.stderr)
  assert.ok(!drawnOf(root, 'owner-onboarding'), 'a refused mark must store no drawn time')
})

test('AC-20261002-01-5: an unknown prop in a screen file refuses with a finding line naming the code, the screen and the prop, then the count line', async (t) => {
  const { stub, root } = await drawHost(t)
  fx.editScreen(root, 'roster-confirm@empty.json', (spec) => { spec.elements.add.props = { lable: 'Add a person' } })
  const r = fx.runDriver(root, DRAW('owner-onboarding'))
  assert.strictEqual(r.status, 2, 'a prop outside the catalog must refuse offline — the service would refuse the whole round later: ' + r.stdout)
  assert.ok(lineWith(r.stderr, 'unknown-prop', 'roster-confirm@empty', 'lable'), 'a finding line must name unknown-prop, roster-confirm@empty and lable: ' + r.stderr)
  assert.ok(lineWith(r.stderr, 'the round has'), 'the refusal must end with the "the round has N finding(s)" line: ' + r.stderr)
  assert.ok(!drawnOf(root, 'owner-onboarding'), 'a refused mark must store no drawn time')
  assert.deepStrictEqual(stub.log(), [], 'a refusal must send no request')
})

test('AC-20261002-01-5: a screen file name outside the grammar, or a file that is not JSON, refuses with a bad-screen-file finding naming the file', async (t) => {
  const named = await drawHost(t)
  fs.copyFileSync(path.join(fx.screensDir(named.root), 'owner-intro.json'), path.join(fx.screensDir(named.root), 'Roster Confirm.json'))
  const a = fx.runDriver(named.root, DRAW('owner-onboarding'))
  assert.strictEqual(a.status, 2, 'a file named "Roster Confirm.json" must refuse — the service reads names as identifiers: ' + a.stdout)
  assert.ok(lineWith(a.stderr, 'bad-screen-file', 'Roster Confirm.json'), 'the finding must name bad-screen-file and the file: ' + a.stderr)

  const broken = await drawHost(t)
  fs.writeFileSync(path.join(fx.screensDir(broken.root), 'owner-intro.json'), '{"root":')
  const b = fx.runDriver(broken.root, DRAW('owner-onboarding'))
  assert.strictEqual(b.status, 2, 'a screen file that is not JSON must refuse — it would be sent as garbage: ' + b.stdout)
  assert.ok(lineWith(b.stderr, 'bad-screen-file', 'owner-intro.json'), 'the finding must name bad-screen-file and owner-intro.json: ' + b.stderr)
})

test('AC-20261002-01-5: marking team-invite drawn re-checks the whole round, so a screen deleted after owner-onboarding was drawn refuses with unknown-step-screen', async (t) => {
  const { root } = await drawHost(t)
  assert.strictEqual(fx.runDriver(root, DRAW('owner-onboarding')).status, 0, 'test setup requires owner-onboarding to be drawn first')
  fs.rmSync(path.join(fx.screensDir(root), 'roster-confirm@empty.json'))
  const r = fx.runDriver(root, DRAW('team-invite'))
  assert.strictEqual(r.status, 2, 'the round carries every drawn journey, so a screen the drawn journey needs and lost must refuse the next mark — otherwise the first push is refused for a reason the mark could have seen: ' + r.stdout)
  assert.ok(lineWith(r.stderr, 'unknown-step-screen', 'roster-confirm@empty'), 'the finding must name unknown-step-screen and roster-confirm@empty: ' + r.stderr)
})

test('AC-20261002-01-5: a journey the seed does not declare refuses and lists the seed journeys', async (t) => {
  const { root } = await drawHost(t)
  const r = fx.runDriver(root, DRAW('nope'))
  assert.strictEqual(r.status, 2, 'an undeclared journey must refuse: ' + r.stdout)
  assert.ok(r.stderr.includes('owner-onboarding, team-invite'), 'the refusal must list the seed journeys so the session picks a real one: ' + r.stderr)
})

test('AC-20261002-01-6: a journey move with no control that navigates there refuses with a no-control finding naming both screens', async (t) => {
  const { root } = await drawHost(t)
  fx.editScreen(root, 'owner-intro.json', (spec) => { delete spec.elements.start.on })
  const r = fx.runDriver(root, DRAW('owner-onboarding'))
  assert.strictEqual(r.status, 2, 'a move between two screens that no control performs must refuse — a click-through that cannot be clicked is not a wireframe: ' + r.stdout)
  assert.ok(lineWith(r.stderr, 'no-control', 'owner-intro', 'roster-confirm'), 'the finding must name no-control, owner-intro and roster-confirm: ' + r.stderr)
})

test('AC-20261002-01-6: a 301-character persona refuses with a bad-journey finding naming the journey and the persona path, and a 300-character persona is accepted', async (t) => {
  const long = await drawHost(t)
  fx.writeSeed(long.root, { persona: 'M' + 'a'.repeat(300) })
  const refused = fx.runDriver(long.root, DRAW('owner-onboarding'))
  assert.strictEqual(refused.status, 2, 'a persona over the contract\'s 300 characters must refuse offline — the client\'s own check passes it and the service refuses it later: ' + refused.stdout)
  assert.ok(lineWith(refused.stderr, 'bad-journey', 'owner-onboarding', 'persona'), 'the finding must name bad-journey, owner-onboarding and persona: ' + refused.stderr)

  const edge = await drawHost(t)
  fx.writeSeed(edge.root, { persona: 'M' + 'a'.repeat(299) })
  const accepted = fx.runDriver(edge.root, DRAW('owner-onboarding'))
  assert.strictEqual(accepted.status, 0, 'a persona of exactly 300 characters is the limit and must be accepted: ' + accepted.stderr)
})
