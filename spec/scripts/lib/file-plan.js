#!/usr/bin/env node
'use strict'
// lib/file-plan.js — the sole parser for a spec's `## File Plan` table. Extracted verbatim
// from spec-status.js (D2,
// specs/20260805/01-review-scope-reconciliation.md) so spec-status.js and
// scope-reconcile.js share one derivation instead of drifting apart. This module has no CLI
// of its own — it exports parseFilePlan/splitPlanCell for both consumers.
//
// What it deliberately does NOT do: validate Action/annotation columns, resolve globs, or
// diff against a changed-file set — callers own that.
//
// Exit codes: n/a (library, not an entrypoint).

// File Plan tables live in the spec BODY, not frontmatter — the merge-conflict heads-up (⚡
// lanes annotation in spec-status.js) needs to know which files two parallel specs both intend
// to touch. Zero rows parsed is the sanctioned no-op, never an error: a missing/malformed
// section just means "nothing to cross-check" for that spec. Grammar pinned by a 333-spec
// corpus audit: every real File Plan is a `## File Plan` table with the path in
// column 1; the only observed variance is compound cells (`a + b`, comma lists, `{a,b}.ext`
// braces, trailing `(generated)` annotations) at ~1% — split those, and add nothing
// speculative beyond them.
function splitPlanCell(cell) {
  cell = cell.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const brace = cell.match(/^(.*)\{([^}]+)\}(.*)$/)
  if (brace) return brace[2].split(',').map(x => (brace[1] + x.trim() + brace[3]).trim())
  return cell.split(/\s*\+\s*|,\s*/).map(x => x.trim()).filter(Boolean)
}

// walkFilePlanTables — module-private, shared by parseFilePlan and parseFilePlanRows (D1,
// specs/20260816/03-file-plan-table-scoped-parsing.md). Finds the `## File Plan` section (or
// `###`; section ends at the next heading whose level is <= the File Plan heading's level, so
// `###` subheadings under a `##` File Plan stay in-section), then walks it table-scoped: a
// table is a maximal contiguous run of `|`-prefixed lines, and any non-`|` line (blank, prose,
// a `###` subheading) is a table boundary that resets actionIdx/layerIdx to unbound (-1).
// Within a table, separator rows (`---` cells) are skipped and never count as the header
// candidate; ONLY the table's first non-separator row is eligible to bind actionIdx/layerIdx
// (recognized when its first cell matches `/^(file|path)s?$/i`) — every later row of the same
// table is a data row even when its first cell matches that regex (a data row whose path cell
// is literally `file` must not rebind and orphan the rows after it). Returns one entry per
// data row: `{ cells, actionIdx, layerIdx }`, where the indices are whatever was bound (or not)
// by that row's own table at the time the row was read — never a later table's binding applied
// retroactively.
function walkFilePlanTables(text) {
  const lines = text.split('\n')
  let start = -1, level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,3}) File Plan/i)
    if (m) { start = i + 1; level = m[1].length; break }
  }
  if (start === -1) return []
  let end = lines.length
  for (let i = start; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/)
    if (hm && hm[1].length <= level) { end = i; break }
  }
  const cellsOf = line => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.replace(/`/g, '').trim())
  const rows = []
  let actionIdx = -1, layerIdx = -1, sawFirstRow = false
  for (let i = start; i < end; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) { actionIdx = -1; layerIdx = -1; sawFirstRow = false; continue } // table boundary
    const cells = cellsOf(line)
    if (cells.every(c => !c || /^:?-{2,}:?$/.test(c))) continue // separator row
    if (!sawFirstRow) {
      sawFirstRow = true
      if (/^(file|path)s?$/i.test(cells[0] || '')) {
        actionIdx = cells.findIndex(c => /^actions?$/i.test(c))
        layerIdx = cells.findIndex(c => /^layers?$/i.test(c))
        continue // this table's header row, not a data row
      }
    }
    rows.push({ cells, actionIdx, layerIdx })
  }
  return rows
}

function parseFilePlan(text) {
  const paths = new Set()
  for (const { cells } of walkFilePlanTables(text)) {
    for (const p of splitPlanCell(cells[0] || '')) {
      if (p.includes('/') || /\.[A-Za-z0-9]+$/.test(p)) paths.add(p)
    }
  }
  return [...paths]
}

// parseFilePlanRows — additive extension (D2, specs/20260814/01-ac-matrix-script.md): exposes
// the Action/Layer columns that parseFilePlan deliberately discards, without changing
// parseFilePlan's own return shape or any existing caller. ac-matrix.js needs the Layer column
// to find a spec's `tests`-layer File Plan rows without a second table walker or a
// `tests/`-path-prefix heuristic (rejected — breaks on hosts whose test files don't live under
// `tests/`). Column positions are read from EACH TABLE'S OWN header row (case-insensitive
// `Action`/`Layer`, any column order), so a table with a different column order still resolves,
// and a table with no Layer column yields `layer: null` on every row of THAT table (not the
// whole section) rather than misreading an unrelated column or inheriting a sibling table's
// binding. Escaped once (specs/20260816/03-file-plan-table-scoped-parsing.md):
// a second `| Path | ... |` status table under a `### Landed at design stage` subheading
// clobbered the section-wide index binding computed after this function's walk, so
// every row in the section — including the first table's real tests-layer rows — read back
// `layer: null`; fixed by routing both this function and `parseFilePlan` through the shared,
// table-scoped `walkFilePlanTables` walker (D1) instead of two hand-duplicated section walks.
function parseFilePlanRows(text) {
  const rows = []
  for (const { cells, actionIdx, layerIdx } of walkFilePlanTables(text)) {
    const paths = splitPlanCell(cells[0] || '').filter(p => p.includes('/') || /\.[A-Za-z0-9]+$/.test(p))
    if (!paths.length) continue
    rows.push({
      paths,
      action: actionIdx >= 0 ? (cells[actionIdx] || null) : null,
      layer: layerIdx >= 0 ? (cells[layerIdx] || null) : null,
    })
  }
  return rows
}

module.exports = { parseFilePlan, splitPlanCell, parseFilePlanRows }
