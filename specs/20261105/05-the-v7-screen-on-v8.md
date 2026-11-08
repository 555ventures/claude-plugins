---
date: 2026-11-05
status: done
area: status
depends_on: [specs/20261105/04-items-carry-type-and-gate.md]
brief: n/a
architecture: true
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-05-1, AC-20261105-05-2, AC-20261105-05-3, AC-20261105-05-4, AC-20261105-05-5, AC-20261105-05-6, AC-20261105-05-7, AC-20261105-05-8, AC-20261105-05-9, AC-20261105-05-10, AC-20261105-05-11, AC-20261105-05-12, AC-20261105-05-13, AC-20261105-05-14, AC-20261105-05-15]
---

# The v7 screen on v8

## Goal

`/spec:status` on niko-hub prints the screen JJ used under v7 — `✅ 02b–02c … done (2 briefs, 3 specs)`, `q70   /spec:plan service_type CHECK …`, spec 10 as a `/spec:run` line with `🚦 solo`, spec 06 and q94/q95/q111/q113 under `⛔ blocked:` with `⏳ after brief NN`, two `[skipped-spec]` hygiene lines — and on shop-bltr `⚡ 6 parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):` with the four lanes being built first and eight `🔶` pair lines, q49 with `/spec:plan`, q50 and q52 under `⛔` with `⏳ after …`. No `/spec:fanout` line, no fence from the script, no `📈` line. The proof is v7's own script: same bytes on the fixture hosts.
