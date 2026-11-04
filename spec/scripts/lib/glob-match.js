'use strict'
// lib/glob-match.js — two related but distinct exports over one glob syntax.
// Owner: specs/20260812/02-hotspot-audit.md.
//
// `globMatch(glob, filePath)` is the general-purpose matcher (ac-matrix.js, collision-closure.js,
// init-gen.js, red-check.js, scope-reconcile.js).
//
// `pipelineOwnedGlobs(root)` / `BASELINE_GLOBS` are the sole resolver of the PIPELINE-OWNED EXCLUSION SET
// (scope-reconcile.js, collision-closure.js): BASELINE_GLOBS plus the host config's additive
// `pipelineOwnedPaths` (config read via lib/host-config.js).
//
// `.claude/agent-memory/**` is in BASELINE_GLOBS: no File Plan can enumerate the memories a worker writes
// mid-build; review CLOSE disposes every touched memory per-file instead.
//
// What this module deliberately does NOT do: validate glob syntax, or surface config read errors
// (a broken config skips the additive exclusions, matching the absent-config
// contract).
//
// Exit codes: n/a (library, not an entrypoint).

const { readConfig } = require('./host-config')

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

// The additive pipeline-noise baseline — always excluded regardless of host config:
// `.claude/agent-memory/**` (see the header) and `.claude/spec-runs/**` (the review driver's retained evidence).
const BASELINE_GLOBS = ['specs/**', '.claude/spec-runs.jsonl', '.claude/spec-runs/**', '.claude/agent-memory/**']

// Baseline + the host config's additive `pipelineOwnedPaths` (absent/unparseable config → baseline only).
function pipelineOwnedGlobs(root) {
  const config = readConfig(root)
  return BASELINE_GLOBS.concat(Array.isArray(config.pipelineOwnedPaths) ? config.pipelineOwnedPaths : [])
}

module.exports = { globMatch, BASELINE_GLOBS, pipelineOwnedGlobs }
