'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { HEARWELL, makeHost, block, seedRound, startStub, runWalkthrough, HELLO_OK } = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-4, AC-20260929-01-5,
// AC-20260929-01-17 (D1, D12): a project without the block is untouched, a bad block is refused
// before any request, and `check` inspects the config only.

const NOT_CONFIGURED = 'walkthrough: not configured for this project — nothing sent'

test('AC-20260929-01-4: every service verb in a host with no walkthrough block exits 0 with the not-configured line, {"skipped":true} under --json, no design/rounds directory and no request', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const host = makeHost(null)
  const textFile = path.join(tmpdir('walkthrough-reply'), 'reply.txt')
  fs.writeFileSync(textFile, 'Moved the button up.\n')
  const verbs = [
    ['push', '--round-file', HEARWELL],
    ['pull-notes'],
    ['pull-approvals'],
    ['reply', '--note', 'n1', '--text-file', textFile],
    ['mark', '--round', '1', '--status', 'open'],
    ['hello'],
  ]
  for (const args of verbs) {
    const plain = await runWalkthrough(host, args)
    assert.strictEqual(plain.status, 0, args[0] + ' with no block must exit 0, or every project without the service breaks: ' + JSON.stringify(plain))
    assert.strictEqual(plain.stdout.trim(), NOT_CONFIGURED, args[0] + ' must say on stdout that nothing was sent: ' + JSON.stringify(plain.stdout))
    const json = await runWalkthrough(host, [...args, '--json'])
    assert.strictEqual(json.status, 0, args[0] + ' --json with no block must exit 0: ' + JSON.stringify(json))
    assert.deepStrictEqual(JSON.parse(json.stdout), { skipped: true }, args[0] + ' --json must print {"skipped":true} so a caller can tell skipped from done: ' + json.stdout)
  }
  assert.ok(!fs.existsSync(path.join(host, 'design/rounds')), 'an unconfigured project must gain no design/rounds directory — the client wrote where it had no business')
  assert.deepStrictEqual(stub.log(), [], 'an unconfigured project must open no connection — a stub was listening and saw traffic')
})

test('AC-20260929-01-5: a block without tokenEnv exits 2 naming walkthrough.tokenEnv and sends nothing', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const host = makeHost({ baseUrl: stub.url, project: 'hearwell' })
  seedRound(host, 2)
  const r = await runWalkthrough(host, ['pull-approvals', '--round', '2'])
  assert.strictEqual(r.status, 2, 'an incomplete block is a config error (exit 2): ' + JSON.stringify(r))
  assert.match(r.stderr, /walkthrough\.tokenEnv/, 'the refusal must name the missing key: ' + r.stderr)
  assert.deepStrictEqual(stub.log(), [], 'a config error must be found before any request')
})

test('AC-20260929-01-5: an unset or empty token variable exits 2 with code no-token naming WALKTHROUGH_TOKEN and sends nothing', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const host = makeHost(block(stub.url))
  seedRound(host, 2)
  for (const value of [null, '']) {
    const r = await runWalkthrough(host, ['pull-approvals', '--round', '2'], { env: { WALKTHROUGH_TOKEN: value } })
    assert.strictEqual(r.status, 2, 'a missing token is a config error (exit 2), value ' + JSON.stringify(value) + ': ' + JSON.stringify(r))
    assert.match(r.stderr, /no-token/, 'the refusal code must be no-token: ' + r.stderr)
    assert.match(r.stderr, /WALKTHROUGH_TOKEN/, 'the refusal must name the variable (never its value): ' + r.stderr)
  }
  assert.deepStrictEqual(stub.log(), [], 'no request may leave without a token')
})

test('AC-20260929-01-5: a plain-http baseUrl on a remote host exits 2 with insecure-base-url, so a bearer token never travels in clear', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const host = makeHost(block('http://walk.example.com'))
  seedRound(host, 2)
  const r = await runWalkthrough(host, ['pull-approvals', '--round', '2'])
  assert.strictEqual(r.status, 2, 'an insecure base url is a config error (exit 2): ' + JSON.stringify(r))
  assert.match(r.stderr, /insecure-base-url/, 'the refusal code must be insecure-base-url: ' + r.stderr)
  assert.deepStrictEqual(stub.log(), [], 'nothing may be sent')
})

test('AC-20260929-01-5: http://127.0.0.1, http://localhost and https://walk.example.com are not reported as insecure', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  for (const url of [stub.url, 'http://localhost:' + stub.port, 'https://walk.example.com']) {
    const host = makeHost(block(url))
    const r = await runWalkthrough(host, ['check'])
    assert.strictEqual(r.status, 0, url + ' is an allowed base url; refusing it blocks local development or every hosted service: ' + JSON.stringify(r))
    assert.doesNotMatch(r.stdout + r.stderr, /insecure-base-url/, url + ' must not be called insecure: ' + r.stdout + r.stderr)
  }
  const host = makeHost(block(stub.url))
  const hello = await runWalkthrough(host, ['hello'])
  assert.doesNotMatch(hello.stderr, /insecure-base-url/, 'a loopback http url must pass the client\'s own rule when it really sends: ' + hello.stderr)
})

test('AC-20260929-01-17: check prints nothing and exits 0 with no block, and exits 0 for a complete block with the token set, opening no connection', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const none = await runWalkthrough(makeHost(null), ['check'])
  assert.strictEqual(none.status, 0, 'check with no block must exit 0: ' + JSON.stringify(none))
  assert.strictEqual(none.stdout + none.stderr, '', 'check with no block must print nothing — doctor stays silent for projects that do not use the service')
  const ok = await runWalkthrough(makeHost(block(stub.url)), ['check'])
  assert.strictEqual(ok.status, 0, 'a complete block with the token set must pass: ' + JSON.stringify(ok))
  assert.deepStrictEqual(stub.log(), [], 'check is config-only: it opened a connection')
})

test('AC-20260929-01-17: check names walkthrough.project for hear--well, names WALKTHROUGH_TOKEN when the variable is unset, one line each, and --json prints {"findings":[...]}', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO_OK] })
  const bad = makeHost(block(stub.url, { project: 'hear--well' }))
  const proj = await runWalkthrough(bad, ['check'])
  assert.strictEqual(proj.status, 1, 'a project id failing the name shape must exit 1: ' + JSON.stringify(proj))
  assert.match(proj.stdout + proj.stderr, /walkthrough\.project/, 'the finding must name the key: ' + proj.stdout + proj.stderr)

  const tok = await runWalkthrough(makeHost(block(stub.url)), ['check'], { env: { WALKTHROUGH_TOKEN: null } })
  assert.strictEqual(tok.status, 1, 'an unset token variable must exit 1: ' + JSON.stringify(tok))
  assert.match(tok.stdout + tok.stderr, /WALKTHROUGH_TOKEN/, 'the finding must name the variable\'s name: ' + tok.stdout + tok.stderr)

  const both = await runWalkthrough(bad, ['check'], { env: { WALKTHROUGH_TOKEN: null } })
  const lines = (both.stdout + both.stderr).split('\n').filter((l) => l.trim())
  assert.strictEqual(lines.length, 2, 'two defects must print two lines, one each: ' + lines.join('\n'))
  const json = await runWalkthrough(bad, ['check', '--json'], { env: { WALKTHROUGH_TOKEN: null } })
  assert.strictEqual(json.status, 1, 'check --json still exits 1 on findings: ' + JSON.stringify(json))
  const parsed = JSON.parse(json.stdout)
  assert.ok(Array.isArray(parsed.findings) && parsed.findings.length === 2,
    '--json must print {"findings":[...]} with one entry per defect: ' + json.stdout)
  assert.deepStrictEqual(stub.log(), [], 'no check case may open a connection')
})
