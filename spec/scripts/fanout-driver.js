#!/usr/bin/env node
'use strict'
// fanout-driver.js [--root <dir>] [--pick] [--state]
// fanout-driver.js --root <dir> --mark <planned|picked|dispatched|returned|answered|dismissed|resumed|merged|gate-repaired|reported> [--lane <id>] [--agent <name>] [--stopped "<reason>"] [--id <qid>] [--label "<label>"]…
//
// Owner: specs/20261102/03-one-session-runs-the-lanes.md, specs/20261103/06-the-fan-out-drains-the-queue.md,
// specs/20261103/15-shared-files-land-by-rebase.md, specs/20261103/14-the-fan-out-has-two-modes.md — the driver
// behind /spec:fanout: one session dispatches a worktree-isolated sub-agent per lane, relays the questions
// the lanes write, merges each finished lane one at a time with the host gate re-run on main, and renders one
// report. Two modes: a bare run (AUTO) derives the batch — the queue's startable specs up to the first
// boundary — and tables the pending fixes as the serial fix group; --pick (SELF-PICK) prints one checkbox
// round and --mark picked routes the picks through the same boundary validation. State lives in
// <git-common-dir>/spec-fanout.json; every step is re-derived from it and the lanes' disks, so /clear loses
// nothing. Prints one step per run: PICK, PLAN, DISPATCH, RELAY, REBASE, MERGE, MERGE_RED, WAIT, REPORT.
// Lanes run in parallel whatever their File Plans share: MERGE rebases the lane onto the root's branch and
// fast-forwards it (merge-back rebase-ff); a conflict goes back to the lane's worker (REBASE, `--mark resumed`),
// a second one against the same main stops the lane.
//
// Does NOT ask for a repair on main (a lane repairs it in its own worktree), open the queue file
// (spec-status --lanes --json is the only queue reader), answer a lane's question itself, run a lane's driver,
// dispatch an agent (it prints the Agent line), derive lanes, admit a pick the bare run would refuse, or
// re-admit a spec whose lane stopped in this run; four lanes at once is a constant, not a flag. A bare run
// applies RELAY's side effects; a mark only records its fact and prints the next step.
//
// Exit codes: 0 step, mark or --state printed · 2 refused (run outside the main worktree, unknown argument
// or mark, mark outside its state, a lane not in the table or not merged, a gate-red main, a lane id missing,
// a pick with no label or a label matching no candidate, --pick on a running fan-out, a dirty main root at
// the MERGE step, a merge-ready lane with no recorded worktree, a merge-back exit other than 0 or 3) —
// stderr names the remedy.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeDie, writeJson, nowIso } = require('./lib/driver-core')
const { writeOut, runHost } = require('./lib/driver-io')
const { readConfig, agentCall } = require('./lib/host-config')
const { resolveGate } = require('./lib/gate-resolve')
const runCache = require('./lib/run-cache')
const { computeTestsExecuted, computeSkips } = require('./lib/count-observation')
const { readLaneExit } = require('./pending-question')
const { originLine } = require('./lib/queue')
const { parseBrief, relateBriefs, briefNum } = require('./lib/brief')

const SELF = __filename
const DIR = __dirname
const die = makeDie('fanout-driver')
const MARKS = ['planned', 'picked', 'dispatched', 'returned', 'answered', 'dismissed', 'resumed', 'merged', 'gate-repaired', 'reported']
const LANE_CAP = 4
const ACTIVE = ['dispatched', 'pending', 'conflicted', 'merge-ready']
const TERMINAL = ['merged', 'stopped', 'done']

const stemOf = (p) => path.basename(p).replace(/\.[^.]*$/, '')
const real = (p) => { try { return fs.realpathSync(p) } catch (e) { return path.resolve(p) } }
const { readJsonSafe: readJson } = require('./lib/util')
const out = (lines) => writeOut(1, (Array.isArray(lines) ? lines.join('\n') : lines) + '\n')

// ---- argv ------------------------------------------------------------------------------------

const USAGE = 'fanout-driver.js [--root <dir>] [--pick] | --mark <m> [flags] | --state'
const VALUE_FLAGS = ['--root', '--mark', '--lane', '--agent', '--stopped', '--id', '--label']
const BOOL_FLAGS = ['--pick', '--state']
const arg = { labels: [] }
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (VALUE_FLAGS.includes(a)) {
      if (argv[i + 1] === undefined) die(`${a} needs a value — usage: ${USAGE}`)
      if (a === '--label') arg.labels.push(argv[++i]); else arg[a.slice(2)] = argv[++i]
    } else if (BOOL_FLAGS.includes(a)) arg[a.slice(2)] = true
    else die(`unknown argument ${a} — usage: ${USAGE}`)
  }
}
const root = path.resolve(arg.root || process.cwd())
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) die(`--root ${root} is not a directory — pass the project root, or omit --root to use the current directory`)

// ---- git -------------------------------------------------------------------------------------

function git(args, cwd) { return spawnSync('git', args, { encoding: 'utf8', cwd: cwd || root }) }

function worktrees() {
  const r = git(['worktree', 'list', '--porcelain'])
  if (r.status !== 0) die(`${root} is not a git repository — run from the project root`)
  return r.stdout.split(/\n\n+/).map((b) => ({
    dir: ((b.match(/^worktree (.+)$/m) || [])[1]) || null,
    branch: ((b.match(/^branch refs\/heads\/(.+)$/m) || [])[1]) || null,
  })).filter((b) => b.dir)
}

const worktreeOf = (branch) => (worktrees().slice(1).find((w) => w.branch === branch) || {}).dir || null

// Refuse from a linked worktree of this repo, or with --root naming one: the table is the main root's.
const mainRoot = worktrees()[0].dir
{
  const top = git(['rev-parse', '--show-toplevel'], process.cwd())
  const inLinked = top.status === 0 && worktrees().slice(1).some((w) => real(w.dir) === real(top.stdout.trim()))
  if (inLinked || real(root) !== real(mainRoot)) die(`run from the main worktree — cd ${mainRoot}`)
}
const common = path.resolve(root, git(['rev-parse', '--git-common-dir']).stdout.trim())
const STATE_FILE = path.join(common, 'spec-fanout.json')
const WORK_DIR = path.join(common, 'spec-fanout')
const REPORT_FILE = path.join(WORK_DIR, 'report.json')

// ---- state -----------------------------------------------------------------------------------

const load = () => readJson(STATE_FILE)
const save = (st) => writeJson(STATE_FILE, st)

const isRed = (st) => !!(st && st.lastGate && st.lastGate.result === 'red')
const repairLane = (st, state) => st.lanes.find((l) => l.repairs === st.lastGate.lane && (!state || l.state === state))

// Run lanes first up to the cap; then each planned fix lane that names files and shares none with a
// run lane it overlaps or a fix lane in flight; a fix lane naming no file keeps the old slot — alone,
// after every run lane. A red main admits only its repair lane.
function dispatchable(st) {
  if (isRed(st)) { const r = repairLane(st, 'planned'); return r ? [r] : [] }
  const active = st.lanes.filter((l) => ACTIVE.includes(l.state)).length
  const picked = st.lanes.filter((l) => l.kind === 'run' && l.state === 'planned').slice(0, Math.max(0, LANE_CAP - active))
  const busyRun = st.lanes.filter((l) => l.kind === 'run' && (l.state === 'planned' || ACTIVE.includes(l.state)))
  const busyFix = st.lanes.filter((l) => l.kind === 'fix' && ACTIVE.includes(l.state))
  for (const f of st.lanes.filter((l) => l.kind === 'fix' && l.state === 'planned')) {
    if (active + picked.length >= LANE_CAP) break
    if (!f.files) {
      if (!busyRun.length && !busyFix.length && !picked.length) picked.push(f)
      continue
    }
    const overlaps = f.overlaps || []
    const shares = (o) => !o.files || o.files.some((x) => f.files.includes(x))
    if (busyRun.some((r) => overlaps.includes(r.spec))) continue
    if (busyFix.some(shares) || picked.some((o) => o.kind === 'fix' && shares(o))) continue
    picked.push(f)
  }
  return picked
}

function deriveState(st) {
  if (!st || !st.admitted) return st && st.pick && !st.batch ? 'PICK' : 'PLAN'
  const pending = st.lanes.some((l) => l.state === 'pending')
  // A red main outranks DISPATCH, so no lane but its repair lane is dispatched onto it; a pending question still relays;
  // a landing precedes a new dispatch so the lane branches from the newest main.
  if (isRed(st)) {
    if (pending) return 'RELAY'
    if (repairLane(st, 'conflicted')) return 'REBASE'
    if (repairLane(st, 'planned')) return 'DISPATCH'
    if (repairLane(st, 'dispatched')) return 'WAIT'
    return repairLane(st, 'merge-ready') ? 'MERGE' : 'MERGE_RED'
  }
  if (pending) return 'RELAY'
  if (st.lanes.some((l) => l.state === 'conflicted')) return 'REBASE'
  if (st.lanes.some((l) => l.state === 'merge-ready')) return 'MERGE'
  if (dispatchable(st).length) return 'DISPATCH'
  if (st.lanes.some((l) => l.state === 'dispatched' || l.state === 'planned')) return 'WAIT'
  return 'REPORT'
}

const header = (state) => `[fanout-driver] state: ${state}  root: ${root}`
const cmd = (rest) => `node ${SELF} --root ${root} ${rest}`
const laneOf = (st, id) => st.lanes.find((x) => x.id === id) || die(`no lane ${id} in the table — lanes are ${st.lanes.map((x) => x.id).join(', ') || '(none)'}`)
const labelOf = (l) => l.kind === 'fix' ? `fix ${l.queueId || 'ci-' + l.ci}` : l.spec

// ---- spec-status -----------------------------------------------------------------------------

function statusJson(args) {
  const r = spawnSync(process.execPath, [path.join(DIR, 'spec-status.js'), '--root', root, ...args], { encoding: 'utf8', cwd: root })
  if (r.status !== 0) die(`spec-status ${args.join(' ')} failed: ${(r.stderr || '').trim()} — fix the cause, then re-run`)
  return JSON.parse(r.stdout)
}

function statusNextText() {
  const r = spawnSync(process.execPath, [path.join(DIR, 'spec-status.js'), '--root', root, '--next'], { encoding: 'utf8', cwd: root })
  return r.status === 0 ? r.stdout : ''
}

// ---- PLAN ------------------------------------------------------------------------------------

function newLane(id, kind, fields) {
  return { id, kind, spec: null, brief: null, branch: null, state: 'planned', waitingOn: null, agent: null,
    worktree: null, question: null, stoppedReason: null, gate: null, policyPicks: [], ...fields }
}

// The File Plan fields a fix lane carries: what its text names and the open specs that plan them.
const fixFields = (f) => ({ files: f.queue_id && f.files ? f.files : null, overlaps: f.queue_id && f.overlaps ? f.overlaps : [] })

// The batch: every unblocked /spec:run entry in queue order up to a boundary (a brief dependency); then,
// when none was met, the first remaining entry is the boundary (a queue prompt or non-run spec ends the
// batch, a blocked spec waits). Shared files never end a batch. Returns { members: [entry], stopBefore }.
function deriveBatch(nextJson, startable, serialized) {
  const members = []
  const entries = nextJson.filter((e) => !(e.action === '/spec:fix' || String(e.action).startsWith('/spec:fix ')))
  for (const e of entries) {
    const stop = (reason) => ({ path: e.path, reason })
    if (!isRun(e) || !startable.has(e.path)) continue
    // A brief that depends on a member's brief is a dependency the batch cannot meet in one wave.
    const dep = serialized.find((x) => x.path === e.path && /^brief \S+ depends on /.test(x.reason))
    if (dep) return { members, stopBefore: stop('blocked: ' + dep.reason) }
    members.push(e)
  }
  const cmdWord = (e) => (String(e.action).match(/^\/\S+/) || ['queue'])[0]
  for (const e of entries) {
    if (isRun(e)) continue
    if (e.queue) {
      const id = (String(e.note).match(/^queue item (q\d+)$/) || [])[1] || e.path
      return { members, stopBefore: { path: id, reason: `${cmdWord(e)} item heads the queue` } }
    }
    if (e.blockers && e.blockers.length) return { members, stopBefore: { path: e.path, reason: 'blocked: ' + e.blockers[0] } }
    return { members, stopBefore: { path: e.path, reason: `${e.action} item heads the queue` } }
  }
  return { members, stopBefore: null }
}

const isRun = (e) => e.action === '/spec:run' && !(e.blockers && e.blockers.length)

function parkedNote(e, notes) {
  const wt = worktreeOf('spec/' + stemOf(e.path))
  if (wt) notes.push(`⏸ ${e.path} parked in ${wt} — finish it there in-session`)
  return !!wt
}

// Tables the batch the entries derive (deriveBatch — the one boundary validation, AUTO's and a pick's), then the
// fix group (queued items first, then red-CI rows; a gated item waits on its blocker), and saves.
function makeState(entries, by, notes, lanesJson, pick) {
  const table = []
  const asLane = (e, state, waitingOn) => table.push(newLane('', 'run', { spec: e.path, brief: e.brief, branch: 'spec/' + stemOf(e.path), state, waitingOn: waitingOn || null }))
  const tableRun = (e) => {
    const lane = lanesJson.lanes.find((x) => x.path === e.path)
    const ser = lanesJson.serialized.find((x) => x.path === e.path)
    if (lane) { if (!parkedNote(lane, notes)) asLane(lane, 'planned') }
    else if (ser) asLane(ser, 'waiting', ser.reason)
  }
  const b = deriveBatch(entries, new Set(entries.filter(isRun).map((e) => e.path)), lanesJson.serialized)
  b.members.forEach(tableRun)
  const left = pick ? entries.filter((e) => !b.members.includes(e)) : []
  if (left.length) notes.push(`⏭ left for a later run: ${left.map((e) => stemOf(e.path)).join(', ')}`)
  const batch = { members: table.map((l) => l.spec), stopBefore: b.stopBefore, by }
  table.forEach((l, i) => { l.id = 'L' + (i + 1) })
  const fixes = [...lanesJson.fixes.filter((f) => f.queue_id), ...lanesJson.fixes.filter((f) => !f.queue_id)]
  fixes.forEach((f, i) => {
    const sha = f.queue_id ? null : ((String(f.note).match(/@([0-9a-f]{7,40})/) || [])[1] || 'unknown').slice(0, 7)
    table.push(newLane('F' + (i + 1), 'fix', {
      spec: f.path, branch: f.queue_id ? 'fix/' + f.queue_id : 'fix/ci-' + sha, queueId: f.queue_id || undefined, ci: sha || undefined, note: f.note,
      ...fixFields(f),
      ...(f.queue_id && f.blocker ? { state: 'waiting', waitingOn: f.blocker } : {}),
    }))
  })
  const st = { version: 1, startedAt: nowIso(), admitted: false, batch, ...(pick ? { pick } : {}), notes, queued: [], lanes: table, lastGate: null }
  if (!table.length) { out([header('PLAN'), '## Step: plan the lanes', ...notes, 'no startable lanes — nothing to fan out; check `node "$(spec-paths spec-status)" --next`']); process.exit(0) }
  save(st)
  return st
}

// A bare run derives the batch; --pick writes the PICK state, or — with fewer than two candidates — tables the one
// spec (or the fix group alone) under a 📌 line, there being nothing to choose.
function plan(pickMode) {
  const lanesJson = statusJson(['--lanes', '--json'])
  const nextJson = statusJson(['--next', '--json']).next
  const notes = []
  if (!pickMode) return makeState(nextJson, 'derived', notes, lanesJson)
  const cands = nextJson.filter(isRun).filter((e) => !parkedNote(e, notes))
  if (cands.length < 2) return makeState(cands, 'pick', notes, lanesJson)
  const words = (e) => stemOf(e.path).replace(/^\d+-/, '').replace(/-/g, ' ')
  const label = (e) => cands.filter((x) => words(x) === words(e)).length > 1 ? stemOf(e.path) : words(e)
  const shown = Math.min(cands.length, 16)
  const st = { version: 1, startedAt: nowIso(), admitted: false, batch: null,
    pick: { candidates: cands.slice(0, shown).map((e) => ({ path: e.path, brief: e.brief, label: label(e) })), shown, startable: cands.length },
    notes, queued: [], lanes: [], lastGate: null }
  save(st)
  return st
}

// PICK: ceil(shown / 4) multiSelect questions of balanced size; each option says where the derived batch puts it.
function printPick(st) {
  const lanesJson = statusJson(['--lanes', '--json'])
  const nextJson = statusJson(['--next', '--json']).next
  const b = deriveBatch(nextJson, new Set(nextJson.filter(isRun).map((e) => e.path)), lanesJson.serialized)
  const where = (p) => {
    const ser = lanesJson.serialized.find((x) => x.path === p)
    if (b.stopBefore && b.stopBefore.path === p) return `the derived batch stops here: ${b.stopBefore.reason}`
    return !b.members.some((e) => e.path === p) ? 'after the derived boundary' : ser ? `waits: ${ser.reason}` : 'in the derived batch'
  }
  const { candidates, shown, startable } = st.pick
  const g = Math.ceil(shown / 4)
  const questions = []
  for (let i = 0, at = 0; i < g; i++) {
    const n = Math.floor(shown / g) + (i < shown % g ? 1 : 0)
    questions.push({ question: `Which of these specs should this fan-out run? Tick any — group ${i + 1} of ${g}.`, header: `Pick ${i + 1}/${g}`, multiSelect: true,
      options: candidates.slice(at, at += n).map((c) => ({ label: c.label, description: `${c.path} — brief ${briefLabel(c.brief)}; ${where(c.path)}` })) })
  }
  out([header('PICK'), '## Step: pick the batch', ...st.notes, 'Ask ONE AskUserQuestion:', 'AskUserQuestion ' + JSON.stringify({ questions }, null, 2),
    `Then: ${cmd('--mark picked --label "<label>" [--label "<label>"…]')}`,
    ...(startable > shown ? [`${shown} of ${startable} startable specs shown — the rest come after this run`] : []),
    `(to switch to the derived batch, delete ${STATE_FILE} and run bare)`])
}

// The state file keeps the --lanes --json string-or-null; parse at read.
function briefLabel(raw) { return briefNum(parseBrief(raw)) || '—' }

function printPlan(st) {
  const rows = st.lanes.map((l) => {
    const what = l.kind === 'fix' ? `fix ${l.queueId || 'ci-' + l.ci}` : l.spec
    const tail = l.kind === 'fix' ? '' : `brief ${briefLabel(l.brief)}  `
    return `${l.id.padEnd(3)} ${what}  ${tail}${l.branch}${l.state === 'waiting' ? `  (waiting: ${l.waitingOn})` : ''}`
  })
  const b = st.batch
  const stems = b.members.map(stemOf).join(', ')
  const stop = b.stopBefore ? `stops before ${stemOf(b.stopBefore.path || '')} (${b.stopBefore.reason})` : null
  const pin = b.by === 'derived' ? [`📌 Auto-picked batch: ${stems} — ${stop || 'the whole queue'} (veto: /spec:fanout --pick)`]
    : st.pick ? [`✅ Picked batch: ${stems} — ${stop || 'the whole pick'}`]
    : [`📌 Auto-picked ${b.members.length ? 'the one startable spec ' + stems + ' — nothing else to choose' : 'the fix group alone — no startable spec'} (veto anytime)`]
  out([header('PLAN'), '## Step: plan the lanes', ...pin, ...rows, ...st.notes,
    `Then: ${cmd('--mark planned')}`, `(to change the set, delete ${STATE_FILE} and re-run)`])
}

// ---- DISPATCH --------------------------------------------------------------------------------

function workerPrompt(l) {
  const first = l.kind === 'fix' ? `/spec:fix ${l.queueId || '@' + l.spec}` : `/spec:run ${l.spec}`
  return [
    `Lane ${l.id} — run ${l.kind === 'fix' ? first : l.spec} to its next stop. You are in your own worktree; first run`,
    `\`git switch ${l.branch} 2>/dev/null || git switch -c ${l.branch}\`, then`,
    `\`node "$(spec-paths pending-question)" mark --root .\` (marks this worktree as a lane), then \`${first}\`.`,
    ...(l.kind === 'fix' && !l.queueId ? [`CI note: ${l.note}`] : []),
    'Stop and report as soon as the driver prints one of: PENDING_QUESTION, MERGE_READY, STOPPED, DONE —',
    'your final line is that driver line verbatim. Never write an answer into .claude/pending-question.json',
    'and never guess an answer (core § Delegated Stops); the parent session relays it and resumes you.',
    'A mark prints the next step — act on that print, never re-run the driver bare to see it again. Write',
    'files with the Write tool and run each driver line as one plain command (the worktree guard refuses',
    'a heredoc combined with a driver call).',
  ].join('\n')
}

function printDispatch(st) {
  const lanes = dispatchable(st)
  const agentLine = agentCall(root, 'lanes', 'general-purpose', { isolation: 'worktree', background: true })
  const lines = [header('DISPATCH'), `## Step: dispatch ${lanes.length} lanes`,
    'Issue these Agent calls in ONE message (they run in the background); give each a name and use it as <name> below.']
  for (const l of lanes) lines.push('', `### Lane ${l.id} — ${labelOf(l)}`, agentLine, 'prompt:', workerPrompt(l))
  lines.push('', ...lanes.map((l) => `Then: ${cmd(`--mark dispatched --lane ${l.id} --agent <name>`)}`))
  out(lines)
}

// ---- RELAY -----------------------------------------------------------------------------------

function py(script, args) { return spawnSync(process.execPath, [path.join(DIR, script), ...args], { encoding: 'utf8' }) }

function relay(st, apply) {
  const resume = [], ask = [], lines = []
  let changed = false
  for (const l of st.lanes.filter((x) => x.state === 'pending')) {
    const doc = readJson(l.question)
    if (!doc) { lines.push(`Lane ${l.id}: the pending file ${l.question} is gone — run ${cmd(`--mark returned --lane ${l.id}`)}`); continue }
    if (apply && !doc.dismissed) {
      const g = py('question-style-gate.js', ['--file', l.question])
      if (g.status === 2) {
        const first = ((g.stderr || '').split('\n').find((x) => x.startsWith('- ')) || '- unreadable').slice(2)
        l.state = 'stopped'; l.stoppedReason = `malformed question: ${first}`; changed = true
        lines.push(`Lane ${l.id}: stopped — ${l.stoppedReason}`)
        continue
      }
    }
    const open = doc.questions.filter((q) => !(doc.answers || {})[q.id])
    if (doc.dismissed || !open.length) resume.push(l)
    else if (apply) open.forEach((q) => ask.push({ lane: l, q }))
    else lines.push(`Lane ${l.id}: ${open.length} question(s) still open — run ${cmd('').trim()} (no mark) to relay them`)
  }
  if (changed) save(st)
  for (const l of resume) {
    lines.push(`SendMessage {to: "${l.agent}", message: "Lane ${l.id}: the answer is recorded in ${l.question} — re-run the driver and continue to the next stop"}`,
      `Then: ${cmd(`--mark resumed --lane ${l.id}`)}`)
  }
  for (let i = 0; i < ask.length; i += 4) {
    const block = { questions: ask.slice(i, i + 4).map(({ lane, q }) => ({
      question: `Lane ${lane.id}, ${lane.spec || labelOf(lane)}: ${q.question}`, header: `${lane.id} · ${q.id}`, multiSelect: false,
      options: q.options.map((o) => ({ label: o.label, description: o.description })),
    })) }
    lines.push('Ask ONE AskUserQuestion:', 'AskUserQuestion ' + JSON.stringify(block, null, 2))
  }
  if (ask.length) {
    for (const { lane, q } of ask) lines.push(`Then: ${cmd(`--mark answered --lane ${lane.id} --id ${q.id} --label "<chosen label>"`)}`)
    for (const lane of new Set(ask.map((a) => a.lane))) lines.push(`Or to dismiss a lane's question: ${cmd(`--mark dismissed --lane ${lane.id}`)}`)
  }
  return lines
}

// ---- MERGE / gate ----------------------------------------------------------------------------

// The main root's checked-out branch — the landing target.
const targetBranch = () => git(['symbolic-ref', '--short', 'HEAD']).stdout.trim()

// Paths with an unmerged status (UU, AA, DU, …) in a lane's worktree, sorted.
function unmergedPaths(wt) {
  return git(['status', '--porcelain'], wt).stdout.split('\n').filter((x) => x.length > 3 && (/U/.test(x.slice(0, 2)) || x.slice(0, 2) === 'AA' || x.slice(0, 2) === 'DD'))
    .map((x) => x.slice(3)).sort()
}

// MERGE: a bare run lands the first merge-ready lane (rebase onto the target, fast-forward) with
// merge-back's rebase-ff; a mark only prints the step.
function printMerge(st, apply) {
  const dirty = git(['status', '--porcelain']).stdout.split('\n').filter(Boolean).map((x) => x.slice(3))
  if (dirty.length) die(`the main root is dirty — merge-back refuses a dirty root by design: ${dirty.join('\n')}; commit them on a branch or move them to the session scratchpad (core § On-Disk Handoff), then re-run`)
  const l = st.lanes.find((x) => x.state === 'merge-ready' && (!isRed(st) || x.repairs === st.lastGate.lane))
  const target = targetBranch()
  if (!apply) return out([header('MERGE'), `## Step: merge ${l.id}`, `Then: ${cmd('').trim()} — lands ${l.branch} (rebase onto ${target}, fast-forward)`])
  if (!l.worktree) die(`lane ${l.id} has no recorded worktree — run ${cmd(`--mark returned --lane ${l.id}`)}, then re-run the driver bare`)
  const r = spawnSync('bash', [path.join(DIR, 'merge-back.sh'), 'merge', '--root', root, '--target', target, '--source', l.branch, '--strategy', 'rebase-ff', '--worktree', l.worktree], { encoding: 'utf8' })
  if (r.status === 3) return conflicted(st, l, target)
  if (r.status !== 0) die(`merge-back rebase-ff failed for ${l.id} (exit ${r.status}):\n${((r.stdout || '') + (r.stderr || '')).trim()}\nfix the cause, then re-run the driver bare`)
  const note = (r.stdout || '').split('\n').map((x) => x.trim()).filter(Boolean).pop() || `landed ${l.branch}`
  const lines = [header('MERGE'), `## Step: merge ${l.id}`, note, `git worktree unlock ${l.worktree}`]
  if (l.kind !== 'fix') lines.push(`run from ${mainRoot}: node "$(spec-paths review-driver)" ${l.worktree}/${l.spec} — its MERGE step finds ${l.branch} already landed; mark merge-strategy rebase-ff (promotion and cleanup)`)
  lines.push(`then: ${cmd(`--mark merged --lane ${l.id}`)}`)
  out(lines)
}

// Exit 3: the rebase stays in progress in the lane's worktree and the lane goes back to its worker;
// a second conflict against the same main aborts the rebase and stops the lane.
function conflicted(st, l, target) {
  const sha = git(['rev-parse', 'HEAD']).stdout.trim()
  if (l.rebaseHead === sha) {
    git(['rebase', '--abort'], l.worktree)
    l.state = 'stopped'
    l.stoppedReason = `rebase conflict unresolved twice on ${sha.slice(0, 7)} — resume by hand: cd ${l.worktree} && git rebase ${target}`
    rolling(st)
    save(st)
    return printStep(st, true)
  }
  l.state = 'conflicted'
  l.conflicts = unmergedPaths(l.worktree)
  l.rebases = (l.rebases || 0) + 1
  l.rebaseHead = sha
  save(st)
  printRebase(st)
}

// REBASE: re-prints the send-back step for the first conflicted lane; changes nothing.
function printRebase(st) {
  const l = st.lanes.find((x) => x.state === 'conflicted' && (!isRed(st) || x.repairs === st.lastGate.lane))
  const g = gateOf(l).gate || 'the host gate, by hand'
  const again = l.kind === 'fix' ? 'report MERGE_READY' : `run \`/spec:run ${l.spec}\` again and report its MERGE_READY line verbatim`
  out([header('REBASE'), `## Step: send ${l.id} back to rebase`,
    `SendMessage {to: "${l.agent}", message: "Lane ${l.id}: main moved and ${l.branch} conflicts with it in ${(l.conflicts || []).join(', ')} — a rebase is in progress in your worktree. Resolve each conflicted file by intent (never a mechanical pick), \`git add\` it and \`git rebase --continue\` until the rebase ends; then run the gate \`${g}\` and repair what it reds; then ${again} — or STOPPED with the reason when the conflict cannot be resolved by intent."}`,
    `Then: ${cmd(`--mark resumed --lane ${l.id}`)}`])
}

// The gate command a lane's landing is judged by: { gate, why } (gate null with the remedy in why).
function gateOf(l) {
  const cfg = readConfig(root)
  let gate = null
  let why = null
  if (l.kind === 'fix') {
    gate = [cfg.testCommand, cfg.postGateCommand].find((c) => typeof c === 'string' && c) || null
    if (!gate) why = 'gate unavailable for a fix lane — run it by hand'
  } else if (typeof cfg.gateCommand !== 'string' || !cfg.gateCommand) why = 'no gateCommand declared — run the gate by hand'
  else {
    let text = ''
    try { text = fs.readFileSync(path.join(root, l.spec), 'utf8') } catch (e) { text = '' }
    const r = resolveGate(text, cfg)
    gate = r.gate
    if (!gate) why = `gate unavailable — ${r.reason}; run it by hand`
  }
  return { gate, why }
}

function runGate(l) {
  const cfg = readConfig(root)
  const { gate, why } = gateOf(l)
  if (!gate) return { result: null, log: null, why }
  fs.mkdirSync(WORK_DIR, { recursive: true })
  const log = path.join(WORK_DIR, `${l.id}.gate.log`)
  // The merged main tree may be one a lane's review already judged green: reuse that run (a red is
  // never recorded), else spawn and record a green counted one (specs/20261103/12 D9).
  let tree = null
  try { tree = runCache.cacheTree(root, []) } catch (e) { tree = null }
  const hit = tree ? runCache.lookup(root, gate, tree) : null
  if (hit) {
    fs.writeFileSync(log, `$ ${gate}\n== reused cache:${tree.slice(0, 7)}\n`)
    return { result: 'green', log, why: null }
  }
  const r = runHost(gate, { cwd: root, encoding: 'utf8' }, `the gate after merging ${l.id}`)
  const output = `${r.stdout || ''}${r.stderr || ''}`
  fs.writeFileSync(log, `$ ${gate}\n${output}`)
  if (tree && r.status === 0) {
    const caps = cfg.capabilities || {}
    runCache.record(root, gate, tree, {
      exit: 0,
      observed: { ...computeSkips(output, caps.skipReportPattern), testsExecuted: computeTestsExecuted(output, caps.testCountPattern) },
    })
  }
  return { result: r.status === 0 ? 'green' : 'red', log, why: null }
}

function printMergeRed(st) {
  const g = st.lastGate
  const line = `main gate red after merging ${g.lane}: ${g.log}`
  const red = laneOf(st, g.lane)
  const origin = typeof red.spec === 'string' ? ` --origin ${red.spec} --stage fanout` : ''
  out([header('MERGE_RED'), `## MERGE_RED — main gate red after ${g.lane}`, `log: ${g.log}`,
    `node "$(spec-paths spec-queue)" add "${line}" --lane fix --top${origin} --trigger gate-red`,
    'then re-run the driver bare: the item is tabled as the repair lane and dispatched onto the red main — the one lane a red main admits',
    `repaired another way (a Direct change landed through a branch): ${cmd('--mark gate-repaired')}`])
}

// ---- rolling admission, REPORT ---------------------------------------------------------------

// One --lanes query after a landing: promote waiting lanes, then append the fixes born of this batch
// (its stamp, an unmet gate absent, an origin naming a landed run lane). Under a red main only the
// repair births are admitted. True when the table changed.
const nextFixId = (st) => 'F' + (Math.max(0, ...st.lanes.filter((l) => /^F\d+$/.test(l.id)).map((l) => Number(l.id.slice(1)))) + 1)

function rolling(st) {
  const j = statusJson(['--lanes', '--json'])
  let changed = false
  const tabled = (f) => st.lanes.some((l) => l.queueId === f.queue_id)
  if (isRed(st)) {
    for (const f of j.fixes) {
      if (!f.queue_id || f.trigger !== 'gate-red' || f.batch !== st.startedAt || f.blocker !== null || tabled(f)) continue
      st.lanes.push(newLane(nextFixId(st), 'fix', { branch: 'fix/' + f.queue_id, queueId: f.queue_id, note: f.note, ...fixFields(f), repairs: st.lastGate.lane }))
      changed = true
    }
    return changed
  }
  for (const l of st.lanes.filter((x) => x.state === 'waiting')) {
    if (l.kind === 'fix') {
      const f = j.fixes.find((x) => x.queue_id === l.queueId)
      if (!f) { l.state = 'stopped'; l.stoppedReason = `queue item ${l.queueId} is no longer pending`; changed = true }
      else if (f.blocker === null) { l.state = 'planned'; l.waitingOn = null; changed = true }
      continue
    }
    const e = j.lanes.find((x) => x.path === l.spec)
    if (e && !e.worktree) { l.state = 'planned'; l.waitingOn = null; changed = true }
  }
  const landed = new Set(st.lanes.filter((l) => l.kind === 'run' && (l.state === 'merged' || l.state === 'done')).map((l) => l.spec))
  for (const f of j.fixes) {
    if (!f.queue_id || tabled(f) || f.batch !== st.startedAt || f.blocker !== null || !f.origin || !landed.has(f.origin.spec)) continue
    st.lanes.push(newLane(nextFixId(st), 'fix', { spec: f.path, branch: 'fix/' + f.queue_id, queueId: f.queue_id, note: f.note, ...fixFields(f) }))
    changed = true
  }
  return changed
}

function tickQueued(id) {
  const q = spawnSync(process.execPath, [path.join(DIR, 'spec-queue.js'), 'done', id], { cwd: root, encoding: 'utf8' })
  if (q.status !== 0) writeOut(1, `⚠️ spec-queue done ${id} failed: ${((q.stderr || '') + (q.stdout || '')).trim()} — tick it by hand: node "$(spec-paths spec-queue)" done ${id}\n`)
}

// A green gate means the repair is on main: this run's gate-red births are ticked.
function tickGateRed(st) {
  for (const f of statusJson(['--lanes', '--json']).fixes) if (f.queue_id && f.trigger === 'gate-red' && f.batch === st.startedAt) tickQueued(f.queue_id)
}

function printReport(st) {
  const done = st.lanes.filter((l) => l.state === 'merged' || l.state === 'done')
  const stopped = st.lanes.filter((l) => l.state === 'stopped')
  const waiting = st.lanes.filter((l) => l.state === 'waiting')
  const bullets = st.lanes.map((l) => {
    const name = l.kind === 'fix' ? l.branch : l.spec
    if (l.state === 'merged') return `${name}: merged (gate ${l.gate || 'unavailable'}${l.rebases > 0 ? `, rebased ×${l.rebases}` : ''})`
    if (l.state === 'done') return `${name}: done`
    if (l.state === 'stopped') return `${name}: stopped — ${l.stoppedReason}`
    const dep = st.lanes.find((d) => d.state === 'stopped' && d.id !== l.id && d.spec && ((l.kind !== 'fix' && relateBriefs(parseBrief(d.brief), parseBrief(l.brief)).relation === 'same') || String(l.waitingOn).includes(d.spec)))
    return `${name}: not started — waited on ${dep ? `${dep.spec}, which stopped` : l.waitingOn}`
  })
  const clean = !stopped.length && !waiting.length
  const text = clean ? `fan-out complete — ${done.length} merged`
    : `fan-out finished with stops — ${done.length} merged, ${stopped.length} stopped${waiting.length ? `, ${waiting.length} not started` : ''}`
  const warns = st.lanes.flatMap((l) => (l.policyPicks || []).map((a) => `policy applied — stops.${a.key}: ${a.label} (${l.id}, ${l.kind === 'fix' ? labelOf(l) : stemOf(l.spec)})`))
  const sb = st.batch && st.batch.stopBefore
  if (sb) warns.push(`batch stopped before ${stemOf(sb.path || '')} — ${sb.reason}; the next bare run starts the next batch`)
  const born = statusJson(['--lanes', '--json']).born || []
  const line = (b) => originLine({ origin: b.origin, trigger: b.trigger })
  if (sb && / item heads the queue$/.test(sb.reason)) {
    if (/^q\d+$/.test(sb.path || '')) {
      const item = statusJson(['--next', '--json']).next.find((e) => e.note === `queue item ${sb.path}`)
      const b = born.find((x) => x.id === sb.path)
      bullets.unshift(`${sb.path}  ${item ? item.action : sb.reason.replace(/ item heads the queue$/, '')} heads the queue — ${sb.reason}; run it attended`, ...(b ? [`   ${line(b)}`] : []))
    } else bullets.unshift(`${sb.reason.replace(/ item heads the queue$/, '')} @${sb.path} heads the queue — ${sb.reason}; run it attended`)
  }
  const mine = born.filter((b) => b.batch === st.startedAt)
  const births = [...mine.filter((b) => b.origin && b.origin.stage === 'plan'), ...mine.filter((b) => !(b.origin && b.origin.stage === 'plan'))]
  const payloads = new Set(births.map((b) => String(b.action).replace(/^(\/\S+|📌 decide:)\s+/, '')))
  const queued = [...births.map((b) => `${b.id}  ${b.action}  ${line(b)}`), ...st.queued.filter((q) => !payloads.has(q))]
  const next = statusNextText()
  const slots = { outcome: { anchor: clean ? '✅' : '⚠️', text }, bullets, warns, queued,
    next: next.trim() ? { kind: 'status-verbatim', text: next } : { kind: 'none', reason: 'spec-status printed no next step' } }
  writeJson(REPORT_FILE, slots)
  out([header('REPORT'), '## Step: report', `node "$(spec-paths report-render)" --slots ${REPORT_FILE}`,
    `Then: ${cmd('--mark reported')}`])
}

function printWait(st) {
  const running = st.lanes.filter((l) => ACTIVE.includes(l.state))
  out([header('WAIT'), `## WAIT — ${running.length} lanes running`,
    ...running.map((l) => `${l.id}  ${labelOf(l)}  ${l.state}${l.agent ? `  agent ${l.agent}` : ''}`),
    'Nothing to do until a lane returns. On each task notification for a lane run:',
    ...running.filter((l) => l.state === 'dispatched').map((l) => `  ${cmd(`--mark returned --lane ${l.id}`)}`)])
}

function printStep(st, apply) {
  let state = deriveState(st)
  // A bare run at REPORT admits what the last landing left promotable or born before reporting.
  if ((state === 'REPORT' || state === 'MERGE_RED') && apply && rolling(st)) { save(st); state = deriveState(st) }
  if (state === 'PICK') return printPick(st)
  if (state === 'PLAN') return printPlan(st)
  if (state === 'MERGE_RED') return printMergeRed(st)
  if (state === 'DISPATCH') return printDispatch(st)
  if (state === 'RELAY') {
    const lines = relay(st, apply)
    return out([header('RELAY'), `## Step: relay ${st.lanes.filter((l) => l.state === 'pending').length} questions`, ...lines])
  }
  if (state === 'REBASE') return printRebase(st)
  if (state === 'MERGE') return printMerge(st, apply)
  if (state === 'WAIT') return printWait(st)
  return printReport(st)
}

// ---- marks -----------------------------------------------------------------------------------

function needLane(st) {
  if (!arg.lane) die('--lane <id> is required for this mark')
  return laneOf(st, arg.lane)
}

function needState(l, states, mark) {
  if (!states.includes(l.state)) die(`lane ${l.id} is ${l.state}, not ${states.join(' or ')} — --mark ${mark} does not apply; run ${cmd('').trim()} (no mark) to see the current step`)
}

function inspectReturned(l) {
  if (arg.stopped) return { state: 'stopped', reason: arg.stopped }
  const wt = worktreeOf(l.branch)
  if (!wt) return { state: 'stopped', reason: 'worktree not found' }
  l.worktree = wt
  const pending = path.join(wt, '.claude', 'pending-question.json')
  if (fs.existsSync(pending)) return { state: 'pending', question: pending }
  if (l.kind === 'fix') {
    const ahead = git(['rev-list', '--count', `HEAD..${l.branch}`]).stdout.trim()
    const clean = git(['status', '--porcelain'], wt).stdout.trim() === ''
    if (Number(ahead) > 0 && clean) return { state: 'merge-ready' }
  } else {
    const base = path.join(wt, l.spec).replace(/\.md$/, '')
    const review = readJson(path.join(base + '.review', 'review-state.json')) || {}
    const build = readJson(path.join(base + '.build', 'build-state.json')) || {}
    let status = null
    try { status = (fs.readFileSync(path.join(wt, l.spec), 'utf8').match(/^status:\s*(\S+)/m) || [])[1] } catch (e) { status = null }
    if (review.closed === true && !review.mergeConcluded) return { state: 'merge-ready' }
    if (status === 'done' && review.mergeConcluded) return { state: 'done' }
    if (build.dismissedStop || review.dismissedStop) return { state: 'stopped', reason: 'question dismissed' }
  }
  return { state: 'stopped', reason: `returned without a recognised stop — resume by hand: cd ${wt} && ${l.kind === 'fix' ? '/spec:fix' : '/spec:run ' + l.spec}` }
}

function doMerged(st, l) {
  const exists = git(['branch', '--list', l.branch]).stdout.trim() !== ''
  if (exists && git(['merge-base', '--is-ancestor', l.branch, 'HEAD']).status !== 0) die(`lane ${l.id} is not merged — run the MERGE step first`)
  const wt = l.worktree && fs.existsSync(l.worktree) ? l.worktree : null
  const pre = []
  if (exists || wt) {
    if (wt) git(['worktree', 'unlock', wt])
    const c = spawnSync('bash', [path.join(DIR, 'merge-back.sh'), 'cleanup', '--root', root, '--source', l.branch, ...(wt ? ['--worktree', wt] : [])], { encoding: 'utf8' })
    pre.push((c.stdout || '') + (c.stderr || ''))
    if (c.status !== 0) die(`merge-back.sh cleanup failed for ${l.id}: ${((c.stdout || "") + (c.stderr || "")).trim()} — finish by hand: bash "$(spec-paths merge-back)" cleanup --root ${root} --source ${l.branch}${wt ? ' --worktree ' + wt : ''}`)
  }
  const repaired = l.repairs ? laneOf(st, l.repairs) : null
  const g = repaired ? { result: null, why: null } : runGate(l)
  l.state = 'merged'
  l.gate = g.result
  if (pre.length) writeOut(1, pre.join('').trimEnd() + '\n')
  // Ticked whatever the gate colour: its work is on main either way; a red gate is queued as its own repair below.
  if (l.kind === 'fix' && l.queueId) tickQueued(l.queueId)
  if (repaired) {
    // The gate that went red is the fact being repaired: re-run it, not the fix lane's own command.
    const rg = runGate(repaired)
    l.gate = rg.result
    if (rg.result === 'red') {
      st.lastGate.log = rg.log
      rolling(st)
      return
    }
    repaired.gate = rg.result
    st.lastGate = null
    st.queued = st.queued.filter((q) => !q.startsWith(`main gate red after merging ${repaired.id}: `))
    if (rg.why) writeOut(1, rg.why + '\n')
    tickGateRed(st)
    rolling(st)
  } else if (g.result === 'red') {
    st.lastGate = { lane: l.id, result: 'red', log: g.log }
    st.queued.push(`main gate red after merging ${l.id}: ${g.log}`)
  } else {
    if (g.why) writeOut(1, g.why + '\n')
    rolling(st)
  }
}

// The picks, in queue order, go through the same makeState (deriveBatch + tableRun) the bare run uses.
function markPicked(st) {
  if (!(st.pick && !st.batch)) die(`no pick is pending — run ${cmd('--pick')} to start one`)
  const labels = st.pick.candidates.map((c) => c.label)
  if (!arg.labels.length) die(`nothing picked — tick at least one box, or delete ${STATE_FILE} and run bare for the derived batch`)
  const bad = arg.labels.find((l) => !labels.includes(l))
  if (bad !== undefined) die(`label "${bad}" matches no candidate — labels are: ${labels.join(', ')}`)
  const chosen = st.pick.candidates.filter((c) => arg.labels.includes(c.label))
  const nextJson = statusJson(['--next', '--json']).next
  const entries = chosen.map((c) => nextJson.find((e) => e.path === c.path)).filter(Boolean)
  printStep(makeState(entries, 'pick', st.notes, statusJson(['--lanes', '--json']), { ...st.pick, chosen: chosen.map((c) => c.label) }), false)
}

function doMark(st, mark) {
  if (!MARKS.includes(mark)) die(`unknown mark "${mark}" — marks are ${MARKS.join(', ')}`)
  if (!st) die(`--mark ${mark} needs a plan — run ${cmd('').trim()} (no mark) first`)
  if (mark === 'picked') return markPicked(st)
  if (mark === 'planned') {
    if (st.pick && !st.batch) die('the batch is not picked yet — answer the pick question, then run --mark picked')
    if (!st.admitted) { st.admitted = true; save(st) }
    return printStep(st, false)
  }
  if (!st.admitted) die(`the table is not admitted yet — run ${cmd('--mark planned')} first`)
  if (mark === 'gate-repaired') {
    if (!st.lastGate) die('no red gate to repair — run the driver bare to see the current step')
    const g = runGate(laneOf(st, st.lastGate.lane))
    // The gate runs for minutes: only its outcome is applied, onto the state as it is now.
    const fresh = load()
    if (!fresh || !fresh.lastGate) die('the fan-out state changed while the gate ran — run the driver bare to see the current step')
    const l = laneOf(fresh, fresh.lastGate.lane)
    if (g.result === 'red') { fresh.lastGate.log = g.log; save(fresh); return printMergeRed(fresh) }
    l.gate = g.result
    fresh.lastGate = null
    fresh.queued = fresh.queued.filter((q) => !q.startsWith(`main gate red after merging ${l.id}: `))
    tickGateRed(fresh)
    rolling(fresh)
    save(fresh)
    return printStep(fresh, false)
  }
  if (mark === 'reported') {
    if (deriveState(st) !== 'REPORT') die(`the run is not at REPORT yet — run ${cmd('').trim()} (no mark) to see the current step`)
    fs.rmSync(STATE_FILE, { force: true })
    fs.rmSync(WORK_DIR, { recursive: true, force: true })
    return out('✅ fan-out state removed — the run is over')
  }
  const l = needLane(st)
  if (mark === 'dispatched') {
    needState(l, ['planned'], mark)
    if (!arg.agent) die('--mark dispatched needs --agent <name> — the name the Agent call was given')
    l.agent = arg.agent; l.state = 'dispatched'
  } else if (mark === 'returned') {
    needState(l, ['dispatched', 'pending'], mark)
    const r = inspectReturned(l)
    l.state = r.state; l.question = r.question || null; l.stoppedReason = r.reason || null
    if (l.kind !== 'fix' && l.worktree) {
      const base = path.join(l.worktree, l.spec).replace(/\.md$/, '')
      const sides = [readJson(path.join(base + '.build', 'build-state.json')), readJson(path.join(base + '.review', 'review-state.json'))].filter(Boolean)
      l.policyPicks = sides.flatMap((x) => Array.isArray(x.policyPicks) ? x.policyPicks : [])
      // the lane's git-dir record first: the exits that set laneExit print `delete <sidecarDir>`.
      const exit = readLaneExit(l.worktree) || sides.map((x) => x.laneExit).find((x) => x && typeof x.reason === 'string')
      if (exit && l.state !== 'pending' && l.state !== 'done' && !arg.stopped) {
        l.state = 'stopped'; l.stoppedReason = exit.reason
        if (typeof exit.queued === 'string' && exit.queued) st.queued.push(exit.queued)
      }
    }
    if (l.state === 'stopped' || l.state === 'done' || isRed(st)) rolling(st)
  } else if (mark === 'answered') {
    needState(l, ['pending'], mark)
    if (!arg.id || arg.labels.length !== 1) die('--mark answered needs --id <question id> and exactly one --label <chosen label>')
    const a = py('pending-question.js', ['answer', '--root', l.worktree, '--id', arg.id, '--label', arg.labels[0], '--by', 'user'])
    if (a.status !== 0) die(`the answer was refused: ${(a.stderr || '').trim()} — use a label exactly as the question offered it`)
  } else if (mark === 'dismissed') {
    needState(l, ['pending'], mark)
    const a = py('pending-question.js', ['dismiss', '--root', l.worktree])
    if (a.status !== 0) die(`the dismissal was refused: ${(a.stderr || '').trim()}`)
  } else if (mark === 'resumed') {
    needState(l, ['pending', 'conflicted'], mark)
    l.state = 'dispatched'; l.question = null; delete l.conflicts
  } else if (mark === 'merged') {
    if (isRed(st) && l.repairs !== st.lastGate.lane) die(`main gate is red after ${st.lastGate.lane} — only its repair lane merges now; re-run ${cmd('').trim()} (no mark), or run ${cmd('--mark gate-repaired')} once it is repaired another way`)
    needState(l, ['merge-ready'], mark)
    doMerged(st, l)
  }
  save(st)
  if (mark === 'answered' || mark === 'dismissed') {
    const lines = relay(st, false).filter((x) => x.startsWith('SendMessage') || x.startsWith('Then:'))
    return out([header(deriveState(st)), `lane ${l.id}: ${mark} recorded`, ...lines])
  }
  printStep(st, false)
}

// ---- main ------------------------------------------------------------------------------------

{
  const st = load()
  if (arg.state) { out(header(deriveState(st))); process.exit(0) }
  if (arg.mark !== undefined) doMark(st, arg.mark)
  else {
    if (arg.pick && st && st.admitted) die(`a fan-out is already running — delete ${STATE_FILE} to start over`)
    printStep(!st || (arg.pick && !st.admitted) ? plan(arg.pick) : st, true)
  }
  process.exit(0)
}
