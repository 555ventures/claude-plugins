---
date: 2026-11-08
status: done
area: run
depends_on: []
brief: n/a
architecture: true
breaking: false
text: 4d10f049c5552367344301e6b2b6d6fe6566419e
acs: [AC-20261108-05-1, AC-20261108-05-2, AC-20261108-05-3, AC-20261108-05-4, AC-20261108-05-5]
---

# A run stopped at a cap resumes

## Goal

A spec's run stopped at any cap keeps its worktree and its run state. After `/spec:plan <spec>` re-locks the spec with changed text, the next driver run rebases that worktree, gates and reviews it against the new text and lands it, with no hand-made tag, no removed worktree and no queue item left open for the stop.
