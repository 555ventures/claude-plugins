---
date: 2026-10-16
status: done
build_base: main
tier: standard
area: plan-lock
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 35c25cbaebc51e4bc1efcc11a8aec87eb26b4e46
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261016-01-1, AC-20261016-01-2, AC-20261016-01-3, AC-20261016-01-4, AC-20261016-01-5, AC-20261016-01-6, AC-20261016-01-7, AC-20261016-01-8, AC-20261016-01-9, AC-20261016-01-10]
---

# Lock refuses unjustified restrictions and untracked deferrals

## Goal

A spec's Decisions table can withhold an affordance from a product's users ("cannot edit",
"write-once", "only a Manager may archive", "requires a reason") without naming the failure the
restriction prevents, and can defer work ("in a later spec", "not offered now") into a cell no
queue ever reads. Both lock green today because a refusal is the cheapest Decision to write.
After this spec, `/spec:plan`'s lock runs one deterministic script, `decision-lint.js`, that
refuses to lock a restrictive row unless it carries `[guards: <text found in the host's rules
§ Risk Tiers>]` or `[asked: <what the user chose>]`, and refuses a deferral row unless it cites
a queue id that `spec-queue show` resolves. Done means: the script exists with the two checks,
its exit codes and findings are pinned by tests against fixture specs, the lock step invokes it,
and the plan ledger row records its counts.
