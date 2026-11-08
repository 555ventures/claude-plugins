---
date: 2026-11-08
status: hardened
area: run
depends_on: []
brief: n/a
architecture: true
breaking: false
---

# A run stopped at a cap resumes

## Intent
- You asked: A lane stopped at the fix-round cap gets a resume path; keep lane 1's built work as the starting point.
- I will build:
  - A run stopped at a cap (gate red past the repair cap, the commit hook still rejecting, blocking past the fix cap) resumes when its driver runs again: its work is kept, it rebases onto trunk, takes its spec if trunk's copy changed, and goes back to GATE with fresh counts.
  - One resume per stop: a run that hits a cap again after resuming parks with a decide item, not another fix item.
  - Fanout sends a cap-stopped lane out again on its kept worktree when its queued fix item comes up, instead of waiting it forever.
- I will not touch:
  - The caps themselves (`REPAIR_CAP = 2`, `FIX_CAP = 1`), lanes stopped by a dismissed question, `after` and `amend` holds.
  - What a fix lane on a done spec does.
- Users will notice: a lane that stops at a cap is no longer stuck until you remove its worktree; the next `/spec:fanout` (or `/spec:run` on it) carries it on from its kept work, once; a second cap stop asks you.
- You lose: nothing.
- Architecture or behaviour change: yes — a cap stop becomes resumable once instead of terminal, needs your yes
- Client sign-off: a cap stop resumes once from its kept work, a second stop asks — approve (2026-11-08)

## Goal

A lane that stopped at a cap keeps its worktree; the next `/spec:fanout` dispatches it again from its kept work and it lands, or stops a second time with a question for you. No worktree has to be removed by hand and no built work is thrown away.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | run.js `next()`'s STOPPED case: a run whose `why` is a cap stop (the three `parkRun` callers on `REPAIR_CAP`, the commit hook and `FIX_CAP`; `CAPS` names the three texts) resumes when the driver runs with no mark, through the existing `resume()`. `resume()`'s `amended` branch generalises to "the spec on `refOf` differs from the base's copy" (`st.resumes`' blob compare), so a cap stop takes an amended spec the same way 20261108/03's amend does; a cap stop always resets `review` and `attempts` and goes to GATE. A dirty worktree is committed as `wip(spec): <stem> resumes past a cap` before the rebase (the commit step folds wip commits already). | Today only `after` and `amend` resume; a cap stop is terminal and its queued fix waits behind "its spec is in a lane" forever, so the only route is deleting built work. One resume path, not a second one. |
| D2 | `state.capResumes` counts resumes. A cap stop with `capResumes >= 1` parks with a `decide` item (`stopped at a cap twice — amend <spec> or drop the lane`) instead of `fixItem`, and its STOPPED case does not resume. [asked: resume once, then ask] | Bounds unattended rounds to one per stop, as fanout's second conflict on one trunk stops for you. |
| D3 | fanout.js PLAN: for a fix item bound to a spec whose `spec-<stem>` worktree holds a cap-stopped run that can resume (D1, D2), the lane is that kept worktree dispatched as a spec lane (`/spec:run <spec> --root <wt>`), carrying the fix item's id so landing ticks it; the spec's own run item waits on that lane. `ended()`'s "remove … to run it again" and the "its spec is in a lane" wait stay only for runs that cannot resume. | The fix item already says the run needs another round; the kept worktree is where that round's work is. |
| D4 | `spec/commands/run.md` (STOPPED), `spec/commands/fanout.md` (the "stopped by a rule" sentence), `docs/v8/interface-contract.md` and `docs/v8/architecture.md` say a cap stop resumes once from its kept work. | The contract docs are what builders read (ADR-0037). |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/run.js + spec/scripts/lib/state.js | MODIFY | D1, D2 |
| spec/scripts/fanout.js | MODIFY | D3 |
| spec/commands/run.md + spec/commands/fanout.md + docs/v8/interface-contract.md + docs/v8/architecture.md | MODIFY | D4 |
| tests/run.test.js + tests/fanout.test.js | MODIFY | AC-1 to AC-4 |

## Acceptance Criteria

- **AC-20261108-05-1**: WHEN a worktree run stopped `still blocking after 1 fix round` with uncommitted work is driven again with no mark THE SYSTEM SHALL commit the work as wip, rebase onto trunk, and reach GATE with `attempts` at zero, keeping every file the build had written.
- **AC-20261108-05-2**: WHEN trunk's copy of that run's spec was re-locked with a change before the resume THE SYSTEM SHALL put the new text in the worktree, and WHEN it was not THE SYSTEM SHALL leave the spec file as it was.
- **AC-20261108-05-3**: WHEN a resumed run stops at any cap again THE SYSTEM SHALL queue a decide item naming the spec, queue no fix item, and stay STOPPED when driven again.
- **AC-20261108-05-4**: WHEN fanout PLANs with a queued fix item bound to a spec whose kept lane is cap-stopped and has not resumed THE SYSTEM SHALL list that kept worktree as a lane running `/spec:run`, and WHEN that lane lands THE SYSTEM SHALL tick the fix item; WHEN the lane stopped on a dismissed question THE SYSTEM SHALL wait it as today.

## Assumptions

- A1: The run state of a lane stopped before this lands (no `capResumes`, uncommitted tree) resumes under D1 like a new one — if false: the first resume of such a lane needs its worktree committed by hand.
