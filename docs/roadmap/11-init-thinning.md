# 11 — Init thinning: the bootstrap's deterministic generation becomes a script

Phase: P2
Depends on: none

## Why this brief (stub — expand at plan time)

`init.md` is the largest instruction file left (~600 lines) and the last big English program
standing after v7: most of it is deterministic file generation — config, rules skeleton,
agents, skills, settings allowlist — described as prose for the model to perform, the exact
shape v7 stage 2 converted to scripts everywhere else (`review-legs.js` precedent). The
2026-08-17 research sweep's ablation rule applies: keep only what the model cannot derive or
a script cannot do — here, the repo profiling judgment and the interview.

## Scope sketch

- A generation script owns every deterministic artifact init emits (templates in, files
  out, contract hash stamped); `init.md` shrinks to profiling + interview + one invocation.
- Same evidence bar as v7: the generated tree passes `manifest-check` and `doctor` executed,
  not asserted.
- **`frontend-design` provisioning (ADR-0001)** — bootstrap checks for (or offers to
  install, user scope) Anthropic's `frontend-design` plugin, so host repos don't silently
  author design without the instructional layer the design surfaces now assume.
- **`testCommand` contract, documented and probed (folded 2026-08-20, at-risk escape).** The
  review's at-risk leg appends file paths to `testCommand` — an assumption made load-bearing
  by the 2026-08-20 fix and satisfied silently or violated silently: `cargo test <path>`
  matches nothing and exits 0, the same vacuous-green class as the escape itself. Init must
  state the contract where it captures `testCommand` (accepts appended file paths; a
  no-match must not read as pass) and, where derivable, verify it against the profiled
  runner rather than trusting the interview. Same duty for the at-risk detector's
  applicability: the path-substring heuristic likely yields an empty set on Python/Go
  hosts, and init is where a host learns its at-risk leg is inert rather than clean.

## Out of scope

- Changing what init generates (the grounding-layer surface is stable); this is a
  choreography-to-code move only.

## Grounding

- Amended by ADR-0001 — bootstrap provisions/checks the `frontend-design` plugin (user
  scope) as the design instructional layer.
- Memory `research-20260817-ai-first-best-practice`; `spec/commands/init.md`;
  `spec/scripts/review-legs.js` (the inversion pattern).
- The 2026-08-20 at-risk escape (dead since v7, vacuous green on `[object Object]`):
  `tests/review/review-legs-at-risk-argv.test.js` header carries the full history; the two
  host assumptions above are its documentation remainder.
