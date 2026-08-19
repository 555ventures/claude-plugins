---
name: reviewer-workflow-return-schema
description: the raw reviewer workflow-return object's verdict field is only ever "CLEAN"|"REVIEWER_FAILED" — findings live separately in survivors, so "CLEAN" means "ran successfully" not "no findings"
metadata:
  type: project
---

`spec/commands/review.md` (around the Phase 1 dispatch contract) documents the reviewer agent's
raw workflow-return shape as `{verdict: "CLEAN"|"REVIEWER_FAILED", survivors: [{severity, claim,
file, line, impact, ...}]}`. `verdict` is a two-value enum for "did the reviewer complete" — it is
NOT a findings-count word like the derived FINDINGS/HARD_FINDINGS/CLEAN verdict that
`spec/scripts/verdict.js` computes downstream from `survivors.length + legFindings` and disposition
counts. A workflow return with `verdict:"CLEAN"` can still carry a non-empty `survivors` array —
that's the normal "ran fine, found N things" case.

**Why:** discovered while fixing replay.js's `--score` (specs/20260819/02-mutation-replay.md
review finding F4): a crashed/malformed reviewer return was being scored `missed`, permanently
deflating catch-rate evidence with something that was never produced. The correct guard is
`wf.verdict === 'CLEAN' && Array.isArray(wf.survivors)` — gating on the raw two-value field, not
on `survivors.length === 0`.

**How to apply:** any gate script reading a raw reviewer/wf-review return object directly (not
verdict.js's post-processed word) must treat `verdict !== 'CLEAN'` as "the reviewer never
produced usable output" and refuse to interpret `survivors` at all. Don't confuse this raw field
with verdict.js's derived CLEAN/FINDINGS/HARD_FINDINGS/REVIEWER_FAILED vocabulary — same word
"CLEAN", different layer, different meaning window. See [[replay-js-mode-flag-dispatch]] for the
sibling replay.js conventions this schema get consumed under.
