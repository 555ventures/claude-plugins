'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { SPEC, tmpdir } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// specs/20260907/09-atlas-index-and-note-navigation.md D6-D9 (amended by D7′ at review
// dispositions): the project panel does not list mock-scope notes with a `.nl-anchor` control
// yet (every note renders the same plain `<b>` id badge), the mock strip carries no `.nl-up`
// link back to the atlas, and the layer's source has never needed a "no state deep link" pin
// because it has never had a place to put one. D7′(a) additionally scopes the whole `.nl-anchor`
// swap to the PROJECT PANEL — a served mock page's own strip keeps its plain `<b>` badge always,
// a regression the reviewer caught with no test pinning it (grep of tests/ for the strip badge
// found nothing). D7′(b) requires the card's `iframe.frame`, not merely `#s-<screen>` +
// window.__lbOpen, before the button form renders. AC-9/-12/-13 are static/vm pins (no browser
// needed); AC-10 is `[env: CHROME_BIN]` and uses tests/mocks/chrome-harness.js (A5), skipping
// with a named reason when no Chrome resolves.

const LIB = path.join(SPEC, 'scripts/lib/notes-layer.browser.js')

// ---- static/vm harness (mirrors design-atlas.test.js's evalNotesLayer, extended with
// getElementById and insertAdjacentElement tracking so D7/D8's new render/mount branches are
// observable without a real DOM) -------------------------------------------------------------
function classes(el) { return String(el.className || '').split(/\s+/).filter(Boolean) }

// `frameElementIds` names which of `elementIds`' stub cards also carry a real `iframe.frame`
// child (D7′(b)'s criterion) — without a querySelector on the stub at all, `target.querySelector
// ('iframe.frame')` was always `undefined` no matter what a real DOM would return, so the fixture
// could not represent "card exists, frame exists" as distinct from "card exists, no frame".
function makeNotesLayerDom({ metaContent, screenLabel, elementIds = [], frameElementIds = [] } = {}) {
  const created = []
  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      appendChild(c) { this.children.push(c); return c },
      insertAdjacentElement(pos, c) { this.insertedAfter = this.insertedAfter || []; this.insertedAfter.push({ pos, c }); return c },
      addEventListener() {},
      setAttribute(k, v) { this[k] = v },
      getAttribute(k) { return this[k] },
      remove() {},
      attachShadow() { const root = makeEl('#shadow-root'); this.shadowRoot = root; return root },
      querySelector() { return null },
    }
    created.push(el)
    return el
  }
  const head = makeEl('head')
  const body = makeEl('body')
  let metaEl = null
  if (metaContent != null) { metaEl = makeEl('meta'); metaEl.content = metaContent }
  let screenEl = null
  if (screenLabel != null) { screenEl = makeEl('main'); screenEl.setAttribute('data-screen-label', screenLabel) }
  const idMap = new Map()
  for (const id of elementIds) {
    const card = makeEl('div')
    if (frameElementIds.includes(id)) {
      const frame = makeEl('iframe')
      card.querySelector = function (sel) { return sel === 'iframe.frame' ? frame : null }
    }
    idMap.set(id, card)
  }
  const document = {
    head, body,
    createElement: makeEl,
    getElementById(id) { return idMap.get(id) || null },
    querySelector(sel) {
      if (sel === 'meta[name="notes-scope"]') return metaEl
      if (sel === '[data-screen-label]') return screenEl
      const idm = /^#([\w-]+)$/.exec(sel)
      if (idm) return idMap.get(idm[1]) || null
      return null
    },
    querySelectorAll() { return [] },
  }
  return { document, created, idMap }
}

async function evalNotesLayer({ pathname, metaContent, screenLabel, elementIds, frameElementIds, lbOpen, listResponse }) {
  const src = fs.readFileSync(LIB, 'utf8')
  const { document, created, idMap } = makeNotesLayerDom({ metaContent, screenLabel, elementIds, frameElementIds })
  const fetchCalls = []
  const win = { prompt: () => 'jj' }
  if (lbOpen) win.__lbOpen = lbOpen
  const sandbox = {
    location: { pathname, search: '' },
    document,
    window: win,
    localStorage: { getItem: () => 'jj', setItem() {} },
    fetch(url) { fetchCalls.push(url); return Promise.resolve({ json: () => Promise.resolve(listResponse || []) }) },
    URLSearchParams,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  // refresh() chains fetch().then(json).then(render) — flush enough microtask hops for it to land.
  for (let i = 0; i < 12; i++) await Promise.resolve()
  return { fetchCalls, created, document, idMap }
}

// Review finding: the reviewer proved with a browser repro that every strip row on a served mock
// page lost its plain `<b>` id badge and rendered span.nl-anchor.plain instead — noteRow() had
// branched on scope with no panel check, and the strip reuses noteRow(). D7′(a) scopes the whole
// `.nl-anchor` swap to the project panel; a mock-scope page's own strip must keep rendering its
// note rows exactly as before (D8: "the strip gets one thing and one thing only, the Project
// notes ↗ link").
test('D7′(a): a mock-scope page\'s strip renders a note row with its plain <b> id badge, never a .nl-anchor — the anchor swap is project-panel-only', async () => {
  // state: 'default' matches the page's activeState (screen "a" declares no data-state-btn, so
  // the layer's activeState defaults to "default") — the strip only ever renders notes whose
  // own state equals the currently active one.
  const note = { id: 'N9', scope: 'mock', screen: 'a', state: 'default', status: 'open', text: 'x', by: 'jj', resolvedBy: null }
  const strip = await evalNotesLayer({
    pathname: '/mocks/a.html', metaContent: 'mock', screenLabel: 'a', elementIds: ['s-a'], frameElementIds: ['s-a'],
    lbOpen: function () {}, listResponse: [note],
  })
  const idBadge = strip.created.find((el) => el.tagName === 'B' && el.textContent === 'N9')
  assert.ok(idBadge, 'D7′(a): a mock page\'s strip row must still render its plain <b> id badge ("N9"), exactly as it did before the project panel gained .nl-anchor: got ' +
    JSON.stringify(strip.created.map((el) => ({ tag: el.tagName, cls: el.className, text: el.textContent }))))
  assert.ok(!strip.created.some((el) => classes(el).includes('nl-anchor')),
    'D7′(a): a mock page\'s strip must render no .nl-anchor at all — the swap applies only when rendering the project panel: got ' +
    JSON.stringify(strip.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
})

// specs/20260913/06-every-mock-has-a-page-you-can-mark.md D5, AC-20260913-06-7: mockAnchor keeps
// its card+iframe.frame gate but drops the window.__lbOpen condition entirely — when the gate
// passes it renders an `<a class="nl-anchor" href="<__base>/screen/<screen>.html">` (today's
// text), never a button wired to __lbOpen; the no-card branch is unchanged (span.nl-anchor.plain).
// Static/vm pin, no browser needed (mirrors the file's AC-9/-12/-13 discipline) — note the fixture
// below deliberately passes NO `lbOpen`, since D5's whole point is that the anchor renders with no
// window.__lbOpen at all.
test('AC-20260913-06-7: a mock note on screen a with a drawn card+iframe.frame renders an <a class="nl-anchor"> whose href ends /screen/a.html, with no window.__lbOpen involved', async () => {
  const note = { id: 'N1', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'x', by: 'jj', resolvedBy: null }
  const panel = await evalNotesLayer({
    pathname: '/', metaContent: 'project', elementIds: ['s-a'], frameElementIds: ['s-a'],
    listResponse: [note],
  })
  const anchor = panel.created.find((el) => el.tagName === 'A' && classes(el).includes('nl-anchor'))
  assert.ok(anchor,
    'D5: the project panel must render an <a class="nl-anchor"> for a mock note whose screen carries a drawn card+iframe.frame — got ' +
    JSON.stringify(panel.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.match(String(anchor.href || ''), /\/screen\/a\.html$/,
    'D5: the anchor\'s href must end "/screen/a.html": got ' + JSON.stringify(anchor.href))
})

test('AC-20260913-06-7: a mock note whose screen has no drawn card renders span.nl-anchor.plain, unchanged', async () => {
  const note = { id: 'N2', scope: 'mock', screen: 'gone', state: null, status: 'open', text: 'x', by: 'jj', resolvedBy: null }
  const panel = await evalNotesLayer({
    pathname: '/', metaContent: 'project', elementIds: [], frameElementIds: [],
    listResponse: [note],
  })
  const span = panel.created.find((el) => el.tagName === 'SPAN' && classes(el).includes('nl-anchor') && classes(el).includes('plain'))
  assert.ok(span,
    'a mock note with no drawn card must still render span.nl-anchor.plain: got ' +
    JSON.stringify(panel.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.ok(!panel.created.some((el) => el.tagName === 'A' && classes(el).includes('nl-anchor')),
    'no card means no <a class="nl-anchor"> may render at all')
})

// ---- executed, headless Chrome (AC-10) -- findChrome/serve/withChrome are imported above from
// tests/mocks/chrome-harness.js, the one shared home for this trio.

function buildNavFixtureRoot() {
  const dir = tmpdir('atlas-nav')
  const mk = (rel, c) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c) }
  mk('docs/roadmap/01-chrome.md', '# 01\n```surfaces\nsession-live\n```\n')
  mk('design/mocks/session-live.html', '<main data-screen-label="session-live">live</main>\n')
  mk('design/mocks/notes.json', JSON.stringify([
    { id: 'N1', scope: 'mock', screen: 'session-live', state: 'default', kind: 'note', text: 'x', by: 'jj',
      at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
  ], null, 2) + '\n')
  return dir
}

