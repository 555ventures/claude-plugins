'use strict'
// const { readManifest } = require('./lib/manifest')   // readManifest(path) -> null | { rows, byLeg, valid, cause, digest }
//
// Owner: specs/20261104/01-the-legs-seal-the-manifest.md D1
//
// The one reader of an evidence manifest (<spec>.review/manifest-N.jsonl, one JSON row per leg).
// verdict.js, the review driver, ac-matrix.js, release-legs.js and review-legs.js all read through
// here so they agree on rows, validity and the per-leg map. `rows` is every parseable non-blank
// line in file order; `byLeg` maps a leg to its FIRST row; `digest` is the sha256 hex of the bytes;
// `valid`/`cause` report the first failure: an unparseable row or one lacking a string leg /
// numeric exit, an `observed` that is not a non-null JSON object, or a second row for a leg.
//
// Does NOT: resolve a duplicate leg (a later row never replaces an earlier one — a second run is
// not evidence), write anything, or classify scopes (verdict.js owns that).
//
// Returns null when the path cannot be read; a missing manifest is absent, never an empty green file.

const fs = require('fs')
const crypto = require('crypto')

function readManifest(p) {
  let buf
  try {
    buf = fs.readFileSync(p)
  } catch {
    return null
  }
  const rows = []
  const byLeg = new Map()
  const lineOf = new Map()
  let cause = null
  const lines = buf.toString('utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const lineNo = i + 1
    let row
    try {
      row = JSON.parse(lines[i])
    } catch {
      if (cause === null) cause = 'row ' + lineNo + ' unparseable'
      continue
    }
    if (row === null || typeof row !== 'object' || typeof row.leg !== 'string' || !row.leg || typeof row.exit !== 'number') {
      if (cause === null) cause = 'row ' + lineNo + ' unparseable'
      continue
    }
    rows.push(row)
    if (row.observed === null || typeof row.observed !== 'object' || Array.isArray(row.observed)) {
      if (cause === null) cause = 'row ' + lineNo + ' observed must be a non-null JSON object'
    }
    if (byLeg.has(row.leg)) {
      if (cause === null) cause = 'duplicate leg ' + row.leg + ' (rows ' + lineOf.get(row.leg) + ', ' + lineNo + ')'
    } else {
      byLeg.set(row.leg, row)
      lineOf.set(row.leg, lineNo)
    }
  }
  return { rows, byLeg, valid: cause === null, cause, digest: crypto.createHash('sha256').update(buf).digest('hex') }
}

module.exports = { readManifest }
