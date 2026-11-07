---
date: 2026-11-07
status: hardened
area: run
depends_on: []
brief: 39
architecture: true
breaking: false
---

# Run and fanout match the v8 design

## Intent
- You asked: "why bloat issues keep happening? … I made fanout to automate these small things that do not need my manual invocation" — v8 doubled in three days (run.js 1,113 against a 400 cap, fanout.js 850); trim it to the design while keeping /spec:fix light and fanout draining fixes unattended, and stop the mechanical questions (brief 39).
- I will build:
  - One landing path for solo runs and lanes: bookkeeping commit, rebase, gate and merge all happen in the worktree, so main gets exactly the tested tree and is never left mid-merge.
  - Twelve run steps and three question kinds; everything mechanical becomes a rule printed as a 📌 line.
  - A fix runs the same machine with no spec file; fanout keeps fix lanes and drains reviewer advisories as one fix item per run.
  - The spec grammar and the agent briefs move into their own libraries; deleted behaviour takes its tests with it.
- I will not touch:
  - /spec:fix and /spec:fanout as you invoke them; plan forks, the lock yes, LOOK and `close enough`; genesis, mocks, prototype, release, migrate; the size caps.
- Users will notice: fewer questions, each in the agent's own words; every report lists what was decided without you; a conflict is fixed in the spec's worktree, never in your checkout.
- You lose: the conflict stop in your main checkout; the second gate on main and its hand repair (MERGE_RED, `gate-repaired`); the `askPaths` stop; the secrets, spec-edit, scope and fix-wording questions; your rulings written into the spec's Decisions table (they move to the commit message); the `## As built` section (its lines move to the commit message); PIN_TESTS as its own step; building on a non-trunk branch without `--in-place`; an amended lane reusing its old worktree.
- Architecture or behaviour change: yes — one landing path, twelve steps, rules instead of mechanical stops, needs your yes
- Client sign-off: rule-not-question for mechanical stops — yes (2026-11-06); advisories as one fix item, pin tests in the gate, askPaths removed, rulings to the commit, `--in-place` required off trunk — yes (2026-11-07); the You lose list — yes (2026-11-07)

## Goal

run.js, fanout.js, state.js and host.js are under their caps with every behaviour above kept. A run lands only a tree it has gated, asks only product questions, and prints what it decided. /spec:fix and fanout's fix lanes behave as today for the user.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | New `lib/land.js` (≤ 80 lines) is the one landing path, called by run.js `merge` and fanout `mergeLane`: write `status: done` and commit in the worktree, `git.rebaseOnto(wt, trunk)`, gate the worktree, `git.mergeBack` with the configured strategy (`reset --merge` on any failure), remove the worktree, tick the queue. A conflict leaves the rebase in the worktree; `rebaseGuard` covers every worktree run and `finishRebase` returns to GATE. Deletes run.js CONFLICTS, `conflicts-resolved`, TRUNK_GATE, `trunkGate`, FINISH, `dirtyMessage`'s mid-merge branch; fanout `finalize`, `clearLaneRun`, MERGE_RED, `gate-repaired`, `gateAfter`, `holdDone`, `deriveRed`. | Two landing copies; the main gate judged a tree with one more commit than the lane gate. A descendant cannot conflict under ff, merge-commit or squash. |
| D2 | Steps are OPEN, BUILD, GATE, REPAIR, REVIEW, FIX, ESCALATE, LOOK, COMMIT, MERGE, DONE, STOPPED `{why}`. GATE also runs `prototype.e2eCommand` for a `prototype:` spec, before REVIEW (ADR-0043 amended); PIN_TESTS, `pin-tested`, MERGE_READY (a lane ends DONE in its worktree), PARKED, AMENDED and NEEDS_PLAN go. | architecture.md §4 lists twelve; seven were added in two days. |
| D3 | ESCALATE asks only `assumption`, `decision`, `unmet`, in the agent's own text verbatim (no id prefix, no `+N more`). Gate red past `REPAIR_CAP` and blocking past `FIX_CAP` call `parkRun(state, ctx, why, item)`, lifted from the `escalate` park arm. Spec edits revert and re-gate; secret hits are kept out; `askPaths`, `widen`, `separate`, `fix-choices` and their `CHOICES`/`OFFERED`/`KIND_OF` rows go. Every rule calls `decide(state, line)`. | 17 of 61 stops were mechanical; the recommended option won 28 of 28. |
| D4 | A dismissed question calls `parkRun` with a `decide` item whose payload is the question; nothing is answered for the user. | One rule for a missing answer. |
| D5 | Rulings and `as-built.md` lines go into the commit body and the next brief; the driver never writes the spec. `appendAsBuilt`, `departures`, `recordRuling` and the ruling-row strip in `specEdits` go. | The only markdown writes outside the state library. |
| D6 | On a review with advisories and no blocking finding, one `type: fix` item bound to the spec is queued: `advisories of <stem>: <a>; <b>`. | Advisories reached no one; one item per run cannot flood the queue. |
| D7 | A fix is the same machine with no spec file: `lib/spec.js` `fixDoc(symptom, spec?)` returns the `readSpec` shape (title = symptom, one reproduce-first criterion, no File Plan). Cause and test go in `evidence.md`; "needs a plan" is STOPPED `{why: 'needs-plan'}` with a plan item. Deletes `fix.json`, `readFixJson`, `refreshFix`, `fixTestFile`, `fixBullets`, `fixAuthored`, `fixOnly`, `endNeedsPlan`, `fixBlock`/`fixReviewBlock` branches. `--fix`, the `fix(<slug>):` subject and fanout fix lanes stay. | 53 `state.fix` branches exist because the briefs read a document a fix lacked. |
| D8 | Fanout has one lane shape `{spec \| symptom, worktree, prompt}`. A lane that needs another spec ends STOPPED `{why: 'after', on}`; fanout writes `after` onto its queue item and the next PLAN holds and re-dispatches it through `lib/next.js` blockers on the kept worktree. Deletes `waiting`, `putWaiting`, `wipLane`, `--mark waiting`, AMENDED reuse, `relocked`, `resetAmended`, `reuseLane`, `NEEDS`/`needsYou` (PLAN prints the queue renderer), host.js `laneFiles`. | A second dependency system beside the queue's own `after`. |
| D9 | `--in-place` is the only way to build outside a worktree; on a non-trunk branch run.js refuses naming it. | The driver guessed where to build from four reasons. |
| D10 | Template Intent gains `- Users will notice:` and `- You lose:`; run and fanout reports print the notice and every decided line in the existing 📌 slot; fanout carries each lane's lines and the answered question text into REPORT. | What a rule decided must still reach the user. |
| D11 | The spec grammar moves from state.js to `lib/spec.js` (≤ 250) and the builder, reviewer, escalate and look briefs to `lib/briefs.js` (≤ 200). | Text and parsing are not state; state.js is 415 against 250. |
| D12 | Prose follows the code: doctrine "When to ask" becomes three buckets (automate, ask, report) in fewer lines; run.md, fix.md, fanout.md, architecture §4 and the interface contract name only what exists. | Prose naming a deleted stop is the next false CLEAN. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/land.js | CREATE | D1 |
| spec/scripts/lib/spec.js | CREATE | D7, D11 |
| spec/scripts/lib/briefs.js | CREATE | D11 |
| spec/scripts/run.js | MODIFY | D1–D7, D9, D10; every retired name in AC-8 goes |
| spec/scripts/fanout.js | MODIFY | D1, D4, D6, D8, D10 |
| spec/scripts/lib/{state,git,host,pending,next,queue,report}.js | MODIFY | grammar out, `mergeBack` reset, `laneFiles` out, three kinds, `after` holds |
| spec/scripts/{plan,status,doctor,migrate,prototype}.js | MODIFY | callers of moved or retired names only |
| spec/templates/spec.md | MODIFY | D10 |
| spec/{doctrine.md,commands/run.md,commands/fix.md,commands/fanout.md,agents/builder.md,agents/reviewer.md} | MODIFY | D12, each under its cap |
| docs/v8/{architecture,interface-contract}.md, docs/adr/0043-*.md | MODIFY | D2, D12 |
| tests/*.test.js | MODIFY | tests of deleted behaviour deleted; new behaviour on exit code, file or JSON |

## Acceptance Criteria

- **AC-20261107-02-1**: WHEN a solo run or a lane reaches MERGE and trunk moved with a conflict, THE SYSTEM SHALL leave the rebase in the worktree, print the rebase step, and on re-run gate and review again; `git status` in the main checkout is clean before and after.
- **AC-20261107-02-2**: WHEN a run lands under ff-only, merge-commit or squash, THE SYSTEM SHALL land a trunk tree equal to the tree its last gate passed, with no gate run on the main checkout.
- **AC-20261107-02-3**: WHEN the gate stays red past the repair cap or review blocks past the fix cap, THE SYSTEM SHALL end STOPPED with one fix item queued and a 📌 line, asking nothing.
- **AC-20261107-02-4**: WHEN a review is clean with advisories, THE SYSTEM SHALL queue exactly one `type: fix` item bound to the spec listing them, and fanout's next PLAN picks it as a lane.
- **AC-20261107-02-5**: WHEN `/spec:fix "<symptom>"` runs in place or as a fanout lane, THE SYSTEM SHALL write no spec file and commit `fix(<slug>): <symptom>` after a green gate and a review.
- **AC-20261107-02-6**: WHEN a lane stops needing spec Y, THE SYSTEM SHALL hold it in PLAN until Y is done and then dispatch it on its kept worktree with no user action.
- **AC-20261107-02-7**: WHEN a question is dismissed, THE SYSTEM SHALL park with a `decide` item whose payload is the question and record no option label.
- **AC-20261107-02-8**: zero occurrences of `CONFLICTS`, `conflicts-resolved`, `TRUNK_GATE`, `MERGE_RED`, `gate-repaired`, `MERGE_READY`, `PIN_TESTS`, `pin-tested`, `askPaths`, `fix-choices`, `appendAsBuilt`, `putWaiting`, `reuseLane`, `laneFiles`, `fix.json` under spec/ and tests/.
- **AC-20261107-02-9**: `tests/size-check.js` reports none of run.js, fanout.js, lib/state.js, lib/host.js, the new libs, tests/run.test.js or tests/fanout.test.js over its cap, and `npm test` is green.

## Assumptions

- A1: no host sets `askPaths` — if false: its stop is lost silently; ask before lock.
- A2: `.worktreeinclude` covers what `laneFiles` copied — if false: keep the key in host.js only.
