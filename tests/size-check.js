'use strict'
// The v8 size caps (docs/v8/architecture.md §0) as a gate, run before the suite by `npm test`.
// A file over its cap is pinned at its size in tests/size.json; a pin can only go down, so a
// feature on a pinned file is paid for by a deletion in that file. Tests never read prose.
// No flags, no overrides: the pins are the only exemption, and they only shrink.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'))
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tests/size.json'), 'utf8'))
const PROSE = /(?:commands|agents)\/[\w.-]+\.md|doctrine\.md|docs\/v8\//g
const lines = (t) => t.split('\n').length - (t.endsWith('\n') ? 1 : 0)
const glob = (g) => new RegExp('^' + g.replace(/\./g, '\\.').replace('*', '[^/]+') + '$')
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === 'fixtures' || e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]) : []

function base() {
  try {
    const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    let ref = 'HEAD'
    try { ref = git('merge-base', 'HEAD', 'main') } catch { /* no main: compare with HEAD */ }
    return JSON.parse(git('show', `${ref}:tests/size.json`))
  } catch { return null }
}

const red = []
const seen = { pinned: new Set(), prose: new Set() }
const check = (key, n, cap, table, word) => {
  const pin = cfg[table][key]
  if (pin !== undefined) seen[table].add(key)
  const limit = pin ?? cap
  if (n > limit) red.push(`${key} ${n} > ${pin !== undefined ? 'pin' : 'cap'} ${limit}${word} — cut, do not raise`)
  else if (pin !== undefined && n <= cap) red.push(`${key} ${n} is within cap ${cap} — delete its ${table} pin`)
  else if (pin !== undefined && n < pin) red.push(`${key} ${n} < pin ${pin}${word} — lower the pin to ${n}`)
}

const totals = Object.fromEntries(Object.keys(cfg.totals).map((k) => [k, 0]))
for (const file of [...walk(path.join(root, 'spec')), ...walk(path.join(root, 'tests'))]) {
  const rel = path.relative(root, file).split(path.sep).join('/')
  const text = fs.readFileSync(file, 'utf8')
  const cap = Object.entries(cfg.caps).find(([g]) => glob(g).test(rel))
  if (cap) check(rel, lines(text), cap[1], 'pinned', '')
  if (/\.js$/.test(rel)) for (const t of Object.keys(totals)) if (rel.startsWith(t) && (t !== 'tests/' || /\.test\.js$/.test(rel))) totals[t] += lines(text)
  if (/^tests\/[^/]+\.test\.js$/.test(rel)) check(rel, (text.match(PROSE) || []).length, 0, 'prose', ' prose references')
}
for (const [t, n] of Object.entries(totals)) check(t, n, cfg.totals[t], 'pinned', ' total lines')
for (const table of ['pinned', 'prose']) for (const k of Object.keys(cfg[table])) if (!seen[table].has(k)) red.push(`${k} is gone — delete its ${table} pin`)

const was = base()
if (was) {
  for (const table of ['pinned', 'prose', 'caps', 'totals']) for (const [k, v] of Object.entries(cfg[table])) {
    if (!(k in (was[table] || {}))) { if (table === 'pinned' || table === 'prose') red.push(`${k} gained a new ${table} pin — cut it under its cap instead`) }
    else if (v > was[table][k]) red.push(`${k} ${table} raised ${was[table][k]} → ${v} — limits only go down`)
  }
}

if (red.length) { process.stderr.write(`size-check: ${red.length} over\n` + red.map((r) => `  ${r}\n`).join('')); process.exit(1) }
process.stdout.write('size-check: ok\n')
