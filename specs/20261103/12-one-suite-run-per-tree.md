---
date: 2026-11-03
status: done
tier: standard           # caller-fixed at plan time (see D0); the host's § Risk Tiers names review-legs.js and grounding-contract.md — the build upgrades on mid-build evidence per core § Tiers
area: gate-integrity
breaking: false
depends_on: [specs/20261101/06-a-rerun-re-runs-only-what-went-red.md, specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md]
brief: n/a
spiked: 2026-11-03
open_markers: 0
diff_base: 0f1e8700fb0e365ea07e144caec143e22864a59d
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-12-1, AC-20261103-12-2, AC-20261103-12-3, AC-20261103-12-4, AC-20261103-12-5, AC-20261103-12-6, AC-20261103-12-7, AC-20261103-12-8, AC-20261103-12-9, AC-20261103-12-10, AC-20261103-12-11, AC-20261103-12-12, AC-20261103-12-13, AC-20261103-12-14, AC-20261103-12-15, AC-20261103-12-16, AC-20261103-12-17, AC-20261103-12-18, AC-20261103-12-19, AC-20261103-12-20, AC-20261103-12-21, AC-20261103-12-22, AC-20261103-12-23, AC-20261103-12-24, AC-20261103-12-25, AC-20261103-12-26, AC-20261103-12-27]
---

# One suite run per tree

## Goal

The host test suite runs several times over trees that are byte-identical in every file a test
can read. Today's audit measured a clean spec at ~6.6 suite-equivalents on this repo (build
post-gate, review gate, review suite, at-risk, close gate, close suite, fan-out gate) and ~4 on
genesis-seeded hosts, and the ledger (1,004 rows at audit) holds zero cases where a same-tree
rerun caught anything — all 7 suite-only reds after a post-gate build carried `diff.dirty:true`,
a changed tree. Done means a green run's result is recorded once per (command, tree, declared
test-env names) in a cache every worktree of the repo shares, every later consumer of that same
command over that same tree reuses the recorded row with a provenance stamp instead of spawning,
a red result is never reused, and the scoped gate names the File Plan's exact test files instead
of widening to their directories.
