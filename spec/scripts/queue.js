'use strict'
// queue.js — the session queue CLI: next | list | groom | add | move | done | show. Every item read and write goes
// through lib/queue.js, the queue's one owner.
const fs = require('fs')
const path = require('path')
const Q = require('./lib/queue')
const work = require('./lib/work')

const { BRIEF_RE, briefNo, briefPath, text, open: pending } = Q

function age(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '?'
  const m = Math.max(0, (Date.now() - t) / 60000)
  return m < 60 ? Math.floor(m) + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'
}

// A brief number names the brief item first (`done 02` closes brief 02, never the 2nd row); a
// zero-padded ref is never a row position, so a brief that was never queued is "no match".
function resolve(q, ref, root) {
  const list = pending(q)
  const hit = (xs) => (xs.length === 1 ? xs[0] : null)
  const brief = BRIEF_RE.test(ref) && list.find((i) => i.kind === 'brief' && briefNo(i.payload) === briefNo(ref))
  if (brief) return brief
  if (/^\d+[a-z]?$/.test(ref) && briefPath(root, ref).startsWith('docs/roadmap/') && !briefPath(root, ref).includes('*')) return null // a real brief, not queued
  if (/^[1-9]\d*$/.test(ref) && list[Number(ref) - 1]) return list[Number(ref) - 1]
  return q.items.find((i) => i.id === ref) ||
    hit(list.filter((i) => text(i) === ref || path.basename(text(i)) === ref)) ||
    hit(list.filter((i) => text(i).includes(ref)))
}

// `--after` target -> {brief: "NN"} when docs/roadmap/NN-*.md exists, {spec: "specs/…md"} when the file exists, else null.
function afterOf(root, v) {
  const t = String(v).trim().replace(/^@/, '').replace(/^\.\//, '')
  if (/^(?:docs\/roadmap\/)?\d+[a-z]?(?:-[^/]*\.md)?$/i.test(t)) {
    const num = work.normBrief(t)
    return work.readBriefs(root, []).some((b) => b.num === num) ? { brief: num } : null
  }
  const rel = path.relative(root, path.resolve(root, t)).split(path.sep).join('/')
  return /^specs\/.*\.md$/.test(rel) && fs.existsSync(path.join(root, rel)) ? { spec: rel } : null
}

// ---- groom: v7's read-only rot report (stale at 14 days, duplicate at 0.35 Jaccard) on v8 state -----------
const ageDays = (it) => { const t = Date.parse(it.added); return it.added && !Number.isNaN(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null }
const ageText = (it) => (ageDays(it) === null ? '?' : `${ageDays(it)}d`)
const isStale = (it) => it.kind === 'prompt' && !it.after && ageDays(it) !== null && ageDays(it) >= 14
const ROW_WIDTH = () => process.stdout.columns || 100 // 100 off a TTY, so piped output is stable
const oneLine = (s, width) => { const flat = String(s).replace(/\s+/g, ' ').trim(); return flat.length <= width ? flat : flat.slice(0, Math.max(1, width - 1)) + '…' }

function dupPairs(prompts) {
  const pairs = []
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const score = Q.promptDupScore(text(prompts[i]), text(prompts[j]))
      if (score !== null && score >= 0.35) pairs.push({ a: prompts[i], b: prompts[j], score })
    }
  }
  return pairs
}

// v7's pending set on v8 state (first brief/spec occurrence; done, finished brief, finished or absent spec leave),
// then the work nobody queued, in memory: open on-disk briefs, then open ad-hoc specs by path. Never written.
function groom(root, q) {
  const specs = work.readSpecs(root); const briefs = Q.v7Briefs(root, work.readBriefs(root, specs))
  const byNum = new Map(briefs.map((b) => [b.num, b])) // a number two files share reads as the last, as in v7
  const statusOf = new Map(specs.map((s) => [s.path, s.status]))
  const specStatus = (p) => (fs.existsSync(path.join(root, p)) ? statusOf.get(p) || null : null)
  const ctx = { specStatus, specRoot: root }
  const seen = new Set()
  const items = q.items.filter((it) => {
    const key = it.kind + ':' + (it.kind === 'brief' ? work.normBrief(it.payload) : it.payload)
    return it.kind === 'prompt' || !seen.has(key) ? (seen.add(key), true) : false
  })
  const nameOf = (it) => byNum.get(work.normBrief(it.payload))
  const isDone = (it) => !!it.done || (it.kind === 'brief' && (nameOf(it) || {}).status === 'done') ||
    (it.kind === 'spec' && [null, 'done', 'superseded'].includes(specStatus(it.payload)))
  const queued = (kind) => new Set(items.filter((it) => it.kind === kind).map((it) => (kind === 'brief' ? work.normBrief(it.payload) : it.payload)))
  const [qb, qs] = [queued('brief'), queued('spec')]
  const pending = [...items.filter((it) => !isDone(it)),
    ...briefs.filter((b) => b.status !== 'done' && !b.superseded && !qb.has(b.num) && qb.add(b.num)).map((b) => ({ kind: 'brief', payload: b.num })),
    ...specs.filter((s) => !s.brief && !['done', 'superseded'].includes(s.status) && !qs.has(s.path)).sort((a, b) => (a.path < b.path ? -1 : 1)).map((s) => ({ kind: 'spec', payload: s.path }))]
  const cache = { briefs: [...byNum.values()] }
  const desc = (it) => (it.kind === 'brief' ? `brief ${work.normBrief(it.payload)}${nameOf(it) ? ` (${nameOf(it).name})` : ''}` : it.kind === 'spec' ? `spec ${it.payload}` : Q.paste(root, it))
  const prompts = pending.filter((it) => it.kind === 'prompt')
  const rows = (list) => {
    const idW = Math.max(0, ...list.map((it) => (it.id || '—').length)); const ageW = Math.max(0, ...list.map((it) => ageText(it).length))
    return list.map((it) => { const head = `  ${(it.id || '—').padEnd(idW)}  ${ageText(it).padEnd(ageW)}  `; return head + oneLine(desc(it), Math.max(20, ROW_WIDTH() - head.length)) })
  }
  const buckets = [
    ['duplicates', dupPairs(prompts).map((p) => `  ${p.a.id} ~ ${p.b.id}  ${p.score.toFixed(2)}`)],
    ['cites done', rows(prompts.filter((it) => Q.citesDoneSpec(it, ctx)))],
    ['gate met', rows(pending.filter((it) => !!it.after && !work.gateWhy(root, it.after, cache)))],
    ['stale', rows(pending.filter(isStale))],
  ].filter(([, r]) => r.length)
  if (!buckets.length) return `✨ nothing to groom · ${pending.length} pending`
  return [...buckets.flatMap(([name, r]) => [`${name} (${r.length}):`, ...r]), 'fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes'].join('\n')
}

function main(argv) {
  const flags = {}; const pos = []; let noValue = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json' || a === '--top') flags[a.slice(2)] = true
    else if (a === '--type' || a === '--after') {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) noValue = noValue || a
      else flags[a.slice(2)] = argv[++i]
    } else if (a === '--root') flags.root = argv[++i]
    else pos.push(a)
  }
  if (pos[0] === 'groom') {
    // v7 refused every flag on groom; --root is the one every v8 script takes.
    const bad = argv.find((a, i) => /^--/.test(a) && a !== '--root' && argv[i - 1] !== '--root')
    if (bad) { console.error(`queue: groom: unknown flag ${bad}`); return 2 }
  }
  if (noValue) { console.error(`queue: ${noValue} needs a value`); return 2 }
  const root = path.resolve(flags.root || require('./lib/git').repoRoot(process.cwd()))
  const cmd = pos[0] || 'next'
  let arg = pos.slice(1).join(' ')
  let q
  try { q = Q.reconcile(root, Q.read(root)) } catch (e) {
    if (typeof e.exit !== 'number') throw e
    console.error('queue: ' + e.message)
    return e.exit
  }
  const out = (line, json) => console.log(flags.json ? JSON.stringify(json ?? line) : line)
  const fail = (msg, code = 1) => { console.error('queue: ' + msg); return code }
  const list = pending(q)
  const cache = {}
  // The row tag of an unmet gate: `after brief 03` / `after 08-server-timeouts`; null when there is none or it is met.
  const waitsOn = (it) => (work.gateWhy(root, it.after, cache) ? 'after ' + (it.after.brief !== undefined ? 'brief ' + work.normBrief(it.after.brief) : path.basename(it.after.spec || '', '.md')) : null)

  // A brief item whose brief has every spec done (or is superseded) stays queued until the user closes it.
  let briefs
  const finished = (it) => {
    if (it.kind !== 'brief') return null
    briefs = briefs || work.readBriefs(root)
    const b = briefs.find((x) => x.num === work.normBrief(it.payload))
    return b && ['done', 'superseded'].includes(b.status) ? b.status : null
  }
  const closeTail = (it) => {
    const f = finished(it)
    return f ? `  ${f === 'done' ? '✔ specs done' : '⛔ superseded'} — /spec:queue done ${work.normBrief(it.payload)}` : ''
  }

  if (cmd === 'next') {
    if (!list.length) return out('queue empty', { empty: true }), 0
    const head = list.find((i) => !waitsOn(i) && !finished(i))
    if (!head) return out(`nothing ready — ${list.length} waiting on after gates or finished briefs`, { empty: false, waiting: list.length }), 0
    out(Q.paste(root, head), { ...head, paste: Q.paste(root, head) })
  } else if (cmd === 'list') {
    const rows = list.map((it, i) => `${i + 1}  ${it.id}  ${age(it.added)}  ${text(it)}${waitsOn(it) ? '  ⏳ ' + waitsOn(it) : ''}${closeTail(it)}`)
    const done = q.items.length - list.length
    if (flags.json) return console.log(JSON.stringify({ items: list, done })), 0
    console.log([...rows, `— ${done} done`].join('\n'))
  } else if (cmd === 'groom') {
    console.log(groom(root, q))
  } else if (cmd === 'add') {
    if (!arg) return fail('add needs a payload', 2)
    // `@specs/x.md`, `./specs/x.md` and an absolute path inside root are one spec: store it root-relative.
    const typed = arg.replace(/^@/, '')
    const file = fs.existsSync(path.resolve(root, typed)) || !fs.existsSync(path.resolve(process.cwd(), typed)) ? path.resolve(root, typed) : path.resolve(process.cwd(), typed)
    const relp = path.relative(root, file).split(path.sep).join('/')
    if (/\.md$/.test(arg) && !relp.startsWith('..') && fs.existsSync(file)) arg = relp
    if (flags.type !== undefined && (Q.kindOf(arg) !== 'prompt' || !Q.TYPES.includes(flags.type))) return fail('--type takes plan, prototype, fix or decide, on a prompt item', 2)
    let after
    if (flags.after !== undefined) {
      after = afterOf(root, flags.after)
      if (!after) return fail(`--after target not found: ${flags.after}`, 2)
    }
    const it = Q.add(root, { payload: arg, type: flags.type, after, defaultType: 'plan' }, { top: flags.top })
    if (!it) return fail(`duplicate payload already queued: ${arg}`, 2)
    out(`queued ${it.id} (${it.kind}): ${text(it)}`, it)
  } else if (cmd === 'move') {
    const [ref, n] = [pos[1], Number(pos[2])]
    const it = ref && resolve(q, ref, root)
    if (!it) return fail(`no pending item matches "${ref}"`)
    if (!(n >= 1)) return fail('move needs a 1-based position', 2)
    q.items.splice(q.items.indexOf(it), 1)
    const rest = pending(q)
    q.items.splice(rest[n - 1] ? q.items.indexOf(rest[n - 1]) : q.items.length, 0, it)
    Q.write(root, q)
    out(`moved ${it.id} to ${n}`, it)
  } else if (cmd === 'done' || cmd === 'show') {
    const it = resolve(q, arg, root)
    if (!it && cmd === 'done' && BRIEF_RE.test(arg) && !/^specs\//.test(arg) && (/^0\d/.test(arg) || briefPath(root, arg).startsWith('docs/roadmap/'))) return out(`nothing queued for brief ${arg}`, { none: true }), 0
    if (!it) return fail(`no item matches "${arg}"`)
    if (cmd === 'show') return out(text(it), it), 0
    Q.tick(root, (i) => i.id === it.id)
    out(`done ${it.id}: ${text(it)}`, it)
  } else return fail(`unknown subcommand ${cmd}`, 2)
  return 0
}

module.exports = { main }
if (require.main === module) process.exitCode = main(process.argv.slice(2))
