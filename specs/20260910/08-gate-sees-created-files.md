---
date: 2026-09-10
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-10
build_base: main
open_markers: 0
diff_base: a9134b8e15846d4bced168dcd584c8eb986888c9
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-08-1, AC-20260910-08-2, AC-20260910-08-3, AC-20260910-08-4, AC-20260910-08-5, AC-20260910-08-6, AC-20260910-08-7, AC-20260910-08-8]
---

# The build gate sees the files the build created

## Goal

A host check whose inventory is the git index cannot see a file the build just created,
because a newly created file is untracked until the checkpoint commit. The build's gate
therefore runs green over an inventory that is missing the build's own new files, and the same
check reds at review — after the commit made them tracked — where it is argued instead of
fixed. This spec makes the build driver add every untracked, non-ignored File Plan path to the
index with intent-to-add immediately before it spawns the gate child, so the one gate run each
round already sees what the build created. Done means: a build that creates a file gets that
file's bytes counted by index-reading checks at build time, the gate still runs exactly one
child per round, and nothing about the checkpoint commit changes.
