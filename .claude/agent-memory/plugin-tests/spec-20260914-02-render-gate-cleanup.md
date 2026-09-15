---
name: spec-20260914-02-render-gate-cleanup
description: D14 render-gate/design-ac-reconcile deletion sweep — dispatch's "six keys" overcounted, and the AC-20260912-03-7 EXPECTED table needed extra rows dropped beyond the ones named
metadata:
  type: project
---

specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md D14 retired render-gate.js,
render-rules.js, render-capture.js, render-compare.js, render-inventory.browser.js and
design-ac-reconcile.js. Two things the dispatch prompt got slightly wrong, caught only by
running the suite:

1. design-ac-reconcile.js never had a spec/bin/spec-paths key or usage-line entry — only 5
   render-* keys existed in tests/spec-paths.test.js's inventory list, not 6. Don't force a
   6th removal that isn't there.
2. tests/consistency/entrypoints.test.js's AC-20260912-03-7 EXPECTED table pins entry-point
   rows for scripts an EARLIER doctrine repair already touched. Removing only the
   design-ac-reconcile.js/render-gate.js rows the dispatch named left the test red: the live
   spec/entrypoints.json no longer lists components-check.js or design-atlas.js as entry
   points of stage-design.md (components-check.js's only entry point is now
   spec/scripts/genesis-driver.js; design-atlas.js's is spec/commands/atlas.md). Those two
   EXPECTED rows had to come out too, exactly as the dispatch's parenthetical actually said
   ("components-check.js/design-atlas.js/render-rules.js entry points on stage-design.md...
   removed") — read that parenthetical literally, it names real rows to drop, not just
   render-rules.js.

**How to apply:** when a dispatch enumerates "N keys/rows to remove," verify the count against
the live file before trusting it, and re-run the touched test file after every partial edit
(don't assume a single edit round makes it green) — the entrypoints manifest here shifts out
from under EXPECTED tables via loose parallel doctrine edits in the same wave.
