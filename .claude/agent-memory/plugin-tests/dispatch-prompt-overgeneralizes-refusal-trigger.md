---
name: dispatch-prompt-overgeneralizes-refusal-trigger
description: a dispatch prompt's paraphrase of an AC's refusal condition can be broader than the AC/code actually specify — verify the exact trigger empirically before writing "both directions" of a refusal pin
metadata:
  type: feedback
  reviewed: 2026-08-23
---

specs/20260820/07-review-driver.md's AC-20260820-07-15 (R8) refuses a cold invocation on a
`status: done` spec whose sidecar "does not record this run's own close" (`marks.closeRunId`
absent) — but ONLY when the sidecar directory exists. A `done` spec with NO sidecar at all is a
*different*, unaffected code path (`spec-review-driver.js` lines ~156-160: `if
(!sidecarExistsAtStart && status === 'done') printDoneNow('')` — exit 0, prints DONE) — the
legitimate post-merge fast path, since the sidecar is deleted at DONE/cleanup. The dispatch
prompt I was given paraphrased the AC as covering "a done spec with no sidecar (and, separately,
a hand-recreated sidecar with no closeRunId)" as if BOTH refuse — the first clause was simply
wrong, contradicted by both the AC's own literal wording ("does not record... own close", which
presupposes a sidecar to check) and by running the actual script against both fixtures.

**Why:** dispatch prompts are the orchestrator's summary of a spec, not the spec itself, and can
over-generalize a conditional refusal into an unconditional one when writing "pin both
directions." Writing the test as dispatched would have pinned a false expectation (asserting
exit 2 where the shipped, correctly-designed code exits 0) — indistinguishable from a real defect
until run.

**How to apply:** before writing a refusal pin's "non-triggering" companion case, re-read the
AC's literal sentence for the exact precondition (here: sidecar existence was implicit, not
stated as "even with no sidecar") and run the actual current script against the edge case the
dispatch prompt claims should refuse. If it doesn't, don't encode the wrong expectation — write
the correct non-regression assertion instead (the fast path stays exit 0) and note the correction
plainly in the return. Companion to [[spec-ac-example-vs-shipped-refusal]] (an AC's own worked
example contradicting its rule) and [[stale-dispatch-premise-concurrent-session]] (re-deriving
state before trusting a narrative) — this is the same discipline applied to a refusal's *trigger
condition* rather than to a value literal.
