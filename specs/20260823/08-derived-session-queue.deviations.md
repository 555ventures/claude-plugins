# Deviations — specs/20260823/08-derived-session-queue.md

- D12 named 7.28.0 as the plugin.json version-bump target, but 7.28.0 was already taken by a
  concurrent same-day incident fix (prose-cap.js entry-regex fix) landed at HEAD before this
  spec's build ran. Per this repo's rules § Gotchas ("a spec Decision naming a literal
  version-bump target can be stale by build time"), the doctrine worker bumped to the next
  free version, 7.29.0, keeping the same changelog paragraph content and dropping the oldest
  (7.26.0) entry per the last-3 rolling-window rule. Verified `spec/.claude-plugin/plugin.json`
  was at 7.28.0 on disk before writing; no other file names the literal 7.28.0 target.

- D6 says "Reconcile on every spec-queue invocation (writes)" without naming which
  subcommands count. D7 draws the line for seeding ("happens ONLY on an explicit spec-queue
  write subcommand"); the scripts layer applies the same write/read split to reconcile-insert
  too — `next/add/bump/defer/done/ok` reconcile-and-persist before their own action; `list`/
  `hello` never write or reconcile-insert, reading only the file's real on-disk contents (D8's
  "the hook never creates the file" extended in spirit to "never writes at all"). Rationale:
  a SessionStart hook (hello, fired on every session open) mutating the shared git-common-dir
  queue file as a side effect of a passive read felt like the wrong default with no AC forcing
  either reading, and this keeps `list`/`hello` fully read-only.

- D6's reconcile-insertion algorithm doesn't state whether a fully-done on-disk brief still
  gets inserted (only D7's seeding explicitly says "non-done briefs"). Scripts layer applies
  the same non-done filter to reconcile as to seed, so a completed brief is never auto-placed
  into the queue as a perpetual `auto_placed` item — the alternative would have every done
  brief re-appear as an unvetoable "queue-auto-placed" anomaly forever once its dependents
  clear it from `list`'s undone view.

- Neither the spec nor any roadmap file defines a machine-readable "superseded brief" marker
  for D6's "minus superseded briefs, which are derived — never queued" — the roadmap overview
  table's "*(superseded by v7)*" annotations are prose in the Name column, not a per-brief-file
  stamp. `lib/queue.js`'s `isSupersededBriefText` detects it via the blockquote marker that
  every currently-superseded roadmap file (01, 05, 07) already opens its "Why" section with
  ("> **Superseded by ...**"), verified by direct read of those three files 2026-08-23. Without
  this, those three dead-but-unplanned roadmap briefs would be seeded/auto-placed into every
  fresh queue in this repo, and would earn a permanent `queue-auto-placed` anomaly on this
  repo's own dashboard.
- Out-of-File-Plan pin updated in place by the orchestrator: `tests/consistency/entrypoints.test.js`
  holds an exhaustive live-file assertion of hooks.json's script paths ("exactly the four"), which
  D8's SessionStart entry necessarily invalidates. Updated to five with `session-queue.sh` in sorted
  position; AC-20260820-04-5's provenance kept (no invented AC-ID), assertion strengthened not
  weakened. This is the repo's recorded retired/added-literal collision class — the collision-closure
  leg does not sweep literals a spec ADDS to an exhaustive set, only ones it inherits.
