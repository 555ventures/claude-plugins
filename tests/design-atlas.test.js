'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const vm = require('node:vm')
const { spawn, spawnSync } = require('node:child_process')
const { tmpdir, runNode, SPEC, read, freePort, serveAtlas, withHandler } = require('./helpers')

const atlas = (argv, opts) => runNode('scripts/design-atlas.js', argv, opts)

// specs/20260905/01-picks-on-the-atlas-page.md D2: design-atlas.js guards its CLI dispatch
// behind require.main, so a plain top-level require() of the script never runs the CLI and
// returns the module's exports (buildAtlas, page, frameTag, createRequestHandler) untouched.
// The cache bust lets each test that mutates a fixture on disk (design-coverage.json, roadmap
// docs) re-require a fresh module against the new state.
function loadDesignAtlas() {
  const scriptPath = path.join(SPEC, 'scripts/design-atlas.js')
  delete require.cache[scriptPath]
  return require(scriptPath)
}

// withHandler(root, prefix, fn) — the in-process createRequestHandler HTTP harness (A4: never a
// child process for these) — lives once in tests/helpers.js now, shared with
// tests/mocks/walk-mode.test.js and tests/mocks/theme-serve.test.js
// (specs/20260910/04-theme-before-the-client-walk.md D12 clean-up round).

// Balanced-<div> element extraction (extractFn's brace-matching, adapted for markup) — lets the
// buildAtlas rendering tests below isolate exactly the compare-table/stop element they assert on
// instead of matching loose substrings that could accidentally straddle sibling elements.
function sliceElement(html, openMarker) {
  const start = html.indexOf(openMarker)
  if (start === -1) return null
  const tagRe = /<div\b|<\/div>/g
  tagRe.lastIndex = html.indexOf('>', start) + 1
  let depth = 1
  let m
  while ((m = tagRe.exec(html))) {
    if (m[0] === '<div') depth++
    else depth--
    if (depth === 0) return html.slice(start, m.index + m[0].length)
  }
  return null
}

function writePicksJson(dir, stops) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/picks.json'), JSON.stringify(stops, null, 2) + '\n')
}

function fixture() {
  const dir = tmpdir('atlas')
  const mk = (rel, content) => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  mk('design/mocks/lobby.html',
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="approved" style="color:var(--text-body)">Lobby</main>\n')
  mk('design/mocks/thread.html',
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="thread">Thread</main>\n')
  mk('docs/roadmap/01-chrome.md',
    '# 01\n```surfaces\nsignin\nsignin -> lobby\nlobby -> thread\nlobby -> account\n# a comment\n```\n')
  mk('.claude/design-coverage.json', JSON.stringify({
    sources: { 'design/mocks': { regions: { 'lobby#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' } } } },
  }))
  mk('specs/20260716/01-x.md', '---\nstatus: done\n---\n# x\n')
  return dir
}

// specs/20260905/01-picks-on-the-atlas-page.md D1/D2/D3/D4/D5, AC-20260905-01-3..-10/-12:
// design-atlas.js's require.main guard, createRequestHandler, the picks endpoints, the stop
// rendering, and the inline decide script; notes-layer.browser.js's notes-scope handling.

function hashTree(root) {
  const out = {}
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else out[path.relative(root, p)] = fs.readFileSync(p)
    }
  }
  walk(root)
  return out
}

function makeNotesLayerDom({ metaContent, screenLabel } = {}) {
  const created = []
  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      appendChild(c) { this.children.push(c); return c },
      insertAdjacentElement(_pos, c) { return c },
      addEventListener() {},
      setAttribute(k, v) { this[k] = v },
      getAttribute(k) { return this[k] },
      remove() {},
      attachShadow() { const root = makeEl('#shadow-root'); this.shadowRoot = root; return root },
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
  const document = {
    head, body,
    createElement: makeEl,
    querySelector(sel) {
      if (sel === 'meta[name="notes-scope"]') return metaEl
      if (sel === '[data-screen-label]') return screenEl
      return null
    },
    querySelectorAll() { return [] },
  }
  return { document, created }
}

function evalNotesLayer({ pathname, metaContent, screenLabel }) {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/notes-layer.browser.js'), 'utf8')
  const { document, created } = makeNotesLayerDom({ metaContent, screenLabel })
  const fetchCalls = []
  const sandbox = {
    location: { pathname, search: '' },
    document,
    window: { prompt: () => 'jj' },
    localStorage: { getItem: () => 'jj', setItem() {} },
    fetch(url) { fetchCalls.push(url); return Promise.resolve({ json: () => Promise.resolve([]) }) },
    URLSearchParams,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  return { fetchCalls, created, document }
}

// specs/20260902/09-one-hand-wireframes-one-token-set.md D5, AC-20260902-09-5: page() reads
// spec/templates/mocks/viewer.css and inlines it before its own rules, and every chrome rule
// (badges, bar, cards, gap chips, lightbox, matrix toolbar, gallery cards) is rewritten onto
// var(--v-*) roles — no chrome literal survives in the emitted page's <style>. page() today has
// no viewer.css read at all and every current chrome rule is a literal hex color (#111, #333,
// #8fa8ff, …), so both tests below are red pre-D5.
function assertChromeTokenized(out, label) {
  const styleMatch = out.match(/<style>([\s\S]*?)<\/style>/)
  assert.ok(styleMatch, label + ': the emitted page must carry a <style> block to inspect for chrome literals')
  const style = styleMatch[1]
  assert.match(style, /--v-bg:/,
    label + ": the inlined chrome stylesheet must declare --v-bg — D5 requires viewer.css's " +
    "full --v-* register to be inlined into every chrome page's own <style> block")
  const withoutRoot = style.replace(/:root\s*\{[\s\S]*?\}/, '')
  assert.doesNotMatch(withoutRoot, /#[0-9a-f]{3,8}\b/i,
    label + ' no hex color literal may survive in the chrome CSS outside the inlined ' +
    ':root{…} block — every chrome rule must consume a var(--v-*) role, never a literal color')
}

test('gallery: one card per candidate subdir, lazy iframes, deterministic output path', () => {
  const dir = fixture()
  for (const c of ['r0-instrument', 'r0-guide']) {
    fs.mkdirSync(path.join(dir, 'design/explore', c), { recursive: true })
    fs.writeFileSync(path.join(dir, 'design/explore', c, 'tile.html'),
      '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  }
  const res = atlas(['gallery', path.join(dir, 'design/explore')])
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assert.match(out, /r0-guide/)
  assert.match(out, /r0-instrument/)
  assert.match(out, /loading="lazy"/)
})

test('build: a mock with no brief AND no claim is an orphan; a non-done claiming spec is bound, not built', () => {
  const dir = fixture()
  fs.writeFileSync(path.join(dir, 'design/mocks/rogue.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="rogue">R</main>\n')
  fs.writeFileSync(path.join(dir, 'specs/20260716/01-x.md'), '---\nstatus: implementing\n---\n# x\n')
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.match(out, /badge orphan/)
  assert.match(out, /badge bound/)
  assert.doesNotMatch(out, /badge built/)
})

test('build: a ledger-claimed mock is NOT an orphan even when no brief declares it (standalone-spec mocks)', () => {
  const dir = fixture()
  // solo: undeclared in any surfaces block, but claimed by a spec via the coverage ledger
  fs.writeFileSync(path.join(dir, 'design/mocks/solo.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="solo">S</main>\n')
  fs.writeFileSync(path.join(dir, '.claude/design-coverage.json'), JSON.stringify({
    sources: { 'design/mocks': { regions: {
      'lobby#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' },
      'solo#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' },
    } } },
  }))
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(out, /badge orphan/)
  assert.match(out, /id="s-solo"/)
})

const TARGETS = JSON.stringify({
  schemaVersion: 1,
  themes: ['light', 'dark'],
  viewports: [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 834, height: 1112 },
    { name: 'desktop', width: 1280, height: 800 },
  ],
})

test('check: matrix binds at approved (or --matrix); sketches iterate one framing for free', () => {
  const dir = fixture()
  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  // fixture: lobby is approved (owes the matrix), thread is a sketch (exempt); no viewport
  // meta anywhere, and the linked tokens.css does not exist
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1)
  assert.match(bad.stdout, /lobby\.html: no <meta name="viewport">/)
  assert.match(bad.stdout, /lobby\.html: dark theme declared .* tokens\.css is unreadable/)
  assert.doesNotMatch(bad.stdout, /thread\.html: no <meta/, 'sketch mocks are exempt without --matrix')

  // --matrix forces the checks onto drafts too (the post-approval expansion gate)
  const forced = atlas(['check', '--matrix', path.join(dir, 'design/mocks')])
  assert.strictEqual(forced.status, 1)
  assert.match(forced.stdout, /thread\.html: no <meta name="viewport">/)

  // light-only tokens: the approved mock still fails on the missing dark block
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), ':root{--text-body:#111}\n')
  const noDark = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(noDark.status, 1)
  assert.match(noDark.stdout, /no dark theme block/)

  // expanded: responsive single file + themed tokens → pass, sketch untouched
  fs.appendFileSync(path.join(dir, 'design/tokens.css'), ':root[data-theme="dark"]{--text-body:#eee}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/lobby.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="approved">x</main>\n')
  const ok = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
})

test('build/gallery: matrix toolbar emitted only when targets.json exists', () => {
  const dir = fixture()
  atlas(['build'], { cwd: dir })
  let out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(out, /data-vp/, 'no toolbar without targets.json')

  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  atlas(['build'], { cwd: dir })
  out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.match(out, /mobile 390/)
  assert.match(out, /desktop 1280/)
  assert.match(out, /setAttribute\("data-theme",t\)/, 'theme toggle stamps data-theme on frames')
  assert.match(out, /querySelector\("\.vp"\)[^\n]*textContent=w\+"\\u00d7"\+h/,
    'viewport toggle rewrites each card\'s WxH label (JJ 2026-09-05: label stuck at 390×844 after desktop)')

  fs.mkdirSync(path.join(dir, 'design/explore/r0-a'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/explore/r0-a/tile.html'),
    '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  atlas(['gallery', path.join(dir, 'design/explore')])
  const gal = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assert.match(gal, /tablet 834/, 'gallery finds design/targets.json by walking up')
})

// specs/20260824/03-mock-states-hygiene.md D1: `check` gains four hygiene rules bound at
// data-status ratified|approved (or --matrix), each pinned to a measured false-positive
// class. D2 makes `ratified` equivalent to `approved` for every existing check too. These
// checks do not exist on the pre-spec script — every test below is red until cmdCheck grows
// checks (a)-(d) and statusOf's `approved`-only matrix gate widens to include `ratified`.
// mockHtml() builds an otherwise-fully-compliant ratified mock so each test isolates exactly one
// hygiene rule via a single mutation, per the spec's own worked AC examples.

function mockHtml({ style, status = 'ratified', beforeRoot = '',
  stateBtn = '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>' } = {}) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    beforeRoot +
    '<style>\n' + style + '\n</style>\n' +
    '<main class="screen" data-screen-label="lobby" data-status="' + status + '">\n' +
    stateBtn + '\nLobby\n</main>\n'
}

function writeMock(dir, html) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const p = path.join(dir, 'design/mocks/lobby.html')
  fs.writeFileSync(p, html)
  return p
}

// specs/20260906/06-sketch-high-fidelity-and-critique.md D1, AC-20260906-06-1/-2: `check` flags a
// mock that still links the wireframe register (wire/) once design/tokens.css exists above it —
// violation at ratified only, ⚠️ warn at sketch, `approved` exempt with or without --matrix. TDD
// red: cmdCheck today has no wire-register rule at all, so a ratified mock linking wire/wire.css
// alongside tokens.css passes clean today and a sketch mock prints no warn line for it.
function wireAfterThemeMock(status) {
  return mockHtml({
    status,
    style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }',
    beforeRoot: '<link rel="stylesheet" href="../wire/wire.css">\n',
  })
}

// specs/20260908/07-one-wire-register-predicate.md D7: the "does not link a tokens.css" rule
// now requires a stylesheetTargets(html) member whose final path segment is tokens.css, instead
// of design-atlas.js's own `/<link[^>]+tokens\.css/` — a regex with no `rel` gate at all (so a
// non-stylesheet `<link>` satisfies it, AC-13) and blind to @import (so a page styled only
// through @import fails it, AC-6, the executed A5 defect).
function tokensViaImportMock(status = 'ratified') {
  return '<style>@import "../wire/tokens.css";</style>\n' +
    '<style>\n* { box-sizing: border-box; }\n.screen { color: var(--text-body); }\n</style>\n' +
    '<main class="screen" data-screen-label="lobby" data-status="' + status + '">\n' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>\nLobby\n</main>\n'
}

function tokensIconOnlyMock(status = 'ratified') {
  return '<link rel="icon" href="tokens.css">\n' +
    '<style>* { box-sizing: border-box; }\n.screen { color: var(--text-body); }</style>\n' +
    '<main class="screen" data-screen-label="lobby" data-status="' + status + '">\n' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>\nLobby\n</main>\n'
}

// specs/20260906/06-sketch-high-fidelity-and-critique.md D3, AC-20260906-06-5: `check` flags a
// ratified mock carrying an unresolved scope:"mock" note on its own label (from design/mocks/
// notes.json, the same walk-up as D1 per A2) — violation at ratified, ⚠️ warn at sketch, and a
// pass once every note on the label is resolved or the root has no notes store at all. TDD red:
// cmdCheck reads no notes store today, so an open critic note never surfaces here.
function labeledMock({ label, status = 'ratified' }) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>\n* { box-sizing: border-box; }\n.screen { color: var(--text-body); }\n</style>\n' +
    '<main class="screen" data-screen-label="' + label + '" data-status="' + status + '">\n' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>\n' + label + '\n</main>\n'
}
function noteOn(id, screen, status) {
  return {
    id, scope: 'mock', screen, state: 'error', text: 'no way back to the invite', by: 'critic',
    at: '2026-01-01T00:00:00.000Z', status, addressed: null, reply: null,
    resolvedBy: status === 'resolved' ? 'critic' : null,
    resolvedAt: status === 'resolved' ? '2026-01-01T00:00:00.000Z' : null,
  }
}

// specs/20260901/04-shell-composed-mocks.md D1: design/shell/<name>.html carries the canon
// shape (data-shell-canon root, named data-slots, one empty content slot, non-content slots
// data-contract="none") plus a linked <name>.css; D4 binds a shell family on `check`, tiered
// warn-at-sketch/violation-at-ratified|approved|--matrix, once a design/shell dir resolves by
// walk-up from the mock. AC-6 above (tagged, unchanged) is the absence-invariant control: no
// existing fixture carries a design/shell dir (Assumption A2), so it must stay green throughout.
//
// CANON_APP_HTML/SHELL_APP_CSS are the literal D1 Contracts example. expectedInner()/syncedRegion()
// rebuild D3's splice (content-slot substitution + active-nav aria-current) by exact substring
// surgery on that same literal, so every "synced" fixture below is byte-consistent with the canon
// by construction rather than hand-typed and hoped-correct.

const CANON_APP_HTML = '<!doctype html><html><head><meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<link rel="stylesheet" href="../tokens.css">\n' +
  '<link rel="stylesheet" href="app.css">\n' +
  '<style>* { box-sizing: border-box; }</style></head><body>\n' +
  '<div data-shell-canon="app" class="shell">\n' +
  '  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
  '    <a data-nav="inbox" href="#">Inbox</a>\n' +
  '    <a data-nav="settings" href="#">Settings</a>\n' +
  '  </nav>\n' +
  '  <header data-slot="header" data-contract="none">…</header>\n' +
  '  <main data-slot="content"></main>\n' +
  '</div></body></html>\n'

const SHELL_APP_CSS = '.shell { display: flex; gap: 1rem; }\n' +
  '.shell nav a { color: var(--text-body); font-size: 14px; line-height: 1.4; }\n'

function writeShellDir(dir, { name = 'app', canon = CANON_APP_HTML, css = SHELL_APP_CSS } = {}) {
  fs.mkdirSync(path.join(dir, 'design/shell'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shell', name + '.html'), canon)
  fs.writeFileSync(path.join(dir, 'design/shell', name + '.css'), css)
}

// D3's splice: canon inner with the content slot's inner replaced, then aria-current="page"
// appended to the one data-nav anchor matching `active` (stripped everywhere else — there is
// nowhere else here, since the canon never carries one).
function expectedInner({ contentInner = '', active = 'inbox' } = {}) {
  let inner = '\n  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
    '    <a data-nav="inbox" href="#">Inbox</a>\n' +
    '    <a data-nav="settings" href="#">Settings</a>\n' +
    '  </nav>\n' +
    '  <header data-slot="header" data-contract="none">…</header>\n' +
    '  <main data-slot="content"></main>\n'
  inner = inner.replace('<main data-slot="content"></main>', '<main data-slot="content">' + contentInner + '</main>')
  if (active === 'inbox') inner = inner.replace('<a data-nav="inbox" href="#">', '<a data-nav="inbox" href="#" aria-current="page">')
  if (active === 'settings') inner = inner.replace('<a data-nav="settings" href="#">', '<a data-nav="settings" href="#" aria-current="page">')
  return inner
}

function syncedRegion(opts) {
  return '<div data-shell-region="app" class="shell">' + expectedInner(opts) + '</div>'
}

// A fully declared, synced (by construction) page mock per D2's Contracts example.
function mockDeclaring({ label = 'inbox', status = 'ratified', active = 'inbox',
  contentInner = '<h1>Inbox</h1>' } = {}) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<link rel="stylesheet" href="../shell/app.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-screen-label="' + label + '" data-status="' + status + '" data-shell="app" data-active="' + active + '">' +
    syncedRegion({ contentInner, active }) +
    '</div>\n'
}

// specs/20260902/10-page-notes-review-loop.md D2/D3, AC-20260902-10-2/-3/-4 (TDD red): serve
// has no notes injection, no /__notes/* endpoints, and lib/notes-layer.browser.js does not
// exist yet — this helper mirrors AC-20260902-07-12's runner above.
// specs/20260909/06-ephemeral-serve-ports.md D3/D4: no caller of withServe needs a specific
// port (the three pid-offset windows below existed only to keep this file's own concurrent
// serve calls from colliding with each other and with other files) — withServe is now a thin
// call to helpers.serveAtlas, which binds ephemerally and hands back whatever port it got.
async function withServe(dir, fn) {
  const s = await serveAtlas(dir)
  const port = s.port
  try {
    function get(urlPath) {
      return new Promise((resolve, reject) => {
        http.get({ host: 'localhost', port, path: urlPath }, (res) => {
          let body = ''
          res.on('data', (c) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
        }).on('error', reject)
      })
    }
    function post(urlPath, obj) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(obj)
        const req = http.request({
          host: 'localhost', port, path: urlPath, method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
        }, (res) => {
          let body = ''
          res.on('data', (c) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
        })
        req.on('error', reject)
        req.end(data)
      })
    }

    await fn({ get, post, port })
  } finally {
    // Harness-level hardening (repair, AC-20260902-07-12 sibling): a failure anywhere above must
    // not orphan the serve child, or it keeps the event loop alive and hangs the whole test
    // process, not just this test — serveAtlas's own stop() carries the same SIGTERM/SIGKILL
    // ladder.
    await s.stop()
  }
}

// specs/20260905/04-per-project-look-server.md D2: design-atlas.js has no `stop` subcommand yet
// — `stop open|decide|list` all fall through to the generic usage die() (exit 2), so every
// assertion below is red until the three subcommands move here from the deleted hub script (D1).
// AC-20260905-04-2, AC-20260905-04-3, AC-20260905-04-4.

// specs/20260909/06-ephemeral-serve-ports.md D2/D3: freePort() now comes from tests/helpers.js
// (AC-20260909-06-5's own look-stop callers keep it too) — these AC-20260905-04-* tests need a
// specific, known-ahead-of-time port (the `stop open --port <p>` CLI argument below must match
// the port the serve child actually bound), so freePort() + a fixed-port serveAtlas call is the
// sanctioned shape, not `--port 0`.
//
// Starts a `design-atlas.js serve --root <dir> --port <port>` child, waits for its first stdout
// line (readiness), runs `fn`, and always tears the child down — a hung/failed assertion in `fn`
// must never leave a listening server behind (AC-20260905-04-2/-3/-4's shared hygiene rule).
async function withServeAt(dir, port, fn) {
  const s = await serveAtlas(dir, { port })
  try {
    return await fn()
  } finally {
    await s.stop()
  }
}

function getPath(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    }).on('error', reject)
  })
}

function readPicksOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
}

test('atlas card previews clamp to one fixed height (7.89.0): page() ships the .shot max-height clamp, the clip fade, and a __fit that toggles .clip when the scaled mock overflows the cap', () => {
  const { page } = require('../spec/scripts/design-atlas.js')
  const html = page('t', '<div class="grid"></div>')
  assert.match(html, /\.shot\{position:relative;max-height:var\(--v-shot-max,260px\)\}/,
    'card previews must carry a fixed max-height so a tall mock never makes a tall card — got no .shot clamp')
  assert.match(html, /\.shot\.clip::after\{[^}]*linear-gradient/,
    'the clipped remainder must fade out (a .shot.clip::after gradient) — got none')
  // page() takes the body from its caller (UI_SCRIPT is appended by buildAtlas), so the __fit
  // clause is pinned on the script source itself.
  const src = fs.readFileSync(path.join(__dirname, '..', 'spec', 'scripts', 'design-atlas.js'), 'utf8')
  assert.match(src, /s\.classList\.toggle\("clip",full>cap\)/,
    '__fit must mark a card .clip only when the scaled height exceeds the cap — got no toggle')
})

// ---------------------------------------------------------------------------
// specs/20260906/03-questions-on-the-wireframe.md — TDD red: D3's /__notes/list ledger join,
// /__notes/answer, the /__notes/resolve question refusal, and /__notes/add's reason/kind handling
// do not exist yet on design-atlas.js; D5's question-row rendering, its three controls, and the
// composer's reason chips + scope toggle do not exist yet on lib/notes-layer.browser.js.
// ---------------------------------------------------------------------------

function writeQuestionLedger(dir, rows) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const rowLines = rows.map((r) => `| ${r.id} | ${r.step} | ${r.kind} | ${r.claim} | ${r.tag} | ${r.status} | ${r.rejected || '-'} | - | - |`).join('\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/ledger.md'), `# Provenance ledger — { project }

## Assumptions

| id | step | kind | claim | tag | status | rejected | dependents | note |
| - | - | - | - | - | - | - | - | - |
${rowLines}

## Misunderstandings

| id | what | step | cost | note |
| - | - | - | - | - |
`)
}

function writeQuestionNotes(dir, notes) {
  fs.writeFileSync(path.join(dir, 'design/mocks/notes.json'), JSON.stringify(notes, null, 2) + '\n')
}

// s3 repair (review of specs/20260906/03-questions-on-the-wireframe.md build): AC-20260906-03-4
// promises the rewrite touches ONLY the named row — a regex match against the other row's text
// proves that row's cells are still present somewhere in the file, not that every other BYTE
// (including line order, whitespace, and every other row) is untouched. Compare line-by-line
// against a captured before-snapshot instead: every line except the named row's must be
// byte-identical, and the named row's line must match the expected rewritten shape.
function assertLedgerOnlyRowChanged(before, after, id, expectedRowRegex, message) {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  assert.strictEqual(afterLines.length, beforeLines.length,
    message + ' — the rewrite must not add or remove any line: before had ' + beforeLines.length + ', after has ' + afterLines.length)
  const rowMarker = '| ' + id + ' |'
  let sawRow = false
  for (let i = 0; i < beforeLines.length; i++) {
    if (beforeLines[i].startsWith(rowMarker)) {
      sawRow = true
      assert.match(afterLines[i], expectedRowRegex,
        message + ' — line ' + (i + 1) + ' (the ' + id + ' row) must match the expected rewritten row: got ' + JSON.stringify(afterLines[i]))
    } else {
      assert.strictEqual(afterLines[i], beforeLines[i],
        message + ' — line ' + (i + 1) + ' (not the ' + id + ' row) must be byte-for-byte unchanged: before ' + JSON.stringify(beforeLines[i]) + ' after ' + JSON.stringify(afterLines[i]))
    }
  }
  assert.ok(sawRow, 'test setup requires the ' + id + ' row to exist in the before-snapshot, or this comparison proves nothing')
}

function baseQuestion(id, screen, ledgerId) {
  return {
    id, scope: 'mock', screen, state: null, kind: 'question', ledgerId,
    text: 'claim', by: 'session', at: new Date().toISOString(), status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null,
  }
}

// ---------------------------------------------------------------------------
// specs/20260906/04-journey-review-page.md — TDD red: the `/review/<j>.html` route, `?state=`
// mock injection, and `/__review/review.js` do not exist yet on design-atlas.js;
// lib/review-page.js and lib/review.browser.js do not exist yet either.
// ---------------------------------------------------------------------------

function writeReviewSeed(dir, journeyName, labels) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'), `# Seed — Hearwell

## Product
It is a synthetic product for the review-page tests.
Built for QA engineers.
It must let a user complete a short flow.

## Facts
- primary-surface: P1

## References
- none

## Journeys
### ${journeyName}
Mika moves through a short flow.
\`\`\`surfaces
${labels.join('\n')}
\`\`\`

## Dense screen
- ${labels[labels.length - 1]}
`)
  for (const label of labels) {
    fs.writeFileSync(path.join(dir, 'design/mocks', label + '.html'),
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
  }
}

// ---------------------------------------------------------------------------
// Minimal flat-DOM shim for review.browser.js — per the spec's own "AC-6 harness contract" build
// note (specs/20260906/04-journey-review-page.md Rationale): a flat element list scanned off the
// builder's real markup for data-rv tags, exposing dataset/getAttribute-family/hidden/classList/
// addEventListener/querySelector(All) (single compound selectors, descendant-scoped)/closest —
// never innerHTML parsing, getBoundingClientRect, MutationObserver, or window.prompt at load.
// ---------------------------------------------------------------------------
function parseFlatDom(html) {
  const VOID = new Set(['input', 'br', 'img', 'link', 'meta', 'hr'])

  function parseAttrs(str) {
    const attrs = {}
    const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
    let m
    while ((m = re.exec(str))) {
      const name = m[1]
      const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''
      attrs[name] = val
    }
    return attrs
  }

  function matchesCompound(node, compound) {
    const tagM = compound.match(/^([a-zA-Z][\w-]*)/)
    const tag = tagM && tagM[1]
    if (tag && node.tagName !== tag.toUpperCase()) return false
    const rest = tag ? compound.slice(tag.length) : compound
    const attrRe = /\[([a-zA-Z_:][-\w:.]*)(?:="([^"]*)")?\]/g
    let m
    while ((m = attrRe.exec(rest))) {
      const key = m[1]; const val = m[2]
      if (!node.hasAttribute(key)) return false
      if (val !== undefined && node.getAttribute(key) !== val) return false
    }
    return true
  }

  const allNodes = []
  function descendants(node) {
    const out = []
    for (const c of node.children) { out.push(c); out.push(...descendants(c)) }
    return out
  }
  function queryAll(scopeNode, sel) {
    const parts = sel.trim().split(/\s+/)
    const pool = scopeNode === null ? allNodes : descendants(scopeNode)
    let matched = pool.filter((n) => matchesCompound(n, parts[0]))
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      const next = []
      for (const n of pool) {
        if (!matchesCompound(n, part)) continue
        let anc = n.parentNode
        let ok = false
        while (anc) { if (matched.includes(anc)) { ok = true; break } anc = anc.parentNode }
        if (ok) next.push(n)
      }
      matched = next
    }
    return matched
  }

  function makeNode(tagName, attrs) {
    const node = {
      tagName: tagName.toUpperCase(),
      attrs,
      children: [],
      parentNode: null,
      value: '',
      _handlers: {},
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
      setAttribute(k, v) { this.attrs[k] = String(v) },
      removeAttribute(k) { delete this.attrs[k] },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
      addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn) },
      focus() { this._focused = true },
      closest(sel) {
        let n = this
        while (n) { if (matchesCompound(n, sel.trim())) return n; n = n.parentNode }
        return null
      },
      querySelector(sel) { return queryAll(this, sel)[0] || null },
      querySelectorAll(sel) { return queryAll(this, sel) },
    }
    Object.defineProperty(node, 'hidden', {
      get() { return this.hasAttribute('hidden') },
      set(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden') },
    })
    Object.defineProperty(node, 'dataset', {
      get() {
        const out = {}
        for (const k of Object.keys(this.attrs)) {
          if (k.startsWith('data-')) out[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k]
        }
        return out
      },
    })
    Object.defineProperty(node, 'classList', {
      get() {
        const self = this
        const classes = () => (self.attrs.class || '').split(/\s+/).filter(Boolean)
        return {
          add(c) { const cs = classes(); if (!cs.includes(c)) { cs.push(c); self.attrs.class = cs.join(' ') } },
          remove(c) { self.attrs.class = classes().filter((x) => x !== c).join(' ') },
          toggle(c, force) { const has = classes().includes(c); const want = force === undefined ? !has : force; if (want) this.add(c); else this.remove(c) },
          contains(c) { return classes().includes(c) },
        }
      },
    })
    return node
  }

  const root = makeNode('#root', {})
  const stack = [root]
  const tagRe = /<(\/)?([a-zA-Z][\w-]*)((?:[^<>])*?)(\/)?>/g
  let m
  while ((m = tagRe.exec(html))) {
    const closing = !!m[1]
    const tagName = m[2]
    const attrStr = m[3]
    const selfClose = !!m[4] || VOID.has(tagName.toLowerCase())
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tagName.toUpperCase()) { stack.length = i; break }
      }
      continue
    }
    const attrs = parseAttrs(attrStr)
    const node = makeNode(tagName, attrs)
    node.parentNode = stack[stack.length - 1]
    stack[stack.length - 1].children.push(node)
    allNodes.push(node)
    if (!selfClose) stack.push(node)
  }

  const document = {
    querySelector(sel) { return queryAll(null, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(null, sel) },
    addEventListener(type, fn) { (root._handlers[type] = root._handlers[type] || []).push(fn) },
    _handlers: root._handlers,
  }
  return { document, allNodes }
}

// =============================================================================================
// specs/20260907/04-kit-canon-family.md — the `design/kit/` canon family: D2's kit-canon file
// shape, D3's resolveCanonDir/isKitCanonFile/checkKitCanon/diagnoseKitRegions library additions,
// D5/D6's `check` binding (violation/warn split, informational counts), D13's family-wide
// primitive uniqueness, D14's atlas #kit section, D15's ⓘ-after-CHECK-block ordering.
// AC-20260907-04-2, -3, -4, -5, -6, -7, -8, -16, -17, -18.
// =============================================================================================

// require()s spec/scripts/lib/shell-region.js directly (a pure-function library, never a CLI) —
// the same cache-busting shape loadDesignAtlas() above uses for design-atlas.js itself.
function loadShellRegion() {
  const p = path.join(SPEC, 'scripts/lib/shell-region.js')
  delete require.cache[p]
  return require(p)
}

function kitCanonHtml(primitives) {
  const body = primitives.map((p) =>
    '<section data-kit-primitive="' + p.key + '" data-purpose="' + p.purpose + '">' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>' +
    '<div data-slot="content"></div>' +
    '</section>').join('\n')
  return '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<div data-kit-canon="kit">\n' + body + '\n</div>\n'
}

function writeKitFile(dir, name, primitives) {
  const p = path.join(dir, 'design/kit', name + '.html')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, kitCanonHtml(primitives))
  return p
}

// A kit-aware page mock: `regions` are the top-level children of the labeled root's own content
// region (D4 — no shell family resolves anywhere in these fixtures, so the content region IS the
// labeled root's own top-level children). The state-button wrapper sits under
// data-contract="none" and so is never itself counted as a region (D4's own exemption).
function writeKitMock(dir, { label = 'screen', status = 'sketch', regions = [] } = {}) {
  const regionsHtml = regions.map((r) => {
    if (r.kit) return '<section data-kit="' + r.kit + '">' + label + '</section>'
    if (r.bespoke) return '<section data-bespoke="' + r.bespoke + '">' + label + '</section>'
    return '<section>' + label + '</section>'
  }).join('\n')
  const html = '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>\n* { box-sizing: border-box; }\n.screen { color: var(--text-body); }\n</style>\n' +
    '<main class="screen" data-screen-label="' + label + '" data-status="' + status + '">\n' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>\n' +
    regionsHtml + '\n</main>\n'
  const p = path.join(dir, 'design/mocks', label + '.html')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, html)
  return p
}

// ---------------------------------------------------------------------------
// specs/20260907/09-atlas-index-and-note-navigation.md — TDD red: buildAtlas emits no
// #shell/#toc/#main/#nl-notes wrapper at all today, GET /__notes/list has no screen=** branch,
// and page()'s/viewer.css's stylesheets carry none of the toc/nl-anchor chrome selectors yet.
// ---------------------------------------------------------------------------

// A brace-depth CSS-rule extractor mirroring sliceElement's balanced-<div> approach above — finds
// `selector` followed (possibly with whitespace, either chrome convention: page()'s no-space
// `.sel{` or viewer.css's spaced `.sel {`) by its `{…}` body, brace-depth matched so a rule
// containing its own nested braces (none of these do, but @media wrapping might) still resolves.
function cssRuleBody(css, selector) {
  const re = new RegExp(selector.replace(/[.#[\]]/g, '\\$&') + '\\s*\\{')
  const m = re.exec(css)
  if (!m) return null
  let depth = 0
  let i = m.index + m[0].length - 1
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') { depth--; if (depth === 0) break }
  }
  return css.slice(m.index + m[0].length, i)
}

