'use strict'
// lib/spec-sections.js — the sole authority for the AC-ID grammar, `## `/`### ` section
// extraction, and top-level AC-bullet parsing (specs/20260817/07-promise-sweep-leg.md D3).
// Extracted verbatim from ac-matrix.js so promise-sweep.js — a sibling script that also needs
// the AC-ID grammar and section extraction to enumerate a spec's own `## Decisions` and
// `## Acceptance Criteria` sections — can reuse them without either duplicating the regex (a
// second derivation of a load-bearing shape) or requiring ac-matrix.js as a module (a script
// that parses argv and calls process.exit as a side effect of being required). ac-matrix.js now
// imports from here; every observed string, finding class, and exit code it produces stays
// byte-identical (tests/ac-matrix/ac-matrix.test.js is the byte-identity pin).
//
// ac-matrix.js's header previously claimed a test named `ac-id-lint.test.js` lifts AC_ID_RE from
// its source — that test does not exist (grep evidence, 2026-08-17); this file is the single
// authority and no test lifts the regex from anywhere else.
//
// What this deliberately does NOT do: parse a spec's `## Decisions` table (promise-sweep.js's
// row-carrier grammar is its own, with no counterpart here), or read a file — both exports take
// a string and are pure.
//
// specs/20260821/01-red-check.md D1 (2026-08-21): `parseAcBullets` gains a `preGreen` field —
// the raw trimmed string inside a sibling `[pre-green: <reason>]` tag, or `null` when untagged —
// alongside the pre-existing `oracle`/`env` fields. `PRE_GREEN_REASONS` is exported as the SINGLE
// closed-enum authority (`fallback-rejection` | `absence-invariant` | `predicate-in-test`); this
// parser does NO enum validation itself — every consumer (ac-matrix.js D6, red-check.js D2)
// validates against the exported enum and fails closed on an out-of-enum reason. The bullet
// object also now carries `raw` (the bullet's full joined text, continuation lines included) —
// red-check.js needs it to check for a `SHALL CONTINUE TO` sanctioned-pin phrase, and no existing
// consumer's shape assertion depended on the object's key set being closed.
//
// Exit codes: n/a (library, not an entrypoint).

// AC-ID shape: full anchored match of `AC-\d{8}-\d{2}[a-z]?-\d+`.
const AC_ID_RE = /^AC-\d{8}-\d{2}[a-z]?-\d+$/
const AC_ID_RE_GLOBAL = /AC-\d{8}-\d{2}[a-z]?-\d+/g

// The closed enum of `[pre-green: <reason>]` sub-shapes (D1) — the single authority every
// consumer validates a tagged bullet's raw reason against.
const PRE_GREEN_REASONS = ['fallback-rejection', 'absence-invariant', 'predicate-in-test']

function extractSection(text, heading) {
  const lines = text.split('\n')
  let start = -1, level = 0
  const re = new RegExp(`^(#{2,3}) ${heading}`, 'i')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m) { start = i + 1; level = m[1].length; break }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/)
    if (hm && hm[1].length <= level) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

function parseAcBullets(sectionText) {
  const stripped = sectionText.replace(/<!--[\s\S]*?-->/g, '')
  const lines = stripped.split('\n')
  const groups = []
  let cur = null
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (cur) groups.push(cur)
      cur = [line]
    } else if (cur) {
      cur.push(line)
    }
  }
  if (cur) groups.push(cur)
  return groups.map(linesArr => {
    const raw = linesArr.join('\n')
    const tokenMatch = linesArr[0].match(/^- \*\*([^*]*)\*\*/)
    const token = tokenMatch ? tokenMatch[1] : ''
    const malformed = !AC_ID_RE.test(token)
    const oracleMatch = raw.match(/\[oracle:\s*([^\]]+)\]/)
    const envMatch = raw.match(/\[env:\s*([^\]]+)\]/)
    const preGreenMatch = raw.match(/\[pre-green:\s*([^\]]+)\]/)
    return {
      id: malformed ? null : token,
      token,
      malformed,
      raw,
      oracle: oracleMatch ? oracleMatch[1].trim() : null,
      env: envMatch ? envMatch[1].trim() : null,
      preGreen: preGreenMatch ? preGreenMatch[1].trim() : null,
    }
  })
}

module.exports = { AC_ID_RE, AC_ID_RE_GLOBAL, PRE_GREEN_REASONS, extractSection, parseAcBullets }
