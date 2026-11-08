---
date: 2026-09-02
status: done
build_base: main
tier: critical
area: review-verification
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: ad22f0beefab6ec5690c94a93b34178cfe1076c0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-05-1, AC-20260902-05-2, AC-20260902-05-3, AC-20260902-05-4, AC-20260902-05-5, AC-20260902-05-6, AC-20260902-05-7, AC-20260902-05-8, AC-20260902-05-9, AC-20260902-05-10, AC-20260902-05-11, AC-20260902-05-12, AC-20260902-05-13]
---

# Manifest-stamped review scope: the verdict reads the pass mode it already ran

## Goal

The review verdict stops asking the reviewer which pass it is in. `review-legs.js` stamps the
scope it ran (`full` or `fix-delta`) onto every evidence row it writes; `verdict.js` derives
the required-leg set from those rows and never from the reviewer's return; a `--mark
dispositions` whose verdict is `UNVERIFIED` is refused with the missing legs named instead of
looping silently. Done means: a fix-delta hard-stop derives `GATE_RED` (today it derives
`UNVERIFIED`), a reviewer return with no `scope` key closes CLEAN on a green fix-delta pass,
and the reviewer contract no longer carries a field only the driver could have known.
