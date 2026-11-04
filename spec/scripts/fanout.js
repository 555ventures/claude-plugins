#!/usr/bin/env node
'use strict'
// fanout.js [<spec path>…] [--root <dir>] [--mark <verb> …]
//
// Runs several hardened specs as parallel lanes from one session. Steps:
// PLAN → DISPATCH → WAIT → RELAY → MERGE (MERGE_RED) → REPORT → PLAN … until nothing is runnable.
// State: <git-common-dir>/spec-fanout.json (lib/state readFanout/writeFanout). The driver creates the
// lane worktrees, merges each finished lane into trunk one at a time with the gate after each, removes
// the worktree and ticks the queue. The session only dispatches agents and relays questions.
// Lane mode contract with run.js: architecture.md §11 "fanout.js notes".

const fs = require('fs')
const path = require('path')
const { makeDriver, parseArgv, refuse, shq } = require('./lib/driver')
const st = require('./lib/state')
const git = require('./lib/git')
const host = require('./lib/host')
const pending = require('./lib/pending')
const { render } = require('./lib/report')

const FINISHED = ['MERGE_READY', 'DONE']
const ENDED = ['PARKED', 'AMENDED'] // a lane that ended without a merge: dismissed automatically
let EXPLICIT = [] // positional spec paths of this invocation

const stemOf = (p) => path.basename(p).replace(/\.md$/, '')
const rel = (root, p) => path.relative(root, path.resolve(root, String(p).replace(/^@/, ''))).split(path.sep).join('/')
const wtAbs = (root, lane) => path.resolve(root, lane.worktree)
const laneSpec = (root, lane) => path.join(wtAbs(root, lane), lane.spec)
const now = () => new Date().toISOString()

function specDoc(file) { try { return st.readSpec(file) } catch { return null } }

function findLane(s, flags) {
  if (!flags.lane || flags.lane === true) refuse('--lane <id> is required — the ids are listed in the step body')
  const lane = s.batch.find((l) => l.id === String(flags.lane))
  if (!lane) refuse(`no lane '${flags.lane}' in this batch — known: ${s.batch.map((l) => l.id).join(', ')}`)
  return lane
}

// ---- PLAN -------------------------------------------------------------------------------------

function candidates(root) {
  const list = EXPLICIT.length ? EXPLICIT
    : st.readQueue(root).items.filter((i) => !i.done && i.kind === 'spec').map((i) => i.payload)
  return [...new Set(list.map((p) => rel(root, p)))]
}

// First come wins: a spec whose File Plan shares a path with an already-picked one waits.
function plan(root, config) {
  const cap = config.lanes
  const picked = []
  const waited = []
  const taken = new Map()
  for (const spec of candidates(root)) {
    const doc = specDoc(path.join(root, spec))
    if (!doc) { waited.push({ spec, why: 'spec file not found' }); continue }
    const status = doc.frontmatter.status || 'missing'
    if (status !== 'hardened') { if (EXPLICIT.length) waited.push({ spec, why: `status is ${status}, not hardened` }); continue }
    // A lane that parked or amended keeps its worktree and sidecar; re-running it would only
    // print the same ending, so it waits until the user removes that worktree.
    const wt = path.join(root, '.claude', 'worktrees', 'spec-' + stemOf(spec))
    const ended = (st.readRun(path.join(wt, spec)) || {}).step
    if (ENDED.includes(ended)) { waited.push({ spec, why: `its lane ended ${ended} — see the report; remove ${path.relative(root, wt)} to run it again` }); continue }
    if (picked.length >= cap) { waited.push({ spec, why: `all ${cap} lanes are taken` }); continue }
    const paths = doc.filePlan.map((r) => r.path)
    const clash = paths.filter((p) => taken.has(p))
    if (clash.length) { waited.push({ spec, why: `File Plan overlaps ${taken.get(clash[0])} on ${clash.join(', ')}` }); continue }
    for (const p of paths) taken.set(p, spec)
    picked.push(spec)
  }
  return { picked, waited }
}

const waitLines = (waited) => waited.map((w) => `${w.spec} waits — ${w.why}`)

function derivePlan(ctx) {
  const root = ctx.root
  const config = st.readConfig(root)
  const branch = git.currentBranch(root)
  if (branch !== config.trunk) refuse(`${root} is on ${branch}, not trunk ${config.trunk} — run /spec:fanout from the main checkout`)
  const { picked, waited } = plan(root, config)
  if (!picked.length) {
    return {
      name: 'PLAN',
      body: render({ outcome: '✅ queue drained — no hardened spec is runnable', warns: waitLines(waited), next: 'nothing needs you — queue drained' }),
    }
  }
  const lines = [`${picked.length} lane(s) — File Plans do not overlap:`, ...picked.map((p, i) => `  lane ${i + 1}: ${p}`)]
  if (waited.length) lines.push('', 'Waiting:', ...waitLines(waited).map((w) => '  ' + w))
  lines.push('', 'Mark planned; the driver then creates the worktrees and prints the dispatch.')
  return { name: 'PLAN', body: lines.join('\n'), mark: ['planned', ...EXPLICIT.slice(1)].join(' ') }
}

// ---- DISPATCH ---------------------------------------------------------------------------------

// The Agent tool takes no working directory, so the lane's prompt points run.js at its worktree.
function agentLine(root, config, lane) {
  const seat = config.seats.orchestrator || {}
  const model = seat.model || 'opus'
  return `Agent({ subagent_type: "claude", model: "${model}", effort: "${seat.effort || 'medium'}", description: "lane ${lane.id}: ${lane.stem}", ` +
    `prompt: ${JSON.stringify(`/spec:run ${lane.spec} --root ${shq(wtAbs(root, lane))}`)} })`
}

function dispatchBody(root, lanes, intro) {
  const config = st.readConfig(root)
  return [
    intro,
    'Run all lanes in one message so they go in parallel; do not wait on them one by one.',
    'Each lane is one Agent call whose prompt runs /spec:run in its worktree. Do NOT use isolation: "worktree" — the driver already made the worktree and branch.',
    '',
    ...lanes.flatMap((l) => [`lane ${l.id} — ${l.stem} (${l.branch})`, '  ' + agentLine(root, config, l)]),
  ].join('\n')
}

function prepare(s, ctx) {
  const config = st.readConfig(ctx.root)
  for (const lane of s.batch.filter((l) => l.status === 'planned' && !l.ready)) {
    git.worktreeAdd(ctx.root, lane.worktree, lane.branch, config.trunk)
    pending.markLane(wtAbs(ctx.root, lane), 'fanout')
    lane.ready = true
  }
  return s
}

// ---- WAIT / RELAY -----------------------------------------------------------------------------

function laneRunStep(root, lane) {
  const run = st.readRun(laneSpec(root, lane))
  return run ? run.step : 'no run state yet'
}

function deriveWait(s, ctx) {
  const active = s.batch.filter((l) => l.status !== 'dismissed')
  if (active.every((l) => l.status === 'done' || l.status === 'stopped')) {
    return { name: 'WAIT', auto: (x) => ({ ...x, step: active.some((l) => l.status === 'stopped') ? 'RELAY' : 'MERGE' }) }
  }
  const lines = ['Lanes (status · run step):', ...s.batch.map((l) => `  lane ${l.id} — ${l.stem}: ${l.status} · ${laneRunStep(ctx.root, l)}`)]
  lines.push('', 'As each lane agent returns, mark it returned. A lane that stopped without writing a pending question: add --stopped "<reason>".')
  return { name: 'WAIT', body: lines.join('\n'), mark: 'returned --lane <id> [--stopped "<reason>"]', accepts: ['dismissed'] }
}

function deriveRelay(s, ctx) {
  const root = ctx.root
  const stopped = s.batch.filter((l) => l.status === 'stopped')
  const answered = s.batch.filter((l) => l.status === 'answered')
  if (!stopped.length && !answered.length) return { name: 'RELAY', auto: (x) => ({ ...x, step: 'MERGE' }) }
  if (!stopped.length) {
    return { name: 'RELAY', body: dispatchBody(root, answered, 'Every question is answered. Re-dispatch these lanes; each resumes from its run state:'), mark: 'resumed', accepts: ['dismissed'] }
  }
  const lines = ['Ask the user these lane questions as ONE batch (one AskUserQuestion call, at most 4 per call), then record each answer.', '']
  for (const l of stopped) {
    lines.push(`lane ${l.id} — ${l.stem}`)
    if (l.question) {
      lines.push(`  Q: ${l.question.question}`, ...l.question.options.map((o) => `   - ${o.label}${o.description ? ' — ' + o.description : ''}`))
      lines.push(`  answer: node ${shq(ctx.script)} --root ${shq(root)} --mark answered --lane ${l.id} --label "<label>"`)
    } else {
      lines.push(`  stopped: ${l.reason || 'no reason given'}`, `  answer: node ${shq(ctx.script)} --root ${shq(root)} --mark answered --lane ${l.id}`)
    }
    lines.push(`  drop it instead: node ${shq(ctx.script)} --root ${shq(root)} --mark dismissed --lane ${l.id}`, '')
  }
  return { name: 'RELAY', body: lines.join('\n'), mark: 'answered --lane <id> [--label <label>]', accepts: ['dismissed'] }
}

// ---- MERGE ------------------------------------------------------------------------------------

function tickQueue(root, spec) {
  const q = st.readQueue(root)
  let hit = false
  for (const i of q.items) if (!i.done && i.kind === 'spec' && rel(root, i.payload) === spec) { i.done = now(); hit = true }
  if (hit) st.writeQueue(root, q)
}

function finalize(s, ctx, lane) {
  const root = ctx.root
  const rootSpec = path.join(root, lane.spec)
  const doc = specDoc(rootSpec)
  if (doc && doc.frontmatter.status !== 'done') {
    // Only the spec file: `add -A` in the main checkout would sweep the user's untracked files in.
    st.writeStatus(rootSpec, 'done')
    git.sh(['add', '--', lane.spec], root)
    if (git.raw(['diff', '--cached', '--quiet'], root).status !== 0) git.sh(['commit', '-q', '-m', `chore(spec): ${lane.stem} done`], root)
  }
  pending.unmarkLane(wtAbs(root, lane))
  git.worktreeRemove(root, lane.worktree, { deleteBranch: lane.branch })
  tickQueue(root, lane.spec)
  lane.status = 'merged'
  return s
}

function gateAfter(s, ctx, lane) {
  const g = host.gate(ctx.root, st.readConfig(ctx.root))
  if (g.status !== 0) {
    s.step = 'MERGE_RED'
    s.red = { lane: lane.id, runId: g.runId, tail: g.tail }
    return s
  }
  return finalize(s, ctx, lane)
}

// The lane's spec is marked done on its own branch so trunk takes it with the merge (root stays clean).
function mergeLane(s, ctx, lane) {
  const root = ctx.root
  const config = st.readConfig(root)
  const wt = wtAbs(root, lane)
  const spec = laneSpec(root, lane)
  // finalize removed the worktree and branch, then a crash beat the save: only the bookkeeping is left.
  if (!fs.existsSync(wt) && !git.branchExists(root, lane.branch)) return finalize(s, ctx, lane)
  pending.consumePending(wt)
  st.clearRun(spec)
  const doc = specDoc(spec)
  if (doc && doc.frontmatter.status !== 'done') st.writeStatus(spec, 'done')
  git.commitAll(wt, `chore(spec): ${lane.stem} done`)
  const title = doc && doc.title ? ` — ${doc.title}` : ''
  const r = git.mergeBack(root, lane.branch, config.mergeStrategy, { message: `merge: ${lane.branch}${title}` })
  if (!r.merged) {
    s.conflict = { lane: lane.id, files: r.conflicts, reason: r.reason || null }
    return s
  }
  return gateAfter(s, ctx, lane)
}

function deriveMerge(s, ctx) {
  if (s.conflict) {
    const lane = s.batch.find((l) => l.id === s.conflict.lane)
    const lines = [`Merging lane ${lane.id} (${lane.branch}) into trunk stopped.`]
    if (s.conflict.files.length) lines.push('Conflicts in the main checkout:', ...s.conflict.files.map((f) => '  ' + f))
    if (s.conflict.reason) lines.push(s.conflict.reason)
    lines.push('', `Ask the user how to resolve, resolve in ${ctx.root}, commit the merge, then mark merged.`)
    return { name: 'MERGE', body: lines.join('\n'), mark: 'merged' }
  }
  const next = s.batch.find((l) => l.status === 'done')
  if (next) return { name: 'MERGE', auto: (x) => mergeLane(x, ctx, x.batch.find((l) => l.id === next.id)) }
  return { name: 'MERGE', auto: (x) => ({ ...x, step: 'REPORT' }) }
}

function deriveRed(s, ctx) {
  const lane = s.batch.find((l) => l.id === s.red.lane)
  return {
    name: 'MERGE_RED',
    body: [`The gate is red on trunk after merging lane ${lane.id} (${lane.stem}). The queue stops here.`, '',
      s.red.tail || '(no output)', '',
      `Repair it in ${ctx.root} (dispatch a builder or fix it here), commit the repair, then mark gate-repaired; the driver re-runs the gate.`].join('\n'),
    mark: 'gate-repaired',
  }
}

// ---- REPORT -----------------------------------------------------------------------------------

function deriveReport(s, ctx) {
  const merged = s.batch.filter((l) => l.status === 'merged')
  const dismissed = s.batch.filter((l) => l.status === 'dismissed' && !l.ended)
  const parked = s.batch.filter((l) => l.status === 'dismissed' && l.ended)
  const saved = EXPLICIT
  EXPLICIT = []
  const more = plan(ctx.root, st.readConfig(ctx.root)).picked.length > 0
  EXPLICIT = saved
  return {
    name: 'REPORT',
    body: render({
      outcome: `✅ fanout — ${merged.length} lane(s) merged${parked.length ? `, ${parked.length} parked` : ''}${dismissed.length ? `, ${dismissed.length} dismissed` : ''}`,
      bullets: [
        ...merged.map((l) => `merged ${l.stem} (${l.branch}) into trunk; queue item ticked`),
        ...(s.answered || []).map((a) => `answered lane ${a.lane} (${a.stem}): ${a.label}`),
      ],
      warns: [
        ...parked.map((l) => `parked ${l.stem} — its lane ended ${l.ended}${l.ended === 'AMENDED' ? ' (spec set to draft in the lane; amend it with /spec:plan)' : ' (a /spec:fix item is queued)'}; worktree kept at ${l.worktree}`),
        ...dismissed.map((l) => `dismissed ${l.stem} — worktree kept at ${l.worktree}, spec back to hardened`),
      ],
      next: more ? '/spec:fanout' : 'nothing needs you — queue drained',
    }),
    mark: 'reported',
  }
}

// ---- driver -----------------------------------------------------------------------------------

function derive(s, ctx) {
  switch (s.step) {
    case 'DISPATCH':
      if (s.batch.some((l) => l.status === 'planned' && !l.ready)) return { name: 'DISPATCH', auto: (x) => prepare(x, ctx) }
      return { name: 'DISPATCH', body: dispatchBody(ctx.root, s.batch.filter((l) => l.status === 'planned'), 'Dispatch one lane agent per lane:'), mark: 'dispatched' }
    case 'WAIT': return deriveWait(s, ctx)
    case 'RELAY': return deriveRelay(s, ctx)
    case 'MERGE': return deriveMerge(s, ctx)
    case 'MERGE_RED': return deriveRed(s, ctx)
    case 'REPORT': return deriveReport(s, ctx)
    default: return derivePlan(ctx)
  }
}

const steps = {
  planned(s, flags, ctx) {
    const { picked, waited } = plan(ctx.root, st.readConfig(ctx.root))
    if (!picked.length) refuse('nothing is runnable — re-run without --mark')
    const batch = picked.map((spec, i) => {
      const stem = stemOf(spec)
      return { id: String(i + 1), spec, stem, worktree: `.claude/worktrees/spec-${stem}`, branch: `spec/${stem}`, status: 'planned' }
    })
    return { step: 'DISPATCH', batch, waited, answered: [], started: now() }
  },
  dispatched(s) {
    for (const l of s.batch) if (l.status === 'planned') l.status = 'dispatched'
    s.step = 'WAIT'
  },
  returned(s, flags, ctx) {
    const lane = findLane(s, flags)
    if (lane.status !== 'dispatched') refuse(`lane ${lane.id} is ${lane.status}, not out — only a dispatched lane can return`)
    const wt = wtAbs(ctx.root, lane)
    const q = pending.readPending(wt)
    if (flags.stopped || (q && !q.answer)) {
      lane.status = 'stopped'
      lane.question = q && !q.answer ? { question: q.question, options: q.options } : null
      lane.reason = typeof flags.stopped === 'string' ? flags.stopped : null
      return
    }
    const step = laneRunStep(ctx.root, lane)
    if (ENDED.includes(step)) {
      pending.unmarkLane(wt)
      lane.status = 'dismissed'
      lane.ended = step
      return
    }
    if (!FINISHED.includes(step)) refuse(`lane ${lane.id} (${lane.stem}) is at ${step}, not MERGE_READY — re-dispatch it, mark returned --lane ${lane.id} --stopped "<reason>", or mark dismissed --lane ${lane.id}`)
    lane.status = 'done'
  },
  answered(s, flags, ctx) {
    const lane = findLane(s, flags)
    if (lane.status !== 'stopped') refuse(`lane ${lane.id} is ${lane.status}; only a stopped lane takes an answer`)
    const wt = wtAbs(ctx.root, lane)
    const q = pending.readPending(wt)
    const label = typeof flags.label === 'string' ? flags.label : null
    if (q && !q.answer) {
      if (!label) refuse(`lane ${lane.id} has a pending question — pass --label <${q.options.map((o) => o.label).join(' | ')}>`)
      pending.answerPending(wt, label)
    }
    lane.status = 'answered'
    delete lane.question
    s.answered = [...(s.answered || []), { lane: lane.id, stem: lane.stem, label: label || (q && q.answer ? q.answer.label : 'answered') }]
  },
  resumed(s) {
    for (const l of s.batch) if (l.status === 'answered') { l.status = 'dispatched'; delete l.reason }
    s.step = 'WAIT'
  },
  dismissed(s, flags, ctx) {
    const lane = findLane(s, flags)
    if (lane.status === 'merged' || lane.status === 'dismissed') refuse(`lane ${lane.id} is already ${lane.status}`)
    const spec = laneSpec(ctx.root, lane)
    const doc = specDoc(spec)
    if (doc && doc.frontmatter.status !== 'hardened') st.writeStatus(spec, 'hardened')
    pending.unmarkLane(wtAbs(ctx.root, lane))
    lane.status = 'dismissed'
  },
  merged(s, flags, ctx) {
    const root = ctx.root
    const lane = s.batch.find((l) => l.id === s.conflict.lane)
    if (git.conflictsIn(root).length) refuse(`conflicts remain in ${root}: ${git.conflictsIn(root).join(', ')} — resolve them first`)
    if (git.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], root).status === 0) refuse('the merge is not committed yet — git commit --no-edit, then mark merged')
    const strategy = st.readConfig(root).mergeStrategy
    if (strategy !== 'squash' && git.raw(['merge-base', '--is-ancestor', lane.branch, 'HEAD'], root).status !== 0) {
      refuse(`${lane.branch} is not merged into ${git.currentBranch(root)} yet — merge it, then mark merged`)
    }
    delete s.conflict
    return gateAfter(s, ctx, lane)
  },
  'gate-repaired'(s, flags, ctx) {
    const root = ctx.root
    if (git.sh(['status', '--porcelain', '--untracked-files=no'], root)) refuse(`${root} has uncommitted changes — commit the repair, then mark gate-repaired`)
    const lane = s.batch.find((l) => l.id === s.red.lane)
    const g = host.gate(root, st.readConfig(root))
    if (g.status !== 0) { s.red = { lane: lane.id, runId: g.runId, tail: g.tail }; return }
    delete s.red
    s.step = 'MERGE'
    return finalize(s, ctx, lane)
  },
  reported() { return { step: 'PLAN' } },
}

const driverMain = makeDriver({
  name: 'fanout',
  load: (ctx) => st.readFanout(ctx.root) || { step: 'PLAN' },
  // PLAN holds nothing worth keeping: the fanout file is cleared and PLAN is re-derived.
  save: (s, ctx) => st.writeFanout(ctx.root, s.step === 'PLAN' ? null : s),
  derive,
  steps,
  script: __filename,
})

function main(argv = process.argv.slice(2)) {
  try {
    const a = parseArgv(argv)
    EXPLICIT = a.pos.map((p) => rel(a.root, p))
  } catch (e) {
    process.stderr.write(`fanout: ${e.message}\n`)
    return 2
  }
  return driverMain(argv)
}

module.exports = { plan, main }

if (require.main === module) process.exitCode = main()
