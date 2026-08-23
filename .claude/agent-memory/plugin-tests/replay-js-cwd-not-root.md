---
name: replay-js-cwd-not-root
description: spec/scripts/replay.js (specs/20260819/02-mutation-replay.md) has no --root flag in any Decision's exhaustive flag list — tests invoke it via runNode(SCRIPT, argv, {cwd: dir}), not --root <dir>.
metadata:
  type: project
  reviewed: 2026-08-23
---

specs/20260819/02-mutation-replay.md's Decisions D2/D3/D8 (--due/--select/--record) give exhaustive-looking bracketed flag lists (e.g. D8: `--record --spec … --review-run-id … --class … --file … --legs green|red:<leg> --outcome caught|missed|leg-caught [--patch <file>] [--workflow <file>] [--tokens N]`) and none of them include `--root`, unlike every sibling script in this repo (merge-back.sh, scope-reconcile.js, review-legs.js, spec-status.js all take an explicit `--root <dir>`).

I treated the Decisions table as authoritative per the worker contract and did NOT add an unlisted `--root` flag. tests/replay/replay.test.js instead points the script at a synthetic host by passing `{ cwd: dir }` as the third `runNode` arg (spawnSync's cwd option) for the ledger-reading modes (--due/--select/--record/--stats), and passes explicit `--dir <path>` (never --root) for the worktree modes (--setup/--apply/--teardown), matching D4/D5's flag lists exactly. AC-3's "inside the repo" refusal is exercised by running with `cwd: syntheticRepoRoot` and an insideDir under it — never against the real claude-plugins repo.

**Why:** the Decisions table is locked and workers apply it verbatim — adding an extra required-looking flag not in the list would itself be an unauthorized override, and the flag lists here read as deliberately complete (bracketed optionals spelled out one by one), not shorthand.

**How to apply:** whoever implements spec/scripts/replay.js (gate-scripts agent) must resolve the repo/ledger root via `process.cwd()` (and `git rev-parse --show-toplevel` from cwd for the repo-boundary check in --setup/--teardown), not via a --root flag, or every test in tests/replay/replay.test.js breaks on a flag-shape mismatch. If a build worker discovers this reading is wrong (e.g. review pushes back), the fix is to update both the script AND this test file's invocation style together — never add --root support without also re-deriving whether the Decisions table's flag lists were meant to be exhaustive.
