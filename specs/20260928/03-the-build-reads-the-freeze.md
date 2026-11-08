---
date: 2026-09-28
status: done
build_base: design-retool
tier: standard
area: prototype
breaking: false
depends_on: [specs/20260928/02-freeze-export-and-the-contract.md]
depended_on_by: []
brief: 28
spiked: 2026-09-28
open_markers: 0
diff_base: 610a6d71426159c1756055deef81ec4569b19c2a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260928-03-1, AC-20260928-03-2, AC-20260928-03-3, AC-20260928-03-4, AC-20260928-03-5, AC-20260928-03-6]
---

# The build reads the freeze

## Goal

The build driver gains the behaviour lane: a spec stamped `lane: behaviour` starts by merging
`harden/<stem>` into its worktree, builds the UI from main against the frozen contract, and
after a green gate runs the capture gate route by route — a diff is either accepted by the user
at a look stop or fixed and re-captured — recording the diff count on the build row. Any spec
carrying a brief is refused while that brief's `proto/` branch still exists; `/git:merge`
refuses a `proto/*` source; the review driver deletes `harden/<stem>` after a behaviour-lane
merge-back; the reviewer reads the host's design tables. Done means: on a fixture host the
refusal fires, the harden merge is verified, the capture gate stops on a diff and proceeds on
acceptance, the build row carries `capture`, and the harden branch is gone after merge.
