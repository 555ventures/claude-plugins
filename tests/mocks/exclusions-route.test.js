'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { tmpdir, freePort, serveAtlas, postJson, SPEC } = require('../helpers')
const { appendAssumption } = require('../../spec/scripts/lib/mocks-ledger')
const { advanceToSeedDone, ledgerCmd, JOURNEY, LABELS } = require('./mocks-driver-fixtures')

// specs/20260910/05-what-the-journey-does-not-do.md D5 (buildWalkPage's exclusions section) and
// D5/D3 (`POST /client/__walk/exclusion`, and the confirm gate that also waits on it) do not
// exist yet — every test below is red until they land. AC-20260910-05-5, -6.

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
// AC-20260910-05-5
// ---------------------------------------------------------------------------
test('AC-20260910-05-5: buildWalkPage renders [data-wk="exclusions"] carrying every project-wide and journey-anchored exclusion, excludes one anchored to another journey, counts only open rows, and renders no agree button on a confirmed row', () => {
  const seed = {
    product: 'Hearwell',
    journeys: [
      { name: 'onboarding', title: 'Onboarding', screens: [{ label: 'intake', states: [] }, { label: 'signin', states: [] }] },
      { name: 'billing', title: 'Billing', screens: [{ label: 'roster', states: [] }] },
    ],
  }
  const notes = [
    { id: 'N014', kind: 'question', scope: 'mock', screen: 'intake', ledgerId: 'W9', status: 'resolved', answer: { verdict: 'no', text: 'x', by: 'client', at: '2026-09-01T00:00:00.000Z' } },
    { id: 'N020', kind: 'note', scope: 'mock', screen: 'roster', origin: 'client', status: 'resolved', resolution: 'withdrawn', withdrawReason: 'not-needed', text: 'export bookings to CSV' },
  ]
  const ledger = [
    { id: 'E1', step: 'CLIENT', kind: 'exclusion', claim: 'SMS reminders', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'non-goal: SMS reminders' },
    { id: 'E2', step: 'CLIENT', kind: 'exclusion', claim: 'not: a second insurer field', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'answer: N014' },
    { id: 'E3', step: 'CLIENT', kind: 'exclusion', claim: 'export bookings to CSV', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'withdrawn: N020' },
    { id: 'E4', step: 'CLIENT', kind: 'exclusion', claim: 'legacy SSO', tag: 'said-by-user', status: 'confirmed 2026-09-01', rejected: null, dependents: null, note: 'non-goal: SMS reminders' },
  ]

  const html = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: { journeys: {} }, prefix: '' })

  const section = sectionOf(html, 'exclusions')
  assert.ok(section, 'AC-5: the page must render a [data-wk="exclusions"] section at all — its absence means D5\'s render never landed: got\n' + html)
  const openAttr = /data-exclusions-open="(\d+)"/.exec(section[0])
  assert.ok(openAttr, 'AC-5: the section must carry a data-exclusions-open count attribute: got ' + section[0])
  assert.strictEqual(openAttr[1], '2',
    'AC-5: data-exclusions-open must count only the two OPEN rows this journey shows (E1 project, E2 anchored to intake) — E3 (another journey) and E4 (confirmed) must not be counted: got ' + openAttr[1])

  for (const id of ['E1', 'E2', 'E4']) {
    assert.ok(articleFor(section[0], id), 'AC-5: exclusion "' + id + '" must be rendered inside the section: got\n' + section[0])
  }
  assert.ok(!articleFor(section[0], 'E3'), 'AC-5: E3 is anchored to "roster" (a billing screen) — it must never render on the onboarding page: got\n' + section[0])

  const e1Article = articleFor(section[0], 'E1')[0]
  assert.match(e1Article, /data-wk="agree"/, 'AC-5: an open exclusion must render one [data-wk="agree"] button: got ' + e1Article)
  const e2Article = articleFor(section[0], 'E2')[0]
  assert.match(e2Article, /data-wk="agree"/, 'AC-5: an open exclusion must render one [data-wk="agree"] button: got ' + e2Article)
  const e4Article = articleFor(section[0], 'E4')[0]
  assert.doesNotMatch(e4Article, /data-wk="agree"/,
    'AC-5: a confirmed exclusion row must render no agree button — the client already confirmed it: got ' + e4Article)
})

// ---------------------------------------------------------------------------
// AC-20260910-05-6
// ---------------------------------------------------------------------------
test('AC-20260910-05-6: POST /client/__walk/exclusion confirms an exclusion row, 400s a non-exclusion id, 404s an unknown one, 404s off the client mount, and the vm player keeps confirm disabled until an agree lowers the open count to zero', async () => {
  const dir = tmpdir('excl-route')
  advanceToSeedDone(dir)
  const ledgerPath = path.join(dir, 'design/mocks/ledger.md')
  let text = fs.readFileSync(ledgerPath, 'utf8')
  text = appendAssumption(text, {
    id: 'E2', step: 'CLIENT', kind: 'exclusion', claim: 'not: a second insurer field',
    tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'answer: N014',
  })
  fs.writeFileSync(ledgerPath, text)
  const notExclusion = ledgerCmd(dir, 'add', [
    '--id', 'W7', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'a claim',
    '--tag', 'invented', '--status', 'open',
  ])
  assert.strictEqual(notExclusion.status, 0, 'test setup requires the non-exclusion row W7 to be accepted: ' + notExclusion.stderr)

  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const base = 'http://127.0.0.1:' + port
    const notAnExclusion = await postJson(base + '/client/__walk/exclusion', { id: 'W7' })
    assert.strictEqual(notAnExclusion.status, 400,
      'AC-6: confirming a non-exclusion row must 400 — a 200/404 here means the route never checks the row\'s kind: got ' + notAnExclusion.status + ' ' + JSON.stringify(notAnExclusion.body))

    const unknown = await postJson(base + '/client/__walk/exclusion', { id: 'E9' })
    assert.strictEqual(unknown.status, 404,
      'AC-6: confirming an unknown id must 404: got ' + unknown.status + ' ' + JSON.stringify(unknown.body))

    const offMount = await postJson(base + '/__walk/exclusion', { id: 'E2' })
    assert.strictEqual(offMount.status, 404,
      'AC-6: the non-client mount must never answer /__walk/exclusion — a status other than 404 means the route leaked off the client-only mount: got ' + offMount.status)

    const ok = await postJson(base + '/client/__walk/exclusion', { id: 'E2' })
    assert.strictEqual(ok.status, 200,
      'AC-6: confirming a real open exclusion row must 200: got ' + ok.status + ' ' + JSON.stringify(ok.body))
    const after = fs.readFileSync(ledgerPath, 'utf8')
    assert.match(after, /\| E2 \|[^\n]*\| confirmed \d{4}-\d{2}-\d{2} \|/,
      'AC-6: ledger.md must record E2 as "confirmed <today>" after the agree — its still-open status means the write never landed: got\n' + after)
  } finally {
    await stop()
  }

  // ---- the vm-driven player: confirm stays disabled while an exclusion is open ----------------
  const seed = { product: 'Hearwell', journeys: [{ name: JOURNEY, title: 'Onboarding', screens: LABELS.map((l) => ({ label: l, states: [] })) }] }
  const openLedgerRow = { id: 'E1', step: 'CLIENT', kind: 'exclusion', claim: 'SMS reminders', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'non-goal: SMS reminders' }
  const html = buildWalkPageForVm(seed, openLedgerRow)
  // D21: walk.browser.js's own apply() derives currentLabel from this fetched state's `reached`
  // the same way buildWalkPage's static render does — it must carry every label too, or the
  // client-side re-render drops back to screen 1 and removes the confirm button on load.
  const harness = runWalkBrowserRouted(html, { reached: LABELS, misses: [], confirmedAt: null, sentence: null },
    { '/client/__walk/exclusion': { ok: true, json: () => Promise.resolve({ id: 'E1', status: 'confirmed 2026-09-12' }) } })
  await flush()
  const confirmBtn = harness.document.querySelector('[data-wk="confirm"]')
  assert.ok(confirmBtn, 'test setup requires the built page to carry [data-wk="confirm"]')
  assert.strictEqual(confirmBtn.hasAttribute('disabled'), true,
    'AC-6: [data-wk="confirm"] must stay disabled while a listed exclusion is open — this page has zero open marks, so an enabled confirm here means the exclusion gate was never wired in: got disabled=' + confirmBtn.hasAttribute('disabled'))

  const agreeBtn = harness.document.querySelector('[data-id="E1"] [data-wk="agree"]')
  assert.ok(agreeBtn, 'test setup requires an [data-wk="agree"] button on exclusion E1')
  agreeBtn.click()
  await flush()
  const section = harness.document.querySelector('[data-wk="exclusions"]')
  assert.strictEqual(section && section.getAttribute('data-exclusions-open'), '0',
    'AC-6: an ok:true agree must lower data-exclusions-open to "0": got ' + (section && section.getAttribute('data-exclusions-open')))
  assert.strictEqual(confirmBtn.hasAttribute('disabled'), false,
    'AC-6: once the open exclusion count reaches zero (and no marks are open) confirm must lose its disabled attribute: got disabled=' + confirmBtn.hasAttribute('disabled'))
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
