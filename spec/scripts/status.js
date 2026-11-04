'use strict'
// status.js — the four-part status block: roadmap, next (+ parallel lanes), questions, verdict.
const fs = require('fs')
const path = require('path')
const { readQueue, readSpec, readConfig, readJson, runPath } = require('./lib/state')
const { pasteLine, pending, reconcile } = require('./queue')

const ls = (d) => { try { return fs.readdirSync(d) } catch { return [] } }

function allSpecs(root) {
  const out = []
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const p = rel + '/' + e.name
      if (e.isDirectory() && !e.name.endsWith('.run')) walk(p)
      else if (e.isFile() && e.name.endsWith('.md')) {
        try { out.push({ path: p, spec: readSpec(path.join(root, p)) }) } catch { /* unreadable spec: skip */ }
      }
    }
  }
  if (fs.existsSync(path.join(root, 'specs'))) walk('specs')
  return out
}

// In flight = a run sidecar beside the spec or a lane worktree for it; frontmatter only says done.
const inFlight = (root, rel) => fs.existsSync(runPath(path.join(root, rel)))
  || fs.existsSync(path.join(root, '.claude', 'worktrees', 'spec-' + path.basename(rel, '.md')))

function roadmap(root, specs) {
  return ls(path.join(root, 'docs', 'roadmap')).filter((f) => /^\d+[a-z]?-.*\.md$/.test(f) && f !== '00-overview.md').sort().map((f) => {
    const nn = f.split('-')[0]
    const text = fs.readFileSync(path.join(root, 'docs', 'roadmap', f), 'utf8')
    const title = ((/^# +(.+)$/m.exec(text) || [])[1] || f).replace(/^\d+[a-z]?\s*[—–-]\s*/, '')
    const mine = specs.filter((s) => String(s.spec.frontmatter.brief) === nn)
    const state = /^>\s*Superseded by/m.test(text) ? 'superseded'
      : mine.some((s) => s.spec.frontmatter.status === 'done') ? 'done'
        : mine.some((s) => inFlight(root, s.path)) ? 'implementing' : 'open'
    return { brief: nn, title, state }
  })
}

// Same rule as fanout: hardened queue specs in order, kept while their File Plan path sets stay disjoint.
function lanes(root, q, max) {
  const taken = new Set(); const out = []
  for (const it of pending(q).filter((i) => i.kind === 'spec')) {
    let s
    try { s = readSpec(path.join(root, it.payload)) } catch { continue }
    if (s.frontmatter.status !== 'hardened') continue
    const paths = s.filePlan.map((r) => r.path)
    if (out.length >= max || paths.some((p) => taken.has(p))) continue
    paths.forEach((p) => taken.add(p)); out.push(it.payload)
  }
  return out
}

function questions(root) {
  const dirs = [root, ...ls(path.join(root, '.claude', 'worktrees')).map((n) => path.join(root, '.claude', 'worktrees', n))]
  return dirs.map((d) => readJson(path.join(d, '.claude', 'pending-question.json'))).filter((d) => d && !d.answer)
    .map((d) => ({ lane: d.lane, question: d.question }))
}

function build(root) {
  const specs = allSpecs(root); const q = reconcile(root, readQueue(root)); const head = pending(q)[0]
  const parallel = lanes(root, q, readConfig(root).lanes)
  const qs = questions(root)
  const verdict = qs.length ? `🟡 waiting on you — ${qs.length} pending question${qs.length > 1 ? 's' : ''}`
    : head ? `🟢 next is ready · ${pasteLine(root, head)}` : '⚪ queue empty'
  const res = { roadmap: roadmap(root, specs), next: head ? pasteLine(root, head) : null, lanes: parallel, questions: qs, verdict }
  return res
}

function render(r) {
  const icon = { done: '✅', implementing: '🔶', open: '⬜', superseded: '⛔' }
  const L = r.roadmap.length ? ['🗺️ Roadmap', ...r.roadmap.map((b) => `  ${icon[b.state]} ${b.brief}  ${b.title}`), ''] : []
  L.push('🎯 Next')
  L.push(r.next ? `  ${r.next}` : '  queue empty')
  if (r.lanes.length > 1) L.push(`  ⚡ ${r.lanes.length} parallel lanes ready`, ...r.lanes.map((s) => `    /spec:run @${s}`))
  if (r.questions.length) L.push('', '⚠️ Pending questions', ...r.questions.map((x) => `  ${x.lane || 'root'}: ${x.question}`))
  return ['```', ...L, '', r.verdict, '```'].join('\n')
}

function main(argv) {
  const ri = argv.indexOf('--root')
  const root = path.resolve(ri >= 0 ? argv[ri + 1] : process.cwd())
  const r = build(root)
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r))
  return 0
}

module.exports = { build, main }
if (require.main === module) process.exitCode = main(process.argv.slice(2))
