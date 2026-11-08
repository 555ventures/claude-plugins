---
date: 2026-09-12
status: done
tier: standard
area: review-close
design: false
breaking: false
depends_on: [specs/20260911/03-tests-expire-at-close.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: 87049cf31dfa9aecb6a8782da8c90fc2040e3f61
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-13-1, AC-20260912-13-2, AC-20260912-13-3, AC-20260912-13-4, AC-20260912-13-5, AC-20260912-13-6, AC-20260912-13-7, AC-20260912-13-8]
---

# Expired tests leave in their own commit

## Goal

A spec's close currently deletes that spec's expired tests *into the close commit itself*, so the
commit git records as "the tree the review judged" is that tree minus coverage the review's own
`ac-matrix` leg just passed on. The replay harness rebuilds its scratch tree from exactly that
commit and gets a coverage leg that can never go green, burning a full cycle and recording
`setup-failed` on every attempt. This spec moves the deletion out of the close commit: the close
commit is the judged tree, and the deletions land immediately afterwards in a commit of their own
that never touches the spec file. Done means: `--mark closed` deletes and commits the expired
tests itself after the close gate passes, the replay target selector still resolves the close
commit, and a deletion that turns the suite red is reverted and reported rather than blocking the
close.
