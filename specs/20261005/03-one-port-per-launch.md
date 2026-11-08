---
date: 2026-10-05
status: done
build_base: design-retool
tier: critical
area: runtime
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
open_markers: 0
diff_base: a49fc94c10140ea76e89696df7bc3d3ce0c1008f
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261005-03-1, AC-20261005-03-2, AC-20261005-03-3, AC-20261005-03-4, AC-20261005-03-5, AC-20261005-03-6, AC-20261005-03-7, AC-20261005-03-8, AC-20261005-03-9, AC-20261005-03-10, AC-20261005-03-11, AC-20261005-03-12, AC-20261005-03-13, AC-20261005-03-14, AC-20261005-03-15, AC-20261005-03-16, AC-20261005-03-17, AC-20261005-03-18, AC-20261005-03-19, AC-20261005-03-20, AC-20261005-03-21, AC-20261005-03-22]
---

# One port per launch

## Goal

The plugin identifies a running host app by a fixed address in two config fields
(`runtime.readyCheck` and `prototype.url`), so a second launch of the same repo — a sibling spec
worktree, an open prototype round, another session — collides with the first or checks the wrong
app (observed: the boot smoke failed `stale-ready` while a prototype held port 3000). After this
spec every launch the plugin starts or asks for gets its own free port: the smoke leg allocates
one and hands it to the host's commands as `PORT`, and the prototype and build drivers allocate
one, print it in the step line and derive the capture address from it. A host whose config still
names a fixed port behaves exactly as today and `/spec:doctor` says so. Done means two launches of
one PORT-reading host run side by side and each is checked on its own address. Release legs are
out of scope (they check a deployed host).
