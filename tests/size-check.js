'use strict'
// The v8 size caps (docs/v8/architecture.md §0, ADR-0047) as a gate, run before the suite by `npm test`.
// Capped files and the spec/scripts/ total count bytes: joining lines saves none. A file or total past its cap
// is green only on a tests/size.json `over` entry whose `by` names a locked spec Decision naming that path.
// A spec/scripts line over 120 characters is red unless the same file held it at the merge-base with main.
// Test files over their line cap warn; a test reading more prose than at the merge-base is red.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'))
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tests/size.json'), 'utf8'))
const PROSE = /(?:commands|agents)\/[\w.-]+\.md|doctrine\.md|docs\/v8\//g
const TESTS = 'tests/*.test.js'
const WIDTH = 120
const lines = (t) => t.split('\n').length - (t.endsWith('\n') ? 1 : 0)
const glob = (g) => new RegExp('^' + g.replace(/\./g, '\\.').replace('*', '[^/]+') + '$')
const keep = (rel) => /^(spec|tests)\//.test(rel) && !/\/(fixtures|node_modules)\//.test(rel)
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []

// Every kept file's text at the merge-base with main (HEAD when there is no main); empty without git.
function baseTexts() {
  try {
    const git = (a, input) => execFileSync('git', ['-C', root, ...a],
      { input, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 1 << 28 })
    let ref = 'HEAD'
    try { ref = git(['merge-base', 'HEAD', 'main']).toString().trim() } catch { /* no main */ }
    const files = git(['ls-tree', '-r', '--name-only', ref, '--', 'spec', 'tests']).toString()
      .split('\n').filter((f) => f && keep(f))
    const out = git(['cat-file', '--batch'], files.map((f) => `${ref}:${f}`).join('\n') + '\n')
    const texts = new Map(); let at = 0
    for (const f of files) { // each object: "<sha> blob <size>\n<bytes>\n"
      const nl = out.indexOf(10, at); const size = Number(out.subarray(at, nl).toString().split(' ')[2])
      texts.set(f, out.subarray(nl + 1, nl + 1 + size).toString('utf8')); at = nl + 1 + size + 1
    }
    return texts
  } catch { return new Map() }
}

const capOf = (rel) => Object.keys(cfg.caps).find((g) => glob(g).test(rel))
const texts = new Map(walk(path.join(root, 'spec')).concat(walk(path.join(root, 'tests')))
  .map((f) => [path.relative(root, f).split(path.sep).join('/'), f]).filter(([r]) => keep(r))
  .map(([r, f]) => [r, fs.readFileSync(f, 'utf8')]))
const base = baseTexts()
const red = []
const warn = []

// Why an `over` entry does not hold a key of `n` bytes, or null when it does.
function overFails(key, n) {
  const e = (cfg.over || {})[key]
  if (!e) return 'stop and say so: growth past a cap is a Decision the user locks (a tests/size.json over entry)'
  const fail = (why) => `over entry ${key}: ${why}`
  if (!(Number(e.bytes) >= n)) return fail(`bytes ${e.bytes} < ${n}`)
  const m = /^(\S+\.md) (D\d+[a-z]?)$/.exec(String(e.by || ''))
  if (!m) return fail(`by "${e.by}" is not "specs/<spec>.md Dn"`)
  const file = path.join(root, m[1])
  if (!fs.existsSync(file)) return fail(`${m[1]} is not on disk`)
  const doc = fs.readFileSync(file, 'utf8')
  const front = (/^---\n([\s\S]*?)\n---/.exec(doc) || [])[1] || ''
  const status = (/^status:\s*(\S+)/m.exec(front) || [])[1]
  if (!status || status === 'draft') return fail(`${m[1]} is ${status ? 'a draft' : 'without a status'}`)
  const sec = /^## Decisions[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(doc)
  if (!sec) return null // a done spec's stub (20261107/01): its body left disk, the entry stands on its record
  const row = sec[1].split('\n').find((l) => new RegExp(`^(?:\\|\\s*|-\\s+)${m[2]}\\b`).test(l.trim()))
  if (!row) return fail(`${m[1]} has no row ${m[2]}`)
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`(?<![\\w/.-])${esc}(?![\\w${key.endsWith('/') ? '.' : ''}-])`).test(row)) {
    return fail(`row ${m[2]} of ${m[1]} does not name ${key}`)
  }
  return null
}
const capped = (key, n, cap) => {
  if (n <= cap) return
  const why = overFails(key, n)
  if (why) red.push(`${key} ${n} bytes > cap ${cap} — ${why}`)
}

// Bytes of every capped file but a test file (lines), and of each total's .js files.
function measure(texts) {
  const m = { bytes: {}, lines: {}, total: Object.fromEntries(Object.keys(cfg.totals || {}).map((k) => [k, 0])) }
  for (const [rel, text] of texts) {
    const g = capOf(rel)
    if (g === TESTS) m.lines[rel] = lines(text)
    else if (g) m.bytes[rel] = Buffer.byteLength(text)
    for (const t of Object.keys(m.total)) if (rel.startsWith(t) && /\.js$/.test(rel)) m.total[t] += Buffer.byteLength(text)
  }
  return m
}

const now = measure(texts)
for (const [rel, n] of Object.entries(now.bytes)) capped(rel, n, cfg.caps[capOf(rel)])
for (const [rel, n] of Object.entries(now.lines)) {
  if (n > cfg.caps[TESTS]) warn.push(`${rel} ${n} lines > ${cfg.caps[TESTS]} — split it by behaviour`)
}
for (const [key, n] of Object.entries(now.total)) capped(key, n, cfg.totals[key])
for (const [rel, text] of texts) {
  if (/^spec\/scripts\/.+\.js$/.test(rel)) {
    const was = new Set((base.get(rel) || '').split('\n'))
    text.split('\n').forEach((l, i) => {
      const w = [...l].length
      if (w > WIDTH && !was.has(l)) red.push(`${rel}:${i + 1} ${w} > ${WIDTH} characters — wrap it`)
    })
  }
  if (/^tests\/[^/]+\.test\.js$/.test(rel)) {
    const n = (text.match(PROSE) || []).length
    const before = base.has(rel) ? (base.get(rel).match(PROSE) || []).length : undefined
    if (n > 0 && before === undefined) red.push(`${rel} ${n} prose references > cap 0 — test behaviour, not prose`)
    else if (n > 0 && n > before) red.push(`${rel} ${n} prose references > ${before} at the merge-base — test behaviour, not prose`)
  }
}

if (warn.length) process.stdout.write(warn.map((w) => `size-check: ⚠️ ${w}\n`).join(''))
if (red.length) { process.stderr.write(`size-check: ${red.length} over\n` + red.map((r) => `  ${r}\n`).join('')); process.exit(1) }
process.stdout.write('size-check: ok\n')
