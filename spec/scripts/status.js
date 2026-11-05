'use strict'
// status.js — the dashboard: 🗺️ roadmap, 🎯 next (prompt rows, ⚡ lanes or the top pick), ⚠️ decide lines
// and one footer. `--all` adds 🕓 after that / ⛔ blocked / 🧹 hygiene and lifts the decide cap; `NN`
// reports one brief's readiness. The derivation is lib/next.js; this file reads argv and draws.
// node status.js [NN] [--all] [--json] [--root <dir>]
const path = require('path')
const work = require('./lib/work')
const { derive, shortBlocker } = require('./lib/next')

const USAGE = 'usage: status.js [NN] [--all] [--json] [--root <dir>]'
const ICON = { done: '✅', 'in-flight': '🔨', unplanned: '⬜', superseded: '⛔' }
const DECIDE_CAP = 3

const build = (root) => {
  const d = derive(root)
  const top = d.entries[0]
  const blockers = (p) => (d.entries.find((e) => e.path === p) || { blockers: [] }).blockers
  return {
    briefs: d.briefs.map(({ specs, superseded, ...b }) => ({ ...b, specs: specs.map((s) => ({ path: s.path, status: s.status })) })),
    specs: d.specs.map((s) => ({ path: s.path, status: s.status, brief: s.brief, depends_on: s.depends_on, superseded_by: s.superseded_by, filePlan: s.filePaths, blockers: blockers(s.path) })),
    superseded: d.retired.map((s) => ({ path: s.path, superseded_by: s.superseded_by })),
    anomalies: d.anomalies,
    next: top ? (top.path ? `${top.action} ${top.path}` : top.action) : null,
  }
}

// Runs of equal-status unplanned / done / superseded briefs collapse to one `NN–MM` row.
function roadmapRows(briefs) {
  const rows = []
  for (let i = 0; i < briefs.length; i++) {
    const b = briefs[i]
    let j = i
    const collapsible = b.status === 'unplanned' || b.status === 'done' || b.status === 'superseded'
    while (collapsible && j + 1 < briefs.length && briefs[j + 1].status === b.status) j++
    if (j > i) {
      const run = briefs.slice(i, j + 1)
      const phases = [...new Set(run.map((x) => x.phase).filter(Boolean))]
      const phase = phases.length > 1 ? `${phases[0]}–${phases[phases.length - 1]}` : phases[0] || '—'
      const tail = b.status === 'done' ? `done (${run.length} briefs, ${run.reduce((n, x) => n + x.specs.length, 0)} specs)` : `${b.status} (${run.length} briefs)`
      rows.push({ icon: ICON[b.status], label: `${b.num}–${briefs[j].num}`, phase, tail })
      i = j
      continue
    }
    const total = b.specs.length
    const nDone = b.specs.filter((s) => s.status === 'done').length
    const bar = total ? '▓'.repeat(nDone === total ? 10 : Math.min(9, Math.floor(nDone / total * 10))).padEnd(10, '░') + ` ${nDone}/${total}` : b.status
    rows.push({ icon: ICON[b.status], label: `${b.num} ${b.name}`, phase: b.phase || '—', tail: bar })
  }
  const lw = Math.max(...rows.map((r) => r.label.length)); const pw = Math.max(...rows.map((r) => r.phase.length))
  return rows.map((r) => `   ${r.icon} ${r.label.padEnd(lw)}  ${r.phase.padEnd(pw)}  ${r.tail}`)
}

const branches = (items) => items.map((x, i) => `   ${i === items.length - 1 ? '└─' : '├─'} ${x}`)
const blockerLines = (e) => branches(e.blockers.map((b) => `⏳ ${shortBlocker(b)}`))

function render(d, all) {
  const out = []
  const { entries, lanes, laneClash, later, blocked } = d
  const decide = d.anomalies.filter((a) => a.audience === 'decide')
  const hygiene = d.anomalies.filter((a) => a.audience === 'hygiene')
  const shown = all ? decide : decide.slice(0, DECIDE_CAP)
  const overflow = all ? 0 : Math.max(0, decide.length - DECIDE_CAP)

  if (d.briefs.length) out.push('', '🗺️ Roadmap', ...roadmapRows(d.briefs))

  // A prose queue row is one line cut to the terminal width, led by its id; a command row stays whole.
  const width = process.stdout.columns || 100
  const idw = Math.max(0, ...entries.filter((e) => e.queue).map((e) => e.id.length))
  const cmd = (e) => {
    if (e.path) return `${e.action} @${e.path}`
    const head = `${e.id.padEnd(idw)}  `
    const flat = String(e.action).replace(/\s+/g, ' ').trim()
    const room = Math.max(20, width - head.length)
    return head + (flat.length <= room ? flat : flat.slice(0, room - 1) + '…')
  }

  out.push('', '🎯 Next')
  const prompts = entries.filter((e) => e.queue && !e.blockers.length)
  prompts.forEach((e) => out.push(cmd(e)))
  let laneRendered = false
  if (lanes.length > 1) {
    laneRendered = true
    out.push(`⚡ ${lanes.length} parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):`)
    lanes.forEach((e) => out.push(cmd(e)))
    const plan = new Map(d.specs.map((s) => [s.path, s.filePaths]))
    const overlaps = []
    for (let i = 0; i < lanes.length; i++) {
      for (let j = i + 1; j < lanes.length; j++) {
        const a = plan.get(lanes[i].path); const b = plan.get(lanes[j].path)
        const shared = a && b ? a.filter((f) => b.includes(f)) : []
        if (shared.length) overlaps.push({ a: lanes[i], b: lanes[j], shared })
      }
    }
    out.push(...branches(overlaps.map((o) => {
      const files = o.shared.slice(0, 2).join(', ') + (o.shared.length > 2 ? ` (+${o.shared.length - 2} more)` : '')
      return `🔶 ${lanes.length > 2 ? `${path.basename(o.a.path)} × ${path.basename(o.b.path)}: ` : ''}merge-conflict risk: ${files}`
    })))
  } else if (lanes.length === 1) {
    laneRendered = true
    out.push(cmd(lanes[0]))
    if (later.length || blocked.length) out.push('   └─ 🚦 solo')
  }
  let topAsBlocked = false
  if (!prompts.length && !laneRendered) {
    if (!entries.length) out.push(`   ✨ ${d.nothing}`)
    else { topAsBlocked = true; out.push(cmd(entries[0]), ...blockerLines(entries[0])) }
  }

  if (all) {
    if (later.length) {
      out.push('', '🕓 after that:')
      const reason = (e) => `⛓️ ${e.parallel === false ? e.parallelReason : laneClash.get(e)}`
      later.forEach((e, i) => {
        out.push(cmd(e))
        if (!later[i + 1] || reason(later[i + 1]) !== reason(e)) out.push(`   └─ ${reason(e)}`)
      })
    }
    const rest = topAsBlocked ? blocked.filter((e) => e !== entries[0]) : blocked
    if (rest.length) { out.push('', '⛔ blocked:'); rest.forEach((e) => out.push(cmd(e), ...blockerLines(e))) }
  }

  if (shown.length) out.push('', ...shown.flatMap((a) => [`⚠️ ${a.line}`, `   ${a.ask}  ${a.paste}`]))
  if (all) out.push('', `🧹 Hygiene (${hygiene.length}) — /spec:doctor`, ...hygiene.map((a) => `   [${a.kind}] ${a.detail}`))

  // The footer: glyph and head, then the clauses that apply. N counts open work below the top pick.
  const n = entries.length ? entries.length - 1 : 0
  let glyph; let head
  if (!entries.length) { glyph = '⬜'; head = 'nothing waits' }
  else if (entries[0].blockers.length) { glyph = '🟠'; head = `next is blocked · waiting on ${shortBlocker(entries[0].blockers[0])}` }
  else { glyph = '🟢'; head = 'next is ready' }
  const clauses = []
  if (glyph === '🟢') clauses.push(n === 0 ? 'nothing else open' : `${n} more open`)
  else if (n > 0) clauses.push(`${n} more open`)
  if (overflow > 0) clauses.push(`${overflow} more to decide (--all)`)
  if (hygiene.length > 0) clauses.push(`${hygiene.length} hygiene finding${hygiene.length === 1 ? '' : 's'} (/spec:doctor)`)
  out.push(`${glyph} ${head}${clauses.map((c) => ` · ${c}`).join('')}`)
  return out.join('\n')
}

// NN: can this brief be planned? Each dependency brief needs a spec at implementing or done.
function briefReady(root, nn, json) {
  const specs = work.readSpecs(root); const briefs = work.readBriefs(root, specs)
  const num = work.normBrief(nn)
  const b = briefs.find((x) => x.num === num)
  if (!b) return { code: 2, err: `no docs/roadmap/${num}-*.md found` }
  const deps = b.depends_on.map((id) => {
    const dep = briefs.find((x) => x.num === id)
    return { brief: id, status: dep ? dep.status : 'missing', met: !!dep && dep.specs.some((s) => s.status === 'done' || s.status === 'implementing') }
  })
  const unmet = deps.filter((x) => !x.met)
  const out = json ? JSON.stringify({ brief: b.num, name: b.name, status: b.status, depends_on: deps, ready: !unmet.length }, null, 2)
    : unmet.length ? `brief ${b.num} (${b.name}): UNMET dependencies — ${unmet.map((x) => `${x.brief} (${x.status})`).join(', ')}`
      : `brief ${b.num} (${b.name}): all ${deps.length || 'zero'} dependencies met`
  return { code: unmet.length ? 1 : 0, out }
}

function main(argv) {
  const pos = []; let rootArg = null; const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && i + 1 < argv.length) rootArg = argv[++i]
    else if (argv[i] === '--json' || argv[i] === '--all') flags[argv[i].slice(2)] = true
    else if (argv[i].startsWith('-')) { console.error(USAGE); return 2 }
    else pos.push(argv[i])
  }
  if (pos.length > 1) { console.error(USAGE); return 2 }
  if (pos.length && flags.all) { console.error('usage: --all cannot combine with NN'); return 2 }
  const root = path.resolve(rootArg || require('./lib/git').repoRoot(process.cwd()))
  if (pos.length) {
    const r = briefReady(root, pos[0], flags.json)
    if (r.err) console.error(r.err); else console.log(r.out)
    return r.code
  }
  if (flags.json) { console.log(JSON.stringify(build(root), null, 2)); return 0 }
  // Redraw from the top of the viewport: only on a TTY, so piped output stays escape-free.
  if (process.stdout.isTTY) process.stdout.write('\x1Bc')
  console.log(render(derive(root), flags.all))
  return 0
}

module.exports = { build, main }
if (require.main === module) process.exitCode = main(process.argv.slice(2))
