---
date: 2026-11-10
status: done
area: prototype
depends_on: []
brief: n/a
architecture: true
breaking: false
text: 950ea48df540c76899f9d501625dbcafdcb3bc68
acs: [AC-20261110-01-1, AC-20261110-01-2, AC-20261110-01-3, AC-20261110-01-4, AC-20261110-01-5]
---

# A daemon record proves its url

## Goal

On a daemon host, `app.alive` is true for a `stopCommand` record only while no later start kept a record at the same url, so a prototype that lost its url to a GATE or another lane restarts (and is refused as foreign) instead of showing that app. A prototype refused at OPEN for having no `stopCommand` keeps its worktree, so "run that command once in <wt>, then re-run" works as written.
