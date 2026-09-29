'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { HEARWELL, makeHost, block, startStub, runWalkthrough, loadJson, writeJson } = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-3 (D5, D6):
// `walkthrough validate` checks a wireframe round offline and names the element that is wrong.

async function validate(t, mutate) {
  const stub = await startStub(t, {})
  const host = makeHost(block(stub.url))
  const round = loadJson(HEARWELL)
  if (mutate) mutate(round)
  const file = path.join(tmpdir('walkthrough-round'), 'round.json')
  writeJson(file, round)
  const r = await runWalkthrough(host, ['validate', '--round-file', file])
  return { r, out: r.stdout + r.stderr, lines: (r.stdout + r.stderr).split('\n'), stub }
}

const screenOf = (round, name, state) => round.screens.find((s) => s.name === name && (s.state || null) === (state || null))

test('AC-20260929-01-3: validate on the shipped hearwell round exits 0, prints "round ok: 4 screens, 1 journey" and sends no request', async (t) => {
  const { r, stub } = await validate(t, null)
  assert.strictEqual(r.status, 0, 'the reference round must validate, or the vocabulary rejects the very screens it was drawn from: ' + r.stderr)
  assert.match(r.stdout, /round ok: 4 screens, 1 journey/, 'the verdict line is the proof the round was read whole: ' + r.stdout)
  assert.deepStrictEqual(stub.log(), [], 'validate is offline — any request would spend the service\'s rate limit on a typo')
})

test('AC-20260929-01-3: a mistyped prop on roster-confirm@empty add reports unknown-prop lable and missing-prop label, and sends no request', async (t) => {
  const { r, lines, stub } = await validate(t, (round) => {
    screenOf(round, 'roster-confirm', 'empty').spec.elements.add.props = { lable: 'Add a person' }
  })
  assert.strictEqual(r.status, 1, 'a misspelled prop must refuse the round, or the typo reaches the client\'s screen: ' + JSON.stringify(r))
  assert.ok(lines.some((l) => /roster-confirm@empty/.test(l) && /\badd\b/.test(l) && /unknown-prop/.test(l) && /lable/.test(l)),
    'one line must carry screen@state, element, code and the offending prop, or the author cannot find the typo: ' + lines.join('\n'))
  assert.ok(lines.some((l) => /missing-prop/.test(l) && /label/.test(l)),
    'the required prop that went missing must be reported too: ' + lines.join('\n'))
  assert.deepStrictEqual(stub.log(), [], 'a failing validate must send no request')
})

test('AC-20260929-01-3: a Button with a child reports children-not-allowed, and sends no request', async (t) => {
  const { r, out, stub } = await validate(t, (round) => {
    screenOf(round, 'owner-intro').spec.elements.start.children = ['x']
  })
  assert.strictEqual(r.status, 1, 'a leaf component with children must be refused: ' + JSON.stringify(r))
  assert.match(out, /children-not-allowed/, 'the finding code is the only way the author learns why: ' + out)
  assert.deepStrictEqual(stub.log(), [], 'a failing validate must send no request')
})

test('AC-20260929-01-3: a navigate to a screen the round does not hold reports unknown-screen naming roster-confrim', async (t) => {
  const { r, out, stub } = await validate(t, (round) => {
    screenOf(round, 'owner-intro').spec.elements.start.on.press.params.to = 'roster-confrim'
  })
  assert.strictEqual(r.status, 1, 'a dead navigate target must be refused: ' + JSON.stringify(r))
  assert.match(out, /unknown-screen/, 'the code must be reported: ' + out)
  assert.match(out, /roster-confrim/, 'the mistyped target must be named: ' + out)
  assert.deepStrictEqual(stub.log(), [], 'a failing validate must send no request')
})

test('AC-20260929-01-3: a journey step naming a state the round lacks reports unknown-step-screen naming roster-confirm@emtpy', async (t) => {
  const { r, out, stub } = await validate(t, (round) => {
    round.journeys[0].steps[2].state = 'emtpy'
  })
  assert.strictEqual(r.status, 1, 'a step pointing at a missing screen state must be refused: ' + JSON.stringify(r))
  assert.match(out, /unknown-step-screen/, 'the code must be reported: ' + out)
  assert.match(out, /roster-confirm@emtpy/, 'the step\'s screen@state must be named: ' + out)
  assert.deepStrictEqual(stub.log(), [], 'a failing validate must send no request')
})

test('AC-20260929-01-3: a variant of a variant reports chained-variant for the third journey only, and sends no request', async (t) => {
  const { r, lines, stub } = await validate(t, (round) => {
    const steps = [{ beat: 'I open the invitation', screen: 'owner-intro' }]
    round.journeys.push({ id: 'owner-second', title: 'Second', steps, variantOf: 'owner-onboarding' })
    round.journeys.push({ id: 'owner-third', title: 'Third', steps, variantOf: 'owner-second' })
  })
  assert.strictEqual(r.status, 1, 'a chained variant must be refused: ' + JSON.stringify(r))
  const chained = lines.filter((l) => /chained-variant/.test(l))
  assert.strictEqual(chained.length, 1, 'exactly one chained-variant finding is expected (the third journey): ' + lines.join('\n'))
  assert.match(chained[0], /owner-third/, 'the finding must name the third journey, not the second: ' + chained[0])
  assert.deepStrictEqual(stub.log(), [], 'a failing validate must send no request')
})
