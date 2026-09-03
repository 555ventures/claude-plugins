---
name: tag-anchoring-retag-and-prose-regression
description: When an AC-grammar tag parser ([oracle:]/[env:]/[pre-green:]) moves from whole-bullet scan to two fixed positions, retag fixtures into the declaration slot and pin the regression against the real spec's own wording, not a generic mid-sentence string.
metadata:
  type: feedback
  reviewed: 2026-09-03
---

2026-08-22 (spec/scripts/lib/spec-sections.js `extractTag` fix, dispatched to
tests/ac-matrix/ac-matrix.test.js): a bracket-tag parser that used to scan a whole AC bullet was
narrowed to two positions only — the declaration slot (first line, right after the bold AC
token's closing `**`, before the requirement-opening `:`, e.g. `- **AC-X** \`[oracle: gate]\`:
...`) and true trailing content (last non-whitespace of the bullet). Any fixture that put the
tag mid-sentence (a third position, e.g. right before a `→ tests/x.test.js` mapping) now parses
`null` and must be retagged into the declaration slot — move ONLY the tag's position; AC-ID,
requirement text, tag value, test mapping, and every assertion stay byte-identical.

**Why:** the old unanchored match let a spec's own prose *example* of a tag self-tag — e.g.
specs/20260821/01-red-check.md's own AC-20260821-01-2 requirement text quotes
`` `[pre-green: because-i-said-so]` `` mid-sentence to describe the invalid-tag case, and the old
parser fired a fabricated `invalid-pre-green` finding against a spec that declares no such tag.
The two-position anchor is a deliberate under-match to close that class.

**How to apply:** two things, not one, when authoring a test for this kind of anchoring fix:
1. Retag every existing fixture whose tag sat in the now-dead third position — grep the target
   file for the old shape (e.g. `SHALL Y \[`) before and after editing to confirm only the
   intended fixtures moved and nothing else still matches the retired grammar.
2. Add ONE new regression fixture whose bullet mimics the *actual* wording of a real spec doc
   that triggered the incident (quote it, don't paraphrase) — a generic "tag somewhere in the
   middle" fixture doesn't prove the fix closes the real self-tagging case, only that mid-sentence
   parses null in the abstract. Assert exit 0 / no finding / the typed count field back to 0,
   the same idiom the sibling positive-case test already uses.

Related: [[self-matching-literal-pin-fragment-idiom]] (same disease — a doctrine string matching
its own carrier — different mechanism: position-anchoring vs string-fragmenting).
