#!/usr/bin/env node
'use strict'
// Usage: pending-question.js write --root <dir> --file <doc.json>
//        pending-question.js show|dismiss|consume --root <dir>
//        pending-question.js answer --root <dir> --id <qid> --label <label> --by user|standing
// Also a module: isDelegated, pendingPath, writePending, readPending, consumePending, validate.
//
// Owner: specs/20261102/02-a-delegated-driver-stops-on-disk.md D1 — the one writer and reader
// of <root>/.claude/pending-question.json, the file a driver running in a child session (no
// AskUserQuestion tool) hands up to the parent session instead of asking.
//
// Does NOT decide who may answer (core § Delegated Stops: only the parent writes answers), does
// NOT relay a question, and never stores state beyond that one file.
//
// Exit codes: 0 done · 1 nothing pending (show) · 2 usage, validation, unknown id/label,
// already pending

const fs = require('fs')
const path = require('path')
const { check } = require('./question-style-gate')

const KINDS = ['repair-round', 'dispositions', 'review-escalate', 'red-findings', 'build-escalate', 'fix-dirty-tree', 'fix-decisions', 'fix-dispositions']
const BY = ['user', 'standing']

function isDelegated() {
  const v = process.env.CLAUDE_CODE_CHILD_SESSION
  return typeof v === 'string' && v !== ''
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
function stopLine(root, stage, doc) {
  if (readPending(root)) return waitingLine(root)
  const full = { schemaVersion: 1, stage, writtenAt: new Date().toISOString(), ...doc }
  const findings = validate(full)
  if (findings.length) {
    process.stderr.write(`pending-question: the ${full.kind} question this driver wrote is malformed — ${findings.join('; ')}\n`)
    process.exit(2)
  }
  const p = writePending(root, full)
  return `## PENDING_QUESTION — ${full.kind} written to ${p}; the lane stops here and the parent session relays it`
}

// Driver-side bare-run contract: evaluated before any state. Returns null (nothing pending),
// or { text, changed } where `changed` says the caller must save `marks`. `keepKinds` names kinds
// whose answered file is consumed by the resuming mark itself, not at print time.
function bareRun(root, marks, keepKinds = []) {
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
  consumePending(root)
  marks.answered = [...(Array.isArray(marks.answered) ? marks.answered : []), { kind: doc.kind, answers, at: new Date().toISOString() }]
  return { text: lines.join('\n'), changed: true }
}

function usage(msg) {
  process.stderr.write(`pending-question: ${msg}\nusage: pending-question.js write|show|answer|dismiss|consume --root <dir> [--file <doc.json>] [--id <qid> --label <label> --by user|standing]\n`)
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
  if (!['write', 'show', 'answer', 'dismiss', 'consume'].includes(cmd)) usage(`unknown subcommand ${cmd || '(none)'}`)
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

module.exports = { isDelegated, pendingPath, writePending, readPending, consumePending, validate, stopLine, bareRun, waitingLine, KINDS }

if (require.main === module) main()
