---
date: 2026-09-13
status: done
tier: standard
area: replay
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-13
build_base: main
open_markers: 0
diff_base: 7f982694adf93c9919a2e83f69ff79a8ccab111c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-01-1, AC-20260913-01-2, AC-20260913-01-3, AC-20260913-01-4, AC-20260913-01-5, AC-20260913-01-6, AC-20260913-01-7, AC-20260913-01-8, AC-20260913-01-9, AC-20260913-01-10, AC-20260913-01-11]
---

# The replay tree is the reviewed tree

## Goal

A review records the two commits that bound what it judged, as git refs that survive a
rebasing merge-back and garbage collection, and the replay harness reads those refs instead of
reconstructing the pair from history. Today `--select` identifies the close commit by asking
which commit most recently touched the spec FILE — an answer that drifts to an unrelated commit
as soon as anything else edits that doc — and takes its first parent as the tree to stand up;
`--setup` then prints a success line over whatever that produced. Done means: no history
derivation remains on the selection path, a review row that cannot name its own bounds is a
named refusal rather than a guess, and a scratch tree that fails the target's own coverage
check ends the setup with a diagnosis instead of a success line.
