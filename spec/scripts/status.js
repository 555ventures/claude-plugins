'use strict'
// status.js — the four-part status block: roadmap, next (+ parallel lanes), questions, verdict.
const fs = require('fs')
const path = require('path')
const { readQueue, readSpec, readConfig, readJson, runPath } = require('./lib/state')
const { pasteLine, pending, reconcile, briefNo } = require('./queue')

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

// Done = every spec of the brief is done and its queue item is closed (`/spec:queue done <NN>`),
// so a half-planned brief stays implementing. Any spec at all means implementing.
function roadmap(root, specs, q) {
  const planning = (nn) => pending(q).some((i) => i.kind === 'brief' && briefNo(i.payload) === briefNo(nn))
  return ls(path.join(root, 'docs', 'roadmap')).filter((f) => /^\d+[a-z]?-.*\.md$/.test(f) && f !== '00-overview.md').sort().map((f) => {
    const nn = f.split('-')[0]
    const text = fs.readFileSync(path.join(root, 'docs', 'roadmap', f), 'utf8')
    const title = ((/^# +(.+)$/m.exec(text) || [])[1] || f).replace(/^\d+[a-z]?\s*[—–-]\s*/, '')
    const mine = specs.filter((s) => briefNo(String(s.spec.frontmatter.brief)) === briefNo(nn) && s.spec.frontmatter.status !== 'draft')
    const state = /^>\s*Superseded by/m.test(text) ? 'superseded'
      : !mine.length ? 'open'
        : mine.every((s) => s.spec.frontmatter.status === 'done') && !planning(nn) ? 'done' : 'implementing'
    return { brief: nn, title, state }
  })
}

// Same rule as fanout AUTO: the first `max` hardened queue specs in order, File Plans regardless.
function lanes(root, q, max) {
  const hardened = (p) => { try { return readSpec(path.join(root, p)).frontmatter.status === 'hardened' } catch { return false } }
  return pending(q).filter((i) => i.kind === 'spec' && hardened(i.payload)).map((i) => i.payload).slice(0, max)
}

function questions(root) {
  const dirs = [root, ...ls(path.join(root, '.claude', 'worktrees')).map((n) => path.join(root, '.claude', 'worktrees', n))]
  return dirs.map((d) => readJson(path.join(d, '.claude', 'pending-question.json'))).filter((d) => d && !d.answer)
    .map((d) => ({ lane: d.lane, question: d.question }))
}

function build(root) {
  const specs = allSpecs(root); const q = reconcile(root, readQueue(root))
  // A brief whose specs exist and are not all done is being planned or built: its item is not the next paste.
  const open = (nn) => specs.filter((s) => s.spec.frontmatter.status !== 'done' && briefNo(String(s.spec.frontmatter.brief)) === briefNo(nn))
  const queued = (p) => pending(q).some((i) => i.payload === p)
  let head = null; let paste = null
  for (const i of pending(q)) {
    const mine = i.kind === 'brief' ? open(i.payload) : []
    if (!mine.length) { head = i; paste = pasteLine(root, i); break }
    const draft = mine.find((s) => s.spec.frontmatter.status === 'draft'); const loose = mine.find((s) => s.spec.frontmatter.status === 'hardened' && !queued(s.path))
    if (draft) { head = i; paste = `/spec:plan ${draft.path}`; break }
    if (loose) { head = i; paste = `/spec:queue add ${loose.path}`; break }
  }
  // A run in flight, queued or started by hand, is the thing to finish first.
  const running = specs.find((s) => s.spec.frontmatter.status !== 'done' && fs.existsSync(runPath(path.join(root, s.path))))
  const parallel = lanes(root, q, readConfig(root).lanes)
  const qs = questions(root)
  const verdict = qs.length ? `🟡 waiting on you — ${qs.length} pending question${qs.length > 1 ? 's' : ''}`
    : running ? `🟢 a run is in flight · /spec:run ${running.path}` : head ? `🟢 next is ready · ${paste}` : '⚪ queue empty'
  const res = { roadmap: roadmap(root, specs, q), next: running ? `/spec:run ${running.path}` : paste, lanes: parallel, questions: qs, verdict }
  return res
}

function render(r) {
  const icon = { done: '✅', implementing: '🔶', open: '⬜', superseded: '⛔' }
  const L = r.roadmap.length ? ['🗺️ Roadmap', ...r.roadmap.map((b) => `  ${icon[b.state]} ${b.brief}  ${b.title}`), ''] : []
  L.push('🎯 Next')
  L.push(r.next ? `  ${r.next}` : '  queue empty')
  if (r.lanes.length > 1) L.push(`  ⚡ ${r.lanes.length} parallel lanes ready — /spec:fanout`, ...r.lanes.map((s) => `    /spec:run @${s}`))
  if (r.questions.length) L.push('', '⚠️ Pending questions', ...r.questions.map((x) => `  ${x.lane || 'root'}: ${x.question}`))
  return ['```', ...L, '', r.verdict, '```'].join('\n')
}

function main(argv) {
  const ri = argv.indexOf('--root')
  const root = path.resolve(ri >= 0 ? argv[ri + 1] : require('./lib/git').repoRoot(process.cwd()))
  const r = build(root)
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r))
  return 0
}

module.exports = { build, main }
if (require.main === module) process.exitCode = main(process.argv.slice(2))
