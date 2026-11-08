---
date: 2026-08-13
status: done
diff_base: 08b5e48699c0de1f232a3e2a83e69c4c02dba2b1
open_markers: 0
risk: T3
area: host-grounding
design: false
breaking: false
depends_on: ["specs/20260813/09-model-placement-mechanics.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-10-1, AC-20260813-10-2, AC-20260813-10-3, AC-20260813-10-4, AC-20260813-10-5, AC-20260813-10-6, AC-20260813-10-7, AC-20260813-10-8, AC-20260813-10-9, AC-20260813-10-10]
---

# Host capabilities — declared capabilities replace hardcoded stack assumptions

## Goal

Close audit Class C's silent-failure family: commands currently assume GitHub as the forge,
universal skip-count reporting, pnpm-shaped monorepos, Storybook-shaped previews, and
shell/Node-shaped entry points — and on hosts where the assumption misses, whole organs go
inert *silently* (the exact UpWell skip-count failure, ledger row 34). This spec adds one
`capabilities` block to the host config contract, written by `/spec:init` and consumed at
single points (the CI scripts, the verdict derivation) wherever possible; a capability the
host lacks makes the consuming leg loudly `unavailable` — and the review verdict gains the
qualifier word to carry that honesty, which it currently lacks (release-profile-only today).
Done means: the same CLEAN verdict means the same thing on every host, and gaps announce
themselves.
