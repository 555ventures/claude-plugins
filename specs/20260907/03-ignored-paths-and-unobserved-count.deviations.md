# Deviations — 03-ignored-paths-and-unobserved-count

- D7 named 7.97.0 as the plan-time version-bump target, but the repo's `spec` plugin was
  already at 7.103.0 by build time (sibling specs 20260907/01 and /02 landed first). Per D7's
  standing moving-target rule, bumped to the next free minor instead: **7.104.0**.
