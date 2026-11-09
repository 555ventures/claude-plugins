---
date: 2026-11-08
status: done
area: host
depends_on: [specs/20261108/01-the-host-declares-its-runtime-once.md]
brief: n/a
architecture: true
breaking: false
text: 9132fd986147c7cb83b1975f4313cb1826dbc1b6
acs: [AC-20261108-04-1, AC-20261108-04-2, AC-20261108-04-3, AC-20261108-04-4, AC-20261108-04-5]
---

# The session reaps what it started

## Goal

After `/exit`, no process carrying the session's `CLAUDE_PID` is alive; after a land, a park, a prototype `closed` or a fanout discard, no process tagged with or running from the removed worktree is alive; after a SIGKILLed session, the next SessionStart in the same repo leaves none of its processes under the repo alive. Nothing a live session owns, and nothing outside the repo, is touched by a sweep.
