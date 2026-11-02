---
name: writesync-loop-and-config-exists-export
description: fs.writeSync(1,...) needs a while-loop for the 64KB-pipe fix (partial writes are real), and lib/host-config.js's configExists(root)/configPath(root) are the sanctioned routes out of the config-name ban (never name spec.config.json under spec/scripts/)
metadata:
  type: feedback
  reviewed: 2026-11-01
---

Two reusable patterns from fixing spec/scripts/fleet-reader.js (2026-08-20, JJ-dispatched review-fix batch):

**Superseded (specs/20261101/10-one-writer-and-no-copies-left.md): never hand-roll the
`fs.writeSync` loop this note once recommended for fleet-reader.js.** Every payload write under
`spec/scripts/` goes through `lib/sync-write.js`'s `writeOut` (partial-write loop, EAGAIN retry,
EPIPE treated as done so `| head` no longer exits 1); a standing sweep in
`tests/ceiling/sync-write-callers.test.js` reds any other file containing `writeSync(`. Falling off
the end instead of a trailing `process.exit(0)` still holds.

**`lib/host-config.js` exports `configExists(root)`, `configPath(root)`, and `CONFIG_RELPATH`**
(superseding the short-lived `configPathFor` export, retired 2026-08-20 by
specs/20260820/08-config-name-ban.md — do not reach for that name, it no longer exists).

`tests/host-config/config-read.test.js` now bans **naming** the config rather than trying to detect
reads: any line under `spec/scripts/` containing the literal stem `spec.config` outside a comment is
an offender, at any depth, with no extension filter. Exactly three paths are exempt —
`lib/host-config.js`, `smoke.sh`, `spec-state-gate.sh` — as a closed literal list, so a new script
cannot join it by existing. That means you may not write `path.join(dir, '.claude', 'spec.config.json')`,
string-concat around it, hoist the filename to a constant, or `jq` it from bash: all four are red.

The three sanctioned routes, one per legitimate reason to care about the file:

- `configExists(dir)` — presence only, never opens or parses. Use for discovery/gating (this is what
  `fleet-reader.js` uses). A directory occupying the path returns true; if you need readability, read.
- `configPath(dir)` — the path builder, when you genuinely need the path itself.
- `CONFIG_RELPATH` — the string `.claude/spec.config.json`, for **user-facing remedy text only**,
  never for building a path. Interpolate it into error messages so there is one spelling repo-wide.

Reach for these before writing any new config gate. If none of the three fits, the ban is doing its
job: add the export to `lib/host-config.js` rather than naming the file in your script.

Why: JJ dispatched this as a batch of six pre-diagnosed, execution-reproduced defects (truncation,
crash-on-unreadable-file, silent-lie-on-unreadable-dir, unguarded root readdir, float rounding,
sweep evasion) with exact fix instructions per defect — a good template for how detailed a
gate-scripts fix dispatch from this user looks when the defects are already fully diagnosed.

How to apply: route any large `--json` payload through `lib/sync-write.js`'s `writeOut`. Use `configExists` for an existence-only config gate, `configPath` when
you need the path, and `CONFIG_RELPATH` in remedy strings — never spell `spec.config.json` yourself
in a script under `spec/scripts/`; add a new `lib/host-config.js` export instead.
