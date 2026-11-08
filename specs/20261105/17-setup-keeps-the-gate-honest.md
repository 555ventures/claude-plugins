---
date: 2026-11-05
status: done
area: setup
depends_on: [specs/20261105/14-the-prototype-is-pinned-in-chat-and-proved-at-look.md]
brief: n/a
architecture: false
breaking: true
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-17-1, AC-20261105-17-2, AC-20261105-17-3, AC-20261105-17-4, AC-20261105-17-5, AC-20261105-17-6, AC-20261105-17-7, AC-20261105-17-8, AC-20261105-17-9, AC-20261105-17-10, AC-20261105-17-11, AC-20261105-17-12, AC-20261105-17-13, AC-20261105-17-14, AC-20261105-17-15, AC-20261105-17-16]
---

# Setup keeps the gate honest

## Goal

On a real host, `init` says the gate is good only when it exited 0. Migrating a v7 host keeps its whole gate, a fresh lane worktree carries the host's gitignored runtime config, and doctor reports what status counts. `/spec:connect` refuses instead of committing a token or overwriting a broken file, and the contract describes the v8 that exists.
