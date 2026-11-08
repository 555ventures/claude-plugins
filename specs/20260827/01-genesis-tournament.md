---
date: 2026-08-27
status: done
diff_base: f5e393b5f6a4c60941f937ec54c72d0796e34a98
tier: standard           # driver + templates + doctrine; no hook, no frozen script, no contract edit
area: genesis
design: false
breaking: false
depends_on: [specs/20260825/04-genesis-driver.md]
depended_on_by: [specs/20260827/02-genesis-explore-state.md]
brief: 10a
spiked: 2026-08-27
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260827-01-1, AC-20260827-01-2, AC-20260827-01-3, AC-20260827-01-4, AC-20260827-01-5, AC-20260827-01-6, AC-20260827-01-7, AC-20260827-01-8, AC-20260827-01-9]
---

# The tournament of scaffolds: decisions on executed evidence

## Goal

Between the picks and the decision record, `genesis-driver.js` gains a **tournament**: the
user may mark 2–3 finalist stacks to race; the driver scaffolds each one for real into an
ignored folder, runs its zero-day gate, boots it to readiness through `smoke.sh`'s contract,
and hands the session one **probe slice** per finalist to build with Sonnet workers under a
two-retry cap; the driver then re-runs gate + boot, assembles a **benchmark table** and a
screenshot gallery, and prints the PICK step. Executed evidence informs the user's pick; it
never makes it. The winner is **re-scaffolded clean** into the project root (JJ ruling
2026-08-27) and the raced copies are deleted once the decision record cites the benchmark.
Done means: the states run end-to-end against a synthetic host, a non-tournament archetype is
untouched, every step text names its doctrine, and the suite is green.
