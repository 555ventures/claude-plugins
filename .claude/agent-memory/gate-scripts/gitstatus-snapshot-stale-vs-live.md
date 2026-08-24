---
name: gitstatus-snapshot-stale-vs-live
description: The conversation-start gitStatus block can be stale by the time you read a file — a target script had uncommitted prior-session work not reflected in that snapshot
metadata:
  type: feedback
  reviewed: 2026-08-24
---

The `gitStatus` block injected at conversation start is a snapshot, not live state — it explicitly says so, but it's easy to trust it as "what's currently modified." On a 2026-08-20 extraction task in `block-cross-worktree-writes.sh`, the snapshot showed the file clean, yet the file I actually Read already contained a full uncommitted hardening pass (a marker-forgery fix) that wasn't in `HEAD` (`git show HEAD:<path>` proved it absent). The working tree had moved between the snapshot and my read.

**Why:** trusting the snapshot would have made `git diff` against `HEAD` look like *my* change included a huge unrelated block, muddying the "confirm bit-identical extraction" evidence the task demanded.

**How to apply:** when a task claims a file is "just-hardened" or otherwise implies recent uncommitted work, don't lean on the conversation-start `gitStatus` text — run `git status --short -- <path>` and `git show HEAD:<path>` yourself before trusting what's committed vs. working-tree-only. When reporting a diff of your own edit, diff against the pre-edit content you actually read (save it to a temp file first), not blindly against `HEAD`, or an unrelated prior session's uncommitted work will show up as if it were yours.
