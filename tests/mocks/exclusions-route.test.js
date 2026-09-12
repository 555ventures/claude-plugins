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
test('AC-20260910-05-6: POST /client/__walk/exclusion confirms an exclusion row, 400s a non-exclusion id, 404s an unknown one, and 404s off the client mount', async () => {
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
})

// ---------------------------------------------------------------------------
// specs/20260911/05-approval-is-bookkeeping.md D3: an agree-only control cannot record
// disagreement, and D3/D8 also delete the confirm-disabled-while-open gate spec 20260910/05's
// D5 added (superseding AC-20260910-05-6's own vm-player assertion of it, rewritten here).
// AC-20260911-05-3, -4, -5, -12.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC-20260911-05-3
// ---------------------------------------------------------------------------
test('AC-20260911-05-3: GET /client/walk/<j>.html materializes exclusion rows from the brief on the client\'s FIRST request, and a second GET leaves ledger.md byte-identical', async () => {
  const dir = tmpdir('excl-materialize-on-walk')
  advanceToSeedDone(dir)
  const briefPath = path.join(dir, '.claude/genesis/brief.md')
  fs.mkdirSync(path.dirname(briefPath), { recursive: true })
  fs.writeFileSync(briefPath, "## Non-goals\n- SMS reminders — Later\n- Multi-currency — Won't-this-time\n")
  const ledgerFile = path.join(dir, 'design/mocks/ledger.md')
  const beforeGet = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8') : null
  assert.ok(!/\| E\d+ \|/.test(beforeGet || ''),
    'test setup requires no exclusion row to exist before the client\'s first request: got\n' + beforeGet)

  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const res1 = await getJson('http://127.0.0.1:' + port + '/client/walk/' + JOURNEY + '.html')
    assert.strictEqual(res1.status, 200,
      'AC-3: GET /client/walk/<j>.html must answer 200 on the client\'s very first request: got ' + res1.status)
    assert.strictEqual((res1.text.match(/data-wk="exclusion"/g) || []).length, 2,
      'AC-3: the first request must render two [data-wk="exclusion"] articles — the page must derive the rows itself, on the client\'s own request, before any session command ever runs: got\n' + res1.text)
    const afterFirst = fs.readFileSync(ledgerFile, 'utf8')
    assert.match(afterFirst, /\bE1\b[\s\S]*exclusion/,
      'AC-3: ledger.md must carry an exclusion row (E1) after the client\'s first GET: got\n' + afterFirst)
    assert.match(afterFirst, /\bE2\b[\s\S]*exclusion/,
      'AC-3: ledger.md must carry a second exclusion row (E2) after the client\'s first GET: got\n' + afterFirst)

    const res2 = await getJson('http://127.0.0.1:' + port + '/client/walk/' + JOURNEY + '.html')
    assert.strictEqual(res2.status, 200, 'AC-3: a second GET must also answer 200: got ' + res2.status)
    const afterSecond = fs.readFileSync(ledgerFile, 'utf8')
    assert.strictEqual(afterSecond, afterFirst,
      'AC-3: a second GET must leave ledger.md byte-identical — any diff means materialize is not idempotent when called from the route: got a diff of ' + afterSecond.length + ' vs ' + afterFirst.length + ' bytes')
  } finally {
    await stop()
  }
})

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
test('AC-20260911-05-4: POST /client/__walk/exclusion {verdict:"needed"} sets the row overridden/client-needed, {verdict:"maybe"} 400s naming both accepted values, and AC-20260911-05-12: an absent verdict CONTINUES TO set confirmed', async () => {
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
      'AC-4: a verdict outside {agree, needed} must 400 — a 200 here means an arbitrary verdict is silently accepted: got ' + bad.status + ' ' + JSON.stringify(bad.body))
    const errText = (bad.body && bad.body.error) || ''
    assert.match(errText, /agree/, 'AC-4: the 400\'s error must name "agree" as an accepted value: got "' + errText + '"')
    assert.match(errText, /needed/, 'AC-4: the 400\'s error must name "needed" as an accepted value: got "' + errText + '"')

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
// AC-20260911-05-5
// ---------------------------------------------------------------------------
test('AC-20260911-05-5: buildWalkPage renders both `agree` and `needed` on an open exclusion, `[data-wk="confirm"]` is never disabled by data-exclusions-open, and the vm player posts each verdict correctly', async () => {
  const seed = { product: 'Hearwell', journeys: [{ name: JOURNEY, title: 'Onboarding', screens: LABELS.map((l) => ({ label: l, states: [] })) }] }
  const rows = [
    { id: 'E1', step: 'CLIENT', kind: 'exclusion', claim: 'SMS reminders', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'non-goal: SMS reminders' },
    { id: 'E2', step: 'CLIENT', kind: 'exclusion', claim: 'Multi-currency', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'non-goal: Multi-currency' },
  ]
  const html = buildWalkPage({
    seed, journey: JOURNEY, notes: [], ledger: rows,
    walk: { journeys: { [JOURNEY]: { reached: LABELS, misses: [], confirmedAt: null, sentence: null } } },
    prefix: '',
  })

  const e1Article = articleFor(html, 'E1')[0]
  assert.match(e1Article, /data-wk="agree"/,
    'AC-5: an open exclusion must still render [data-wk="agree"]: got ' + e1Article)
  assert.match(e1Article, /data-wk="needed"/,
    'AC-5: an open exclusion must ALSO render [data-wk="needed"] ("No — we need this") — an agree-only control cannot record disagreement: got ' + e1Article)

  const harness = runWalkBrowserRouted(html, { reached: LABELS, misses: [], confirmedAt: null, sentence: null },
    { '/client/__walk/exclusion': { ok: true, json: () => Promise.resolve({}) } })
  await flush()
  const confirmBtn = harness.document.querySelector('[data-wk="confirm"]')
  assert.ok(confirmBtn, 'test setup requires the built page to carry [data-wk="confirm"]')
  assert.strictEqual(confirmBtn.hasAttribute('disabled'), false,
    'AC-5: [data-wk="confirm"] must not be disabled while marks are zero, whatever data-exclusions-open holds — the closing screen asks, it does not block: got disabled=' + confirmBtn.hasAttribute('disabled'))

  const neededBtn = harness.document.querySelector('[data-id="E2"] [data-wk="needed"]')
  assert.ok(neededBtn, 'test setup requires an [data-wk="needed"] button on exclusion E2')
  neededBtn.click()
  await flush()
  const neededPost = harness.posts.find((p) => p.url.includes('/client/__walk/exclusion') && JSON.parse(p.init.body).id === 'E2')
  assert.ok(neededPost, 'AC-5: clicking [data-wk="needed"] must POST to /client/__walk/exclusion: got posts=' + JSON.stringify(harness.posts))
  assert.deepStrictEqual(JSON.parse(neededPost.init.body), { id: 'E2', verdict: 'needed' },
    'AC-5: the posted body for a needed click must be exactly {id, verdict:"needed"}: got ' + neededPost.init.body)
  const e2Article = harness.document.querySelector('[data-id="E2"]')
  assert.strictEqual(e2Article.getAttribute('data-verdict'), 'needed',
    'AC-5: on an ok response the article must gain data-verdict="needed": got ' + e2Article.getAttribute('data-verdict'))
  assert.strictEqual(neededBtn.hasAttribute('disabled'), true,
    'AC-5: the pressed needed button must disable itself: got disabled=' + neededBtn.hasAttribute('disabled'))
  const agreeBtnOnE2 = harness.document.querySelector('[data-id="E2"] [data-wk="agree"]')
  assert.strictEqual(agreeBtnOnE2.hasAttribute('disabled'), true,
    'AC-5: pressing one verdict must disable BOTH buttons on that article, not just the one pressed: got disabled=' + agreeBtnOnE2.hasAttribute('disabled'))

  const agreeBtnOnE1 = harness.document.querySelector('[data-id="E1"] [data-wk="agree"]')
  agreeBtnOnE1.click()
  await flush()
  const agreePost = harness.posts.find((p) => p.url.includes('/client/__walk/exclusion') && JSON.parse(p.init.body).id === 'E1')
  assert.deepStrictEqual(JSON.parse(agreePost.init.body), { id: 'E1', verdict: 'agree' },
    'AC-5: clicking [data-wk="agree"] must post {id, verdict:"agree"}: got ' + agreePost.init.body)
  const e1ArticleAfter = harness.document.querySelector('[data-id="E1"]')
  assert.strictEqual(e1ArticleAfter.getAttribute('data-verdict'), 'agree',
    'AC-5: on an ok response an agree click must set data-verdict="agree": got ' + e1ArticleAfter.getAttribute('data-verdict'))
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
