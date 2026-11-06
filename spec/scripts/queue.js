'use strict'
// queue.js — the session queue CLI: next | list | add | move | done | show. Every item read and write goes
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

function main(argv) {
  const flags = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json' || a === '--top') flags[a.slice(2)] = true
    else if (a === '--type' || a === '--after') {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) { console.error(`queue: ${a} needs a value`); return 2 }
      flags[a.slice(2)] = argv[++i]
    } else if (a === '--root') flags.root = argv[++i]
    else pos.push(a)
  }
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
