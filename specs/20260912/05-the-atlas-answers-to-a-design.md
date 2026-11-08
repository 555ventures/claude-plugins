---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/atlas.html
breaking: false
depends_on: []
depended_on_by: [specs/20260912/06-the-review-page-answers-to-a-design.md]
brief: n/a
build_base: main
open_markers: 0
diff_base: f0a9d25ad70dd113d1a5f9c6fac4ad2009df068e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-05-1, AC-20260912-05-2, AC-20260912-05-3, AC-20260912-05-4, AC-20260912-05-5, AC-20260912-05-6]
---

# The atlas answers to a design, and a screen appears on it once

## Goal

The design atlas — the page that shows a whole product's screens at a glance — has never had a
design source. Fifty-four specs have edited it and not one carried a `design_source`, so every
change to it has been an opinion with nothing to answer to, and on 2026-09-12 that finally produced
a page the owner called unusable. The same day's repair changed a promise no test was watching: the
atlas used to stack one full-size frame per declared state, which made a nine-state screen nine
screens tall, and it now renders one frame per screen with the state count in the card's meta line.
specs/20260902/07 D15 still promises the old shape. Done means: the atlas binds to
`design/chrome-mocks/atlas.html`, the doctrine sentence that calls plugin chrome "a designed
surface" names the artifacts it binds to, the frame-per-screen rule and the two navigation
behaviours the repair introduced are tested, and the contradicted promise carries an amendment
record instead of standing as text the code disagrees with.
