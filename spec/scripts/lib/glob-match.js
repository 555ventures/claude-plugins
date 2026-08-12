'use strict'
// lib/glob-match.js — the sole glob matcher for `pipelineOwnedPaths` semantics (D17,
// specs/20260812/02-hotspot-audit.md). Extracted verbatim from scope-reconcile.js's private
// globMatch plus the additive pipeline-noise baseline globs (`specs/**`,
// `.claude/spec-runs.jsonl`) so scope-reconcile.js and hotspot.js share one derivation instead
// of drifting into two private matchers — exactly the sole-derivation discipline this repo's
// T3 list exists to enforce (both adversarial-check refuters on this spec flagged the second
// private matcher independently).
//
// What it deliberately does NOT do: read `.claude/spec.config.json` or resolve
// `pipelineOwnedPaths` from it (callers own reading config and concatenating BASELINE_GLOBS),
// or validate glob syntax.
//
// Exit codes: n/a (library, not an entrypoint).

// Kept deliberately dumb: `**` matches any run of path segments (including zero), `*` matches
// within one segment, everything else is literal.
function globMatch(glob, filePath) {
  let re = '^'
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      i++
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?' } else re += '.*'
    } else if (c === '*') {
      re += '[^/]*'
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp(re + '$').test(filePath)
}

// The additive pipeline-noise baseline — always excluded regardless of host config.
const BASELINE_GLOBS = ['specs/**', '.claude/spec-runs.jsonl']

module.exports = { globMatch, BASELINE_GLOBS }
