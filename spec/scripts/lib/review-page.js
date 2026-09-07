'use strict'
// lib/review-page.js — the pure builder of the journey review page design-atlas.js serves at
// GET /review/<journey>.html. specs/20260906/04-journey-review-page.md D1 (builder + route
// contract), D3 (artboards), D4 (inspector markup), D5 (header + stop control), A6 (frame floor).
//
//   buildReviewPage({ root, journey, seed, notes, ledger, stops, prefix, clean? }) → html
//     root     the host repo root (carried for the caller's bookkeeping — nothing is read here)
//     journey  the journey's kebab name (seed.md `### <name>`)
//     seed     { product, viewportWidth, viewportHeight?, journeys: [{ name, title, screens:
//              [{ label, states: [<data-state-btn value>, …] }] }] } in seed order — the served
//              route derives `states` from each mock's markup (statesOf below) and the viewport
//              from design/targets.json (viewportOf below) and hands them in already parsed
//     notes    notes.json array, raw — questions are joined onto `ledger` rows here exactly as
//              /__notes/list joins them (claim/rejected/tag/status; ledgerMissing when gone)
//     ledger   parseLedger(...).assumptions
//     stops    picks.json stops, raw — the journey's live `journey-approved:<j>` stop (open or
//              decided, newest first via lib/mocks-picks.js's pending) renders in the header
//     prefix   the served mount ('' or '/p/<name>')
//     clean    true strips the chrome to the artboard grid (`?clean`)
//
// Byte-deterministic for equal inputs: no fs, no clock (every `at` renders as given), no
// randomness, no environment read. Same-origin frames: every artboard iframe is the served mock
// under `?clean[&state=<s>]` (D2's state injection), never a file:// path.
//
// A6 (measured on a live host atlas): a viewport-filling mock (`100vh` app shells, sign-in
// screens) measured inside an iframe still at the browser's default 150px height reports 150 and
// collapses to a strip. Every frame here therefore carries BOTH `width` and `height` attributes
// from the primary viewport before any script measures it; review.browser.js only ever raises
// that floor to the content height, never lowers it.
//
// Does NOT: serve, write, or touch notes.json / picks.json / ledger.md (design-atlas.js's routes
// do the writes); render a pick stop's compare table (variants:<j> stops keep the atlas, D6);
// anchor a note to an element (the store has none — screen + state resolution only, D3).
//
// Exit codes: none — this is a library, not an executable.

const picksLib = require('./mocks-picks')
const { renderApproveStop, PICKS_SCRIPT, esc } = require('./stop-block')

const REASON_LABELS = {
  'missing-screen': 'Missing screen',
  'wrong-direction': 'Wrong direction',
  'wrong-words': 'Wrong words',
  other: 'Other',
}
const REASONS = ['missing-screen', 'wrong-direction', 'wrong-words', 'other']
const DEFAULT_VIEWPORT = { width: 1280, height: 800 }

// Every data-state-btn value a mock declares, in declared order (none → []). A declared `happy`
// is the page's own no-param tab already (D3), so it is never listed twice. Pure — the caller
// reads the file.
function statesOf(html) {
  const out = []
  for (const m of String(html || '').matchAll(/data-state-btn\s*=\s*"([^"]+)"/g)) {
    if (m[1].toLowerCase() !== 'happy' && !out.includes(m[1])) out.push(m[1])
  }
  return out
}

// The primary viewport: the first targets.json viewport; 1280×800 when none is declared (D3 — a
// desktop product shows its desktop layout, a phone product its phone layout). Pure.
function viewportOf(targets) {
  const vp = targets && Array.isArray(targets.viewports) && targets.viewports[0]
  return {
    width: vp && vp.width > 0 ? vp.width | 0 : DEFAULT_VIEWPORT.width,
    height: vp && vp.height > 0 ? vp.height | 0 : DEFAULT_VIEWPORT.height,
  }
}

// /__notes/list's join, restated over the caller's already-parsed ledger rows.
function joinQuestions(notes, ledgerRows) {
  const rows = Array.isArray(ledgerRows) ? ledgerRows : []
  return (notes || []).map((n) => {
    if (n.kind !== 'question') return n
    const row = rows.find((a) => a.id === n.ledgerId)
    if (!row) return Object.assign({}, n, { ledgerMissing: true })
    return Object.assign({}, n, { claim: row.claim, rejected: row.rejected, tag: row.tag, status: row.status })
  })
}

function isOpen(n) { return n.kind === 'question' ? n.answer == null : n.status !== 'resolved' }
function isQuestion(n) { return n.kind === 'question' }
function plural(n, one, many) { return n === 1 ? one : many }

function pillText(stop) {
  const approved = stop && stop.status === 'decided' && stop.decision && stop.decision.verdict === 'approve'
  return approved ? 'Wireframes · approved' : 'Wireframes · awaiting your answers'
}

// ---- rail ---------------------------------------------------------------------------------------
// Rail anchors use `data-journey`/`data-screen`, never `data-label` — `data-label` is the
// artboard's own anchor (Contracts) and the tests slice the page on it.
function renderRail(seed, journey, screens, openByLabel) {
  const journeysHtml = (seed.journeys || []).map((j, i) => {
    const cur = j.name === journey
    // The current journey's mark trails its title (a small "reviewing" chip carrying aria-current).
    return '<li><a data-rv="journey" data-journey="' + esc(j.name) + '"' + (cur ? ' class="rv-cur"' : '') +
      ' href="' + (cur ? '#' : esc(j.name) + '.html') + '"><span class="rv-n">' + (i + 1) + '</span>' + esc(j.title || j.name) +
      (cur ? '<span class="rv-here" aria-current="page">reviewing</span>' : '') + '</a></li>'
  }).join('')
  const screensHtml = screens.map((s, i) => {
    const open = openByLabel.get(s.label) || 0
    return '<li><a data-rv="screen" data-screen="' + esc(s.label) + '" href="#board-' + esc(s.label) + '"><span class="rv-n">' + (i + 1) + '</span>' +
      esc(s.label) + '<span class="rv-count" data-rv="count" data-screen="' + esc(s.label) + '"' + (open ? '' : ' data-zero') + '>' + open + '</span></a></li>'
  }).join('')
  const select = '<select class="rv-jump" aria-label="Jump to a screen" data-rv="jump">' +
    screens.map((s, i) => '<option value="board-' + esc(s.label) + '">' + (i + 1) + '. ' + esc(s.label) + '</option>').join('') + '</select>'
  return '<nav class="rv-rail" data-rv="rail" aria-label="Journeys and screens">' +
    '<h2>Journeys</h2><ol class="rv-list rv-journeys">' + journeysHtml + '</ol>' +
    '<h2>Screens</h2><ol class="rv-list rv-screens">' + screensHtml + '</ol>' + select + '</nav>'
}

// ---- artboards ----------------------------------------------------------------------------------
// A raw `&` between query params (never `&amp;`) — the src is a URL the tests compare byte-for-byte;
// label and state are URL-encoded, so only a double quote could ever break the attribute.
function frameSrc(prefix, label, state) {
  return (prefix + '/mocks/' + encodeURIComponent(label) + '.html?clean' + (state ? '&state=' + encodeURIComponent(state) : '')).replace(/"/g, '%22')
}

// One iframe per state tab (the tab shows its own frame; the others stay hidden and unloaded), so
// a tab's src is a static attribute the page never rewrites. All of a focused board's frames carry
// data-focus. width/height come from the primary viewport (A6 floor).
function renderBoard(screen, i, vp, prefix, openCount, itemCount, focused) {
  const label = screen.label
  const tabs = ['happy'].concat(screen.states || [])
  const tabsHtml = tabs.map((s, k) =>
    '<button type="button" role="tab" data-rv="tab" data-state="' + esc(s) + '" aria-selected="' + (k === 0 ? 'true' : 'false') + '">' + esc(s) + '</button>').join('')
  const framesHtml = tabs.map((s, k) =>
    '<iframe data-rv="frame" data-label="' + esc(label) + '" data-state="' + esc(s) + '"' + (focused ? ' data-focus' : '') + (k === 0 ? '' : ' hidden') +
    ' width="' + vp.width + '" height="' + vp.height + '" loading="lazy" scrolling="no" title="' + esc(label) + ' · ' + esc(s) +
    '" src="' + frameSrc(prefix, label, k === 0 ? null : s) + '"></iframe>').join('')
  return '<section class="rv-board" data-rv="board" data-label="' + esc(label) + '" id="board-' + esc(label) + '"' + (focused ? ' data-focus' : '') + '>' +
    '<header class="rv-cap"><h3>' + (i + 1) + '. ' + esc(label) + '</h3>' +
    '<button type="button" class="rv-badge" data-rv="badge" data-label="' + esc(label) + '"' + (itemCount ? '' : ' data-zero') +
    ' title="' + openCount + ' open of ' + itemCount + ' on this screen">' + itemCount + '</button>' +
    '<button type="button" class="rv-addnote" data-rv="addnote" data-label="' + esc(label) + '">+ note</button></header>' +
    '<div class="rv-tabs" role="tablist" aria-label="States of ' + esc(label) + '">' + tabsHtml + '</div>' +
    '<div class="rv-shot" data-rv="shot" style="--rv-w:' + vp.width + ';--rv-h:' + vp.height + '">' + framesHtml + '</div></section>'
}

// ---- inspector ----------------------------------------------------------------------------------
function tagText(n) { return n.ledgerMissing ? 'ledger row missing' : (n.tag || '') }

function rowOpen(n, kind, status, extra) {
  return '<article data-rv="row" data-id="' + esc(n.id) + '" data-kind="' + kind + '" data-status="' + status + '" class="rv-row rv-' + (kind === 'question' ? 'q' : 'note') + '"' +
    (n.scope === 'mock' && n.screen ? ' data-label="' + esc(n.screen) + '"' : '') + extra + ' tabindex="-1">'
}

function renderQuestionRow(n, selected) {
  const open = n.answer == null
  const who = n.by === 'session' ? 'I assumed' : 'A fresh reader asked'
  const head = '<div class="rv-rowhead"><span class="rv-id">' + esc(n.ledgerId || n.id) + '</span>' +
    '<span class="rv-who">' + who + '</span>' +
    (n.screen ? '<span class="rv-sep">·</span><span class="rv-screen">' + esc(n.screen) + '</span>' : '') +
    (tagText(n) ? '<span class="rv-sep">·</span><span class="rv-tag">' + esc(tagText(n)) + '</span>' : '') + '</div>'
  const claim = '<p class="rv-claim">' + esc(n.claim != null ? n.claim : n.text) + '</p>' +
    (n.rejected ? '<p class="rv-rejected">Rejected: ' + esc(n.rejected) + '</p>' : '')
  const answered = !open
    ? '<p class="rv-answered" data-rv="answered" data-verdict="' + esc(n.answer.verdict) + '">' +
      (n.answer.verdict === 'no' ? 'You corrected: ' + esc(n.answer.text) : 'You confirmed') + '</p>'
    : '<p class="rv-answered" data-rv="answered" hidden></p>'
  const controls = open
    ? '<div class="rv-actions" data-rv="actions"><button type="button" data-rv="yes">Yes, that\'s right</button>' +
      '<button type="button" data-rv="no">No, it\'s…</button><button type="button" data-rv="later">Later</button></div>' +
      '<div class="rv-correct" data-rv="correct" hidden><textarea data-rv="correction" rows="2" placeholder="What is actually true?"></textarea>' +
      '<button type="button" data-rv="save">Save correction</button></div>'
    : ''
  return rowOpen(n, 'question', open ? 'open' : 'answered', (selected ? ' data-selected' : '') + (open ? '' : ' hidden')) +
    head + claim + answered + controls + '</article>'
}

function renderNoteRow(n, selected) {
  const open = n.status !== 'resolved'
  const scopeText = n.scope === 'project' ? 'Whole project' : esc(n.screen || '') + (n.state ? ' · ' + esc(n.state) : '')
  const chip = n.reason ? '<span class="rv-chip" data-reason="' + esc(n.reason) + '">' + esc(REASON_LABELS[n.reason] || n.reason) + '</span>' : ''
  const head = '<div class="rv-rowhead"><span class="rv-id">' + esc(n.id) + '</span><span class="rv-who">You told JJ</span>' +
    '<span class="rv-sep">·</span><span class="rv-screen">' + scopeText + '</span>' + chip + '</div>'
  const body = '<p class="rv-claim">' + esc(n.text) + '</p>'
  const status = open
    ? (n.status === 'addressed' && n.addressed
      ? '<p class="rv-wait">Addressed: ' + esc(n.addressed.change) + ' · blocks approval until resolved by the session</p>'
      : '<p class="rv-wait">Waiting for the session · blocks approval until addressed</p>')
    : '<p class="rv-answered">' + (n.addressed && n.addressed.change ? 'Addressed: ' + esc(n.addressed.change) : 'Addressed') + '</p>'
  return rowOpen(n, 'note', open ? 'open' : 'resolved', (selected ? ' data-selected' : '') + (open ? '' : ' hidden')) +
    head + body + status + '</article>'
}

function renderComposer(prefix) {
  const chips = REASONS.map((r, i) =>
    '<button type="button" class="rv-chipbtn' + (i === REASONS.length - 1 ? ' rv-chip-on' : '') + '" data-rv="chip" data-value="' + r +
    '" aria-pressed="' + (i === REASONS.length - 1 ? 'true' : 'false') + '">' + REASON_LABELS[r] + '</button>').join('')
  return '<form class="rv-composer" data-rv="composer" data-prefix="' + esc(prefix) + '" aria-label="Tell the session something">' +
    '<div class="rv-scope" role="group" aria-label="Scope">' +
    '<button type="button" data-rv="scope" data-value="project" class="rv-scope-on" aria-pressed="true">Whole project</button>' +
    '<button type="button" data-rv="scope" data-value="screen" aria-pressed="false">This screen</button>' +
    '<span class="rv-scope-label" data-rv="scope-label"></span></div>' +
    '<div class="rv-chips">' + chips + '</div>' +
    '<textarea data-rv="text" rows="3" placeholder="What should change, or what is missing?"></textarea>' +
    '<div class="rv-actions"><button type="submit" data-rv="send" class="rv-primary">Send</button><kbd>⌘</kbd><kbd>Enter</kbd></div></form>'
}

function renderInspector(items, prefix, selectedId) {
  const openCount = items.filter(isOpen).length
  const rows = items.map((n) => (isQuestion(n) ? renderQuestionRow(n, n.id === selectedId) : renderNoteRow(n, n.id === selectedId))).join('')
  const empty = '<p class="rv-empty" data-rv="empty"' + (openCount ? ' hidden' : '') + '>Every question is answered. Approve the journey when the screens look right.</p>'
  return '<aside class="rv-inspector" data-rv="inspector" aria-label="Questions and notes">' +
    '<div class="rv-filters" role="tablist"><button type="button" data-rv="filter" data-filter="open" aria-selected="true">Open<span class="rv-count" data-rv="open-count">' + openCount + '</span></button>' +
    '<button type="button" data-rv="filter" data-filter="answered" aria-selected="false">Answered</button>' +
    '<button type="button" data-rv="filter" data-filter="all" aria-selected="false">All</button>' +
    '<button type="button" class="rv-fold" data-rv="fold" title="Fold the inspector (\\)" aria-label="Fold the inspector">›</button></div>' +
    '<div class="rv-rows" data-rv="rows">' + rows + empty + '</div>' +
    renderComposer(prefix) +
    '<footer class="rv-keys"><span><kbd>J</kbd><kbd>K</kbd> move</span><span><kbd>Y</kbd> yes</span><span><kbd>N</kbd> no, it\'s…</span><span><kbd>Esc</kbd> clear</span><span><kbd>\\</kbd> fold</span></footer>' +
    '</aside>' +
    '<button type="button" class="rv-strip" data-rv="strip" hidden aria-label="Unfold the inspector"><span class="rv-strip-arrow">‹</span><span class="rv-strip-count" data-rv="strip-count">' + openCount + '</span></button>'
}

// ---- header -------------------------------------------------------------------------------------
function renderHeader(seed, journeyEntry, journeyIndex, items, stop) {
  const questions = items.filter(isQuestion)
  const answered = questions.filter((q) => q.answer != null).length
  const openNotes = items.filter((n) => !isQuestion(n) && isOpen(n)).length
  const openAll = items.filter(isOpen).length
  const progressText = answered + ' of ' + questions.length + ' answered' +
    (openNotes ? ' · ' + openNotes + ' ' + plural(openNotes, 'note', 'notes') + ' for the session' : '')
  const pct = questions.length ? Math.round((answered / questions.length) * 100) : 100
  const title = (journeyIndex + 1) + ' · ' + (journeyEntry.title || journeyEntry.name)
  let control
  if (!stop) {
    control = '<p class="rv-nostop" data-rv="nostop">Waiting for the session to open a look</p>'
  } else if (stop.status === 'decided') {
    control = renderApproveStop(stop, { className: 'rv-stop' })
  } else {
    const blockTitle = openAll + ' open ' + plural(openAll, 'item blocks', 'items block') + ' approval'
    control = renderApproveStop(stop, {
      className: 'rv-stop',
      approveLabel: 'Approve journey',
      changeLabel: 'Request changes',
      approveAttrs: 'data-rv="approve" class="rv-primary"' + (openAll ? ' disabled title="' + esc(blockTitle) + '"' : ''),
      changeAttrs: 'data-rv="change"',
      noteAttrs: 'placeholder="What should change?" aria-label="What should change"',
    })
  }
  // The decide script sits right beside the block it drives (spec 01 D9's literals, unchanged).
  return '<header class="rv-bar">' +
    '<nav class="rv-crumb" aria-label="Breadcrumb"><span>' + esc(seed.product || 'Product') + '</span><span class="rv-sep">/</span><span>Mocks</span><span class="rv-sep">/</span><strong>' + esc(title) + '</strong></nav>' +
    '<span class="rv-pill" data-rv="pill">' + pillText(stop) + '</span>' +
    '<div class="rv-progress" data-rv="progress" data-answered="' + answered + '" data-total="' + questions.length + '">' +
    '<span class="rv-progress-text" data-rv="progress-text">' + progressText + '</span>' +
    '<span class="rv-track" aria-hidden="true"><span class="rv-fill" data-rv="fill" style="width:' + pct + '%"></span></span></div>' +
    '<div class="rv-control" data-rv="control">' + control + '</div>' + (stop ? PICKS_SCRIPT : '') + '</header>'
}

// ---- page ---------------------------------------------------------------------------------------
function buildReviewPage(input) {
  const o = input || {}
  const journey = o.journey
  const seed = o.seed || { product: '', journeys: [] }
  const prefix = o.prefix || ''
  if (!journey) throw new Error('buildReviewPage needs {journey}')
  const journeys = Array.isArray(seed.journeys) ? seed.journeys : []
  const jIndex = journeys.findIndex((j) => j.name === journey)
  if (jIndex === -1) throw new Error('unknown journey ' + journey + ' — declared: ' + journeys.map((j) => j.name).join(', '))
  const entry = journeys[jIndex]
  const screens = (entry.screens || []).map((s) => (typeof s === 'string' ? { label: s, states: [] } : s))
  const labels = screens.map((s) => s.label)
  const labelSet = new Set(labels)
  const vp = {
    width: seed.viewportWidth > 0 ? seed.viewportWidth | 0 : DEFAULT_VIEWPORT.width,
    height: seed.viewportHeight > 0 ? seed.viewportHeight | 0 : DEFAULT_VIEWPORT.height,
  }

  const joined = joinQuestions(o.notes || [], o.ledger || [])
  // D4: rows = the journey's questions and mock notes on its labels + every project note, sorted
  // screen order (project scope last) then id.
  const order = new Map(labels.map((l, i) => [l, i]))
  const items = joined
    .filter((n) => (n.scope === 'mock' && labelSet.has(n.screen)) || n.scope === 'project')
    .sort((a, b) => {
      const oa = a.scope === 'project' ? labels.length : order.get(a.screen)
      const ob = b.scope === 'project' ? labels.length : order.get(b.screen)
      if (oa !== ob) return oa - ob
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  const openByLabel = new Map()
  const countByLabel = new Map()
  for (const n of items) {
    if (n.scope !== 'mock') continue
    countByLabel.set(n.screen, (countByLabel.get(n.screen) || 0) + 1)
    if (isOpen(n)) openByLabel.set(n.screen, (openByLabel.get(n.screen) || 0) + 1)
  }
  const firstOpen = items.find(isOpen)
  const focusLabel = firstOpen && firstOpen.scope === 'mock' ? firstOpen.screen : null
  const selectedId = firstOpen ? firstOpen.id : null

  const live = picksLib.pending(o.stops || [])
  const key = 'journey-approved:' + journey
  const stop = live.open.find((s) => s.key === key) || live.decided.find((s) => s.key === key) || null

  const boards = screens.map((s, i) =>
    renderBoard(s, i, vp, prefix, openByLabel.get(s.label) || 0, countByLabel.get(s.label) || 0, s.label === focusLabel)).join('')

  const head = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(entry.title || journey) + ' · review · ' + esc(seed.product || 'Mocks') + '</title>' +
    '<link rel="stylesheet" href="' + esc(prefix) + '/__notes/viewer.css">' +
    '</head>'
  if (o.clean) {
    return head + '<body class="rv rv-clean" data-journey="' + esc(journey) + '"><main class="rv-canvas" data-rv="canvas">' + boards + '</main></body></html>\n'
  }
  return head + '<body class="rv" data-journey="' + esc(journey) + '" data-prefix="' + esc(prefix) + '">' +
    renderHeader(seed, entry, jIndex, items, stop) +
    '<div class="rv-main">' + renderRail(seed, journey, screens, openByLabel) +
    '<main class="rv-canvas" data-rv="canvas">' + boards + '</main>' +
    renderInspector(items, prefix, selectedId) + '</div>' +
    '<script src="' + esc(prefix) + '/__review/review.js"></script>' +
    '</body></html>\n'
}

module.exports = { buildReviewPage, joinQuestions, statesOf, viewportOf }
