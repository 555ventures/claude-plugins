---
name: banned-literal-loop-dedup-and-blind-spot-sweep
description: Pattern for de-duplicating repeated `for (const [re,label] of banned)` assertion loops via a file-local helper, and for adding a pipelineOwnedPaths-blind-spot sweep to an enumerated-file doctrine test.
metadata:
  type: project
  reviewed: 2026-09-01
---

Spec 20260825/01 (genesis panel collapse) review-fix dispatch, tests/consistency/genesis-doctrine.test.js
(2026-08-25): three ACs (AC-2, AC-4, AC-5) each carried an identical
`for (const [re, label] of banned) { assert.ok(!re.test(src), '<msg>') }` loop over a
per-site banned-literal list — a finding under `.claude/rules/spec-pipeline.md § Review Checks`
("three or more near-identical blocks in one diff names the extraction").

Resolution pattern:
- Extract a **file-local** helper `assertNoBannedLiterals(src, banned, msgFor)`, not a
  `tests/helpers.js` export. Justify locality with a grep proving single-consumer
  (`grep -rn 'for (const \[re' tests/`) plus a shape mismatch against the nearest sibling
  (`design-doctrine.test.js` bans plain-string `.includes()`, not regexes) — that's the bar for
  "helper stays local" vs "promote to shared helpers".
- `msgFor(label)` is a closure per call site, so it can still build the exact
  worked-example failure message each AC had before extraction, including branching
  (`label === 'x' ? ... : ...`) when one entry in the same banned list needs a different
  worked example than its siblings (e.g. a newly-added stricter bare-word ban explaining why
  the other patterns in the list missed the case it catches).
- A ban-list can always be *strengthened* in place (new entries) — never weaken existing ones.
  Concrete case here: every existing genesis.md pattern required "panel" adjacent to another
  word; a live doctrine sentence ("...panel scrutiny...") slipped through a full review because
  of exactly that gap. Fix was one bare `[/\bpanel\b/i, 'panel']` entry.

Second pattern from the same dispatch, since CORRECTED (specs/20260825/05, 2026-08-25): at the
time, `.claude/spec.config.json`'s `pipelineOwnedPaths` excluded `spec/workflows/wf-*.js` from
both collision-closure's literals leg and scope-reconcile, so an enumerated-file doctrine test
was the only gate that could see a stale literal inside a workflow script. That exclusion is
retired — workflow scripts are ordinary review surface now. The durable lesson is narrower: an
enumerated-file banned-literal test is a STANDING gate (every `npm test`), while
collision-closure's literals leg runs only at plan lock for planner-named stems — so keep the
enumerated sweep for a file whose stale vocabulary is user-visible, give it a stricter list
than siblings that legitimately keep the new vocabulary, and say so in a comment.

Proof technique for a new banned-literal check: don't just assert it would fail — actually run
it. Copy the real doctrine/source file to a scratchpad path, append/inject the offending literal
into the copy, extract the exact same helper+banned-list code into a throwaway script, and run it
against both the real (must pass) and mutated (must throw) copies. Delete the scratch copies
after. Never edit the tracked file itself to "check" a red case.

See also [[predicate-widening-no-collision-proof]] (same "prove, don't assert" bar for pattern
changes) and [[review-finding-pins-no-ac]] (review-fix dispatches carry no AC-ID, name the test
"review finding" — this one *did* have AC-IDs since it was pipeline-authored against a locked
spec, so test names kept their existing AC-20260825-01-N form).
