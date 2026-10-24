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

// Extracts from `function deriveState(` to its matching closing brace: depth-counted from the
// body's opening `{`, skipping braces inside '...', "...", `...` literals and // and /* */ comments.
function deriveStateBody(src) {
  const at = src.indexOf('function deriveState(')
  if (at === -1) return null
  let i = src.indexOf('{', src.indexOf(')', at))
  if (i === -1) return src.slice(at)
  let depth = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2)
      if (i === -1) return src.slice(at)
      i++
    } else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return src.slice(at, i + 1)
  }
  return src.slice(at)
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
  const tpl = 'function deriveState(opts) {\n  const t = `\n}\n`\n  if (!fs.existsSync(p)) return 1\n}\n'
  assert.deepStrictEqual(findBanned('tpl.js', tpl), ['tpl.js: existsSync('], 'a column-0 } inside a template literal truncated the deriveState() body, hiding banned calls after it')
  const clean = findBanned('clean.js', 'function other() { fs.existsSync(x) }\nfunction deriveState() {\n  return 1\n}\n')
  assert.deepStrictEqual(clean, [], 'a presence check outside deriveState() was flagged, banning legitimate mark-handler checks')
})
