---
date: 2026-08-21
status: done
diff_base: 4a06c5be1415890b4996f25c3798b77fc5ef862f
open_markers: 0
tier: standard           # no critical-trigger file gets a behavioral edit (ac-matrix.js, red-check.js, lib/spec-sections.js, smoke.sh, and the driver are not on the Risk Tiers list); worst failure is a wrong skip disposition, a false smoke red, or a wrong coverage verdict, all surfaced loudly at review
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260820/07-review-driver.md", "specs/20260821/01-red-check.md"]
depended_on_by: []
brief: n/a
spiked: 2026-08-21
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260821-03-1, AC-20260821-03-2, AC-20260821-03-3, AC-20260821-03-4, AC-20260821-03-5, AC-20260821-03-6, AC-20260821-03-7, AC-20260821-03-8, AC-20260821-03-9, AC-20260821-03-10, AC-20260821-03-11, AC-20260821-03-12, AC-20260821-03-13]
---

# Cross-spec skip mapping reaches the owning-spec sanction; smoke fails closed on a stale-ready environment; AC-ID coverage matching is full-token

## Goal

Two review-evidence defects reported from UpWell 2026-08-21, both red-reproduced at plan
time. (1) The owning-spec `[env:]` sanction that specs/20260815/03 shipped is unreachable on
the realistic path: a skipped test owned by an earlier spec maps to an AC only via an AC-ID
embedded in the skip line or a content match against the spec-under-review's own File Plan
files, so a foreign test citing its AC in a docstring falls to `unmapped-skip` before the
owning-spec lookup runs (UpWell: the same four env-gated tests were `sanctioned=4` under
their own spec, `sanctioned=0` under every other). (2) `smoke.sh` trusts whatever answers
`readyCheck`: an orphaned server from a crashed prior run makes boot report ready instantly,
then the script SIGTERMs its own still-building process — observed as exit 143 /
`shutdown-unclean`. Done = a runner-qualified skip line maps through its own file's AC-ID
citations into the existing sanction logic with every edge failing closed, bare-name behavior
byte-identical, the driver's skip-extraction step preserves the runner's file qualifier, and
smoke refuses to boot into an environment whose ready predicate is already true.

Amended 2026-08-22 — D5's pre-registered reopen condition fired (a live hit): the coverage
grep's bare-substring AC-ID matching lets `AC-…-1` match inside `AC-…-12`, so ac-matrix
fails OPEN (a phantom prefix hit suppresses `uncovered-ac` — 4 laundered ACs on a 78-spec
scan) and red-check fails CLOSED (a green pin phantom-carrying a shorter red-expected AC is
a false `unsanctioned-green` — it stopped specs/20260822/02's build the same day). Done
additionally means: both call sites match full tokens through one exported helper, and a
prefix hit neither launders coverage nor stops a build.
