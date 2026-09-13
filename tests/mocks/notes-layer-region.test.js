'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// specs/20260912/11-a-note-can-mark-an-area.md D4-D8, AC-20260912-11-10/-11/-13/-14. Boots a
// served mock in headless Chrome (tests/mocks/chrome-harness.js) and drives the overlay/card/
// composer chrome that lives inside notes-layer.browser.js's shadow-hosted `.nl-host` elements —
// none of it exists yet on the pre-image, so every case here fails or errors until D4-D8 land.
// Each test is `[env: CHROME_BIN]` and skips, named, with no Chrome resolved. Does NOT touch
// NotesAnchor.capture/resolve directly (tests/mocks/notes-anchor.test.js) or the served
// /__notes/* route bodies over plain HTTP (tests/mocks/notes-region-store.test.js).

function snippetOf(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40)
}

// Shared browser-side helpers, spliced into every evalJs call: the overlay/bar/strip/card chrome
// all lives behind `.nl-host` shadow roots (the isolation invariant notes-layer-isolation.test.js
// pins), so a plain document.querySelector never reaches it.
const NL_HELPERS = [
  'function nlHosts(){return Array.prototype.slice.call(document.querySelectorAll(".nl-host"))}',
  'function nlQAll(sel){var out=[];nlHosts().forEach(function(h){if(h.shadowRoot)out=out.concat(',
  'Array.prototype.slice.call(h.shadowRoot.querySelectorAll(sel)))});return out}',
  'function nlByText(sel,text){return nlQAll(sel).find(function(el){return el.textContent&&el.textContent.indexOf(text)!==-1})}',
  'function nlDrag(x1,y1,x2,y2){function fire(type,x,y){var t=document.elementFromPoint(x,y)||document;',
  'var e=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});t.dispatchEvent(e);return t}',
  'fire("mousedown",x1,y1);fire("mousemove",(x1+x2)/2,(y1+y2)/2);fire("mousemove",x2,y2);fire("mouseup",x2,y2)}',
].join('\n')

function withHelpers(bodyStr) {
  return '(async function(){\n' + NL_HELPERS + '\n' + bodyStr + '\n})()'
}

function readNotesOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/notes.json'), 'utf8'))
}

// AC-10's own fixture: a root with a three-card row at x = 0/340/680 (each 320 wide, 300 tall) —
// the same geometry AC-1's fake-DOM fixture uses, so the drag (330,4)->(990,294) touches exactly
// cards 1 and 2, never card 0.
function buildDrawFixtureRoot() {
  const dir = tmpdir('notes-region-draw')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/booking.html'), [
    '<!doctype html><html><body style="margin:0">',
    '<div data-screen-label="booking" style="position:relative;width:1000px;height:300px">',
    '<div style="position:absolute;left:0px;top:0px;width:320px;height:300px">Riverside clinic</div>',
    '<div style="position:absolute;left:340px;top:0px;width:320px;height:300px">Northgate clinic</div>',
    '<div style="position:absolute;left:680px;top:0px;width:320px;height:300px">Home visit</div>',
    '</div></body></html>',
  ].join(''))
  return dir
}

// AC-11's fixture: one root holding a data-state-btn pair (default/error) and a single anchor
// element whose layout never changes — only the region's own `anchor.path` decides whether it
// resolves. N-A's path is walked off the anchor element's (childless) tree on purpose.
function buildOutdatedFixtureRoot() {
  const dir = tmpdir('notes-region-outdated')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const anchorText = 'Error state note anchor for resolve test'
  fs.writeFileSync(path.join(dir, 'design/mocks/booking.html'), [
    '<!doctype html><html><body style="margin:0">',
    '<div data-screen-label="booking">',
    '<div data-contract="none"><button data-state-btn="default">Default</button>',
    '<button data-state-btn="error">Error</button></div>',
    '<div style="width:400px;height:200px">' + anchorText + '</div>',
    '</div></body></html>',
  ].join(''))
  const region = {
    drawnAt: { w: 400 },
    anchor: { path: [1], tag: 'div', snippet: snippetOf(anchorText) },
    frac: { x: 0, y: 0, w: 1, h: 1 },
    layout: { arrangement: 'single', aspect: 2 },
    touched: [],
  }
  const base = { scope: 'mock', screen: 'booking', by: 'JJ', at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null }
  const noteA = Object.assign({ id: 'N-A', state: 'default', text: 'gone' }, base,
    { region: Object.assign({}, region, { anchor: Object.assign({}, region.anchor, { path: [1, 9] }) }) })
  const noteB = Object.assign({ id: 'N-B', state: 'error', text: 'still there' }, base, { region })
  fs.writeFileSync(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([noteA, noteB], null, 2) + '\n')
  return dir
}

// AC-13/-14's fixture: one addressed note whose region resolves against a single, never-reflowed
// anchor element — the card interactions under test never touch the anchor math itself.
function buildAddressedFixtureRoot(id) {
  const dir = tmpdir('notes-region-addressed')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const text = 'Accept and reject test anchor'
  fs.writeFileSync(path.join(dir, 'design/mocks/booking.html'),
    '<!doctype html><html><body style="margin:0"><div data-screen-label="booking">' +
    '<div style="width:400px;height:200px">' + text + '</div></div></body></html>')
  const region = {
    drawnAt: { w: 400 },
    anchor: { path: [0], tag: 'div', snippet: snippetOf(text) },
    frac: { x: 0, y: 0, w: 1, h: 1 },
    layout: { arrangement: 'single', aspect: 2 },
    touched: [],
  }
  const note = {
    id, scope: 'mock', screen: 'booking', state: 'default', text: 'fix this', by: 'JJ',
    at: new Date().toISOString(), status: 'addressed',
    addressed: { at: new Date().toISOString(), change: 'redrew it', ledgerRow: null },
    reply: null, resolvedBy: null, resolvedAt: null, region,
  }
  fs.writeFileSync(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([note], null, 2) + '\n')
  return dir
}

test('AC-20260912-11-10: drawing a box with Mark area opens a focused composer card, and Save note posts a region touching exactly the two dragged-over cards, painting a new open box', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin requires a real drag plus shadow-DOM card interaction')
  const dir = buildDrawFixtureRoot()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async ({ navigate, evalJs, setViewport }) => {
      await setViewport(1200, 900)
      await navigate('http://127.0.0.1:' + port + '/mocks/booking.html')

      const marked = await evalJs(withHelpers(
        'var b=nlByText(".nl-btn","Mark area");if(!b)return "no-button";b.click();return "ok"'))
      assert.strictEqual(marked, 'ok',
        'the bar must carry a "Mark area" toggle (.nl-btn) — without it marking mode can never start: got ' + marked)

      await evalJs(withHelpers('nlDrag(330,4,990,294);return true'))

      const cardState = await evalJs(withHelpers([
        'var card=nlQAll(".nl-card")[0];',
        'if(!card)return {found:false};',
        'var ta=card.querySelector("textarea");',
        'var save=Array.prototype.slice.call(card.querySelectorAll("button")).find(function(b){return /Save note/.test(b.textContent)});',
        'var active=(card.getRootNode&&card.getRootNode().activeElement)||document.activeElement;',
        'return {found:true, hasTextarea: !!ta, focused: ta===active, hasSave: !!save}',
      ].join('\n')))
      assert.ok(cardState.found,
        'releasing a >=12x12 drag while marking must open a .nl-card with the draft composer — none was found after the drag')
      assert.ok(cardState.hasTextarea, 'the draft card must carry a textarea for the note text: ' + JSON.stringify(cardState))
      assert.ok(cardState.focused,
        'the draft card\'s textarea must be focused immediately (D7) — a composer that does not focus breaks the type-and-go flow: ' + JSON.stringify(cardState))
      assert.ok(cardState.hasSave, 'the draft card must carry a "Save note" button: ' + JSON.stringify(cardState))

      await evalJs(withHelpers([
        'var card=nlQAll(".nl-card")[0];',
        'var ta=card.querySelector("textarea");',
        'ta.value="two cards";',
        'ta.dispatchEvent(new Event("input",{bubbles:true}));',
        'var save=Array.prototype.slice.call(card.querySelectorAll("button")).find(function(b){return /Save note/.test(b.textContent)});',
        'save.click();',
        'return true',
      ].join('\n')))

      let notes = []
      for (let i = 0; i < 20 && !notes.length; i++) {
        await new Promise((r) => setTimeout(r, 200))
        try { notes = readNotesOf(dir) } catch (e) { notes = [] }
      }
      assert.strictEqual(notes.length, 1,
        'Save note must POST /__notes/add and the server must write exactly one note to notes.json: ' + JSON.stringify(notes))
      assert.strictEqual(notes[0].region && notes[0].region.touched && notes[0].region.touched.length, 2,
        'the captured region must touch exactly the two cards (index 1 and 2) the drag actually spans: ' + JSON.stringify(notes[0].region))
      const newId = notes[0].id

      const painted = await evalJs(withHelpers(
        'var box=nlQAll(\'.nl-region[data-id="' + newId + '"]\')[0];return box ? box.getAttribute("data-status") : null'))
      assert.strictEqual(painted, 'open',
        'after refresh the new note must paint a .nl-region[data-status="open"] carrying data-id "' + newId + '": got ' + painted)
    })
  } finally {
    await stop()
  }
})

test('AC-20260912-11-11: an unresolvable region paints no box and marks its strip row outdated, a resolvable region on another state stays unpainted until active, and painting it once that state is clicked', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin requires resolve() to run against real, painted layout')
  const dir = buildOutdatedFixtureRoot()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate('http://127.0.0.1:' + port + '/mocks/booking.html')

      const before = await evalJs(withHelpers([
        'var row=nlQAll(\'[data-id="N-A"]\')[0];',
        'return {regions: nlQAll(".nl-region").length, row: row ? {status: row.getAttribute("data-status"), text: row.textContent} : null}',
      ].join('\n')))
      assert.strictEqual(before.regions, 0,
        'on the default state, the unresolvable region (N-A) must paint no box, and the resolvable one on "error" (N-B) is not the active state so it paints none either: got ' + JSON.stringify(before))
      assert.ok(before.row, 'the strip must carry a row for N-A even though its box cannot be drawn — the reader still needs to find it: got ' + JSON.stringify(before))
      assert.strictEqual(before.row.status, 'outdated',
        'N-A\'s strip row must carry data-status="outdated" once its anchor no longer resolves: got ' + JSON.stringify(before))
      assert.match(before.row.text, /Outdated/,
        'N-A\'s row must explain itself with text containing "Outdated": got ' + JSON.stringify(before))

      const clickedError = await evalJs(withHelpers([
        'var b=Array.prototype.slice.call(document.querySelectorAll("[data-state-btn]")).find(function(x){return x.getAttribute("data-state-btn")==="error"});',
        'if(!b)return false;b.click();return true',
      ].join('\n')))
      assert.strictEqual(clickedError, true, 'the mock must carry a data-state-btn="error" button for this AC\'s state switch to run')

      const after = await evalJs(withHelpers('return nlQAll(".nl-region").map(function(b){return b.getAttribute("data-id")})'))
      assert.deepStrictEqual(after, ['N-B'],
        'after clicking the error state button, exactly N-B\'s region must paint — N-A still resolves null on every state: got ' + JSON.stringify(after))
    })
  } finally {
    await stop()
  }
})

test('AC-20260912-11-13: accepting an addressed region note shows an undoable toast and posts nothing within 1s, Undo leaves the note unchanged, and letting the toast expire posts the resolve', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin requires the deferred-POST undo toast to run in a real event loop')
  const dir = buildAddressedFixtureRoot('N-ACC')
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async ({ navigate, evalJs, sleep }) => {
      await navigate('http://127.0.0.1:' + port + '/mocks/booking.html')

      const opened = await evalJs(withHelpers([
        'var box=nlQAll(\'.nl-region[data-id="N-ACC"]\')[0];if(!box)return "no-box";box.click();return "ok"',
      ].join('\n')))
      assert.strictEqual(opened, 'ok', 'a painted region box must exist and be clickable to open its card — none was found')

      const acceptClicked = await evalJs(withHelpers([
        'var card=nlQAll(".nl-card")[0];if(!card)return "no-card";',
        'var accept=Array.prototype.slice.call(card.querySelectorAll("button")).find(function(b){return /Accept/.test(b.textContent)});',
        'if(!accept)return "no-accept";accept.click();return "ok"',
      ].join('\n')))
      assert.strictEqual(acceptClicked, 'ok', 'the card of an addressed note must offer an Accept button — none was found or clicked')

      await sleep(900)
      const preExpiry = await evalJs(withHelpers([
        'var toast=nlQAll(".nl-toast")[0];',
        'var undo=toast&&Array.prototype.slice.call(toast.querySelectorAll("button")).find(function(b){return /Undo/.test(b.textContent)});',
        'return {hasToast: !!toast, hasUndo: !!undo}',
      ].join('\n')))
      assert.ok(preExpiry.hasToast, 'clicking Accept must show a .nl-toast with an Undo option before posting: ' + JSON.stringify(preExpiry))
      assert.ok(preExpiry.hasUndo, 'the toast must carry an Undo button: ' + JSON.stringify(preExpiry))
      const stillAddressed = readNotesOf(dir).find((n) => n.id === 'N-ACC')
      assert.strictEqual(stillAddressed.status, 'addressed',
        'within 1s of clicking Accept, nothing must be posted yet — the note must still read status "addressed" on disk: ' + JSON.stringify(stillAddressed))

      const undone = await evalJs(withHelpers([
        'var toast=nlQAll(".nl-toast")[0];',
        'var undo=toast&&Array.prototype.slice.call(toast.querySelectorAll("button")).find(function(b){return /Undo/.test(b.textContent)});',
        'if(!undo)return "no-undo";undo.click();return "ok"',
      ].join('\n')))
      assert.strictEqual(undone, 'ok', 'the Undo button must exist and be clickable')
      await sleep(5500)
      const afterUndo = readNotesOf(dir).find((n) => n.id === 'N-ACC')
      assert.strictEqual(afterUndo.status, 'addressed',
        'clicking Undo must cancel the deferred POST — the note must still read status "addressed" on disk even 5.5s later: ' + JSON.stringify(afterUndo))
      const boxAfterUndo = await evalJs(withHelpers(
        'var b=nlQAll(\'.nl-region[data-id="N-ACC"]\')[0];return b?b.getAttribute("data-status"):null'))
      assert.strictEqual(boxAfterUndo, 'addressed',
        'the box must still read data-status="addressed" after Undo — the render must reflect the un-accepted note: got ' + boxAfterUndo)

      const acceptAgain = await evalJs(withHelpers([
        'var box=nlQAll(\'.nl-region[data-id="N-ACC"]\')[0];box.click();',
        'var card=nlQAll(".nl-card")[0];',
        'var accept=card&&Array.prototype.slice.call(card.querySelectorAll("button")).find(function(b){return /Accept/.test(b.textContent)});',
        'if(!accept)return "no-accept";accept.click();return "ok"',
      ].join('\n')))
      assert.strictEqual(acceptAgain, 'ok', 'Accept must be clickable a second time after an Undo')
      await sleep(5500)
      const resolved = readNotesOf(dir).find((n) => n.id === 'N-ACC')
      assert.strictEqual(resolved.status, 'resolved',
        'leaving the toast for 5.5s (past its 5s window) without clicking Undo must post /__notes/resolve — the note must read status "resolved" on disk: ' + JSON.stringify(resolved))
    })
  } finally {
    await stop()
  }
})

test('AC-20260912-11-14: rejecting an addressed note posts nothing and keeps the reason field focused when it is empty, and reopens the note with the given reason threaded once it is not', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin requires the reject-reason field\'s real focus/blank-post behavior')
  const dir = buildAddressedFixtureRoot('N-REJ')
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate('http://127.0.0.1:' + port + '/mocks/booking.html')

      const rejectOpened = await evalJs(withHelpers([
        'var box=nlQAll(\'.nl-region[data-id="N-REJ"]\')[0];if(!box)return "no-box";box.click();',
        'var card=nlQAll(".nl-card")[0];if(!card)return "no-card";',
        'var reject=Array.prototype.slice.call(card.querySelectorAll("button")).find(function(b){return /Reject/.test(b.textContent)});',
        'if(!reject)return "no-reject";reject.click();return "ok"',
      ].join('\n')))
      assert.strictEqual(rejectOpened, 'ok',
        'the card of an addressed note must offer a Reject control that reveals a reason field — one was missing')

      const emptySend = await evalJs(withHelpers([
        'var card=nlQAll(".nl-card")[0];',
        'var field=card.querySelector(".nl-card-why textarea, .nl-card-why input, textarea.nl-card-why");',
        'var send=Array.prototype.slice.call(card.querySelectorAll("button")).find(function(b){return /Send back/.test(b.textContent)});',
        'if(!field||!send)return {found:false};',
        'field.value="";send.click();',
        'var active=(card.getRootNode&&card.getRootNode().activeElement)||document.activeElement;',
        'return {found:true, focused: active===field}',
      ].join('\n')))
      assert.ok(emptySend.found, 'the reject reason block must carry a text field and a "Send back" button: ' + JSON.stringify(emptySend))
      assert.ok(emptySend.focused,
        'clicking Send back with an empty reason must post nothing and keep the field focused: ' + JSON.stringify(emptySend))
      await new Promise((r) => setTimeout(r, 300))
      const stillAddressed = readNotesOf(dir).find((n) => n.id === 'N-REJ')
      assert.strictEqual(stillAddressed.status, 'addressed',
        'an empty reason must never post — the note must still read status "addressed": ' + JSON.stringify(stillAddressed))

      await evalJs(withHelpers([
        'var card=nlQAll(".nl-card")[0];',
        'var field=card.querySelector(".nl-card-why textarea, .nl-card-why input, textarea.nl-card-why");',
        'field.value="wrong clinic";',
        'field.dispatchEvent(new Event("input",{bubbles:true}));',
        'var send=Array.prototype.slice.call(card.querySelectorAll("button")).find(function(b){return /Send back/.test(b.textContent)});',
        'send.click();return true',
      ].join('\n')))

      let reopened = null
      for (let i = 0; i < 20 && (!reopened || reopened.status !== 'open'); i++) {
        await new Promise((r) => setTimeout(r, 200))
        try { reopened = readNotesOf(dir).find((n) => n.id === 'N-REJ') } catch (e) { /* not written yet */ }
      }
      assert.strictEqual(reopened.status, 'open',
        'Send back with a non-empty reason must POST /__notes/reopen — the note must read status "open": ' + JSON.stringify(reopened))
      assert.ok(Array.isArray(reopened.thread) && reopened.thread.some((e) => e.text === 'wrong clinic'),
        'the reopen must thread the given reason ("wrong clinic") — the reject reason is otherwise lost: ' + JSON.stringify(reopened.thread))
    })
  } finally {
    await stop()
  }
})
