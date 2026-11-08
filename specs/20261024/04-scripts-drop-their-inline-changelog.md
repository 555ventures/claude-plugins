---
date: 2026-10-24
status: done
build_base: main
tier: standard
area: cross-cutting
breaking: false
depends_on: [specs/20261024/01-review-driver-reads-recorded-facts.md, specs/20261024/02-genesis-marks-and-the-no-stand-ins-test.md, specs/20261024/05-replay-retired.md]
brief: n/a
open_markers: 0
diff_base: 1916b6766f07febc5c1beb9db5a6f16d783b4161
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261024-04-1, AC-20261024-04-2, AC-20261024-04-3, AC-20261024-04-4, AC-20261024-04-5, AC-20261024-04-6]
---

# Scripts drop their inline changelog; prose-size tests retire

## Goal

A quarter of the plugin's script lines are comments, and 82% of sampled comment blocks cite
a spec or decision id rather than explain the code; the two drivers are twice their real
size because of it. Four test files pin doctrine line budgets, frozen heading lists and
specific sentences, which is prose, not behaviour. This spec removes the citations from
whole-line comments while keeping every "why", certified comment-only against the base
commit, and retires the prose-size tests with their pins marked retired in the owning specs.
Done means zero citation tokens in script comments, an unchanged code body, and a green
suite with the four files gone.
