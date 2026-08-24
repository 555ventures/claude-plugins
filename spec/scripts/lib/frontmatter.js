'use strict'
// lib/frontmatter.js — the sole frontmatter derivation for scripts that read a spec's
// `---`-delimited frontmatter block: fmBlock (raw block), fmValue (single scalar), fmMap (every
// top-level key).
//
// specs/20260823/03-silent-drop-hardening.md D4 (2026-08-23, rv_e83659d49386): spec-review-driver.js
// and spec-design-driver.js (retired 2026-08-24, specs/20260824/02) each carried an IDENTICAL local `fmVal` whose `^key:\s*(.+)$` regex
// captured everything after `key:` to end of line, inline `#` comment included. For `tier:` this
// only polluted a value compared solely against the literal `critical` — cosmetic until it wasn't:
// seven live review ledger rows now carry a whole sentence inside `tier`. For `build_base:` the
// SAME mechanism made an entire comment part of a git ref and broke /spec:review's driver outright
// (`fatal: invalid object name`, rv_e83659d49386, specs/20260822/02-init-generation-script.md
// build-close correction). Two identical buggy copies is how one regex reached both drivers; this
// module was the extraction so a third copy was never the next incident — it landed exporting only
// `fmVal(fmRaw, key)`.
//
// specs/20260823/04-review-close-hardening.md D1/D8/D9 (2026-08-23, rv_6825fa48c98d — the SAME
// close's tier field corrupted across seven ledger rows): this build widens the module to close the
// remaining two copies (spec-status.js and replay.js each carried a byte-identical private
// `frontmatter()` kv loop whose `.replace(/\s*#.*$/, '')` stripped at ANY `#`, not just a
// whitespace-preceded one — corrupting an unspaced value like `design_source:
// https://x/p#frag`). Per D8's orchestrator reconciliation ruling, `fmVal` is renamed to `fmValue`
// — no alias survives, because a second name for one derivation is the exact drift this module
// exists to end (D9 updates tests/frontmatter.test.js's pin to the new name in place, never
// weakened). Two functions are new: `fmBlock(text)` extracts the raw frontmatter interior (what
// every caller used to hand-derive with its own `/^---\n([\s\S]*?)\n---/` regex before calling
// fmVal), and `fmMap(text)` derives every top-level key at once (what spec-status.js/replay.js's
// private kv loops were re-implementing). `fmValue` is additionally widened to accept EITHER full
// document text (fences, body, and all) or a pre-extracted raw block — every caller can now pass
// the spec text straight through without deriving the block itself first.
//
// Stripping semantics (all three functions, identical): a value quoted with a matching `'` or `"`
// unwraps verbatim up to the matching closing quote — anything after, including a `#`, is
// discarded entirely and NEVER treated as a comment. An unquoted value is cut at the FIRST `#`
// PRECEDED BY WHITESPACE, then trimmed — YAML-correct, since a comment requires preceding
// whitespace, so an unspaced `#` inside a value (a URL fragment, for instance) is content, not a
// comment, and survives intact. A key absent from the frontmatter returns `''` (fmValue) or is
// simply absent from the map (fmMap) — never `null`, never throws; every caller falls back from
// that default rather than crashing on undefined.
//
// What this deliberately does NOT do: parse YAML in general (no nesting, no lists, no type
// coercion — a caller wanting `depends_on: [a, b]` as an array still splits it itself, as
// spec-status.js already does), validate a key's value against any expected shape, or read a file
// (pure, no I/O — callers pass text they already read).
//
// Exit codes: n/a (library, not an entrypoint).

// The raw frontmatter interior between the leading `---` fences, or '' when absent. Shared by
// fmValue/fmMap below so a caller passing full document text and a caller passing a pre-extracted
// block hit the exact same derivation.
function fmBlock(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  return m ? m[1] : ''
}

// Normalizes `text` to a raw frontmatter block regardless of which shape the caller handed in: if
// `text` itself opens with the `---` fence, extract the interior (fmBlock's own derivation); the
// interior of an already-fenced document never itself opens with `---\n` (its lines are
// `key: value` pairs), so a caller that already extracted the block — every driver, historically —
// gets that same text back unchanged.
function rawBlockOf(text) {
  if (/^---\n/.test(text)) return fmBlock(text)
  return text
}

// The one stripping rule, applied identically by fmValue and fmMap so the two can never diverge:
// a quoted value unwraps verbatim (trailer discarded whole); an unquoted value is cut at the first
// whitespace-preceded `#`.
function stripFrontmatterValue(raw) {
  const trimmed = raw.trim()
  const q = /^(["'])/.exec(trimmed)
  if (q) {
    const quote = q[1]
    const closeIdx = trimmed.indexOf(quote, 1)
    if (closeIdx !== -1) return trimmed.slice(1, closeIdx)
    // Unterminated quote — no matching close to bound the value against; fall through to the
    // unquoted path rather than return the raw text (including the stray quote) unstripped.
  }
  return trimmed.replace(/\s+#.*$/, '')
}

// The scalar for `key`, '' when absent. Accepts either full document text (with `---` fences) or
// a bare raw block (fmBlock's own output) — see rawBlockOf above.
function fmValue(text, key) {
  const block = rawBlockOf(text)
  const m = new RegExp('^' + key + ':\\s*(.+)$', 'm').exec(block)
  if (!m) return ''
  return stripFrontmatterValue(m[1])
}

// { key: value } for every top-level `^[A-Za-z_]+:` line, same stripping and same full-text-or-
// raw-block acceptance as fmValue. Returns {} (never null) when there is no frontmatter — callers
// (spec-status.js guards on `!fm.status`, replay.js did `frontmatter(x) || {}`) already tolerate
// this default.
function fmMap(text) {
  const block = rawBlockOf(text)
  const map = {}
  for (const line of block.split('\n')) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    map[kv[1]] = stripFrontmatterValue(kv[2])
  }
  return map
}

module.exports = { fmBlock, fmValue, fmMap }
