---
date: 2026-08-23
status: done
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: c61802b8dd503c1a8b6a000d270d2719dcae2acf
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-04-1, AC-20260823-04-2, AC-20260823-04-3, AC-20260823-04-4, AC-20260823-04-5, AC-20260823-04-6, AC-20260823-04-7, AC-20260823-04-8, AC-20260823-04-9, AC-20260823-04-10]
---

# Review-close hardening: frontmatter comments, merge re-entrancy, agent-memory scope

## Goal

Fix the three pipeline defects surfaced at the 2026-08-23 close of specs/20260823/01
(rv_6825fa48c98d): (1) frontmatter values with inline `#` comments flow verbatim into the run
ledger and every git consumer — one shared reader that strips them per YAML unquoted-scalar
semantics ends the class; (2) the review driver's merge step is not re-entrant — a retry after a
mid-promotion failure deadlocks on its own promoted evidence, and the promotion step itself
guarantees the cleanup failure by deleting a tracked file in the worktree; (3)
`.claude/agent-memory/**` is structurally out-of-plan on every worker-dispatching build. Done
means: a commented `tier:`/`build_base:` line parses clean everywhere, a wedged merge retry
completes instead of dying, and worker memories never raise an out-of-plan finding again.
