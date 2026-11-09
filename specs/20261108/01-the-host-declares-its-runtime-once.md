---
date: 2026-11-08
status: done
area: prototype
depends_on: [specs/20261107/01-a-done-spec-is-a-stub.md]
brief: n/a
architecture: true
breaking: true
text: 11af038b8973e024d00fd9a54e3ba00b88a81136
acs: [AC-20261108-01-1, AC-20261108-01-2, AC-20261108-01-3, AC-20261108-01-4, AC-20261108-01-5, AC-20261108-01-6, AC-20261108-01-7, AC-20261108-01-8]
---

# The host declares its runtime once

## Goal

On a host whose config says `runtime: {bootCommand, readyCheck}` and nothing under `prototype` but `e2eFile`/`e2eCommand`, `/spec:prototype` opens, boots the app itself, prints the ready line only when the host's own ready check passes, and `closed` leaves no process behind; `/spec:run` boots the same way for pin tests and LOOK and stops it at the end. Config with `prototype.bootCommand` refuses every command naming `/spec:migrate`, which moves it.
