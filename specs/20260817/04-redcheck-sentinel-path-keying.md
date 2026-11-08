---
date: 2026-08-17
status: superseded
open_markers: 0
risk: T2
area: workflows
design: false
breaking: false
depends_on: ["specs/20260817/03-redcheck-stop-resume-waiver.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260817-04-1, AC-20260817-04-2, AC-20260817-04-3, AC-20260817-04-4, AC-20260817-04-5]
---

# RedCheck sentinel keyed to the File Plan path; one probe invocation per file

## Goal

`wf-build`'s TDD red-check must be able to verify test files on hosts whose runner is
invoked below the repo root (pnpm/yarn/npm workspaces, turbo, nx, cargo, Go multi-module).
Today the 6.29.0 workspace-rewrite clause and the 20260815/06 verbatim sentinel cross-check
contradict each other: the probe keys its `AUDIT_RED:<path>` / `AUDIT_GREEN:<path>` echo to
the (possibly rewritten) invocation path while `crossCheckSentinels()` exact-matches the
File Plan path, so every rewritten file reads back `observed: "not-collected"` and the run
blocks at `tdd-red-check` over genuinely-correct red/green states (intake JJ-20260817-04,
corroborated by UPWELL-20260718-01 and TRADOYO-20260813-01). Done = the probe contract keys
sentinels to the File Plan path by definition, mandates one probe invocation per file, and
the two committed red pins in `tests/redcheck-sentinel-path-keying.test.js` go green.
