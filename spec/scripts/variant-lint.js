#!/usr/bin/env node
'use strict'
// variant-lint.js [--root <dir>] [--field [<name>]] [--json]
//
// Fails on any `.<field>` read in a boolean, coalescing or equality position under the field's
// scope outside its helper module, so a discriminated stamp (specs/20261103/10-two-missing-briefs-
// are-not-the-same-brief.md D5) can only be compared through the helper. Eight position classes:
// boolean-not, boolean-and-or, boolean-ternary, boolean-if, coalescing, coalescing-rhs, equality,
// equality-rhs. Finding line: `<path>:<line> <class> | <code>`; one `skip <path> — <reason>` line per
// present foreign file (a file whose same-named field is another record); then the sentinel
// `VARIANT_LINT fields=<n> files=<n> findings=<n>` (files counts scanned plus skipped foreign
// files). --json prints { fields, findings, skipped }. `--field` alone prints the field table;
// `--field <name>` lints that field only. A later axis is one FIELDS entry.
//
// Does NOT parse JS (a line regex: a destructured read or an expression split across lines is a
// known blind spot), annotate-exempt single lines, or edit any file.
//
// Exit codes: 0 no findings (or the table printed) · 1 findings · 2 usage, unknown --field name,
// or unreadable --root.

const fs = require('fs')
const path = require('path')
const { writeOut } = require('./lib/sync-write')

const FIELDS = [{
  field: 'brief',
  helper: 'spec/scripts/lib/brief.js',
  scope: 'spec/scripts/**',
  foreign: {
    'spec/scripts/genesis-driver.js': '`status.brief` is the genesis status record (ratified-brief object), not a spec stamp',
    'spec/scripts/prototype-driver.js': '`status.brief`, `input.brief` and `contract.brief` are the prototype record (a roadmap brief path), not a spec stamp',
  },
}]

const USAGE = 'usage: variant-lint.js [--root <dir>] [--field [<name>]] [--json]'
function die(msg) { writeOut(2, `variant-lint: ${msg}\n`); process.exit(2) }

let root = process.cwd(), json = false, fieldFlag = false, fieldName = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i] || die(`--root needs a directory — ${USAGE}`)
  else if (a === '--json') json = true
  else if (a === '--field') {
    fieldFlag = true
    if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) fieldName = argv[++i]
  } else die(`unknown argument ${a} — ${USAGE}`)
}

const known = FIELDS.map(f => f.field)
if (fieldFlag && fieldName === null) {
  for (const f of FIELDS) writeOut(1, `${f.field} → ${f.helper} (scope ${f.scope}; foreign: ${Object.keys(f.foreign).join(', ')})\n`)
  process.exit(0)
}
if (fieldName !== null && !known.includes(fieldName)) die(`unknown field ${fieldName} — known fields: ${known.join(', ')}; run \`variant-lint.js --field\` for the table`)
let isDir = false
try { isDir = fs.statSync(root).isDirectory() } catch (e) { isDir = false }
if (!isDir) die(`cannot read root ${root} — pass --root <dir> naming a repo checkout`)

function walk(dir, out) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return out }
  for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(js|sh)$/.test(e.name)) out.push(p)
  }
  return out
}

// Checked in order: equality classes first, so a comparison is never reported as a boolean.
function classesFor(field) {
  const t = `\\.${field}\\b(?![\\w$.\\[(])`
  const lhs = `[\\w$.]*\\.${field}\\b(?![\\w$.\\[(])`
  return [
    ['equality', new RegExp(`${t}\\s*(?:===|!==|==|!=)`)],
    ['equality-rhs', new RegExp(`(?:===|!==|==|!=)\\s*${lhs}`)],
    ['boolean-not', new RegExp(`!(?!=)\\s*${lhs}`)],
    ['boolean-and-or', new RegExp(`${t}\\s*(?:&&|\\|\\|)`)],
    ['boolean-ternary', new RegExp(`${t}\\s*\\?(?![?.])`)],
    ['boolean-if', new RegExp(`\\b(?:if|while)\\s*\\(\\s*${lhs}\\s*\\)`)],
    ['coalescing', new RegExp(`${t}\\s*(?:\\?\\?|\\?\\.)`)],
    ['coalescing-rhs', new RegExp(`(?:&&|\\|\\||\\?\\?)\\s*${lhs}`)],
  ]
}

function codeOf(line) {
  const t = line.trim()
  if (/^(\/\/|#|\/\*|\*)/.test(t)) return ''
  return line.replace(/(^|\s)\/\/.*$/, '$1')
}

const findings = [], skipped = []
let files = 0
const active = FIELDS.filter(f => fieldName === null || f.field === fieldName)
for (const f of active) {
  const dir = path.join(root, f.scope.replace(/\/?\*\*$/, ''))
  const classes = classesFor(f.field)
  for (const abs of walk(dir, [])) {
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (rel === f.helper) continue
    files++
    if (Object.prototype.hasOwnProperty.call(f.foreign, rel)) {
      skipped.push({ path: rel, reason: f.foreign[rel] })
      continue
    }
    fs.readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      const code = codeOf(line)
      if (!code.trim()) return
      const hit = classes.find(([, re]) => re.test(code))
      if (hit) findings.push({ path: rel, line: i + 1, field: f.field, class: hit[0], code: line.trim() })
    })
  }
}

if (json) {
  writeOut(1, JSON.stringify({ fields: active, findings, skipped }, null, 2) + '\n')
} else {
  let out = ''
  for (const x of findings) out += `${x.path}:${x.line} ${x.class} | ${x.code}\n`
  for (const s of skipped) out += `skip ${s.path} — ${s.reason}\n`
  out += `VARIANT_LINT fields=${active.length} files=${files} findings=${findings.length}\n`
  writeOut(1, out)
}
process.exit(findings.length ? 1 : 0)
