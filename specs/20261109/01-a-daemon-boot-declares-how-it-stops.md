---
date: 2026-11-09
status: done
area: prototype
depends_on: [specs/20261108/01-the-host-declares-its-runtime-once.md]
brief: n/a
architecture: true
breaking: false
text: 2c293835788b596797191bd116a6b30e9e239fef
acs: [AC-20261109-01-1, AC-20261109-01-2, AC-20261109-01-3, AC-20261109-01-4, AC-20261109-01-5, AC-20261109-01-6, AC-20261109-01-7]
---

# A daemon boot declares how it stops

## Goal

On a host whose `runtime.bootCommand` starts a server that leaves the process group and drops `SPEC_APP`, then exits 0, with `runtime.stopCommand` set: `app.start` returns once the url answers, `app.ensure` keeps that app, a GATE restart and `app.stop` run `stopCommand`, and afterwards nothing answers at the url. The same host without `stopCommand` gets exit 2 naming it at the first boot, instead of an app the driver can neither see nor stop.
