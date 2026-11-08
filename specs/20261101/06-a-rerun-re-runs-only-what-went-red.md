---
date: 2026-11-01
status: done
build_base: main
tier: critical
area: review-legs
breaking: false
depends_on: [specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md]
brief: n/a
open_markers: 0
spiked: 2026-11-01
diff_base: 373e8b6d4b3cbc3eba2a4b537a9ae5ee210e4143
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-06-1, AC-20261101-06-2, AC-20261101-06-3, AC-20261101-06-4, AC-20261101-06-5, AC-20261101-06-6, AC-20261101-06-7, AC-20261101-06-8, AC-20261101-06-9, AC-20261101-06-10]
---

# A rerun re-runs only what went red

## Goal

Two review-driver marks start a fresh legs iteration: `--mark skips-extracted` (the gate reported
skips, the session extracted their names) and `--mark repair-round` (a blocking leg went red and
the owner asked for one more try). Both re-run every leg from zero, with no look at whether the
tree changed. On the skips path the only consumer of the new input is `ac-matrix`; on the repair
path the owner who changed nothing is asserting the red was flaky, which is exactly when a full
re-run of the green legs proves nothing new. Each costs a full suite run, a smoke boot and an
at-risk run — 15 to 40 minutes on the hosts measured this week, for evidence the manifest already
holds. Done means a legs re-run over an unchanged tree copies the prior iteration's green rows for
the expensive legs and spawns only the red or input-dependent ones, a changed tree re-runs
everything as today, and a leg that went red then green over the same tree is named as flaky in
the driver's output and sidecar.
