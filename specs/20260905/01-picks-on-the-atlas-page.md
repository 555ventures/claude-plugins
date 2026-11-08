---
date: 2026-09-05
status: done
open_markers: 0
tier: standard
area: design
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260905/02-design-review-hub-and-look-stops.md]
brief: n/a
diff_base: 5d36d7618837ae7f80cfd460df09ec82e5a707f7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260905-01-1, AC-20260905-01-2, AC-20260905-01-3, AC-20260905-01-4, AC-20260905-01-5, AC-20260905-01-6, AC-20260905-01-7, AC-20260905-01-8, AC-20260905-01-9, AC-20260905-01-10, AC-20260905-01-11, AC-20260905-01-12]
---

# Picks on the atlas page: candidate groups as a first-class atlas concept, decided on the page, read from disk

## Goal

Every pick stage of the mocks flow — shapes (2–3 candidates), theme directions, and
per-surface variants inside one journey — is a look followed by a decision, and today the
decision is typed: a terminal question after the look, or a chat reply the session interprets.
The served atlas already shows the candidates; it must also take the decision. Done means:
a **look stop** is an on-disk record of candidate groups (`design/mocks/picks.json`, one
validated writer), the served atlas lists every open stop at the top and renders each one **in place**, in the
section its screens already live in, as a compare table — one row per step, one column per
candidate, full cards — with an exclusive one-click **Pick this** per candidate group (one
winner, the rest auto-rejected, re-pickable until the session picks it up) and an optional
why-line after the pick, or **Approve** / **Change** with a note for a single-flow stop; the
control posts to the notes server, which writes the decision to `picks.json`; the notes layer
shows project notes only on the atlas index and per-mock notes only on a mock page, never both
bars at once, and the index's bar hides while the lightbox is open; and `design-atlas.js` exposes its atlas builder
and request handler for the hub spec 02 mounts. Spec 02 opens stops from the pipeline and reads
the decisions back; this spec makes the page able to take them.
