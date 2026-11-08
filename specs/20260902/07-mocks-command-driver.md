---
date: 2026-09-02
status: done
build_base: main
tier: critical             # spec/bin/spec-paths gains keys and a shared-for list (pipeline rules § Risk Tiers)
area: mocks
design: false
breaking: false
depends_on: [specs/20260902/06-mocks-provenance-ledger.md]
depended_on_by: [specs/20260902/08-genesis-shrink-brief-state.md, specs/20260902/09-one-hand-wireframes-one-token-set.md]
brief: 22
open_markers: 0
spiked: 2026-09-02
diff_base: 1add289c6c7090ba7654a24cfb1ec549e4838113
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-07-1, AC-20260902-07-2, AC-20260902-07-3, AC-20260902-07-4, AC-20260902-07-5, AC-20260902-07-6, AC-20260902-07-7, AC-20260902-07-8, AC-20260902-07-9, AC-20260902-07-10, AC-20260902-07-11, AC-20260902-07-12, AC-20260902-07-13, AC-20260902-07-14, AC-20260902-07-15]
---

# `/spec:mocks` — the standalone design command and its file-derived driver

## Goal

Amended by: ADR-0016 (specs/20260912/05-the-atlas-answers-to-a-design.md narrows D15's
frame-per-state clause and AC-20260902-07-14's worked example — see the ADR's Applies to)

Ship the design stage as its own command: `/spec:mocks` loops `mocks-driver.js`, whose state
is derived on every invocation from `design/mocks/status.json` plus the artifacts on disk —
SEED → SHAPES → WIREFRAMES → THEME → SKIN → REVIEW → APPROVED — with the genesis checkpoint
contract verbatim and a sub-checkpoint per journey, per theme direction, per skinned and
reviewed journey, so no conversation ever holds more than one journey. Every advance runs the
provenance gate (spec 06). Everything works over SSH: static HTML on disk, a preview server
that prints its port-forward line, and the session's own look through headless Playwright to
a file. Done = a cold repo can be seeded, drawn, themed, skinned and approved through the
driver with every closure check executed, and `/clear` between any two marks loses nothing.
