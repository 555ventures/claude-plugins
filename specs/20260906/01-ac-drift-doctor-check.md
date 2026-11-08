---
date: 2026-09-06
status: done
tier: standard
area: doctor
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-06
open_markers: 0
diff_base: c5460825b63d7992f000126c42b90317e5283aed
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260906-01-1, AC-20260906-01-2, AC-20260906-01-3, AC-20260906-01-4, AC-20260906-01-5, AC-20260906-01-6, AC-20260906-01-7, AC-20260906-01-8, AC-20260906-01-9, AC-20260906-01-10, AC-20260906-01-11, AC-20260906-01-12, AC-20260906-01-13, AC-20260906-01-14, AC-20260906-01-15]
---

# Post-close AC-pin drift as a doctor check (`ac-drift.js`), plus the dead-flag and untested-script sweep

## Goal

The AC↔test coverage matrix (`ac-matrix.js`) runs once, at review, against the spec under
review. Nothing re-derives it after a spec closes, so a later test split, a fix-cap waive, or a
retired surface silently leaves a done spec's acceptance criteria with no test citing them —
measured today at 42 criteria across 20 done specs dated after the v7 cutover (Assumptions A5).
Done means: a new `ac-drift.js` derives, repo-wide and statelessly, every done spec's
acceptance criterion that no test-classified file cites and no sanction covers, and
`/spec:doctor` runs it as check 17 (advisory, one finding line per row, remedy named). Two
sibling hygiene findings from the same audit land here because each is a one-row change:
`ci-gate-parity.js` (doctor check 14's script) gains its first behavioural pins, and four
command-line flags no command, test, or doc ever passes are deleted; the one flag that fills a
doctrine-documented ledger column stays and is documented at its driver.
