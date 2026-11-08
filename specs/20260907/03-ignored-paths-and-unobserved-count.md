---
date: 2026-09-07
status: done
tier: critical
area: review-evidence
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-07
open_markers: 0
diff_base: e1835455f757ffe9f43cc6ce72771b24ef64c857
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-03-1, AC-20260907-03-2, AC-20260907-03-3, AC-20260907-03-4, AC-20260907-03-5, AC-20260907-03-6, AC-20260907-03-7, AC-20260907-03-8, AC-20260907-03-9]
---

# At-risk selection skips ignored paths; an unobserved test count reds the leg

## Goal

Two independent holes found by a real review in the `prax` host (`rv_e7c6439702e5`) close
together because they are the same failure at two ends of one leg. First, the at-risk
selector walks the working tree and only refuses four directory *names*, so git-ignored
working copies — the pipeline's own `.claude/worktrees/**` checkouts, `*.build/` scratch
dirs — are handed to the host's test command as if they were real test files; in `prax`
the host runner could not route them and aborted before a single test ran. Second, when a
host declares a test-count format and that format never appears in the runner's output, the
count is recorded as an unavailability object, which the vacuous-green rule reads as
*unknown* rather than *zero* — so a runner that exits 0 having executed nothing scores the
leg green. Done means: ignored paths never enter the at-risk set on any host layout, and a
run that produces no observable count reds both the at-risk leg and the whole-suite leg.
