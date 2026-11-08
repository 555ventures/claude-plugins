---
date: 2026-11-02
status: done
tier: standard
area: plan-lock
breaking: false
depends_on: []
brief: n/a
build_base: main
open_markers: 0
diff_base: 262a669e1de8f9c298b9f263cb0f24b24aaafb30
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261102-04-1, AC-20261102-04-2, AC-20261102-04-3, AC-20261102-04-4, AC-20261102-04-5, AC-20261102-04-6, AC-20261102-04-7]
---

# An additive-only Data Model stays standard tier

## Goal

Today any non-empty `## Data Model` forces `tier: critical` at lock, whatever the host's
§ Risk Tiers says, so on a CRUD product nearly every spec pays the critical cost (literal
examples on every AC, spikes, a lock confirmation stop, no env-skip). This spec narrows the
rule to what it was for: a Data Model that only adds (a new table, a nullable or defaulted
column) and leaves existing rows alone may stay `standard` when the spec says so in a
declared grammar, and the lint refuses the declaration whenever the section's own text
contradicts it. Done means: the carve-out lints deterministically, the doctrine states it in
the files an author reads, and every pre-existing lock behaves as before.
