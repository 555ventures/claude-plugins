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
// A fourth class, config-fixed-port (specs/20261005/03-one-port-per-launch.md D10,
// AC-20261005-03-20), is read from the host config (lib/host-config.js CONFIG_RELPATH) after the tests walk: one
// finding for runtime.readyCheck (runtime not inert, a loopback host named, PORT not read) and one
// for prototype.url (loopback hostname, no {port}); `line` is the line holding the key, `text` the
// key name. A missing or unparseable config adds nothing; non-loopback addresses are never
// flagged. It does NOT edit the config or judge whether the boot command honours PORT.
//
// Usage: port-check.js --root <dir> [--json]
// Exit codes:
//   0  clean — no findings
//   1  findings (tests or config) — one line per hit on stdout (plain), or one JSON object with --json
//   2  usage — no --root, or --root names a directory with no tests/ subdirectory
const fs = require('fs')
const path = require('path')
const { readsPort, hasPortSlot } = require('./lib/app-port')
const { CONFIG_RELPATH } = require('./lib/host-config')

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

const LOOPBACK_IN_COMMAND = /(?:^|[^A-Za-z0-9.-])(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?![A-Za-z0-9.-])/
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0']

// 1-indexed line of `"key"` at or after the line holding `"block"`; 1 when neither is found.
function keyLine(text, block, key) {
  const lines = text.split('\n')
  let from = lines.findIndex((l) => l.includes('"' + block + '"'))
  if (from < 0) from = 0
  for (let i = from; i < lines.length; i++) if (lines[i].includes('"' + key + '"')) return i + 1
  const any = lines.findIndex((l) => l.includes('"' + key + '"'))
  return any < 0 ? 1 : any + 1
}

function configFindings(root) {
  const rel = CONFIG_RELPATH
  let text
  let cfg
  try {
    text = fs.readFileSync(path.join(root, rel), 'utf8')
    cfg = JSON.parse(text)
  } catch { return [] }
  if (!cfg || typeof cfg !== 'object') return []
  const out = []
  const rt = cfg.runtime
  if (rt && typeof rt === 'object' && !rt.inert && typeof rt.readyCheck === 'string' &&
      LOOPBACK_IN_COMMAND.test(rt.readyCheck) && !readsPort(rt.readyCheck)) {
    out.push({ file: rel, line: keyLine(text, 'runtime', 'readyCheck'), class: 'config-fixed-port', text: 'runtime.readyCheck' })
  }
  const url = cfg.prototype && cfg.prototype.url
  if (typeof url === 'string' && !hasPortSlot(url)) {
    let hostname = null
    try { hostname = new URL(url).hostname } catch { hostname = null }
    if (hostname && LOOPBACK_HOSTS.includes(hostname)) {
      out.push({ file: rel, line: keyLine(text, 'prototype', 'url'), class: 'config-fixed-port', text: 'prototype.url' })
    }
  }
  return out
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

  findings.push(...configFindings(root))

  if (json) {
    writeOut(1, JSON.stringify({ findings }) + '\n')
  } else if (findings.length > 0) {
    const text = findings.map((f) => `${f.file}:${f.line}: ${f.class} ${f.text}`).join('\n') + '\n'
    writeOut(1, text)
  }
  process.exit(findings.length > 0 ? 1 : 0)
}

main()
