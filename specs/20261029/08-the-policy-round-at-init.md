---
date: 2026-10-29
status: done
build_base: main
tier: critical           # edits spec/templates/grounding-contract.md (hash-stamped into every host) and init-gen.js's settings.json permission writes (rules § Risk Tiers)
area: bootstrap
breaking: false
depends_on: [specs/20261029/04-the-four-questions-that-did-not-exist.md]
brief: n/a
spiked: 2026-10-31
open_markers: 0
diff_base: 5684e6bb942c29cbe061fc14b393c440f00a4e64
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-08-1, AC-20261029-08-2, AC-20261029-08-3, AC-20261029-08-4, AC-20261029-08-5, AC-20261029-08-6, AC-20261029-08-7, AC-20261029-08-8, AC-20261029-08-9, AC-20261029-08-10, AC-20261029-08-11]
---

# The policy round at init

## Goal

The standing preferences the plugin imposes on a host today without asking — how git is used,
whether spec tests expire, whether run history is committed, whether the hosted review service
is used, which model runs each dispatched seat, what counts as high-risk — are asked once at
`/spec:init` in two rounds of up to four questions, stored in `.claude/spec.config.json` under
one `policy` block, validated by `/spec:doctor`, and the reviewer seat returns to Fable at low
effort as the block's default. A host that never answers keeps today's behaviour. Done means
every key in the block has one default, one place it is asked, one validator, and (through the
sibling spec 09) one reader; this spec lands the block, the questions, the validator, the
confirm-before-writing step and the reviewer seat, and leaves the system green on its own.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 4, 9, 10, 12,
16, 17, 18, 21. Sibling: specs/20261029/09-the-commands-read-the-policy-block.md (the readers).
