---
name: locked-comment-substitution-can-trip-ratchet
description: A Decision-mandated verbatim comment substitution (no code change) can still push a file's byte count over scripts/size-ratchet.js's baseline — report it, don't reword or raise
metadata:
  type: feedback
  reviewed: 2026-09-10
---

specs/20260907/07-mocks-retires-theme.md D10 mandated an exact verbatim replacement string for
one comment in `spec/scripts/render-gate.js` (old THEME-stage wording → new, longer "theme picked
on /spec:sketch" wording), marked `[no-ac: comment-only edit ... the file's existing tests are the
regression oracle]`. The new text is longer than the old, so `node scripts/size-ratchet.js --root .`
reports `over spec/scripts/render-gate.js 30243 > 30205` even though zero code changed.

**Why:** the Decision fixes the replacement text verbatim (locked, never override), so trimming it
to fit under the ratchet is not an option, and raising the baseline is explicitly against the
worker contract's "if the ratchet complains, report it rather than raising a baseline yourself."

**How to apply:** when a D-numbered comment-only substitution grows a file past its size-ratchet
baseline, verify the substitution matches the Decision's literal text exactly, then report the
`over` line to the orchestrator/review as an expected, spec-sanctioned byte increase — never reword
the mandated text to shrink it, and never run `--raise`/`--update` yourself for a scripts-layer file
outside an explicit Decision authorizing it. See also companion decisions that shrink a file (a pure
deletion spec) landing as `stale` in the same ratchet run — that direction needs no action either.
