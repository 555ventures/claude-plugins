---
date: 2026-11-06
status: hardened
area: fanout
depends_on: [specs/20261106/02-only-product-decisions-reach-you.md]
brief: n/a
architecture: true
breaking: false
---

# A prototype lane waits for your look

## Intent
- You asked: Fanout runs prototype specs in lanes: a lane parks at LOOK (returned accepts it as looking), the orchestrator starts the app from the lane worktree, prints the LOOK body, asks the user, and marks looked or look-failed --root <wt>; looked lands, look-failed re-dispatches at FIX. Replaces spec 14's D16 hold. (queue item q188)
- I will build:
  - `eligible()` stops holding prototype specs and the fix items bound to them: both become lanes, at most one per batch, and a host missing the prototype commands waits with that reason before any work starts.
  - In a lane the driver owns the app: it boots it detached, runs the pin tests, stops it, and boots it again for the look. No agent starts or stops a background process.
  - A lane at LOOK returns as `looking`. Fanout starts the app, prints the look, ends the turn; the orchestrator marks `looked` or `look-failed` on the lane's run with `--root <wt>`, and fanout reads the outcome from the run state.
  - `looked` lands through the normal path; `look-failed` re-dispatches the lane at FIX. Only a lane fanout has recorded as `looking` can take either mark, so a lane's agent cannot pass its own look.
  - REPORT says how many rounds each look took.
- I will not touch:
  - `/spec:run` and `/spec:fix` in place: the session still starts the app, and PIN_TESTS and LOOK read as they do today.
  - The look rule itself: a literal `close enough` passes, any other reply is a FIX round with the reply as the symptom, not counted against the fix cap (ADR-0043).
  - Spec 14's file (done); the plugin version (ADR-0039 D4).
- Users will notice: A batch can now take prototype work; when one is in it, you get a link to the running app, and the work lands only after you reply `close enough`.
- Architecture or behaviour change: yes — a batch that holds a prototype spec now pauses for the user's look instead of leaving that spec for `/spec:run`, and the driver, not the session, runs the app inside a lane; needs your yes
- Client sign-off: when a batch asks you to look, and whether a batch may wait on you — at the end of the batch, in one sitting; yes, a batch waits for your reply

## Preparation

Best practice: an approval gate saves its state and waits with no time limit, resumes with the reviewer's answer, and routes on it (LangGraph `interrupt`). The party that started the work should not be able to approve it (GitHub environments, prevent self-review), which D5 turns into a driver refusal rather than a sentence in a brief. Work done before the pause must be safe to repeat on resume, which is why a re-run of a killed step stops the saved process first (D3).

User flow, walked against the code: start `/spec:fanout` with one prototype spec and two plain ones, then walk away. (1) PLAN picked it, but the hosts have gaps: niko-hub and shop-bltr both use `{port}` and neither has `e2eCommand`, so without D1 the lane would fail after the build. (2) PIN_TESTS: `run.md` and `fanout.md` grant `Bash(node *)` only and a background lane has nobody to approve a prompt, so asking the lane to start an app is unreliable; `pin-tested` also cannot tell a stale app from a fresh one after a FIX round. D2 and D3 remove both problems. A throwaway check on 2026-11-06 proved a detached `sh -c` app outlives its parent and one group kill stops the shell and its child. (3) Return: today's `returned` refuses a lane at LOOK, and the WAIT crash line would re-send it (D6). (4) A lane's agent sees `--mark looked` printed and could mark it (D4, D5). (5) The look: other lanes have landed or are still out; D7 decides when you are asked. (6) Reply: `run.js --mark` changes the run, not fanout, so fanout has to read the result (D9); `looked` can also end at a commit-hook REPAIR or a pending question, and D9 covers those. (7) Landing: the rebase can conflict or the gate can go red after the look, and the existing path sends the lane through LOOK again (D10). (8) Report: landing deletes the run directory, which would lose ADR-0043's rejected-look count (D11). (9) `/clear` while waiting: fanout re-derives the step from disk and the detached app is still up, or is booted again (D8).

## Goal

A batch holding a prototype spec runs it like any other lane up to the look. You get one link to the app running from that lane's worktree, reply in chat, and either the work lands or a fix round starts and you are asked again. Nothing lands on a look you did not give.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `fanout.js` `eligible()` drops both holds (`stops at LOOK for you — …`). A hardened spec with `prototype:` and a `type: fix` item bound to one are ordinary candidates, with two waits, checked in this order. A host without `prototype.e2eFile`, `prototype.e2eCommand` and a `bootCommandOf` value waits `needs prototype.e2eFile, prototype.e2eCommand and prototype.bootCommand in .claude/spec.config.json`. A second prototype candidate in one walk waits `one prototype lane per batch`. | Spec 14's two reasons for the hold (the reply, an app that outlives the agent) are answered by D2 to D8. The config wait moves today's late `run.js` refusal ahead of the build. One per batch: with a fixed url a second lane's pin tests could run against the first lane's app and pass falsely, shop-bltr's per-prototype database went with `dbCreate`, and specs citing one stem share one e2e file. |
| D2 | `lib/host.js` gains `startApp({cmd, cwd, port, url, log})` and `stopApp({pid, url})`. `startApp` spawns `sh -c <cmd>` detached with `PORT` set when `port` is set, stdout and stderr appended to `log`, unref'd, then polls `listening(url)` for `BOOT_MS` (120000), returning `{pid, up}`. `stopApp` does nothing when `pid` is empty; otherwise it signals the group with SIGTERM, waits up to 5 s for `url` to stop answering, then sends SIGKILL; a missing process is not an error. The log is `<run dir>/app.log`. | One owner for the app. Proved by the throwaway check in Preparation. |
| D3 | In a lane, PIN_TESTS is an auto step in `run.js`: stop any saved `state.appPid`, boot from the worktree, write `appPid` to the run state before the tests start so a killed driver's re-run stops it first, run `prototype.e2eCommand` as `pin-tested` does today, then stop the app and clear `appPid`. An app that never answers counts as red pin tests with the tail of `app.log`. Green goes to LOOK; red goes to REPAIR under `REPAIR_CAP` by the same code path as `pin-tested`, which stays as the in-place mark. run.md says a lane runs this call with a 600000 ms timeout and a killed call is resumed by re-running the driver. | Each pin run gets a freshly booted app, so a FIX round cannot be tested against stale code, and the app is up only while something uses it. |
| D4 | LOOK in a lane prints `This lane waits for the user's look. Stop and return; the orchestrator takes it from here.` and no mark line. It still accepts `looked` and `look-failed`. | A lane must not see a mark it may not use. |
| D5 | In a lane, `looked` and `look-failed` refuse (exit 2, `only the user's look can pass this — return to the orchestrator`) unless `st.readFanout` holds a lane whose worktree resolves to this root with status `looking`. Both marks stop the app and clear `appPid` before changing step. | The agent that built the work cannot approve it, enforced by the driver. |
| D6 | The part of `steps.returned` after its status check becomes `laneBack(s, lane, ctx)`, also called by D9. A run at LOOK takes `wipLane`, then status `looking`. The WAIT crash list prints the `returned` line, not an Agent call, for a lane at LOOK. | One path for a lane coming back, so spec 02 D15's copy of `notice` and `decided` runs for the final state of a looked lane too. The wip commit is what a stopped lane gets; COMMIT already folds it. |
| D7 | The look is asked once no lane is out: `deriveWait` and `deriveMerge` treat `looking` as they treat `stopped`, and `deriveRelay` works in this order: settle (D9), land `done` lanes, ask questions, re-dispatch `answered` lanes, then the look. [asked: the look comes at the end of the batch] | One sitting at the end, the same moment lane questions are asked. Asking at once would let a failed look start its fix earlier, at the cost of interrupting mid-batch. |
| D8 | The look step in `deriveRelay`: when nothing answers at the run's `appUrl`, an auto step boots the app (D2) and saves `appPid` to the lane's run. Then it prints the lane list as WAIT does, the look lines, the print-and-end-your-turn instruction, the two `run.js <spec> --root <wt> --mark …` lines, a line to re-run fanout after marking, and the printed `dismissed` line. The step has no fanout mark and accepts `dismissed`. An app that does not answer prints a warning with the tail of `app.log` in place of the look lines, and re-running tries again. `dismissed` on a `looking` lane stops the app. `bootLine` is unchanged; `lookBody`'s lines move to new `lib/look.js`, used by `run.js` and `fanout.js`, so the look reads the same in both. Reply rule as ADR-0043, with nothing added for "not now": not replying leaves the app up and the lane waiting. | The same stop as `/spec:run`, reached from the batch. The driver starts the app for the orchestrator: the brief's intent, without a shell permission the command does not have, and it survives `/clear`. |
| D9 | Settling runs as an auto step at RELAY, reading each `looking` lane's run. Still at LOOK: nothing. At FIX or REPAIR: status `answered`, and the reply joins `s.answered`, so the existing `resumed` re-dispatch sends the lane back. Any other step: `laneBack`, so MERGE_READY lands, a pending question stops, and an ended run is dismissed. The re-dispatch intro reads `Every question and look is answered.` No new fanout mark. | Fanout state stays derived from the run on disk, so a crash between the run's mark and fanout's re-run loses nothing. |
| D10 | After an accepted look, a lane that lands cleanly is not looked at again, and pin tests do not rerun on the rebased tree: the gate covers it, as for any lane. A rebase conflict or a red gate on the rebased tree goes through today's send-back, so the lane returns through REVIEW, PIN_TESTS and LOOK and the user looks again. | No special case: the changed tree takes the normal chain, and a clean rebase matches `/spec:run`'s merge after LOOK. |
| D11 | `laneBack` copies `run.look` onto the lane; REPORT adds `looked at <stem> — accepted after <n> round(s)`. | ADR-0043 needs the count of pins rejected at LOOK per run, and landing deletes the run directory. |
| D12 | ADR-0043 stands and no ADR is written: pin tests run after REVIEW and never in the gate, the user looks before the commit, a literal `close enough` advances. Only spec 14 D15's "started by the session" changes, and only inside a lane. Docs: `fanout.md`, `run.md`, `fix.md`, `interface-contract.md` rows for `/spec:fix`, the run prototype row, fanout and §5, `architecture.md` PIN_TESTS, LOOK and fanout notes, and one doctrine.md line saying the look is the user's own stop, beside the stops spec 02 lists. | Behaviour changes get no ADR. Spec 02 D19 lists five stops and leaves prototype stops out of scope, so the look needs saying once. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/host.js | MODIFY | `startApp`, `stopApp` (D2) |
| spec/scripts/lib/look.js | CREATE | The look lines shared by run and fanout (D8) |
| spec/scripts/run.js | MODIFY | Lane PIN_TESTS auto step, lane LOOK body, the `looking` guard, app stop on both marks (D3, D4, D5) |
| spec/scripts/fanout.js | MODIFY | Holds go, the two waits, `laneBack`, `looking`, RELAY order, look step, settle, report line (D1, D6 to D9, D11) |
| spec/commands/fanout.md | MODIFY | The look replaces the hold (D1, D7, D8) |
| spec/commands/run.md | MODIFY | Lane PIN_TESTS and LOOK, the long call (D3, D4) |
| spec/commands/fix.md | MODIFY | A fix on a prototype spec is no longer in place only (D1) |
| spec/doctrine.md | MODIFY | The look line (D12) |
| docs/v8/interface-contract.md | MODIFY | Rows named in D12 |
| docs/v8/architecture.md | MODIFY | Rows named in D12 |
| tests/host.test.js | MODIFY | `startApp`, `stopApp` |
| tests/fanout.test.js | MODIFY | The hold test AC-20261105-14-17 is rewritten for D1; lane cases below |
| tests/run.test.js | MODIFY | Lane PIN_TESTS, LOOK and the guard; `heldFix` reads the item's paste line now that the hold line is gone |

## Acceptance Criteria

- **AC-20261106-03-1**: WHEN a hardened spec with `prototype:` is queued on a host with the three prototype commands THE SYSTEM SHALL pick it as a lane; AND a `type: fix` item bound to such a spec SHALL be picked as a fix lane.
- **AC-20261106-03-2**: WHEN the host lacks any of `prototype.e2eFile`, `prototype.e2eCommand` or `prototype.bootCommand` THE SYSTEM SHALL make no lane and print the spec as waiting with the `needs prototype.e2eFile, …` reason.
- **AC-20261106-03-3**: WHEN two prototype candidates are runnable THE SYSTEM SHALL pick the first and print the second as waiting with `one prototype lane per batch`, and plain specs SHALL CONTINUE TO be picked beside it.
- **AC-20261106-03-4**: WHEN `host.startApp` boots a command that spawns a child and its caller exits THE SYSTEM SHALL keep the app answering; AND `host.stopApp` SHALL end the shell and the child, and do nothing on an empty or dead pid.
- **AC-20261106-03-5**: WHEN a lane's run reaches PIN_TESTS THE SYSTEM SHALL boot the app itself, run the e2e command with `APP_URL`, and leave nothing answering afterwards, on green and on red; AND an app that never answers SHALL go to REPAIR with the tail of `app.log`.
- **AC-20261106-03-6**: WHEN a lane's run is at LOOK THE SYSTEM SHALL print no mark line; AND `looked` or `look-failed` SHALL exit 2 while fanout's lane record is not `looking`.
- **AC-20261106-03-7**: WHEN a lane at LOOK is marked `returned` THE SYSTEM SHALL record it `looking` with its work in a `wip(spec):` commit; AND after a crash the WAIT list SHALL print its `returned` line, not an Agent call.
- **AC-20261106-03-8**: WHEN a `looking` lane is the only unfinished work THE SYSTEM SHALL boot the app from the lane's worktree and print the url, the look pins and both `--root <wt>` marks; AND while another lane is out it SHALL print no look.
- **AC-20261106-03-9**: WHEN the orchestrator marks `looked --root <wt>` and re-runs fanout THE SYSTEM SHALL have stopped the app, committed the build, landed the lane on trunk and ticked its queue item; AND REPORT SHALL print `looked at <stem> — accepted after 1 round(s)`.
- **AC-20261106-03-10**: WHEN the orchestrator marks `look-failed --why "<reply>" --root <wt>` and re-runs fanout THE SYSTEM SHALL stop the app and print the lane's Agent call; AND that lane's FIX brief SHALL carry the reply, and after `fixed` it SHALL pass GATE, REVIEW and PIN_TESTS and return `looking` again.
- **AC-20261106-03-11**: WHEN `looked` ends at a commit-hook REPAIR THE SYSTEM SHALL re-dispatch the lane; AND a pending question SHALL stop it for RELAY.
- **AC-20261106-03-12**: WHEN an accepted lane's rebase conflicts or its rebased tree goes red THE SYSTEM SHALL send it back and it SHALL return `looking` again; AND a clean rebase with a green gate SHALL land with no second look.
- **AC-20261106-03-13**: WHEN a `looking` lane is marked `dismissed` THE SYSTEM SHALL stop its app and keep its worktree.
- **AC-20261106-03-14**: WHEN a prototype spec runs with `/spec:run` or `/spec:fix` in place THE SYSTEM SHALL CONTINUE TO print the boot line at PIN_TESTS and take `pin-tested`, `looked` and `look-failed` from the session.
- **AC-20261106-03-15**: WHEN the build is done THE SYSTEM SHALL have been driven end to end on a scratch host outside the repo, with a real HTTP app and a batch of one prototype spec and one plain spec, through one failed look and one accepted look, with the transcript recorded in `<spec>.run/evidence.md`.

## Assumptions

- A1: Spec 02 lands first, so `laneBack` wraps its `returned` and the RELAY edits sit on its text — if false: `depends_on` holds this lane until it does.
- A2: 120 seconds is enough for a host's app to answer — if false: raise `BOOT_MS`; add no config key until a host needs one.
- A3: The tests that rehearse the hold are the ones listed in the File Plan (grep at lock: `stops at LOOK` in `tests/fanout.test.js` and `tests/run.test.js`) — if false: fix that setup in the same build; never weaken the wait.
