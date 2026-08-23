---
name: trailing-tag-anchor-vs-arrow-suffix
description: lib/spec-sections.js's trailing-tag anchor ($ of trimmed raw) never matches when a "→ {test reference} in {test file}" suffix (spec.md line 128 grammar) follows the tag — a locked-Contract-vs-test-fixture mismatch hit on specs/20260823/03
metadata:
  type: feedback
---

`trailingRun`/`tolerantTrailingRun` in `spec/scripts/lib/spec-sections.js` anchor at the literal
end (`$`) of the bullet's whitespace-trimmed `raw` text. `spec/templates/spec.md` line 128's own
AC-bullet grammar appends `→ { test reference } in { test file }` after the requirement text —
when a bullet places a trailing tag AND uses this arrow-reference suffix, the tag is no longer
the string's last content, so it is NEVER recognized as trailing (neither the bare nor the
tolerant run matches) — confirmed by direct `parseAcBullets` execution, both backticked and bare.
This is pre-existing behavior, not something specs/20260823/03's D2 introduced.

**Why:** hit during specs/20260823/03-silent-drop-hardening.md build — `tests/red-check/
red-check.test.js`'s `AC-20260823-03-3` fixture ends `` `[pre-green: absence-invariant]` → tests/
x3.test.js `` and expected D2's `trailingRejected`/D1's `rejected-trailing-tag` to fire, but per
D2's own locked Contract (`tolerantTrailingRun(raw)` matches `((?:TAG_ITEM_SRC\s*)+)$` on trimmed
`raw`, no arrow-suffix exception) it cannot — `trailingRejected` is `null` for that exact fixture.
Every sibling fixture in the same spec's batch that DOES exercise trailing-tag refusal
(`tests/ac-matrix/rejected-trailing-tag.test.js`) omits the arrow suffix. I did not edit the test
(tests/ layer) or loosen the anchor (not a sanctioned Decision) — flagged as a deviation instead
(specs/20260823/03-silent-drop-hardening.deviations.md).

**How to apply:** before implementing or reviewing any trailing-tag-position logic in
lib/spec-sections.js, check whether the target/fixture bullet also carries a `→ {file}` reference
suffix — if so, the tag is NOT at the anchor position regardless of backticks, and any Decision
relying on "ends in a tag" needs either the suffix stripped from the fixture or an explicit,
locked Contract change to the anchor itself (never an inline consumer workaround — [[replay-js-mode-flag-dispatch]]-style single-authority discipline applies here too, per D2's own "consumers never re-derive" clause).
