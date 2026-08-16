'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// JJ-20260815-06 (found while adjudicating the review of specs/20260814/05-collision-closure.md,
// 2026-08-15): PRAX-20260801-01's inline-join fix (dc-extract-inline-join.test.js) reunites a
// sentence split by <b>/<i>, but it decides "am I inside one sentence?" by whether a text run has
// started — and every formatted block starts with a whitespace-only text node. So the run also
// swallows the NEXT sibling element, and two semantically distinct siblings fed by two different
// props merge into one contract string. A salon-os mock hit this: a queue tile's
// `<span>要送信</span><span class="qdot">対応待ち</span>` — a queue name and its status chip —
// extracted as one string, which no correct implementation can render, so the fail-closed
// fidelity gate demanded a composite that cannot exist.
//
// The obvious guard — refuse to absorb an element into a run carrying no real text yet
// (`if (!normText(buf)) break`) — was measured during that review and is NOT the fix: it splits
// the queue tile correctly but regresses the very case the join exists for, because a block
// written as `<p>⏎<b>New:</b> rest` also has no real text before the tag. Both shapes are
// whitespace-then-element; only the SUFFIX distinguishes them (an emphasis run continues into
// trailing prose in the same run; a sibling chip does not).
//
// This test is the intake carrier. It is RED against HEAD (shapes 2 and 4) and RED against the
// naive guard (shapes 3 and 4) — deliberately one test, so the pin does not flip green depending
// on whether the unmerged salon-os guard happens to be in the working tree. It goes green only
// when the join distinguishes emphasis-inside-a-sentence from adjacent sibling elements.

const SCRIPT = 'scripts/dc-extract.js'

function copyEntries(html) {
  const dir = tmpdir('dcxanchor')
  const src = path.join(dir, 'in.dc.html')
  const out = path.join(dir, 'out')
  fs.writeFileSync(src, '<html><head><style>:root { --color-bg: #fff; }</style></head>' +
    `<body><x-dc id="s">${html}</x-dc></body></html>`)
  const res = runNode(SCRIPT, [src, out])
  assert.strictEqual(res.status, 0, `dc-extract must exit 0 on a well-formed mock: ${res.stderr}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'extract.json'), 'utf8'))
  return manifest.surfaces[0].entries.filter(e => e.kind === 'copy').map(e => e.value)
}

test('JJ-20260815-06: the inline-text join separates adjacent sibling elements while still reuniting one sentence split by emphasis, whatever whitespace precedes the first tag', () => {
  assert.deepStrictEqual(
    copyEntries('<div><span>AAA</span><span class="qdot">BBB</span></div>'),
    ['AAA', 'BBB'],
    'two sibling elements with NO whitespace text node before them are two distinct copy ' +
    'contracts fed by two props — merging them hands the fidelity gate a composite string no ' +
    'component can render (this shape is the control: it already behaves correctly, so a ' +
    'failure here means a fix broke the case that was never broken)')

  assert.deepStrictEqual(
    copyEntries('<div>\n  <span>CCC</span><span class="qdot">DDD</span>\n</div>'),
    ['CCC', 'DDD'],
    'the SAME two siblings, differing only by the whitespace-only text node that formatting a ' +
    'block introduces, must not merge into "CCCDDD" — a leading whitespace node is not evidence ' +
    'that a sentence has begun, and treating it as such is the salon-os queue-tile defect')

  assert.deepStrictEqual(
    copyEntries('<p>\n<b>GGG:</b> hhh iii</p>'),
    ['GGG: hhh iii'],
    'a sentence whose emphasis leads the line is still ONE sentence a reader sees — splitting it ' +
    'into "GGG:" and "hhh iii" reintroduces PRAX-20260801-01 (fragment strings no component ' +
    'renders in isolation), which is why refusing to absorb into an empty run is not the fix')

  assert.deepStrictEqual(
    copyEntries('<p><b>JJJ:</b> kkk lll</p>'),
    ['JJJ: kkk lll'],
    'the same emphasis-led sentence with no leading whitespace must join too — it splits today, ' +
    'so the join is already inconsistent about identical copy depending only on source ' +
    'formatting, and any fix that reads whitespace instead of the trailing run leaves this red')
})
