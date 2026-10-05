'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261005/03-one-port-per-launch.md D9 — AC-20261005-03-17, AC-20261005-03-18.

const CAPTURE = 'scripts/proto-capture.js'
const REL = 'e2e/.auth/user.json'
const TARGET = 'http://localhost:4123/women'

// A stand-in `@playwright/test` in the host's node_modules that records newPage's options to
// <host>/newpage.json and lands the page on the requested url (so no redirect refusal fires).
function stubHost(name, stateDoc) {
  const hostDir = tmpdir(name)
  fs.writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'h', version: '0.0.0' }) + '\n')
  fs.mkdirSync(path.join(hostDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(hostDir, '.claude/spec.config.json'),
    JSON.stringify({ prototype: { url: 'http://localhost:{port}', storageState: REL } }) + '\n')
  fs.mkdirSync(path.join(hostDir, 'e2e/.auth'), { recursive: true })
  fs.writeFileSync(path.join(hostDir, REL), JSON.stringify(stateDoc))
  const pwDir = path.join(hostDir, 'node_modules/@playwright/test')
  fs.mkdirSync(pwDir, { recursive: true })
  fs.writeFileSync(path.join(pwDir, 'package.json'), JSON.stringify({ name: '@playwright/test', main: 'index.js' }) + '\n')
  fs.writeFileSync(path.join(pwDir, 'index.js'), `
const fs = require('fs')
const HOST = ${JSON.stringify(hostDir)}
let current = ''
function makeEl() { const el = {}; el['__reactFiber$x'] = { _debugOwner: null }; return el }
const els = [makeEl(), makeEl()]
globalThis.document = { querySelectorAll: () => els, body: {}, querySelector: () => ({}), fonts: null }
globalThis.window = { __protoCapture: { captureComposites: () => [{ id: 'A#0', tag: 'div' }] } }
const page = {
  goto: async (u) => { current = u }, url: () => current, addStyleTag: async () => {}, addScriptTag: async () => {},
  waitForTimeout: async () => {}, evaluate: async (fn, arg) => fn(arg),
}
exports.chromium = { launch: async () => ({
  newPage: async (opts) => { fs.writeFileSync(HOST + '/newpage.json', JSON.stringify(opts || {})); return page },
  close: async () => {},
}) }
`)
  return hostDir
}

function capture(hostDir) {
  const outFile = path.join(tmpdir('capture-port-out'), 'x.json')
  return { outFile, r: runNode(CAPTURE, ['--host', hostDir, '--url', TARGET, '--out', outFile, '--composites', 'A']) }
}

const COOKIES = [{ name: 'sid', value: 'a', domain: 'localhost', path: '/' }]

test('AC-20261005-03-17: a saved sign-in with exactly one origin on the --url hostname and another port opens the page with the state as an object whose origin is re-pointed and whose cookies are untouched', () => {
  const host = stubHost('cap-port-repoint', {
    cookies: COOKIES,
    origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'tok', value: 'x' }] }],
  })
  const { outFile, r } = capture(host)
  assert.strictEqual(r.status, 0, 'a re-pointable sign-in must capture and exit 0: ' + JSON.stringify(r))
  assert.ok(fs.existsSync(outFile), 'the capture must write --out: ' + outFile)
  const opts = JSON.parse(fs.readFileSync(path.join(host, 'newpage.json'), 'utf8'))
  assert.ok(opts.storageState && typeof opts.storageState === 'object',
    'newPage must receive the parsed state object — a path string reloads browser storage on the OLD port, so a storage-based sign-in lands on the login page: ' + JSON.stringify(opts))
  assert.strictEqual(opts.storageState.origins.length, 1, 'exactly the one saved origin must remain: ' + JSON.stringify(opts.storageState))
  assert.strictEqual(opts.storageState.origins[0].origin, 'http://localhost:4123',
    'the single saved origin must be re-pointed to the --url origin: ' + JSON.stringify(opts.storageState))
  assert.deepStrictEqual(opts.storageState.origins[0].localStorage, [{ name: 'tok', value: 'x' }],
    'the re-pointed entry must keep its localStorage exactly: ' + JSON.stringify(opts.storageState))
  assert.deepStrictEqual(opts.storageState.cookies, COOKIES,
    'cookies follow the host across ports and must never be edited: ' + JSON.stringify(opts.storageState))
})

test('AC-20261005-03-18: two saved origins on the --url hostname with neither equal to the --url origin pass the file path unchanged and name both origins in one stderr note', () => {
  const host = stubHost('cap-port-ambiguous', {
    cookies: COOKIES,
    origins: [
      { origin: 'http://localhost:3000', localStorage: [{ name: 'a', value: '1' }] },
      { origin: 'http://localhost:4000', localStorage: [{ name: 'b', value: '2' }] },
    ],
  })
  const { r } = capture(host)
  assert.strictEqual(r.status, 0, 'an ambiguous sign-in is a note, never a refusal — the capture must still exit 0: ' + JSON.stringify(r))
  const opts = JSON.parse(fs.readFileSync(path.join(host, 'newpage.json'), 'utf8'))
  assert.ok(typeof opts.storageState === 'string' && path.isAbsolute(opts.storageState) && opts.storageState.endsWith('/e2e/.auth/user.json'),
    'guessing between two same-host origins would merge two apps\' storage, so the file path must be passed unchanged: ' + JSON.stringify(opts))
  assert.ok(r.stderr.includes('cannot tell which saved origin is the app'),
    'stderr must say why browser storage was not re-pointed, or a signed-out capture has no explanation: ' + r.stderr)
  assert.ok(r.stderr.includes('http://localhost:3000') && r.stderr.includes('http://localhost:4000'),
    'the note must list both candidate origins so the person knows which to sign in again on: ' + r.stderr)
})
