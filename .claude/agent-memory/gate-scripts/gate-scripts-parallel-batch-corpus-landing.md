---
name: gate-scripts-parallel-batch-corpus-landing
description: wf-build dispatches batch workers in parallel — a script-layer AC that depends on a doctrine-layer file (e.g. a corpus the script's --class values must match) can go green without this worker touching that file, because a sibling batch (doctrine-author) lands it concurrently
metadata:
  type: project
---

On specs/20260819/02-mutation-replay.md's build, my assigned batch was scripts-only
(`spec/scripts/replay.js`, `spec/bin/spec-paths`) but `tests/replay/replay.test.js`'s
AC-20260819-02-9 asserts `spec/doctrine/replay-corpus.md` exists with 6 class headings +
recipes — a file explicitly outside my batch, owned by doctrine-author. Running the test suite
immediately after finishing my two files showed AC-9 already green: the sibling doctrine-author
batch had landed `replay-corpus.md` in parallel before I ran the gate.

**Why noted:** don't treat a cross-batch AC failing mid-work as a `blocked` signal by default —
`git status --porcelain` first to check whether a sibling worker's files simply haven't landed
yet vs. genuinely being out of scope. Only escalate `blocked` if the full suite is still red on
that AC after the batch's other workers should reasonably have finished, or if the AC's
dependency was never in any batch's File Plan row at all.

See also [[replay-js-mode-flag-dispatch]].
