'use strict'
// lib/brief.js — the ONE parse and the ONE comparison of a spec's `brief:` stamp
// (specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md D1). A stamp parses once into
// { kind: 'briefed', num } or { kind: 'adhoc' }; relateBriefs(a, b) is the only place two briefs
// are compared and answers same | different | unknown, every unknown carrying its reason.
//
// What this deliberately does NOT do: any I/O, serialize to --json (callers print briefNum(v)),
// or accept a raw string where a parsed brief is expected — relateBriefs throws TypeError instead.
// variant-lint.js fails the suite on any `.brief` read in a boolean/coalescing/equality position
// under spec/scripts/** outside this file.
//
// Exit codes: n/a (library, not an entrypoint) — never exits.

const BRIEFLESS = /^(n\/a|none|-|—)$/i

// Brief ids are NN plus an optional single lowercase letter (04, 04a, 15a, …): '4b-auth' -> '04b'.
function normBrief(v) {
  const m = String(v).trim().match(/^(\d+)([A-Za-z]?)(?:-.*)?$/)
  return m ? m[1].padStart(2, '0') + m[2].toLowerCase() : String(v).trim()
}

function parseBrief(raw) {
  if (typeof raw !== 'string') return { kind: 'adhoc' }
  const t = raw.trim()
  if (t === '' || BRIEFLESS.test(t)) return { kind: 'adhoc' }
  return { kind: 'briefed', num: normBrief(raw) }
}

function need(v) {
  if (v === null || typeof v !== 'object' || !('kind' in v)) {
    throw new TypeError('relateBriefs: expected a parsed brief, got ' + (v === null ? 'null' : typeof v))
  }
}

function relateBriefs(a, b) {
  need(a); need(b)
  const la = a.kind === 'briefed', lb = b.kind === 'briefed'
  if (la && lb) return { relation: a.num === b.num ? 'same' : 'different', reason: null }
  return { relation: 'unknown', reason: !la && !lb ? 'both ad-hoc' : !la ? 'left ad-hoc' : 'right ad-hoc' }
}

function briefNum(v) { return v.kind === 'briefed' ? v.num : null }

// Brief ids are NN plus an optional letter suffix; 04 < 04a < 04b < 05. Ad-hoc sorts last.
function briefOrd(v) {
  if (v.kind !== 'briefed') return Infinity
  const m = v.num.match(/^(\d+)([a-z]?)$/)
  return m ? Number(m[1]) + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : NaN
}

module.exports = { parseBrief, relateBriefs, briefNum, briefOrd, normBrief }
