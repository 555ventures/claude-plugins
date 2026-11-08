---
date: 2026-09-04
status: done
tier: critical
area: replay
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 9406d14e741210226d840f8d98f2362ced20c16c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260904-02-1, AC-20260904-02-2, AC-20260904-02-3, AC-20260904-02-4, AC-20260904-02-5, AC-20260904-02-6, AC-20260904-02-7, AC-20260904-02-8, AC-20260904-02-9, AC-20260904-02-10, AC-20260904-02-11, AC-20260904-02-12, AC-20260904-02-13]
---

# Worktree include: one shared owner for the `.worktreeinclude` copy step

## Goal

`git worktree add` materializes tracked files only, so a host whose app boots from gitignored
env files (the `.worktreeinclude` manifest names them) boots env-less in any worktree the
pipeline creates. The build worktree path already copies the manifest's matches; the replay
harness's scratch worktree does not, so on every such host every replay run dies at the
setup gate or the smoke leg for a reason that has nothing to do with the reviewer being
measured (UpWell `rp_8d26b38255a6`, 2026-09-04: smoke failed on missing `app/.env.local`;
hand-copying the two declared files made it pass, unchanged otherwise). Done means: one
script owns "copy the manifest's gitignored matches into this worktree", both worktree
creation paths call it, a host with no manifest behaves exactly as today, and a test pins
each path through the owner so they cannot drift apart again.
