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

test('AC-20260824-01-1: identical ORDER-sequence texts print missing=0 extra=0 order=0 and exit 0; a mock/component text set differing by one missing and one extra text prints text-missing/text-extra and exits 1', () => {
  const dir = tmpdir('rc1')
  const same = inv([entry(0, 'A'), entry(1, 'B'), entry(2, 'C')])
  const r1 = compare(dir, same, same, 390)
  assert.strictEqual(r1.status, 0, 'identical texts on both sides must be a clean pass, or every unmodified surface false-positives: ' + r1.stderr)
  assert.match(r1.stdout, /missing=0 extra=0 order=0/,
    'D14 output contract: the summary must report zero missing/extra/order for byte-identical ORDER text — a wrong count here means the LCS matcher does not treat equal input as a full match: ' + r1.stdout)

  const mock = inv([entry(0, 'A'), entry(1, 'B'), entry(2, 'C')])
  const comp = inv([entry(0, 'A'), entry(1, 'C'), entry(2, 'D')])
  const r2 = compare(dir, mock, comp, 390)
  assert.match(r2.stdout, /text-missing "B"/,
    'a mock text absent from the component must print text-missing "B" verbatim (D14 finding format) — a garbled or missing line hides a real content regression: ' + r2.stdout)
  assert.match(r2.stdout, /text-extra "D"/,
    'a component text the mock never drew must print text-extra "D" verbatim: ' + r2.stdout)
  assert.strictEqual(r2.status, 1, 'a missing+extra text pair must fail the gate (exit 1), never pass silently: ' + r2.stderr)
})

test('AC-20260824-01-2: two in-flow entries swapping order print one order finding and exit 1; the same swap with both sides outOfFlow prints order=0 and exits 0', () => {
  const dir = tmpdir('rc2')
  const mock = inv([entry(0, 'A'), entry(1, 'B'), entry(2, 'C')])
  const comp = inv([entry(0, 'A'), entry(1, 'C'), entry(2, 'B')])
  const r1 = compare(dir, mock, comp, 390)
  assert.match(r1.stdout, /order=1/,
    'an in-flow order swap (mock A,B,C vs comp A,C,B) must count exactly one order finding (present-both minus LCS pairs, D14): ' + r1.stdout)
  assert.strictEqual(r1.status, 1, 'an order finding must fail the gate: ' + r1.stderr)

  const oof = (i, t) => entry(i, t, { outOfFlow: true })
  const mock2 = inv([oof(0, 'STOP'), oof(1, 'IN'), oof(2, 'OUT')])
  const comp2 = inv([oof(0, 'IN'), oof(1, 'OUT'), oof(2, 'STOP')])
  const r2 = compare(dir, mock2, comp2, 390)
  assert.match(r2.stdout, /order=0/,
    'D3: outOfFlow entries are matched by presence, not position — the prax STOP,IN,OUT → IN,OUT,STOP chip reorder must print order=0, or every absolutely-positioned chip reorder false-positives: ' + r2.stdout)
  assert.strictEqual(r2.status, 0, 'an outOfFlow-only reorder must pass: ' + r2.stderr)
})

test('AC-20260824-01-3: the six pinned GEOMETRY deltas at --width 390 decide exactly as listed (one exact finding line, five presence/absence checks), and dyRel never produces a finding at any value', () => {
  const dir = tmpdir('rc3')

  // h 34 -> 19.56 (dh 42.5%): the one fully-pinned finding line.
  const r1 = onePair(dir, { x: 0, y: 0, w: 100, h: 34 }, { x: 0, y: 0, w: 100, h: 19.56 }, '+4.8%', 390)
  assert.match(r1.stdout, /geometry dh 42\.5% "\+4\.8%" \(34px → 19\.56px\)/,
    'D4: the AC\'s own literal finding line for a 42.5% height delta must print verbatim (34px and 19.56px are the raw input heights, not re-rounded): ' + r1.stdout)
  assert.strictEqual(r1.status, 1, 'a geometry finding must fail the gate: ' + r1.stderr)

  // h 22.09 -> 19.15 (dh 13.3%, under the 15% floor): no finding.
  const r2 = onePair(dir, { x: 0, y: 0, w: 100, h: 22.09 }, { x: 0, y: 0, w: 100, h: 19.15 }, 'Row2', 390)
  assert.ok(!/geometry dh/.test(r2.stdout),
    'D4: a 13.3% height delta is under the measured 15% zero-false-positive floor and must not fire: ' + r2.stdout)
  assert.strictEqual(r2.status, 0, 'no findings under every threshold must pass: ' + r2.stderr)

  // w 292 -> 257.5 (dw 8.85% of the 390px viewport): finding.
  const r3 = onePair(dir, { x: 0, y: 0, w: 292, h: 20 }, { x: 0, y: 0, w: 257.5, h: 20 }, 'Row3', 390)
  assert.match(r3.stdout, /geometry dw/, 'D4: an 8.85% width delta is over the 1% floor and must fire a geometry dw finding: ' + r3.stdout)
  assert.strictEqual(r3.status, 1, 'a geometry finding must fail the gate: ' + r3.stderr)

  // w 28 -> 26 (dw 0.51%, under the 1% floor): no finding.
  const r4 = onePair(dir, { x: 0, y: 0, w: 28, h: 20 }, { x: 0, y: 0, w: 26, h: 20 }, 'Row4', 390)
  assert.ok(!/geometry dw/.test(r4.stdout),
    'D4: a 0.51% width delta is under the measured zero-false-positive floor and must not fire: ' + r4.stdout)
  assert.strictEqual(r4.status, 0, 'no findings under every threshold must pass: ' + r4.stderr)

  // x 60 -> 77 (dx 4.36% of the 390px viewport): finding.
  const r5 = onePair(dir, { x: 60, y: 0, w: 100, h: 20 }, { x: 77, y: 0, w: 100, h: 20 }, 'Row5', 390)
  assert.match(r5.stdout, /geometry dx/, 'D4: a 4.36% x delta is over the 1% floor and must fire a geometry dx finding: ' + r5.stdout)
  assert.strictEqual(r5.status, 1, 'a geometry finding must fail the gate: ' + r5.stderr)

  // x 0 -> 3 (dx 0.77%, under the 1% floor): no finding.
  const r6 = onePair(dir, { x: 0, y: 0, w: 100, h: 20 }, { x: 3, y: 0, w: 100, h: 20 }, 'Row6', 390)
  assert.ok(!/geometry dx/.test(r6.stdout),
    'D4: a 0.77% x delta is the measured zero-false-positive floor exactly and must not fire: ' + r6.stdout)
  assert.strictEqual(r6.status, 0, 'no findings under every threshold must pass: ' + r6.stderr)

  // dyRel: a huge y delta with dx/dw/dh all zero must never produce any geometry finding.
  const r7 = onePair(dir, { x: 0, y: 0, w: 100, h: 20 }, { x: 0, y: 1000, w: 100, h: 20 }, 'Row7', 390)
  assert.ok(!/^geometry /m.test(r7.stdout),
    'D4: dyRel is computed into --json but is disabled as a finding at any value (prax D9\'s unbound-region-height poison) — a geometry line here on a y-only delta means dyRel leaked into the findings: ' + r7.stdout)
  assert.strictEqual(r7.status, 0, 'a y-only delta must never fail the gate: ' + r7.stderr)
})

test('AC-20260824-01-4: a GEOMETRY pair with dataPositioned:true on either side emits no geometry finding despite a 12.01% dx delta; the same pair with dataPositioned:false on both sides emits geometry dx 12.01% and exits 1', () => {
  const dir = tmpdir('rc4')
  const mockBox = { x: 123, y: 0, w: 100, h: 20 }
  const compBox = { x: 169.9, y: 0, w: 100, h: 20 }

  const mock1 = inv([entry(0, 'Chip', { box: mockBox, dataPositioned: true })])
  const comp1 = inv([entry(0, 'Chip', { box: compBox, dataPositioned: false })])
  const r1 = compare(dir, mock1, comp1, 390.5)
  assert.ok(!/^geometry /m.test(r1.stdout),
    'D3: dataPositioned:true on either side must exclude the pair from GEOMETRY entirely — the same 12.01% dx delta that fires below must be silent here, or the salon-os data-positioned chart-chip false positive regressed: ' + r1.stdout)
  assert.strictEqual(r1.status, 0, 'an excluded pair with no other findings must pass: ' + r1.stderr)

  const mock2 = inv([entry(0, 'Chip', { box: mockBox, dataPositioned: false })])
  const comp2 = inv([entry(0, 'Chip', { box: compBox, dataPositioned: false })])
  const r2 = compare(dir, mock2, comp2, 390.5)
  assert.match(r2.stdout, /geometry dx 12\.01%/,
    'the identical delta with dataPositioned:false on both sides must produce geometry dx 12.01% — the literal AC-20260824-01-4 pins: ' + r2.stdout)
  assert.strictEqual(r2.status, 1, 'a geometry finding must fail the gate: ' + r2.stderr)
})

test('AC-20260824-01-5: a matched pair fixed on the mock side and in-flow on the component side prints the positioning finding verbatim, exits 1, and emits no geometry finding for that pair', () => {
  const dir = tmpdir('rc5')
  const text = '本日の連絡を記録する'
  const mock = inv([entry(0, text, { fixed: true, box: { x: 0, y: 0, w: 100, h: 20 } })])
  const comp = inv([entry(0, text, { fixed: false, box: { x: 500, y: 500, w: 400, h: 400 } })])
  const r = compare(dir, mock, comp, 390)
  assert.match(r.stdout, /positioning "本日の連絡を記録する" \(mock fixed, component in-flow\)/,
    'D5: a fixed→in-flow class change must print the exact positioning line — this is the salon-os docked-action-shipped-281px-lower regression, invisible to geometry once fixed entries are excluded: ' + r.stdout)
  assert.ok(!/^geometry /m.test(r.stdout),
    'D3: a pair differing on fixed must be excluded from GEOMETRY even though its box moved far past every tolerance — a geometry line here means the exclusion regressed and the pair double-counts: ' + r.stdout)
  assert.strictEqual(r.status, 1, 'a positioning finding must fail the gate: ' + r.stderr)
})

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

test('AC-20260824-01-6: mock role button vs component role link auto-excuses with the veto line and exits 0; mock role text vs component role heading prints a role finding and exits 1', () => {
  const dir = tmpdir('rc6')
  const mock1 = inv([entry(0, 'ホーム', { role: 'button' })])
  const comp1 = inv([entry(0, 'ホーム', { role: 'link' })])
  const r1 = compare(dir, mock1, comp1, 390)
  assert.match(r1.stdout,
    /📌 Auto-picked static→link excused: "ホーム" — a static mock control renders as a real link \(veto: draw it as a link in the mock, or mark it data-contract="none"\)/,
    'D6: a button→link role change must print the exact auto-excuse veto line — every static mock control that draws navigation renders as a real link on the component side, and a missing veto line means the excuse silently became a tolerance: ' + r1.stdout)
  assert.match(r1.stdout, /excused=1/, 'the excuse must be counted under excused=1, not folded into role: ' + r1.stdout)
  assert.strictEqual(r1.status, 0, 'an auto-excused role change must not fail the gate: ' + r1.stderr)

  const mock2 = inv([entry(0, 'Title', { role: 'text' })])
  const comp2 = inv([entry(0, 'Title', { role: 'heading' })])
  const r2 = compare(dir, mock2, comp2, 390)
  assert.match(r2.stdout, /role "Title" \(mock text, component heading\)/,
    'D6: a text→heading role change is not the auto-excused static→link class — it must print an ordinary role finding, not a silent pass: ' + r2.stdout)
  assert.strictEqual(r2.status, 1, 'a role finding must fail the gate: ' + r2.stderr)
})
