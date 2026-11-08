---
date: 2026-11-05
status: done
area: run
depends_on: [specs/20261105/06-the-client-says-yes.md, specs/20261105/07-a-batch-ends-clean.md]
brief: 33
architecture: false
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-09-1, AC-20261105-09-2, AC-20261105-09-3, AC-20261105-09-4, AC-20261105-09-5, AC-20261105-09-6, AC-20261105-09-7, AC-20261105-09-8, AC-20261105-09-9, AC-20261105-09-10, AC-20261105-09-11, AC-20261105-09-12, AC-20261105-09-13, AC-20261105-09-14]
---

# Fix is a driver and every fix is a lane

## Goal

A fix, in session or as a lane, walks the same steps every time: reproduce, root cause in one sentence, a regression test that fails for that reason, the fix, the gate, one stop only when the fix authored something the client would notice, a fresh review, one `fix(…)` commit. Nothing about it depends on the session following prose. A queued `/spec:fix` item, with or without a spec path, is a lane fan-out picks after the specs, so a queue of runs and fixes drains to empty without a hand. On the trial, the niko-hub harness fix and shop-bltr's three queued fixes would have run as lanes in the next batch.
