---
date: 2026-09-05
status: done
tier: standard
area: design-render
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260905/06-plugin-owned-capture-at-approval.md]
brief: n/a
spiked: 2026-09-05
open_markers: 0
diff_base: 234301e30c975d26abb065ed30cc124cdefc6697
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260905-05-1, AC-20260905-05-2, AC-20260905-05-3, AC-20260905-05-4, AC-20260905-05-5, AC-20260905-05-6, AC-20260905-05-7, AC-20260905-05-8, AC-20260905-05-9]
---

# Desktop fill as a rendered rule (`desktop-fill` + `data-narrow`)

## Goal

A mock whose content stays at phone width on the widest declared viewport passes every
rendered check today: `no-overflow` sees nothing past the edge and `line-length` sees only
short lines. Hearwell's client shell is the measured case — a 430px column centred at 1440px,
26–28% of the viewport on 15 of 31 mocks, ratifiable clean; JJ's ruling 2026-09-05: "it should
be responsive". Done means: `render-rules.js` gains a `desktop-fill` check kind that measures
how much of the viewport a mock's in-flow content spans at wide cells and fails a phone-width
column unless the mock's root declares `data-narrow`; the shipped rules template carries the
rule; and the canon template asks each shell what it does at every declared viewport before
the first screen is drawn. Where the rule *runs* for hosts with no capture command is the
sibling spec 06's job — this spec lands the measurement and the doctrine, green on its own.
