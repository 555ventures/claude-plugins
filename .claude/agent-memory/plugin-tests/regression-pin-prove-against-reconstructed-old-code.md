---
name: regression-pin-prove-against-reconstructed-old-code
description: When a dispatch asks for a regression pin closing a defect that escaped a green suite, reconstruct the old/broken behavior in scratch and run the new assert against it — don't just assert the pin "would" have caught it.
metadata:
  type: feedback
---

When a fix-iteration dispatch says a defect escaped because "no test ever asserted X," the
required verification step is not just writing the assert — it's proving empirically that the
assert would have failed on the prior (broken) code, since that prior code is usually already
gone (fixed in place, not present as a git revision you can check out).

**How to apply:** write a small standalone scratch script that reconstructs the OLD behavior
(e.g. the exact old marker-write + old exclusion mechanism, quoting the spec's own dated
incident narrative for precision), run the new test's before/after capture logic against that
reconstruction in a throwaway repo, and confirm the assertion throws. Report the actual failure
output, not a claim. This was required by name in specs/20260819/02-mutation-replay.md's
fix-iteration-2 dispatch (the `--setup` host-unmodified pin for
`tests/replay/replay.test.js` AC-20260819-02-3) — reconstructing iteration-1's
`git rev-parse --git-path info/exclude`-inside-the-worktree approach showed it resolves into the
HOST repo's shared `.git/info/exclude`, and the new byte-identical assert failed against it as
required.

**Why:** a regression pin that was never run against the thing it claims to pin is just an
assertion of intent — the whole point of "prove it fails on iteration-1 code" is that a green
suite already shipped this exact defect twice because nobody looked.

See also [[stale-dispatch-premise-concurrent-session]] (re-derive current state before trusting
a dispatch's incident narrative) — this is the complementary discipline: once the narrative is
confirmed current, prove the pin against it rather than trusting the narrative alone.
