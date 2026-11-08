---
date: 2026-11-02
status: done
tier: critical
area: delegated-stops
breaking: false
depends_on: []
brief: 32
spiked: 2026-11-02
open_markers: 0
diff_base: bbbdc63b66bdc8ec0074239ef704d4faf5548962
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261102-02-1, AC-20261102-02-2, AC-20261102-02-3, AC-20261102-02-4, AC-20261102-02-5, AC-20261102-02-6, AC-20261102-02-17, AC-20261102-02-7, AC-20261102-02-8, AC-20261102-02-9, AC-20261102-02-18, AC-20261102-02-10, AC-20261102-02-11, AC-20261102-02-19, AC-20261102-02-12, AC-20261102-02-13, AC-20261102-02-14, AC-20261102-02-15, AC-20261102-02-16]
---

# A delegated driver stops on disk

## Goal

A build or review driver that runs inside a Claude Code sub-agent has no AskUserQuestion tool, yet
today every judgment stop prints `Ask ONE AskUserQuestion` and leaves the sub-agent to improvise.
After this spec, a driver that detects a child session writes the question to one file at the
lane's repo root — question, options with consequences, recommended pick, the resume command per
option — prints a `PENDING_QUESTION` stop and exits; a bare re-run prints the resume step once the
file carries an answer, prints STOP when it carries a dismissal, and waits otherwise. A delegated
review also stops at `MERGE_READY` instead of printing the merge mark, so a parent session merges
from the main root. The same file shape serves `/spec:run`'s Step 0 and `/spec:fix`'s three asks,
and `question-style-gate.js` can check the file the way it checks a live call. Done means a session
that never delegates is byte-for-byte unchanged, and a sub-agent running any driver can only ever
hand a question up, never answer it.
