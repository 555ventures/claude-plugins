#!/usr/bin/env node
'use strict'
// migrate.js — v7 host -> v8, and the queue file to its current shape. node migrate.js [--root <dir>] [--apply]
// [--json] Without --apply prints the plan; a second --apply finds nothing to do. The only converter of the queue file
// (lib/queue.js reads version 4 strictly): a version 1-3 file's open rows and tombstones of unfinished work become
// tracked files under specs/queue/ with new ids (ADR-0050), in the one migration commit; the local file is left empty
// at version 4.

const fs = require('fs')
const path = require('path')
const git = require('./lib/git')
const { readJson, writeJson, configPath, gitCommonDir, protoV7, DEFAULTS, CONFIG_KEYS: KEYS } = require('./lib/state')
const Q = require('./lib/queue')
const files = Q.files
const { normBrief } = require('./lib/work')
const { parse, VERSION } = Q
const { detectTestCommand, resolveUrl } = require('./lib/host')
const { render } = require('./lib/report')
const { ensureGitignore, IGNORE } = require('./init')
const { sentenceOf } = require('./prototype')

const ARCH = 'docs/archive/v7'
const MERGE = ['merge-commit', 'ff-only', 'squash'] // v7's `derived` and `rebase-ff` have no v8 meaning: git.mergeBack throws on them
// ADR-0049
const RUNTIME = ['bootCommand', 'readyCheck', 'url', 'publicUrl', 'envCommand', 'readySeconds', 'stopCommand']
const MOVED = ['bootCommand', 'url', 'publicUrl'] // the `prototype` keys that moved there
const RENAMED = { readyTimeout: 'readySeconds', seedCommand: 'envCommand' } // v7's runtime keys, by their v8 names
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

function walk(dir, fn) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!fn(p, true)) walk(p, fn) } else fn(p, false)
  }
}

function trimConfig(root, cfg, notes = []) {
  const out = {}
  const pol = cfg.policy || {}
  const models = pol.models || {}
  const seat = (v) => (v && typeof v === 'object' ? v : v ? { model: String(v) } : null)
  const seats = { ...(cfg.seats || {}) }
  if (seat(models.workers) && !seats.builder) seats.builder = seat(models.workers)
  if (seat(models.reviewer) && !seats.reviewer) seats.reviewer = seat(models.reviewer)
  // v8's testCommand is the whole gate: a v7 gateCommand without {placeholders} already is one, so it wins, its
  // {testDirs} / {scopeDirs} / {testFiles} removed (v8 does not scope). A per-file typecheckCommand is prepended only
  // to a plain test command.
  const gate = typeof cfg.gateCommand === 'string' ? cfg.gateCommand.replace(/\s*\{(testDirs|scopeDirs|testFiles)\}/g, '').trim() || null : null
  let test = gate || cfg.testCommand || detectTestCommand(root)
  const post = cfg.postGateCommand
  if (test && post && post !== '{testCommand}' && !test.includes(post)) test = `${test} && ${post}`
  if (!gate && test && cfg.typecheckCommand && !test.includes(cfg.typecheckCommand)) test = `${cfg.typecheckCommand} && ${test}`
  // v7 kept the release test-count pattern under capabilities; v8 reads it under release (optional).
  const tcp = cfg.capabilities && cfg.capabilities.testCountPattern
  const rel = cfg.release && typeof cfg.release === 'object' && !Array.isArray(cfg.release) ? cfg.release : {}
  const merge = [cfg.mergeStrategy, pol.mergeStrategy].find((m) => MERGE.includes(m))
  const rt = trimRuntime(cfg.prototype, cfg.runtime, notes)
  const src = { ...cfg, testCommand: test, seats: Object.keys(seats).length ? seats : undefined,
    release: tcp != null ? { ...rel, testCountPattern: tcp } : cfg.release,
    mergeStrategy: merge, worktreePerSpec: cfg.worktreePerSpec ?? pol.worktreePerSpec,
    setupCommand: cfg.setupCommand, runtime: Object.keys(rt).length ? rt : undefined,
    forge: cfg.forge || (cfg.capabilities && cfg.capabilities.forge) || undefined }
  for (const k of KEYS) if (src[k] != null) out[k] = src[k]
  if (out.prototype && typeof out.prototype === 'object') out.prototype = trimPrototype(out.prototype)
  if (out.prototype && !Object.keys(out.prototype).length) delete out.prototype
  return out
}

// The v8 prototype block: overlay, e2eList, dbCreate and dbDestroy are gone, e2eRun is e2eCommand; the keys that moved
// to `runtime` stay there.
function trimPrototype(proto) {
  const { overlay, e2eList, dbCreate, dbDestroy, e2eRun, bootCommand, url, publicUrl, ...rest } = proto
  const out = { ...rest }
  if (e2eRun !== undefined && out.e2eCommand === undefined) out.e2eCommand = e2eRun
  return out
}

// The v8 runtime block: the host's runtime keys as written; the moved `prototype` ones fill what `runtime` lacks
// (`runtime` wins, dropped ones are listed).
function trimRuntime(proto, runtime, notes) {
  const rt = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {}
  const old = proto && typeof proto === 'object' ? proto : {}
  const out = {}
  for (const k of Object.keys(rt)) if (RUNTIME.includes(k) && rt[k] !== undefined) out[k] = rt[k]
  for (const [from, to] of Object.entries(RENAMED)) {
    if (rt[from] !== undefined && out[to] === undefined) out[to] = rt[from]
  }
  for (const k of MOVED) {
    if (old[k] === undefined) continue
    if (out[k] === undefined) out[k] = old[k]; else notes.push(`prototype.${k} dropped — runtime.${k} already holds it`)
  }
  // A command readyCheck must read $PORT exactly when the url is a {port} one.
  const reads = typeof out.readyCheck === 'string' && /\$\{?PORT\b/.test(out.readyCheck)
  const templated = /\{port\}/.test(out.url === undefined ? DEFAULTS.runtime.url : out.url)
  if (typeof out.readyCheck === 'string' && reads !== templated) {
    delete out.readyCheck
    const why = reads ? 'reads $PORT under a fixed url' : 'reads no $PORT under a {port} url'
    notes.push(`runtime.readyCheck dropped — it ${why}; the check is the url`)
  }
  const extra = Object.keys(rt).filter((k) => !RUNTIME.includes(k) && !(k in RENAMED))
  if (extra.length) notes.push(`runtime keys dropped: ${extra.join(', ')}`)
  return out
}

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

// Every stored shape (versions 1 to 3 and the mixed files real repos hold) to version 3's rows: `lane` is `type`,
// `ticked` is `done`.
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
    const spec = body.spec || (kind === 'prompt' && typeof it.spec === 'string' && it.spec) // a v3 row's bound spec
    const o = { id: it.id, kind, ...(body.type && { type: body.type }), ...(spec && { spec }), payload: body.payload }
    if (it.advisories) o.advisories = true
    o.added = it.added === undefined && kind === 'brief' ? undefined : isoAdded(it.added)
    if (it.ticked || it.done) o.done = typeof it.done === 'string' && Number.isFinite(Date.parse(it.done)) ? it.done : new Date().toISOString()
    const after = afterOf(it.after)
    if (after) o.after = after
    return o
  })
  return { queue: { version: 3, seq: q.seq || 0, items }, lost }
}

// The rows of an old queue file, the v7 fills applied.
function queueRows(root, file, fills) {
  const q = readJson(file, {})
  for (const f of fills) {
    const it = (q.items || []).find((i) => i.id === f.id)
    if (it && it[f.field] === undefined) it[f.field] = f.value
  }
  return convertQueue(root, q).queue.items
}

// The tracked files an old file becomes: every open row (a duplicate of an open committed item is skipped) and
// tombstone of unfinished work, in stored order, ranked after the committed items, every field kept, an id issued from
// `added`.
function trackedRows(root, rows) {
  const main = git.mainRoot(root); const have = files.readAll(main); const fin = Q.finisher(root)
  const ranks = have.map((i) => i.rank).filter((r) => r !== undefined).sort(files.rank.cmp)
  let rank = ranks[ranks.length - 1]; const used = new Set(); const out = []
  for (const row of rows) {
    const { id: from, ...rest } = row
    if (row.done ? row.kind === 'prompt' || fin(row) : have.some((h) => !h.done && Q.same(h, row))) continue
    const id = files.newId(main, row.added ? new Date(row.added) : new Date(), used); used.add(id)
    if (!row.done) rank = files.rank.after(rank)
    out.push({ from, file: { id, ...(row.done ? {} : { rank }), ...rest } })
  }
  return out
}

// A v2 queue lacks the `type`/`after` v7 held; the newest spec-v7-backup queue carrying any is the only copy: one fill
// per field.
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
  const notes = []
  if (cfg) {
    const trimmed = trimConfig(root, cfg, notes)
    if (!same(trimmed, cfg)) {
      testCommand = trimmed.testCommand || null
      const quiet = ['generatedBy', 'contractHash', 'prototype']
      for (const k of Object.keys(cfg)) if (!(k in trimmed) && cfg[k] != null && !quiet.includes(k)) dropped.push(k)
      // prototype keys are listed one by one: the ones that moved to runtime or were renamed are not dropped
      const proto = cfg.prototype && typeof cfg.prototype === 'object' ? cfg.prototype : {}
      const kept = trimmed.prototype || {}
      const gone = (k) => !(k in kept) && !MOVED.includes(k) && k !== 'e2eRun'
      for (const k of Object.keys(proto)) if (gone(k)) dropped.push(`prototype.${k}`)
      add('config', '.claude/spec.config.json', null, 'trim to v8 keys')
    }
  }
  const qf = path.join(common, 'spec-queue.json')
  const q = readJson(qf, null)
  let lost = []
  let fills = []
  const badQueue = exists(qf) && q === null
  if (q && q.version !== VERSION) {
    lost = convertQueue(root, q).lost
    // A version 2 file lacks the `type`/`after` v7 held: the fills run first, on the raw file, then the conversion.
    if (q.version === 2) {
      fills = queueFills(common, q)
      if (fills.length) add('queue-fields', qf, null, `${fills.length} fills`)
    }
    add('queue', qf, null, `${(q.items || []).length} rows -> specs/queue/`)
  }
  // prototype records v8's readers would refuse
  const rtUrl = cfg && cfg.runtime && cfg.runtime.url
  const protoUrl = rtUrl || (cfg && cfg.prototype && cfg.prototype.url) || DEFAULTS.runtime.url
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
  // v8's fan-out state shares v7's file name: never a leftover; with lanes out the migration refuses.
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
  // A v7 migration is pending only while some v7 artifact is (the queue, config, gitignore and prototype records are
  // v8's own conversions); spec-fanout.json and spec-run-cache keep v7's names, so they are leftovers only beside such
  // an artifact.
  const v7Config = !!cfg && V7_CONFIG.some((k) => k in cfg)
  const own = ['config', 'gitignore', 'queue-fields', 'prototype', 'queue']
  const v7Pending = () => v7Config || ops.some((o) => !own.includes(o.op))
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
  const warns = [...notes]
  if (badQueue) warns.push(`queue file ${qf} is not valid JSON — repair or remove it, then re-run`)
  const pc = (cfg && cfg.prototype) || {}
  if (/PROTO_URL/.test(String(pc.e2eRun || '') + String(pc.e2eCommand || ''))) warns.push('prototype.e2eCommand reads PROTO_URL — the run sets APP_URL')
  if (/\{(width|height)\}/.test(String(pc.picture || ''))) warns.push('prototype.picture uses {width}/{height} — v8 fills only {url} and {out}')
  if (git.raw(['ls-files', '--', '.claude/settings.local.json'], root).stdout.trim()) warns.push('.claude/settings.local.json is tracked and may hold a token — run: git rm --cached .claude/settings.local.json')
  const wts = git.worktreeList(root).slice(1).filter((w) => path.relative(fs.realpathSync(root), w).startsWith('..'))
  if (wts.length) warns.push('git worktree entries outside this repo (copied repo?) — never touched: ' + wts.join('; '))
  return { ops, dropped, lost, listed, owned, warns, testCommand, fills, liveFanout, protoUrl, badQueue }
}

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

// Copies every git-dir file the apply deletes or rewrites, and the refs/spec-review refs (refs.txt), to <git-common-
// dir>/spec-v7-backup/<ISO time>/.
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

function apply(root, p, tracked) {
  const warns = []
  let skipped = 0
  for (const o of p.ops) {
    const abs = path.resolve(root, o.path)
    if (o.op === 'tag') git.sh(['tag', 'spec-v7-final'], root)
    else if (o.op === 'config') writeJson(abs, trimConfig(root, readJson(abs, {})))
    else if (o.op === 'queue') {
      for (const { file } of tracked) {
        writeJson(path.join(root, git.QUEUE_DIR, file.id + '.json'), { version: VERSION, ...file })
      }
      writeJson(abs, { version: VERSION, items: [], holds: {} })
    }
    else if (o.op === 'delete') fs.rmSync(abs, { recursive: true, force: true })
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

const refusal = (message) => Object.assign(new Error(message), { exit: 2 })

// What --apply checks before it changes anything (refusals, exit 2); → the tracked files {from, file} the queue
// becomes: the main checkout on trunk, no secret in a row.
function preflight(root, p) {
  if (p.liveFanout) {
    const f = path.join(gitCommonDir(root), 'spec-fanout.json')
    throw refusal(`refusing --apply while a fan-out is in flight (${f}) — finish or dismiss its lanes, then re-run`)
  }
  if (p.badQueue) throw refusal(p.warns.find((w) => /not valid JSON/.test(w)))
  const dirty = p.ops.length ? git.raw(['status', '--porcelain'], root).stdout.split('\n').filter(Boolean) : []
  if (dirty.length) {
    const list = dirty.map((l) => '  ' + l).join('\n')
    throw refusal(`refusing --apply on a dirty tree — commit or stash first (the commit is the migration's):\n${list}`)
  }
  const op = p.ops.find((o) => o.op === 'queue')
  if (!op) return []
  if (!Q.isMain(root)) throw refusal(`refusing --apply in a linked worktree — run it in ${git.mainRoot(root)}`)
  const bad = files.stateOf(root)
  if (bad) throw refusal(`${bad.state} — ${bad.remedy}`)
  const tracked = trackedRows(root, queueRows(root, path.resolve(root, op.path), p.fills))
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'spec-migrate-'))
  for (const { file } of tracked) fs.writeFileSync(path.join(tmp, file.id), JSON.stringify(file))
  const hit = tracked.flatMap(({ file }) => git.scanFile(tmp, file.id))[0]
  fs.rmSync(tmp, { recursive: true, force: true })
  if (hit) throw refusal(`a queue row matches the secrets scan (${hit.reason}) — take it out of the row, then re-run`)
  return tracked
}

function main(argv) {
  const i = argv.indexOf('--root')
  const root = i >= 0 ? path.resolve(argv[i + 1]) : process.cwd()
  const doApply = argv.includes('--apply')
  const p = plan(root)
  let tracked = []
  try { tracked = doApply ? preflight(root, p) : [] } catch (e) {
    if (e.exit !== 2) throw e
    process.stderr.write(`migrate: ${e.message}\n`)
    return 2
  }
  const saved = doApply && p.ops.length ? backup(root, p) : null
  const { warns: applyWarns, skipped } = doApply ? apply(root, p, tracked) : { warns: [], skipped: 0 }
  const { sha, failed } = doApply && p.ops.length ? commit(root, applyWarns) : { sha: null }
  const done = p.ops.length - skipped
  const counts = {}
  for (const o of p.ops) counts[o.op] = (counts[o.op] || 0) + 1
  const queued = tracked.map((t) => ({ from: t.from, to: t.file.id }))
  if (argv.includes('--json')) {
    const warns = [...p.warns, ...applyWarns]
    const out = { applied: doApply, commit: sha, backup: saved, counts, queued, ...p, warns }
    process.stdout.write(JSON.stringify(out) + '\n')
    return 0
  }
  const bullets = Object.entries(counts).map(([k, n]) => `${LABEL[k] || k}: ${n}`)
  if (sha) bullets.push(`commit ${sha}: chore(spec): migrate v7 → v8`)
  if (saved) bullets.push(`git-dir backup: ${saved}`)
  if (!doApply) bullets.push(...p.ops.map((o) => (o.op === 'prototype' ? `prototype ${o.note}` : `${o.op} ${o.path}${o.to ? ' -> ' + o.to : ''}${o.op === 'queue-fields' ? ` (${o.note})` : ''}`)))
  else bullets.push(...p.ops.filter((o) => o.op === 'prototype').map((o) => `prototype ${o.note}`))
  bullets.push(...p.fills.map((f) => '  ' + f.text), ...queued.map((t) => `${t.from} → ${t.to}`))
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
