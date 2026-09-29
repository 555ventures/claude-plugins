'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const {
  TOKEN, HELLO_OK, makeHost, block, startStub, runWalkthrough, loadJson, writeJson, sha256,
  pngBytes, makePictureWork,
} = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-9, AC-20260929-01-11
// (D10): a picture round is one push plus one PUT per picture in round-file order, resumable, and
// refused locally when a file is not a PNG or is too large.

const BASE = '/v1/projects/hearwell/rounds/1'
const IMAGES = ['owner-intro--390', 'owner-intro--1280', 'roster-confirm--empty--390']
const FILES = ['captures/owner-intro-390.png', 'captures/owner-intro-1280.png', 'captures/roster-empty-390.png']

const pushed = { status: 201, body: { apiVersion: 1, round: 1, kind: 'screenshots', status: 'uploading', journeys: [] } }
const stored = (image, bytes, remaining) => ({
  status: 200,
  body: { apiVersion: 1, round: 1, image, bytes, remaining, status: remaining ? 'uploading' : 'open' },
})
const put = (i) => 'PUT ' + BASE + '/images/' + IMAGES[i]

test('AC-20260929-01-9: a picture push sends three screens with sha256 and bytes and no file, then three PUTs in round-file order carrying the exact bytes, and ends open with every picture uploaded', async (t) => {
  const { roundFile, files } = makePictureWork()
  const bytes = FILES.map((f) => files[f])
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    'POST /v1/projects/hearwell/rounds': [pushed],
    [put(0)]: [stored(IMAGES[0], bytes[0].length, 2)],
    [put(1)]: [stored(IMAGES[1], bytes[1].length, 1)],
    [put(2)]: [stored(IMAGES[2], bytes[2].length, 0)],
  })
  const host = makeHost(block(stub.url))
  const r = await runWalkthrough(host, ['push', '--round-file', roundFile])
  assert.strictEqual(r.status, 0, 'the picture round must push: ' + JSON.stringify(r))

  const log = stub.log()
  const post = log.find((l) => l.method === 'POST')
  assert.strictEqual(post.json.kind, 'screenshots', 'kind must be screenshots')
  assert.strictEqual(post.json.screens.length, 3, 'three screens must be announced')
  post.json.screens.forEach((s, i) => {
    assert.strictEqual(s.sha256, sha256(bytes[i]), 'screen ' + i + ' must carry the checksum of its file — the service verifies each upload against it')
    assert.strictEqual(s.bytes, bytes[i].length, 'screen ' + i + ' must carry the byte count')
    assert.ok(!('file' in s), 'a local file path must never reach the service: ' + JSON.stringify(s))
  })

  const puts = log.filter((l) => l.method === 'PUT')
  assert.deepStrictEqual(puts.map((p) => p.url), IMAGES.map((i) => BASE + '/images/' + i), 'uploads must follow round-file order to the documented image keys')
  puts.forEach((p, i) => {
    assert.strictEqual(p.headers['content-type'], 'image/png', 'upload ' + i + ' must be sent as image/png')
    assert.strictEqual(p.headers['x-content-sha256'], sha256(bytes[i]), 'upload ' + i + ' must carry the checksum of the file')
    assert.strictEqual(p.headers['x-content-sha256'], p.bodySha256, 'upload ' + i + ': the checksum header must equal the SHA-256 of the bytes the service received, or truncation goes unnoticed')
    assert.strictEqual(p.bodyLength, bytes[i].length, 'upload ' + i + ' must arrive whole')
    assert.strictEqual(p.headers.authorization, 'Bearer ' + TOKEN, 'upload ' + i + ' must be authenticated')
  })

  const saved = loadJson(path.join(host, 'design/rounds/1/round.json'))
  assert.deepStrictEqual(saved.screens.map((s) => s.uploaded), [true, true, true], 'every picture must be marked uploaded once stored')
  assert.strictEqual(saved.status, 'open', 'the round is open once the last picture arrived')
  assert.deepStrictEqual(saved.screens.map((s) => s.image), IMAGES, 'round.json must list the image keys')
})

test('AC-20260929-01-9: a 500 on the second PUT exits 1 with no third PUT and leaves the round uploading with uploaded true,false,false; --resume 1 then sends no POST and exactly the two remaining PUTs', async (t) => {
  const { roundFile, files } = makePictureWork()
  const bytes = FILES.map((f) => files[f])
  const failing = await startStub(t, {
    'GET /v1': [HELLO_OK],
    'POST /v1/projects/hearwell/rounds': [pushed],
    [put(0)]: [stored(IMAGES[0], bytes[0].length, 2)],
    [put(1)]: [{ status: 500, body: { error: 'internal', detail: 'boom', apiVersion: 1 } }],
    [put(2)]: [stored(IMAGES[2], bytes[2].length, 0)],
  })
  const host = makeHost(block(failing.url))
  const first = await runWalkthrough(host, ['push', '--round-file', roundFile])
  assert.strictEqual(first.status, 1, 'a failed upload must stop the run with exit 1: ' + JSON.stringify(first))
  assert.strictEqual(failing.log().filter((l) => l.method === 'PUT').length, 2, 'no third PUT may follow a failed second one')
  const mid = loadJson(path.join(host, 'design/rounds/1/round.json'))
  assert.deepStrictEqual(mid.screens.map((s) => s.uploaded), [true, false, false], 'round.json must record exactly which pictures arrived, or a resume cannot skip them')
  assert.strictEqual(mid.status, 'uploading', 'the round stays uploading until every picture is stored')

  const resumed = await startStub(t, {
    'GET /v1': [HELLO_OK],
    [put(1)]: [stored(IMAGES[1], bytes[1].length, 1)],
    [put(2)]: [stored(IMAGES[2], bytes[2].length, 0)],
  })
  fs.writeFileSync(path.join(host, '.claude/spec.config.json'),
    JSON.stringify({ generatedBy: 'test', walkthrough: block(resumed.url) }, null, 2) + '\n')
  const second = await runWalkthrough(host, ['push', '--round-file', roundFile, '--resume', '1'])
  assert.strictEqual(second.status, 0, 'a resume must finish the round: ' + JSON.stringify(second))
  const log = resumed.log()
  assert.ok(!log.some((l) => l.method === 'POST'), 'a resume must send no pushRound — the round already exists')
  assert.deepStrictEqual(log.filter((l) => l.method === 'PUT').map((l) => l.url), [BASE + '/images/' + IMAGES[1], BASE + '/images/' + IMAGES[2]],
    'a resume must upload exactly the pictures not yet uploaded')
  const done = loadJson(path.join(host, 'design/rounds/1/round.json'))
  assert.deepStrictEqual(done.screens.map((s) => s.uploaded), [true, true, true], 'every picture must be uploaded after the resume')
  assert.strictEqual(done.status, 'open', 'the round is open after the last picture')
})

test('AC-20260929-01-9: --resume 1 with a round file whose content differs exits 2 naming contentHash and uploads nothing', async (t) => {
  const { work, roundFile, files } = makePictureWork()
  const bytes = FILES.map((f) => files[f])
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    'POST /v1/projects/hearwell/rounds': [pushed],
    [put(0)]: [stored(IMAGES[0], bytes[0].length, 2)],
    [put(1)]: [{ status: 500, body: { error: 'internal', detail: 'boom', apiVersion: 1 } }],
  })
  const host = makeHost(block(stub.url))
  await runWalkthrough(host, ['push', '--round-file', roundFile])

  const changed = loadJson(roundFile)
  changed.screens[2].width = 400
  const otherFile = path.join(work, 'changed-round.json')
  writeJson(otherFile, changed)
  const r = await runWalkthrough(host, ['push', '--round-file', otherFile, '--resume', '1'])
  assert.strictEqual(r.status, 2, 'a resume against a different round is a precondition failure (exit 2): ' + JSON.stringify(r))
  assert.match(r.stderr, /contentHash/, 'the refusal must name contentHash: ' + r.stderr)
  assert.strictEqual(stub.log().filter((l) => l.method === 'PUT').length, 2, 'no upload may follow the refusal (only the two from the first run)')
})

test('AC-20260929-01-11: a picture file beginning with GIF89a exits 1 with not-png naming the file and sends no request', async (t) => {
  const { work, roundFile } = makePictureWork()
  fs.writeFileSync(path.join(work, FILES[1]), Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(1000, 9)]))
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const r = await runWalkthrough(makeHost(block(stub.url)), ['push', '--round-file', roundFile])
  assert.strictEqual(r.status, 1, 'a non-PNG picture must be refused (exit 1): ' + JSON.stringify(r))
  assert.match(r.stderr, /not-png/, 'the refusal code must be not-png: ' + r.stderr)
  assert.match(r.stderr, /owner-intro-1280\.png/, 'the refusal must name the offending file: ' + r.stderr)
  assert.deepStrictEqual(stub.log(), [], 'files are checked before any request — a round must not be half-announced')
})

test('AC-20260929-01-11: a picture file of 8,000,001 bytes exits 1 with too-large naming 8000000 and sends no request', async (t) => {
  const { work, roundFile } = makePictureWork()
  fs.writeFileSync(path.join(work, FILES[2]), pngBytes(8000001, 7))
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const r = await runWalkthrough(makeHost(block(stub.url)), ['push', '--round-file', roundFile])
  assert.strictEqual(r.status, 1, 'an oversized picture must be refused (exit 1): ' + JSON.stringify(r))
  assert.match(r.stderr, /too-large/, 'the refusal code must be too-large: ' + r.stderr)
  assert.match(r.stderr, /8000000/, 'the refusal must name the limit: ' + r.stderr)
  assert.deepStrictEqual(stub.log(), [], 'files are checked before any request')
})

test('AC-20260929-01-9: push of a picture round that D5 refuses — two screens sharing name, state and width, or a screen named owner--intro — exits 1 with duplicate-screen / bad-name and the stub log stays empty', async (t) => {
  const { work, roundFile } = makePictureWork()
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK], 'POST /v1/projects/hearwell/rounds': [pushed] })
  const host = makeHost(block(stub.url))
  const cases = [
    ['duplicate-screen', (round) => { round.screens[1].width = round.screens[0].width }],
    ['bad-name', (round) => { round.screens[0].name = 'owner--intro' }],
  ]
  for (const [code, mutate] of cases) {
    const round = loadJson(roundFile)
    mutate(round)
    const file = path.join(work, code + '-round.json')
    writeJson(file, round)
    const r = await runWalkthrough(host, ['push', '--round-file', file])
    assert.strictEqual(r.status, 1, 'a picture round the D5 check refuses (' + code + ') must exit 1, or a round validate rejects is still sent: ' + JSON.stringify(r))
    assert.match(r.stderr, new RegExp(code), 'the refusal must print the D5 code ' + code + ' so the author can find the fault: ' + r.stderr)
    assert.deepStrictEqual(stub.log(), [], 'nothing may be sent for a refused picture round (' + code + ') — the service would be handed a round the plugin itself rejects')
  }
})
