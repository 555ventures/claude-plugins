'use strict'
// lib/walk-page.js — the two pure builders of the client's own pages, served by design-atlas.js
// at GET /client/index.html and GET /client/walk/<j>.html.
// specs/20260910/03-client-journey-player.md D1 (both builders and their markup contract), D3
// (the hooks walk.browser.js drives); specs/20260911/01-the-page-waits-for-the-server.md D1
// (supersedes spec 03 D2: `STRINGS`/`stringsFor`/the `lang` param are retired — the player's own
// chrome is English-only), D3 (the `[data-wk="msg"]` status slot).
//
//   buildClientIndex({ seed, notes, ledger, walk, prefix }) → html
//     seed    { product, journeys: [{ name, title, screens: [{ label, states }] }] } in seed
//             order — design-atlas.js's seedForReview builds it
//     notes   notes.json array, raw — joined onto `ledger` exactly as review-page.js joins it
//     ledger  parseLedger(...).assumptions
//     walk    design/mocks/walk.json, raw ({ journeys: { <j>: { reached, misses, confirmedAt,
//             sentence, waived } } }) — lib/mocks-walk.js is its only writer
//     prefix  the served mount ('' or '/p/<name>')
//
//   buildWalkPage({ seed, journey, notes, ledger, walk, prefix, theme }) → html
//     journey the journey's kebab name; an unknown one throws naming every declared journey
//             (design-atlas.js turns that throw into the route's 404)
//     theme   the adopted theme kebab, threaded into the frame URL by walk.browser.js
//
// Byte-deterministic for equal inputs: no fs, no clock, no randomness, no environment read. The
// page ships no dynamic state of its own — every moving part (the frame's src, which marks show,
// whether approve is reachable) is set by lib/walk.browser.js from the server's own walk record,
// so a reload can never skip the walk.
//
// Does NOT: serve, read or write walk.json / notes.json / ledger.md (design-atlas.js's routes do
// every write); ask the reader who they are (D3 — the client route has no identity, so no name
// control is ever rendered); render a session-only surface (no artboard grid, no stop block);
// render the mocks themselves in English — only the player's own chrome is English, the mocks
// stay whatever language the client's product is written in.
//
// Exit codes: none — this is a library, not an executable.

const { esc } = require('./stop-block')
const { originOf } = require('./mocks-notes')
const walkLib = require('./mocks-walk')

// Every visible string in the player's own chrome, flat — one language, because the declared
// `<html lang="en">` and the rendered language can never disagree when there is only one.
const STRINGS = {
  indexLead: 'Open a journey and walk it to the end. Tell us what matches what you expected.',
  back: 'Back',
  next: 'Next',
  states: 'Other states',
  happy: 'Normal',
  yes: "That's right",
  no: "That's not right",
  why: 'What should it be instead?',
  noteLabel: 'Anything else about this screen?',
  noteSend: 'Send',
  leftNone: 'Nothing left to check',
  leftOne: '1 thing still to check',
  leftMany: '{n} things still to check',
  approveLead: 'Describe what you just did, in one sentence.',
  sentence: 'In one sentence…',
  confirm: 'Confirm this journey',
  confirmedLead: 'You confirmed this journey.',
  msgWhy: 'Please say what should be different first.',
  msgFailed: 'That did not save. Please try again.',
  themeNone: 'nothing to pick yet',
  themePrompt: 'Pick a look',
  themePick: 'Pick this',
  themePicked: 'Picked',
  exclAgree: 'This journey does not do this — correct?',
  // specs/20260911/04-the-client-loop.md D4: the journey row's derived-state text.
  notStarted: 'Not started',
  inProgress: 'In progress',
  changesRequested: 'Changes requested ({n})',
  fixedCheck: 'Fixed — please check ({n})',
  okText: 'OK',
  skipped: 'Skipped',
  comingSoon: 'Coming soon',
  // D4: the index's own composer and request list.
  askHeading: 'Something missing?',
  askMissingScreen: 'A screen is missing',
  askOther: 'Something else',
  askSend: 'Send',
  requestsHeading: 'Your requests',
  reqWatching: "We'll look at this",
  reqClosed: 'Closed',
  reqClosedThanks: 'Closed — thank you',
  reqDonePrefix: 'Done: ',
  reqAcceptIndex: 'Looks good',
  reqReopenIndex: 'Still not right',
  msgWhyIndex: 'Please say what is missing first.',
  msgSaved: "Saved. We'll fix this and let you know here.",
  // D5: the walk page's own request cards and derived approve lead.
  reqFixedPrefix: 'Fixed: ',
  reqAcceptWalk: 'Looks good now',
  reqReopenWalk: 'Still not right',
  fixedLead: 'We fixed what you asked. Check the screens marked Fixed, then confirm.',
  changesLead: "You asked for changes. We'll fix them and let you know.",
}

function count(s, none, one, many, n) {
  return n === 0 ? s[none] : n === 1 ? s[one] : s[many].replace('{n}', String(n))
}

// A question is open until it carries an answer — the same rule lib/review-page.js applies, so
// the session's page and the client's page never disagree about what is still outstanding.
function isOpenQuestion(n) { return n && n.kind === 'question' && n.answer == null }

// Questions joined onto their ledger rows, exactly as /__notes/list joins them: the row supplies
// the claim the client actually reads. A question whose row is gone carries its own text.
function claimOf(note, ledgerRows) {
  const row = (ledgerRows || []).find((r) => r.id === note.ledgerId)
  return (row && row.claim) || note.text || ''
}

function journeysOf(seed) { return Array.isArray(seed && seed.journeys) ? seed.journeys : [] }
function screensOf(entry) {
  return ((entry && entry.screens) || []).map((s) => (typeof s === 'string' ? { label: s, states: [] } : s))
}
function recordOf(walk, journey) {
  const js = (walk && walk.journeys) || {}
  return js[journey] || null
}

// specs/20260911/04-the-client-loop.md D1/D4/D5: the client-origin, non-question requests a
// journey's labels carry — the set journeyState's own "changes-requested"/"fixed" derivation
// counts, restated here so buildWalkPage/buildClientIndex's own N counts and request cards never
// disagree with the state word painted beside them.
function journeyRequestsOn(notes, labels) {
  const set = labels instanceof Set ? labels : new Set(labels || [])
  return (notes || []).filter((n) => n && n.scope === 'mock' && set.has(n.screen) &&
    n.kind !== 'question' && originOf(n) === 'client')
}

// D4: every client-origin, non-question note (project AND mock scope) — the index's own "Your
// requests" list, newest first.
function clientRequestNotes(notes) {
  return (notes || []).filter((n) => n && n.kind !== 'question' && originOf(n) === 'client')
    .slice().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

function journeyStateText(state, openReq, addressedReq, s) {
  if (state === 'unseen') return s.notStarted
  if (state === 'walking') return s.inProgress
  if (state === 'changes-requested') return s.changesRequested.replace('{n}', String(openReq))
  if (state === 'fixed') return s.fixedCheck.replace('{n}', String(addressedReq))
  if (state === 'ok') return s.okText
  if (state === 'waived') return s.skipped
  return state
}

// D4: an addressed request's "See <journey>" link resolves off `addressed.journey` (a session's
// `notes address --journey`) or `addressed.screen` (`--screen`, matched against every journey's
// declared labels) — never the note's own top-level `screen` (mock-scope notes already know their
// journey from context; this resolution exists for the project-scope "something missing?" answer).
function resolveJourneyForAddressed(note, journeysList) {
  const addressed = (note && note.addressed) || {}
  if (addressed.journey) {
    const j = journeysList.find((x) => x.name === addressed.journey)
    if (j) return j
  }
  if (addressed.screen) {
    for (const j of journeysList) {
      if (screensOf(j).some((sc) => sc.label === addressed.screen)) return j
    }
  }
  return null
}

// D4: one request article for the client index — text, screen (mock-scope only), status line,
// and (addressed only) the "See <journey>" link plus the accept/reopen pair.
function renderIndexRequest(n, journeysList, prefix, s) {
  const status = n.status
  let statusLine
  let extra = ''
  if (status === 'open') {
    statusLine = s.reqWatching
  } else if (status === 'resolved') {
    statusLine = n.resolution === 'accepted' ? s.reqClosedThanks : s.reqClosed
  } else {
    const change = (n.addressed && n.addressed.change) || ''
    statusLine = s.reqDonePrefix + change
    const journey = resolveJourneyForAddressed(n, journeysList)
    if (journey) {
      extra += '<a class="wk-req-link" href="' + esc(prefix) + '/client/walk/' + esc(journey.name) + '.html">' +
        esc('See ' + (journey.title || journey.name)) + '</a>'
    }
    extra += '<div class="wk-req-acts">' +
      '<button class="wk-req-act" type="button" data-cl="accept">' + esc(s.reqAcceptIndex) + '</button>' +
      '<button class="wk-req-act" type="button" data-cl="reopen">' + esc(s.reqReopenIndex) + '</button>' +
      '<textarea class="wk-req-why" data-cl="reopen-text"></textarea>' +
      '</div>'
  }
  return '<article class="wk-req" data-cl="request" data-id="' + esc(n.id) + '" data-status="' + esc(status) + '">' +
    '<p class="wk-req-text">' + esc(n.text) + '</p>' +
    (n.scope === 'mock' ? '<span class="wk-req-where">' + esc(n.screen) + '</span>' : '') +
    '<p class="wk-req-status">' + esc(statusLine) + '</p>' +
    extra +
    '</article>'
}

// D4: "Something missing?" — a project-scope free-text ask plus two reason chips. `other`
// defaults `aria-pressed="true"` (walk.browser.js toggles the pressed chip on click) so a Send
// with no chip touched still posts `reason: "other"` (D6).
function renderAskForm(s) {
  return '<form class="wk-ask" data-cl="ask">' +
    '<h2 class="wk-ask-h">' + esc(s.askHeading) + '</h2>' +
    '<textarea class="wk-ask-in"></textarea>' +
    '<div class="wk-ask-chips">' +
    '<button type="button" class="wk-ask-chip" data-cl="reason" data-value="missing-screen">' + esc(s.askMissingScreen) + '</button>' +
    '<button type="button" class="wk-ask-chip" data-cl="reason" data-value="other" aria-pressed="true">' + esc(s.askOther) + '</button>' +
    '</div>' +
    '<button type="submit">' + esc(s.askSend) + '</button>' +
    '</form>'
}

// D4: the request list itself, plus a hidden, unattached template article walk.browser.js
// activates (by ADDING `data-cl="request"` and the id/status attributes) when the ask form's own
// POST lands — the browser script never fabricates a DOM node from scratch, only reveals/labels
// this one, so a freshly served page always carries exactly one spare slot for the session's next
// save before a reload folds it into the real, server-rendered list.
function renderRequestsSection(notes, journeysList, prefix, s) {
  const articles = clientRequestNotes(notes).map((n) => renderIndexRequest(n, journeysList, prefix, s)).join('')
  return '<section class="wk-reqs" data-cl="requests"><h2 class="wk-reqs-h">' + esc(s.requestsHeading) + '</h2>' +
    '<article class="wk-req" data-cl-template hidden></article>' + articles + '</section>'
}

// D5: one request card per client-origin, non-question, mock-scope note on the journey (every
// label — walk.browser.js hides all but the current screen's). Same open/resolved wording as the
// index; the addressed line reads "Fixed: <change>" (not "Done:" — the walk page is where the fix
// is being CHECKED, the index is where it is being REPORTED).
function renderWalkRequest(n, s) {
  const status = n.status
  let statusLine
  let extra = ''
  if (status === 'open') {
    statusLine = s.reqWatching
  } else if (status === 'resolved') {
    statusLine = n.resolution === 'accepted' ? s.reqClosedThanks : s.reqClosed
  } else {
    const change = (n.addressed && n.addressed.change) || ''
    statusLine = s.reqFixedPrefix + change
    extra = '<div class="wk-req-acts">' +
      '<button class="wk-req-act" type="button" data-wk="accept">' + esc(s.reqAcceptWalk) + '</button>' +
      '<button class="wk-req-act" type="button" data-wk="reopen">' + esc(s.reqReopenWalk) + '</button>' +
      '<textarea class="wk-req-why" data-wk="reopen-text"></textarea>' +
      '</div>'
  }
  return '<article class="wk-req" data-wk="request" data-id="' + esc(n.id) + '" data-label="' + esc(n.screen) +
    '" data-status="' + esc(status) + '" hidden>' +
    '<p class="wk-req-text">' + esc(n.text) + '</p>' +
    '<p class="wk-req-status">' + esc(statusLine) + '</p>' +
    extra +
    '</article>'
}

function head(title, prefix) {
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="notes-route" content="client">' +
    '<title>' + esc(title) + '</title>' +
    '<link rel="stylesheet" href="' + esc(prefix) + '/__notes/viewer.css">' +
    '</head>'
}

// ---------------------------------------------------------------------------
// D1: the index — the journeys, how many of the session's guesses are still open on each, and
// which are already confirmed. A list of rows, not a grid of cards: the journey name is the
// only thing the client is choosing between.
// ---------------------------------------------------------------------------
function buildClientIndex(input) {
  const o = input || {}
  const seed = o.seed || { product: '', journeys: [] }
  const prefix = o.prefix || ''
  const s = STRINGS
  const notes = o.notes || []
  const ledger = o.ledger || []
  const ready = o.ready instanceof Set ? o.ready : new Set()
  const journeysList = journeysOf(seed)
  const rows = journeysList.map((entry) => {
    const labels = screensOf(entry).map((sc) => sc.label)
    const labelSet = new Set(labels)
    // CONTINUE-TO (specs/20260911/01-the-page-waits-for-the-server.md): `data-guesses` is the
    // open-QUESTION count (a session's own unanswered guess), unrelated to D1's client-request
    // states below — kept byte-identical so the predecessor spec's own pin never regresses.
    const openGuesses = notes.filter((n) => isOpenQuestion(n) && n.scope === 'mock' && labelSet.has(n.screen)).length
    const rec = recordOf(o.walk, entry.name)
    const state = walkLib.journeyState(rec, notes, labels)
    const reqs = journeyRequestsOn(notes, labels)
    const openReq = reqs.filter((n) => n.status === 'open').length
    const addressedReq = reqs.filter((n) => n.status === 'addressed').length
    const isReady = ready.has(entry.name)
    const stateText = isReady ? journeyStateText(state, openReq, addressedReq, s) : s.comingSoon
    const tag = isReady ? 'a' : 'span'
    const hrefAttr = isReady ? ' href="' + esc(prefix) + '/client/walk/' + esc(entry.name) + '.html"' : ''
    const readyAttr = isReady ? '' : ' data-ready="false"'
    // A not-ready row skips its own inner name span — a nested `<span class="wk-j-name">…</span>`
    // sibling before the meta span would close (and so end) on ITS OWN first `</span>`, hiding
    // "Coming soon" from anything scanning the outer span for its first closing tag.
    const nameHtml = isReady ? '<span class="wk-j-name">' + esc(entry.title || entry.name) + '</span>' : esc(entry.title || entry.name) + ' — '
    return '<' + tag + ' class="wk-j" data-cl="journey"' + hrefAttr + readyAttr +
      ' data-guesses="' + openGuesses + '" data-confirmed="' + (state === 'ok' ? 'true' : 'false') + '"' +
      ' data-state="' + esc(state) + '">' +
      nameHtml +
      '<span class="wk-j-meta">' + esc(stateText) + '</span></' + tag + '>'
  }).join('')

  // specs/20260910/04-theme-before-the-client-walk.md D7: the index links the theme page while
  // its own pick stop is open — `o.themeOpen` is a plain boolean the caller derives from
  // picks.json (this pure builder never reads it itself).
  const themeLink = o.themeOpen
    ? '<a class="wk-theme" data-cl="theme" href="' + esc(prefix) + '/client/theme.html">' + esc(s.themePrompt) + '</a>'
    : ''

  return head(seed.product || 'Mocks', prefix) +
    '<body class="wk wk-index" data-prefix="' + esc(prefix) + '">' +
    '<main class="wk-index-main">' +
    '<h1 class="wk-title">' + esc(seed.product || 'Mocks') + '</h1>' +
    '<p class="wk-lead">' + esc(s.indexLead) + '</p>' +
    themeLink +
    '<nav class="wk-list">' + rows + '</nav>' +
    renderAskForm(s) +
    renderRequestsSection(notes, journeysList, prefix, s) +
    // D4: the shared receipt slot — every ask/accept/reopen save reports through it.
    '<p class="wk-msg" data-wk="msg" role="status" aria-live="polite" data-saved="' + esc(s.msgSaved) +
    '" data-failed="' + esc(s.msgFailed) + '" data-why="' + esc(s.msgWhyIndex) + '" hidden></p>' +
    '</main>' +
    '<script src="' + esc(prefix) + '/__walk/player.js"></script>' +
    '</body></html>\n'
}

// ---------------------------------------------------------------------------
// specs/20260910/04-theme-before-the-client-walk.md D5: the theme compare page —
// GET /client/theme.html renders the open or decided theme-picked stop as a table of dense
// screens (rows) × directions (columns), each cell a live frame of the mock served with
// ?theme=<kebab>. A [data-th="pick"][data-group] button per column posts the decision through
// POST /client/__picks/decide (design-atlas.js forces `by` to "client" and refuses any key but
// theme-picked); the picked column is marked once decided. With no such stop the page renders
// only the "nothing to pick yet" string and no pick button at all.
// ---------------------------------------------------------------------------
// The page's own inline decide script — a small, single-purpose sibling of lib/stop-block.js's
// PICKS_SCRIPT (never reused directly: this page posts through the CLIENT mount, which forces
// `by` server-side, so there is no author-identity prompt here at all — D3's client pages never
// ask who is answering).
function themeDecideScript(prefix) {
  return '<script>(function(){\n' +
    'function post(id,extra){\n' +
    "  var body=Object.assign({id:id,verdict:'pick'},extra||{})\n" +
    "  return fetch('" + esc(prefix) + "/client/__picks/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})\n" +
    '    .then(function(r){return r.json().then(function(j){return {status:r.status,body:j}})})\n' +
    '}\n' +
    "document.addEventListener('click',function(e){\n" +
    "  var btn=e.target.closest && e.target.closest('[data-th=\"pick\"]')\n" +
    '  if(!btn) return\n' +
    "  var id=document.body.getAttribute('data-stop-id')\n" +
    '  if(!id) return\n' +
    "  post(id,{pick:btn.getAttribute('data-group')}).then(function(res){\n" +
    '    if(res.status===200) location.reload()\n' +
    '  })\n' +
    '})\n' +
    '})()</script>'
}

function buildThemePage(input) {
  const o = input || {}
  const stop = o.stop || null
  const seed = o.seed || { product: '' }
  const prefix = o.prefix || ''
  const s = STRINGS
  const candidates = (stop && Array.isArray(stop.candidates)) ? stop.candidates : []

  const groups = []
  const labels = []
  for (const c of candidates) {
    if (!groups.includes(c.group)) groups.push(c.group)
    if (!labels.includes(c.label)) labels.push(c.label)
  }
  const decided = !!(stop && stop.status === 'decided' && stop.decision)
  const pickedGroup = decided ? stop.decision.pick : null

  let body
  if (!candidates.length) {
    body = '<p class="th-empty">' + esc(s.themeNone) + '</p>'
  } else {
    const heads = groups.map((g) => {
      const isPicked = decided && g === pickedGroup
      return '<div class="th-head' + (isPicked ? ' th-picked' : '') + '" data-group="' + esc(g) + '">' +
        '<span class="th-name">' + esc(g) + '</span>' +
        '<button data-th="pick" data-group="' + esc(g) + '"' + (isPicked ? ' disabled' : '') + '>' +
        esc(isPicked ? s.themePicked : s.themePick) + '</button></div>'
    }).join('')
    const rows = labels.map((label) => {
      const cells = groups.map((g) => {
        const cand = candidates.find((c) => c.group === g && c.label === label)
        if (!cand) return '<div class="th-cell th-cell-empty"></div>'
        // D5's own Contracts example spells the src unescaped ("?clean&theme=<k>") — esc() only
        // the base path (label/prefix are the one untrusted-ish part); the query string is built
        // from already-validated kebabs/labels, so it is appended raw, matching frameTag's own
        // "escape the path, not the trailing query" convention above.
        const src = esc(prefix + '/mocks/' + encodeURIComponent(label) + '.html') + '?clean&theme=' + encodeURIComponent(g)
        return '<div class="th-cell" data-group="' + esc(g) + '" data-label="' + esc(label) + '">' +
          '<iframe class="th-frame" title="' + esc(label) + '" src="' + src + '"></iframe></div>'
      }).join('')
      return '<div class="th-row"><div class="th-row-label">' + esc(label) + '</div>' + cells + '</div>'
    }).join('')
    // id="stop-<id>" matches every other stop renderer's own convention (design-atlas.js's
    // renderCompareTable/renderApproveStop) — `stop open`'s own probe (cmdStopOpen) confirms a
    // freshly opened stop actually rendered by grepping the served body for this exact literal.
    body = '<div class="th-cmp" id="stop-' + esc(stop.id) + '" style="--cols:' + groups.length + '">' + heads + rows + '</div>'
  }

  return head((seed.product || 'Mocks') + ' · theme', prefix) +
    '<body class="wk th-page" data-prefix="' + esc(prefix) + '" data-stop-id="' + esc(stop ? stop.id : '') + '">' +
    '<main class="th-main">' +
    '<h1 class="wk-title">' + esc(s.themePrompt) + '</h1>' +
    body +
    '</main>' +
    (candidates.length ? themeDecideScript(prefix) : '') +
    '</body></html>\n'
}

// ---------------------------------------------------------------------------
// D1: the player shell. The frame is the hero and carries no src — walk.browser.js sets it from
// the server's own record, which is what makes the walk survive a reload. The spine on the left
// is the walk itself: reached screens read solid, the rest outline-only.
// ---------------------------------------------------------------------------
function renderSpine(screens, reached) {
  return screens.map((sc) => {
    const seen = reached.includes(sc.label)
    return '<button class="wk-step' + (seen ? ' wk-seen' : '') + '" data-wk="thumb" data-label="' + esc(sc.label) + '"' +
      ' data-states="' + esc((sc.states || []).join(',')) + '">' + esc(sc.label) + '</button>'
  }).join('')
}

function renderMark(note, ledger, s) {
  return '<article class="wk-mark" data-wk="mark" data-id="' + esc(note.id) + '" data-label="' + esc(note.screen) + '" hidden>' +
    '<p class="wk-claim">' + esc(claimOf(note, ledger)) + '</p>' +
    '<div class="wk-verdicts">' +
    '<button class="wk-v" data-wk="yes">' + esc(s.yes) + '</button>' +
    '<button class="wk-v" data-wk="no">' + esc(s.no) + '</button>' +
    '</div>' +
    '<textarea class="wk-why" data-wk="why" rows="2" placeholder="' + esc(s.why) + '"></textarea>' +
    '</article>'
}

// specs/20260910/05-what-the-journey-does-not-do.md D5: the exclusion rows this journey shows —
// every project-wide one (an unanchored `non-goal:` row) plus every one anchored (via its own D1
// `note` grammar, `answer: <noteId>` / `withdrawn: <noteId>`) to a screen THIS journey declares.
// Anchoring is derived from the already-threaded `ledger`/`notes` params — never a new param
// (the build's own deviations note).
function exclusionsForJourney(journey, ledger, notes, journeys) {
  const entry = journeys.find((j) => j.name === journey)
  const labels = new Set(screensOf(entry).map((sc) => sc.label))
  const noteById = new Map((notes || []).map((n) => [n.id, n]))
  const rows = (ledger || []).filter((r) => r.kind === 'exclusion')
  const out = []
  for (const row of rows) {
    const m = /^(?:answer|withdrawn): (\S+)/.exec(row.note || '')
    if (!m) { out.push(row); continue } // non-goal: project-wide, shows on every journey
    const note = noteById.get(m[1])
    if (note && note.screen && labels.has(note.screen)) out.push(row)
  }
  return out
}

function renderExclusion(row, s) {
  const open = row.status === 'open'
  return '<article class="wk-excl" data-wk="exclusion" data-id="' + esc(row.id) + '">' +
    '<p class="wk-excl-claim">' + esc(row.claim) + '</p>' +
    (open ? '<button class="wk-excl-agree" data-wk="agree">' + esc(s.exclAgree) + '</button>' : '') +
    '</article>'
}

// Returns { html, openCount } — openCount feeds renderApprove's own disabled-until-zero gate
// alongside the pre-existing mark count.
function renderExclusions(journey, ledger, notes, journeys, s) {
  const rows = exclusionsForJourney(journey, ledger, notes, journeys)
  const openCount = rows.filter((r) => r.status === 'open').length
  const articles = rows.map((r) => renderExclusion(r, s)).join('')
  const html = '<section class="wk-exclusions" data-wk="exclusions" data-exclusions-open="' + openCount + '" hidden>' +
    articles + '</section>'
  return { html, openCount }
}

// specs/20260911/04-the-client-loop.md D5/D14: the read-only confirmed render is used only when
// `confirmedAt` is set AND the derived state is "ok" — an OPEN request outranks a stale
// `confirmedAt` by construction (D1), so this is never a second, unconditional check on
// `confirmedAt` alone (D14 retires that unconditional render). The approve lead reads by state
// (`fixed`/`changes-requested` get their own sentence, everything else the original prompt), and
// confirm stays disabled while the state is `changes-requested`/`fixed`, in addition to the
// existing marks/exclusions open count.
function renderApprove(rec, openCount, s, state) {
  if (rec && rec.confirmedAt && state === 'ok') {
    return '<section class="wk-approve" data-wk="approve">' +
      '<p class="wk-lead">' + esc(s.confirmedLead) + '</p>' +
      '<blockquote class="wk-sentence">' + esc(rec.sentence || '') + '</blockquote>' +
      '</section>'
  }
  const lead = state === 'fixed' ? s.fixedLead : state === 'changes-requested' ? s.changesLead : s.approveLead
  const disabled = openCount > 0 || state === 'changes-requested' || state === 'fixed'
  return '<section class="wk-approve" data-wk="approve" hidden>' +
    '<p class="wk-lead">' + esc(lead) + '</p>' +
    '<textarea class="wk-sentence-in" data-wk="sentence" rows="2" placeholder="' + esc(s.sentence) + '"></textarea>' +
    '<button class="wk-confirm" data-wk="confirm"' + (disabled ? ' disabled' : '') + '>' + esc(s.confirm) + '</button>' +
    '</section>'
}

function buildWalkPage(input) {
  const o = input || {}
  const journey = o.journey
  const seed = o.seed || { product: '', journeys: [] }
  const prefix = o.prefix || ''
  const s = STRINGS
  if (!journey) throw new Error('buildWalkPage needs {journey}')
  const journeys = journeysOf(seed)
  const entry = journeys.find((j) => j.name === journey)
  if (!entry) throw new Error('unknown journey ' + journey + ' — declared: ' + journeys.map((j) => j.name).join(', '))

  const screens = screensOf(entry)
  const labels = new Set(screens.map((sc) => sc.label))
  const rec = recordOf(o.walk, journey)
  const reached = (rec && Array.isArray(rec.reached)) ? rec.reached : []
  const ledger = o.ledger || []
  const notes = o.notes || []
  const open = notes.filter((n) => isOpenQuestion(n) && n.scope === 'mock' && labels.has(n.screen))
  const state = walkLib.journeyState(rec, notes, labels)
  const requestNotes = journeyRequestsOn(notes, labels)

  const marks = open.map((n) => renderMark(n, ledger, s)).join('')
  // D6: the note form's own free-text save appends a request article for the current screen — one
  // hidden, unattached template article (same activation-not-fabrication discipline as the index's
  // own template, above) walk.browser.js labels/reveals rather than the script ever building a new
  // DOM node from scratch.
  const requestsHtml = '<article class="wk-req" data-wk-template hidden></article>' +
    requestNotes.map((n) => renderWalkRequest(n, s)).join('')
  const excl = renderExclusions(journey, ledger, notes, journeys, s)
  const title = (entry.title || journey) + ' · ' + (seed.product || 'Mocks')

  return head(title, prefix) +
    '<body class="wk wk-walk" data-journey="' + esc(journey) + '" data-prefix="' + esc(prefix) + '"' +
    (o.theme ? ' data-theme="' + esc(o.theme) + '"' : '') + '>' +
    '<header class="wk-bar">' +
    '<span class="wk-crumb"><strong>' + esc(entry.title || journey) + '</strong></span>' +
    '<span class="wk-pos" data-wk="pos"></span>' +
    '<span class="wk-nav">' +
    '<button class="wk-arrow" data-wk="back">' + esc(s.back) + '</button>' +
    '<button class="wk-arrow" data-wk="next">' + esc(s.next) + '</button>' +
    '</span></header>' +
    '<div class="wk-main">' +
    '<nav class="wk-spine" data-wk="rail">' + renderSpine(screens, reached) + '</nav>' +
    '<main class="wk-stage">' +
    '<iframe class="wk-frame" data-wk="frame" title="' + esc(entry.title || journey) + '"></iframe>' +
    '<div class="wk-states" data-wk="states"></div>' +
    '</main>' +
    '<aside class="wk-side">' +
    '<div class="wk-marks">' + marks + '</div>' +
    '<p class="wk-left"><span data-wk="left" data-count="' + open.length + '">' +
    esc(count(s, 'leftNone', 'leftOne', 'leftMany', open.length)) + '</span></p>' +
    '<section class="wk-reqs" data-wk="requests">' + requestsHtml + '</section>' +
    '<form class="wk-note" data-wk="note">' +
    '<label class="wk-note-label">' + esc(s.noteLabel) +
    '<textarea class="wk-note-in" name="text" rows="2"></textarea></label>' +
    '<button class="wk-send" type="submit">' + esc(s.noteSend) + '</button>' +
    '</form>' +
    excl.html +
    renderApprove(rec, open.length + excl.openCount, s, state) +
    // D3/D5: one hidden, empty status slot — walk.browser.js sets its text from its own data-why/
    // data-failed/data-saved attribute and unhides it; the builder never renders text into it.
    '<p class="wk-msg" data-wk="msg" role="status" aria-live="polite" data-saved="' + esc(s.msgSaved) +
    '" data-why="' + esc(s.msgWhy) + '" data-failed="' + esc(s.msgFailed) + '" hidden></p>' +
    '</aside>' +
    '</div>' +
    '<script src="' + esc(prefix) + '/__walk/player.js"></script>' +
    '</body></html>\n'
}

module.exports = { buildClientIndex, buildWalkPage, buildThemePage, STRINGS }
