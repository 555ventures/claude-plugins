#!/usr/bin/env node
'use strict'
// lib/escape-row.js — the ONE escape-row validator: the slim escape row shape and the legacy
// reader (`file` string; fields no writer produces are ignored).
//
// Owner: specs/20261025/02-readers-keep-only-the-surviving-escape-fields.md D4.
//
// What this deliberately does NOT do: read or write a ledger file (fleet-reader.js owns
// discovery), decide the effective class for a row (a row's class is its own `class` field),
// or offer a CLI of its own.
//
// Exit codes: n/a (library, not an entrypoint).

const CLASS_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VIA = ['commit', 'spec-fix', 'manual', 'backfill']   // backfill: legacy rows only

// escapeFiles(row) -> string[]: every file an escape row names — `files` when an array, else
// the legacy single `file` string, else [].
function escapeFiles(row) {
  if (Array.isArray(row.files)) return row.files
  if (typeof row.file === 'string') return [row.file]
  return []
}

// validateEscapeRow(row) -> string[] (empty = valid), closed reason set: files-missing,
// files-entry-not-string, class-malformed, sha-malformed, via-out-of-enum. Any other key a
// legacy row carries is ignored.
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

module.exports = { CLASS_ID_RE, VIA, escapeFiles, validateEscapeRow }
