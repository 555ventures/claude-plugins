---
date: 2026-10-07
status: done
build_base: main
tier: standard
area: prototype
breaking: false
depends_on: [specs/20261007/01-approve-writes-a-behaviour-contract.md]
depended_on_by: [specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
brief: 28a
spiked: 2026-10-07
open_markers: 0
diff_base: 4a512bc8809f3d33069651f5667e783c370e8bae
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261007-02-1, AC-20261007-02-2, AC-20261007-02-3, AC-20261007-02-4]
---

# The prototype opens from words, a brief or a stem

## Goal

`/spec:prototype` takes the same three input shapes as `/spec:plan`: a feature description in
plain words, a roadmap brief path, or a prototype stem to re-open. The driver derives the stem
(from words: a slug it prints as an auto-pick the user may rename once; from a brief: the
brief's stem; from a stem: itself), writes the spoken idea into `status.json` at OPEN, and never
reads a brief's `Lane:` header — choosing the command is choosing the behaviour lane. Rounds run
with no gate. A host with no `prototype` block is refused by a sentence that says what the block
is for. Done means: on a fixture host the driver opens from each shape, persists the idea and
the input kind, stamps `brief: n/a` for a words prototype, substitutes `{stem}` into the test
file path, and admits a brief marked `Lane: structural`.
