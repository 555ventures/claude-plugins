---
date: 2026-10-13
status: done
build_base: main
tier: standard
area: review
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-13
open_markers: 0
diff_base: c796f0324cf57dd219abc1ae7e10d420dc978bf6
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261013-01-1, AC-20261013-01-2, AC-20261013-01-3, AC-20261013-01-4, AC-20261013-01-5, AC-20261013-01-6, AC-20261013-01-7, AC-20261013-01-8, AC-20261013-01-9, AC-20261013-01-10]
---

# Review closes its own soft findings

## Goal

A soft (advisory) reviewer finding is fixed inside the review that found it, or recorded as debt
in the spec it belongs to — never pasted into the session queue by hand. The review driver's
CLOSE step gains a soft sweep: every soft from the last reviewer return is either fixed in the
close tree under a line ceiling the driver enforces, or written into the spec's Rationale as
advisory debt. The DISPOSITIONS step and the stage doctrine stop telling the session to
`spec-queue add` a soft. Done means: a spec whose review produced softs cannot be marked closed
until each soft has a recorded fate, the close commit's source change is measured against the
ceiling, and the close row carries the sweep tally. This decides q319 (the fix lane) as yes in
its smallest form — the fix lane is the soft sweep at close, not a separate `--fix` entry point.
