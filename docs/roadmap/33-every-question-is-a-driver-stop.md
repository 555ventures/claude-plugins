# 33 — Every question is a driver stop

Phase: P3 · Depends on: 32 · Primary workspaces: spec/scripts/fix-driver.js (new),
spec/scripts/spec-build-driver.js, spec/scripts/pending-question.js, spec/commands/{fix,run}.md,
spec/doctrine/stages/stage-build.md, tests · Risk: T2 (a driver replaces command prose; every
in-session text is kept line for line and pinned; `/spec:fix` keeps its one decisions stop) ·
Design stage: no · Expected specs: 1

<!-- Minted 2026-11-02 from the first delegated lane (specs/20261102/02 built through one
     worktree-isolated sub-agent). The lane's only question was a prose ask — stage-build's
     out-of-plan scope widening — which no driver prints, so it had no delegated twin and no kind.
     The same hole covers stage-build's blocked-worker ask, run.md's worktree-failure ask and all
     three asks in fix.md. Supersedes the queue item "delegated twins for the session-originated
     asks in stage-build.md" once this brief is planned. -->

## Result

A pipeline command never asks the user in prose; the driver behind it prints the stop, in both
its forms, so every question a lane can raise is one of the closed kinds a parent can relay or
derive:

- **A fix driver.** `/spec:fix` becomes driver-stepped like run, mocks and prototype: states for
  the root-cause statement, the regression test, the one decisions stop over authored strings and
  policy choices, the reviewer dispatch, the dispositions, the gate and the commit; the dirty-tree,
  decisions and dispositions asks become driver stops with kinds `fix-dirty-tree`, `fix-decisions`,
  `fix-dispositions` (the kinds specs/20261102/02 reserved for the prose twins).
- **Build-stage session asks move into the build driver.** The blocked-worker fork batch and the
  out-of-plan scope widening on critical tier become driver stops with kinds `build-blocked` and
  `scope-widening`; the wave step prints them from the workers' `blocked` returns and the
  reconcile output, never from the session's own reading.
- **Derivable stops say so.** A stop whose answer follows from a locked Decision (a scope widening
  the spec's own change made certain, a pin catching up with a section the spec added) carries
  `derivable: true` and the reason in the pending-question file; the fan-out auto-picks it with a
  visible line (specs/20261102/03 D8), and in session the driver prints the derived pick instead of
  asking.
- **run.md's worktree-failure ask** becomes a stop the loop prints from `merge-back.sh create`'s
  exit code, with its two option sets unchanged.

Every in-session text survives byte for byte; the file form mirrors it line for line; the kinds
closed set in `pending-question.js` gains the five new members and nothing else.

## Current state

- `spec/commands/fix.md` is prose end to end; its three asks (steps 1, 3, 4 after specs/20261102/02)
  write the pending file by hand through the CLI, which depends on the session following prose.
- `spec/doctrine/stages/stage-build.md` asks twice from the session: the blocked-worker fork batch
  (one AskUserQuestion per wave) and the out-of-plan scope widening on critical tier; neither is
  printed by `spec-build-driver.js`, so neither has a delegated twin — the first delegated lane had
  to borrow `build-escalate` for its only question.
- `spec/commands/run.md` Step 0 asks in prose when the worktree cannot be created; in a child
  session it is a STOP by specs/20261102/02 D7.
- `pending-question.js` validates a closed `kind` set of eight; `derivable` is read by
  specs/20261102/03 D8 but written by nothing.

## Out of scope

Moving `/spec:plan`'s asks into a driver (the planner seat stays in session with the user).
Changing any stop's options or wording. A second orchestrator. The overlap-based lane admission
rule (File Plan overlap instead of shared brief) — a separate brief once real fan-outs show how
often the brief rule holds work back.
