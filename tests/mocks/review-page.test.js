'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const { SPEC, ROOT, read, parseFlatDom } = require('../helpers')

// specs/20260912/06-the-review-page-answers-to-a-design.md D1, D3, D4 — AC-20260912-06-1, -2, -3,
// -4, -5, -7. buildReviewPage is a pure function (no fs, no clock): every test below hands it a
// fixture object directly, exactly as the AC-IDs describe ("WHEN buildReviewPage runs over a
// fixture declaring…").

const { buildReviewPage } = require(path.join(SPEC, 'scripts/lib/review-page.js'))

// The one fixture every AC-1..-4 test shares: journey j1, screens a (states: empty) and b, one
// open mock note on a, one addressed mock note on b (addressed.change: "did it"), one open
// project note — plus one open `journey-approved:j1` stop so the header renders its blocking
// approve control (rather than the "waiting for a look" placeholder) for AC-2's title check.
function baseSeed() {
  return {
    product: 'Product',
    viewportWidth: 1280,
    viewportHeight: 800,
    journeys: [{
      name: 'j1',
      title: 'J1',
      screens: [{ label: 'a', states: ['empty'] }, { label: 'b', states: [] }],
    }],
  }
}

function baseNotes(projectStatus) {
  return [
    { id: 'n1', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'open on a', reason: 'other' },
    { id: 'n2', kind: 'note', scope: 'mock', screen: 'b', state: null, status: 'addressed', addressed: { change: 'did it' }, text: 'addr on b', reason: 'other' },
    { id: 'n3', kind: 'note', scope: 'project', screen: null, state: null, status: projectStatus || 'open', text: 'proj open', reason: 'other' },
  ]
}

function baseStop() {
  return {
    id: 'P001', kind: 'approve', key: 'journey-approved:j1', title: 'Approve j1', question: null,
    candidates: [], url: null, openedAt: new Date().toISOString(), status: 'open', decision: null, previous: [],
  }
}

function render(projectStatus) {
  return buildReviewPage({ journey: 'j1', seed: baseSeed(), notes: baseNotes(projectStatus), ledger: [], stops: [baseStop()], prefix: '' })
}

// AC-20260912-06-1 (sanctioned pin exception, green pre-change): renderNoteRow already gates the
// note-actions group on an addressed note only — this pin outlives the spec's close (D6) so the
// invariant stays covered, not because D1/D3/D4/D9/D10 touch this behavior.
test('AC-20260912-06-1: only the addressed note on b carries a note-actions group of Looks good / Still not right; the open note on a carries none', () => {
  const html = render()
  const { document } = parseFlatDom(html)
  const groups = document.querySelectorAll('[data-rv="note-actions"]')
  assert.strictEqual(groups.length, 1,
    'exactly one row (the addressed note) must carry [data-rv="note-actions"] — got ' + groups.length +
    ': a reviewer must not be offered to close a note the session has not addressed, nor left without a way to close one it has')
  const group = groups[0]
  const row = group.closest('[data-rv="row"]')
  assert.strictEqual(row && row.getAttribute('data-id'), 'n2',
    'the note-actions group must sit on the addressed note (n2), not the still-open one (n1)')
  const accept = group.querySelector('[data-rv="accept"]')
  const reopen = group.querySelector('[data-rv="reopen"]')
  assert.ok(accept, 'the addressed row must carry a [data-rv="accept"] button')
  assert.ok(reopen, 'the addressed row must carry a [data-rv="reopen"] button')
  const buttonTexts = group.querySelectorAll('button').map((b) => rawText(html, b))
  assert.deepStrictEqual(buttonTexts, ['Looks good', 'Still not right'],
    'the addressed row\'s two buttons must read exactly "Looks good" then "Still not right": got ' + JSON.stringify(buttonTexts))
  const openRow = document.querySelector('[data-rv="row"][data-id="n1"]')
  assert.strictEqual(openRow.querySelectorAll('[data-rv="note-actions"]').length, 0,
    'the still-open note (n1) must carry no note-actions group — it has nothing addressed yet to accept')
})

// The flat-DOM shim (tests/helpers.js) exposes no textContent reader (nothing under test reads
// one), so a button's rendered label is read directly off the source HTML by its data-rv anchor.
function rawText(html, node) {
  const openTag = new RegExp('<button[^>]*data-rv="' + node.getAttribute('data-rv') + '"[^>]*>([^<]*)</button>')
  const m = openTag.exec(html)
  return m ? m[1] : null
}

test('AC-20260912-06-2: the rail\'s __project count row equals the fixture\'s own open-project-item count, in both directions', () => {
  const openHtml = render('open')
  const { document: openDoc } = parseFlatDom(openHtml)
  const projectRow = openDoc.querySelector('[data-rv="count"][data-screen="__project"]')
  assert.ok(projectRow, 'a journey carrying a project-scope note must render the __project rail row at all')
  assert.strictEqual(rawText(openHtml, projectRow) || cellText(openHtml, '__project'), '1',
    'the __project row must show "1" — buildReviewPage must derive it from the actual open project ' +
    'items (items.filter(scope===project && isOpen).length), not from the dead openByLabel.get(null) ' +
    'lookup that always reads 0 (D3): got a row reading something other than "1"')
  assert.strictEqual(projectRow.hasAttribute('data-zero'), false,
    'one open project note must render the row WITHOUT data-zero (the muted/zero treatment)')
  // The header's own block-title total is independent of the rail derivation this AC pins — it is
  // asserted here only for the "names the same total it counts" invariant: whatever isOpen() counts
  // as open across every item (mock + project; an addressed note still counts, since it still needs
  // the reviewer's own accept/reopen click) is the number the disabled approve button's title names.
  // (The AC's own worked parenthetical, "2 open items block approval", undercounts this fixture's
  // addressed note — see the deviations sidecar; this pin uses the fixture's true isOpen() total so
  // it is never a fabricated number.)
  const trueOpenTotal = baseNotes('open').filter((n) => n.status !== 'resolved').length
  assert.match(openHtml, new RegExp(trueOpenTotal + ' open items? blocks? approval'),
    'the approve control\'s title must name the same open-item total the page actually computed (' +
    trueOpenTotal + '): got no such title in the rendered header')

  const resolvedHtml = render('resolved')
  const { document: resolvedDoc } = parseFlatDom(resolvedHtml)
  const resolvedRow = resolvedDoc.querySelector('[data-rv="count"][data-screen="__project"]')
  assert.strictEqual(cellText(resolvedHtml, '__project'), '0',
    'once the project note is resolved, the __project row must read "0"')
  assert.strictEqual(resolvedRow.hasAttribute('data-zero'), true,
    'once the project note is resolved, the __project row must carry data-zero (the muted/zero treatment)')
})

// Reads the count element's own text out of the raw HTML (the flat-DOM shim carries no
// textContent reader) — anchored on the exact data-screen value so a and b's own count spans can
// never be mistaken for the project one.
function cellText(html, screen) {
  const re = new RegExp('data-rv="count" data-screen="' + screen + '"[^>]*>([^<]*)<')
  const m = re.exec(html)
  return m ? m[1] : null
}

test('AC-20260912-06-3: the scope band states "Notes for" as DOM text, never as viewer.css generated content', () => {
  const html = render()
  const bandMatch = /<div class="rv-scopeband">([\s\S]*?)<\/div>/.exec(html)
  assert.ok(bandMatch, 'the page must render a .rv-scopeband element to inspect')
  assert.match(bandMatch[1], />Notes for</,
    'the scope band must carry the literal text "Notes for" as an element\'s own DOM text content ' +
    '(D4) — a reviewer reading the served bytes, or a test asserting on them, must be able to see ' +
    'the scope statement without also loading viewer.css: got ' + JSON.stringify(bandMatch[1]))
  const viewer = read('spec/templates/mocks/viewer.css')
  assert.doesNotMatch(viewer, /content:\s*"Notes for"/,
    'viewer.css must carry no ::before content: "Notes for" declaration once D4 lands — a CSS ' +
    'generated-content string is invisible to the served bytes and to any DOM-level assertion')
})

// AC-20260912-06-4 (sanctioned pin exception, green pre-change): ADR-0018 clause (a)'s breadcrumb
// fix already shipped in this pre-image; this pin is what keeps the promise honest at close (D6).
test('AC-20260912-06-4: with an empty prefix, the breadcrumb carries exactly one a.rv-home linking to "/" and named after the product, with no "Mocks" segment', () => {
  const html = render()
  const { document } = parseFlatDom(html)
  const crumb = document.querySelector('.rv-crumb')
  assert.ok(crumb, 'the page must render a breadcrumb (.rv-crumb) to inspect')
  const homes = crumb.querySelectorAll('a.rv-home')
  assert.strictEqual(homes.length, 1, 'the breadcrumb must carry exactly one a.rv-home link: got ' + homes.length)
  assert.strictEqual(homes[0].getAttribute('href'), '/',
    'with prefix \'\', a.rv-home must link to the atlas index at "/"')
  const label = rawInnerText(html, '<a class="rv-home"', '</a>')
  assert.strictEqual(label, 'Product', 'a.rv-home\'s text must be the seed\'s product name: got ' + JSON.stringify(label))
  const crumbHtml = sliceCrumb(html)
  assert.doesNotMatch(crumbHtml, /Mocks/,
    'the breadcrumb must carry no "Mocks" segment — the atlas index is now one hop away, not two (ADR-0018 clause a)')
})

function rawInnerText(html, openMarker, closeMarker) {
  const start = html.indexOf(openMarker)
  if (start === -1) return null
  const openEnd = html.indexOf('>', start) + 1
  const closeStart = html.indexOf(closeMarker, openEnd)
  return html.slice(openEnd, closeStart)
}

function sliceCrumb(html) {
  const start = html.indexOf('<nav class="rv-crumb"')
  const end = html.indexOf('</nav>', start) + '</nav>'.length
  return html.slice(start, end)
}

// AC-20260912-06-5 (sanctioned pin exception, green pre-change): the tab count and .rv-tabs's
// flex-wrap/overflow declarations already hold in this pre-image; D9's specificity fixes touch
// five OTHER selectors, never .rv-tabs, so this pin is a continuity guard, not a bug fix.
test('AC-20260912-06-5: a screen declaring fourteen states renders fifteen tabs in one tablist, each with its own frame src, and viewer.css never clips the row', () => {
  const states = []
  for (let i = 1; i <= 14; i++) states.push('s' + i)
  const seed = baseSeed()
  seed.journeys[0].screens[0] = { label: 'a', states }
  const html = buildReviewPage({ journey: 'j1', seed, notes: [], ledger: [], stops: [], prefix: '' })
  const { document } = parseFlatDom(html)
  const board = document.querySelector('[data-rv="board"][data-label="a"]')
  assert.ok(board, 'the board for screen a must render')
  const tablists = board.querySelectorAll('[role="tablist"]')
  assert.strictEqual(tablists.length, 1, 'a many-state screen must render exactly one [role="tablist"]: got ' + tablists.length)
  const tabs = tablists[0].querySelectorAll('[data-rv="tab"]')
  assert.strictEqual(tabs.length, 15,
    'fourteen declared states plus the implicit "happy" tab must render fifteen tabs: got ' + tabs.length)
  const frames = board.querySelectorAll('[data-rv="frame"]')
  assert.strictEqual(frames.length, 15, 'each tab must own its own iframe: got ' + frames.length + ' frames for 15 tabs')
  const srcs = new Set(frames.map((f) => f.getAttribute('src')))
  assert.strictEqual(srcs.size, 15, 'every frame must carry a distinct src (one per state): got ' + srcs.size + ' distinct values')

  const viewer = read('spec/templates/mocks/viewer.css')
  const rule = /\.rv-tabs\s*\{([^}]*)\}/.exec(viewer)
  assert.ok(rule, '.rv-tabs must have a rule in viewer.css to inspect')
  assert.match(rule[1], /flex-wrap:\s*wrap/, '.rv-tabs must declare flex-wrap: wrap, so a fourteen-state row wraps instead of being clipped')
  assert.doesNotMatch(rule[1], /overflow:\s*hidden/, '.rv-tabs must never declare overflow: hidden — that would clip a wrapped, tall tab row')
})

