---
name: spec-sections-tag-anchoring
description: parseAcBullets' oracle/env/pre-green tags are position-anchored (declaration slot backticked-or-bare, trailing BARE-only) and multi-tag-aware; red-check.js's SHALL CONTINUE TO pin check normalizes (strip code spans, collapse whitespace) before matching
metadata:
  type: project
  reviewed: 2026-08-30
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

**Third hardening, same day, escape rv_640c582f4902 (unanchored-marker-match, logged against
this same spec):** the trailing position originally accepted backticked-or-bare like the
declaration slot. Fixed to require the trailing tag be **BARE** (`BARE_TAG_ITEM_SRC`, no
surrounding backticks) — `` … SHALL y `[oracle: gate]` `` is a worked example (self-tagging,
laundered coverage/skip) and now parses `null` there, while the declaration slot is untouched
(still backticked-or-bare — all 8 real corpus tags sit there) and `spec.md`'s own bare trailing
example (AC-20260821-99-1) keeps parsing. Verified against the full `specs/` corpus: zero
membership changes to any real `oracle`/`env`/`preGreen` field (the 8 genuine tags are unaffected
since none were trailing+backticked).

**Sibling defect, same escape, in `spec/scripts/red-check.js` not this file:** `isSanctioned`'s
`SHALL CONTINUE TO` pin check was an unanchored literal match over the bullet's whole `raw` text —
the exact same disease this file was hardened against twice already, just for the pin marker
instead of `[oracle:]`/`[env:]`/`[pre-green:]`. Fails open both directions: a bullet that only
*quotes* the phrase in backticks self-sanctions with no real pin (specs/20260821/01-red-check.md
AC-20260821-01-4), and a genuine pin hard-wrapped across a continuation line
(`…AND SHALL\n  CONTINUE TO require…`, specs/20260810/02-terminal-observable-acs.md
AC-20260810-02-4) misses the literal match — the pipeline rules' recorded hard-wrap-blindness
hazard, recurring on a different marker. Fixed with `normalizeForPinCheck(raw)`: strip inline
code spans (`` `[^`]*` `` → space) BEFORE collapsing all whitespace runs (including newlines) to
one space, then test `/SHALL CONTINUE TO/` on that. A full corpus walk confirmed 22 previously
hard-wrap-hidden genuine pins across `specs/` now correctly sanction (all manually spot-checked as
real `SHALL\n  CONTINUE TO` pins, none spurious from backtick-stripping), and only
AC-20260821-01-4 flips the other way (quote → correctly unsanctioned). If you touch
`isSanctioned` again, keep the strip-then-collapse order — collapsing whitespace first would
leave a backticked quote's contiguous phrase intact and still match.
