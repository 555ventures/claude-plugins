---
date: 2026-10-24
status: done
build_base: main
tier: standard
area: review
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 2702310b4db7f8363d17661fcaebea720334ea69
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261024-06-1, AC-20261024-06-2, AC-20261024-06-3, AC-20261024-06-4, AC-20261024-06-5, AC-20261024-06-6, AC-20261024-06-7, AC-20261024-06-8, AC-20261024-06-9, AC-20261024-06-10, AC-20261024-06-11]
---

# The close tree equals the judged tree; softs are debt or ride a fix round

## Goal

Nothing lands after the reviewer's verdict unreviewed. Today that is guarded only when the
session declares it fixed a soft, and then only by a 60-line budget measured against a snapshot
that has needed two structural repairs in ten days. This spec makes the guard exact and
unconditional: `--mark closed` refuses any counted change between the committed close tree and
the judged tree, every time. The post-verdict fix window closes with it: a soft is recorded as
advisory debt when the verdict lands, or it rides a fix round the reviewer re-checks before the
verdict. The line ceiling, the sweep mark and its sweep file are deleted. Done means the close
refuses drift with no soft in play, a cleaned-up build directory the reviewer's legs left behind
is not drift, and no plugin script, doctrine file or canonical doc names a retired identifier.
