---
date: 2026-11-01
status: done
tier: critical
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-01
open_markers: 0
build_base: main
diff_base: aaab34b17bafff47a26a17fa860b07e6243aee6e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-08-1, AC-20261101-08-2, AC-20261101-08-3, AC-20261101-08-4, AC-20261101-08-16, AC-20261101-08-5, AC-20261101-08-6, AC-20261101-08-7, AC-20261101-08-8, AC-20261101-08-17, AC-20261101-08-9, AC-20261101-08-10, AC-20261101-08-11, AC-20261101-08-12, AC-20261101-08-13, AC-20261101-08-14, AC-20261101-08-15]
---

# No host needs the shims

## Goal

Delete the compatibility paths that no host state has needed for weeks: the genesis driver's
legacy resume (`--legacy`, the trusted-mark closure, the retired-mark refusal table), the
genesis hook's `rules-locked` design value, the queue's `auto_placed` strip, and the bespoke
"this flag is retired" stubs in four scripts whose generic unknown-flag refusal already does the
job. The ledger readers are deliberately untouched — this repo's own ledger still carries the
rows they read. Done means every named path is gone, a repo-wide sweep refuses its vocabulary
coming back, the fleet drift census over `~/projects` is byte-identical before and after, and
each script still refuses the retired input (exit 2) through its generic path.
