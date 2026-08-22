---
name: spec-sections-tag-anchoring
description: parseAcBullets' oracle/env/pre-green tags are position-anchored (declaration slot or trailing only) AND multi-tag-aware within each position; real specs/ corpus only ever uses one tag per bullet, declaration slot
metadata:
  type: project
---

`spec/scripts/lib/spec-sections.js`'s `parseAcBullets` (`extractTag` helper, built on `slotRun`/
`trailingRun`) recognises `[oracle:]`/`[env:]`/`[pre-green:]` tags in exactly two positions as of
2026-08-22:
1. Declaration slot — immediately between the bold AC token's closing `**` and the `:` that
   opens the requirement text, first line only, optionally backticked.
2. Trailing — the tag is the last non-whitespace content of the bullet's full raw text,
   optionally backticked.

Anywhere else (mid-prose, before a `→ test file` arrow, inside a parenthetical/code-span
example) parses `null`. This replaced an unanchored substring `.match()` that self-tagged any
AC bullet illustrating the tag syntax by example (specs/20260821/01-red-check.md's own AC-1/AC-2
tripped a fabricated `invalid-pre-green` finding on itself).

**Same-day regression, also fixed 2026-08-22:** the first anchoring pass matched at most ONE tag
per position, so two SIBLING tags sharing a slot (`` `[env: FOO]` `[oracle: gate]`: ``) both
parsed `null` — `spec/templates/spec.md` 90-103 sanctions `[env:]` + `[pre-green:]` together
(only `[oracle:]` alongside a test mapping is forbidden), so this silently converted a
legitimately-declared env-gated skip into a fabricated hard finding. Fixed by having each
position match a RUN of one-or-more tag items (`slotRun`/`trailingRun`) before `extractTag`
searches within that run for the specific tag name — so N sibling tags in one position, or split
across both positions (e.g. `[env:]` in slot + `[pre-green:]` trailing), all parse correctly.

**Why:** reviewer-1.json on specs/20260821/01-red-check.md — documentation-by-example (which
spec.md/plan.md's own authoring guidance encourages) must not be readable as a real declaration.
The multi-tag fix: template-sanctioned sibling tags must not be a coverage-dropping trap.

**How to apply:** Every real tag currently in `specs/` (8 of them as of 2026-08-22, grep
`^- \*\*AC-.*\[\(oracle\|env\|pre-green\):` across `specs/*/*.md`) sits alone in the declaration
slot — `- **AC-ID** \`[tag: val]\`: ...`. No real corpus bullet yet carries two sibling tags or
uses the trailing position for a real (non-illustrative) tag. If you add a real multi-tag or
trailing-position bullet, or a script that authors tags, verify against `slotRun`/`trailingRun`
directly — don't assume a single-tag regex is enough.

Six `tests/ac-matrix/ac-matrix.test.js` fixtures (AC-20260814-01-3a/3b/4a/6, AC-20260821-01-2/-10)
encoded a THIRD position that was never real-corpus-observed and is no longer sanctioned:
`[tag: value] → tests/file.test.js` (tag mid-sentence, immediately before the trailing arrow,
not adjacent to either the declaration colon or the true end of the bullet). They were retagged
into the declaration slot on 2026-08-22 at this spec's review close, assertions byte-identical,
and five new pins now cover both anchoring and multi-tag runs — nothing is left outstanding here.
