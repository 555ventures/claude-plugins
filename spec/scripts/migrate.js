#!/usr/bin/env node
'use strict'
// migrate.js — v7 host -> v8, and the queue file to its current version (3). node migrate.js [--root <dir>] [--apply] [--json]
// Without --apply prints the plan. Idempotent: a second --apply finds nothing to do. The only converter of
// the queue file: lib/queue.js reads version 3 strictly, so text is parsed here, once, and never on read.

const fs = require('fs')
const path = require('path')
const git = require('./lib/git')
const { readJson, writeJson, configPath, gitCommonDir, protoV7, DEFAULTS } = require('./lib/state')
const { parse, VERSION } = require('./lib/queue')
const { normBrief } = require('./lib/work')
const { detectTestCommand, resolveUrl } = require('./lib/host')
const { render } = require('./lib/report')
const { ensureGitignore, IGNORE } = require('./init')

const ARCH = 'docs/archive/v7'
const KEYS = ['testCommand', 'testFileCommand', 'setupCommand', 'trunk', 'lanes', 'seats', 'worktreePerSpec', 'mergeStrategy', 'walkthrough', 'prototype', 'release', 'design',
  'gateConcurrency', 'doctorProbeMs', 'testCountPattern'] // the last three are v8's own: a v8 re-run keeps them
const MERGE = ['merge-commit', 'ff-only', 'squash'] // v7's `derived` and `rebase-ff` have no v8 meaning: git.mergeBack throws on them
const V7_CONFIG = ['generatedBy', 'contractHash', 'policy', 'gateCommand'] // config keys only v7 wrote: trimConfig drops them, so they mark a host not yet migrated
const ARCHIVE = ['.claude/spec-runs.jsonl', '.claude/spec-runs', '.claude/spec-runs.stopped.jsonl', '.claude/spec-session.json',
  '.claude/spec-preimage', '.claude/spec-manifest.json', '.claude/release-manifest.json', '.claude/rules/enforcement.json',
  'scripts/spec-patterns.sh'] // .claude/rules/conventions is repo-owned (tests and lint messages read it): never archived
const SKILLS = ['run', 'spec-verify']
const LABEL = { ref: 'git-dir refs/spec-review/* (v7 review bookkeeping, deleted)' }
const TYPES = ['plan', 'prototype', 'fix', 'decide']
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
  // v8's testCommand is the whole gate. A v7 gateCommand without {placeholders} already is one
  // (typecheck, lint, build, tests); a thin testCommand beside it would silently drop those. v7
  // appended {testDirs} / {scopeDirs} / {testFiles} to the gate as paths, so removing them leaves the
  // unscoped gate. A v7 typecheckCommand is often per-file (needs an argument), so it is prepended
  // only to a plain test command, never to a chosen gate.
  const gate = typeof cfg.gateCommand === 'string' ? cfg.gateCommand.replace(/\s*\{(testDirs|scopeDirs|testFiles)\}/g, '').trim() || null : null
  let test = gate || cfg.testCommand || detectTestCommand(root)
  const post = cfg.postGateCommand
  if (test && post && post !== '{testCommand}' && !test.includes(post)) test = `${test} && ${post}`
  if (!gate && test && cfg.typecheckCommand && !test.includes(cfg.typecheckCommand)) test = `${cfg.typecheckCommand} && ${test}`
  // v7 kept the release test-count pattern under capabilities; v8 reads it under release (optional).
  const tcp = cfg.capabilities && cfg.capabilities.testCountPattern
  const rel = cfg.release && typeof cfg.release === 'object' && !Array.isArray(cfg.release) ? cfg.release : {}
  const merge = [cfg.mergeStrategy, pol.mergeStrategy].find((m) => MERGE.includes(m))
  const src = { ...cfg, testCommand: test, seats: Object.keys(seats).length ? seats : undefined,
    release: tcp != null ? { ...rel, testCountPattern: tcp } : cfg.release,
    mergeStrategy: merge, worktreePerSpec: cfg.worktreePerSpec ?? pol.worktreePerSpec,
    setupCommand: cfg.setupCommand }
  for (const k of KEYS) if (src[k] != null) out[k] = src[k]
  if (out.prototype && typeof out.prototype === 'object') out.prototype = trimPrototype(out.prototype, cfg.runtime)
  if (cfg.runtime && cfg.runtime.bootCommand) out.runtime = cfg.runtime
  if (cfg.capabilities && cfg.capabilities.forge) out.forge = cfg.capabilities.forge
  if (cfg.forge) out.forge = cfg.forge
  return out
}

// The v8 prototype block: overlay, e2eList, dbCreate and dbDestroy are gone, e2eRun is e2eCommand, and the
// host's runtime boot command fills a missing bootCommand.
function trimPrototype(proto, runtime) {
  const { overlay, e2eList, dbCreate, dbDestroy, e2eRun, ...rest } = proto
  const out = { ...rest }
  if (e2eRun !== undefined && out.e2eCommand === undefined) out.e2eCommand = e2eRun
  if (out.bootCommand === undefined && runtime && runtime.bootCommand) out.bootCommand = runtime.bootCommand
  return out
}

// ---- prototype records (v7 → v8) -----------------------------------------------------------------
const sentenceOf = (p) => `On ${p.route}${p.given ? `, given ${p.given}` : ''}: ${String(p.note).trim()}`
const isV7Doc = (o) => o && typeof o === 'object' && !Array.isArray(o) && 'schemaVersion' in o

// One record's three files, rewritten in place. Files the folder holds besides them are left alone.
function migrateProto(root, rel, urlTemplate) {
  const dir = path.resolve(root, rel)
  const stem = path.basename(dir)
  const file = (n) => path.join(dir, n + '.json')
  const status = readJson(file('status'), null)
  const pinsDoc = readJson(file('pins'), null)
  const contract = readJson(file('contract'), null)
  const pins = pinsDoc == null ? null : Array.isArray(pinsDoc) ? pinsDoc
    : (pinsDoc.pins || []).map((p) => ({
      id: p.id, kind: p.kind, route: p.screen, ...(p.state && p.state !== 'default' ? { given: p.state } : {}), note: p.note, round: p.round, status: 'active', at: p.at,
    }))
  const rounds = status && (Array.isArray(status.rounds) ? status.rounds.length : status.rounds) || 0
  if (isV7Doc(status)) {
    const input = status.input || {}
    const port = status.appPort == null ? null : status.appPort
    const url = port != null ? resolveUrl(urlTemplate, port) : /\{port\}/.test(urlTemplate) ? null : urlTemplate
    const marks = {}
    for (const m of ['opened', 'approved', 'contracted', 'closed']) if (status.marks && status.marks[m]) marks[m] = status.marks[m]
    writeJson(file('status'), {
      stem: status.stem || stem, brief: input.brief || null, idea: input.idea || null, branch: status.branch, worktree: status.worktree,
      appPort: port, url, rounds, marks, handled: (pins || []).map((p) => p.id),
    })
  }
  if (pins !== null && !Array.isArray(pinsDoc)) writeJson(file('pins'), pins)
  if (isV7Doc(contract)) {
    writeJson(file('contract'), {
      stem: contract.stem || stem, rounds,
      pins: (contract.pins || []).map((p) => {
        const q = { id: p.id, kind: p.kind, route: p.screen, ...(p.state && p.state !== 'default' ? { given: p.state } : {}), note: p.note }
        return { ...q, sentence: sentenceOf(q), round: p.round, status: 'active' }
      }),
    })
  }
}

// ---- queue ----------------------------------------------------------------------------------
function isoAdded(v) {
  let t = NaN
  if (typeof v === 'number') t = v < 1e11 ? v * 1000 : v
  else if (typeof v === 'string' && /^\d+$/.test(v.trim())) { const n = Number(v); t = n < 1e11 ? n * 1000 : n }
  else if (typeof v === 'string') t = Date.parse(v)
  return new Date(Number.isFinite(t) && t > 0 ? t : Date.now()).toISOString()
}

// A v7 item's `after` as v8 stores it: {brief} normalised, {spec} as written; null when it names neither.
function afterOf(a) {
  if (a && a.brief != null && String(a.brief).trim()) return { brief: normBrief(a.brief) }
  if (a && typeof a.spec === 'string' && a.spec) return { spec: a.spec }
  return null
}

// Every stored shape (versions 1 and 2, and the mixed files real repos hold) to version 3: `lane` is `type`,
// `ticked` is `done`, a spec item keeps the `payload` it already carries, a prompt goes through `parse`.
function convertQueue(root, q) {
  const lost = []
  const briefFile = (n) => {
    const f = fs.existsSync(path.join(root, 'docs/roadmap')) && fs.readdirSync(path.join(root, 'docs/roadmap')).find((x) => x.startsWith(n + '-') && x.endsWith('.md'))
    return f ? 'docs/roadmap/' + f : String(n)
  }
  const items = (q.items || []).map((it) => {
    const payload = it.payload ?? (it.kind === 'brief' ? briefFile(it.brief) : it.spec ?? '')
    const ledger = it.when && it.when.type === 'ledger'
    if (ledger) lost.push(it.id)
    const kind = !ledger && (it.kind === 'brief' || it.kind === 'spec') ? it.kind : 'prompt'
    const type = [it.type, it.lane].find((t) => TYPES.includes(t))
    const body = kind === 'prompt' ? parse(payload, type) : { payload }
    const o = { id: it.id, kind, ...(body.type ? { type: body.type } : {}), ...(body.spec ? { spec: body.spec } : {}), payload: body.payload }
    o.added = it.added === undefined && kind === 'brief' ? undefined : isoAdded(it.added)
    if (it.ticked || it.done) o.done = typeof it.done === 'string' && Number.isFinite(Date.parse(it.done)) ? it.done : new Date().toISOString()
    const after = afterOf(it.after)
    if (after) o.after = after
    return o
  })
  return { queue: { version: VERSION, seq: q.seq || 0, items }, lost }
}

// An already-migrated (v2) queue lacks the `type`/`after` v7 held; the newest spec-v7-backup queue that
// carries any of them is the only copy. One fill per field a same-id v2 item lacks.
function queueFills(common, q) {
  const dir = path.join(common, 'spec-v7-backup')
  let names = []
  try { names = fs.readdirSync(dir).sort().reverse() } catch { return [] }
  for (const n of names) {
    const src = readJson(path.join(dir, n, 'spec-queue.json'), null)
    const items = src && Array.isArray(src.items) ? src.items : []
    if (!items.some((i) => i.lane || i.after)) continue
    const fills = []
    for (const it of q.items || []) {
      const old = items.find((i) => i.id === it.id)
      if (!old) continue
      if (it.kind === 'prompt' && it.type === undefined && TYPES.includes(old.lane)) fills.push({ id: it.id, field: 'type', value: old.lane, text: `${it.id} type ${old.lane}` })
      const after = afterOf(old.after)
      if (after && it.after === undefined) fills.push({ id: it.id, field: 'after', value: after, text: `${it.id} after ${after.brief !== undefined ? 'brief ' + after.brief : after.spec}` })
    }
    return fills
  }
  return []
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
  // A name whose archive destination is taken was already migrated: planning it again could only warn.
  const arch = (p, to) => { if (!exists(path.join(root, to))) add('archive', p, to) }
  const common = gitCommonDir(root)
  const cfgFile = configPath(root)
  const cfg = readJson(cfgFile, null)
  const dropped = []
  let testCommand = null // the gate v8 gets, printed beside the dropped keys so the user sees it
  if (cfg) {
    const trimmed = trimConfig(root, cfg)
    if (!same(trimmed, cfg)) {
      testCommand = trimmed.testCommand || null
      for (const k of Object.keys(cfg)) if (!(k in trimmed) && cfg[k] != null && !['generatedBy', 'contractHash'].includes(k)) dropped.push(k)
      add('config', '.claude/spec.config.json', null, 'trim to v8 keys')
    }
  }
  const qf = path.join(common, 'spec-queue.json')
  const q = readJson(qf, null)
  let lost = []
  let fills = []
  if (q && q.version !== VERSION) {
    lost = convertQueue(root, q).lost
    // A version 2 file lacks the `type`/`after` v7 held: the fills run first, on the raw file, then the conversion.
    if (q.version === 2) {
      fills = queueFills(common, q)
      if (fills.length) add('queue-fields', qf, null, `${fills.length} fills`)
    }
    add('queue', qf, null, `${(q.items || []).length} items -> v${VERSION}`)
  }
  // prototype records v8's readers would refuse
  const protoUrl = (cfg && cfg.prototype && cfg.prototype.url) || DEFAULTS.prototype.url
  const protoDir = path.join(root, 'design/prototypes')
  if (exists(protoDir)) for (const e of fs.readdirSync(protoDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isDirectory() && protoV7(root, e.name).length) add('prototype', 'design/prototypes/' + e.name, null, `${e.name}: v7 → v8`)
  }
  // sidecars and deviations
  walk(path.join(root, 'specs'), (p, isDir) => {
    if (isDir && SIDECAR.test(p)) { if (exists(p.replace(SIDECAR, '.md'))) add('delete', rel(p)); return true } // a dotted dir with no spec beside it is the user's
    if (!isDir && p.endsWith('.deviations.md')) arch(rel(p), path.posix.join(ARCH, 'deviations', path.relative(path.join(root, 'specs'), p).split(path.sep).join('/')))
    return false
  })
  for (const a of ARCHIVE) if (exists(path.join(root, a))) arch(a, path.posix.join(ARCH, a.replace(/^\.claude\//, '')))
  const pipe = path.join(root, '.claude/rules/spec-pipeline.md')
  if (exists(pipe) && !exists(path.join(root, ARCH, 'rules/spec-pipeline.md'))) {
    add('extract', '.claude/rules/spec-pipeline.md', '.claude/rules/spec-gotchas.md', 'Gotchas + Risk Tiers')
    add('archive', '.claude/rules/spec-pipeline.md', path.posix.join(ARCH, 'rules/spec-pipeline.md'))
  }
  const owned = []
  for (const o of ops) if (o.op === 'prototype') {
    for (const n of fs.readdirSync(path.join(root, o.path)).sort()) if (!['status.json', 'pins.json', 'contract.json'].includes(n)) owned.push(`${o.path}/${n}`)
  }
  const agents = path.join(root, '.claude/agents')
  if (exists(agents)) for (const n of fs.readdirSync(agents)) {
    const f = path.join(agents, n)
    if (n.endsWith('.md') && fs.readFileSync(f, 'utf8').includes('## Worker Contract (spec pipeline)')) arch(rel(f), path.posix.join(ARCH, 'agents', n))
    else owned.push('.claude/agents/' + n)
  }
  const skills = path.join(root, '.claude/skills')
  if (exists(skills)) for (const n of fs.readdirSync(skills)) {
    const dir = path.join(skills, n)
    let body = ''
    try { body = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8') } catch { /* none */ }
    if (SKILLS.includes(n) && /spec-paths|spec-runs/.test(body)) arch('.claude/skills/' + n, path.posix.join(ARCH, 'skills', n))
    else owned.push('.claude/skills/' + n)
  }
  if (exists(path.join(common, 'spec-queue-done.json'))) arch(path.join(common, 'spec-queue-done.json'), path.posix.join(ARCH, 'spec-queue-done.json'))
  // git dir leftovers
  const privs = [common]
  if (exists(path.join(common, 'worktrees'))) for (const n of fs.readdirSync(path.join(common, 'worktrees'))) privs.push(path.join(common, 'worktrees', n))
  // v8's fan-out state shares v7's file name. A v8 record ({step, batch[]}) is never a leftover:
  // with lanes out, the migration refuses; idle, the file is left to the driver.
  const fan = readJson(path.join(common, 'spec-fanout.json'), null)
  const v8Fan = fan && typeof fan.step === 'string' && Array.isArray(fan.batch) ? fan : null
  const liveFanout = !!(v8Fan && v8Fan.batch.some((l) => l && l.status !== 'merged' && l.status !== 'dismissed'))
  for (const d of privs) for (const n of ['spec-delegated', 'spec-lane-exit.json', 'spec-wave-open'])
    if (exists(path.join(d, n))) add('delete', path.join(d, n))
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
  // A v7 migration is pending only while some v7 artifact is: a version 2 queue file, a config with no
  // v7-only key, the gitignore and prototype records are v8's own conversions. spec-fanout.json and
  // spec-run-cache keep v7's names in v8, so they are v7 leftovers only beside such an artifact, never on their own.
  const v7Config = !!cfg && V7_CONFIG.some((k) => k in cfg)
  const v7Pending = () => v7Config || ops.some((o) => !['config', 'gitignore', 'queue-fields', 'prototype'].includes(o.op) && !(o.op === 'queue' && q.version === 2))
  if (v7Pending()) {
    for (const d of privs) if (exists(path.join(d, 'spec-fanout.json')) && !(d === common && v8Fan)) add('delete', path.join(d, 'spec-fanout.json'))
    if (exists(path.join(common, 'spec-run-cache')) && !v8Fan) add('delete', path.join(common, 'spec-run-cache'))
  }
  if (v7Pending() && git.raw(['rev-parse', '-q', '--verify', 'refs/tags/spec-v7-final'], root).status !== 0) ops.unshift({ op: 'tag', path: 'spec-v7-final' })
  // listed, never touched
  const listed = []
  const wt = path.join(root, '.claude/worktrees')
  if (exists(wt)) for (const n of fs.readdirSync(wt)) listed.push('worktree .claude/worktrees/' + n)
  const br = git.raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-agent-*', 'refs/heads/plan/*', 'refs/heads/fix/*'], root).stdout.split('\n').filter(Boolean)
  for (const b of br) listed.push('branch ' + b)
  const warns = []
  const pc = (cfg && cfg.prototype) || {}
  if (/PROTO_URL/.test(String(pc.e2eRun || '') + String(pc.e2eCommand || ''))) warns.push('prototype.e2eCommand reads PROTO_URL — the run sets APP_URL')
  if (/\{(width|height)\}/.test(String(pc.picture || ''))) warns.push('prototype.picture uses {width}/{height} — v8 fills only {url} and {out}')
  if (git.raw(['ls-files', '--', '.claude/settings.local.json'], root).stdout.trim()) warns.push('.claude/settings.local.json is tracked and may hold a token — run: git rm --cached .claude/settings.local.json')
  const wts = git.worktreeList(root).slice(1).filter((w) => path.relative(fs.realpathSync(root), w).startsWith('..'))
  if (wts.length) warns.push('git worktree entries outside this repo (copied repo?) — never touched: ' + wts.join('; '))
  return { ops, dropped, lost, listed, owned, warns, testCommand, fills, liveFanout, protoUrl }
}

// ---- apply ----------------------------------------------------------------------------------
function archive(root, src, dst, warns) {
  const s = path.resolve(root, src), d = path.resolve(root, dst)
  if (exists(d)) { warns.push(`not moved, destination exists: ${dst}`); return false }
  fs.mkdirSync(path.dirname(d), { recursive: true })
  const tracked = git.raw(['ls-files', '--', s], root).stdout.trim()
  if (tracked && git.raw(['mv', s, d], root).status === 0) return true
  fs.renameSync(s, d)
  return true
}

function commit(root, warns) {
  git.raw(['add', '-A'], root)
  if (git.raw(['diff', '--cached', '--quiet'], root).status === 0) return { sha: null }
  const r = git.raw(['commit', '-q', '-m', 'chore(spec): migrate v7 → v8'], root)
  if (r.status !== 0) { warns.push('migration commit failed: ' + (r.stderr || r.stdout).trim()); return { sha: null, failed: true } }
  return { sha: git.headSha(root) }
}

// Copies every git-dir file the apply deletes or rewrites, and the refs/spec-review refs (refs.txt,
// restorable with `git update-ref <ref> <sha>`), to <git-common-dir>/spec-v7-backup/<ISO time>/.
function backup(root, p) {
  const common = gitCommonDir(root)
  const files = p.ops.filter((o) => o.op !== 'ref' && path.relative(common, path.resolve(root, o.path)).match(/^(?!\.\.)./))
  const refs = git.raw(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/spec-review'], root).stdout
  if (!files.length && !refs.trim()) return null
  const dir = path.join(common, 'spec-v7-backup', new Date().toISOString().replace(/:/g, '-'))
  fs.mkdirSync(dir, { recursive: true })
  for (const o of files) fs.cpSync(path.resolve(root, o.path), path.join(dir, path.relative(common, path.resolve(root, o.path))), { recursive: true })
  if (refs.trim()) fs.writeFileSync(path.join(dir, 'refs.txt'), refs)
  return dir
}

function apply(root, p) {
  const warns = []
  let skipped = 0
  for (const o of p.ops) {
    const abs = path.resolve(root, o.path)
    if (o.op === 'tag') git.sh(['tag', 'spec-v7-final'], root)
    else if (o.op === 'config') writeJson(abs, trimConfig(root, readJson(abs, {})))
    else if (o.op === 'queue') writeJson(abs, convertQueue(root, readJson(abs, {})).queue)
    else if (o.op === 'queue-fields') {
      const q = readJson(abs, {})
      for (const f of p.fills) { const it = (q.items || []).find((i) => i.id === f.id); if (it && it[f.field] === undefined) it[f.field] = f.value }
      writeJson(abs, q)
    } else if (o.op === 'delete') fs.rmSync(abs, { recursive: true, force: true })
    else if (o.op === 'archive') { if (!archive(root, o.path, o.to, warns)) skipped++ }
    else if (o.op === 'extract') {
      const text = fs.readFileSync(abs, 'utf8')
      const fm = /^---\n[\s\S]*?\n---\n/.exec(text)
      const body = section(text, /^## Gotchas/) + '\n' + section(text, /^## Risk Tiers/)
      fs.writeFileSync(path.resolve(root, o.to), (fm ? fm[0] + '\n' : '') + '# Spec gotchas\n\n' + body)
    } else if (o.op === 'ref') git.raw(['update-ref', '-d', o.path], root)
    else if (o.op === 'prototype') migrateProto(root, o.path, p.protoUrl)
    else if (o.op === 'gitignore') ensureGitignore(root)
    else if (o.op === 'gitattributes') {
      const keep = fs.readFileSync(abs, 'utf8').split('\n').filter((l) => !/spec-runs\.jsonl merge=union/.test(l)).join('\n')
      if (keep.trim()) fs.writeFileSync(abs, keep); else fs.rmSync(abs)
    }
  }
  return { warns, skipped }
}

function main(argv) {
  const i = argv.indexOf('--root')
  const root = i >= 0 ? path.resolve(argv[i + 1]) : process.cwd()
  const doApply = argv.includes('--apply')
  const p = plan(root)
  if (doApply && p.liveFanout) {
    process.stderr.write(`migrate: refusing --apply while a fan-out is in flight (${path.join(gitCommonDir(root), 'spec-fanout.json')}) — finish or dismiss its lanes, then re-run\n`)
    return 2
  }
  if (doApply && p.ops.length) {
    const dirty = git.raw(['status', '--porcelain'], root).stdout.split('\n').filter(Boolean)
    if (dirty.length) {
      process.stderr.write(`migrate: refusing --apply on a dirty tree — commit or stash first so the migration commit holds only migration changes:\n${dirty.map((l) => '  ' + l).join('\n')}\n`)
      return 2
    }
  }
  const saved = doApply && p.ops.length ? backup(root, p) : null
  const { warns: applyWarns, skipped } = doApply ? apply(root, p) : { warns: [], skipped: 0 }
  const { sha, failed } = doApply && p.ops.length ? commit(root, applyWarns) : { sha: null }
  const done = p.ops.length - skipped
  const counts = {}
  for (const o of p.ops) counts[o.op] = (counts[o.op] || 0) + 1
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ applied: doApply, commit: sha, backup: saved, counts, ...p, warns: [...p.warns, ...applyWarns] }) + '\n'); return 0 }
  const bullets = Object.entries(counts).map(([k, n]) => `${LABEL[k] || k}: ${n}`)
  if (sha) bullets.push(`commit ${sha}: chore(spec): migrate v7 → v8`)
  if (saved) bullets.push(`git-dir backup: ${saved}`)
  if (!doApply) bullets.push(...p.ops.map((o) => (o.op === 'prototype' ? `prototype ${o.note}` : `${o.op} ${o.path}${o.to ? ' -> ' + o.to : ''}${o.op === 'queue-fields' ? ` (${o.note})` : ''}`)))
  else bullets.push(...p.ops.filter((o) => o.op === 'prototype').map((o) => `prototype ${o.note}`))
  bullets.push(...p.fills.map((f) => '  ' + f.text))
  const warns = [...p.warns, ...applyWarns]
  if (p.dropped.length) warns.push('dropped config keys: ' + p.dropped.join(', '))
  if (p.testCommand) warns.push(`testCommand: ${p.testCommand}`)
  if (p.lost.length) warns.push('queue items now plain prompts (ledger predicate dropped): ' + p.lost.join(', '))
  if (p.owned.length) warns.push('left alone (user-owned): ' + p.owned.join(', '))
  if (p.listed.length) warns.push('left in place, review them: ' + p.listed.join('; '))
  process.stdout.write(render({
    outcome: !p.ops.length ? '✅ nothing to migrate' : doApply ? (failed ? `⚠️ ${done} steps applied, migration commit failed` : done ? `✅ migrated — ${done} steps applied` : `⚠️ nothing applied — ${skipped} steps skipped`) : `plan — ${p.ops.length} steps, nothing changed`,
    bullets, warns, next: doApply || !p.ops.length ? '/spec:doctor' : 'node migrate.js --apply',
  }))
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
module.exports = { plan, trimConfig, convertQueue }
