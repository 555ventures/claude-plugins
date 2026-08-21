#!/usr/bin/env node
'use strict'
// promise-sweep.js --spec <path> [--manifest <path>] [--json] [--applies-from <YYYYMMDD>]
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
// Incident (2026-08-20, spec review-observation-truth.md D5, Salon OS field report): the sweep
// applied retroactively to specs locked before this carrier convention existed, producing 52
// noise findings that trained bulk-waiving — escape rv_8b7c4e2e9ec0 shipped inside a 17/17-waive
// review. It now gains an applicability cutoff: spec date = the first `specs/<YYYYMMDD>/` path
// segment in --spec, compared against built-in `APPLIES_FROM = '20260817'` (the date this
// convention shipped, specs/20260817/07), overridable via `--applies-from <YYYYMMDD>` (must be 8
// digits). A pre-cutoff spec skips Decisions enumeration entirely, exits 0 with zero findings, and
// (with --manifest) appends a distinct `not-applicable` row instead of a swept one. A path with no
// `specs/<YYYYMMDD>/` segment applies the sweep in full — unchanged, fail-closed behavior every
// existing tmpdir-based test pin depends on. One parameter, no baseline file, no host config key:
// the convention's ship date is a plugin fact.
//
// specs/20260820/06-typed-evidence-manifest.md D8/D9 (2026-08-20, brief 16's second move): the
// two rows this script can append to --manifest carry typed JSON objects, not packed strings —
// the counted row is {"rows":N,"carried":C,"sanctioned":S,"orphans":O} and the pre-cutoff row is
// {"notApplicable":{"spec":"YYYYMMDD","appliesFrom":"YYYYMMDD"}}. The human-readable stdout
// counters line ("rows=N carried=C sanctioned=S orphans=O") and the pre-cutoff stdout line
// ("not-applicable spec=X appliesFrom=Y") — and this script's own --json `observed` field, which
// mirrors those same stdout strings — stay byte-unchanged (D8): plan.md's lock step copies the
// plain-mode line verbatim into the plan ledger row, and only ac-matrix.js's --json observed is
// retyped by this spec, not this script's.
//
// What this deliberately does NOT do: read anything but the spec text — no --root, no File Plan
// parsing, no test-file reads (ac-matrix.js owns the AC-ID -> test -> executed chain; this
// script only proves Decision -> AC). It also never requires ac-matrix.js as a module — that
// script parses argv and calls process.exit as a side effect of being required, so it cannot be
// imported by a sibling. Shared parsing (AC-ID grammar, `## ` section extraction) is imported
// from lib/spec-sections.js, the single authority both scripts use (D3).
//
// Exit codes: 0 = executed, no findings (every non-struck row carried or sanctioned), OR a
// pre-cutoff spec exempted by the applicability cutoff (not-applicable, zero findings) ·
// 1 = executed, findings emitted (orphan-decision rows — rides the normal review disposition
// flow, or resolved by hand at plan lock; never a script failure) · 2 = usage error, unreadable
// --spec, a spec with no `## Decisions` section, or a malformed --applies-from value (not 8
// digits) (stderr names the remedy).

const fs = require('fs')
const { AC_ID_RE_GLOBAL, extractSection } = require('./lib/spec-sections')

const APPLIES_FROM = '20260817'

function usage() {
  console.error('usage: promise-sweep.js --spec <path> [--manifest <path>] [--json] [--applies-from <YYYYMMDD>]')
}

let specPath = null, manifestPath = null, jsonOut = false, appliesFromArg = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--manifest') manifestPath = argv[++i]
  else if (a === '--json') jsonOut = true
  else if (a === '--applies-from') appliesFromArg = argv[++i]
  else { usage(); process.exit(2) }
}
if (!specPath) { usage(); process.exit(2) }
if (appliesFromArg !== null && !/^\d{8}$/.test(appliesFromArg)) {
  console.error(`promise-sweep: --applies-from must be 8 digits (YYYYMMDD) — got "${appliesFromArg}"`)
  process.exit(2)
}
const appliesFrom = appliesFromArg || APPLIES_FROM

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`promise-sweep: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}

// ---- applicability cutoff (D5, specs/20260820/03-review-observation-truth.md): spec date = the
// first specs/<YYYYMMDD>/ path segment in --spec; a path with none applies the sweep in full
// (fail-closed — every existing tmpdir-based test fixture has no dated segment and depends on
// this default staying unchanged). Runs before any Decisions-section read, so a pre-cutoff spec
// with no `## Decisions` section at all is still exempted, never a usage error.
const specDateMatch = /specs\/(\d{8})\//.exec(specPath)
if (specDateMatch && specDateMatch[1] < appliesFrom) {
  const specDate = specDateMatch[1]
  // D9: the MANIFEST row's observed is the typed {"notApplicable":{"spec":...,"appliesFrom":...}}
  // object; the human stdout line below stays the byte-unchanged "not-applicable spec=X
  // appliesFrom=Y" string (D8) — plan.md never reads this branch's stdout, but AC-20260820-03-7
  // pins the literal text regardless.
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

// D9: the MANIFEST row's observed is the typed {"rows":N,"carried":C,"sanctioned":S,"orphans":O}
// object; the human stdout/--json observed stays the byte-unchanged packed string (D8: plan.md's
// lock step copies the plain stdout line verbatim into the plan ledger row, and only ac-matrix's
// --json observed is retyped by this spec — promise-sweep's is not).
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
