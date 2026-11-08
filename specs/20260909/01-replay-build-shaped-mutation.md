---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: replay-harness
design: false
breaking: false
depends_on: [specs/20260908/03-test-fixture-dedupe.md]
depended_on_by: [specs/20260909/02-replay-base-and-label-honesty.md]
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: 056cb05974d3d6f7cbdc11fb2856beaecee2562d
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-01-1, AC-20260909-01-2, AC-20260909-01-3, AC-20260909-01-4, AC-20260909-01-5, AC-20260909-01-6, AC-20260909-01-7, AC-20260909-01-8, AC-20260909-01-9, AC-20260909-01-10, AC-20260909-01-11, AC-20260909-01-12, AC-20260909-01-13, AC-20260909-01-14, AC-20260909-01-15]
---

# The replay mutation commit is shaped like a real build commit

## Goal

A replay mutation lands as a commit that skips the last step every real build performs —
reconciling the host's derived artifacts against the tree it just changed. In this repo that
artifact is `size-baseline.json`, a byte-exact ceiling per tracked file, so a mutation that
changes any file's length reddens the gate on the length change alone, with no defect involved.
Step 7's ladder then reads that redness as newly-red, retries, verifies against the pristine
tree, finds it green, and records `leg-caught` — a measurement that says a review leg caught a
defect when all it caught was an edit. After this lands, `--apply` runs a host-declared
post-apply reconcile inside the scratch worktree and carries exactly the declared paths into the
mutation commit, so the commit is indistinguishable in shape from a real build commit; the
canonical patch every later phase scores against still names only the mutation's own files; a
failure of that hook is recorded rather than improvised; and a host that declares nothing behaves
byte-for-byte as it does today. Done means: a length-changing mutation in this repo leaves the
size ratchet green, and `scripts/size-ratchet.js --reconcile --cite <spec>` exists as the
one-shot form of what a build does by hand today.
