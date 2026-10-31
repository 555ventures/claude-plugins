---
date: 2026-10-29
status: hardened
tier: standard           # no rules § Risk Tiers surface is edited: merge-back.sh is read, not changed (its inspect already prints RECOMMEND); the two drivers, the command docs and a new lib are not listed triggers and none is boot-path code
area: pipeline
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-31
open_markers: 0
---

# Every dead stop becomes a question with a default

## Goal

Twelve places where the build, review, fix, release or git commands today print an error and end
the turn become one `AskUserQuestion` each, with a recommended default and the consequence of
every option, so the owner answers in ten seconds instead of reconstructing the remedy from a
message. Two contradictions are settled: merge strategy is derived everywhere (the git plugin
stops asking), and `/spec:fix` can no longer waive its own reviewer's findings. Done means no
command in the File Plan ends a turn with a bare "STOP" where a choice exists.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 2.3 (RUN-01, BLD-01,
BLD-02, BLD-06, REV-01, REV-04, REV-05, REV-06, FIX-02), Part 2.4 (REL-05, REL-06, Q-01, GIT-03,
GIT-05, GIT-06), Part 3 #20 and Part 4 #3.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/commands/run.md` Step 0: a worktree that cannot be created is ONE `AskUserQuestion`, never a bare stop. When the failure text starts `create: run from the main working tree` the options are "exit the other worktree and retry (Recommended)" / "abort"; for any other failure "run in place with `--in-place` (Recommended)" / "abort" — every option's description states its consequence; the phrase `hard stop` leaves the file. The canonical sentence saying the run "stops rather than continuing on the current branch" is amended (Canonical Delta). (AC-20261029-07-1) | Dead stop today; `--in-place` is named only in prose. |
| D2 | Build ESCALATE (repair cap 3): the driver's ESCALATE step prints `recommended: <re-arm\|park> (<reason>)` derived from the failure-count trend of the three capped gate logs — `re-arm (failures shrank A → B → C)` when the counts strictly decrease across the last three red runs, else `park (failures did not shrink: A → B → C)`, and `park (failure count not derivable from the gate logs)` when any count is `null` — then ONE `AskUserQuestion` instruction with four options and their consequences: re-arm one more round / restart cold / park and queue a `/spec:fix` / amend the spec; the mark `--mark escalate-choice <re-arm\|cold\|park\|amend>` is admitted at ESCALATE only and replaces the "delete gate-cap / delete the sidecar" instructions in both the step text and the fourth-`repair-applied` refusal message (the deletion mechanics stay; the mark is the sanctioned surface). Failure counts come from `spec/scripts/lib/gate-fail-count.js` (Contracts). (AC-20261029-07-2) | The owner should not have to know which file to delete; the driver already holds the trend. |
| D3 | Build red-check anomalies: the RED_FINDINGS step classifies each `HARD <class> <path>` line of the red-check output. `mixed-pin` → prints `📌 Auto-picked split the bullet — <path>: <AC-IDs> (veto anytime)` with the split instruction. `unsanctioned-green` on `tier: standard` → prints the § Gotchas known cause as the diagnosis rule and the line template `📌 Auto-picked remove the AC-ID mention — <path> (veto anytime)`, telling the session that when the known cause does not match, the test is vacuous and is rewritten red; on `tier: critical` the same step instead prints an `AskUserQuestion` instruction (remove the AC-ID mention (Recommended) / rewrite the test red / pause the build). `skipped-resume` stays a printed, recorded notice and never a user diagnosis. `stage-build.md`'s "diagnosed with the user" sentence is rewritten to this rule. (AC-20261029-07-3) | Two of the three have one mechanical fix; the third has a documented cause. |
| D4 | Build `blocked` returns (`stage-build.md` § `blocked` returns): when the spec's Assumptions already carry an `if false` fallback for the named assumption, the session applies it and prints `📌 Auto-picked <fallback> — A<n>'s if-false arm (veto anytime)`; every other blocked worker in the same wave is batched into ONE `AskUserQuestion` (≤4 questions per call), the ruling written into Decisions before any re-dispatch. Doctrine only — the driver never sees worker returns. (AC-20261029-07-4) | The fallback was written for exactly this moment. |
| D5 | Review STOPPED (a `RED_BLOCKING` leg): the STOPPED step prints the red legs and ONE `AskUserQuestion` instruction — "run one in-session repair round (Recommended)" / "queue `/spec:fix` and stop" / "abandon the review" — and names `--mark repair-round`. The mark is admitted at STOPPED only, capped at 1 per review (`marks.repairRounds`), deletes the stopped iteration's manifest and re-runs legs at the same iteration number (the mechanized form of today's "delete the manifest and re-run" remedy); green continues to REVIEWER, red lands STOPPED again, whose text is then ESCALATE-shaped: two exits only (queue `/spec:fix` / abandon) and a second `repair-round` is refused (exit 2). Repair workers are the review fix seat (`sonnet` at `effort: medium`, via `agentMap`). (AC-20261029-07-5) | A mechanical red is not a decision; today the user restarts by hand. |
| D6 | Review ESCALATE (fix cap 2): the ESCALATE step lists the open pool (hard survivors `s<i>` and leg findings, same order as DISPOSITIONS) and prints ONE `AskUserQuestion` instruction with four options — "abandon and queue `/spec:fix` (Recommended)" (delete the sidecar, then `node "$(spec-paths spec-queue)" add "<spec>: review escalated at the fix cap — <N> open findings" --lane fix --top`) / "waive all and close" / "reject with evidence" (both through a disposer return of waive or reject entries and `--mark dispositions --file <return.json>`) / "re-plan" (abandon, then `spec-queue add "re-plan <spec>: <reason>" --lane plan`). Every literal the existing ESCALATE pins assert stays (`dispositions --fix-dispatched 0`, `delete`, `.review`, the ledger path, `--mark dispositions --file <return.json>`, no `--waived N`). (AC-20261029-07-6) | Accepting known defects is human; the options were spread across prose. |
| D7 | The close-step notice `⚠ N finding(s) waived this run — confirm in the close report.` becomes `N finding(s) waived at DISPOSITIONS (recorded)` on every tier — the user approved each waive at DISPOSITIONS, the ledger holds it. `[asked: drop the re-confirmation on every tier]` (AC-20261029-07-7) | Redundant confirmation. |
| D8 | Merge strategy is derived everywhere: `git/commands/merge.md` Step 3 runs `bash "$(spec-paths merge-back)" inspect --root . --target <target> --source <source>`, takes its `RECOMMEND:` line, prints `📌 Auto-picked <strategy> — <reason> (veto anytime)` and proceeds; its own commit-count list and the words `always ask` are deleted; rule 5 keeps `AskUserQuestion` for non-trivial conflicts only. `merge-back.sh` is unchanged — its inspect heuristic (0 → nothing, 1 → ff-only, ≤5 → merge-commit, >5 → squash) is the single home and is pinned by a CONTINUE-TO AC. `[asked: derive everywhere, spec branches and feature branches alike]` (AC-20261029-07-8, AC-20261029-07-14) | Two commands, two rules, one of them "always ask" — the audit's clearest contradiction. |
| D9 | `/spec:fix` step 4 adopts the review stage's disposition rule: a `fix` is applied without a question; `waive`/`reject` go to the user in ONE `AskUserQuestion` (≤4 per call, the reviewer's claim quoted, the recommended fate first); the sentence `Dispose every finding inline — fix it, or state why not` is replaced and the file carries the literal `only the user waives`. The step keeps its `4. **Fresh review.**` heading and its `Agent {subagent_type: 'spec:reviewer'}` dispatch line byte-for-byte (a live pin). (AC-20261029-07-9) | The two lanes disagreed on who waives. |
| D10 | Dirty-tree stops become ONE `AskUserQuestion` in both `spec/commands/fix.md` step 1 and `git/commands/merge.md` Step 2 — "commit the unrelated changes first via `/git:commit` (Recommended)" / "stash them with a tagged entry (`git stash push -u -m "<command>: <subject>"`)" / "abort". `fix.md`'s Rules cap becomes "at most FOUR `AskUserQuestion` calls" (dirty tree, decisions stop, waive/reject, Input fallback); `merge.md`'s dirty-tree Report shape is kept for the abort option. (AC-20261029-07-10) | Stashing silently is risky; a bare stop costs the owner a lookup. |
| D11 | `/spec:release` Phase 2: a red leg or a failed journey runs `node "$(spec-paths spec-queue)" add "<leg or journey> red at release <milestone>: <one-line symptom>" --lane fix --top` before the STOP report and lists it under a `queued` slot (added to the Phase 4 report); a journey that cannot be walked asks ONE `AskUserQuestion` — "give access or seed data now and re-walk (Recommended)" / "record it as a blocking finding and stop" — instead of landing as a blocking finding outright. The "A skip is reported by name" rule is kept. (AC-20261029-07-11) | Routing a known defect is not a decision. |
| D12 | `/spec:queue groom` (`queue.md` § Render): an item whose checker returned hard evidence — a named file that exists, or a `done` spec that supersedes it — is ticked with `📌 Auto-picked done — <evidence> (veto anytime)`; only `keep` and ambiguous items are asked, and the file keeps `never tick without a yes` for those. The file stays within its 55-line pin. (AC-20261029-07-12) | The evidence is already in hand. |
| D13 | `git/commands/merge.md` Step 1: when exactly one `spec/*` branch is ahead of the target it is the first option, marked `(Recommended)`; the question is kept. (AC-20261029-07-13) | Keep the ask, add the default. |
| D14 | `spec/.claude-plugin/plugin.json` and `git/.claude-plugin/plugin.json` are bumped via `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"`; `spec/entrypoints.json` gains the new doctrine callers (Contracts). `[no-ac: reviewer-held — plugin-bump --check and entrypoints.test.js are the standing guards]` | Two plugin directories; a new caller of an existing script must be declared. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/run.md | MODIFY | doctrine | Step 0 question (D1); `hard stop` removed |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | ESCALATE step: recommendation + question + `--mark escalate-choice`; fourth-repair refusal names the mark (D2); RED_FINDINGS step classifies findings and prints the `📌`/question text by tier (D3) |
| spec/scripts/lib/gate-fail-count.js | CREATE | scripts | `failCount(text) → number\|null` recognizers (D2) |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | anomaly sentence (D3); `blocked` returns: fallback auto-pick + wave batching (D4); the ESCALATE question named (D2) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | STOPPED step offers the repair round; `--mark repair-round` (D5); ESCALATE step lists the pool and the four options (D6); `waivedWarn` notice (D7) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | Protocol paragraph: STOPPED offers one repair round, ESCALATE is a question (D5, D6) |
| git/commands/merge.md | MODIFY | doctrine | strategy derived from `merge-back inspect` (D8), dirty-tree question (D10), single-ahead-branch default (D13) |
| spec/commands/fix.md | MODIFY | doctrine | step 4 disposition rule (D9), step 1 dirty-tree question + Rules cap (D10) |
| spec/commands/release.md | MODIFY | doctrine | auto-queue on red leg / failed journey, `queued` slot; unwalkable-journey question (D11) |
| spec/commands/queue.md | MODIFY | doctrine | groom tick rule, within 55 lines (D12) |
| spec/entrypoints.json | MODIFY | other | `merge-back.sh` gains `git/commands/merge.md`; `spec-queue.js` gains `spec/commands/release.md` and the two drivers (D14) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D14) |
| git/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D14) |
| tests/build/escalate-choice.test.js | CREATE | tests | AC-20261029-07-2, AC-20261029-07-3 |
| tests/review/stopped-repair-round.test.js | CREATE | tests | AC-20261029-07-5, AC-20261029-07-6, AC-20261029-07-7 |
| tests/merge-back.test.js | MODIFY | tests | AC-20261029-07-14 (one new case; no existing case changes) |
| tests/consistency/dead-stops.test.js | CREATE | tests | AC-20261029-07-1, AC-20261029-07-4, AC-20261029-07-8, AC-20261029-07-9, AC-20261029-07-10, AC-20261029-07-11, AC-20261029-07-12, AC-20261029-07-13 |

## Contracts

`spec/scripts/lib/gate-fail-count.js` — `module.exports = { failCount }`; `failCount(text)`
returns the first match, in this order, else `null`: node:test summary `^(ℹ|#) fail (\d+)$`
(both reporters print `ℹ fail N` when piped — spiked, see A1), then the generic word form
`(\d+) failed` (jest, vitest, pytest summaries). Pure function, no I/O; the driver reads each
`gateRuns[i].log` file and passes its text.

Build driver — `--mark escalate-choice <re-arm|cold|park|amend>` (admitted at `ESCALATE` only):
`re-arm` deletes `gate-cap` (state → REPAIR; the next step prints `round 4 (re-armed past the cap
of 3)` as today); `cold` deletes the `<spec>.build/` sidecar and prints the bare re-run line (the
existing no-sidecar resume arm takes over); `park` records `marks.escalateChoice = "park"` and
prints the exact `node "$(spec-paths spec-queue)" add "<spec rel>: build parked at the repair cap —
<last gate log>" --lane fix --top` line for the session to run, state stays ESCALATE and a bare
re-invocation prints the parked notice instead of the question; `amend` records `"amend"` and
prints: edit the spec's Decisions table (the `decision-added-at-build` incident records it), then
`--mark escalate-choice re-arm`. The ESCALATE step text:

```
## ESCALATE — repair iteration cap (3) reached
recommended: re-arm (failures shrank 9 → 4 → 2)
Ask ONE AskUserQuestion — options, consequences in each description:
  re-arm one more round (Recommended when shrinking) — one more gate run; red again re-trips the cap
  restart cold — the build sidecar is deleted; the next run resumes from the tree as it is
  park and queue a /spec:fix — the build stays parked; the queue's top item is the repair
  amend the spec — edit the Decisions table, then re-arm
Then: node <driver> <spec> --mark escalate-choice <re-arm|cold|park|amend>
```

Review driver — `--mark repair-round` (admitted at `STOPPED` only, cap 1): deletes
`manifest-<n>.jsonl` of the stopped iteration, re-runs legs at `n`; `marks.repairRounds` counts
it. The STOPPED step text ends with the three options and
`Then: node <driver> <spec> --mark repair-round`; after the one round a second red prints
`repair round spent (1 of 1)` and two exits (queue `/spec:fix` / abandon), and the mark is refused
with exit 2 naming the spent cap.

Review driver — ESCALATE step appends, after today's two-exit text:

```
open findings (N):
  s0 [hard] <file>:<line> — <claim>
  leg:<name> exit=<n> count=<c>
Ask ONE AskUserQuestion — options:
  abandon and queue /spec:fix (Recommended) — delete <sidecar>, then node "$(spec-paths spec-queue)" add "<spec>: review escalated at the fix cap — N open findings" --lane fix --top
  waive all and close — a disposer return with every entry waive, then --mark dispositions --file <return.json>
  reject with evidence — every entry reject with the executed contrary evidence quoted, same mark
  re-plan — abandon as above, then spec-queue add "re-plan <spec>: <reason>" --lane plan
```

`spec/entrypoints.json`: `spec/scripts/merge-back.sh`.entryPoints += `git/commands/merge.md`;
`spec/scripts/spec-queue.js`.entryPoints += `spec/commands/release.md`,
`spec/scripts/spec-build-driver.js`, `spec/scripts/spec-review-driver.js` (drop any of the three
the entrypoints guard reports as an overclaim — the drivers print the command as step text).

## Acceptance Criteria

- **AC-20261029-07-1**: WHEN `spec/commands/run.md` Step 0 is read THE SYSTEM SHALL contain `AskUserQuestion`, `--in-place`, `exit the other worktree` and `(Recommended)`, and SHALL NOT contain `hard stop` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-2**: WHEN a build whose gate logs for the three capped red runs carry `ℹ fail 9`, `ℹ fail 4`, `ℹ fail 2` reaches ESCALATE THE SYSTEM SHALL print `recommended: re-arm (failures shrank 9 → 4 → 2)` and `--mark escalate-choice`, accept `--mark escalate-choice re-arm` and then print `round 4 (re-armed past the cap of 3)`; with logs `ℹ fail 3`, `ℹ fail 3`, `ℹ fail 3` it SHALL print `recommended: park (failures did not shrink: 3 → 3 → 3)`; with logs carrying no recognizable summary it SHALL print `recommended: park (failure count not derivable from the gate logs)`; `--mark escalate-choice park` SHALL print a line containing `spec-queue)" add` and `--lane fix --top` and leave `--state` at `ESCALATE`; the fourth `repair-applied` refusal SHALL name `--mark escalate-choice` and SHALL NOT contain `delete` → writes tests/build/escalate-choice.test.js
- **AC-20261029-07-3**: WHEN red-check reports `mixed-pin` for `tests/x.test.js` carrying `AC-20260901-01-1` on a `tier: standard` spec THE SYSTEM SHALL print `📌 Auto-picked split the bullet — tests/x.test.js: AC-20260901-01-1 (veto anytime)` in the RED_FINDINGS step; WHEN it reports `unsanctioned-green` on `tier: standard` the step SHALL contain `📌 Auto-picked remove the AC-ID mention` and SHALL NOT contain `AskUserQuestion`; the same finding on `tier: critical` SHALL contain `AskUserQuestion` and `remove the AC-ID mention (Recommended)` → writes tests/build/escalate-choice.test.js
- **AC-20261029-07-4**: WHEN `spec/doctrine/stages/stage-build.md` § `blocked` returns is read THE SYSTEM SHALL contain `if false`, `📌 Auto-picked`, `same wave` and `ONE` `AskUserQuestion`, and the anomaly paragraph SHALL NOT contain `diagnosed with the user` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-5**: WHEN the review driver's gate leg is red THE SYSTEM SHALL print `STOPPED` with `repair round (Recommended)`, `queue` and `abandon` and `--mark repair-round`; after the gate is made green, `--mark repair-round` SHALL exit 0 and `--state` SHALL read `REVIEWER`; WHEN the gate stays red, `--mark repair-round` SHALL leave `--state` at `STOPPED`, the step SHALL contain `repair round spent (1 of 1)` and a second `--mark repair-round` SHALL exit 2 → writes tests/review/stopped-repair-round.test.js
- **AC-20261029-07-6**: WHEN the review driver reaches ESCALATE with 2 open hard findings THE SYSTEM SHALL print `open findings (2):`, both `s0` and `s1` lines, `AskUserQuestion`, `abandon and queue /spec:fix (Recommended)`, `waive all and close`, `reject with evidence` and `re-plan` → writes tests/review/stopped-repair-round.test.js
- **AC-20261029-07-7**: WHEN a review whose disposer return waives 1 hard finding reaches CLOSE THE SYSTEM SHALL print `1 finding(s) waived at DISPOSITIONS (recorded)` and SHALL NOT print `confirm in the close report` → writes tests/review/stopped-repair-round.test.js
- **AC-20261029-07-8**: WHEN `git/commands/merge.md` is read THE SYSTEM SHALL contain `merge-back)" inspect`, `RECOMMEND` and `📌 Auto-picked`, and SHALL NOT contain `always ask` nor `1 commit → fast-forward` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-9**: WHEN `spec/commands/fix.md` is read THE SYSTEM SHALL contain `only the user waives` and `4. **Fresh review.**`, and SHALL NOT contain `or state why not` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-10**: WHEN `spec/commands/fix.md` step 1 and `git/commands/merge.md` Step 2 are read THE SYSTEM SHALL each contain `AskUserQuestion`, `/git:commit` followed by `(Recommended)` on the same line, and `git stash push -u -m`; and `fix.md` SHALL contain `at most FOUR` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-11**: WHEN `spec/commands/release.md` is read THE SYSTEM SHALL contain `spec-queue)" add` and `--lane fix --top` inside Phase 2, a `queued` slot in Phase 4, and an `AskUserQuestion` whose text names `access or seed data` and `(Recommended)`, and SHALL NOT contain `is a **blocking finding**, not a skip` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-12**: WHEN `spec/commands/queue.md` § Render is read THE SYSTEM SHALL contain `📌 Auto-picked done` and `never tick without a yes`, and the file SHALL have at most 55 lines → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-13**: WHEN `git/commands/merge.md` Step 1 is read THE SYSTEM SHALL contain `exactly one` and `(Recommended)` → writes tests/consistency/dead-stops.test.js
- **AC-20261029-07-14**: WHEN `merge-back.sh inspect` runs on a source 3 commits ahead of the target THE SYSTEM SHALL CONTINUE TO print `RECOMMEND: merge-commit`, and on a source 7 commits ahead SHALL CONTINUE TO print `RECOMMEND: squash` → writes tests/merge-back.test.js

## Assumptions (escalation triggers)

- A1 (spiked 2026-10-31): `node --test` prints its fail summary as `ℹ fail N` when stdout is a pipe, under both the default reporter and `--test-reporter=spec`, and with the host's `--test-timeout=45000 --test-force-exit` flags. Check run on node v26.8.1 against a 3-test file with 2 failures: default reporter piped → `ℹ tests 3` / `ℹ pass 1` / `ℹ fail 2`; spec reporter piped → identical; with the host flags → `ℹ fail 2`. — **if false** on another Node line (TAP `# fail N`): the recognizer already admits the `#` prefix; a third shape returns `null` and the recommendation falls to `park (… not derivable …)`, never a wrong re-arm.
- A2: The build fixture's gate command can be made to emit a chosen `ℹ fail N` line per round (a shell gate reading a counter file is enough). — **if false:** AC-2's trend cases drive the real `node --test` with N deliberately failing tests per round; the assertion text is unchanged.
- A3: `jest`/`vitest`/`pytest` summaries contain `<N> failed` (unverified here — none is installed). — **if false:** `failCount` returns `null` for that host and the ESCALATE recommendation is `park (… not derivable …)`; the recognizer list is extended in a Direct-lane commit.
- A4: The review driver's `dispositionPools(n)` yields the ESCALATE pool in DISPOSITIONS order (hard survivors `s<i>`, then legs). — **if false:** the ESCALATE step lists whatever the disposer return file carries, in file order; AC-6's literals stay.
- A5: Re-running legs at the same iteration number after deleting its manifest reproduces today's manual STOPPED remedy exactly (the driver comment: "delete the sidecar (or just this iteration's manifest) … restarts at LEGS"). — **if false:** `repair-round` runs legs at `n+1` without `--fix-delta`; AC-5's assertions are state-level and unchanged.
- A6: `entrypoints.test.js` flags an undeclared doctrine caller of `merge-back.sh`/`spec-queue.js` and an overclaimed one alike. — **if false** (one direction is not checked): keep only the rows the guard demands, recorded as a deviation.
- A7: `tests/queue/queue-hygiene.test.js` pins `queue.md` at ≤55 lines and `never tick` in § Render; `tests/consistency/model-placement.test.js` pins fix.md's `4. **Fresh review.**` paragraph and its reviewer dispatch line; `tests/review/escalate-row-step.test.js` pins the ESCALATE literals D6 lists; `tests/release-legs/unmeasured.test.js` and `rollback.test.js` pin release.md's UNMEASURED and rollback text. All are kept green by the Decisions as written. — **if false** (a pin not listed here reddens): update it in place and retag with this spec's AC-ID, never weaken it.
- A8: `specs/20261029/08-the-policy-round-at-init.md` (draft) also edits run.md, stage-review.md, merge.md and both drivers; it is re-planned against the tree this spec leaves. — **if false** (08 locks first): this spec rebases its doctrine edits onto 08's; no Decision here conflicts with a `policy` read.

## Rationale

Anthropic's guidance for autonomous runs says a valid stop is one where nothing can move without
the human; the audit found twelve stops where the next move was known and only the file to
delete or the flag to pass was missing. Each becomes a question whose recommended option is
derived from evidence the driver already holds (a failure trend, a fallback written at plan time,
a commit count). The two contradictions are resolved toward the stricter side: strategy derived
(no product consequence), waivers human (a product consequence).

Tier is standard, not critical as the first draft said: that draft planned to edit
`merge-back.sh`, but grounding showed `inspect` already prints the `RECOMMEND:` line on stdout
and `/git:merge` only has to read it, so no Risk Tiers surface is touched. The build and review
drivers are not listed triggers; the state-gate hook is untouched.

D2's trend needs a failure count the driver never recorded. Rather than a new config field
(a grounding-contract edit flags every host stale), a small recognizer lib reads the retained
gate logs; node:test's `ℹ fail N` was verified by spike, other runners fall to `null` → `park`.
A wrong re-arm costs one gate run; a wrong park costs a question — so unknown → park.

D4 is doctrine only: worker returns reach the session, never the driver, so the driver cannot
print the batched question; the pin is a prose read like this repo's other doctrine-only
decisions (specs/20261029/05 D5).

D5 mechanizes exactly the remedy the STOPPED step already prints by hand (delete the manifest,
re-run) and caps it at one so a flapping gate cannot loop. A second GATE_RED row lands on the
ledger for the second red; that is a faithful record, not a defect. D6 recommends an exit route,
not a disposition — `docs/canonical/review.md`'s "the driver never recommends a disposition"
holds: waive/reject still come from a disposer return the user adjudicates.

User rulings (2026-10-31): /git:merge derives strategy for every branch, feature branches
included (the `📌` line is the veto window); the waived-findings re-confirmation is dropped on
every tier.

Collision closure (lock, literals leg, 14 hits): in-plan fixes — `hard stop` in run.md;
`always ask` in merge.md and the spec plugin.json changelog (rotated by the bump); `confirm in
the close report` in the review driver; `or state why not` in fix.md; the blocking-finding
sentence in release.md. Waived — `hard stop` in `docs/audit/*` and `docs/roadmap/07-*` (waived
prefixes), in `docs/canonical/review.md` ("pre-panel hard stop" names the RED_BLOCKING state
D5 keeps, now with a repair round in front of it) and inside the review driver's own
`hard-stop`/`hard-stopped` identifiers and comments (the state is kept); `always ask` in
`docs/canonical/genesis.md` and `spec/doctrine/genesis.md` ("paid services are always asked" —
a different rule).

Rejected: dropping the escalate questions in favour of automatic re-arm. A capped run is the one
place the pipeline has decided it cannot judge; the cap exists to hand over. Rejected: a
`failCountPattern` config field — correct but a contract edit for a recommendation heuristic.

## Canonical Delta

docs/canonical/pipeline.md § One command per feature: replace "a worktree that cannot be created
stops the run rather than continuing on the current branch" with "a worktree that cannot be
created asks one question — exit the other worktree and retry, or run `--in-place` — and never
silently continues on the current branch". Append: "Every terminal stop in build and review is a
question with a recommended default derived from the run's own evidence: the build's repair-cap
stop recommends re-arm or park from the failure-count trend of its gate logs and takes
`--mark escalate-choice`; the review's red-leg stop offers one in-session repair round
(`--mark repair-round`, cap 1) before `/spec:fix`; the review's fix-cap stop lists the open
findings and recommends abandon-and-queue. Merge strategy is derived in every command from
`merge-back.sh inspect`'s RECOMMEND line. Only the user waives, in every lane — `/spec:fix`
included. (specs/20261029/07)"
docs/canonical/review.md: after the sentence on `--mark dispositions --file`, add "A waived
finding is recorded at DISPOSITIONS and listed at CLOSE as a notice; it is never re-confirmed."
