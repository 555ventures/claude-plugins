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
