'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode } = require('../helpers')
const { setupHost, patchConfig, bare } = require('./fixture')

// specs/20261001/01-the-freeze-signs-in-and-derives-its-tier.md D2-D4 — AC-20261001-01-1..5, -7, -8, -19:
// proto-capture.js loads prototype.storageState, and prototype-driver.js check flags a tracked one.

const CAPTURE = 'scripts/proto-capture.js'
const REL = 'e2e/.auth/user.json'
const URL_WOMEN = 'http://localhost:3000/women'

// A stand-in `@playwright/test` in the host's node_modules: records newPage's options to
// <host>/newpage.json, writes <host>/launched on launch, and lands the page on `finalUrl`.
function stubHost(name, { finalUrl, config, stateFile }) {
  const hostDir = tmpdir(name)
  fs.writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'h', version: '0.0.0' }) + '\n')
  if (config) {
    fs.mkdirSync(path.join(hostDir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(hostDir, '.claude/spec.config.json'), JSON.stringify(config) + '\n')
  }
  if (stateFile !== undefined) {
    fs.mkdirSync(path.join(hostDir, 'e2e/.auth'), { recursive: true })
    fs.writeFileSync(path.join(hostDir, REL), stateFile)
  }
  const pwDir = path.join(hostDir, 'node_modules/@playwright/test')
  fs.mkdirSync(pwDir, { recursive: true })
  fs.writeFileSync(path.join(pwDir, 'package.json'), JSON.stringify({ name: '@playwright/test', main: 'index.js' }) + '\n')
  fs.writeFileSync(path.join(pwDir, 'index.js'), `
const fs = require('fs')
const FINAL = ${JSON.stringify(finalUrl)}
const HOST = ${JSON.stringify(hostDir)}
function makeEl() { const el = {}; el['__reactFiber$x'] = { _debugOwner: null }; return el }
const els = [makeEl(), makeEl()]
globalThis.document = { querySelectorAll: () => els, body: {}, querySelector: () => ({}), fonts: null }
globalThis.window = { __protoCapture: { captureComposites: () => [{ id: 'A#0', tag: 'div' }] } }
const page = {
  goto: async () => {}, url: () => FINAL, addStyleTag: async () => {}, addScriptTag: async () => {},
  waitForTimeout: async () => {}, evaluate: async (fn, arg) => fn(arg),
}
exports.chromium = { launch: async () => {
  fs.writeFileSync(HOST + '/launched', '1')
  return { newPage: async (opts) => { fs.writeFileSync(HOST + '/newpage.json', JSON.stringify(opts || {})); return page }, close: async () => {} }
} }
`)
  return hostDir
}

function capture(hostDir, url) {
  const outFile = path.join(tmpdir('capture-sign-in-out'), 'x.json')
  return { outFile, r: runNode(CAPTURE, ['--host', hostDir, '--url', url, '--out', outFile, '--composites', 'A']) }
}

const signedIn = () => ({ prototype: { url: 'http://localhost:3000', storageState: REL } })

test('AC-20261001-01-1: proto-capture opens the page with the declared storageState as an absolute host-resolved path and writes --out', () => {
  const host = stubHost('cap-si-ok', { finalUrl: URL_WOMEN, config: signedIn(), stateFile: '{"cookies":[],"origins":[]}' })
  const { outFile, r } = capture(host, URL_WOMEN)
  assert.strictEqual(r.status, 0, 'a valid saved sign-in must capture and exit 0, otherwise a signed-in route can never freeze: ' + JSON.stringify(r))
  assert.ok(fs.existsSync(outFile), 'a signed-in capture must write --out: ' + outFile)
  const opts = JSON.parse(fs.readFileSync(path.join(host, 'newpage.json'), 'utf8'))
  assert.ok(typeof opts.storageState === 'string' && path.isAbsolute(opts.storageState),
    'newPage must receive an absolute storageState path, or the page opens signed out and redirects to login: ' + JSON.stringify(opts))
  assert.ok(opts.storageState.endsWith('/e2e/.auth/user.json'),
    'the storageState must be the declared host-relative path resolved against --host: ' + JSON.stringify(opts))
})

test('AC-20261001-01-2: proto-capture exits 2 naming the missing sign-in file and .worktreeinclude, launching no browser and writing no --out', () => {
  const host = stubHost('cap-si-missing', { finalUrl: URL_WOMEN, config: signedIn() })
  const { outFile, r } = capture(host, URL_WOMEN)
  assert.strictEqual(r.status, 2, 'a declared sign-in file that does not exist must refuse, never capture signed out: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('prototype.storageState (e2e/.auth/user.json) does not exist at'),
    'the refusal must name the key, the declared value and that it is missing: ' + r.stderr)
  assert.ok(r.stderr.includes('.worktreeinclude'),
    'the refusal must name .worktreeinclude, the remedy for a git-ignored sign-in absent from a fresh worktree: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host, 'launched')), 'validation must run BEFORE any browser launch, or Playwright fails with its remedy-less error: ' + host)
  assert.ok(!fs.existsSync(outFile), 'a refused capture must write no --out file')
})

test('AC-20261001-01-3: proto-capture exits 2 naming an unreadable storage-state file, launching no browser and writing no --out', () => {
  const host = stubHost('cap-si-badjson', { finalUrl: URL_WOMEN, config: signedIn(), stateFile: '{not json' })
  const { outFile, r } = capture(host, URL_WOMEN)
  assert.strictEqual(r.status, 2, 'a sign-in file that is not JSON must refuse before launch: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('is not a readable storage-state JSON file'),
    'the refusal must say the file is not a readable storage-state JSON file so the remedy (re-run the sign-in setup) is discoverable: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host, 'launched')), 'a malformed sign-in must be caught before the browser launches: ' + host)
  assert.ok(!fs.existsSync(outFile), 'a refused capture must write no --out file')
})

test('AC-20261001-01-4: proto-capture exits 2 when prototype.storageState is not a path string and writes no --out', () => {
  const host = stubHost('cap-si-nonstring', { finalUrl: URL_WOMEN, config: { prototype: { url: 'http://localhost:3000', storageState: true } } })
  const { outFile, r } = capture(host, URL_WOMEN)
  assert.strictEqual(r.status, 2, 'a non-string storageState must refuse rather than be ignored and capture signed out: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('prototype.storageState must be a path string'),
    'the refusal must name the key and the expected shape: ' + r.stderr)
  assert.ok(!fs.existsSync(outFile), 'a refused capture must write no --out file')
})

test('AC-20261001-01-5: a signed-in capture that still redirects exits 2 naming the sign-in file it loaded and writes no --out', () => {
  const host = stubHost('cap-si-stale', { finalUrl: 'http://localhost:3000/login?next=/women', config: signedIn(), stateFile: '{"cookies":[],"origins":[]}' })
  const { outFile, r } = capture(host, URL_WOMEN)
  assert.strictEqual(r.status, 2, 'a stale sign-in that lands on the login page must refuse as loudly as a missing one: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('redirected from http://localhost:3000/women to http://localhost:3000/login'),
    'the refusal must still name the redirect: ' + r.stderr)
  assert.ok(r.stderr.includes('signed in from e2e/.auth/user.json'),
    'the signed-in refusal must name the sign-in file so the remedy (sign in again) points at it: ' + r.stderr)
  assert.ok(!fs.existsSync(outFile), 'a redirected capture must write no --out file — a login page is never a baseline')
})

test('AC-20261001-01-19: a signed-out redirect refusal names declaring prototype.storageState as the way out', () => {
  const host = stubHost('cap-si-out-redirect', { finalUrl: 'http://localhost:3000/login', config: { prototype: { url: 'http://localhost:3000' } } })
  const { r } = capture(host, URL_WOMEN)
  assert.strictEqual(r.status, 2, 'a signed-out redirect must still refuse: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('declare prototype.storageState'),
    'without the new remedy sentence a user hitting the login redirect has no discoverable way to capture a signed-in route: ' + r.stderr)
})

// --- prototype-driver check (doctor check 23) ---

function commitFile(dir, rel, content, msg) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), content)
  execFileSync('git', ['-C', dir, 'add', '-f', '--', rel], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8' })
}

test('AC-20261001-01-7: check exits 1 with a tracked-by-git line and a prototype.storageState finding when the sign-in file is committed', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => { cfg.prototype.storageState = REL })
  commitFile(dir, REL, '{"cookies":[],"origins":[]}\n', 'commit a sign-in by mistake')
  const r = bare(dir, ['check'])
  assert.strictEqual(r.status, 1, 'a committed sign-in holds live session cookies and must fail the check: ' + JSON.stringify(r))
  assert.ok(r.stdout.includes('prototype.storageState (e2e/.auth/user.json) is tracked by git'),
    'the finding line must name the key, the value and that git tracks it: ' + r.stdout)
  const j = bare(dir, ['check', '--json'])
  let parsed
  try { parsed = JSON.parse(j.stdout) } catch (e) { assert.fail('check --json must print parseable JSON: ' + j.stdout) }
  assert.ok((parsed.findings || []).some((f) => f.key === 'prototype.storageState'),
    'check --json must carry a findings entry keyed prototype.storageState: ' + j.stdout)
})

test('AC-20261001-01-8: check exits 0 printing nothing when the declared sign-in file is absent from disk, and again when it is present but untracked', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => { cfg.prototype.storageState = REL })
  const absent = bare(dir, ['check'])
  assert.strictEqual(absent.status, 0, 'a missing sign-in is normal between prototypes and must not be a finding: ' + JSON.stringify(absent))
  assert.strictEqual(absent.stdout.trim(), '', 'an absent sign-in must print nothing: ' + JSON.stringify(absent.stdout))
  fs.mkdirSync(path.join(dir, 'e2e/.auth'), { recursive: true })
  fs.writeFileSync(path.join(dir, REL), '{"cookies":[],"origins":[]}\n')
  const untracked = bare(dir, ['check'])
  assert.strictEqual(untracked.status, 0, 'a present but untracked sign-in is the correct state and must not be a finding: ' + JSON.stringify(untracked))
  assert.strictEqual(untracked.stdout.trim(), '', 'an untracked sign-in must print nothing: ' + JSON.stringify(untracked.stdout))
})
