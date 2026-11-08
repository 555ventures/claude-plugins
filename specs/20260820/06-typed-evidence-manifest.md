---
date: 2026-08-20
status: done
diff_base: 7e9f33746ed21870fd082fe306fce06a3a6a5e94
open_markers: 0
tier: critical
area: review-verification
design: false
breaking: true
depends_on: []
depended_on_by: ["specs/20260820/07-review-driver.md"]
brief: 16
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-06-1, AC-20260820-06-2, AC-20260820-06-3, AC-20260820-06-4, AC-20260820-06-5, AC-20260820-06-6, AC-20260820-06-7, AC-20260820-06-8, AC-20260820-06-9, AC-20260820-06-10, AC-20260820-06-11, AC-20260820-06-12, AC-20260820-06-13, AC-20260820-06-14, AC-20260820-06-15]
---

# Typed Evidence Manifest — `observed` becomes a structured object; the packed-string parser is deleted

## Goal

Every evidence-manifest row's `observed` field becomes a typed JSON object, and `verdict.js`
stops regex-parsing packed strings ("skips=N todos=M", "passed=N failed=M skipped=K", …) —
the parser is deleted, not tested, and unknown-coerced-to-zero becomes unwritable by
construction (brief 16, ratified 2026-08-20). Typed rows also carry what the child process
*reported* alongside what the caller *intended*: the at-risk leg records
`{"files":N,"testsExecuted":E}` and goes red on the denominator contradiction
(intended > 0 ∧ executed = 0) — the exact shape of the 2026-08-16→08-20 vacuous-green
escape. Done means: a string-`observed` row derives `UNVERIFIED` (never a silently
misread verdict), every emitter writes the typed shapes, the release ledger copies typed
objects verbatim instead of silently omitting drifted keys, and the producer→consumer pair
test pins the new grammar end to end. This changes two emitted literals cited in the
hash-stamped grounding contract, so it re-grounds every host — a deliberate one-time cost,
paid once here, never dribbled across releases.
