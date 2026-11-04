// Base-candidate order — the one authority for "which frontmatter field names this spec's
// pre-image".
//
// WHY THIS EXISTS: A PIN ALWAYS BEATS A REF. `diff_base` is a 40-hex sha; `build_base` is conventionally
// the moving ref `main`, which /git:enter-worktree can stamp after a build pinned the true pre-image —
// preferring the ref would hand every diff-scoped leg an empty range.
//
// Owner: specs/20260901/01-build-driver.md.
//
// The single authority for the order; tests/consistency/base-derivation.test.js keeps any other
// frontmatter read of `build_base` out of spec/scripts/.
//
// WHAT THIS DELIBERATELY DOES NOT DO: validate a candidate, touch git, or pick — validity is per-consumer
// (the build driver needs an ancestor of HEAD; the review driver needs a non-degenerate range). Only the
// ORDER is shared.

'use strict'

// Pin first, ref second. The order is the contract.
const BASE_KEYS = ['diff_base', 'build_base']

// pinnedBaseCandidates(fm) -> [{ key, value }, ...]
// `fm` is a frontmatter map (fmMap) or a lookup function (`fmVal`). Absent, non-string and whitespace-only
// values are dropped; `key` rides along so a consumer can name the field it skipped.
function pinnedBaseCandidates(fm) {
  const get = typeof fm === 'function' ? fm : (k) => (fm ? fm[k] : undefined)
  const out = []
  for (const key of BASE_KEYS) {
    const raw = get(key)
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (value) out.push({ key, value })
  }
  return out
}

module.exports = { BASE_KEYS, pinnedBaseCandidates }
