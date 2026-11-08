---
date: 2026-09-01
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/01-build-driver.md"]
depended_on_by: ["specs/20260901/03-unified-build-loop.md"]
brief: 18
build_base: c0113441b316a1de01a42534df0e1f876c7b88dd
diff_base: c0113441b316a1de01a42534df0e1f876c7b88dd
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-02-1, AC-20260901-02-2, AC-20260901-02-3, AC-20260901-02-4, AC-20260901-02-5, AC-20260901-02-6, AC-20260901-02-7, AC-20260901-02-8]
---

# Run Provenance — `via` and the session model on build and review rows

## Goal

Brief 18's kill condition is ledger-answerable only if every review row says which command
shape produced it (`via: "loop"` vs `"direct"`) and which model held the session. Neither
exists today: no ledger row carries `via` in that sense (escape rows use the key for
`commit|manual`), no row carries a model, and the session model is not in the shell
environment (measured 2026-09-01). This spec adds a never-blocking prompt hook that stamps the
session's id and transcript path to a per-root file, a library that derives the session model
from that transcript, `--via`/`--model` on `verdict.js`, and both drivers passing them onto
their rows. Done means: a review row and a build row written on a fixture host carry `via`
and `model` with the literal values below, and a host with no stamp file gets `model: null`
and `via: "direct"` with nothing refused. The fleet query that splits escapes-per-CLEAN by
`via` lands with the loop itself (sibling 03), where `loop` rows first exist.
