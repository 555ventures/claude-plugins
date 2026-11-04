#!/usr/bin/env node
'use strict'
// run.js — /spec:run: carry one hardened spec OPEN → BUILD → GATE → REPAIR|REVIEW → FIX|COMMIT →
// MERGE (CONFLICTS) → DONE (architecture §4). The session dispatches agents; the driver gates,
// commits and merges.
//
// node run.js <spec> [--in-place] [--root <dir>] [--state] [--json] [--mark <verb>]
// Marks: built · repaired · reviewed --file <json> · fixed · escalate <retry|park|amend> ·
// conflicts-resolved. Exit 0 ok · 1 error · 2 refusal.

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
const CHOICES = ['retry', 'park', 'amend']
const SEVERITIES = ['blocking', 'advisory']
// Only while a builder or reviewer is out is the checkout marked for block-worker-git.sh.
const AGENT_STEPS = ['BUILD', 'REPAIR', 'FIX', 'REVIEW']
let inPlaceFlag = false

// ---- paths ---------------------------------------------------------------------------------

function specInfo(ctx) {
  const abs = path.resolve(ctx.root, ctx.arg.replace(/^@/, ''))
  const rel = path.relative(ctx.root, abs)
  if (rel.startsWith('..') || !fs.existsSync(abs)) refuse(`no spec at ${abs} — pass a spec path inside ${ctx.root}`)
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

function go(state, step, extra = {}) {
  state.history = [...(state.history || []), { step, at: new Date().toISOString() }]
  return Object.assign(state, extra, { step })
}

function load(ctx) {
  const s = specInfo(ctx)
  const ig = git.raw(['check-ignore', '-q', path.relative(ctx.root, st.runPath(s.abs))], ctx.root)
  if (ig.status !== 0) refuse(`${path.relative(ctx.root, st.runDir(s.abs))}/ is not git-ignored — add the line \`specs/**/*.run/\` to .gitignore, then re-run`)
  return st.readRun(s.abs) || { step: 'OPEN', spec: s.rel }
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
  if (status === 'done') refuse(`${s.rel} is already done — nothing to run`)
  if (!cfg.testCommand) refuse('no testCommand in .claude/spec.config.json — run /spec:init')
  const specBranch = `spec/${s.stem}`
  const cur = git.currentBranch(ctx.root)
  const lane = pending.isFanoutLane(ctx.root)
  const why = lane ? 'fanout lane — this session sits in the lane worktree'
    : inPlaceFlag ? '--in-place'
    : cfg.worktreePerSpec === false ? 'host policy worktreePerSpec: false'
      : cur === specBranch ? "this session already sits on the spec's branch" : null
  let wt = ctx.root
  let fresh = lane
  if (!why) {
    const rel = path.join('.claude', 'worktrees', 'spec-' + s.stem)
    fresh = !fs.existsSync(path.join(ctx.root, rel))
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
  }
  st.writeStatus(s.abs, 'implementing')
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

function gateStep(state, ctx) {
  const cfg = cfgOf(ctx)
  const wt = wtOf(state, ctx)
  const g = host.gate(wt, cfg)
  const red = g.status !== 0
  const tail = red && cfg.testFileCommand ? g.tail + '\n' + redCheck(state, wt) : g.tail
  state.gate = { status: red ? 'red' : 'green', runId: g.runId, cached: g.cached, output_tail: tail }
  if (red) return state.attempts.repair >= REPAIR_CAP ? go(state, 'ESCALATE', { why: 'gate' }) : go(state, 'REPAIR')
  st.writeText(runFile(ctx, 'diff.patch'), git.diff(state.base, wt) + '\n')
  fs.rmSync(runFile(ctx, 'findings.json'), { force: true }) // never re-read an earlier round's findings
  return go(state, 'REVIEW')
}

function commit(state, ctx) {
  const spec = st.readSpec(specIn(state, ctx))
  if (state.inPlace && !state.lane) st.writeStatus(specIn(state, ctx), 'done')
  const wt = wtOf(state, ctx)
  // A re-run after a crash between the commit and the save finds a clean tree: report that commit.
  state.commit = git.commitAll(wt, `build(${specInfo(ctx).id}): ${spec.title}`) || (git.headSha(wt) !== state.base ? git.headSha(wt) : null)
  // A lane stops here, committed: fanout writes done, merges in queue order and cleans up.
  if (state.lane) return go(state, 'MERGE_READY', { report: render({ outcome: `✅ ${specInfo(ctx).id} built and reviewed — merge-ready on ${state.branch}`, bullets: `commit ${state.commit || 'none (nothing changed)'}`, next: 'nothing needs you — fanout merges the lane' }) })
  return go(state, 'MERGE')
}

// The root copy of the spec carries only our status write; drop it so the merge can bring the
// branch copy in (mergeBack refuses a dirty root, and an untracked copy would block the merge).
function releaseRootSpec(state, main) {
  const p = path.join(main, state.spec)
  const cur = st.readText(p)
  const theirs = git.raw(['show', `${state.branch}:${state.spec.split(path.sep).join('/')}`], main)
  const norm = (t) => t.replace(/\r\n/g, '\n').replace(/^status:.*$/m, 'status:')
  if (cur == null || theirs.status !== 0 || norm(cur) !== norm(theirs.stdout)) return
  if (git.raw(['ls-files', '--error-unmatch', '--', state.spec], main).status === 0) git.sh(['checkout', 'HEAD', '--', state.spec], main)
  else fs.rmSync(p)
}

function merge(state, ctx) {
  const cfg = cfgOf(ctx)
  if (state.branch === cfg.trunk) return go(state, 'FINISH') // in place on trunk: nothing to merge
  const main = mainRoot(ctx.root)
  const on = git.currentBranch(main)
  if (on !== cfg.trunk) refuse(`${main} is on ${on}, not ${cfg.trunk} — check out ${cfg.trunk} there, then re-run`)
  releaseRootSpec(state, main)
  const title = st.readSpec(specIn(state, ctx)).title
  const r = git.mergeBack(main, state.branch, cfg.mergeStrategy, { message: `merge(${specInfo(ctx).id}): ${title}` })
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
  if (!state.inPlace) git.worktreeRemove(ctx.root, wt, { deleteBranch: state.mergeSha ? state.branch : undefined })
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
    warns: findings.filter((f) => f.severity !== 'blocking').map((f) => `advisory: ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.summary || ''}`),
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
    '## Intent', sectionText(spec, 'Intent'), '',
    '## File Plan', ...spec.filePlan.map((r) => `- ${r.action} ${r.path} — ${r.summary}`), '',
  ]
  if (kind === 'repair') out.push('The gate is red. Repair the code (never weaken a test). Failure tail:', '```', state.gate.output_tail, '```', '')
  if (kind === 'fix') {
    out.push('The reviewer found blocking issues. Fix each one:')
    for (const f of state.review.findings.filter((x) => x.severity === 'blocking')) out.push(`- ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.summary || ''}${f.evidence ? ` (evidence: ${f.evidence})` : ''}`)
    out.push('')
  }
  out.push(`Write failing tests first, then code, and run \`${cfg.testCommand}\` until green.`,
    'Do not touch files outside the File Plan without listing them in your final summary.')
  return out.join('\n')
}

// The builder may list these in its summary; the reviewer decides whether they block.
function outsidePlan(state, ctx, spec) {
  const planned = new Set(spec.filePlan.map((r) => r.path))
  const own = state.spec.split(path.sep).join('/')
  const run = own.replace(/\.md$/, '.run/')
  return git.changedFiles(state.base, wtOf(state, ctx)).filter((f) => !planned.has(f) && f !== own && !f.startsWith(run))
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
    `Files changed outside the File Plan: ${outsidePlan(state, ctx, spec).join(', ') || 'none'}`,
    '',
    '## Intent', sectionText(spec, 'Intent'), '',
    '## Acceptance Criteria', ...spec.acs.map((a) => `- ${a.id}: ${a.text}`),
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

function escalateBody(state, ctx) {
  const id = specInfo(ctx).id
  const q = state.why === 'gate' ? `${id} is still red after ${REPAIR_CAP} repairs. How should it continue?`
    : `${id} still has blocking review findings after ${FIX_CAP} fix round. How should it continue?`
  const detail = state.why === 'gate' ? state.gate.output_tail
    : state.review.findings.filter((f) => f.severity === 'blocking').map((f) => `- ${f.file || ''} ${f.summary || ''}`).join('\n')
  return ask(state, ctx, q, [
    { label: 'retry', description: 're-run the builder on Opus with fresh attempts' },
    { label: 'park', description: 'queue a /spec:fix item and set the spec back to hardened' },
    { label: 'amend', description: 'set the spec to draft so you can amend it with /spec:plan' },
  ]) + '\n\n```\n' + detail + '\n```'
}

function derive(state, ctx) {
  switch (state.step) {
    case 'OPEN': return { name: 'OPEN', auto: open }
    case 'BUILD': return { name: 'BUILD', body: builderBrief(state, ctx, 'build'), mark: 'built' }
    case 'GATE': return { name: 'GATE', auto: gateStep }
    case 'REPAIR': return { name: 'REPAIR', body: builderBrief(state, ctx, 'repair'), mark: 'repaired' }
    case 'REVIEW': return { name: 'REVIEW', body: reviewerBrief(state, ctx), mark: `reviewed --file ${shq(runFile(ctx, 'findings.json'))}` }
    case 'FIX': return { name: 'FIX', body: builderBrief(state, ctx, 'fix'), mark: 'fixed' }
    case 'ESCALATE': {
      // A lane re-dispatched after fanout recorded the answer continues with it.
      const doc = state.lane && pending.readPending(ctx.root)
      if (doc && doc.answer) return { name: 'ESCALATE', auto: (s) => steps.escalate(s, { choice: doc.answer.label }, ctx) }
      return { name: 'ESCALATE', body: escalateBody(state, ctx), mark: 'escalate <retry|park|amend>' }
    }
    case 'COMMIT': return { name: 'COMMIT', auto: commit }
    case 'MERGE': return { name: 'MERGE', auto: merge }
    case 'TRUNK_GATE': return { name: 'TRUNK_GATE', auto: trunkGate }
    case 'FINISH': return { name: 'FINISH', auto: finish }
    case 'CONFLICTS': return {
      name: 'CONFLICTS', mark: 'conflicts-resolved',
      body: ask(state, ctx, `merging ${state.branch} into ${cfgOf(ctx).trunk} conflicts in ${state.conflicts.join(', ')}. Resolve them?`, [
        { label: 'resolve', description: `resolve each file by both sides' intent in ${mainRoot(ctx.root)}, leave it uncommitted, then mark conflicts-resolved` },
        { label: 'abort', description: 'run git merge --abort there and stop this run' },
      ]),
    }
    default: return { name: state.step, body: state.report || '' }
  }
}

// ---- marks -----------------------------------------------------------------------------------

function endRun(state, ctx, status, outcome, extra = {}) {
  const s = specInfo(ctx)
  st.writeStatus(s.abs, status)
  if (state.marked) pending.unmarkLane(wtOf(state, ctx))
  const report = render({ outcome, artifacts: s.rel, ...extra })
  return go(state, status === 'draft' ? 'AMENDED' : 'PARKED', { ended: !state.lane, report })
}

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
  escalate(state, flags, ctx) {
    const c = flags.choice
    if (!CHOICES.includes(c)) refuse(`escalate needs one of ${CHOICES.join(' | ')}, e.g. --mark escalate retry`)
    if (state.lane) pending.consumePending(ctx.root)
    if (c === 'retry') return go(state, state.why === 'review' ? 'FIX' : 'REPAIR', { attempts: { repair: 0, fix: 0 }, opus: true })
    const s = specInfo(ctx)
    if (c === 'amend') return endRun(state, ctx, 'draft', `⏸️ ${s.id} set back to draft for amending`, { next: `/spec:plan ${s.rel}` })
    const first = state.why === 'gate' ? (state.gate.output_tail || '').split('\n').find((l) => l.trim()) || 'gate red'
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
    if (inMerge || staged) git.sh(['commit', '-q', '-m', `merge(${specInfo(ctx).id}): ${st.readSpec(specIn(state, ctx)).title}`], main)
    else if (cfgOf(ctx).mergeStrategy !== 'squash' && git.raw(['merge-base', '--is-ancestor', state.branch, 'HEAD'], main).status !== 0) refuse(`no merge of ${state.branch} is in progress in ${main} and it is not merged (aborted?) — merge it there, then re-mark`)
    return go(state, 'TRUNK_GATE', { mergeSha: git.headSha(main) })
  },
}

const main = makeDriver({ name: 'run', specArg: 'spec path', load, save, derive, steps })

if (require.main === module) {
  const argv = process.argv.slice(2)
  const ip = argv.indexOf('--in-place')
  if (ip >= 0) { argv.splice(ip, 1); inPlaceFlag = true }
  const m = argv.indexOf('--mark')
  if (m >= 0 && argv[m + 1] === 'escalate' && argv[m + 2] && !argv[m + 2].startsWith('--')) argv.splice(m + 2, 0, '--choice')
  process.exitCode = main(argv)
}

module.exports = { main }
