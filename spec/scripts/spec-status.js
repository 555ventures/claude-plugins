#!/usr/bin/env node
'use strict'
// spec-status.js [--root <dir>] [--json] [--brief NN] — derive pipeline status, never store it.
//
// The single source of truth for "where is the work": specs/** frontmatter (`status:`,
// `brief:`, `depends_on:`) and docs/roadmap/NN-*.md headers (`Depends on:`). Roadmap brief
// status is DERIVED per /spec:doctor check 14 — no specs stamped `brief: NN` → unplanned;
// any matching spec not done → in-flight; all matching specs done → done. Nothing here
// writes; this is a viewer. Consumers: /spec:status (render), /spec:doctor check 14
// (drift report), /spec:plan Phase 0 (--brief dependency preflight).
//
// Exit codes: 0 derived (anomalies are report lines, not failures); with --brief NN,
// 1 = that brief has an unmet dependency (no spec at implementing/done); 2 = usage.

const fs = require('fs')
const path = require('path')

let root = '.'
let json = false
let briefFilter = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = argv[++i]
  else if (argv[i] === '--json') json = true
  else if (argv[i] === '--brief') briefFilter = String(argv[++i]).padStart(2, '0')
  else {
    console.error('usage: spec-status.js [--root <dir>] [--json] [--brief NN]')
    process.exit(2)
  }
}

// ---- specs/** frontmatter -------------------------------------------------------------------

function walkMd(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkMd(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8')
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/)
    if (!kv) continue
    fm[kv[1]] = kv[2].replace(/\s*#.*$/, '').trim()
  }
  return fm
}

function parseList(v) {
  if (!v) return []
  return v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

const specs = []
for (const file of walkMd(path.join(root, 'specs'))) {
  const fm = frontmatter(file)
  if (!fm || !fm.status) continue
  specs.push({
    path: path.relative(root, file),
    status: fm.status,
    brief: fm.brief ? fm.brief.padStart(2, '0') : null,
    area: fm.area || null,
    date: fm.date || null,
    design: fm.design === 'true',
    depends_on: parseList(fm.depends_on),
  })
}

// ---- docs/roadmap/NN-*.md headers -----------------------------------------------------------

const roadmapDir = path.join(root, 'docs/roadmap')
const briefs = []
if (fs.existsSync(roadmapDir)) {
  for (const f of fs.readdirSync(roadmapDir).sort()) {
    const m = f.match(/^(\d+)-(.+)\.md$/)
    if (!m || f === '00-overview.md') continue
    const text = fs.readFileSync(path.join(roadmapDir, f), 'utf8')
    // Header fields ride `·`-separated lines under the H1 and may wrap mid-list, so flatten
    // the pre-section head to one line before matching — a wrapped `Depends on:` must not
    // silently drop the dependencies on the continuation line.
    const head = text.split(/\n## /)[0].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ')
    const dep = head.match(/Depends on:\s*([^·]*?)\s*(?:·|$)/)
    const phase = head.match(/Phase:\s*(P\d+)/)
    briefs.push({
      num: m[1].padStart(2, '0'),
      file: path.join('docs/roadmap', f),
      name: m[2],
      phase: phase ? phase[1] : null,
      depends_on: dep ? (dep[1].match(/\d+/g) || []).map(n => n.padStart(2, '0')) : [],
    })
  }
}

// ---- derivation (doctor check 14) -----------------------------------------------------------

const DONE = s => s === 'done'
const LANDED = s => s === 'done' || s === 'implementing'

for (const b of briefs) {
  b.specs = specs.filter(s => s.brief === b.num)
  b.status = b.specs.length === 0 ? 'unplanned' : b.specs.every(s => DONE(s.status)) ? 'done' : 'in-flight'
}
const briefByNum = new Map(briefs.map(b => [b.num, b]))

const anomalies = []

// Orphan stamps: spec points at a brief file that doesn't exist.
for (const s of specs) {
  if (s.brief && !briefByNum.has(s.brief)) {
    anomalies.push({ kind: 'orphan-stamp', detail: `${s.path} stamps brief: ${s.brief} but no docs/roadmap/${s.brief}-*.md exists (brief renamed/deleted, or typo)` })
  }
}

// Skipped dependency: a brief moved while a declared dependency is still unplanned.
for (const b of briefs) {
  if (b.status === 'unplanned') continue
  for (const d of b.depends_on) {
    const dep = briefByNum.get(d)
    if (!dep) anomalies.push({ kind: 'unknown-dependency', detail: `${b.file} depends on brief ${d}, which doesn't exist` })
    else if (dep.status === 'unplanned') anomalies.push({ kind: 'skipped-brief', detail: `brief ${b.num} (${b.name}) is ${b.status} but its dependency ${d} (${dep.name}) is unplanned — likely skipped; plan it with /spec:plan ${dep.file}` })
  }
}

// Sequence-order skip: an earlier unplanned brief sitting below any later brief that moved.
const moved = briefs.filter(b => b.status !== 'unplanned')
if (moved.length) {
  const maxMoved = moved.reduce((m, b) => Number(b.num) > Number(m.num) ? b : m).num
  for (const b of briefs) {
    if (b.status === 'unplanned' && Number(b.num) < Number(maxMoved) && !anomalies.some(a => a.detail.includes(`dependency ${b.num} `))) {
      anomalies.push({ kind: 'out-of-order', detail: `brief ${b.num} (${b.name}) is unplanned while later brief ${maxMoved} has moved — deliberate reordering or a skip; if it still matters: /spec:plan ${b.file}` })
    }
  }
}

// Unfinished dependency under a done spec: later work completed on top of an unfinished spec.
const specByTail = new Map(specs.map(s => [path.basename(s.path), s]))
for (const s of specs) {
  if (!DONE(s.status)) continue
  for (const d of s.depends_on) {
    const dep = specByTail.get(path.basename(d)) || specs.find(x => x.path === d || x.path.endsWith('/' + d))
    if (dep && !DONE(dep.status)) {
      anomalies.push({ kind: 'skipped-spec', detail: `${s.path} is done but its dependency ${dep.path} is still ${dep.status}` })
    }
  }
}

// Hand-tracked status drift in the overview's Sequence table (doctor check 14 outlaws it).
// Whole-cell match only: a brief legitimately NAMED "mark-as-done flow" is not drift.
const overview = path.join(roadmapDir, '00-overview.md')
if (fs.existsSync(overview)) {
  const rows = fs.readFileSync(overview, 'utf8').split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l))
  const STATUSY = /^(?:[✅✔❌🟢🟠]\s*)?(planned|unplanned|done|in.?progress|in.?flight|shipped|completed?|wip|todo)[.!]?$|^[✅✔❌🟢🟠]$/i
  const cells = rows.flatMap(l => l.split('|').map(c => c.trim())).filter(c => STATUSY.test(c))
  if (cells.length) {
    anomalies.push({ kind: 'hand-tracked-status', detail: `docs/roadmap/00-overview.md Sequence table carries hand-tracked status cell(s): ${[...new Set(cells)].join(', ')} — statuses live only in this derivation; strip that column` })
  }
}

// ---- --brief NN preflight -------------------------------------------------------------------

if (briefFilter) {
  const b = briefByNum.get(briefFilter)
  if (!b) {
    console.error(`no docs/roadmap/${briefFilter}-*.md found`)
    process.exit(2)
  }
  const unmet = b.depends_on.filter(d => {
    const dep = briefByNum.get(d)
    return !dep || !dep.specs.some(s => LANDED(s.status))
  })
  const report = {
    brief: b.num, name: b.name, status: b.status,
    depends_on: b.depends_on.map(d => {
      const dep = briefByNum.get(d)
      return { brief: d, status: dep ? dep.status : 'missing', met: !unmet.includes(d) }
    }),
    ready: unmet.length === 0,
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else if (report.ready) console.log(`brief ${b.num} (${b.name}): all ${b.depends_on.length || 'zero'} dependencies met`)
  else console.log(`brief ${b.num} (${b.name}): UNMET dependencies — ${unmet.map(d => `${d} (${(briefByNum.get(d) || { status: 'missing' }).status})`).join(', ')}`)
  process.exit(unmet.length ? 1 : 0)
}

// ---- report ---------------------------------------------------------------------------------

if (json) {
  console.log(JSON.stringify({ briefs: briefs.map(({ specs: ss, ...b }) => ({ ...b, specs: ss.map(s => ({ path: s.path, status: s.status })) })), specs, anomalies }, null, 2))
  process.exit(0)
}

const lines = []
if (briefs.length) {
  lines.push('| Brief | Phase | Status | Specs |')
  lines.push('|-------|-------|--------|-------|')
  for (const b of briefs) {
    const detail = b.specs.length ? b.specs.map(s => `${path.basename(s.path)}:${s.status}`).join(', ') : '—'
    lines.push(`| ${b.num} ${b.name} | ${b.phase || '—'} | ${b.status} | ${detail} |`)
  }
} else {
  lines.push('no docs/roadmap/NN-*.md briefs found' + (fs.existsSync(roadmapDir) ? '' : ' (no docs/roadmap/)'))
}

const open = specs.filter(s => !DONE(s.status))
lines.push('')
if (specs.length === 0) lines.push('no specs found under specs/')
else if (open.length === 0) lines.push(`all ${specs.length} specs done`)
else {
  lines.push('open specs:')
  for (const s of open) lines.push(`  ${s.path} — ${s.status}${s.design ? ' [design]' : ''}${s.brief ? ` (brief ${s.brief})` : ''}`)
}

if (anomalies.length) {
  lines.push('')
  lines.push('anomalies:')
  for (const a of anomalies) lines.push(`  [${a.kind}] ${a.detail}`)
}

console.log(lines.join('\n'))
