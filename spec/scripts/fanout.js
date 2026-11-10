#!/usr/bin/env node
'use strict'
// fanout.js [<spec path>…] [--pick] [--root <dir>] [--mark <verb> …] — /spec:fanout: several hardened specs and every
// queued fix as parallel worktree lanes from one session. PLAN → DISPATCH → WAIT → RELAY → MERGE → REPORT; the next bare run
// plans again. One lane shape: {spec | symptom, worktree, prompt}. A lane's own run.js builds, gates, reviews and commits;
// it ends DONE in its worktree and fanout lands it through lib/land.js, the path a solo run takes. A lane that needs another
// spec ends STOPPED {why: 'after'}: its queue item holds behind that spec (the queue's own `after`) and PLAN re-picks it
// on its kept worktree once that spec is done; one that picks amend ends STOPPED {why: 'amend'}: held on its kept
// worktree (its run state is the hold) until the amended spec is locked on trunk.
// State: <git-common-dir>/spec-fanout.json. The queue: lib/queue.js only.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeDriver, parseArgv, refuse, shq } = require('./lib/driver')
const st = require('./lib/state'); const Q = require('./lib/queue'); const git = require('./lib/git'); const pending = require('./lib/pending')
const host = require('./lib/host')
const work = require('./lib/work')
const { list: queueRows } = require('./lib/queue-rows')
const { derive: deriveWork } = require('./lib/next')
const { land, briefClosed, briefOpen } = require('./lib/land')
const { render } = require('./lib/report')

let EXPLICIT = [] // positional spec paths of this invocation
let PICK = false // --pick: SELF-PICK
let LABELS = [] // every --label of this invocation

const stemOf = (p) => path.basename(p).replace(/\.md$/, '')
const rel = (root, p) => path.relative(root, path.resolve(root, String(p).replace(/^@/, ''))).split(path.sep).join('/')
const wtAbs = (root, lane) => path.resolve(root, lane.worktree)
const nameOf = (lane) => path.basename(lane.worktree)
const specDoc = (file) => { try { return st.readSpec(file) } catch { return null } }
// A lane's run state: <wt>/<spec>.run, or a spec-less fix's in <wt>/specs/fix/; null before the worktree exists.
const runDirOf = (root, lane) => (!fs.existsSync(wtAbs(root, lane)) ? null : lane.spec ? st.runDir(path.join(wtAbs(root, lane), lane.spec)) : st.fixRunDir(wtAbs(root, lane), st.slugOf(lane.symptom)))
const laneRun = (root, lane) => { const d = runDirOf(root, lane); return d && st.readJson(path.join(d, 'state.json')) }
// a lane that ended without landing (after and amend are waits that end by themselves)
const stoppedWhy = (run) => (run && run.step === 'STOPPED' && !['after', 'amend'].includes(run.why) ? run.why : null)

function findLane(s, flags) {
  const lane = (s.batch || []).find((l) => l.id === String(flags.lane))
  return lane || refuse(flags.lane && flags.lane !== true ? `no lane '${flags.lane}' in this batch — known: ${s.batch.map((l) => l.id).join(', ')}` : '--lane <id> is required — the ids are listed in the step body')
}

// ---- PLAN -------------------------------------------------------------------------------------

// Runnable = hardened, not in a lane, its lane did not stop, every dependency done, no unmet queue `after` gate, and not serial
// with the derivation's top pick (a shared brief waits; a brief dependency waits and ends the batch); in queue (or argument) order.
// Every open `type: fix` item is a lane after them: bound to its spec when it names one (fix-<stem>), else spec-less (fix-<slug>).
function eligible(root, opts = {}) {
  const ok = []; const held = []; const waited = []; const laneOf = new Map(); const cache = {}
  const open = Q.pending(root) // an unmigrated queue stops here, exit 2
  const trunk = st.readConfig(root).trunk
  const d = deriveWork(root)
  let stopAt = null
  const wait = (spec, why) => waited.push({ spec, why })
  const ended = (wt, run) => `its lane stopped (${stoppedWhy(run)}) — see the report; remove ${path.relative(root, wt)} to run it again`
  // Why a spec's STOPPED lane holds it back, for the spec itself and for a fix bound to it: the lane ended on a stop
  // to read, or picked amend and the amended spec is not yet locked. `after` and a locked amend resume by themselves.
  const laneHold = (wt, run, spec) => stoppedWhy(run) ? ended(wt, run)
    : run && run.step === 'STOPPED' && run.why === 'amend' && !st.resumes(wt, run, trunk)
      ? `its lane waits for the amended spec — /spec:plan ${spec}, then /spec:fanout` : null
  // The dependencies a spec still waits on are the derivation's (lib/next.js); fanout only says how each holds it here.
  const unmet = (dep) => `depends on ${dep.path} (${laneOf.has(dep.path) ? `lane ${laneOf.get(dep.path)} this batch`
    : dep.status === 'draft' ? 'draft — it cannot land in this fan-out' : `${dep.status}, not done`})`
  const list = EXPLICIT.length ? EXPLICIT : [...d.entries.filter((e) => /^specs\//.test(e.path || '')).map((e) => e.path), ...open.filter((i) => i.kind === 'spec').map((i) => i.payload)]
  for (const spec of [...new Set(list.map((p) => rel(root, p)))]) {
    const doc = specDoc(path.join(root, spec))
    if (!doc) { wait(spec, 'spec file not found'); continue }
    const wt = path.join(root, '.claude', 'worktrees', 'spec-' + stemOf(spec))
    const own = st.readRun(path.join(root, spec)); const run = st.readRun(path.join(wt, spec))
    const status = doc.frontmatter.status === 'hardened' && own && own.ended !== true && !['DONE', 'STOPPED'].includes(own.step) ? 'implementing' : doc.frontmatter.status || 'missing'
    if (status !== 'hardened') { (EXPLICIT.length ? waited : held).push({ spec, why: `status is ${status}, not hardened` }); continue }
    if (doc.frontmatter.prototype) { wait(spec, 'stops at LOOK for you — /spec:run it'); continue } // the app must outlive the agent
    const hold = laneHold(wt, run, spec)
    if (hold) { wait(spec, hold); continue }
    if (pending.isLane(wt)) { wait(spec, `already in a lane at ${path.relative(root, wt)}`); continue }
    const entry = d.entries.find((e) => e.path === spec)
    const gate = entry && entry.blockers.find((b) => b.startsWith('after '))
    const why = (entry && entry.deps.length ? unmet(entry.deps[0]) : gate) || null
    if (why) { wait(spec, why); continue }
    if (stopAt) { wait(spec, `the batch stops before ${stopAt}`); continue }
    const serial = entry && (entry.parallel === false ? entry.parallelReason : d.laneClash.get(entry))
    if (serial) { wait(spec, serial); if (/^brief \S+ depends on /.test(serial)) stopAt = stemOf(spec); continue }
    ok.push({ spec, title: doc.title || stemOf(spec), worktree: path.relative(root, wt) })
    if (opts.auto && ok.length <= opts.lanes) laneOf.set(spec, ok.length)
  }
  const taken = new Set()
  const fixes = EXPLICIT.length ? [] : Q.open({ items: open }).filter((i) => i.kind === 'prompt' && i.type === 'fix')
  for (const item of [...fixes.filter((i) => i.spec), ...fixes.filter((i) => !i.spec)]) {
    const spec = item.spec ? rel(root, item.spec) : null
    const symptom = item.payload || 'repair ' + stemOf(spec)
    const key = spec || st.slugOf(symptom)
    const wt = path.join(root, '.claude', 'worktrees', 'fix-' + (spec ? stemOf(spec) : key))
    const specWt = spec && path.join(root, '.claude', 'worktrees', 'spec-' + stemOf(spec))
    // A fix bound to a spec builds on that spec's code: while its own lane run sits STOPPED (ended, or held
    // after/amend) in spec-<stem>, that code is only in the kept worktree, not on trunk, so the fix waits on that lane;
    // with no lane, a spec not yet done has no code on trunk to fix, so the fix waits for it to land.
    const own = spec && st.readRun(path.join(specWt, spec))
    const fixRun = fs.existsSync(wt) && laneRun(root, { spec, symptom, worktree: wt })
    const heldOn = own && `its spec's lane is held on ${path.relative(root, specWt)} (${own.why} ${own.on})`
    const kept = own && own.step === 'STOPPED'
      ? laneHold(specWt, own, spec) || heldOn + ' — it goes out once that lane lands'
      : stoppedWhy(fixRun) ? ended(wt, fixRun) : null
    const label = Q.paste(root, item); const doc = spec && specDoc(path.join(root, spec))
    const why = spec && !doc ? 'fix item names no spec on disk'
      : doc && !['done', 'hardened'].includes(doc.frontmatter.status) ? `its spec is ${doc.frontmatter.status || 'missing'}, not done or hardened`
        : doc && doc.frontmatter.prototype ? `stops at LOOK for you — /spec:fix ${spec} — ${symptom}`
          : spec && (pending.isLane(specWt) || ok.some((o) => o.spec === spec && !o.symptom)) ? 'its spec is in a lane'
            : kept ? kept
              : doc && doc.frontmatter.status !== 'done'
                ? 'its spec is hardened, not done — it goes out once that spec lands'
                : pending.isLane(wt) || taken.has(key) ? `already in a lane at ${path.relative(root, wt)}`
                  : work.gateWhy(root, item.after, cache) ? 'after ' + work.gateWhy(root, item.after, cache) : null
    if (why) { wait(label, why); continue }
    taken.add(key)
    ok.push({ spec, symptom, item: item.id, label, title: `fix ${spec ? stemOf(spec) + ' ' : ''}— ${symptom}`, worktree: path.relative(root, wt) })
  }
  return { ok, waited, held }
}

function plan(root, config, auto = true) {
  const { ok, waited, held } = eligible(root, { lanes: config.lanes, auto })
  for (const o of ok.slice(config.lanes)) waited.push({ spec: o.label || o.spec, why: `all ${config.lanes} lanes are taken` })
  return { picked: ok.slice(0, config.lanes), waited, held }
}

const waitLines = (waited) => waited.map((w) => `${w.spec} waits — ${w.why}`)
const heldLine = (held) => `Held (not hardened, not shown as lanes): ${held.length} — ${held.map((h) => `${stemOf(h.spec)} (${h.why.replace(/^status is (\S+), not hardened$/, '$1')})`).join(', ')}`

function derivePlan(ctx) {
  const root = ctx.root; const config = st.readConfig(root)
  const branch = git.currentBranch(root)
  if (branch !== config.trunk) refuse(`${root} is on ${branch}, not trunk ${config.trunk} — run /spec:fanout from the main checkout`)
  const { picked, waited, held } = plan(root, config, !PICK)
  const extra = EXPLICIT.slice(1)
  if (picked.length && PICK) { // SELF-PICK: up to 4 questions of up to 4 boxes, labels = titles
    const shown = eligible(root, { lanes: config.lanes }).ok.slice(0, 16)
    const lines = [`Ask the user which specs to run (at most ${config.lanes}) as ONE AskUserQuestion call with multiSelect checkboxes, up to 4 options per question:`]
    for (let i = 0; i < shown.length; i += 4) lines.push('', `  Question ${i / 4 + 1}: Which of these should run as lanes?`, ...shown.slice(i, i + 4).map((o) => `   [ ] ${o.title} — ${o.spec || o.label}`))
    lines.push('', 'Then mark picked with one --label per ticked box, e.g. ' + shown.slice(0, 2).map((o) => `--label ${shq(o.title)}`).join(' '))
    const mark = ['picked --label <title>', '[--label <title> …]', ...extra].join(' ')
    return { name: 'PLAN', body: lines.join('\n'), mark }
  }
  if (!picked.length) {
    const opens = Q.pending(root)
    if (!EXPLICIT.length && !opens.length) return { name: 'PLAN', body: render({ outcome: '✅ queue drained — nothing queued', next: 'nothing needs you — queue drained' }) }
    // Nothing runnable: why each waits, then the queue as /spec:queue list prints it — every open item once.
    return { name: 'PLAN', body: render({ outcome: `⏸️ nothing runnable — ${EXPLICIT.length ? `${waited.length} named spec(s) wait` : `${opens.length} open item(s)`}`, warns: [...waitLines(waited), ...(held.length ? [heldLine(held)] : [])], next: 'nothing runnable — /spec:queue list' }) + (EXPLICIT.length ? '' : '\n' + queueRows(root, Q.read(root)) + '\n') }
  }
  const lines = [`📌 Auto-picked batch: ${picked.length} lane(s), in queue order`, ...picked.map((p, i) => `  lane ${i + 1}: ${p.spec || path.basename(p.worktree)}${p.symptom ? ` — fix: ${p.symptom}` : ''}`)]
  if (waited.length) lines.push('', 'Waiting:', ...waitLines(waited).map((w) => '  ' + w))
  if (held.length) lines.push('', heldLine(held))
  if (!EXPLICIT.length) lines.push('', 'The queue (/spec:queue list):', queueRows(root, Q.read(root)))
  lines.push('', 'Mark planned; the driver then creates the worktrees and prints the dispatch.')
  return { name: 'PLAN', body: lines.join('\n'), mark: ['planned', ...extra].join(' ') }
}

// The one lane shape. The Agent tool takes no working directory, so the prompt points the lane's driver at its worktree.
function laneOf(root, p, i) {
  const wt = path.join(root, p.worktree)
  const prompt = p.symptom === undefined ? `/spec:run ${p.spec} --root ${shq(wt)}` : `/spec:fix --root ${shq(wt)} ${p.spec ? p.spec + ' — ' : ''}${p.symptom}`
  return { id: String(i + 1), spec: p.spec, ...(p.symptom !== undefined ? { symptom: p.symptom, item: p.item } : {}), worktree: p.worktree, branch: (p.symptom === undefined ? 'spec/' : 'fix/') + path.basename(p.worktree).replace(/^(spec|fix)-/, ''), prompt, status: 'planned' }
}
const batchOf = (root, picked, waited) => ({ step: 'DISPATCH', batch: picked.map((p, i) => laneOf(root, p, i)), waited, answered: [], started: new Date().toISOString() })

// ---- DISPATCH, WAIT, RELAY ------------------------------------------------------------------------

function agentLine(root, lane) {
  const seat = st.readConfig(root).seats.orchestrator || {}
  return `Agent({ subagent_type: "claude", model: "${seat.model || 'opus'}", effort: "${seat.effort || 'medium'}", description: "lane ${lane.id}: ${nameOf(lane)}", prompt: ${JSON.stringify(lane.prompt)} })`
}
const dispatchBody = (root, lanes, intro) => [intro, 'Run all lanes in one message so they go in parallel; do not wait on them one by one.',
  'Each lane is one Agent call whose prompt runs /spec:run (a fix lane: /spec:fix) in its worktree. Do NOT use isolation: "worktree" — the driver already made the worktree and branch.', '',
  ...lanes.flatMap((l) => [`lane ${l.id} — ${nameOf(l)} (${l.branch})`, '  ' + agentLine(root, l), ...(l.red ? [`  lane ${l.id} gate red after rebase: ${l.red}`] : l.conflicts ? [`  lane ${l.id} conflicts: ${l.conflicts.join(', ')}`] : [])])].join('\n')

// A kept worktree (a lane that stopped after another spec) is attached as it is: its own run goes on from its state.
function prepare(s, ctx) {
  const trunk = st.readConfig(ctx.root).trunk
  for (const lane of s.batch.filter((l) => l.status === 'planned' && !l.ready)) {
    git.worktreeAdd(ctx.root, lane.worktree, lane.branch, trunk)
    pending.markLane(wtAbs(ctx.root, lane), 'fanout')
    lane.ready = true
  }
  return s
}

function deriveWait(s, ctx) {
  const done = s.batch.find((l) => l.status === 'done') // a finished lane lands as it returns, whatever else is out
  if (done) return { name: 'WAIT', auto: (x) => mergeLane(x, ctx, x.batch.find((l) => l.id === done.id)) }
  const live = s.batch.filter((l) => ['dispatched', 'sent-back'].includes(l.status))
  if (!live.length) return { name: 'WAIT', auto: (x) => ({ ...x, step: x.batch.some((l) => l.status === 'stopped') ? 'RELAY' : 'MERGE' }) }
  const asks = (l) => { const q = l.status === 'dispatched' && pending.readPending(wtAbs(ctx.root, l)); return q && !q.answer ? ' (question waiting — mark returned)' : '' }
  const cell = (l) => (git.rebasing(wtAbs(ctx.root, l)) ? `resolving rebase (${git.conflictsIn(wtAbs(ctx.root, l)).length} files)` : l.red ? 'gate red after rebase' : (laneRun(ctx.root, l) || { step: 'no run state yet' }).step)
  const lines = ['Lanes (status · run step):', ...s.batch.map((l) => `  lane ${l.id} — ${nameOf(l)}: ${l.status}${['dispatched', 'sent-back'].includes(l.status) ? ` · ${cell(l)}` : ''}${asks(l)}`)]
  const back = s.batch.filter((l) => l.status === 'sent-back')
  if (back.length) return { name: 'WAIT', body: dispatchBody(ctx.root, back, 'These lanes go back to their agents: a rebase conflict onto trunk (left in progress in the worktree), or a gate gone red on the rebased tree. Each resolves or repairs it, then gates and reviews the result in this one dispatch:') + '\n\n' + lines.join('\n'), mark: 'resent', accepts: ['dismissed', 'returned'] }
  lines.push('', 'As each lane agent returns, mark it returned; a lane at DONE lands as it returns. A lane that stopped without a pending question: add --stopped "<reason>".',
    'After a crash or /clear: mark a lane at DONE or STOPPED returned; re-send any other lane whose agent is no longer running (/spec:run resumes where it stopped):',
    ...live.map((l) => { const r = laneRun(ctx.root, l) || {}; return ['DONE', 'STOPPED'].includes(r.step) || asks(l) ? `  node ${shq(ctx.script)} --root ${shq(ctx.root)} --mark returned --lane ${l.id}` : '  ' + agentLine(ctx.root, l) }))
  return { name: 'WAIT', body: lines.join('\n'), mark: 'returned --lane <id> [--stopped "<reason>"]', accepts: ['dismissed'] }
}

function deriveRelay(s, ctx) {
  const root = ctx.root; const cmd = (verb, l) => `node ${shq(ctx.script)} --root ${shq(root)} --mark ${verb} --lane ${l.id}`
  const stopped = s.batch.filter((l) => l.status === 'stopped'); const answered = s.batch.filter((l) => l.status === 'answered')
  if (!stopped.length && !answered.length) return { name: 'RELAY', auto: (x) => ({ ...x, step: 'MERGE' }) }
  if (!stopped.length) return { name: 'RELAY', body: dispatchBody(root, answered, 'Every question is answered. Re-dispatch these lanes; each resumes from its run state:'), mark: 'resumed', accepts: ['dismissed'] }
  const rank = (l) => (l.question ? pending.KINDS.indexOf(l.question.kind) : pending.KINDS.length) // assumption, decision, unmet; a plain stop last
  const lines = ['Ask the user these lane questions as ONE AskUserQuestion call (at most 4 per call), verbatim, then record each answer.',
    'The orchestrator never answers for the user: every lane question below goes to the user; a question the user dismisses is marked dismissed, never answered.', '']
  for (const l of [...stopped].sort((a, b) => rank(a) - rank(b))) {
    lines.push(`[${l.question ? l.question.kind : 'stopped'}] lane ${l.id} — ${nameOf(l)}`)
    if (l.question) lines.push(`  Q: ${l.question.question}`, ...l.question.options.map((o, i) => `   - ${o.label}${i === 0 ? ' (recommended)' : ''}${o.description ? ' — ' + o.description : ''}`), `  answer: ${cmd('answered', l)} --label "<label>"`, `  dismissed: ${cmd('dismissed', l)}`)
    else lines.push(`  stopped: ${l.reason || 'no reason given'}`, `  answer: ${cmd('answered', l)}`, `  drop it instead: ${cmd('dismissed', l)}`)
    lines.push('')
  }
  return { name: 'RELAY', body: lines.join('\n'), mark: 'answered --lane <id> [--label <label>]', accepts: ['dismissed'] }
}

// ---- MERGE and REPORT -----------------------------------------------------------------------------

const stamp = (s, lane, outcome, detail) => { lane.last = { seq: s.seq || 0, outcome, detail } }
function mergeLane(s, ctx, lane) {
  const root = ctx.root; const config = st.readConfig(root); const wt = wtAbs(root, lane)
  const tick = lane.symptom !== undefined ? (i) => i.id === lane.item : (i) => i.kind === 'spec' && rel(root, i.payload) === lane.spec
  pending.consumePending(wt)
  const r = land(root, { wt, branch: lane.branch, spec: lane.symptom === undefined ? path.join(wt, lane.spec) : null, id: nameOf(lane), config, message: `chore(spec): merge ${nameOf(lane)}`, tick })
  delete lane.red; delete lane.conflicts
  if (r.conflicts) { // the lane's own run resolves it in its worktree, gates and reviews it in that one dispatch
    const at = git.headSha(root)
    if (lane.conflictAt === at) Object.assign(lane, { status: 'stopped', reason: 'second rebase conflict', question: null })
    else { Object.assign(lane, { status: 'sent-back', conflicts: r.conflicts, conflictAt: at }); stamp(s, lane, 'conflict', r.conflicts) }
  } else if (r.red) { // the rebased tree is red: back to its own run at GATE on the new base, never onto trunk
    const run = laneRun(root, lane) || {}
    st.writeJson(path.join(runDirOf(root, lane), 'state.json'), { ...run, step: 'GATE', base: r.base, review: null, attempts: { repair: 0, fix: 0 }, report: undefined })
    Object.assign(lane, { status: 'sent-back', red: r.red.split('\n').find((x) => /✖|not ok|FAIL|fail|error/i.test(x)) || r.red.split('\n')[0] })
    stamp(s, lane, 'red', lane.red)
  } else { Object.assign(lane, { status: 'merged', landed: r.landed, ...(r.kept ? { kept: `worktree kept at ${lane.worktree}: ${r.kept} — git worktree remove --force ${lane.worktree}` } : {}) }); stamp(s, lane, 'landed', r.landed) }
  // A closed or still-open brief is a fact about the queue, not about the lane: REPORT says it once.
  if (r.brief) s.briefs = [...(s.briefs || []), r.brief]
  return s
}

function deriveMerge(s, ctx) {
  const next = s.batch.find((l) => l.status === 'done')
  if (next) return { name: 'MERGE', auto: (x) => mergeLane(x, ctx, x.batch.find((l) => l.id === next.id)) }
  const back = s.batch.filter((l) => l.status === 'sent-back')
  if (back.length) return { name: 'MERGE', body: dispatchBody(ctx.root, back, 'These lanes go back to their agents: a rebase conflict onto trunk (left in progress), or a gate gone red on the rebased tree. Each resolves or repairs it, gates and reviews the result in this one dispatch:'), mark: 'resent', accepts: ['dismissed'] }
  return { name: 'MERGE', auto: (x) => ({ ...x, step: x.batch.some((l) => l.status === 'stopped') ? 'RELAY' : 'REPORT' }) }
}

const heldWhy = (l) => (l.why === 'amend'
  ? `held ${nameOf(l)} — amend: /spec:plan ${l.on}; PLAN re-picks it on its worktree once the amended spec is locked`
  : `held ${nameOf(l)} — after ${l.on}; PLAN re-picks it on its worktree once that is done`)

function deriveReport(s, ctx) {
  const by = (st0) => s.batch.filter((l) => l.status === st0)
  const merged = by('merged'); const held = by('held'); const gone = by('dismissed')
  const saved = EXPLICIT; EXPLICIT = []
  const left = plan(ctx.root, st.readConfig(ctx.root)).picked
  EXPLICIT = saved
  const fixes = left.filter((p) => p.symptom !== undefined).length; const opens = Q.pending(ctx.root).length
  const cost = (l) => (l.reruns || l.lockWaitMs >= 1000 ? ` (${l.reruns || 0} rerun(s), ${Math.round((l.lockWaitMs || 0) / 1000)}s slot wait)` : '')
  const paid = merged.filter(cost); const sum = (k) => paid.reduce((n, l) => n + (l[k] || 0), 0)
  const waitS = Math.round(sum('lockWaitMs') / 1000)
  const load = `load: ${sum('reruns')} rerun(s), ${waitS}s of slot waits across the batch`
  const briefs = [...new Map((s.briefs || []).map((b) => [b.num, b])).values()]
  const trunk = (l) => (specDoc(path.join(ctx.root, l.spec)) || { frontmatter: {} }).frontmatter.status || 'missing' // a dismissed spec lane: what trunk holds
  return {
    name: 'REPORT', mark: 'reported', accepts: ['dismissed'],
    body: render({
      outcome: `${held.length || gone.length ? '⚠️' : '✅'} fanout — ${merged.length} lane(s) merged${gone.length ? `, ${gone.length} stopped or dismissed` : ''}${held.length ? `, ${held.length} held` : ''}`,
      bullets: [...merged.map((l) => `merged ${nameOf(l)} as ${l.landed}; queue item ticked${cost(l)}`), ...(s.answered || []).map((a) => `answered lane ${a.lane} (${a.name}): ${a.question} → ${a.label}`)],
      pins: [ // a landed lane's notice, then every line its rules decided; then each brief the batch closed
        ...s.batch.flatMap((l) => [...(l.status === 'merged' && l.notice ? [`Users will notice: ${l.notice}`] : []),
          ...(l.decided || [])].map((d) => `📌 lane ${l.id} (${nameOf(l)}): ${d}`)),
        ...briefs.filter((b) => b.closed).map((b) => '📌 ' + briefClosed(b))],
      warns: [...(paid.length ? [load] : []),
        ...merged.filter((l) => l.kept).map((l) => l.kept), ...held.map(heldWhy),
        ...briefs.filter((b) => !b.closed && b.open.length).map(briefOpen),
        ...gone.map((l) => `${l.ended ? `stopped ${nameOf(l)} — ${l.ended};` : `dismissed ${nameOf(l)} —`} worktree ${l.discarded ? `and branch removed (wip ${l.wip || 'none'})` : `kept at ${l.worktree}${l.ended || l.symptom !== undefined ? '' : `, spec left hardened in the lane${trunk(l) === 'hardened' ? '' : ` (trunk: ${trunk(l)})`}`}`}`)],
      next: left.length ? `${left.length - fixes} spec(s) and ${fixes} fix(es) left — /clear, then /spec:fanout to continue` : opens ? `nothing runnable — ${opens} open item(s) need you: /spec:queue list` : 'nothing needs you — queue drained',
    }),
  }
}

function derive(s, ctx) {
  switch (s.step) {
    case 'DISPATCH':
      if (s.batch.some((l) => l.status === 'planned' && !l.ready)) return { name: 'DISPATCH', auto: (x) => prepare(x, ctx) }
      if (!s.batch.some((l) => l.status === 'planned')) return { name: 'DISPATCH', auto: (x) => ({ ...x, step: 'WAIT' }) } // every lane was dismissed
      return { name: 'DISPATCH', body: dispatchBody(ctx.root, s.batch.filter((l) => l.status === 'planned'), 'Dispatch one lane agent per lane:'), mark: 'dispatched', accepts: ['dismissed'] }
    case 'WAIT': return deriveWait(s, ctx)
    case 'RELAY': return deriveRelay(s, ctx)
    case 'MERGE': return deriveMerge(s, ctx)
    case 'REPORT': return deriveReport(s, ctx)
    default: return derivePlan(ctx)
  }
}

// ---- marks ----------------------------------------------------------------------------------------

const steps = {
  planned(s, flags, ctx) {
    const { picked, waited } = plan(ctx.root, st.readConfig(ctx.root))
    return picked.length ? batchOf(ctx.root, picked, waited) : refuse('nothing is runnable — re-run without --mark')
  },
  picked(s, flags, ctx) {
    const config = st.readConfig(ctx.root)
    const { ok, waited, held } = eligible(ctx.root, { lanes: config.lanes })
    if (!LABELS.length) refuse('pass one --label <title> per ticked box')
    if (LABELS.length > config.lanes) refuse(`${LABELS.length} picked — at most ${config.lanes} lanes run at once`)
    const picked = LABELS.map((label) => ok.find((o) => o.title === label || (!o.symptom && o.spec === rel(ctx.root, label))) || refuse((() => {
      const w = [...waited, ...held].find((x) => x.spec === rel(ctx.root, label) || (specDoc(path.join(ctx.root, x.spec)) || {}).title === label)
      return w ? `${w.spec} is not runnable — ${w.why}` : `no runnable spec titled '${label}' — known: ${ok.map((o) => o.title).join(' | ')}`
    })()))
    return batchOf(ctx.root, [...new Set(picked)], waited)
  },
  dispatched(s) { for (const l of s.batch) if (l.status === 'planned') l.status = 'dispatched'; s.step = 'WAIT' },
  returned(s, flags, ctx) {
    const lane = findLane(s, flags); const root = ctx.root; const wt = wtAbs(root, lane)
    if (lane.status !== 'dispatched') refuse(`lane ${lane.id} is ${lane.status}, not out — only a dispatched lane can return`)
    const q = pending.readPending(wt); const run = laneRun(root, lane) || {}
    lane.decided = run.decided || lane.decided; lane.notice = run.notice || lane.notice
    if (flags.stopped || (q && !q.answer)) return void Object.assign(lane, { status: 'stopped', question: q && !q.answer ? { question: q.question, options: q.options, kind: q.kind } : null, reason: typeof flags.stopped === 'string' ? flags.stopped : null })
    if (run.step === 'STOPPED' && ['after', 'amend'].includes(run.why)) { // held on its kept worktree
      if (run.why === 'after') { // its queue item holds behind the spec it needs
        const after = { spec: run.on }
        if (lane.symptom !== undefined) Q.hold(root, (i) => i.id === lane.item, after)
        else Q.hold(root, (i) => i.kind === 'spec' && rel(root, i.payload) === lane.spec, after, { payload: lane.spec })
      } // amend: the run state in the worktree is the hold, a queue `after` on its own spec would wait for done
      pending.unmarkLane(wt)
      return void Object.assign(lane, { status: 'held', on: run.on, ...(run.why === 'amend' ? { why: 'amend' } : {}) })
    }
    if (run.step === 'STOPPED') { pending.unmarkLane(wt); return void Object.assign(lane, { status: 'dismissed', ended: run.why }) }
    if (git.rebasing(wt)) refuse(`lane ${lane.id} (${nameOf(lane)}) still has a rebase in progress — re-dispatch it, or mark dismissed --lane ${lane.id}`)
    if (run.step !== 'DONE') refuse(`lane ${lane.id} (${nameOf(lane)}) is at ${run.step || 'no run state yet'}, not DONE — re-dispatch it, mark returned --lane ${lane.id} --stopped "<reason>", or mark dismissed --lane ${lane.id}`)
    Object.assign(lane, { status: 'done', reruns: (run.gate || {}).reruns || 0, lockWaitMs: (run.gate || {}).lockWaitMs || 0 }) // WAIT lands it as it returns
  },
  answered(s, flags, ctx) {
    const lane = findLane(s, flags); const wt = wtAbs(ctx.root, lane)
    if (lane.status !== 'stopped') refuse(`lane ${lane.id} is ${lane.status}; only a stopped lane takes an answer`)
    const q = pending.readPending(wt); const label = typeof flags.label === 'string' ? flags.label : null
    if (q && !q.answer && !label) refuse(`lane ${lane.id} has a pending question — pass --label <${q.options.map((o) => o.label).join(' | ')}>`)
    if (q && !q.answer) pending.answerPending(wt, label)
    s.answered = [...(s.answered || []), { lane: lane.id, name: nameOf(lane), question: q ? q.question : lane.reason || 'stopped', label: label || 'go on' }]
    Object.assign(lane, { status: 'answered', question: undefined })
  },
  resumed(s) { for (const l of s.batch) if (l.status === 'answered') { l.status = 'dispatched'; delete l.reason }; s.step = 'WAIT' },
  resent(s) { for (const l of s.batch) if (l.status === 'sent-back') { l.status = 'dispatched'; delete l.red }; s.step = 'WAIT' },
  // A dismissed question parks its lane through its own run (a decide item holds the question, no label is recorded);
  // a lane with no question is dropped, its worktree kept, or removed with --discard.
  dismissed(s, flags, ctx) {
    const lane = findLane(s, flags); const wt = wtAbs(ctx.root, lane)
    if (['merged', 'dismissed'].includes(lane.status)) refuse(`lane ${lane.id} is already ${lane.status}`)
    const q = fs.existsSync(wt) && pending.readPending(wt)
    if (q && !q.answer) {
      const args = [...(lane.spec ? [lane.spec] : []), ...(lane.symptom !== undefined ? ['--fix', lane.symptom] : []), '--root', wt, '--mark', 'dismissed']
      const r = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), ...args], { encoding: 'utf8' })
      if (r.status !== 0) refuse(`lane ${lane.id}: ${r.stderr.trim()}`, r.status || 1)
      lane.decided = (laneRun(ctx.root, lane) || {}).decided || lane.decided
      lane.ended = 'the question was dismissed'
    } else if (lane.spec && lane.symptom === undefined && !flags.discard && fs.existsSync(path.join(wt, lane.spec))) st.writeStatus(path.join(wt, lane.spec), 'hardened')
    if (fs.existsSync(wt)) pending.unmarkLane(wt)
    lane.status = 'dismissed'
    if (!flags.discard) return
    lane.wip = fs.existsSync(wt) ? git.commitWip(wt, `wip(spec): ${nameOf(lane)}`) || git.headSha(wt) : null // recoverable for a while via git reflog
    host.release(ctx.root, lane.worktree, { deleteBranch: lane.branch, force: true })
    lane.discarded = true
  },
  reported() { return { step: 'PLAN' } },
}

// A lane-touching mark bumps s.seq; mergeLane stamps what it did to a lane with it, and `after` prints those lanes.
for (const verb of ['returned', 'resent', 'dismissed', 'answered', 'resumed']) { const step = steps[verb]; steps[verb] = (s, flags, ctx) => { s.seq = (s.seq || 0) + 1; return step(s, flags, ctx) } }
function afterLines(verb, s, ctx) {
  const lines = (s.batch || []).filter((l) => l.last && l.last.seq === s.seq && verb !== 'reported').flatMap((l) => {
    const { outcome, detail } = l.last
    if (outcome === 'landed') return [`lane ${l.id} landed as ${detail}`]
    if (l.status !== 'sent-back') return []
    return [outcome === 'conflict' ? `lane ${l.id} sent back — conflicts: ${detail.join(', ')}` : `lane ${l.id} gate red after rebase: ${detail}`, '  ' + agentLine(ctx.root, l)]
  })
  const lane = verb === 'dismissed' && ctx.flags.discard && (s.batch || []).find((l) => l.id === String(ctx.flags.lane))
  if (lane && lane.discarded) lines.push(`discarded lane ${lane.id} — wip ${lane.wip || 'none'}, recoverable for a day via git reflog`)
  return lines.length ? lines.join('\n') : null
}

// No state file but lanes open: say so and name the newest backup, never plan over running lanes.
// --pick over a saved batch refuses: a pick is a new batch, and only the user drops the old one
// (a held lane's kept worktree may be reused).
function load(ctx) {
  const f = st.readFanout(ctx.root)
  if (f && PICK) {
    const lanes = f.batch.map((l) => `lane ${l.id} (${nameOf(l)})`).join(', ')
    const cmd = `node ${shq(ctx.script)} --root ${shq(ctx.root)} --mark dismissed`
    const drop = f.batch.map((l) => `${cmd} --lane ${l.id} --discard`).join(' ; ')
    refuse(`--pick: the batch started ${f.started} is still open — ${lanes}; drop each with ${drop}, ` +
      'or run /spec:fanout without --pick to resume it')
  }
  if (f) return f
  const common = st.gitCommonDir(ctx.root)
  const open = (() => { try { return fs.readdirSync(path.join(common, 'worktrees')).filter((n) => (st.readText(path.join(common, 'worktrees', n, 'spec-lane-open'), '') || '').trim() === 'fanout') } catch { return [] } })()
  if (!open.length) return { step: 'PLAN' }
  const file = path.join(common, 'spec-fanout.json')
  const backups = (() => { try { return fs.readdirSync(path.join(common, 'spec-v7-backup')).sort().reverse().map((n) => path.join(common, 'spec-v7-backup', n, 'spec-fanout.json')).filter((p) => fs.existsSync(p)) } catch { return [] } })()
  return refuse(`lanes are open (${open.join(', ')}) but ${file} is missing — ` + (backups.length ? `restore it: cp ${shq(backups[0])} ${shq(file)}, then re-run` : 'reconstruct it, or remove the markers to abandon the lanes'))
}

// A mark the settled step refuses but whose effect is already in the state is not an error (lib/driver.js).
// planned and picked never are: a saved batch does not say which selection it holds.
function applied(verb, s, flags) {
  const batch = s.batch || []; const lane = batch.find((l) => l.id === String(flags.lane))
  const none = (status) => s.step !== 'PLAN' && !batch.some((l) => l.status === status)
  return { returned: !!lane && !['planned', 'dispatched'].includes(lane.status),
    dismissed: !!lane && lane.status === 'dismissed',
    dispatched: none('planned'), resent: none('sent-back'), resumed: none('answered'),
    reported: s.step === 'PLAN' }[verb] || false
}

// PLAN holds nothing worth keeping: the fanout file is cleared and PLAN is re-derived.
// --pick rides on every printed mark line, so the reply lands on the PLAN that asked.
const driverMain = makeDriver({ name: 'fanout', load, applied, markArgs: () => (PICK ? ['--pick'] : []),
  after: afterLines,
  save: (s, ctx) => st.writeFanout(ctx.root, s.step === 'PLAN' ? null : s), derive, steps, script: __filename })

function main(argv = process.argv.slice(2)) {
  try {
    PICK = argv.includes('--pick')
    argv = argv.filter((x) => x !== '--pick')
    LABELS = argv.flatMap((x, i) => (x === '--label' && argv[i + 1] !== undefined ? [argv[i + 1]] : []))
    const a = parseArgv(argv)
    if (!a.mark) for (const k of Object.keys(a.flags)) throw new Error(`unknown argument --${k}`) // a mistyped --pick would start every spec
    EXPLICIT = a.pos.map((p) => rel(a.root, p))
  } catch (e) {
    process.stderr.write(`fanout: ${e.message}\n`)
    return 2
  }
  return driverMain(argv)
}

module.exports = { plan, main }

if (require.main === module) process.exitCode = main()
