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
- You asked: A lane stopped at the fix-round cap gets a resume path; keep lane 1's built work as the starting point. Re-planned 2026-11-09: the smallest change that lets a cap-stopped lane continue from its kept work without hand-tagging.
- I will build:
  - A spec's run that stops at a cap (gate red past the repair cap, the commit hook still rejecting, blocking past the fix cap) stops the way `amend` does: its work committed as wip in the kept worktree, waiting for you to amend the spec.
  - Once you re-lock the amended spec, the same run (solo or fanout lane) rebases, takes the new text and goes back to GATE with fresh counts, through 20261108/03's existing resume.
- I will not touch:
  - The caps themselves (`REPAIR_CAP = 2`, `FIX_CAP = 1`), a `/spec:fix` run's cap stop (it has no spec to amend), lanes stopped by a dismissed question or `park`, and `after` waits.
- Users will notice: a run that stops at a cap says what blocked it and `/spec:plan <spec>`; amend and lock the spec and the next `/spec:fanout` (or `/spec:run`) carries on from the kept work. No tag, no worktree removal, and no fix item that waits forever.
- You lose: the fix item a spec's cap stop queued today, and a solo run's cap stop clearing its run state.
- Architecture or behaviour change: yes — a cap stop on a spec becomes a wait for your amend instead of an ending, needs your yes
- Client sign-off: a cap stop waits for your amend and resumes from its kept work, with no resume counter and nothing queued — approve, "harden and lock" (2026-11-09)

## Goal

A spec's run stopped at any cap keeps its worktree and its run state. After `/spec:plan <spec>` re-locks the spec with changed text, the next driver run rebases that worktree, gates and reviews it against the new text and lands it, with no hand-made tag, no removed worktree and no queue item left open for the stop.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | run.js: the three cap endings (`gateStep` past `REPAIR_CAP`, `commit()`'s hook catch past `REPAIR_CAP`, `steps.reviewed` past `FIX_CAP`) call one new `capStop(state, ctx, why, words)` instead of `parkRun(…, fixItem(…))`. For a spec's run (`state.spec && !state.fix`) it calls `amend(state, ctx, { why, words })`; for a fix run it is today's `parkRun` with `fixItem`. `parkRun` stays the ending for `park`, `needs-plan` and a dismissed question. Dies: the spec-bound fix item a cap queued, and a solo run's `ended: true` on a cap stop (its state now waits like an amend). | The amend wait already does everything a cap stop needs: wip commit, spec restored to the base, `st.resumes` on the re-locked blob, `resume()` to GATE with fresh counts, and fanout's hold and re-send (fanout.js `laneHold`, `returned`). One function because three callers share the branch; a second resume path would duplicate 20261108/03. |
| D2 | `amend()` takes an optional cap `{why, words}`: the 📌 line becomes `stopped: <why> — <words>; amend: /spec:plan <spec> — the build resumes from its kept work once the amended spec is locked`, the report outcome `⏸️ <id> stopped — <why>`, and `state.cap = why` is kept for the report. The ending is unchanged: STOPPED `{why: 'amend', on: <own spec>}`, so `st.resumes`, run.js's STOPPED case, fanout.js and `resume()` need no change. | Reusing `why: 'amend'` is what keeps fanout.js and lib/state.js out of the File Plan; the cap reason still reaches you in the 📌 line and the report. |
| D3 | No resume counter and no decide item after a second cap stop: a resumed run that hits a cap again waits for an amend again. [asked: drop it — every resume follows your own re-lock] | The bound existed to cap unattended rounds; here no round starts without your lock, so the earlier draft's `capResumes` would bound nothing. |
| D4 | A spec's cap stop queues nothing: the spec's own queue item stays open and fanout PLAN waits it with `its lane waits for the amended spec — /spec:plan <spec>, then /spec:fanout`; landing ticks that spec item as today. [asked: queue nothing] | Nothing queued means nothing left open after landing (the earlier build's blocker: a resumed lane held again left its fix item open and the next PLAN drained it from trunk). A plan item needs a close at lock, which 20261108/06 D4 forbids as a tick and D6 would have to carry as a `Queue:` trailer, adding that dependency. |
| D5 | doctor.js: its `ended` treats an `amend` wait like `after` (in flight), printing `in flight: <spec> waits for its amended spec — /spec:plan <spec>`, instead of `stale sidecar: … rm -r …`. | Today an in-place or solo amend wait is reported as a stale sidecar whose remedy deletes the state that resumes; D1 makes every cap stop one of these. |
| D6 | `spec/doctrine.md` (When to ask, Automate: a cap on a spec waits for an amend, on a fix queues a fix), `spec/commands/run.md` (STOPPED), `spec/commands/fanout.md` (the "stopped by a rule" sentence), `docs/v8/interface-contract.md` (run row) and `docs/v8/architecture.md` (REPAIR, FIX and STOPPED rows) say so. | The contract docs are what builders read (ADR-0037). |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/run.js | MODIFY | D1, D2 |
| spec/scripts/doctor.js | MODIFY | D5 |
| spec/doctrine.md + spec/commands/run.md + spec/commands/fanout.md + docs/v8/interface-contract.md + docs/v8/architecture.md | MODIFY | D6 |
| tests/run.test.js | MODIFY | AC-1 to AC-3; the AC-20261107-02-3 case keeps its ID on a `/spec:fix` run's cap stop and loses the spec run's fix-item and sidecar-cleared pins |
| tests/fanout.test.js + tests/doctor.test.js | MODIFY | AC-4, AC-5 |

## Acceptance Criteria

- **AC-20261108-05-1**: WHEN a worktree spec run, solo or a fanout lane, stops `still blocking after 1 fix round` with uncommitted work THE SYSTEM SHALL commit the work as `wip(spec): …` with the spec file as the base had it, queue no item, print a 📌 line naming the cap, the first blocking finding and `/spec:plan <spec>`, and WHEN driven again before a re-lock print the same report and change nothing.
- **AC-20261108-05-2**: WHEN trunk's copy of that spec is then locked `hardened` with changed text THE SYSTEM SHALL rebase the kept worktree, put the new text in it and reach GATE with `attempts` at zero and `review` cleared, keeping every file the build had written, and land it after a clean review.
- **AC-20261108-05-3**: WHEN the gate stays red past the repair cap, or the commit hook still rejects past it, THE SYSTEM SHALL stop the same way; WHEN a resumed run reaches a cap again it SHALL wait for an amend again; WHEN a `/spec:fix` run reaches any cap it SHALL queue one fix item and end as today.
- **AC-20261108-05-4**: WHEN a fanout lane stops at a cap and is marked returned THE SYSTEM SHALL hold it as an amend, PLAN SHALL wait the spec with `/spec:plan <spec>` and send out no fix lane for it, and after the re-lock PLAN SHALL send its kept worktree out as `/spec:run`, whose landing SHALL tick the spec item and leave no open item for the stop.
- **AC-20261108-05-5**: WHEN a run waits for an amend THE SYSTEM SHALL list it in `/spec:doctor` as in flight with `/spec:plan <spec>` and report no stale sidecar for it.

## Assumptions

- A1: No cap-stopped lane from before this lands still holds work anyone wants (the 2026-11-08/09 ones were tagged and removed by hand) — if false: tag and remove it as before, or hand-set its run state to `why: 'amend', on: <spec>`; its old fix item is closed with `/spec:queue done`.
- A2: Tag `spec-05-cap-resume-wip` (unattended resume, `capResumes`, fix-item resume lanes) is not reused; only its test fixtures for a hook-cap stop may be — if false: nothing, the design above stands on main.
- A3: 20261108/06 needs nothing from this spec: no item is queued or ticked, so 06's A4 (05 re-plans its tick as the `Queue:` trailer) holds with no dependency either way they land — if false (D4 picks a plan item): set `depends_on: [specs/20261108/06-the-queue-syncs-through-your-own-commands.md]` and close the item with lock's trailer.
