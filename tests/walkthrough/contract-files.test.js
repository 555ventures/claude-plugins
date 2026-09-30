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

test('AC-20260929-01-2: self-check on the shipped files exits 0 and prints "contract ok: 7 calls" and "catalog ok: 19 components"', async () => {
  assert.ok(fs.existsSync(CONTRACT), 'spec/templates/walkthrough/contract.json must exist — the service and the plugin test against this one file: ' + CONTRACT)
  assert.ok(fs.existsSync(CATALOG), 'spec/templates/walkthrough/catalog.json must exist — the vocabulary a session validates a round against: ' + CATALOG)
  const r = await selfCheck(makeHost(null), [])
  assert.strictEqual(r.status, 0, 'self-check must pass on the shipped files, or the contract cannot be trusted by either side: ' + r.stderr)
  assert.match(r.stdout, /contract ok: 7 calls/, 'the contract verdict line is the machine-visible proof of seven calls: ' + r.stdout)
  assert.match(r.stdout, /catalog ok: 19 components/, 'the catalog verdict line is the machine-visible proof of nineteen components: ' + r.stdout)
})

test('AC-20260929-01-2: self-check exits 1 naming examples.pullNotes.response and anchor when a contract copy loses the anchor key of its example note', async () => {
  const dir = tmpdir('walkthrough-contract')
  const c = loadJson(CONTRACT)
  delete c.examples.pullNotes.response.notes[0].anchor
  const file = path.join(dir, 'contract.json')
  writeJson(file, c)
  const r = await selfCheck(makeHost(null), ['--contract', file])
  assert.strictEqual(r.status, 1, 'an example that fails its own shape must refuse (exit 1), or the service replays a broken example: ' + JSON.stringify(r))
  const out = r.stdout + r.stderr
  assert.match(out, /examples\.pullNotes\.response/, 'the refusal must name the failing example: ' + out)
  assert.match(out, /anchor/, 'the refusal must name the missing key: ' + out)
})

test('AC-20260929-01-2: self-check exits 1 naming markd when a contract copy points calls.markRound.response at a shape that does not exist', async () => {
  const dir = tmpdir('walkthrough-contract')
  const c = loadJson(CONTRACT)
  c.calls.markRound.response = 'markd'
  const file = path.join(dir, 'contract.json')
  writeJson(file, c)
  const r = await selfCheck(makeHost(null), ['--contract', file])
  assert.strictEqual(r.status, 1, 'a call naming a missing shape must refuse, or the client would validate answers against nothing: ' + JSON.stringify(r))
  assert.match(r.stdout + r.stderr, /markd/, 'the refusal must name the missing shape: ' + r.stdout + r.stderr)
})

test('AC-20260929-01-2: self-check exits 1 naming Avatar when a catalog copy has no Avatar shape', async () => {
  const dir = tmpdir('walkthrough-catalog')
  const c = loadJson(CATALOG)
  delete c.shapes.Avatar
  const file = path.join(dir, 'catalog.json')
  writeJson(file, c)
  const r = await selfCheck(makeHost(null), ['--catalog', file])
  assert.strictEqual(r.status, 1, 'a catalog short of a component must refuse, or a round using it would be judged unknown: ' + JSON.stringify(r))
  assert.match(r.stdout + r.stderr, /Avatar/, 'the refusal must name the missing component: ' + r.stdout + r.stderr)
})

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
