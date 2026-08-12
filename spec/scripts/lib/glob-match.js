'use strict'
// lib/glob-match.js — the sole glob matcher for `pipelineOwnedPaths` semantics (D17,
// specs/20260812/02-hotspot-audit.md). Extracted verbatim from scope-reconcile.js's private
// globMatch plus the additive pipeline-noise baseline globs (`specs/**`,
// `.claude/spec-runs.jsonl`) so scope-reconcile.js and hotspot.js share one derivation instead
// of drifting into two private matchers — exactly the sole-derivation discipline this repo's
// T3 list exists to enforce (both adversarial-check refuters on this spec flagged the second
// private matcher independently).
//
// Also the sole resolver of the pipeline-owned exclusion set: pipelineOwnedGlobs(root) reads
// the host's `.claude/spec.config.json` (absent/unparseable → {}) and returns BASELINE_GLOBS
// plus any `pipelineOwnedPaths` — extracted 2026-08-12 (review advisory on this spec's own
// diff: both consumers had grown byte-identical private loadConfig blocks).
//
// What it deliberately does NOT do: validate glob syntax, or surface config read errors
// (a broken config skips the additive exclusions, matching AC-20260812-02-3's absent-config
// contract).
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

// Baseline + the host config's additive `pipelineOwnedPaths` (absent/unparseable config → baseline only).
function pipelineOwnedGlobs(root) {
  const fs = require('fs')
  const path = require('path')
  const p = path.join(root, '.claude/spec.config.json')
  let config = {}
  if (fs.existsSync(p)) {
    try { config = JSON.parse(fs.readFileSync(p, 'utf8')) } catch { config = {} }
  }
  return BASELINE_GLOBS.concat(Array.isArray(config.pipelineOwnedPaths) ? config.pipelineOwnedPaths : [])
}

module.exports = { globMatch, BASELINE_GLOBS, pipelineOwnedGlobs }
