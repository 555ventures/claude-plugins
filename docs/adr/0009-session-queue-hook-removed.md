# 0009. The SessionStart queue hook is removed: `/spec:queue` is the on-demand surface

- Status: accepted
- Date: 2026-08-30 (ruling) · recorded 2026-09-07
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ
- Applies to: brief 15 (derived session queue) — its "SessionStart surfacing" mechanism (the
  hook that printed the top unblocked queue item at session start), the `hello` subcommand
  that fed it, and the worktree "finish this tree" line the same script printed.
  specs/20260823/08-derived-session-queue.md AC-11, AC-12, AC-13 are retired by this record.
- Amended by: —

## Context

Brief 15 shipped the derived session queue with a SessionStart hook (`session-queue.sh`) that
injected the queue's top item into every new session. In practice the injection competed with
whatever the session was opened for, repeated itself across parallel sessions on the same
machine, and answered a question the user had not asked. JJ's ruling on 2026-08-30: no
session-start queue injection, ever. The deletion landed as a chore commit (0a7f8ef —
script, hook block, `hello` subcommand, and the hook's tests) without a spec, so the three
acceptance criteria that described the hook lost their tests with no record of why.

## Decision

The queue is read on demand only: `/spec:queue` (`next | list | add | move | done`) is the
command surface, and `/spec:status --next` folds the queue's top item into the one paste
line. No hook, no daemon, no session-start injection reads or prints the queue.

## Consequences

- Brief 15's "SessionStart surfacing" paragraph and its `bump`/`defer` verbs describe a
  retired mechanism; the live verbs are specs/20260903/03-pipeline-queue-mechanics.md's
  (`next/list/add/move/done`, `bump` refused by name).
- specs/20260823/08 AC-11/12/13 carry `[retired: docs/adr/0009-session-queue-hook-removed.md]`
  (specs/20260907/02-ac-drift-backfill.md D3).
- Any future proposal to surface the queue automatically reopens this ADR rather than adding
  a hook.
