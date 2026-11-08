---
date: 2026-11-06
status: done
area: init
depends_on: []
brief: n/a
architecture: false
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261106-04-1, AC-20261106-04-2, AC-20261106-04-3, AC-20261106-04-4, AC-20261106-04-5, AC-20261106-04-6]
---

# Older projects lose the lint gap

## Goal

A project set up before the lint fix, where a failed check still passes the gate, learns it from `/spec:doctor` and is repaired by re-running `/spec:init`; setup leaves every hand-written command alone, runs idempotently, and a command ending in a shell comment still groups into a command the shell runs.
