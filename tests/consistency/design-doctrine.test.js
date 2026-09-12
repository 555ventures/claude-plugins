'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20260912/01-the-card-explains-itself.md D7, AC-20260912-01-11: § Mocks: Client Player's
// last-screen paragraph gains one sentence naming why each row is listed and that an unanswered
// row's silence is recorded as not contested. This file was expired along with its owning specs'
// tests on 2026-09-11 and is recreated here for this spec's own doctrine pin.

function section(src, heading) {
  const re = new RegExp('^## ' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm')
  const m = re.exec(src)
  if (!m) return null
  const bodyStart = m.index + m[0].length
  const rest = src.slice(bodyStart)
  const next = rest.search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next)
}

test('AC-20260912-01-11: spec/doctrine/mocks.md § Mocks: Client Player names why each exclusion row is listed and that an unanswered row is recorded as not contested', () => {
  const file = path.join(ROOT, 'spec/doctrine/mocks.md')
  assert.ok(fs.existsSync(file), 'spec/doctrine/mocks.md must exist for this doctrine pin to check anything: missing at ' + file)
  const src = read('spec/doctrine/mocks.md')
  const body = section(src, 'Mocks: Client Player')
  assert.ok(body, 'D7\'s sentence has no home if "## Mocks: Client Player" is missing from mocks.md')

  for (const phrase of ['why each row is listed', 'recorded as not contested']) {
    const re = new RegExp(phrase.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'))
    assert.match(body, re,
      'D7: § Mocks: Client Player must carry "' + phrase + '" — its absence means the client meets ' +
      'an unexplained card with no warning that silence counts as agreement at sign-off: got\n' + body)
  }
})
