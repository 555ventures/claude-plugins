---
date: 2026-10-05
status: done
build_base: design-retool
tier: standard
area: design
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
open_markers: 0
diff_base: d7bf5e8bb627c6e2b4b9571ac7c7845068195dcb
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261005-05-1, AC-20261005-05-2, AC-20261005-05-3, AC-20261005-05-4, AC-20261005-05-5, AC-20261005-05-6, AC-20261005-05-7, AC-20261005-05-8, AC-20261005-05-9, AC-20261005-05-10]
---

# Derived tests ride on the export branch

## Goal

The prototype freeze has the session write one end-to-end test per behaviour pin into the host's
main working tree and commit that file on main. Those tests are red by construction until the
hardening spec lands, so the host's gate on main is red in between: every other spec branched in
that window, and every direct change on main, meets a failing gate it did not cause (seen in the
walkthrough host with `tests/browser/12-proto.spec.ts`). After this spec the session writes the
tests in the prototype worktree, the freeze carries them onto `harden/<stem>` as a second commit,
and they reach a working branch only through the hardening spec's own harden merge. Done means:
after `--mark tests-derived` the main working tree holds no derived test file, `harden/<stem>`
does, a re-run after any refusal resumes cleanly, and the build accepts tests delivered by the
merge exactly as it accepted tests that were already on main.

This supersedes D4 of specs/20260928/02-freeze-export-and-the-contract.md (tests authored in the
main working tree) and narrows that spec's criterion 8 (`harden/<stem>` holds exactly the export
globs' diff): the data commit still holds exactly that diff, and the branch tip adds the tests.
