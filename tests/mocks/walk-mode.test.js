'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const vm = require('node:vm')
const { tmpdir, SPEC } = require('../helpers')

// specs/20260910/02-click-to-advance-and-real-records.md D3/D4: TDD red — spec/scripts/lib/
// walk-mode.browser.js does not exist yet and design-atlas.js's serve route does not inject or
// serve it yet, so both ACs below are red until the scripts wave lands. AC-20260910-02-3,
// AC-20260910-02-4.

// In-process mirror of tests/design-atlas.test.js's withHandler — createRequestHandler is
// exercised directly over http, never a child process (A4).
function loadDesignAtlas() {
  const scriptPath = path.join(SPEC, 'scripts/design-atlas.js')
  delete require.cache[scriptPath]
  return require(scriptPath)
}
function withHandler(root, fn) {
  const mod = loadDesignAtlas()
  assert.ok(mod && typeof mod.createRequestHandler === 'function',
    'design-atlas.js must export createRequestHandler(root,{prefix})')
  const server = http.createServer(mod.createRequestHandler(root, { prefix: '' }))
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const get = (p) => new Promise((res2, rej2) => {
        http.get({ host: '127.0.0.1', port, path: p }, (r) => {
          let body = ''
          r.on('data', (c) => { body += c })
          r.on('end', () => res2({ status: r.statusCode, headers: r.headers, body }))
        }).on('error', rej2)
      })
      Promise.resolve(fn({ get, port })).then(
        (v) => server.close(() => resolve(v)),
        (e) => server.close(() => reject(e)),
      )
    })
  })
}

// ---------------------------------------------------------------------------
// AC-20260910-02-3
// ---------------------------------------------------------------------------
test('AC-20260910-02-3: GET /mocks/signin.html?clean&walk injects <script src="/__walk/walk.js"></script> before the last </body> with no notes-scope meta, ?clean&walk&state=error injects the state click script before the walk script, ?clean (no walk) carries no walk.js, and GET /__walk/walk.js serves lib/walk-mode.browser.js byte-verbatim with cache-control no-store', async () => {
  const dir = tmpdir('walk-mode')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const bodyHtml = '<html><body data-screen-label="signin" data-status="sketch">' +
    '<button data-state-btn="error">error</button>signin</body></html>'
  fs.writeFileSync(path.join(dir, 'design/mocks/signin.html'), bodyHtml)

  await withHandler(dir, async ({ get }) => {
    const clean = await get('/mocks/signin.html?clean&walk')
    assert.strictEqual(clean.status, 200, 'AC-3: GET ?clean&walk must 200: got ' + clean.status)
    assert.ok(clean.body.includes('<script src="/__walk/walk.js"></script>'),
      'AC-3: ?clean&walk must inject <script src="/__walk/walk.js"></script>: got ' + JSON.stringify(clean.body))
    const bodyEndIdx = clean.body.lastIndexOf('</body>')
    const walkIdx = clean.body.indexOf('<script src="/__walk/walk.js"></script>')
    assert.ok(walkIdx !== -1 && bodyEndIdx !== -1 && walkIdx < bodyEndIdx,
      'AC-3: the walk script must be injected before the last </body>: walk at ' + walkIdx + ', </body> at ' + bodyEndIdx + ' — got ' + JSON.stringify(clean.body))
    assert.doesNotMatch(clean.body, /notes-scope/, 'AC-3: ?clean&walk must carry no notes-scope meta: got ' + JSON.stringify(clean.body))

    const withState = await get('/mocks/signin.html?clean&walk&state=error')
    assert.strictEqual(withState.status, 200, 'AC-3: GET ?clean&walk&state=error must 200: got ' + withState.status)
    const stateClickScript = '<script>document.addEventListener(\'DOMContentLoaded\',function(){var b=document.querySelector(\'[data-state-btn="error"]\');if(b)b.click()})</script>'
    const stateIdx = withState.body.indexOf(stateClickScript)
    const walkIdx2 = withState.body.indexOf('<script src="/__walk/walk.js"></script>')
    assert.ok(stateIdx !== -1, 'AC-3: ?state=error must still inject the state click script: got ' + JSON.stringify(withState.body))
    assert.ok(walkIdx2 !== -1, 'AC-3: ?walk must still inject the walk script when a state is also present: got ' + JSON.stringify(withState.body))
    assert.ok(stateIdx < walkIdx2,
      'D3: the state click script must be injected BEFORE the walk script when both are present: state at ' + stateIdx + ', walk at ' + walkIdx2 + ' — got ' + JSON.stringify(withState.body))

    const noWalk = await get('/mocks/signin.html?clean')
    assert.strictEqual(noWalk.status, 200, 'test setup requires ?clean (no walk) to 200: got ' + noWalk.status)
    assert.doesNotMatch(noWalk.body, /__walk\/walk\.js/, 'AC-3: ?clean without &walk must carry no /__walk/walk.js reference: got ' + JSON.stringify(noWalk.body))

    const walkJs = await get('/__walk/walk.js')
    assert.strictEqual(walkJs.status, 200, 'AC-3: GET /__walk/walk.js must serve 200: got ' + walkJs.status)
    assert.strictEqual(walkJs.headers['cache-control'], 'no-store', 'AC-3: /__walk/walk.js must be served with cache-control: no-store: got ' + JSON.stringify(walkJs.headers))
    const libSrc = fs.readFileSync(path.join(SPEC, 'scripts/lib/walk-mode.browser.js'), 'utf8')
    assert.strictEqual(walkJs.body, libSrc, 'AC-3: /__walk/walk.js must serve lib/walk-mode.browser.js verbatim: bytes differ')
  })
})

// ---------------------------------------------------------------------------
// AC-20260910-02-4
// ---------------------------------------------------------------------------
// Minimal stub DOM — walk-mode.browser.js's own contract names only attribute-presence/value
// selectors ([data-to], [data-state-btn], [data-contract="none"]) and closest, so this harness
// carries just those, the same jsdom-free `vm` shim discipline tests/design-atlas.test.js's
// review.browser.js harness uses.
function matchesSelector(el, sel) {
  const m = sel.trim().match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/)
  if (!m) return false
  const [, name, val] = m
  if (!el.hasAttribute(name)) return false
  if (val !== undefined && el.getAttribute(name) !== val) return false
  return true
}
function makeEl(tag, attrs, text) {
  const el = {
    tagName: tag.toUpperCase(),
    _attrs: Object.assign({}, attrs),
    textContent: text || '',
    parentNode: null,
    children: [],
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) },
    closest(sel) {
      let n = this
      while (n) { if (matchesSelector(n, sel)) return n; n = n.parentNode }
      return null
    },
  }
  return el
}
function appendChild(parent, child) { child.parentNode = parent; parent.children.push(child); return child }
function findAll(root, sel) {
  const out = []
  const walk = (n) => { if (matchesSelector(n, sel)) out.push(n); for (const c of n.children) walk(c) }
  walk(root)
  return out
}

function buildStubDom() {
  const root = makeEl('main', { 'data-screen-label': 'signin' })
  const toBtn = appendChild(root, makeEl('button', { 'data-to': 'invite' }, 'Go'))
  const helpBtn = appendChild(root, makeEl('button', { id: 'help' }, 'Need help?'))
  const stateBtn = appendChild(root, makeEl('button', { 'data-state-btn': 'empty' }, 'empty'))
  const document = {
    querySelector(sel) { return findAll(root, sel)[0] || null },
    _handlers: {},
    addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn) },
  }
  return { document, root, toBtn, helpBtn, stateBtn }
}

test('AC-20260910-02-4: walk-mode.browser.js under vm reads the screen label from [data-screen-label], swallows a click inside [data-to] and posts {walk:"to",from,to} to window.parent with location.origin, posts {walk:"miss",from,target:"tag#id text"} for any other click, posts nothing for a click inside [data-state-btn], and installs no listener when window.parent === window', () => {
  const libPath = path.join(SPEC, 'scripts/lib/walk-mode.browser.js')
  assert.ok(fs.existsSync(libPath), 'AC-4 requires spec/scripts/lib/walk-mode.browser.js to exist — not found at ' + libPath)
  const src = fs.readFileSync(libPath, 'utf8')

  // ---- installed case: window.parent !== window --------------------------------------------
  const { document, toBtn, helpBtn, stateBtn } = buildStubDom()
  const posts = []
  const parentWindow = { postMessage(msg, targetOrigin) { posts.push({ msg, targetOrigin }) } }
  const sandbox = {
    document,
    window: { parent: parentWindow },
    location: { origin: 'http://localhost:5173', pathname: '/mocks/signin.html' },
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)

  const clickHandlers = document._handlers.click || []
  assert.ok(clickHandlers.length > 0,
    'AC-4: walk-mode.browser.js must install a click listener on document when window.parent !== window')

  let prevented = false
  const toEvent = { target: toBtn, preventDefault() { prevented = true } }
  for (const h of clickHandlers) h(toEvent)
  assert.strictEqual(prevented, true, 'AC-4: a click inside [data-to] must call preventDefault')
  assert.strictEqual(posts.length, 1, 'AC-4: a click inside [data-to] must post exactly one message: got ' + JSON.stringify(posts))
  assert.deepStrictEqual(posts[0].msg, { walk: 'to', from: 'signin', to: 'invite' },
    'AC-4: the posted message for a data-to click must be {walk:"to",from:"signin",to:"invite"}: got ' + JSON.stringify(posts[0].msg))
  assert.strictEqual(posts[0].targetOrigin, 'http://localhost:5173',
    'AC-4: postMessage must target the stub location.origin: got ' + JSON.stringify(posts[0].targetOrigin))

  const missEvent = { target: helpBtn, preventDefault() {} }
  for (const h of clickHandlers) h(missEvent)
  assert.strictEqual(posts.length, 2, 'AC-4: a click outside [data-to] must post exactly one more message: got ' + JSON.stringify(posts))
  assert.deepStrictEqual(posts[1].msg, { walk: 'miss', from: 'signin', target: 'button#help Need help?' },
    'AC-4: the posted message for a non-data-to click must be {walk:"miss",from:"signin",target:"button#help Need help?"}: got ' + JSON.stringify(posts[1].msg))

  const stateEvent = { target: stateBtn, preventDefault() {} }
  for (const h of clickHandlers) h(stateEvent)
  assert.strictEqual(posts.length, 2, 'AC-4: a click inside [data-state-btn] must post nothing: got ' + JSON.stringify(posts))

  // ---- not-installed case: window.parent === window -----------------------------------------
  const notEmbedded = buildStubDom()
  const selfWindow = {}
  selfWindow.parent = selfWindow
  const sandbox2 = {
    document: notEmbedded.document,
    window: selfWindow,
    location: { origin: 'http://localhost:5173', pathname: '/mocks/signin.html' },
    console,
  }
  vm.createContext(sandbox2)
  vm.runInContext(src, sandbox2)
  assert.strictEqual((notEmbedded.document._handlers.click || []).length, 0,
    'AC-4: with window.parent === window, walk-mode.browser.js must install no click listener at all')
})
