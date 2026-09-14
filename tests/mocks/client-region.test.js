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
// AC-20260913-05-7 [env: CHROME_BIN] (specs/20260913/05-a-note-is-a-conversation.md D1/D5)
// rewrites AC-20260912-12-22: colorFor now takes a TURN (session/you/done/outdated), not a
// literal status, and viewer.css's `.nl-region` comment block must name that register — the
// pre-image's own comment still reads "--v-danger open, --v-warn addressed, --v-ok resolved" and
// is genuinely red against the new register text. This same fixture (a plain open note = turn
// "session", an addressed note = turn "you", a resolved note with no resolution = turn "done")
// happens to paint the identical pixels the old open/addressed/resolved register did — D5 only
// renames the roles for the box/badge, it never recolors them — so the color assertions below
// hold, but the file is red as a whole on the comment-block assertion until D5 lands. This test
// also carries forward AC-20260913-02-13 (specs/20260913/02-the-layer-owns-one-mode-and-the-page-
// owns-the-card.md, a SHALL CONTINUE TO): the same register-colour case a session/you/done box
// resolves to danger/warn/ok is the exact behavior AC-02-13 pinned before this spec renamed the
// register's role names.
// ---------------------------------------------------------------------------
function buildTurnFixture() {
  const dir = tmpdir('client-region-turn')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch" style="padding:24px">a screen with content to mark</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([
    { id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'session mark', by: 'jj', kind: 'note',
      at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
      region: trivialRegion() },
    { id: 'N2', scope: 'mock', screen: 'a', state: null, text: 'you mark', by: 'jj', kind: 'note',
      at: new Date().toISOString(), status: 'addressed',
      addressed: { at: new Date().toISOString(), change: 'x', ledgerRow: null }, reply: null, resolvedBy: null, resolvedAt: null,
      region: trivialRegion() },
    { id: 'N3', scope: 'mock', screen: 'a', state: null, text: 'done mark', by: 'jj', kind: 'note',
      at: new Date().toISOString(), status: 'resolved', addressed: null, reply: null, resolvedBy: 'jj', resolvedAt: new Date().toISOString(),
      region: trivialRegion() },
  ], null, 2) + '\n')
  return dir
}

test('AC-20260913-05-7, AC-20260913-02-13: colorFor resolves a session, a you and a done box to danger/warn/ok respectively, and viewer.css\'s .nl-region comment block names the turn register', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-7 only runs against real computed colors'); return }
  const cssSrc = fs.readFileSync(path.join(SPEC, 'templates/mocks/viewer.css'), 'utf8')
  assert.match(cssSrc, /--v-danger session, --v-warn you, --v-ok\s+done, --v-muted outdated/,
    'D5: viewer.css\'s .nl-region comment block must name the turn register (--v-danger session, --v-warn you, --v-ok done, --v-muted outdated), never the old status-named register: got no match')
  const dir = buildTurnFixture()
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
      'var sessionBadge = shadow.querySelector(\'.nl-region[data-id="N1"] .nl-region-badge\');' +
      'var youBadge = shadow.querySelector(\'.nl-region[data-id="N2"] .nl-region-badge\');' +
      'var doneBadge = shadow.querySelector(\'.nl-region[data-id="N3"] .nl-region-badge\');' +
      'if (!sessionBadge || !youBadge || !doneBadge) return { error: "not all three badges painted", sessionFound: !!sessionBadge, youFound: !!youBadge, doneFound: !!doneBadge };' +
      'var probe = document.createElement("div"); probe.style.background = "var(--v-ok)"; shadow.appendChild(probe);' +
      'var vOkColor = getComputedStyle(probe).backgroundColor; probe.remove();' +
      'return { found: true, sessionBg: getComputedStyle(sessionBadge).backgroundColor, youBg: getComputedStyle(youBadge).backgroundColor, doneBg: getComputedStyle(doneBadge).backgroundColor, vOkColor: vOkColor };' +
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
    assert.ok(result && !result.error, 'all three marks must paint their own badge: got ' + JSON.stringify(result))
    assert.strictEqual(result.sessionBg, 'rgb(220, 38, 38)',
      'a session-turn box\'s badge must compute var(--v-danger) as its background: got ' + JSON.stringify(result))
    assert.strictEqual(result.youBg, 'rgb(217, 119, 6)',
      'a you-turn box\'s badge must compute var(--v-warn) as its background: got ' + JSON.stringify(result))
    assert.strictEqual(result.doneBg, result.vOkColor,
      'a done-turn box\'s badge must compute viewer.css\'s shadow-scoped var(--v-ok) as its background: got badge=' + result.doneBg + ' shadow var(--v-ok)=' + result.vOkColor)
    assert.notStrictEqual(result.sessionBg, result.youBg,
      'session and you must never collapse onto the same color: got ' + JSON.stringify(result))
    assert.notStrictEqual(result.youBg, result.doneBg,
      'you and done must never collapse onto the same color: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

