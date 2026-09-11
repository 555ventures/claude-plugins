'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260824/01-render-gate.md (D14/D3/D4/D5/D6): render-compare.js is the
// standalone comparison half of the render gate — a matched-pair diff over two inventory JSON
// documents with no filesystem access beyond its own --mock/--comp inputs (D14). These tests pin
// the exact literal findings and geometry-tolerance deltas the brief's two spikes measured across
// production hosts: the LCS text/order match, the dx/dw/dh tolerance floors (D4), the fixed/
// dataPositioned/srOnly GEOMETRY exclusions (D3), the positioning class-change finding that
// catches a docked-action regression dyRel cannot see (D5), and the static-control
// auto-excuse veto line (D6). AC-20260824-01-1 … AC-20260824-01-6.

const SCRIPT = 'scripts/render-compare.js'

function entry(i, text, overrides = {}) {
  return {
    i, role: 'text', text, name: null, tag: 'div',
    box: { x: 0, y: 0, w: 100, h: 20 },
    srOnly: false, fixed: false, outOfFlow: false, dataPositioned: false,
    ...overrides,
  }
}
function inv(entries) {
  return { schemaVersion: 1, theme: 'light', state: null, root: 'body', entries }
}
function compare(dir, mockDoc, compDoc, width) {
  const mockPath = path.join(dir, 'mock-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json')
  const compPath = path.join(dir, 'comp-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json')
  fs.writeFileSync(mockPath, JSON.stringify(mockDoc))
  fs.writeFileSync(compPath, JSON.stringify(compDoc))
  return runNode(SCRIPT, ['--mock', mockPath, '--comp', compPath, '--width', String(width)])
}
function onePair(dir, mockBox, compBox, text, width) {
  const mock = inv([entry(0, text, { box: mockBox })])
  const comp = inv([entry(0, text, { box: compBox })])
  return compare(dir, mock, comp, width)
}

test('a matched pair fixed on BOTH sides emits no geometry finding at any size delta — the fixed-pair exemption is a measured decision, not an oversight', () => {
  // Re-litigation: a docked CTA at 116px vs the mock's 260px
  // passed 18/18 cells and was caught by eye. Admitting dw/dh for both-fixed pairs was tried the
  // same day against every retained inventory pair and rejected on the numbers: 516 dw /
  // 130 dh findings over the human-approved corpus (headers filling their fixed bar, buttons
  // legitimately full-width against a capped mock, text-wrap inflating dh) vs ~30 on the
  // known-defective run — no separating threshold on any axis. Fixed-chrome size stays
  // human-reviewed. This test pins the exemption in BOTH directions: re-admitting geometry here
  // without a corpus that separates re-ships the 516-false-positive regression.
  const dir = tmpdir('rc-fixed-pair')
  const fx = (box) => ({ fixed: true, box })
  const mock = inv([entry(0, '追加する（2名）', { role: 'button', ...fx({ x: 65, y: 776, w: 260, h: 52 }) })])
  const comp = inv([entry(0, '追加する（2名）', { role: 'button', ...fx({ x: 137.16, y: 802.5, w: 115.69, h: 25.5 }) })])
  const r = compare(dir, mock, comp, 390)
  assert.ok(!/^geometry /m.test(r.stdout),
    'the fixed-pair GEOMETRY exemption regressed: a both-fixed pair fired a geometry finding — if this is deliberate, it needs a corpus where the accepted captures stop false-positiving (2026-08-31: 516 dw / 130 dh findings on known-good salon-os inventories), not just this incident\'s true positive: ' + r.stdout)
  assert.match(r.stdout, /geometry=0/,
    'the summary must count geometry=0 for a both-fixed pair whatever its size delta — a nonzero count here means the exemption regressed even if the finding line format changed: ' + r.stdout)
  assert.strictEqual(r.status, 0,
    'a both-fixed size divergence must pass the gate — this blind spot is covered by the human Storybook look, and a red exit here would block every host whose fixed chrome legitimately differs from its mock: ' + r.stderr)
})

