'use strict'
// lib/frontmatter.js — the one shared frontmatter-value reader for scripts that parse a spec's
// `---`-delimited frontmatter block outside spec-status.js (which already reads its own values
// correctly and is a frozen critical-tier API, D4 — left untouched).
//
// specs/20260823/03-silent-drop-hardening.md D4 (2026-08-23, rv_e83659d49386): spec-review-driver.js
// and spec-design-driver.js each carried an IDENTICAL local `fmVal` whose `^key:\s*(.+)$` regex
// captured everything after `key:` to end of line, inline `#` comment included. For `tier:` this
// only polluted a value compared solely against the literal `critical` — cosmetic until it wasn't:
// seven live review ledger rows now carry a whole sentence inside `tier`. For `build_base:` the
// SAME mechanism made an entire comment part of a git ref and broke /spec:review's driver outright
// (`fatal: invalid object name`, rv_e83659d49386, specs/20260822/02-init-generation-script.md
// build-close correction). Two identical buggy copies is how one regex reached both drivers; this
// module is the extraction so a third copy is never the next incident.
//
// `fmVal(fmRaw, key)` semantics: quoted value (`"..."` or `'...'`) returns the content up to the
// MATCHING closing quote, with anything after — including a comment — discarded entirely; unquoted
// value strips a whitespace-preceded `#` to end of line (YAML-correct: a comment requires
// PRECEDING whitespace, so an unspaced `#` inside a value, e.g. a URL fragment, survives intact).
// A key absent from `fmRaw` returns `''`, the documented default every caller falls back from.
//
// What this deliberately does NOT do: parse the frontmatter block itself (callers extract the
// `---\n...\n---` region and pass its raw interior as `fmRaw` — this function is a single-key
// value reader, not a YAML parser), validate a key's value against any expected shape, or read a
// file (pure, no I/O).
//
// Exit codes: n/a (library, not an entrypoint).

function fmVal(fmRaw, key) {
  const m = new RegExp('^' + key + ':\\s*(.+)$', 'm').exec(fmRaw)
  if (!m) return ''
  const raw = m[1].trim()
  const q = /^(["'])/.exec(raw)
  if (q) {
    const quote = q[1]
    const closeIdx = raw.indexOf(quote, 1)
    if (closeIdx !== -1) return raw.slice(1, closeIdx)
    // Unterminated quote — no matching close to bound the value against; fall through to the
    // unquoted path rather than return the raw text (including the stray quote) unstripped.
  }
  return raw.replace(/\s+#.*$/, '')
}

module.exports = { fmVal }
