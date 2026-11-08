---
date: 2026-09-05
status: done
open_markers: 0
tier: standard
area: design
design: false
breaking: false
depends_on: [specs/20260905/02-design-review-hub-and-look-stops.md]
depended_on_by: [specs/20260905/03-candidate-flows-in-a-journey.md]
brief: n/a
diff_base: 08118416e214cfdaa2cb77aa65cf093a3a949aec
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260905-04-1, AC-20260905-04-2, AC-20260905-04-3, AC-20260905-04-4, AC-20260905-04-5, AC-20260905-04-6, AC-20260905-04-7, AC-20260905-04-8, AC-20260905-04-9]
---

# Per-project look server: delete the machine-wide hub, serve only while a look needs it

## Goal

Spec 02 shipped a machine-wide daemon (`design-hub.js`: a registry under `~/.claude/design-hub/`,
a pid file, `ensure`, a cross-project inbox, `/p/<name>/` mounting, a phone `base`). The user
rejected that shape on 2026-09-05: "individual project should handle this, only run when needed,
I don't want something running 24/7 for no reasons, that's waste." Done means: nothing resident
on the machine; every look stop is served by that project's own `design-atlas.js serve`, started
by the session as a tracked background task at the first look of a run and stopped when the run
signs off or the session ends; `stop open` / `stop decide` / `stop list` live on the atlas script
(no status.json side effects, so `/spec:sketch` can use them) and the mocks driver's `stop open
<step>` delegates there; the link is `http://localhost:<port>/atlas/index.html#stop-<id>`; the
hub script, its `spec-paths` key, its entrypoints row, its tests, its doctrine section and its
canonical paragraph are gone; everything the user kept — picks on the page, the two-line
hand-off, marks that refuse without a decided stop, the derived `rejected` cell — is byte-identical.
