'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260928/02-freeze-export-and-the-contract.md D1, AC-20260928-02-2, AC-20260928-02-3 —
// spec/scripts/proto-capture.js does not exist yet, so every case below is genuinely RED: node
// exits 1 with a "Cannot find module" stack rather than the documented exit 2/1 refusals.

const SCRIPT = 'scripts/proto-capture.js'

function runCapture(args) {
  return runNode(SCRIPT, args)
}

test('AC-20260928-02-2: proto-capture.js exits 2 naming @playwright/test when the host cannot resolve it', () => {
  const hostDir = tmpdir('proto-capture-nohost')
  fs.writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'nohost', version: '0.0.0' }) + '\n')
  const outFile = path.join(tmpdir('proto-capture-out'), 'x.json')
  const r = runCapture(['--host', hostDir, '--url', 'http://127.0.0.1:1/', '--out', outFile, '--composites', 'A'])
  assert.strictEqual(r.status, 2,
    'a host whose package.json cannot resolve @playwright/test must refuse with exit 2, never crash or hang trying to launch a browser: ' + JSON.stringify(r))
  assert.match(r.stderr, /@playwright\/test/,
    'the refusal must name @playwright/test specifically so the remedy (install it in the host) is discoverable: ' + r.stderr)
  assert.ok(!fs.existsSync(outFile), 'an unresolvable Playwright must write no --out file: ' + outFile)
})

test('AC-20260928-02-2: proto-capture.js exits 2 naming --composites when the flag is omitted', () => {
  const hostDir = tmpdir('proto-capture-nocomposites')
  fs.writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'h', version: '0.0.0' }) + '\n')
  const outFile = path.join(tmpdir('proto-capture-out2'), 'x.json')
  const r = runCapture(['--host', hostDir, '--url', 'http://127.0.0.1:1/', '--out', outFile])
  assert.strictEqual(r.status, 2,
    'omitting --composites must be a usage refusal (exit 2), not an attempt to capture with an empty composite set: ' + JSON.stringify(r))
  assert.match(r.stderr, /--composites/,
    'the refusal must name --composites literally so the missing flag is discoverable: ' + r.stderr)
})

function writeCapture(dir, name, doc) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n')
  return p
}

function baseCapture(entries) {
  return {
    schemaVersion: 1,
    url: 'http://localhost:3000/women',
    viewport: { width: 1280, height: 800 },
    composites: ['WomenList', 'WomanRow'],
    entries,
  }
}

test('AC-20260928-02-3: --diff reports summary {missing:1, extra:1, changed:2} and full field/before/after on changed entries, exiting 1', () => {
  const dir = tmpdir('proto-capture-diff')
  const a = baseCapture([
    { id: 'X', tag: 'div', box: [1, 2, 3, 4], text: 't', styles: { 'padding-left': '16px', color: 'red' } },
    { id: 'Y', tag: 'div', box: [5, 6, 7, 8], text: 'y', styles: { 'padding-left': '1px', color: 'blue' } },
  ])
  const b = baseCapture([
    { id: 'X', tag: 'div', box: [1, 2, 3, 8], text: 't', styles: { 'padding-left': '20px', color: 'red' } },
    { id: 'Z', tag: 'div', box: [9, 9, 9, 9], text: 'z', styles: { 'padding-left': '1px', color: 'green' } },
  ])
  const aPath = writeCapture(dir, 'a.json', a)
  const bPath = writeCapture(dir, 'b.json', b)
  const r = runCapture(['--diff', aPath, bPath])
  assert.strictEqual(r.status, 1,
    'a non-empty diff (missing/extra/changed entries all present) must exit 1: ' + JSON.stringify(r))
  let parsed
  try {
    parsed = JSON.parse(r.stdout)
  } catch (e) {
    assert.fail('--diff must print one JSON document on stdout: ' + e.message + ' — stdout was: ' + r.stdout)
  }
  assert.deepStrictEqual(parsed.summary, { missing: 1, extra: 1, changed: 2 },
    'the summary must count Y as missing (present only in the baseline a.json), Z as extra (present only in b.json), and the two field-level differences on X (padding-left, box) as two separate changed entries: ' + JSON.stringify(parsed.summary))
  const changed = parsed.entries.filter((e) => e.kind === 'changed')
  assert.strictEqual(changed.length, 2, 'exactly two changed entries (one per differing field on id X) must be printed: ' + JSON.stringify(parsed.entries))
  const paddingChange = changed.find((e) => e.field === 'styles.padding-left')
  assert.ok(paddingChange, 'one changed entry must carry field "styles.padding-left": ' + JSON.stringify(changed))
  assert.strictEqual(paddingChange.before, '16px', 'the padding-left changed entry must carry before="16px" (the baseline value): ' + JSON.stringify(paddingChange))
  assert.strictEqual(paddingChange.after, '20px', 'the padding-left changed entry must carry after="20px" (the current value): ' + JSON.stringify(paddingChange))
  const boxChange = changed.find((e) => e.field === 'box')
  assert.ok(boxChange, 'one changed entry must carry field "box": ' + JSON.stringify(changed))
  assert.deepStrictEqual(boxChange.before, [1, 2, 3, 4], 'the box changed entry must carry the baseline box as before: ' + JSON.stringify(boxChange))
  assert.deepStrictEqual(boxChange.after, [1, 2, 3, 8], 'the box changed entry must carry the current box as after: ' + JSON.stringify(boxChange))
  const missing = parsed.entries.find((e) => e.kind === 'missing')
  assert.strictEqual(missing && missing.id, 'Y', 'the missing entry must name id Y (present only in the baseline): ' + JSON.stringify(parsed.entries))
  const extra = parsed.entries.find((e) => e.kind === 'extra')
  assert.strictEqual(extra && extra.id, 'Z', 'the extra entry must name id Z (present only in the current capture): ' + JSON.stringify(parsed.entries))
})

test('AC-20260928-02-3: --diff on two identical captures exits 0 with summary all zeros', () => {
  const dir = tmpdir('proto-capture-diff-clean')
  const doc = baseCapture([
    { id: 'X', tag: 'div', box: [1, 2, 3, 4], text: 't', styles: { 'padding-left': '16px', color: 'red' } },
  ])
  const aPath = writeCapture(dir, 'a.json', doc)
  const bPath = writeCapture(dir, 'b.json', JSON.parse(JSON.stringify(doc)))
  const r = runCapture(['--diff', aPath, bPath])
  assert.strictEqual(r.status, 0,
    'two byte-for-byte-equivalent captures must diff clean and exit 0: ' + JSON.stringify(r))
  const parsed = JSON.parse(r.stdout)
  assert.deepStrictEqual(parsed.summary, { missing: 0, extra: 0, changed: 0 },
    'an identical pair must report every summary count as zero: ' + JSON.stringify(parsed.summary))
})

// A stand-in `@playwright/test` planted in the host's node_modules: the page lands on `finalUrl`
// and `evaluate` runs the real in-page function against a fake document whose elements carry the
// given fibers — so the capture's own redirect and build checks execute, with no browser.
function stubHost(name, { finalUrl, fiber }) {
  const hostDir = tmpdir(name)
  fs.writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'h', version: '0.0.0' }) + '\n')
  const pwDir = path.join(hostDir, 'node_modules/@playwright/test')
  fs.mkdirSync(pwDir, { recursive: true })
  fs.writeFileSync(path.join(pwDir, 'package.json'), JSON.stringify({ name: '@playwright/test', main: 'index.js' }) + '\n')
  fs.writeFileSync(path.join(pwDir, 'index.js'), `
const FINAL = ${JSON.stringify(finalUrl)}
const FIBER = ${JSON.stringify(fiber)}
function makeEl() { const el = {}; el['__reactFiber$x'] = FIBER; return el }
const els = [makeEl(), makeEl()]
globalThis.document = { querySelectorAll: () => els, body: {}, querySelector: () => ({}), fonts: null }
globalThis.window = { __protoCapture: { captureComposites: () => [{ id: 'A#0', tag: 'div' }] } }
const page = {
  goto: async () => {}, url: () => FINAL, addStyleTag: async () => {}, addScriptTag: async () => {},
  waitForTimeout: async () => {}, evaluate: async (fn, arg) => fn(arg),
}
exports.chromium = { launch: async () => ({ newPage: async () => page, close: async () => {} }) }
`)
  return hostDir
}

function captureWith(hostDir, url) {
  const outFile = path.join(tmpdir('proto-capture-stub-out'), 'x.json')
  return { outFile, r: runCapture(['--host', hostDir, '--url', url, '--out', outFile, '--composites', 'A']) }
}

test('proto-capture exits 2 naming the redirect and writes nothing when the route settles on a different path (a signed-out login redirect) — AC-20261001-01-6', () => {
  const host = stubHost('proto-capture-redirect', { finalUrl: 'http://localhost:3000/login?next=/women', fiber: { _debugOwner: null } })
  const { outFile, r } = captureWith(host, 'http://localhost:3000/women')
  assert.strictEqual(r.status, 2, 'a redirected capture must refuse, never record the login page as the baseline: ' + JSON.stringify(r))
  assert.match(r.stderr, /redirected from http:\/\/localhost:3000\/women to http:\/\/localhost:3000\/login/, r.stderr)
  assert.ok(!fs.existsSync(outFile), 'a redirected capture must write no --out file')
})

test('proto-capture accepts a trailing-slash or query-only difference as the same page', () => {
  const host = stubHost('proto-capture-same', { finalUrl: 'http://localhost:3000/women/?tab=1', fiber: { _debugOwner: null } })
  const { outFile, r } = captureWith(host, 'http://localhost:3000/women')
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  assert.ok(fs.existsSync(outFile))
})

test('proto-capture exits 2 naming a production build when fibers carry no _debugOwner field', () => {
  const host = stubHost('proto-capture-prod', { finalUrl: 'http://localhost:3000/women', fiber: { tag: 5 } })
  const { outFile, r } = captureWith(host, 'http://localhost:3000/women')
  assert.strictEqual(r.status, 2, JSON.stringify(r))
  assert.match(r.stderr, /production build/, 'the refusal must say production build, not "no composite": ' + r.stderr)
  assert.ok(!fs.existsSync(outFile))
})
