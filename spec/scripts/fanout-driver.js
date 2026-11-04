#!/usr/bin/env node
'use strict'
// fanout-driver.js [--root <dir>] [--spec <path>]… [--batch <id>[,<id>…]|all] [--include-fixes] [--override-serial] [--ask <key|all>] [--state]
// fanout-driver.js --root <dir> --mark <planned|dispatched|returned|answered|dismissed|resumed|merged|gate-repaired|reported> [flags]
//
// Owner: specs/20261102/03-one-session-runs-the-lanes.md, specs/20261103/06-the-fan-out-drains-the-queue.md — the driver behind
// /spec:fanout: one session dispatches a worktree-isolated sub-agent per lane, relays the questions
// the lanes write, merges each finished lane one at a time with the host gate re-run on main, and
// renders one report; a bare run derives the batch (the queue's startable specs up to the first
// boundary), re-queries after every landing, and reports when the batch is done. State lives in <git-common-dir>/spec-fanout.json; every step is re-derived
// from that file and the lanes' own disks, so /clear loses nothing. Prints exactly one step per run.
//
// Does NOT ask for a repair on main (a red main is repaired by a lane in its own worktree), open the queue
// file (spec-status --lanes --json is the only queue reader), answer a lane's question itself (the host's policy.stops auto-picks are printed by the
// lane's own driver; `--ask <key|all>` on the planning run relays them for one run), run a lane's driver, dispatch an agent (it prints the Agent line; the session
// issues it), derive lanes (spec-status --lanes --json does), or re-admit a spec whose lane stopped in this run
// (the next bare run after --mark reported starts the next batch), dispatch a fix lane that names no file
// beside a run lane; four lanes at once is a constant, not a flag. A bare run applies RELAY's side
// effects; a mark only records its fact and prints the next step.
//
// Exit codes: 0 step, mark or --state printed · 2 refused (run outside the main worktree, unknown
// mark, mark outside its state, a lane that is not in the table or not merged, a gate-red main, an
// unknown --ask key, a lane id missing, an unknown argument such as the retired --lanes, a --batch id
// matching no startable spec, a dirty main root at the MERGE step — merge-back refuses it by design) — stderr names the remedy.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeDie, writeJson, nowIso } = require('./lib/driver-core')
const { writeOut, runHost } = require('./lib/driver-io')
const { readConfig, readPipelineRules, agentCall, policy } = require('./lib/host-config')
const { globMatch } = require('./lib/glob-match')
const { parseFilePlan } = require('./lib/file-plan')
const { extractSection } = require('./lib/spec-sections')
const { fmValue } = require('./lib/frontmatter')
const { resolveGate } = require('./lib/gate-resolve')
const { readLaneExit } = require('./pending-question')
const { originLine } = require('./lib/queue')
const { parseBrief, relateBriefs, briefNum } = require('./lib/brief')

const SELF = __filename
const DIR = __dirname
const die = makeDie('fanout-driver')
const MARKS = ['planned', 'dispatched', 'returned', 'answered', 'dismissed', 'resumed', 'merged', 'gate-repaired', 'reported']
const ASK_KEYS = ['repairRound', 'buildEscalate', 'reviewEscalate', 'redFindings', 'rejectWithEvidence', 'all']
const LANE_CAP = 4
const ACTIVE = ['dispatched', 'pending', 'merge-ready']
const TERMINAL = ['merged', 'stopped', 'done']

const stemOf = (p) => path.basename(p).replace(/\.[^.]*$/, '')
const real = (p) => { try { return fs.realpathSync(p) } catch (e) { return path.resolve(p) } }
const { readJsonSafe: readJson } = require('./lib/util')
const out = (lines) => writeOut(1, (Array.isArray(lines) ? lines.join('\n') : lines) + '\n')

// ---- argv ------------------------------------------------------------------------------------

const VALUE_FLAGS = ['--root', '--spec', '--batch', '--mark', '--lane', '--agent', '--stopped', '--id', '--label', '--ask']
const BOOL_FLAGS = ['--include-fixes', '--override-serial', '--state']
const arg = { specs: [], ask: [] }
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (VALUE_FLAGS.includes(a)) {
      if (argv[i + 1] === undefined) die(`${a} needs a value — usage: fanout-driver.js [--root <dir>] [--spec <path>]… [--batch <ids|all>] [--include-fixes] [--override-serial] [--ask <key|all>] | --mark <m> [flags] | --state`)
      if (a === '--spec') arg.specs.push(argv[++i])
      else if (a === '--ask') {
        const k = argv[++i]
        if (!ASK_KEYS.includes(k)) die(`--ask "${k}" is not a stop key — use one of ${ASK_KEYS.join(', ')}`)
        arg.ask.push(k)
      }
      else arg[a.slice(2)] = argv[++i]
    } else if (BOOL_FLAGS.includes(a)) arg[a.slice(2)] = true
    else die(`unknown argument ${a} — usage: fanout-driver.js [--root <dir>] [--spec <path>]… [--batch <ids|all>] [--include-fixes] [--override-serial] [--ask <key|all>] | --mark <m> [flags] | --state`)
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
const common = (() => {
  const r = git(['rev-parse', '--git-common-dir'])
  return path.resolve(root, r.stdout.trim())
})()
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
  if (!st || !st.admitted) return 'PLAN'
  const pending = st.lanes.some((l) => l.state === 'pending')
  // A red main outranks DISPATCH, so no lane but its repair lane is dispatched onto it; a pending question still relays;
  // a landing precedes a new dispatch so the lane branches from the newest main.
  if (isRed(st)) {
    if (pending) return 'RELAY'
    if (repairLane(st, 'planned')) return 'DISPATCH'
    if (repairLane(st, 'dispatched')) return 'WAIT'
    return repairLane(st, 'merge-ready') ? 'MERGE' : 'MERGE_RED'
  }
  if (pending) return 'RELAY'
  if (st.lanes.some((l) => l.state === 'merge-ready')) return 'MERGE'
  if (dispatchable(st).length) return 'DISPATCH'
  if (st.lanes.some((l) => l.state === 'dispatched' || l.state === 'planned')) return 'WAIT'
  return 'REPORT'
}

const header = (state) => `[fanout-driver] state: ${state}  root: ${root}`
const cmd = (rest) => `node ${SELF} --root ${root} ${rest}`
const laneOf = (st, id) => {
  const l = st.lanes.find((x) => x.id === id)
  if (!l) die(`no lane ${id} in the table — lanes are ${st.lanes.map((x) => x.id).join(', ') || '(none)'}`)
  return l
}
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

const readSpec = (p) => { try { return fs.readFileSync(path.join(root, p), 'utf8') } catch (e) { return '' } }

// Backticked paths inside the host rules file's `## Risk Tiers` section; missing config, file or section → none.
function riskTierPaths() {
  const r = readPipelineRules(root)
  if (!r.ok) return new Set()
  const sec = extractSection(r.text, 'Risk Tiers')
  return new Set(sec ? [...sec.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]) : [])
}

// The batch: first every unblocked /spec:run entry in queue order up to a boundary (self-surface,
// critical sharing a Risk Tiers file, a brief dependency); then, when none was met, the first remaining
// entry is the boundary (a queue prompt or non-run spec ends the batch, a blocked spec waits).
// Returns { members: [entry], stopBefore }.
function deriveBatch(nextJson, startable, serialized) {
  const globs = policy(root).fanout.selfSurfaces
  const tiers = riskTierPaths()
  const members = []
  const plans = new Map()
  const entries = nextJson.filter((e) => !(e.action === '/spec:fix' || String(e.action).startsWith('/spec:fix ')))
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const stop = (reason) => ({ path: e.path, reason })
    if (e.action !== '/spec:run' || (e.blockers && e.blockers.length)) continue
    if (!startable.has(e.path)) continue
    // A brief that depends on a member's brief is a dependency the batch cannot meet in one wave.
    const dep = serialized.find((x) => x.path === e.path && /^brief \S+ depends on /.test(x.reason))
    if (dep) return { members, stopBefore: stop('blocked: ' + dep.reason) }
    const text = readSpec(e.path)
    const filePlan = parseFilePlan(text)
    const self = filePlan.find((f) => globs.some((g) => globMatch(g, f)))
    if (self) {
      if (members.length) return { members, stopBefore: stop('touches pipeline self-surface ' + self) }
      members.push(e)
      const nxt = entries[i + 1]
      return { members, stopBefore: nxt ? { path: nxt.path, reason: 'self-surface runs alone' } : null }
    }
    if (fmValue(text, 'tier') === 'critical') {
      for (const f of filePlan) {
        if (!tiers.has(f)) continue
        const other = members.find((m) => plans.get(m.path).includes(f))
        if (other) return { members, stopBefore: stop(`critical: shares Risk Tiers path ${f} with ${stemOf(other.path)}`) }
      }
    }
    plans.set(e.path, filePlan)
    members.push(e)
  }
  const cmdWord = (e) => (String(e.action).match(/^\/\S+/) || ['queue'])[0]
  for (const e of entries) {
    if (e.action === '/spec:run' && !(e.blockers && e.blockers.length)) continue
    if (e.queue) {
      const id = (String(e.note).match(/^queue item (q\d+)$/) || [])[1] || e.path
      return { members, stopBefore: { path: id, reason: `${cmdWord(e)} item heads the queue` } }
    }
    if (e.blockers && e.blockers.length) return { members, stopBefore: { path: e.path, reason: 'blocked: ' + e.blockers[0] } }
    return { members, stopBefore: { path: e.path, reason: `${e.action} item heads the queue` } }
  }
  return { members, stopBefore: null }
}

function plan() {
  const lanesJson = statusJson(['--lanes', '--json'])
  const notes = []
  const table = []
  let batch = null
  const asLane = (e, state, waitingOn) => newLane('', 'run', { spec: e.path, brief: e.brief, branch: 'spec/' + stemOf(e.path), state, waitingOn: waitingOn || null })
  const parked = (e) => {
    const wt = worktreeOf('spec/' + stemOf(e.path))
    if (wt) notes.push(`⏸ ${e.path} parked in ${wt} — finish it there in-session`)
    return !!wt
  }
  // One member tabled as --spec tables it: planned when in lanes, waiting with the reason when serialized
  // (--override-serial keeps admitting shared-brief members as planned); a blocked member waits on its blockers.
  const tableMember = (e, ser, lane) => {
    if (lane) { if (!parked(lane)) table.push(asLane(lane, 'planned')) }
    else if (ser && arg['override-serial'] && /^shared brief/.test(ser.reason)) { if (!parked(ser)) table.push(asLane(ser, 'planned')) }
    else if (ser) table.push(asLane(ser, 'waiting', ser.reason))
    else if (e && e.blockers && e.blockers.length) table.push(asLane(e, 'waiting', e.blockers.join('; ')))
    else return false
    return true
  }
  const nextJson = statusJson(['--next', '--json']).next
  if (arg.specs.length && arg.batch) die('--spec and --batch both pick the batch — pass one of them, or neither to derive it')
  if (arg.specs.length) {
    for (const raw of arg.specs) {
      const p = raw.replace(/^\.\//, '').replace(root + '/', '')
      if (table.some((l) => l.spec === p)) continue
      const lane = lanesJson.lanes.find((e) => e.path === p)
      const ser = lanesJson.serialized.find((e) => e.path === p)
      const nxt = nextJson.find((e) => e.path === p)
      if (nxt && nxt.action !== '/spec:run' && !lane && !ser) notes.push(`⛔ ${p} — next step is ${nxt.action}, not /spec:run`)
      else if (!tableMember(nxt && nxt.action === '/spec:run' ? nxt : null, ser, lane)) notes.push(`⛔ ${p} — not a startable lane`)
    }
    batch = { members: table.map((l) => l.spec), stopBefore: null, by: 'spec-flags' }
  } else {
    const runs = nextJson.filter((e) => e.action === '/spec:run' && !(e.blockers && e.blockers.length))
    const tableRun = (e) => tableMember(e, lanesJson.serialized.find((x) => x.path === e.path), lanesJson.lanes.find((x) => x.path === e.path))
    if (arg.batch) {
      let picked = runs
      if (arg.batch !== 'all') {
        picked = []
        for (const raw of arg.batch.split(',').filter(Boolean)) {
          const id = raw.replace(/^\.\//, '').replace(/\.md$/, '')
          const hits = runs.filter((e) => e.path === id + '.md' || stemOf(e.path) === stemOf(id))
          if (!hits.length) die(`--batch ${raw} matches no startable spec — startable: ${runs.map((e) => stemOf(e.path)).join(', ') || '(none)'}; check \`node "$(spec-paths spec-status)" --next\``)
          if (hits.length > 1) die(`--batch ${raw} matches more than one spec (${hits.map((e) => e.path).join(', ')}) — pass the full path`)
          if (!picked.includes(hits[0])) picked.push(hits[0])
        }
      }
      picked.forEach(tableRun)
      batch = { members: table.map((l) => l.spec), stopBefore: null, by: 'batch-flag' }
    } else {
      const b = deriveBatch(nextJson, new Set(runs.map((e) => e.path)), lanesJson.serialized)
      b.members.forEach(tableRun)
      batch = { members: table.map((l) => l.spec), stopBefore: b.stopBefore, by: 'derived' }
    }
  }
  table.forEach((l, i) => { l.id = 'L' + (i + 1) })
  if (arg['include-fixes']) {
    const fixes = [...lanesJson.fixes.filter((f) => f.queue_id), ...lanesJson.fixes.filter((f) => !f.queue_id)]
    fixes.forEach((f, i) => {
      const sha = f.queue_id ? null : ((String(f.note).match(/@([0-9a-f]{7,40})/) || [])[1] || 'unknown').slice(0, 7)
      table.push(newLane('F' + (i + 1), 'fix', {
        spec: f.path, branch: f.queue_id ? 'fix/' + f.queue_id : 'fix/ci-' + sha, queueId: f.queue_id || undefined, ci: sha || undefined, note: f.note,
        ...fixFields(f),
        ...(f.queue_id && f.blocker ? { state: 'waiting', waitingOn: f.blocker } : {}),
      }))
    })
  }
  const st = { version: 1, startedAt: nowIso(), admitted: false,
    options: { includeFixes: !!arg['include-fixes'], overrideSerial: !!arg['override-serial'], specs: arg.specs },
    batch, ask: [...new Set(arg.ask)], notes, queued: [], lanes: table, lastGate: null }
  if (!table.length) { out([header('PLAN'), '## Step: plan the lanes', ...notes, 'no startable lanes — nothing to fan out; check `node "$(spec-paths spec-status)" --next`']); process.exit(0) }
  save(st)
  return st
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
  const pin = b && b.by === 'derived'
    ? [`📌 Auto-picked batch: ${b.members.map(stemOf).join(', ')} — ${b.stopBefore ? `stops before ${stemOf(b.stopBefore.path || '')} (${b.stopBefore.reason})` : 'the whole queue'} (veto: --batch <ids|all>)`]
    : []
  out([header('PLAN'), '## Step: plan the lanes', ...pin, ...rows, ...st.notes,
    `Then: ${cmd('--mark planned')}`, `(to change the set, delete ${STATE_FILE} and re-run)`])
}

// ---- DISPATCH --------------------------------------------------------------------------------

function workerPrompt(l) {
  const first = l.kind === 'fix'
    ? `/spec:fix ${l.queueId || '@' + l.spec}` : `/spec:run ${l.spec}`
  const lines = [
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
  ]
  return lines.join('\n')
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
  const resume = []
  const ask = []
  const lines = []
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

function printMerge(st) {
  const dirty = git(['status', '--porcelain']).stdout.split('\n').filter(Boolean).map((x) => x.slice(3))
  if (dirty.length) die(`the main root is dirty — merge-back refuses a dirty root by design: ${dirty.join('\n')}; commit them on a branch or move them to the session scratchpad (core § On-Disk Handoff), then re-run`)
  const l = st.lanes.find((x) => x.state === 'merge-ready' && (!isRed(st) || x.repairs === st.lastGate.lane))
  const proto = policy(root).stops.prototypeClose
  const lines = [header('MERGE'), `## Step: merge ${l.id}`, `git worktree unlock ${l.worktree}`]
  if (l.kind === 'fix') lines.push(`/git:merge ${l.branch}`)
  else lines.push(`run from ${mainRoot}: node "$(spec-paths review-driver)" ${l.worktree}/${l.spec} — follow its MERGE step (strategy derived; ` +
    (proto === 'keep' || proto === 'delete' ? `a prototype question is answered by host policy: "${proto}"` : 'a prototype question is asked of the user') + ')')
  lines.push(`then: ${cmd(`--mark merged --lane ${l.id}`)}`)
  out(lines)
}

function runGate(l) {
  const cfg = readConfig(root)
  let gate = null
  let why = null
  if (l.kind === 'fix') {
    gate = typeof cfg.testCommand === 'string' && cfg.testCommand ? cfg.testCommand
      : typeof cfg.postGateCommand === 'string' && cfg.postGateCommand ? cfg.postGateCommand : null
    if (!gate) why = 'gate unavailable for a fix lane — run it by hand'
  } else if (typeof cfg.gateCommand !== 'string' || !cfg.gateCommand) why = 'no gateCommand declared — run the gate by hand'
  else {
    let text = ''
    try { text = fs.readFileSync(path.join(root, l.spec), 'utf8') } catch (e) { text = '' }
    const r = resolveGate(text, cfg)
    gate = r.gate
    if (!gate) why = `gate unavailable — ${r.reason}; run it by hand`
  }
  if (!gate) return { result: null, log: null, why }
  const r = runHost(gate, { cwd: root, encoding: 'utf8' }, `the gate after merging ${l.id}`)
  fs.mkdirSync(WORK_DIR, { recursive: true })
  const log = path.join(WORK_DIR, `${l.id}.gate.log`)
  fs.writeFileSync(log, `$ ${gate}\n${r.stdout || ''}${r.stderr || ''}`)
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
    const s = j.serialized.find((x) => x.path === l.spec)
    const ok = (e && !e.worktree) || (s && st.options.overrideSerial && /^shared brief/.test(s.reason))
    if (ok) { l.state = 'planned'; l.waitingOn = null; changed = true }
  }
  const landed = new Set(st.lanes.filter((l) => l.kind === 'run' && (l.state === 'merged' || l.state === 'done')).map((l) => l.spec))
  for (const f of j.fixes) {
    if (!f.queue_id || tabled(f) || f.batch !== st.startedAt || f.blocker !== null || !f.origin || !landed.has(f.origin.spec)) continue
    st.lanes.push(newLane(nextFixId(st), 'fix', { spec: f.path, branch: 'fix/' + f.queue_id, queueId: f.queue_id, note: f.note, ...fixFields(f) }))
    changed = true
  }
  return changed
}

// A green gate means the repair is on main: this run's gate-red births are ticked.
function tickGateRed(st) {
  for (const f of statusJson(['--lanes', '--json']).fixes) {
    if (!f.queue_id || f.trigger !== 'gate-red' || f.batch !== st.startedAt) continue
    const q = spawnSync(process.execPath, [path.join(DIR, 'spec-queue.js'), 'done', f.queue_id], { cwd: root, encoding: 'utf8' })
    if (q.status !== 0) writeOut(1, `⚠️ spec-queue done ${f.queue_id} failed: ${((q.stderr || '') + (q.stdout || '')).trim()} — tick it by hand: node "$(spec-paths spec-queue)" done ${f.queue_id}\n`)
  }
}

function printReport(st) {
  const done = st.lanes.filter((l) => l.state === 'merged' || l.state === 'done')
  const stopped = st.lanes.filter((l) => l.state === 'stopped')
  const waiting = st.lanes.filter((l) => l.state === 'waiting')
  const bullets = st.lanes.map((l) => {
    const name = l.kind === 'fix' ? l.branch : l.spec
    if (l.state === 'merged') return `${name}: merged (gate ${l.gate || 'unavailable'})`
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
  if (state === 'PLAN') return printPlan(st)
  if (state === 'MERGE_RED') return printMergeRed(st)
  if (state === 'DISPATCH') return printDispatch(st)
  if (state === 'RELAY') {
    const lines = relay(st, apply)
    return out([header('RELAY'), `## Step: relay ${st.lanes.filter((l) => l.state === 'pending').length} questions`, ...lines])
  }
  if (state === 'MERGE') return printMerge(st)
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
    if (c.status !== 0) die(`merge-back.sh cleanup failed for ${l.id} — finish by hand: bash "$(spec-paths merge-back)" cleanup --root ${root} --source ${l.branch}${wt ? ' --worktree ' + wt : ''}`)
  }
  const repaired = l.repairs ? laneOf(st, l.repairs) : null
  const g = repaired ? { result: null, why: null } : runGate(l)
  l.state = 'merged'
  l.gate = g.result
  if (pre.length) writeOut(1, pre.join('').trimEnd() + '\n')
  // The queued item is ticked whatever the gate colour: its work is on main either way, and a red
  // gate is queued as its own repair below.
  if (l.kind === 'fix' && l.queueId) {
    const q = spawnSync(process.execPath, [path.join(DIR, 'spec-queue.js'), 'done', l.queueId], { cwd: root, encoding: 'utf8' })
    if (q.status !== 0) writeOut(1, `⚠️ spec-queue done ${l.queueId} failed: ${((q.stderr || '') + (q.stdout || '')).trim()} — tick it by hand: node "$(spec-paths spec-queue)" done ${l.queueId}\n`)
  }
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

function doMark(st, mark) {
  if (!MARKS.includes(mark)) die(`unknown mark "${mark}" — marks are ${MARKS.join(', ')}`)
  if (!st) die(`--mark ${mark} needs a plan — run ${cmd('').trim()} (no mark) first`)
  if (mark === 'planned') {
    if (!st.admitted) {
      st.admitted = true
      save(st)
    }
    return printStep(st, false)
  }
  if (!st.admitted) die(`the table is not admitted yet — run ${cmd('--mark planned')} first`)
  if (mark === 'gate-repaired') {
    if (!st.lastGate) die('no red gate to repair — run the driver bare to see the current step')
    const g = runGate(laneOf(st, st.lastGate.lane))
    // The gate runs for minutes; marks for other lanes may land meanwhile, so only its outcome is
    // applied, onto the state as it is now.
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
    if (!arg.id || !arg.label) die('--mark answered needs --id <question id> and --label <chosen label>')
    const a = py('pending-question.js', ['answer', '--root', l.worktree, '--id', arg.id, '--label', arg.label, '--by', 'user'])
    if (a.status !== 0) die(`the answer was refused: ${(a.stderr || '').trim()} — use a label exactly as the question offered it`)
  } else if (mark === 'dismissed') {
    needState(l, ['pending'], mark)
    const a = py('pending-question.js', ['dismiss', '--root', l.worktree])
    if (a.status !== 0) die(`the dismissal was refused: ${(a.stderr || '').trim()}`)
  } else if (mark === 'resumed') {
    needState(l, ['pending'], mark)
    l.state = 'dispatched'; l.question = null
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
  else if (!st) printPlan(plan())
  else {
    const planFlags = arg.specs.length || arg.batch || arg['include-fixes'] || arg['override-serial']
    if (planFlags && st.admitted) die(`a fan-out is already running — delete ${STATE_FILE} to start over`)
    if (planFlags && !st.admitted) printPlan(plan())
    else printStep(st, true)
  }
  process.exit(0)
}
