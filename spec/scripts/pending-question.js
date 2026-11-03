#!/usr/bin/env node
'use strict'
// Usage: pending-question.js write --root <dir> --file <doc.json>
//        pending-question.js show|dismiss|consume|mark|is-delegated --root <dir>
//        pending-question.js answer --root <dir> --id <qid> --label <label> --by user
// Also a module: isDelegated, markDelegated, pendingPath, writePending, readPending,
// consumePending, validate, stopPolicy, policyPick, recordLaneExit, clearLaneExit, readLaneExit.
//
// Owner: specs/20261102/02-a-delegated-driver-stops-on-disk.md D1 — the one writer and reader
// of <root>/.claude/pending-question.json, the file a driver running delegated (a lane worker
// with no AskUserQuestion tool) hands up to the parent session instead of asking.
//
// Delegation is a plugin-owned fact, never a harness environment variable: the parent session
// and its sub-agents share one environment byte for byte (owner of that rule: the isDelegated
// regression in tests/delegated/pending-question.test.js), so `isDelegated(root)` reads two
// signals that only a lane can carry — the `spec-delegated` marker in the lane's private git dir
// (`mark`, the fan-out's first worker command; outside the working tree so no review leg sees it)
// or the lane's branch listed in <git-common-dir>/spec-fanout.json. `is-delegated` is the query
// form for prose commands (exit 0 = a lane, 1 = not), so no command re-derives the rule.
//
// `stopPolicy(root)` / `policyPick(root, key, labelByValue, marks)` are the
// one reader of the host's policy.stops overlaid by the fan-out table's `ask` list, and the one
// builder of the printed auto-pick line; a policy pick never writes a pending file.
//
// `recordLaneExit(root, marks, exit)` / `clearLaneExit(root, marks)` / `readLaneExit(root)` are the one
// writer and reader of a lane's exit: the exit lands on marks.laneExit AND,
// in a lane, in the lane's private git dir (`spec-lane-exit.json`, beside the marker) — the printed
// remedy of the very exits that set it deletes the build/review sidecar, so the sidecar copy alone
// cannot be what the fan-out's `--mark returned` reads.
//
// Does NOT decide who may answer (core § Delegated Stops: only the parent writes answers), does
// NOT relay a question, and never stores state beyond that one file and the marker.
//
// Exit codes: 0 done (is-delegated: a lane) · 1 nothing pending (show) / not a lane (is-delegated) · 2 usage, validation, unknown id/label,
// already pending, not a git repo (mark)

const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const { spawnSync } = require('child_process')
const { check } = require('./question-style-gate')
const { policy } = require('./lib/host-config')

const KINDS = ['repair-round', 'dispositions', 'review-escalate', 'red-findings', 'build-escalate', 'fix-decisions', 'fix-dispositions']
const BY = ['user']

const MARKER = 'spec-delegated'

function gitQuery(root, flag) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', flag], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const v = r.stdout.trim()
  return flag === '--abbrev-ref' ? v : path.resolve(root, v)
}
const gitDir = (root) => gitQuery(root, '--git-dir')
const gitCommonDir = (root) => gitQuery(root, '--git-common-dir')
const currentBranch = (root) => {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}
const markerPath = (root) => {
  const gd = gitDir(root)
  return gd ? path.join(gd, MARKER) : null
}

// true only for a lane: the private git dir carries the marker, or the fan-out table lists the
// current branch. The parent on main has neither; an environment variable is never consulted.
function isDelegated(root) {
  if (typeof root !== 'string' || !root) return false
  const mp = markerPath(root)
  if (mp && fs.existsSync(mp)) return true
  const common = gitCommonDir(root)
  if (!common) return false
  let table = null
  try {
    table = JSON.parse(fs.readFileSync(path.join(common, 'spec-fanout.json'), 'utf8'))
  } catch {
    return false
  }
  const branch = currentBranch(root)
  return !!(branch && table && Array.isArray(table.lanes) && table.lanes.some((l) => l && l.branch === branch))
}

function readFanoutTable(root) {
  const common = gitCommonDir(root)
  if (!common) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(common, 'spec-fanout.json'), 'utf8'))
  } catch {
    return null
  }
}

// The host's policy.stops with the fan-out table's `ask` list overlaid ('all' = every key).
function stopPolicy(root) {
  const stops = { ...policy(root).stops }
  const table = readFanoutTable(root)
  const ask = table && Array.isArray(table.ask) ? table.ask : []
  for (const k of Object.keys(stops)) if (ask.includes('all') || ask.includes(k)) stops[k] = 'ask'
  return stops
}

// null when the stop is asked (or has no label for its value); else the vetoable pick, recorded
// onto marks.policyPicks.
function policyPick(root, key, labelByValue, marks) {
  const value = stopPolicy(root)[key]
  if (value === 'ask' || !labelByValue || !Object.prototype.hasOwnProperty.call(labelByValue, value)) return null
  const label = labelByValue[value]
  if (marks) (marks.policyPicks = Array.isArray(marks.policyPicks) ? marks.policyPicks : []).push({ key, value, label, at: new Date().toISOString() })
  return { value, label, line: `📌 Auto-picked ${label} — host policy stops.${key}: ${value} (veto anytime)` }
}

function markDelegated(root) {
  const mp = markerPath(root)
  if (!mp) return null
  fs.writeFileSync(mp, '')
  return mp
}

const LANE_EXIT = 'spec-lane-exit.json'
const laneExitPath = (root) => {
  const gd = gitDir(root)
  return gd ? path.join(gd, LANE_EXIT) : null
}

// Set once, never overwritten: the first lane-ending exit is the one the lane ended on. Returns
// true when marks changed (the caller saves its sidecar).
function recordLaneExit(root, marks, exit) {
  if (marks.laneExit) return false
  marks.laneExit = { ...exit, at: new Date().toISOString() }
  if (isDelegated(root)) {
    const p = laneExitPath(root)
    if (p && !fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(marks.laneExit) + '\n')
  }
  return true
}

function clearLaneExit(root, marks) {
  delete marks.laneExit
  const p = laneExitPath(root)
  if (p) fs.rmSync(p, { force: true })
}

function readLaneExit(root) {
  const p = laneExitPath(root)
  if (!p) return null
  try {
    const x = JSON.parse(fs.readFileSync(p, 'utf8'))
    return x && typeof x.reason === 'string' ? x : null
  } catch {
    return null
  }
}

const pendingPath = (root) => path.join(root, '.claude', 'pending-question.json')

function writePending(root, doc) {
  const p = pendingPath(root)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify({ ...doc, answers: null, dismissed: null }, null, 2) + '\n')
  return p
}

function readPending(root) {
  try {
    return JSON.parse(fs.readFileSync(pendingPath(root), 'utf8'))
  } catch {
    return null
  }
}

function consumePending(root) {
  try {
    fs.unlinkSync(pendingPath(root))
  } catch {
    // absent is the goal state
  }
}

function validate(doc) {
  const out = []
  if (!doc || typeof doc !== 'object') return ['document must be a JSON object']
  if (doc.schemaVersion !== 1) out.push('schemaVersion must be 1')
  if (!KINDS.includes(doc.kind)) out.push(`kind "${doc.kind}" is not in the closed set`)
  if (!Array.isArray(doc.questions) || doc.questions.length === 0) {
    out.push('questions must be a non-empty array')
    return out
  }
  const seen = new Set()
  for (const q of doc.questions) {
    const id = q && q.id
    if (seen.has(id)) out.push(`question ${id}: duplicate id`)
    seen.add(id)
    for (const o of (q && Array.isArray(q.options) ? q.options : [])) {
      if (typeof o.resume !== 'string' || !o.resume.trim()) out.push(`option "${o.label}": resume must be a command or "stop"`)
    }
  }
  try {
    out.push(...check({ tool_input: { questions: doc.questions } }))
  } catch (e) {
    out.push(`style check failed: ${e.message}`)
  }
  return out
}

const waitingLine = (root) => `## PENDING_QUESTION — waiting for the parent session: ${pendingPath(root)}`
const DISMISSED_LINE = '## STOPPED — the question was dismissed; the run ends (core § Decisions)'

// Driver-side: complete `doc` (schemaVersion, stage, writtenAt), validate, write, and return the
// stop line. A question already pending is never overwritten — the waiting line comes back.
// `doc.stopKey` (optional) names the stop this question belongs to; when `marks.answered` already
// holds an answer for the same kind and key, nothing is written and the answered text comes back
// instead, so a cold re-run never re-asks a question the parent already answered.
function stopLine(root, stage, doc, marks) {
  if (readPending(root)) return waitingLine(root)
  const full = { schemaVersion: 1, stage, writtenAt: new Date().toISOString(), ...doc }
  const prior = marks && full.stopKey && (Array.isArray(marks.answered) ? marks.answered : [])
    .filter((a) => a.kind === full.kind && a.stopKey === full.stopKey).pop()
  if (prior) return answeredText(full, prior.answers)
  const findings = validate(full)
  if (findings.length) {
    process.stderr.write(`pending-question: the ${full.kind} question this driver wrote is malformed — ${findings.join('; ')}; ` +
      `write the question by hand with: node ${__filename} write --root ${root} --file <doc.json>\n`)
    process.exit(2)
  }
  const p = writePending(root, full)
  return `## PENDING_QUESTION — ${full.kind} written to ${p}; the lane stops here and the parent session relays it`
}

const stopKey = (...parts) => crypto.createHash('sha1').update(parts.map(String).join('|')).digest('hex').slice(0, 12)

function answeredText(doc, answers) {
  const lines = [`## Step: resume — ${doc.kind} (already answered; not asked again)`]
  for (const q of doc.questions) {
    const a = (answers || {})[q.id]
    if (!a) continue
    lines.push(`${q.id}: ${a.label} (by ${a.by})`)
    const o = q.options.find((x) => x.label === a.label) || {}
    lines.push(o.resume === 'stop' ? `stop${o.then ? ' — then: ' + o.then : ''}` : String(o.resume))
  }
  return lines.join('\n')
}

// Driver-side bare-run contract: evaluated before any state. Returns null (nothing pending),
// or { text, changed } where `changed` says the caller must save `marks`. `keepKinds` names kinds
// whose answered file is consumed by the resuming mark itself, not at print time.
function bareRun(root, marks, keepKinds = [], keyFor = () => null) {
  const doc = readPending(root)
  if (!doc) {
    if (marks.dismissedStop) return { text: DISMISSED_LINE, changed: false }
    return null
  }
  if (doc.dismissed) {
    consumePending(root)
    marks.dismissedStop = { kind: doc.kind, at: doc.dismissed.at }
    return { text: DISMISSED_LINE, changed: true }
  }
  const qs = Array.isArray(doc.questions) ? doc.questions : []
  const answers = doc.answers || {}
  if (!qs.length || !qs.every((q) => answers[q.id])) return { text: waitingLine(root), changed: false }
  const lines = [`## Step: resume — ${doc.kind}`]
  for (const q of qs) {
    const a = answers[q.id]
    lines.push(`${q.id}: ${a.label} (by ${a.by})`)
    const o = q.options.find((x) => x.label === a.label) || {}
    lines.push(o.resume === 'stop' ? `stop${o.then ? ' — then: ' + o.then : ''}` : String(o.resume))
  }
  if (keepKinds.includes(doc.kind)) return { text: lines.join('\n'), changed: false }
  for (const q of qs) {
    const a = answers[q.id]
    const o = q.options.find((x) => x.label === a.label) || {}
    if (o.resume === 'stop') recordLaneExit(root, marks, { reason: a.label })
  }
  consumePending(root)
  marks.answered = [...(Array.isArray(marks.answered) ? marks.answered : []),
    { kind: doc.kind, answers, at: new Date().toISOString(), ...(keyFor(doc.kind) ? { stopKey: keyFor(doc.kind) } : {}) }]
  return { text: lines.join('\n'), changed: true }
}

function usage(msg) {
  process.stderr.write(`pending-question: ${msg}\nusage: pending-question.js write|show|answer|dismiss|consume|mark|is-delegated --root <dir> [--file <doc.json>] [--id <qid> --label <label> --by user]\n`)
  process.exit(2)
}

function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  const opt = {}
  for (let i = 1; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) usage(`${argv[i]} needs a value`)
    opt[argv[i].slice(2)] = argv[i + 1]
  }
  if (!['write', 'show', 'answer', 'dismiss', 'consume', 'mark', 'is-delegated'].includes(cmd)) usage(`unknown subcommand ${cmd || '(none)'}`)
  if (!opt.root) usage('--root needs a directory')
  const root = path.resolve(opt.root)
  const p = pendingPath(root)
  if (cmd === 'write') {
    if (!opt.file) usage('--file needs a path to the document')
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(opt.file, 'utf8'))
    } catch (e) {
      usage(`cannot read ${opt.file}: ${e.message}`)
    }
    const findings = validate(doc)
    if (findings.length) {
      process.stderr.write(findings.join('\n') + '\n')
      process.exit(2)
    }
    if (fs.existsSync(p)) {
      process.stderr.write(`pending-question: a question is already pending: ${p} — answer it or run consume --root ${root}\n`)
      process.exit(2)
    }
    console.log(writePending(root, doc))
    process.exit(0)
  }
  if (cmd === 'is-delegated') {
    const d = isDelegated(opt.root)
    process.stdout.write((d ? 'true' : 'false') + '\n')
    process.exit(d ? 0 : 1)
  }
  if (cmd === 'mark') {
    const mp = markDelegated(opt.root)
    if (!mp) usage(`${opt.root} is not inside a git repository — run mark from the lane's worktree`)
    process.stdout.write(mp + '\n')
    process.exit(0)
  }
  if (cmd === 'consume') {
    consumePending(root)
    process.exit(0)
  }
  const doc = readPending(root)
  if (!doc) {
    if (cmd === 'show') {
      process.stderr.write('pending-question: no pending question\n')
      process.exit(1)
    }
    usage(`no pending question at ${p}`)
  }
  if (cmd === 'show') {
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n')
    process.exit(0)
  }
  if (cmd === 'dismiss') {
    doc.dismissed = { at: new Date().toISOString() }
  } else {
    if (!BY.includes(opt.by)) usage(`--by must be one of ${BY.join('|')}`)
    const q = doc.questions.find((x) => x.id === opt.id)
    if (!q) usage(`unknown question id ${opt.id}`)
    if (!q.options.some((o) => o.label === opt.label)) usage(`unknown option label "${opt.label}" for question ${opt.id}`)
    doc.answers = { ...(doc.answers || {}), [opt.id]: { label: opt.label, by: opt.by, at: new Date().toISOString() } }
  }
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n')
  process.exit(0)
}

module.exports = { isDelegated, pendingPath, writePending, readPending, consumePending, validate, stopLine, stopKey, bareRun, waitingLine, KINDS, BY, markDelegated, stopPolicy, policyPick, recordLaneExit, clearLaneExit, readLaneExit }

if (require.main === module) main()
