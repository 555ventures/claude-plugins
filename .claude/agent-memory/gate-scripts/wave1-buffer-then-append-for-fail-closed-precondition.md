---
name: wave1-buffer-then-append-for-fail-closed-precondition
description: when a spec wants N legs to run in parallel (Promise.all) but one of them can hard-abort the whole run with zero appended rows, buffer all N results and only write manifest rows after checking the abort condition — writing rows as each promise resolves races the abort
metadata:
  type: feedback
  reviewed: 2026-09-02
---

Built in specs/20260823/01-release-legs.md (D2/D3): `stage`'s wave 1 runs `substrate` + `ci` +
`deploy` "in parallel," and `substrate` has a fail-closed precondition (missing/invalid
`.claude/release-manifest.json`, or an unmatched sentinel) that must abort the ENTIRE stage run
at exit 2 with **zero** manifest rows appended (AC-20260823-01-4) — not just a red substrate row.

The naive port of review-legs.js's `sh().then(r => appendRow(...))` pattern (each leg writes its
own row the instant its own promise settles) is wrong here: if `ci` or `deploy` resolves before
`substrate`'s precondition failure is known, its row is already on disk when the abort fires,
violating the zero-rows contract.

Fix: run the wave as `Promise.all([...])` but have each leg function *return* its row/failure
object instead of writing it. After `Promise.all` resolves, check the abort condition first; only
then loop over the buffered results and call `appendRow` for each. This keeps true parallel
execution (all children genuinely run concurrently — a real `deploy` command executes even if
`substrate` is about to abort the run, which the spec's Rationale explicitly sanctions as safe)
while making the "zero rows on abort" guarantee airtight regardless of which promise settles
first.

Why: race-prone if you copy the "write-as-you-go" leg pattern from a sibling script (review-legs.js)
into a context with a different fail-closed contract — the two scripts look similar but the row-
count invariant differs.

How to apply: whenever one leg in a parallel wave can hard-abort the whole run with a documented
"zero rows appended" guarantee, buffer that wave's results and defer every `appendRow`/file-write
until after the abort check, even though every other row-writing wave in the same script can
safely write-as-it-goes.
