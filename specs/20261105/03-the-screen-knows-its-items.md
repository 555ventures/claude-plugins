---
date: 2026-11-05
status: superseded
superseded_by: specs/20261105/05-the-v7-screen-on-v8.md
area: status
depends_on: [specs/20261105/02-lanes-that-wait-for-each-other.md]
brief: n/a
architecture: true
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-03-1, AC-20261105-03-2, AC-20261105-03-3, AC-20261105-03-4, AC-20261105-03-5, AC-20261105-03-6, AC-20261105-03-7, AC-20261105-03-8, AC-20261105-03-9, AC-20261105-03-10, AC-20261105-03-11, AC-20261105-03-12, AC-20261105-03-13, AC-20261105-03-14, AC-20261105-03-15]
---

# The screen knows its items

## Goal

`/spec:status` on niko-hub prints the screen JJ used under v7 — `✅ 02b–02c done (2 briefs, 3 specs)`, `q70   /spec:plan service_type CHECK …`, every `after`-gated item under `⛔ blocked:` with `⏳ after brief 03`, `🟢 next is ready · 13 more open` — byte-for-byte with v7's real script on the restored v7 copy, minus two `📈` lines and a release clause JJ never saw. On shop-bltr the seven open `brief: n/a` specs are on the default screen, the four being built in lane worktrees first, as `/spec:run @…` entries, with no `/spec:fanout` line in front of them.
