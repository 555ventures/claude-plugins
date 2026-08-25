'use strict'
// lib/glob-match.js — two related but distinct exports over one glob syntax.
//
// `globMatch(glob, filePath)` is the general-purpose matcher (D17, specs/20260812/02-hotspot-
// audit.md) — extracted verbatim from scope-reconcile.js's private globMatch so it and a second
// former caller shared one derivation instead of drifting into two private matchers (both
// adversarial-check refuters on that spec flagged the second private matcher independently). It
// has FIVE consumers today: ac-matrix.js, collision-closure.js, init-gen.js, red-check.js,
// scope-reconcile.js. (hotspot.js, the module's original second caller, no longer exists in this
// repo — the header naming it as a consumer was stale; corrected 2026-08-23,
// specs/20260823/04-review-close-hardening.md D6.)
//
// `pipelineOwnedGlobs(root)` / `BASELINE_GLOBS` are narrower: the sole resolver of the PIPELINE-
// OWNED EXCLUSION SET, i.e. which changed paths are pipeline noise rather than reviewable File
// Plan surface — extracted 2026-08-12 (review advisory on that spec's own diff: both consumers had
// grown byte-identical private loadConfig blocks). This set has exactly TWO consumers:
// scope-reconcile.js and collision-closure.js. `pipelineOwnedGlobs` returns BASELINE_GLOBS plus any
// additive `pipelineOwnedPaths` from the host config; the config read itself moved out to
// lib/host-config.js on 2026-08-14, when two CI scripts needed the same file for
// `capabilities.forge` — this module keeps owning the exclusion set, host-config.js owns the file
// (absent/unparseable → {}, unchanged contract).
//
// `.claude/agent-memory/**` joined BASELINE_GLOBS 2026-08-23 (D6, specs/20260823/04-review-close-
// hardening.md): no File Plan can enumerate the memories a worker will write mid-build, so a
// changed agent-memory file was structurally out-of-plan on every worker-dispatching build. Review
// CLOSE already disposes every touched memory per-file on content, which is strictly stronger than
// a path-based scope check — this is the fix, not a new host-config flag (the class is universal
// to every host that dispatches workers, not host-specific). Known consequence: collision-closure's
// repo walk now also PRUNES memory files from its sweep, so a stale literal inside a worker memory
// is no longer caught there — acceptable because CLOSE's per-file content disposal already covers
// it.
//
// What this module deliberately does NOT do: validate glob syntax, or surface config read errors
// (a broken config skips the additive exclusions, matching AC-20260812-02-3's absent-config
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

// The additive pipeline-noise baseline — always excluded regardless of host config.
// `.claude/agent-memory/**` (D6, specs/20260823/04-review-close-hardening.md): worker memory
// writes are structurally out-of-plan on every dispatching build; see the header above.
// `.claude/spec-runs/**` (2026-08-24): the retained-evidence directory the review driver itself
// writes via its mandatory `--retain` on every hard-stop/escalation/close (and render-gate.js's
// default `--out` fallback) — core.md § Feedback Loop names it a pipeline carrier. Same class as
// the agent-memory omission, one directory over; observed as four spurious out-of-plan waives
// closing UpWell spec 20260823/04.
const BASELINE_GLOBS = ['specs/**', '.claude/spec-runs.jsonl', '.claude/spec-runs/**', '.claude/agent-memory/**']

// Baseline + the host config's additive `pipelineOwnedPaths` (absent/unparseable config → baseline
// only). The config read itself moved to lib/host-config.js on 2026-08-14, once two more scripts
// needed the same file for a different key — this function keeps owning the exclusion set, never
// the file access.
function pipelineOwnedGlobs(root) {
  const config = readConfig(root)
  return BASELINE_GLOBS.concat(Array.isArray(config.pipelineOwnedPaths) ? config.pipelineOwnedPaths : [])
}

module.exports = { globMatch, BASELINE_GLOBS, pipelineOwnedGlobs }
