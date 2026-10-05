'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fx = require('./wireframe-fixtures')

// specs/20261005/06-the-design-stage-sends-pictures.md — AC-20261005-06-15, AC-20261005-06-16 (D11):
// the round pull worklist names the spot of a note left on a picture and prints other notes unchanged.

async function pullLines(t, notes) {
  const stub = await fx.startStub(t, {
    [fx.KEY.notes]: [fx.notesAnswer(notes)],
    [fx.KEY.approvals]: [fx.approvalsAnswer([])],
  })
  const root = fx.makeRoot({ block: stub.url })
  fx.writeStatus(root)
  fx.writeRound(root, 2)
  const r = fx.runDriver(root, ['round', 'pull'])
  return { r, out: r.stdout.split('\n').map((l) => l.replace(/\s+$/, '')) }
}


test('AC-20261005-06-16: round pull continues to print a node-anchored note with its picked text and nothing after it', async (t) => {
  const n2 = fx.note('n2', { screen: 'welcome', anchor: { node: 'start', index: 0 }, pickedText: 'Start', text: 'Too small' })
  const { r, out } = await pullLines(t, [n2])
  assert.strictEqual(r.status, 0, 'a pull against an existing round must succeed: ' + r.stderr)
  assert.ok(out.includes('  n2 [welcome] "Too small" (on: "Start")'),
    'a wireframe note must print exactly as before, with no spot suffix — the existing worklist format is relied on literally: ' + r.stdout)
})
