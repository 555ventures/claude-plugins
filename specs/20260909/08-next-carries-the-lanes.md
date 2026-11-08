---
date: 2026-09-09
status: done
build_base: main
tier: critical           # spec-status.js is a named critical trigger (.claude/rules/spec-pipeline.md § Risk Tiers)
area: session-queue
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 9d244d74fc1e0a0688bb92503f687e6e6119657c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-08-1, AC-20260909-08-2, AC-20260909-08-3, AC-20260909-08-4, AC-20260909-08-5, AC-20260909-08-6, AC-20260909-08-7, AC-20260909-08-8, AC-20260909-08-9, AC-20260909-08-10]
---

# 🎯 Next carries every startable lane

## Goal

`/spec:status`'s default screen shows every command that can be started right now, not just
the first one. Today the fan-out derivation admits several runnable lanes but the default
`🎯 Next` block prints exactly one of them; the lanes, the `🚦 solo` affordance and the
merge-conflict heads-up only appear under `--all`, inside a `📋 All open work` block that
re-prints the top pick as its first row. After this spec the lane render IS the Next block,
the `📋` header is gone, and `--all` adds only what is genuinely not startable now
(`🕓 after that`, `⛔ blocked`) plus the hygiene catalogue. `--next`, `--next --json`,
`--json`, `--pretty` and `--brief NN` are byte-for-byte unchanged. Done means: a host with
two independent unblocked briefs shows both commands on the default screen, and no runnable
work is reachable only by typing a flag.
