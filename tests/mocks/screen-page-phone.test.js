'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// specs/20260913/06-every-mock-has-a-page-you-can-mark.md D2, [env: CHROME_BIN]. The screen
// page's own grid rule (`.rv-screen .rv-main`, specificity 0,2,0) outranks viewer.css's phone
// breakpoint rule (`.rv-main`, 0,1,0), so without its own re-prefixed override inside the
// `@media (max-width: 480px)` block the page keeps its desktop two-column grid on a phone while
// the inspector is pinned to the bottom sheet — the board is squeezed into a ~30px column.
// Measured through a real cascade, because selector text cannot show which rule wins.

function buildFixture() {
  const dir = tmpdir('screen-page-phone')
  const mk = (rel, content) => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  mk('design/mocks/seed.md', '# Seed — Fixture\n\n## Journeys\n### j1\nA short flow.\n```surfaces\na\n```\n')
  mk('design/mocks/a.html', '<main data-screen-label="a">A</main>\n')
  return dir
}

const PROBE = '(function () {' +
  'var main = document.querySelector(".rv-main");' +
  'var canvas = document.querySelector(".rv-canvas");' +
  'return { vw: window.innerWidth, cols: getComputedStyle(main).gridTemplateColumns,' +
  'canvasWidth: Math.round(canvas.getBoundingClientRect().width) }' +
  '})()'

test('the screen page collapses to one full-width board column at phone width and keeps its board-plus-inspector grid on desktop', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real cascade')
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/screen/a.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs, setViewport }) => {
      await setViewport(390, 844)
      await navigate(url)
      const phone = await evalJs(PROBE)
      await setViewport(1280, 800)
      await navigate(url)
      const desktop = await evalJs(PROBE)
      return { phone, desktop }
    })
    assert.strictEqual(result.phone.cols.trim().split(/\s+/).length, 1,
      'at 390px the screen page must lay out one grid column, or the board is squeezed beside an empty pane: got ' + JSON.stringify(result.phone))
    assert.strictEqual(result.phone.canvasWidth, result.phone.vw,
      'at 390px the board canvas must span the full viewport width, or the owner cannot see the screen they are marking: got ' + JSON.stringify(result.phone))
    assert.strictEqual(result.desktop.cols.trim().split(/\s+/).length, 2,
      'at 1280px the screen page must keep its board-plus-inspector grid, or the phone fix has leaked into the desktop layout: got ' + JSON.stringify(result.desktop))
  } finally {
    await stop()
  }
})
