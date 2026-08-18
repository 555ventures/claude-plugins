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

## Out of scope

- Changing what init generates (the grounding-layer surface is stable); this is a
  choreography-to-code move only.

## Grounding

- Memory `research-20260817-ai-first-best-practice`; `spec/commands/init.md`;
  `spec/scripts/review-legs.js` (the inversion pattern).
