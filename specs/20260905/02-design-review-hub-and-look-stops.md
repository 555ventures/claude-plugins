---
date: 2026-09-05
status: done
open_markers: 0
tier: standard
area: design
design: false
breaking: false
depends_on: [specs/20260905/01-picks-on-the-atlas-page.md]
depended_on_by: [specs/20260905/03-candidate-flows-in-a-journey.md]
brief: n/a
diff_base: 411b8d9defb16afbed8125051912dba9b8511d1a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260905-02-1, AC-20260905-02-2, AC-20260905-02-3, AC-20260905-02-4, AC-20260905-02-5, AC-20260905-02-6, AC-20260905-02-7, AC-20260905-02-8, AC-20260905-02-9, AC-20260905-02-10, AC-20260905-02-11, AC-20260905-02-12, AC-20260905-02-13, AC-20260905-02-14, AC-20260905-02-15, AC-20260905-02-16, AC-20260905-02-17, AC-20260905-02-18, AC-20260905-02-19]
---

# Design review hub and look stops: one URL per machine, the driver reads every verdict from disk

## Goal

With picks taken on the atlas page (spec 01), the remaining defect is how the user reaches
the page: today's look stop prints a `node "$(spec-paths design-atlas)" serve` line plus file
paths, `spec-paths` does not exist outside a session, the fixed port collides across projects,
and the served page is per project — the user runs ~10 projects and reviews from a phone or a
desktop browser (ruling 2026-09-04: a look stop prints one verified link, never a command).
Done means: one long-lived hub per machine at one bookmarkable address mounts every registered
project's atlas and mocks under `/p/<name>/`, its front page is an inbox of open look stops
newest first across projects; the mocks driver opens a stop for every look (`shapes`,
`journey:<j>`, `theme`, `review:<j>`, `signoff`), prints exactly the verified link and the
fixed reply line, and every advancing mark that needs a human verdict refuses unless that
verdict is in `picks.json` (written by the page or by `stop decide --by chat`), deriving the
ledger's `rejected` cell from the picked group; `/spec:sketch` and `/spec:atlas` route their
looks through the same hub; the Storybook catalog stop of `/spec:design` is untouched.
