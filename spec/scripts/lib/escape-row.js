#!/usr/bin/env node
'use strict'
// lib/escape-row.js — the ONE escape-row validator. Exports the enums an escape or
// escape-class (amendment) row must satisfy, the join key both row shapes share, and three
// pure functions: validateEscapeRow, validateAmendmentRow, joinAmendments.
//
// Why: specs/20260901/07-escape-class-contract.md D1. Before this module, fleet-reader.js's
// PREVENTED_BY/FOUND_BY/SEVERITY sets were inline and nothing validated the `class` field at
// all — a session `printf` could (and on 2026-08-xx did) write `preventedBy:"test"` and
// `foundBy:"build"` straight into a fleet ledger, and a null `class` with no excuse was
// indistinguishable from a deliberately-unclassable row. This module is now the ONE place
// `escape-row.js` (the CLI writer) and `fleet-reader.js` (the drift census + effective-class
// join) both read the reason set from, so the two can never disagree on what "valid" means.
//
// What this deliberately does NOT do: read or write a ledger file (escape-row.js owns the
// append; fleet-reader.js owns discovery), decide the effective class for a row (the caller
// joins joinAmendments' map against its own rows — this module never consults escape rows
// from inside joinAmendments, D1 Contracts), or offer a CLI of its own.
//
// Exit codes: n/a (library, not an entrypoint).

const PREVENTED_BY = ['doctrine', 'enforcer', 'review-check', 'runtime-leg', 'none']
const FOUND_BY = ['user', 'later-spec', 'production']
const SEVERITY = ['hard', 'soft']
const UNCLASSED_REASONS = ['no-fix-diff', 'deferred']
const CLASS_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VIA = ['backfill', 'manual']

// escapeKey: the join key both an escape row and its escape-class amendment share. An escape
// row has no escapeTs of its own, so it falls back to its own ts (D1 Contracts).
function escapeKey(row) {
  const ts = row.escapeTs !== undefined && row.escapeTs !== null ? row.escapeTs : row.ts
  return `${ts}\0${row.spec}\0${row.file}`
}

// Shared class/unclassedReason rules (D1 Contracts closed reason set) — identical on an escape
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

// validateEscapeRow(row, {amended}) -> string[] (empty = valid). preventedBy/foundBy/severity
// keep fleet-reader's pre-existing reason spellings (D1 Contracts: "the three existing reason
// names keep their spelling").
function validateEscapeRow(row, { amended = false } = {}) {
  const reasons = classReasons(row, { amended })
  if (!PREVENTED_BY.includes(row.preventedBy)) reasons.push('preventedBy-out-of-enum')
  if (!FOUND_BY.includes(row.foundBy)) reasons.push('foundBy-out-of-enum')
  if (!SEVERITY.includes(row.severity)) reasons.push('severity-out-of-enum')
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
// escape rows and detects unmatched amendments itself (D1 Contracts).
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
  escapeKey, validateEscapeRow, validateAmendmentRow, joinAmendments,
}
