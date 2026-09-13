'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, parseFlatDom, withHandler } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D3 (amended)/D8-D21 — AC-20260912-12-3,
// -4, -11, -12, -13, -14, -15, -16, -17, -19, -20, -21 (Chrome-gated: -4, -11, -13, -15, -17, -20).
// Rewritten whole for the owner's 2026-09-13 mid-build ruling (deviations sidecar): the "Show on
// the screen" jump button is gone, marks are always painted, selection is bidirectional, a box
// belongs to its state tab, there is a per-board hide-marks eye and a Mark-an-area composer
// action, and the caption badge/scope band/filter labels were fixed. review-page.js still emits
// the superseded [data-rv="jump"] button and the old "Notes for" scope band today, and
// review.browser.js/notes-layer.browser.js carry none of the new bridges — every AC below is
// genuinely red against the current tree except AC-21 (D16's `&notes=1` flag shipped in an
// earlier build pass fixing A2; kept here as the sanctioned green-pre-change pin for that shape).

const { buildReviewPage } = require(path.join(SPEC, 'scripts/lib/review-page.js'))

function baseSeed(screens) {
  return {
    product: 'Product',
    viewportWidth: 1280,
    viewportHeight: 800,
    journeys: [{ name: 'j1', title: 'J1', screens: screens || [{ label: 'a', states: [] }] }],
  }
}

function trivialRegion() {
  return {
    anchor: { path: [], tag: 'main', snippet: '' },
    frac: { x: 0, y: 0, w: 1, h: 1 },
    layout: { arrangement: 'single', aspect: 1 },
    touched: [],
    drawnAt: { w: 100 },
  }
}

test('AC-20260912-12-3: a region note\'s row carries data-region="1", data-state="happy" and its id inside a span.rv-pin; a project note\'s row carries neither and keeps its muted span.rv-id; the document emits zero [data-rv="jump"] buttons', () => {
  const notes = [
    { id: 'n1', kind: 'note', scope: 'mock', screen: 'a', state: 'happy', status: 'open', text: 'marked area', reason: 'other', region: trivialRegion() },
    { id: 'n2', kind: 'note', scope: 'project', screen: null, state: null, status: 'open', text: 'whole project note', reason: 'other' },
  ]
  const html = buildReviewPage({ journey: 'j1', seed: baseSeed(), notes, ledger: [], stops: [], prefix: '' })
  const { document } = parseFlatDom(html)

  const regionRow = document.querySelector('[data-rv="row"][data-id="n1"]')
  assert.ok(regionRow, 'the region note\'s row must render at all')
  assert.strictEqual(regionRow.getAttribute('data-region'), '1',
    'D3: a region note\'s row must carry data-region="1": got ' + JSON.stringify(regionRow.getAttribute('data-region')))
  assert.strictEqual(regionRow.getAttribute('data-state'), 'happy',
    'D3/D9: a region note\'s row must carry data-state naming the state it was drawn on: got ' + JSON.stringify(regionRow.getAttribute('data-state')))
  const pin = regionRow.querySelector('.rv-pin')
  assert.ok(pin, 'D3: a region note\'s row must carry its id inside a span.rv-pin, not the muted span.rv-id')
  assert.strictEqual(regionRow.querySelectorAll('.rv-id').length, 0,
    'D3: a region note\'s row must not ALSO carry the muted span.rv-id — the pin replaces it')

  const projectRow = document.querySelector('[data-rv="row"][data-id="n2"]')
  assert.ok(projectRow, 'the project note\'s row must render at all')
  assert.strictEqual(projectRow.hasAttribute('data-region'), false,
    'a project (non-region) note\'s row must carry no data-region attribute at all')
  assert.strictEqual(projectRow.hasAttribute('data-state'), false,
    'a project (non-region) note\'s row must carry no data-state attribute at all')
  assert.ok(projectRow.querySelector('.rv-id'),
    'a project note\'s row must keep its muted span.rv-id')

  assert.strictEqual(document.querySelectorAll('button[data-rv="jump"]').length, 0,
    'D3 (amended by the owner\'s 2026-09-13 ruling): there must be zero button[data-rv="jump"] elements anywhere on the page — the whole row is now the click target and the box is always painted, so a jump button is a second thing to learn. The ban is scoped to buttons because the rail\'s own screen-picker select keeps data-rv="jump" and is a different, unchanged control')
})

test('AC-20260912-12-12: a state tab carrying a region note reads span.rv-tabpin with the count; a state tab with none carries no span.rv-tabpin', () => {
  const notes = [
    { id: 'n1', kind: 'note', scope: 'mock', screen: 'a', state: 'error', status: 'open', text: 'marked on error', reason: 'other', region: trivialRegion() },
  ]
  const html = buildReviewPage({
    journey: 'j1', seed: baseSeed([{ label: 'a', states: ['error'] }]), notes, ledger: [], stops: [], prefix: '',
  })
  const { document } = parseFlatDom(html)
  const errorTab = document.querySelector('[data-rv="tab"][data-state="error"]')
  const happyTab = document.querySelector('[data-rv="tab"][data-state="happy"]')
  assert.ok(errorTab, 'the error state tab must render at all')
  assert.ok(happyTab, 'the happy state tab must render at all')
  const errorPin = errorTab.querySelector('.rv-tabpin')
  assert.ok(errorPin, 'D9: the error tab (carrying one region note) must render a span.rv-tabpin')
  const openTag = new RegExp('data-state="error"[^>]*>([\\s\\S]*?)</button>').exec(html)
  assert.match((openTag && openTag[1]) || '', /<span class="rv-tabpin">1<\/span>/,
    'D9: the error tab\'s rv-tabpin must read the count of region notes drawn on it (1): got ' + JSON.stringify(openTag && openTag[1]))
  assert.strictEqual(happyTab.querySelectorAll('.rv-tabpin').length, 0,
    'D9: the happy tab (carrying zero region notes) must render no span.rv-tabpin at all')
})

test('AC-20260912-12-14: every board renders data-pins="on" and a button.rv-pins carrying aria-pressed="true" and aria-label="Hide marks"', () => {
  const html = buildReviewPage({ journey: 'j1', seed: baseSeed(), notes: [], ledger: [], stops: [], prefix: '' })
  const { document } = parseFlatDom(html)
  const board = document.querySelector('[data-rv="board"][data-label="a"]')
  assert.ok(board, 'the board must render at all')
  assert.strictEqual(board.getAttribute('data-pins'), 'on',
    'D10: every board must render data-pins="on" by default: got ' + JSON.stringify(board.getAttribute('data-pins')))
  const pins = board.querySelector('button.rv-pins[data-rv="pins"]')
  assert.ok(pins, 'D10: the board\'s caption must render exactly one button.rv-pins[data-rv="pins"]')
  assert.strictEqual(pins.getAttribute('aria-pressed'), 'true',
    'D10: the eye toggle must default to aria-pressed="true": got ' + JSON.stringify(pins.getAttribute('aria-pressed')))
  assert.strictEqual(pins.getAttribute('aria-label'), 'Hide marks',
    'D10: the eye toggle must carry aria-label="Hide marks": got ' + JSON.stringify(pins.getAttribute('aria-label')))
})

test('AC-20260912-12-16: the composer renders exactly one button.rv-mark-area reading "Mark an area" inside the same .rv-actions as [data-rv="send"]', () => {
  const html = buildReviewPage({ journey: 'j1', seed: baseSeed(), notes: [], ledger: [], stops: [], prefix: '' })
  const { document } = parseFlatDom(html)
  const markBtns = document.querySelectorAll('button.rv-mark-area[data-rv="mark-area"]')
  assert.strictEqual(markBtns.length, 1,
    'D11: the composer must render exactly one button.rv-mark-area[data-rv="mark-area"]: got ' + markBtns.length)
  const send = document.querySelector('[data-rv="send"]')
  assert.ok(send, 'setup: the composer must carry a [data-rv="send"] button to compare against')
  const sendActions = send.closest('.rv-actions')
  const markActions = markBtns[0].closest('.rv-actions')
  assert.ok(sendActions && markActions && sendActions === markActions,
    'D11: [data-rv="mark-area"] must live inside the SAME .rv-actions as [data-rv="send"], not a separate container')
  const openTag = new RegExp('<button[^>]*data-rv="mark-area"[^>]*>([^<]*)</button>').exec(html)
  assert.strictEqual(openTag && openTag[1], 'Mark an area',
    'D11: the mark-area button\'s text must read exactly "Mark an area": got ' + JSON.stringify(openTag && openTag[1]))
})

test('AC-20260912-12-19: the filter tabs read "Needs you"/"Done"/"All" while keeping data-filter values open/answered/all; [data-rv="badge"] renders as a span with zero button[data-rv="badge"] anywhere; the scope band reads "On screen" + [data-rv="screenfilter"] + "plus the whole project" + button.rv-allscreens reading "All screens"', () => {
  const html = buildReviewPage({ journey: 'j1', seed: baseSeed(), notes: [], ledger: [], stops: [], prefix: '' })
  const { document } = parseFlatDom(html)

  const filters = document.querySelectorAll('[data-rv="filter"]')
  assert.strictEqual(filters.length, 3, 'setup: the inspector must render exactly three filter buttons')
  const wantValues = ['open', 'answered', 'all']
  const wantLabels = ['Needs you', 'Done', 'All']
  filters.forEach((b, i) => {
    assert.strictEqual(b.getAttribute('data-filter'), wantValues[i],
      'D13: the filter\'s data-filter values must stay open/answered/all so no consumer (applyFilter, tests) breaks: got ' + JSON.stringify(b.getAttribute('data-filter')) + ' at position ' + i)
  })
  const filterTexts = wantValues.map((v) => {
    const m = new RegExp('data-filter="' + v + '"[^>]*>([^<]*)<').exec(html)
    return m && m[1]
  })
  assert.deepStrictEqual(filterTexts, wantLabels,
    'D13: the filter buttons must read exactly "Needs you", "Done", "All" in that order: got ' + JSON.stringify(filterTexts))

  const badgeButtons = document.querySelectorAll('button[data-rv="badge"]')
  assert.strictEqual(badgeButtons.length, 0,
    'D14: there must be zero button[data-rv="badge"] anywhere on the page — the caption count is inert')
  const badgeSpan = document.querySelector('span.rv-badge[data-rv="badge"]')
  assert.ok(badgeSpan, 'D14: [data-rv="badge"] must render as a span.rv-badge')

  const bandMatch = /<div class="rv-scopeband">([\s\S]*?)<\/div>/.exec(html)
  assert.ok(bandMatch, 'the page must render a .rv-scopeband element to inspect')
  const band = bandMatch[1]
  assert.match(band, /<span class="rv-scopeband-label">On screen<\/span>/,
    'D15: the scope band\'s first label must read exactly "On screen": got ' + JSON.stringify(band))
  assert.match(band, /<span class="rv-screenfilter" data-rv="screenfilter">/,
    'D15: the scope band must still carry [data-rv="screenfilter"]: got ' + JSON.stringify(band))
  assert.match(band, /<span class="rv-scopeband-label">plus the whole project<\/span>/,
    'D15: the scope band\'s second label must read exactly "plus the whole project": got ' + JSON.stringify(band))
  const allScreens = document.querySelector('button.rv-allscreens[data-rv="allscreens"]')
  assert.ok(allScreens, 'D15: the scope band must carry a button.rv-allscreens[data-rv="allscreens"]')
  const allScreensText = /<button[^>]*data-rv="allscreens"[^>]*>([^<]*)</.exec(html)
  assert.strictEqual(allScreensText && allScreensText[1], 'All screens',
    'D15: the All-screens button must read exactly "All screens": got ' + JSON.stringify(allScreensText && allScreensText[1]))
})

test('AC-20260912-12-21: every board frame\'s src carries both clean and notes=1; GET /mocks/a.html?clean&notes=1 serves the notes-layer script while ?clean alone serves none', async () => {
  const html = buildReviewPage({ journey: 'j1', seed: baseSeed(), notes: [], ledger: [], stops: [], prefix: '' })
  const frameMatch = /<iframe[^>]*data-rv="frame"[^>]*src="([^"]*)"/.exec(html)
  assert.ok(frameMatch, 'a board must render at least one iframe[data-rv="frame"] to inspect')
  const src = frameMatch[1]
  assert.match(src, /[?&]clean(&|$)/, 'D16: the frame src must carry the clean flag: got ' + JSON.stringify(src))
  assert.match(src, /[?&]notes=1(&|$)/, 'D16: the frame src must carry &notes=1 so the layer still rides in: got ' + JSON.stringify(src))

  const dir = tmpdir('review-region-notes-flag')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">a</main>\n')
  await withHandler(dir, async ({ get }) => {
    const withNotes = await get('/mocks/a.html?clean&notes=1')
    assert.strictEqual(withNotes.status, 200, 'GET ?clean&notes=1 must serve the mock: got ' + withNotes.status)
    assert.match(withNotes.body, /__notes\/notes\.js/,
      'D16: ?clean&notes=1 must serve markup carrying the notes-layer script tag: got no match in ' + withNotes.body.length + ' bytes')
    const cleanOnly = await get('/mocks/a.html?clean')
    assert.strictEqual(cleanOnly.status, 200, 'GET ?clean must serve the mock: got ' + cleanOnly.status)
    assert.doesNotMatch(cleanOnly.body, /__notes\/notes\.js/,
      'D16: a bare ?clean request (every other caller) must carry no notes-layer script at all — the pinned isolation invariant: got a match in ' + cleanOnly.body.length + ' bytes')
  })
})

// ---------------------------------------------------------------------------------------------
// [env: CHROME_BIN] — AC-4, -11, -13, -15, -17, -20. One shared fixture: journey j1, screen a
// (states happy/error, two region notes N1/N2), screen b (one plain note N3, no region), and one
// whole-project note N4 — enough surface for selection, tabs, pins, mark mode and scope in one
// served host.
// ---------------------------------------------------------------------------------------------
function buildFixture() {
  const dir = tmpdir('review-region-chrome')
  const mk = (rel, content) => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  mk('design/mocks/seed.md',
    '# Seed — Fixture\n\n## Product\nA synthetic product for the review-region test.\nBuilt for QA.\nIt must let a user complete a short flow.\n\n' +
    '## Facts\n- primary-surface: P1\n\n## References\n- none\n\n## Journeys\n### j1\nA short flow.\n```surfaces\na\nb\n```\n')
  mk('design/mocks/a.html',
    '<main data-screen-label="a" data-status="sketch"><button data-state-btn="error">Error</button>a screen</main>\n')
  mk('design/mocks/b.html', '<main data-screen-label="b" data-status="sketch">b screen</main>\n')
  mk('design/mocks/notes.json', JSON.stringify([
    { id: 'N1', kind: 'note', scope: 'mock', screen: 'a', state: 'happy', status: 'open', reason: 'other', text: 'marked on happy', by: 'jj', region: trivialRegion() },
    { id: 'N2', kind: 'note', scope: 'mock', screen: 'a', state: 'error', status: 'open', reason: 'other', text: 'marked on error', by: 'jj', region: trivialRegion() },
    { id: 'N3', kind: 'note', scope: 'mock', screen: 'b', state: null, status: 'open', reason: 'other', text: 'plain note on b', by: 'jj' },
    { id: 'N4', kind: 'note', scope: 'project', screen: null, state: null, status: 'open', reason: 'other', text: 'whole project note', by: 'jj' },
  ], null, 2) + '\n')
  return dir
}

// Same shadow-DOM traversal chrome-harness.js's own callers use (tests/mocks/client-region.test.js):
// the box layer lives inside a `.nl-host`'s shadow root, never in light DOM.
const OVERLAY_SHADOW_JS =
  'function findOverlayShadow(fdoc) {' +
  '  var hosts = Array.prototype.slice.call(fdoc.querySelectorAll(".nl-host"));' +
  '  for (var i = 0; i < hosts.length; i++) { if (hosts[i].shadowRoot && hosts[i].shadowRoot.querySelector(".nl-overlay")) return hosts[i].shadowRoot }' +
  '  return null;' +
  '}'

test('AC-20260912-12-4: the board\'s visible frame paints .nl-region[data-id=N1] before any click; clicking N1\'s row .rv-claim leaves the row data-selected, its board data-focus, and that box carrying class "sel"', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-4 only runs against a real cascade'); return }
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      const painted = await evalJs(
        OVERLAY_SHADOW_JS +
        '(function () {' +
        'var board = document.querySelector(\'[data-rv="board"][data-label="a"]\');' +
        'var frame = board ? board.querySelector(\'[data-rv="frame"]:not([hidden])\') : null;' +
        'if (!frame || !frame.contentDocument) return { error: "no accessible frame document" };' +
        'var shadow = findOverlayShadow(frame.contentDocument);' +
        'if (!shadow) return { error: "no overlay shadow root in the frame" };' +
        'var box = shadow.querySelector(\'.nl-region[data-id="N1"]\');' +
        'return { paintedBeforeClick: !!box };' +
        '})()')
      if (painted && painted.error) return painted
      const clicked = await evalJs(
        '(function () {' +
        'var row = document.querySelector(\'[data-rv="row"][data-id="N1"]\');' +
        'if (!row) return { error: "no row for N1" };' +
        'var claim = row.querySelector(".rv-claim");' +
        'if (!claim) return { error: "row N1 has no .rv-claim to click" };' +
        'claim.click();' +
        'return { ok: true };' +
        '})()')
      if (clicked && clicked.error) return Object.assign({}, painted, clicked)
      await new Promise((r) => setTimeout(r, 500))
      const after = await evalJs(
        OVERLAY_SHADOW_JS +
        '(function () {' +
        'var row = document.querySelector(\'[data-rv="row"][data-id="N1"]\');' +
        'var board = document.querySelector(\'[data-rv="board"][data-label="a"]\');' +
        'var frame = board ? board.querySelector(\'[data-rv="frame"]:not([hidden])\') : null;' +
        'var fdoc = frame && frame.contentDocument;' +
        'var shadow = fdoc ? findOverlayShadow(fdoc) : null;' +
        'var box = shadow ? shadow.querySelector(\'.nl-region[data-id="N1"]\') : null;' +
        'return {' +
        '  rowSelected: row ? row.hasAttribute("data-selected") : false,' +
        '  boardFocused: board ? board.hasAttribute("data-focus") : false,' +
        '  boxClass: box ? box.className : null,' +
        '};' +
        '})()')
      return Object.assign({}, painted, after)
    })
    assert.ok(!result.error, 'the paint/click/re-check sequence must find the row, its board and the frame\'s overlay: got ' + JSON.stringify(result))
    assert.strictEqual(result.paintedBeforeClick, true,
      'D3/D5: the box for N1 must already be painted on the board BEFORE any click — marks are always on, never revealed on demand: got ' + JSON.stringify(result))
    assert.strictEqual(result.rowSelected, true,
      'D8: clicking the row\'s .rv-claim text must leave that row carrying data-selected: got ' + JSON.stringify(result))
    assert.strictEqual(result.boardFocused, true,
      'D8: clicking the row must leave its own board carrying data-focus: got ' + JSON.stringify(result))
    assert.match(result.boxClass || '', /\bsel\b/,
      'D8: selecting the row must mark the frame\'s box selected (class "sel") via __nlFocus: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260912-12-11: clicking the framed mock\'s .nl-region[data-id=N1] leaves the parent page\'s row N1 carrying data-selected and every other row carrying none', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-11 only runs against a real cascade'); return }
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      const clicked = await evalJs(
        OVERLAY_SHADOW_JS +
        '(function () {' +
        'var board = document.querySelector(\'[data-rv="board"][data-label="a"]\');' +
        'var frame = board ? board.querySelector(\'[data-rv="frame"]:not([hidden])\') : null;' +
        'if (!frame || !frame.contentDocument) return { error: "no accessible frame document" };' +
        'var shadow = findOverlayShadow(frame.contentDocument);' +
        'if (!shadow) return { error: "no overlay shadow root in the frame" };' +
        'var box = shadow.querySelector(\'.nl-region[data-id="N1"]\');' +
        'if (!box) return { error: "no .nl-region[data-id=N1] box painted" };' +
        'box.click();' +
        'return { ok: true };' +
        '})()')
      if (clicked && clicked.error) return clicked
      await new Promise((r) => setTimeout(r, 500))
      return evalJs(
        '(function () {' +
        'var rows = Array.prototype.slice.call(document.querySelectorAll(\'[data-rv="row"]\'));' +
        'var selected = rows.filter(function (r) { return r.hasAttribute("data-selected") }).map(function (r) { return r.getAttribute("data-id") });' +
        'return { selected: selected };' +
        '})()')
    })
    assert.ok(!result.error, 'the box must be found and clicked: got ' + JSON.stringify(result))
    assert.deepStrictEqual(result.selected, ['N1'],
      'D8: clicking the box must call window.parent.__rvPick(id), leaving exactly row N1 carrying data-selected: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260912-12-13: with board a showing its happy tab, clicking N2\'s row (drawn on error) leaves the error tab aria-selected, the happy tab not, and the error frame not hidden', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-13 only runs against a real cascade'); return }
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      const before = await evalJs(
        '(function () {' +
        'var happyTab = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="tab"][data-state="happy"]\');' +
        'return { happySelectedAtLoad: happyTab ? happyTab.getAttribute("aria-selected") : null };' +
        '})()')
      const clicked = await evalJs(
        '(function () {' +
        'var row = document.querySelector(\'[data-rv="row"][data-id="N2"]\');' +
        'if (!row) return { error: "no row for N2" };' +
        'var claim = row.querySelector(".rv-claim");' +
        'if (!claim) return { error: "row N2 has no .rv-claim to click" };' +
        'claim.click();' +
        'return { ok: true };' +
        '})()')
      if (clicked && clicked.error) return Object.assign({}, before, clicked)
      await new Promise((r) => setTimeout(r, 500))
      const after = await evalJs(
        '(function () {' +
        'var errorTab = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="tab"][data-state="error"]\');' +
        'var happyTab = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="tab"][data-state="happy"]\');' +
        'var errorFrame = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="frame"][data-state="error"]\');' +
        'return {' +
        '  errorSelected: errorTab ? errorTab.getAttribute("aria-selected") : null,' +
        '  happySelected: happyTab ? happyTab.getAttribute("aria-selected") : null,' +
        '  errorFrameHidden: errorFrame ? errorFrame.hasAttribute("hidden") : null,' +
        '};' +
        '})()')
      return Object.assign({}, before, after)
    })
    assert.ok(!result.error, 'setup: the tabs and row N2 must be found: got ' + JSON.stringify(result))
    assert.strictEqual(result.happySelectedAtLoad, 'true',
      'setup: the board must load with its happy tab selected — got ' + JSON.stringify(result))
    assert.strictEqual(result.errorSelected, 'true',
      'D8/D9: selecting a row drawn on "error" must switch that board\'s error tab to aria-selected="true": got ' + JSON.stringify(result))
    assert.strictEqual(result.happySelected, 'false',
      'D9: the previously-selected happy tab must switch to aria-selected="false": got ' + JSON.stringify(result))
    assert.strictEqual(result.errorFrameHidden, false,
      'D9: the error frame must no longer carry the hidden attribute once its tab is active: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260912-12-15: clicking board a\'s [data-rv="pins"] flips data-pins to "off", aria-pressed to "false", and hides N1\'s box (zero client rects); clicking it again restores all three', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-15 only runs against a real cascade'); return }
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      const boxRects = OVERLAY_SHADOW_JS +
        'function boxRectsOf() {' +
        '  var board = document.querySelector(\'[data-rv="board"][data-label="a"]\');' +
        '  var frame = board ? board.querySelector(\'[data-rv="frame"]:not([hidden])\') : null;' +
        '  var fdoc = frame && frame.contentDocument;' +
        '  var shadow = fdoc ? findOverlayShadow(fdoc) : null;' +
        '  var box = shadow ? shadow.querySelector(\'.nl-region[data-id="N1"]\') : null;' +
        '  if (!box) return null;' +
        '  return box.getClientRects().length;' +
        '}'
      const off = await evalJs(
        boxRects +
        '(function () {' +
        'var pins = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="pins"]\');' +
        'if (!pins) return { error: "no [data-rv=\\"pins\\"] control on board a" };' +
        'pins.click();' +
        'return { ok: true };' +
        '})()')
      if (off && off.error) return off
      await new Promise((r) => setTimeout(r, 300))
      const afterOff = await evalJs(
        boxRects +
        '(function () {' +
        'var board = document.querySelector(\'[data-rv="board"][data-label="a"]\');' +
        'var pins = board.querySelector(\'[data-rv="pins"]\');' +
        'return { pinsAttrOff: board.getAttribute("data-pins"), ariaOff: pins.getAttribute("aria-pressed"), rectsOff: boxRectsOf() };' +
        '})()')
      const onAgain = await evalJs(
        '(function () {' +
        'document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="pins"]\').click();' +
        'return { ok: true };' +
        '})()')
      await new Promise((r) => setTimeout(r, 300))
      const afterOn = await evalJs(
        boxRects +
        '(function () {' +
        'var board = document.querySelector(\'[data-rv="board"][data-label="a"]\');' +
        'var pins = board.querySelector(\'[data-rv="pins"]\');' +
        'return { pinsAttrOn: board.getAttribute("data-pins"), ariaOn: pins.getAttribute("aria-pressed"), rectsOn: boxRectsOf() };' +
        '})()')
      return Object.assign({}, afterOff, afterOn, { onAgainOk: onAgain && onAgain.ok })
    })
    assert.ok(!result.error, '[data-rv="pins"] must exist on board a to click: got ' + JSON.stringify(result))
    assert.strictEqual(result.pinsAttrOff, 'off',
      'D10: clicking the eye once must leave the board carrying data-pins="off": got ' + JSON.stringify(result))
    assert.strictEqual(result.ariaOff, 'false',
      'D10: clicking the eye once must leave it carrying aria-pressed="false": got ' + JSON.stringify(result))
    assert.strictEqual(result.rectsOff, 0,
      'D10: __nlPins(false) must hide the box layer — N1\'s box must report zero client rects: got ' + JSON.stringify(result))
    assert.strictEqual(result.pinsAttrOn, 'on',
      'D10: clicking the eye a second time must restore the board to data-pins="on" — a hide with no restore strands every mark: got ' + JSON.stringify(result))
    assert.strictEqual(result.ariaOn, 'true',
      'D10: the restored eye must carry aria-pressed="true" or a screen reader reports marks hidden while they are visible: got ' + JSON.stringify(result))
    assert.ok(result.rectsOn > 0,
      'D10: __nlPins(true) must bring the box layer back — N1\'s box must report at least one client rect: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260912-12-17: clicking [data-rv="mark-area"] puts the focused board\'s visible frame into mark mode ("Marking · Esc to stop") and leaves every other board\'s frame out of it', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-17 only runs against a real cascade'); return }
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      const clicked = await evalJs(
        '(function () {' +
        'var btn = document.querySelector(\'[data-rv="mark-area"]\');' +
        'if (!btn) return { error: "no [data-rv=\\"mark-area\\"] control on the composer" };' +
        'btn.click();' +
        'return { ok: true };' +
        '})()')
      if (clicked && clicked.error) return clicked
      await new Promise((r) => setTimeout(r, 300))
      const barText =
        'function findBarText(fdoc) {' +
        '  var hosts = Array.prototype.slice.call(fdoc.querySelectorAll(".nl-host"));' +
        '  for (var i = 0; i < hosts.length; i++) {' +
        '    if (!hosts[i].shadowRoot) continue;' +
        '    var btns = Array.prototype.slice.call(hosts[i].shadowRoot.querySelectorAll("button"));' +
        '    var mark = btns.filter(function (b) { return /Mark area|Marking/.test(b.textContent) })[0];' +
        '    if (mark) return mark.textContent;' +
        '  }' +
        '  return null;' +
        '}'
      return evalJs(
        barText +
        '(function () {' +
        'var boardA = document.querySelector(\'[data-rv="board"][data-label="a"]\');' +
        'var frameA = boardA ? boardA.querySelector(\'[data-rv="frame"]:not([hidden])\') : null;' +
        'var boardB = document.querySelector(\'[data-rv="board"][data-label="b"]\');' +
        'var frameB = boardB ? boardB.querySelector(\'[data-rv="frame"]:not([hidden])\') : null;' +
        'return {' +
        '  barA: frameA && frameA.contentDocument ? findBarText(frameA.contentDocument) : null,' +
        '  barB: frameB && frameB.contentDocument ? findBarText(frameB.contentDocument) : null,' +
        '};' +
        '})()')
    })
    assert.ok(!result.error, '[data-rv="mark-area"] must exist to click: got ' + JSON.stringify(result))
    assert.strictEqual(result.barA, 'Marking · Esc to stop',
      'D11: the focused board\'s (a) visible frame must enter mark mode via __nlMark(true): got ' + JSON.stringify(result))
    assert.notStrictEqual(result.barB, 'Marking · Esc to stop',
      'D11: an unfocused board\'s (b) frame must NOT be put into mark mode: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})

test('AC-20260912-12-20: with board a focused, the whole-project row (N4) is visible and the screen-b row (N3) is hidden; clicking board a\'s [data-rv="badge"] leaves both unchanged; clicking [data-rv="allscreens"] reveals the screen-b row', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-20 only runs against a real cascade'); return }
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      const rowState = 'function rowState() {' +
        '  var n3 = document.querySelector(\'[data-rv="row"][data-id="N3"]\');' +
        '  var n4 = document.querySelector(\'[data-rv="row"][data-id="N4"]\');' +
        '  return { n3Hidden: n3 ? n3.hasAttribute("hidden") : null, n4Hidden: n4 ? n4.hasAttribute("hidden") : null };' +
        '}'
      const initial = await evalJs(rowState + 'rowState()')
      const badgeClicked = await evalJs(
        '(function () {' +
        'var badge = document.querySelector(\'[data-rv="board"][data-label="a"] [data-rv="badge"]\');' +
        'if (!badge) return { error: "no [data-rv=\\"badge\\"] on board a" };' +
        'badge.click();' +
        'return { ok: true };' +
        '})()')
      if (badgeClicked && badgeClicked.error) return Object.assign({}, initial, badgeClicked)
      await new Promise((r) => setTimeout(r, 300))
      const afterBadge = await evalJs(rowState + 'rowState()')
      const allScreensClicked = await evalJs(
        '(function () {' +
        'var btn = document.querySelector(\'[data-rv="allscreens"]\');' +
        'if (!btn) return { error: "no [data-rv=\\"allscreens\\"] control on the page" };' +
        'btn.click();' +
        'return { ok: true };' +
        '})()')
      if (allScreensClicked && allScreensClicked.error) return Object.assign({}, initial, afterBadge, allScreensClicked)
      await new Promise((r) => setTimeout(r, 300))
      const afterAllScreens = await evalJs(rowState + 'rowState()')
      return {
        initialN3Hidden: initial.n3Hidden, initialN4Hidden: initial.n4Hidden,
        afterBadgeN3Hidden: afterBadge.n3Hidden, afterBadgeN4Hidden: afterBadge.n4Hidden,
        afterAllScreensN3Hidden: afterAllScreens.n3Hidden,
      }
    })
    assert.ok(!result.error, 'both rows and the board\'s badge must be found: got ' + JSON.stringify(result))
    assert.strictEqual(result.initialN4Hidden, false,
      'D15: with board a focused, the whole-project row must be visible from the start: got ' + JSON.stringify(result))
    assert.strictEqual(result.initialN3Hidden, true,
      'D15: with board a focused, the screen-b row must be hidden from the start: got ' + JSON.stringify(result))
    assert.strictEqual(result.afterBadgeN3Hidden, result.initialN3Hidden,
      'D14: clicking the inert badge must leave the screen-b row\'s hidden state unchanged: got ' + JSON.stringify(result))
    assert.strictEqual(result.afterBadgeN4Hidden, result.initialN4Hidden,
      'D14: clicking the inert badge must leave the project row\'s hidden state unchanged: got ' + JSON.stringify(result))
    assert.strictEqual(result.afterAllScreensN3Hidden, false,
      'D15: clicking [data-rv="allscreens"] must clear the narrowing and reveal the screen-b row: got ' + JSON.stringify(result))
  } finally {
    await stop()
  }
})
