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

  return head(seed.product || 'Mocks', prefix) +
    '<body class="wk wk-index" data-prefix="' + esc(prefix) + '">' +
    '<main class="wk-index-main">' +
    '<h1 class="wk-title">' + esc(seed.product || 'Mocks') + '</h1>' +
    '<p class="wk-lead">' + esc(s.indexLead) + '</p>' +
    '<nav class="wk-list">' + rows + '</nav>' +
    '</main>' +
    '<script src="' + esc(prefix) + '/__walk/player.js"></script>' +
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

module.exports = { buildClientIndex, buildWalkPage, STRINGS }
