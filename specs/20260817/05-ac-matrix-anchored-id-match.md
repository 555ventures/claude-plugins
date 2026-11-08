---
date: 2026-08-17
status: superseded
open_markers: 0
risk: T2
area: scripts
design: false
breaking: false
depends_on: ["specs/20260817/01-ac-duplicate-id-adjudication.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260817-05-1, AC-20260817-05-2, AC-20260817-05-3, AC-20260817-05-4]
---

# ac-matrix AC-ID hits are anchored tokens, never bare substrings

## Goal

`ac-matrix.js` credits an AC with a coverage hit whenever a test file *contains* its ID as a
bare substring, and the AC-ID grammar makes one ID a literal prefix of another in the same
spec (`AC-20260815-03-1` is inside `AC-20260815-03-14`). Two symmetric accounting failures
follow from that one root cause: a skipped test owned by an env-gated AC is attributed to
the lowest-numbered prefix-collider and reported as a hard `unsanctioned-skip` (prax,
2026-08-17: 21 false hard findings on a correctly-declared spec), and the prefix AC reads as
covered (`uncovered=0`) though no test cites it. Every host spec with more than 9 ACs is
exposed, independent of stack (intake PRAX-20260817-01). Done = AC-ID occurrences count only
as anchored tokens, both committed red pins in `tests/ac-matrix-skip-attribution.test.js` go
green, and the observed grammar plus every finding class stays byte-unchanged.
