'use strict'
// lib/next.js — "where is the work": v7's derivation on v8's state. Entries and blockers, the read-only queue overlay,
// pairwise lane admission (no cap) and the anomaly catalogue; one derivation for the screen, `queue next`, fanout and
// `--json`. Reads only. No CLI.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const work = require('./work')
const { paste, read, fill } = require('./queue')
const { busy, laneOf } = require('./queue-rows')

const KNOWN = ['draft', 'hardened', 'implementing', 'done']
const RANK = { implementing: 0, hardened: 1, draft: 2 }
const done = (s) => s === 'done'
const landed = (s) => s === 'done' || s === 'implementing'

// Directories, a trailing `(state)` and `.md` dropped: the part of a blocker a person recognises.
const shortBlocker = (b) => b.replace(/\S*\//g, '').replace(/\s*\([^)]*\)$/, '').replace(/\.md$/, '')

// The queue for the overlay (both stores plus the fill): off in a linked worktree or with no git; a refusal of
// lib/queue.js is `parseError`, and `old` (it names /spec:migrate) lets the screen offer the migration.
function overlay(root) {
  const git = (arg) => { const r = spawnSync('git', ['-C', root, 'rev-parse', arg], { encoding: 'utf8' }); return r.error || r.status !== 0 ? null : r.stdout.trim() }
  const common = git('--git-common-dir'); const dir = git('--git-dir')
  if (common === null || dir === null || path.resolve(root, common) !== path.resolve(root, dir)) return { on: false }
  try { return { on: true, q: read(root) } } catch (e) {
    if (typeof e.exit !== 'number') throw e
    return { on: false, parseError: e.message, ...(e.old ? { old: true } : {}) }
  }
}

// The queue the screen reads: both stores, reconciled and filled in memory. A done row gives no position and no gate.
const virtualQueue = (root, q) => fill(root, q).items.filter((i) => !i.done)

function derive(root) {
  const all = work.readSpecs(root)
  const retired = all.filter((s) => s.status === 'superseded')
  const specs = all.filter((s) => s.status !== 'superseded')
  const briefs = work.readBriefs(root, all)
  const byNum = new Map(briefs.map((b) => [b.num, b]))
  const anomalies = []
  const note = (a) => anomalies.push({ ...a, audience: a.line ? 'decide' : 'hygiene' })

  const ov = overlay(root)
  const posBrief = new Map(); const posSpec = new Map(); const gateBrief = new Map(); const gateSpec = new Map()
  const prompts = []
  if (ov.parseError) {
    note({ kind: 'queue-unparseable', detail: `${ov.parseError} — the session queue overlay is disabled until this is fixed${/\/spec:migrate$/.test(ov.parseError) ? '' : ' (or the file removed and reseeded with `/spec:queue next`)'}`,
      ...(ov.old ? { line: 'The queue file is an old version, so this screen ignores it.', ask: 'Migrate it?', paste: '/spec:migrate' } : {}) })
  }
  if (ov.on) {
    const cache = { briefs }
    virtualQueue(root, ov.q).forEach((it, i) => {
      const num = it.kind === 'brief' ? work.normBrief(it.payload) : null
      if (num !== null) {
        posBrief.set(num, i)
        if (!byNum.has(num) && !it.done) note({ kind: 'queue-orphan', detail: `spec-queue.json item points at brief ${num}, which has no docs/roadmap/${num}-*.md — remove it with \`/spec:queue done ${num}\`, reorder it away with \`/spec:queue move ${num} <n>\`, or restore the brief file` })
        const own = byNum.get(num)
        if (own && !it.done && own.status === 'done') { // no open step: it reads done and never gets here
          const line = `Brief ${num} (${own.name}) has every spec done; ${own.open.length} step(s) outside specs ` +
            'are still open.'
          note({ kind: 'brief-done-queued', detail: line, line, ask: 'Close it?', paste: `/spec:queue done ${num}` })
        }
      } else if (it.kind === 'spec') posSpec.set(it.payload, i)
      const why = work.gateWhy(root, it.after, cache)
      if (it.kind === 'brief') { if (why) gateBrief.set(num, 'after ' + why) } else if (it.kind === 'spec') { if (why) gateSpec.set(it.payload, 'after ' + why) } else if (it.kind === 'prompt' && !it.done) {
        prompts.push({ action: paste(root, it), path: null, status: 'queued', brief: null, blockers: why ? ['after ' + why] : [], rank: 0, queue: true, pos: i, id: it.id, working: busy([], it.type === 'fix' ? laneOf(root, it.id) : null) })
      }
    })
  }

  for (const s of specs) {
    if (!KNOWN.includes(s.status)) note({ kind: 'unknown-status', detail: `${s.path} has status: ${s.status} — not in the spec lifecycle (${KNOWN.join(' → ')}); fix the frontmatter (to retire a preserved spec: status: superseded)` })
  }
  for (const s of specs) {
    if (s.brief && !byNum.has(s.brief)) note({ kind: 'orphan-stamp', detail: `${s.path} stamps brief: ${s.brief} but no docs/roadmap/${s.brief}-*.md exists (brief renamed/deleted, or typo)` })
  }
  for (const b of briefs) for (const r of b.dep_rejects) note({ kind: 'unparsed-dependency', detail: `${b.file} Depends on: item "${r}" is not a brief id (NN or NNa) — ignored; if it names a spec-level gate, move it into the brief body` })
  for (const b of briefs) {
    if (b.status === 'unplanned' || b.status === 'superseded') continue
    for (const d of b.depends_on) {
      const dep = byNum.get(d)
      if (!dep) note({ kind: 'unknown-dependency', detail: `${b.file} depends on brief ${d}, which doesn't exist` })
      else if (dep.status === 'unplanned') {
        note({
          kind: 'skipped-brief',
          detail: `brief ${b.num} (${b.name}) is ${b.status} but its dependency ${d} (${dep.name}) is unplanned — likely skipped; plan it with /spec:plan ${dep.file}`,
          line: `Brief ${b.num} (${b.name}) moved on, but its dependency ${d} (${dep.name}) was never planned.`, ask: 'Plan it now?', paste: `/spec:plan @${dep.file}`,
        })
      }
    }
  }
  const moved = briefs.filter((b) => b.status !== 'unplanned' && b.status !== 'superseded')
  if (moved.length) {
    const maxMoved = moved.reduce((m, b) => (work.briefOrd(b.num) > work.briefOrd(m.num) ? b : m)).num
    for (const b of briefs) {
      if (b.status === 'unplanned' && work.briefOrd(b.num) < work.briefOrd(maxMoved) && !anomalies.some((a) => a.detail.includes(`dependency ${b.num} `))) {
        note({
          kind: 'out-of-order',
          detail: `brief ${b.num} (${b.name}) is unplanned while later brief ${maxMoved} has moved — deliberate reordering or a skip; if it still matters: /spec:plan ${b.file}`,
          line: `Brief ${b.num} (${b.name}) is unplanned while later brief ${maxMoved} has moved on.`, ask: 'Still wanted?', paste: `/spec:plan @${b.file}`,
        })
      }
    }
  }
  // A dependency ref resolves against the live specs by file name, then by path; a retired spec never blocks.
  const byTail = new Map(specs.map((s) => [path.basename(s.path), s]))
  const specDep = (ref) => byTail.get(path.basename(ref)) || specs.find((x) => x.path === ref || x.path.endsWith('/' + ref))
  for (const s of specs) {
    if (!done(s.status)) continue
    for (const d of s.depends_on) {
      const dep = specDep(d)
      if (dep && !done(dep.status)) note({ kind: 'skipped-spec', detail: `${s.path} is done but its dependency ${dep.path} is still ${dep.status}` })
    }
  }
  const overview = path.join(root, 'docs', 'roadmap', '00-overview.md')
  if (fs.existsSync(overview)) {
    const rows = fs.readFileSync(overview, 'utf8').split('\n').filter((l) => /^\|\s*\d+[A-Za-z]?\s*\|/.test(l))
    const STATUSY = /^(?:[✅✔❌🟢🟠]\s*)?(planned|unplanned|done|in.?progress|in.?flight|shipped|completed?|wip|todo)[.!]?$|^[✅✔❌🟢🟠]$/i
    const cells = rows.flatMap((l) => l.split('|').map((c) => c.trim())).filter((c) => STATUSY.test(c))
    if (cells.length) note({ kind: 'hand-tracked-status', detail: `docs/roadmap/00-overview.md Sequence table carries hand-tracked status cell(s): ${[...new Set(cells)].join(', ')} — statuses live only in this derivation; strip that column` })
  }

  const entries = []
  for (const s of specs) {
    if (done(s.status) || !KNOWN.includes(s.status)) continue
    // `deps`: the live specs this one still waits on, the one dependency rule fanout reads too.
    const deps = s.depends_on.map(specDep).filter((dep) => dep && !done(dep.status))
    const blockers = deps.map((dep) => `${dep.path} (${dep.status})`)
    const b = s.brief && byNum.get(s.brief)
    if (s.status === 'draft' && b) {
      for (const d of b.depends_on) {
        const dep = byNum.get(d)
        if (!dep || !dep.specs.some((x) => landed(x.status))) blockers.push(`brief ${d} (${dep ? dep.status : 'missing'})`)
      }
    }
    if (gateSpec.has(s.path)) blockers.push(gateSpec.get(s.path))
    else if (s.brief && gateBrief.has(s.brief)) blockers.push(gateBrief.get(s.brief))
    entries.push({
      action: s.status === 'draft' ? '/spec:plan' : '/spec:run', path: s.path, status: s.status, brief: s.brief,
      deps: deps.map((dep) => ({ path: dep.path, status: dep.status })), blockers,
      rank: RANK[s.status], working: busy([s.status]),
    })
  }
  entries.push(...prompts)
  const pos = (e) => {
    if (!ov.on) return 0
    if (e.queue) return e.pos
    if (e.path && posSpec.has(e.path)) return posSpec.get(e.path)
    return e.brief && posBrief.has(e.brief) ? posBrief.get(e.brief) : Infinity
  }
  const ord = (e) => (e.brief ? work.briefOrd(e.brief) : Infinity)
  // `a - b` on two Infinity values is NaN, which falls through to the next key.
  entries.sort((a, b) => (a.blockers.length ? 1 : 0) - (b.blockers.length ? 1 : 0) || pos(a) - pos(b) || a.rank - b.rank || ord(a) - ord(b) || (a.path || '').localeCompare(b.path || ''))

  // No entry startable: the first unplanned brief whose dependencies have landed is the pick.
  const ready = briefs.filter((b) => b.status === 'unplanned' && b.depends_on.every((d) => { const dep = byNum.get(d); return dep && dep.specs.some((x) => landed(x.status)) }))
    .sort((a, b) => work.briefOrd(a.num) - work.briefOrd(b.num))
  if (ready.length && !entries.some((e) => !e.blockers.length)) {
    entries.unshift({ action: '/spec:plan', path: ready[0].file, status: 'unplanned', brief: ready[0].num, blockers: [], rank: -1 })
  }

  // Why two different briefs run in order, or null: the roadmap dependency path either way.
  const depPath = (a, b) => {
    const seen = new Set(); const stack = [...((byNum.get(a) || { depends_on: [] }).depends_on)]
    while (stack.length) {
      const d = stack.pop()
      if (d === b) return true
      if (seen.has(d)) continue
      seen.add(d)
      const dep = byNum.get(d)
      if (dep) stack.push(...dep.depends_on)
    }
    return false
  }
  const serial = (a, b) => {
    if (!a.brief || !b.brief) return null
    if (a.brief === b.brief) return `shared brief ${a.brief}`
    return depPath(a.brief, b.brief) ? `brief ${a.brief} depends on ${b.brief}` : depPath(b.brief, a.brief) ? `brief ${b.brief} depends on ${a.brief}` : null
  }
  const top = entries[0] && entries[0].queue ? entries.find((e) => !e.queue && !e.blockers.length) : entries[0]
  if (top && !top.blockers.length) {
    for (const e of entries.slice(1)) {
      if (e === top || e.blockers.length || e.queue) continue
      const reason = serial(e, top)
      if (reason) { e.parallel = false; e.parallelReason = reason } else e.parallel = true
    }
  }
  return { specs, retired, briefs, anomalies, entries, serial, ...laneAdmission(entries, serial), nothing: nothingNextLine(specs, briefs) }
}

// Pairwise-greedy over unblocked non-prompt entries: a parallel runner-up joins unless it is serial
// with a lane admitted after the first. No cap.
function laneAdmission(entries, serial) {
  const unblocked = entries.filter((e) => !e.blockers.length && !e.queue)
  const blocked = entries.filter((e) => e.blockers.length)
  const lanes = unblocked.length ? [unblocked[0]] : []
  const laneClash = new Map()
  for (const e of unblocked.slice(1)) {
    if (e.parallel !== true) continue
    const clash = lanes.slice(1).find((l) => serial(e, l))
    if (clash) laneClash.set(e, serial(e, clash)); else lanes.push(e)
  }
  return { unblocked, blocked, lanes, laneClash, later: unblocked.slice(1).filter((e) => !lanes.includes(e)) }
}

// `queue next` for a spec or brief head: v7's `--next` render of the derivation's top pick, `<action> @<path>` and its
// blockers.
function topLines(d) {
  const top = d.entries[0]
  if (!top) return [`✨ ${d.nothing}`]
  return [top.path ? `${top.action} @${top.path}` : top.action, ...top.blockers.map((b, i) => `   ${i === top.blockers.length - 1 ? '└─' : '├─'} ⏳ ${b}`)]
}

function nothingNextLine(specs, briefs) {
  const unplanned = briefs.filter((b) => b.status === 'unplanned').length
  return !specs.length && !unplanned ? 'nothing next — no specs or briefs found'
    : unplanned ? `nothing actionable — all specs done; ${unplanned} unplanned brief(s) blocked on unmet dependencies`
      : 'nothing next — all specs done, no unplanned briefs'
}

module.exports = { derive, shortBlocker, topLines }
