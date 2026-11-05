#!/usr/bin/env node
'use strict'
// fanout.js [<spec path>…] [--root <dir>] [--mark <verb> …]
//
// Runs several hardened specs as parallel lanes from one session. Steps:
// PLAN → DISPATCH → WAIT → RELAY → MERGE (MERGE_RED) → REPORT → PLAN … until nothing is runnable.
// Bare = AUTO (the batch is the first `lanes` runnable specs); --pick = SELF-PICK (a checkbox question).
// State: <git-common-dir>/spec-fanout.json (lib/state readFanout/writeFanout). Lanes run in parallel
// whatever their File Plans share; MERGE rebases each finished lane onto trunk in its worktree,
// fast-forwards trunk, gates, removes the worktree and ticks the queue. A rebase conflict sends the
// lane back to its agent. The session only dispatches agents and relays questions.
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
let PICK = false // --pick: SELF-PICK
let LABELS = [] // every --label of this invocation (picked takes several)

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

// Runnable = hardened, its lane did not end, and not already in a lane; in queue (or argument) order.
function eligible(root) {
  const ok = []
  const held = [] // not hardened, queue-only: one summary line at PLAN, so no queued spec seems to vanish
  const waited = []
  for (const spec of candidates(root)) {
    const doc = specDoc(path.join(root, spec))
    if (!doc) { waited.push({ spec, why: 'spec file not found' }); continue }
    const status = doc.frontmatter.status || 'missing'
    if (status !== 'hardened') { (EXPLICIT.length ? waited : held).push({ spec, why: `status is ${status}, not hardened` }); continue }
    // A lane that parked or amended keeps its worktree and sidecar; re-running it would only
    // print the same ending, so it waits until the user removes that worktree.
    const wt = path.join(root, '.claude', 'worktrees', 'spec-' + stemOf(spec))
    const ended = (st.readRun(path.join(wt, spec)) || {}).step
    if (ENDED.includes(ended)) { waited.push({ spec, why: `its lane ended ${ended} — see the report; remove ${path.relative(root, wt)} to run it again` }); continue }
    if (pending.isLane(wt)) { waited.push({ spec, why: `already in a lane at ${path.relative(root, wt)}` }); continue }
    ok.push({ spec, title: doc.title || stemOf(spec) })
  }
  return { ok, waited, held }
}

function plan(root, config) {
  const { ok, waited, held } = eligible(root)
  for (const o of ok.slice(config.lanes)) waited.push({ spec: o.spec, why: `all ${config.lanes} lanes are taken` })
  return { picked: ok.slice(0, config.lanes).map((o) => o.spec), waited, held }
}

const heldLine = (held) => `Held (not hardened, not shown as lanes): ${held.length} — ${held.map((h) => `${stemOf(h.spec)} (${h.why.replace(/^status is (\S+), not hardened$/, '$1')})`).join(', ')}`

// SELF-PICK: up to 4 questions of up to 4 boxes, labels = spec titles.
function pickBody(ok, cap) {
  const shown = ok.slice(0, 16)
  const lines = [`Ask the user which specs to run (at most ${cap}) as ONE AskUserQuestion call with multiSelect checkboxes, up to 4 options per question:`]
  for (let i = 0; i < shown.length; i += 4) {
    lines.push('', `  Question ${i / 4 + 1}: Which of these should run as lanes?`, ...shown.slice(i, i + 4).map((o) => `   [ ] ${o.title} — ${o.spec}`))
  }
  lines.push('', 'Then mark picked with one --label per ticked box, e.g. ' + shown.slice(0, 2).map((o) => `--label ${shq(o.title)}`).join(' '))
  return lines.join('\n')
}

const waitLines = (waited) => waited.map((w) => `${w.spec} waits — ${w.why}`)

function derivePlan(ctx) {
  const root = ctx.root
  const config = st.readConfig(root)
  const branch = git.currentBranch(root)
  if (branch !== config.trunk) refuse(`${root} is on ${branch}, not trunk ${config.trunk} — run /spec:fanout from the main checkout`)
  const { picked, waited, held } = plan(root, config)
  const extra = EXPLICIT.slice(1)
  if (picked.length && PICK) {
    return { name: 'PLAN', body: pickBody(eligible(root).ok, config.lanes), mark: ['picked --label <title>', '[--label <title> …]', ...extra].join(' '), accepts: ['planned'] }
  }
  if (!picked.length) {
    return {
      name: 'PLAN',
      body: render({ outcome: '✅ queue drained — no hardened spec is runnable', warns: waitLines(waited), next: 'nothing needs you — queue drained' }),
    }
  }
  const lines = [`📌 Auto-picked batch: ${picked.length} lane(s), in queue order`, ...picked.map((p, i) => `  lane ${i + 1}: ${p}`)]
  if (waited.length) lines.push('', 'Waiting:', ...waitLines(waited).map((w) => '  ' + w))
  if (held.length) lines.push('', heldLine(held))
  lines.push('', 'Mark planned; the driver then creates the worktrees and prints the dispatch.')
  return { name: 'PLAN', body: lines.join('\n'), mark: ['planned', ...extra].join(' '), accepts: ['picked'] }
}

// ---- DISPATCH ---------------------------------------------------------------------------------

// The Agent tool takes no working directory, so the lane's prompt points run.js at its worktree.
// The prompt is the bare /spec:run: the lane's driver prints any rebase instruction itself.
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
  const active = s.batch.filter((l) => l.status !== 'dismissed' && l.status !== 'merged')
  if (active.every((l) => l.status === 'done' || l.status === 'stopped')) {
    return { name: 'WAIT', auto: (x) => ({ ...x, step: active.some((l) => l.status === 'stopped') ? 'RELAY' : 'MERGE' }) }
  }
  const back = s.batch.filter((l) => l.status === 'sent-back')
  if (back.length) return { name: 'WAIT', body: dispatchBody(ctx.root, back, 'These lanes resolved a rebase conflict; they gate and review the resolved diff before landing:'), mark: 'resent', accepts: ['dismissed', 'returned'] }
  const config = st.readConfig(ctx.root)
  const lines = ['Lanes (status · run step):', ...s.batch.map((l) => `  lane ${l.id} — ${l.stem}: ${l.status}${l.status === 'merged' ? '' : ` · ${laneRunStep(ctx.root, l)}`}`)]
  lines.push('', 'As each lane agent returns, mark it returned. A lane that stopped without writing a pending question: add --stopped "<reason>".',
    'After a crash or /clear: a lane at MERGE_READY or ended is marked returned; re-send any other lane whose agent is no longer running (/spec:run resumes where it stopped):',
    ...s.batch.filter((l) => l.status === 'dispatched').map((l) => {
      const step = laneRunStep(ctx.root, l); const q = pending.readPending(wtAbs(ctx.root, l))
      return FINISHED.includes(step) || ENDED.includes(step) || (q && !q.answer) ? `  node ${shq(ctx.script)} --root ${shq(ctx.root)} --mark returned --lane ${l.id}` : '  ' + agentLine(ctx.root, config, l)
    }))
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
    if (git.raw(['diff', '--cached', '--quiet'], root).status !== 0) git.sh(['commit', '-q', '-m', `chore(spec): ${lane.stem} done`, '--', lane.spec], root)
  }
  pending.unmarkLane(wtAbs(root, lane))
  const rm = git.worktreeRemove(root, lane.worktree, { deleteBranch: lane.branch })
  if (!rm.removed) lane.kept = `worktree kept at ${lane.worktree}: ${rm.reason} — git worktree remove --force ${lane.worktree}`
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

// Rebase the lane onto trunk in its worktree, then fast-forward trunk to it, then gate. The run state
// stays MERGE_READY until the rebase lands, so a sent-back lane's /spec:run is a no-op.
function mergeLane(s, ctx, lane) {
  const root = ctx.root
  const config = st.readConfig(root)
  const wt = wtAbs(root, lane)
  const spec = laneSpec(root, lane)
  // finalize removed the worktree and branch, then a crash beat the save: only the bookkeeping is left.
  if (!fs.existsSync(wt) && !git.branchExists(root, lane.branch)) return finalize(s, ctx, lane)
  const on = git.currentBranch(root)
  if (on !== config.trunk) refuse(`${root} is on ${on}, not ${config.trunk} — check out ${config.trunk} there, then re-run`)
  const r = git.rebaseOnto(wt, config.trunk)
  if (!r.ok) {
    const at = git.headSha(root)
    lane.conflicts = r.conflicts
    if (lane.conflictAt === at) { lane.status = 'stopped'; lane.reason = 'second rebase conflict'; lane.question = null }
    else { lane.status = 'sent-back'; lane.conflictAt = at; lane.resolving = true } // its resolution is gated and reviewed before landing
    return s
  }
  delete lane.conflicts
  pending.consumePending(wt)
  const doc = specDoc(spec)
  if (doc && doc.frontmatter.status !== 'done') st.writeStatus(spec, 'done')
  st.clearRun(spec)
  git.commitAll(wt, `chore(spec): ${lane.stem} done`, { noVerify: true }) // bookkeeping only: gateAfter runs the suite next
  const m = git.mergeBack(root, lane.branch, 'ff-only')
  if (!m.merged) refuse(`fast-forward of ${config.trunk} to ${lane.branch} failed: ${m.reason}`, 1)
  return gateAfter(s, ctx, lane)
}

function deriveMerge(s, ctx) {
  const next = s.batch.find((l) => l.status === 'done')
  if (next) return { name: 'MERGE', auto: (x) => mergeLane(x, ctx, x.batch.find((l) => l.id === next.id)) }
  const back = s.batch.filter((l) => l.status === 'sent-back')
  if (back.length) {
    const body = dispatchBody(ctx.root, back, 'These lanes hit a rebase conflict onto trunk and go back to their agents (the rebase is left in progress):')
    return { name: 'MERGE', body: body + '\n\n' + back.map((l) => `lane ${l.id} conflicts: ${l.conflicts.join(', ')}`).join('\n'), mark: 'resent', accepts: ['dismissed'] }
  }
  if (s.batch.some((l) => l.status === 'stopped')) return { name: 'MERGE', auto: (x) => ({ ...x, step: 'RELAY' }) }
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
        ...merged.filter((l) => l.kept).map((l) => l.kept),
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

function batchOf(picked, waited) {
  const batch = picked.map((spec, i) => {
    const stem = stemOf(spec)
    return { id: String(i + 1), spec, stem, worktree: `.claude/worktrees/spec-${stem}`, branch: `spec/${stem}`, status: 'planned' }
  })
  return { step: 'DISPATCH', batch, waited, answered: [], started: now() }
}

const steps = {
  planned(s, flags, ctx) {
    const { picked, waited } = plan(ctx.root, st.readConfig(ctx.root))
    if (!picked.length) refuse('nothing is runnable — re-run without --mark')
    return batchOf(picked, waited)
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
    if (git.rebasing(wt)) refuse(`lane ${lane.id} (${lane.stem}) still has a rebase in progress — re-dispatch it, or mark dismissed --lane ${lane.id}`)
    if (!FINISHED.includes(step)) refuse(`lane ${lane.id} (${lane.stem}) is at ${step}, not MERGE_READY — re-dispatch it, mark returned --lane ${lane.id} --stopped "<reason>", or mark dismissed --lane ${lane.id}`)
    // A lane back from resolving a rebase conflict carries an ungated, unreviewed diff: GATE and REVIEW
    // run again against the trunk it was rebased onto before the lane may land. WAIT prints the re-dispatch.
    if (lane.resolving && git.raw(['merge-base', '--is-ancestor', lane.conflictAt, 'HEAD'], wt).status === 0) {
      const spec = laneSpec(ctx.root, lane); const run = st.readRun(spec)
      run.base = lane.conflictAt; run.step = 'GATE'; run.review = null; run.attempts = { repair: 0, fix: 0 }
      st.writeRun(spec, run)
      delete lane.resolving; delete lane.conflicts; lane.status = 'sent-back'
      return
    }
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
  picked(s, flags, ctx) {
    const config = st.readConfig(ctx.root)
    const { ok, waited, held } = eligible(ctx.root)
    if (!LABELS.length) refuse('pass one --label <title> per ticked box')
    if (LABELS.length > config.lanes) refuse(`${LABELS.length} picked — at most ${config.lanes} lanes run at once`)
    const picked = LABELS.map((label) => {
      const hit = ok.find((o) => o.title === label || o.spec === rel(ctx.root, label))
      if (hit) return hit.spec
      const w = [...waited, ...held].find((x) => x.spec === rel(ctx.root, label) || (specDoc(path.join(ctx.root, x.spec)) || {}).title === label)
      return refuse(w ? `${w.spec} is not runnable — ${w.why}` : `no runnable spec titled '${label}' — known: ${ok.map((o) => o.title).join(' | ')}`)
    })
    return batchOf([...new Set(picked)], waited)
  },
  resent(s) {
    for (const l of s.batch) if (l.status === 'sent-back') l.status = 'dispatched'
    s.step = 'WAIT'
  },
  'gate-repaired'(s, flags, ctx) {
    const root = ctx.root
    const on = git.currentBranch(root); const trunk = st.readConfig(root).trunk
    if (on !== trunk) refuse(`${root} is on ${on}, not ${trunk} — check out ${trunk} there, then re-run`)
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
    PICK = argv.includes('--pick')
    argv = argv.filter((x) => x !== '--pick')
    LABELS = argv.flatMap((x, i) => (x === '--label' && argv[i + 1] !== undefined ? [argv[i + 1]] : []))
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
