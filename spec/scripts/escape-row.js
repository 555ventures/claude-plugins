#!/usr/bin/env node
'use strict'
// escape-row.js --check (--row '<json>' | --file <path>)
//              | --append --root <dir> --row '<json>' [--allow-duplicate]
//
// Owner: specs/20261025/01-the-commit-writes-the-escape-row.md D3, D4.
// Why: a fix commit records its escape row through this one writer, so no session `printf`
// can put an unvalidated row into a ledger. --check runs lib/escape-row.js's validator
// without touching disk; --append is the sole path that puts a new escape row into a ledger,
// refusing a second row that names the same spec and shares a file with an existing one.
//
// What this deliberately does NOT do: edit or delete an existing ledger line (the ledger is
// append-only fleet-wide), decide a row's class for the caller (the session supplies it; this
// script only validates and appends what it is given), or join amendments (fleet-reader.js
// owns that read).
//
// Exit codes: 0 = ok (--check: no reasons; --append: one line appended, stdout
//                 `appended spec=<spec> files=<n> reviewRunId=<rv_…|null>`)
//             1 = validation reasons found (lib/escape-row.js's closed reason set), printed one
//                 per line on stdout, nothing appended
//             2 = usage error, unreadable/unparseable --row/--file, --root not a directory
//             3 = refusal: --append finds an escape row in <dir>'s ledger (live + archives)
//                 with the same spec sharing a file and --allow-duplicate is absent — nothing
//                 appended, stderr names the shared file and the remedy

const fs = require('fs')
const path = require('path')
const { validateEscapeRow, escapeFiles } = require('./lib/escape-row')
const { readLedgerRows } = require('./lib/observation')

function usage() {
  console.error(
    "Usage: escape-row.js --check (--row '<json>' | --file <path>)\n" +
    "     | escape-row.js --append --root <dir> --row '<json>' [--allow-duplicate]\n" +
    'Only --check and --append exist; the row shape is in specs/20261025/01-the-commit-writes-the-escape-row.md.'
  )
}

const MODE_FLAGS = { '--check': 'check', '--append': 'append' }

let mode = null
let rowArg = null, fileArg = null, rootArg = null, allowDuplicate = false

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (MODE_FLAGS[a]) {
    if (mode) { usage(); process.exit(2) }
    mode = MODE_FLAGS[a]
  } else if (a === '--row') rowArg = argv[++i]
  else if (a === '--file') fileArg = argv[++i]
  else if (a === '--root') rootArg = argv[++i]
  else if (a === '--allow-duplicate') allowDuplicate = true
  else { usage(); process.exit(2) }
}
if (!mode) { usage(); process.exit(2) }

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

function rowObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    console.error(`escape-row.js: ${label} must be a JSON object`)
    usage()
    process.exit(2)
  }
  return value
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
  const label = rowArg !== null ? '--row' : `--file ${fileArg}`
  const row = rowObject(parseJson(text, label), label)
  if (row.stage !== 'escape') {
    console.error(`escape-row.js: --check row must carry stage:"escape", got ${JSON.stringify(row.stage)}`)
    usage()
    process.exit(2)
  }
  const reasons = validateEscapeRow(row)
  if (reasons.length) { printReasons(reasons); process.exit(1) }
  process.exit(0)
}

// mode === 'append'
if (rootArg === null || rowArg === null) { usage(); process.exit(2) }
requireDir(rootArg, '--root')
const root = path.resolve(rootArg)
const row = rowObject(parseJson(rowArg, '--row'), '--row')
const reasons = validateEscapeRow(row)
if (reasons.length) { printReasons(reasons); process.exit(1) }

// readLedgerRows(root) merges live + year archives, so a row living only in an archive still
// counts toward the duplicate refusal.
const newFiles = escapeFiles(row)
let shared = null
for (const r of readLedgerRows(root)) {
  if (r.stage !== 'escape' || r.spec !== row.spec) continue
  const hit = escapeFiles(r).find(f => newFiles.includes(f))
  if (hit !== undefined) { shared = hit; break }
}
if (shared !== null && !allowDuplicate) {
  console.error(
    `escape-row.js: an escape row with spec=${row.spec} already names file ${shared} in ${root}'s ledger — ` +
    'compare it to this diagnosis; a distinct defect re-runs with --allow-duplicate'
  )
  process.exit(3)
}
appendLine(root, row)
console.log(`appended spec=${row.spec} files=${newFiles.length} reviewRunId=${row.reviewRunId === undefined || row.reviewRunId === null ? 'null' : row.reviewRunId}`)
process.exit(0)
