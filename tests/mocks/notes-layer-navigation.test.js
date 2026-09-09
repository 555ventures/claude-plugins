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

test('AC-20260907-09-9: the project panel renders a mock-scope note as button.nl-anchor "<screen> · <state>" when its screen card carries an iframe.frame (D7′(b)), and a non-interactive span.nl-anchor.plain "<screen> · not drawn" for a gap screen — a card with no frame, or no card at all', async () => {
  const note = { id: 'N9', scope: 'mock', screen: 'session-live', state: 'listening', status: 'open', text: 'x', by: 'jj', resolvedBy: null }

  const drawn = await evalNotesLayer({
    pathname: '/atlas/index.html', metaContent: 'project', elementIds: ['s-session-live'], frameElementIds: ['s-session-live'],
    lbOpen: function () {}, listResponse: [note],
  })
  const anchorBtn = drawn.created.find((el) => classes(el).includes('nl-anchor') && el.tagName === 'BUTTON')
  assert.ok(anchorBtn, 'D7/D7′(b): a mock-scope note whose screen card (#s-session-live) exists AND carries an iframe.frame must render a button.nl-anchor: got ' +
    JSON.stringify(drawn.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.strictEqual(anchorBtn.textContent, 'session-live · listening',
    'D7: the button.nl-anchor text must read "<screen> · <state>": got ' + JSON.stringify(anchorBtn.textContent))

  // D7′(b)'s whole point: a gap screen's chip DOES carry id="s-<label>" (so the pre-amendment
  // criterion admitted a live button with nothing to open) but never an iframe.frame — this must
  // still render the inert form. § Behavior: "a gap … the pill is plain grey text … and clicks
  // nothing."
  const cardNoFrame = await evalNotesLayer({
    pathname: '/atlas/index.html', metaContent: 'project', elementIds: ['s-session-live'], frameElementIds: [],
    lbOpen: function () {}, listResponse: [note],
  })
  const gapSpan = cardNoFrame.created.find((el) => classes(el).includes('nl-anchor') && el.tagName === 'SPAN')
  assert.ok(gapSpan, 'D7′(b): a screen card with no iframe.frame (a gap chip, which still carries id="s-<label>") must render an inert span.nl-anchor.plain, never a live button: got ' +
    JSON.stringify(cardNoFrame.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.ok(classes(gapSpan).includes('plain'), 'D7′(b): the gap-screen form must carry "plain" alongside "nl-anchor": got ' + JSON.stringify(gapSpan.className))
  assert.strictEqual(gapSpan.textContent, 'session-live · not drawn',
    'D7′(b): the gap-screen span text must read "<screen> · not drawn": got ' + JSON.stringify(gapSpan.textContent))
  assert.strictEqual(gapSpan.onclick, undefined, 'D7′(b): the gap-screen span must carry no click handler — Behavior: "clicks nothing"')

  const notDrawn = await evalNotesLayer({
    pathname: '/atlas/index.html', metaContent: 'project', elementIds: [],
    lbOpen: function () {}, listResponse: [note],
  })
  const anchorSpan = notDrawn.created.find((el) => classes(el).includes('nl-anchor') && el.tagName === 'SPAN')
  assert.ok(anchorSpan, 'D7: a mock-scope note whose screen card does not exist at all must render an inert span.nl-anchor.plain: got ' +
    JSON.stringify(notDrawn.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.ok(classes(anchorSpan).includes('plain'), 'D7: the inert form must carry "plain" alongside "nl-anchor": got ' + JSON.stringify(anchorSpan.className))
  assert.strictEqual(anchorSpan.textContent, 'session-live · not drawn',
    'D7: the inert span text must read "<screen> · not drawn": got ' + JSON.stringify(anchorSpan.textContent))
  assert.strictEqual(anchorSpan.onclick, undefined, 'D7: the inert span must carry no click handler — Behavior: "clicks nothing"')

  // Review finding: questionRow() had no isProject/mockAnchor branch at all, so a kind:"question"
  // note (always scope:"mock") rendered in the project panel as a bare ledger-id badge naming no
  // screen and clicking nothing — the only prior coverage exercised plain notes through noteRow.
  // mockAnchor(n) is now shared by noteRow AND questionRow. Two sibling cases: an OPEN question
  // whose screen is drawn (button, plus its Yes/No/Later controls untouched), and an ANSWERED
  // question whose screen is a gap (inert span, plus its "You confirmed" verdict line untouched)
  // — between the two, both the drawn/gap axis and the open/answered axis get covered, and the
  // ledger claim/rejected/answered treatment is proven undisturbed by the swap.
  const openQuestion = {
    id: 'N11', scope: 'mock', screen: 'session-live', state: 'listening', kind: 'question',
    ledgerId: 'W7', claim: 'single-use link', rejected: 'durable link', answer: null, text: 'fallback text',
  }
  const questionDrawn = await evalNotesLayer({
    pathname: '/atlas/index.html', metaContent: 'project', elementIds: ['s-session-live'], frameElementIds: ['s-session-live'],
    lbOpen: function () {}, listResponse: [openQuestion],
  })
  const qAnchorBtn = questionDrawn.created.find((el) => classes(el).includes('nl-anchor') && el.tagName === 'BUTTON')
  assert.ok(qAnchorBtn,
    'Review finding: a kind:"question" note in the project panel whose screen card carries an iframe.frame must ALSO render a button.nl-anchor — questionRow() must share mockAnchor(n) with noteRow(), not just a bare ledger-id badge: got ' +
    JSON.stringify(questionDrawn.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.strictEqual(qAnchorBtn.textContent, 'session-live · listening',
    'the question\'s button.nl-anchor text must read "<screen> · <state>" exactly like a plain note\'s: got ' + JSON.stringify(qAnchorBtn.textContent))
  assert.ok(!questionDrawn.created.some((el) => el.tagName === 'B' && classes(el).includes('nl-q-id')),
    'once the anchor swap applies, the question must not ALSO render its plain <b class="nl-q-id"> ledger badge — the anchor replaces it rather than sitting alongside it: got ' +
    JSON.stringify(questionDrawn.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  const qClaim = questionDrawn.created.find((el) => classes(el).includes('nl-q-claim'))
  assert.ok(qClaim && qClaim.textContent === 'I assumed single-use link',
    'the anchor swap must not disturb the ledger claim line ("I assumed <claim>") — losing it hides why the question was ever asked: got ' + JSON.stringify(qClaim && qClaim.textContent))
  const qRejected = questionDrawn.created.find((el) => classes(el).includes('nl-q-rejected'))
  assert.ok(qRejected && qRejected.textContent === 'I rejected: durable link',
    'the anchor swap must not disturb the ledger rejected line ("I rejected: <rejected>"): got ' + JSON.stringify(qRejected && qRejected.textContent))
  assert.ok(questionDrawn.created.some((el) => el.tagName === 'BUTTON' && el.textContent === "Yes, that's right"),
    'the anchor swap must not disturb an open question\'s Yes/No/Later controls — losing them leaves the question unanswerable from the project panel: got ' +
    JSON.stringify(questionDrawn.created.filter((el) => el.tagName === 'BUTTON').map((el) => el.textContent)))

  // mocks-driver.js's --state is optional — a question can be asked with none, leaving n.state
  // null. mockAnchor(n) then labels the button with the screen alone (no " · null", no dangling
  // separator with nothing after it).
  const statelessQuestion = {
    id: 'N13', scope: 'mock', screen: 'session-live', state: null, kind: 'question',
    ledgerId: 'W7', claim: 'single-use link', rejected: null, answer: null, text: 'fallback text',
  }
  const statelessDrawn = await evalNotesLayer({
    pathname: '/atlas/index.html', metaContent: 'project', elementIds: ['s-session-live'], frameElementIds: ['s-session-live'],
    lbOpen: function () {}, listResponse: [statelessQuestion],
  })
  const statelessBtn = statelessDrawn.created.find((el) => classes(el).includes('nl-anchor') && el.tagName === 'BUTTON')
  assert.ok(statelessBtn, 'a stateless (state:null) question whose screen card carries an iframe.frame must still render a button.nl-anchor: got ' +
    JSON.stringify(statelessDrawn.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.strictEqual(statelessBtn.textContent, 'session-live',
    'a stateless question\'s button.nl-anchor must be labelled with the screen alone — no " · null" and no dangling separator: got ' + JSON.stringify(statelessBtn.textContent))

  const answeredQuestion = {
    id: 'N12', scope: 'mock', screen: 'session-live', state: 'listening', kind: 'question',
    ledgerId: 'W7', claim: 'single-use link', rejected: null, answer: { verdict: 'yes' }, text: 'fallback text',
  }

  // D7′(b)'s actual gap case is a card that DOES carry id="s-<screen>" but no iframe.frame — that
  // is exactly what admitted a live, dead button before the fix (a gap chip carries the id with
  // nothing to open). The plain-note branch above already models this with
  // elementIds:['s-session-live'], frameElementIds:[] — the question path needs the same sibling
  // case, not just the separate "no card at all" state below.
  const questionCardNoFrame = await evalNotesLayer({
    pathname: '/atlas/index.html', metaContent: 'project', elementIds: ['s-session-live'], frameElementIds: [],
    listResponse: [answeredQuestion],
  })
  const qCardNoFrameSpan = questionCardNoFrame.created.find((el) => classes(el).includes('nl-anchor') && el.tagName === 'SPAN')
  assert.ok(qCardNoFrameSpan,
    'D7′(b): a kind:"question" note whose screen card (#s-session-live) exists but carries no iframe.frame must ALSO render an inert span.nl-anchor.plain, never a live button: got ' +
    JSON.stringify(questionCardNoFrame.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.ok(classes(qCardNoFrameSpan).includes('plain'), 'the gap-screen question form must carry "plain" alongside "nl-anchor": got ' + JSON.stringify(qCardNoFrameSpan.className))
  assert.strictEqual(qCardNoFrameSpan.textContent, 'session-live · not drawn',
    'the gap-screen question span text must read "<screen> · not drawn": got ' + JSON.stringify(qCardNoFrameSpan.textContent))
  const qCardNoFrameVerdict = questionCardNoFrame.created.find((el) => classes(el).includes('nl-q-answered'))
  assert.ok(qCardNoFrameVerdict && qCardNoFrameVerdict.textContent === 'You confirmed',
    'the anchor swap must not disturb an answered question\'s verdict line ("You confirmed") — losing it hides that the question was ever settled: got ' + JSON.stringify(qCardNoFrameVerdict && qCardNoFrameVerdict.textContent))
  assert.ok(!questionCardNoFrame.created.some((el) => el.tagName === 'BUTTON' && /Yes, that|No, it|Later/.test(el.textContent || '')),
    'an answered question must render no Yes/No/Later controls, swap or no swap — re-showing them would let the panel re-ask a settled question: got ' +
    JSON.stringify(questionCardNoFrame.created.filter((el) => el.tagName === 'BUTTON').map((el) => el.textContent)))

  // A third, distinct state: no card at all (the screen was never drawn, or its label since
  // disappeared) — kept alongside the real D7′(b) gap case above rather than in place of it.
  const questionNoCard = await evalNotesLayer({
    pathname: '/atlas/index.html', metaContent: 'project', elementIds: [], listResponse: [answeredQuestion],
  })
  const qNoCardSpan = questionNoCard.created.find((el) => classes(el).includes('nl-anchor') && el.tagName === 'SPAN')
  assert.ok(qNoCardSpan, 'a kind:"question" note whose screen card does not exist at all must ALSO render an inert span.nl-anchor.plain: got ' +
    JSON.stringify(questionNoCard.created.map((el) => ({ tag: el.tagName, cls: el.className }))))
  assert.ok(classes(qNoCardSpan).includes('plain'), 'the no-card question form must carry "plain" alongside "nl-anchor": got ' + JSON.stringify(qNoCardSpan.className))
  assert.strictEqual(qNoCardSpan.textContent, 'session-live · not drawn',
    'the no-card question span text must read "<screen> · not drawn": got ' + JSON.stringify(qNoCardSpan.textContent))
  const qNoCardVerdict = questionNoCard.created.find((el) => classes(el).includes('nl-q-answered'))
  assert.ok(qNoCardVerdict && qNoCardVerdict.textContent === 'You confirmed',
    'the anchor swap must not disturb an answered question\'s verdict line ("You confirmed") in the no-card case either: got ' + JSON.stringify(qNoCardVerdict && qNoCardVerdict.textContent))
  assert.ok(!questionNoCard.created.some((el) => el.tagName === 'BUTTON' && /Yes, that|No, it|Later/.test(el.textContent || '')),
    'an answered question must render no Yes/No/Later controls in the no-card case either: got ' +
    JSON.stringify(questionNoCard.created.filter((el) => el.tagName === 'BUTTON').map((el) => el.textContent)))
})

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

test('AC-20260907-09-12: a mock-scope page renders exactly one a.nl-up inside the strip heading linking to <base>/atlas/index.html#nl-notes, and a project-scope page mounts its panel via insertAdjacentElement("afterend", …) on #nl-notes when that element exists', async () => {
  const plain = await evalNotesLayer({ pathname: '/mocks/a.html', metaContent: 'mock', screenLabel: 'a', listResponse: [] })
  const upLinks = plain.created.filter((el) => el.tagName === 'A' && classes(el).includes('nl-up'))
  assert.strictEqual(upLinks.length, 1, 'D8: the strip heading must carry exactly one a.nl-up: got ' + upLinks.length)
  assert.strictEqual(upLinks[0].textContent, 'Project notes ↗', 'D8: the link text must be exactly "Project notes ↗": got ' + JSON.stringify(upLinks[0].textContent))
  assert.strictEqual(upLinks[0].href, '/atlas/index.html#nl-notes', 'D8: with no mount prefix the href must be "/atlas/index.html#nl-notes": got ' + JSON.stringify(upLinks[0].href))
  const stripHead = plain.created.find((el) => el.tagName === 'H4')
  assert.ok(stripHead && stripHead.children.includes(upLinks[0]),
    'D8: the a.nl-up must render inside the strip heading itself, not as a detached sibling: got heading children ' + JSON.stringify((stripHead || {}).children))

  const mounted = await evalNotesLayer({ pathname: '/p/demo/mocks/a.html', metaContent: 'mock', screenLabel: 'a', listResponse: [] })
  const upLinks2 = mounted.created.filter((el) => el.tagName === 'A' && classes(el).includes('nl-up'))
  assert.strictEqual(upLinks2.length, 1, 'D8: under a /p/demo mount the strip heading must still carry exactly one a.nl-up')
  assert.strictEqual(upLinks2[0].href, '/p/demo/atlas/index.html#nl-notes',
    'D8: under a /p/demo mount the href must be "/p/demo/atlas/index.html#nl-notes": got ' + JSON.stringify(upLinks2[0].href))

  const withAnchor = await evalNotesLayer({ pathname: '/atlas/index.html', metaContent: 'project', elementIds: ['nl-notes'], listResponse: [] })
  const nlNotesEl = withAnchor.idMap.get('nl-notes')
  assert.ok(nlNotesEl.insertedAfter && nlNotesEl.insertedAfter.some((x) => x.pos === 'afterend'),
    'D8: on a project-scope page whose document holds #nl-notes, the panel must mount via insertAdjacentElement("afterend", …) on #nl-notes itself, not on document.body: got ' +
    JSON.stringify(nlNotesEl.insertedAfter))
})

test('AC-20260907-09-13: the notes layer source SHALL CONTINUE TO emit no control that navigates to a mock page state — no "?state=" literal, no "#state=" literal, and no .href assignment built from a state value anywhere in the file', () => {
  const src = fs.readFileSync(LIB, 'utf8')
  assert.doesNotMatch(src, /\?state=/, 'D9: the notes layer must never construct a "?state=" URL — Fable\'s refusal: no deep link into a mock state')
  assert.doesNotMatch(src, /#state=/, 'D9: the notes layer must never construct a "#state=" hash URL either — a hash-form deep link into a mock state is the same refusal, just spelled differently')

  // The AC's own text reaches past the one literal above to "no state-scoped deep link
  // anywhere" — so every .href assignment in the file (not just the two spelled forms above) is
  // inspected for a reference to a state value in its own construction, regardless of how that
  // link would be spelled (query, hash, or path segment).
  const hrefAssignments = [...src.matchAll(/\.href\s*=\s*([^\n;]+)[;\n]/g)].map((m) => m[1])
  assert.ok(hrefAssignments.length > 0,
    'test setup: the layer must assign at least one .href somewhere (the viewer.css link, the nl-up link) or this sweep proves nothing')
  for (const rhs of hrefAssignments) {
    assert.doesNotMatch(rhs, /state/i,
      'D9: no .href assignment anywhere in the file may reference a state value in its own construction — a state-scoped deep link is banned regardless of how the URL is spelled: got ".href = ' + rhs + '"')
  }
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

test('AC-20260907-09-10: activating a served project panel\'s button.nl-anchor opens the lightbox (#lb.on) on that note\'s screen, and Escape then closes it leaving the panel rendered and the scroll position unchanged', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — AC-20260907-09-10 requires the real atlas lightbox/notes-layer wiring')
  const dir = buildNavFixtureRoot()
  const port = 43570 + (process.pid % 300)
  const { child, ready } = serve(dir, port)
  try {
    await ready
    await withChrome(chrome, async ({ navigate, evalJs, sleep }) => {
      await navigate('http://127.0.0.1:' + port + '/atlas/index.html')
      await sleep(400) // let the notes layer's initial refresh()/render() land

      const before = await evalJs(`
        (function () {
          window.scrollTo(0, 40)
          var lb = document.getElementById('lb')
          return { scrollY: window.scrollY, lbOn: !!(lb && lb.classList.contains('on')) }
        })()
      `)
      assert.strictEqual(before.lbOn, false, 'test setup: the lightbox must start closed')

      const opened = await evalJs(`
        (function () {
          var hosts = Array.prototype.slice.call(document.querySelectorAll('.nl-host'))
          var btn = null
          for (var i = 0; i < hosts.length; i++) {
            var r = hosts[i].shadowRoot
            var b = r && r.querySelector('button.nl-anchor')
            if (b) { btn = b; break }
          }
          if (!btn) return { found: false }
          btn.click()
          var lb = document.getElementById('lb')
          var frame = document.getElementById('lbframe')
          return { found: true, lbOn: lb.classList.contains('on'), src: frame ? (frame.getAttribute('src') || frame.src) : null }
        })()
      `)
      assert.strictEqual(opened.found, true, 'D7/D9: the served atlas must render a button.nl-anchor for the session-live note inside a .nl-host shadow root: got ' + JSON.stringify(opened))
      assert.strictEqual(opened.lbOn, true, 'D9: activating button.nl-anchor must open the lightbox (#lb.on): got ' + JSON.stringify(opened))
      assert.match(String(opened.src), /session-live/, 'D9: the opened lightbox frame must show that note\'s screen: got ' + JSON.stringify(opened))

      const afterEscape = await evalJs(`
        (function () {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          var lb = document.getElementById('lb')
          return { lbOn: lb.classList.contains('on'), scrollY: window.scrollY, panelStillThere: document.querySelectorAll('.nl-host').length > 0 }
        })()
      `)
      assert.strictEqual(afterEscape.lbOn, false, 'D9: Escape must close the lightbox')
      assert.strictEqual(afterEscape.scrollY, 40, 'D9: Escape must leave the page scroll position unchanged — no navigation, no reset: got ' + JSON.stringify(afterEscape))
      assert.strictEqual(afterEscape.panelStillThere, true, 'D9: the notes panel must still be rendered after Escape closes the lightbox')
    })
  } finally {
    child.kill('SIGTERM')
    await new Promise((r) => child.on('exit', r))
  }
})
