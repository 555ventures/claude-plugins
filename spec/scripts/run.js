#!/usr/bin/env node
'use strict'
// run.js [<spec>] [--fix "<symptom>"] [--in-place] [--root <dir>] [--state] [--json] [--mark <verb>] — /spec:run and /spec:fix:
// OPEN → BUILD → GATE → REPAIR | REVIEW → FIX | ESCALATE | LOOK → COMMIT → MERGE → DONE, or STOPPED {why} (architecture §4).
// A fix is the same machine on lib/spec.js fixDoc; MERGE lands through lib/land.js as a lane does. The session asks three
// questions (assumption, decision, unmet); the rest is a rule, printed as a 📌 line.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { makeDriver, refuse, shq } = require('./lib/driver')
const st = require('./lib/state'); const S = require('./lib/spec'); const B = require('./lib/briefs'); const Q = require('./lib/queue')
const host = require('./lib/host'); const git = require('./lib/git'); const pending = require('./lib/pending')
const N = require('./lib/next')
const { land, briefClosed, briefOpen } = require('./lib/land'); const { render } = require('./lib/report')
const criteria = require('./lib/criteria'); const stub = require('./lib/stub'); const app = require('./lib/app')

const PLUGIN = path.resolve(__dirname, '..')
const REPAIR_CAP = 2; const FIX_CAP = 2; const SEVERITIES = ['blocking', 'advisory', 'needs-decision', 'note']
const AGENT_STEPS = ['BUILD', 'REPAIR', 'FIX', 'REVIEW'] // only then is a non-lane checkout marked for block-worker-git.sh
let inPlaceFlag = false

function specInfo(ctx) {
  if (!ctx.arg && ctx.flags.fix !== undefined) { const slug = st.slugOf(String(ctx.flags.fix)); return { abs: null, rel: null, stem: 'fix-' + slug, id: slug, slug } }
  const typed = ctx.arg.replace(/^@/, '') // under root first (a lane's shell sits in the main checkout); else as typed
  const abs = fs.existsSync(path.resolve(ctx.root, typed)) || !fs.existsSync(path.resolve(process.cwd(), typed)) ? path.resolve(ctx.root, typed) : path.resolve(process.cwd(), typed)
  const rel = path.relative(ctx.root, abs)
  if (rel.startsWith('..') || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) refuse(`no spec at ${abs} — pass a spec path inside ${ctx.root}`)
  const m = /(\d{8})\/(\d+)-[^/]+\.md$/.exec(rel.split(path.sep).join('/'))
  return { abs, rel, stem: path.basename(abs, '.md'), id: m ? `${m[1]}/${m[2]}` : path.basename(abs, '.md') }
}
const cfgOf = (ctx) => st.readConfig(ctx.root)
const wtOf = (state, ctx) => path.resolve(ctx.root, state.worktree)
const specIn = (state, ctx) => (state.spec ? path.join(wtOf(state, ctx), state.spec) : null)
const mainRoot = host.mainRoot
const ownOf = (state) => state.spec && state.spec.split(path.sep).join('/')
const runFile = (ctx, name) => { const s = specInfo(ctx); return path.join(s.abs ? st.runDir(s.abs) : st.fixRunDir(ctx.root, s.slug), name) }
const runText = (ctx, name) => st.readText(runFile(ctx, name), '').replace(/\r\n/g, '\n').trim()
// A fix lends its spec's full text, a stub's from history (ADR-0046); nothing writes the spec.
const docOf = (state, ctx) => (!state.fix ? st.readSpec(specIn(state, ctx))
  : S.fixDoc(state.fix.symptom, state.spec ? stub.readFull(wtOf(state, ctx), state.spec) : null))
const selfCmd = (state, ctx) => ['node', shq(path.join(__dirname, 'run.js')), ...(state.spec ? [shq(state.spec)] : []), ...(state.fix ? ['--fix', shq(state.fix.symptom)] : []), '--root', shq(ctx.root)].join(' ')
const go = (state, step, extra = {}) => Object.assign(state, extra, { step, history: [...(state.history || []), { step, at: new Date().toISOString() }] })

// Every rule that decides instead of asking says so: a 📌 line in the report and in fanout's REPORT.
const decide = (state, line) => { state.decided = [...(state.decided || []), line] }

function load(ctx) {
  const fix = ctx.flags.fix
  if (fix !== undefined && (typeof fix !== 'string' || !fix.trim())) refuse('--fix needs a symptom: --fix "<symptom>"')
  cfgOf(ctx); Q.read(ctx.root) // an unmigrated config or queue: exit 2 naming /spec:migrate
  const s = specInfo(ctx)
  const ignored = (p) => git.raw(['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', p], ctx.root).status !== 1
  const sidecar = path.relative(ctx.root, runFile(ctx, 'state.json')) // a spec's or a spec-less fix's
  if (!ignored(sidecar) || (!inPlaceFlag && !ignored('.claude/worktrees/x')))
    refuse('run sidecars and worktrees must be git-ignored — add the lines `specs/**/*.run/` and `.claude/worktrees/` to .gitignore, commit it, then re-run')
  const prior = st.readJson(runFile(ctx, 'state.json'))
  if (fix !== undefined && !prior && !inPlaceFlag && !pending.isFanoutLane(ctx.root)) refuse('--fix works in place (--in-place) or as a fanout lane')
  return prior || { step: 'OPEN', spec: s.rel, ...(fix === undefined ? {} : { fix: { symptom: fix.trim() } }) }
}

function save(state, ctx) {
  if (!state.lane && state.worktree) { // a lane's marker belongs to fanout; otherwise it is on exactly while an agent is out
    if (!state.ended && AGENT_STEPS.includes(state.step)) { pending.markLane(wtOf(state, ctx), 'run'); state.marked = true } else if (state.marked) { pending.unmarkLane(wtOf(state, ctx)); state.marked = false }
  }
  if (state.ended) fs.rmSync(path.dirname(runFile(ctx, 'state.json')), { recursive: true, force: true }); else st.writeJson(runFile(ctx, 'state.json'), state)
}

function open(state, ctx) {
  const s = specInfo(ctx); const cfg = cfgOf(ctx)
  const spec = s.abs ? st.readSpec(s.abs) : null
  const status = spec && spec.frontmatter.status
  if (spec && (status === 'draft' || spec.markers)) refuse(`${s.rel} is ${status === 'draft' ? 'a draft' : `carrying ${spec.markers} [NEEDS CLARIFICATION:] marker(s)`} — finish it with /spec:plan ${s.rel}, then re-run`)
  if (spec && state.fix && !['done', 'hardened'].includes(status)) refuse(`${s.rel} is ${status}, not done or hardened — a fix runs on a finished or hardened spec`)
  if (spec && status === 'done' && !state.fix) refuse(`${s.rel} is already done — nothing to run`)
  if (spec && !state.fix && !['hardened', 'implementing'].includes(status)) refuse(`${s.rel} is ${status || '<missing>'} — /spec:run needs hardened or implementing`)
  if (!cfg.testCommand) refuse('no testCommand in .claude/spec.config.json — run /spec:init')
  const proto = spec && typeof spec.frontmatter.prototype === 'string' && spec.frontmatter.prototype ? spec.frontmatter.prototype : null
  if (proto) app.needProto(cfg, proto, st.readProto(ctx.root, proto).contract)
  const lane = pending.isFanoutLane(ctx.root); const inPlace = !lane && inPlaceFlag; const cur = git.currentBranch(ctx.root)
  if (!lane && cur === 'HEAD') refuse('detached HEAD — check out a branch, then re-run')
  if (!lane && !inPlace && cur !== cfg.trunk) refuse(`${ctx.root} is on ${cur}, not trunk ${cfg.trunk} — check out ${cfg.trunk}, or pass --in-place to build on ${cur}`) // the only way to build outside a worktree
  if (!lane && git.sh(['status', '--porcelain', '--untracked-files=no'], ctx.root)) refuse(git.dirtyMessage(ctx.root))
  let wt = ctx.root; let setup = { status: 0 }
  const branch = `spec/${s.stem}`
  if (!lane && !inPlace) {
    const rel = path.join('.claude', 'worktrees', 'spec-' + s.stem)
    const fresh = !fs.existsSync(path.join(ctx.root, rel))
    if (!fresh && pending.isFanoutLane(path.join(ctx.root, rel))) refuse(`${rel} is a fanout lane in flight — let /spec:fanout finish it, or mark it dismissed there`)
    if (fresh && git.branchExists(ctx.root, branch)) { // a branch an abandoned run left: re-pointed when trunk holds it
      if (git.raw(['merge-base', '--is-ancestor', branch, cfg.trunk], ctx.root).status !== 0) refuse(`branch ${branch} exists with commits not on ${cfg.trunk} — merge, rename or delete it, then re-run`)
      git.sh(['branch', '-D', branch], ctx.root)
    }
    ;({ wt, setup } = host.provision(ctx.root, { rel, branch, from: cfg.trunk, config: cfg }))
  } else if (lane) setup = host.prepare(mainRoot(ctx.root), wt, cfg, true)
  if (setup.status !== 0) {
    if (!lane) host.release(ctx.root, wt, { force: true, deleteBranch: branch }) // the re-run provisions afresh
    refuse(`setupCommand failed in ${wt}:\n${setup.tail}\nfix setupCommand in .claude/spec.config.json, then re-run`, 1)
  }
  if (spec && !state.fix) { // the worktree copy says done from the start, so the gated tree is the tree that lands
    if (wt !== ctx.root) st.writeText(path.join(wt, s.rel), fs.readFileSync(s.abs, 'utf8'))
    st.writeStatus(path.join(wt, s.rel), inPlace ? 'implementing' : 'done')
  }
  const mb = git.raw(['merge-base', cfg.trunk, 'HEAD'], wt)
  return go(state, 'BUILD', {
    spec: s.rel, worktree: path.relative(ctx.root, wt) || '.', branch: inPlace || lane ? cur : branch, base: mb.status === 0 ? mb.stdout.trim() : git.headSha(wt),
    inPlace, lane, marked: false, pin: inPlace ? '📌 Auto-picked in place — --in-place' : null, attempts: { repair: 0, fix: 0 }, opus: false, gate: null, review: null,
    decided: [], rulings: [], notice: spec && !state.fix ? spec.intent.notice : '', ...(proto ? { prototype: proto } : {}),
    ...(state.fix && inPlace ? { untracked0: git.sh(['ls-files', '--others', '--exclude-standard'], wt).split('\n').filter(Boolean) } : {}),
  })
}

const isGlob = (p) => /[*?]/.test(p)
const builderFiles = (ctx) => crypto.createHash('sha1').update(['evidence.md', 'as-built.md'].map((n) => n + '\0' + runText(ctx, n)).join('\0')).digest('hex')

// ADR-0015: a planned new file is intent-to-add while the gate runs, so `git ls-files` sees it.
function intentToAdd(wt, rows) {
  const add = git.lsFiles(wt, ['-o', '--exclude-standard']).filter((f) => S.inPlan(rows, f))
  const r = add.length ? git.raw(['--literal-pathspecs', 'add', '-N', '--', ...add], wt) : { status: 0 }
  if (r.status !== 0) refuse(`git add -N failed in ${wt}: ${(r.stderr || r.stdout).trim()}`)
  for (const p of rows.map((x) => x.path).filter((x) => !isGlob(x) && fs.lstatSync(path.join(wt, x), { throwIfNoEntry: false })?.isFile())) {
    if (git.raw(['check-ignore', '-q', '--', p], wt).status === 0) process.stderr.write(`⚠️ ${p} is in the File Plan but .gitignore hides it — it will not be committed\n`)
  }
}

// After a green gate: a build that changed nothing, or a File Plan row not true on disk, is red.
function buildProof(state, wt, rows) {
  if (!git.changedFiles(state.base, wt).some((f) => f !== ownOf(state) && !/(^|\/)[^/]*\.run\//.test(f))) return `build: nothing changed since ${state.base}`
  const files = git.lsFiles(wt, ['-c', '-o', '--exclude-standard']).filter((f) => fs.existsSync(path.join(wt, f)))
  const present = (r) => (isGlob(r.path) ? files.some((f) => S.globToRe(r.path).test(f)) : fs.existsSync(path.join(wt, r.path)))
  const bad = rows.filter((r) => (['CREATE', 'MODIFY'].includes(r.action) ? !present(r) : r.action === 'DELETE' && present(r)))
  return bad.map((r) => `file plan: ${r.action} ${r.path} is not true on disk`).join('\n') || null
}

// After a green gate: a criterion the build stopped citing, or one no test cites, is red (ADR-0048). Criteria are
// read as locked at the base; a note is a 📌 line.
function criteriaRed(state, ctx, wt, cfg) {
  const own = !state.fix && ownOf(state); const locked = own && git.raw(['show', `${state.base}:${own}`], wt)
  const doc = locked && locked.status === 0 ? S.parse(locked.stdout) : docOf(state, ctx)
  const r = criteria.check({ wt, base: state.base, cfg, doc })
  for (const w of r.warn) if (!(state.decided || []).includes(w)) decide(state, w)
  return r.red.join('\n') || null
}

const appAt = (s, c) => ({ cwd: wtOf(s, c), root: mainRoot(c.root), log: st.appLog(c.root, 'run-' + specInfo(c).stem) })
let lookTried = false // LOOK ensures the app once per invocation

function gateStep(state, ctx) {
  const cfg = cfgOf(ctx); const wt = wtOf(state, ctx); const rows = S.planRows(docOf(state, ctx)); const t0 = Date.now()
  intentToAdd(wt, rows.filter((r) => r.action !== 'DELETE'))
  let g = host.gate(wt, cfg)
  let waited = g.lockWaitMs || 0
  const prior = state.gate && state.gate.tree === g.tree ? state.gate : null // one rerun per tree
  let reruns = prior ? prior.reruns || 0 : 0
  const touched = g.status !== 0 && !prior && g.failing && g.failing.length && new Set(git.changedFiles(state.base, wt))
  if (touched && g.failing.every((f) => !touched.has(f))) { g = host.gate(wt, cfg); waited += g.lockWaitMs || 0; reruns = 1 } // red only outside the diff: load, run once more
  let tail = g.status !== 0 ? g.tail || `the test command exited ${g.status}`
    : buildProof(state, wt, rows) || criteriaRed(state, ctx, wt, cfg)
  if (!tail && state.prototype) tail = app.gatePins(cfg, state, { ...appAt(state, ctx), say: (l) => decide(state, l) })
  state.gate = { status: tail ? 'red' : 'green', runId: g.runId, cached: g.cached, ms: Date.now() - t0, output_tail: tail || g.tail, tree: g.tree, files: builderFiles(ctx), failing: g.failing || [], reruns, lockWaitMs: waited }
  if (tail) return state.attempts.repair >= REPAIR_CAP ? parkRun(state, ctx, `still red after ${REPAIR_CAP} repairs`, fixItem(state, ctx, host.firstRedLine(tail))) : go(state, 'REPAIR')
  if (!cfg.testFileCommand) delete state.redCheck
  else if (state.redCheckTree !== g.tree) { state.redCheck = redCheck(state, wt); state.redCheckTree = g.tree }
  const edits = specEdits(state, ctx)
  if (edits.length) { // a build never edits spec text: the edits are undone and the tree is gated again
    const status = state.spec && st.readSpec(specIn(state, ctx)).frontmatter.status
    git.restore(wt, state.base, edits)
    if (edits.includes(ownOf(state))) st.writeStatus(specIn(state, ctx), status) // the own spec keeps its status line
    decide(state, `reverted spec text the build edited (${edits.join(', ')}) and gated again`)
    return go(state, 'GATE')
  }
  st.writeText(runFile(ctx, 'diff.patch'), git.diff(state.base, wt) + '\n')
  fs.rmSync(runFile(ctx, 'findings.json'), { force: true }) // never re-read an earlier round's findings
  return go(state, 'REVIEW')
}

const redCheck = (state, wt) => B.redCheckLine(spawnSync(process.execPath, [path.join(__dirname, 'red-check.js'), '--base', state.base, '--root', wt], { encoding: 'utf8' }).stdout)

// Spec text a build may not change: any other spec, its own below the frontmatter.
const body = (text) => S.parseFrontmatter(String(text).replace(/\r\n/g, '\n')).body
function specEdits(state, ctx) {
  const wt = wtOf(state, ctx); const own = ownOf(state)
  const files = git.changedFiles(state.base, wt).filter((f) => S.isSpecText(f) && f !== own)
  const was = own && git.raw(['show', `${state.base}:${own}`], wt)
  const edited = was && was.status === 0 && body(was.stdout) !== body(st.readText(specIn(state, ctx), ''))
  return edited ? [...files, own] : files
}

// Files changed outside the File Plan (the spec itself and, with a Canonical Delta, docs/canonical are not).
function outsideFiles(state, ctx, doc) {
  const own = ownOf(state); const delta = Object.keys(doc.sections).some((k) => k === 'Canonical Delta' || k.startsWith('Canonical Delta '))
  return git.changedFiles(state.base, wtOf(state, ctx)).filter((f) => !S.inPlan(S.planRows(doc), f) && f !== own && !f.startsWith(own.replace(/\.md$/, '.run/')) && !(delta && f.startsWith('docs/canonical/')))
}

const fixItem = (state, ctx, words) => (specInfo(ctx).rel ? { type: 'fix', spec: specInfo(ctx).rel, payload: String(words).trim() } : { type: 'fix', payload: state.fix.symptom.replace(/\s+/g, ' ') })

// Ends the run STOPPED {why}: the item (a fix, plan or decide) is queued, said in a 📌 line.
function parkRun(state, ctx, why, item) {
  const s = specInfo(ctx)
  app.stopIn(state)
  if (s.abs && !state.fix && state.inPlace) st.writeStatus(s.abs, 'hardened')
  // null from add: the same item is already open
  const queued = Q.paste(ctx.root, Q.add(ctx.root, item) || { kind: 'prompt', ...item })
  decide(state, `stopped: ${why}${queued ? ` — queued ${queued}` : ''}`)
  if (state.lane) pending.consumePending(ctx.root)
  state.report = render({ outcome: `⏸️ ${s.id} stopped — ${why}`,
    pins: B.pins(state), artifacts: s.rel, queued, next: queued })
  return go(state, 'STOPPED', { why, ended: !state.lane })
}

// The user amends the spec: the work stays (a worktree's committed as wip, the spec back as the base had it, so the
// rebase onto the re-locked trunk cannot conflict) and the run waits, STOPPED, until plan.js lock lands a changed spec.
function amend(state, ctx) {
  const s = specInfo(ctx); const wt = wtOf(state, ctx); const own = ownOf(state)
  app.stopIn(state)
  decide(state, `amend: /spec:plan ${s.rel} — the build resumes by itself once the amended spec is locked`)
  const next = `/spec:plan ${s.rel}`
  state.report = render({ outcome: `⏸️ ${s.id} stopped — amend`, pins: B.pins(state), artifacts: s.rel, next })
  if (state.inPlace) { // the checkout's own spec, as the branch has it
    git.restore(wt, 'HEAD', [own]); state.at = git.headSha(wt)
  }
  else { git.restore(wt, state.base, [own]); git.commitWip(wt, `wip(spec): ${s.stem} awaits its amended spec`) }
  return go(state, 'STOPPED', { why: 'amend', on: own, from: state.from })
}

// A run waits on a spec that lands on `ref`: trunk, or in place the branch it builds on.
const refOf = (state, ctx) => (state.inPlace ? state.branch : cfgOf(ctx).trunk)
// An amended spec's locked text comes into the worktree copy (done; implementing in place) for GATE and the review.
function takeSpec(state, ctx) {
  const own = ownOf(state); const file = specIn(state, ctx)
  st.writeText(file, git.raw(['show', `${refOf(state, ctx)}:${own}`], wtOf(state, ctx)).stdout)
  st.writeStatus(file, state.inPlace ? 'implementing' : 'done')
  state.notice = st.readSpec(file).intent.notice
  delete state.respec
}
function resume(state, ctx) {
  const ref = refOf(state, ctx); const wt = wtOf(state, ctx); const amended = state.why === 'amend'
  const from = amended ? 'GATE' : state.from
  const fresh = amended ? { review: null, attempts: { repair: 0, fix: 0 } } : {}
  go(state, from, { why: undefined, on: undefined, at: undefined, report: undefined, ...fresh })
  const rebased = state.inPlace || git.rebaseOnto(wt, ref).ok // a conflict: the rebase guard prints it
  if (rebased) state.base = git.sh(['merge-base', ref, 'HEAD'], wt)
  if (amended) { if (rebased) takeSpec(state, ctx); else state.respec = true }
  return state
}

function commit(state, ctx) {
  app.stopIn(state)
  const s = specInfo(ctx); const wt = wtOf(state, ctx); const doc = docOf(state, ctx)
  if (state.inPlace && !state.fix) st.writeStatus(specIn(state, ctx), 'done')
  const mb = git.raw(['merge-base', cfgOf(ctx).trunk, 'HEAD'], wt) // a lane's wait commits never reach trunk: folded into the one build commit
  if (mb.status === 0 && git.sh(['log', '--format=%s', `${mb.stdout.trim()}..HEAD`], wt).split('\n').some((l) => l.startsWith('wip(spec):'))) git.sh(['reset', '-q', '--soft', mb.stdout.trim()], wt)
  const outside = state.spec && !state.fix ? outsideFiles(state, ctx, doc) : []
  const asBuilt = [...runText(ctx, 'as-built.md').split('\n').map((l) => l.trim().replace(/^[-*]\s+/, '')).filter(Boolean), ...outside.map((f) => `touched outside the File Plan: ${f}`)]
  const message = B.commitMessage(state, state.fix ? `fix(${s.id}): ${state.fix.symptom.replace(/\s+/g, ' ')}` : `build(${s.id}): ${doc.title}`, asBuilt, runText(ctx, 'evidence.md'))
  const left = state.fix ? state.untracked0 || [] : state.inPlace ? outside : [] // in place a spec commits only its File Plan; a fix, only what it touched
  try {
    for (;;) {
      const r = git.commitAll(wt, message, { exclude: [...left, ...(state.keptOut || [])] })
      if (!r || !r.hits) { state.commit = r || (git.headSha(wt) !== state.base ? git.headSha(wt) : null); break }
      state.keptOut = [...new Set([...(state.keptOut || []), ...r.hits.map((h) => h.path)])] // a secret stays on disk, never in history
      decide(state, `kept out of the commit, it looks like a secret: ${r.hits.map((h) => `${h.path}${h.line ? ':' + h.line : ''} (${h.reason})`).join(', ')}`)
    }
  } catch (e) { // a commit hook rejected the build: repaired like a red gate; anything else is the user's git
    const hooks = git.raw(['rev-parse', '--git-path', 'hooks'], wt).stdout.trim()
    if (!['pre-commit', 'commit-msg'].some((h) => fs.existsSync(path.resolve(wt, hooks, h)))) refuse(`git commit failed in ${wt}: ${e.message}`, 1)
    state.gate = { ...(state.gate || {}), status: 'red', output_tail: `git commit was rejected (a commit hook?):\n${e.message}` }
    return state.attempts.repair >= REPAIR_CAP ? parkRun(state, ctx, 'the commit hook still rejects the build', fixItem(state, ctx, host.firstRedLine(e.message))) : go(state, 'REPAIR')
  }
  const dirty = new Set(git.sh(['status', '--porcelain', '-z', '--untracked-files=all'], wt).split('\0').filter(Boolean).map((e) => e.slice(3)))
  state.commitWarns = left.some((f) => dirty.has(f)) ? [`left uncommitted: ${left.filter((f) => dirty.has(f)).join(', ')}`] : []
  const adv = ((state.review && state.review.findings) || []).filter((f) => f.severity === 'advisory' && f.summary)
  if (adv.length && !state.advised) { // advisories reach someone: one fix item per run, bound to the spec if it has one
    const words = `advisories of ${s.stem}: ${adv.map((f) => f.summary.trim()).join('; ')}`
    state.advised = true
    if (fromAdvisories(state, ctx)) { // queuing again would chain without end
      decide(state, `this fix is itself advisories, so these queue no more: ${adv.map((f) => f.summary).join('; ')}`)
    } else {
      const item = Q.add(ctx.root, { type: 'fix', ...(s.rel ? { spec: s.rel } : {}), payload: words, advisories: true })
      if (item) decide(state, `queued the review's advisories as one fix: ${Q.paste(ctx.root, item)}`)
    }
  }
  if (!state.lane) return go(state, 'MERGE')
  state.report = B.report(state, `✅ ${state.fix ? `fixed — ${state.fix.symptom}` : `${s.id} built and reviewed`} — committed on ${state.branch}; fanout lands it`, 'nothing needs you — fanout lands the lane')
  return go(state, 'DONE') // a lane ends in its worktree: fanout lands it through the same lib/land.js
}

// Is this queued item the fix being run? fromAdvisories and merge's tick ask.
const flat = (t) => String(t).replace(/\s+/g, ' ').trim()
const isThisFix = (state, ctx, s = specInfo(ctx)) => (i) => i.type === 'fix' &&
  (i.spec && path.resolve(ctx.root, i.spec) || null) === s.abs &&
  flat(i.payload || 'repair ' + s.stem) === flat(state.fix.symptom)

// Whether this fix is a queued advisories item, read from the item, never from the symptom's words: a fanout lane's
// own item (the batch records its id, so a reworded symptom still finds it), else the open item the typed symptom is.
function fromAdvisories(state, ctx) {
  if (!state.fix) return false
  const fan = state.lane && st.readFanout(ctx.root) // a landed lane's worktree is gone: git.real tolerates it
  const at = (l) => git.real(path.resolve(mainRoot(ctx.root), l.worktree)) === git.real(ctx.root)
  const lane = fan && (fan.batch || []).find(at)
  const it = Q.open(Q.read(ctx.root)).find((i) => lane ? i.id === lane.item : isThisFix(state, ctx)(i))
  return !!(it && it.advisories)
}

function merge(state, ctx) {
  const s = specInfo(ctx)
  const tick = !state.fix ? (i) => i.kind === 'spec' && path.resolve(ctx.root, i.payload) === s.abs
    : s.abs ? isThisFix(state, ctx) : null
  const r = land(mainRoot(ctx.root), { wt: wtOf(state, ctx), branch: state.branch, spec: state.fix ? null : specIn(state, ctx), id: s.id, config: cfgOf(ctx), message: `chore(spec): merge ${s.id} — ${state.fix ? state.fix.symptom : docOf(state, ctx).title}`, inPlace: state.inPlace, tick })
  if (r.conflicts) return state // the rebase is left in the worktree: the rebase guard prints the step
  if (r.red) return go(state, 'GATE', { base: r.base, attempts: { repair: 0, fix: 0 } })
  if (r.kept) state.commitWarns = [...(state.commitWarns || []), `worktree kept at ${state.worktree}: ${r.kept} — git worktree remove --force ${state.worktree}`]
  state.mergeSha = state.inPlace ? null : r.landed
  if (r.brief && r.brief.closed) decide(state, briefClosed(r.brief))
  else if (r.brief && r.brief.open.length) state.commitWarns = [...(state.commitWarns || []), briefOpen(r.brief)]
  const done = state.fix ? `✅ fixed — ${state.fix.symptom}`
    : state.inPlace ? `✅ ${s.id} built and reviewed on ${state.branch}` : `✅ ${s.id} built, reviewed and merged`
  state.report = B.report(state, done, N.topLines(N.derive(ctx.root)).join('\n'))
  return go(state, 'DONE', { ended: true, marked: false })
}

const pictures = (state, wt) => { const rel = `design/prototypes/${state.prototype}/pictures`; try { return fs.readdirSync(path.join(wt, rel)).sort().map((f) => `${rel}/${f}`) } catch { return [] } }
function brief(state, ctx, kind) {
  const cfg = cfgOf(ctx); const doc = docOf(state, ctx); const wt = wtOf(state, ctx); const p = state.prototype && cfg.prototype
  const attempt = 1 + state.attempts.repair + state.attempts.fix + (kind === 'build' || kind === 'review' ? 0 : 1)
  const b = {
    wt, specPath: specIn(state, ctx), doc, cfg, runFile: (n) => runFile(ctx, n), plugin: PLUGIN, rulings: state.rulings || [], gate: state.gate, review: state.review, attempt, opus: state.opus,
    fixFor: state.fixFor, lookReply: state.lookReply, base: state.base, redCheck: state.redCheck, evidence: runText(ctx, 'evidence.md'), asBuilt: runText(ctx, 'as-built.md'),
    outside: kind === 'review' && !state.fix ? outsideFiles(state, ctx, doc) : null,
    proto: p ? { pins: ((st.readProto(wt, state.prototype).contract || {}).pins || []).filter((x) => x.status === 'active'), e2eFile: String(p.e2eFile).replace(/\{stem\}/g, state.prototype), stem: state.prototype, pictures: pictures(state, wt) } : null,
  }
  const out = kind === 'review' ? B.reviewer(b) : B.builder(b, kind)
  // Lanes share one scratchpad: each brief has its own run dir; its path is printed.
  const file = runFile(ctx, kind === 'review' ? 'brief-review.md' : `brief-${kind}-${attempt}.md`)
  st.writeText(file, out.body.join('\n') + '\n')
  return [...(kind === 'build' && state.pin ? [state.pin, ''] : []), out.head, `The brief is saved at ${file} (this run's own path): hand the agent that path or paste the text below; never save it to a file other lanes share. Give it this brief:`, '', ...out.body].join('\n')
}

const escalation = (state) => B.escalation(state, !!state.spec && !state.fix)
function askBody(state, ctx) { // a lane writes the question for the parent session and stops
  const e = escalation(state)
  if (!state.lane) return B.question(e.q, e.options)
  pending.writePending(ctx.root, { lane: specInfo(ctx).stem, question: e.q, options: e.options, kind: e.kind })
  return pending.stopLine(ctx.root)
}

// Every worktree run resolves a rebase left in progress, whatever its step; then it is gated and reviewed again.
const rebaseGuard = (state, ctx) => !state.inPlace && state.worktree && !['STOPPED', 'ESCALATE'].includes(state.step) && fs.existsSync(wtOf(state, ctx)) && git.rebasing(wtOf(state, ctx))
function finishRebase(state, ctx) {
  const wt = wtOf(state, ctx)
  git.sh(['add', '-A'], wt); git.raw(['-c', 'core.editor=true', 'rebase', '--continue'], wt) // a later commit may conflict again
  if (!git.rebasing(wt)) {
    const base = git.sh(['merge-base', cfgOf(ctx).trunk, 'HEAD'], wt)
    go(state, 'GATE', { base, attempts: { repair: 0, fix: 0 }, report: undefined })
    if (state.respec) takeSpec(state, ctx) // an amended spec's text, held back while the rebase conflicted
    return state
  }
  if (!git.conflictsIn(wt).length) refuse(`the rebase in ${wt} stopped without a conflict — finish it with git rebase --continue or --skip there, then re-run`, 1)
  return state
}

const asks = (state) => [...(state.spec ? ['unmet'] : []), 'after', ...(state.fix ? ['needs-plan'] : [])]
function derive(state, ctx) {
  if (rebaseGuard(state, ctx)) {
    const wt = wtOf(state, ctx); const files = git.conflictsIn(wt)
    if (!files.some((f) => /^(<{7}|>{7})( |$)/m.test(st.readText(path.join(wt, f), '')))) return { name: state.step, auto: finishRebase }
    return { name: state.step, body: B.rebase({ wt, trunk: git.sh(['rev-parse', cfgOf(ctx).trunk], wt), files }), accepts: ['unmet'] }
  }
  const sh = (s) => `${selfCmd(state, ctx)} --mark ${s}`
  if (state.step === 'LOOK' && !lookTried) {
    const look = (s, c) => ((lookTried = true), app.upIn(cfgOf(c).runtime, s, appAt(s, c), false) ? go(s, 'GATE') : s)
    return { name: 'LOOK', auto: look }
  }
  switch (state.step) {
    case 'OPEN': return { name: 'OPEN', auto: open }
    case 'BUILD': return { name: 'BUILD', body: brief(state, ctx, 'build'), mark: 'built', accepts: asks(state) }
    case 'GATE': return { name: 'GATE', auto: gateStep }
    case 'REPAIR': return { name: 'REPAIR', mark: 'repaired', accepts: [...asks(state), 'regate'], body: brief(state, ctx, 'repair') + '\n\n' + B.regate(state.gate, sh('regate')) }
    case 'REVIEW': return { name: 'REVIEW', body: brief(state, ctx, 'review'), mark: `reviewed --file ${shq(runFile(ctx, 'findings.json'))}`, accepts: asks(state) }
    case 'FIX': return { name: 'FIX', body: brief(state, ctx, 'fix'), mark: 'fixed', accepts: asks(state) }
    case 'LOOK': { const wt = wtOf(state, ctx); return { name: 'LOOK', mark: 'looked', accepts: ['look-failed'], body: B.look({ state, wt, cfg: cfgOf(ctx), contract: st.readProto(wt, state.prototype).contract, pictures: pictures(state, wt), looked: sh('looked'), failed: sh('look-failed') }) } }
    case 'ESCALATE': {
      const doc = state.lane && pending.readPending(ctx.root) // a lane continues with fanout's recorded answer
      if (doc && doc.answer) return { name: 'ESCALATE', auto: (s) => steps.escalate(s, { choice: doc.answer.label }, ctx) }
      return { name: 'ESCALATE', body: askBody(state, ctx), mark: `escalate <${escalation(state).options.map((o) => o.label).join('|')}>`, accepts: ['dismissed'] }
    }
    case 'COMMIT': return { name: 'COMMIT', auto: commit }
    case 'MERGE': return { name: 'MERGE', auto: merge }
    case 'STOPPED': {
      const waits = ['after', 'amend'].includes(state.why) && st.resumes(ctx.root, state, refOf(state, ctx))
      if (waits) return { name: 'STOPPED', auto: resume }
      return { name: state.step, body: state.report || '' } // any other ending, or a wait not over, prints its report
    }
    default: return { name: state.step, body: state.report || '' }
  }
}

// A builder round changes the tree or its run files; a mark with both as the last gate saw them spends nothing.
function unchanged(state, ctx) {
  if (state.gate && state.gate.tree && host.treeSha(wtOf(state, ctx)) === state.gate.tree && builderFiles(ctx) === state.gate.files) refuse(`nothing changed since the last gate — ${state.step === 'REPAIR' ? 're-run the gate (mark regate) or ' : ''}dispatch a builder`)
}
const why = (flags, what) => { if (typeof flags.why !== 'string' || !flags.why.trim()) refuse(`${what} needs --why "<text>"`); return flags.why.trim() }
const afterReview = (state) => go(state, state.prototype ? 'LOOK' : 'COMMIT')
const known = (what, id, list, rel) => refuse(`--${what} ${id === true || id === undefined ? '<id>' : id} is not ${what === 'decision' ? `a row of ${rel}'s Decisions table` : `an Assumption of ${rel}`} — known: ${list.join(', ') || 'none'}`)

// A question with one answer left is a rule: park is applied and said in a 📌 line.
function ask(state, ctx, extra) {
  go(state, 'ESCALATE', extra)
  if (escalation(state).options.length >= 2) return state
  decide(state, 'Auto-picked park — the only answer left: a fix has no spec to amend and Opus already ran'
    + ' (veto anytime)')
  return steps.escalate(state, { choice: 'park' }, ctx)
}

const steps = {
  built(state) { return go(state, 'GATE') },
  repaired(state, flags, ctx) { unchanged(state, ctx); state.attempts.repair++; return go(state, 'GATE') },
  fixed(state, flags, ctx) { unchanged(state, ctx); if (state.fixFor) delete state.fixFor; else state.attempts.fix++; return go(state, 'GATE') }, // undoing a choice or a look round is not counted
  regate(state, flags, ctx) {
    const tree = host.treeSha(wtOf(state, ctx))
    if (!state.gate || state.gate.tree !== tree) refuse('regate re-runs the gate on an unchanged tree — the tree changed since the last gate, mark repaired after a builder round')
    if (state.regated === tree) refuse('this tree was already re-run once — dispatch a builder (mark repaired after its round)')
    return go(state, 'GATE', { regated: tree })
  },
  reviewed(state, flags, ctx) {
    const doc = flags.file && flags.file !== true ? st.readJson(path.resolve(ctx.root, flags.file)) : refuse('reviewed needs --file <findings json>')
    if (!doc || !Array.isArray(doc.findings)) refuse(`${flags.file} is not findings JSON — needs {"findings": [...]}`)
    const bad = doc.findings.filter((f) => !f || typeof f !== 'object' || !SEVERITIES.includes(f.severity))
    if (bad.length) refuse(`${flags.file}: every finding needs severity ${SEVERITIES.join(' or ')} — got ${bad.map((f) => JSON.stringify(f && f.severity)).join(', ')}; rewrite those findings, then re-mark`)
    const blocking = doc.findings.filter((f) => f.severity === 'blocking'); const choices = doc.findings.some((f) => f.severity === 'needs-decision')
    const kept = (state.review ? state.review.findings : []).filter((f) => ['advisory', 'note'].includes(f.severity))
    const verdict = blocking.length ? (state.attempts.fix >= FIX_CAP ? 'stopped' : 'fix') : choices ? 'decision' :
      'clean'
    state.review = { tree: state.gate.tree, base: state.base, findings: [...kept, ...doc.findings], verdict }
    const seat = B.reviewSeat(docOf(state, ctx), cfgOf(ctx))
    const closed = (Array.isArray(doc.closed) ? doc.closed : []).filter((c) => typeof c === 'string' && c.trim())
    const round = `${seat.model}/${seat.effort}: ${doc.findings.length} findings, ${blocking.length} blocking` +
      (closed.length ? `; closed: ${closed.join('; ')}` : '')
    state.reviews = [...(state.reviews || []), round]
    if (state.review.verdict === 'stopped') {
      const why = `still blocking after ${FIX_CAP} fix rounds`
      return parkRun(state, ctx, why, fixItem(state, ctx, blocking[0].summary || 'blocking review findings'))
    }
    if (blocking.length) return go(state, 'FIX')
    return choices ? go(state, 'ESCALATE', { why: 'decision', from: 'REVIEW' }) : afterReview(state)
  },
  looked(state) { return go(state, 'COMMIT', { look: { rounds: (state.lookFails || 0) + 1, accepted: true } }) },
  'look-failed'(state, flags) { // not counted against FIX_CAP
    app.stopIn(state)
    const lookFails = (state.lookFails || 0) + 1
    return go(state, 'FIX', { fixFor: 'look', lookReply: why(flags, 'look-failed'), lookFails })
  },
  after(state, flags, ctx) {
    const abs = typeof flags.on === 'string' && path.resolve(ctx.root, flags.on.replace(/^@/, ''))
    const on = abs && path.relative(ctx.root, abs).split(path.sep).join('/')
    if (!on || on.startsWith('..') || !fs.statSync(abs, { throwIfNoEntry: false })?.isFile()) refuse(`--on ${typeof flags.on === 'string' ? flags.on : '<spec>'} is not a spec file under ${ctx.root}`)
    app.stopIn(state)
    if (!state.inPlace) git.commitWip(wtOf(state, ctx), `wip(spec): ${specInfo(ctx).stem} waits on ${on}`) // the rebase at resume needs a clean tree
    decide(state, `waits for ${on}: it goes on by itself once ${on} is done`)
    state.report = render({ outcome: `⏸️ ${specInfo(ctx).id} waits for ${on}`, pins: B.pins(state), next: state.lane ? 'nothing needs you — fanout holds the lane until it is done' : `re-run ${selfCmd(state, ctx)} once ${on} is done` })
    return go(state, 'STOPPED', { why: 'after', on, from: state.step })
  },
  'needs-plan'(state, flags, ctx) { return parkRun(state, ctx, 'needs a plan', { type: 'plan', payload: `${state.fix.symptom.replace(/\s+/g, ' ')} — ${why(flags, 'needs-plan')}` }) },
  unmet(state, flags, ctx) {
    const doc = docOf(state, ctx); const rel = specInfo(ctx).rel
    if (flags.assumption !== undefined) {
      const all = S.parseAssumptions(S.section(doc.sections, 'Assumptions')); const a = all.find((x) => x.id === flags.assumption) || known('assumption', flags.assumption, all.map((x) => x.id), rel)
      if (!a.arm.ask) refuse(`${a.id} has a written fallback: ${a.arm.text} — apply it`)
      const note = typeof flags.why === 'string' ? flags.why.trim() : ''
      const assumption = { id: a.id, text: a.text, options: a.arm.options, note }
      return ask(state, ctx, { why: 'assumption', from: state.step, assumption })
    }
    const ids = S.decisionRows(S.section(doc.sections, 'Decisions')).map((c) => c[0])
    if (!ids.includes(flags.decision)) known('decision', flags.decision, ids, rel)
    const text = why(flags, 'unmet')
    return ask(state, ctx, { why: 'unmet', from: state.step, unmet: { decision: flags.decision, text } })
  },
  escalate(state, flags, ctx) {
    const e = escalation(state); const c = flags.choice; const labels = e.options.map((o) => o.label)
    if (!labels.includes(c)) refuse(`escalate needs one of ${labels.join(' | ')}, e.g. --mark escalate ${labels[0]}`)
    if (state.lane) pending.consumePending(ctx.root)
    if (c === 'amend') return amend(state, ctx)
    if (c === 'park') return parkRun(state, ctx, 'parked', fixItem(state, ctx, e.q))
    if (c === 'fix') return go(state, 'FIX', { fixFor: 'decision' })
    if (c !== 'retry') state.rulings = [...(state.rulings || []), ...(c === 'keep' ? e.q.split('\n').map((x) => `kept: ${x}`) : [`${state.assumption.id}: ${c}`])] // to the commit and the next brief
    if (c === 'keep') { // the ruling holds the answer: a later round does not ask it again
      state.review.findings = state.review.findings.filter((f) => f.severity !== 'needs-decision')
      state.review.verdict = 'clean'; return afterReview(state)
    }
    return go(state, state.from, { attempts: { repair: 0, fix: 0 }, opus: true })
  },
  // A dismissed question stops the run, queued as a decide item: nothing is answered for the user.
  dismissed(state, flags, ctx) { return parkRun(state, ctx, 'the question was dismissed', { type: 'decide', payload: escalation(state).q.replace(/\s+/g, ' ') }) },
}

const main = makeDriver({ name: 'run', specArg: 'spec path', load, save, derive, steps, after: (verb, state, ctx) => B.checkpoint(verb, state, state.lane && pending.stopLine(ctx.root)), markArgs: (ctx) => (ctx.flags.fix !== undefined ? ['--fix', String(ctx.flags.fix)] : []) })

if (require.main === module) {
  const argv = process.argv.slice(2)
  const ip = argv.indexOf('--in-place')
  if (ip >= 0) { argv.splice(ip, 1); inPlaceFlag = true }
  const m = argv.indexOf('--mark')
  if (m >= 0 && argv[m + 1] === 'escalate' && argv[m + 2] && !argv[m + 2].startsWith('--')) argv.splice(m + 2, 0, '--choice')
  process.exitCode = main(argv)
}

module.exports = { main }
