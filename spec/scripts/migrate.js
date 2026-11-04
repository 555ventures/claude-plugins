#!/usr/bin/env node
'use strict'
// migrate.js — v7 host -> v8. node migrate.js [--root <dir>] [--apply] [--json]
// Without --apply prints the plan. Idempotent: a second --apply finds nothing to do.

const fs = require('fs')
const path = require('path')
const git = require('./lib/git')
const { readJson, writeJson, configPath, gitCommonDir } = require('./lib/state')
const { detectTestCommand } = require('./lib/host')
const { render } = require('./lib/report')
const { ensureGitignore, IGNORE } = require('./init')

const ARCH = 'docs/archive/v7'
const KEYS = ['testCommand', 'testFileCommand', 'setupCommand', 'trunk', 'lanes', 'seats', 'worktreePerSpec', 'mergeStrategy', 'walkthrough', 'prototype', 'release', 'design']
const ARCHIVE = ['.claude/spec-runs.jsonl', '.claude/spec-runs', '.claude/spec-runs.stopped.jsonl', '.claude/spec-session.json',
  '.claude/spec-preimage', '.claude/spec-manifest.json', '.claude/release-manifest.json', '.claude/rules/enforcement.json',
  '.claude/rules/conventions', '.claude/skills/run', '.claude/skills/spec-verify', 'scripts/spec-patterns.sh']
const SIDECAR = /\.(build|review|design)$/

const exists = (p) => { try { fs.lstatSync(p); return true } catch { return false } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function walk(dir, fn, depth = 0) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!fn(p, true)) walk(p, fn, depth + 1) } else fn(p, false)
  }
}

// ---- config ---------------------------------------------------------------------------------
function trimConfig(root, cfg) {
  const out = {}
  const pol = cfg.policy || {}
  const models = pol.models || {}
  const seat = (v) => (v && typeof v === 'object' ? v : v ? { model: String(v) } : null)
  const seats = { ...(cfg.seats || {}) }
  if (seat(models.workers) && !seats.builder) seats.builder = seat(models.workers)
  if (seat(models.reviewer) && !seats.reviewer) seats.reviewer = seat(models.reviewer)
  let test = cfg.testCommand || (cfg.gateCommand && !/\{\w+\}/.test(cfg.gateCommand) ? cfg.gateCommand : null) || detectTestCommand(root)
  const post = cfg.postGateCommand
  if (test && post && post !== '{testCommand}' && !test.includes(post)) test = `${test} && ${post}`
  if (test && cfg.typecheckCommand && !test.includes(cfg.typecheckCommand)) test = `${cfg.typecheckCommand} && ${test}`
  const src = { ...cfg, testCommand: test, seats: Object.keys(seats).length ? seats : undefined,
    mergeStrategy: cfg.mergeStrategy || pol.mergeStrategy, worktreePerSpec: cfg.worktreePerSpec ?? pol.worktreePerSpec,
    setupCommand: cfg.setupCommand }
  for (const k of KEYS) if (src[k] != null) out[k] = src[k]
  if (cfg.runtime && cfg.runtime.bootCommand) out.runtime = cfg.runtime
  if (cfg.capabilities && cfg.capabilities.forge) out.forge = cfg.capabilities.forge
  if (cfg.forge) out.forge = cfg.forge
  return out
}

// ---- queue ----------------------------------------------------------------------------------
function convertQueue(root, q) {
  const lost = []
  const briefFile = (n) => {
    const f = fs.existsSync(path.join(root, 'docs/roadmap')) && fs.readdirSync(path.join(root, 'docs/roadmap')).find((x) => x.startsWith(n + '-') && x.endsWith('.md'))
    return f ? 'docs/roadmap/' + f : String(n)
  }
  const items = (q.items || []).map((it) => {
    const payload = it.kind === 'brief' ? briefFile(it.brief) : it.kind === 'spec' ? it.spec : it.payload
    const kind = it.kind === 'brief' || it.kind === 'spec' ? it.kind : 'prompt'
    if (it.when && it.when.type === 'ledger') lost.push(it.id)
    const o = { id: it.id, kind: it.when && it.when.type === 'ledger' ? 'prompt' : kind, payload, added: it.added || new Date(0).toISOString() }
    if (it.ticked || it.done) o.done = true
    return o
  })
  return { queue: { version: 2, seq: q.seq || 0, items }, lost }
}

// ---- plan -----------------------------------------------------------------------------------
function section(text, re) {
  const lines = text.split('\n')
  const s = lines.findIndex((l) => re.test(l))
  if (s < 0) return ''
  let e = lines.findIndex((l, i) => i > s && /^## /.test(l))
  if (e < 0) e = lines.length
  return lines.slice(s, e).join('\n').replace(/\s+$/, '') + '\n'
}

function plan(root) {
  const ops = []
  const add = (op, p, to, note) => ops.push({ op, path: p, ...(to ? { to } : {}), ...(note ? { note } : {}) })
  const rel = (p) => path.relative(root, p)
  const common = gitCommonDir(root)
  const cfgFile = configPath(root)
  const cfg = readJson(cfgFile, null)
  const dropped = []
  if (cfg) {
    const trimmed = trimConfig(root, cfg)
    if (!same(trimmed, cfg)) {
      for (const k of Object.keys(cfg)) if (!(k in trimmed) && cfg[k] != null && !['generatedBy', 'contractHash'].includes(k)) dropped.push(k)
      add('config', '.claude/spec.config.json', null, 'trim to v8 keys')
    }
  }
  const qf = path.join(common, 'spec-queue.json')
  const q = readJson(qf, null)
  let lost = []
  if (q && q.version !== 2) { lost = convertQueue(root, q).lost; add('queue', qf, null, `${(q.items || []).length} items -> v2`) }
  // sidecars and deviations
  walk(path.join(root, 'specs'), (p, isDir) => {
    if (isDir && SIDECAR.test(p)) { add('delete', rel(p)); return true }
    if (!isDir && p.endsWith('.deviations.md')) add('archive', rel(p), path.posix.join(ARCH, 'deviations', path.relative(path.join(root, 'specs'), p).split(path.sep).join('/')))
    return false
  })
  for (const a of ARCHIVE) if (exists(path.join(root, a))) add('archive', a, path.posix.join(ARCH, a.replace(/^\.claude\//, '')))
  const pipe = path.join(root, '.claude/rules/spec-pipeline.md')
  if (exists(pipe)) {
    add('extract', '.claude/rules/spec-pipeline.md', '.claude/rules/spec-gotchas.md', 'Gotchas + Risk Tiers')
    add('archive', '.claude/rules/spec-pipeline.md', path.posix.join(ARCH, 'rules/spec-pipeline.md'))
  }
  const agents = path.join(root, '.claude/agents')
  if (exists(agents)) for (const n of fs.readdirSync(agents)) {
    const f = path.join(agents, n)
    if (n.endsWith('.md') && fs.readFileSync(f, 'utf8').includes('## Worker Contract (spec pipeline)')) add('archive', rel(f), path.posix.join(ARCH, 'agents', n))
  }
  if (exists(path.join(common, 'spec-queue-done.json'))) add('archive', path.join(common, 'spec-queue-done.json'), path.posix.join(ARCH, 'spec-queue-done.json'))
  // git dir leftovers
  const privs = [common]
  if (exists(path.join(common, 'worktrees'))) for (const n of fs.readdirSync(path.join(common, 'worktrees'))) privs.push(path.join(common, 'worktrees', n))
  for (const d of privs) for (const n of ['spec-fanout.json', 'spec-delegated', 'spec-lane-exit.json', 'spec-wave-open'])
    if (exists(path.join(d, n))) add('delete', path.join(d, n))
  if (exists(path.join(common, 'spec-run-cache'))) add('delete', path.join(common, 'spec-run-cache'))
  const refs = git.raw(['for-each-ref', '--format=%(refname)', 'refs/spec-review/'], root).stdout.split('\n').filter(Boolean)
  for (const r of refs) add('ref', r)
  // .gitignore / .gitattributes
  let ig = ''
  try { ig = fs.readFileSync(path.join(root, '.gitignore'), 'utf8') } catch { /* none */ }
  const have = new Set(ig.split('\n').map((l) => l.trim()))
  if (IGNORE.some((e) => !have.has(e))) add('gitignore', '.gitignore')
  try {
    if (/spec-runs\.jsonl merge=union/.test(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8'))) add('gitattributes', '.gitattributes')
  } catch { /* none */ }
  if (ops.some((o) => o.op !== 'gitignore') && git.raw(['rev-parse', '-q', '--verify', 'refs/tags/spec-v7-final'], root).status !== 0) ops.unshift({ op: 'tag', path: 'spec-v7-final' })
  // listed, never touched
  const listed = []
  const wt = path.join(root, '.claude/worktrees')
  if (exists(wt)) for (const n of fs.readdirSync(wt)) listed.push('worktree .claude/worktrees/' + n)
  const br = git.raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-agent-*', 'refs/heads/plan/*', 'refs/heads/fix/*'], root).stdout.split('\n').filter(Boolean)
  for (const b of br) listed.push('branch ' + b)
  const warns = []
  if (git.raw(['ls-files', '--', '.claude/settings.local.json'], root).stdout.trim()) warns.push('.claude/settings.local.json is tracked and may hold a token — run: git rm --cached .claude/settings.local.json')
  return { ops, dropped, lost, listed, warns }
}

// ---- apply ----------------------------------------------------------------------------------
function archive(root, src, dst, warns) {
  const s = path.resolve(root, src), d = path.resolve(root, dst)
  if (exists(d)) { warns.push(`not moved, destination exists: ${dst}`); return }
  fs.mkdirSync(path.dirname(d), { recursive: true })
  const tracked = git.raw(['ls-files', '--', s], root).stdout.trim()
  if (tracked && git.raw(['mv', s, d], root).status === 0) return
  fs.renameSync(s, d)
}

function apply(root, p) {
  const warns = []
  for (const o of p.ops) {
    const abs = path.resolve(root, o.path)
    if (o.op === 'tag') git.sh(['tag', 'spec-v7-final'], root)
    else if (o.op === 'config') writeJson(abs, trimConfig(root, readJson(abs, {})))
    else if (o.op === 'queue') writeJson(abs, convertQueue(root, readJson(abs, {})).queue)
    else if (o.op === 'delete') fs.rmSync(abs, { recursive: true, force: true })
    else if (o.op === 'archive') archive(root, o.path, o.to, warns)
    else if (o.op === 'extract') {
      const text = fs.readFileSync(abs, 'utf8')
      const fm = /^---\n[\s\S]*?\n---\n/.exec(text)
      const body = section(text, /^## Gotchas/) + '\n' + section(text, /^## Risk Tiers/)
      fs.writeFileSync(path.resolve(root, o.to), (fm ? fm[0] + '\n' : '') + '# Spec gotchas\n\n' + body)
    } else if (o.op === 'ref') git.raw(['update-ref', '-d', o.path], root)
    else if (o.op === 'gitignore') ensureGitignore(root)
    else if (o.op === 'gitattributes') {
      const keep = fs.readFileSync(abs, 'utf8').split('\n').filter((l) => !/spec-runs\.jsonl merge=union/.test(l)).join('\n')
      if (keep.trim()) fs.writeFileSync(abs, keep); else fs.rmSync(abs)
    }
  }
  return warns
}

function main(argv) {
  const i = argv.indexOf('--root')
  const root = i >= 0 ? path.resolve(argv[i + 1]) : process.cwd()
  const doApply = argv.includes('--apply')
  const p = plan(root)
  const applyWarns = doApply ? apply(root, p) : []
  const counts = {}
  for (const o of p.ops) counts[o.op] = (counts[o.op] || 0) + 1
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ applied: doApply, counts, ...p, warns: [...p.warns, ...applyWarns] }) + '\n'); return 0 }
  const bullets = Object.entries(counts).map(([k, n]) => `${k}: ${n}`)
  if (!doApply) bullets.push(...p.ops.map((o) => `${o.op} ${o.path}${o.to ? ' -> ' + o.to : ''}`))
  const warns = [...p.warns, ...applyWarns]
  if (p.dropped.length) warns.push('dropped config keys: ' + p.dropped.join(', '))
  if (p.lost.length) warns.push('queue items now plain prompts (ledger predicate dropped): ' + p.lost.join(', '))
  if (p.listed.length) warns.push('left in place, review them: ' + p.listed.join('; '))
  process.stdout.write(render({
    outcome: !p.ops.length ? '✅ nothing to migrate' : doApply ? `✅ migrated — ${p.ops.length} steps applied` : `plan — ${p.ops.length} steps, nothing changed`,
    bullets, warns, next: doApply || !p.ops.length ? '/spec:doctor' : 'node migrate.js --apply',
  }))
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
module.exports = { plan, trimConfig, convertQueue }
