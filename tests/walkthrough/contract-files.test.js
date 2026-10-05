'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { CONTRACT, CATALOG, makeHost, runWalkthrough, loadJson, writeJson } = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-2 (D3, D4, D6):
// `walkthrough self-check` proves the two shipped JSON files agree with themselves, offline.

function selfCheck(host, extra) {
  return runWalkthrough(host, ['self-check', ...extra])
}


// Escape from 20260929/01 (found 2026-09-30): the pushRound example carried the four-step
// hearwell hash on a two-step journey and self-check, shape-only, let it through. Every
// example journey's `beats` must be the hash of its own steps, and the response must echo it.
test('every example journey with steps carries the beatHash of those steps, and the pushRound response echoes it', () => {
  const { beatHash } = require('../../spec/scripts/lib/surfaces')
  const c = loadJson(CONTRACT)
  const hash = (steps) => beatHash(steps.map((s) => ({ beat: s.beat, screen: s.screen, state: s.state || null })))
  let checked = 0
  for (const [name, ex] of Object.entries(c.examples)) {
    for (const j of ex.request?.journeys || []) {
      if (!Array.isArray(j.steps)) continue
      checked++
      assert.strictEqual(j.beats, hash(j.steps), `examples.${name}.request journey ${j.id}: beats must be the hash of its own steps`)
      const echoed = (ex.response?.journeys || []).find((r) => r.id === j.id)
      if (echoed) assert.strictEqual(echoed.beats, j.beats, `examples.${name}.response must echo the request's beats for ${j.id}`)
    }
  }
  assert.ok(checked >= 1, 'at least one example journey with steps must exist, or this test pins nothing')
})
