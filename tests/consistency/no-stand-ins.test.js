'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('../helpers')

// specs/20261024/02-genesis-marks-and-the-no-stand-ins-test.md — AC-20261024-02-5, -6 (D3/D4):
// no driver's deriveState() reads file presence or counts.

const BANNED = ['existsSync(', 'readdirSync(', 'listManifestNumbers(', 'Math.max(...listManifestNumbers']
const DRIVERS = ['spec-review-driver.js', 'spec-build-driver.js', 'genesis-driver.js', 'prototype-driver.js', 'mocks-driver.js']

// Extracts from `function deriveState(` to its closing brace at column 0.
function deriveStateBody(src) {
  const at = src.indexOf('function deriveState(')
  if (at === -1) return null
  const end = src.indexOf('\n}', at)
  return end === -1 ? src.slice(at) : src.slice(at, end + 2)
}

// One "<driver>: <call>" string per banned call inside deriveState().
function findBanned(driver, src) {
  const body = deriveStateBody(src)
  if (body === null) return [driver + ': no function deriveState( found']
  return BANNED.filter((b) => body.includes(b)).map((b) => driver + ': ' + b)
}

test('AC-20261024-02-5: no driver deriveState() body holds a banned file-presence or count call, and spec-review-driver.js never spells Math.max(...listManifestNumbers', () => {
  const hits = []
  for (const d of DRIVERS) {
    const p = path.join(SPEC, 'scripts', d)
    assert.ok(fs.existsSync(p), d + ' is missing, so the stand-in ban silently covers fewer drivers')
    const src = fs.readFileSync(p, 'utf8')
    hits.push(...findBanned(d, src))
    if (d === 'spec-review-driver.js' && src.includes('Math.max(...listManifestNumbers')) hits.push(d + ': Math.max(...listManifestNumbers (file-wide)')
  }
  assert.deepStrictEqual(hits, [], 'a deriveState() reads a stand-in (file presence or count) instead of the recorded fact, the class behind 13 of 62 fix diffs: ' + hits.join('; '))
})

test('AC-20261024-02-6: the checker names the driver and the call when a fixture deriveState() contains fs.existsSync(', () => {
  const fixture = 'function other() { return fs.existsSync(x) }\nfunction deriveState(opts) {\n  if (!fs.existsSync(p)) return 1\n  return 2\n}\n'
  const hits = findBanned('fixture-driver.js', fixture)
  assert.deepStrictEqual(hits, ['fixture-driver.js: existsSync('], 'the checker missed a banned call inside deriveState() or flagged one outside it, so the live ban proves nothing')
  const clean = findBanned('clean.js', 'function other() { fs.existsSync(x) }\nfunction deriveState() {\n  return 1\n}\n')
  assert.deepStrictEqual(clean, [], 'a presence check outside deriveState() was flagged, banning legitimate mark-handler checks')
})
