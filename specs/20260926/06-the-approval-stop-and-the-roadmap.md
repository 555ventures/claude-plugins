---
date: 2026-09-26
status: done
build_base: design-retool
tier: standard
area: genesis
breaking: false
depends_on: [specs/20260926/05-the-kit-and-the-journey-stories.md]
depended_on_by: []
brief: 30
spiked: 2026-09-26
open_markers: 0
diff_base: 3c076c7612c3d3705164cc1d378160308e3c1fea
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260926-06-1, AC-20260926-06-2, AC-20260926-06-3, AC-20260926-06-4, AC-20260926-06-5, AC-20260926-06-6, AC-20260926-06-7, AC-20260926-06-8]
---

# The approval stop and the roadmap

## Goal

Genesis stops for JJ once the journey stories exist: the driver verifies that Storybook is serving
every journey story, prints one look stop with a verified URL per journey, and resumes on JJ's
literal `approve`, which freezes the designed set into `docs/design/approval.json`. The roadmap
then derives from that designed set — the ROADMAP step lists the approved journeys and their
screens, and `roadmap-written` places every designed screen in exactly one brief — and the
wireframe's approval record is never read again after the design brief. Journey stories are a
genesis artifact: frozen at approval, never gated afterwards; the composites' state stories are
the living showcase. Done means: on the fixture host, the approval stop refuses to print a URL
while Storybook is down, prints the stop once the index serves the journeys, `design-approved`
writes the record, and ROADMAP's placement check reads screens from it.
