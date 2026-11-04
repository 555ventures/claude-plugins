#!/usr/bin/env node
'use strict'
// lib/file-plan.js — the sole parser for a spec's `## File Plan` table, shared by spec-status.js,
// scope-reconcile.js and ac-matrix.js. No CLI of its own.
// Owner: specs/20260805/01-review-scope-reconciliation.md.
//
// What it deliberately does NOT do: validate Action/annotation columns, resolve globs, or
// diff against a changed-file set — callers own that.
//
// Exit codes: n/a (library, not an entrypoint).

// File Plan tables live in the spec BODY. Zero rows parsed is the sanctioned no-op, never an error.
// Path in column 1; compound cells (`a + b`, comma lists, `{a,b}.ext` braces, trailing `(generated)`) split.
function splitPlanCell(cell) {
  cell = cell.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const brace = cell.match(/^(.*)\{([^}]+)\}(.*)$/)
  if (brace) return brace[2].split(',').map(x => (brace[1] + x.trim() + brace[3]).trim())
  return cell.split(/\s*\+\s*|,\s*/).map(x => x.trim()).filter(Boolean)
}

// walkFilePlanTables — module-private, shared by parseFilePlan and parseFilePlanRows. Finds the
// `## File Plan` (or `###`) section and walks it table-scoped: a table is a maximal run of `|` lines; any
// other line resets actionIdx/layerIdx. Only a table's first non-separator row can bind them (first cell
// matching `/^(file|path)s?$/i`). Returns `{ cells, actionIdx, layerIdx }` per data row, bound by that
// row's own table.
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
  const rawCellsOf = line => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
  const cellsOf = line => rawCellsOf(line).map(c => c.replace(/`/g, '').trim())
  const rows = []
  let actionIdx = -1, layerIdx = -1, summaryIdx = -1, pathIdx = 0, sawFirstRow = false
  for (let i = start; i < end; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) { actionIdx = -1; layerIdx = -1; summaryIdx = -1; pathIdx = 0; sawFirstRow = false; continue } // table boundary
    const cells = cellsOf(line)
    if (cells.every(c => !c || /^:?-{2,}:?$/.test(c))) continue // separator row
    if (!sawFirstRow) {
      sawFirstRow = true
      const hdrPath = cells.findIndex(c => /^(file|path)s?$/i.test(c))
      if (hdrPath >= 0) {
        pathIdx = hdrPath // the Path column may sit anywhere (a reordered table); default is column 1
        actionIdx = cells.findIndex(c => /^actions?$/i.test(c))
        layerIdx = cells.findIndex(c => /^layers?$/i.test(c))
        summaryIdx = cells.findIndex(c => /^summary$/i.test(c))
        continue // this table's header row, not a data row
      }
    }
    rows.push({ cells, rawCells: rawCellsOf(line), pathIdx, actionIdx, layerIdx, summaryIdx })
  }
  return rows
}

// A cell entry is a path when it has a directory or an extension — or when it is one bare token
// (`Dockerfile`, `Makefile`) on a row whose own Action cell opens with a file action, the one
// thing that tells a root-level file without an extension from a placeholder word.
const FILE_ACTION_RE = /^(create|modify|delete|rename|move)\b/i
function rowPaths({ cells, actionIdx, pathIdx = 0 }) {
  const hasAction = actionIdx >= 0 && FILE_ACTION_RE.test(cells[actionIdx] || '')
  return splitPlanCell(cells[pathIdx] || '').filter(p => p.includes('/') || /\.[A-Za-z0-9]+$/.test(p) ||
    (hasAction && /^[A-Za-z0-9_-]+$/.test(p)))
}

function parseFilePlan(text) {
  const paths = new Set()
  for (const row of walkFilePlanTables(text)) {
    for (const p of rowPaths(row)) paths.add(p)
  }
  return [...paths]
}

// parseFilePlanRows — exposes the Action/Layer columns parseFilePlan discards (ac-matrix.js finds
// `tests`-layer rows with it). Column positions come from EACH TABLE'S OWN header (case-insensitive, any
// order); a table with no Layer column yields `layer: null` on its own rows only.
function parseFilePlanRows(text) {
  const rows = []
  for (const row of walkFilePlanTables(text)) {
    const { cells, rawCells, actionIdx, layerIdx, summaryIdx } = row
    const paths = rowPaths(row)
    if (!paths.length) continue
    rows.push({
      paths,
      action: actionIdx >= 0 ? (cells[actionIdx] || null) : null,
      layer: layerIdx >= 0 ? (cells[layerIdx] || null) : null,
      // Summary keeps its backticks (the packages a manifest row names live in them); null when
      // the row's own table binds no Summary column. specs/20261029/05 D2a.
      summary: summaryIdx >= 0 ? (rawCells[summaryIdx] || '') : null,
    })
  }
  return rows
}

// True exactly when the row's Layer cell reads tests or test, any case, surrounding space ignored.
function isTestsRow(row) {
  return /^tests?$/i.test(String(row && row.layer || '').trim())
}

module.exports = { parseFilePlan, splitPlanCell, parseFilePlanRows, isTestsRow }
