'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { tmpdir, freePort, serveAtlas, postJson, getJson, SPEC } = require('../helpers')
const { appendAssumption } = require('../../spec/scripts/lib/mocks-ledger')
const { advanceToSeedDone, ledgerCmd, JOURNEY, LABELS } = require('./mocks-driver-fixtures')

// specs/20260910/05-what-the-journey-does-not-do.md D5 (buildWalkPage's exclusions section) and
// D5/D3 (`POST /client/__walk/exclusion`). AC-20260910-05-5, -6 (the confirm-disabled-while-open
// half of AC-6 is retired below — specs/20260911/05-approval-is-bookkeeping.md D8 — and rewritten
// under AC-20260911-05-5).

let walkPageLib
try {
  // eslint-disable-next-line global-require
  walkPageLib = require('../../spec/scripts/lib/walk-page')
} catch (e) {
  const reason = 'spec/scripts/lib/walk-page.js does not exist (D1, spec 03): ' + e.message
  walkPageLib = { buildWalkPage: () => { throw new Error(reason) } }
}
const { buildWalkPage } = walkPageLib

function sectionOf(html, dataWk) {
  const re = new RegExp('<section[^>]*data-wk="' + dataWk + '"[^>]*>([\\s\\S]*?)<\\/section>')
  return re.exec(html)
}

function articleFor(html, id) {
  const re = new RegExp('<article[^>]*data-id="' + id + '"[\\s\\S]*?<\\/article>')
  return re.exec(html)
}


// ---------------------------------------------------------------------------
// specs/20260911/05-approval-is-bookkeeping.md D3: an agree-only control cannot record
// disagreement, and D3/D8 also delete the confirm-disabled-while-open gate spec 20260910/05's
// D5 added (superseding AC-20260910-05-6's own vm-player assertion of it, rewritten here).
// AC-20260911-05-3, -4, -5, -12.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Review finding (specs/20260911/05, reviewer iteration 1, dispositioned `fix`): D2 put
// `materialize` inside the client's own GET on a long-lived server, and `materialize`'s appender
// throws on a ledger with no Assumptions table header — so one hand-broken file killed the whole
// serve process, where the pre-image answered 200. The route now takes the same swallow-and-serve
// posture its sibling reads already take.
// ---------------------------------------------------------------------------
test('a malformed ledger.md never takes the client review server down — GET /client/walk/<j>.html still answers 200 and the server keeps serving afterwards', async () => {
  const dir = tmpdir('excl-materialize-malformed-ledger')
  advanceToSeedDone(dir)
  const briefPath = path.join(dir, '.claude/genesis/brief.md')
  fs.mkdirSync(path.dirname(briefPath), { recursive: true })
  fs.writeFileSync(briefPath, '## Non-goals\n- SMS reminders — Later\n')
  const ledgerFile = path.join(dir, 'design/mocks/ledger.md')
  fs.writeFileSync(ledgerFile, '# Provenance ledger\n\nno table here\n')

  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const res = await getJson('http://127.0.0.1:' + port + '/client/walk/' + JOURNEY + '.html')
    assert.strictEqual(res.status, 200,
      'a ledger the parser cannot read must not reach the client as a dead connection — the page still renders from whatever parses: got ' + res.status)
    const after = await getJson('http://127.0.0.1:' + port + '/client/index.html')
    assert.strictEqual(after.status, 200,
      'the serve process must still be alive after the malformed-ledger request — an uncaught throw here refuses every later request until someone restarts the server: got ' + after.status)
    assert.strictEqual(fs.readFileSync(ledgerFile, 'utf8'), '# Provenance ledger\n\nno table here\n',
      'a ledger that could not be materialized must be left exactly as found — a partial rewrite would destroy the file the user still has to repair')
  } finally {
    await stop()
  }
})

// ---------------------------------------------------------------------------
// AC-20260911-05-4, AC-20260911-05-12
// ---------------------------------------------------------------------------
test('AC-20260912-02-3 (rewrites AC-20260911-05-4): POST /client/__walk/exclusion {verdict:"needed"} sets the row overridden/client-needed, {verdict:"maybe"} 400s naming all three accepted values including "reconsider", and AC-20260911-05-12: an absent verdict CONTINUES TO set confirmed', async () => {
  const dir = tmpdir('excl-verdicts')
  advanceToSeedDone(dir)
  const ledgerFilePath = path.join(dir, 'design/mocks/ledger.md')
  let text = fs.readFileSync(ledgerFilePath, 'utf8')
  text = appendAssumption(text, {
    id: 'E1', step: 'CLIENT', kind: 'exclusion', claim: 'SMS reminders',
    tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'non-goal: SMS reminders',
  })
  text = appendAssumption(text, {
    id: 'E2', step: 'CLIENT', kind: 'exclusion', claim: 'Multi-currency',
    tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'non-goal: Multi-currency',
  })
  fs.writeFileSync(ledgerFilePath, text)

  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const base = 'http://127.0.0.1:' + port

    const bad = await postJson(base + '/client/__walk/exclusion', { id: 'E2', verdict: 'maybe' })
    assert.strictEqual(bad.status, 400,
      'AC-4: a verdict outside {agree, needed, reconsider} must 400 — a 200 here means an arbitrary verdict is silently accepted: got ' + bad.status + ' ' + JSON.stringify(bad.body))
    const errText = (bad.body && bad.body.error) || ''
    assert.match(errText, /agree/, 'AC-4: the 400\'s error must name "agree" as an accepted value: got "' + errText + '"')
    assert.match(errText, /needed/, 'AC-4: the 400\'s error must name "needed" as an accepted value: got "' + errText + '"')
    assert.match(errText, /reconsider/,
      'AC-20260912-02-3: D2 adds "reconsider" to the accepted verdict set — the 400\'s error must ' +
      'name it too, or a client reading the message after a typo has no way to learn the real third ' +
      'option exists: got "' + errText + '"')

    const needed = await postJson(base + '/client/__walk/exclusion', { id: 'E2', verdict: 'needed' })
    assert.strictEqual(needed.status, 200,
      'AC-4: a "needed" verdict on a real open exclusion must 200: got ' + needed.status + ' ' + JSON.stringify(needed.body))
    assert.match(String(needed.body && needed.body.status), /^overridden \d{4}-\d{2}-\d{2}$/,
      'AC-4: the response status must read "overridden <today>": got ' + JSON.stringify(needed.body))
    assert.strictEqual(needed.body && needed.body.rejected, 'client-needed',
      'AC-4: the response must carry rejected:"client-needed": got ' + JSON.stringify(needed.body))
    const afterNeeded = fs.readFileSync(ledgerFilePath, 'utf8')
    const e2Row = afterNeeded.split('\n').find((l) => l.startsWith('| E2 |'))
    assert.match(e2Row || '', /overridden \d{4}-\d{2}-\d{2}/,
      'AC-4: ledger.md\'s E2 row must be set to "overridden <today>": got ' + e2Row)
    assert.match(e2Row || '', /client-needed/,
      'AC-4: ledger.md\'s E2 row must carry "client-needed" in its rejected cell: got ' + e2Row)

    // AC-12: an absent verdict CONTINUES TO default to agree (confirmed <today>) — spec
    // 20260910/05 D5's caller shape keeps working unchanged.
    const agreed = await postJson(base + '/client/__walk/exclusion', { id: 'E1' })
    assert.strictEqual(agreed.status, 200,
      'AC-12: an exclusion POST with no verdict must CONTINUE TO 200: got ' + agreed.status + ' ' + JSON.stringify(agreed.body))
    assert.match(String(agreed.body && agreed.body.status), /^confirmed \d{4}-\d{2}-\d{2}$/,
      'AC-12: with no verdict given the response must CONTINUE TO read "confirmed <today>" — the default caller shape must not regress: got ' + JSON.stringify(agreed.body))
  } finally {
    await stop()
  }
})


// ---------------------------------------------------------------------------
// specs/20260912/01-the-card-explains-itself.md D4/D5 — the open row's own state stub, its
// pressed-verdict activation, and the confirm-not-blocked pin. AC-20260912-01-7, -8, -9.
// buildWalkPageForVm/runWalkBrowserRouted/flush are defined further below in this same file;
// hoisted function declarations make them usable here.
// ---------------------------------------------------------------------------

function onboardingExclSeed() {
  return { product: 'Hearwell', journeys: [{ name: JOURNEY, title: 'Onboarding', screens: LABELS.map((label) => ({ label, states: [] })) }] }
}

test('AC-20260912-01-7: buildWalkPage CONTINUES TO render an open exclusion row\'s two verdict buttons and leaves [data-wk="confirm"] without disabled whatever data-exclusions-open holds', () => {
  const seed = onboardingExclSeed()
  const openRow = { id: 'E1', step: 'CLIENT', kind: 'exclusion', claim: 'a claim', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'non-goal: a claim' }
  const html = buildWalkPageForVm(seed, openRow)
  const article = /<article[^>]*data-id="E1"[\s\S]*?<\/article>/.exec(html)
  assert.ok(article, 'AC-7 setup: the open exclusion row must render as an article: got\n' + html)
  assert.match(article[0], /data-wk="agree"/, 'AC-7: an open row must CONTINUE TO render its "Correct" button: got\n' + article[0])
  assert.match(article[0], /data-wk="needed"/, 'AC-7: an open row must CONTINUE TO render its "No — we need this" button: got\n' + article[0])
  assert.match(html, /data-exclusions-open="1"/, 'AC-7 setup: the section must report one open exclusion row: got\n' + html)
  const confirmMatch = /<[a-zA-Z][\w-]*[^>]*data-wk="confirm"[^>]*>/.exec(html)
  assert.ok(confirmMatch, 'AC-7 setup: the last screen must render [data-wk="confirm"]: got\n' + html)
  assert.doesNotMatch(confirmMatch[0], /disabled/,
    'AC-7: [data-wk="confirm"] must CONTINUE TO carry no disabled attribute while an exclusion is open — an open exclusion asks, it does not block: got ' + confirmMatch[0])
})


function buildWalkPageForVm(seed, exclusionRow) {
  // D21 moved [data-wk="confirm"] onto the journey's LAST screen only; this vm harness's own
  // subject (exclusion-agree unlocking confirm) needs a screen where confirm exists at all, so
  // mark every label reached to land on the last screen (currentLabel = reached[reached.length-1]).
  return buildWalkPage({
    seed, journey: JOURNEY, notes: [], ledger: [exclusionRow],
    walk: { journeys: { [JOURNEY]: { reached: LABELS, misses: [], confirmedAt: null, sentence: null } } },
    prefix: '',
  })
}

// ---------------------------------------------------------------------------
// Same jsdom-free `vm` shim as tests/mocks/walk-page.test.js — duplicated here rather than
// shared, per that file's own header comment on file-locality for this exact harness.
// ---------------------------------------------------------------------------
function parseFlatDom(html) {
  function parseAttrs(str) {
    const attrs = {}
    const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g
    let m
    while ((m = re.exec(str))) attrs[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : '')
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
      if (!node.hasAttribute(m[1])) return false
      if (m[2] !== undefined && node.getAttribute(m[1]) !== m[2]) return false
    }
    // AC-20260912-01-9 repair (same gap tests/mocks/walk-page.test.js's own D16 note fixed): this
    // shim's class matching was never implemented — `.class` tokens matched every node — and
    // AC-9's wk-excl-state paragraph carries no attribute but its class, so a real check is added
    // here rather than left silently vacuous.
    const classRe = /\.([-\w]+)/g
    while ((m = classRe.exec(rest))) {
      const classes = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean)
      if (!classes.includes(m[1])) return false
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
      tagName: tagName.toUpperCase(), attrs, children: [], parentNode: null, value: '', _handlers: {},
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
      setAttribute(k, v) { this.attrs[k] = String(v) },
      removeAttribute(k) { delete this.attrs[k] },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
      addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn) },
      closest(sel) { let n = this; while (n) { if (matchesCompound(n, sel.trim())) return n; n = n.parentNode } return null },
      querySelector(sel) { return queryAll(this, sel)[0] || null },
      querySelectorAll(sel) { return queryAll(this, sel) },
      click() { for (const h of (this._handlers.click || [])) h({ target: this, preventDefault() {} }) },
      submit() { for (const h of (this._handlers.submit || [])) h({ target: this, preventDefault() {} }) },
    }
    Object.defineProperty(node, 'hidden', {
      get() { return this.hasAttribute('hidden') },
      set(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden') },
    })
    Object.defineProperty(node, 'src', {
      get() { return this.getAttribute('src') },
      set(v) { this.setAttribute('src', v) },
    })
    return node
  }
  const root = makeNode('#root', {})
  const stack = [root]
  const tagRe = /<(\/)?([a-zA-Z][\w-]*)((?:[^<>])*?)(\/)?>/g
  const VOID = new Set(['input', 'br', 'img', 'link', 'meta', 'hr'])
  let m
  while ((m = tagRe.exec(html))) {
    const closing = !!m[1]
    const tagName = m[2]
    const selfClose = !!m[4] || VOID.has(tagName.toLowerCase())
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) { if (stack[i].tagName === tagName.toUpperCase()) { stack.length = i; break } }
      continue
    }
    const node = makeNode(tagName, parseAttrs(m[3]))
    node.parentNode = stack[stack.length - 1]
    stack[stack.length - 1].children.push(node)
    allNodes.push(node)
    if (!selfClose) stack.push(node)
  }
  return {
    querySelector(sel) { return queryAll(null, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(null, sel) },
  }
}

function runWalkBrowserRouted(html, stateStub, routeStub) {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/walk.browser.js'), 'utf8')
  const document = parseFlatDom(html)
  const posts = []
  const messageHandlers = []
  const sandbox = {
    document,
    window: {
      prompt: () => { throw new Error('D3: window.prompt must never be called') },
      addEventListener(type, fn) { if (type === 'message') messageHandlers.push(fn) },
    },
    location: { pathname: '/client/walk/onboarding.html', origin: 'http://localhost:5173' },
    fetch(url, init) {
      if (String(url).includes('/client/__walk/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(stateStub) })
      }
      posts.push({ url: String(url), init })
      const key = Object.keys(routeStub || {}).find((k) => String(url).includes(k))
      const resp = key ? routeStub[key] : { ok: true }
      if (resp === 'reject') return Promise.reject(new Error('network down'))
      return Promise.resolve(Object.assign({ json: () => Promise.resolve({}) }, resp))
    },
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  return { document, posts }
}

async function flush(n = 6) { for (let i = 0; i < n; i++) await Promise.resolve() }
