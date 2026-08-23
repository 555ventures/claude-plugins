---
name: d11-said-vs-parsed-trailing-tag-widening
description: How the D11 amendment widened trailingRejected/trailingRejectedCause with an arrow-tolerant tag run, and how rejectedTrailingTagDetail forks on cause
metadata:
  type: project
---

specs/20260823/03 D11 (build-time, JJ-approved) replaced D2's narrower null-test refusal formula
in `spec/scripts/lib/spec-sections.js` with a said-vs-parsed comparison, closing a silent drop
where a genuine tag written just before a bullet's final `→ tests/…` reference (neither the
declaration slot nor the true trailing end) parsed as nothing with no refusal signal at all.

**Mechanics**: `wideTrailingRun(raw)` is a new sibling of `tolerantTrailingRun` — same
`TAG_ITEM_SRC`, but the regex adds an optional non-capturing `(?:→[^→]*)?$` after the tag-item
run, tolerating exactly one trailing File-Plan-reference suffix. Its capture group can trap
separator whitespace before the arrow (since `\s*` lives inside the outer capturing group), so
both it and `trailingRun`'s capture get `.replace(/\s+$/, '')` before comparison.
`trailingRejected = (wide !== null && wide !== bareTrimmed) ? wide : null`.
`trailingRejectedCause` is derived from a SECOND comparison: the unwidened `tolerantTrailingRun`
(anchored at true end, no arrow tolerance) vs `wide` — equal means `'backticked-at-end'`
(the refused run really is the bullet's true end); anything else means `'not-at-end'` (the wide
match only succeeded because of the arrow-suffix tolerance, so the tag sits before the reference).

**rejectedTrailingTagDetail** gained `cause` as its THIRD positional arg (between
`trailingRejected` and `underlying` — so both existing 3-arg call sites at every consumer needed
updating, not just adding a new param at the end). The `backticked-at-end` branch is required to
stay byte-identical to the pre-D11 text (existing AC-1/-2/-3 detail assertions pin it); the
`not-at-end` branch must never say "remove the backticks" (false there — a bare tag before the
arrow still would not parse) and instead names the arrow-position problem with only the
move-into-declaration-slot remedy.
