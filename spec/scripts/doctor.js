#!/usr/bin/env node
'use strict'
// doctor.js — health check of the host. node doctor.js [--root <dir>] [--json]
// Exit 0 clean, 1 with findings.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { readJson, readSpec, configPath, readFanout, readConfig, protoV7, protoDir } = require('./lib/state')
const { run, cacheDir, worktreeIncluded } = require('./lib/host')
const { derive } = require('./lib/next')
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

// Probe cap: SPEC_DOCTOR_PROBE_MS wins, then config doctorProbeMs, then 10 min (real gates take
// minutes cold; a short cap reported healthy repos as "not proven healthy").
function probeCap(cfg) {
  const env = Number(process.env.SPEC_DOCTOR_PROBE_MS)
  if (env > 0) return env
  const c = cfg && Number(cfg.doctorProbeMs)
  return c > 0 ? c : 600000
}

// Free space and filesystem of the one holding `p` (df -Pk); null when df is unavailable.
function dfOf(p) {
  const r = spawnSync('df', ['-Pk', p], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  const f = (r.stdout || '').trim().split('\n').pop().trim().split(/\s+/)
  const kb = Number(f[3])
  return f.length >= 4 && Number.isFinite(kb) ? { fs: f[0], bytes: kb * 1024 } : null
}

const GB = 1024 ** 3
const human = (bytes) => bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
const freeOf = (d) => (d ? human(d.bytes) : '?')

// The newest cached green run's recorded time (ms), or null when no entry carries one.
function cachedGateMs(root) {
  let best = null
  try {
    const dir = cacheDir(root)
    for (const n of fs.readdirSync(dir)) {
      if (!n.endsWith('.json')) continue
      const e = readJson(path.join(dir, n), null)
      if (e && Number(e.ms) > 0 && (!best || String(e.ts) > String(best.ts))) best = e
    }
  } catch { /* no cache yet */ }
  return best ? Number(best.ms) : null
}

// Facts about the machine, as info lines (advice, never findings).
function boxInfo(root, cfg, probedMs) {
  const cores = os.cpus().length
  const lanes = readConfig(root).lanes
  const measured = probedMs != null
  const ms = measured ? probedMs : cachedGateMs(root)
  const tmp = process.env.TMPDIR || os.tmpdir()
  const wtDir = path.join(root, '.claude', 'worktrees')
  const tmpDf = dfOf(tmp)
  const wtDf = dfOf(fs.existsSync(wtDir) ? wtDir : root)
  const out = [`box: ${cores} cores${ms != null ? ` · gate ${(ms / 1000).toFixed(0)}s (${measured ? 'measured' : 'cached'})` : ''} · TMPDIR ${tmp} ${freeOf(tmpDf)} free · worktrees on ${wtDf ? wtDf.fs : '?'} ${freeOf(wtDf)} free`]
  const half = Math.floor(cores / 2)
  if (lanes > half) out.push(`⚠️ lanes ${lanes} > cores/2 (${cores}) — set "lanes": ${Math.max(1, half)} or "gateConcurrency": 1 in .claude/spec.config.json`)
  if (ms != null && ms > 120000) out.push(`⚠️ gate took ${(ms / 1000).toFixed(0)}s (over 2 min) — set "gateConcurrency": 1, or lower lanes`)
  if (tmpDf && tmpDf.bytes < 2 * GB) out.push(`⚠️ TMPDIR has ${human(tmpDf.bytes)} free (under 2 GB) — export TMPDIR=<path on the worktrees' filesystem> before /spec:fanout`)
  return out
}

// probe:false skips the testCommand run (status counts hygiene findings and must stay fast).
function check(root, { probe = true } = {}) {
  const f = []; const info = [] // info: runs in flight, printed but not a finding
  let cfg = null
  if (!fs.existsSync(configPath(root))) f.push('config: .claude/spec.config.json is missing — run /spec:init')
  else {
    cfg = readJson(configPath(root), null)
    if (!cfg || typeof cfg !== 'object') f.push('config: .claude/spec.config.json does not parse')
    else if (!cfg.testCommand) f.push('config: testCommand is not set — run /spec:init')
  }
  let probedMs = null
  if (probe && cfg && cfg.testCommand) {
    const cap = probeCap(cfg)
    process.stderr.write(`running testCommand: ${cfg.testCommand} …\n`)
    const t0 = Date.now()
    const r = run(cfg.testCommand, { cwd: root, timeoutMs: cap })
    probedMs = Date.now() - t0
    process.stderr.write(`testCommand finished in ${(probedMs / 1000).toFixed(1)}s\n`)
    if (r.status === 124) f.push(`testCommand: timed out after ${cap / 1000}s — not proven healthy: ${cfg.testCommand} (raise the cap with doctorProbeMs in .claude/spec.config.json, or SPEC_DOCTOR_PROBE_MS)`)
    else if (r.status === 127) f.push(`testCommand: command not found (exit 127): ${cfg.testCommand}`)
    else if (r.status !== 0) { const ls = (r.tail || '').split('\n').filter((l) => l.trim()); f.push(`testCommand: exited ${r.status} — the suite is not green: ${ls.find((l) => /✖|not ok|^\s*FAIL\b/.test(l)) || ls.pop() || ''}`) }
  }
  if (cfg && typeof cfg === 'object') {
    const named = [...(Array.isArray(cfg.laneFiles) ? cfg.laneFiles : []), ...worktreeIncluded(root)]
    for (const env of ['.env', '.env.local']) {
      if (fs.existsSync(path.join(root, env)) && git.raw(['ls-files', '--error-unmatch', '--', env], root).status !== 0 && !named.includes(env)) {
        f.push(`laneFiles: the root has ${env} that lanes will not see — add "laneFiles": ["${env}"] to .claude/spec.config.json`)
      }
    }
  }
  for (const e of IGNORE) if (git.raw(['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', e.replace('**/*', 'x/y') + (e.endsWith('/') ? 'z' : '')], root).status === 1) f.push(`gitignore: missing ${e} — run ${cfg && cfg.generatedBy ? '/spec:migrate' : '/spec:init'}`)
  // The roadmap derivation status prints: hygiene anomalies are findings, decide ones are the user's call.
  for (const a of derive(root).anomalies) (a.audience === 'hygiene' ? f : info).push(`roadmap: [${a.kind}] ${a.detail}`)
  const ENDED = ['DONE', 'PARKED', 'AMENDED']
  const specStatus = (p) => { try { return readSpec(p).frontmatter.status } catch { return null } }
  const used = new Set() // worktrees a live run points at
  const fan = readFanout(root)
  if (fan && fan.step && fan.step !== 'PLAN') { info.push(`in flight: fan-out at ${fan.step} — /spec:fanout`); for (const l of fan.batch || []) if (l.worktree) used.add(path.resolve(root, l.worktree)) }
  for (const d of walkRuns(path.join(root, 'specs'), [])) {
    const run = readJson(path.join(d, 'state.json'), null); const rel = path.relative(root, d)
    if (run && run.step && !ENDED.includes(run.step) && !run.ended) {
      info.push(`in flight: ${rel.replace(/\.run$/, '.md')} at ${run.step} — ${fan ? '/spec:fanout' : `/spec:run ${rel.replace(/\.run$/, '.md')}`}`)
      if (run.worktree) used.add(path.resolve(root, run.worktree))
    } else if (run && run.step === 'AMENDED' && ['draft', 'hardened'].includes(specStatus(d.replace(/\.run$/, '.md')))) {
      // An amended run keeps its .run/ on purpose, until its spec lands or is gone.
      info.push(`amended: ${rel.replace(/\.run$/, '.md')} — ${rel} keeps the run's evidence; the next /spec:run starts over and keeps it`)
    } else f.push(`stale sidecar: ${rel} — rm -r ${rel}`)
  }
  const wt = path.join(root, '.claude', 'worktrees')
  // Prototypes: a v7 record names the migration; a proto-<stem> worktree is in flight until its record says closed.
  const stems = (() => { try { return fs.readdirSync(path.join(root, 'design', 'prototypes'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) } catch { return [] } })()
  for (const stem of stems) if (protoV7(root, stem).length) f.push(`prototype ${stem} is a v7 record — /spec:migrate`)
  const live = (p) => used.has(p) || (fs.existsSync(path.join(p, '.git')) && (pending.isLane(p) || git.raw(['status', '--porcelain'], p).stdout.trim() !== ''))
  try {
    for (const n of fs.readdirSync(wt)) {
      const p = path.join(wt, n)
      const proto = /^proto-(.+)$/.exec(n)
      if (proto) {
        const stem = proto[1]
        if (protoV7(root, stem).length) continue // named above
        const rec = readJson(path.join(protoDir(root, stem), 'status.json'), null)
        if (rec && rec.marks && !rec.marks.closed) info.push(`in flight: prototype ${stem} — /spec:prototype ${stem}`)
        else f.push(`leftover worktree: .claude/worktrees/${n} — git worktree remove --force .claude/worktrees/${n}`)
        continue
      }
      if (live(p)) info.push(`in flight: .claude/worktrees/${n} (a run in flight, a lane marker or uncommitted work) — leave it to ${fan ? '/spec:fanout' : 'its run'}`)
      else f.push(`leftover worktree: .claude/worktrees/${n} — git worktree remove .claude/worktrees/${n}`)
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
  info.push(...boxInfo(root, cfg, probedMs))
  const plugin = readJson(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), {}) || {}
  return { findings: f, info, version: plugin.version || null }
}

function main(argv) {
  const i = argv.indexOf('--root')
  const root = i >= 0 ? path.resolve(argv[i + 1]) : git.repoRoot(process.cwd())
  const { findings, info, version } = check(root)
  if (argv.includes('--json')) process.stdout.write(JSON.stringify({ ok: !findings.length, version, findings, info }) + '\n')
  else process.stdout.write([...info.map((x) => '· ' + x), ...findings.map((x) => '- ' + x)].join('\n') + (findings.length ? `\n${findings.length} finding(s)\n` : `${info.length ? '\n' : ''}✅ healthy — spec ${version || ''}\n`))
  return findings.length ? 1 : 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
module.exports = { check, probeCap }
