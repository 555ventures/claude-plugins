'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./fixture')

// spec/scripts/walkthrough-connect.js since 7.242.0: the project and its token come from
// `npx --yes walkthrough-cli` (whoami → new → token), not railway ssh. Fake `npx` on PATH,
// child-process stub for the probe. The child never sees WALKTHROUGH_TOKEN or <tokenEnv>.

const { makeGitHost, makeNpx, pathWithoutNpx, runConnect, startStub, connectAnswers, block, SETTINGS_REL, MINTED } = fx

const STALE = 'wt_stale_plugin_token_0000'
const BAD_TOKEN = { status: 401, body: { error: 'bad-token', detail: 'unknown token', apiVersion: 1 } }
const APPROVALS_OK = { status: 200, body: { apiVersion: 1, approvals: [] } }
const stored = (dir) => JSON.parse(fs.readFileSync(path.join(dir, SETTINGS_REL), 'utf8')).env
const config = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec.config.json'), 'utf8'))

function assertNoPluginToken(npx, tokenEnv = 'WALKTHROUGH_TOKEN') {
  for (const c of npx.calls()) {
    assert.strictEqual(c.token, null, `walkthrough-cli ${c.argv[0]} saw WALKTHROUGH_TOKEN; the tool would take the plugin token for a sign-in`)
    assert.ok(!c.env.includes(tokenEnv), `walkthrough-cli ${c.argv[0]} saw ${tokenEnv}`)
  }
}

test('a new project: whoami gives the address, new makes the project, token mints, the token is stored and never printed', async (t) => {
  const stub = await startStub(t, connectAnswers(['acme-shop'], [BAD_TOKEN, APPROVALS_OK]))
  const npx = makeNpx({ service: stub.url + '/' })
  const host = makeGitHost('acme-shop')
  // A stale plugin token in the caller's env: it fails the probe and must not reach the tool.
  const r = await runConnect(host, [], { npx, env: { WALKTHROUGH_TOKEN: STALE } })
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  assert.strictEqual(r.stdout, `connected acme-shop → ${stub.url}/p/acme-shop (new project)\n`)
  assert.deepStrictEqual(npx.calls().map((c) => c.argv), [
    ['whoami', '--json'],
    ['new', 'acme-shop', '--id', 'acme-shop', '--json'],
    ['token', '--project', 'acme-shop', '--json'],
  ])
  assertNoPluginToken(npx)
  assert.deepStrictEqual(npx.calls().map((c) => c.url), [null, stub.url, stub.url], 'WALKTHROUGH_URL is left alone until an address is known, then set to it')
  assert.strictEqual(stored(host).WALKTHROUGH_TOKEN, MINTED)
  assert.deepStrictEqual(config(host).walkthrough, { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' })
  assert.ok(!(r.stdout + r.stderr).includes(MINTED), 'the minted token is never printed')
})

test('an id the service already holds is joined: new refuses with the already-exists sentence, token still mints', async (t) => {
  const stub = await startStub(t, connectAnswers(['acme-shop']))
  const npx = makeNpx({ exists: true })
  const host = makeGitHost('acme-shop')
  const r = await runConnect(host, ['--base-url', stub.url, '--name', 'Acme Shop'], { npx })
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  assert.strictEqual(r.stdout, `connected acme-shop → ${stub.url}/p/acme-shop (joined existing project)\n`)
  assert.deepStrictEqual(npx.verbs(), ['whoami', 'new', 'token'])
  assert.deepStrictEqual(npx.creates()[0].argv, ['new', 'Acme Shop', '--id', 'acme-shop', '--json'])
  assert.ok(npx.calls().every((c) => c.url === stub.url), 'a --base-url reaches the tool as WALKTHROUGH_URL')
  assertNoPluginToken(npx)
  assert.strictEqual(stored(host).WALKTHROUGH_TOKEN, MINTED)
  assert.ok(!(r.stdout + r.stderr).includes(MINTED))
})

test('not signed in: refused not-signed-in naming the login command, nothing stored or written', async () => {
  const npx = makeNpx({ signedIn: false })
  const host = makeGitHost('acme-shop')
  const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { npx })
  assert.strictEqual(r.status, 1, JSON.stringify(r))
  assert.match(r.stderr, /^walkthrough-connect: not-signed-in — .* — remedy: run npx walkthrough-cli login in a terminal, then \/spec:connect again\n$/)
  assert.deepStrictEqual(npx.verbs(), ['whoami'])
  assert.ok(!fs.existsSync(path.join(host, SETTINGS_REL)))
  assert.strictEqual(config(host).walkthrough, undefined)
})

test('not on the team (and a reader): refused not-team naming the team invite, nothing stored', async () => {
  for (const team of [false, 'reader']) {
    const npx = makeNpx({ exists: true, team })
    const host = makeGitHost('acme-shop')
    const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { npx })
    assert.strictEqual(r.status, 1, JSON.stringify(r))
    assert.match(r.stderr, /^walkthrough-connect: not-team — You (are not on the team of the project|are a reader of) "acme-shop".* — remedy: ask someone on the project's team to run npx walkthrough-cli invite <your email> --team --project acme-shop\n$/)
    assert.ok(!fs.existsSync(path.join(host, SETTINGS_REL)))
    assert.strictEqual(config(host).walkthrough, undefined)
  }
})

test('an already connected host with a working token calls walkthrough-cli zero times', async (t) => {
  const stub = await startStub(t, connectAnswers(['hearwell']))
  const npx = makeNpx()
  const host = makeGitHost('hearwell', { block: block(stub.url) })
  fs.writeFileSync(path.join(host, SETTINGS_REL), JSON.stringify({ env: { WALKTHROUGH_TOKEN: MINTED } }))
  const r = await runConnect(host, [], { npx })
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  assert.strictEqual(r.stdout, `connected hearwell → ${stub.url}/p/hearwell (already connected)\n`)
  assert.deepStrictEqual(npx.calls(), [])
})

test('a custom tokenEnv is kept from the tool too', async (t) => {
  const stub = await startStub(t, connectAnswers(['hearwell'], [BAD_TOKEN, APPROVALS_OK]))
  const npx = makeNpx({ watch: ['HEARWELL_TOKEN'] })
  const host = makeGitHost('hearwell', { block: block(stub.url, { tokenEnv: 'HEARWELL_TOKEN' }) })
  const r = await runConnect(host, [], { npx, env: { HEARWELL_TOKEN: STALE, WALKTHROUGH_TOKEN: STALE } })
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  assert.deepStrictEqual(npx.verbs(), ['whoami', 'new', 'token'])
  assertNoPluginToken(npx, 'HEARWELL_TOKEN')
  assert.strictEqual(stored(host).HEARWELL_TOKEN, MINTED)
})

test('no npx on PATH: refused no-tool, exit 2; --environment is now an unknown argument', async () => {
  const host = makeGitHost('acme-shop')
  const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { path: pathWithoutNpx() })
  assert.strictEqual(r.status, 2, JSON.stringify(r))
  assert.match(r.stderr, /^walkthrough-connect: no-tool — /)
  const u = await runConnect(host, ['--environment', 'production'], { npx: makeNpx() })
  assert.strictEqual(u.status, 2, JSON.stringify(u))
  assert.match(u.stderr, /^walkthrough-connect: usage — unknown argument "--environment"/)
})
