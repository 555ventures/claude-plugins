---
date: 2026-08-14
status: done
diff_base: a15ddb3cd725299ac36a83f05d91e6603b0e150c
open_markers: 0
risk: T3
area: plan-integrity
design: false
breaking: false
depends_on: ["specs/20260814/03-suite-baseline.md"]
depended_on_by: ["specs/20260815/01-recurrence-carriers.md"]
brief: n/a
spiked: 2026-08-14
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260814-05-1, AC-20260814-05-2, AC-20260814-05-3, AC-20260814-05-4, AC-20260814-05-5, AC-20260814-05-6, AC-20260814-05-7, AC-20260814-05-8, AC-20260814-05-9, AC-20260814-05-10, AC-20260814-05-11, AC-20260814-05-12, AC-20260814-05-13, AC-20260814-05-14]
---

# collision-closure.js — the plan-time collateral-damage sweep stops being hand-executed prose

## Goal

Two sweeps are supposed to run before a spec locks: find the tests that pin the files this
spec is about to change, and find the doctrine prose elsewhere that quotes wording this spec
is about to retire. Both live as prose instructions — a `§ Gotchas` bullet in
`.claude/rules/spec-pipeline.md` and one sentence in `/spec:plan`'s obligation→carrier sweep —
hand-executed by the planning session. They have missed three times
(specs/20260813/07 D8, specs/20260813/09 D4, specs/20260814/01's `spec-paths` key-set pin,
which landed out-of-plan and had to be waived at review). This spec makes both sweeps one
script — `spec/scripts/collision-closure.js` — invoked at lock, **advisory listing only**, and
rewrites both prose loci to cite it. Done = the script's exec pins run green, the plan.md and
spec-pipeline.md pins run green, and the four surviving obligation shapes in
`tests/plan-obligation-carrier.test.js` stay green under their retagged regression pin.

**This spec deliberately does not gate anything.** Execution adjudicates collisions, at the
end of the build, via `specs/20260814/03-suite-baseline.md` D10's blocking whole-suite check.
This script exists for what execution cannot deliver: getting the colliding file into the
File Plan *before* work starts (so a batch worker owns the pin edit under TDD discipline
instead of an orchestrator hot-patching it at the gate), and covering the retired-doctrine-
prose class, which has **no execution oracle at any stage** — stale wording quoted in another
command file breaks no test and fails no gate, forever.
