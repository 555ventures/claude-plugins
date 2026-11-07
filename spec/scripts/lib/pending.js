'use strict'
// lib/pending.js — the lane question relay: the one reader/writer of .claude/pending-question.json
// and of the lane marker <git-dir>/spec-lane-open. A lane (worktree sub-agent) never asks the user;
// it writes the question here, prints PENDING_QUESTION, and exits 0. The parent answers and resumes.
// No CLI. Exports: KINDS, writePending, readPending, answerPending, consumePending, stopLine, isLane,
// isFanoutLane, laneOwner, markLane, unmarkLane. An unknown answer label throws {exit: 2}.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const PENDING = 'PENDING_QUESTION'
const MARKER = 'spec-lane-open'

// The three questions a run asks (fanout relays them in this order); answerPending keys on labels alone.
const KINDS = ['assumption', 'decision', 'unmet']

const pendingPath = (root) => path.join(root, '.claude', 'pending-question.json')

function gitDir(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--git-dir'], { encoding: 'utf8' })
  return r.status === 0 ? path.resolve(root, r.stdout.trim()) : null
}

const markerPath = (root) => { const d = gitDir(root); return d ? path.join(d, MARKER) : null }
const isLane = (root) => { const p = markerPath(root); return !!(p && fs.existsSync(p)) }
// The marker's content names who set it: 'fanout' for a lane worktree, 'run' for run.js's own
// marker while a builder or reviewer is out. Only a fanout marker makes a checkout a lane, so a
// stale run marker left by a crash never turns the next /spec:run into a lane.
function markLane(root, owner = 'fanout') {
  const p = markerPath(root)
  if (!p) throw Object.assign(new Error(`${root} is not inside a git repository`), { exit: 2 })
  fs.writeFileSync(p, owner)
  return p
}
const laneOwner = (root) => { const p = markerPath(root); try { return fs.readFileSync(p, 'utf8').trim() || 'fanout' } catch { return null } }
const isFanoutLane = (root) => laneOwner(root) === 'fanout'
const unmarkLane = (root) => { const p = markerPath(root); if (p) fs.rmSync(p, { force: true }) }

function save(root, doc) {
  const p = pendingPath(root)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n')
  fs.renameSync(tmp, p)
  return p
}

function readPending(root) {
  try { return JSON.parse(fs.readFileSync(pendingPath(root), 'utf8')) } catch { return null }
}

const normOption = (o) => (typeof o === 'string' ? { label: o } : { label: String(o.label), ...(o.description ? { description: String(o.description) } : {}) })

// Never overwrites a pending question: an existing one is returned with written: false.
function writePending(root, { lane, question, options, kind }) {
  const prior = readPending(root)
  if (prior) return { path: pendingPath(root), written: false, doc: prior }
  if (!question || !Array.isArray(options) || options.length < 2) {
    throw Object.assign(new Error('a pending question needs question text and at least two options'), { exit: 2 })
  }
  if (!KINDS.includes(kind)) throw Object.assign(new Error(`unknown question kind '${kind}' — one of: ${KINDS.join(' | ')}`), { exit: 2 })
  const doc = { lane: lane || null, kind, question: String(question), options: options.map(normOption), writtenAt: new Date().toISOString(), answer: null }
  return { path: save(root, doc), written: true, doc }
}

function answerPending(root, label, by = 'user') {
  const doc = readPending(root)
  if (!doc) throw Object.assign(new Error(`no pending question at ${pendingPath(root)}`), { exit: 2 })
  if (!doc.options.some((o) => o.label === label)) {
    throw Object.assign(new Error(`unknown option '${label}' — one of: ${doc.options.map((o) => o.label).join(' | ')}`), { exit: 2 })
  }
  doc.answer = { label, by, at: new Date().toISOString() }
  save(root, doc)
  return doc
}

// Returns the doc (answered or not) and removes the file; null when nothing was pending.
function consumePending(root) {
  const doc = readPending(root)
  fs.rmSync(pendingPath(root), { force: true })
  return doc
}

const stopLine = (root) => `${PENDING} — ${pendingPath(root)}; the lane stops here and the parent session relays it`

module.exports = { PENDING, KINDS, pendingPath, writePending, readPending, answerPending, consumePending, stopLine, isLane, isFanoutLane, laneOwner, markLane, unmarkLane }
