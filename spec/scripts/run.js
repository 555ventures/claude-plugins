#!/usr/bin/env node
'use strict'
// run.js — /spec:run: carry one hardened spec OPEN → BUILD → GATE → REPAIR|REVIEW → FIX|COMMIT →
// MERGE (CONFLICTS) → DONE (architecture §4). The session dispatches agents; the driver gates,
// commits and merges.
//
// node run.js <spec> [--in-place] [--fix "<symptom>"] [--root <dir>] [--state] [--json] [--mark <verb>]
// --fix runs only as a fanout lane: the brief is the symptom, the commit is `fix(<id>): <symptom>`.
// Marks: built · repaired · reviewed --file <json> · fixed · escalate <retry|park|amend|revert> ·
// conflicts-resolved · waiting --on <spec> (lane) · unmet --decision <id> --why <text>.
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
const CHOICES = ['retry', 'park', 'amend', 'revert']
const OFFERED = { 'spec-edit': ['revert', 'amend'] } // every other escalation offers retry, park, amend
const offered = (state) => OFFERED[state.why] || ['retry', 'park', 'amend']
const SEVERITIES = ['blocking', 'advisory']
// Only while a builder or reviewer is out is the checkout marked for block-worker-git.sh.
const AGENT_STEPS = ['BUILD', 'REPAIR', 'FIX', 'REVIEW']
let inPlaceFlag = false

// ---- paths ---------------------------------------------------------------------------------

function specInfo(ctx) {
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
const specIn = (state, ctx) => path.join(wtOf(state, ctx), state.spec)
const runFile = (ctx, name) => path.join(st.runDir(specInfo(ctx).abs), name)
const mainRoot = (root) => git.worktreeList(root)[0]
const sectionText = (spec, name) => spec.sections[Object.keys(spec.sections).find((k) => k === name || k.startsWith(name + ' ')) || ''] || ''
// v7-era specs carry ## Goal and no ## Intent; the brief's Intent falls back to it.
const intentText = (spec) => sectionText(spec, 'Intent') || sectionText(spec, 'Goal')
// A fix lane's brief replaces the Intent with the symptom.
const fixBlock = (state) => ['## Fix', state.fix, 'Reproduce it, write a regression test that fails for that reason, fix the cause.', '']
const EVIDENCE = (ctx) => `Evidence an AC asks to record (listings, renders, counts) goes in ${runFile(ctx, 'evidence.md')}; the driver appends it to the build commit.`
const OTHER_SECTIONS = 'Other sections (File Plan, Contracts, UI, Behavior, Assumptions) are not printed here — read them in the spec file.'
// Decisions table rows as bullets; the ADR constraints the planner wrote must reach builder and reviewer.
// A row is a template leftover only when a cell is exactly a <placeholder>; JSX or generics in a decision stay.
const placeholderRow = (cells) => cells.some((c) => /^<[^>]+>$/.test(c))
const decisionRows = (spec) => sectionText(spec, 'Decisions').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && !/^\|[\s|:-]*$/.test(l))
  .map((l) => l.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))).filter((c) => c.length >= 2 && !/^id$/i.test(c[0]) && !placeholderRow(c))
const decisions = (spec) => {
  const rows = decisionRows(spec)
  return rows.length ? rows.map((c) => `- ${c[0]}: ${c[1]}${c.length > 2 && c[c.length - 1] ? ` — ${c[c.length - 1]}` : ''}`) : ['- none']
}

function go(state, step, extra = {}) {
  state.history = [...(state.history || []), { step, at: new Date().toISOString() }]
  return Object.assign(state, extra, { step })
}

function load(ctx) {
  const s = specInfo(ctx)
  const ignored = (p) => git.raw(['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', p], ctx.root).status !== 1 // 0 ignored; 128 (e.g. a symlinked dir) is not "missing"; the repo's own ignores only
  if (!ignored(path.relative(ctx.root, st.runPath(s.abs))) || (cfgOf(ctx).worktreePerSpec !== false && !ignored('.claude/worktrees/x')))
    refuse('run sidecars and worktrees must be git-ignored — add the lines `specs/**/*.run/` and `.claude/worktrees/` to .gitignore, commit it, then re-run')
  const fix = ctx.flags.fix
  if (fix !== undefined) {
    if (!pending.isFanoutLane(ctx.root)) refuse('--fix runs only as a fanout lane — use /spec:fix here')
    if (typeof fix !== 'string' || !fix.trim()) refuse('--fix needs a symptom: --fix "<symptom>"')
  }
  return st.readRun(s.abs) || { step: 'OPEN', spec: s.rel, ...(fix === undefined ? {} : { fix: fix.trim() }) }
}

// A fanout lane's marker belongs to fanout; otherwise the marker is on exactly while an agent is out.
function syncMarker(state, ctx) {
  if (state.lane || !state.worktree) return
  const want = !state.ended && AGENT_STEPS.includes(state.step)
  if (want) { pending.markLane(wtOf(state, ctx), 'run'); state.marked = true } else if (state.marked) { pending.unmarkLane(wtOf(state, ctx)); state.marked = false }
}

function save(state, ctx) {
  const abs = specInfo(ctx).abs
  syncMarker(state, ctx)
  if (state.ended) st.clearRun(abs); else st.writeRun(abs, state)
}

// ---- auto steps ----------------------------------------------------------------------------

function open(state, ctx) {
  const s = specInfo(ctx)
  const cfg = cfgOf(ctx)
  const spec = st.readSpec(s.abs)
  const status = spec.frontmatter.status
  if (status === 'draft' || spec.markers) {
    refuse(`${s.rel} is ${status === 'draft' ? 'a draft' : `carrying ${spec.markers} [NEEDS CLARIFICATION:] marker(s)`} — finish it with /spec:plan ${s.rel}, then re-run`)
  }
  if (state.fix && !['done', 'hardened'].includes(status)) refuse(`${s.rel} is ${status}, not done or hardened — a fix lane runs on a finished or hardened spec`)
  if (status === 'done' && !state.fix) refuse(`${s.rel} is already done — nothing to run`)
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
  return go(state, 'BUILD', {
    spec: s.rel, worktree: path.relative(ctx.root, wt) || '.', branch: why ? cur : specBranch,
    base: mb.status === 0 ? mb.stdout.trim() : git.headSha(wt), inPlace: !!why, lane, marked: false,
    pin: why ? `📌 Auto-picked in place — ${why}` : null,
    attempts: { repair: 0, fix: 0 }, opus: false, gate: null, review: null,
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
const decisionsText = (text) => {
  const m = /^## +Decisions(?: [^\n]*)?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'))
  return m ? m[1].trim() : ''
}
function specEdits(state, ctx) {
  const wt = wtOf(state, ctx)
  const own = state.spec.split(path.sep).join('/')
  const files = git.changedFiles(state.base, wt).filter((f) => /^specs\/.+\.md$/.test(f) && f !== own)
  const was = git.raw(['show', `${state.base}:${own}`], wt)
  const now = st.readText(specIn(state, ctx), null)
  if (was.status === 0 && now !== null && decisionsText(was.stdout) !== decisionsText(now)) files.push(own)
  return files
}

function gateStep(state, ctx) {
  const cfg = cfgOf(ctx)
  const wt = wtOf(state, ctx)
  const t0 = Date.now()
  const g = host.gate(wt, cfg)
  const ms = Date.now() - t0
  const red = g.status !== 0
  const tail = red && cfg.testFileCommand ? g.tail + '\n' + redCheck(state, wt) : g.tail
  state.gate = { status: red ? 'red' : 'green', runId: g.runId, cached: g.cached, ms, output_tail: tail }
  if (red) return state.attempts.repair >= REPAIR_CAP ? go(state, 'ESCALATE', { why: 'gate' }) : go(state, 'REPAIR')
  const edits = specEdits(state, ctx)
  if (edits.length) return go(state, 'ESCALATE', { why: 'spec-edit', specEdits: edits })
  st.writeText(runFile(ctx, 'diff.patch'), git.diff(state.base, wt) + '\n')
  fs.rmSync(runFile(ctx, 'findings.json'), { force: true }) // never re-read an earlier round's findings
  return go(state, 'REVIEW')
}

// A lane stops here, committed: fanout writes done, merges in queue order and cleans up.
const readyReport = (state, ctx) => render({ outcome: `✅ ${specInfo(ctx).id} built and reviewed — merge-ready on ${state.branch}`, bullets: `commit ${state.commit || 'none (nothing changed)'}`, next: 'nothing needs you — fanout merges the lane' })

function commit(state, ctx) {
  const spec = st.readSpec(specIn(state, ctx))
  if (state.inPlace && !state.lane) st.writeStatus(specIn(state, ctx), 'done')
  const wt = wtOf(state, ctx)
  // Safety-net commits fanout made for a stopped or waiting lane never reach trunk: fold them, and the
  // work still in the tree, into the one build commit.
  const mb = git.raw(['merge-base', cfgOf(ctx).trunk, 'HEAD'], wt)
  if (mb.status === 0 && git.sh(['log', '--format=%s', `${mb.stdout.trim()}..HEAD`], wt).split('\n').some((l) => l.startsWith('wip(spec):'))) git.sh(['reset', '-q', '--soft', mb.stdout.trim()], wt)
  // A re-run after a crash between the commit and the save finds a clean tree: report that commit.
  const subject = state.fix ? `fix(${specInfo(ctx).id}): ${state.fix}` : `build(${specInfo(ctx).id}): ${spec.title}`
  // Evidence an AC asks to record goes in <run dir>/evidence.md; it rides in the commit body.
  const evidence = st.readText(runFile(ctx, 'evidence.md'), '').replace(/\r\n/g, '\n').replace(/\s+$/, '')
  const message = evidence.trim() ? `${subject}\n\n${evidence}` : subject
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
  if (st.readSpec(s.abs).frontmatter.status !== 'done') st.writeStatus(s.abs, 'done')
  if (state.marked) pending.unmarkLane(wt)
  const rm = state.inPlace ? { removed: true } : git.worktreeRemove(ctx.root, wt, { deleteBranch: state.mergeSha ? state.branch : undefined })
  // Tick this spec's queue item; Next is whatever the queue holds after it.
  const q = st.readQueue(ctx.root)
  const mine = queue.pending(q).filter((i) => i.kind === 'spec' && path.resolve(ctx.root, i.payload) === s.abs)
  if (mine.length) { for (const i of mine) i.done = new Date().toISOString(); st.writeQueue(ctx.root, q) }
  const head = queue.pending(q)[0]
  const tg = state.trunkGate
  const findings = (state.review && state.review.findings) || []
  state.report = render({
    outcome: state.mergeSha ? `✅ ${s.id} built, reviewed and merged` : `✅ ${s.id} built and reviewed on ${state.branch}`,
    bullets: [
      `commit ${state.commit || 'none (nothing changed)'}${state.mergeSha ? `, merged as ${state.mergeSha}` : ''}`,
      `gate green (run ${state.gate.runId})${tg ? `; trunk gate ${tg.status}${tg.cached ? ' (cached)' : ''}` : ''}`,
      `review ${state.review.verdict}, ${findings.length} finding(s); ${state.attempts.repair} repair(s), ${state.attempts.fix} fix round(s)`,
    ],
    pins: state.pin,
    warns: [...(rm.removed ? [] : [`worktree kept at ${state.worktree}: ${rm.reason} — git worktree remove --force ${state.worktree}`]),
      ...findings.filter((f) => f.severity !== 'blocking').map((f) => `advisory: ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.summary || ''}`)],
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
  const spec = st.readSpec(specPath)
  const out = [
    ...(kind === 'build' && state.pin ? [state.pin, ''] : []),
    `Dispatch ONE \`builder\` agent (spec:builder, ${PLUGIN}/agents/builder.md) — model ${model}, effort ${seat.effort}, attempt ${attempt}, in ${wt}. Give it this brief:`,
    '',
    `Worktree: ${wt}`,
    `Spec: ${specPath}`,
    `Test command: ${cfg.testCommand} (run it in the worktree)`,
    '',
    ...(state.fix ? fixBlock(state) : ['## Intent', intentText(spec), '']),
    '## Decisions', ...decisions(spec), '',
    ...(state.fix ? [] : ['## File Plan', ...spec.filePlan.map((r) => `- ${r.action} ${r.path} — ${r.summary}`), '']),
    '## Acceptance Criteria', ...spec.acs.map((a) => `- ${a.id}: ${a.text}`), '',
    OTHER_SECTIONS, '',
  ]
  if (kind === 'repair') out.push(`${/^git commit was rejected/.test(state.gate.output_tail || '') ? 'The commit hook rejected the build' : 'The gate is red'}. Repair the code (never weaken a test). Failure tail:`, '```', state.gate.output_tail, '```', '')
  if (kind === 'fix') {
    out.push('The reviewer found blocking issues. Fix each one:')
    for (const f of state.review.findings.filter((x) => x.severity === 'blocking')) out.push(`- ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.summary || ''}${f.evidence ? ` (evidence: ${f.evidence})` : ''}`)
    out.push('')
  }
  out.push(kind === 'build' ? `Write failing tests first, then code, and run \`${cfg.testCommand}\` until green.` : `Run \`${cfg.testCommand}\` until green.`,
    state.fix ? 'List every file you changed in your final summary.' : 'Do not touch files outside the File Plan without listing them in your final summary.',
    EVIDENCE(ctx))
  return out.join('\n')
}

// The builder may list these in its summary; the reviewer decides whether they block. The spec
// is listed only when its text (not its status line) differs from base.
function outsidePlan(state, ctx, spec) {
  const planned = new Set(spec.filePlan.map((r) => r.path))
  const own = state.spec.split(path.sep).join('/')
  const run = own.replace(/\.md$/, '.run/')
  const norm = (t) => t.replace(/\r\n/g, '\n').replace(/^status:.*$/m, 'status:')
  const was = git.raw(['show', `${state.base}:${own}`], wtOf(state, ctx))
  const edited = was.status === 0 && norm(was.stdout) !== norm(st.readText(specIn(state, ctx), ''))
  const out = git.changedFiles(state.base, wtOf(state, ctx)).filter((f) => !planned.has(f) && f !== own && !f.startsWith(run))
  return edited ? [...out, `${own} (spec text edited)`] : out
}

function reviewerBrief(state, ctx) {
  const cfg = cfgOf(ctx)
  const specPath = specIn(state, ctx)
  const spec = st.readSpec(specPath)
  const seat = spec.frontmatter.architecture === true ? { model: 'fable', effort: 'high' } : cfg.seats.reviewer
  return [
    `Dispatch ONE \`reviewer\` agent (spec:reviewer, ${PLUGIN}/agents/reviewer.md) — model ${seat.model}, effort ${seat.effort}, in ${wtOf(state, ctx)}. Give it this brief:`,
    '',
    `Worktree: ${wtOf(state, ctx)}`,
    `Base: ${state.base}`,
    `Diff (working tree vs base): ${runFile(ctx, 'diff.patch')}`,
    `Spec: ${specPath}`,
    `Write the findings JSON to: ${runFile(ctx, 'findings.json')}`,
    state.fix ? 'Files changed outside the File Plan: n/a (fix lane — it has no File Plan)' : `Files changed outside the File Plan: ${outsidePlan(state, ctx, spec).join(', ') || 'none'}`,
    "The spec's frontmatter status line changes during the run; that is bookkeeping, not a finding.",
    '',
    ...(state.fix ? fixBlock(state) : ['## Intent', intentText(spec), '']),
    '## Decisions', ...decisions(spec), '',
    '## Acceptance Criteria', ...spec.acs.map((a) => `- ${a.id}: ${a.text}`), '',
    OTHER_SECTIONS,
  ].join('\n')
}

// A lane never asks: it writes the question for the parent session and stops.
function ask(state, ctx, question, options) {
  if (state.lane) {
    pending.writePending(ctx.root, { lane: specInfo(ctx).stem, question, options })
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
  if (state.why === 'spec-edit') {
    return ask(state, ctx, `${id} edited spec text it may not: ${state.specEdits.join(', ')}. How should it continue?`, [
      { label: 'revert', description: 'restore those files from the base, keep the build, and gate it again' }, amend,
    ]) + '\n\n```\n' + state.specEdits.map((f) => `- ${f}`).join('\n') + '\n```'
  }
  const options = [
    { label: 'retry', description: 're-run the builder on Opus with fresh attempts' },
    { label: 'park', description: 'queue a /spec:fix item and set the spec back to hardened' },
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
    case 'BUILD': return { name: 'BUILD', body: builderBrief(state, ctx, 'build'), mark: 'built', accepts: LANE_ASKS }
    case 'GATE': return { name: 'GATE', auto: gateStep }
    case 'REPAIR': return { name: 'REPAIR', body: builderBrief(state, ctx, 'repair'), mark: 'repaired', accepts: LANE_ASKS }
    case 'REVIEW': return { name: 'REVIEW', body: reviewerBrief(state, ctx), mark: `reviewed --file ${shq(runFile(ctx, 'findings.json'))}`, accepts: LANE_ASKS }
    case 'FIX': return { name: 'FIX', body: builderBrief(state, ctx, 'fix'), mark: 'fixed', accepts: LANE_ASKS }
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
      ]),
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

// The build's spec edits are undone: other specs from base (a file base lacks is removed), the own spec
// from base with its status line kept. Then the gate runs again.
function revertSpecEdits(state, ctx) {
  const wt = wtOf(state, ctx)
  const own = state.spec.split(path.sep).join('/')
  const status = st.readSpec(specIn(state, ctx)).frontmatter.status
  for (const f of state.specEdits || []) {
    if (git.raw(['cat-file', '-e', `${state.base}:${f}`], wt).status === 0) git.sh(['checkout', state.base, '--', f], wt)
    else { git.raw(['rm', '-q', '-f', '--cached', '--ignore-unmatch', '--', f], wt); fs.rmSync(path.join(wt, f), { force: true }) }
  }
  if ((state.specEdits || []).includes(own)) st.writeStatus(specIn(state, ctx), status)
  delete state.specEdits
  return go(state, 'GATE')
}

// The marks a lane agent may use while a builder or reviewer is out: stop for another spec, or ask about a Decision.
const LANE_ASKS = ['waiting', 'unmet']

const steps = {
  built: (state) => go(state, 'GATE'),
  repaired: (state) => { state.attempts.repair++; return go(state, 'GATE') },
  fixed: (state) => { state.attempts.fix++; return go(state, 'GATE') },
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
    const verdict = !blocking.length ? 'clean' : state.attempts.fix >= FIX_CAP ? 'escalate' : 'fix'
    state.review = { findings: doc.findings, verdict }
    return go(state, verdict === 'clean' ? 'COMMIT' : verdict === 'fix' ? 'FIX' : 'ESCALATE', { why: 'review' })
  },
  waiting(state, flags, ctx) {
    const on = specFileUnder(flags.on, ctx)
    if (!state.lane) refuse(`not a lane — run /spec:run ${on} first, then re-run`)
    state.waitingOn = on
  },
  unmet(state, flags, ctx) {
    const spec = specInfo(ctx)
    const known = decisionRows(st.readSpec(specIn(state, ctx))).map((c) => c[0])
    if (typeof flags.decision !== 'string' || !known.includes(flags.decision)) refuse(`--decision ${flags.decision === true ? '<id>' : flags.decision} is not a row of ${spec.rel}'s Decisions table — known: ${known.join(', ') || 'none'}`)
    if (typeof flags.why !== 'string' || !flags.why.trim()) refuse('unmet needs --why <text>: what keeps the Decision from being met')
    return go(state, 'ESCALATE', { why: 'decision', from: state.step, unmet: { decision: flags.decision, text: flags.why.trim() } })
  },
  escalate(state, flags, ctx) {
    const c = flags.choice
    if (!CHOICES.includes(c)) refuse(`escalate needs one of ${offered(state).join(' | ')}, e.g. --mark escalate ${offered(state)[0]}`)
    if (!offered(state).includes(c)) refuse(`escalate ${c} is not offered here — one of ${offered(state).join(' | ')}`)
    if (state.lane) pending.consumePending(ctx.root)
    if (c === 'revert') return revertSpecEdits(state, ctx)
    if (c === 'retry') return go(state, state.why === 'decision' ? state.from : state.why === 'review' ? 'FIX' : 'REPAIR', { attempts: { repair: 0, fix: 0 }, opus: true })
    const s = specInfo(ctx)
    if (c === 'amend') return endRun(state, ctx, 'draft', `⏸️ ${s.id} set back to draft for amending`, { next: `/spec:plan ${s.rel}` })
    const first = state.why === 'decision' ? state.unmet.text
      : state.why === 'gate' ? redLine(state.gate.output_tail)
        : (state.review.findings.find((f) => f.severity === 'blocking') || {}).summary || 'blocking review findings'
    const payload = `/spec:fix ${s.rel} — ${first.trim()}`
    const q = st.readQueue(ctx.root)
    if (!q.items.some((i) => !i.done && i.payload === payload)) {
      q.seq = (q.seq || 0) + 1
      q.items.push({ id: 'q' + q.seq, kind: 'prompt', payload, added: new Date().toISOString() })
      st.writeQueue(ctx.root, q)
    }
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
  if (['built', 'repaired', 'fixed'].includes(verb) && g) {
    if (g.status === 'red') return `gate: red — ${redLine(g.output_tail)}`
    return `gate: green (${g.cached ? 'cached' : `ran ${g.ms}ms`})${state.commit ? ` · commit ${state.commit.slice(0, 7)}` : ''}`
  }
  if (verb === 'waiting') return `WAITING — ${state.spec} waits on ${state.waitingOn}; the lane stops here and fanout re-picks it once ${state.waitingOn} is done on trunk`
  if (verb === 'unmet' && state.lane) return pending.stopLine(ctx.root)
  if (verb === 'reviewed' && state.gate && /^git commit was rejected/.test(state.gate.output_tail || '')) return `commit: rejected — ${redLine(state.gate.output_tail.split('\n').slice(1).join('\n'))}`
  if (verb === 'reviewed' && state.review) {
    const n = state.review.findings.filter((f) => f.severity === 'blocking').length
    return n ? `review: ${n} blocking → ${state.review.verdict === 'fix' ? 'FIX' : 'ESCALATE'}` : 'review: clean'
  }
  return null
}

const main = makeDriver({ name: 'run', specArg: 'spec path', load, save, derive, steps, after: afterMark })

if (require.main === module) {
  const argv = process.argv.slice(2)
  const ip = argv.indexOf('--in-place')
  if (ip >= 0) { argv.splice(ip, 1); inPlaceFlag = true }
  const m = argv.indexOf('--mark')
  if (m >= 0 && argv[m + 1] === 'escalate' && argv[m + 2] && !argv[m + 2].startsWith('--')) argv.splice(m + 2, 0, '--choice')
  process.exitCode = main(argv)
}

module.exports = { main }
