#!/usr/bin/env node
'use strict'
// fanout.js [<spec path>…] [--root <dir>] [--mark <verb> …]
//
// Runs several hardened specs as parallel lanes from one session. Steps:
// PLAN → DISPATCH → WAIT → RELAY → MERGE (MERGE_RED) → REPORT → PLAN … until nothing is runnable.
// Bare = AUTO (the batch is the first `lanes` runnable specs); --pick = SELF-PICK (a checkbox question).
// State: <git-common-dir>/spec-fanout.json (lib/state readFanout/writeFanout). Lanes run in parallel
// whatever their File Plans share; MERGE rebases each finished lane onto trunk in its worktree,
// fast-forwards trunk, gates, removes the worktree and ticks the queue, as each lane returns, also while
// another lane is sent back or resolving a rebase. A rebase conflict sends the lane back to its agent,
// which resolves, gates and reviews it in that one dispatch; it is rebased again when it lands. A hardened spec whose depends_on (or a lane's
// waitingOn) is not done waits. The session only dispatches agents and relays questions.
// A lane whose base is older than trunk is gated on the rebased tree before the fast-forward; red sends
// it back to its own /spec:run at GATE. Every lane-touching mark bumps s.seq and mergeLane stamps lane.last,
// so the `after` hook prints what the mark landed, sent back or held. Every queued `type: fix` item is a fix lane (`run.js --fix`):
// one with a `spec` is bound to it (fix-<stem>), any other is a spec-less fix (fix-<slug>, its run state
// under the git common dir), picked after the specs. The queue is read through lib/queue.js only. REPORT ends the turn: the next bare run plans.
// Lane mode contract with run.js: architecture.md §11 "fanout.js notes".

const fs = require('fs')
const path = require('path')
const { makeDriver, parseArgv, refuse, shq } = require('./lib/driver')
const st = require('./lib/state')
const Q = require('./lib/queue')
const git = require('./lib/git')
const host = require('./lib/host')
const pending = require('./lib/pending')
const work = require('./lib/work')
const { render } = require('./lib/report')

const FINISHED = ['MERGE_READY', 'DONE']
const ENDED = ['PARKED', 'AMENDED', 'NEEDS_PLAN'] // a lane that ended without a merge: dismissed automatically
let EXPLICIT = [] // positional spec paths of this invocation
let PICK = false // --pick: SELF-PICK
let LABELS = [] // every --label of this invocation (picked takes several)

const stemOf = (p) => path.basename(p).replace(/\.md$/, '')
const rel = (root, p) => path.relative(root, path.resolve(root, String(p).replace(/^@/, ''))).split(path.sep).join('/')
const wtAbs = (root, lane) => path.resolve(root, lane.worktree)
const laneSpec = (root, lane) => (lane.spec ? path.join(wtAbs(root, lane), lane.spec) : null)
// A lane's run state: a spec-bound lane's <wt>/<spec>.run, a spec-less fix's <git-common-dir>/spec-fix/<slug>.run.
const laneRunDir = (root, lane) => (lane.spec ? st.runDir(laneSpec(root, lane)) : st.fixRunDir(root, lane.slug))
const laneRun = (root, lane) => st.readJson(path.join(laneRunDir(root, lane), 'state.json'))
const writeLaneRun = (root, lane, run) => st.writeJson(path.join(laneRunDir(root, lane), 'state.json'), run)
const clearLaneRun = (root, lane) => fs.rmSync(laneRunDir(root, lane), { recursive: true, force: true })
const now = () => new Date().toISOString()

function specDoc(file) { try { return st.readSpec(file) } catch { return null } }

function findLane(s, flags) {
  if (!flags.lane || flags.lane === true) refuse('--lane <id> is required — the ids are listed in the step body')
  const lane = s.batch.find((l) => l.id === String(flags.lane))
  if (!lane) refuse(`no lane '${flags.lane}' in this batch — known: ${s.batch.map((l) => l.id).join(', ')}`)
  return lane
}

// ---- PLAN -------------------------------------------------------------------------------------

// The open spec items; a spec that is done on disk counts as closed, as `queue list` shows it.
const queuedSpecs = (root) => Q.open(Q.reconcile(root, Q.read(root))).filter((i) => i.kind === 'spec')

function candidates(root) {
  const list = EXPLICIT.length ? EXPLICIT : queuedSpecs(root).map((i) => i.payload)
  return [...new Set(list.map((p) => rel(root, p)))]
}

// Every open `type: fix` item is a fix lane: bound to its `spec` when it has one, else spec-less.
const fixItems = (root) => Q.open(Q.reconcile(root, Q.read(root))).filter((i) => i.kind === 'prompt' && i.type === 'fix')
const specWt = (root, spec) => path.join(root, '.claude', 'worktrees', 'spec-' + stemOf(spec))
const fixWt = (root, spec) => path.join(root, '.claude', 'worktrees', 'fix-' + stemOf(spec))
const slugWt = (root, slug) => path.join(root, '.claude', 'worktrees', 'fix-' + slug)

const isSpecFile = (root, p) => { try { return fs.statSync(path.join(root, p)).isFile() } catch { return false } }

// Runnable = hardened, its lane did not end, not already in a lane, and every dependency done; in queue
// (or argument) order. opts.lanes + opts.auto: a dependency picked earlier in this walk is named by its lane.
function eligible(root, opts = {}) {
  const ok = []
  const held = [] // not hardened, queue-only: one summary line at PLAN, so no queued spec seems to vanish
  const waited = []
  const laneOf = new Map()
  const cache = {}
  const queued = queuedSpecs(root)
  const unmet = (spec, entry, written, label) => {
    const dep = rel(root, entry)
    if (dep === spec || !isSpecFile(root, dep)) return null // an entry with no file on disk is ignored
    const status = (specDoc(path.join(root, dep)) || { frontmatter: {} }).frontmatter.status || 'missing'
    if (status === 'done') return null
    if (label === 'depends on' && laneOf.has(dep)) return `depends on ${written} (lane ${laneOf.get(dep)} this batch)`
    if (label === 'depends on' && status === 'draft') return `depends on ${written} (draft — it cannot land in this fan-out)`
    return `${label} ${written} (${status}, not done)`
  }
  for (const spec of candidates(root)) {
    const doc = specDoc(path.join(root, spec))
    if (!doc) { waited.push({ spec, why: 'spec file not found' }); continue }
    const status = doc.frontmatter.status || 'missing'
    if (status !== 'hardened') { (EXPLICIT.length ? waited : held).push({ spec, why: `status is ${status}, not hardened` }); continue }
    // A prototype spec stops at LOOK for the user's free-text reply and the app must outlive the agent: never a lane.
    if (doc.frontmatter.prototype) { waited.push({ spec, why: 'stops at LOOK for you — /spec:run it' }); continue }
    // A lane that parked or amended keeps its worktree and sidecar; re-running it would only
    // print the same ending, so it waits until the user removes that worktree.
    const wt = path.join(root, '.claude', 'worktrees', 'spec-' + stemOf(spec))
    const run = st.readRun(path.join(wt, spec)) || {}
    if (ENDED.includes(run.step)) { waited.push({ spec, why: `its lane ended ${run.step} — see the report; remove ${path.relative(root, wt)} to run it again` }); continue }
    if (pending.isLane(wt)) { waited.push({ spec, why: `already in a lane at ${path.relative(root, wt)}` }); continue }
    const dep = doc.frontmatter.depends_on
    const entries = (Array.isArray(dep) ? dep : dep ? [dep] : []).map(String)
    let why = null
    for (const e of entries) { why = unmet(spec, e, e, 'depends on'); if (why) break }
    if (!why && run.waitingOn) why = unmet(spec, run.waitingOn, run.waitingOn, 'waiting on')
    // An unmet queue `after` gate (an explicit path obeys it too): v7's blocker words.
    if (!why) { const item = queued.find((i) => rel(root, i.payload) === spec); const g = item && work.gateWhy(root, item.after, cache); if (g) why = 'after ' + g }
    if (why) { waited.push({ spec, why }); continue }
    ok.push({ spec, title: doc.title || stemOf(spec) })
    if (opts.auto && ok.length <= opts.lanes) laneOf.set(spec, ok.length)
  }
  // Fix items come after every runnable spec of this walk, the spec-bound ones before the spec-less; an
  // explicit spec list names specs only.
  const fixing = new Set()
  const lessFixes = []
  if (!EXPLICIT.length) for (const item of fixItems(root)) {
    if (!item.spec) { lessFixes.push(item); continue }
    const spec = rel(root, item.spec)
    const symptom = item.payload || 'repair ' + stemOf(spec)
    const label = Q.paste(root, item)
    const wait = (why) => waited.push({ spec: label, why })
    const doc = isSpecFile(root, spec) ? specDoc(path.join(root, spec)) : null
    if (!doc) { wait('fix item names no spec on disk'); continue }
    const status = doc.frontmatter.status || 'missing'
    if (!['done', 'hardened'].includes(status)) { wait(`its spec is ${status}, not done or hardened`); continue }
    // A fix on a prototype spec runs PIN_TESTS and LOOK too, so it is no lane either.
    if (doc.frontmatter.prototype) { wait(`stops at LOOK for you — /spec:run ${spec} --fix ${shq(symptom)} --in-place`); continue }
    if (pending.isLane(specWt(root, spec)) || ok.some((o) => !o.fix && o.spec === spec)) { wait('its spec is in a lane'); continue }
    const wt = fixWt(root, spec)
    const run = st.readRun(path.join(wt, spec)) || {}
    if (ENDED.includes(run.step)) { wait(`its lane ended ${run.step} — see the report; remove ${path.relative(root, wt)} to run it again`); continue }
    if (pending.isLane(wt) || fixing.has(spec)) { wait(`already in a lane at ${path.relative(root, wt)}`); continue }
    const g = work.gateWhy(root, item.after, cache)
    if (g) { wait('after ' + g); continue }
    fixing.add(spec)
    ok.push({ fix: true, spec, symptom, payload: label, item: item.id, title: `fix ${stemOf(spec)} — ${symptom}` })
  }
  for (const item of lessFixes) {
    const text = item.payload
    const label = Q.paste(root, item)
    const slug = st.slugOf(text)
    const wt = slugWt(root, slug)
    const wait = (why) => waited.push({ spec: label, why })
    const run = st.readJson(st.fixRunPath(root, slug)) || {}
    // The ending is a marker only while its worktree is there to remove: the state lives under the git dir.
    if (ENDED.includes(run.step) && fs.existsSync(wt)) { wait(`its lane ended ${run.step} — see the report; remove ${path.relative(root, wt)} to run it again`); continue }
    if (pending.isLane(wt) || fixing.has(slug)) { wait(`already in a lane at ${path.relative(root, wt)}`); continue }
    let why = run.waitingOn ? unmet(null, run.waitingOn, run.waitingOn, 'waiting on') : null
    if (!why) { const g = work.gateWhy(root, item.after, cache); if (g) why = 'after ' + g }
    if (why) { wait(why); continue }
    fixing.add(slug)
    ok.push({ fix: true, spec: null, slug, symptom: text, payload: label, item: item.id, title: `fix — ${text}` })
  }
  return { ok, waited, held }
}

function plan(root, config, auto = true) {
  const { ok, waited, held } = eligible(root, { lanes: config.lanes, auto })
  for (const o of ok.slice(config.lanes)) waited.push({ spec: o.payload || o.spec, why: `all ${config.lanes} lanes are taken` })
  return { picked: ok.slice(0, config.lanes), waited, held }
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

// Open items that are neither a lane, waiting nor held: each needs the user, with its reason. A spec item
// is known by its path, a fix by its paste (the labels `eligible` uses); every open item appears once.
const NEEDS = { plan: 'needs /spec:plan', prototype: 'needs /spec:prototype', decide: 'decide' }
function needsYou(root, picked, waited, held) {
  const seen = new Set([...picked.map((p) => p.payload || p.spec), ...waited.map((w) => w.spec), ...held.map((h) => h.spec)])
  const out = []
  for (const item of Q.open(Q.reconcile(root, Q.read(root)))) {
    const key = item.kind === 'spec' ? rel(root, item.payload) : Q.paste(root, item)
    if (seen.has(key)) continue
    seen.add(key)
    const reason = item.kind === 'brief' ? NEEDS.plan : NEEDS[item.type] || 'plain note — paste by hand'
    out.push({ item, line: `${item.id} needs you — ${reason}: ${Q.paste(root, item)}` })
  }
  return out
}

function derivePlan(ctx) {
  const root = ctx.root
  const config = st.readConfig(root)
  const branch = git.currentBranch(root)
  if (branch !== config.trunk) refuse(`${root} is on ${branch}, not trunk ${config.trunk} — run /spec:fanout from the main checkout`)
  const { picked, waited, held } = plan(root, config, !PICK)
  const extra = EXPLICIT.slice(1)
  if (picked.length && PICK) {
    return { name: 'PLAN', body: pickBody(eligible(root, { lanes: config.lanes, auto: false }).ok, config.lanes), mark: ['picked --label <title>', '[--label <title> …]', ...extra].join(' '), accepts: ['planned'] }
  }
  const needs = EXPLICIT.length ? [] : needsYou(root, picked, waited, held)
  if (!picked.length) {
    const opens = Q.open(Q.reconcile(root, Q.read(root)))
    if (EXPLICIT.length) {
      return { name: 'PLAN', body: render({ outcome: `⏸️ nothing runnable — ${waited.length} named spec(s) wait`, warns: waitLines(waited), next: 'nothing runnable — /spec:queue list' }) }
    }
    if (!opens.length) return { name: 'PLAN', body: render({ outcome: '✅ queue drained — nothing queued', next: 'nothing needs you — queue drained' }) }
    return {
      name: 'PLAN',
      body: render({
        outcome: `⏸️ nothing runnable — ${opens.length} open item(s)`,
        warns: [...waitLines(waited), ...(held.length ? [heldLine(held)] : []), ...needs.map((n) => n.line)],
        next: needs.length ? Q.paste(root, needs[0].item) : 'nothing runnable — /spec:queue list',
      }),
    }
  }
  const lines = [`📌 Auto-picked batch: ${picked.length} lane(s), in queue order`, ...picked.map((p, i) => `  lane ${i + 1}: ${p.spec || 'fix-' + p.slug}${p.fix ? ` — fix: ${p.symptom}` : ''}`)]
  if (waited.length) lines.push('', 'Waiting:', ...waitLines(waited).map((w) => '  ' + w))
  if (held.length) lines.push('', heldLine(held))
  if (needs.length) lines.push('', ...needs.map((n) => n.line))
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
    `prompt: ${JSON.stringify(lane.spec ? `/spec:run ${lane.spec} --root ${shq(wtAbs(root, lane))}${lane.kind === 'fix' ? ' --fix ' + shq(lane.symptom) : ''}` : `/spec:run --fix ${shq(lane.symptom)} --root ${shq(wtAbs(root, lane))}`)} })`
}

// What prepare() did to a reused lane's worktree, printed under its lane line at DISPATCH.
const reuseNote = (l) => !l.reused ? [] : [l.conflicts
  ? `  reused worktree — rebase in progress, conflicts: ${l.conflicts.join(', ')} (the lane resolves first)`
  : `  reused worktree — rebased onto ${l.rebased}`]

function dispatchBody(root, lanes, intro, { notes } = {}) {
  const config = st.readConfig(root)
  return [
    intro,
    'Run all lanes in one message so they go in parallel; do not wait on them one by one.',
    'Each lane is one Agent call whose prompt runs /spec:run in its worktree. Do NOT use isolation: "worktree" — the driver already made the worktree and branch.',
    '',
    ...lanes.flatMap((l) => [`lane ${l.id} — ${l.stem} (${l.branch})`, ...(notes ? reuseNote(l) : []), '  ' + agentLine(root, config, l),
      ...(l.status === 'sent-back' && l.red ? [`  lane ${l.id} gate red after rebase: ${l.red}`] : [])]),
  ].join('\n')
}

const wipMessage = (lane) => `wip(spec): ${lane.stem}`

// The lane's work is committed before anything can lose it; nothing to do when it has no worktree yet.
function wipLane(root, lane) {
  const wt = wtAbs(root, lane)
  if (fs.existsSync(wt) && git.worktreeList(root).includes(fs.realpathSync(wt))) return git.commitWip(wt, wipMessage(lane))
  return null
}

// A reused worktree (a lane from an earlier batch) is rebased onto trunk by the driver: the hook forbids
// every agent from rebasing. A conflict stays in progress for the lane's own /spec:run.
function reuseLane(root, config, lane) {
  const wt = wtAbs(root, lane)
  if (git.rebasing(wt)) { lane.conflicts = git.conflictsIn(wt); return }
  git.commitWip(wt, wipMessage(lane))
  const r = git.rebaseOnto(wt, config.trunk)
  if (!r.ok) { lane.conflicts = r.conflicts; lane.conflictAt = git.headSha(root); return }
  lane.rebased = git.sh(['rev-parse', config.trunk], root)
  const run = laneRun(root, lane)
  if (run) { run.base = lane.rebased; delete run.waitingOn; writeLaneRun(root, lane, run) }
}

function prepare(s, ctx) {
  const config = st.readConfig(ctx.root)
  for (const lane of s.batch.filter((l) => l.status === 'planned' && !l.ready)) {
    const abs = wtAbs(ctx.root, lane)
    // A spec-less fix's ending outlives its worktree (the state is under the git dir): a fresh lane starts over.
    const prior = !lane.spec && laneRun(ctx.root, lane)
    if (prior && ENDED.includes(prior.step) && !fs.existsSync(abs)) clearLaneRun(ctx.root, lane)
    lane.reused = (fs.existsSync(abs) && git.worktreeList(ctx.root).includes(fs.realpathSync(abs))) || git.branchExists(ctx.root, lane.branch)
    git.worktreeAdd(ctx.root, lane.worktree, lane.branch, config.trunk)
    if (lane.reused) reuseLane(ctx.root, config, lane)
    else host.copyLaneFiles(ctx.root, abs, config.laneFiles) // a fresh worktree only, before run.js's setupCommand
    pending.markLane(abs, 'fanout')
    lane.ready = true
  }
  return s
}

// ---- WAIT / RELAY -----------------------------------------------------------------------------

// The lane gives up its worktree's marker and its place in the batch until `on` is done on trunk.
function putWaiting(ctx, lane, on) {
  wipLane(ctx.root, lane)
  const run = laneRun(ctx.root, lane) || { step: 'OPEN' }
  run.waitingOn = on
  writeLaneRun(ctx.root, lane, run)
  pending.unmarkLane(wtAbs(ctx.root, lane))
  lane.status = 'waiting'
  lane.on = on
  delete lane.question; delete lane.reason
}

function laneRunStep(root, lane) {
  const run = laneRun(root, lane)
  return run ? run.step : 'no run state yet'
}

// The run-step cell of a WAIT lane line: a lane mid-rebase or red after one says so, not its stale run step.
function laneCell(root, lane) {
  if (lane.status === 'sent-back' && lane.red) return 'gate red after rebase'
  if (lane.status === 'sent-back' && lane.conflicts) return `resolving rebase (${lane.conflicts.length} files)`
  if (lane.status === 'dispatched' && git.rebasing(wtAbs(root, lane))) return `resolving rebase (${git.conflictsIn(wtAbs(root, lane)).length} files)`
  return laneRunStep(root, lane)
}

function deriveWait(s, ctx) {
  const active = s.batch.filter((l) => !['dismissed', 'merged', 'waiting'].includes(l.status))
  if (active.every((l) => l.status === 'done' || l.status === 'stopped')) {
    return { name: 'WAIT', auto: (x) => ({ ...x, step: active.some((l) => l.status === 'stopped') ? 'RELAY' : 'MERGE' }) }
  }
  const back = s.batch.filter((l) => l.status === 'sent-back')
  // A finished lane lands as it returns, also while another lane is sent back or resolving a rebase: the
  // resolver is rebased again, and its tree gated, when it lands. Only a red trunk holds a landing.
  const early = s.batch.find((l) => l.status === 'done')
  if (early && !s.red) return { name: 'WAIT', auto: (x) => mergeLane(x, ctx, x.batch.find((l) => l.id === early.id)) }
  const config = st.readConfig(ctx.root)
  const asks = (l) => { const q = l.status === 'dispatched' && pending.readPending(wtAbs(ctx.root, l)); return q && !q.answer ? ' (question waiting — mark returned)' : '' }
  const lines = ['Lanes (status · run step):', ...s.batch.map((l) => `  lane ${l.id} — ${l.stem}: ${l.status}${l.status === 'merged' ? '' : ` · ${laneCell(ctx.root, l)}`}${asks(l)}`)]
  if (back.length) return { name: 'WAIT', body: dispatchBody(ctx.root, back, 'These lanes hit a rebase conflict onto trunk, or their gate went red on the rebased tree; each resolves or repairs it, then continues, gates and reviews the result in this one dispatch:') + '\n\n' + lines.join('\n'), mark: 'resent', accepts: ['dismissed', 'returned', 'waiting'] }
  lines.push('', 'As each lane agent returns, mark it returned; a MERGE_READY lane lands as it returns. A lane that stopped without writing a pending question: add --stopped "<reason>".',
    `A lane that needs another spec done first: node ${shq(ctx.script)} --root ${shq(ctx.root)} --mark waiting --lane <id> --on <spec path>`,
    'After a crash or /clear: a lane at MERGE_READY or ended is marked returned; re-send any other lane whose agent is no longer running (/spec:run resumes where it stopped):',
    ...s.batch.filter((l) => l.status === 'dispatched').map((l) => {
      const step = laneRunStep(ctx.root, l); const q = pending.readPending(wtAbs(ctx.root, l))
      return FINISHED.includes(step) || ENDED.includes(step) || (q && !q.answer) ? `  node ${shq(ctx.script)} --root ${shq(ctx.root)} --mark returned --lane ${l.id}` : '  ' + agentLine(ctx.root, config, l)
    }))
  return { name: 'WAIT', body: lines.join('\n'), mark: 'returned --lane <id> [--stopped "<reason>"]', accepts: ['dismissed', 'waiting'] }
}

const RELAY_ORDER = ['assumption', 'decision', 'unmet', 'scope', 'spec-edit', 'escalate', 'conflict']

function deriveRelay(s, ctx) {
  const root = ctx.root
  const stopped = s.batch.filter((l) => l.status === 'stopped')
  const answered = s.batch.filter((l) => l.status === 'answered')
  if (!stopped.length && !answered.length) return { name: 'RELAY', auto: (x) => ({ ...x, step: 'MERGE' }) }
  if (!stopped.length) {
    return { name: 'RELAY', body: dispatchBody(root, answered, 'Every question is answered. Re-dispatch these lanes; each resumes from its run state:'), mark: 'resumed', accepts: ['dismissed'] }
  }
  // Client-level questions first, the mechanical ones after; a lane that stopped with no question comes last.
  const rank = (l) => { const i = RELAY_ORDER.indexOf(l.question ? l.question.kind || 'escalate' : 'stopped'); return i < 0 ? RELAY_ORDER.length : i }
  const lines = ['Ask the user these lane questions as ONE AskUserQuestion call (at most 4 per call), verbatim, then record each answer.',
    'The orchestrator never answers for the user: every lane question below goes to the user; only `📌 Auto-picked` lines are not relayed.', '']
  for (const l of stopped.map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0])) {
    lines.push(`[${l.question ? l.question.kind || 'escalate' : 'stopped'}] lane ${l.id} — ${l.stem}`, `  wait for a spec: node ${shq(ctx.script)} --root ${shq(root)} --mark waiting --lane ${l.id} --on <spec path>`)
    if (l.question) {
      lines.push(`  Q: ${l.question.question}`, ...l.question.options.map((o, i) => `   - ${o.label}${i === 0 ? ' (recommended)' : ''}${o.description ? ' — ' + o.description : ''}`))
      lines.push(`  answer: node ${shq(ctx.script)} --root ${shq(root)} --mark answered --lane ${l.id} --label "<label>"`)
    } else {
      lines.push(`  stopped: ${l.reason || 'no reason given'}`, `  answer: node ${shq(ctx.script)} --root ${shq(root)} --mark answered --lane ${l.id}`)
    }
    lines.push(`  drop it instead: node ${shq(ctx.script)} --root ${shq(root)} --mark dismissed --lane ${l.id}`, '')
  }
  return { name: 'RELAY', body: lines.join('\n'), mark: 'answered --lane <id> [--label <label>]', accepts: ['dismissed', 'waiting'] }
}

// ---- MERGE ------------------------------------------------------------------------------------

const tickQueue = (root, spec) => Q.tick(root, (i) => i.kind === 'spec' && rel(root, i.payload) === spec)
const tickItem = (root, id) => Q.tick(root, (i) => i.id === id)

function finalize(s, ctx, lane) {
  const root = ctx.root
  const rootSpec = lane.spec ? path.join(root, lane.spec) : null
  const doc = lane.kind === 'fix' ? null : specDoc(rootSpec)
  if (lane.kind !== 'fix' && doc && doc.frontmatter.status !== 'done') {
    // Only the spec file: `add -A` in the main checkout would sweep the user's untracked files in.
    st.writeStatus(rootSpec, 'done')
    git.sh(['add', '--', lane.spec], root)
    if (git.raw(['diff', '--cached', '--quiet'], root).status !== 0) git.sh(['commit', '-q', '-m', `chore(spec): ${lane.stem} done`, '--', lane.spec], root)
  }
  pending.unmarkLane(wtAbs(root, lane))
  const rm = git.worktreeRemove(root, lane.worktree, { deleteBranch: lane.branch })
  if (!rm.removed) lane.kept = `worktree kept at ${lane.worktree}: ${rm.reason} — git worktree remove --force ${lane.worktree}`
  if (lane.kind === 'fix') tickItem(root, lane.item); else tickQueue(root, lane.spec)
  lane.status = 'merged'
  return s
}

// Where the hold happens: every `done` lane is held while the trunk gate is red, except the lane whose landing
// turned it red (it keeps its `landed` stamp until gate-repaired finalizes it).
const stamp = (s, lane, outcome, detail) => { lane.last = { seq: s.seq || 0, outcome, detail } }
function holdDone(s) {
  for (const l of s.batch) if (l.status === 'done' && l.id !== s.red.lane) stamp(s, l, 'held', 'trunk gate is red')
}

function gateAfter(s, ctx, lane) {
  const g = host.gate(ctx.root, st.readConfig(ctx.root))
  if (g.status !== 0) {
    s.step = 'MERGE_RED'
    s.red = { lane: lane.id, runId: g.runId, tail: g.tail }
    holdDone(s)
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
  // finalize removed the worktree and branch, then a crash beat the save: only the bookkeeping is left.
  if (!fs.existsSync(wt) && !git.branchExists(root, lane.branch)) return finalize(s, ctx, lane)
  const on = git.currentBranch(root)
  if (on !== config.trunk) refuse(`${root} is on ${on}, not ${config.trunk} — check out ${config.trunk} there, then re-run`)
  const baseBefore = git.sh(['merge-base', config.trunk, 'HEAD'], wt)
  const moved = baseBefore !== git.sh(['rev-parse', config.trunk], root)
  const r = git.rebaseOnto(wt, config.trunk)
  if (!r.ok) {
    const at = git.headSha(root)
    lane.conflicts = r.conflicts
    delete lane.red
    if (lane.conflictAt === at) { lane.status = 'stopped'; lane.reason = 'second rebase conflict'; lane.question = null }
    else { lane.status = 'sent-back'; lane.conflictAt = at; stamp(s, lane, 'conflict', r.conflicts) } // its own /spec:run resolves, gates and reviews it
    return s
  }
  delete lane.conflicts
  // The base was older than trunk: the rebased tree has never been gated. Red goes back to the lane, never to trunk.
  if (moved) {
    const g = host.gate(wt, config)
    if (g.status !== 0) {
      const run = laneRun(root, lane) || {}
      writeLaneRun(root, lane, { ...run, step: 'GATE', base: git.sh(['merge-base', config.trunk, 'HEAD'], wt), review: null, attempts: { repair: 0, fix: 0 } })
      lane.status = 'sent-back'
      lane.red = host.firstRedLine(g.tail)
      stamp(s, lane, 'red', lane.red)
      return s
    }
  }
  delete lane.red
  pending.consumePending(wt)
  if (lane.kind !== 'fix') {
    const spec = laneSpec(root, lane)
    const doc = specDoc(spec)
    if (doc && doc.frontmatter.status !== 'done') st.writeStatus(spec, 'done')
  }
  clearLaneRun(root, lane)
  if (lane.kind !== 'fix') git.commitAll(wt, `chore(spec): ${lane.stem} done`, { noVerify: true }) // bookkeeping only: gateAfter runs the suite next
  const m = git.mergeBack(root, lane.branch, 'ff-only')
  if (!m.merged) refuse(`fast-forward of ${config.trunk} to ${lane.branch} failed: ${m.reason}`, 1)
  lane.landed = m.sha
  stamp(s, lane, 'landed', m.sha)
  return gateAfter(s, ctx, lane)
}

function deriveMerge(s, ctx) {
  const next = s.batch.find((l) => l.status === 'done')
  if (next) return { name: 'MERGE', auto: (x) => mergeLane(x, ctx, x.batch.find((l) => l.id === next.id)) }
  const back = s.batch.filter((l) => l.status === 'sent-back')
  if (back.length) {
    const body = dispatchBody(ctx.root, back, 'These lanes go back to their agents: a rebase conflict onto trunk (the rebase is left in progress), or a gate gone red on the rebased tree. Each resolves or repairs it, gates and reviews the result in this one dispatch:')
    const conflicted = back.filter((l) => !l.red)
    return { name: 'MERGE', body: body + (conflicted.length ? '\n\n' + conflicted.map((l) => `lane ${l.id} conflicts: ${l.conflicts.join(', ')}`).join('\n') : ''), mark: 'resent', accepts: ['dismissed'] }
  }
  if (s.batch.some((l) => l.status === 'stopped')) return { name: 'MERGE', auto: (x) => ({ ...x, step: 'RELAY' }) }
  return { name: 'MERGE', auto: (x) => ({ ...x, step: 'REPORT' }) }
}

function deriveRed(s, ctx) {
  const lane = s.batch.find((l) => l.id === s.red.lane)
  return {
    name: 'MERGE_RED',
    body: [`first failing line: ${host.firstRedLine(s.red.tail)}`,
      `The gate is red on trunk after merging lane ${lane.id} (${lane.stem}). The queue stops here.`, '',
      (s.red.tail || '(no output)').split('\n').slice(-15).join('\n'), '',
      `Repair it in ${ctx.root} (dispatch a builder or fix it here) and commit the repair, or re-run as it is when the failure was a flake: mark gate-repaired either way; the driver re-runs the gate.`].join('\n'),
    accepts: ['dismissed', 'returned'],
    mark: 'gate-repaired',
  }
}

// ---- REPORT -----------------------------------------------------------------------------------

function deriveReport(s, ctx) {
  const merged = s.batch.filter((l) => l.status === 'merged')
  const dismissed = s.batch.filter((l) => l.status === 'dismissed' && !l.ended)
  const parked = s.batch.filter((l) => l.status === 'dismissed' && l.ended && l.ended !== 'NEEDS_PLAN')
  const needSpec = s.batch.filter((l) => l.status === 'dismissed' && l.ended === 'NEEDS_PLAN')
  const waiting = s.batch.filter((l) => l.status === 'waiting')
  const saved = EXPLICIT
  EXPLICIT = []
  const cost = (l) => (l.reruns || l.lockWaitMs >= 1000 ? ` (${l.reruns || 0} rerun(s), ${Math.round((l.lockWaitMs || 0) / 1000)}s slot wait)` : '')
  const paid = merged.filter((l) => l.reruns || l.lockWaitMs >= 1000)
  const left = plan(ctx.root, st.readConfig(ctx.root)).picked
  EXPLICIT = saved
  const fixes = left.filter((p) => p.fix).length
  const opens = Q.open(Q.reconcile(ctx.root, Q.read(ctx.root))).length
  const trunkStatus = (l) => (specDoc(path.join(ctx.root, l.spec)) || { frontmatter: {} }).frontmatter.status || 'missing'
  const dismissedLine = (l) => {
    if (l.discarded) return `dismissed ${l.stem} — worktree and branch removed (wip ${l.wip || 'none'})`
    if (!l.spec) return `dismissed ${l.stem} — worktree kept at ${l.worktree}`
    const trunk = trunkStatus(l)
    return `dismissed ${l.stem} — worktree kept at ${l.worktree}, spec left hardened in the lane${trunk === 'hardened' ? '' : ` (trunk: ${trunk})`}`
  }
  return {
    name: 'REPORT',
    body: render({
      outcome: `✅ fanout — ${merged.length} lane(s) merged${parked.length ? `, ${parked.length} parked` : ''}${needSpec.length ? `, ${needSpec.length} need a spec` : ''}${dismissed.length ? `, ${dismissed.length} dismissed` : ''}${waiting.length ? `, ${waiting.length} waiting` : ''}`,
      bullets: [
        ...merged.map((l) => `merged ${l.stem}${l.landed ? ` as ${l.landed}` : ` (${l.branch})`} into trunk; queue item ticked${cost(l)}`),
        ...(s.answered || []).map((a) => `answered lane ${a.lane} (${a.stem}): ${a.label}`),
      ],
      warns: [
        ...(paid.length ? [`load: ${paid.reduce((n, l) => n + (l.reruns || 0), 0)} rerun(s), ${Math.round(paid.reduce((n, l) => n + (l.lockWaitMs || 0), 0) / 1000)}s of slot waits across the batch`] : []),
        ...merged.filter((l) => l.kept).map((l) => l.kept),
        ...parked.map((l) => `parked ${l.stem} — its lane ended ${l.ended}${l.ended === 'AMENDED' ? ' (spec set to draft in the lane; amend it with /spec:plan)' : ' (a /spec:fix item is queued)'}; worktree kept at ${l.worktree}`),
        ...needSpec.map((l) => `needs a spec: ${l.stem} — ${l.why || 'see the lane report'}; /spec:plan queued`),
        ...dismissed.map(dismissedLine),
        ...waiting.map((l) => `waiting ${l.stem} — on ${l.on}; worktree kept at ${l.worktree}`),
      ],
      next: left.length ? `${left.length - fixes} spec(s) and ${fixes} fix(es) left — /clear, then /spec:fanout to continue`
        : opens ? `nothing runnable — ${opens} open item(s) need you: /spec:queue list` : 'nothing needs you — queue drained',
    }),
    mark: 'reported',
    accepts: ['dismissed'],
  }
}

// ---- driver -----------------------------------------------------------------------------------

function derive(s, ctx) {
  switch (s.step) {
    case 'DISPATCH':
      if (s.batch.some((l) => l.status === 'planned' && !l.ready)) return { name: 'DISPATCH', auto: (x) => prepare(x, ctx) }
      // Every lane was dismissed before it went out: nothing to send.
      if (!s.batch.some((l) => l.status === 'planned')) return { name: 'DISPATCH', auto: (x) => ({ ...x, step: 'WAIT' }) }
      return { name: 'DISPATCH', body: dispatchBody(ctx.root, s.batch.filter((l) => l.status === 'planned'), 'Dispatch one lane agent per lane:', { notes: true }), mark: 'dispatched', accepts: ['dismissed'] }
    case 'WAIT': return deriveWait(s, ctx)
    case 'RELAY': return deriveRelay(s, ctx)
    case 'MERGE': return deriveMerge(s, ctx)
    case 'MERGE_RED': return deriveRed(s, ctx)
    case 'REPORT': return deriveReport(s, ctx)
    default: return derivePlan(ctx)
  }
}

function batchOf(picked, waited) {
  const batch = picked.map((p, i) => {
    if (p.fix && !p.spec) return { id: String(i + 1), spec: null, stem: 'fix-' + p.slug, worktree: `.claude/worktrees/fix-${p.slug}`, branch: `fix/${p.slug}`, status: 'planned', kind: 'fix', symptom: p.symptom, slug: p.slug, item: p.item }
    const stem = stemOf(p.spec)
    if (p.fix) return { id: String(i + 1), spec: p.spec, stem: 'fix-' + stem, worktree: `.claude/worktrees/fix-${stem}`, branch: `fix/${stem}`, status: 'planned', kind: 'fix', symptom: p.symptom, item: p.item }
    return { id: String(i + 1), spec: p.spec, stem, worktree: `.claude/worktrees/spec-${stem}`, branch: `spec/${stem}`, status: 'planned' }
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
      wipLane(ctx.root, lane)
      lane.status = 'stopped'
      lane.question = q && !q.answer ? { question: q.question, options: q.options, kind: q.kind || 'escalate' } : null
      lane.reason = typeof flags.stopped === 'string' ? flags.stopped : null
      return
    }
    const run = laneRun(ctx.root, lane) || {}
    if (run.waitingOn) { putWaiting(ctx, lane, run.waitingOn); return } // the lane asked to wait: no --stopped, no question
    const step = run.step || 'no run state yet'
    if (ENDED.includes(step)) {
      pending.unmarkLane(wt)
      wipLane(ctx.root, lane)
      lane.status = 'dismissed'
      lane.ended = step
      if (run.needsPlan) lane.why = run.needsPlan
      return
    }
    if (git.rebasing(wt)) refuse(`lane ${lane.id} (${lane.stem}) still has a rebase in progress — re-dispatch it, or mark dismissed --lane ${lane.id}`)
    if (!FINISHED.includes(step)) refuse(`lane ${lane.id} (${lane.stem}) is at ${step}, not MERGE_READY — re-dispatch it, mark returned --lane ${lane.id} --stopped "<reason>", or mark dismissed --lane ${lane.id}`)
    if (run.gate) { lane.reruns = run.gate.reruns || 0; lane.lockWaitMs = run.gate.lockWaitMs || 0 }
    lane.status = 'done' // WAIT lands it as it returns, unless the trunk gate is red
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
    if (lane.kind !== 'fix' && !flags.discard) {
      const spec = laneSpec(ctx.root, lane)
      const doc = specDoc(spec)
      if (doc && doc.frontmatter.status !== 'hardened') st.writeStatus(spec, 'hardened')
    }
    pending.unmarkLane(wtAbs(ctx.root, lane))
    const sha = wipLane(ctx.root, lane)
    lane.status = 'dismissed'
    if (flags.discard) {
      // The wip commit (or the branch head, when everything was committed already) outlives the branch as a dangling object.
      const trunk = st.readConfig(ctx.root).trunk
      const ahead = git.branchExists(ctx.root, lane.branch) && Number(git.sh(['rev-list', '--count', `${trunk}..${lane.branch}`], ctx.root)) > 0
      lane.wip = sha || (ahead ? git.sh(['rev-parse', lane.branch], ctx.root) : null)
      git.worktreeRemove(ctx.root, lane.worktree, { deleteBranch: lane.branch, force: true })
      if (!lane.spec) clearLaneRun(ctx.root, lane) // a spec-less fix's state is under the git dir, not in the worktree
      lane.discarded = true
    }
  },
  waiting(s, flags, ctx) {
    const lane = findLane(s, flags)
    if (!['dispatched', 'stopped'].includes(lane.status)) refuse(`lane ${lane.id} is ${lane.status}; only a dispatched or stopped lane can wait for a spec`)
    const on = typeof flags.on === 'string' ? rel(ctx.root, flags.on) : null
    if (!on || on.startsWith('..') || !isSpecFile(ctx.root, on)) refuse(`--on ${flags.on === true || flags.on === undefined ? '<spec>' : flags.on} is not a spec file under ${ctx.root}`)
    putWaiting(ctx, lane, on)
  },
  picked(s, flags, ctx) {
    const config = st.readConfig(ctx.root)
    const { ok, waited, held } = eligible(ctx.root, { lanes: config.lanes, auto: false })
    if (!LABELS.length) refuse('pass one --label <title> per ticked box')
    if (LABELS.length > config.lanes) refuse(`${LABELS.length} picked — at most ${config.lanes} lanes run at once`)
    const picked = LABELS.map((label) => {
      const hit = ok.find((o) => o.title === label || (!o.fix && o.spec === rel(ctx.root, label)))
      if (hit) return hit
      const w = [...waited, ...held].find((x) => x.spec === rel(ctx.root, label) || (specDoc(path.join(ctx.root, x.spec)) || {}).title === label)
      return refuse(w ? `${w.spec} is not runnable — ${w.why}` : `no runnable spec titled '${label}' — known: ${ok.map((o) => o.title).join(' | ')}`)
    })
    return batchOf([...new Set(picked)], waited)
  },
  resent(s) {
    for (const l of s.batch) if (l.status === 'sent-back') { l.status = 'dispatched'; delete l.red }
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
    s.step = 'WAIT' // lanes may still be out; WAIT hands on to RELAY or MERGE when none is
    return finalize(s, ctx, lane)
  },
  reported() { return { step: 'PLAN' } },
}

// A mark that touches lanes bumps s.seq before its step runs; mergeLane stamps what it did to a lane with
// that seq (lane.last). `held` is stamped in two places, both by holdDone: gateAfter when a landing turns the
// trunk red (inside the settle), and the wrapper below when a mark runs while the trunk is already red; the
// lane whose landing turned it red is never held. The `after` hook prints the lanes stamped by this mark.
const TOUCHING = ['returned', 'resent', 'dismissed', 'waiting', 'answered', 'resumed', 'gate-repaired']
for (const verb of TOUCHING) {
  const step = steps[verb]
  steps[verb] = (s, flags, ctx) => {
    s.seq = (s.seq || 0) + 1
    const out = step(s, flags, ctx)
    const t = out || s
    if (t.red) holdDone(t)
    return out
  }
}

// What the mark just run did to each lane it touched, in batch order, under the checkpoint.
function reportLines(verb, s, ctx) {
  if (!TOUCHING.includes(verb) || !s.batch) return []
  const config = st.readConfig(ctx.root)
  const lines = []
  for (const l of s.batch) {
    if (!l.last || l.last.seq !== (s.seq || 0)) continue
    const { outcome, detail } = l.last
    if (outcome === 'landed') lines.push(`lane ${l.id} landed as ${detail}`)
    else if (outcome === 'held') lines.push(`lane ${l.id} held — ${detail}`)
    else if (outcome === 'conflict' && l.status === 'sent-back') lines.push(`lane ${l.id} sent back — conflicts: ${detail.join(', ')}`, '  ' + agentLine(ctx.root, config, l))
    else if (outcome === 'red' && l.status === 'sent-back') lines.push(`lane ${l.id} gate red after rebase: ${detail}`, '  ' + agentLine(ctx.root, config, l))
  }
  return lines
}

// Lane markers under <common>/worktrees/*/ whose owner is fanout: lanes that are open on disk.
function openLaneMarkers(common) {
  const dir = path.join(common, 'worktrees')
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names.filter((n) => { try { return fs.readFileSync(path.join(dir, n, 'spec-lane-open'), 'utf8').trim() === 'fanout' } catch { return false } })
}

// No state file but lanes open: say so and name the newest backup, never plan over running lanes.
function load(ctx) {
  const f = st.readFanout(ctx.root)
  if (f) return f
  const common = st.gitCommonDir(ctx.root)
  const open = openLaneMarkers(common)
  if (open.length) {
    const file = path.join(common, 'spec-fanout.json')
    let backups = []
    try { backups = fs.readdirSync(path.join(common, 'spec-v7-backup')).sort().reverse().map((n) => path.join(common, 'spec-v7-backup', n, 'spec-fanout.json')).filter((p) => fs.existsSync(p)) } catch { /* no backup dir */ }
    refuse(`lanes are open (${open.join(', ')}) but ${file} is missing — ` +
      (backups.length ? `restore it: cp ${shq(backups[0])} ${shq(file)}, then re-run` : 'reconstruct it, or remove the markers to abandon the lanes'))
  }
  return { step: 'PLAN' }
}

// A mark the settled step refuses but whose effect is already in the state is not an error (lib/driver.js).
function applied(verb, s, flags) {
  const batch = s.batch || []
  const lane = batch.find((l) => l.id === String(flags.lane))
  switch (verb) {
    case 'returned': return !!lane && !['planned', 'dispatched'].includes(lane.status)
    case 'dismissed': return !!lane && lane.status === 'dismissed'
    case 'waiting': return !!lane && lane.status === 'waiting'
    case 'planned': case 'picked': return s.step !== 'PLAN'
    case 'dispatched': return s.step !== 'PLAN' && !batch.some((l) => l.status === 'planned')
    case 'resent': return s.step !== 'PLAN' && !batch.some((l) => l.status === 'sent-back')
    case 'resumed': return s.step !== 'PLAN' && !batch.some((l) => l.status === 'answered')
    case 'gate-repaired': return !s.red
    case 'reported': return s.step === 'PLAN'
    default: return false
  }
}

const driverMain = makeDriver({
  name: 'fanout',
  load,
  applied,
  after: (verb, s, ctx) => {
    const lane = verb === 'dismissed' && ctx.flags.discard && s.batch.find((l) => l.id === String(ctx.flags.lane))
    const discard = lane && lane.discarded ? `discarded lane ${lane.id} — wip ${lane.wip || 'none'}, recoverable for a day via git reflog` : null
    const lines = [...reportLines(verb, s, ctx), ...(discard ? [discard] : [])]
    return lines.length ? lines.join('\n') : null
  },
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
