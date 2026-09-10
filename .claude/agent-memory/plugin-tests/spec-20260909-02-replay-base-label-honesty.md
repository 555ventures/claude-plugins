---
name: spec-20260909-02-replay-base-label-honesty
description: File Plan citations for review-legs/plugin-bump/replay tests can overstate what's on disk — verify with grep before retagging or vacuously matching.
metadata:
  type: feedback
---

Two File Plan citations in specs/20260909/02-replay-base-and-label-honesty.md did not match the
tree: (1) AC-2 named "the existing nested-runner test" for NODE_TEST_CONTEXT scrub in
tests/review/review-legs.test.js — no such test existed (grepped whole repo for
NODE_TEST_CONTEXT/`ctx=[`). Authored the AC's own worked example fresh as a sanctioned
green-pre-change pin instead of blocking. (2) The fixture-duty note for replay.test.js estimated
"~15 occurrences" of a `--legs baseline-red:*` accept-path test needing a CLEAN-row fixture under
D4's new cross-check; only ONE such test actually existed (AC-20260823-09-4) — the rest of the
"baseline-red" hits in the file are refusal/near-miss/stats tests unaffected by the cross-check.

**Why:** File Plan authors sometimes paraphrase or estimate against the tree as it looked when the
spec was drafted, not the tree at build time (siblings landing between plan and build, or simple
miscounts). Recorded as a deviations-sidecar bullet rather than a blocked return, since both were
forced-but-unblocking (the AC's own worked example was self-sufficient to write from).

**How to apply:** Before retagging "the existing X test" or acting on a File Plan's occurrence
count, grep for the literal yourself. A mismatch that's resolvable from the AC's own worked
example (not a design fork) is a deviations bullet, not a block.

Also reconfirmed [[self-matching-literal-pin-fragment-idiom]]'s vacuous-rejection class from a new
angle: --record's OLD generic --legs enum-usage error message lists `'baseline-red:<leg>[,<leg>]'`
among the accepted values, so a naive `assert.match(stderr, /baseline-red/)` on a
`pristine-red:<leg>` refusal test passes VACUOUSLY today (pristine-red isn't recognized at all
yet, so it hits the generic enum refusal, which happens to contain the word). Fixed by asserting
on the cross-check's own distinguishing phrase ("cannot reproduce") plus the leg's exit code
before the generic word. Always try the new assertion against the untouched pre-image and check
it actually goes red before trusting a regex-only pin on an error message.
