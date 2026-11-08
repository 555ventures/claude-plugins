---
date: 2026-09-09
status: done
tier: critical
area: replay-harness
design: false
breaking: false
depends_on: [specs/20260908/03-test-fixture-dedupe.md, specs/20260909/01-replay-build-shaped-mutation.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
build_base: main
diff_base: db21bb937bf56889e8779494c7ec6dcc2443046f
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-02-1, AC-20260909-02-2, AC-20260909-02-3, AC-20260909-02-4, AC-20260909-02-5, AC-20260909-02-6, AC-20260909-02-7, AC-20260909-02-8, AC-20260909-02-9, AC-20260909-02-10, AC-20260909-02-11, AC-20260909-02-12, AC-20260909-02-13, AC-20260909-02-14, AC-20260909-02-15, AC-20260909-02-16, AC-20260909-02-17]
---

# The review's base reaches every leg, and the ledger refuses a label its evidence denies

## Goal

Two defects make the replay harness unable to produce an honest number in this repo, and one of
them lets the harness record a number that is not honest. First, `plugin-bump.js --check`
derives its own comparison point as `merge-base(HEAD, main)`; on the replay scratch tree — whose
HEAD is the close commit's parent plus an overlay, and whose branch has already merged — that
merge base collapses onto the parent, above the commit that carried the version bump, so the
check judges a window that excludes the very change it exists to see and goes red on a tree the
review itself judged green. Second, `replay.js --record` accepts `--legs baseline-red:<leg>`
after nothing more than a shape check: it never asks the cited review row whether that leg was
actually red, and a review run id names several ledger rows — the red iterations plus the CLEAN
one — so "was it red at review" has no single answer today. Third, step 7's ladder routes a
deterministic cannot-reproduce-the-review's-state result into an `AskUserQuestion` nobody can
answer from the evidence shown. After this lands: every review leg subprocess is told the base
this review is judging against, `plugin-bump` uses it, one shared selector defines which row a
review run id means, `--record` refuses a `baseline-red` or `pristine-red` claim that row
contradicts, and a scratch tree that cannot reproduce the reviewed state records `setup-failed`
and stops instead of asking the user.
