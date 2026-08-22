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
// Hardened 2026-08-22 (specs/20260821/01-red-check.md review finding, reviewer-1.json): the
// `[oracle:]`/`[env:]`/`[pre-green:]` extractions used to be unanchored substring searches over
// the bullet's whole raw text, so an AC bullet that merely ILLUSTRATES the tag syntax in its own
// prose (documentation-by-example, the pattern spec.md/plan.md themselves encourage) self-tagged
// — this spec's own AC-20260821-01-1 and AC-20260821-01-2 misparsed as carrying real tags. A tag
// is now recognised in exactly two positions: (1) the DECLARATION SLOT — directly between the
// bold AC token's closing `**` and the `:` that opens the requirement text, optionally wrapped in
// backticks (`spec/templates/spec.md` line 129-130; where all real tags in `specs/` sit today),
// or (2) TRAILING — the tag is the last non-whitespace content of the bullet's raw text, optionally
// backticked. A tag appearing mid-prose anywhere else (inside a parenthetical, inside a code span
// mid-sentence, describing the grammar by example) parses as `null`.
//
// Hardened again 2026-08-22 (same-day regression): the position-anchored regexes above each
// matched at most ONE tag occupying the slot, so a bullet declaring two SIBLING tags in the same
// position (`spec/templates/spec.md` lines 90-103 sanction `[env:]` and `[pre-green:]` together —
// only `[oracle:]` alongside a test mapping is forbidden) silently dropped both:
// `` `[env: FOO]` `[oracle: gate]`: `` parsed as `{env: null, oracle: null}`. A dropped `[env:]`
// turns a properly-declared skip into a fabricated hard finding — the exact false-finding class
// this spec exists to eliminate. Both positions now match a RUN of one or more tag items (each
// optionally backticked, whitespace-separated) instead of a single tag: `slotRun`/`trailingRun`
// find the declaration-slot segment (between `**` and the requirement colon) or the trailing run
// once, then `extractTag` searches within that run for the one named tag. A tag anywhere outside
// either run still parses `null`.
//
// Exit codes: n/a (library, not an entrypoint).

// AC-ID shape: full anchored match of `AC-\d{8}-\d{2}[a-z]?-\d+`.
const AC_ID_RE = /^AC-\d{8}-\d{2}[a-z]?-\d+$/
const AC_ID_RE_GLOBAL = /AC-\d{8}-\d{2}[a-z]?-\d+/g

// The closed enum of `[pre-green: <reason>]` sub-shapes (D1) — the single authority every
// consumer validates a tagged bullet's raw reason against.
const PRE_GREEN_REASONS = ['fallback-rejection', 'absence-invariant', 'predicate-in-test']

// One `[tagname: value]` item, optionally backtick-wrapped. `[a-z][a-z-]*` covers the three
// known tag names (oracle, env, pre-green) generically — this is only used to consume a run of
// tag-shaped items, never to extract a value, so it need not be tied to one tagName.
const TAG_ITEM_SRC = '`?\\[[a-z][a-z-]*:\\s*[^\\]]+\\]`?'

// The declaration-slot run — the segment between the bold AC token's closing `**` and the `:`
// that opens the requirement text on the bullet's first line. May hold zero or more tag items
// (`spec/templates/spec.md` 90-103 sanctions sibling tags, e.g. `[env:]` + `[pre-green:]`
// together — only `[oracle:]` alongside a test mapping is forbidden), or null if the first line
// doesn't have this shape at all.
function slotRun(firstLine) {
  const re = new RegExp('^- \\*\\*[^*]*\\*\\*\\s*((?:' + TAG_ITEM_SRC + '\\s*)*):')
  const m = firstLine.match(re)
  return m ? m[1] : null
}

// The trailing run — one or more tag items ending the bullet's full raw text (trailing
// whitespace ignored), or null if the raw text doesn't end in a tag item at all.
function trailingRun(raw) {
  const re = new RegExp('((?:' + TAG_ITEM_SRC + '\\s*)+)$')
  const m = raw.replace(/\s+$/, '').match(re)
  return m ? m[1] : null
}

// Extracts one named `[tagName: value]` tag's value, searching the declaration-slot run first
// and falling through to the trailing run — a slot present but lacking this particular tag must
// still fall through (siblings occupy the same run; this tag may simply be the OTHER position).
// Anything outside either run (mid-prose, inside a parenthetical, a code span mid-sentence) is
// not a declaration and returns null — see the hardening notes above the module header.
function extractTag(tagName, firstLine, raw) {
  const tagRe = new RegExp('`?\\[' + tagName + ':\\s*([^\\]]+)\\]`?')
  const slot = slotRun(firstLine)
  if (slot !== null) {
    const m = slot.match(tagRe)
    if (m) return m[1].trim()
  }
  const trail = trailingRun(raw)
  if (trail !== null) {
    const m = trail.match(tagRe)
    if (m) return m[1].trim()
  }
  return null
}

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
    return {
      id: malformed ? null : token,
      token,
      malformed,
      raw,
      oracle: extractTag('oracle', linesArr[0], raw),
      env: extractTag('env', linesArr[0], raw),
      preGreen: extractTag('pre-green', linesArr[0], raw),
    }
  })
}

module.exports = { AC_ID_RE, AC_ID_RE_GLOBAL, PRE_GREEN_REASONS, extractSection, parseAcBullets }
