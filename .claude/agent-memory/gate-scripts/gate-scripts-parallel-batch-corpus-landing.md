---
name: gate-scripts-parallel-batch-corpus-landing
description: /spec:build dispatches workers in parallel within a layer wave — a script-layer AC that depends on a doctrine-layer file (e.g. a corpus the script's --class values must match) can go green without this worker touching that file, because a sibling worker lands it concurrently
metadata:
  type: project
  reviewed: 2026-09-03
---

**Corrected 2026-08-23 (review close, specs/20260823/06):** this note originally named `wf-build`
as the dispatcher. That workflow is retired — `/spec:build` now dispatches Sonnet workers
directly per layer wave. The concurrency it describes is unchanged (siblings in one wave still
land in parallel); only the dispatcher's name was stale.

On specs/20260819/02-mutation-replay.md's build, my assigned batch was scripts-only
(`spec/scripts/replay.js`, `spec/bin/spec-paths`) but `tests/replay/replay.test.js`'s
AC-20260819-02-9 asserts `spec/doctrine/replay-corpus.md` exists with 6 class headings +
recipes — a file explicitly outside my batch, owned by doctrine-author. Running the test suite
immediately after finishing my two files showed AC-9 already green: the sibling doctrine-author
batch had landed `replay-corpus.md` in parallel before I ran the gate.

**Corrected 2026-08-31 (review close, specs/20260830/03):** the account above attributes the
already-green AC to "the sibling doctrine-author batch" on inference alone — it names a plausible
worker but cites no commit or return proving that worker landed the file. That is exactly the
attribution shape the recorded `orchestrator-compensation-during-live-worker` incident got wrong
(2026-08-21: the actual concurrent editor was the build orchestrator, not a sibling worker), and
it is the grep-answerable reopen condition for that class. The observation — a cross-batch AC can
be green before you touch anything — stands; the attribution does not. Never name who landed a
file without evidence, and never let "a sibling must have done it" become a reason to stand down
from your own assignment (see [[concurrent-worker-file-collision-select-tiebreak]]).

**Why noted:** don't treat a cross-batch AC failing mid-work as a `blocked` signal by default —
`git status --porcelain` first to check whether the file has simply not landed yet vs. genuinely
being out of scope. When it HAS landed, establish who landed it before saying so (`git log -1 --
<path>`, or the orchestrator's own report); if you cannot, say the file was present and leave the
author unnamed. Only escalate `blocked` if the full suite is still red on that AC after the
batch's other workers should reasonably have finished, or if the AC's dependency was never in any
batch's File Plan row at all. Either way, report what you found — being unblocked by someone
else's landing is never a reason to skip your own rows.

See also [[replay-js-mode-flag-dispatch]].
