---
date: 2026-08-20
status: done
tier: standard
area: fleet-evidence
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 17
open_markers: 0
diff_base: 7bc2d57ee53e3245d34aa163c31571eabe724de9
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-05-1, AC-20260820-05-2, AC-20260820-05-3, AC-20260820-05-4, AC-20260820-05-5, AC-20260820-05-6, AC-20260820-05-7, AC-20260820-05-8, AC-20260820-05-9, AC-20260820-05-10, AC-20260820-05-11, AC-20260820-05-12, AC-20260820-05-13, AC-20260820-05-14, AC-20260820-05-15, AC-20260820-05-16, AC-20260820-05-17]
---

# Fleet evidence reader (read-only)

## Goal

One zero-dependency script that reads every spec-run ledger on this machine and answers six
fixed questions — leg red-recency, the brief-08 gate, escape aggregates, replay debt,
CLEAN-contradicted-by-escape, and a schema-drift census — so pipeline questions stop being
answered from this repo's least-representative 14% of the evidence. Done means: the script
derives all six queries from a synthetic fleet in tests and from the real `~/Projects` by
hand, records nothing, and the admission bar's derivable fields (materiality, generality,
removability) have a named, executable source. Two JJ-ruled doctrine changes ride along:
the third-recurrence trigger adopts the fleet denominator, and escape rows gain a `class`
field so recurrence is mechanically countable going forward.
