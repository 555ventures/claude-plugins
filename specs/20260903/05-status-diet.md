---
date: 2026-09-03
status: done
tier: critical           # spec-status.js is a named critical trigger (.claude/rules/spec-pipeline.md § Risk Tiers): frozen --root/--next/--json surface
area: session-queue
design: false
breaking: false
depends_on: [specs/20260903/03-pipeline-queue-mechanics.md]
depended_on_by: []
brief: 24
open_markers: 0
diff_base: 90c89d2364043c7fe2fac506fdf76c8b9e142cd7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260903-05-1, AC-20260903-05-2, AC-20260903-05-3, AC-20260903-05-4, AC-20260903-05-5, AC-20260903-05-6, AC-20260903-05-7, AC-20260903-05-8, AC-20260903-05-9]
---

# Status diet — roadmap, one paste, at most three decisions, one footer

## Goal

Amended by: ADR-0014 (specs/20260909/08-next-carries-the-lanes.md retires the named clauses of D1/D4/D5 and AC-20260903-05-1/-2/-5/-7 — see the ADR's Applies to)

`/spec:status` fits one screen and answers one question: what do I paste next. The default
render is exactly four blocks — 🗺️ Roadmap (unchanged), 🎯 Next (the paste line), up to three
⚠️ decide lines (one sentence, one question, one paste each), and a one-line footer. The
anomaly fold, the ⚠️ Anomalies section, the ⚡/🕓/⛔ lane render, the 📡 block and the
headline verdict leave the default screen; the lanes, the blocked list and the hygiene
catalogue live behind `--all`; every hygiene kind lives in `/spec:doctor` check 13. Done
means: on this repo the screen is the acceptance picture in brief 24, and `--json` /
`--next --json` / `--next` are byte-for-byte what they were, plus an additive `audience`
field on anomalies.
