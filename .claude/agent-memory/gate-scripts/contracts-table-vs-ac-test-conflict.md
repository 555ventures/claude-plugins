---
name: contracts-table-vs-ac-test-conflict
description: a spec's Contracts-table quoted message can literally omit a phrase the same spec's Decision (D-row) and AC test both require in every case — resolve by keeping the quoted text verbatim as a prefix and appending the required phrase, then log a deviation
metadata:
  type: feedback
  reviewed: 2026-08-27
---

specs/20260824/06 D2 said ALL `--base-sha`/`--head-sha` refusals (bad hex, mismatched pair,
**or either flag on `--profile release`**) must name the remedy `git rev-parse --verify
<ref>^{commit}` in stderr, and AC-20260824-06-2's test asserted `/git rev-parse --verify/` against
all five listed cases. But the same spec's Contracts "flag matrix" table gave an exact quoted
message for the release-profile row that does NOT contain that phrase. The task brief told me to
"use those exact strings" from the table — literally impossible to satisfy alongside the test.

**Why:** a locked Decision's blanket behavioral rule and a Contracts table's illustrative quoted
string can drift out of sync within the same spec; the AC test (already written, can't be touched)
is the real tie-breaker, not the prose table.

**How to apply:** when a table's verbatim message can't satisfy a Decision's own stated
requirement (confirmed by re-reading the actual test assertion, not just the AC bullet's prose),
keep the table's string as an exact prefix and append the missing required phrase in a trailing
parenthetical — never drop the verbatim text, never rewrite it wholesale. Log it as a deviation
bullet explaining the two constraints and why both are satisfied. Don't guess or ask — this is a
"forced-but-unblocking departure," not a `blocked` return, because the test itself proves the
resolution works. See [[gate-scripts-parallel-batch-corpus-landing]] for the sibling pattern of
trusting the test suite over static spec prose when they conflict.
