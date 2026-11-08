---
date: 2026-11-07
status: done
area: run
depends_on: [specs/20261107/03-this-repos-size-check-counts-bytes.md, specs/20261107/04-the-gate-keeps-every-cited-criterion.md, specs/20261107/05-a-finished-brief-closes-itself.md]
brief: n/a
architecture: true
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261107-01-1, AC-20261107-01-2, AC-20261107-01-3, AC-20261107-01-4, AC-20261107-01-5, AC-20261107-01-6, AC-20261107-01-7, AC-20261107-01-8, AC-20261107-01-9, AC-20261107-01-10 (pin p3)]
---

# A done spec is a stub; history holds its text

## Goal

A finished spec stops being a 24 KB file nothing reads: at the merge it becomes a stub that keeps what the pipeline derives from (frontmatter, title, goal, AC ids) and a `text:` sha for the rest, in its own trunk commit. A fix on it reads the full text from history. The first sweep stubs this repo's 317 finished specs and with them the `[retired:]` tags; the planner and the reviewer are no longer sent to old spec bodies.
