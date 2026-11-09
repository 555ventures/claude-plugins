---
date: 2026-11-08
status: done
area: prototype
depends_on: [specs/20261108/01-the-host-declares-its-runtime-once.md]
brief: n/a
architecture: false
breaking: false
text: 7accec4b22c0fe552167239f20eb8029cacab198
acs: [AC-20261108-02-1, AC-20261108-02-2, AC-20261108-02-3, AC-20261108-02-4, AC-20261108-02-5, AC-20261108-02-6]
---

# Every mark proves its claim

## Goal

A session running plugin 8.1.1 fourteen hours after 8.4.0 was installed sees the mismatch on its first step. A prototype on a host with no pin-test config is asked for it at OPEN, once, and cannot reach a contract without it. A `round-done` or `approved` mark that claims a round or an approval that did not happen is refused with the missing proof named.
