#!/usr/bin/env node
'use strict'
// prose-cap.js — cap lint for one markdown section's entry-bullet count.
//
// specs/20260823/06-prose-debt-pruning.md (2026-08-23): the host rules' § Gotchas section
// accreted 23 entries in 23 days with nothing pruning them, including two citing machinery
// (`suite-baseline.js`, `.claude/suite-baseline.json`) deleted at v7.0.0 and unnoticed for six
// days — proof that nothing reads an append-only section once it grows past a skim. This
// script converts "should we prune?" into arithmetic: count entry bullets in one named
// markdown section, compare to a cap, exit non-zero over. It deliberately does NOT judge
// which entry to evict, or apply any staleness/age/citation-liveness heuristic — staleness and
// importance are uncorrelated (a rare-but-fatal trap is exactly what a pressured evictor might
// delete), so that judgment stays with the session at fold time, never this script.
//
// Usage: node prose-cap.js --file <path> --section <heading substring> [--cap N]  (default 15)
// Entry = a line matching  ^-   (any top-level `- ` bullet) inside the section; indented
// continuation lines never count (`^- ` requires column 0). Section = from the first `## `
// heading containing <heading substring> to the next `## ` heading or EOF.
//
// 2026-08-23 fail-open fix: the original entry shape  ^- `?\[  required the bullet to OPEN
// with a bracket tag — a position no doctrine ever mandated (entries "carry" `[host]`/`[plugin]`,
// positionless). Measured against a real host (Upwell's .claude/rules/spec-pipeline.md,
// tag-at-end entries): 138 entries, 0 matched — the cap had never fired there, while this
// repo's own tag-first file kept the live-file test green. Broadened same-day (core
// § Incident Policy) to any top-level bullet — the shape the review driver and build.md's
// ledger count already use: overcounting fires the cap early, where a human judges at fold
// time; undercounting was the fail-open.
// stdout: single line  <count>/<cap> entries in "<section>" of <file>
//
// Exit codes:
//   0  count <= cap
//   1  count > cap (stderr names the overage and the eviction remedy: evict before appending —
//      delete / merge into docs/canonical/ / mechanize (core § Incident Policy))
//   2  bad invocation: missing/unreadable --file, or the --section heading substring matches
//      no `## ` heading in --file (stderr names it)

const fs = require('fs')

let file = null
let section = null
let cap = 15
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file') file = argv[++i]
  else if (argv[i] === '--section') section = argv[++i]
  else if (argv[i] === '--cap') cap = Number(argv[++i])
}

if (!file) {
  console.error('prose-cap: missing --file — usage: node prose-cap.js --file <path> --section <heading substring> [--cap N]')
  process.exit(2)
}
if (!section) {
  console.error('prose-cap: missing --section — usage: node prose-cap.js --file <path> --section <heading substring> [--cap N]')
  process.exit(2)
}
if (!Number.isFinite(cap)) {
  console.error(`prose-cap: --cap must be a number, got "${process.argv[process.argv.indexOf('--cap') + 1]}" — usage: node prose-cap.js --file <path> --section <heading substring> [--cap N]`)
  process.exit(2)
}

let text
try {
  text = fs.readFileSync(file, 'utf8')
} catch (e) {
  console.error(`prose-cap: cannot read --file ${file} — check the path exists and is readable (${e.code || e.message})`)
  process.exit(2)
}

const lines = text.split('\n')
let startIdx = -1
let heading = null
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('## ') && lines[i].includes(section)) {
    startIdx = i
    heading = lines[i].slice(3).trim()
    break
  }
}
if (startIdx === -1) {
  console.error(`prose-cap: no "## " heading containing "${section}" found in ${file} — check the --section substring against the file's actual headings`)
  process.exit(2)
}

let endIdx = lines.length
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) { endIdx = i; break }
}

const ENTRY_RE = /^- /
let count = 0
for (let i = startIdx + 1; i < endIdx; i++) {
  if (ENTRY_RE.test(lines[i])) count++
}

console.log(`${count}/${cap} entries in "${heading}" of ${file}`)

if (count > cap) {
  console.error(`prose-cap: ${count}/${cap} entries in "${heading}" of ${file} — over cap, evict ` +
    'before appending: delete / merge into docs/canonical/ / mechanize (core § Incident Policy)')
  process.exit(1)
}
process.exit(0)
