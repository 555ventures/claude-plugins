---
date: 2026-09-12
status: done
tier: critical
area: cross-cutting
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: 726ad6297196de94fed28242f85777b82e87d937
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-15-1, AC-20260912-15-2, AC-20260912-15-3, AC-20260912-15-4, AC-20260912-15-5, AC-20260912-15-6, AC-20260912-15-7, AC-20260912-15-8, AC-20260912-15-9, AC-20260912-15-10]
---

# The close stops deleting tests

## Goal

Review close stops deleting tests. It still classifies every test tagged with the closing
spec's AC-IDs, still records `tests:{born,kept,retired}` on the review row, and still tells
the session what is retirable — but it writes nothing to the tree, at CLOSE or at
`--mark closed`. The deliberate `--all-done --apply` sweep behind `/spec:doctor` check 20
becomes the ONE path that deletes a test. Two fail-safe holes in the classifier are repaired
in the same landing: a `superseded` owner spec now counts as closed alongside `done`, and a
spec file under `specs/` that cannot be read no longer lets a collided AC-ID fall open.
Done means: a close makes no commit and removes no file; the machinery that existed only to
make close-time deletion safe is gone from the driver and from the suite; and the grounding
contract tells hosts the truth about when tests die.
