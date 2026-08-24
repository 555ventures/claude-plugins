#!/usr/bin/env node
'use strict'
// components-check.js <path-to-components.json> — deterministic schema authority for the
// component vocabulary registry (specs/20260810/01-design-path-model-placement.md D2/D3).
//
// WHY: design/components.json gained a `boundaries` field and genesis-seeded "commitment"
// entries (vocabulary rows with no props/mockRefs yet) alongside landed component entries.
// Nothing validated the file's shape before this — a malformed manifest would only surface as
// a confusing failure downstream (the design workers' grounding, /spec:review's near-duplicate check).
// This script is the single schema authority (D2): canonical shape is a top-level JSON array
// of `{name, purpose, boundaries?, props?, mockRefs?, authorJustification?}`; `name`/`purpose`
// are required non-empty strings, `boundaries` when present is an array of non-empty strings,
// duplicate `name`s are an error. It does NOT check props/mockRefs/authorJustification shape
// (unspecified by D2) and does NOT resolve component paths against the filesystem.
//
// Callers: /spec:genesis-design Phase 4.5 commit step (fail-closed — a greenfield repo just
// wrote this file, so a malformed manifest must block the commit); /spec:design's
// preflight (advisory only — brownfield hosts may hold pre-D2 files).
//
// Exit codes: 0 = valid; 1 = findings (one line each, naming the entry and field); 2 = usage
// error, missing file, or unparseable JSON — stderr names the remedy.

const fs = require('fs')

const argv = process.argv.slice(2)
const manifestPath = argv[0]
if (!manifestPath || manifestPath.startsWith('--')) {
  process.stderr.write('components-check: usage: components-check.js <path-to-components.json>\n')
  process.exit(2)
}
if (!fs.existsSync(manifestPath)) {
  process.stderr.write('components-check: no manifest at ' + manifestPath + ' — nothing to validate; check the path\n')
  process.exit(2)
}

let raw
try {
  raw = fs.readFileSync(manifestPath, 'utf8')
} catch (e) {
  process.stderr.write('components-check: cannot read ' + manifestPath + ' — ' + e.message + '\n')
  process.exit(2)
}

let parsed
try {
  parsed = JSON.parse(raw)
} catch (e) {
  process.stderr.write('components-check: ' + manifestPath + ' is not valid JSON — ' + e.message + '\n')
  process.exit(2)
}

// Legacy `{"components": [...]}` wrapper: warn (never error — brownfield files predate D2),
// then validate the inner array against the same rules as the canonical top-level array.
let entries = parsed
if (!Array.isArray(parsed) && parsed && typeof parsed === 'object' && Array.isArray(parsed.components)) {
  process.stdout.write('components-check: ' + manifestPath +
    ' uses the legacy {"components": [...]} wrapper — the canonical shape (D2) is a top-level ' +
    'JSON array; consider migrating.\n')
  entries = parsed.components
}

if (!Array.isArray(entries)) {
  process.stderr.write('components-check: ' + manifestPath +
    ' must be a top-level JSON array of component entries (or a legacy {"components": [...]} ' +
    'wrapper) — got ' + (entries === null ? 'null' : typeof entries) + '\n')
  process.exit(2)
}

const findings = []
const seenNames = new Set()

entries.forEach((entry, i) => {
  const label = (entry && typeof entry.name === 'string' && entry.name) ? entry.name : '<entry ' + i + '>'
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    findings.push(label + ': entry must be a JSON object')
    return
  }
  if (typeof entry.name !== 'string' || entry.name.trim() === '') {
    findings.push(label + ': missing or empty required field "name"')
  }
  if (typeof entry.purpose !== 'string' || entry.purpose.trim() === '') {
    findings.push(label + ': missing or empty required field "purpose"')
  }
  if ('boundaries' in entry) {
    const b = entry.boundaries
    if (!Array.isArray(b) || b.some((v) => typeof v !== 'string' || v.trim() === '')) {
      findings.push(label + ': field "boundaries" must be an array of non-empty strings')
    }
  }
  if (typeof entry.name === 'string' && entry.name.trim() !== '') {
    if (seenNames.has(entry.name)) {
      findings.push(entry.name + ': duplicate "name" — one binding home per component, rename or merge')
    }
    seenNames.add(entry.name)
  }
})

if (findings.length) {
  for (const f of findings) process.stdout.write('FAIL  ' + f + '\n')
  process.stderr.write('components-check: ' + findings.length + ' finding(s) in ' + manifestPath +
    ' — fix the listed entries/fields\n')
  process.exit(1)
}

process.stdout.write('components-check: ' + manifestPath + ' — ' + entries.length + ' entr' +
  (entries.length === 1 ? 'y' : 'ies') + ' valid\n')
process.exit(0)
