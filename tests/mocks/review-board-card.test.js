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

test('AC-20260913-02-10: a real dispatched click on the Reply control inside the host-placed card runs the framed layer\'s own handler for it', { timeout: 45000 }, async (t) => {
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
      // Wrap the card's own "Reply" button's onclick — a real handler closure the framed layer
      // created — with a counter, BEFORE dispatching a real click at its actual on-screen
      // position (the point elementFromPoint must resolve to the button itself, never a decoy).
      // D6 deletes Withdraw and the menu no longer renders "…" for a fresh open note with no
      // thread (nothing left for it to carry) — Reply is the control this fixture actually has,
      // and with the textarea left empty its handler only focuses the box and posts nothing
      // (non-destructive), so the click-through can be proven without triggering a real reopen.
      const setup = await evalJs(
        '(function(){' +
        'var cards = Array.prototype.slice.call(document.querySelectorAll(".nl-card"));' +
        'if (!cards.length) return { error: "no card" };' +
        'var btns = Array.prototype.slice.call(cards[0].querySelectorAll("button"));' +
        'var replyBtn = null;' +
        'for (var i = 0; i < btns.length; i++) { if (btns[i].textContent === "Reply") { replyBtn = btns[i]; break } }' +
        'if (!replyBtn) return { error: "no reply button", texts: btns.map(function(b){return b.textContent}) };' +
        'window.__calls = 0;' +
        'var orig = replyBtn.onclick;' +
        'replyBtn.onclick = function (e) { window.__calls++; return orig.apply(this, arguments) };' +
        'var r = replyBtn.getBoundingClientRect();' +
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
      'AC-20260913-02-10: the host-placed card must exist with a "Reply" control to click — none was found (the pre-image never renders a card outside the frame): got ' + JSON.stringify(result.setup))
    assert.strictEqual(result.hit, 'Reply',
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

// ---------------------------------------------------------------------------
// specs/20260913/05-a-note-is-a-conversation.md D8, D9 — AC-20260913-05-13, -14, -17, all
// [env: CHROME_BIN]. Pre-image: `setMode` never calls into the parent on entering "idle" (D8's
// `__rvMarkOff` does not exist), so the review page's own `[data-rv="mark-area"]` button stays
// `aria-pressed="true"` after marking ends inside the frame — only the page's own button click or
// Escape unpresses it today. Separately, the notes layer exposes no `__nlCloseCard`, so
// `switchTab` cannot close the outgoing frame's open card — a board's `[data-rv="cardhost"]` is
// left holding the stale card after its state tab switches (D9). AC-17's card still renders
// `buildCardChrome`'s pre-image shape (Resolve/Accept/Send back/Withdraw, no session-side thread
// messages), so its message order and control set are both red.
// ---------------------------------------------------------------------------
function buildTallFixture(notes, extraMockHtml) {
  const dir = tmpdir('review-board-card-05')
  writeFileDeep(path.join(dir, 'design/mocks/seed.md'),
    '# Seed — Fixture\n\n## Product\nA synthetic product for the review-board-card test.\nBuilt for QA.\nIt must let a user complete a short flow.\n\n' +
    '## Facts\n- primary-surface: P1\n\n## References\n- none\n\n## Journeys\n### j1\nA short flow.\n```surfaces\na\n```\n')
  writeFileDeep(path.join(dir, 'design/targets.json'),
    JSON.stringify({ schemaVersion: 1, themes: ['light'], viewports: [{ name: 'desktop', width: 1440, height: 900 }] }, null, 2) + '\n')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch" style="padding:24px;height:700px">a screen with room to draw' +
    (extraMockHtml || '') + '</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), JSON.stringify(notes || [], null, 2) + '\n')
  return dir
}

test('AC-20260913-05-13: pressing Mark an area, drawing a box on the board, then discarding the draft leaves the button aria-pressed="false"', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real aria-pressed read after a real discard')
  const dir = buildTallFixture([])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1280, 900)
      await navigate(url)
      await sleep(300)
      const markBtn = await evalJs('(function(){var b=document.querySelector(\'[data-rv="mark-area"]\');if(!b)return null;var r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()')
      if (!markBtn) return { markBtn }
      await drag(send, sessionId, markBtn, markBtn, { steps: 1 })
      await sleep(150)
      const pressedAfterMark = await evalJs('(function(){var b=document.querySelector(\'[data-rv="mark-area"]\');return b ? b.getAttribute("aria-pressed") : null})()')

      const frameInfo = await evalJs('(function(){var f=document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="frame"]:not([hidden])\');if(!f)return null;var r=f.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,offsetWidth:f.offsetWidth,offsetHeight:f.offsetHeight}})()')
      if (!frameInfo) return { markBtn, pressedAfterMark, frameInfo }
      const scaleX = frameInfo.width / frameInfo.offsetWidth
      const scaleY = frameInfo.height / frameInfo.offsetHeight
      const from = { x: frameInfo.left + 60 * scaleX, y: frameInfo.top + 60 * scaleY }
      const to = { x: frameInfo.left + 320 * scaleX, y: frameInfo.top + 240 * scaleY }
      await drag(send, sessionId, from, to, { steps: 8 })
      await sleep(200)
      const discard = await evalJs('(function(){var cards=Array.prototype.slice.call(document.querySelectorAll(".nl-card"));for(var i=0;i<cards.length;i++){var btns=Array.prototype.slice.call(cards[i].querySelectorAll("button"));for(var j=0;j<btns.length;j++){if(btns[j].textContent==="Discard"){var r=btns[j].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}}}}return null})()')
      if (!discard) return { markBtn, pressedAfterMark, frameInfo, discard }
      await drag(send, sessionId, discard, discard, { steps: 1 })
      await sleep(200)
      const pressedAfterDiscard = await evalJs('(function(){var b=document.querySelector(\'[data-rv="mark-area"]\');return b ? b.getAttribute("aria-pressed") : null})()')
      return { markBtn, pressedAfterMark, frameInfo, discard, pressedAfterDiscard }
    })
    assert.ok(result.markBtn, 'setup: the review page must render a [data-rv="mark-area"] button: got ' + JSON.stringify(result))
    assert.strictEqual(result.pressedAfterMark, 'true', 'setup: pressing Mark an area must set aria-pressed="true": got ' + JSON.stringify(result))
    assert.ok(result.frameInfo, 'setup: the board\'s frame must be locatable to draw on: got ' + JSON.stringify(result))
    assert.ok(result.discard, 'setup: drawing a box must open a draft card with a Discard button: got ' + JSON.stringify(result))
    assert.strictEqual(result.pressedAfterDiscard, 'false',
      'AC-20260913-05-13: discarding the drawn box must leave Mark an area aria-pressed="false" — marking ended inside the frame, and the button must reflect it: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260913-05-14: clicking a board\'s other state tab while a note card is open on it leaves that board\'s cardhost empty', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real tab click and a real cardhost read')
  // The mock declares a second state ("empty"), so the notes layer's own activeState starts at
  // "happy" rather than "default" — the note must carry state:"happy" to render on it (regionNote's
  // default state:null only matches a screen with no declared states at all).
  const note = regionNote('N1', 0.1, 0.1, 0.3, 0.15)
  note.state = 'happy'
  const dir = buildTallFixture([note], '<button data-state-btn="empty">Empty</button>')
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1280, 900)
      await navigate(url)
      await sleep(300)
      let loc = { error: 'not tried' }
      for (let i = 0; i < 10 && loc.error; i++) {
        loc = await clickBox(evalJs, send, sessionId, 'a', 'N1')
        if (loc.error) await sleep(200)
      }
      if (loc.error) return { loc }
      await sleep(200)
      const cardhostBefore = await evalJs('(function(){var h=document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="cardhost"]\');return h ? h.children.length : null})()')
      const tab = await evalJs('(function(){var t=document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="tab"][data-state="empty"]\');if(!t)return null;var r=t.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()')
      if (!tab) return { loc, cardhostBefore, tab }
      await drag(send, sessionId, tab, tab, { steps: 1 })
      await sleep(200)
      const cardhostAfter = await evalJs('(function(){var h=document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="cardhost"]\');return h ? h.children.length : null})()')
      return { loc, cardhostBefore, tab, cardhostAfter }
    })
    assert.strictEqual(result.loc.error, undefined, 'setup: the board\'s box must be clickable to open a card: got ' + JSON.stringify(result.loc))
    assert.ok(result.cardhostBefore > 0, 'setup: the cardhost must hold the open card before the tab switch: got ' + JSON.stringify(result))
    assert.ok(result.tab, 'setup: the board must render an "empty" state tab to click: got ' + JSON.stringify(result))
    assert.strictEqual(result.cardhostAfter, 0,
      'AC-20260913-05-14: switching the board\'s state tab must leave its cardhost empty — the card belongs to the frame being hidden: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260913-05-17: a card built from an addressed note with a threaded prior exchange shows both sides in order and carries Reply/Approve/Reject alone', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real rendered card')
  const at = new Date().toISOString()
  const dir = buildTallFixture([{
    id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'too small', by: 'jj', kind: 'note',
    at, status: 'addressed',
    thread: [{ at, text: 'still small', by: 'jj', addressed: { at, change: 'made it 14px', ledgerRow: null } }],
    addressed: { at, change: 'made it 16px', ledgerRow: null },
    reply: null, resolvedBy: null, resolvedAt: null, region: trivialRegion(0.1, 0.1, 0.3, 0.15),
  }])
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
        'var c = document.querySelector(".nl-card");' +
        'if (!c) return { found: false };' +
        'var msgs = Array.prototype.slice.call(c.querySelectorAll(".nl-card-msg")).map(function(m){' +
        '  var p = m.querySelector("div"); return p ? p.textContent : m.textContent;' +
        '});' +
        'var btns = Array.prototype.slice.call(c.querySelectorAll("button")).map(function(b){return b.textContent});' +
        'return { found: true, msgs: msgs, btns: btns };' +
        '})()')
      return { loc, card }
    })
    assert.strictEqual(result.loc.error, undefined, 'setup: the board\'s box must be clickable to open the card: got ' + JSON.stringify(result.loc))
    assert.ok(result.card.found, 'AC-20260913-05-17: clicking the box must render a .nl-card: got ' + JSON.stringify(result.card))
    assert.deepStrictEqual(result.card.msgs, ['too small', 'made it 14px', 'still small', 'made it 16px'],
      'AC-20260913-05-17: the card must show both sides of the exchange, oldest first, in exactly this order: got ' + JSON.stringify(result.card.msgs))
    for (const good of ['Reply', 'Approve', 'Reject']) {
      assert.ok(result.card.btns.includes(good),
        'AC-20260913-05-17: the card must carry a "' + good + '" control: got ' + JSON.stringify(result.card.btns))
    }
    for (const bad of ['Resolve', 'Accept', 'Send back', 'Withdraw']) {
      assert.ok(!result.card.btns.includes(bad),
        'AC-20260913-05-17: the card must carry no "' + bad + '" control: got ' + JSON.stringify(result.card.btns))
    }
  } finally {
    await stop()
  }
})
