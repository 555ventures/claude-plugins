---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/review.html
breaking: true
depends_on: [specs/20260912/06-the-review-page-answers-to-a-design.md]
depended_on_by: []
brief: n/a
build_base: main
open_markers: 0
diff_base: 1c97c4cd5d030d09002d5c92b0f671b6893647e7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-07-1, AC-20260912-07-2, AC-20260912-07-3, AC-20260912-07-6, AC-20260912-07-4]
---

# A whole-product note blocks the sign-off, not every journey

## Goal

A note filed against the whole product — "the navigation is wrong everywhere", raised from the notes
layer's own composer — currently blocks the approval of **every journey**, on the page and at the
command line alike. On a real project (Hearwell, 2026-09-12) four such notes made all five journeys
unapprovable regardless of whether any of them had anything to do with the note, and the only way
forward was to resolve a product-wide question before any per-journey review could close. The owner
ruled on 2026-09-12: a whole-product note blocks the **final sign-off**, and each journey approves on
its own screens' notes alone. Done means the page, the driver and the doctrine all say that, the page
tells the owner what is still waiting when a journey is clean but the product is not, and the locked
decision this overturns carries an amendment record.
