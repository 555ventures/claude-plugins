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

test('AC-20260912-12-5: POST /client/__notes/add with a valid region answers 201 with origin:"client" and that region, and POST /client/__notes/region targeting a session-origin note answers 400 naming "only a client note"', async () => {
  const dir = tmpdir('client-region-add')
  const stubPath = stubNpxScreenshot(dir, Buffer.from('before-bytes'))
  writeFileDeep(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">a</main>\n')
  const sessionNote = {
    id: 'N001', scope: 'mock', screen: 'a', state: null, text: 'a session note', by: 'jj', kind: 'note',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }
  writeNotesFile(dir, [sessionNote])

  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port, env: Object.assign({}, process.env, { PATH: stubPath }) })
  try {
    const base = 'http://127.0.0.1:' + port
    const region = trivialRegion()
    const added = await postJson(base + '/client/__notes/add', { scope: 'mock', screen: 'a', text: 'marked area', by: 'client', region })
    assert.strictEqual(added.status, 201,
      'a valid mock-scope client add must answer 201: got ' + added.status + ' ' + JSON.stringify(added.body))
    assert.strictEqual(added.body && added.body.origin, 'client',
      'the created note must carry origin:"client": got ' + JSON.stringify(added.body))
    assert.deepStrictEqual(added.body && added.body.region, region,
      'D4: the region given on the add body must pass through onto the stored note verbatim: got ' + JSON.stringify(added.body && added.body.region))

    const replaced = await postJson(base + '/client/__notes/region', { id: 'N001', region: trivialRegion(), by: 'client' })
    assert.strictEqual(replaced.status, 400,
      'D4: the client mount must refuse to re-place a SESSION-origin note\'s region: got ' + replaced.status + ' ' + JSON.stringify(replaced.body))
    assert.match((replaced.body && replaced.body.error) || '', /only a client note/,
      'D4\'s exact refusal wording ("a client re-places only a client note") must appear in the error: got ' + JSON.stringify(replaced.body))
  } finally {
    await stop()
  }
})

test('AC-20260912-12-7: the atlas index card for a screen with two open and one addressed note carries the derived nl-card-count, omitted entirely for a screen with none', async () => {
  const dir = tmpdir('client-region-atlas')
  writeFileDeep(path.join(dir, 'docs/roadmap/01.md'), '# 01\n```surfaces\na\nb\n```\n')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">a</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/b.html'), '<main data-screen-label="b">b</main>\n')
  writeNotesFile(dir, [
    { id: 'N1', scope: 'mock', screen: 'a', state: null, kind: 'note', text: 'x', by: 'jj', at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N2', scope: 'mock', screen: 'a', state: null, kind: 'note', text: 'y', by: 'jj', at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N3', scope: 'mock', screen: 'a', state: null, kind: 'note', text: 'z', by: 'jj', at: new Date().toISOString(), status: 'addressed', addressed: { at: new Date().toISOString(), change: 'fixed', ledgerRow: null }, reply: null, resolvedBy: null, resolvedAt: null },
  ])

  await withHandler(dir, async ({ get }) => {
    const res = await get('/')
    assert.strictEqual(res.status, 200, 'the atlas index must render: got ' + res.status)
    assert.match(res.body, /<span class="nl-card-count" data-open="2" data-needs="1">2 open · 1 need you<\/span>/,
      'D6: screen a\'s card must carry the exact derived count span for 2 open + 1 addressed: got no match in ' + res.body.length + ' bytes of html')
    const bIdx = res.body.indexOf('id="s-b"')
    assert.notStrictEqual(bIdx, -1, 'screen b\'s card must render at all')
    const nextIdx = res.body.indexOf('id="s-', bIdx + 1)
    const bSlice = res.body.slice(bIdx, nextIdx === -1 ? res.body.length : nextIdx)
    assert.doesNotMatch(bSlice, /nl-card-count/,
      'D6: a screen with zero open and zero needs-you notes must render no .nl-card-count at all: got a match near ' + JSON.stringify(bSlice.slice(0, 200)))
  })
})

test('AC-20260912-12-9: a client-origin request row flagged addressed.reanchored:"lost" carries data-region="outdated", a .nl-region-badge, and the D8 outdated footnote, with data-status unchanged; a resolving note carries no data-region', () => {
  const seed = { product: 'P', journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'a', states: [] }] }] }
  const lostNote = {
    id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'the marked button', by: 'client', origin: 'client', kind: null,
    at: new Date().toISOString(), status: 'addressed',
    addressed: { at: new Date().toISOString(), change: 'moved the button', ledgerRow: null, reanchored: 'lost' },
    reply: null, resolvedBy: null, resolvedAt: null, region: trivialRegion(),
  }
  const fineNote = {
    id: 'N2', scope: 'mock', screen: 'a', state: null, text: 'another request', by: 'client', origin: 'client', kind: null,
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }
  const html = buildWalkPage({ journey: 'onboarding', seed, notes: [lostNote, fineNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const { document } = parseFlatDom(html)

  const lostRow = document.querySelector('[data-wk="request"][data-id="N1"]')
  assert.ok(lostRow, 'the lost-region request must render a row at all')
  assert.strictEqual(lostRow.getAttribute('data-region'), 'outdated',
    'D4: a request whose region is flagged addressed.reanchored:"lost" must carry data-region="outdated": got ' + JSON.stringify(lostRow.getAttribute('data-region')))
  assert.strictEqual(lostRow.getAttribute('data-status'), 'addressed',
    'D4 (amended): data-status must stay the note\'s own lifecycle status — viewer.css and refreshNavDisabled both still read it: got ' + JSON.stringify(lostRow.getAttribute('data-status')))
  assert.ok(lostRow.querySelector('.nl-region-badge'),
    'D4: the outdated row must carry a .nl-region-badge, the same pill specs/20260912/11 D8 defines')
  const rowStart = html.indexOf('data-id="N1"')
  const rowEnd = html.indexOf('</article>', rowStart)
  const rowHtml = html.slice(Math.max(0, html.lastIndexOf('<article', rowStart)), rowEnd)
  assert.match(rowHtml, /Outdated — the area it marked is gone\./,
    'D4/D8: the outdated row must carry the exact footnote text: got ' + JSON.stringify(rowHtml))

  const fineRow = document.querySelector('[data-wk="request"][data-id="N2"]')
  assert.ok(fineRow, 'the resolving request must render a row at all')
  assert.strictEqual(fineRow.hasAttribute('data-region'), false,
    'a request whose region is not flagged lost must carry no data-region attribute at all: got ' + JSON.stringify(fineRow.getAttribute('data-region')))
})

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

test('AC-20260912-12-18: a served mock\'s marked region computes border-width:0px with a non-transparent background, and a dashed ::before inset -6px on every side; selecting it (class "sel") computes the ::before border-width as 2px, still dashed', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-18 only runs against real computed styles'); return }
  const dir = buildRegionFixture()
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
      'var box = shadow.querySelector(\'.nl-region[data-id="N1"]\');' +
      'if (!box) return { error: "no .nl-region[data-id=N1] painted" };' +
      'var cs = getComputedStyle(box);' +
      'var before = getComputedStyle(box, "::before");' +
      'return {' +
      '  found: true,' +
      '  borderWidth: cs.borderTopWidth,' +
      '  background: cs.backgroundColor,' +
      '  beforeStyle: before.borderTopStyle,' +
      '  beforeInsetTop: before.top, beforeInsetLeft: before.left, beforeInsetRight: before.right, beforeInsetBottom: before.bottom,' +
      '  beforeWidth: before.borderTopWidth,' +
      '  sel: box.className' +
      '};' +
      '})()'
    const CLICK =
      OVERLAY_SHADOW_JS +
      '(function () {' +
      'var shadow = findOverlayShadow();' +
      'var box = shadow ? shadow.querySelector(\'.nl-region[data-id="N1"]\') : null;' +
      'if (!box) return { error: "no box to click" };' +
      'box.click();' +
      'return { ok: true };' +
      '})()'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      let before = null
      for (let i = 0; i < 20; i++) {
        before = await evalJs(PROBE)
        if (before && before.found) break
        await new Promise((r) => setTimeout(r, 250))
      }
      if (!before || before.error) return before
      const clicked = await evalJs(CLICK)
      if (clicked && clicked.error) return Object.assign({}, before, clicked)
      await new Promise((r) => setTimeout(r, 300))
      const after = await evalJs(PROBE)
      return { before, after }
    })
    assert.ok(!result.error, 'the mark must paint and be clickable: got ' + JSON.stringify(result))
    const { before, after } = result
    assert.strictEqual(before.borderWidth, '0px',
      'D12: the mark itself must compute a border-width of 0px — it is a stroke-less tint, never an outline: got ' + JSON.stringify(before))
    assert.notStrictEqual(before.background, 'rgba(0, 0, 0, 0)',
      'D12: the mark must compute a non-transparent background (the highlighter tint): got ' + JSON.stringify(before))
    assert.strictEqual(before.beforeStyle, 'dashed',
      'D12: the mark\'s ::before frame must compute a dashed border style: got ' + JSON.stringify(before))
    assert.strictEqual(before.beforeInsetTop, '-6px', 'D12: ::before must be inset -6px on top: got ' + JSON.stringify(before))
    assert.strictEqual(before.beforeInsetLeft, '-6px', 'D12: ::before must be inset -6px on the left: got ' + JSON.stringify(before))
    assert.strictEqual(before.beforeInsetRight, '-6px', 'D12: ::before must be inset -6px on the right: got ' + JSON.stringify(before))
    assert.strictEqual(before.beforeInsetBottom, '-6px', 'D12: ::before must be inset -6px on the bottom: got ' + JSON.stringify(before))
    assert.ok(!/\bsel\b/.test(before.sel), 'setup: the box must not already carry class "sel" before it is clicked: got ' + JSON.stringify(before))
    assert.match(after.sel, /\bsel\b/, 'setup: clicking the box must select it (class "sel") so the selected treatment can be measured: got ' + JSON.stringify(after))
    assert.strictEqual(after.beforeWidth, '2px',
      'D12: a selected ("sel") mark must compute its ::before border-width as 2px, heavier than the unselected 1.5px: got ' + JSON.stringify(after))
    assert.strictEqual(after.beforeStyle, 'dashed',
      'D12: a selected mark\'s ::before must still compute a dashed border style — selection changes weight, never shape: got ' + JSON.stringify(after))
  } finally {
    await stop()
  }
})

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

test('AC-20260912-12-6: a touch pointerdown released after 100ms creates no draft; held 400ms, moved 200px and released, it opens the composer card', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-6 only runs against real pointer-event dispatch'); return }
  const dir = buildTouchFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      return evalJs(
        '(async function () {' +
        'function findHost(pred) {' +
        '  var hosts = Array.prototype.slice.call(document.querySelectorAll(".nl-host"));' +
        '  for (var i = 0; i < hosts.length; i++) { if (hosts[i].shadowRoot && pred(hosts[i].shadowRoot)) return hosts[i] }' +
        '  return null;' +
        '}' +
        'var barHost = findHost(function (r) { return Array.prototype.slice.call(r.querySelectorAll("button")).some(function (b) { return b.textContent === "Mark area" }) });' +
        'if (!barHost) return { error: "no bar host with a Mark area button" };' +
        'var markBtn = Array.prototype.slice.call(barHost.shadowRoot.querySelectorAll("button")).filter(function (b) { return b.textContent === "Mark area" })[0];' +
        'markBtn.click();' +
        'function overlayShadow() { var h = findHost(function (r) { return r.querySelector(".nl-overlay") }); return h ? h.shadowRoot : null }' +
        'function dispatchPointer(type, x, y) {' +
        '  document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: "touch", bubbles: true, cancelable: true, pointerId: 7 }));' +
        '}' +
        'function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }' +
        'var shadow0 = overlayShadow();' +
        'if (!shadow0) return { error: "no overlay shadow root — mark mode was not entered" };' +
        'dispatchPointer("pointerdown", 100, 100);' +
        'await wait(100);' +
        'var draftDuringShortHold = !!shadow0.querySelector(".nl-draft");' +
        'dispatchPointer("pointerup", 100, 100);' +
        'await wait(50);' +
        'dispatchPointer("pointerdown", 100, 100);' +
        'await wait(400);' +
        'dispatchPointer("pointermove", 100, 300);' +
        'await wait(50);' +
        'dispatchPointer("pointerup", 100, 300);' +
        'await wait(200);' +
        'var cardOpened = !!shadow0.querySelector(".nl-card");' +
        'return { draftDuringShortHold: draftDuringShortHold, cardOpened: cardOpened };' +
        '})()')
    })
    assert.ok(!result.error, 'the gesture setup (mark mode, overlay) must succeed: got ' + JSON.stringify(result))
    assert.strictEqual(result.draftDuringShortHold, false,
      'D5: a touch press released before the 350ms hold threshold must create no draft at all: got ' + JSON.stringify(result))
    assert.strictEqual(result.cardOpened, true,
      'D5: a touch press held past the hold threshold, then moved and released, must open the composer card: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

// ---------------------------------------------------------------------------
// AC-20260912-12-22 [env: CHROME_BIN] — D17 (owner ruling, 2026-09-13): the build had once
// collapsed `open` onto `--v-warn` to match the approved mock's orange, making an open box and an
// addressed one identical on every served mock; the owner reinstated the four distinct roles and
// ruled the fix must be pinned, never left as an unchecked code comment (the promise-sweep leg's
// own "orphan-decision: no carrier" finding this AC closes). Executed over two real boxes in
// headless Chrome — the strong form over a prose grep of colorFor's source.
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

test('AC-20260912-12-22: colorFor CONTINUES TO resolve an open box and an addressed box to distinct, correct colors (D17), and viewer.css\'s .nl-region comment block still describes the true four-role register', { timeout: 45000 }, async (t) => {
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

// ---------------------------------------------------------------------------
// AC-20260912-12-23 — D4 promised the client walk page BOTH specs/20260912/11 D8 footnotes (the
// outdated one AC-9 already pins, and this one); grep of tests/ for "fitted to content" found
// nothing before this test, though the code path itself was fixed at the review stage's FIRST
// disposition round (s5) — the gap was coverage, not behavior.
// ---------------------------------------------------------------------------
test('AC-20260912-12-23: a client-origin request row flagged addressed.reanchored:"children" carries a .nl-region-badge and the D8 fitted-to-content footnote, with data-status unchanged and no data-region attribute', () => {
  const seed = { product: 'P', journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'a', states: [] }] }] }
  const fittedNote = {
    id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'the marked button', by: 'client', origin: 'client', kind: null,
    at: new Date().toISOString(), status: 'addressed',
    addressed: { at: new Date().toISOString(), change: 'moved the button', ledgerRow: null, reanchored: 'children' },
    reply: null, resolvedBy: null, resolvedAt: null, region: trivialRegion(),
  }
  const html = buildWalkPage({ journey: 'onboarding', seed, notes: [fittedNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const { document } = parseFlatDom(html)

  const row = document.querySelector('[data-wk="request"][data-id="N1"]')
  assert.ok(row, 'the fitted-region request must render a row at all')
  assert.strictEqual(row.hasAttribute('data-region'), false,
    'D4 (amended): a "children" reanchor is not "lost" — the row must carry no data-region attribute at all: got ' + JSON.stringify(row.getAttribute('data-region')))
  assert.strictEqual(row.getAttribute('data-status'), 'addressed',
    'D4 (amended): data-status must stay the note\'s own lifecycle status: got ' + JSON.stringify(row.getAttribute('data-status')))
  assert.ok(row.querySelector('.nl-region-badge'),
    'D4/D8: the fitted-region row must carry a .nl-region-badge, the same pill specs/20260912/11 D8 defines')
  const rowStart = html.indexOf('data-id="N1"')
  const rowEnd = html.indexOf('</article>', rowStart)
  const rowHtml = html.slice(Math.max(0, html.lastIndexOf('<article', rowStart)), rowEnd)
  assert.match(rowHtml, /Adjusted — fitted to content on this size\./,
    'D4/D8: the fitted-region row must carry the exact footnote text: got ' + JSON.stringify(rowHtml))
})
