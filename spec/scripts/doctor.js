#!/usr/bin/env node
'use strict'
// doctor.js — health check of the host. node doctor.js [--root <dir>] [--json]
// Exit 0 clean, 1 with findings.

const fs = require('fs')
const path = require('path')
const { readJson, configPath } = require('./lib/state')
const { run } = require('./lib/host')
const git = require('./lib/git')
const pending = require('./lib/pending')
const { IGNORE } = require('./init')

function walkRuns(dir, out, depth = 0) {
  if (depth > 3) return out
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    if (!e.isDirectory()) continue
    const p = path.join(dir, e.name)
    if (e.name.endsWith('.run')) out.push(p)
    else walkRuns(p, out, depth + 1)
  }
  return out
}

function check(root) {
  const f = []
  let cfg = null
  if (!fs.existsSync(configPath(root))) f.push('config: .claude/spec.config.json is missing — run /spec:init')
  else {
    cfg = readJson(configPath(root), null)
    if (!cfg || typeof cfg !== 'object') f.push('config: .claude/spec.config.json does not parse')
    else if (!cfg.testCommand) f.push('config: testCommand is not set — run /spec:init')
  }
  if (cfg && cfg.testCommand) {
    const cap = Number(process.env.SPEC_DOCTOR_PROBE_MS) || 120000
    process.stderr.write(`running testCommand: ${cfg.testCommand} …\n`)
    const t0 = Date.now()
    const r = run(cfg.testCommand, { cwd: root, timeoutMs: cap })
    process.stderr.write(`testCommand finished in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)
    if (r.status === 124) f.push(`testCommand: timed out after ${cap / 1000}s — not proven healthy: ${cfg.testCommand}`)
    else if (r.status === 127) f.push(`testCommand: command not found (exit 127): ${cfg.testCommand}`)
    else if (r.status !== 0) f.push(`testCommand: exited ${r.status} — the suite is not green: ${(r.tail || '').trim().split('\n').pop()}`)
  }
  let ig = ''
  try { ig = fs.readFileSync(path.join(root, '.gitignore'), 'utf8') } catch { /* none */ }
  const have = new Set(ig.split('\n').map((l) => l.trim()))
  for (const e of IGNORE) if (!have.has(e)) f.push(`gitignore: missing ${e}`)
  const ENDED = ['DONE', 'PARKED', 'AMENDED']
  const used = new Set() // worktrees a live run points at
  for (const d of walkRuns(path.join(root, 'specs'), [])) {
    const run = readJson(path.join(d, 'state.json'), null); const rel = path.relative(root, d)
    if (run && run.step && !ENDED.includes(run.step) && !run.ended) {
      f.push(`in flight: ${rel.replace(/\.run$/, '.md')} at ${run.step} — /spec:run ${rel.replace(/\.run$/, '.md')}`)
      if (run.worktree) used.add(path.resolve(root, run.worktree))
    } else f.push(`stale sidecar: ${rel} — rm -r ${rel}`)
  }
  const wt = path.join(root, '.claude', 'worktrees')
  const live = (p) => used.has(p) || (fs.existsSync(path.join(p, '.git')) && (pending.isLane(p) || git.raw(['status', '--porcelain'], p).stdout.trim() !== ''))
  try {
    for (const n of fs.readdirSync(wt)) {
      const p = path.join(wt, n)
      f.push(live(p) ? `in flight: .claude/worktrees/${n} (a run in flight, a lane marker or uncommitted work) — leave it to its run` : `leftover worktree: .claude/worktrees/${n} — git worktree remove .claude/worktrees/${n}`)
    }
  } catch { /* none */ }
  for (const base of [root, ...(fs.existsSync(wt) ? fs.readdirSync(wt).map((n) => path.join(wt, n)) : [])]) {
    if (fs.existsSync(path.join(base, '.claude', 'pending-question.json'))) f.push(`pending question: ${path.relative(root, path.join(base, '.claude', 'pending-question.json')) || '.claude/pending-question.json'}`)
  }
  if (git.raw(['ls-files', '--', '.claude/settings.local.json'], root).stdout.trim()) f.push('token file is tracked — run: git rm --cached .claude/settings.local.json')
  if (fs.existsSync(path.join(root, 'docs/archive/v7'))) {
    const tracked = git.raw(['ls-files', '--', 'docs/archive/v7'], root).stdout.trim()
    const pending = git.raw(['status', '--porcelain', '--', 'docs/archive/v7'], root).stdout.trim()
    if (!tracked || pending) f.push('uncommitted migration: docs/archive/v7/ is untracked or staged — commit it (git add -A && git commit -m "chore(spec): migrate v7 → v8")')
  }
  const plugin = readJson(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), {}) || {}
  return { findings: f, version: plugin.version || null }
}

function main(argv) {
  const i = argv.indexOf('--root')
  const root = i >= 0 ? path.resolve(argv[i + 1]) : git.repoRoot(process.cwd())
  const { findings, version } = check(root)
  if (argv.includes('--json')) process.stdout.write(JSON.stringify({ ok: !findings.length, version, findings }) + '\n')
  else process.stdout.write(findings.length ? findings.map((x) => '- ' + x).join('\n') + `\n${findings.length} finding(s)\n` : `✅ healthy — spec ${version || ''}\n`)
  return findings.length ? 1 : 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
module.exports = { check }
