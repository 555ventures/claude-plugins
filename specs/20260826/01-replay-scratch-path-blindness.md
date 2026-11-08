---
date: 2026-08-26
status: done
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-26
diff_base: ef59519cae4d39e27e25343310d68684e78bdd17
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260826-01-1, AC-20260826-01-2, AC-20260826-01-3, AC-20260826-01-4, AC-20260826-01-5, AC-20260826-01-6, AC-20260826-01-7]
---

# Replay scratch worktree: spec-derived path and neutral marker

## Goal

The mutation-replay harness (`/spec:replay`, run by `/spec:review`'s REPLAY state) measures
whether the blind reviewer catches a planted defect — and its own doctrine says blindness is
the measurement's validity. Today the harness hands the reviewer a root path named after the
harness (`.claude/worktrees/replay-<random>`, a doctrine *example* nothing derives or
enforces) and plants a marker file named after the harness (`replay-worktree`) in the scratch
tree's private git dir, one `ls "$(git rev-parse --git-dir)"` away. Both were observed from
inside a real `--setup` tree on 2026-08-26. Done means: `--setup` derives a build-shaped path
from the target spec itself, refuses any caller path that announces the harness, the marker
carries a neutral name across every site that reads it, the blindness rule names the path as
a surface, and tests pin all of it — so the catch rate is a defensible number from the first
post-fix row onward.
