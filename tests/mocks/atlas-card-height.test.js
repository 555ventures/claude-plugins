'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// specs/20260912/05-the-atlas-answers-to-a-design.md AC-20260912-05-4 [env: CHROME_BIN]: the atlas
// clamps every card preview to a fixed height (D3/A1's "the card's .shot clamp is a rendered
// property, not a source property") — a mock's own declared viewport must never change its
// card's rendered .shot height, and two cards sharing a grid row must render at the same .card
// height. The AC's own worked example names a 390x844 mock and a 1280x2000 mock; a >=700px-wide
// mock renders `.card.wide{grid-column:1/-1}` (page()'s own rule), which spans the FULL grid row
// by itself and so can never sit in the same row as another card — the "two cards in the same
// grid row" half of the claim is therefore proven with a THIRD, non-wide screen (`c`, 600x900)
// alongside `a`, while the .shot-height claim is proven directly on the AC's own named pair
// (`a` 390x844, `b` 1280x2000). Needs a real served page + a real layout engine: the CSS clamp and
// the page's own `__fit` rescale script (pinned separately, by literal, in
// tests/design-atlas.test.js) do the arithmetic no static grep can observe.

function buildFixture() {
  const dir = tmpdir('atlas-card-height')
  const mk = (rel, c) => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, c)
  }
  mk('design/mocks/seed.md',
    '# Seed — Fixture\n\n## Journeys\n### j1\nA short flow.\n```surfaces\na -> b\na -> c\n```\n')
  mk('design/mocks/a.html', '<main data-screen-label="a" data-viewport="390x844">A</main>\n')
  mk('design/mocks/b.html', '<main data-screen-label="b" data-viewport="1280x2000">B</main>\n')
  mk('design/mocks/c.html', '<main data-screen-label="c" data-viewport="600x900">C</main>\n')
  return dir
}

test('AC-20260912-05-4: a 390x844 mock and a 1280x2000 mock render identical .shot heights, and two non-wide cards in the same grid row render identical .card heights', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin requires real layout/CSS clamp behavior')
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async ({ navigate, evalJs, sleep }) => {
      await navigate('http://127.0.0.1:' + port + '/atlas/index.html')
      // the page's own __fit rescale runs on each iframe's load event plus a further 250ms
      // timeout (design-atlas.js's UI_SCRIPT) — give it room to settle before reading geometry.
      await sleep(800)

      const result = await evalJs(`
        (function () {
          function rectOf(sel) { var el = document.querySelector(sel); return el ? el.getBoundingClientRect().height : null }
          return {
            aShotH: rectOf('#s-a .shot'),
            bShotH: rectOf('#s-b .shot'),
            aCardH: rectOf('#s-a'),
            cCardH: rectOf('#s-c'),
            aWide: !!document.getElementById('s-a') && document.getElementById('s-a').classList.contains('wide'),
            cWide: !!document.getElementById('s-c') && document.getElementById('s-c').classList.contains('wide'),
          }
        })()
      `)
      assert.ok(result.aShotH && result.bShotH,
        'test setup: both a\'s and b\'s .shot previews must be present in the rendered page, or the height comparison below proves nothing: got ' + JSON.stringify(result))
      assert.strictEqual(result.aWide, false, 'test setup: a (390 wide) must not carry .wide, or it would not share a grid row with c: got ' + JSON.stringify(result))
      assert.strictEqual(result.cWide, false, 'test setup: c (600 wide) must not carry .wide, or it would not share a grid row with a: got ' + JSON.stringify(result))

      assert.strictEqual(result.aShotH, result.bShotH,
        'D3: a mock\'s own declared viewport (390x844 vs 1280x2000) must never change its card\'s rendered .shot preview height — both must clamp identically: got ' + JSON.stringify(result))
      assert.strictEqual(result.aCardH, result.cCardH,
        'D3: two cards in the same grid row (a and c, neither wide) must render at the same .card height regardless of their mocks\' own viewports: got ' + JSON.stringify(result))
    })
  } finally {
    await stop()
  }
})
