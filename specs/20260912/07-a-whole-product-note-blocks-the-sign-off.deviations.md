# Deviations — 07-a-whole-product-note-blocks-the-sign-off

- `design/chrome-mocks/review.html` changed more than D6's one line. D6 asks only that the approve
  block gain the D3 `rv-projwait` paragraph, but that paragraph only ever renders when this journey's
  own screens are clean, and the file's note fixture had two open screen-scoped notes. The doctrine
  worker therefore resolved `n1` and `n2` (screens `a` and `b`), updated the rail counts, board
  badges, open-count and progress text to match, enabled the `Approve journey` control, and kept the
  project-scope `n3` open with its `Looks good` / `Still not right` controls (the literal
  AC-20260912-06-7 pins). Forced: a mock showing the disabled state cannot also show the line the
  spec adds. Unblocking: no test pins this file's bytes, and the served rendering is pinned
  independently by AC-20260912-07-2.
