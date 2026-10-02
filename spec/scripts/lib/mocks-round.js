'use strict'
// lib/mocks-round.js — the one reader of a wireframe round: the screen files, the assembled
// round, its offline findings and digest, and the latest round's pulled notes and approvals.
//
// Usage: const r = require('./mocks-round')
//        r.readScreens(root) · r.assembleRound(seedJourneys, ids, screens) · r.roundFindings(...)
//        r.roundDigest(round) · r.latestRound(root) · r.readRound/readNotes/readApprovals(root, n)
//        r.waitingItems(notes) · r.openNoteCount(root)
//
// Owner: specs/20261002/01-the-wireframe-command-runs-over-the-service.md D3 (the round
// library), D7 (the waiting rule), D13 (genesis's open-note count). The mocks driver and
// genesis-driver.js both read through it; neither re-derives a round.
//
// Rules held here: a screen is design/mocks/screens/<screen>[@<state>].json holding the
// json-render spec itself; names starting with "." are skipped; a round is a full snapshot —
// every journey asked for in seed order, and every screen file sorted by name, the stateless file
// first, then states ascending. The story hash is never computed here: it comes from
// lib/surfaces.js (beatHash) and lib/walkthrough-client.js builds the wire body from it.
//
// Deliberately NOT here: any network call, any write to disk, any status.json read, any ledger
// access, and any reading of a round's picture files.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { checkRoundFile } = require('./walkthrough-client')
const { validate } = require('./json-shape')
const { beatHash } = require('./surfaces')

const SCREEN_FILE_RE = /^([\w][\w-]*)(?:@([\w][\w-]*))?\.json$/
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function screensDir(root) { return path.join(root, 'design', 'mocks', 'screens') }
function roundsDir(root) { return path.join(root, 'design', 'rounds') }

function badFile(name, detail) {
  return { screen: name, state: null, element: null, code: 'bad-screen-file', detail }
}

// -> { screens: [{ name, state|null, spec, file }], findings: [...] }; dotfiles skipped, a
// missing directory reads as no screens.
function readScreens(root) {
  const dir = screensDir(root)
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { entries = [] }
  const screens = []
  const findings = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const m = SCREEN_FILE_RE.exec(e.name)
    if (!m || !e.isFile()) {
      findings.push(badFile(e.name, 'the file name must be <screen>.json or <screen>@<state>.json, using letters, digits, _ and - only'))
      continue
    }
    let spec
    try { spec = JSON.parse(fs.readFileSync(path.join(dir, e.name), 'utf8')) } catch (err) {
      findings.push(badFile(e.name, 'the file is not valid JSON (' + (err.code || err.message) + ')'))
      continue
    }
    if (!isObj(spec)) { findings.push(badFile(e.name, 'the file must hold one JSON object (the screen spec)')); continue }
    screens.push({ name: m[1], state: m[2] || null, spec, file: e.name })
  }
  screens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : (a.state || '') < (b.state || '') ? -1 : (a.state || '') > (b.state || '') ? 1 : 0))
  return { screens, findings }
}

// "owner-onboarding" -> "Owner onboarding".
function journeyTitle(id) {
  const t = id.replace(/-/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// seedJourneys is lib/surfaces.js's Map; ids not in it are ignored; journeys come out in seed order.
function assembleRound(seedJourneys, ids, screens) {
  const want = new Set(ids)
  const journeys = []
  for (const [id, j] of seedJourneys) {
    if (!want.has(id)) continue
    journeys.push({
      id, title: journeyTitle(id), persona: j.persona,
      steps: j.beats.map((b) => (b.state ? { beat: b.beat, screen: b.screen, state: b.state } : { beat: b.beat, screen: b.screen })),
    })
  }
  const outScreens = screens.map((s) => (s.state ? { name: s.name, state: s.state, spec: s.spec } : { name: s.name, spec: s.spec }))
  return { kind: 'wireframe', journeys, screens: outScreens }
}

function hasNavigateTo(spec, target) {
  const elements = isObj(spec) && isObj(spec.elements) ? spec.elements : {}
  for (const el of Object.values(elements)) {
    const press = isObj(el) && isObj(el.on) ? el.on.press : undefined
    for (const a of Array.isArray(press) ? press : [press]) {
      if (isObj(a) && a.action === 'navigate' && isObj(a.params) && a.params.to === target) return true
    }
  }
  return false
}

// checkRoundFile's findings, plus bad-journey and no-control. `screenFindings` (readScreens's own)
// come first, so one call returns every finding of the would-be round.
function roundFindings(contract, catalog, round, seedJourneys, screenFindings = []) {
  const out = screenFindings.slice()
  out.push(...checkRoundFile(contract, catalog, round))
  for (const j of round.journeys) {
    const withHash = { ...j, beats: beatHash(j.steps.map((s) => ({ beat: s.beat, screen: s.screen, state: s.state || null }))) }
    for (const f of validate(contract.shapes, 'journey', withHash)) {
      out.push({ screen: null, state: null, element: null, code: 'bad-journey', detail: `journey ${j.id}: ${f.at || 'journey'} — ${f.code}: ${f.detail}` })
    }
  }
  for (const j of round.journeys) {
    const seed = seedJourneys.get(j.id)
    if (!seed) continue
    for (const [a, b] of seed.edges) {
      const files = round.screens.filter((s) => s.name === a)
      if (!files.some((s) => hasNavigateTo(s.spec, b))) {
        out.push({ screen: a, state: null, element: null, code: 'no-control', detail: `journey ${j.id}: no control on ${a} leads to ${b}` })
      }
    }
  }
  return out
}

function roundDigest(round) {
  return crypto.createHash('sha256').update(JSON.stringify(round)).digest('hex')
}

// The highest all-digit folder under design/rounds/ that holds a round.json, else 0.
function latestRound(root) {
  let top = 0
  let entries = []
  try { entries = fs.readdirSync(roundsDir(root), { withFileTypes: true }) } catch { entries = [] }
  for (const e of entries) {
    if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue
    if (!fs.existsSync(path.join(roundsDir(root), e.name, 'round.json'))) continue
    top = Math.max(top, Number(e.name))
  }
  return top
}

function readJson(root, n, file) {
  try { return JSON.parse(fs.readFileSync(path.join(roundsDir(root), String(n), file), 'utf8')) } catch { return null }
}
function readRound(root, n) { return readJson(root, n, 'round.json') }
function readNotes(root, n) { return readJson(root, n, 'notes.json') }
function readApprovals(root, n) { return readJson(root, n, 'approvals.json') }

function lastText(thread, fallback) {
  const last = Array.isArray(thread) && thread.length ? thread[thread.length - 1] : null
  return last && typeof last.text === 'string' ? last.text : fallback
}

// Notes, then journey threads, whose status is "open": [{ id, where, text, picked }].
function waitingItems(notes) {
  const out = []
  if (!isObj(notes)) return out
  for (const n of Array.isArray(notes.notes) ? notes.notes : []) {
    if (!isObj(n) || n.status !== 'open') continue
    const where = n.screen == null ? 'project' : n.screen + (n.state ? '@' + n.state : '')
    out.push({ id: n.id, where, text: lastText(n.thread, n.text), picked: typeof n.pickedText === 'string' && n.pickedText ? n.pickedText : null })
  }
  for (const t of Array.isArray(notes.journeys) ? notes.journeys : []) {
    if (!isObj(t) || t.status !== 'open') continue
    out.push({ id: t.id, where: 'story', text: lastText(t.thread, ''), picked: null })
  }
  return out
}

function openNoteCount(root) {
  const n = latestRound(root)
  if (!n) return 0
  const notes = readNotes(root, n)
  return notes ? waitingItems(notes).length : 0
}

module.exports = {
  readScreens, journeyTitle, assembleRound, roundFindings, roundDigest, latestRound,
  readRound, readNotes, readApprovals, waitingItems, openNoteCount,
}
