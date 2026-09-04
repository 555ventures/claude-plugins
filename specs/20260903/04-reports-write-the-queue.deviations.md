# Deviations — 04-reports-write-the-queue

- D6 named 7.74.0 as the target; that minor was already shipped by sibling spec 03
  (specs/20260903/03-pipeline-queue-mechanics.md), so the doctrine layer bumped to the next
  free minor, 7.75.0, per D6's own next-free rule and the host gotcha on stale literal
  version targets.
- A3's example `spec-queue add` stdout (`added q9 (…, after …) at position 2`) doesn't match
  the shipped script (`spec-queue.js` prints `added`, `added brief NN`, or `added <spec
  path>` — no id or position). Per A3's own "if false" clause, the doctrine sites (core.md,
  plan.md, review.md, escape.md) say entries are "printed verbatim or glossed in plain
  English" rather than asserting the richer example text; the `queued` slot contract itself
  is unchanged.
- D2's Contracts block gave the core.md rule as a verbatim target; the shipped wording is a
  compressed paraphrase carrying every clause of it. Forced by the read-load ratchet
  (tests/consistency/read-load.test.js), which is one-way by design: the 7-line verbatim
  addition pushed /spec:design (506 > 500) and /spec:init (976 > 970) past their caps.
  § Console Output Style's intro paragraph and its Close-the-loop bullet were re-wrapped in the
  same edit to reclaim the remaining lines. Ruled by JJ 2026-09-03; recorded as D7.
- spec/entrypoints.json is not in the File Plan but had to change: the four new
  `spec-paths spec-queue` call sites (core.md, plan.md, review.md, escape.md) and core.md's
  `spec-paths report-render` mention — previously invisible to the reverse-invocation scan only
  because it wrapped across a line — must be declared or entrypoints.test.js stays red.
