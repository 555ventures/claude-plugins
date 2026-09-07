'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('../helpers')

// specs/20260906/04-journey-review-page.md D1/D3/D4/D5 — AC-20260906-04-1, -4, -5, -7. The pure
// builder lib/review-page.js does not exist yet: every test below is RED on "Cannot find module".

const REVIEW_PAGE = path.join(SPEC, 'scripts/lib/review-page.js')
function loadBuilder() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(REVIEW_PAGE)
}

const NOW = '2026-09-06T12:00:00.000Z'

function questionNote(id, screen, ledgerId, { by = 'session', open = true, answer = null } = {}) {
  return {
    id, scope: 'mock', screen, state: null, kind: 'question', ledgerId,
    text: 'claim', by, at: NOW, status: open ? 'open' : 'resolved',
    addressed: null, reply: null, resolvedBy: open ? null : by, resolvedAt: open ? null : NOW,
    answer,
  }
}
function projectNote(id, { reason = 'missing-screen', text = 'note text', by = 'jj', status = 'open' } = {}) {
  return { id, scope: 'project', screen: null, state: null, text, by, at: NOW, status, addressed: null, reply: null, resolvedBy: null, resolvedAt: null, reason }
}
function ledgerRow(id, { claim = 'claim', tag = 'inferred', status = 'open', rejected = null } = {}) {
  return { id, step: 'WIREFRAMES', kind: 'product', claim, tag, status, rejected, dependents: null, note: null }
}
function approveStop(id, key, candidates, { status = 'open', decision = null } = {}) {
  return { id, kind: 'approve', key, title: 'approve ' + key, candidates, url: null, openedAt: NOW, status, decision, previous: [] }
}

// Slices `html` from the first index of `startNeedle` up to whichever of `endNeedles` occurs
// first after it (or the end of the string) — bounds an assertion to one screen's board/row
// instead of risking a vacuous whole-page match (per this repo's prompt/step window isolation
// gotcha, specs/20260825/02).
function sliceFrom(html, startNeedle, endNeedles = []) {
  const start = html.indexOf(startNeedle)
  assert.ok(start !== -1, 'test setup requires "' + startNeedle + '" to appear in the builder output: got ' + html.slice(0, 200) + '…')
  let end = html.length
  for (const needle of endNeedles) {
    const i = html.indexOf(needle, start + startNeedle.length)
    if (i !== -1 && i < end) end = i
  }
  return html.slice(start, end)
}

function rowChunks(html) {
  const re = /<[a-zA-Z][\w-]*\s+data-rv="row"\s+data-id="([^"]+)"\s+data-kind="([^"]+)"\s+data-status="([^"]+)"([^>]*)>/g
  const hits = []
  let m
  while ((m = re.exec(html))) hits.push({ index: m.index, id: m[1], kind: m[2], status: m[3], tail: m[4] })
  const chunks = hits.map((h, i) => ({
    id: h.id, kind: h.kind, status: h.status,
    visible: !/\bhidden\b/.test(h.tail),
    text: html.slice(h.index, i + 1 < hits.length ? hits[i + 1].index : html.length),
  }))
  return chunks
}

// ---------------------------------------------------------------------------
// AC-20260906-04-1
// ---------------------------------------------------------------------------
test('AC-20260906-04-1: buildReviewPage over the Hearwell-shaped fixture (three screens, four questions of which one is answered, one project note, one open journey-approved:onboarding stop) is byte-identical across two calls with equal-but-freshly-built inputs and renders exactly three [data-rv="board"], a [data-rv="rail"] listing every seed journey with onboarding marked current, [data-rv="progress"] text "1 of 4 answered · 1 note for the session", and the viewer.css link plus review.js script tags', () => {
  const { buildReviewPage } = loadBuilder()
  function fixture() {
    return {
      root: '/tmp/hearwell-review-fixture',
      journey: 'onboarding',
      prefix: '',
      seed: {
        product: 'Hearwell',
        viewportWidth: 1280,
        journeys: [
          { name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }, { label: 'transcript', states: [] }, { label: 'settings', states: [] }] },
          { name: 'checkout', title: 'Checkout', screens: [{ label: 'cart', states: [] }] },
        ],
      },
      notes: [
        questionNote('N001', 'signin', 'W1', { by: 'session' }),
        questionNote('N002', 'signin', 'W2', { by: 'critic' }),
        questionNote('N003', 'transcript', 'W3', { by: 'session' }),
        questionNote('N004', 'settings', 'W4', { by: 'session', open: false, answer: { verdict: 'yes', text: '', by: 'session', at: NOW } }),
        projectNote('N005', { text: 'no cancel screen' }),
      ],
      ledger: [ledgerRow('W1'), ledgerRow('W2'), ledgerRow('W3'), ledgerRow('W4', { status: 'confirmed 2026-09-06' })],
      stops: [approveStop('P001', 'journey-approved:onboarding', [
        { group: null, label: 'signin', path: 'mocks/signin.html' },
        { group: null, label: 'transcript', path: 'mocks/transcript.html' },
        { group: null, label: 'settings', path: 'mocks/settings.html' },
      ])],
    }
  }

  const html1 = buildReviewPage(fixture())
  const html2 = buildReviewPage(JSON.parse(JSON.stringify(fixture())))
  assert.strictEqual(html1, html2, 'D1: buildReviewPage must be byte-deterministic — two calls over equal-but-freshly-built inputs (no shared references, no clock reliance) must return byte-identical HTML')

  const boardCount = (html1.match(/data-rv="board"/g) || []).length
  assert.strictEqual(boardCount, 3, 'AC-1: the page must render exactly one [data-rv="board"] per screen (three) — got ' + boardCount)

  assert.match(html1, /data-rv="rail"/, 'AC-1: the page must render a [data-rv="rail"] left pane naming the journeys and screens')
  const railBlock = sliceFrom(html1, 'data-rv="rail"', ['data-rv="board"'])
  assert.match(railBlock, /Onboarding/, 'AC-1: the rail must list the current journey "Onboarding": got ' + railBlock)
  assert.match(railBlock, /Checkout/, 'AC-1: the rail must list every seed journey, including "Checkout": got ' + railBlock)
  const onboardingIdx = railBlock.indexOf('Onboarding')
  const checkoutIdx = railBlock.indexOf('Checkout')
  const [firstIdx, firstName, secondIdx] = onboardingIdx < checkoutIdx
    ? [onboardingIdx, 'Onboarding', checkoutIdx] : [checkoutIdx, 'Checkout', onboardingIdx]
  const firstChunk = railBlock.slice(firstIdx, secondIdx)
  const secondChunk = railBlock.slice(secondIdx)
  const onboardingChunk = firstName === 'Onboarding' ? firstChunk : secondChunk
  const checkoutChunk = firstName === 'Onboarding' ? secondChunk : firstChunk
  assert.match(onboardingChunk, /aria-current="page"/, 'AC-1: the rail must mark the current journey (onboarding) with aria-current="page": got ' + onboardingChunk)
  assert.doesNotMatch(checkoutChunk, /aria-current="page"/, 'AC-1: the rail must not mark a journey other than the current one as aria-current="page": got ' + checkoutChunk)

  assert.match(html1, /data-rv="progress"/, 'AC-1: the page must render a [data-rv="progress"] element')
  const progressBlock = sliceFrom(html1, 'data-rv="progress"', ['</'])
  assert.match(progressBlock, /1 of 4 answered · 1 note for the session/, 'AC-1: progress text must read exactly "1 of 4 answered · 1 note for the session" (one of four questions answered, one project note): got ' + progressBlock)

  assert.match(html1, /<link[^>]*href="\/__notes\/viewer\.css"[^>]*>/, 'AC-1: the page must link <prefix>/__notes/viewer.css so the review page shares the plugin chrome register')
  assert.match(html1, /<script[^>]*src="\/__review\/review\.js"[^>]*><\/script>/, 'AC-1: the page must load <prefix>/__review/review.js (lib/review.browser.js) as a script tag')
})

// ---------------------------------------------------------------------------
// AC-20260906-04-4
// ---------------------------------------------------------------------------
test('AC-20260906-04-4: a board renders a happy/empty/loading/error tab set in declared order with matching iframe src values and width=1280 when its mock declares data-state-btn values, a single happy tab when it declares none (with 1280 as the default with no targets.json viewport), a caption badge of 3 for a screen carrying two questions and one note, and data-focus on that screen\'s frame as the first open item', () => {
  const { buildReviewPage } = loadBuilder()
  function fixture(viewportWidth) {
    return {
      root: '/tmp/hearwell-review-fixture-2',
      journey: 'onboarding',
      prefix: '',
      seed: {
        product: 'Hearwell',
        viewportWidth,
        journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [
          { label: 'signin', states: ['empty', 'loading', 'error'] },
          { label: 'home', states: [] },
        ] }],
      },
      notes: [
        questionNote('N001', 'signin', 'W1', { by: 'session' }),
        questionNote('N002', 'signin', 'W2', { by: 'session' }),
        { id: 'N003', scope: 'mock', screen: 'signin', state: null, text: 'x', by: 'jj', at: NOW, status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, reason: 'missing-screen' },
      ],
      ledger: [ledgerRow('W1'), ledgerRow('W2')],
      stops: [],
    }
  }

  const html = buildReviewPage(fixture(1280))
  const signinBlock = sliceFrom(html, 'data-label="signin"', ['data-label="home"'])
  const homeBlock = sliceFrom(html, 'data-label="home"', ['data-rv="row"'])

  const signinStates = [...signinBlock.matchAll(/data-rv="tab"\s+data-state="([^"]+)"/g)].map((m) => m[1])
  assert.deepStrictEqual(signinStates, ['happy', 'empty', 'loading', 'error'],
    'AC-4: a mock declaring data-state-btn values empty/loading/error must render tabs happy, empty, loading, error in that order: got ' + JSON.stringify(signinStates))

  const signinSrcs = [...signinBlock.matchAll(/<iframe[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
  assert.deepStrictEqual(signinSrcs, [
    '/mocks/signin.html?clean',
    '/mocks/signin.html?clean&state=empty',
    '/mocks/signin.html?clean&state=loading',
    '/mocks/signin.html?clean&state=error',
  ], 'AC-4: each tab\'s iframe src must be the mock served ?clean plus that tab\'s &state=<s> (or none for happy): got ' + JSON.stringify(signinSrcs))
  assert.ok(signinBlock.includes('width="1280"'), 'AC-4: the signin iframe must carry width="1280" (the fixture\'s primary viewport width): got ' + signinBlock)

  const homeStates = [...homeBlock.matchAll(/data-rv="tab"\s+data-state="([^"]+)"/g)].map((m) => m[1])
  assert.deepStrictEqual(homeStates, ['happy'], 'AC-4: a mock declaring no data-state-btn values must render a single "happy" tab: got ' + JSON.stringify(homeStates))
  assert.ok(homeBlock.includes('width="1280"'), 'AC-4: the home iframe must also carry width="1280": got ' + homeBlock)

  assert.match(signinBlock, /1\.\s*signin/, 'AC-4: the caption must read "<n>. <label>", "1. signin" for the first screen: got ' + signinBlock)
  assert.match(signinBlock, />3</, 'AC-4: the caption badge must read 3 (two questions plus one note on signin): got ' + signinBlock)
  assert.match(signinBlock, /\+ note/, 'AC-4: the caption must carry a "+ note" control: got ' + signinBlock)
  assert.match(signinBlock, /data-rv="frame"[^>]*\bdata-focus\b/, 'AC-4: the frame of the first open item\'s screen (signin, holding N001) must carry data-focus: got ' + signinBlock)
  assert.doesNotMatch(homeBlock, /data-focus/, 'AC-4: only the focused screen\'s frame may carry data-focus — home holds no open item and must not: got ' + homeBlock)

  const htmlNoTargets = buildReviewPage(fixture(null))
  assert.ok(htmlNoTargets.includes('width="1280"'), 'AC-4: with no design/targets.json (viewportWidth null/undefined) the builder must default every iframe to width="1280": got ' + htmlNoTargets.slice(0, 400))
})

// ---------------------------------------------------------------------------
// AC-20260906-04-5
// ---------------------------------------------------------------------------
test('AC-20260906-04-5: the inspector renders one visible row per open question ("I assumed" for session, "A fresh reader asked" for a non-session author) and one visible row per project note ("You told JJ", "Whole project", the "Missing screen" chip, "blocks approval until addressed"), while an answered question renders a fourth, non-default-visible row reading "You corrected: <text>" with no buttons', () => {
  const { buildReviewPage } = loadBuilder()
  const html = buildReviewPage({
    root: '/tmp/hearwell-review-fixture-3',
    journey: 'onboarding',
    prefix: '',
    seed: { product: 'Hearwell', viewportWidth: 1280, journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }] }] },
    notes: [
      questionNote('N010', 'signin', 'W7', { by: 'session' }),
      questionNote('N011', 'signin', 'W8', { by: 'critic' }),
      questionNote('N012', 'signin', 'W9', { by: 'session', open: false, answer: { verdict: 'no', text: 'Owner sets modality', by: 'ren', at: NOW } }),
      projectNote('N013', { reason: 'missing-screen', text: 'no screen for cancelling a session' }),
    ],
    ledger: [ledgerRow('W7'), ledgerRow('W8'), ledgerRow('W9', { status: 'overridden 2026-09-07' })],
    stops: [],
  })

  const rows = rowChunks(html)
  assert.strictEqual(rows.length, 4, 'AC-5: the inspector must render exactly one [data-rv="row"] per question/note (three open plus one answered): got ' + rows.length)

  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  assert.ok(byId.N010 && byId.N011 && byId.N013 && byId.N012, 'test setup requires rows for N010, N011, N012, N013 to all exist: got ids ' + rows.map((r) => r.id).join(','))

  const visibleIds = rows.filter((r) => r.visible).map((r) => r.id).sort()
  assert.deepStrictEqual(visibleIds, ['N010', 'N011', 'N013'], 'AC-5: under the default Open filter exactly the three open/unresolved rows are visible (the answered N012 excluded): got ' + JSON.stringify(visibleIds))
  assert.strictEqual(byId.N012.visible, false, 'AC-5: the answered question\'s row must not be visible under the default Open filter: got ' + byId.N012.text)

  assert.match(byId.N010.text, /I assumed/, 'AC-5: a question asked by the session must render "I assumed": got ' + byId.N010.text)
  assert.match(byId.N011.text, /A fresh reader asked/, 'AC-5: a question asked by someone other than the session (by "critic") must render "A fresh reader asked": got ' + byId.N011.text)

  assert.match(byId.N013.text, /You told JJ/, 'AC-5: a project note\'s row must render "You told JJ": got ' + byId.N013.text)
  assert.match(byId.N013.text, /Whole project/, 'AC-5: a project-scope note\'s row must render "Whole project": got ' + byId.N013.text)
  assert.match(byId.N013.text, /Missing screen/, 'AC-5: a note with reason "missing-screen" must render the chip "Missing screen": got ' + byId.N013.text)
  assert.match(byId.N013.text, /blocks approval until addressed/, 'AC-5: an unresolved note\'s row must render "blocks approval until addressed": got ' + byId.N013.text)

  assert.match(byId.N012.text, /You corrected: Owner sets modality/, 'AC-5: the answered "no" question\'s row must read "You corrected: <text>" verbatim: got ' + byId.N012.text)
  assert.doesNotMatch(byId.N012.text, /<button/i, 'AC-5: the answered question\'s row must render no buttons: got ' + byId.N012.text)
})

// ---------------------------------------------------------------------------
// AC-20260906-04-7
// ---------------------------------------------------------------------------
test('AC-20260906-04-7: [data-rv="approve"] is disabled with title "<k> open item(s) block approval" while any question is unanswered, enabled inside id="stop-<id>" once every item is answered/resolved (posting {verdict:\'approve\'} to /__picks/decide), "Waiting for the session to open a look" with no approve control when no stop is open, and the decided line when the stop is decided', () => {
  const { buildReviewPage } = loadBuilder()
  const seed = { product: 'Hearwell', viewportWidth: 1280, journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }] }] }
  const candidates = [{ group: null, label: 'signin', path: 'mocks/signin.html' }]

  const openQuestionNote = questionNote('N020', 'signin', 'W20', { by: 'session' })
  const resolvedQuestionNote = questionNote('N020', 'signin', 'W20', { by: 'session', open: false, answer: { verdict: 'yes', text: '', by: 'session', at: NOW } })
  const ledger = [ledgerRow('W20')]

  const withOpenItem = buildReviewPage({
    root: '/t', journey: 'onboarding', prefix: '', seed, ledger,
    notes: [openQuestionNote],
    stops: [approveStop('P100', 'journey-approved:onboarding', candidates)],
  })
  const approveTagOpen = sliceFrom(withOpenItem, 'data-rv="approve"', ['>']) + '>'
  assert.match(approveTagOpen, /\bdisabled\b/, 'AC-7: with one open item, [data-rv="approve"] must carry disabled: got ' + approveTagOpen)
  assert.match(approveTagOpen, /title="1 open item blocks approval"/, 'AC-7: the disabled approve control\'s title must read "1 open item blocks approval": got ' + approveTagOpen)

  const withAllClear = buildReviewPage({
    root: '/t', journey: 'onboarding', prefix: '', seed, ledger,
    notes: [resolvedQuestionNote],
    stops: [approveStop('P100', 'journey-approved:onboarding', candidates)],
  })
  assert.match(withAllClear, /id="stop-P100"/, 'AC-7: the approve control must render inside id="stop-P100" (the stop\'s own block): got ' + withAllClear.slice(0, 400))
  const stopBlock = sliceFrom(withAllClear, 'id="stop-P100"', ['data-rv="row"'])
  const approveTagClear = sliceFrom(stopBlock, 'data-rv="approve"', ['>']) + '>'
  assert.doesNotMatch(approveTagClear, /\bdisabled\b/, 'AC-7: once every item is answered/resolved, [data-rv="approve"] must not carry disabled: got ' + approveTagClear)
  assert.match(stopBlock, /\/__picks\/decide/, 'AC-7: the approve control\'s decide script must post to /__picks/decide (spec 01 D9\'s literals, unchanged): got ' + stopBlock)
  assert.match(stopBlock, /verdict:\s*['"]approve['"]/, 'AC-7: the approve control\'s decide script must post verdict:"approve" (spec 01 D9\'s literal, unchanged): got ' + stopBlock)

  const withNoStop = buildReviewPage({
    root: '/t', journey: 'onboarding', prefix: '', seed, ledger, notes: [resolvedQuestionNote], stops: [],
  })
  assert.match(withNoStop, /Waiting for the session to open a look/, 'AC-7: with no open journey-approved stop the header must read "Waiting for the session to open a look": got ' + withNoStop.slice(0, 400))
  assert.doesNotMatch(withNoStop, /data-rv="approve"/, 'AC-7: with no open stop, no [data-rv="approve"] control may render at all: got ' + withNoStop.slice(0, 400))

  const withDecided = buildReviewPage({
    root: '/t', journey: 'onboarding', prefix: '', seed, ledger, notes: [resolvedQuestionNote],
    stops: [approveStop('P100', 'journey-approved:onboarding', candidates, { status: 'decided', decision: { verdict: 'approve', pick: null, note: null, by: 'jj', at: NOW } })],
  })
  assert.match(withDecided, /Approved by jj/, 'AC-7: once the stop is decided approve, the page must render the decided line the atlas renders ("Approved by jj"): got ' + withDecided.slice(0, 400))
})
