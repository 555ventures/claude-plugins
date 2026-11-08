---
date: 2026-10-08
status: done
build_base: main
open_markers: 0
tier: standard
area: doctrine
breaking: false
depends_on: [specs/20261008/01-doctrine-states-contracts-and-points-at-its-enforcers.md]
brief: n/a
diff_base: 6620ceada2ce21d0f398cb2e5a956f24b771968b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261008-02-1, AC-20261008-02-2, AC-20261008-02-3, AC-20261008-02-4, AC-20261008-02-5, AC-20261008-02-6, AC-20261008-02-7]
---

# Commands state their steps and point at their scripts

## Goal

The fourteen command files under `spec/commands/` shrink to what a session needs to act: the
script to run, its flags, the order, how to render its output, and the judgments only the
session can make. Every paragraph that restates what a script, driver or hook already does
becomes a one-line pointer at it, and the behavioural guidance in `init.md` that a spike proved
nothing pins or guards is deleted. Nothing is rewritten, every `## ` heading and every numbered
step or check keeps its number, and every script invocation the entrypoints manifest declares
survives. Done means: each command at or under its ceiling, `read-load.test.js`'s per-command
budgets lowered to the new measured values, the entrypoints and wiring pins green, and no
assertion weakened.
