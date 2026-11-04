'use strict'
// lib/frontmatter.js — the sole frontmatter derivation for scripts that read a spec's
// `---`-delimited frontmatter block: fmBlock (raw block), fmValue (single scalar), fmMap (every
// top-level key).
//
// Owner: specs/20260823/03-silent-drop-hardening.md.
//
// fmValue accepts EITHER full document text or a pre-extracted raw block; fmBlock extracts the raw
// interior; fmMap derives every top-level key at once.
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

// The raw frontmatter interior between the leading `---` fences, or '' when absent.
function fmBlock(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  return m ? m[1] : ''
}

// Normalizes `text` to a raw block: a fenced document yields its interior; an already-extracted block
// comes back unchanged.
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

// { key: value } for every top-level `^[A-Za-z_]+:` line; {} (never null) with no frontmatter.
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
