---
name: ac1-ac2-banned-literal-collides-with-sibling-sweep
description: Adding a design.md AC-1-style banned-literal test can trip an unrelated sibling spec's retired-literal repo sweep over the SAME literal — extend that sweep's existing per-literal waivedPaths block, don't invent a new one.
metadata:
  type: feedback
---

Writing a banned-literal test (`assert.ok(!src.includes(literal), ...)`) for one spec's design.md
edit can spell a retired-filename literal (one of AC-20260902-08-12's `RETIRED_LITERALS` — e.g. a
template name of the shape `<word>-pick` + `.json`, or `positions` + `.md`) that a DIFFERENT,
already-landed spec's repo-wide `sweepRetiredLiteral` regression (in
`tests/consistency/genesis-doctrine.test.js`) also tracks. `npm test` then reddens that unrelated
pre-existing test — your new test file is now an "offender" the sweep's walk finds. (This note
itself must never spell either literal as one contiguous string, for the same reason — write it
broken up, as above, or the note becomes its own offender.)

**Why:** `sweepRetiredLiteral` walks the whole repo and fails on ANY tracked file containing the
retired string outside its `waivedPaths`/`waivedPrefixes`. A brand-new test file that must literally
spell the banned string (to assert it's absent from doctrine) is exactly this trap — see
[[self-matching-literal-pin-fragment-idiom]] and [[sweepretiredliteral-new-sweep-must-waive-own-siblings]]
for the general shape.

**How to apply:** when `npm test` (not just your scoped files) reveals a sibling sweep test failing
because of a literal your new test introduced, look for that sweep's existing per-literal
`waivedPaths.push(...)` conditional (it likely already waives a sibling doctrine file for the same
literal, with a "collision closure" comment) and add your new test file to that SAME conditional
block, with a comment explaining your test spells the literal as the string under test. Don't touch
the sweep's assertion or its literal list — only extend the waive list. Always re-run the FULL
`npm test`, not just your assigned files, before declaring done — a scoped run alone would have
missed this (specs/20260902/09-one-hand-wireframes-one-token-set.md AC-20260902-09-1 vs
specs/20260902/08-genesis-shrink-brief-state.md AC-20260902-08-12).
