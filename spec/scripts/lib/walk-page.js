'use strict'
// lib/walk-page.js — the two pure builders of the client's own pages, served by design-atlas.js
// at GET /client/index.html and GET /client/walk/<j>.html.
// specs/20260910/03-client-journey-player.md D1 (both builders and their markup contract), D3
// (the hooks walk.browser.js drives); specs/20260911/01-the-page-waits-for-the-server.md D1
// (supersedes spec 03 D2: `STRINGS`/`stringsFor`/the `lang` param are retired — the player's own
// chrome is English-only), D3 (the `[data-wk="msg"]` status slot); specs/20260911/04-the-client-
// loop.md D4-D6/D16/D17 (the return-leg controls) and D18-D22 (the design/client-mocks/*.html
// approved visual redesign this file now renders: bounded journey cards on the index, a step
// indicator + framed stage on the walk page — the mock files are the binding reference for every
// class name and layout choice below, never a second design authored from these Decisions' prose
// alone), D23 (the design seat's own post-render findings: the journey card is a container, not
// a link; screen labels are humanised for display while `data-label` keeps the raw label; the
// thumbnail precedes its caption).
//
//   buildClientIndex({ seed, notes, ledger, walk, prefix, themeOpen, ready }) → html
//     seed    { product, journeys: [{ name, title, screens: [{ label, states }] }] } in seed
//             order — design-atlas.js's seedForReview builds it
//     notes   notes.json array, raw — joined onto `ledger` exactly as review-page.js joins it
//     ledger  parseLedger(...).assumptions
//     walk    design/mocks/walk.json, raw ({ journeys: { <j>: { reached, misses, confirmedAt,
//             sentence, waived } } }) — lib/mocks-walk.js is its only writer
//     prefix  the served mount ('' or '/p/<name>')
//     ready   Set of journey names whose declared screens all exist on disk (D15) — an unready
//             journey renders no row of any kind
//
//   buildWalkPage({ seed, journey, notes, ledger, walk, prefix, theme }) → html
//     journey the journey's kebab name; an unknown one throws naming every declared journey
//             (design-atlas.js turns that throw into the route's 404)
//     theme   the adopted theme kebab, threaded into the frame URL by walk.browser.js
//
// Byte-deterministic for equal inputs: no fs, no clock, no randomness, no environment read. The
// page ships no dynamic state of its own — every moving part (the frame's src, which marks show,
// the current step/caption, whether the nav button reads Next or Confirm) is set by
// lib/walk.browser.js from the server's own walk record, so a reload can never skip the walk.
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
  // specs/20260911/06-the-client-loop.md D4: the journey row's derived-state text.
  notStarted: 'Not started',
  inProgress: 'In progress',
  changesRequested: 'Changes requested ({n})',
  fixedCheck: 'Fixed — please check ({n})',
  okText: 'Confirmed',
  skipped: 'Skipped',
  // D4: the index's own composer and request list.
  askHeading: 'Something missing?',
  askInvite: 'Tell us about a screen you expected, or anything else.',
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
  reqWithdraw: 'Never mind',
  msgWhyIndex: 'Please say what is missing first.',
  msgSaved: "Saved. We'll fix this and let you know here.",
  // D17: `on {label}` for a mock-scope request, `across the whole product` for a project-scope
  // one — the index's own request location line.
  reqWhereScreen: 'on {label}',
  reqWhereProject: 'across the whole product',
  // D20: the collapsed request log's own waiting count and the closed-items toggle.
  waitingCount: '{n} waiting',
  showClosed: 'Show {n} closed',
  // D19: the index card's own action verb per state, and the confirmed-count header.
  goStart: 'Start',
  goContinue: 'Continue',
  goCheckFix: 'Check the fix',
  goOpenAgain: 'Open again',
  goWalkAgain: 'Walk it again',
  goSkipped: 'Skipped',
  confirmedWord: 'confirmed',
  // D5: the walk page's own request cards and derived approve lead. D17: `Looks good` is
  // byte-identical to the index's own reqAcceptIndex — kept as a separate key only because the
  // two surfaces render from separate functions, never a separate word.
  reqFixedPrefix: 'Fixed: ',
  reqAcceptWalk: 'Looks good',
  reqReopenWalk: 'Still not right',
  fixedLead: 'We fixed what you asked. Check the screens marked Fixed, then confirm.',
  changesLead: "You asked for changes. We'll fix them and let you know.",
  // FIX 1 (review): design/client-mocks/index.html:219's "+n more" tile is a real link to the
  // walk page, named by an aria-label listing the hidden screens — restated here so the code
  // matches the binding mock instead of rendering an inert, unlabeled span.
  moreScreens: '{n} more screens: {list}',
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

// specs/20260911/06-the-client-loop.md D23: a raw kebab screen label is never a client-facing
// word — every DISPLAY occurrence (thumbnail title/caption, step label, card description) reads
// its first word capitalized and its hyphens turned to spaces; `data-label` keeps the raw label
// everywhere else, since tests and behavior key off it.
function humanizeLabel(label) {
  const s = String(label || '').replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function journeysOf(seed) { return Array.isArray(seed && seed.journeys) ? seed.journeys : [] }
function screensOf(entry) {
  return ((entry && entry.screens) || []).map((s) => (typeof s === 'string' ? { label: s, states: [] } : s))
}
function recordOf(walk, journey) {
  const js = (walk && walk.journeys) || {}
  return js[journey] || null
}

// specs/20260911/06-the-client-loop.md D1/D4/D5: the client-origin, non-question requests a
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

// D19: the index card's one action, its verb and its "filled" (primary) treatment keyed by the
// derived journeyState — filled only when it is the client's turn (unseen/walking/fixed).
function goFor(state, s) {
  if (state === 'unseen') return { text: s.goStart, primary: true }
  if (state === 'walking') return { text: s.goContinue, primary: true }
  if (state === 'fixed') return { text: s.goCheckFix, primary: true }
  if (state === 'changes-requested') return { text: s.goOpenAgain, primary: false }
  if (state === 'ok') return { text: s.goWalkAgain, primary: false }
  return { text: s.goSkipped, primary: false } // waived: not named by any AC, kept inert
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

// D4/D20: one request article for the client index — text, screen (mock-scope only), status
// line, and (addressed only) the "See <journey>" link plus the accept/reopen pair. `closed`
// (D20) marks a resolved article `hidden`/`data-closed` behind the "Show N closed" toggle.
function renderIndexRequest(n, journeysList, prefix, s, closed) {
  const status = n.status
  let statusLine
  let extra = ''
  if (status === 'open') {
    statusLine = s.reqWatching
    // D16: the client can take back an open request — posts /client/__notes/resolve through the
    // mechanism withdrawNote/resolveNote already ship.
    extra = '<div class="wk-req-acts">' +
      '<button class="wk-req-act" type="button" data-cl="withdraw">' + esc(s.reqWithdraw) + '</button>' +
      '</div>'
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
      '<textarea class="wk-req-why" data-cl="reopen-text" hidden></textarea>' +
      '</div>'
  }
  // D17: every request article renders its location — `on <screen label>` for a mock-scope
  // note, `across the whole product` for a project-scope one — so the same request read here
  // and on the walk page is recognisably one request.
  const where = n.scope === 'mock' ? s.reqWhereScreen.replace('{label}', n.screen) : s.reqWhereProject
  return '<article class="wk-req" data-cl="request" data-id="' + esc(n.id) + '" data-status="' + esc(status) + '"' +
    (closed ? ' data-closed hidden' : '') + '>' +
    '<p class="wk-req-text">' + esc(n.text) + '</p>' +
    '<span class="wk-req-where">' + esc(where) + '</span>' +
    '<p class="wk-req-status">' + esc(statusLine) + '</p>' +
    extra +
    '</article>'
}

// D20: "Something missing?" collapses to one summary line (`<details data-cl="ask">`) that
// expands to the textarea/chips/Send — `other` defaults `aria-pressed="true"` (walk.browser.js
// toggles the pressed chip on click) so a Send with no chip touched still posts `reason: "other"`
// (D6). The inner `<form>` carries no `data-cl` of its own — walk.browser.js finds it as the
// `<details>`'s own descendant form.
function renderAskForm(s) {
  return '<details class="wk-ask" data-cl="ask">' +
    '<summary class="wk-ask-summary"><span class="wk-ask-plus" aria-hidden="true">+</span>' +
    '<span><b>' + esc(s.askHeading) + '</b> ' + esc(s.askInvite) + '</span></summary>' +
    '<form class="wk-ask-form">' +
    '<textarea class="wk-ask-in"></textarea>' +
    '<div class="wk-ask-chips">' +
    '<button type="button" class="wk-ask-chip" data-cl="reason" data-value="missing-screen">' + esc(s.askMissingScreen) + '</button>' +
    '<button type="button" class="wk-ask-chip" data-cl="reason" data-value="other" aria-pressed="true">' + esc(s.askOther) + '</button>' +
    '</div>' +
    '<button type="submit">' + esc(s.askSend) + '</button>' +
    '</form>' +
    '</details>'
}

// FIX 2 (review): the ask form's own template was a genuinely empty `<article>` — activating it
// (walk.browser.js's submitAsk) could only ever stamp attributes, never the row's own text,
// location, status line or withdraw control, so a client who just pressed Send saw an empty amber
// stripe. A freshly-added request is always `scope: 'project'` (D6's ask form hardcodes it) and
// always `open` (D6), so the template carries that one shape's full markup — byte-identical to
// `renderIndexRequest`'s own `open` branch minus the id/text, which walk.browser.js fills in from
// what it already has (the id from the server's response, the text from the textarea it is about
// to clear) rather than re-deriving them.
function renderIndexRequestTemplate(s) {
  return '<article class="wk-req" data-cl-template hidden>' +
    '<p class="wk-req-text"></p>' +
    '<span class="wk-req-where">' + esc(s.reqWhereProject) + '</span>' +
    '<p class="wk-req-status">' + esc(s.reqWatching) + '</p>' +
    '<div class="wk-req-acts">' +
    '<button class="wk-req-act" type="button" data-cl="withdraw">' + esc(s.reqWithdraw) + '</button>' +
    '</div>' +
    '</article>'
}

// D20: the request list itself — open/addressed articles first (visible), then resolved ones
// (hidden, behind `[data-cl="show-closed"]`) — plus a hidden, unattached template article
// walk.browser.js activates (by ADDING `data-cl="request"` and the id/status attributes) when the
// ask form's own POST lands. The `<n> waiting` count is open+addressed only.
function renderRequestsSection(notes, journeysList, prefix, s) {
  const all = clientRequestNotes(notes)
  const openOrAddressed = all.filter((n) => n.status !== 'resolved')
  const closed = all.filter((n) => n.status === 'resolved')
  const openArticles = openOrAddressed.map((n) => renderIndexRequest(n, journeysList, prefix, s, false)).join('')
  const closedArticles = closed.map((n) => renderIndexRequest(n, journeysList, prefix, s, true)).join('')
  const toggle = closed.length
    ? '<button type="button" class="wk-reqs-toggle" data-cl="show-closed" aria-expanded="false">' +
      esc(s.showClosed.replace('{n}', String(closed.length))) + '</button>'
    : ''
  return '<section class="wk-reqs" data-cl="requests">' +
    '<div class="wk-reqs-h"><h2 class="wk-reqs-title">' + esc(s.requestsHeading) + '</h2>' +
    '<span class="wk-reqs-n">' + esc(s.waitingCount.replace('{n}', String(openOrAddressed.length))) + '</span>' +
    toggle + '</div>' +
    renderIndexRequestTemplate(s) + openArticles + closedArticles +
    '</section>'
}

// D5/D20: one request card per client-origin, non-question, mock-scope note on the journey that
// is not `resolved` — a resolved request is never rendered on the walk page at all (D20; the
// index's own log is where a closed request is still visible, hidden behind its toggle). Every
// label renders — walk.browser.js hides all but the current screen's. The addressed line reads
// "Fixed: <change>" (not "Done:" — the walk page is where the fix is being CHECKED, the index is
// where it is being REPORTED).
function renderWalkRequest(n, s) {
  const status = n.status
  let statusLine
  let extra = ''
  if (status === 'open') {
    statusLine = s.reqWatching
    // D16: the same take-back control as the index, keyed data-wk on this surface.
    extra = '<div class="wk-req-acts">' +
      '<button class="wk-req-act" type="button" data-wk="withdraw">' + esc(s.reqWithdraw) + '</button>' +
      '</div>'
  } else {
    const change = (n.addressed && n.addressed.change) || ''
    statusLine = s.reqFixedPrefix + change
    extra = '<div class="wk-req-acts">' +
      '<button class="wk-req-act" type="button" data-wk="accept">' + esc(s.reqAcceptWalk) + '</button>' +
      '<button class="wk-req-act" type="button" data-wk="reopen">' + esc(s.reqReopenWalk) + '</button>' +
      '<textarea class="wk-req-why" data-wk="reopen-text" hidden></textarea>' +
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
// D19: one journey card — a fixed four-slot thumbnail rail, then the text column (title,
// description-or-confirmed-sentence, state), then one action. Slots are always exactly four:
// fewer than four screens leave the trailing ones empty; more than four render the first three
// plus a "+<n> more" tile in the fourth.
// ---------------------------------------------------------------------------
// D23: the thumbnail precedes its caption in document order (the `column-reverse` CSS
// workaround is retired) — reading order follows the eye. `data-label` on the `<li>` itself
// keeps the raw label as the slot's own first, short, self-contained occurrence, so a slot
// carrying no dot never reads as bordering the next slot's own dot/current attributes to a
// caller scanning a fixed text window around the label (tests/mocks/walk-page.test.js's AC-19
// `windowAround` helper). Both the iframe's own title and the caption text are humanised for
// display (D23); `data-label` is the one place the raw label survives on this slot.
function renderThumbSlot(sc, statusByLabel, currentLabel, prefix) {
  const dotStatus = statusByLabel[sc.label]
  const dotAttr = dotStatus ? ' data-dot="' + (dotStatus === 'open' ? 'warn' : 'ok') + '"' : ''
  const currentAttr = currentLabel === sc.label ? ' data-current="true"' : ''
  const src = esc(prefix + '/mocks/' + encodeURIComponent(sc.label) + '.html') + '?clean'
  const display = humanizeLabel(sc.label)
  return '<li class="wk-slot" data-cl="slot" data-label="' + esc(sc.label) + '">' +
    '<div class="wk-thumb" data-cl="thumb"' + dotAttr + currentAttr + '>' +
    '<iframe class="wk-thumb-frame" src="' + src + '" loading="lazy" tabindex="-1" title="' + esc(display) + '"></iframe>' +
    '</div>' +
    '<p class="wk-thumb-cap">' + esc(display) + '</p>' +
    '</li>'
}

// FIX 1 (review): the mock (design/client-mocks/index.html:219) renders the "+n more" tile as a
// real anchor to the walk page, `aria-label`ed with the count and the hidden screens' names — the
// prior render had no `href`, so the tile was inert and unreachable by keyboard. `href` is the
// same walk-page link every other card control uses; the label names the screens `renderCardSlots`
// itself is not showing (index 3 onward).
function renderCardSlots(screens, statusByLabel, currentLabel, prefix, href, s) {
  const n = screens.length
  const out = []
  if (n <= 4) {
    for (let i = 0; i < 4; i++) {
      out.push(i < n ? renderThumbSlot(screens[i], statusByLabel, currentLabel, prefix) : '<li class="wk-slot" data-cl="slot"></li>')
    }
  } else {
    for (let i = 0; i < 3; i++) out.push(renderThumbSlot(screens[i], statusByLabel, currentLabel, prefix))
    const hidden = screens.slice(3)
    const label = s.moreScreens.replace('{n}', String(n - 3)).replace('{list}', hidden.map((sc) => humanizeLabel(sc.label)).join(', '))
    out.push('<li class="wk-slot" data-cl="slot"><a class="wk-thumb wk-more" data-cl="more" href="' + href + '" aria-label="' + esc(label) + '">+' + (n - 3) + ' more</a></li>')
  }
  return out.join('')
}

// Returns { html, confirmed } — `confirmed` feeds buildClientIndex's own header count.
function renderJourneyCard(entry, notes, walk, prefix, s) {
  const screens = screensOf(entry)
  const labels = screens.map((sc) => sc.label)
  const labelSet = new Set(labels)
  // CONTINUE-TO (specs/20260911/01-the-page-waits-for-the-server.md): `data-guesses` is the
  // open-QUESTION count (a session's own unanswered guess), unrelated to the client-request
  // states below — kept byte-identical so the predecessor spec's own pin never regresses.
  const openGuesses = notes.filter((n) => isOpenQuestion(n) && n.scope === 'mock' && labelSet.has(n.screen)).length
  const rec = recordOf(walk, entry.name)
  const state = walkLib.journeyState(rec, notes, labels)
  const reqs = journeyRequestsOn(notes, labels)
  const openReq = reqs.filter((n) => n.status === 'open').length
  const addressedReq = reqs.filter((n) => n.status === 'addressed').length
  const stateText = journeyStateText(state, openReq, addressedReq, s)
  const statusByLabel = {}
  for (const n of reqs) {
    if (n.status === 'open') statusByLabel[n.screen] = 'open'
    else if (n.status === 'addressed' && statusByLabel[n.screen] !== 'open') statusByLabel[n.screen] = 'addressed'
  }
  const currentLabel = (rec && Array.isArray(rec.reached) && rec.reached.length) ? rec.reached[rec.reached.length - 1] : null
  const confirmed = state === 'ok'
  const go = goFor(state, s)
  const href = esc(prefix) + '/client/walk/' + esc(entry.name) + '.html'
  const slots = renderCardSlots(screens, statusByLabel, currentLabel, prefix, href, s)
  const descOrSaid = confirmed
    ? '<blockquote class="wk-j-said" data-cl="said">' + esc((rec && rec.sentence) || '') + '</blockquote>'
    : '<p class="wk-j-desc" data-cl="desc">' + esc(labels.map(humanizeLabel).join(', ')) + '</p>'
  // D23: the card is a container, not a link — `<li data-cl="journey">` never wraps an `<a>` of
  // its own. The title and the go action are separate links to the same walk page (nesting the
  // `+n more` tile's own `<a>` inside a card-wide `<a>` was invalid HTML and shattered the card
  // in every browser).
  const html = '<li class="wk-journey" data-cl="journey"' +
    ' data-guesses="' + openGuesses + '" data-confirmed="' + (confirmed ? 'true' : 'false') + '"' +
    ' data-state="' + esc(state) + '">' +
    '<ul class="wk-slots">' + slots + '</ul>' +
    '<div class="wk-j-text">' +
    '<h2 class="wk-j-title" data-cl="title"><a href="' + href + '">' + esc(entry.title || entry.name) + '</a></h2>' +
    descOrSaid +
    '<p class="wk-j-state" data-cl="state">' + esc(stateText) + '</p>' +
    '</div>' +
    '<a class="wk-j-cta' + (go.primary ? ' wk-j-cta-primary' : '') + '" data-cl="go" data-primary="' + (go.primary ? 'true' : 'false') + '" href="' + href + '">' +
    esc(go.text) + '</a>' +
    '</li>'
  return { html, confirmed }
}

// ---------------------------------------------------------------------------
// D1/D19: the index — every ready journey as one bounded card, the client's inbox below it.
// ---------------------------------------------------------------------------
function buildClientIndex(input) {
  const o = input || {}
  const seed = o.seed || { product: '', journeys: [] }
  const prefix = o.prefix || ''
  const s = STRINGS
  const notes = o.notes || []
  const ready = o.ready instanceof Set ? o.ready : new Set()
  const journeysList = journeysOf(seed)
  // specs/20260911/06-the-client-loop.md D15: a journey is listed when its page exists, never
  // when a session flag says so — an unready journey is absent from the list entirely, never a
  // "Coming soon" row the client cannot click.
  const readyList = journeysList.filter((entry) => ready.has(entry.name))
  let confirmedCount = 0
  const cardsHtml = readyList.map((entry) => {
    const card = renderJourneyCard(entry, notes, o.walk, prefix, s)
    if (card.confirmed) confirmedCount++
    return card.html
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
    '<header class="wk-index-head">' +
    '<div><h1 class="wk-title">' + esc(seed.product || 'Mocks') + '</h1>' +
    '<p class="wk-lead">' + esc(s.indexLead) + '</p></div>' +
    '<p class="wk-progress" data-cl="confirmed-count">' + confirmedCount + ' of ' + readyList.length + ' ' + esc(s.confirmedWord) + '</p>' +
    '</header>' +
    themeLink +
    '<ul class="wk-journeys">' + cardsHtml + '</ul>' +
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
// D21: the player shell — a horizontal step indicator in the top bar (reached solid, current
// ringed, unreached outline) and a bounded stage taking the full remaining width. The nav
// button is one element that reads `Next` while the current screen is not the journey's last
// declared one and `Confirm this journey` (`[data-wk="confirm"]`) when it is — walk.browser.js
// flips its `data-wk` attribute value as the client navigates; a journey with only one screen
// is trivially always on its last screen, so it is server-rendered as `confirm` from the start.
// ---------------------------------------------------------------------------
function renderSteps(screens, reached, currentLabel) {
  return screens.map((sc) => {
    const seen = reached.includes(sc.label)
    const current = sc.label === currentLabel
    return '<li><button type="button" class="wk-step' + (seen ? ' wk-seen' : '') + '" data-wk="step"' +
      ' data-label="' + esc(sc.label) + '" data-reached="' + (seen ? 'true' : 'false') + '" data-current="' + (current ? 'true' : 'false') + '"' +
      ' data-states="' + esc((sc.states || []).join(',')) + '">' + esc(humanizeLabel(sc.label)) + '</button></li>'
  }).join('')
}

function renderMark(note, ledger, s) {
  return '<article class="wk-mark" data-wk="mark" data-id="' + esc(note.id) + '" data-label="' + esc(note.screen) + '" hidden>' +
    '<p class="wk-claim">' + esc(claimOf(note, ledger)) + '</p>' +
    '<div class="wk-verdicts">' +
    '<button class="wk-v" data-wk="yes">' + esc(s.yes) + '</button>' +
    '<button class="wk-v" data-wk="no">' + esc(s.no) + '</button>' +
    '</div>' +
    '<textarea class="wk-why" data-wk="why" rows="2" placeholder="' + esc(s.why) + '" hidden></textarea>' +
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

// Returns { html, openCount } — openCount feeds the nav button's own disabled-until-zero gate
// alongside the pre-existing mark count.
function renderExclusions(journey, ledger, notes, journeys, s) {
  const rows = exclusionsForJourney(journey, ledger, notes, journeys)
  const openCount = rows.filter((r) => r.status === 'open').length
  const articles = rows.map((r) => renderExclusion(r, s)).join('')
  const html = '<section class="wk-exclusions" data-wk="exclusions" data-exclusions-open="' + openCount + '" hidden>' +
    articles + '</section>'
  return { html, openCount }
}

// D21: the sign-off block — lead text plus the sentence textarea, rendered inside the stage
// above the framed screen. The confirm control itself lives in the bar (renderNavButton) so
// there is exactly one `[data-wk="confirm"]` element on the page. D5/D14: the read-only
// confirmed render is used only when `confirmedAt` is set AND the derived state is "ok" — an
// OPEN request outranks a stale `confirmedAt` by construction (D1).
function renderSignoff(rec, s, state) {
  if (rec && rec.confirmedAt && state === 'ok') {
    return '<section class="wk-signoff" data-wk="signoff">' +
      '<p class="wk-lead">' + esc(s.confirmedLead) + '</p>' +
      '<blockquote class="wk-sentence">' + esc(rec.sentence || '') + '</blockquote>' +
      '</section>'
  }
  const lead = state === 'fixed' ? s.fixedLead : state === 'changes-requested' ? s.changesLead : s.approveLead
  return '<section class="wk-signoff" data-wk="signoff" hidden>' +
    '<p class="wk-lead">' + esc(lead) + '</p>' +
    '<textarea class="wk-sentence-in" data-wk="sentence" rows="2" placeholder="' + esc(s.sentence) + '"></textarea>' +
    '</section>'
}

// D21: the bar's own nav button — `Next` while the current screen is not the journey's last
// declared one, `[data-wk="confirm"]` reading `Confirm this journey` once it is; its disabled
// rule is unchanged (D5's state gate: any open mark/exclusion, or a `changes-requested`/`fixed`
// journeyState). A confirmed ("ok") journey needs no action at all.
function renderNavButton(rec, state, openCount, s, isLast) {
  if (rec && rec.confirmedAt && state === 'ok') return ''
  const nextLabel = esc(s.next)
  const confirmLabel = esc(s.confirm)
  if (!isLast) {
    return '<button type="button" class="wk-arrow" data-wk-role="nav" data-wk="next"' +
      ' data-next-label="' + nextLabel + '" data-confirm-label="' + confirmLabel + '">' + nextLabel + '</button>'
  }
  const disabled = openCount > 0 || state === 'changes-requested' || state === 'fixed'
  return '<button type="button" class="wk-arrow wk-confirm" data-wk-role="nav" data-wk="confirm"' +
    ' data-next-label="' + nextLabel + '" data-confirm-label="' + confirmLabel + '"' +
    (disabled ? ' disabled' : '') + '>' + confirmLabel + '</button>'
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
  // D20: the panel never renders a resolved request — closed items live only in the index's log.
  const requestNotes = journeyRequestsOn(notes, labels).filter((n) => n.status !== 'resolved')

  const marks = open.map((n) => renderMark(n, ledger, s)).join('')
  // D6: the note form's own free-text save appends a request article for the current screen — one
  // hidden, unattached template article (same activation-not-fabrication discipline as the index's
  // own template) walk.browser.js labels/reveals rather than the script ever building a new DOM
  // node from scratch. FIX 2 (review): the template carries the `open` shape's full markup (text/
  // status/withdraw), byte-identical to `renderWalkRequest`'s own `open` branch minus the id/label/
  // text walk.browser.js fills in — a genuinely empty article left the activated row blank.
  const requestsHtml = '<article class="wk-req" data-wk-template hidden>' +
    '<p class="wk-req-text"></p>' +
    '<p class="wk-req-status">' + esc(s.reqWatching) + '</p>' +
    '<div class="wk-req-acts">' +
    '<button class="wk-req-act" type="button" data-wk="withdraw">' + esc(s.reqWithdraw) + '</button>' +
    '</div>' +
    '</article>' +
    requestNotes.map((n) => renderWalkRequest(n, s)).join('')
  const excl = renderExclusions(journey, ledger, notes, journeys, s)
  const title = (entry.title || journey) + ' · ' + (seed.product || 'Mocks')
  const openCount = open.length + excl.openCount
  // D21: the "current" screen for the bar's own nav-button/step-indicator render is the last
  // reached label, or the journey's first declared screen on a cold record — the same rule
  // walk.browser.js's own `apply()` uses, so the static render and the post-fetch reconciliation
  // never disagree about which screen is "current" for a journey whose record already has one.
  const currentLabel = reached.length ? reached[reached.length - 1] : (screens.length ? screens[0].label : null)
  const lastLabel = screens.length ? screens[screens.length - 1].label : null
  const isLast = currentLabel !== null && currentLabel === lastLabel
  const navButton = renderNavButton(rec, state, openCount, s, isLast)
  const signoff = renderSignoff(rec, s, state)
  const currentIx = screens.findIndex((sc) => sc.label === currentLabel)
  // D21: "<Screen label> · <i> of <n>", 1-indexed — rendered server-side (walk.browser.js's own
  // updateCaption() keeps it in sync as the client navigates without a reload).
  const captionText = currentLabel !== null ? esc(currentLabel + ' · ' + (currentIx + 1) + ' of ' + screens.length) : ''

  return head(title, prefix) +
    '<body class="wk wk-walk" data-journey="' + esc(journey) + '" data-prefix="' + esc(prefix) + '"' +
    (o.theme ? ' data-theme="' + esc(o.theme) + '"' : '') + '>' +
    '<header class="wk-bar">' +
    // D23: the home link reads "← All journeys · <Journey>" — a client-facing sentence, not a
    // bare back-arrow beside the journey's own title.
    '<a class="wk-home" href="' + esc(prefix) + '/client/index.html"><span aria-hidden="true">←</span> All journeys · <strong>' + esc(entry.title || journey) + '</strong></a>' +
    '<ol class="wk-steps" data-wk="steps">' + renderSteps(screens, reached, currentLabel) + '</ol>' +
    '<nav class="wk-nav"><button type="button" class="wk-arrow" data-wk="back">' + esc(s.back) + '</button>' + navButton + '</nav>' +
    '</header>' +
    '<div class="wk-main">' +
    '<section class="wk-stage" data-wk="stage">' +
    signoff +
    '<figure class="wk-object">' +
    '<figcaption class="wk-caption">' +
    '<h1 class="wk-caption-h" data-wk="caption">' + captionText + '</h1>' +
    '<div class="wk-states" data-wk="states"></div>' +
    '</figcaption>' +
    '<iframe class="wk-frame" data-wk="frame" title="' + esc(entry.title || journey) + '"></iframe>' +
    '</figure>' +
    '</section>' +
    '<aside class="wk-side">' +
    '<div class="wk-marks">' + marks + '</div>' +
    '<p class="wk-left"><span data-wk="left" data-count="' + open.length + '"' +
    ' data-none="' + esc(s.leftNone) + '" data-one="' + esc(s.leftOne) + '" data-many="' + esc(s.leftMany) + '">' +
    esc(count(s, 'leftNone', 'leftOne', 'leftMany', open.length)) + '</span></p>' +
    '<section class="wk-reqs" data-wk="requests">' + requestsHtml + '</section>' +
    '<form class="wk-note" data-wk="note">' +
    '<label class="wk-note-label">' + esc(s.noteLabel) +
    '<textarea class="wk-note-in" name="text" rows="2"></textarea></label>' +
    '<button class="wk-send" type="submit">' + esc(s.noteSend) + '</button>' +
    '</form>' +
    excl.html +
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
