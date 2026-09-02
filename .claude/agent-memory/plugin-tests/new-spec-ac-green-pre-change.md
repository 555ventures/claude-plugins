---
name: new-spec-ac-green-pre-change
description: a brand-new spec's AC can be legitimately green pre-implementation when it pins the ABSENCE of a not-yet-built mechanism (an overlay that doesn't exist yet trivially "stays off"/"is suppressed") — tag it as a sanctioned pin exception rather than treating it as a stale-assumption block.
metadata:
  type: feedback
  reviewed: 2026-09-01
---

specs/20260823/08-derived-session-queue.md added a queue overlay to spec-status.js's --next
derivation. Three of its ACs (08-3, 08-14, 08-15) describe the overlay's absence or an inherited-
unchanged behavior: no queue file → unchanged output (08-3, spec literally says "SHALL CONTINUE
TO"); inside a linked worktree the overlay is suppressed (08-14, no "CONTINUE TO" wording but
mechanically identical); a red observation keeps rank supremacy over the queue (08-15, "SHALL
CONTINUE TO", and the spec's own Rationale says "inherited unchanged" from a prior spec's D5).
All three pass on unmodified pre-spec code, because the differentiating mechanism (the overlay)
does not exist yet — "the overlay is off/suppressed" and "there is no overlay at all" are the same
observable output. This is NOT the same failure mode as [[stale-dispatch-premise-concurrent-
session]] (a fix that already landed) — the spec's own new machinery genuinely doesn't exist, the
AC just happens to describe a facet of behavior that survives its arrival unchanged.

**Why:** the worker contract's "every new test must fail on current code, else the spec is wrong"
rule is a default, not universal — this repo has a long-standing, explicitly sanctioned exception
for exactly this shape, tagged `(sanctioned pin exception, green pre-change)` throughout
tests/spec-status.test.js (AC-20260805-01-7, AC-20260805-03-7, AC-20260807-01-7/-10). Forcing such
a test to redden artificially (e.g. by weakening the fixture until some unrelated thing breaks)
would be a fabricated red, not a real one, and blocking on "spec is wrong" here would be a false
positive — the spec is fine, the AC just isn't a distinguishing pin by construction.

**How to apply:** before treating a currently-green new-spec test as a stale-assumption blocker,
check whether the AC's own wording says "SHALL CONTINUE TO" or its Decisions/Rationale states the
behavior is "unchanged"/"inherited" from a prior spec — if so, add the sanctioned-pin-exception
comment and move on. If neither applies AND the test is green, that IS a real stale-assumption
signal and should block per the normal rule. Also reconfirmed [[replay-js-cwd-not-root]]'s pattern
here: spec-queue.js's and session-queue.sh's CLI contracts (specs/20260823/08 Contracts section)
list no --root flag for any subcommand, so tests invoke both via `runNode`/`runBash` with
`{cwd: dir}`, never an explicit --root — second confirmed instance of "no --root in the Contracts
flag list means cwd-based, not a missing spec".
