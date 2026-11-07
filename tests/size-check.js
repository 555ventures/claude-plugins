'use strict'
// The v8 size caps (docs/v8/architecture.md §0) as a gate, run before the suite by `npm test`.
// A file over its cap may not grow past its size where this branch left main (the merge-base),
// so a feature on an over-cap file is paid for by a deletion in that file. The same holds for
// the totals and for tests reading prose. Git is the record: there is no pin to edit.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'))
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tests/size.json'), 'utf8'))
const PROSE = /(?:commands|agents)\/[\w.-]+\.md|doctrine\.md|docs\/v8\//g
const lines = (t) => t.split('\n').length - (t.endsWith('\n') ? 1 : 0)
const glob = (g) => new RegExp('^' + g.replace(/\./g, '\\.').replace('*', '[^/]+') + '$')
const keep = (rel) => /^(spec|tests)\//.test(rel) && !/\/(fixtures|node_modules)\//.test(rel)
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []

// Every kept file's text at the merge-base with main (HEAD when there is no main), or null without git.
function baseTexts() {
  try {
    const git = (a, input) => execFileSync('git', ['-C', root, ...a], { input, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 1 << 28 })
    let ref = 'HEAD'
    try { ref = git(['merge-base', 'HEAD', 'main']).toString().trim() } catch { /* no main */ }
    const files = git(['ls-tree', '-r', '--name-only', ref, '--', 'spec', 'tests']).toString().split('\n').filter((f) => f && keep(f))
    const out = git(['cat-file', '--batch'], files.map((f) => `${ref}:${f}`).join('\n') + '\n')
    const texts = new Map(); let at = 0
    for (const f of files) { // each object: "<sha> blob <size>\n<bytes>\n"
      const nl = out.indexOf(10, at); const size = Number(out.subarray(at, nl).toString().split(' ')[2])
      texts.set(f, out.subarray(nl + 1, nl + 1 + size).toString('utf8')); at = nl + 1 + size + 1
    }
    return texts
  } catch { return null }
}

function measure(texts) {
  const m = { file: {}, prose: {}, total: Object.fromEntries(Object.keys(cfg.totals).map((k) => [k, 0])) }
  for (const [rel, text] of texts) {
    if (Object.keys(cfg.caps).some((g) => glob(g).test(rel))) m.file[rel] = lines(text)
    for (const t of Object.keys(m.total)) if (rel.startsWith(t) && (t === 'tests/' ? /\.test\.js$/ : /\.js$/).test(rel)) m.total[t] += lines(text)
    if (/^tests\/[^/]+\.test\.js$/.test(rel)) m.prose[rel] = (text.match(PROSE) || []).length
  }
  return m
}

const now = measure(new Map(walk(path.join(root, 'spec')).concat(walk(path.join(root, 'tests')))
  .map((f) => [path.relative(root, f).split(path.sep).join('/'), f]).filter(([r]) => keep(r)).map(([r, f]) => [r, fs.readFileSync(f, 'utf8')])))
const bt = baseTexts()
const was = bt && measure(bt)
const red = []
const check = (table, key, cap, what) => {
  const n = now[table][key]
  if (n <= cap) return
  const before = was ? was[table][key] : undefined
  if (before === undefined) red.push(`${key} ${n}${what} > cap ${cap} — cut it under the cap`)
  else if (n > before) red.push(`${key} ${n}${what} > ${before} at the merge-base (cap ${cap}) — cut, do not grow`)
}
for (const key of Object.keys(now.file)) check('file', key, cfg.caps[Object.keys(cfg.caps).find((g) => glob(g).test(key))], '')
for (const key of Object.keys(now.total)) check('total', key, cfg.totals[key], ' total lines')
for (const key of Object.keys(now.prose)) check('prose', key, 0, ' prose references')

if (red.length) { process.stderr.write(`size-check: ${red.length} over\n` + red.map((r) => `  ${r}\n`).join('')); process.exit(1) }
process.stdout.write('size-check: ok\n')
