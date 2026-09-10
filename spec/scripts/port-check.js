#!/usr/bin/env node
'use strict'
// port-check.js --root <dir> [--json] — walk <dir>/tests and report every fixed or computed
// port literal, so the class specs/20260909/06-ephemeral-serve-ports.md removed cannot creep
// back in unnoticed (specs/20260909/07-hang-bound-and-port-check.md D3, AC-20260909-07-4
// through -6). /spec:doctor's fixed-test-ports check is its caller.
//
// Classifies by LOCATION, not by filename or extension — every regular file under <root>/tests
// is walked (node_modules and .git excluded) — and by three regexes only, checked in this
// order per line (first match wins): listen-literal, computed-port, port-flag-literal. It does
// NOT catch a port smuggled through a variable, an env var, or a config file outside tests/;
// it is advisory, not a hard gate. `listen(0)`, `'--port', '0'`, a bare `localhost:PORT` URL,
// and `freePort()` deliberately match none of the three classes.
//
// Usage: port-check.js --root <dir> [--json]
// Exit codes:
//   0  clean — no findings
//   1  findings — one line per hit on stdout (plain), or one JSON object with --json
//   2  usage — no --root, or --root names a directory with no tests/ subdirectory
const fs = require('fs')
const path = require('path')

const CLASSES = [
  ['listen-literal', /\blisten\(\s*(?:[1-9]\d{3,4})\b/],
  ['computed-port', /\b[1-9]\d{3,4}\s*\+\s*.{0,24}?(?:process\.pid|Math\.random)/],
  ['port-flag-literal', /--port['"]?\s*[,:]?\s*(?:String\()?\s*['"]?(?:[1-9]\d{3,4})\b/],
]

function usage(msg) {
  process.stderr.write('port-check: ' + msg + '\nusage: port-check.js --root <dir> [--json]\n')
  process.exit(2)
}

function parseArgs(argv) {
  let root = null
  let json = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') { root = argv[++i]; continue }
    if (a === '--json') { json = true; continue }
  }
  return { root, json }
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(full, out)
    else if (ent.isFile()) out.push(full)
  }
}

function writeOut(fd, text) {
  let buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off)
}

function main() {
  const { root, json } = parseArgs(process.argv.slice(2))
  if (!root) usage('--root is required')
  const testsDir = path.join(root, 'tests')
  let stat
  try { stat = fs.statSync(testsDir) } catch { stat = null }
  if (!stat || !stat.isDirectory()) usage('--root ' + root + ' has no tests/ subdirectory')

  const files = []
  walk(testsDir, files)
  files.sort()

  const findings = []
  for (const file of files) {
    const rel = path.relative(root, file)
    let content
    try { content = fs.readFileSync(file, 'utf8') } catch { continue }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const [cls, re] of CLASSES) {
        const m = line.match(re)
        if (m) {
          findings.push({ file: rel, line: i + 1, class: cls, text: m[0] })
          break
        }
      }
    }
  }

  if (json) {
    writeOut(1, JSON.stringify({ findings }) + '\n')
  } else if (findings.length > 0) {
    const text = findings.map((f) => `${f.file}:${f.line}: ${f.class} ${f.text}`).join('\n') + '\n'
    writeOut(1, text)
  }
  process.exit(findings.length > 0 ? 1 : 0)
}

main()
