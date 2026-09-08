// Base-candidate order — the one authority for "which frontmatter field names this spec's
// pre-image".
//
// WHY THIS EXISTS: A PIN ALWAYS BEATS A REF. `diff_base` is a 40-hex sha; `build_base` is
// conventionally the moving ref `main`. Two different commands write these fields with no
// ordering guard between them — /git:enter-worktree stamps `build_base: main` whenever it runs,
// including AFTER a build has already pinned the true pre-image. Preferring the ref over the pin
// therefore lets a stage judge a range that does not describe the build: with `main` carrying the
// build's own commits, `main...HEAD` is empty, every diff-scoped leg reports zero and green
// (at-risk files 0, reconcile listing every planned file "unrealized"), and the reviewer is handed
// nothing. Owner: specs/20260901/01-build-driver.md.
//
// THE REASON THIS IS A MODULE AND NOT A PER-CONSUMER CONSTANT: three consumers derive a base, and
// three independent spellings of one ordering rule is the shape that lets a correction reach one
// of them and miss the others. The module is the single authority so a FOURTH consumer cannot
// spell it a fourth way, and tests/consistency/base-derivation.test.js is the deterministic
// enforcement that keeps it that way (no frontmatter read of `build_base` anywhere under
// spec/scripts/ except here).
//
// WHAT THIS DELIBERATELY DOES NOT DO: it never validates a candidate, never touches git, and
// never picks. Validity is per-consumer and the predicates genuinely differ —
//   spec-build-driver.js: the base must be an ancestor of HEAD (base === HEAD is CORRECT at build
//     start, nothing is built yet, so an empty-range refusal would refuse every fresh build);
//   spec-review-driver.js: the base must resolve AND the range must be non-degenerate (an empty
//     range at review time is the false-CLEAN failure itself);
//   replay.js: the candidate must resolve, differ from the close commit's parent, and be an
//     ancestor of it.
// Collapsing those into one shared predicate would break at least one caller. Only the ORDER is
// shared, because only the order was ever spelled three times.

'use strict'

// Pin first, ref second. The order is the contract.
const BASE_KEYS = ['diff_base', 'build_base']

// pinnedBaseCandidates(fm) -> [{ key, value }, ...]
//
// `fm` is either a frontmatter map (`{ diff_base: '<sha>' }`, as lib/frontmatter.js's fmMap
// returns) or a lookup function (`fmVal`, as both drivers already hold). Absent, non-string, and
// whitespace-only values are dropped; every returned value is trimmed and non-empty. The `key` is
// carried alongside the value because a consumer that skips a candidate has to be able to say
// WHICH field it skipped (replay.js's `tried:` list is the live case).
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
