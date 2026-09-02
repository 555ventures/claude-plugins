#!/usr/bin/env node
'use strict'
// escape-row.js --check (--row '<json>' | --file <path>)
//              | --append --root <dir> --row '<json>' [--allow-duplicate]
//              | --amend  --root <dir> --escape-ts <ts> --spec <path> --file <path>
//                        (--class <id> | --unclassed-reason no-fix-diff|deferred) [--via backfill|manual]
//
// Why: specs/20260901/07-escape-class-contract.md D2. escape.md appended ledger rows with a
// session `printf` before this script existed — that is exactly how a `preventedBy:"test"` and
// a `foundBy:"build"` row reached a fleet ledger (no script stood between the session and the
// file). This CLI is the ONE writer of every `stage:"escape"` and `stage:"escape-class"` row:
// --check runs lib/escape-row.js's validator without touching disk, --append is the sole path
// that puts a NEW escape row into a ledger (duplicate-refusing), and --amend is the sole writer
// of an append-only `escape-class` amendment that repairs a historical row's class without
// rewriting it. 2026-09-01 review finding of this spec: appendLine glued a new row onto an
// existing ledger's last line when that line lacked a trailing newline, corrupting both rows
// for every fleet-reader; appendLine now checks the existing ledger's last byte and prefixes a
// separating newline when needed, matching the idiom already used in replay.js's info/exclude
// append.
//
// What this deliberately does NOT do: edit or delete an existing ledger line (D3 — the ledger
// is append-only fleet-wide; a wrong amendment is superseded by a later one, never rewritten),
// decide a row's class for the caller (the session or the backfill agent supplies --class /
// --unclassed-reason; this script only validates and appends what it is given), or re-derive
// the effective class across amendments (that join is fleet-reader.js's job — this script's
// duplicate/key search reads only the ROOT's own raw rows, never joins them).
//
// Exit codes: 0 = ok (--check: no reasons; --append/--amend: one line appended, stdout
//                 `appended spec=… file=…` / `amended escapeTs=… spec=… file=… class=…|null`)
//             1 = validation reasons found (lib/escape-row.js's closed reason set), printed one
//                 per line on stdout, nothing appended
//             2 = usage error, unreadable/unparseable --row/--file, --root not a directory,
//                 --amend with both or neither of --class/--unclassed-reason
//             3 = refusal: --append finds an escape row with the same spec+file in <dir>'s
//                 ledger (live + archives) and --allow-duplicate is absent; --amend finds no
//                 escape row with key (escapeTs, spec, file) in <dir>'s ledger — nothing
//                 appended, stderr names the remedy (--allow-duplicate / the exact key searched)

const fs = require('fs')
const path = require('path')
const { validateEscapeRow, validateAmendmentRow } = require('./lib/escape-row')
const { readLedgerRows } = require('./lib/observation')

function usage() {
  console.error(
    "Usage: escape-row.js --check (--row '<json>' | --file <path>)\n" +
    "     | escape-row.js --append --root <dir> --row '<json>' [--allow-duplicate]\n" +
    '     | escape-row.js --amend  --root <dir> --escape-ts <ts> --spec <path> --file <path>\n' +
    '                     (--class <id> | --unclassed-reason no-fix-diff|deferred) [--via backfill|manual]'
  )
}

const MODE_FLAGS = { '--check': 'check', '--append': 'append', '--amend': 'amend' }

let mode = null
let rowArg = null, fileArg = null, rootArg = null, allowDuplicate = false
let escapeTsArg = null, specArg = null, fileFieldArg = null, classArg = null, reasonArg = null, viaArg = null

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (MODE_FLAGS[a]) {
    if (mode) { usage(); process.exit(2) }
    mode = MODE_FLAGS[a]
  } else if (a === '--row') rowArg = argv[++i]
  else if (a === '--file') { fileArg = argv[++i]; fileFieldArg = fileArg }
  else if (a === '--root') rootArg = argv[++i]
  else if (a === '--allow-duplicate') allowDuplicate = true
  else if (a === '--escape-ts') escapeTsArg = argv[++i]
  else if (a === '--spec') specArg = argv[++i]
  else if (a === '--class') classArg = argv[++i]
  else if (a === '--unclassed-reason') reasonArg = argv[++i]
  else if (a === '--via') viaArg = argv[++i]
  else { usage(); process.exit(2) }
}
if (!mode) { usage(); process.exit(2) }

// A6 (Assumptions): lib/observation.js readLedgerRows(root) merges live + year archives in
// read order — verified by code read at plan time. --append's duplicate check and --amend's
// key search both route through it, so neither can miss a row living only in an archive.
function requireDir(dir, label) {
  let st = null
  try { st = fs.statSync(dir) } catch { st = null }
  if (!st || !st.isDirectory()) {
    console.error(`escape-row.js: ${label} ${dir} is not an existing directory`)
    usage()
    process.exit(2)
  }
}

function parseJson(text, sourceLabel) {
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error(`escape-row.js: could not parse ${sourceLabel} as JSON: ${e.message}`)
    usage()
    process.exit(2)
  }
}

function printReasons(reasons) {
  for (const r of reasons) console.log(r)
}

function appendLine(root, row) {
  const claudeDir = path.join(root, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  const ledgerPath = path.join(claudeDir, 'spec-runs.jsonl')
  let existing = ''
  try { existing = fs.readFileSync(ledgerPath, 'utf8') } catch { /* absent ledger is a valid start state */ }
  const sep = existing.length && !existing.endsWith('\n') ? '\n' : ''
  fs.appendFileSync(ledgerPath, sep + JSON.stringify(row) + '\n')
}

if (mode === 'check') {
  if ((rowArg === null) === (fileArg === null)) {
    console.error('escape-row.js: --check needs exactly one of --row <json> or --file <path>')
    usage()
    process.exit(2)
  }
  let text
  if (rowArg !== null) {
    text = rowArg
  } else {
    try {
      text = fs.readFileSync(fileArg, 'utf8')
    } catch (e) {
      console.error(`escape-row.js: cannot read --file ${fileArg}: ${e.message}`)
      usage()
      process.exit(2)
    }
  }
  const row = parseJson(text, rowArg !== null ? '--row' : `--file ${fileArg}`)
  let reasons
  if (row.stage === 'escape') reasons = validateEscapeRow(row)
  else if (row.stage === 'escape-class') reasons = validateAmendmentRow(row)
  else {
    console.error(`escape-row.js: --check row must carry stage:"escape" or stage:"escape-class", got ${JSON.stringify(row.stage)}`)
    usage()
    process.exit(2)
  }
  if (reasons.length) { printReasons(reasons); process.exit(1) }
  process.exit(0)
}

if (mode === 'append') {
  if (rootArg === null || rowArg === null) { usage(); process.exit(2) }
  requireDir(rootArg, '--root')
  const root = path.resolve(rootArg)
  const row = parseJson(rowArg, '--row')
  const reasons = validateEscapeRow(row)
  if (reasons.length) { printReasons(reasons); process.exit(1) }
  const existing = readLedgerRows(root)
  const duplicate = existing.some(r => r.stage === 'escape' && r.spec === row.spec && r.file === row.file)
  if (duplicate && !allowDuplicate) {
    console.error(
      `escape-row.js: an escape row with spec=${row.spec} file=${row.file} already exists in ${root}'s ledger — ` +
      'run escape.md step 2\'s grep to confirm this is really the same distinct defect, then re-run with --allow-duplicate'
    )
    process.exit(3)
  }
  appendLine(root, row)
  console.log(`appended spec=${row.spec} file=${row.file}`)
  process.exit(0)
}

// mode === 'amend'
if (rootArg === null || escapeTsArg === null || specArg === null || fileFieldArg === null) { usage(); process.exit(2) }
if ((classArg === null) === (reasonArg === null)) {
  console.error('escape-row.js: --amend needs exactly one of --class <id> or --unclassed-reason no-fix-diff|deferred')
  usage()
  process.exit(2)
}
requireDir(rootArg, '--root')
const root = path.resolve(rootArg)
const via = viaArg || 'manual'
const amendment = {
  ts: new Date().toISOString(),
  stage: 'escape-class',
  spec: specArg,
  file: fileFieldArg,
  escapeTs: escapeTsArg,
  class: classArg !== null ? classArg : null,
  unclassedReason: reasonArg !== null ? reasonArg : null,
  via,
}
const amendReasons = validateAmendmentRow(amendment)
if (amendReasons.length) { printReasons(amendReasons); process.exit(1) }

const rows = readLedgerRows(root)
const matched = rows.some(r => r.stage === 'escape' && r.ts === escapeTsArg && r.spec === specArg && r.file === fileFieldArg)
if (!matched) {
  console.error(
    `escape-row.js: no escape row with key (escapeTs=${escapeTsArg}, spec=${specArg}, file=${fileFieldArg}) found in ${root}'s ` +
    'ledger — confirm the escapeTs/spec/file exactly match an existing stage:"escape" row (searched: ' +
    `escapeTs=${escapeTsArg} spec=${specArg} file=${fileFieldArg})`
  )
  process.exit(3)
}
appendLine(root, amendment)
console.log(`amended escapeTs=${amendment.escapeTs} spec=${amendment.spec} file=${amendment.file} class=${amendment.class === null ? 'null' : amendment.class}`)
process.exit(0)
