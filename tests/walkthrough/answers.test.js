'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { freePort } = require('../helpers')
const {
  TOKEN, HELLO_OK, makeHost, block, seedRound, startStub, runWalkthrough, allFiles,
} = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-10, AC-20260929-01-13,
// AC-20260929-01-16 (D7): how the client reads what the service says — the one retry, every answer
// checked against the contract before a file is written, and the token never leaving the process.

const APPROVALS = 'GET /v1/projects/hearwell/approvals'
const NOTES = 'GET /v1/projects/hearwell/notes'
const OK_APPROVALS = { status: 200, body: { apiVersion: 1, approvals: [] } }
const limited = (retryAfter) => ({
  status: 429, headers: { 'retry-after': String(retryAfter) },
  body: { error: 'rate-limited', detail: 'slow down', apiVersion: 1 },
})
const note = (over = {}) => ({
  id: 'n1', round: 2, screen: 'owner-intro', anchor: { node: 'start', index: 0 }, pickedText: null,
  status: 'open', text: 'Make it bigger', author: 'client',
  thread: [{ by: 'client', text: 'Make it bigger', at: '2026-09-29T10:00:00Z' }], at: '2026-09-29T10:00:00Z', ...over,
})
const hostFor = (url) => { const h = makeHost(block(url)); seedRound(h, 2); return h }
const approvals = (host) => runWalkthrough(host, ['pull-approvals', '--round', '2'])
const count = (stub, key) => stub.log().filter((l) => l.method + ' ' + l.url.split('?')[0] === key).length

test('AC-20260929-01-10: a 429 with retry-after 1 then a 200 exits 0 having sent that request twice', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [APPROVALS]: [limited(1), OK_APPROVALS] })
  const r = await approvals(hostFor(stub.url))
  assert.strictEqual(r.status, 0, 'one short rate-limit must be waited out, or a burst of pulls fails for no reason: ' + JSON.stringify(r))
  assert.strictEqual(count(stub, APPROVALS), 2, 'the same request must be sent again after the wait')
})

test('AC-20260929-01-10: three 429s in a row exit 1 with rate-limited having sent the request three times', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [APPROVALS]: [limited(1)] })
  const r = await approvals(hostFor(stub.url))
  assert.strictEqual(r.status, 1, 'a service that keeps refusing must end in a refusal: ' + JSON.stringify(r))
  assert.match(r.stderr, /rate-limited/, 'the refusal code must be rate-limited: ' + r.stderr)
  assert.strictEqual(count(stub, APPROVALS), 3, 'at most two retries — an unbounded retry hides an outage')
})

test('AC-20260929-01-10: a 429 with retry-after 120 exits 1 naming 120 having sent the request once', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [APPROVALS]: [limited(120), OK_APPROVALS] })
  const r = await approvals(hostFor(stub.url))
  assert.strictEqual(r.status, 1, 'a wait longer than 60 s must be refused, not slept through: ' + JSON.stringify(r))
  assert.match(r.stderr, /120/, 'the refusal must name the seconds the service asked for: ' + r.stderr)
  assert.strictEqual(count(stub, APPROVALS), 1, 'no retry after a refused wait')
})

test('AC-20260929-01-13: a notes answer without notes exits 1 with contract-mismatch naming notes and writes no file', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [NOTES]: [{ status: 200, body: { apiVersion: 1, cursor: 'c-1', journeys: [] } }] })
  const host = hostFor(stub.url)
  const r = await runWalkthrough(host, ['pull-notes', '--round', '2'])
  assert.strictEqual(r.status, 1, 'an answer that breaks the contract must be refused: ' + JSON.stringify(r))
  assert.match(r.stderr, /contract-mismatch/, 'the refusal code must be contract-mismatch: ' + r.stderr)
  assert.match(r.stderr, /notes/, 'the refusal must name the missing field: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host, 'design/rounds/2/notes.json')), 'nothing may be written from an answer that failed its shape')
})

test('AC-20260929-01-13: a note whose anchor is {"node":"start"} exits 1 with contract-mismatch naming notes[0].anchor', async (t) => {
  const bad = note({ anchor: { node: 'start' } })
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [NOTES]: [{ status: 200, body: { apiVersion: 1, notes: [bad], journeys: [], cursor: 'c-1' } }] })
  const host = hostFor(stub.url)
  const r = await runWalkthrough(host, ['pull-notes', '--round', '2'])
  assert.strictEqual(r.status, 1, 'an anchor missing its index is neither a node nor a picture anchor and must be refused: ' + JSON.stringify(r))
  assert.match(r.stderr, /contract-mismatch/, 'the refusal code must be contract-mismatch: ' + r.stderr)
  assert.ok(r.stderr.includes('notes[0].anchor'), 'the refusal must name the first failing path: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host, 'design/rounds/2/notes.json')), 'nothing may be written from a refused answer')
})

test('AC-20260929-01-13: an otherwise valid notes answer with an extra top-level field exits 0, so an additive service change breaks nobody', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [NOTES]: [{ status: 200, body: { apiVersion: 1, notes: [note()], journeys: [], cursor: 'c-1', hint: 'x' } }] })
  const r = await runWalkthrough(hostFor(stub.url), ['pull-notes', '--round', '2'])
  assert.strictEqual(r.status, 0, 'response shapes are open — refusing an added field would turn every additive revision into a breaking one: ' + JSON.stringify(r))
})

test('AC-20260929-01-16: a 401 bad-token exits 1 with a "walkthrough: bad-token — " line carrying remedy:, and the token appears in no output and no file under the host', async (t) => {
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    [APPROVALS]: [{ status: 401, body: { error: 'bad-token', detail: 'revoked', apiVersion: 1 } }, OK_APPROVALS],
  })
  const host = hostFor(stub.url)
  const denied = await approvals(host)
  assert.strictEqual(denied.status, 1, 'a refused token is a refusal (exit 1): ' + JSON.stringify(denied))
  assert.match(denied.stderr, /^walkthrough: bad-token — /m, 'the refusal line must start with the script name and code: ' + denied.stderr)
  assert.match(denied.stderr, /remedy:/, 'every refusal names its remedy: ' + denied.stderr)
  const ok = await runWalkthrough(host, ['pull-approvals', '--round', '2', '--json'])
  assert.strictEqual(ok.status, 0, 'the second answer is valid and must be written: ' + JSON.stringify(ok))

  for (const [where, text] of [['a denied run\'s stdout', denied.stdout], ['a denied run\'s stderr', denied.stderr],
    ['a --json run\'s stdout', ok.stdout], ['a --json run\'s stderr', ok.stderr]]) {
    assert.ok(!text.includes(TOKEN), 'the token leaked into ' + where + ' — anyone reading a log would own the project')
  }
  const files = allFiles(host)
  assert.ok(files.length > 1, 'sanity: the host holds files to search: ' + files.join(', '))
  for (const f of files) {
    assert.ok(!fs.readFileSync(f, 'utf8').includes(TOKEN), 'the token leaked into ' + f + ' — a written file is committed to git')
  }
  for (const l of stub.log()) {
    assert.ok(!l.url.includes(TOKEN), 'the token appeared in a URL: ' + l.url)
  }
})

test('AC-20260929-01-16: a baseUrl naming a closed port exits 3 with unreachable', async () => {
  const port = await freePort()
  const host = hostFor('http://127.0.0.1:' + port)
  const r = await approvals(host)
  assert.strictEqual(r.status, 3, 'a service that did not answer is exit 3, not a refusal: ' + JSON.stringify(r))
  assert.match(r.stderr, /unreachable/, 'the code must be unreachable: ' + r.stderr)
})

test('AC-20260929-01-16: a 200 answer with the body <html> exits 1 with not-json', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [{ status: 200, raw: '<html>', headers: { 'content-type': 'text/html' } }] })
  const r = await runWalkthrough(hostFor(stub.url), ['hello'])
  assert.strictEqual(r.status, 1, 'a proxy page instead of the service must be refused: ' + JSON.stringify(r))
  assert.match(r.stderr, /not-json/, 'the code must be not-json: ' + r.stderr)
})

test('AC-20260929-01-16: a 302 with a location header exits 1 with redirected and sends no second request', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [{ status: 302, headers: { location: '/elsewhere' } }] })
  const r = await runWalkthrough(hostFor(stub.url), ['hello'])
  assert.strictEqual(r.status, 1, 'a redirect must be refused: ' + JSON.stringify(r))
  assert.match(r.stderr, /redirected/, 'the code must be redirected: ' + r.stderr)
  assert.strictEqual(stub.log().length, 1, 'following a redirect is where a token travels to a host nobody named')
})

test('AC-20260929-01-16: a service that never answers, with WALKTHROUGH_TIMEOUT_MS set to 300, exits 3 with timeout', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [{ hang: true }] })
  const r = await runWalkthrough(hostFor(stub.url), ['hello'], { env: { WALKTHROUGH_TIMEOUT_MS: '300' } })
  assert.strictEqual(r.status, 3, 'a silent service is exit 3: ' + JSON.stringify(r))
  assert.match(r.stderr, /timeout/, 'the code must be timeout: ' + r.stderr)
})
