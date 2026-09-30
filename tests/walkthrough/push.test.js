'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  CONTRACT, HEARWELL, TOKEN, ZEROS, HELLO_OK, makeHost, block, startStub, runWalkthrough,
  loadJson, writeJson, sha256,
} = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-6, AC-20260929-01-7,
// AC-20260929-01-8 (D8, D9): the hello gate before a push, the wire body of a wireframe push, and
// the two ways a 409 round-exists ends.

const POST = 'POST /v1/projects/hearwell/rounds'
const pushed = (round) => ({
  status: 201,
  body: { apiVersion: 1, round, kind: 'wireframe', status: 'open', journeys: [{ id: 'owner-onboarding', beats: '08363cd98ef8' }] },
})

// a host already holding design/rounds/1 and design/rounds/2, so the next round is 3
function hostWithRounds(url) {
  const host = makeHost(block(url))
  for (const n of [1, 2]) fs.mkdirSync(path.join(host, 'design/rounds', String(n)), { recursive: true })
  return host
}

const pushArgs = (...more) => ['push', '--round-file', HEARWELL, ...more]

test('AC-20260929-01-6: push sends GET /v1 first and without an authorization header, then the POST', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [POST]: [pushed(1)] })
  const r = await runWalkthrough(makeHost(block(stub.url)), pushArgs())
  assert.strictEqual(r.status, 0, 'a compatible service must be pushed to: ' + JSON.stringify(r))
  const log = stub.log()
  assert.strictEqual(log[0].method + ' ' + log[0].url, 'GET /v1', 'hello must be the first request — a push to an unknown revision may send a field the service refuses: ' + JSON.stringify(log.map((l) => l.method + ' ' + l.url)))
  assert.strictEqual(log[0].headers.authorization, undefined, 'hello is unauthenticated — sending the token to an unvetted service is a leak')
  assert.strictEqual(log[1].method + ' ' + log[1].url, POST, 'the push must follow the hello')
})

test('AC-20260929-01-6: an apiVersion 2 answer or a 404 from hello exits 1 with unknown-api-version and sends no POST', async (t) => {
  for (const hello of [{ status: 200, body: { apiVersion: 2, revision: 1, sunset: null } }, { status: 404, raw: 'not found' }]) {
    const stub = await startStub(t, { 'GET /v1': [hello], [POST]: [pushed(1)] })
    const r = await runWalkthrough(makeHost(block(stub.url)), pushArgs())
    assert.strictEqual(r.status, 1, 'an unknown api version must refuse (exit 1) for hello ' + JSON.stringify(hello) + ': ' + JSON.stringify(r))
    assert.match(r.stderr, /unknown-api-version/, 'the refusal code must be unknown-api-version: ' + r.stderr)
    assert.ok(!stub.log().some((l) => l.method === 'POST'), 'no POST may follow a refused hello — the round would go to a service speaking another version')
  }
})

test('AC-20260929-01-6: a service revision below the contract copy\'s revision exits 1 with service-behind naming both numbers', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [{ status: 200, body: { apiVersion: 1, revision: 2, sunset: null } }], [POST]: [pushed(1)] })
  const dir = tmpdir('walkthrough-contract')
  const contract = loadJson(CONTRACT)
  contract.revision = 3
  const file = path.join(dir, 'contract.json')
  writeJson(file, contract)
  const r = await runWalkthrough(makeHost(block(stub.url)), pushArgs('--contract', file))
  assert.strictEqual(r.status, 1, 'a service behind the plugin must refuse (exit 1): ' + JSON.stringify(r))
  assert.match(r.stderr, /service-behind/, 'the refusal code must be service-behind: ' + r.stderr)
  assert.match(r.stderr, /\b2\b/, 'the service revision must be named: ' + r.stderr)
  assert.match(r.stderr, /\b3\b/, 'the plugin revision must be named: ' + r.stderr)
  assert.ok(!stub.log().some((l) => l.method === 'POST'), 'no POST may follow a service-behind refusal')
})

test('AC-20260929-01-6: a non-null sunset prints "/v1 stops on 2027-01-31" on stderr and the push still goes ahead', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [{ status: 200, body: { apiVersion: 1, revision: 2, sunset: '2027-01-31' } }], [POST]: [pushed(1)] })
  const r = await runWalkthrough(makeHost(block(stub.url)), pushArgs())
  assert.strictEqual(r.status, 0, 'a sunset is a warning, not a refusal: ' + JSON.stringify(r))
  assert.match(r.stderr, /\/v1 stops on 2027-01-31/, 'the owner must be told the date before the service stops: ' + r.stderr)
  assert.ok(stub.log().some((l) => l.method === 'POST'), 'the push must still be sent despite the sunset')
})

test('AC-20260929-01-7: push into a host holding rounds 1 and 2 sends round 3 with the bearer token, the computed story hash, no state key for a base state, and a matching contentHash', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [POST]: [pushed(3)] })
  const host = hostWithRounds(stub.url)
  const r = await runWalkthrough(host, pushArgs())
  assert.strictEqual(r.status, 0, 'the push must succeed: ' + JSON.stringify(r))
  assert.match(r.stdout, /pushed round 3 \(wireframe\) — open/, 'the success sentence names the round, kind and status: ' + r.stdout)

  const req = stub.log().find((l) => l.method === 'POST')
  assert.ok(req, 'a POST must have been sent')
  assert.strictEqual(req.url, '/v1/projects/hearwell/rounds', 'wrong push path: ' + req.url)
  assert.strictEqual(req.headers.authorization, 'Bearer ' + TOKEN, 'the token must travel as a bearer header')
  const body = req.json
  assert.strictEqual(body.round, 3, 'the plugin owns the round number: one past the highest folder')
  assert.strictEqual(body.kind, 'wireframe', 'kind must be wireframe')
  assert.strictEqual(body.journeys[0].beats, '08363cd98ef8', 'beats must be the ADR-0029 story hash of the journey\'s own steps')
  assert.ok(!('state' in body.journeys[0].steps[0]), 'a step without a state must send no state key (null and "default" were both refused by the service)')
  assert.strictEqual(body.journeys[0].steps[2].state, 'empty', 'a step with a state keeps it')
  assert.ok(!('state' in body.screens[0]), 'a screen without a state must send no state key')
  const { contentHash, ...rest } = body
  assert.strictEqual(contentHash, sha256(JSON.stringify(rest)), 'contentHash must be the SHA-256 of the body serialized without that key, or a repeated push cannot be recognised')

  const saved = loadJson(path.join(host, 'design/rounds/3/round.json'))
  assert.strictEqual(saved.round, 3, 'round.json must record the round')
  assert.deepStrictEqual(saved.journeys, [{ id: 'owner-onboarding', beats: '08363cd98ef8' }], 'round.json must record the journeys\' story hashes — approvals are compared against them later')
  assert.strictEqual(saved.screens.length, 4, 'round.json must list the four screens')
  for (const s of saved.screens) {
    assert.ok(Object.keys(s).every((k) => k === 'name' || k === 'state'), 'a wireframe round\'s screens entries are { name, state } only: ' + JSON.stringify(s))
  }
})

test('AC-20260929-01-7: push --round 7 sends round 7', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [POST]: [pushed(7)] })
  const host = hostWithRounds(stub.url)
  const r = await runWalkthrough(host, pushArgs('--round', '7'))
  assert.strictEqual(r.status, 0, 'an explicit round must be honoured: ' + JSON.stringify(r))
  assert.strictEqual(stub.log().find((l) => l.method === 'POST').json.round, 7, 'the body must carry the named round, not the derived one')
  assert.ok(fs.existsSync(path.join(host, 'design/rounds/7/round.json')), 'round.json must land under the named round')
})

test('AC-20260929-01-8: a 409 round-exists carrying the hash that was sent is a success and writes round.json', async (t) => {
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    [POST]: [{ status: 409, body: { error: 'round-exists', detail: { contentHash: '$contentHash', status: 'open' }, apiVersion: 1 } }],
  })
  const host = hostWithRounds(stub.url)
  const r = await runWalkthrough(host, pushArgs())
  assert.strictEqual(r.status, 0, 'the earlier push arrived and its answer was lost — repeating must not fail: ' + JSON.stringify(r))
  assert.ok(fs.existsSync(path.join(host, 'design/rounds/3/round.json')), 'round.json must be written for the round that already exists on the service')
})

test('AC-20260929-01-8: a 409 round-exists with another hash exits 1 with round-exists, names --round 4 as the remedy and creates no design/rounds/3', async (t) => {
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    [POST]: [{ status: 409, body: { error: 'round-exists', detail: { contentHash: ZEROS, status: 'open' }, apiVersion: 1 } }],
  })
  const host = hostWithRounds(stub.url)
  const r = await runWalkthrough(host, pushArgs())
  assert.strictEqual(r.status, 1, 'a different round under the same number must be refused: ' + JSON.stringify(r))
  assert.match(r.stderr, /round-exists/, 'the refusal code must be round-exists: ' + r.stderr)
  assert.match(r.stderr, /--round 4/, 'the remedy must name the next free round: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host, 'design/rounds/3')), 'a refused push must leave no folder — a later pull would trust it')
})
