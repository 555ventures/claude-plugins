'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// PRAX-20260719-01 (gotcha-sourced, spec 20260713/03-auth D17, build 2026-07-17): when a
// product requirement is satisfied by a library DEFAULT, an AC pinning the library's
// behavior does not observe the shipped config's engagement with it. Prax delegated abuse
// gating to better-auth's `enabled ?? isProduction` default; the behavioral AC (3 sign-ins
// → 401, 4th → 429) needed its own rate-limit-enabled instance, so it passed before any
// implementation existed — a valid library-regression pin that left the product claim
// unobserved. A future worker adding `rateLimit: { enabled: false }` to quiet a flaky test
// would disarm production abuse gating with every AC green. The fix contract: plan.md's AC
// authoring guidance must force the split — (i) pin the library mechanism behaviorally,
// (ii) assert the shipped config echo (the key's absence/presence and surface flags), and
// never assert the library's resolved internals.

const plan = fs.readFileSync(path.join(SPEC, 'commands/plan.md'), 'utf8')

// The AC-authoring bullet: from the AC shape header to the next top-level bullet.
const acBlock = (() => {
  const start = plan.indexOf('**AC shape:**')
  assert.ok(start !== -1, 'AC shape bullet missing from plan.md')
  const rest = plan.slice(start)
  const end = rest.search(/\n- \*\*/)
  return end === -1 ? rest : rest.slice(0, end)
})()

test('AC-20260813-04-6: AC guidance forces the split when a requirement rides a library default', () => {
  assert.match(acBlock, /library.{0,60}default|default.{0,60}library/is,
    'no library-default clause: an AC pinning the library mechanism passes red-free while ' +
    'the shipped config silently disengages it')
  assert.match(acBlock, /config echo|shipped config|config.{0,40}(assert|echo|presence)/is,
    'the red-capable half is the shipped-config echo assertion — without it, ' +
    '`enabled: false` ships with every AC green')
})
