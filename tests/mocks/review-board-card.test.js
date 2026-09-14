'use strict'
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { findChrome, serve, launchChrome, openPage, drag } = require('./chrome-harness')

// specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D6-D8, D12 —
// AC-20260913-02-9 .. -12, all [env: CHROME_BIN]. Pre-image: `.rv-shot iframe` computes
// pointer-events:none outside the `.rv-clean` screenshot mode (viewer.css line ~402), so a real
// dispatched click at a scaled board's on-screen box position never reaches the framed layer at
// all — no `__rvCardOpen`/`__rvCardClose`/`.rv-cardhost` exist yet, the card still renders inside
// the iframe's own (visually scaled) document, and `select()`'s own `__nlFocus` call always
// reveals+pulses regardless of where the click came from, then immediately erases the pulse
// class itself by calling `openNoteCard` -> `render()` -> a full `boxLayer` rebuild before the
// pulse is ever observable. Every test below drives a real headless-Chrome review page served by
// design-atlas.js (chrome-harness.js's `drag`, D13).
//
// One Chrome PROCESS for the whole file (D13 amendment, review finding 2026-09-13): 4
// `[env: CHROME_BIN]` tests each calling the single-page `withChrome` spawned 4 processes, and
// `node --test`'s default concurrency multiplied that (alongside the sibling interaction file's
// own 8) into a thrash that starved unrelated wall-clock-bounded tests elsewhere in the suite.
// `before`/`after` launch and close the ONE process this file needs; each test opens its own
// target/session (`openPage`, cheap — a new tab in the same process) against its own fresh
// `serve()` fixture, and closes only that target.

const chrome = findChrome()
let launch = null
before(async () => { if (chrome) launch = await launchChrome(chrome) })
after(async () => { if (launch) await launch.close() })

async function withPage(fn) {
  const page = await openPage(launch)
  try {
    return await fn(page)
  } finally {
    await page.close()
  }
}

function writeFileDeep(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function trivialRegion(x, y, w, h) {
  return {
    anchor: { path: [], tag: 'main', snippet: '' },
    frac: { x, y, w, h },
    layout: { arrangement: 'single', aspect: 1 },
    touched: [],
    drawnAt: { w: 100 },
  }
}

function regionNote(id, x, y, w, h) {
  return {
    id, scope: 'mock', screen: 'a', state: null, text: id + ' text', by: 'jj', kind: 'note',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null,
    resolvedAt: null, region: trivialRegion(x, y, w, h),
  }
}

// review-page.js pre-selects the FIRST open item (`items.find(isOpen)`), sorted by screen order
// then id — project-scope sorts LAST (D4), so a plain mock-scope note with no region and an id
// that sorts before the region note's own id is what keeps the box's own row starting UNselected;
// a real click is then the only thing that can move selection onto it.
function plainMockNote(id) {
  return {
    id, scope: 'mock', screen: 'a', state: null, text: id + ' text', by: 'jj', kind: 'note',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    region: null,
  }
}

// A single-screen journey ("a") whose board is declared 1440-wide (design/targets.json's first
// viewport) — wider than the review page's own inspector-narrowed column, so review.browser.js's
// own `fit()` computes `--rv-scale` strictly below 1 (D6/A4's own scenario). One region note on
// that screen gives every test a real, already-drawn box to click.
function buildFixture(notes) {
  const dir = tmpdir('review-board-card')
  writeFileDeep(path.join(dir, 'design/mocks/seed.md'),
    '# Seed — Fixture\n\n## Product\nA synthetic product for the review-board-card test.\nBuilt for QA.\nIt must let a user complete a short flow.\n\n' +
    '## Facts\n- primary-surface: P1\n\n## References\n- none\n\n## Journeys\n### j1\nA short flow.\n```surfaces\na\n```\n')
  writeFileDeep(path.join(dir, 'design/targets.json'),
    JSON.stringify({ schemaVersion: 1, themes: ['light'], viewports: [{ name: 'desktop', width: 1440, height: 900 }] }, null, 2) + '\n')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch" style="padding:24px">a screen with content to mark</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), JSON.stringify(notes, null, 2) + '\n')
  return dir
}

// locateBox(label, id): reads the board's frame + the box inside the frame's own overlay shadow
// root, and maps the box's frame-local rect through the frame's OWN CSS transform scale into the
// TOP document's real on-screen pixels — the exact geometry a real cursor sees, so a dispatched
// click here lands on the box wherever it is actually painted, scaled or not.
const LOCATE_BOX_JS =
  'function locateBox(label, id) {' +
  '  var iframe = document.querySelector(\'[data-rv="board"][data-label="\' + label + \'"] [data-rv="frame"]:not([hidden])\');' +
  '  if (!iframe) return { error: "no frame" };' +
  '  var fdoc; try { fdoc = iframe.contentDocument } catch (e) { return { error: "no contentDocument" } }' +
  '  var hosts = Array.prototype.slice.call(fdoc.querySelectorAll(".nl-host"));' +
  '  var shadow = null;' +
  '  for (var i = 0; i < hosts.length; i++) { if (hosts[i].shadowRoot && hosts[i].shadowRoot.querySelector(".nl-region")) { shadow = hosts[i].shadowRoot; break } }' +
  '  if (!shadow) return { error: "no region shadow root" };' +
  '  var box = shadow.querySelector(\'[data-id="\' + id + \'"]\');' +
  '  if (!box) return { error: "no box " + id };' +
  '  var ir = iframe.getBoundingClientRect();' +
  '  var scale = ir.width / iframe.offsetWidth;' +
  '  var br = box.getBoundingClientRect();' +
  '  var screenX = ir.left + br.left * scale, screenY = ir.top + br.top * scale;' +
  '  var screenW = br.width * scale, screenH = br.height * scale;' +
  '  return { screenX: screenX, screenY: screenY, screenW: screenW, screenH: screenH, scale: scale, iframe: { left: ir.left, top: ir.top } };' +
  '}'

async function clickBox(evalJs, send, sessionId, label, id) {
  const loc = await evalJs(LOCATE_BOX_JS + '(function(){return locateBox("' + label + '","' + id + '")})()')
  if (loc.error) return loc
  const cx = loc.screenX + loc.screenW / 2
  const cy = loc.screenY + loc.screenH / 2
  await drag(send, sessionId, { x: cx, y: cy }, { x: cx, y: cy }, { steps: 1 })
  return loc
}

test('AC-20260913-02-9: clicking a box on a review board scaled below 1 renders its card in the review page\'s own document, unscaled, outside .rv-shot, and clear of the box\'s own rectangle', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against real computed geometry')
  const dir = buildFixture([regionNote('N1', 0.1, 0.1, 0.3, 0.15)])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1280, 900)
      await navigate(url)
      await sleep(300)
      const loc = await clickBox(evalJs, send, sessionId, 'a', 'N1')
      if (loc.error) return { loc }
      await sleep(200)
      const card = await evalJs(
        '(function(){' +
        'var cards = Array.prototype.slice.call(document.querySelectorAll(".nl-card"));' +
        'if (!cards.length) return { found: false };' +
        'var c = cards[0];' +
        'var inShot = !!c.closest(\'[data-rv="shot"]\');' +
        'var cs = getComputedStyle(c);' +
        'var r = c.getBoundingClientRect();' +
        'return { found: true, insideShot: inShot, fontSize: cs.fontSize, width: r.width, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };' +
        '})()')
      return { loc, card }
    })
    assert.strictEqual(result.loc.error, undefined, 'setup: the board\'s already-drawn box must be locatable to click: got ' + JSON.stringify(result.loc))
    assert.ok(result.card.found,
      'AC-20260913-02-9: clicking the box must render a .nl-card in the review page\'s own document — none was found there (the pre-image still renders the card inside the scaled iframe, and today\'s `.rv-shot iframe { pointer-events: none }` means the click never even reaches the frame): got ' + JSON.stringify(result.card))
    assert.strictEqual(result.card.insideShot, false,
      'AC-20260913-02-9: the card must render OUTSIDE .rv-shot: got ' + JSON.stringify(result.card))
    assert.strictEqual(result.card.fontSize, '14px',
      'AC-20260913-02-9: the host-placed card must compute an unscaled 14px font-size: got ' + JSON.stringify(result.card))
    assert.ok(result.card.width >= 328,
      'AC-20260913-02-9: the host-placed card must compute a width of at least 328px: got ' + JSON.stringify(result.card))
    const c = result.card.rect
    const boxRect = { left: result.loc.screenX, top: result.loc.screenY, right: result.loc.screenX + result.loc.screenW, bottom: result.loc.screenY + result.loc.screenH }
    const overlaps = c.left < boxRect.right && c.right > boxRect.left && c.top < boxRect.bottom && c.bottom > boxRect.top
    assert.strictEqual(overlaps, false,
      'AC-20260913-02-9: the card\'s own rectangle must not intersect the box\'s rectangle: card ' + JSON.stringify(c) + ' box ' + JSON.stringify(boxRect))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-10: a real dispatched click on a control inside the host-placed card runs the framed layer\'s own handler for it', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real dispatched click and a real handler count')
  const dir = buildFixture([regionNote('N1', 0.1, 0.1, 0.3, 0.15)])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1280, 900)
      await navigate(url)
      await sleep(300)
      const loc = await clickBox(evalJs, send, sessionId, 'a', 'N1')
      if (loc.error) return { loc }
      await sleep(200)
      // Wrap the card's own "..." (more) button's onclick — a real handler closure the framed
      // layer created — with a counter, BEFORE dispatching a real click at its actual on-screen
      // position (the point elementFromPoint must resolve to the button itself, never a decoy).
      const setup = await evalJs(
        '(function(){' +
        'var cards = Array.prototype.slice.call(document.querySelectorAll(".nl-card"));' +
        'if (!cards.length) return { error: "no card" };' +
        'var btns = Array.prototype.slice.call(cards[0].querySelectorAll("button"));' +
        'var moreBtn = null;' +
        'for (var i = 0; i < btns.length; i++) { if (btns[i].textContent === "…") { moreBtn = btns[i]; break } }' +
        'if (!moreBtn) return { error: "no more button", texts: btns.map(function(b){return b.textContent}) };' +
        'window.__calls = 0;' +
        'var orig = moreBtn.onclick;' +
        'moreBtn.onclick = function (e) { window.__calls++; return orig.apply(this, arguments) };' +
        'var r = moreBtn.getBoundingClientRect();' +
        'return { x: r.left + r.width / 2, y: r.top + r.height / 2 };' +
        '})()')
      if (setup.error) return { loc, setup }
      const before = await evalJs('(function(){return window.__calls})()')
      const hit = await evalJs('(function(){var el=document.elementFromPoint(' + setup.x + ',' + setup.y + '); return el ? el.textContent : null})()')
      await drag(send, sessionId, setup, setup, { steps: 1 })
      await sleep(150)
      const after = await evalJs('(function(){return window.__calls})()')
      return { loc, setup, before, after, hit }
    })
    assert.strictEqual(result.loc.error, undefined, 'setup: the board\'s box must be locatable to open the card: got ' + JSON.stringify(result.loc))
    assert.strictEqual(result.setup.error, undefined,
      'AC-20260913-02-10: the host-placed card must exist with a "..." control to click — none was found (the pre-image never renders a card outside the frame): got ' + JSON.stringify(result.setup))
    assert.strictEqual(result.hit, '…',
      'AC-20260913-02-10: elementFromPoint at the control\'s own on-screen center must resolve to the control itself: got ' + JSON.stringify(result.hit))
    assert.strictEqual(result.before, 0, 'setup: the wrapped handler must start at 0 calls: got ' + result.before)
    assert.strictEqual(result.after, 1,
      'AC-20260913-02-10: a real dispatched click at the control\'s on-screen position must run the framed layer\'s own handler for it exactly once (0 -> 1): got ' + result.after)
  } finally {
    await stop()
  }
})

test('AC-20260913-02-11: clicking a box on a board selects that note\'s rail row and never applies the pulse class to the clicked box in the 800ms after', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real box click and a real class sample')
  const dir = buildFixture([plainMockNote('A0'), regionNote('N1', 0.1, 0.1, 0.3, 0.15)])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1280, 900)
      await navigate(url)
      await sleep(300)
      const before = await evalJs('(function(){var r=document.querySelector(\'[data-rv="row"][data-id="N1"]\');return {selectedBefore: r ? r.hasAttribute("data-selected") : null}})()')
      const loc = await clickBox(evalJs, send, sessionId, 'a', 'N1')
      if (loc.error) return { loc, before }
      const samples = []
      for (let i = 0; i < 16; i++) {
        await sleep(50)
        samples.push(await evalJs(LOCATE_BOX_JS +
          '(function(){' +
          'var iframe = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="frame"]:not([hidden])\');' +
          'var fdoc = iframe.contentDocument;' +
          'var hosts = Array.prototype.slice.call(fdoc.querySelectorAll(".nl-host"));' +
          'var shadow = null;' +
          'for (var i = 0; i < hosts.length; i++) { if (hosts[i].shadowRoot && hosts[i].shadowRoot.querySelector(".nl-region")) { shadow = hosts[i].shadowRoot; break } }' +
          'var box = shadow ? shadow.querySelector(\'[data-id="N1"]\') : null;' +
          'var row = document.querySelector(\'[data-rv="row"][data-id="N1"]\');' +
          'return { pulse: box ? box.classList.contains("pulse") : null, rowSelected: row ? row.hasAttribute("data-selected") : null };' +
          '})()'))
      }
      return { loc, before, samples }
    })
    assert.strictEqual(result.loc.error, undefined, 'setup: the board\'s box must be clickable to select it: got ' + JSON.stringify(result.loc))
    assert.strictEqual(result.before.selectedBefore, false,
      'setup: N1\'s row must start UNselected (a plain mock note sorting before it is the page\'s own first-open pick) so a subsequent click is what must move selection, not the page load: got ' + JSON.stringify(result.before))
    assert.strictEqual(result.samples.length, 16, 'setup: 16 samples over the 800ms window must be taken: got ' + result.samples.length)
    assert.ok(result.samples.every((s) => s.rowSelected === true),
      'AC-20260913-02-11: clicking the box must select its rail row, and that selection must hold for the whole sampled window: got ' + JSON.stringify(result.samples))
    assert.ok(result.samples.every((s) => s.pulse === false),
      'AC-20260913-02-11: the clicked box must never carry the "pulse" class in the 800ms after the click (the box is already under the cursor — nothing should animate it): got ' + JSON.stringify(result.samples))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-12: clicking a rail row applies the pulse class to its box, and that class resolves to a real, non-none animation', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real computed animation-name')
  const dir = buildFixture([regionNote('N1', 0.1, 0.1, 0.3, 0.15)])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1280, 900)
      await navigate(url)
      await sleep(300)
      const row = await evalJs('(function(){var r=document.querySelector(\'[data-rv="row"][data-id="N1"]\');if(!r)return null;var rect=r.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()')
      if (!row) return { row }
      await drag(send, sessionId, row, row, { steps: 1 })
      const samples = []
      for (let i = 0; i < 6; i++) {
        samples.push(await evalJs(
          '(function(){' +
          'var iframe = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="frame"]:not([hidden])\');' +
          'var fdoc = iframe.contentDocument;' +
          'var hosts = Array.prototype.slice.call(fdoc.querySelectorAll(".nl-host"));' +
          'var shadow = null;' +
          'for (var i = 0; i < hosts.length; i++) { if (hosts[i].shadowRoot && hosts[i].shadowRoot.querySelector(".nl-region")) { shadow = hosts[i].shadowRoot; break } }' +
          'var box = shadow ? shadow.querySelector(\'[data-id="N1"]\') : null;' +
          'if (!box) return { error: "no box" };' +
          'return { hasPulse: box.classList.contains("pulse"), animationName: getComputedStyle(box).animationName };' +
          '})()'))
        await sleep(60)
      }
      return { row, samples }
    })
    assert.ok(result.row, 'setup: the rail row for N1 must render to click: got ' + JSON.stringify(result))
    const withPulse = result.samples.filter((s) => s && s.hasPulse)
    assert.ok(withPulse.length > 0,
      'AC-20260913-02-12: clicking the rail row must apply the "pulse" class to its box at some point in the sampled window (today\'s __nlFocus adds it and then openNoteCard\'s own render() immediately rebuilds the box layer and erases it): got ' + JSON.stringify(result.samples))
    assert.ok(withPulse.some((s) => s.animationName !== 'none'),
      'AC-20260913-02-12: while the box carries "pulse", its computed animation-name must not be "none" — viewer.css must declare the pulse keyframes: got ' + JSON.stringify(result.samples))
  } finally {
    await stop()
  }
})
