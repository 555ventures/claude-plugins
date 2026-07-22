#!/usr/bin/env node
'use strict'
// spec-status.js [--root <dir>] [--json] [--brief NN] [--next] — derive pipeline status,
// never store it.
//
// The single source of truth for "where is the work": specs/** frontmatter (`status:`,
// `brief:`, `depends_on:`, `design:`, `designed:`) and docs/roadmap/NN-*.md headers
// (`Depends on:`). Roadmap brief status is DERIVED per /spec:doctor check 14 — no specs
// stamped `brief: NN` → unplanned; any matching spec not done → in-flight; all matching
// specs done → done. Nothing here writes; this is a viewer. Consumers: /spec:status
// (render + --next section 2), /spec:doctor check 14 (drift report), /spec:plan Phase 0
// (--brief dependency preflight), and the /spec:review close-out Next pointer (--next).
//
// --next derives the recommended next command per open spec — the mapping that used to
// live as renderer prose (and, worse, as end-of-run improvisation): draft → /spec:plan;
// hardened + design: true without a `designed:` stamp → /spec:design; hardened otherwise →
// /spec:build (`designed:` set means the design stage already ran — never route back to
// /spec:design); implementing → /spec:review. Closest-to-done first, blocked entries last,
// and when every spec is done the next ready unplanned brief becomes the /spec:plan pick.
// Unblocked runner-up entries are annotated parallel-ok/serial relative to the top pick:
// spec-level depends_on can never link two unblocked entries (a non-done dep is a blocker),
// so the check is brief-level — shared brief or a transitive brief dependency path in either
// direction → serial; distinct unrelated briefs → parallel-ok (separate worktrees); either
// side briefless → no claim.
//
// Exit codes: 0 derived (anomalies are report lines, not failures); with --brief NN,
// 1 = that brief has an unmet dependency (no spec at implementing/done); 2 = usage.

const fs = require('fs')
const path = require('path')

// Brief ids are NN plus an optional letter suffix — ad-hoc briefs slot between neighbors
// as 04a, 04b, … Normalize any spelling (4b, 04B, 04b-auth) to the canonical zero-padded
// lowercase id; briefOrd maps ids to a sortable number where 04 < 04a < 04b < 05.
function normBrief(v) {
  const m = String(v).trim().match(/^(\d+)([A-Za-z]?)(?:-.*)?$/)
  return m ? m[1].padStart(2, '0') + m[2].toLowerCase() : String(v).trim()
}
function briefOrd(num) {
  const m = num.match(/^(\d+)([a-z]?)$/)
  return m ? Number(m[1]) + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : NaN
}

let root = '.'
let json = false
let briefFilter = null
let nextMode = false
let pretty = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = argv[++i]
  else if (argv[i] === '--json') json = true
  else if (argv[i] === '--brief') briefFilter = normBrief(argv[++i])
  else if (argv[i] === '--next') nextMode = true
  else if (argv[i] === '--pretty') pretty = true
  else {
    console.error('usage: spec-status.js [--root <dir>] [--json] [--brief NN | --next | --pretty]')
    process.exit(2)
  }
}
if (nextMode && briefFilter) {
  console.error('--next and --brief are mutually exclusive')
  process.exit(2)
}
if (pretty && (json || briefFilter || nextMode)) {
  console.error('--pretty stands alone (it already embeds the --next derivation)')
  process.exit(2)
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
    brief: fm.brief ? normBrief(fm.brief) : null,
    area: fm.area || null,
    date: fm.date || null,
    design: fm.design === 'true',
    designed: fm.designed || null,
    depends_on: parseList(fm.depends_on),
  })
}

// ---- docs/roadmap/NN-*.md headers -----------------------------------------------------------

const roadmapDir = path.join(root, 'docs/roadmap')
const briefs = []
if (fs.existsSync(roadmapDir)) {
  for (const f of fs.readdirSync(roadmapDir).sort()) {
    const m = f.match(/^(\d+[A-Za-z]?)-(.+)\.md$/)
    if (!m || f === '00-overview.md') continue
    const text = fs.readFileSync(path.join(roadmapDir, f), 'utf8')
    // Header fields ride `·`-separated lines under the H1 and may wrap mid-list, so flatten
    // the pre-section head to one line before matching — a wrapped `Depends on:` must not
    // silently drop the dependencies on the continuation line.
    const head = text.split(/\n## /)[0].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ')
    const dep = head.match(/Depends on:\s*([^·]*?)\s*(?:·|$)/)
    const phase = head.match(/Phase:\s*(P\d+)/)
    briefs.push({
      num: normBrief(m[1]),
      file: path.join('docs/roadmap', f),
      name: m[2],
      phase: phase ? phase[1] : null,
      depends_on: dep ? (dep[1].match(/\d+[A-Za-z]?/g) || []).map(normBrief) : [],
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
  const maxMoved = moved.reduce((m, b) => briefOrd(b.num) > briefOrd(m.num) ? b : m).num
  for (const b of briefs) {
    if (b.status === 'unplanned' && briefOrd(b.num) < briefOrd(maxMoved) && !anomalies.some(a => a.detail.includes(`dependency ${b.num} `))) {
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
  const rows = fs.readFileSync(overview, 'utf8').split('\n').filter(l => /^\|\s*\d+[A-Za-z]?\s*\|/.test(l))
  const STATUSY = /^(?:[✅✔❌🟢🟠]\s*)?(planned|unplanned|done|in.?progress|in.?flight|shipped|completed?|wip|todo)[.!]?$|^[✅✔❌🟢🟠]$/i
  const cells = rows.flatMap(l => l.split('|').map(c => c.trim())).filter(c => STATUSY.test(c))
  if (cells.length) {
    anomalies.push({ kind: 'hand-tracked-status', detail: `docs/roadmap/00-overview.md Sequence table carries hand-tracked status cell(s): ${[...new Set(cells)].join(', ')} — statuses live only in this derivation; strip that column` })
  }
}

// ---- --next: recommended next command --------------------------------------------------------

function specDep(ref) {
  return specByTail.get(path.basename(ref)) || specs.find(x => x.path === ref || x.path.endsWith('/' + ref))
}

// Does brief a transitively depend on brief b (via roadmap `Depends on:` headers)?
function briefDepPath(a, b) {
  const seen = new Set()
  const stack = [...((briefByNum.get(a) || { depends_on: [] }).depends_on)]
  while (stack.length) {
    const d = stack.pop()
    if (d === b) return true
    if (seen.has(d)) continue
    seen.add(d)
    const dep = briefByNum.get(d)
    if (dep) stack.push(...dep.depends_on)
  }
  return false
}

// Shared by --next (plain, consumed verbatim by /spec:review close-out) and --pretty (the
// /spec:status dashboard) — one derivation, two renders.
function deriveNext() {
  const entries = []
  for (const s of specs) {
    if (DONE(s.status)) continue
    // designed: set = the design stage already ran for this spec — never route back to design.
    const action =
      s.status === 'draft' ? '/spec:plan'
      : s.status === 'implementing' ? '/spec:review'
      : s.design && !s.designed ? '/spec:design'
      : '/spec:build'
    const blockers = []
    for (const d of s.depends_on) {
      const dep = specDep(d)
      if (dep && !DONE(dep.status)) blockers.push(`${dep.path} (${dep.status})`)
    }
    if (s.status === 'draft' && s.brief && briefByNum.has(s.brief)) {
      for (const d of briefByNum.get(s.brief).depends_on) {
        const dep = briefByNum.get(d)
        if (!dep || !dep.specs.some(x => LANDED(x.status))) blockers.push(`brief ${d} (${dep ? dep.status : 'missing'})`)
      }
    }
    const rank = s.status === 'implementing' ? 0 : s.status === 'hardened' ? 1 : 2
    entries.push({
      action, path: s.path, status: s.status, brief: s.brief, blockers,
      note: s.status + (s.design ? (s.designed ? ' [designed]' : ' [design]') : '')
        + (s.brief ? ` (brief ${s.brief})` : ''),
      rank,
    })
  }
  // Closest-to-done first (review > build/design > plan), blocked entries last, then brief
  // order, then path — the first line is THE recommendation.
  entries.sort((a, b) =>
    (a.blockers.length ? 1 : 0) - (b.blockers.length ? 1 : 0)
    || a.rank - b.rank
    || (a.brief ? briefOrd(a.brief) : Infinity) - (b.brief ? briefOrd(b.brief) : Infinity)
    || a.path.localeCompare(b.path))

  // Every spec done (or only blocked ones left): the next ready unplanned brief is the pick.
  const readyBriefs = briefs
    .filter(b => b.status === 'unplanned' && b.depends_on.every(d => {
      const dep = briefByNum.get(d)
      return dep && dep.specs.some(x => LANDED(x.status))
    }))
    .sort((a, b) => briefOrd(a.num) - briefOrd(b.num))
  if (readyBriefs.length && !entries.some(e => !e.blockers.length)) {
    const b = readyBriefs[0]
    entries.unshift({ action: '/spec:plan', path: b.file, status: 'unplanned', brief: b.num, blockers: [], note: `brief ${b.num} (${b.name}) unplanned, dependencies met`, rank: -1 })
  }

  // Parallel annotation: each unblocked runner-up vs the top pick. Both need a brief to
  // make a claim; shared brief = same surfaces, a brief dependency path = declared order.
  const top = entries[0]
  if (top && !top.blockers.length) {
    for (const e of entries.slice(1)) {
      if (e.blockers.length || !e.brief || !top.brief) continue
      if (e.brief === top.brief) { e.parallel = false; e.parallelReason = `shared brief ${e.brief}` }
      else if (briefDepPath(e.brief, top.brief)) { e.parallel = false; e.parallelReason = `brief ${e.brief} depends on ${top.brief}` }
      else if (briefDepPath(top.brief, e.brief)) { e.parallel = false; e.parallelReason = `brief ${top.brief} depends on ${e.brief}` }
      else e.parallel = true
    }
  }
  return entries
}

// Message when the next-derivation has nothing actionable — shared by both renders.
function nothingNextLine() {
  const unplanned = briefs.filter(b => b.status === 'unplanned').length
  return specs.length === 0 && !unplanned ? 'nothing next — no specs or briefs found'
    : unplanned ? `nothing actionable — all specs done; ${unplanned} unplanned brief(s) blocked on unmet dependencies`
    : 'nothing next — all specs done, no unplanned briefs'
}

if (nextMode) {
  const entries = deriveNext()
  if (json) {
    console.log(JSON.stringify({ next: entries.map(({ rank, parallelReason, ...e }) => ({ ...e, parallel: e.parallel === undefined ? null : e.parallel, parallel_reason: parallelReason || null })) }, null, 2))
  } else if (!entries.length) {
    console.log(nothingNextLine())
  } else {
    entries.forEach((e, i) => {
      const label = e.blockers.length ? 'Blocked:' : i === 0 ? 'Next:' : 'Then:'
      const par = e.parallel === true ? '; parallel-ok with Next'
        : e.parallel === false ? `; serial after Next — ${e.parallelReason}` : ''
      const tail = e.blockers.length ? ` — ${e.note}; waiting on ${e.blockers.join(', ')}` : ` — ${e.note}${par}`
      console.log(`${label} ${e.action} ${e.path}${tail}`)
    })
  }
  process.exit(0)
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

// ---- --pretty: the /spec:status dashboard ---------------------------------------------------
// Deterministic emoji render of the same derivation: verdict line, roadmap with per-brief
// progress bars (consecutive unplanned briefs collapse to one row), the next-action lanes
// (parallel-ok runner-ups drawn as fan-out lanes under the top pick), anomalies. Purely a
// view — same data as the plain report + --next, styled here so no renderer re-derives it.

if (pretty) {
  const out = []
  const ACTION_ICON = { '/spec:plan': '📝', '/spec:design': '🎨', '/spec:build': '🔨', '/spec:review': '🔍' }
  const BRIEF_ICON = { done: '✅', 'in-flight': '🔨', unplanned: '⬜' }

  const doneB = briefs.filter(b => b.status === 'done').length
  const flightB = briefs.filter(b => b.status === 'in-flight').length
  const unplB = briefs.filter(b => b.status === 'unplanned').length
  const doneS = specs.filter(s => DONE(s.status)).length
  const scope = briefs.length
    ? [`${doneB} brief${doneB === 1 ? '' : 's'} done`, flightB && `${flightB} in flight`, unplB && `${unplB} unplanned`].filter(Boolean).join(' · ')
    : specs.length ? `${doneS}/${specs.length} specs done` : 'no specs or briefs found'
  out.push(`${anomalies.length ? '🟠' : '🟢'} ${scope} · ${anomalies.length ? `⚠️ ${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'}` : 'no anomalies'}`)

  if (briefs.length) {
    out.push('', '🗺️ Roadmap')
    const rows = []
    for (let i = 0; i < briefs.length; i++) {
      const b = briefs[i]
      let j = i
      while (b.status === 'unplanned' && j + 1 < briefs.length && briefs[j + 1].status === 'unplanned') j++
      if (j > i) {
        const run = briefs.slice(i, j + 1)
        const phases = [...new Set(run.map(x => x.phase).filter(Boolean))]
        const phase = phases.length > 1 ? `${phases[0]}–${phases[phases.length - 1]}` : phases[0] || '—'
        rows.push({ icon: '⬜', label: `${b.num}–${briefs[j].num}`, phase, tail: `unplanned (${run.length} briefs)` })
        i = j
        continue
      }
      const total = b.specs.length
      const nDone = b.specs.filter(s => DONE(s.status)).length
      const bar = total
        ? '▓'.repeat(nDone === total ? 10 : Math.min(9, Math.floor(nDone / total * 10))).padEnd(10, '░') + ` ${nDone}/${total}`
        : 'unplanned'
      const openBits = b.specs.filter(s => !DONE(s.status)).map(s => `${path.basename(s.path)} ${s.status}`)
      rows.push({ icon: BRIEF_ICON[b.status], label: `${b.num} ${b.name}`, phase: b.phase || '—', tail: bar + (openBits.length ? `  ⏳ ${openBits.join(', ')}` : '') })
    }
    const lw = Math.max(...rows.map(r => r.label.length))
    const pw = Math.max(...rows.map(r => r.phase.length))
    for (const r of rows) out.push(`   ${r.icon} ${r.label.padEnd(lw)}  ${r.phase.padEnd(pw)}  ${r.tail}`)
  }

  out.push('', '🎯 Next')
  const entries = deriveNext()
  const fmtEntry = e => `${ACTION_ICON[e.action] || '▪️'} ${e.action} ${e.path} — ${e.note}`
  if (!entries.length) {
    out.push(`   ✨ ${nothingNextLine()}`)
  } else {
    const unblocked = entries.filter(e => !e.blockers.length)
    const blocked = entries.filter(e => e.blockers.length)
    if (unblocked.length) {
      const lanes = [unblocked[0], ...unblocked.slice(1).filter(e => e.parallel === true)]
      if (lanes.length > 1) {
        out.push(`   ⚡ ${lanes.length} parallel lanes — fan out via /git:enter-worktree, one each:`)
        lanes.forEach((e, i) => out.push(`   ${i === 0 ? '┌─' : i === lanes.length - 1 ? '└─' : '├─'} ${fmtEntry(e)}${i === 0 ? '  ◀ main lane' : ''}`))
      } else {
        out.push(`   ▶ ${fmtEntry(unblocked[0])}`)
      }
      const later = unblocked.slice(1).filter(e => e.parallel !== true)
      if (later.length) {
        out.push('   🕓 after that:')
        later.forEach((e, i) => out.push(`   ${i === later.length - 1 ? '└─' : '├─'} ${fmtEntry(e)}${e.parallel === false ? `  ⛓ serial — ${e.parallelReason}` : ''}`))
      }
    }
    if (blocked.length) {
      out.push('   ⛔ blocked:')
      blocked.forEach((e, i) => out.push(`   ${i === blocked.length - 1 ? '└─' : '├─'} ${fmtEntry(e)}  ⏳ waiting on ${e.blockers.join(', ')}`))
    }
  }

  out.push('')
  if (!anomalies.length) {
    out.push('✅ No anomalies — nothing skipped, no drift')
  } else {
    const ANOM_ICON = { 'orphan-stamp': '🏷️', 'skipped-brief': '⏭️', 'out-of-order': '🔀', 'unknown-dependency': '❓', 'skipped-spec': '🕳️', 'hand-tracked-status': '✍️' }
    out.push(`⚠️ Anomalies (${anomalies.length})`)
    for (const a of anomalies) out.push(`   ${ANOM_ICON[a.kind] || '⚠️'} [${a.kind}] ${a.detail}`)
  }

  console.log(out.join('\n'))
  process.exit(0)
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
  for (const s of open) lines.push(`  ${s.path} — ${s.status}${s.design ? (s.designed ? ' [designed]' : ' [design]') : ''}${s.brief ? ` (brief ${s.brief})` : ''}`)
}

if (anomalies.length) {
  lines.push('')
  lines.push('anomalies:')
  for (const a of anomalies) lines.push(`  [${a.kind}] ${a.detail}`)
}

console.log(lines.join('\n'))
