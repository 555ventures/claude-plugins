---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/review.html
breaking: false
depends_on: [specs/20260912/05-the-atlas-answers-to-a-design.md]
depended_on_by: [specs/20260912/07-a-whole-product-note-blocks-the-sign-off.md]
brief: n/a
build_base: main
spiked: 2026-09-12
open_markers: 0
diff_base: 2319dab8d026af5e135b1b2613663639cccaa328
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-06-1, AC-20260912-06-2, AC-20260912-06-3, AC-20260912-06-4, AC-20260912-06-5, AC-20260912-06-6, AC-20260912-06-7, AC-20260912-06-9, AC-20260912-06-10, AC-20260912-06-11, AC-20260912-06-12]
---

# The review page answers to a design, and the page's own promises are pinned again

## Goal

The per-journey review page — the surface an owner actually reviews a product on — carries
**zero executing tests** in this tree. `tests/mocks/review-page.test.js` was deleted whole by the
2026-09-11 expiry sweep when specs/20260906/04 closed, and the vm harness written for
`review.browser.js` was orphaned in `tests/design-atlas.test.js` rather than deleted with it. On
2026-09-12 a full day of UI work landed on that page and `npm test` stayed green at 1112 passing,
because nothing on the page could go red. This spec closes that hole three ways: the page gains a
binding design artifact so a future edit answers to something; the behaviours the reviewer depends
on are pinned by tests that **outlive this spec's close**; and the one real divergence the day left
behind — the rail's "Whole project" count rendered as `0` by the server and silently repaired by the
browser — is fixed at the source. Done means: `design/chrome-mocks/review.html` exists and is cited,
the orphaned harness is a real helper with real tests on it, and specs/20260906/04's two contradicted
promises carry an amendment record instead of standing as text the code disagrees with.
