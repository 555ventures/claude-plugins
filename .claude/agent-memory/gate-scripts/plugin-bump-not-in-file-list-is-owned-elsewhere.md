---
name: plugin-bump-not-in-file-list-is-owned-elsewhere
description: A spec's D9-style plugin.json version-bump row is not this worker's job unless it is literally in the dispatched file list — running plugin-bump.js anyway double-bumps over a concurrent worker's legitimate bump
metadata:
  type: feedback
---

Even when a spec's Decisions table names `node scripts/plugin-bump.js --bump --plugin <name>
--changelog "..."` as the mechanism for its own version bump, do NOT run it unless
`spec/.claude-plugin/plugin.json` (or the relevant plugin's manifest) is actually in the
dispatched file list for this worker. That row is typically assigned to a different worker
(doctrine-author, or the orchestrator itself) even when the same spec's Decisions table
mentions it.

**Why:** on specs/20260908/05, the batch file list was CREATE count-observation.js + MODIFY
review-legs.js + MODIFY release-legs.js — plugin.json was NOT in it. I ran the bump command
anyway (because D9 named it), and the on-disk plugin.json already carried an uncommitted
7.110.0 bump from a concurrent worker with a changelog paragraph describing this exact spec.
My `--bump` call stacked a second bump on top (7.110.0 -> 7.111.0) with a redundant/duplicate
changelog entry, silently clobbering the other worker's legitimate work. I had to manually
reconstruct and rewrite the file back to the pre-existing 7.110.0 state (no `git checkout` —
that's banned for this role) by diffing the entries list plugin-bump.js had shifted.

**How to apply:** before invoking any mechanism named in a Decision/File-Plan row, check
whether the target file is in *my own* dispatched file list. If it isn't, leave it alone even
if the spec's prose or Decisions table describes the exact command to run — another worker (or
the orchestrator) owns that row. If a file already shows unexpected uncommitted changes that
look like legitimate concurrent work (e.g. a changelog paragraph that already matches this
spec), treat that as a sibling worker's in-flight edit, not stale state to overwrite.
