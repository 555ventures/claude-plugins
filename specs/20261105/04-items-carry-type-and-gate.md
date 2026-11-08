---
date: 2026-11-05
status: done
area: queue
depends_on: [specs/20261105/02-lanes-that-wait-for-each-other.md]
brief: n/a
architecture: true
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-04-1, AC-20261105-04-2, AC-20261105-04-3, AC-20261105-04-4, AC-20261105-04-5, AC-20261105-04-6, AC-20261105-04-7, AC-20261105-04-8, AC-20261105-04-9, AC-20261105-04-10, AC-20261105-04-11]
---

# Items carry type and gate

## Goal

After this spec a session can `queue add "fix the login bug"` and `queue next` prints `/spec:plan fix the login bug`; an item added with `--after 03` is skipped by `next` and shown by `list` with `⏳ after brief 03` until brief 03's specs are all done, and fanout never starts a spec whose item is gated. On niko-hub `migrate.js` (plan only) lists the 5 `type` and 13 `after` fills v7's backup holds, so once JJ applies it the queue carries exactly what v7's screen showed. Spec 05 then renders that state as v7's screen.
