'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { HELLO_OK, makeHost, block, seedRound, startStub, runWalkthrough, loadJson } = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-12, AC-20260929-01-14,
// AC-20260929-01-15 (D11, D12): incremental note pulls that leave git a quiet file, approvals in a
// stable order, and the two writing verbs (reply, mark).

const NOTES = 'GET /v1/projects/hearwell/notes'
const notesFile = (host) => path.join(host, 'design/rounds/2/notes.json')
const note = (id, at, over = {}) => ({
  id, round: 2, screen: 'owner-intro', anchor: null, pickedText: null, status: 'open',
  text: 'text ' + id, author: 'client', thread: [{ by: 'client', text: 'text ' + id, at }], at, ...over,
})
const answer = (notes, cursor) => ({ status: 200, body: { apiVersion: 1, notes, journeys: [], cursor } })

test('AC-20260929-01-12: pull-notes merges by id across three pulls, sends since=<cursor> from the second, keeps notes sorted by at then id, and leaves the file byte-identical when nothing changed', async (t) => {
  const n1 = note('n1', '2026-09-29T10:00:00Z', { round: 1, anchor: { node: 'start', index: 0 } })
  const n2 = note('n2', '2026-09-29T10:05:00Z')
  const n1Answered = { ...n1, status: 'answered', thread: [...n1.thread, { by: 'session', text: 'Done', at: '2026-09-29T10:07:00Z' }] }
  const n3 = note('n3', '2026-09-29T10:10:00Z')
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    [NOTES]: [answer([n2, n1], 'c-1'), answer([n1Answered, n3], 'c-2'), answer([], 'c-2')],
  })
  const host = makeHost(block(stub.url))
  seedRound(host, 2)

  const first = await runWalkthrough(host, ['pull-notes', '--round', '2'])
  assert.strictEqual(first.status, 0, 'the first pull must succeed: ' + JSON.stringify(first))
  const file1 = loadJson(notesFile(host))
  assert.strictEqual(file1.cursor, 'c-1', 'the cursor of the answer must be stored')
  assert.deepStrictEqual(file1.notes.map((n) => n.id), ['n1', 'n2'], 'notes must be sorted by at then id whatever order the service answered in, or git shows churn')
  assert.strictEqual(fs.readFileSync(notesFile(host), 'utf8'), JSON.stringify(file1, null, 2) + '\n', 'files are two-space JSON with a trailing newline')
  assert.strictEqual(file1.notes[0].round, 1, 'a note from round 1 is still in round 2\'s file — notes belong to the project')

  const second = await runWalkthrough(host, ['pull-notes', '--round', '2'])
  assert.strictEqual(second.status, 0, 'the second pull must succeed: ' + JSON.stringify(second))
  const file2 = loadJson(notesFile(host))
  assert.deepStrictEqual(file2.notes.map((n) => [n.id, n.status]), [['n1', 'answered'], ['n2', 'open'], ['n3', 'open']], 'an answered note replaces the stored one, an unchanged one stays, a new one is added')
  assert.deepStrictEqual(file2.notes[1], file1.notes[1], 'n2 must be untouched')
  assert.strictEqual(file2.cursor, 'c-2', 'the cursor must advance')

  const before = fs.readFileSync(notesFile(host))
  const third = await runWalkthrough(host, ['pull-notes', '--round', '2'])
  assert.strictEqual(third.status, 0, 'the third pull must succeed: ' + JSON.stringify(third))
  assert.ok(before.equals(fs.readFileSync(notesFile(host))), 'a pull that changed nothing must leave the file byte-identical — nothing time-of-pull may be written')

  const urls = stub.log().filter((l) => l.method === 'GET' && l.url.startsWith('/v1/projects/hearwell/notes')).map((l) => l.url)
  assert.deepStrictEqual(urls, ['/v1/projects/hearwell/notes', '/v1/projects/hearwell/notes?since=c-1', '/v1/projects/hearwell/notes?since=c-2'],
    'the first pull is full and carries no round filter; later pulls carry only the cursor')
})

test('AC-20260929-01-12: pull-notes --round 9 for a round with no round.json exits 2 naming design/rounds/9/round.json', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], [NOTES]: [answer([], 'c-1')] })
  const host = makeHost(block(stub.url))
  seedRound(host, 2)
  const r = await runWalkthrough(host, ['pull-notes', '--round', '9'])
  assert.strictEqual(r.status, 2, 'a round that was never pushed is a precondition failure (exit 2): ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('design/rounds/9/round.json'), 'the refusal must name the missing file: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host, 'design/rounds/9')), 'a refused pull must create nothing')
})

test('AC-20260929-01-14: pull-approvals writes approvals.json with owner-onboarding first and both beats values unchanged', async (t) => {
  const approval = (journey) => ({ journey, by: 'client', round: 2, beats: '08363cd98ef8', at: '2026-09-29T11:00:00Z' })
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    'GET /v1/projects/hearwell/approvals': [{ status: 200, body: { apiVersion: 1, approvals: [approval('team-invite'), approval('owner-onboarding')] } }],
  })
  const host = makeHost(block(stub.url))
  seedRound(host, 2)
  const r = await runWalkthrough(host, ['pull-approvals', '--round', '2'])
  assert.strictEqual(r.status, 0, 'the pull must succeed: ' + JSON.stringify(r))
  const file = loadJson(path.join(host, 'design/rounds/2/approvals.json'))
  assert.deepStrictEqual(file.approvals.map((a) => a.journey), ['owner-onboarding', 'team-invite'], 'approvals must be sorted by journey so a re-pull never reorders the file')
  assert.deepStrictEqual(file.approvals.map((a) => a.beats), ['08363cd98ef8', '08363cd98ef8'], 'the hash the client confirmed must be stored unchanged — staleness is decided against it later')
  assert.strictEqual(file.round, 2, 'the file records its round')
  assert.strictEqual(file.apiVersion, 1, 'the file records the api version')
})

test('AC-20260929-01-15: reply posts the trimmed text to the note, and refuses empty text or text over 4000 characters before any request', async (t) => {
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    'POST /v1/projects/hearwell/notes/n1/reply': [{ status: 200, body: { apiVersion: 1 } }],
  })
  const host = makeHost(block(stub.url))
  const dir = tmpdir('walkthrough-reply')
  const textFile = path.join(dir, 'reply.txt')

  fs.writeFileSync(textFile, '  Moved the button up.\n')
  const ok = await runWalkthrough(host, ['reply', '--note', 'n1', '--text-file', textFile])
  assert.strictEqual(ok.status, 0, 'a reply must be sent: ' + JSON.stringify(ok))
  const post = stub.log().find((l) => l.method === 'POST')
  assert.ok(post, 'a POST must have been sent')
  assert.strictEqual(post.url, '/v1/projects/hearwell/notes/n1/reply', 'wrong reply path: ' + post.url)
  assert.deepStrictEqual(post.json, { text: 'Moved the button up.' }, 'the body must be the trimmed text and nothing else (requests are strict)')
  const sent = stub.log().length

  fs.writeFileSync(textFile, '     \n')
  const blank = await runWalkthrough(host, ['reply', '--note', 'n1', '--text-file', textFile])
  assert.strictEqual(blank.status, 1, 'a blank reply must be refused (exit 1): ' + JSON.stringify(blank))

  fs.writeFileSync(textFile, 'a'.repeat(4001))
  const long = await runWalkthrough(host, ['reply', '--note', 'n1', '--text-file', textFile])
  assert.strictEqual(long.status, 1, 'an over-long reply must be refused (exit 1): ' + JSON.stringify(long))
  assert.match(long.stderr, /4000/, 'the refusal must name the limit: ' + long.stderr)
  assert.strictEqual(stub.log().length, sent, 'neither refusal may send anything — not even hello')
})

test('AC-20260929-01-15: mark posts the status to the round, and a status outside open, answered and closed exits 2 and sends nothing', async (t) => {
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    'POST /v1/projects/hearwell/rounds/2/mark': [{ status: 200, body: { apiVersion: 1, round: 2, status: 'answered' } }],
  })
  const host = makeHost(block(stub.url))
  seedRound(host, 2)
  const ok = await runWalkthrough(host, ['mark', '--round', '2', '--status', 'answered'])
  assert.strictEqual(ok.status, 0, 'mark must be sent: ' + JSON.stringify(ok))
  const post = stub.log().find((l) => l.method === 'POST')
  assert.ok(post, 'a POST must have been sent')
  assert.strictEqual(post.url, '/v1/projects/hearwell/rounds/2/mark', 'wrong mark path: ' + post.url)
  assert.deepStrictEqual(post.json, { status: 'answered' }, 'the body must be the status alone')
  const sent = stub.log().length

  const bad = await runWalkthrough(host, ['mark', '--round', '2', '--status', 'done'])
  assert.strictEqual(bad.status, 2, 'an unknown status is a usage error (exit 2): ' + JSON.stringify(bad))
  assert.strictEqual(stub.log().length, sent, 'a refused status must send nothing')
})
