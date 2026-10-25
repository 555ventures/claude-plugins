#!/usr/bin/env node
'use strict'
// lib/escape-row.js — the ONE escape-row validator: the slim escape row shape, the legacy
// reader (`file` string, dropped fields ignored), and the amendment helpers the fleet reader
// still joins (escapeKey, joinAmendments, validateAmendmentRow).
//
// Owner: specs/20261025/01-the-commit-writes-the-escape-row.md D3, D10.
//
// What this deliberately does NOT do: read or write a ledger file (escape-row.js owns the
// append; fleet-reader.js owns discovery), decide the effective class for a row (the caller
// joins joinAmendments' map against its own rows — this module never consults escape rows
// from inside joinAmendments), or offer a CLI of its own.
//
// Exit codes: n/a (library, not an entrypoint).

const PREVENTED_BY = ['doctrine', 'enforcer', 'review-check', 'runtime-leg', 'none']
const FOUND_BY = ['user', 'later-spec', 'production']
const SEVERITY = ['hard', 'soft']
const UNCLASSED_REASONS = ['no-fix-diff', 'deferred']
const CLASS_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VIA = ['commit', 'spec-fix', 'manual', 'backfill']   // backfill: legacy amendment rows only

// escapeKey: the join key both an escape row and its escape-class amendment share. An escape
// row has no escapeTs of its own, so it falls back to its own ts.
function escapeKey(row) {
  const ts = row.escapeTs !== undefined && row.escapeTs !== null ? row.escapeTs : row.ts
  return `${ts}\0${row.spec}\0${row.file}`
}

// Shared class/unclassedReason rules (closed reason set) — identical on an escape
// row and an amendment row. `amended` suppresses class-missing on an escape row whose key has
// a joining amendment (that amendment supplies the effective class/reason instead); it is
// never passed for an amendment row itself.
function classReasons(row, { amended = false } = {}) {
  const reasons = []
  const cls = row.class
  const reason = row.unclassedReason
  const classIsSet = cls !== null && cls !== undefined
  const classIsString = typeof cls === 'string'
  if (classIsSet && !(classIsString && CLASS_ID_RE.test(cls))) reasons.push('class-malformed')
  const reasonIsSet = reason !== null && reason !== undefined
  if (reasonIsSet && !UNCLASSED_REASONS.includes(reason)) reasons.push('unclassed-reason-out-of-enum')
  if (classIsString && reasonIsSet) reasons.push('unclassed-reason-with-class')
  if (!classIsSet && !reasonIsSet && !amended) reasons.push('class-missing')
  return reasons
}

// escapeFiles(row) -> string[]: every file an escape row names — `files` when an array, else
// the legacy single `file` string, else [].
function escapeFiles(row) {
  if (Array.isArray(row.files)) return row.files
  if (typeof row.file === 'string') return [row.file]
  return []
}

// validateEscapeRow(row) -> string[] (empty = valid), closed reason set: files-missing,
// files-entry-not-string, class-malformed, sha-malformed, via-out-of-enum. The legacy keys
// foundBy, severity, killedMatch, softMatch, preventedBy and unclassedReason are ignored.
function validateEscapeRow(row) {
  const reasons = []
  const hasFiles = Array.isArray(row.files) ? row.files.length > 0 : typeof row.file === 'string'
  if (!hasFiles) reasons.push('files-missing')
  else if (escapeFiles(row).some(f => typeof f !== 'string')) reasons.push('files-entry-not-string')
  const cls = row.class
  if (cls !== null && cls !== undefined && !(typeof cls === 'string' && CLASS_ID_RE.test(cls))) reasons.push('class-malformed')
  const sha = row.sha
  if (sha !== null && sha !== undefined && !(typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha))) reasons.push('sha-malformed')
  if (row.via !== undefined && row.via !== null && !VIA.includes(row.via)) reasons.push('via-out-of-enum')
  return reasons
}

// validateAmendmentRow(row) -> string[]. An amendment row is never validated with
// {amended:true} — its own class-missing check is unconditional.
function validateAmendmentRow(row) {
  const reasons = classReasons(row)
  if (typeof row.escapeTs !== 'string') reasons.push('amendment-missing-escape-ts')
  if (!VIA.includes(row.via)) reasons.push('amendment-via-out-of-enum')
  return reasons
}

// joinAmendments(rows) -> Map<key, {class, unclassedReason, ts}>: for every stage:"escape-class"
// row, latest ts wins; equal ts -> later read order wins (>= on the comparison, since rows
// arrive in read order). Never consults escape rows — the caller joins this map against its own
// escape rows and detects unmatched amendments itself.
function joinAmendments(rows) {
  const map = new Map()
  for (const row of rows) {
    if (row.stage !== 'escape-class') continue
    const key = escapeKey(row)
    const existing = map.get(key)
    const ts = row.ts
    const wins = !existing || typeof ts !== 'string' || typeof existing.ts !== 'string' || ts >= existing.ts
    if (wins) map.set(key, { class: row.class ?? null, unclassedReason: row.unclassedReason ?? null, ts })
  }
  return map
}

module.exports = {
  PREVENTED_BY, FOUND_BY, SEVERITY, UNCLASSED_REASONS, CLASS_ID_RE, VIA,
  escapeKey, escapeFiles, validateEscapeRow, validateAmendmentRow, joinAmendments,
}
