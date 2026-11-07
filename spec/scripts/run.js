#!/usr/bin/env node
'use strict'
// run.js [<spec>] [--fix "<symptom>"] [--in-place] [--root <dir>] [--state] [--json] [--mark <verb>] — /spec:run and /spec:fix:
// OPEN → BUILD → GATE → REPAIR | REVIEW → FIX | ESCALATE | LOOK → COMMIT → MERGE → DONE, or STOPPED {why} (architecture §4).
// A fix is the same machine on lib/spec.js fixDoc; MERGE lands through lib/land.js as a lane does. The session asks three
// questions (assumption, decision, unmet); everything mechanical is a rule, printed as a 📌 line. Marks: see `steps`.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { makeDriver, refuse, shq } = require('./lib/driver')
const st = require('./lib/state'); const S = require('./lib/spec'); const B = require('./lib/briefs'); const Q = require('./lib/queue')
const host = require('./lib/host'); const git = require('./lib/git'); const pending = require('./lib/pending')
const { land } = require('./lib/land'); const { render } = require('./lib/report')

const PLUGIN = path.resolve(__dirname, '..')
const REPAIR_CAP = 2; const FIX_CAP = 1; const SEVERITIES = ['blocking', 'advisory', 'needs-decision']
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
const ownOf = (state) => state.spec && state.spec.split(path.sep).join('/')
const runFile = (ctx, name) => { const s = specInfo(ctx); return path.join(s.abs ? st.runDir(s.abs) : st.fixRunDir(ctx.root, s.slug), name) }
const runText = (ctx, name) => st.readText(runFile(ctx, name), '').replace(/\r\n/g, '\n').trim()
const mainRoot = (root) => git.worktreeList(root)[0]
const docOf = (state, ctx) => (state.fix ? S.fixDoc(state.fix.symptom, state.spec ? st.readSpec(specIn(state, ctx)) : null) : st.readSpec(specIn(state, ctx)))
const selfCmd = (state, ctx) => ['node', shq(path.join(__dirname, 'run.js')), ...(state.spec ? [shq(state.spec)] : []), ...(state.fix ? ['--fix', shq(state.fix.symptom)] : []), '--root', shq(ctx.root)].join(' ')
const go = (state, step, extra = {}) => Object.assign(state, extra, { step, history: [...(state.history || []), { step, at: new Date().toISOString() }] })

// Every rule that decides instead of asking says so: the line rides in the report's 📌 slot and in fanout's REPORT.
const decide = (state, line) => { state.decided = [...(state.decided || []), line] }

function load(ctx) {
  const fix = ctx.flags.fix
  if (fix !== undefined && (typeof fix !== 'string' || !fix.trim())) refuse('--fix needs a symptom: --fix "<symptom>"')
  Q.read(ctx.root) // an unmigrated queue stops the run before it changes anything: exit 2, naming /spec:migrate
  const s = specInfo(ctx)
  const ignored = (p) => git.raw(['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', p], ctx.root).status !== 1
  if ((s.abs && !ignored(path.relative(ctx.root, st.runPath(s.abs)))) || (!inPlaceFlag && !ignored('.claude/worktrees/x')))
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
  if (proto && (!cfg.prototype.e2eFile || !cfg.prototype.e2eCommand)) refuse('a prototype spec needs prototype.e2eFile and prototype.e2eCommand in .claude/spec.config.json')
  else if (proto && !st.bootCommandOf(cfg)) refuse('no prototype.bootCommand in .claude/spec.config.json — set it to the command that starts this app (it should serve on $PORT), then re-run')
  if (proto && !st.readProto(ctx.root, proto).contract) refuse(`no contract at design/prototypes/${proto}/contract.json — run /spec:prototype ${proto} to contract it`)
  const lane = pending.isFanoutLane(ctx.root); const inPlace = !lane && inPlaceFlag; const cur = git.currentBranch(ctx.root)
  if (!lane && cur === 'HEAD') refuse('detached HEAD — check out a branch, then re-run')
  if (!lane && !inPlace && cur !== cfg.trunk) refuse(`${ctx.root} is on ${cur}, not trunk ${cfg.trunk} — check out ${cfg.trunk}, or pass --in-place to build on ${cur}`) // the only way to build outside a worktree
  if (!lane && git.sh(['status', '--porcelain', '--untracked-files=no'], ctx.root)) refuse(git.dirtyMessage(ctx.root))
  let wt = ctx.root; let fresh = lane
  const branch = `spec/${s.stem}`
  if (!lane && !inPlace) {
    const rel = path.join('.claude', 'worktrees', 'spec-' + s.stem)
    fresh = !fs.existsSync(path.join(ctx.root, rel))
    if (!fresh && pending.isFanoutLane(path.join(ctx.root, rel))) refuse(`${rel} is a fanout lane in flight — let /spec:fanout finish it, or mark it dismissed there`)
    if (fresh && git.branchExists(ctx.root, branch)) { // a branch an abandoned run left: re-pointed when trunk holds it
      if (git.raw(['merge-base', '--is-ancestor', branch, cfg.trunk], ctx.root).status !== 0) refuse(`branch ${branch} exists with commits not on ${cfg.trunk} — merge, rename or delete it, then re-run`)
      git.sh(['branch', '-D', branch], ctx.root)
    }
    wt = git.worktreeAdd(ctx.root, rel, branch, cfg.trunk)
  }
  if (fresh) host.copyIncluded(mainRoot(ctx.root), wt)
  const setup = fresh && cfg.setupCommand ? host.run(cfg.setupCommand, { cwd: wt }) : { status: 0 }
  if (setup.status !== 0) {
    if (!lane) git.worktreeRemove(ctx.root, wt, { force: true, deleteBranch: branch }) // the re-run provisions afresh
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

// ADR-0015: a planned file the build created is intent-to-add while the gate runs, so `git ls-files` sees it.
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

function gateStep(state, ctx) {
  const cfg = cfgOf(ctx); const wt = wtOf(state, ctx); const rows = S.planRows(docOf(state, ctx)); const t0 = Date.now()
  intentToAdd(wt, rows.filter((r) => r.action !== 'DELETE'))
  let g = host.gate(wt, cfg)
  let waited = g.lockWaitMs || 0
  const prior = state.gate && state.gate.tree === g.tree ? state.gate : null // one rerun per tree
  let reruns = prior ? prior.reruns || 0 : 0
  const touched = g.status !== 0 && !prior && g.failing && g.failing.length && new Set(git.changedFiles(state.base, wt))
  if (touched && g.failing.every((f) => !touched.has(f))) { g = host.gate(wt, cfg); waited += g.lockWaitMs || 0; reruns = 1 } // red only outside the diff: load, run once more
  let tail = g.status !== 0 ? g.tail || `the test command exited ${g.status}` : buildProof(state, wt, rows)
  if (!tail && state.prototype) { // the pin tests run against the app from the worktree, after the test command (ADR-0043)
    if (state.appUrl == null) { const a = host.allocApp(cfg.prototype.url); state.appPort = a.appPort; state.appUrl = a.url }
    const cmd = String(cfg.prototype.e2eCommand).replace(/\{file\}/g, String(cfg.prototype.e2eFile).replace(/\{stem\}/g, state.prototype))
    const r = host.withApp(st.bootCommandOf(cfg), { cwd: wt, url: state.appUrl, port: state.appPort }, () => host.run(cmd, { cwd: wt, env: { APP_URL: state.appUrl }, timeoutMs: 10 * 60 * 1000 }))
    if (r.status !== 0) tail = 'pin tests red:\n' + r.tail
  }
  state.gate = { status: tail ? 'red' : 'green', runId: g.runId, cached: g.cached, ms: Date.now() - t0, output_tail: tail || g.tail, tree: g.tree, files: builderFiles(ctx), failing: g.failing || [], reruns, lockWaitMs: waited }
  if (tail) return state.attempts.repair >= REPAIR_CAP ? parkRun(state, ctx, `still red after ${REPAIR_CAP} repairs`, fixItem(state, ctx, host.firstRedLine(tail))) : go(state, 'REPAIR')
  if (!cfg.testFileCommand) delete state.redCheck
  else if (state.redCheckTree !== g.tree) { state.redCheck = redCheck(state, wt); state.redCheckTree = g.tree } // information for the reviewer
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

// Spec text a build may not change: any other spec, and its own spec below the frontmatter.
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

// Ends the run STOPPED {why}: the item (a fix, a plan, a decide) is queued and said in one 📌 line. Amend sets the spec to draft.
function parkRun(state, ctx, why, item) {
  const s = specInfo(ctx)
  if (s.abs && !state.fix && (why === 'amend' || state.inPlace)) st.writeStatus(s.abs, why === 'amend' ? 'draft' : 'hardened')
  const queued = item && Q.paste(ctx.root, Q.add(ctx.root, item) || { kind: 'prompt', ...item }) // null from add: the same item is already open
  decide(state, queued ? `stopped: ${why} — queued ${queued}` : `stopped: ${why} — ${s.rel} is draft again`)
  if (state.lane) pending.consumePending(ctx.root)
  state.report = render({ outcome: `⏸️ ${s.id} stopped — ${why}`, pins: B.pins(state), artifacts: s.rel, queued, next: queued ? '/spec:queue next' : `/spec:plan ${s.rel}` })
  return go(state, 'STOPPED', { why, ended: !state.lane })
}

// A spec the run waits on is done once trunk says so (a lane's own copy of it predates the landing); the run then goes on.
const onDone = (state, ctx) => { const r = git.raw(['show', `${cfgOf(ctx).trunk}:${state.on}`], ctx.root); return r.status === 0 && S.parseFrontmatter(r.stdout.replace(/\r\n/g, '\n')).frontmatter.status === 'done' }
function resume(state, ctx) {
  go(state, state.from, { why: undefined, on: undefined, report: undefined })
  if (!state.inPlace && git.rebaseOnto(wtOf(state, ctx), cfgOf(ctx).trunk).ok) state.base = git.sh(['merge-base', cfgOf(ctx).trunk, 'HEAD'], wtOf(state, ctx)) // a conflict: the rebase guard prints it
  return state
}

function commit(state, ctx) {
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
  if (adv.length && state.spec && !state.fix && !state.advised) { // advisories reach someone: one fix item per run, bound to the spec
    const item = Q.add(ctx.root, { type: 'fix', spec: s.rel, payload: `advisories of ${s.stem}: ${adv.map((f) => f.summary.trim()).join('; ')}` })
    state.advised = true
    if (item) decide(state, `queued the review's advisories as one fix: ${Q.paste(ctx.root, item)}`)
  }
  if (!state.lane) return go(state, 'MERGE')
  state.report = B.report(state, `✅ ${state.fix ? `fixed — ${state.fix.symptom}` : `${s.id} built and reviewed`} — committed on ${state.branch}; fanout lands it`, 'nothing needs you — fanout lands the lane')
  return go(state, 'DONE') // a lane ends in its worktree: fanout lands it through the same lib/land.js
}

function merge(state, ctx) {
  const s = specInfo(ctx)
  const tick = !state.fix ? (i) => i.kind === 'spec' && path.resolve(ctx.root, i.payload) === s.abs
    : s.abs ? (i) => i.type === 'fix' && i.spec && path.resolve(ctx.root, i.spec) === s.abs && (i.payload || 'repair ' + s.stem) === state.fix.symptom : null
  const r = land(mainRoot(ctx.root), { wt: wtOf(state, ctx), branch: state.branch, spec: state.fix ? null : specIn(state, ctx), id: s.id, config: cfgOf(ctx), message: `chore(spec): merge ${s.id} — ${state.fix ? state.fix.symptom : docOf(state, ctx).title}`, inPlace: state.inPlace, tick })
  if (r.conflicts) return state // the rebase is left in the worktree: the rebase guard prints the step
  if (r.red) return go(state, 'GATE', { base: r.base, review: null, attempts: { repair: 0, fix: 0 } })
  if (r.kept) state.commitWarns = [...(state.commitWarns || []), `worktree kept at ${state.worktree}: ${r.kept} — git worktree remove --force ${state.worktree}`]
  state.mergeSha = state.inPlace ? null : r.landed
  const head = Q.open(Q.read(ctx.root))[0]
  state.report = B.report(state, state.fix ? `✅ fixed — ${state.fix.symptom}` : state.inPlace ? `✅ ${s.id} built and reviewed on ${state.branch}` : `✅ ${s.id} built, reviewed and merged`, head ? Q.paste(ctx.root, head) : undefined)
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
  // Lanes share one session scratchpad: each brief is saved in its own run dir and its path printed with the text.
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

// Every worktree run resolves a rebase left in progress, whatever its step; once complete it is gated and reviewed again.
const rebaseGuard = (state, ctx) => !state.inPlace && state.worktree && !['STOPPED', 'ESCALATE'].includes(state.step) && fs.existsSync(wtOf(state, ctx)) && git.rebasing(wtOf(state, ctx))
function finishRebase(state, ctx) {
  const wt = wtOf(state, ctx)
  git.sh(['add', '-A'], wt); git.raw(['-c', 'core.editor=true', 'rebase', '--continue'], wt) // a later commit may conflict again
  if (!git.rebasing(wt)) return go(state, 'GATE', { base: git.sh(['merge-base', cfgOf(ctx).trunk, 'HEAD'], wt), review: null, attempts: { repair: 0, fix: 0 }, report: undefined })
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
  switch (state.step) {
    case 'OPEN': return { name: 'OPEN', auto: open }
    case 'BUILD': return { name: 'BUILD', body: brief(state, ctx, 'build'), mark: 'built', accepts: asks(state) }
    case 'GATE': return { name: 'GATE', auto: gateStep }
    case 'REPAIR': return { name: 'REPAIR', mark: 'repaired', accepts: [...asks(state), 'regate'], body: brief(state, ctx, 'repair') + '\n\n' + B.regate(state.gate, sh('regate')) }
    case 'REVIEW': return { name: 'REVIEW', body: brief(state, ctx, 'review'), mark: `reviewed --file ${shq(runFile(ctx, 'findings.json'))}`, accepts: asks(state) }
    case 'FIX': return { name: 'FIX', body: brief(state, ctx, 'fix'), mark: 'fixed', accepts: asks(state) }
    case 'LOOK': { const wt = wtOf(state, ctx); return { name: 'LOOK', mark: 'looked', accepts: ['look-failed'], body: B.look({ state, wt, cfg: cfgOf(ctx), contract: st.readProto(wt, state.prototype).contract, pictures: pictures(state, wt), looked: sh('looked'), failed: sh('look-failed') }) } }
    case 'ESCALATE': {
      const doc = state.lane && pending.readPending(ctx.root) // a lane re-dispatched after fanout recorded the answer continues with it
      if (doc && doc.answer) return { name: 'ESCALATE', auto: (s) => steps.escalate(s, { choice: doc.answer.label }, ctx) }
      return { name: 'ESCALATE', body: askBody(state, ctx), mark: `escalate <${escalation(state).options.map((o) => o.label).join('|')}>`, accepts: ['dismissed'] }
    }
    case 'COMMIT': return { name: 'COMMIT', auto: commit }
    case 'MERGE': return { name: 'MERGE', auto: merge }
    case 'STOPPED': if (state.why === 'after' && onDone(state, ctx)) return { name: 'STOPPED', auto: resume }
    // falls through: any other ending prints its report
    default: return { name: state.step, body: state.report || '' }
  }
}

// A builder round changes the tree or the run files it writes; a mark with both as the last gate saw them spends nothing.
function unchanged(state, ctx) {
  if (state.gate && state.gate.tree && host.treeSha(wtOf(state, ctx)) === state.gate.tree && builderFiles(ctx) === state.gate.files) refuse(`nothing changed since the last gate — ${state.step === 'REPAIR' ? 're-run the gate (mark regate) or ' : ''}dispatch a builder`)
}
const why = (flags, what) => { if (typeof flags.why !== 'string' || !flags.why.trim()) refuse(`${what} needs --why "<text>"`); return flags.why.trim() }
const afterReview = (state) => go(state, state.prototype ? 'LOOK' : 'COMMIT')
const known = (what, id, list, rel) => refuse(`--${what} ${id === true || id === undefined ? '<id>' : id} is not ${what === 'decision' ? `a row of ${rel}'s Decisions table` : `an Assumption of ${rel}`} — known: ${list.join(', ') || 'none'}`)

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
    if (!doc || !Array.isArray(doc.findings)) refuse(`${flags.file} is missing or is not findings JSON — expected {"findings": [...], "verdict": "clean|fix"}`)
    const bad = doc.findings.filter((f) => !f || typeof f !== 'object' || !SEVERITIES.includes(f.severity))
    if (bad.length) refuse(`${flags.file}: every finding needs severity ${SEVERITIES.join(' or ')} — got ${bad.map((f) => JSON.stringify(f && f.severity)).join(', ')}; rewrite those findings, then re-mark`)
    if (doc.verdict !== undefined && !['clean', 'fix'].includes(doc.verdict)) refuse(`${flags.file}: verdict must be clean or fix, got ${JSON.stringify(doc.verdict)}`)
    const blocking = doc.findings.filter((f) => f.severity === 'blocking'); const choices = doc.findings.some((f) => f.severity === 'needs-decision')
    if (doc.verdict === 'fix' && !blocking.length) refuse(`${flags.file}: verdict is fix but no finding is blocking — set severity blocking on the finding(s) that must be fixed, or verdict clean`)
    state.review = { findings: doc.findings, verdict: blocking.length ? (state.attempts.fix >= FIX_CAP ? 'stopped' : 'fix') : choices ? 'decision' : 'clean' }
    if (state.review.verdict === 'stopped') return parkRun(state, ctx, `still blocking after ${FIX_CAP} fix round`, fixItem(state, ctx, blocking[0].summary || 'blocking review findings'))
    if (blocking.length) return go(state, 'FIX')
    return choices ? go(state, 'ESCALATE', { why: 'decision', from: 'REVIEW' }) : afterReview(state)
  },
  looked(state) { return go(state, 'COMMIT', { look: { rounds: (state.lookFails || 0) + 1, accepted: true } }) },
  'look-failed'(state, flags) { return go(state, 'FIX', { fixFor: 'look', lookReply: why(flags, 'look-failed'), lookFails: (state.lookFails || 0) + 1 }) }, // not counted against FIX_CAP
  after(state, flags, ctx) {
    const abs = typeof flags.on === 'string' && path.resolve(ctx.root, flags.on.replace(/^@/, ''))
    const on = abs && path.relative(ctx.root, abs).split(path.sep).join('/')
    if (!on || on.startsWith('..') || !fs.statSync(abs, { throwIfNoEntry: false })?.isFile()) refuse(`--on ${typeof flags.on === 'string' ? flags.on : '<spec>'} is not a spec file under ${ctx.root}`)
    if (!state.inPlace) git.commitWip(wtOf(state, ctx), `wip(spec): ${specInfo(ctx).stem} waits on ${on}`) // the rebase at resume needs a clean tree
    decide(state, `waits for ${on}: it goes on by itself once ${on} is done`)
    state.report = render({ outcome: `⏸️ ${specInfo(ctx).id} waits for ${on}`, pins: B.pins(state), next: state.lane ? 'nothing needs you — fanout holds the lane until it is done' : `re-run ${selfCmd(state, ctx)} once ${on} is done` })
    return go(state, 'STOPPED', { why: 'after', on, from: state.step })
  },
  'needs-plan'(state, flags, ctx) { return parkRun(state, ctx, 'needs a plan', { type: 'plan', payload: `${state.fix.symptom.replace(/\s+/g, ' ')} — ${why(flags, 'needs-plan')}` }) },
  unmet(state, flags, ctx) {
    const doc = st.readSpec(specIn(state, ctx)); const rel = specInfo(ctx).rel
    if (flags.assumption !== undefined) {
      const all = S.parseAssumptions(S.section(doc.sections, 'Assumptions')); const a = all.find((x) => x.id === flags.assumption) || known('assumption', flags.assumption, all.map((x) => x.id), rel)
      if (!a.arm.ask) refuse(`${a.id} has a written fallback: ${a.arm.text} — apply it`)
      return go(state, 'ESCALATE', { why: 'assumption', from: state.step, assumption: { id: a.id, text: a.text, options: a.arm.options, note: typeof flags.why === 'string' ? flags.why.trim() : '' } })
    }
    const ids = S.decisionRows(S.section(doc.sections, 'Decisions')).map((c) => c[0])
    if (!ids.includes(flags.decision)) known('decision', flags.decision, ids, rel)
    return go(state, 'ESCALATE', { why: 'unmet', from: state.step, unmet: { decision: flags.decision, text: why(flags, 'unmet') } })
  },
  escalate(state, flags, ctx) {
    const e = escalation(state); const c = flags.choice; const labels = e.options.map((o) => o.label)
    if (!labels.includes(c)) refuse(`escalate needs one of ${labels.join(' | ')}, e.g. --mark escalate ${labels[0]}`)
    if (state.lane) pending.consumePending(ctx.root)
    if (c === 'amend') return parkRun(state, ctx, 'amend', null)
    if (c === 'park') return parkRun(state, ctx, 'parked', fixItem(state, ctx, e.q))
    if (c === 'fix') return go(state, 'FIX', { fixFor: 'decision' })
    if (c !== 'retry') state.rulings = [...(state.rulings || []), ...(c === 'keep' ? e.q.split('\n').map((x) => `kept: ${x}`) : [`${state.assumption.id}: ${c}`])] // to the commit and the next brief
    if (c === 'keep') { state.review.verdict = 'clean'; return afterReview(state) }
    return go(state, state.from, { attempts: { repair: 0, fix: 0 }, opus: true })
  },
  // A dismissed question stops the run with it queued as a decide item: nothing is answered for the user.
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
