---
date: 2026-11-05
status: done
area: run
depends_on: [specs/20261105/14-the-prototype-is-pinned-in-chat-and-proved-at-look.md]
brief: n/a
architecture: true
breaking: true
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-15-1, AC-20261105-15-2, AC-20261105-15-3, AC-20261105-15-4, AC-20261105-15-5, AC-20261105-15-6, AC-20261105-15-7, AC-20261105-15-8, AC-20261105-15-9, AC-20261105-15-10, AC-20261105-15-11, AC-20261105-15-12, AC-20261105-15-13, AC-20261105-15-14, AC-20261105-15-15, AC-20261105-15-16, AC-20261105-15-17, AC-20261105-15-18, AC-20261105-15-19, AC-20261105-15-20]
---

# The gates prove what they claim

## Goal

A build that did nothing, a plan row that is not on disk and a superseded spec each stop before review, with the reason named. A test that proves nothing is named to the reviewer. No driver commit takes a stray file or a secret into history without saying so. A release cannot print `✅ released` unless staging was green on that commit and production answered after the promote.
