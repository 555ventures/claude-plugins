---
date: 2026-09-02
status: done
build_base: main
tier: critical             # question-style-gate.js is a hook surface (pipeline rules § Risk Tiers); spec/bin/spec-paths gains a key
area: mocks
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260902/07-mocks-command-driver.md]
brief: 22
open_markers: 0
spiked: 2026-09-02
diff_base: 448691927309c4f9b9705a4cf9520e2533b3a684
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-06-1, AC-20260902-06-2, AC-20260902-06-3, AC-20260902-06-4, AC-20260902-06-5, AC-20260902-06-6, AC-20260902-06-7, AC-20260902-06-8, AC-20260902-06-9, AC-20260902-06-10]
---

# Mocks provenance ledger + the question gate's product-stage exemption

## Goal

Land the record every later design stage is gated on: a markdown provenance ledger
(`design/mocks/ledger.md`) with fixed-word columns a script parses, counts, and turns into one
advance/blocked verdict — a product-kind claim that is the session's invention, or an inference
the user never confirmed, blocks; process claims are listed, never asked. The question-style
gate stops auto-deriving product facts: while a mocks run or a genesis run is live in the
repo, the tier-2 judge can no longer return `derive`, and its prompt states that a document
citing a subject is not the user deciding it. Done = the parser round-trips the Hearwell dry
run's ledger, the gate verdict is executable, and the hook exemption is measured red/green.
