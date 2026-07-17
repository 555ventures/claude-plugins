#!/usr/bin/env node
'use strict'
// parity-check.js <file...> — cross-artifact representation parity within ONE plane.
//
// Treats every file it is given as a single representational plane: the caller decides what
// belongs together (the contracts seam + its ADR rows, a callback payload + its consumer
// mirror) and invokes once per plane. Per-surface casing across planes is a legitimate,
// ADR-owned decision — this lint never sees across invocations, so it cannot flag it.
//
// Two checks, both string-level (PRAX-20260717-01):
//   1. Identifier spelling parity — the same multi-word identifier appearing in more than
//      one word-structure (runId vs run_id) within the plane. Case-only variation
//      (RunEvent vs runEvent) is conventional and passes.
//   2. Wire timestamp form — `Z` and `±00:00` are two spellings of the same instant form;
//      a plane uses one.
//
// Markdown files contribute only their backtick spans and fenced code blocks (prose is not
// a representation surface). Exit 1 with findings, 0 when the plane is coherent.

const fs = require('fs')
const path = require('path')

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: parity-check.js <file...>   (all files = one representational plane)')
  process.exit(2)
}

// content that counts as representation surface, per file
function surface(file) {
  const text = fs.readFileSync(file, 'utf8')
  if (!/\.(md|markdown)$/i.test(file)) return text
  const parts = []
  for (const m of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) parts.push(m[1])
  for (const m of text.matchAll(/`([^`\n]+)`/g)) parts.push(m[1])
  return parts.join('\n')
}

// multi-word identifiers only: an internal underscore or an internal case boundary
const IDENT = /[A-Za-z][A-Za-z0-9_]{2,}/g
function isMultiWord(tok) {
  const inner = tok.slice(1, -1)
  return inner.includes('_') || /[a-z][A-Z]/.test(tok)
}
// group key: word structure erased; variant key: structure kept, case erased
const norm = t => t.toLowerCase().replace(/_/g, '')
const variant = t => t.toLowerCase()

const spellings = new Map() // norm -> Map(variant -> Set(file))
const stampForms = new Map() // 'Z' | '+00:00' -> Set(file)

for (const file of files) {
  const text = surface(file)
  for (const tok of text.match(IDENT) || []) {
    if (!isMultiWord(tok)) continue
    const k = norm(tok)
    if (!spellings.has(k)) spellings.set(k, new Map())
    const v = spellings.get(k)
    if (!v.has(variant(tok))) v.set(variant(tok), new Set())
    v.get(variant(tok)).add(file)
  }
  for (const m of text.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]00:00)/g)) {
    const form = m[1] === 'Z' ? 'Z' : '+00:00'
    if (!stampForms.has(form)) stampForms.set(form, new Set())
    stampForms.get(form).add(file)
  }
}

const findings = []
const rel = f => path.relative(process.cwd(), f) || f

for (const [, variants] of spellings) {
  if (variants.size < 2) continue
  const parts = [...variants.entries()]
    .map(([v, fset]) => `\`${v}\` (${[...fset].map(rel).join(', ')})`)
  findings.push(`identifier spelled ${variants.size} ways in one plane: ${parts.join(' vs ')}`)
}

if (stampForms.size > 1) {
  const parts = [...stampForms.entries()]
    .map(([form, fset]) => `\`${form}\` (${[...fset].map(rel).join(', ')})`)
  findings.push(`mixed wire timestamp forms in one plane: ${parts.join(' vs ')}`)
}

if (findings.length) {
  console.log(`PARITY FAIL — ${findings.length} finding(s) across ${files.length} file(s):`)
  for (const f of findings) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`PARITY PASS — ${files.length} file(s), one coherent plane.`)
