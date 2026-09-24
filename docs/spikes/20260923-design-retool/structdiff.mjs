// usage: node structdiff.mjs a.json b.json  -> one entry per (path, field) that differs
import { readFileSync } from 'node:fs'
const [a, b] = process.argv.slice(2).map((f) => new Map(JSON.parse(readFileSync(f, 'utf8')).map((r) => [r.path, r])))
const diffs = []
for (const [p, ra] of a) {
  const rb = b.get(p)
  if (!rb) { diffs.push(`${p}: REMOVED`); continue }
  if (ra.tag !== rb.tag) diffs.push(`${p}: tag ${ra.tag} -> ${rb.tag}`)
  if (ra.box.join() !== rb.box.join()) diffs.push(`${p} <${ra.tag}>: box ${ra.box} -> ${rb.box}`)
  for (const k of Object.keys(ra.styles)) if (ra.styles[k] !== rb.styles[k]) diffs.push(`${p} <${ra.tag}>: ${k} ${ra.styles[k]} -> ${rb.styles[k]}`)
}
for (const p of b.keys()) if (!a.has(p)) diffs.push(`${p}: ADDED`)
console.log(diffs.length + ' diff entries')
for (const d of diffs) console.log('  ' + d)
