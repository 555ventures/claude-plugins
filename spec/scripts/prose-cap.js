#!/usr/bin/env node
'use strict'
// prose-cap.js — cap lint for one markdown section's entry-bullet count.
//
// Owner: specs/20260823/06-prose-debt-pruning.md.
//
// Counts the entry bullets in one named markdown section, compares to a cap of 15, and exits
// non-zero over. It deliberately does NOT judge which entry to evict, or apply any staleness/age/
// citation-liveness heuristic — that judgment stays with the session at fold time.
//
// Usage: node prose-cap.js --file <path> --section <heading substring> [--baseline N]
// Entry = a line matching  ^-   (any top-level `- ` bullet) inside the section; indented
// continuation lines never count (`^- ` requires column 0). Section = from the first `## `
// heading containing <heading substring> to the next `## ` heading or EOF.
//
// Ratchet mode (--baseline N, the count observed when the review's verdict ran): an over-cap
// section passes iff count < N — every close must net-shrink the section by at least one entry.
// At or under cap the baseline is ignored and the hard cap rules.
// stdout: single line  <count>/<cap> entries in "<section>" of <file>  (ratchet mode appends
//         "  ratchet: <count> < baseline <N>" when the baseline is what admitted the pass)
//
// Exit codes:
//   0  count <= cap, or (--baseline N given) count < N
//   1  count > cap and (no --baseline, or count >= N) — stderr names the overage, the baseline
//      when one was given, and the eviction remedy: evict before appending — delete / merge
//      into docs/canonical/ / mechanize (core § Incident Policy)
//   2  bad invocation: missing/unreadable --file, or the --section heading substring matches
//      no `## ` heading in --file (stderr names it)

const fs = require('fs')

let file = null
let section = null
const cap = 15
let baseline = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file') file = argv[++i]
  else if (argv[i] === '--section') section = argv[++i]
  else if (argv[i] === '--baseline') baseline = Number(argv[++i])
}

if (!file) {
  console.error('prose-cap: missing --file — usage: node prose-cap.js --file <path> --section <heading substring> [--baseline N]')
  process.exit(2)
}
if (!section) {
  console.error('prose-cap: missing --section — usage: node prose-cap.js --file <path> --section <heading substring> [--baseline N]')
  process.exit(2)
}
if (baseline !== null && !Number.isFinite(baseline)) {
  console.error(`prose-cap: --baseline must be a number, got "${process.argv[process.argv.indexOf('--baseline') + 1]}" — usage: node prose-cap.js --file <path> --section <heading substring> [--baseline N]`)
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

const ratcheted = count > cap && baseline !== null && count < baseline
console.log(`${count}/${cap} entries in "${heading}" of ${file}` +
  (ratcheted ? `  ratchet: ${count} < baseline ${baseline}` : ''))

if (count > cap && !ratcheted) {
  const ratchetNote = baseline === null ? '' :
    ` (ratchet: baseline ${baseline} at verdict time — an over-cap section closes only strictly below it)`
  console.error(`prose-cap: ${count}/${cap} entries in "${heading}" of ${file} — over cap${ratchetNote}, evict ` +
    'before appending: delete / merge into docs/canonical/ / mechanize (core § Incident Policy)')
  process.exit(1)
}
process.exit(0)
