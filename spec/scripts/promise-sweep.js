#!/usr/bin/env node
'use strict'
// promise-sweep.js --spec <path> [--manifest <path>] [--json]
//
// Owner: specs/20260817/07-promise-sweep-leg.md.
//
// Why: a `## Decisions` row that promises behavior nothing implements fails no test. This script
// enumerates every non-struck Decisions row and requires each to name a carrier — an AC-ID declared in
// the same spec's `## Acceptance Criteria` — or an explicit `[no-ac: <non-empty reason>]` sanction.
// Advisory at plan lock (no --manifest); a findings leg in every review scope.
//
// Applicability cutoff: spec date = the first `specs/<YYYYMMDD>/` segment of --spec, compared against
// lib/spec-sections.js's `V7_APPLIES_FROM`. A pre-cutoff spec exits 0 with zero findings (and appends a
// `not-applicable` row with --manifest); a path with no dated segment gets the full sweep.
//
// Manifest rows carry typed objects — {"rows":N,"carried":C,"sanctioned":S,"orphans":O} and
// {"notApplicable":{"spec":"YYYYMMDD","appliesFrom":"YYYYMMDD"}} — while the stdout lines and --json
// `observed` stay the plain strings plan.md's lock step copies verbatim.
//
// What this deliberately does NOT do: read anything but the spec text (ac-matrix.js owns the AC-ID ->
// test -> executed chain), or require ac-matrix.js as a module (it exits on require). Shared parsing
// comes from lib/spec-sections.js.
//
// Exit codes: 0 = executed, no findings (every non-struck row carried or sanctioned), OR a
// pre-cutoff spec exempted by the applicability cutoff (not-applicable, zero findings) ·
// 1 = executed, findings emitted (orphan-decision rows — rides the normal review disposition
// flow, or resolved by hand at plan lock; never a script failure) · 2 = usage error, unreadable
// --spec, or a spec with no `## Decisions` section (stderr names the remedy).

const fs = require('fs')
const { AC_ID_RE_GLOBAL, extractSection, V7_APPLIES_FROM } = require('./lib/spec-sections')

function usage() {
  console.error('usage: promise-sweep.js --spec <path> [--manifest <path>] [--json]')
}

let specPath = null, manifestPath = null, jsonOut = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--manifest') manifestPath = argv[++i]
  else if (a === '--json') jsonOut = true
  else { usage(); process.exit(2) }
}
if (!specPath) { usage(); process.exit(2) }
const appliesFrom = V7_APPLIES_FROM

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`promise-sweep: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}

// ---- applicability cutoff (see header); runs before any Decisions-section read, so a pre-cutoff spec
// with no `## Decisions` section is still exempted, never a usage error.
const specDateMatch = /specs\/(\d{8})\//.exec(specPath)
if (specDateMatch && specDateMatch[1] < appliesFrom) {
  const specDate = specDateMatch[1]
  // Typed manifest row; the stdout line stays "not-applicable spec=X appliesFrom=Y".
  const observed = { notApplicable: { spec: specDate, appliesFrom } }
  const stdoutLine = `not-applicable spec=${specDate} appliesFrom=${appliesFrom}`
  if (manifestPath) {
    try {
      fs.appendFileSync(manifestPath, JSON.stringify({ leg: 'promise-sweep', exit: 0, observed }) + '\n')
    } catch (e) {
      console.error(`promise-sweep: cannot append to --manifest ${manifestPath}: ${e.message}`)
      process.exit(2)
    }
  }
  if (jsonOut) {
    console.log(JSON.stringify({ findings: [], warnings: [], observed: stdoutLine }, null, 2))
  } else {
    console.log(`promise-sweep: ${stdoutLine}`)
  }
  process.exit(0)
}

const decisionsSection = extractSection(specText, 'Decisions')
if (decisionsSection === null) {
  console.error(`promise-sweep: ${specPath} has no ## Decisions section — nothing to sweep`)
  process.exit(2)
}

// ---- own-spec AC-ID declarations: only a bullet declared in THIS spec's Acceptance Criteria carries a
// ---- row; a foreign spec's AC-ID is provenance, never a carrier.
const acSection = extractSection(specText, 'Acceptance Criteria')
const declaredAcIds = new Set(
  acSection === null ? [] : [...acSection.matchAll(/^- \*\*([^*]*)\*\*/gm)].map(m => m[1])
)

// ---- row enumeration: `^\|\s*(~~)?\s*D\d+` — the whole row text is scanned for
// ---- carriers; struck rows (first cell `~~D…~~`) are excluded entirely, never a finding.
const ROW_RE = /^\|\s*(~~)?\s*D\d+.*$/
const rows = decisionsSection.split('\n').filter(line => ROW_RE.test(line))
const liveRows = rows.filter(line => !/^\|\s*~~/.test(line))

const findings = []
let carried = 0, sanctioned = 0, orphans = 0

for (const row of liveRows) {
  const idMatch = row.match(/^\|\s*(~~)?\s*(D\d+[a-zA-Z′']*)/)
  const dId = idMatch ? idMatch[2] : row.trim()

  // Anchored AC-ID occurrence: full-token match, not preceded by [A-Za-z0-9] and not followed
  // by [0-9A-Za-z] — the 20260817/05 discipline, so AC-...-1 inside AC-...-11 is not a hit.
  const citations = [...row.matchAll(AC_ID_RE_GLOBAL)]
    .filter(m => {
      const before = row[m.index - 1]
      const after = row[m.index + m[0].length]
      const beforeOk = !before || !/[A-Za-z0-9]/.test(before)
      const afterOk = !after || !/[0-9A-Za-z]/.test(after)
      return beforeOk && afterOk
    })
    .map(m => m[0])
  const uniqueCitations = [...new Set(citations)]
  const ownSpecHit = uniqueCitations.some(id => declaredAcIds.has(id))

  if (ownSpecHit) {
    carried++
    continue
  }

  // Carried wins over [no-ac:]; sanctioned fires on ANY [no-ac:] occurrence with a non-empty reason.
  const noAcMatches = [...row.matchAll(/\[no-ac:\s*([^\]]*)\]/g)]
  if (noAcMatches.some(m => m[1].trim() !== '')) {
    sanctioned++
    continue
  }

  orphans++
  const unmatched = uniqueCitations.filter(id => !declaredAcIds.has(id))
  const detail = `${dId}: no carrier — cite one of this spec's AC-IDs or add [no-ac: <reason>]` +
    (unmatched.length ? ` (unmatched citations: ${unmatched.join(', ')})` : '')
  findings.push({ severity: 'hard', class: 'orphan-decision', id: dId, detail })
}

// Typed manifest row; the stdout/--json observed stays the packed string plan.md copies.
const observed = { rows: liveRows.length, carried, sanctioned, orphans }
const stdoutLine = `rows=${liveRows.length} carried=${carried} sanctioned=${sanctioned} orphans=${orphans}`
const exitCode = findings.length ? 1 : 0

if (manifestPath) {
  try {
    fs.appendFileSync(manifestPath, JSON.stringify({ leg: 'promise-sweep', exit: exitCode, observed }) + '\n')
  } catch (e) {
    console.error(`promise-sweep: cannot append to --manifest ${manifestPath}: ${e.message}`)
    process.exit(2)
  }
}

if (jsonOut) {
  console.log(JSON.stringify({ findings, warnings: [], observed: stdoutLine }, null, 2))
} else {
  for (const f of findings) console.log(`HARD  ${f.class.padEnd(20)} ${f.detail}`)
  console.log(`promise-sweep: ${stdoutLine} · ${findings.length} finding(s)`)
}

process.exit(exitCode)
