#!/usr/bin/env node
'use strict'
// run.js — /spec:run: carry one hardened spec OPEN → BUILD → GATE → REPAIR|REVIEW → FIX|COMMIT →
// MERGE (CONFLICTS) → DONE (architecture §4). The session dispatches agents; the driver gates,
// commits and merges.
//
// node run.js <spec> [--in-place] [--fix "<symptom>"] [--root <dir>] [--state] [--json] [--mark <verb>]
// node run.js --fix "<symptom>" (--in-place | as a fanout lane) [--root <dir>] ...   (a fix with no spec)
// --fix runs a fix, with or without a spec, as a fanout lane or --in-place: the brief is the symptom and the
// reproduce-first recipe, the builder writes <run dir>/fix.json, the commit is `fix(<id>|<slug>): <symptom>`.
// A spec-less fix keeps its run state under <git-common-dir>/spec-fix/<slug>.run/.
// Marks: built · repaired · regate · reviewed --file <json> · fixed · escalate <label> (the printed options) ·
// conflicts-resolved · waiting --on <spec> (lane) · unmet --decision <id> --why <text> |
// unmet --assumption <id> [--why <text>].
// Exit 0 ok · 1 error · 2 refusal.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeDriver, refuse, shq } = require('./lib/driver')
const st = require('./lib/state')
const host = require('./lib/host')
const git = require('./lib/git')
const pending = require('./lib/pending')
const { render } = require('./lib/report')
const queue = require('./queue')

const PLUGIN = path.resolve(__dirname, '..')
const REPAIR_CAP = 2
const FIX_CAP = 1
const CHOICES = ['retry', 'park', 'amend', 'revert', 'keep', 'fix', 'widen', 'separate', 'plan']
const OFFERED = { 'spec-edit': ['revert', 'amend'], 'review-decision': ['keep', 'fix', 'amend'], scope: ['widen', 'separate', 'park'], 'fix-choices': ['keep', 'revert', 'plan'] } // every other escalation offers retry, park, amend
// An assumption question offers its arm's options (planner-written labels), else retry, park, amend; amend is always last.
const offered = (state) => state.why === 'assumption' && state.assumption.options.length ? [...state.assumption.options.filter((o) => o !== 'amend'), 'amend'] : OFFERED[state.why] || (state.spec ? ['retry', 'park', 'amend'] : ['retry', 'park'])
const SEVERITIES = ['blocking', 'advisory', 'needs-decision']
// The kind a pending question carries, from the escalation's `why` (lib/pending KINDS).
const KIND_OF = {
  gate: 'escalate',
  review: 'escalate',
  decision: 'unmet',
  assumption: 'assumption',
  'review-decision': 'decision',
  scope: 'scope',
  'spec-edit': 'spec-edit',
  conflicts: 'conflict',
  'fix-choices': 'decision',
}
// Only while a builder or reviewer is out is the checkout marked for block-worker-git.sh.
const AGENT_STEPS = ['BUILD', 'REPAIR', 'FIX', 'REVIEW']
let inPlaceFlag = false

// ---- paths ---------------------------------------------------------------------------------

// A fix with no spec path: identified by a slug of its symptom, its state under the git common dir.
const fixOnly = (ctx) => !ctx.arg && ctx.flags.fix !== undefined

function specInfo(ctx) {
  if (fixOnly(ctx)) {
    const slug = st.slugOf(String(ctx.flags.fix))
    return { abs: null, rel: null, stem: 'fix-' + slug, id: slug, slug }
  }
  const typed = ctx.arg.replace(/^@/, '') // under root first (a lane's shell sits in the main checkout); else as typed from the shell's directory
  const abs = fs.existsSync(path.resolve(ctx.root, typed)) || !fs.existsSync(path.resolve(process.cwd(), typed)) ? path.resolve(ctx.root, typed) : path.resolve(process.cwd(), typed)
  const rel = path.relative(ctx.root, abs)
  if (rel.startsWith('..') || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) refuse(`no spec at ${abs} — pass a spec path inside ${ctx.root}`)
  const m = /(\d{8})\/(\d+)-[^/]+\.md$/.exec(rel.split(path.sep).join('/'))
  const stem = path.basename(abs, '.md')
  return { abs, rel, stem, id: m ? `${m[1]}/${m[2]}` : stem }
}

const cfgOf = (ctx) => st.readConfig(ctx.root)
const wtOf = (state, ctx) => path.resolve(ctx.root, state.worktree)
const specIn = (state, ctx) => (state.spec ? path.join(wtOf(state, ctx), state.spec) : null)
const runDirOf = (ctx) => { const s = specInfo(ctx); return s.abs ? st.runDir(s.abs) : st.fixRunDir(ctx.root, s.slug) }
const runFile = (ctx, name) => path.join(runDirOf(ctx), name)
const mainRoot = (root) => git.worktreeList(root)[0]
const sectionText = (spec, name) => spec.sections[Object.keys(spec.sections).find((k) => k === name || k.startsWith(name + ' ')) || ''] || ''
// v7-era specs carry ## Goal and no ## Intent; the brief's Intent falls back to it.
const intentText = (spec) => sectionText(spec, 'Intent') || sectionText(spec, 'Goal')
// A fix's brief replaces the Intent with the symptom. The build brief is the reproduce-first recipe; the
// builder tells the driver what it decided in <run dir>/fix.json (a builder has no question channel).
const FIX_JSON = '{"cause": "<one sentence>", "test": "<file> :: <test name>", "strings": ["<user-facing string you authored>", …], "choices": ["<display or policy choice: hidden, reordered, defaulted, reformatted>", …], "needsPlan": null | "<why the cause needs an architecture or behaviour change>"}'
const fixBlock = (state, ctx, kind) => [
  '## Fix', state.fix.symptom,
  ...(kind === 'build' ? [
    '1. Reproduce it and state the root cause in one sentence before the first edit.',
    '2. Write a regression test that fails for that reason.',
    '3. Fix the cause.',
    '4. Run the test command until green.',
    '', `Write ${runFile(ctx, 'fix.json')}: ${FIX_JSON}. When needsPlan is set, make no edit.`,
  ] : state.fix.cause ? [`Root cause: ${state.fix.cause}`, `Keep ${runFile(ctx, 'fix.json')} current: it lists the strings and choices the tree still carries.`] : []),
  '',
]
// The reviewer sees the cause and the test the builder named, and checks them.
const fixReviewBlock = (state) => [
  '## Fix', state.fix.symptom, `Root cause: ${state.fix.cause}`, `Regression test: ${state.fix.test}`,
  'Check that the test fails for the stated cause without the fix and that the fix is at the root, not around the symptom.', '',
]
const fixList = (v) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
const textOf = (v) => (typeof v === 'string' ? v.trim() : '')
const readFixJson = (ctx) => { const d = st.readJson(runFile(ctx, 'fix.json')); return d && typeof d === 'object' && !Array.isArray(d) ? d : null }
// The command a printed instruction re-runs this driver with (the spec, or the spec-less fix's symptom).
const selfCmd = (state, ctx) => `node ${shq(path.join(__dirname, 'run.js'))} ${state.spec ? shq(state.spec) : `--fix ${shq(state.fix.symptom)}`} --root ${shq(ctx.root)}`
const EVIDENCE = (ctx) => `Evidence an AC asks to record (listings, renders, counts) goes in ${runFile(ctx, 'evidence.md')}; the driver appends it to the build commit.`
const AS_BUILT = (ctx) => `Anything you built differently from the spec, and why, goes in ${runFile(ctx, 'as-built.md')} (one line each); the driver appends it to the spec as \`## As built\`.`
const OTHER_SECTIONS = 'Other sections (File Plan, Contracts, UI, Behavior, Canonical Delta) are not printed here — read them in the spec file; a Canonical Delta is applied by the builder.'
const hasDelta = (spec) => Object.keys(spec.sections).some((k) => k === 'Canonical Delta' || k.startsWith('Canonical Delta '))
// Every `- A<n>:` line of the spec, verbatim: the builder and reviewer see what the plan assumed and what to do when it is false.
const assumptionLines = (spec) => {
  const l = sectionText(spec, 'Assumptions').split('\n').map((x) => x.trim()).filter((x) => /^- +A\d+:/.test(x))
  return l.length ? l : ['- none']
}
// Decisions table rows as bullets; the ADR constraints the planner wrote must reach builder and reviewer.
// A row is a template leftover only when a cell is exactly a <placeholder>; JSX or generics in a decision stay.
const decisionRows = (spec) => st.decisionRows(sectionText(spec, 'Decisions'))
const decisions = (spec) => {
  const rows = decisionRows(spec)
  return rows.length ? rows.map((c) => `- ${c[0]}: ${c[1]}${c.length > 2 && c[c.length - 1] ? ` — ${c[c.length - 1]}` : ''}`) : ['- none']
}

function go(state, step, extra = {}) {
  state.history = [...(state.history || []), { step, at: new Date().toISOString() }]
  return Object.assign(state, extra, { step })
}

function load(ctx) {
  const fix = ctx.flags.fix
  if (fix !== undefined && (typeof fix !== 'string' || !fix.trim())) refuse('--fix needs a symptom: --fix "<symptom>"')
  const s = specInfo(ctx)
  const ignored = (p) => git.raw(['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', p], ctx.root).status !== 1 // 0 ignored; 128 (e.g. a symlinked dir) is not "missing"; the repo's own ignores only
  // A spec-less fix keeps its state under the git dir (never tracked) and, in place, makes no worktree.
  const needsWorktreeIgnore = cfgOf(ctx).worktreePerSpec !== false && !(!s.abs && inPlaceFlag)
  if ((s.abs && !ignored(path.relative(ctx.root, st.runPath(s.abs)))) || (needsWorktreeIgnore && !ignored('.claude/worktrees/x')))
    refuse('run sidecars and worktrees must be git-ignored — add the lines `specs/**/*.run/` and `.claude/worktrees/` to .gitignore, commit it, then re-run')
  const prior = st.readJson(path.join(runDirOf(ctx), 'state.json'))
  if (fix !== undefined && !prior && !inPlaceFlag && !pending.isFanoutLane(ctx.root)) refuse('--fix works in place (--in-place) or as a fanout lane')
  if (prior && typeof prior.fix === 'string') prior.fix = { symptom: prior.fix } // a run state written before the fix mode kept its cause and test
  return prior || { step: 'OPEN', spec: s.rel, ...(fix === undefined ? {} : { fix: { symptom: fix.trim() } }) }
}

// A fanout lane's marker belongs to fanout; otherwise the marker is on exactly while an agent is out.
function syncMarker(state, ctx) {
  if (state.lane || !state.worktree) return
  const want = !state.ended && AGENT_STEPS.includes(state.step)
  if (want) { pending.markLane(wtOf(state, ctx), 'run'); state.marked = true } else if (state.marked) { pending.unmarkLane(wtOf(state, ctx)); state.marked = false }
}

function save(state, ctx) {
  syncMarker(state, ctx)
  if (state.ended) fs.rmSync(runDirOf(ctx), { recursive: true, force: true }); else st.writeJson(path.join(runDirOf(ctx), 'state.json'), state)
}

// ---- auto steps ----------------------------------------------------------------------------

function open(state, ctx) {
  const s = specInfo(ctx)
  const cfg = cfgOf(ctx)
  const spec = s.abs ? st.readSpec(s.abs) : null
  const status = spec && spec.frontmatter.status
  if (spec && (status === 'draft' || spec.markers)) {
    refuse(`${s.rel} is ${status === 'draft' ? 'a draft' : `carrying ${spec.markers} [NEEDS CLARIFICATION:] marker(s)`} — finish it with /spec:plan ${s.rel}, then re-run`)
  }
  if (spec && state.fix && !['done', 'hardened'].includes(status)) refuse(`${s.rel} is ${status}, not done or hardened — a fix lane runs on a finished or hardened spec`)
  if (spec && status === 'done' && !state.fix) refuse(`${s.rel} is already done — nothing to run`)
  if (!cfg.testCommand) refuse('no testCommand in .claude/spec.config.json — run /spec:init')
  const specBranch = `spec/${s.stem}`
  const cur = git.currentBranch(ctx.root)
  const lane = pending.isFanoutLane(ctx.root)
  if (!lane && cur === 'HEAD') refuse('detached HEAD — check out a branch, then re-run')
  if (!lane && !inPlaceFlag && cfg.worktreePerSpec !== false && !git.branchExists(ctx.root, cfg.trunk)) refuse(`trunk "${cfg.trunk}" is not a branch here — set trunk in .claude/spec.config.json, then re-run`)
  const why = lane ? 'fanout lane — the driver works in the lane worktree'
    : inPlaceFlag ? '--in-place'
    : cfg.worktreePerSpec === false ? 'host policy worktreePerSpec: false'
      : cur === specBranch ? "this session already sits on the spec's branch"
        : cur !== cfg.trunk ? `on ${cur}, not ${cfg.trunk} — the build lands here, for your PR` : null
  // Tracked dirt would be swept into the build commit in place, or refuse the merge after the build.
  if (!lane && git.sh(['status', '--porcelain', '--untracked-files=no'], ctx.root)) refuse(git.dirtyMessage(ctx.root))
  let wt = ctx.root
  let fresh = lane
  if (!why) {
    const rel = path.join('.claude', 'worktrees', 'spec-' + s.stem)
    fresh = !fs.existsSync(path.join(ctx.root, rel))
    if (!fresh && pending.isFanoutLane(path.join(ctx.root, rel))) refuse(`${rel} is a fanout lane in flight — let /spec:fanout finish it, or mark it dismissed there`)
    // A branch left by an abandoned run: re-point it when trunk already holds it, else keep it safe.
    if (fresh && git.branchExists(ctx.root, specBranch)) {
      if (git.raw(['merge-base', '--is-ancestor', specBranch, cfg.trunk], ctx.root).status === 0) git.sh(['branch', '-D', specBranch], ctx.root)
      else refuse(`branch ${specBranch} exists with commits not on ${cfg.trunk} — merge, rename or delete it, then re-run`)
    }
    wt = git.worktreeAdd(ctx.root, rel, specBranch, cfg.trunk)
  }
  if (fresh && wt !== mainRoot(ctx.root)) host.copyLaneFiles(mainRoot(ctx.root), wt, cfg.laneFiles)
  if (fresh && cfg.setupCommand) {
    const r = host.run(cfg.setupCommand, { cwd: wt })
    if (r.status !== 0) refuse(`setupCommand failed in ${wt}:\n${r.tail}\nfix setupCommand in .claude/spec.config.json, then re-run`, 1)
  }
  if (!why) {
    // The branch copy says done from the start, so the gated tree is the tree that merges and
    // the trunk gate after an unchanged merge is a cache hit.
    const dst = path.join(wt, s.rel)
    st.writeText(dst, fs.readFileSync(s.abs, 'utf8'))
    st.writeStatus(dst, 'done')
  } else if (!state.fix) st.writeStatus(s.abs, 'implementing') // in place: COMMIT writes done into the build commit; a fix lane writes no status
  // A worktree run never touches the main checkout's copy: its sidecar is the in-flight state.
  const mb = git.raw(['merge-base', cfg.trunk, 'HEAD'], wt)
  // A fix that turns out to need a plan discards what the builder added: the untracked files it started with stay.
  const untracked0 = state.fix ? git.sh(['ls-files', '--others', '--exclude-standard'], wt).split('\n').filter(Boolean) : undefined
  return go(state, 'BUILD', {
    spec: s.rel, worktree: path.relative(ctx.root, wt) || '.', branch: why ? cur : specBranch,
    base: mb.status === 0 ? mb.stdout.trim() : git.headSha(wt), inPlace: !!why, lane, marked: false,
    pin: why ? `📌 Auto-picked in place — ${why}` : null,
    attempts: { repair: 0, fix: 0 }, opus: false, gate: null, review: null, ...(untracked0 ? { untracked0 } : {}),
  })
}

function redCheck(state, wt) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'red-check.js'), '--base', state.base, '--root', wt], { encoding: 'utf8' })
  let doc = null
  try { doc = JSON.parse(r.stdout) } catch { return 'red-check: no verdict (unreadable output)' }
  if (doc.error) return `red-check: no verdict (${doc.error})`
  return doc.vacuousGreen.length ? `red-check: vacuous green — ${doc.vacuousGreen.join(', ')} pass on base too`
    : `red-check: ${doc.files.length} new test file(s), none vacuous`
}

// Spec text a build may not change: any other spec file, and the own spec's Decisions section.
// The own spec's status line and its other sections (an AC correction in a FIX round) pass.
// Rows the driver itself appended (state.rulings) are not the build's edits.
const stripRows = (text, ids) => (ids && ids.length ? text.split('\n').filter((l) => !(l.trim().startsWith('|') && ids.includes(st.splitCells(l)[0]))).join('\n') : text)
const decisionsText = (text, rulings) => {
  const m = /^## +Decisions(?: [^\n]*)?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'))
  return m ? stripRows(m[1], rulings).trim() : ''
}
function specEdits(state, ctx) {
  const wt = wtOf(state, ctx)
  const own = state.spec ? state.spec.split(path.sep).join('/') : null
  const files = git.changedFiles(state.base, wt).filter((f) => /^specs\/.+\.md$/.test(f) && f !== own)
  if (!own) return files
  const was = git.raw(['show', `${state.base}:${own}`], wt)
  const now = st.readText(specIn(state, ctx), null)
  if (was.status === 0 && now !== null && decisionsText(was.stdout) !== decisionsText(now, state.rulings)) files.push(own)
  return files
}

const secs = (ms) => Math.round(ms / 1000)

function gateStep(state, ctx) {
  const cfg = cfgOf(ctx)
  const wt = wtOf(state, ctx)
  const t0 = Date.now()
  let g = host.gate(wt, cfg)
  let waited = g.lockWaitMs || 0
  // A tree the last gate already ran on keeps its rerun count: one rerun per tree.
  const prior = state.gate && state.gate.tree === g.tree ? state.gate : null
  let reruns = prior ? prior.reruns || 0 : 0
  // Red only on tests the diff does not touch: load, not the build. Run once more before a repair counts.
  if (g.status !== 0 && !prior && g.failing && g.failing.length) {
    const touched = new Set(git.changedFiles(state.base, wt))
    if (g.failing.every((f) => !touched.has(f))) {
      g = host.gate(wt, cfg)
      waited += g.lockWaitMs || 0
      reruns = 1
    }
  }
  const ms = Date.now() - t0
  const red = g.status !== 0
  const tail = red && cfg.testFileCommand ? g.tail + '\n' + redCheck(state, wt) : g.tail
  state.gate = { status: red ? 'red' : 'green', runId: g.runId, cached: g.cached, ms, output_tail: tail, tree: g.tree, failing: g.failing || [], reruns, lockWaitMs: waited }
  if (red) return state.attempts.repair >= REPAIR_CAP ? go(state, 'ESCALATE', { why: 'gate' }) : go(state, 'REPAIR')
  const edits = specEdits(state, ctx)
  if (edits.length) return go(state, 'ESCALATE', { why: 'spec-edit', specEdits: edits })
  const scope = askedScope(state, ctx, cfg)
  if (scope.length) return go(state, 'ESCALATE', { why: 'scope', scope })
  // The fix's one stop: strings and display or policy choices the client would notice; asked once per run.
  if (state.fix && !state.fixAsked && fixAuthored(state).length) return go(state, 'ESCALATE', { why: 'fix-choices' })
  return toReview(state, ctx)
}

const fixAuthored = (state) => [...(state.fix.strings || []), ...(state.fix.choices || [])]

function toReview(state, ctx) {
  st.writeText(runFile(ctx, 'diff.patch'), git.diff(state.base, wtOf(state, ctx)) + '\n')
  fs.rmSync(runFile(ctx, 'findings.json'), { force: true }) // never re-read an earlier round's findings
  return go(state, 'REVIEW')
}

// Out-of-plan files under a host-named askPaths glob that the user has not already widened.
const watched = (cfg, f) => (cfg.askPaths || []).some((g) => st.globToRe(g).test(f))
function askedScope(state, ctx, cfg) {
  if (state.fix || !(cfg.askPaths || []).length) return [] // a fix lane has no File Plan, so nothing is outside it
  return outsideFiles(state, ctx, st.readSpec(specIn(state, ctx))).filter((f) => watched(cfg, f) && !(state.widened || []).includes(f))
}

// A lane stops here, committed: fanout writes done, merges in queue order and cleans up.
// `load:` bullet: what a shared machine cost this run, only when it cost something.
const loadBullet = (state) => {
  const g = state.gate || {}
  return g.reruns || g.lockWaitMs >= 1000 ? [`load: ${g.reruns || 0} gate rerun(s), ${secs(g.lockWaitMs || 0)}s waiting for a slot`] : []
}
const fixBullets = (state) => [`root cause: ${state.fix.cause}`, `regression test: ${state.fix.test}`]
const readyReport = (state, ctx) => render({
  outcome: state.fix ? `✅ fixed — ${state.fix.symptom}` : `✅ ${specInfo(ctx).id} built and reviewed — merge-ready on ${state.branch}`,
  bullets: [...(state.fix ? fixBullets(state) : []), `commit ${state.commit || 'none (nothing changed)'}`, ...loadBullet(state)], next: 'nothing needs you — fanout merges the lane',
})

// What the build did differently from the spec, one bullet each: the builder's as-built.md, the review's
// advisories, and (outside a fix lane, which has no File Plan) every file outside the File Plan.
function departures(state, ctx, spec) {
  const lines = st.readText(runFile(ctx, 'as-built.md'), '').replace(/\r\n/g, '\n').split('\n')
    .map((l) => l.trim().replace(/^[-*]\s+/, '').trim()).filter(Boolean)
  const advisories = ((state.review && state.review.findings) || []).filter((f) => f.severity === 'advisory')
    .map((f) => `${f.file || ''}${f.file && f.line ? ':' + f.line : ''} ${f.summary || ''}`.trim()).filter(Boolean)
  const outside = state.fix ? [] : outsideFiles(state, ctx, spec).map((f) => `touched outside the File Plan: ${f}`)
  const prefix = state.fix ? `(fix: ${state.fix.symptom}) ` : ''
  return [...new Set([...lines, ...advisories, ...outside].map((d) => prefix + d))]
}

// Appends the bullets under `## As built` (created after the last section when absent), skipping any
// already there, so the build commit carries what was built. Decisions are never touched.
function appendAsBuilt(file, bullets) {
  const text = st.readText(file, '')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((l) => /^## +As built\s*$/.test(l))
  const have = new Set(lines.slice(at < 0 ? lines.length : at).map((l) => l.trim()))
  const fresh = bullets.map((b) => `- ${b}`).filter((b) => !have.has(b))
  if (!fresh.length) return
  if (at < 0) {
    st.writeText(file, text.replace(/\s+$/, '') + eol + eol + ['## As built', '', ...fresh].join(eol) + eol)
    return
  }
  let end = lines.findIndex((l, i) => i > at && /^## /.test(l))
  if (end < 0) end = lines.length
  let last = end - 1
  while (last > at && !lines[last].trim()) last--
  lines.splice(last + 1, 0, ...(last === at ? [''] : []), ...fresh)
  st.writeText(file, lines.join(eol))
}

function commit(state, ctx) {
  const spec = state.fix ? null : st.readSpec(specIn(state, ctx))
  if (state.inPlace && !state.lane && !state.fix) st.writeStatus(specIn(state, ctx), 'done')
  // A spec-less fix has no spec to carry an As built section.
  const asBuilt = departures(state, ctx, spec)
  if (asBuilt.length && specIn(state, ctx)) appendAsBuilt(specIn(state, ctx), asBuilt)
  const wt = wtOf(state, ctx)
  // Safety-net commits fanout made for a stopped or waiting lane never reach trunk: fold them, and the
  // work still in the tree, into the one build commit.
  const mb = git.raw(['merge-base', cfgOf(ctx).trunk, 'HEAD'], wt)
  if (mb.status === 0 && git.sh(['log', '--format=%s', `${mb.stdout.trim()}..HEAD`], wt).split('\n').some((l) => l.startsWith('wip(spec):'))) git.sh(['reset', '-q', '--soft', mb.stdout.trim()], wt)
  // A re-run after a crash between the commit and the save finds a clean tree: report that commit.
  const subject = state.fix ? `fix(${specInfo(ctx).id}): ${state.fix.symptom.replace(/\s+/g, ' ')}` : `build(${specInfo(ctx).id}): ${spec.title}`
  // Evidence an AC asks to record goes in <run dir>/evidence.md; it rides in the commit body.
  const evidence = st.readText(runFile(ctx, 'evidence.md'), '').replace(/\r\n/g, '\n').replace(/\s+$/, '')
  const message = [subject, ...(state.fix ? [`Root cause: ${state.fix.cause}\nRegression test: ${state.fix.test}`] : []), ...(evidence.trim() ? [evidence] : [])].join('\n\n')
  try {
    state.commit = git.commitAll(wt, message) || (git.headSha(wt) !== state.base ? git.headSha(wt) : null)
  } catch (e) { // a commit hook rejected the build: repair it like a red gate; anything else is the user's git
    const hooks = git.raw(['rev-parse', '--git-path', 'hooks'], wt).stdout.trim()
    if (!['pre-commit', 'commit-msg'].some((h) => fs.existsSync(path.resolve(wt, hooks, h)))) refuse(`git commit failed in ${wt}: ${e.message}`, 1)
    state.gate = { ...(state.gate || {}), status: 'red', output_tail: `git commit was rejected (a commit hook?):\n${e.message}` }
    return state.attempts.repair >= REPAIR_CAP ? go(state, 'ESCALATE', { why: 'gate' }) : go(state, 'REPAIR')
  }
  if (state.lane) return go(state, 'MERGE_READY', { report: readyReport(state, ctx) })
  return go(state, 'MERGE')
}

function merge(state, ctx) {
  const cfg = cfgOf(ctx)
  if (state.inPlace) return go(state, 'FINISH') // in place: on trunk nothing to merge; on a branch the user merges (PR)
  const main = mainRoot(ctx.root)
  const on = git.currentBranch(main)
  if (on !== cfg.trunk) refuse(`${main} is on ${on}, not ${cfg.trunk} — check out ${cfg.trunk} there, then re-run`)
  const title = st.readSpec(specIn(state, ctx)).title
  const r = git.mergeBack(main, state.branch, cfg.mergeStrategy, { message: `chore(spec): merge ${specInfo(ctx).id} — ${title}` })
  if (r.conflicts.length) return go(state, 'CONFLICTS', { conflicts: r.conflicts })
  if (!r.merged) refuse(`${state.branch} was not merged: ${r.reason}`)
  // Separate saved steps: a crash after the merge resumes past it, never re-merging a deleted branch.
  return go(state, 'TRUNK_GATE', { mergeSha: r.sha })
}

function trunkGate(state, ctx) {
  const g = host.gate(mainRoot(ctx.root), cfgOf(ctx))
  state.trunkGate = { status: g.status === 0 ? 'green' : 'red', cached: g.cached, runId: g.runId, output_tail: g.tail }
  return go(state, 'FINISH')
}

function finish(state, ctx) {
  const s = specInfo(ctx)
  const wt = wtOf(state, ctx)
  if (!state.fix && st.readSpec(s.abs).frontmatter.status !== 'done') st.writeStatus(s.abs, 'done')
  if (state.marked) pending.unmarkLane(wt)
  const rm = state.inPlace ? { removed: true } : git.worktreeRemove(ctx.root, wt, { deleteBranch: state.mergeSha ? state.branch : undefined })
  // Tick this spec's queue item; Next is whatever the queue holds after it.
  const q = st.readQueue(ctx.root)
  const mine = state.fix ? [] : queue.pending(q).filter((i) => i.kind === 'spec' && path.resolve(ctx.root, i.payload) === s.abs)
  if (mine.length) { for (const i of mine) i.done = new Date().toISOString(); st.writeQueue(ctx.root, q) }
  const head = queue.pending(q)[0]
  const tg = state.trunkGate
  const findings = (state.review && state.review.findings) || []
  state.report = render({
    outcome: state.fix ? `✅ fixed — ${state.fix.symptom}` : state.mergeSha ? `✅ ${s.id} built, reviewed and merged` : `✅ ${s.id} built and reviewed on ${state.branch}`,
    bullets: [
      ...(state.fix ? fixBullets(state) : []),
      `commit ${state.commit || 'none (nothing changed)'}${state.mergeSha ? `, merged as ${state.mergeSha}` : ''}`,
      `gate green (run ${state.gate.runId})${tg ? `; trunk gate ${tg.status}${tg.cached ? ' (cached)' : ''}` : ''}`,
      `review ${state.review.verdict}, ${findings.length} finding(s); ${state.attempts.repair} repair(s), ${state.attempts.fix} fix round(s)`,
      ...loadBullet(state),
    ],
    pins: state.pin,
    warns: [...(rm.removed ? [] : [`worktree kept at ${state.worktree}: ${rm.reason} — git worktree remove --force ${state.worktree}`]),
      ...findings.filter((f) => f.severity !== 'blocking').map((f) => `${f.severity}: ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.summary || ''}`)],
    blocks: tg && tg.status === 'red' ? `trunk gate red after the merge:\n${tg.output_tail}` : null,
    artifacts: s.rel,
    next: tg && tg.status === 'red' ? `/spec:fix trunk gate red after merging ${s.rel}` : head ? queue.pasteLine(ctx.root, head) : undefined,
  })
  return go(state, 'DONE', { ended: true })
}

// ---- session steps ---------------------------------------------------------------------------

function builderBrief(state, ctx, kind) {
  const cfg = cfgOf(ctx)
  const seat = cfg.seats.builder
  const attempt = 1 + state.attempts.repair + state.attempts.fix + (kind === 'build' ? 0 : 1)
  const model = attempt >= 2 || state.opus ? 'opus' : seat.model
  const wt = wtOf(state, ctx)
  const specPath = specIn(state, ctx)
  const spec = specPath ? st.readSpec(specPath) : null
  const out = [
    ...(kind === 'build' && state.pin ? [state.pin, ''] : []),
    `Dispatch ONE \`builder\` agent (spec:builder, ${PLUGIN}/agents/builder.md) — model ${model}, effort ${seat.effort}, attempt ${attempt}, in ${wt}. Give it this brief:`,
    '',
    `Worktree: ${wt}`,
    ...(spec ? [`Spec: ${specPath}`] : []),
    `Test command: ${cfg.testCommand} (run it in the worktree)`,
    '',
    ...(state.fix ? fixBlock(state, ctx, kind) : ['## Intent', intentText(spec), '']),
    ...(spec ? [
      '## Decisions', ...decisions(spec), '',
      ...(state.fix ? [] : ['## File Plan', ...spec.filePlan.map((r) => `- ${r.action} ${r.path} — ${r.summary}`), '']),
      '## Acceptance Criteria', ...spec.acs.map((a) => `- ${a.id}: ${a.text}`), '',
      '## Assumptions', ...assumptionLines(spec), '',
      OTHER_SECTIONS, '',
    ] : []),
  ]
  if (kind === 'repair') out.push(`${/^git commit was rejected/.test(state.gate.output_tail || '') ? 'The commit hook rejected the build' : 'The gate is red'}. Repair the code (never weaken a test). Failure tail:`, '```', state.gate.output_tail, '```',
    'A failing test the diff does not touch, a timeout, or a flake under load is not yours to fix: say so in your reply and stop; the driver re-runs the gate. Never raise a host test timeout, retry count or worker limit to pass.', '')
  if (kind === 'fix' && state.fixFor === 'choices') {
    out.push('Undo every listed string and choice back to the pre-fix behaviour; keep the fix and its test:', ...fixAuthored(state).map((x) => `- ${x}`), '',
      `Then update ${runFile(ctx, 'fix.json')} so strings and choices list only what the tree still carries.`, '')
  } else if (kind === 'fix') {
    const decided = state.fixFor === 'decision'
    out.push(decided ? 'The reviewer found choices the spec did not make; the user said to undo them. For each: undo this choice; follow the spec.' : 'The reviewer found blocking issues. Fix each one:')
    for (const f of state.review.findings.filter((x) => x.severity === (decided ? 'needs-decision' : 'blocking'))) out.push(`- ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.summary || ''}${f.evidence ? ` (evidence: ${f.evidence})` : ''}`)
    out.push('')
  }
  out.push(...(kind === 'build' && state.fix ? [] : [kind === 'build' ? `Write failing tests first, then code, and run \`${cfg.testCommand}\` until green.` : `Run \`${cfg.testCommand}\` until green.`]),
    state.fix ? 'List every file you changed in your final summary.' : 'Do not touch files outside the File Plan without listing them in your final summary.',
    ...(spec ? ['If a Decision cannot be honoured as written, or an Assumption with an `ask` arm proves false, stop and say which in your reply — do not pick.'] : []),
    EVIDENCE(ctx), ...(spec ? [AS_BUILT(ctx)] : []))
  return out.join('\n')
}

// Files changed outside the File Plan (the spec itself and, with a Canonical Delta, docs/canonical are not).
function outsideFiles(state, ctx, spec) {
  const planned = new Set(spec.filePlan.map((r) => r.path))
  const own = state.spec.split(path.sep).join('/')
  const run = own.replace(/\.md$/, '.run/')
  const delta = hasDelta(spec)
  return git.changedFiles(state.base, wtOf(state, ctx)).filter((f) => !planned.has(f) && f !== own && !f.startsWith(run) && !(delta && f.startsWith('docs/canonical/')))
}

// The builder may list these in its summary; the reviewer decides whether they block. The spec
// is listed only when its text (not its status line) differs from base; ruling rows the driver wrote are not an edit.
function outsidePlan(state, ctx, spec, cfg) {
  const own = state.spec.split(path.sep).join('/')
  const norm = (t) => t.replace(/\r\n/g, '\n').replace(/^status:.*$/m, 'status:')
  const was = git.raw(['show', `${state.base}:${own}`], wtOf(state, ctx))
  const edited = was.status === 0 && norm(was.stdout) !== stripRows(norm(st.readText(specIn(state, ctx), '')), state.rulings)
  const out = outsideFiles(state, ctx, spec).map((f) => (watched(cfg, f) ? `${f} (askPaths)` : f))
  return edited ? [...out, `${own} (spec text edited)`] : out
}

function reviewerBrief(state, ctx) {
  const cfg = cfgOf(ctx)
  const specPath = specIn(state, ctx)
  const spec = specPath ? st.readSpec(specPath) : null
  const seat = spec && spec.frontmatter.architecture === true ? { model: 'fable', effort: 'high' } : cfg.seats.reviewer
  return [
    `Dispatch ONE \`reviewer\` agent (spec:reviewer, ${PLUGIN}/agents/reviewer.md) — model ${seat.model}, effort ${seat.effort}, in ${wtOf(state, ctx)}. Give it this brief:`,
    '',
    `Worktree: ${wtOf(state, ctx)}`,
    `Base: ${state.base}`,
    `Diff (working tree vs base): ${runFile(ctx, 'diff.patch')}`,
    ...(spec ? [`Spec: ${specPath}`] : []),
    `Write the findings JSON to: ${runFile(ctx, 'findings.json')}`,
    state.fix ? 'Files changed outside the File Plan: n/a (fix — it has no File Plan)' : `Files changed outside the File Plan: ${outsidePlan(state, ctx, spec, cfg).join(', ') || 'none'}`,
    ...(spec ? ["The spec's frontmatter status line changes during the run; that is bookkeeping, not a finding."] : []),
    '',
    ...(state.fix ? fixReviewBlock(state) : ['## Intent', intentText(spec), '']),
    ...(spec ? [
      '## Decisions', ...decisions(spec), '',
      '## Acceptance Criteria', ...spec.acs.map((a) => `- ${a.id}: ${a.text}`), '',
      '## Assumptions', ...assumptionLines(spec), '',
      OTHER_SECTIONS,
    ] : []),
  ].join('\n')
}

// A lane never asks: it writes the question for the parent session and stops.
function ask(state, ctx, question, options, why = state.why) {
  if (!state.spec) options = options.filter((o) => o.label !== 'amend') // no spec to amend
  if (state.lane) {
    pending.writePending(ctx.root, { lane: specInfo(ctx).stem, question, options, kind: KIND_OF[why] })
    return pending.stopLine(ctx.root)
  }
  return [`Ask the user ONE question (AskUserQuestion), recommended option first: ${question}`,
    ...options.map((o) => `- ${o.label} — ${o.description}`)].join('\n')
}

// trunkSha is the live trunk head the rebase is onto; a resolution that cannot keep a Decision asks, it never decides.
const rebaseLeft = (trunkSha) => `a rebase onto trunk is in progress in this worktree: edit each conflicted file to both sides' intent (no markers left), re-run this driver — it continues the rebase onto trunk ${trunkSha}, then gates and reviews the result in this same dispatch. If a resolution cannot keep a Decision, mark \`unmet --decision <id> --why <text>\` instead of deciding.`

const redLine = host.firstRedLine

const ESCALATE_MARK = (state) => `escalate <${offered(state).join('|')}>`

function escalateBody(state, ctx) {
  const id = specInfo(ctx).id
  const amend = { label: 'amend', description: 'set the spec to draft so you can amend it with /spec:plan' }
  if (state.why === 'fix-choices') {
    const all = fixAuthored(state)
    const n = state.fix.strings.length; const m = state.fix.choices.length
    const shown = all.slice(0, 3).join('; ') + (all.length > 3 ? `; +${all.length - 3} more` : '')
    return ask(state, ctx, `fix ${id} authored ${n} user-facing string(s) and ${m} display or policy choice(s): ${shown}. Keep them?`, [
      { label: 'keep', description: 'carry on to the review with them as they are' },
      { label: 'revert', description: 'one builder round that undoes them back to the pre-fix behaviour, keeping the fix and its test' },
      { label: 'plan', description: 'drop this fix and queue /spec:plan: they need the client\'s say' },
    ]) + '\n\n```\n' + all.map((x) => `- ${x}`).join('\n') + '\n```'
  }
  if (state.why === 'spec-edit') {
    return ask(state, ctx, `${id} edited spec text it may not: ${state.specEdits.join(', ')}. How should it continue?`, [
      { label: 'revert', description: 'restore those files from the base, keep the build, and gate it again' }, amend,
    ]) + '\n\n```\n' + state.specEdits.map((f) => `- ${f}`).join('\n') + '\n```'
  }
  if (state.why === 'assumption') {
    const a = state.assumption
    const arm = a.options.length ? [...a.options.filter((o) => o !== 'amend').map((o) => ({ label: o, description: `rule "${a.id}: ${o}" into the Decisions table and continue at ${state.from} on Opus` })), amend] : [
      { label: 'retry', description: `re-run ${state.from} on Opus with fresh attempts` },
      { label: 'park', description: 'queue a /spec:fix item and set the spec back to hardened' }, amend]
    return ask(state, ctx, `${id} found ${a.id} false: ${a.text}${a.note ? ` — ${a.note}` : ''}. How should it continue?`, arm)
  }
  if (state.why === 'review-decision') {
    const nd = state.review.findings.filter((f) => f.severity === 'needs-decision')
    const more = nd.length > 1 ? `; +${nd.length - 1} more` : ''
    return ask(state, ctx, `${id} made a choice you did not: ${nd[0].summary || 'see the findings'}${more}. Keep it?`, [
      { label: 'keep', description: 'record your yes in the Decisions table and carry on to the commit' },
      { label: 'fix', description: 'one more builder round that undoes the choice and follows the spec (not counted as a fix round)' }, amend,
    ]) + '\n\n```\n' + nd.map((f) => `- ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.summary || ''}${f.evidence ? ` (evidence: ${f.evidence})` : ''}`).join('\n') + '\n```'
  }
  if (state.why === 'scope') {
    return ask(state, ctx, `${id} changed files outside its File Plan on paths you watch: ${state.scope.join(', ')}. How should it continue?`, [
      { label: 'widen', description: 'accept the files as part of this spec, record it in the Decisions table, and go on to review' },
      { label: 'separate', description: 'restore those files from the base, queue a follow-up item for them, and gate the rest again' },
      { label: 'park', description: 'queue a /spec:fix item and set the spec back to hardened' },
    ]) + '\n\n```\n' + state.scope.map((f) => `- ${f}`).join('\n') + '\n```'
  }
  const options = [
    { label: 'retry', description: 're-run the builder on Opus with fresh attempts' },
    { label: 'park', description: state.spec ? 'queue a /spec:fix item and set the spec back to hardened' : 'queue this fix as a /spec:fix item and stop here' },
    amend,
  ]
  if (state.why === 'decision') {
    options[2] = { label: 'amend', description: `set the spec to draft; proposed amendment: ${state.unmet.text}` }
    return ask(state, ctx, `${id} cannot meet ${state.unmet.decision}: ${state.unmet.text}. How should it continue?`, options)
  }
  const q = state.why === 'gate' ? `${id} is still red after ${REPAIR_CAP} repairs. How should it continue?`
    : `${id} still has blocking review findings after ${FIX_CAP} fix round. How should it continue?`
  const detail = state.why === 'gate' ? state.gate.output_tail
    : state.review.findings.filter((f) => f.severity === 'blocking').map((f) => `- ${f.file || ''} ${f.summary || ''}`).join('\n')
  return ask(state, ctx, q, options) + '\n\n```\n' + detail + '\n```'
}

// A lane's rebase that fanout or a reused worktree left in progress: resolved here, whatever the step.
// Not at ESCALATE, PARKED or AMENDED: the lane has stopped and a question is out.
const rebaseGuard = (state, ctx) => state.lane && state.worktree && !['ESCALATE', 'PARKED', 'AMENDED'].includes(state.step) && git.rebasing(wtOf(state, ctx))
const hasMarkers = (wt, f) => /^(<{7}|>{7})( |$)/m.test(st.readText(path.join(wt, f), ''))

// Continues the resolved rebase. Once it completes, base is the merge-base with trunk, and a lane that
// had landed (MERGE_READY) goes back through GATE and REVIEW: the resolution is ungated and unreviewed.
function finishRebase(state, ctx) {
  const wt = wtOf(state, ctx)
  git.sh(['add', '-A'], wt); git.raw(['-c', 'core.editor=true', 'rebase', '--continue'], wt) // a later commit may conflict again
  if (git.rebasing(wt)) {
    if (!git.conflictsIn(wt).length) refuse(`the rebase in ${wt} stopped without a conflict — finish it with git rebase --continue or --skip there, then re-run`, 1)
    return state
  }
  state.base = git.sh(['merge-base', cfgOf(ctx).trunk, 'HEAD'], wt)
  if (state.commit) state.commit = git.headSha(wt)
  if (state.report) state.report = readyReport(state, ctx)
  if (state.step === 'MERGE_READY') return go(state, 'GATE', { review: null, attempts: { repair: 0, fix: 0 } })
  return state
}

function derive(state, ctx) {
  if (rebaseGuard(state, ctx)) {
    const wt = wtOf(state, ctx)
    if (git.conflictsIn(wt).some((f) => hasMarkers(wt, f))) {
      return { name: state.step, body: rebaseLeft(git.sh(['rev-parse', cfgOf(ctx).trunk], wt)), accepts: ['waiting', 'unmet'] }
    }
    return { name: state.step, auto: finishRebase }
  }
  switch (state.step) {
    case 'OPEN': return { name: 'OPEN', auto: open }
    case 'BUILD': return { name: 'BUILD', body: builderBrief(state, ctx, 'build'), mark: 'built', accepts: laneAsks(state) }
    case 'GATE': return { name: 'GATE', auto: gateStep }
    case 'REPAIR': return {
      name: 'REPAIR', mark: 'repaired', accepts: [...laneAsks(state), 'regate'],
      body: builderBrief(state, ctx, 'repair') + `\n\nGate tree ${String((state.gate && state.gate.tree) || '').slice(0, 7)}. If the builder replied that the failure is not its to fix (no change to the tree), re-run the gate without counting a repair: ${selfCmd(state, ctx)} --mark regate (once per tree).`,
    }
    case 'REVIEW': return { name: 'REVIEW', body: reviewerBrief(state, ctx), mark: `reviewed --file ${shq(runFile(ctx, 'findings.json'))}`, accepts: laneAsks(state) }
    case 'FIX': return { name: 'FIX', body: builderBrief(state, ctx, 'fix'), mark: 'fixed', accepts: laneAsks(state) }
    case 'ESCALATE': {
      // A lane re-dispatched after fanout recorded the answer continues with it.
      const doc = state.lane && pending.readPending(ctx.root)
      if (doc && doc.answer) return { name: 'ESCALATE', auto: (s) => steps.escalate(s, { choice: doc.answer.label }, ctx) }
      return { name: 'ESCALATE', body: escalateBody(state, ctx), mark: ESCALATE_MARK(state) }
    }
    case 'COMMIT': return { name: 'COMMIT', auto: commit }
    case 'MERGE': return { name: 'MERGE', auto: merge }
    case 'TRUNK_GATE': return { name: 'TRUNK_GATE', auto: trunkGate }
    case 'FINISH': return { name: 'FINISH', auto: finish }
    case 'CONFLICTS': return {
      name: 'CONFLICTS', mark: 'conflicts-resolved',
      body: ask(state, ctx, `merging ${state.branch} into ${cfgOf(ctx).trunk} conflicts in ${state.conflicts.join(', ')}. Resolve them?`, [
        { label: 'resolve', description: `resolve each file by both sides' intent in ${mainRoot(ctx.root)}, leave it uncommitted, then mark conflicts-resolved` },
        { label: 'abort', description: 'run `git reset --merge` there (from your own shell if the hook refuses); marking conflicts-resolved later retries the merge' },
      ], 'conflicts'),
    }
    case 'MERGE_READY': return { name: 'MERGE_READY', body: state.report || '' }
    default: return { name: state.step, body: state.report || '' }
  }
}

// ---- marks -----------------------------------------------------------------------------------

function endRun(state, ctx, status, outcome, extra = {}) {
  const s = specInfo(ctx)
  if (!state.fix) st.writeStatus(s.abs, status) // a fix lane leaves the spec's status alone
  if (state.marked) pending.unmarkLane(wtOf(state, ctx))
  const report = render({ outcome, artifacts: s.rel, ...extra })
  return go(state, status === 'draft' ? 'AMENDED' : 'PARKED', { ended: !state.lane, report })
}

// A --on value as a repo-relative spec path; it must be a file under the checkout.
function specFileUnder(on, ctx) {
  if (typeof on !== 'string') refuse('waiting needs --on <spec>: the spec file this one waits for')
  const abs = path.resolve(ctx.root, on.replace(/^@/, ''))
  const rel = path.relative(ctx.root, abs).split(path.sep).join('/')
  if (rel.startsWith('..') || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) refuse(`--on ${on} is not a spec file under ${ctx.root}`)
  return rel
}

// Files restored from base (a file base lacks is removed).
function restoreFromBase(state, ctx, files) {
  const wt = wtOf(state, ctx)
  for (const f of files) {
    if (git.raw(['cat-file', '-e', `${state.base}:${f}`], wt).status === 0) git.sh(['checkout', state.base, '--', f], wt)
    else { git.raw(['rm', '-q', '-f', '--cached', '--ignore-unmatch', '--', f], wt); fs.rmSync(path.join(wt, f), { force: true }) }
  }
}

// The build's spec edits are undone: other specs from base (a file base lacks is removed), the own spec
// from base with its status line kept. Then the gate runs again.
function revertSpecEdits(state, ctx) {
  const own = state.spec.split(path.sep).join('/')
  const status = st.readSpec(specIn(state, ctx)).frontmatter.status
  restoreFromBase(state, ctx, state.specEdits || [])
  if ((state.specEdits || []).includes(own)) st.writeStatus(specIn(state, ctx), status)
  delete state.specEdits
  return go(state, 'GATE')
}

// The driver, never a builder, adds the user's ruling to the worktree copy of the spec's Decisions table
// and remembers the ids so the spec-edit check does not call them an edit.
function recordRuling(state, ctx, text, at) {
  const file = specIn(state, ctx)
  const raw = st.readText(file, '')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const ids = decisionRows(st.readSpec(file)).map((c) => /^D(\d+)$/i.exec(c[0])).filter(Boolean).map((m) => Number(m[1]))
  const id = 'D' + (Math.max(0, ...ids) + 1)
  const row = `| ${id} | ${text.replace(/\|/g, '\\|')} | asked at ${at} |`
  const h = lines.findIndex((l) => /^## +Decisions\b/.test(l))
  if (h < 0) lines.push('', '## Decisions', '', '| ID | Decision | Why |', '|----|----------|-----|', row)
  else {
    let end = lines.findIndex((l, i) => i > h && /^## /.test(l)); if (end < 0) end = lines.length
    let last = -1
    for (let i = h + 1; i < end; i++) if (lines[i].trim().startsWith('|')) last = i
    if (last >= 0) lines.splice(last + 1, 0, row)
    else lines.splice(h + 1, 0, '', '| ID | Decision | Why |', '|----|----------|-----|', row)
  }
  st.writeText(file, lines.join(eol))
  state.rulings = [...(state.rulings || []), id]
  return id
}

function queuePrompt(ctx, payload) {
  const q = st.readQueue(ctx.root)
  if (!q.items.some((i) => !i.done && i.payload === payload)) {
    q.seq = (q.seq || 0) + 1
    const type = (/^\/spec:(fix|plan|prototype) /.exec(payload) || [])[1]
    q.items.push({ id: 'q' + q.seq, kind: 'prompt', ...(type ? { type } : {}), payload, added: new Date().toISOString() })
    st.writeQueue(ctx.root, q)
  }
}

// The fix is not a fix: the cause needs an architecture or behaviour change. Whatever the builder added is
// discarded (the files that were untracked when the run opened stay), /spec:plan is queued with the diagnosis,
// and the run ends. In a lane the step stays as an ending like PARKED; fanout reports it.
function endNeedsPlan(state, ctx, why) {
  const wt = wtOf(state, ctx)
  git.sh(['reset', '-q', '--hard', state.lane ? state.base : 'HEAD'], wt)
  const kept = new Set(state.untracked0 || [])
  for (const f of git.sh(['ls-files', '--others', '--exclude-standard'], wt).split('\n').filter(Boolean)) if (!kept.has(f)) fs.rmSync(path.join(wt, f), { recursive: true, force: true })
  const payload = `/spec:plan ${state.fix.symptom.replace(/\s+/g, ' ')} — ${why}`
  queuePrompt(ctx, payload)
  if (state.marked) pending.unmarkLane(wt)
  const report = render({ outcome: `🚫 needs a spec — ${why}`, queued: `queued ${payload}`, next: '/spec:queue next' })
  return go(state, 'NEEDS_PLAN', { ended: !state.lane, report, needsPlan: why })
}

// The marks a lane agent may use while a builder or reviewer is out: stop for another spec, or ask about a Decision.
const LANE_ASKS = ['waiting', 'unmet']
const laneAsks = (state) => (state.spec ? LANE_ASKS : ['waiting']) // a spec-less fix has no Decisions or Assumptions to be unmet

// A builder round changes the tree; a mark with the tree the last gate ran on spends the budget for nothing.
function unchanged(state, ctx) {
  if (state.gate && state.gate.tree && host.treeSha(wtOf(state, ctx)) === state.gate.tree) {
    refuse('nothing changed since the last gate — re-run the gate (mark regate) or dispatch a builder')
  }
}

// A repair or fix round may change what the tree carries: the lists are re-read from fix.json.
function refreshFix(state, ctx) {
  const f = state.fix && readFixJson(ctx)
  if (!f) return
  state.fix = { ...state.fix, cause: textOf(f.cause) || state.fix.cause, test: textOf(f.test) || state.fix.test, strings: fixList(f.strings), choices: fixList(f.choices) }
}

const steps = {
  // A fix names its cause and test in fix.json, or says it needs a plan; the driver reads what the builder decided.
  built(state, flags, ctx) {
    if (!state.fix) return go(state, 'GATE')
    const f = readFixJson(ctx)
    const needsPlan = f && textOf(f.needsPlan)
    if (!f || (!needsPlan && !(textOf(f.cause) && textOf(f.test)))) refuse('fix.json needs cause and test — the builder reproduces first, then fixes')
    if (needsPlan) return endNeedsPlan(state, ctx, needsPlan)
    state.fix = { symptom: state.fix.symptom, cause: textOf(f.cause), test: textOf(f.test), strings: fixList(f.strings), choices: fixList(f.choices) }
    return go(state, 'GATE')
  },
  repaired(state, flags, ctx) { unchanged(state, ctx); state.attempts.repair++; refreshFix(state, ctx); return go(state, 'GATE') },
  // A round that undoes a choice (fixFor 'decision' or 'choices') is not counted against FIX_CAP.
  fixed(state, flags, ctx) { unchanged(state, ctx); if (state.fixFor) delete state.fixFor; else state.attempts.fix++; refreshFix(state, ctx); return go(state, 'GATE') },
  // Re-runs the gate on the same tree without counting a repair; once per tree.
  regate(state, flags, ctx) {
    const tree = host.treeSha(wtOf(state, ctx))
    if (!state.gate || state.gate.tree !== tree) refuse('regate re-runs the gate on an unchanged tree — the tree changed since the last gate, mark repaired after a builder round')
    if (state.regated === tree) refuse('this tree was already re-run once — dispatch a builder (mark repaired after its round) or escalate')
    state.regated = tree
    return go(state, 'GATE')
  },
  reviewed(state, flags, ctx) {
    if (!flags.file || flags.file === true) refuse('reviewed needs --file <findings json>')
    const doc = st.readJson(path.resolve(ctx.root, flags.file))
    if (!doc || !Array.isArray(doc.findings)) refuse(`${flags.file} is missing or is not findings JSON — expected {"findings": [...], "verdict": "clean|fix"}`)
    // Any blocking finding means FIX whatever the verdict; an unknown severity or verdict, or a
    // fix verdict with nothing blocking, is sent back.
    const bad = doc.findings.filter((f) => !f || typeof f !== 'object' || !SEVERITIES.includes(f.severity))
    if (bad.length) refuse(`${flags.file}: every finding needs severity ${SEVERITIES.join(' or ')} — got ${bad.map((f) => JSON.stringify(f && f.severity)).join(', ')}; rewrite those findings, then re-mark`)
    if (doc.verdict !== undefined && !['clean', 'fix'].includes(doc.verdict)) refuse(`${flags.file}: verdict must be clean or fix, got ${JSON.stringify(doc.verdict)}`)
    const blocking = doc.findings.filter((f) => f.severity === 'blocking')
    if (doc.verdict === 'fix' && !blocking.length) refuse(`${flags.file}: verdict is fix but no finding is blocking — set severity blocking on the finding(s) that must be fixed, or verdict clean`)
    // A needs-decision finding asks only when nothing blocks; beside a blocking one it rides along in state.review.
    const choices = doc.findings.filter((f) => f.severity === 'needs-decision')
    const verdict = blocking.length ? (state.attempts.fix >= FIX_CAP ? 'escalate' : 'fix') : choices.length ? 'decision' : 'clean'
    state.review = { findings: doc.findings, verdict }
    if (verdict === 'decision') return go(state, 'ESCALATE', { why: 'review-decision' })
    return go(state, verdict === 'clean' ? 'COMMIT' : verdict === 'fix' ? 'FIX' : 'ESCALATE', { why: 'review' })
  },
  waiting(state, flags, ctx) {
    const on = specFileUnder(flags.on, ctx)
    if (!state.lane) refuse(`not a lane — run /spec:run ${on} first, then re-run`)
    state.waitingOn = on
  },
  unmet(state, flags, ctx) {
    if (!state.spec) refuse('a fix with no spec has no Decisions or Assumptions to be unmet — mark waiting --on <spec>, or fix.json needsPlan')
    const spec = specInfo(ctx)
    if (flags.assumption !== undefined) {
      const all = st.parseAssumptions(sectionText(st.readSpec(specIn(state, ctx)), 'Assumptions'))
      const a = typeof flags.assumption === 'string' && all.find((x) => x.id === flags.assumption)
      if (!a) refuse(`--assumption ${flags.assumption === true ? '<id>' : flags.assumption} is not an Assumption of ${spec.rel} — known: ${all.map((x) => x.id).join(', ') || 'none'}`)
      if (!a.arm.ask) refuse(`${a.id} has a written fallback: ${a.arm.text} — apply it`)
      const note = typeof flags.why === 'string' ? flags.why.trim() : ''
      return go(state, 'ESCALATE', { why: 'assumption', from: state.step, assumption: { id: a.id, text: a.text, options: a.arm.options, note } })
    }
    const known = decisionRows(st.readSpec(specIn(state, ctx))).map((c) => c[0])
    if (typeof flags.decision !== 'string' || !known.includes(flags.decision)) refuse(`--decision ${flags.decision === true ? '<id>' : flags.decision} is not a row of ${spec.rel}'s Decisions table — known: ${known.join(', ') || 'none'}`)
    if (typeof flags.why !== 'string' || !flags.why.trim()) refuse('unmet needs --why <text>: what keeps the Decision from being met')
    return go(state, 'ESCALATE', { why: 'decision', from: state.step, unmet: { decision: flags.decision, text: flags.why.trim() } })
  },
  escalate(state, flags, ctx) {
    const c = flags.choice
    const labels = offered(state)
    if (typeof c !== 'string' || (state.why !== 'assumption' && !CHOICES.includes(c))) refuse(`escalate needs one of ${labels.join(' | ')}, e.g. --mark escalate ${labels[0]}`)
    if (!labels.includes(c)) refuse(`escalate ${c} is not offered here — one of ${labels.join(' | ')}`)
    if (state.lane) pending.consumePending(ctx.root)
    const fresh = { attempts: { repair: 0, fix: 0 }, opus: true }
    if (state.why === 'fix-choices') { // asked once per run, whatever the answer
      state.fixAsked = true
      if (c === 'keep') return toReview(state, ctx)
      if (c === 'revert') return go(state, 'FIX', { fixFor: 'choices' })
      return endNeedsPlan(state, ctx, 'the user sent the fix to plan')
    }
    if (c === 'revert') return revertSpecEdits(state, ctx)
    if (state.why === 'assumption' && state.assumption.options.includes(c) && c !== 'amend') {
      recordRuling(state, ctx, `${state.assumption.id} ruled: ${c}`, state.from)
      return go(state, state.from, fresh)
    }
    if (c === 'keep') {
      for (const f of state.review.findings.filter((x) => x.severity === 'needs-decision')) if (state.spec) recordRuling(state, ctx, `reviewer: ${f.summary || 'a choice the spec did not make'}`, 'REVIEW')
      state.review.verdict = 'clean'
      return go(state, 'COMMIT')
    }
    if (c === 'fix') return go(state, 'FIX', { fixFor: 'decision' })
    if (c === 'widen') {
      recordRuling(state, ctx, `scope widened: ${state.scope.join(', ')}`, 'GATE')
      state.widened = [...(state.widened || []), ...state.scope]
      delete state.scope
      return toReview(state, ctx)
    }
    const s = specInfo(ctx)
    if (c === 'separate') {
      restoreFromBase(state, ctx, state.scope)
      queuePrompt(ctx, `follow-up: ${s.rel} changed ${state.scope.join(', ')} outside its File Plan — plan it`)
      delete state.scope
      return go(state, 'GATE')
    }
    if (c === 'retry') return go(state, state.why === 'decision' || state.why === 'assumption' ? state.from : state.why === 'review' ? 'FIX' : 'REPAIR', fresh)
    if (c === 'amend') return endRun(state, ctx, 'draft', `⏸️ ${s.id} set back to draft for amending`, { next: `/spec:plan ${s.rel}` })
    const first = state.why === 'decision' ? state.unmet.text
      : state.why === 'assumption' ? `${state.assumption.id} found false: ${state.assumption.text}`
        : state.why === 'scope' ? `changed files outside its File Plan: ${state.scope.join(', ')}`
          : state.why === 'gate' ? redLine(state.gate.output_tail)
            : (state.review.findings.find((f) => f.severity === 'blocking') || {}).summary || 'blocking review findings'
    const payload = s.rel ? `/spec:fix ${s.rel} — ${first.trim()}` : `/spec:fix ${state.fix.symptom.replace(/\s+/g, ' ')}`
    queuePrompt(ctx, payload)
    return endRun(state, ctx, 'hardened', `⏸️ ${s.id} parked; a fix is queued`, { queued: payload, next: '/spec:queue next' })
  },
  'conflicts-resolved'(state, flags, ctx) {
    const main = mainRoot(ctx.root)
    const left = state.conflicts.filter((f) => /^(<{7}|>{7})( |$)/m.test(st.readText(path.join(main, f), '')))
    if (left.length) refuse(`conflict markers remain in ${left.join(', ')} — resolve them, then re-run`)
    // Stage only the reported files (`add -A` here would sweep the user's untracked files in).
    git.sh(['add', '-A', '--', ...state.conflicts], main)
    const inMerge = git.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], main).status === 0
    const staged = git.raw(['diff', '--cached', '--quiet'], main).status !== 0
    if (inMerge || staged) git.sh(['commit', '-q', '-m', `chore(spec): merge ${specInfo(ctx).id} — ${st.readSpec(specIn(state, ctx)).title}`], main)
    else if (git.raw(['merge-base', '--is-ancestor', state.branch, 'HEAD'], main).status !== 0) return go(state, 'MERGE') // nothing merged (aborted): merge again
    return go(state, 'TRUNK_GATE', { mergeSha: git.headSha(main) })
  },
}

// One line under the checkpoint so the session sees what the mark led to.
function afterMark(verb, state, ctx) {
  const g = state.gate
  if (['built', 'repaired', 'regate', 'fixed'].includes(verb) && g) {
    const cost = `${g.reruns === 1 ? ' · rerun' : ''}${g.lockWaitMs >= 1000 ? ` · waited ${secs(g.lockWaitMs)}s for a gate slot` : ''}`
    if (g.status === 'red') return `gate: red — ${redLine(g.output_tail)}${cost}`
    return `gate: green (${g.cached ? 'cached' : `ran ${g.ms}ms`})${state.commit ? ` · commit ${state.commit.slice(0, 7)}` : ''}${cost}`
  }
  if (verb === 'waiting') return `WAITING — ${state.spec || 'this fix'} waits on ${state.waitingOn}; the lane stops here and fanout re-picks it once ${state.waitingOn} is done on trunk`
  if (verb === 'unmet' && state.lane) return pending.stopLine(ctx.root)
  if (verb === 'reviewed' && state.gate && /^git commit was rejected/.test(state.gate.output_tail || '')) return `commit: rejected — ${redLine(state.gate.output_tail.split('\n').slice(1).join('\n'))}`
  if (verb === 'reviewed' && state.review) {
    const n = state.review.findings.filter((f) => f.severity === 'blocking').length
    const d = state.review.findings.filter((f) => f.severity === 'needs-decision').length
    return n ? `review: ${n} blocking → ${state.review.verdict === 'fix' ? 'FIX' : 'ESCALATE'}` : d ? `review: ${d} needs-decision → ESCALATE` : 'review: clean'
  }
  return null
}

// A spec-less fix has only its symptom to find its state by: every printed mark line carries it.
const markArgs = (ctx) => (fixOnly(ctx) ? ['--fix', String(ctx.flags.fix)] : [])
const main = makeDriver({ name: 'run', specArg: 'spec path', load, save, derive, steps, after: afterMark, markArgs })

if (require.main === module) {
  const argv = process.argv.slice(2)
  const ip = argv.indexOf('--in-place')
  if (ip >= 0) { argv.splice(ip, 1); inPlaceFlag = true }
  const m = argv.indexOf('--mark')
  if (m >= 0 && argv[m + 1] === 'escalate' && argv[m + 2] && !argv[m + 2].startsWith('--')) argv.splice(m + 2, 0, '--choice')
  process.exitCode = main(argv)
}

module.exports = { main }
