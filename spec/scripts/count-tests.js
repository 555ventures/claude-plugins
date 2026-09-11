#!/usr/bin/env node
'use strict'
// count-tests.js --root <dir> [--json]
// count-tests.js --root <dir> --titles [--file <rel>] [--json]
//
// specs/20260911/02-tests-have-a-ceiling.md D3′/AC-20260911-02-2: reports a repo's test-case
// count as a derived number, never a verdict. Delegates entirely to lib/scan-test-calls.js's
// countCases() (D2 — the one scanner, shared with ac-drift.js's expiry sweep) over the host's
// test-classified files. Prints `tests: <count> cases` (human) or `{"count":N}` (--json).
// Consumer: review-legs.js's `tests` leg (D4′) shells out to this script and never re-derives
// the count itself. Named `count-tests.js`, never `test-*` — `node --test`'s default file
// discovery matches `**/test-*.js` anywhere under the repo root, so a `test-count.js` this repo
// ships gets DISCOVERED AND EXECUTED as a test file by the post-gate's path-less `node --test`
// run, and its own argv handling exiting non-zero under the runner reported as a spurious test
// failure (the amendment's forcing incident). No executable this repo ships may be named
// `test-*`.
//
// specs/20260911/04-every-criterion-declares-its-test.md D5: `--titles [--file <rel>] [--json]`
// is the one place a spec author finds a `→ reuses`/`→ rewrites` reference string — one line per
// case, `<file> :: <prefix>`, the prefix grown a character at a time until it is unique among the
// other titles in ITS OWN FILE, then extended forward to the next word boundary (never cut off
// mid-word), capped at 200 characters. `--file <rel>` restricts the scan to one file; omitted,
// every host test file is scanned. This is a render over lib/scan-test-calls.js's existing
// scanCalls() — no new derivation of what a test case is.
//
// What this deliberately does NOT do: read or write any ceiling/limit file, compare the count
// against any number, or ever fail on the count itself — a one-case host and a million-case
// host both exit 0. This script cannot report a failure of the tree; it only measures it.
//
// Exit codes: 0 = count/titles printed, always, regardless of the count's value ·
//             2 = usage error, or --root is not a readable directory
const fs = require('fs')
const path = require('path')
const { readConfig } = require('./lib/host-config')
const { countCases, scanCalls, listTestFiles } = require('./lib/scan-test-calls')

const USAGE = 'count-tests.js --root <dir> [--json] | --root <dir> --titles [--file <rel>] [--json]'

// A script that prints a payload and exits routes through a synchronous writer — the 64 KiB pipe
// truncation this avoids is spelled out at spec/scripts/lib/driver-io.js's writeOut.
function writeOut(fd, str) {
  const buf = Buffer.from(str + '\n', 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

function die(code, msg) {
  writeOut(2, 'count-tests: ' + msg)
  process.exit(code)
}

let root = null
let asJson = false
let titlesMode = false
let fileArg = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--json') asJson = true
  else if (a === '--titles') titlesMode = true
  else if (a === '--file') fileArg = argv[++i]
  else die(2, 'usage: ' + USAGE)
}
if (!root) die(2, 'usage: ' + USAGE)
root = path.resolve(root)

let rootStat = null
try { rootStat = fs.statSync(root) } catch { rootStat = null }
if (!rootStat || !rootStat.isDirectory()) die(2, 'usage: ' + USAGE + ' — --root must name an existing directory')

const config = readConfig(root)

// D5: the shortest-unique-within-its-own-file prefix — grown a character at a time until no
// other case IN THE SAME FILE shares that same-length prefix, then extended forward to the next
// word boundary (never cut mid-word) and capped at 200 characters (measured: <=80 chars suffices
// for 1,017 of 1,021 live cases, <=200 for all 1,021).
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
    const fileTitles = scanCalls(src).map(c => c.title)
    fileTitles.forEach((title, idx) => {
      out.push({ file: relFile, prefix: shortestUniquePrefix(title, fileTitles, idx), title })
    })
  }
  return out
}

if (titlesMode) {
  const files = fileArg
    ? [fileArg]
    : listTestFiles(root, config).map((f) => path.relative(root, f).split(path.sep).join('/'))
  const titles = computeTitles(files)
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
