---
name: spec-20260824-04-render-rules-ellipsis-flags
description: Contract prose using "<x>…" after a flag (render-rules.js --inventory <json>…, render-gate.js --mocks <mock>…) means repeated --flag value pairs, not one flag with N trailing tokens — and how to build a genuinely discriminating var()-resolution fixture.
metadata:
  type: feedback
  reviewed: 2026-08-24
---

specs/20260824/04-render-rules.md's Contracts gave `--inventory <json>…` and `--mocks <mock>…`
with no established multi-value-flag precedent anywhere in spec/scripts/*.js (checked: no script
in this repo collects N trailing values after one flag occurrence). Resolved it as repeated
`--flag value` pairs (`--inventory a.json --inventory b.json`), not `--flag a.json b.json` —
grounded directly in Worker Rules' own line: "Hand-rolled `--flag value` arg parsing only" (each
flag occurrence is exactly one pair; variable arity would break that shape). Pinned this reading
into `tests/render/render-rules.test.js`'s `runRules()` helper and
`tests/render/render-gate.test.js`'s new `gateMocks()` helper, with a comment citing the doctrine
line as the reason — not treated as an unlocked fork worth blocking on, since it's a mechanical
CLI-shape choice within the Decision's bounds, not a contradiction of it.

**Why:** an ellipsis after a bare flag in this repo's Contracts prose is genuinely ambiguous
without doctrine cross-reference; grepping `spec/scripts/*.js` for an existing repeated-flag
pattern (found none) plus re-reading Worker Rules settled it, rather than guessing or blocking.

**How to apply:** the next time a spec Contracts line writes `--flag <x>…`, check Worker Rules'
"hand-rolled --flag value" line first — it resolves the ambiguity toward repeated single-pair
flags, not multi-token trailing lists — before treating the notation as an unlocked fork.

Second, separate technique worth reusing: AC-20260824-04-7 ("tokens declare `--ink: #111` and
`--text: var(--ink)`... resolve `--text` to rgb(17, 17, 17)") is NON-discriminating through a
palette pass/fail check alone — `--ink` is itself a valid hex token resolving to the same rgb, so
a palette-check pass proves nothing about whether `var()` resolution actually ran. The fix:
assert on the ABSENCE of an "unresolvable --text" advisory line (D3: an unresolved token gets
reported that way) rather than on downstream pass/fail — a broken var() resolver would emit that
line, a working one wouldn't. See `[[ac-example-unreachable-branch]]` for the sibling pattern
(AC example points at a branch the real code can't reach); this one differs — the branch IS
reachable, but the example's own construction (two tokens that resolve to the same value) makes
the obvious assertion vacuous. Reframe to the mechanism's own side-effect (the advisory line)
before falling back to "keep the vacuous pin and log it."
