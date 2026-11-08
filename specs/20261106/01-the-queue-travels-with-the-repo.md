---
date: 2026-11-06
status: superseded
area: queue
depends_on: [specs/20261107/01-a-done-spec-is-a-stub.md, specs/20261107/04-the-gate-keeps-every-cited-criterion.md, specs/20261107/05-a-finished-brief-closes-itself.md, specs/20261108/05-a-run-stopped-at-a-cap-resumes.md]
brief: n/a
architecture: true
breaking: true
text: ce41e0059fa2ba7781dd387b3503cf2d867ad0ec
acs: [AC-20261106-01-1, AC-20261106-01-2, AC-20261106-01-3, AC-20261106-01-4, AC-20261106-01-5, AC-20261106-01-6, AC-20261106-01-7, AC-20261106-01-8, AC-20261106-01-9, AC-20261106-01-10, AC-20261106-01-11, AC-20261106-01-12, AC-20261106-01-13, AC-20261106-01-14, AC-20261106-01-15]
---

# The queue travels with the repo

## Goal

Run `git push` on one machine and `git pull` on another, and `/spec:queue list` shows the same items in the same order on both. Parallel lanes keep landing with no extra full-suite gate and no failed fast-forward, an abandoned lane loses no queue item, and no `.git/spec-queue.json` remains after `/spec:migrate`.
