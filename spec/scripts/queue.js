'use strict'
// queue.js — the session queue CLI: next | list | groom | add | move | done | show. Every item read and write goes
// through lib/queue.js, the queue's one owner; the rows (list, show, groom) are lib/queue-rows.js. The queue a
// reader sees is the file plus the fill (unfinished briefs and open ad-hoc specs), worked out on every read and
// never stored: `move` and `done` on a filled item store that one item (ADR-0044).
const fs = require('fs')
const path = require('path')
const Q = require('./lib/queue')
const R = require('./lib/queue-rows')
const work = require('./lib/work')
const { derive, topLines } = require('./lib/next')

const { BRIEF_RE, briefPath, text } = Q
const refuse = (message) => Object.assign(new Error(message), { exit: 2 })
const FLAGS = { add: ['--json', '--top', '--type', '--after'], groom: [] } // every other subcommand takes --json; all take --root
const WITH_VALUE = ['--root', '--type', '--after']
const sameWork = (a, b) => a.kind === b.kind && (a.kind === 'brief' ? work.normBrief(a.payload) === work.normBrief(b.payload) : a.kind === 'spec' && a.payload === b.payload)

// A brief number names the brief item first (`done 02` closes brief 02, never the 2nd row); a zero-padded ref is
// never a row position, so a brief number with no open item is null for `done` ("nothing queued"). No match or two is a refusal.
function resolve(view, list, ref, root, soft) {
  if (BRIEF_RE.test(ref)) {
    const brief = list.find((i) => i.kind === 'brief' && work.normBrief(i.payload) === work.normBrief(ref))
    if (brief) return brief
    if (/^\d+[a-z]?$/.test(ref) && briefPath(root, ref).startsWith('docs/roadmap/') && !briefPath(root, ref).includes('*')) return null
    if (soft && !/^specs\//.test(ref) && /^0\d/.test(ref)) return null
  }
  if (/^[1-9]\d*$/.test(ref) && list[Number(ref) - 1]) return list[Number(ref) - 1]
  const byId = view.find((i) => i.id === ref)
  if (byId) return byId
  // An id-shaped ref names an id or nothing: another item's text that mentions it is not a match.
  if (/^q\d+$/.test(ref)) throw refuse(`no item matches "${ref}" — run \`/spec:queue list\``)
  const hits = [list.filter((i) => text(i) === ref || path.basename(text(i)) === ref), list.filter((i) => text(i).includes(ref))].find((xs) => xs.length) || []
  if (hits.length > 1) throw refuse(`"${ref}" is ambiguous — matches ${hits.map((m) => m.id || (m.kind === 'brief' ? work.normBrief(m.payload) : m.payload)).join(', ')} — use the id instead`)
  if (!hits.length) throw refuse(`no item matches "${ref}" — run \`/spec:queue list\``)
  return hits[0]
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

function parseArgs(argv) {
  let sub = null
  for (let i = 0; i < argv.length && !sub; i++) { if (WITH_VALUE.includes(argv[i])) i++; else if (!argv[i].startsWith('--')) sub = argv[i] }
  sub = sub || 'next'
  const ok = ['--root', ...(FLAGS[sub] || ['--json'])]
  const flags = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) pos.push(a)
    else if (!ok.includes(a)) throw refuse(`${sub}: unknown flag ${a}`)
    else if (a === '--json' || a === '--top') flags[a.slice(2)] = true
    else if (a === '--root') flags.root = argv[++i]
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw refuse(`${a} needs a value`)
    else flags[a.slice(2)] = argv[++i]
  }
  return { flags, pos }
}

function main(argv) {
  try { return run(argv) } catch (e) {
    if (typeof e.exit !== 'number' && !/not inside a git repository/.test(e.message)) throw e
    console.error('queue: ' + e.message)
    return e.exit || 2
  }
}

function run(argv) {
  const { flags, pos } = parseArgs(argv)
  const root = path.resolve(flags.root || require('./lib/git').repoRoot(process.cwd()))
  const cmd = pos[0] || 'next'
  let arg = pos.slice(1).join(' ')
  const q = Q.reconcile(root, Q.read(root))
  const view = Q.fill(root, q).items
  const list = Q.open({ items: view })
  const out = (line, json) => console.log(flags.json ? JSON.stringify(json ?? line) : line)

  if (cmd === 'next') {
    if (!list.length) return out('✨ queue empty — nothing left undone', { empty: true }), 0
    const c = R.ctxOf(root)
    const head = list.find((i) => !R.gate(c, i) && !R.finished(c, i))
    if (!head) return out(`nothing ready — ${list.length} waiting on after gates or finished briefs`, { empty: false, waiting: list.length }), 0
    const line = head.kind === 'prompt' ? Q.paste(root, head) : topLines(derive(root)).join('\n')
    out(line, { ...head, paste: line })
  } else if (cmd === 'list') {
    const r = R.list(root, q, flags.json)
    console.log(flags.json ? JSON.stringify(r) : r)
  } else if (cmd === 'groom') {
    console.log(R.groom(root, q))
  } else if (cmd === 'add') {
    if (!arg) throw refuse('add needs a payload')
    // `@specs/x.md`, `./specs/x.md` and an absolute path inside root are one spec: store it root-relative.
    const typed = arg.replace(/^@/, '')
    const file = fs.existsSync(path.resolve(root, typed)) || !fs.existsSync(path.resolve(process.cwd(), typed)) ? path.resolve(root, typed) : path.resolve(process.cwd(), typed)
    const relp = path.relative(root, file).split(path.sep).join('/')
    if (/\.md$/.test(arg) && !relp.startsWith('..') && (fs.existsSync(file) || relp.startsWith('specs/'))) arg = relp
    const kind = Q.kindOf(arg)
    if (flags.type !== undefined && (kind !== 'prompt' || !Q.TYPES.includes(flags.type))) throw refuse('--type takes plan, prototype, fix or decide, on a prompt item')
    if (kind === 'spec' && !fs.existsSync(path.join(root, arg))) throw refuse(`add ${arg}: no such spec file — a queued spec path must exist at add time`)
    // A brief is queued once however it is spelled, stored or filled; an ad-hoc spec that is only filled is stored where asked.
    const at = kind === 'brief' ? list.findIndex((i) => i.kind === 'brief' && work.normBrief(i.payload) === work.normBrief(arg))
      : kind === 'spec' ? list.findIndex((i) => i.id && i.kind === 'spec' && i.payload === arg) : -1
    if (at >= 0) throw refuse(`${kind === 'brief' ? 'brief ' + work.normBrief(arg) : arg} is already queued at position ${at + 1} — /spec:queue move ${kind === 'brief' ? work.normBrief(arg) : arg} <n> to reorder it`)
    let after
    if (flags.after !== undefined) {
      after = afterOf(root, flags.after)
      if (!after) throw refuse(`--after target not found: ${flags.after}`)
    }
    const it = Q.add(root, { payload: arg, type: flags.type, after, defaultType: 'plan' }, { top: flags.top })
    if (!it) throw refuse(`duplicate payload already queued: ${arg}`)
    out(`queued ${it.id} (${it.kind}): ${text(it)}`, it)
  } else if (cmd === 'move' || cmd === 'done' || cmd === 'show') {
    const ref = cmd === 'move' ? pos[1] : arg
    if (!ref) throw refuse(`${cmd} needs a <ref>${cmd === 'move' ? ' and <n>' : ''}`)
    const it = resolve(view, list, ref, root, cmd === 'done')
    if (!it && cmd === 'done') return out(`nothing queued for brief ${ref}`, { none: true }), 0
    if (!it) throw refuse(`no item matches "${ref}" — run \`/spec:queue list\``)
    if (cmd === 'show') return console.log(flags.json ? JSON.stringify(it) : R.show(root, it)), 0
    if (it.done) throw refuse(`"${ref}" is already done — nothing to do`)
    if (cmd === 'move') {
      const n = Number(pos[2])
      if (!Number.isInteger(n) || n < 1) throw refuse('move needs a 1-based position')
      // Position n counts the list as printed; only stored items can sit before it, so past them the item lands just after the last one.
      const others = list.filter((i) => i.id && i !== it)
      if (it.id) q.items.splice(q.items.indexOf(it), 1)
      const where = others[n - 1] ? q.items.indexOf(others[n - 1]) : q.items.length
      let id = it.id
      if (id) { q.items.splice(where, 0, it); Q.write(root, q) } else id = Q.place(root, q, it, where).id
      out(`moved ${id} to ${Math.min(n, others.length + 1)}`, { ...it, id })
    } else {
      const id = it.id || Q.place(root, q, it).id
      Q.tick(root, (i) => i.id === id)
      out(`done ${id}: ${text(it)}`, { ...it, id })
      if (Q.pending(root).some((i) => sameWork(i, it))) (flags.json ? console.error : console.log)(`⚠️ ${ref} is still open work, so it stays in the list`)
    }
  } else throw refuse(`unknown subcommand ${cmd}`)
  return 0
}

module.exports = { main }
if (require.main === module) process.exitCode = main(process.argv.slice(2))
