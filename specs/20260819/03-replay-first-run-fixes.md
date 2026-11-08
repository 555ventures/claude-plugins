---
date: 2026-08-19
status: done
tier: standard
diff_base: 944554272b63bd9294b7631b77c435331d269a37
area: review
design: false
breaking: false
depends_on: [specs/20260819/02-mutation-replay.md]
depended_on_by: []
open_markers: 0
brief: 14
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260819-03-1, AC-20260819-03-2, AC-20260819-03-3, AC-20260819-03-4, AC-20260819-03-5, AC-20260819-03-6, AC-20260819-03-7, AC-20260819-03-8, AC-20260819-03-9, AC-20260819-03-10, AC-20260819-03-11, AC-20260819-03-12, AC-20260819-03-13, AC-20260819-03-14, AC-20260819-03-15, AC-20260819-03-16, AC-20260819-03-17]
---

# Replay First-Run Fixes: Patch-Hunk Scoring, Non-Measurement Outcomes, Pair Mutations

## Goal

The mutation-replay harness (specs/20260819/02) closed CLEAN on 2026-08-19 and has never
executed anywhere. A post-CLEAN consult found four defects that would corrupt its first
number, and one of them is a recorded escape (ledger 2026-08-20, `preventedBy: runtime-leg`):
the `self-consistent-polarity` corpus class is unbuildable because the mutation worker is
bound to one file while the recipe requires a code+test pair. This spec makes the score
derive from the mutation patch the harness already holds (never a single self-reported
line), makes runs that end without a real answer recordable without polluting the catch-rate
(`unresolved`, `setup-failed`), gates every run on the host's `setupCommand` executing
inside the scratch worktree, and unbinds the pair mutation. A 2026-08-19 portability consult
added three more, all of them host-config defects this repo's own git settings hide: the
harness never emitted its own patch (host `diff.noprefix`/`core.quotePath` settings make one
D1 cannot parse), `--apply`'s `git add -A` would sweep whatever the new setup gate's
`setupCommand` wrote into the very diff the blind reviewer reads, and scoring compared the
reviewer's raw path string against the patch's. Done = the first real replay run on any host,
under any git config, can only ever produce a trustworthy row.
