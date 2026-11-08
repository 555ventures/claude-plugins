---
date: 2026-08-17
status: superseded
open_markers: 0
risk: T2
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260817/05-ac-matrix-anchored-id-match.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260817-01-1, AC-20260817-01-2, AC-20260817-01-3, AC-20260817-01-4, AC-20260817-01-5, AC-20260817-01-7, AC-20260817-01-6]
---

# ac-matrix duplicate AC-ID adjudication (fail-closed)

## Goal

`ac-matrix.js` depends on AC-ID uniqueness but never adjudicates it: `acById` is a last-wins
Map, so two different criteria sharing one well-formed ID collapse to one entry. Two
execution-verified silent holes follow (intake JJ-20260817-01): a criterion with no test at
all reads as fully covered, and an ungated criterion's skipped test is sanctioned by a
duplicate's `[env:]` declaration — both `exit 0`, zero findings. Done means: every duplicated
occurrence is a hard finding that also fails the coverage accounting closed, a skip mapping to
a duplicated ID can never be sanctioned, the two JJ-20260817-01 pins turn green, and behavior
on unique-ID specs is byte-identical.
