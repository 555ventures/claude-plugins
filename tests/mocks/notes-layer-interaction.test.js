'use strict'
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { findChrome, serve, launchChrome, openPage, drag } = require('./chrome-harness')

// specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D1-D9 —
// AC-20260913-02-1 .. -8, all [env: CHROME_BIN]. The pre-image has no `setMode`/`data-mode` at
// all: marking is a bare boolean, the drag binds three `pointer*` listeners on `document`
// (never the overlay), nothing clamps a released box to the mock document, and a box click goes
// through `openNoteCard` -> `render()` -> `boxLayer.innerHTML = ''`, a full rebuild that both
// destroys DOM node identity and never re-enters mode. Every test below is a real headless-Chrome
// drag/click (chrome-harness.js's `drag`, D13) against that pre-image.
//
// One Chrome PROCESS for the whole file (D13 amendment, review finding 2026-09-13): 8
// `[env: CHROME_BIN]` tests each calling the single-page `withChrome` spawned 8 processes, and
// `node --test`'s default concurrency multiplied that into a thrash that starved unrelated
// wall-clock-bounded tests elsewhere in the suite. `before`/`after` launch and close the ONE
// process this file needs; each test opens its own target/session (`openPage`, cheap — a new tab
// in the same process) against its own fresh `serve()` fixture, and closes only that target.

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

function buildFixture(notes) {
  const dir = tmpdir('notes-layer-interaction')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch" style="width:1400px;height:850px;padding:20px">' +
    'a screen with room to draw</main>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), JSON.stringify(notes || [], null, 2) + '\n')
  return dir
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

// Every probe below redeclares this pair rather than relying on cross-eval persistence — each
// `evalJs` call is dispatched as its own independent Runtime.evaluate.
const FIND_OVERLAY_JS =
  'function findOverlayHost(){var hs=Array.prototype.slice.call(document.querySelectorAll(".nl-host"));' +
  'for(var i=0;i<hs.length;i++){if(hs[i].shadowRoot&&hs[i].shadowRoot.querySelector(".nl-overlay"))return hs[i]}return null}' +
  'function overlayEl(){var h=findOverlayHost();return h?h.shadowRoot.querySelector(".nl-overlay"):null}'

async function markingOn(evalJs) {
  await evalJs("(function(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}));return true})()")
}

test('AC-20260913-02-1: a finished drag reports mode "composing" and a press-release inside the draft card\'s own textarea spawns no additional .nl-draft', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real drag and a real mode read')
  const dir = buildFixture([])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      await markingOn(evalJs)
      await sleep(80)
      await drag(send, sessionId, { x: 200, y: 200 }, { x: 500, y: 500 })
      await sleep(200)
      const afterDrag = await evalJs(FIND_OVERLAY_JS +
        '(function(){var o=overlayEl();var ta=o&&o.querySelector("textarea");' +
        'return {mode:o&&o.getAttribute("data-mode"),hasTextarea:!!ta,' +
        'ta: ta ? (function(){var r=ta.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})() : null}})()')
      if (!afterDrag.hasTextarea) return { afterDrag: afterDrag, afterPress: null }
      await drag(send, sessionId, afterDrag.ta, afterDrag.ta, { steps: 1 })
      await sleep(150)
      const afterPress = await evalJs(FIND_OVERLAY_JS +
        '(function(){var o=overlayEl();return {draftCount:o.querySelectorAll(".nl-draft").length,mode:o.getAttribute("data-mode")}})()')
      return { afterDrag, afterPress }
    })
    assert.strictEqual(result.afterDrag.mode, 'composing',
      'AC-20260913-02-1: after a finished drag opens its draft card, the overlay must report mode "composing": got ' + JSON.stringify(result.afterDrag))
    assert.ok(result.afterDrag.hasTextarea,
      'setup: the draft card must render a textarea to press inside — got ' + JSON.stringify(result.afterDrag))
    assert.strictEqual(result.afterPress.draftCount, 0,
      'AC-20260913-02-1: a press-and-release inside the draft card\'s own textarea must create no additional .nl-draft element: got ' + JSON.stringify(result.afterPress))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-2: every intervening pointermove of a drag that crosses the layer\'s own chrome is delivered to the overlay element itself', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against real pointer capture')
  const dir = buildFixture([])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      await markingOn(evalJs)
      await sleep(80)
      // The layer's own "Marking · Esc to stop" button (`.nl-bar`) renders fixed top-right, above
      // the overlay in stacking order (z-index 9999 vs 9997) — a drag whose path crosses that
      // screen region is the exact scenario D2's own rationale names (a `closest()` guard must
      // "enumerate the layer's own chrome"). Its rendered width depends on the button's own text
      // (longer once marking is on), so the bar's rect is measured here rather than guessed: the
      // press starts clear of its left edge and the drag sweeps through its full width to well
      // past its right edge.
      const barRect = await evalJs(
        '(function(){var hs=Array.prototype.slice.call(document.querySelectorAll(".nl-host"));' +
        'var bar=null;for(var i=0;i<hs.length;i++){if(hs[i].shadowRoot){var b=hs[i].shadowRoot.querySelector(".nl-bar");if(b){bar=b;break}}}' +
        'var r=bar.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()')
      const barY = (barRect.top + barRect.bottom) / 2
      const from = { x: Math.max(10, barRect.left - 80), y: barY }
      const to = { x: Math.min(1430, barRect.right + 80), y: barY }
      await evalJs(FIND_OVERLAY_JS +
        '(function(){var o=overlayEl();window.__moves=[];' +
        'document.addEventListener("pointermove",function(e){var p=e.composedPath();window.__moves.push(p[0]===o)},true);' +
        'return true})()')
      await drag(send, sessionId, from, to)
      await sleep(150)
      return evalJs('(function(){return {moves: window.__moves}})()')
    })
    assert.strictEqual(result.moves.length, 8, 'setup: the drag must have produced 8 pointermove samples to inspect: got ' + JSON.stringify(result.moves))
    assert.ok(result.moves.every(Boolean),
      'AC-20260913-02-2: every one of the drag\'s 8 pointermoves must target the overlay element (composedPath()[0] === overlay), even where the layer\'s own chrome sits on top of the drag path: got ' + JSON.stringify(result.moves))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-3: a drag released past the mock document\'s own edges captures a region clamped to that document\'s scrollWidth/scrollHeight', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real captured region')
  const dir = tmpdir('notes-layer-interaction-clamp')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<html><head><style>html,body{margin:0}</style></head><body>' +
    '<main data-screen-label="a" data-status="sketch" style="width:1440px;height:900px">a 1440x900 page</main>' +
    '</body></html>\n')
  writeFileDeep(path.join(dir, 'design/mocks/notes.json'), '[]\n')
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      await markingOn(evalJs)
      await sleep(80)
      await drag(send, sessionId, { x: 1200, y: 800 }, { x: 1600, y: 1200 })
      await sleep(200)
      const afterDrag = await evalJs(FIND_OVERLAY_JS +
        '(function(){var o=overlayEl();var ta=o&&o.querySelector("textarea");' +
        'return {hasTextarea:!!ta, save: (function(){if(!o)return null;var btns=Array.prototype.slice.call(o.querySelectorAll("button"));' +
        'for(var i=0;i<btns.length;i++){if(btns[i].textContent==="Save note"){var r=btns[i].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}}}return null})()}})()')
      if (!afterDrag.hasTextarea || !afterDrag.save) return { afterDrag, region: null }
      await evalJs(FIND_OVERLAY_JS + '(function(){var o=overlayEl();var ta=o.querySelector("textarea");ta.value="a note";return true})()')
      await drag(send, sessionId, afterDrag.save, afterDrag.save, { steps: 1 })
      let region = null
      for (let i = 0; i < 20; i++) {
        region = await evalJs(FIND_OVERLAY_JS +
          '(function(){var o=overlayEl();var b=o&&o.querySelector(".nl-region");if(!b)return null;' +
          'var r=b.getBoundingClientRect();return {w:r.width,h:r.height}})()')
        if (region) break
        await sleep(150)
      }
      return { afterDrag, region }
    })
    assert.ok(result.afterDrag.hasTextarea, 'setup: the draft card must open so the note can be saved: got ' + JSON.stringify(result.afterDrag))
    assert.ok(result.afterDrag.save, 'setup: the draft card must carry a "Save note" button: got ' + JSON.stringify(result.afterDrag))
    assert.ok(result.region,
      'AC-20260913-02-3: an unclamped capture past the document\'s own edges produces a region.frac outside [0,1], which the server\'s own validation refuses (400) — the note never saves and no .nl-region ever renders to measure: got ' + JSON.stringify(result))
    assert.ok(result.region.w <= 240 + 0.5,
      'AC-20260913-02-3: a press at (1200,800) released 400px past a 1440-wide document must capture a box whose width is at most 240 (documentElement.scrollWidth - press.x), never the unclamped ~1029: got ' + JSON.stringify(result.region))
    assert.ok(result.region.h <= 100 + 0.5,
      'AC-20260913-02-3: the same release 400px past a 900-tall document must capture a box whose height is at most 100 (documentElement.scrollHeight - press.y), never the unclamped ~1029: got ' + JSON.stringify(result.region))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-4: Escape pressed while a drag is live removes the draft rectangle and reports mode "arming", never "idle" or "drawing"', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real mode read')
  const dir = buildFixture([])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      await markingOn(evalJs)
      await sleep(80)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 200, button: 'left', clickCount: 1 }, sessionId)
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 260, y: 260, button: 'left', buttons: 1 }, sessionId)
      await sleep(50)
      await evalJs("(function(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true})()")
      await sleep(100)
      return evalJs(FIND_OVERLAY_JS + '(function(){var o=overlayEl();return {mode:o&&o.getAttribute("data-mode"),draftCount:o?o.querySelectorAll(".nl-draft").length:-1}})()')
    })
    assert.strictEqual(result.draftCount, 0,
      'AC-20260913-02-4: Escape during a live drag must remove the draft rectangle: got ' + JSON.stringify(result))
    assert.strictEqual(result.mode, 'arming',
      'AC-20260913-02-4: Escape during a live drag must report mode "arming" (not "idle", not "drawing"): got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-5: a mouse drag released less than 12px from its press point creates no region, opens no card, and reports mode "arming"', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real click-threshold read')
  const dir = buildFixture([])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      const before = await evalJs(FIND_OVERLAY_JS + '(function(){var o=overlayEl();return {regions:o.querySelectorAll(".nl-region").length}})()')
      await markingOn(evalJs)
      await sleep(80)
      await drag(send, sessionId, { x: 100, y: 100 }, { x: 106, y: 106 })
      await sleep(150)
      const after = await evalJs(FIND_OVERLAY_JS +
        '(function(){var o=overlayEl();return {mode:o.getAttribute("data-mode"),regions:o.querySelectorAll(".nl-region").length,hasCard:!!o.querySelector(".nl-card")}})()')
      return { before, after }
    })
    assert.strictEqual(result.after.regions, result.before.regions,
      'AC-20260913-02-5: a sub-12px release must create no new .nl-region: before ' + JSON.stringify(result.before) + ' after ' + JSON.stringify(result.after))
    assert.strictEqual(result.after.hasCard, false,
      'AC-20260913-02-5: a sub-12px release must open no card: got ' + JSON.stringify(result.after))
    assert.strictEqual(result.after.mode, 'arming',
      'AC-20260913-02-5: a sub-12px release must report mode "arming" (a click, not a box): got ' + JSON.stringify(result.after))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-6: the overlay\'s cursor and pointer-events derive from data-mode alone, with no inline cursor or pointer-events style set by the layer', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against real computed styles')
  const dir = buildFixture([])
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      const READ = FIND_OVERLAY_JS +
        '(function(){var h=findOverlayHost();var o=overlayEl();var cs=getComputedStyle(o);' +
        'return {mode:o.getAttribute("data-mode"),pe:cs.pointerEvents,cursor:cs.cursor,touchAction:cs.touchAction,' +
        'overlayInlineCursor:o.style.cursor,overlayInlinePe:o.style.pointerEvents,' +
        'hostInlineCursor:h.style.cursor,hostInlinePe:h.style.pointerEvents}})()'
      const idle = await evalJs(READ)
      await evalJs("(function(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}));return true})()")
      await sleep(80)
      const arming = await evalJs(READ)
      return { idle, arming }
    })
    assert.strictEqual(result.idle.pe, 'none', 'AC-20260913-02-6: at data-mode="idle" the overlay must compute pointer-events:none: got ' + JSON.stringify(result.idle))
    assert.notStrictEqual(result.idle.cursor, 'crosshair', 'AC-20260913-02-6: at idle the overlay must not compute a crosshair cursor: got ' + JSON.stringify(result.idle))
    assert.strictEqual(result.arming.pe, 'auto', 'AC-20260913-02-6: at data-mode="arming" the overlay must compute pointer-events:auto: got ' + JSON.stringify(result.arming))
    assert.strictEqual(result.arming.cursor, 'crosshair', 'AC-20260913-02-6: at arming the overlay must compute cursor:crosshair: got ' + JSON.stringify(result.arming))
    assert.strictEqual(result.arming.touchAction, 'none', 'AC-20260913-02-6: at arming the overlay must compute touch-action:none: got ' + JSON.stringify(result.arming))
    for (const snap of [result.idle, result.arming]) {
      assert.strictEqual(snap.overlayInlineCursor, '', 'AC-20260913-02-6: the layer must set no inline cursor style on the overlay element: got ' + JSON.stringify(snap))
      assert.strictEqual(snap.overlayInlinePe, '', 'AC-20260913-02-6: the layer must set no inline pointer-events style on the overlay element: got ' + JSON.stringify(snap))
      assert.strictEqual(snap.hostInlineCursor, '', 'AC-20260913-02-6: the layer must set no inline cursor style on the overlay\'s host: got ' + JSON.stringify(snap))
      assert.strictEqual(snap.hostInlinePe, '', 'AC-20260913-02-6: the layer must set no inline pointer-events style on the overlay\'s host: got ' + JSON.stringify(snap))
    }
  } finally {
    await stop()
  }
})

test('AC-20260913-02-7: clicking one of three painted boxes keeps every box\'s DOM node identity and moves selection by class alone', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against real DOM node identity')
  const notes = [regionNote('B1', 0.05, 0.05, 0.2, 0.1), regionNote('B2', 0.4, 0.05, 0.2, 0.1), regionNote('B3', 0.75, 0.05, 0.2, 0.1)]
  const dir = buildFixture(notes)
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      let before = null
      for (let i = 0; i < 20; i++) {
        before = await evalJs(FIND_OVERLAY_JS +
          '(function(){var o=overlayEl();var boxes=Array.prototype.slice.call(o.querySelectorAll(".nl-region"));' +
          'if(boxes.length<3)return null;window.__pre={};boxes.forEach(function(b){window.__pre[b.getAttribute("data-id")]=b});' +
          'var b2=o.querySelector(\'[data-id="B2"]\');var r=b2.getBoundingClientRect();' +
          'return {ids:boxes.map(function(b){return b.getAttribute("data-id")}),click:{x:r.left+r.width/2,y:r.top+r.height/2}}})()')
        if (before) break
        await sleep(150)
      }
      if (!before) return { before, after: null }
      await drag(send, sessionId, before.click, before.click, { steps: 1 })
      await sleep(150)
      const after = await evalJs(FIND_OVERLAY_JS +
        '(function(){var o=overlayEl();var res={};for(var id in window.__pre){var cur=o.querySelector(\'[data-id="\'+id+\'"]\');' +
        'res[id]={same:cur===window.__pre[id],sel:cur?cur.classList.contains("sel"):null}}' +
        'return {res:res,hasSel:o.classList.contains("has-sel")}})()')
      return { before, after }
    })
    assert.ok(result.before, 'setup: all three boxes must render before the click: got ' + JSON.stringify(result))
    assert.ok(result.after, 'setup: the click must run: got ' + JSON.stringify(result))
    for (const id of ['B1', 'B2', 'B3']) {
      assert.strictEqual(result.after.res[id].same, true,
        'AC-20260913-02-7: box ' + id + ' must be the SAME DOM node across the click (a keyed reconcile, not a rebuild): got ' + JSON.stringify(result.after.res))
    }
    assert.strictEqual(result.after.res.B2.sel, true, 'AC-20260913-02-7: the clicked box (B2) must carry the "sel" class: got ' + JSON.stringify(result.after.res))
    assert.strictEqual(result.after.res.B1.sel, false, 'AC-20260913-02-7: an unclicked box (B1) must not carry "sel": got ' + JSON.stringify(result.after.res))
    assert.strictEqual(result.after.res.B3.sel, false, 'AC-20260913-02-7: an unclicked box (B3) must not carry "sel": got ' + JSON.stringify(result.after.res))
    assert.strictEqual(result.after.hasSel, true, 'AC-20260913-02-7: the overlay must carry "has-sel" once a box is selected: got ' + JSON.stringify(result.after))
  } finally {
    await stop()
  }
})

test('AC-20260913-02-8: with one box selected, every unselected sibling box computes opacity 0.45 and the selected one computes opacity 1', { timeout: 45000 }, async (t) => {
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real computed opacity')
  const notes = [regionNote('B1', 0.05, 0.05, 0.2, 0.1), regionNote('B2', 0.4, 0.05, 0.2, 0.1)]
  const dir = buildFixture(notes)
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/mocks/a.html'
    const result = await withPage(async ({ navigate, evalJs, setViewport, send, sessionId, sleep }) => {
      await setViewport(1440, 900)
      await navigate(url)
      let click = null
      for (let i = 0; i < 20; i++) {
        click = await evalJs(FIND_OVERLAY_JS +
          '(function(){var o=overlayEl();var b1=o.querySelector(\'[data-id="B1"]\');if(!b1)return null;' +
          'var r=b1.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()')
        if (click) break
        await sleep(150)
      }
      if (!click) return null
      await drag(send, sessionId, click, click, { steps: 1 })
      // viewer.css's `.nl-region { transition: opacity .15s }` means a single sample taken at
      // exactly 150ms races the transition's own clock (a one-frame delay before it even starts
      // leaves the value at ~0.4538, never the settled 0.45) — poll instead, up to a bound well
      // past the transition's own duration, and read the LAST sample if it never truly settles.
      let last = null
      for (let i = 0; i < 20; i++) {
        await sleep(50)
        last = await evalJs(FIND_OVERLAY_JS +
          '(function(){var o=overlayEl();var b1=o.querySelector(\'[data-id="B1"]\');var b2=o.querySelector(\'[data-id="B2"]\');' +
          'return {selOpacity:getComputedStyle(b1).opacity,unselOpacity:getComputedStyle(b2).opacity}})()')
        if (last.selOpacity === '1' && last.unselOpacity === '0.45') break
      }
      return last
    })
    assert.ok(result, 'setup: both boxes must render and the click must run: got ' + JSON.stringify(result))
    assert.strictEqual(result.selOpacity, '1', 'AC-20260913-02-8: the selected box must settle at computed opacity 1: got ' + JSON.stringify(result))
    assert.strictEqual(result.unselOpacity, '0.45', 'AC-20260913-02-8: an unselected sibling box must settle at computed opacity 0.45 (polled up to 1s past the click, past the .15s transition): got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})
