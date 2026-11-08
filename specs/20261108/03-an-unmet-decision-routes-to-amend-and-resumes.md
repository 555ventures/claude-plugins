---
date: 2026-11-08
status: done
area: run
depends_on: [specs/20261107/01-a-done-spec-is-a-stub.md]
brief: n/a
architecture: false
breaking: false
---

# An unmet Decision routes to amend, and an amended spec resumes its build

## Intent
- You asked: "an unmet Decision routes to amend, and an amended spec resumes its build" — the lane said amend was right (a spec contradiction, not code), but the question led with `retry (recommended)`, you picked it twice, both Opus rounds hit the same wall, and the green build then had to be moved by hand (wip, rebase, copy the run files, a solo run).
- I will build:
  - The `unmet` question leads with `amend`; `retry` is offered only while it would change something (the builder has not run on Opus yet); `park` closes the list. The Assumption fallback (no `ask` options) shares the list.
  - `amend` no longer ends the run: it commits the worktree as wip and ends STOPPED `{why: 'amend', on: <own spec>}`, the shape `after` already has; trunk's spec file is not written.
  - A STOPPED run resumes by itself when the spec it waits on reaches its state on trunk: `after` → `done`, `amend` → `hardened` with text that differs from the build's base. An amend resume rebases, takes trunk's text into the worktree copy and goes to GATE, so the criteria check and the review read the amended spec.
  - Fanout treats an `amend` stop like an `after` stop: held on its kept worktree, re-picked once the amended spec is locked, never listed as "its lane stopped".
  - A question with one answer left is not asked: the rule parks and says so in a 📌 line.
- I will not touch:
  - The three question kinds, `keep`/`fix` for a reviewer's choice, an Assumption's own `ask` options (amend stays last there), `dismissed`, the caps, `parkRun` for caps and `needs-plan`.
  - `criteriaRed` and `specEdits` reading the own spec at `state.base` (ADR-0048): after a resume `base` is the new merge-base, so the locked copy they read is the amended one; the guard stays.
  - The stub reads 20261107/01 adds to `docOf` and `unmet`; the runtime seam of 20261108/01; `installedVersion` of 20261108/02.
- Users will notice: an unmet Decision asks `amend (recommended) | retry | park`, and only `amend | park` once Opus has had its turn; picking amend prints `/spec:plan <spec>` and, after the lock, the same `/spec:run` (or the next `/spec:fanout`) carries the build on from its worktree through GATE and REVIEW; the spec on trunk stays `hardened`, not `draft`, while you amend it.
- You lose: `retry` after an Opus round; the `draft` status amend used to write; a lone `park` question in a fix.
- Architecture or behaviour change: no — the behaviour you named from the review; the run state reuses the `after` shape (`{why, on, from}`), no stored format or ADR changes.
- Client sign-off: none

## Goal

A builder that cannot keep a Decision sends the user to the spec first, not to a second Opus round. Picking amend leaves the build where it is; once `/spec:plan` re-locks the spec, the same run (solo or fanout lane) rebases, re-reads the spec and goes through GATE and REVIEW to land, with no hand-moving. The code that set a spec to draft and ended the run goes.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `lib/briefs.js` `escalation`: the `unmet` list is `[amend, ...(state.opus ? [] : [retry]), park]`, amend's description `amend <Dn> with /spec:plan <spec>; the build resumes by itself once the amended spec is locked`; the Assumption fallback (an arm with no options) is the same list. An arm's own options keep their order with amend last. Fanout RELAY keeps stamping `(recommended)` on index 0. | The lane's reasoning said amend; the fixed order said retry. `state.opus` already records that an Opus retry ran, so a second retry changes nothing but the attempts; carrying the lane's prose as control flow was rejected. |
| D2 | `run.js` `steps.escalate` `amend` → new `amend(state, ctx)`: in a worktree, `git.restore(wt, state.base, [own])` then `git.commitWip(wt, 'wip(spec): <stem> awaits its amended spec')`; `decide(state, 'amend: /spec:plan <rel> — the build resumes by itself once the amended spec is locked')`; report `⏸️ <id> stopped — amend`, next `/spec:plan <rel>`; `go(state, 'STOPPED', {why: 'amend', on: own, from: state.step})`, no `ended`. Trunk's spec file is not written. DELETE from `parkRun`: the `why === 'amend'` draft write and the `is draft again` fallback (the 📌 reads `stopped: <why>` plus ` — queued <item>` when one was). | `ended` deletes the run state; `draft` on trunk's working copy makes the main checkout dirty, which `mergeBack` refuses for every sibling lane until the user locks; `plan.js lock` never required draft. The own spec restored to base keeps the wip free of the status line, so the rebase onto the re-locked trunk cannot conflict on it. |
| D3 | `lib/state.js` `resumes(cwd, run, ref)`: `run.why === 'after'` → `git show <ref>:<on>` parses `status: done`; `run.why === 'amend'` → `status: hardened` and `git rev-parse <ref>:<on>` ≠ `git rev-parse <base>:<on>`. `run.js` derive STOPPED: `['after', 'amend'].includes(why) && st.resumes(ctx.root, state, ref)` → `resume`, where `ref = state.inPlace ? state.branch : trunk`. `resume`: rebase (worktree) then `base = merge-base(ref, HEAD)` (in place too); for `amend` also write `git show <ref>:<own>` to the worktree copy, status `done` (`implementing` in place), refresh `notice`, and `go(state, 'GATE', {review: null, attempts: {repair: 0, fix: 0}})`; `after` goes to `from` as today. Replaces `onDone`. | Trunk's committed copy is `hardened` the whole time, so status alone would resume before the amend; the blob compare waits for the lock commit. The lock lands on the branch the run builds on, which in place is the checkout's branch. GATE is where the criteria check (ADR-0048), `specEdits` and the diff are made, so an amended spec is judged before anyone reviews it. |
| D4 | `run.js` `steps.unmet` goes to ESCALATE only when `escalation(state).options.length >= 2`; one option (a fix on a spec after an Opus round: `park`) is applied as `escalate park` with `decide(state, 'Auto-picked park — the only answer left: a fix has no spec to amend and Opus already ran (veto anytime)')`. | `pending.writePending` refuses a question with fewer than two options, and a one-option question is a rule, not a question (doctrine § When to ask). |
| D5 | `fanout.js`: `stoppedWhy` returns null for `after` and `amend`; `eligible` waits a spec whose kept worktree's run is STOPPED `amend` and not `st.resumes(wt, run, trunk)` with `its lane waits for the amended spec — /spec:plan <spec>, then /spec:fanout`; `returned` on STOPPED `amend` sets the lane `held` with `on` and `why: 'amend'` and no `Q.hold`; REPORT's held line reads `held <name> — amend: /spec:plan <on>; PLAN re-picks it on its worktree once the amended spec is locked`. | A queue `after` on the lane's own spec would wait for it to be `done`; the run state in the kept worktree is the hold, and the wait line stops PLAN re-dispatching a lane that would only print its STOPPED report. |
| D6 | Prose: `commands/run.md` (STOPPED list: amend waits for the lock, same run resumes), `commands/fanout.md` (the `after` sentence covers amend; the "stopped by a rule" list loses amend), `docs/v8/architecture.md` (STOPPED row, WAIT paragraph, the `after` bullet), `docs/v8/interface-contract.md` (§ fanout row, § run questions, the three-kinds table). No ADR: a behaviour change. | What builders and the orchestrator read (ADR-0037) must say what the driver does. |
| D7 | Tests by execution in `tests/run.test.js` (D1–D4; a changed test keeps every AC-ID it cites) and `tests/fanout.test.js` (D5; `relay` pins `amend (recommended)`). `tests/state.test.js` pins `resumes` on a fixture repo. | The suite is the gate; amend has no test today. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/briefs.js | MODIFY | D1 escalation lists |
| spec/scripts/run.js | MODIFY | D2 `amend`, `parkRun` cut; D3 `resume`, `onDone` replaced; D4 `unmet` (overlaps 20261107/01 D6 in `unmet`/`docOf`: rebase onto it) |
| spec/scripts/lib/state.js | MODIFY | D3 `resumes` (20261108/02 adds `installedVersion` elsewhere in the file) |
| spec/scripts/fanout.js | MODIFY | D5 `stoppedWhy`, `eligible`, `returned`, REPORT |
| spec/commands/run.md + spec/commands/fanout.md | MODIFY | D6 |
| docs/v8/architecture.md + docs/v8/interface-contract.md | MODIFY | D6 |
| tests/run.test.js + tests/fanout.test.js + tests/state.test.js | MODIFY | D7 |

## Acceptance Criteria

- **AC-20261108-03-1**: WHEN `unmet --decision D1 --why …` is marked on a run with `opus` false THE SYSTEM SHALL print the options `amend`, `retry`, `park` in that order (mark `escalate <amend|retry|park>`; a lane's pending question the same; fanout RELAY `- amend (recommended)`); WHEN `opus` is true THE SYSTEM SHALL offer `amend`, `park` only; AND WHEN `unmet --assumption` names an arm with no options THE SYSTEM SHALL offer the same list, while an arm with options SHALL CONTINUE TO offer them with `amend` last.
- **AC-20261108-03-2**: WHEN `unmet --decision` is marked on a fix lane whose `opus` is true THE SYSTEM SHALL write no pending question, print `📌 Auto-picked park — the only answer left`, queue the fix item as `park` does and end STOPPED.
- **AC-20261108-03-3**: WHEN `escalate amend` is marked in a solo worktree run and in a lane THE SYSTEM SHALL leave trunk's spec file byte-identical (`git status --porcelain` empty in the main checkout), commit the worktree with a subject starting `wip(spec):` whose diff does not touch the spec, keep the run state at STOPPED `{why: 'amend', on: <own>}` with no `ended`, print `⏸️ … stopped — amend` and next `/spec:plan <rel>`; AND a re-run before the lock SHALL print that report and change nothing; AND `grep -rn "is draft again\|to draft" spec/scripts spec/commands docs/v8` SHALL return zero hits.
- **AC-20261108-03-4**: WHEN trunk then commits the spec `hardened` with a changed body THE SYSTEM SHALL on the next run rebase the worktree onto trunk, write trunk's text into the worktree copy with `status: done`, set `base` to the new merge-base, print `STOPPED → GATE`, and the build commit SHALL carry the amended text with the wip folded; WHEN the amended spec adds a criterion no test cites while the base cites another THE SYSTEM SHALL go red at GATE naming it; AND WHEN trunk's copy is `hardened` but byte-identical to the base's THE SYSTEM SHALL keep printing the STOPPED report.
- **AC-20261108-03-5**: WHEN an `--in-place` run on a branch marks `escalate amend` and that branch then commits the spec `hardened` with a changed body THE SYSTEM SHALL resume at GATE with `base` = HEAD and the spec's status `implementing`, and GATE SHALL revert no spec text.
- **AC-20261108-03-6**: WHEN a fanout lane ends STOPPED `amend` and is marked `returned` THE SYSTEM SHALL mark it `held` with no `after` on its queue item, REPORT SHALL print `held <name> — amend: /spec:plan <spec>`, PLAN SHALL list the spec as `waits — its lane waits for the amended spec` while trunk's copy is unchanged, and once the spec is re-locked PLAN SHALL pick it on its kept worktree, the lane SHALL resume at GATE, and `returned` SHALL land it with the amended text and the kept work.
- **AC-20261108-03-7**: WHEN `resumes(cwd, run, ref)` is given an `after` run whose `on` is `done` at `ref`, an `amend` run whose `on` is `hardened` with a blob unlike `base`'s, and an `amend` run whose `on` is `hardened` with the base's blob THE SYSTEM SHALL return true, true, false.

## Assumptions

- A1: `plan.js lock` on a `hardened` spec commits its edits with a changed blob — if false (an unchanged re-lock): the run keeps printing its STOPPED report, which names `/spec:plan <rel>`; nothing resumes on an unchanged spec.
- A2: 20261107/01 is on trunk (merge `ebc31cc0`), so `unmet` already reads Decisions through `docOf` and D4 only wraps its endings — if false: `depends_on` holds the lane.
- A3: The status viewer calls a spec whose run is STOPPED `amend` `hardened` (`liveRun` excludes STOPPED, as for `after`) — if false: nothing here changes it; the run's report and PLAN's wait line are the signal.
