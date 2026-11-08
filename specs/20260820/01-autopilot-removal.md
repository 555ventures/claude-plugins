---
date: 2026-08-20
status: done
tier: standard
diff_base: ba9faae412b82148c8dab05d0ccfe9b545692e60
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: []
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-01-1, AC-20260820-01-2, AC-20260820-01-3, AC-20260820-01-4, AC-20260820-01-5]
---

# Autopilot removal

## Goal

Delete the parked autopilot daemon — source, tests, marketplace entry, and every live rule
carve-out that existed only for it — so the repo's dependency-free invariant becomes absolute
and no session is ever steered toward autopilot work again. JJ ruled the product a failure
(2026-08-18, confirmed 2026-08-20); the runtime block was already flipped to inert and the
smoke pin rewritten (commit ba9faae). Done means: no `autopilot/` directory, no
`@anthropic-ai/claude-agent-sdk` reference in any tracked runtime/rule surface, the two
regression pins that outlive autopilot relocated and still green, and the full suite green
with zero skips.
