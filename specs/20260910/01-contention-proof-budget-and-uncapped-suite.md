---
date: 2026-09-10
status: done
tier: critical
area: gate
design: false
breaking: false
depends_on: [specs/20260909/06-ephemeral-serve-ports.md, specs/20260909/07-hang-bound-and-port-check.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-10
build_base: main
open_markers: 0
diff_base: 99dee42bcea1919b9bae4acddf9139d50ceef010
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-01-1, AC-20260910-01-2, AC-20260910-01-3, AC-20260910-01-4, AC-20260910-01-5, AC-20260910-01-6, AC-20260910-01-7, AC-20260910-01-9, AC-20260910-01-10, AC-20260910-01-8]
---

# The per-file budget proves an offender alone, and the suite stops running on three cores

## Goal

`npm test` takes five minutes on an eighteen-core machine because `--test-concurrency=3` caps
it at three workers. The cap exists because the per-file budget guard measures wall time, which
inflates 30–60% under load, so raising parallelism turned healthy files red — the guard was
measuring the machine, not the files. This spec makes the guard prove an offender by re-running
only the suspects one at a time, then drops the cap. Done means: the suite runs at the runner's
own default fan-out, a file that is only slow under load is not a red, a file that is slow alone
still is, and the one file that genuinely exceeds the budget is split.
