'use strict'
// lib/walk-page.js — the two pure builders of the client's own pages, served by design-atlas.js
// at GET /client/index.html and GET /client/walk/<j>.html.
// specs/20260910/03-client-journey-player.md D1 (both builders and their markup contract),
// D2 (the STRINGS table and the `lang` roles), D3 (the hooks walk.browser.js drives).
//
//   buildClientIndex({ seed, notes, ledger, walk, prefix, lang }) → html
//     seed    { product, journeys: [{ name, title, screens: [{ label, states }] }] } in seed
//             order — design-atlas.js's seedForReview builds it
//     notes   notes.json array, raw — joined onto `ledger` exactly as review-page.js joins it
//     ledger  parseLedger(...).assumptions
//     walk    design/mocks/walk.json, raw ({ journeys: { <j>: { reached, misses, confirmedAt,
//             sentence, waived } } }) — lib/mocks-walk.js is its only writer
//     prefix  the served mount ('' or '/p/<name>')
//     lang    'ja' | 'en' (default 'en') — design/targets.json's optional "lang"
//
//   buildWalkPage({ seed, journey, notes, ledger, walk, prefix, lang, theme }) → html
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
// control is ever rendered); render a session-only surface (no artboard grid, no stop block).
//
// Exit codes: none — this is a library, not an executable.

const { esc } = require('./stop-block')

// D2: every visible string, keyed by lang. A table, not a template fork — the plugin is not
// Japan-only and the client pages are the one surface a non-English-reading client reads.
const STRINGS = {
  en: {
    indexLead: 'Open a journey and walk it to the end. Tell us what matches what you expected.',
    toCheckNone: 'nothing to check',
    toCheckOne: '1 thing to check',
    toCheckMany: '{n} things to check',
    confirmed: 'Confirmed',
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
    themeNone: 'nothing to pick yet',
    themePrompt: 'Pick a look',
    themePick: 'Pick this',
    themePicked: 'Picked',
  },
  ja: {
    indexLead: 'ジャーニーを開いて、最後まで進んでください。思ったとおりかどうか教えてください。',
    toCheckNone: '確認するものはありません',
    toCheckOne: '確認するもの 1件',
    toCheckMany: '確認するもの {n}件',
    confirmed: '確認済み',
    back: '戻る',
    next: '次へ',
    states: '他の状態',
    happy: '通常',
    yes: '合ってる',
    no: '違う',
    why: 'どう違いますか',
    noteLabel: 'この画面について他にありますか',
    noteSend: '送信',
    leftNone: '残りはありません',
    leftOne: '残り 1件',
    leftMany: '残り {n}件',
    approveLead: 'いま何をしたか、一文で書いてください。',
    sentence: '一文で…',
    confirm: 'このジャーニーを確認',
    confirmedLead: 'このジャーニーを確認しました。',
    themeNone: 'まだ選ぶものはありません',
    themePrompt: '見た目を選んでください',
    themePick: 'これに決める',
    themePicked: '決定済み',
  },
}

function stringsFor(lang) { return STRINGS[lang] || STRINGS.en }
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
  const s = stringsFor(o.lang)
  const notes = o.notes || []
  const ledger = o.ledger || []
  const rows = journeysOf(seed).map((entry) => {
    const labels = new Set(screensOf(entry).map((sc) => sc.label))
    const open = notes.filter((n) => isOpenQuestion(n) && n.scope === 'mock' && labels.has(n.screen)).length
    const rec = recordOf(o.walk, entry.name)
    const done = !!(rec && rec.confirmedAt)
    return '<a class="wk-j" data-cl="journey" href="' + esc(prefix) + '/client/walk/' + esc(entry.name) + '.html"' +
      ' data-guesses="' + open + '" data-confirmed="' + (done ? 'true' : 'false') + '">' +
      '<span class="wk-j-name">' + esc(entry.title || entry.name) + '</span>' +
      '<span class="wk-j-meta">' + (done
        ? '<span class="wk-done">' + esc(s.confirmed) + '</span>'
        : esc(count(s, 'toCheckNone', 'toCheckOne', 'toCheckMany', open))) +
      '</span></a>'
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
  const s = stringsFor(o.lang)
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

function renderApprove(rec, openCount, s) {
  if (rec && rec.confirmedAt) {
    return '<section class="wk-approve" data-wk="approve">' +
      '<p class="wk-lead">' + esc(s.confirmedLead) + '</p>' +
      '<blockquote class="wk-sentence">' + esc(rec.sentence || '') + '</blockquote>' +
      '</section>'
  }
  return '<section class="wk-approve" data-wk="approve" hidden>' +
    '<p class="wk-lead">' + esc(s.approveLead) + '</p>' +
    '<textarea class="wk-sentence-in" data-wk="sentence" rows="2" placeholder="' + esc(s.sentence) + '"></textarea>' +
    '<button class="wk-confirm" data-wk="confirm"' + (openCount > 0 ? ' disabled' : '') + '>' + esc(s.confirm) + '</button>' +
    '</section>'
}

function buildWalkPage(input) {
  const o = input || {}
  const journey = o.journey
  const seed = o.seed || { product: '', journeys: [] }
  const prefix = o.prefix || ''
  const s = stringsFor(o.lang)
  if (!journey) throw new Error('buildWalkPage needs {journey}')
  const journeys = journeysOf(seed)
  const entry = journeys.find((j) => j.name === journey)
  if (!entry) throw new Error('unknown journey ' + journey + ' — declared: ' + journeys.map((j) => j.name).join(', '))

  const screens = screensOf(entry)
  const labels = new Set(screens.map((sc) => sc.label))
  const rec = recordOf(o.walk, journey)
  const reached = (rec && Array.isArray(rec.reached)) ? rec.reached : []
  const ledger = o.ledger || []
  const open = (o.notes || []).filter((n) => isOpenQuestion(n) && n.scope === 'mock' && labels.has(n.screen))

  const marks = open.map((n) => renderMark(n, ledger, s)).join('')
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
    '<form class="wk-note" data-wk="note">' +
    '<label class="wk-note-label">' + esc(s.noteLabel) +
    '<textarea class="wk-note-in" name="text" rows="2"></textarea></label>' +
    '<button class="wk-send" type="submit">' + esc(s.noteSend) + '</button>' +
    '</form>' +
    renderApprove(rec, open.length, s) +
    '</aside>' +
    '</div>' +
    '<script src="' + esc(prefix) + '/__walk/player.js"></script>' +
    '</body></html>\n'
}

module.exports = { buildClientIndex, buildWalkPage, buildThemePage, STRINGS }
