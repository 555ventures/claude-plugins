---
date: 2026-08-12
status: done
diff_base: d0242d8d09751bc40cfeedeae546b127925ad6d4
risk: T3
open_markers: 0
area: spec-audit
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 05
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260812-02-1, AC-20260812-02-2, AC-20260812-02-3, AC-20260812-02-4, AC-20260812-02-5, AC-20260812-02-6, AC-20260812-02-7, AC-20260812-02-8, AC-20260812-02-9, AC-20260812-02-10, AC-20260812-02-11]
---

# /spec:audit — hotspot-targeted debt intake with a disposition ledger

## Goal

The pipeline gains its slow whole-repo judgment layer: a `/spec:audit` command that targets
the host's churn×complexity hotspots, hunts cross-spec smells over only those files, verifies
every finding against live code, and forces exactly one recorded fate per finding into a
disposition ledger the next audit reads first. Done means: the command ships, the hotspot
derivation exists as one deterministic script behind `spec-paths`, the ledger discipline
(including ≥2-recurrence promotion) is doctrine, release offers the audit at the milestone
seam, and all of it is test-pinned.
