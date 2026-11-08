---
date: 2026-09-02
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/03-unified-build-loop.md"]
depended_on_by: []
brief: 18a
open_markers: 0
build_base: main
diff_base: 53da29e06b1fc3146cde390c4f135288bc68b93b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-05-1, AC-20260901-05-2, AC-20260901-05-3, AC-20260901-05-4, AC-20260901-05-5, AC-20260901-05-6, AC-20260901-05-7, AC-20260901-05-8, AC-20260901-05-9, AC-20260901-05-10]
---

# Loop checkpoint fails closed — no stamp parks the run, one awkward override, outcome on the ledger

## Goal

The unified build loop's one enforced stop stops when its evidence is missing. Today a
`--via loop` review that reaches `reviewer-returned` with no `.claude/spec-session.json`
prints a warning and admits DISPOSITIONS in the build session — the path 2 of 2 real loop
reviews on this machine took, with no ledger trace (ADR-0004). After this spec the same run
parks at `CHECKPOINT` with a remedy naming the cause (restart Claude Code — the stamp hook is
loaded at session start), lifts when any stamp appears, and can be walked past only by one
deliberately awkward flag whose reason lands on the review row; every loop review row records
the checkpoint outcome as a typed field. Done means: a fixture host's review driver invoked
`--via loop` with no stamp parks and refuses `--mark dispositions`, admits it once a stamp
exists or the override flag carries a reason, refuses the flag everywhere else, and the close
row says which of those happened.
