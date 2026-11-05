'use strict'
// status.js — the dashboard: 🗺️ roadmap, 🎯 next (prompt rows, top pick, parallel lanes), ⚠️ questions
// and one footer. `--all` adds 🕓 after that / ⛔ blocked / 🧹 hygiene; `NN` reports one brief's readiness.
// node status.js [NN] [--all] [--json] [--root <dir>]
const fs = require('fs')
const path = require('path')
const { readQueue, readSpec, readConfig, readJson, runPath, readFanout } = require('./lib/state')
const { pasteLine, pending, reconcile, briefNo } = require('./queue')
const doctor = require('./doctor')

const ls = (d) => { try { return fs.readdirSync(d) } catch { return [] } }
const suffix = (n) => n.replace(/^\d+/, '')

function allSpecs(root) {
  const out = []
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const p = rel + '/' + e.name
      if (e.isDirectory() && !e.name.endsWith('.run')) walk(p)
      else if (e.isFile() && e.name.endsWith('.md')) {
        try {
          const spec = readSpec(path.join(root, p))
          const fm = spec.frontmatter
          const dep = [].concat(fm.depends_on || []).map((d) => String(d).trim().replace(/^@/, '').replace(/^\.\//, '')).filter(Boolean)
          out.push({ path: p, spec, status: fm.status, brief: briefNo(String(fm.brief)), depends: dep })
        } catch { /* unreadable spec: skip */ }
      }
    }
  }
  if (fs.existsSync(path.join(root, 'specs'))) walk('specs')
  return out
}

// One record per docs/roadmap/NN-slug.md, in brief order (number, then letter: 02 < 02a < 02b).
// Done = every spec done and the brief's queue item ticked, so a half-planned brief stays implementing.
function briefs(root, specs, q) {
  const planning = (nn) => pending(q).some((i) => i.kind === 'brief' && briefNo(i.payload) === briefNo(nn))
  const dir = path.join(root, 'docs', 'roadmap')
  const recs = ls(dir).filter((f) => /^\d+[a-z]?-.*\.md$/.test(f) && f !== '00-overview.md').map((f) => {
    const [, num, slug] = /^(\d+[a-z]?)-(.*)\.md$/.exec(f)
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    const title = ((/^# +(.+)$/m.exec(text) || [])[1] || f).replace(/^\d+[a-z]?\s*[—–-]\s*/, '')
    const phase = (/\bPhase:\s*([^\s·|]+)/.exec(text) || [])[1] || null
    const depends = ((/Depends on:\s*([^·\n]*)/.exec(text) || [])[1] || '').match(/\b\d+[a-z]?\b/g) || []
    const key = briefNo(num)
    const own = specs.filter((s) => s.brief === key)
    const mine = own.filter((s) => s.status !== 'draft')
    // The bar counts every live spec of the brief, drafts included, superseded ones not (v7's n/m).
    const live = own.filter((s) => s.status !== 'superseded')
    const done = live.filter((s) => s.status === 'done').length
    const state = /^>\s*Superseded by/m.test(text) ? 'superseded'
      : !mine.length ? 'open'
        : mine.every((s) => s.status === 'done') && !planning(num) ? 'done' : 'implementing'
    return { num, slug, file: 'docs/roadmap/' + f, title, phase, depends, key, state, done, total: live.length, specCount: own.length }
  })
  return recs.sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10) || suffix(a.num).localeCompare(suffix(b.num)) || a.num.localeCompare(b.num))
}

function questions(root) {
  const dirs = [root, ...ls(path.join(root, '.claude', 'worktrees')).map((n) => path.join(root, '.claude', 'worktrees', n))]
  return dirs.map((d) => readJson(path.join(d, '.claude', 'pending-question.json'))).filter((d) => d && !d.answer)
    .map((d) => ({ lane: d.lane, question: d.question }))
}

const RANK = { implementing: 0, hardened: 1, draft: 2 }
const base = (p, ext) => path.basename(p, ext)

function derive(root, { hygiene = true } = {}) {
  const specs = allSpecs(root); const q = reconcile(root, readQueue(root))
  const bs = briefs(root, specs, q); const byKey = new Map(bs.map((b) => [b.key, b]))
  const pend = pending(q)
  const queued = (p) => pend.some((i) => i.payload === p)
  // A run in flight, queued or started by hand, is the thing to finish first.
  const runs = specs.map((s) => ({ s, run: readJson(runPath(path.join(root, s.path))) })).filter((x) => x.run && !x.run.ended)
  const running = runs[0] && runs[0].s; const waiting = runs.some((x) => ['ESCALATE', 'CONFLICTS'].includes(x.run.step))
  const live = new Set(runs.map((x) => x.s.path))
  const fan = readFanout(root)
  const cfg = readConfig(root)

  // ---- existing v8 derivation of `next`, unchanged ----
  const open = (nn) => specs.filter((s) => s.status !== 'done' && s.brief === briefNo(nn))
  let head = null; let paste = null
  for (const i of pend) {
    const mine = i.kind === 'brief' ? open(i.payload) : []
    if (!mine.length) { head = i; paste = pasteLine(root, i); break }
    const draft = mine.find((s) => s.status === 'draft'); const loose = mine.find((s) => s.status === 'hardened' && !queued(s.path))
    if (draft) { head = i; paste = `/spec:plan ${draft.path}`; break }
    if (loose) { head = i; paste = `/spec:queue add ${loose.path}`; break }
  }
  // Every hardened spec nobody queued, in path order: the first is the paste; with more than one, the screen lists them all.
  const unqueued = specs.filter((s) => s.status === 'hardened' && !queued(s.path)).map((s) => s.path).sort()
  if (!head && !running && unqueued.length) paste = `/spec:queue add ${unqueued[0]}`
  const qs = questions(root)

  // ---- readiness: a brief is built enough to plan against when a spec of it is implementing or done ----
  const metOf = (b) => specs.some((s) => s.brief === b.key && (s.status === 'implementing' || s.status === 'done' || live.has(s.path)))
  const depsOf = (b) => b.depends.map((id) => { const t = byKey.get(briefNo(id)); return { brief: id, status: t ? t.state : 'missing', met: !!t && metOf(t) } })

  // ---- open work (D3) ----
  const posOf = (s) => {
    let i = pend.findIndex((x) => x.kind === 'spec' && x.payload === s.path)
    if (i < 0 && s.brief) i = pend.findIndex((x) => x.kind === 'brief' && briefNo(x.payload) === s.brief)
    return i < 0 ? Infinity : i
  }
  const order = (s) => { const i = bs.findIndex((b) => b.key === s.brief); return i < 0 ? Infinity : i }
  const entries = specs.filter((s) => RANK[s.status] !== undefined).map((s) => {
    const blockers = []
    for (const d of s.depends) {
      const t = specs.find((x) => x !== s && (x.path === d || base(x.path) === base(d) || base(x.path, '.md') === base(d, '.md')))
      if (t && t.status !== 'done') blockers.push(t.path)
    }
    const b = byKey.get(s.brief)
    if (s.status === 'draft' && b) for (const d of depsOf(b)) if (!d.met) { const t = byKey.get(briefNo(d.brief)); blockers.push(`brief ${t ? t.num : d.brief} (${d.status})`) }
    return { action: s.status === 'draft' ? '/spec:plan' : '/spec:run', path: s.path, status: s.status, brief: s.brief, blockers: [...new Set(blockers)], queued: queued(s.path), pos: posOf(s), order: order(s) }
  }).sort((a, b) => (a.blockers.length > 0) - (b.blockers.length > 0) || (a.pos === b.pos ? 0 : a.pos < b.pos ? -1 : 1) || RANK[a.status] - RANK[b.status] || (a.order === b.order ? 0 : a.order < b.order ? -1 : 1) || a.path.localeCompare(b.path))
  const free = entries.filter((e) => !e.blockers.length)
  const prompts = pend.filter((i) => i.kind === 'prompt').map((i) => ({ id: i.id, payload: i.payload }))

  // ---- lanes (D5): what /spec:fanout would start ----
  const laneSet = free.filter((e) => e.status === 'hardened' && e.queued).slice(0, cfg.lanes)

  // ---- the top pick (D4) ----
  let top = null; let topEntry = null
  if (fan) top = { action: '/spec:fanout', path: null, blockers: [] }
  else if (running) { top = { action: '/spec:run', path: running.path, blockers: [] }; topEntry = entries.find((e) => e.path === running.path) || null }
  else if (free.length) { topEntry = free[0]; top = { action: topEntry.action, path: topEntry.path, blockers: [] } }
  else {
    const b = bs.find((x) => x.state !== 'superseded' && !x.specCount && depsOf(x).every((d) => d.met))
    if (b) top = { action: '/spec:plan', path: b.file, blockers: [] }
  }
  const shownLanes = fan || running ? [] : laneSet
  const blockedPick = !top && !prompts.length && entries.length ? entries[0] : null

  // ---- after that / blocked (D6) ----
  const num = (key) => (byKey.get(key) || { num: key }).num
  const reason = (e) => {
    if ((fan || running) && laneSet.includes(e)) return fan ? '🤷 waits for the fan-out in flight' : '🤷 waits for the run in flight'
    if (e.brief && laneSet.some((l) => l !== e && l.brief === e.brief)) return `⛓️ shared brief ${num(e.brief)}`
    const eb = byKey.get(e.brief)
    for (const l of laneSet) {
      const lb = byKey.get(l.brief)
      if (!eb || !lb || eb === lb) continue
      if (eb.depends.some((d) => briefNo(d) === lb.key)) return `⛓️ brief ${eb.num} depends on ${lb.num}`
      if (lb.depends.some((d) => briefNo(d) === eb.key)) return `⛓️ brief ${lb.num} depends on ${eb.num}`
    }
    if (e.status === 'hardened' && e.queued) return `🤷 beyond the lane cap (${cfg.lanes})`
    if (e.status === 'hardened') return `🤷 not queued — /spec:queue add ${e.path}`
    if (e.status === 'draft') return '🤷 draft — /spec:plan first'
    return '🤷 implementing — not a fan-out lane'
  }
  const after = free.filter((e) => !shownLanes.includes(e) && !(top && e.path === top.path)).map((e) => ({ action: e.action, path: e.path, reason: reason(e) }))
  const blocked = entries.filter((e) => e.blockers.length).map((e) => ({ action: e.action, path: e.path, blockers: e.blockers }))

  // ---- lane overlap (D5): File Plan paths shared by two admitted lanes ----
  const plan = (e) => { const s = specs.find((x) => x.path === e.path); return s ? s.spec.filePlan.map((f) => f.path) : [] }
  const overlaps = []
  for (let i = 0; i < shownLanes.length; i++) {
    for (let j = i + 1; j < shownLanes.length; j++) {
      const b = plan(shownLanes[j]); const shared = plan(shownLanes[i]).filter((f) => b.includes(f))
      if (shared.length) overlaps.push({ a: shownLanes[i].path, b: shownLanes[j].path, shared })
    }
  }

  // ---- footer (D7) ----
  const findings = hygiene ? doctor.check(root, { probe: false }).findings : []
  const topIsEntry = (top && entries.some((e) => e.path === top.path)) || blockedPick
  const n = entries.length + prompts.length - (topIsEntry ? 1 : 0)
  let glyph; let line
  if (qs.length) { glyph = '🟡'; line = `waiting on you — ${qs.length} pending question${qs.length > 1 ? 's' : ''}` }
  else if (fan) { glyph = '🟢'; line = 'a fan-out is in flight · /spec:fanout' }
  else if (running) { glyph = waiting ? '🟡' : '🟢'; line = `a run is ${waiting ? 'waiting on you' : 'in flight'}${runs.length > 1 ? ` (${runs.length} runs)` : ''} · /spec:run ${running.path}` }
  else if (top || prompts.length) { glyph = '🟢'; line = 'next is ready' }
  else if (entries.length) { glyph = '🟠'; line = `next is blocked · waiting on ${shortBlocker(entries[0].blockers[0])}` }
  else if (paste) { glyph = '🟢'; line = 'next is ready' }
  else { glyph = '⬜'; line = 'nothing waits' }
  const clauses = []
  if (glyph === '🟢') clauses.push(n === 0 ? 'nothing else open' : `${n} more open`)
  else if (n > 0) clauses.push(`${n} more open`)
  if (findings.length) clauses.push(`${findings.length} hygiene finding${findings.length === 1 ? '' : 's'} (/spec:doctor)`)
  const verdict = `${glyph} ${line}${clauses.map((c) => ` · ${c}`).join('')}`

  const res = {
    roadmap: bs.map((b) => ({ brief: b.num, title: b.title, state: b.state, phase: b.phase, done: b.done, total: b.total, name: b.slug })),
    next: fan ? '/spec:fanout' : running ? `/spec:run ${running.path}` : paste,
    lanes: fan ? [] : laneSet.map((e) => e.path), unqueued,
    questions: qs, verdict, prompts, top, after, blocked, hygiene: findings, open: entries.length + prompts.length,
  }
  return { res, view: { shownLanes: shownLanes.map((e) => e.path), overlaps, blockedPick, topInLanes: !!(top && shownLanes.some((e) => e.path === top.path)), fan: !!fan, running: !!running } }
}

const build = (root, opts) => derive(root, opts).res
// Directories and a trailing `(state)` and `.md` dropped: the part of a blocker a person recognises.
const shortBlocker = (b) => b.replace(/\S*\//g, '').replace(/\s*\([^)]*\)$/, '').replace(/\.md$/, '')

function roadmapRows(rm) {
  const ICON = { done: '✅', implementing: '🔨', open: '⬜', superseded: '⛔' }
  const rows = []
  for (let i = 0; i < rm.length; i++) {
    const b = rm[i]
    let j = i
    while (b.state !== 'implementing' && j + 1 < rm.length && rm[j + 1].state === b.state) j++
    if (j > i) {
      const run = rm.slice(i, j + 1)
      const phases = [...new Set(run.map((x) => x.phase).filter(Boolean))]
      const phase = phases.length > 1 ? `${phases[0]}–${phases[phases.length - 1]}` : phases[0] || '—'
      const word = b.state === 'open' ? 'unplanned' : b.state
      const tail = b.state === 'done' ? `done (${run.length} briefs, ${run.reduce((s, x) => s + x.total, 0)} specs)` : `${word} (${run.length} briefs)`
      rows.push({ icon: ICON[b.state], label: `${b.brief}–${run[run.length - 1].brief}`, phase, tail })
      i = j
      continue
    }
    const full = b.done === b.total ? 10 : Math.min(9, Math.floor(b.done / b.total * 10))
    const bar = b.state === 'open' ? 'unplanned' : b.state === 'superseded' || !b.total ? b.state : '▓'.repeat(full).padEnd(10, '░') + ` ${b.done}/${b.total}`
    rows.push({ icon: ICON[b.state], label: `${b.brief} ${b.name}`, phase: b.phase || '—', tail: bar })
  }
  const lw = Math.max(...rows.map((r) => [...r.label].length)); const pw = Math.max(...rows.map((r) => [...r.phase].length))
  const pad = (s, n) => s + ' '.repeat(n - [...s].length)
  return rows.map((r) => `   ${r.icon} ${pad(r.label, lw)}  ${pad(r.phase, pw)}  ${r.tail}`)
}

function render(r, v, all) {
  const L = r.roadmap.length ? ['🗺️ Roadmap', ...roadmapRows(r.roadmap), ''] : []
  const cmd = (e) => `${e.action} @${e.path}`
  const branches = (items) => items.map((x, i) => `   ${i === items.length - 1 ? '└─' : '├─'} ${x}`)
  const blockers = (e) => branches(e.blockers.map((b) => `⏳ ${shortBlocker(b)}`))
  L.push('🎯 Next')
  // A queued prompt can run to hundreds of words: one row, cut to the terminal width, led by its id.
  const width = process.stdout.columns || 100
  const idw = Math.max(0, ...r.prompts.map((p) => p.id.length))
  for (const p of r.prompts) {
    const head = `${p.id.padEnd(idw)}  `; const flat = String(p.payload).replace(/\s+/g, ' ').trim(); const room = Math.max(20, width - head.length)
    L.push(head + (flat.length <= room ? flat : flat.slice(0, room - 1) + '…'))
  }
  const cmds = L.length
  if (v.fan) L.push('/spec:fanout')
  else if (v.running) L.push(cmd(r.top))
  else {
    if (r.top && !v.topInLanes) L.push(`${r.top.action} @${r.top.path}`)
    if (v.shownLanes.length > 1) {
      L.push(`⚡ ${v.shownLanes.length} parallel lanes ready — /spec:fanout`, ...v.shownLanes.map((p) => `/spec:run @${p}`))
      L.push(...branches(v.overlaps.map((o) => `🔶 ${v.shownLanes.length > 2 ? `${base(o.a)} × ${base(o.b)}: ` : ''}merge-conflict risk: ${o.shared.slice(0, 2).join(', ')}${o.shared.length > 2 ? ` (+${o.shared.length - 2} more)` : ''}`)))
    } else if (v.shownLanes.length === 1) {
      L.push(`/spec:run @${v.shownLanes[0]}`)
      if (v.topInLanes && r.open > 1) L.push('   └─ 🚦 solo')
    } else if (v.blockedPick) L.push(cmd(v.blockedPick), ...blockers(v.blockedPick))
  }
  if (L.length === cmds && !r.prompts.length) L.push('   ✨ queue empty')
  // Several hardened specs nobody queued look like an empty queue: name the count and every add line.
  if (r.unqueued.length > 1) L.push(`📥 ${r.unqueued.length} hardened specs are not queued — add each:`, ...r.unqueued.map((p) => `/spec:queue add ${p}`))
  if (all) {
    if (r.after.length) {
      L.push('', '🕓 after that:')
      r.after.forEach((e, i) => { L.push(cmd(e)); if (!r.after[i + 1] || r.after[i + 1].reason !== e.reason) L.push(`   └─ ${e.reason}`) })
    }
    const rest = r.blocked.filter((e) => !(v.blockedPick && e.path === v.blockedPick.path))
    if (rest.length) { L.push('', '⛔ blocked:'); for (const e of rest) L.push(cmd(e), ...blockers(e)) }
  }
  if (r.questions.length) L.push('', '⚠️ Pending questions', ...r.questions.map((x) => `  ${x.lane || 'root'}: ${x.question}`))
  if (all) {
    L.push('', `🧹 Hygiene (${r.hygiene.length}) — /spec:doctor`)
    for (const f of r.hygiene) { const k = f.indexOf(': '); L.push(k < 0 ? `   [doctor] ${f}` : `   [${f.slice(0, k)}] ${f.slice(k + 2)}`) }
  }
  return ['```', ...L, '', r.verdict, '```'].join('\n')
}

// NN: can this brief be planned? Its dependency briefs each need a spec at implementing or done.
function briefReady(root, nn, json) {
  const specs = allSpecs(root); const q = reconcile(root, readQueue(root))
  const bs = briefs(root, specs, q); const b = bs.find((x) => x.key === briefNo(nn))
  if (!b) return { code: 2, err: `status: no brief ${nn} in docs/roadmap/ (${bs.map((x) => x.num).join(', ') || 'none there'}) — run /spec:status for the roadmap` }
  const live = new Set(specs.filter((s) => { const r = readJson(runPath(path.join(root, s.path))); return r && !r.ended }).map((s) => s.path))
  const deps = b.depends.map((id) => {
    const t = bs.find((x) => x.key === briefNo(id))
    return { brief: id, status: t ? t.state : 'missing', met: !!t && specs.some((s) => s.brief === t.key && (s.status === 'implementing' || s.status === 'done' || live.has(s.path))) }
  })
  const ready = deps.every((d) => d.met)
  const unmet = deps.filter((d) => !d.met)
  const out = json ? JSON.stringify({ brief: b.num, name: b.slug, dependencies: deps, ready }, null, 2)
    : `brief ${b.num} (${b.slug}): ${ready ? `all ${deps.length || 'zero'} dependencies met` : `UNMET dependencies — ${unmet.map((d) => `${d.brief} (${d.status})`).join(', ')}`}`
  return { code: ready ? 0 : 1, out }
}

function main(argv) {
  const pos = []; let rootArg = null; const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') rootArg = argv[++i]
    else if (argv[i] === '--json' || argv[i] === '--all') flags[argv[i].slice(2)] = true
    else if (!argv[i].startsWith('--')) pos.push(argv[i])
  }
  const root = path.resolve(rootArg || require('./lib/git').repoRoot(process.cwd()))
  if (pos.length) {
    if (pos.length > 1 || !/^\d+[a-z]?$/.test(pos[0])) { console.error('status: usage: status.js [NN] [--all] [--json] [--root <dir>]'); return 2 }
    const r = briefReady(root, pos[0], flags.json)
    if (r.err) console.error(r.err); else console.log(r.out)
    return r.code
  }
  const { res, view } = derive(root)
  console.log(flags.json ? JSON.stringify(res, null, 2) : render(res, view, flags.all))
  return 0
}

module.exports = { build, main }
if (require.main === module) process.exitCode = main(process.argv.slice(2))
