'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { HELLO_OK, makeHost, block, seedRound, startStub, runWalkthrough, loadJson } = require('./fixture')

// specs/20261005/06-the-design-stage-sends-pictures.md — AC-20261005-06-17 (D12): the unchanged
// client stores a picture note's coordinate anchor as received.

test('AC-20261005-06-17: pull-notes continues to exit 0 and write a note with a coordinate anchor and null pickedText into notes.json with the anchor unchanged', async (t) => {
  const anchor = { x: 0.25, y: 0.5, width: 390 }
  const n = {
    id: 'n1', round: 2, screen: 'owner-intro', anchor, pickedText: null, status: 'open',
    text: 'Is this total in dollars?', author: 'client',
    thread: [{ by: 'client', text: 'Is this total in dollars?', at: '2026-10-05T10:00:00Z' }], at: '2026-10-05T10:00:00Z',
  }
  const stub = await startStub(t, {
    'GET /v1': [HELLO_OK],
    'GET /v1/projects/hearwell/notes': [{ status: 200, body: { apiVersion: 1, notes: [n], journeys: [], cursor: 'c-1' } }],
  })
  const host = makeHost(block(stub.url))
  seedRound(host, 2)
  const r = await runWalkthrough(host, ['pull-notes', '--round', '2'])
  assert.strictEqual(r.status, 0, 'a picture note must not be refused by the client, or no picture note ever reaches the worklist: ' + JSON.stringify(r))
  const file = loadJson(path.join(host, 'design/rounds/2/notes.json'))
  assert.strictEqual(file.notes.length, 1, 'the pulled note must be written to notes.json: ' + JSON.stringify(file))
  assert.deepStrictEqual(file.notes[0].anchor, anchor, 'the coordinate anchor must be stored unchanged — a dropped or reshaped anchor loses the spot the client marked')
})
