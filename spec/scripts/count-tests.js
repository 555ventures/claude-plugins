#!/usr/bin/env node
'use strict'
// count-tests.js --root <dir> [--json]
// count-tests.js --root <dir> --titles [--file <rel>] [--json]
// count-tests.js --root <dir> --scanner-check [--json]
//
// Owner: specs/20260911/02-tests-have-a-ceiling.md.
// Reports a repo's test-case count as a derived number, never a verdict, via lib/scan-test-calls.js's
// countCases(). Prints `tests: <count> cases` or `{"count":N}`; review-legs.js's `tests` leg shells out
// to it. Named `count-tests.js`, never `test-*` — `node --test` would discover and execute it.
//
// `--titles [--file <rel>] [--json]`
// is the one place a spec author finds a `→ reuses`/`→ rewrites` reference string — one line per
// case, `<file> :: <prefix>`, the prefix grown a character at a time until it is unique among the
// other titles in ITS OWN FILE, then extended forward to the next word boundary (never cut off
// mid-word), capped at 200 characters. `--file <rel>` restricts the scan to one file; omitted,
// every host test file is scanned. This is a render over lib/scan-test-calls.js's existing
// scanCases() — no new derivation of what a test case is. `--titles --file <rel>` that yields zero
// cases writes one stderr line naming which reader saw none (the built-in JavaScript walker, or the
// host's testCaseScanner). `--scanner-check [--json]`
// is /spec:doctor check 6's proof that a declared testCaseScanner still lists cases: absent key
// prints {"declared":false}; declared prints {declared,command,exit,cases,files,malformed} and fails
// when exit is not 0, malformed is not 0 or cases is below 1.
//
// What this deliberately does NOT do: read or write any ceiling/limit file, compare the count
// against any number, or ever fail on the count itself — a one-case host and a million-case
// host both exit 0. This script cannot report a failure of the tree; it only measures it.
//
// Exit codes: 0 = count/titles printed, always, regardless of the count's value ·
//             2 = usage error, or --root is not a readable directory ·
//             3 = --scanner-check found the declared testCaseScanner failing; every stderr line ends with the remedy: fix config.testCaseScanner, then rerun:
//                 node <this script's absolute path> --root . --scanner-check
const fs = require('fs')
const path = require('path')
const { readConfig } = require('./lib/host-config')
const { countCases, scanCases, hostCases, listTestFiles } = require('./lib/scan-test-calls')
const { writeOut: syncWrite } = require('./lib/sync-write')

const USAGE = 'count-tests.js --root <dir> [--json] | --root <dir> --titles [--file <rel>] [--json] | --root <dir> --scanner-check [--json]'

// A script that prints a payload and exits routes through lib/sync-write.js — synchronous so a
// 64 KiB+ payload never truncates at process.exit, and EPIPE (a reader like `head` closed early)
// is done, not an uncaught exit 1 that masks this script's own exit code.
function writeOut(fd, str) {
  syncWrite(fd, str + '\n')
}

function die(code, msg) {
  writeOut(2, 'count-tests: ' + msg)
  process.exit(code)
}

let root = null
let asJson = false
let titlesMode = false
let fileArg = null
let scannerCheck = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--json') asJson = true
  else if (a === '--titles') titlesMode = true
  else if (a === '--file') fileArg = argv[++i]
  else if (a === '--scanner-check') scannerCheck = true
  else die(2, 'usage: ' + USAGE)
}
if (!root) die(2, 'usage: ' + USAGE)
root = path.resolve(root)

let rootStat = null
try { rootStat = fs.statSync(root) } catch { rootStat = null }
if (!rootStat || !rootStat.isDirectory()) die(2, 'usage: ' + USAGE + ' — --root must name an existing directory')

const config = readConfig(root)

// The shortest-unique-within-its-own-file prefix, extended to the next word boundary and capped at 200.
function shortestUniquePrefix(title, siblingTitles, idx) {
  let len = 1
  while (len < title.length) {
    const candidate = title.slice(0, len)
    const collides = siblingTitles.some((other, j) => j !== idx && other.slice(0, len) === candidate)
    if (!collides) break
    len++
  }
  let end = len
  while (end < title.length && !/\s/.test(title[end])) end++
  if (end > 200) end = 200
  return title.slice(0, end)
}

function computeTitles(files) {
  const out = []
  for (const relFile of files) {
    let src
    try { src = fs.readFileSync(path.join(root, relFile), 'utf8') } catch { continue }
    const fileTitles = scanCases(root, config, relFile, src).map(c => c.title)
    fileTitles.forEach((title, idx) => {
      out.push({ file: relFile, prefix: shortestUniquePrefix(title, fileTitles, idx), title })
    })
  }
  return out
}

if (scannerCheck) {
  const host = hostCases(root, config, { quiet: true })
  if (!host.command) {
    writeOut(1, asJson ? JSON.stringify({ declared: false }) : 'declared: false')
    process.exit(0)
  }
  let cases = 0
  for (const list of host.byFile.values()) cases += list.length
  const out = {
    declared: true, command: host.command, exit: host.exit, cases, files: host.byFile.size, malformed: host.malformed,
  }
  if (asJson) writeOut(1, JSON.stringify(out))
  else for (const k of Object.keys(out)) writeOut(1, k + ': ' + out[k])
  const failing = out.exit !== 0 ? 'exit' : out.malformed !== 0 ? 'malformed' : out.cases < 1 ? 'cases' : null
  if (failing) die(3, 'testCaseScanner ' + failing + ' \u2014 ' + (out[failing] === null ? 'timeout' : out[failing]) +
    ' \u2014 fix config.testCaseScanner, then rerun: node ' + __filename + ' --root . --scanner-check')
  process.exit(0)
}

if (titlesMode) {
  const files = fileArg
    ? [fileArg]
    : listTestFiles(root, config).map((f) => path.relative(root, f).split(path.sep).join('/'))
  const titles = computeTitles(files)
  if (fileArg && titles.length === 0) {
    const host = hostCases(root, config)
    const reader = host.command && host.ok ? 'testCaseScanner: ' + host.command : 'the built-in JavaScript walker'
    writeOut(2, 'count-tests: 0 cases in ' + fileArg + ' (read by ' + reader + ')')
  }
  if (asJson) {
    writeOut(1, JSON.stringify({ titles }))
  } else {
    for (const t of titles) writeOut(1, `${t.file} :: ${t.prefix}`)
  }
  process.exit(0)
}

const { count } = countCases(root, config)

if (asJson) writeOut(1, JSON.stringify({ count }))
else writeOut(1, `tests: ${count} cases`)
process.exit(0)
