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

- Repair round (2026-08-23), out-of-File-Plan: `node spec/scripts/spec-queue.js next` failed with
  "spec-status.js --json produced unparseable output" against this repo's live ~75 KB dashboard
  JSON. Root cause was a PRE-EXISTING latent defect in `spec/scripts/spec-status.js`, not a bug
  introduced by this spec — `console.log(...)` immediately followed by `process.exit(0)` is unsafe
  because Node's stdout write is asynchronous to a pipe, so `process.exit` tore the process down
  mid-flush and silently truncated output at the 64 KiB pipe buffer while still exiting 0 (confirmed
  present in the pre-spec commit `89978d3a85682e2169c33069948d0a981557c38e`). It was latent because
  no programmatic `--json` consumer of spec-status.js existed since the autopilot lane's deletion
  (this spec's own assumption A4) — spec-queue.js is the first one, so this spec's new consumer
  surfaced a dormant defect rather than causing it. Fixed by adding a synchronous `writeOut()`
  helper (`fs.writeSync` on fd 1, looped for partial writes, retried on EAGAIN) and routing the
  three `process.exit(0)`-adjacent `console.log` sites (`--next --json`, `--next` human, dashboard
  `--json`) through it; JSON content, key order, and the `--root/--next/--json` CLI shape are
  byte-identical (D11 frozen-API constraint honored). Verified: the reproducer now reports the full
  74,965-byte payload (was truncated at 65,536) and parses; `spec-queue.js next` completes; the seeded
  `.git/spec-queue.json` was deleted after verification; `tests/status/*`, `tests/spec-status.test.js`,
  `tests/queue/*`, and the full `npm test` (717 tests) are green.

- Out-of-File-Plan, incident regression pin: added two tests to `tests/queue/queue-overlay.test.js`
  ("spec-status.js --json survives a real pipe intact..." and its `--next --json` twin) pinning
  the console.log()-then-process.exit() pipe-truncation fix from the repair round above. No
  AC-ID — this is a defect regression, not an acceptance criterion, per this repo's convention
  against inventing placeholder AC-IDs for non-AC pins. Each builds a synthetic host large enough
  (320 briefs/specs with File Plan tables) that the emitted JSON measurably exceeds the 64 KiB
  pipe buffer, verified via a synchronous file-redirect run as ground truth against a real piped
  child-process run. Empirically verified both tests fail against the pre-fix script (reconstructed
  from commit `89978d3a85682e2169c33069948d0a981557c38e` plus its sibling `lib/*.js` files at that
  commit) — piped stdout truncates at exactly 65536 bytes of 283788/80362 full bytes, and
  `JSON.parse` fails on the truncated tail — confirming the pins discriminate.
