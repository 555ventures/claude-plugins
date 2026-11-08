---
date: 2026-08-20
status: done
diff_base: a50f14d03b6559b9897f1dabbbb43cac8d23b257
tier: critical
area: replay
design: false
breaking: false
depends_on: []
depended_on_by: []
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-02-1, AC-20260820-02-2, AC-20260820-02-3, AC-20260820-02-4, AC-20260820-02-5, AC-20260820-02-6, AC-20260820-02-7, AC-20260820-02-8, AC-20260820-02-9, AC-20260820-02-10, AC-20260820-02-11]
---

# Replay scratch-tree write access

## Goal

Make the replay mutation worker's sanctioned writes actually pass the cross-worktree write
guard, instead of forcing the bypass the first live run produced. On 2026-08-20 the first
/spec:replay measurement hit a design contradiction: `block-cross-worktree-writes.sh` blocks
every same-repo cross-worktree Write/Edit, and the mutation worker (correctly dispatched from
a main-anchored session, editing the scratch worktree) was blocked — then tunneled the same
write through Bash, tripping an Auto-Mode Bypass warning. The fix: the hook allows a write
whose **target** worktree is a replay scratch tree (identified by the `replay-worktree` marker
the harness already plants in the tree's private git dir), and only that; every other
cross-worktree block stands. Two carried replay-harness gaps close in the same landing unit:
the setup gate's inability to restore away untracked files `setupCommand` generates, and the
reviewer return contract's loose verdict vocabulary.
