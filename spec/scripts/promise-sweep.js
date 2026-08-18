#!/usr/bin/env node
'use strict'
// promise-sweep.js --spec <path> [--manifest <path>] [--json]
//
// Why (2026-08-17, specs/20260817/07-promise-sweep-leg.md D1/D2): the v7 replay eval measured
// the single reviewer's one systematic miss class — a spec `## Decisions` row that promises
// behavior nothing implements. No test fails, so nothing points at it (all five measured misses
// were Decisions-table rows), and the prose "promise sweep" a reviewer performed by hand every
// session drifted per session and per model, same as ac-matrix.js's AC-line lint did before it
// was mechanized. This script IS the deterministic half: it enumerates every non-struck row in
// the spec's `## Decisions` table and requires each to name a carrier — an AC-ID declared in
// that same spec's `## Acceptance Criteria` section (whose test ac-matrix.js already forces to
// exist and execute) — or an explicit `[no-ac: <non-empty reason>]` sanction. It runs advisory
// at plan lock (no --manifest) so orphans die at authoring time, and as a findings leg in every
// review scope (review-legs.js appends its manifest row).
//
// What this deliberately does NOT do: read anything but the spec text — no --root, no File Plan
// parsing, no test-file reads (ac-matrix.js owns the AC-ID -> test -> executed chain; this
// script only proves Decision -> AC). It also never requires ac-matrix.js as a module — that
// script parses argv and calls process.exit as a side effect of being required, so it cannot be
// imported by a sibling. Shared parsing (AC-ID grammar, `## ` section extraction) is imported
// from lib/spec-sections.js, the single authority both scripts use (D3).
//
// Exit codes: 0 = executed, no findings (every non-struck row carried or sanctioned) ·
// 1 = executed, findings emitted (orphan-decision rows — rides the normal review disposition
// flow, or resolved by hand at plan lock; never a script failure) · 2 = usage error, unreadable
// --spec, or a spec with no `## Decisions` section (stderr names the remedy).

const fs = require('fs')
const { AC_ID_RE_GLOBAL, extractSection } = require('./lib/spec-sections')

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

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`promise-sweep: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}

const decisionsSection = extractSection(specText, 'Decisions')
if (decisionsSection === null) {
  console.error(`promise-sweep: ${specPath} has no ## Decisions section — nothing to sweep`)
  process.exit(2)
}

// ---- own-spec AC-ID declarations: only a bullet actually declared in THIS spec's Acceptance
// ---- Criteria section counts as a carrier (D2) — a citation to a foreign spec's AC-ID is
// ---- legitimate provenance and raises no finding of its own, but does not carry the row.
const acSection = extractSection(specText, 'Acceptance Criteria')
const declaredAcIds = new Set(
  acSection === null ? [] : [...acSection.matchAll(/^- \*\*([^*]*)\*\*/gm)].map(m => m[1])
)

// ---- row enumeration: `^\|\s*(~~)?\s*D\d+` (D2/Contracts) — the whole row text is scanned for
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

  // Carried wins over the [no-ac:] tag when both appear (D2) — this branch only runs when no
  // own-spec AC-ID carried the row. A row may mention the literal `[no-ac:]` tag name more than
  // once (e.g. prose discussing the sanction itself alongside the real sanction) — sanctioned
  // fires on ANY occurrence with a non-empty reason, not just the first bracket found.
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

const observed = `rows=${liveRows.length} carried=${carried} sanctioned=${sanctioned} orphans=${orphans}`
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
  console.log(JSON.stringify({ findings, warnings: [], observed }, null, 2))
} else {
  for (const f of findings) console.log(`HARD  ${f.class.padEnd(20)} ${f.detail}`)
  console.log(`promise-sweep: ${observed} · ${findings.length} finding(s)`)
}

process.exit(exitCode)
