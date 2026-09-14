'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, freePort, serveAtlas, postJson, withHandler, parseFlatDom, SPEC } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D4/D5/D6/D12/D17 — AC-20260912-12-5,
// -6 ([env: CHROME_BIN]), -7, -9, -10, -18 ([env: CHROME_BIN]), -22 ([env: CHROME_BIN]), -23.
// AC-22 and -23 were added at the review stage's second disposition round (2026-09-13): AC-22
// carries D17's own citation (the Decision cited it before the bullet existed — a `promise-sweep`
// orphan-decision finding); AC-23 covers the "fitted to content on this size" footnote D4 promised
// but AC-9 never pinned. POST /client/__notes/region does not
// exist as a client-only, origin-checked route at all today (grep of design-atlas.js finds only
// the shared, unguarded /__notes/region handler, which a client-mount request already reaches
// with no origin check — AC-5's second clause is genuinely red). notes-layer.browser.js wires
// only mouse events — AC-6 is red. design-atlas.js's atlas card carries no .nl-card-count — AC-7
// is red. walk-page.js's renderWalkRequest emits no data-region/.nl-region-badge/footnote — AC-9
// is red. AC-10 (refreshNavDisabled blocking on data-status alone) is a SHALL CONTINUE TO,
// sanctioned green pre-image. AC-18 (D12's computed two-part mark) was disposed s6 at the review
// stage's disposition step (2026-09-13): its owning File Plan row promised this pin and it was
// never written, leaving AC-20260912-12-18 uncovered though the behavior itself already worked.

const { buildWalkPage } = require(path.join(SPEC, 'scripts/lib/walk-page.js'))

function writeFileDeep(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function notesPath(dir) { return path.join(dir, 'design/mocks/notes.json') }
function writeNotesFile(dir, notes) { writeFileDeep(notesPath(dir), JSON.stringify(notes, null, 2) + '\n') }

function trivialRegion() {
  return {
    anchor: { path: [], tag: 'main', snippet: '' },
    frac: { x: 0, y: 0, w: 1, h: 1 },
    layout: { arrangement: 'single', aspect: 1 },
    touched: [],
    drawnAt: { w: 100 },
  }
}

// file-local PATH-stub for `npx … playwright screenshot … <out>` — copies a fixed byte buffer
// to the invocation's last argv item, same shape as mocks-driver-fixtures.js's own
// stubNpxScreenshot (not imported: that module pulls in the whole mocks-driver fixture surface
// for one helper this file has no other use for).
function stubNpxScreenshot(dir, bytes) {
  const binDir = path.join(dir, 'npx-shot-bin')
  fs.mkdirSync(binDir, { recursive: true })
  const src = path.join(dir, 'shot-src.png')
  fs.writeFileSync(src, bytes)
  const npxPath = path.join(binDir, 'npx')
  fs.writeFileSync(npxPath, '#!/usr/bin/env bash\nlast="${@: -1}"\ncp "' + src + '" "$last"\nexit 0\n')
  fs.chmodSync(npxPath, 0o755)
  return binDir + path.delimiter + process.env.PATH
}


test('AC-20260912-12-10: refreshNavDisabled CONTINUES TO leave the confirm button disabled when the journey\'s only request article carries data-region="outdated" and data-status="open"', async () => {
  const seed = { product: 'P', journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'a', states: [] }] }] }
  const openNote = {
    id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'a request', by: 'client', origin: 'client', kind: null,
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }
  let html = buildWalkPage({ journey: 'onboarding', seed, notes: [openNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  // D4 (amended)'s data-region is not yet built (this same file's own AC-9 pins it red) — for
  // THIS test the exact mechanism that put data-region on the markup does not matter, only that
  // refreshNavDisabled ignores it; the attribute is spliced onto the real server-rendered request
  // article by hand so the test still exercises the real init/apply/refreshNavDisabled chain.
  const needle = 'data-id="N1" data-label="a" data-status="open"'
  assert.ok(html.includes(needle), 'setup: the request article\'s exact attribute order must match what this splice targets — got no match in the rendered page')
  html = html.replace(needle, needle + ' data-region="outdated"')

  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/walk.browser.js'), 'utf8')
  const { document } = parseFlatDom(html)
  const sandbox = {
    document,
    window: { prompt: () => 'jj', addEventListener() {} },
    location: { pathname: '/client/walk/onboarding.html', origin: 'http://localhost:5173' },
    fetch(url) {
      if (String(url).includes('/client/__walk/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reached: [], misses: [], confirmedAt: null, sentence: null }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    },
    console,
  }
  const vm = require('node:vm')
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  for (let i = 0; i < 12; i++) await Promise.resolve()

  const navBtn = document.querySelector('[data-wk-role="nav"]')
  assert.ok(navBtn, 'the page must render one nav button')
  assert.strictEqual(navBtn.getAttribute('data-wk'), 'confirm',
    'this fixture\'s one-screen journey must render the confirm role from the start: got ' + JSON.stringify(navBtn.getAttribute('data-wk')))
  assert.strictEqual(navBtn.hasAttribute('disabled'), true,
    'refreshNavDisabled must CONTINUE TO disable the confirm button while the journey\'s only request is open/addressed, whatever data-region says: got no disabled attribute')
})

// ---------------------------------------------------------------------------
// AC-20260912-12-18 [env: CHROME_BIN] — D12's two-part mark, computed in a real headless Chrome
// against a served mock carrying one region note. Same shadow-DOM traversal chrome-harness.js's
// other callers use: the box lives inside a `.nl-host`'s shadow root, never in light DOM.
// ---------------------------------------------------------------------------
function buildRegionFixture() {
  const dir = tmpdir('client-region-mark')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch" style="padding:24px">a screen with content to mark</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([
    { id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'marked area', by: 'jj', kind: 'note',
      at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
      region: trivialRegion() },
  ], null, 2) + '\n')
  return dir
}


// ---------------------------------------------------------------------------
// AC-20260912-12-6 [env: CHROME_BIN] — real pointer events dispatched on `document` (the same
// target notes-layer.browser.js's current mousedown/mousemove/mouseup listen on) in a real
// headless Chrome, over a served, non-clean mock so the layer (and its mark mode) is actually
// injected.
// ---------------------------------------------------------------------------
function buildTouchFixture() {
  const dir = tmpdir('client-region-touch')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch" style="height:600px">a screen with room to draw</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), '[]\n')
  return dir
}


// ---------------------------------------------------------------------------
// AC-20260912-12-22 [env: CHROME_BIN] — D17 (owner ruling, 2026-09-13): the build had once
// collapsed `open` onto `--v-warn` to match the approved mock's orange, making an open box and an
// addressed one identical on every served mock; the owner reinstated the four distinct roles and
// ruled the fix must be pinned, never left as an unchecked code comment (the promise-sweep leg's
// own "orphan-decision: no carrier" finding this AC closes). Executed over two real boxes in
// headless Chrome — the strong form over a prose grep of colorFor's source.
// AC-20260913-02-13 (a SHALL CONTINUE TO, reuses this case verbatim, unmodified by that spec's
// own D1-D12): the layer's mode/pointer-capture/reconcile rewrite touches none of colorFor's role
// derivation or viewer.css's `.nl-region` comment block, so this same case is this AC's own
// coverage — sanctioned green pre- and post-change.
// ---------------------------------------------------------------------------
function buildD17Fixture() {
  const dir = tmpdir('client-region-d17')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch" style="padding:24px">a screen with content to mark</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([
    { id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'open mark', by: 'jj', kind: 'note',
      at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
      region: trivialRegion() },
    { id: 'N2', scope: 'mock', screen: 'a', state: null, text: 'addressed mark', by: 'jj', kind: 'note',
      at: new Date().toISOString(), status: 'addressed',
      addressed: { at: new Date().toISOString(), change: 'x', ledgerRow: null }, reply: null, resolvedBy: null, resolvedAt: null,
      region: trivialRegion() },
  ], null, 2) + '\n')
  return dir
}

test('AC-20260912-12-22, AC-20260913-02-13: colorFor CONTINUES TO resolve an open box and an addressed box to distinct, correct colors (D17), and viewer.css\'s .nl-region comment block still describes the true four-role register', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-22 only runs against real computed colors'); return }
  const cssSrc = fs.readFileSync(path.join(SPEC, 'templates/mocks/viewer.css'), 'utf8')
  assert.match(cssSrc, /--v-danger open, --v-warn addressed, --v-ok\s+resolved, --v-muted outdated\/withdrawn/,
    'D17: viewer.css\'s .nl-region comment block must still describe the true four-role register (never the collapsed-onto-warn register the build once shipped): got no match')
  const dir = buildD17Fixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const OVERLAY_SHADOW_JS =
      'function findOverlayShadow() {' +
      '  var hosts = Array.prototype.slice.call(document.querySelectorAll(".nl-host"));' +
      '  for (var i = 0; i < hosts.length; i++) { if (hosts[i].shadowRoot && hosts[i].shadowRoot.querySelector(".nl-overlay")) return hosts[i].shadowRoot }' +
      '  return null;' +
      '}'
    const PROBE =
      OVERLAY_SHADOW_JS +
      '(function () {' +
      'var shadow = findOverlayShadow();' +
      'if (!shadow) return { error: "no overlay shadow root — the layer never mounted" };' +
      'var openBadge = shadow.querySelector(\'.nl-region[data-id="N1"] .nl-region-badge\');' +
      'var addrBadge = shadow.querySelector(\'.nl-region[data-id="N2"] .nl-region-badge\');' +
      'if (!openBadge || !addrBadge) return { error: "not both badges painted", openFound: !!openBadge, addrFound: !!addrBadge };' +
      'return { found: true, openBg: getComputedStyle(openBadge).backgroundColor, addressedBg: getComputedStyle(addrBadge).backgroundColor };' +
      '})()'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      let r = null
      for (let i = 0; i < 20; i++) {
        r = await evalJs(PROBE)
        if (r && r.found) break
        await new Promise((res) => setTimeout(res, 250))
      }
      return r
    })
    assert.ok(result && !result.error, 'both marks must paint their own badge: got ' + JSON.stringify(result))
    assert.strictEqual(result.openBg, 'rgb(220, 38, 38)',
      'D17: an open box\'s badge must compute var(--v-danger) as its background, never the review page\'s shared orange: got ' + JSON.stringify(result))
    assert.strictEqual(result.addressedBg, 'rgb(217, 119, 6)',
      'D17: an addressed box\'s badge must compute var(--v-warn) as its background: got ' + JSON.stringify(result))
    assert.notStrictEqual(result.openBg, result.addressedBg,
      'D17: open and addressed must never collapse onto the same color — that is the exact regression the owner\'s ruling exists to prevent: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

