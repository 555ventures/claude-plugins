---
date: 2026-09-01
status: hardened
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/01-build-driver.md", "specs/20260901/02-run-provenance.md"]
depended_on_by: []
brief: 18
open_markers: 0
---

# Unified Build Loop — `/spec:build` carries a spec from hardened to done

## Goal

After `/spec:plan`, one command finishes a feature. `/spec:build <spec>` derives the next
stage from disk with the routing `spec-status.js` already owns, runs design (unchanged
internals) when due, then the build driver, then the review driver, and stops only at a human
gate, a checkpoint, or `done`. One checkpoint is mandatory and enforced: the session that
dispositions review findings must have no memory of the build's trade-offs, so the review
driver, when reached through the loop, refuses DISPOSITIONS until the session id in the stamp
has changed (a `/clear` and re-run). The pre-merge stop is the existing step-out of the
worktree — never a forced clear (JJ ruling 2026-09-01). The doctrine sentence that gave each
transition one command gives it one driver state instead (wording approved 2026-09-01), the
state gate admits `/spec:build` on `done`, the README loop becomes plan → build, and the fleet
reader answers the brief's kill condition with escapes-per-CLEAN split by `via`. Done means: a
fixture host's review driver invoked `--via loop` parks at CHECKPOINT with the same session id
and admits DISPOSITIONS with a new one; the gate admits `/spec:build` on a done spec; the
fleet query prints two numbers.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `/spec:build` is the loop. Each invocation derives the stage from disk in this order and executes it in-session: (a) `status: hardened`, `design: true`, no `designed:`, host config declares a `design` block → execute `spec/commands/design.md`'s steps unchanged, then re-derive; (b) `hardened`, or `implementing` with no `<spec>.review/` sidecar → run `spec-build-driver.js <spec> --via loop` to DONE; then in the same invocation (c) `implementing` or `done` → run `spec-review-driver.js <spec> --via loop` until it prints CHECKPOINT, a judgment step, or DONE; (d) `done` with no review sidecar → the review driver's own cold path prints DONE with `spec-status --next` (the no-op). `[no-ac: command prose — the routing predicates are pinned on the drivers and the state gate (AC-20260901-03-1..5); the loop itself is session behavior]` | Brief 18 § Scope 3; the routing is `spec-status.js`'s `deriveNext` order, restated not re-derived. Rejected: a third driver wrapping the two — the drivers already print one step at a time; the loop is just "run the next driver". |
| D2 | Checkpoints. After the build driver's DONE the loop prints `✅ checkpoint — build complete; safe to /clear and re-run /spec:build <spec>` and continues into the review driver (legs and the reviewer dispatch need no build memory). The review driver, when its sidecar records `via: "loop"`, lands a new state `CHECKPOINT` between `reviewer-returned` and `DISPOSITIONS`: at `reviewer-returned` it records `checkpoint: {sessionId}` from `readSessionStamp(repoRoot)`; a bare invocation whose current stamp `session_id` equals the recorded one prints `## Step: checkpoint — /clear, then re-run /spec:build <spec>`; `--mark dispositions` is refused (exit 2, same remedy) while they are equal; a differing stamp admits DISPOSITIONS and records `checkpointCleared: true`, which is never reset by a later `reviewer-returned` — the checkpoint fires once per run. No stamp file at `reviewer-returned` → the checkpoint degrades to a printed warning naming `.claude/spec-session.json` and DISPOSITIONS is admitted. `via: "direct"` runs never see CHECKPOINT. (AC-20260901-03-2, AC-20260901-03-3, AC-20260901-03-4, AC-20260901-03-5) | The one thing a separate session bought (brief 18) is kept and made deterministic: sibling 02's A4 shows `/clear` changes the session id, so equality is the honest "same session" test. Once per run: a fix cycle's memory is this session's own dispositions, not the build's. |
| D3 | The pre-merge stop is the review driver's existing relocation refusal (`--mark merge-strategy` refused while the inherited CWD is inside the build worktree, remedy `ExitWorktree(action="keep")` / `cd <mainRoot>`); the loop prints it as the step and nothing more. `[no-ac: unchanged behavior — specs/20260820/07 D6's existing pin covers the refusal]` | JJ ruling 2026-09-01: step-out only, no forced `/clear` — one fewer paste per feature; the driver re-derives its place either way. |
| D4 | `spec/doctrine/core.md` § State Machine: the sentence "Transitions owned by exactly one command each: `/spec:plan` → `hardened`, `/spec:build` → `implementing`, `/spec:review` → `done`;" becomes "Transitions owned by exactly one driver state each: `/spec:plan`'s lock → `hardened`; the build driver's preflight → `implementing`; the review driver's close → `done`. `/spec:build` runs both drivers in sequence; `/spec:review` remains the review driver's direct entry;" — the rest of the paragraph (superseded, design, the hook) unchanged. `[no-ac: doctrine prose — behavior is pinned by AC-20260901-03-1 and the drivers' own suites; regexes over prose are not tests (host § Test Rules)]` | Approved wording, JJ 2026-09-01. The heading stays byte-identical (`spec-paths` section maps cite it). |
| D5 | `spec-state-gate.sh` admits `/spec:build` on `hardened|implementing|done`; `/spec:design` (`hardened`) and `/spec:review` (`implementing|done`) admissions and the marker gate are unchanged; the header comment and the refusal message name the new set. (AC-20260901-03-1) | Brief 18 § Scope 3: `done` is the loop's resume-after-checkpoint entry (MERGE/REPLAY) and its no-op. The hook stays a prompt-boundary check — internal transitions are verified by the drivers, so it need not re-fire (brief 18 seam 2, resolved by D4). |
| D6 | `build.md` gains the outer-loop protocol (D1's routing, the two checkpoints, the report per stop) within the 500-line read-load budget; `review.md` gains a two-sentence note that it is the review driver's direct entry point and that the loop reaches the same driver with `--via loop`; `design.md` is unchanged. (AC-20260901-03-8) | Brief 18 § Scope 4; core § Doctrine Authoring (one binding home — the loop's routing lives in build.md, the driver steps in the drivers). |
| D7 | `README.md`: the per-feature loop becomes `/spec:plan` then `/spec:build`; `/spec:design` and `/spec:review` move to the reference table as resume entry points; the intro's "plan → design → build → review" becomes "plan → build". `[no-ac: README prose; the single high-value README rule]` | Brief 18 § Scope 4. |
| D8 | `spec/entrypoints.json`: `build.md` gains the edge to `spec-review-driver.js` (and keeps `spec-build-driver.js`); `review.md` keeps its driver edge. (AC-20260901-03-9) | The live-green entrypoints pin forward-verifies every declared edge. |
| D9 | `fleet-reader.js` gains the seventh fixed question `cleanByVia`: per repo and fleet-total, for each bucket `loop` / `direct` / `unknown` (review rows lacking `via`), `{cleans, contradicted}` using the exact `reviewRunId ↔ runId` join `cleanContradicted` uses; `--json` gains the key `cleanByVia`; the human render prints one line `escapes-per-CLEAN by via: loop <c>/<n> · direct <c>/<n> · unknown <c>/<n>`. The kill condition reads the two rates. (AC-20260901-03-6, AC-20260901-03-7) | Brief 18 § Scope 5. The reader's header says a seventh question needs a spec — this is it. Placed here, not in 02, because `loop` rows first exist with the loop. |
| D10 | No loop-length cap. The unattended stretch is bounded by construction: design's blocking look, build's `blocked`-return and RED_FINDINGS stops, and the mandatory CHECKPOINT before DISPOSITIONS. `[no-ac: a decision not to build — nothing to assert]` | Brief 18 open question 5; a numeric cap would be a second stop rule with no measured need. |
| D11 | Every stop prints one report via `report-render.js`: `outcome` from the driver's state, `next` = the literal re-run command at a checkpoint (`/spec:build <spec>` — a same-spec chain the stage owns) or `spec-status --next` verbatim at DONE. `[no-ac: report shape is pinned by the report-render suite; the slot choice is command prose]` | core § Console Output Style. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/build.md | MODIFY | doctrine | D1, D2, D6, D11: outer-loop protocol; ≤ 500-line read load |
| spec/commands/review.md | MODIFY | doctrine | D6: direct-entry note |
| spec/doctrine/core.md | MODIFY | doctrine | D4: § State Machine sentence, approved wording verbatim |
| spec/scripts/spec-state-gate.sh | MODIFY | scripts | D5: `/spec:build` admits `done`; header + message |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D2: CHECKPOINT state, `checkpoint`/`checkpointCleared` marks, dispositions refusal, no-stamp degrade |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D9: `cleanByVia` + render line |
| README.md | MODIFY | other | D7 |
| spec/entrypoints.json | MODIFY | doctrine | D8 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version bump target 7.50.0 + changelog paragraph (next free version if taken) |
| .claude-plugin/marketplace.json | MODIFY | doctrine | D7: the marketplace description's "plan → design → build → review" becomes "plan → build" (collision-closure literals hit, 2026-09-01) |
| tests/state-gates.test.js | MODIFY | tests | AC-20260901-03-1 (flip the `done` pin in place; tag the design/review pins with the SHALL CONTINUE TO AC) |
| tests/review/loop-checkpoint.test.js | CREATE | tests | AC-20260901-03-2, AC-20260901-03-3, AC-20260901-03-4, AC-20260901-03-5 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260901-03-5 (tag the existing reviewer-returned → DISPOSITIONS test in place) |
| tests/fleet-reader/queries.test.js | MODIFY | tests | AC-20260901-03-6, AC-20260901-03-7 |

Orchestrator duty (outside the table): `tests/consistency/read-load.test.js` and
`tests/consistency/entrypoints.test.js` are the live oracles for AC-20260901-03-8 and
AC-20260901-03-9; they are not edited.

## Contracts

```
spec-review-driver.js  (additions)
  state CHECKPOINT   — reached only when review-state.json has via:"loop", reviewer-returned is
                       fresh for iteration n, checkpointCleared is not true, and
                       readSessionStamp(repoRoot).sessionId === marks.checkpoint.sessionId
  review-state.json gains: checkpoint: { sessionId: string|null }, checkpointCleared: bool
  printed step:
    [spec-review-driver] state: CHECKPOINT  spec: <spec>
    ## Step: checkpoint — /clear, then re-run /spec:build <spec>
    The session that built this spec must not disposition its review. Clear, re-run, and the
    driver resumes at DISPOSITIONS.
  --mark dispositions while at CHECKPOINT -> exit 2, same remedy, state unchanged
  no stamp at reviewer-returned -> stderr warning naming .claude/spec-session.json;
                                   checkpoint: { sessionId: null }; DISPOSITIONS admitted

spec-state-gate.sh
  /spec:build  -> hardened | implementing | done   (was hardened | implementing)
  /spec:design -> hardened                          (unchanged)
  /spec:review -> implementing | done               (unchanged)

fleet-reader.js --json  (additions)
  cleanByVia: {
    total: { loop: {cleans, contradicted}, direct: {cleans, contradicted}, unknown: {cleans, contradicted} },
    byRepo: [ { name, loop: {…}, direct: {…}, unknown: {…} } ]
  }
  human: "escapes-per-CLEAN by via: loop <contradicted>/<cleans> · direct <c>/<n> · unknown <c>/<n>"

core.md § State Machine (approved wording, verbatim replacement of one sentence):
  Transitions owned by exactly one driver state each: `/spec:plan`'s lock → `hardened`; the
  build driver's preflight → `implementing`; the review driver's close → `done`. `/spec:build`
  runs both drivers in sequence; `/spec:review` remains the review driver's direct entry;
```

## Behavior

The loop, per invocation of `/spec:build <spec>` (build.md prose, D1):

| On disk | The loop does |
|---|---|
| `hardened`, `design: true`, no `designed:`, host has a `design` block | design.md's steps (its blocking look is a stop); then re-derive |
| `hardened` / `implementing`, no `<spec>.review/` | build driver `--via loop` until DONE (each printed step is executed; a `blocked` return or RED_FINDINGS that needs the user is a stop); print the advisory checkpoint; continue |
| `implementing` / `done` with `<spec>.review/` or build just finished | review driver `--via loop`; execute each printed step; CHECKPOINT is a stop that ends the invocation with the re-run command as `next` |
| `done`, no `<spec>.review/` | the driver's cold DONE: `spec-status --next` |

After a `/clear` the user re-pastes `/spec:build <spec>`; the state gate admits it on `done`
and the loop lands on the review driver at DISPOSITIONS (new session id), CLOSE, MERGE (the
relocation refusal is printed as the step), REPLAY, DONE.

## Acceptance Criteria

- **AC-20260901-03-1**: WHEN the state gate receives a `/spec:build <spec>` prompt against `status: done` THE SYSTEM SHALL exit 0; WHEN it receives `/spec:build` against `hardened` or `implementing` THE SYSTEM SHALL CONTINUE TO exit 0; WHEN it receives `/spec:design` against `draft` or `/spec:review` against `draft` THE SYSTEM SHALL CONTINUE TO exit 2, and `/spec:design` against `hardened` and `/spec:review` against `implementing` SHALL CONTINUE TO exit 0 (the existing assertions, tagged in place) → `tests/state-gates.test.js`
- **AC-20260901-03-2**: WHEN the review driver was created with `--via loop`, a stamp `{"session_id":"s1",…}` exists at `reviewer-returned`, and the stamp still reads `s1` THE SYSTEM SHALL print `state: CHECKPOINT` with a step body containing `/clear` and `/spec:build`, `--state` SHALL print `CHECKPOINT`, and `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0` SHALL exit 2 leaving the state `CHECKPOINT` → `tests/review/loop-checkpoint.test.js`
- **AC-20260901-03-3**: WHEN the stamp is rewritten to `{"session_id":"s2",…}` after AC-20260901-03-2's parking THE SYSTEM SHALL print `state: DISPOSITIONS`, accept `--mark dispositions …`, and record `checkpointCleared: true` in `review-state.json` → `tests/review/loop-checkpoint.test.js`
- **AC-20260901-03-4**: WHEN `checkpointCleared` is true and a fix cycle brings a second `reviewer-returned` in the same session (stamp unchanged at `s2`) THE SYSTEM SHALL print `state: DISPOSITIONS`, never `CHECKPOINT`; WHEN a `--via loop` run reaches `reviewer-returned` with no stamp file THE SYSTEM SHALL print a stderr warning containing `.claude/spec-session.json` and admit DISPOSITIONS → `tests/review/loop-checkpoint.test.js`
- **AC-20260901-03-5**: WHEN the review driver is created without `--via` (or `--via direct`) THE SYSTEM SHALL CONTINUE TO print `state: DISPOSITIONS` directly after `reviewer-returned`, with no CHECKPOINT and no `checkpoint` key in `review-state.json`, whether or not a stamp exists → the existing reviewer-returned → DISPOSITIONS test in `tests/review/review-driver.test.js` (AC-20260820-07-6), tagged in place, plus the stamp-present variant in `tests/review/loop-checkpoint.test.js`
- **AC-20260901-03-6**: WHEN a repo's ledger holds review rows `{runId:"rv_a",verdict:"CLEAN",via:"loop"}`, `{runId:"rv_b",verdict:"CLEAN",via:"loop"}`, `{runId:"rv_c",verdict:"CLEAN",via:"direct"}`, `{runId:"rv_d",verdict:"CLEAN",via:"direct"}`, `{runId:"rv_e",verdict:"CLEAN",via:"direct"}`, `{runId:"rv_f",verdict:"CLEAN"}` and escape rows `{reviewRunId:"rv_a"}`, `{reviewRunId:"rv_f"}`, `{reviewRunId:null}` THE SYSTEM SHALL emit `cleanByVia.total` = `{"loop":{"cleans":2,"contradicted":1},"direct":{"cleans":3,"contradicted":0},"unknown":{"cleans":1,"contradicted":1}}` and one `byRepo` entry with the same numbers → `tests/fleet-reader/queries.test.js`
- **AC-20260901-03-7**: WHEN the fleet reader renders the human report over AC-20260901-03-6's fixture THE SYSTEM SHALL print the line `escapes-per-CLEAN by via: loop 1/2 · direct 0/3 · unknown 1/1` → `tests/fleet-reader/queries.test.js`
- **AC-20260901-03-8** `[oracle: gate]`: WHEN `tests/consistency/read-load.test.js` runs THE SYSTEM SHALL find `/spec:build` and `/spec:review` each at or under 500 lines including their `shared-for` sections
- **AC-20260901-03-9** `[oracle: gate]`: WHEN `tests/consistency/entrypoints.test.js` runs THE SYSTEM SHALL find `spec/commands/build.md` declared as an entry point of `spec/scripts/spec-review-driver.js` with a real invocation literal, and zero forward, reverse, or reachability violations

## Assumptions (escalation triggers)

- A1: Executed 2026-09-01 (sibling 02 A4) — `/clear` starts a new session id and transcript file, so the stamp's `session_id` differs after a clear and the D2 equality test is the honest same-session check — **if false:** D2 degrades to the advisory print with `checkpoint: {sessionId: null}` semantics; the loop still stops and prints the instruction.
- A2: Executed 2026-09-01 — `spec-state-gate.sh` with `{"prompt":"/spec:build specs/x/01-a.md"}` against `status: done` exits 2 today with `requires status: hardened (or implementing to resume)`; the pinning assertion is `tests/state-gates.test.js:40` — **if false:** nothing to change on the gate; drop the row.
- A3: The review driver's `deriveState()` returns `REVIEWER` when `reviewerReturnIteration !== n` and `DISPOSITIONS` when `dispositionsIteration !== n`, consecutively — the CHECKPOINT check is inserted between them; `handleReviewerReturned` resets `dispositions`/`pendingFix` and is where `checkpoint.sessionId` is recorded — **if false:** the worker returns `blocked`; the insertion point is decided here.
- A4: `fleet-reader.js`'s `computeCleanContradicted` materializes `cleanRows` per repo and joins escape `reviewRunId` against a `Set` of `runId`; D9 turns that `Set` into a `Map(runId → row)` inside a sibling function and leaves `cleanContradicted`'s output byte-identical — **if false (the existing query must change shape):** STOP, ask the user; `cleanContradicted` is an AC-pinned `--json` key.
- A5: `tests/consistency/read-load.test.js` measures build at 342 and review at 381 of 500 today (executed 2026-09-01), leaving 158 and 119 lines for D6's prose — **if false:** trim the shell prose; never touch the cap.
- A6: `design.md`'s steps can be executed in-session by build.md's loop without change: its resume table derives from disk and its blocking look is an `AskUserQuestion` — **if false:** the loop prints `/spec:design <spec>` as the next command instead and stops; design internals stay out of scope (brief 08).

## Rationale

**Why the checkpoint is enforced, not printed.** The printed-reminder form was measured to
fail for replay (core § Feedback Loop: skipped through 12+ reviews while printing every
time). The disposition clear is the one thing the separate review session bought; if it can
be walked past, the loop has traded a real property for convenience. Session-id equality is
cheap, deterministic, and degrades honestly when the stamp is missing.

**Why once per run.** A fix cycle's second reviewer pass is judged by the session that
dispatched the fix — its own dispositions, not the build's trade-offs. Forcing a clear per
iteration would multiply touches for no independence gain.

**Why no forced clear before merge.** JJ's ruling: the merge needs the session outside the
worktree, which `ExitWorktree(action="keep")` does in place; the driver's relocation refusal
already stops the run. One fewer paste per feature.

**Why the doctrine sentence changes and the hook does not re-fire.** The hook checks the
prompt boundary; inside one invocation the drivers verify every transition against artifacts
before flipping status. Ownership by driver state is the true invariant; the old sentence
described the pre-driver world.

**Why `unknown` is a bucket.** Review rows written before sibling 02 have no `via`; folding
them into `direct` would bias the baseline the kill condition compares against.

**What is fragile.** Two sessions prompting `/spec:` in one root make the stamp's session id
change without a `/clear` (sibling 02 D9); the checkpoint would then admit DISPOSITIONS in
the build session. Rare, ledger-invisible, accepted. `design.md` executed in-session is a
prose command run by a prose command; A6 names the fallback.

**Collision closure (executed at lock, 2026-09-01).** Literals leg for `owned by exactly one
command` and `design → build → review`: `spec/doctrine/core.md`, `README.md`, and
`.claude-plugin/marketplace.json` are File Plan rows; `docs/roadmap/00-overview.md` and
`docs/roadmap/18-unified-build.md` are waived — roadmap prose is historical record under the
sweep's own waived prefixes, never a live claim. Executes leg for `spec-state-gate.sh`:
`tests/state-gates.test.js` is a File Plan row; `tests/consistency/red-fixture-coverage.test.js`
(the `open_markers` block) and `tests/consistency/entrypoints.test.js` exercise paths D5 does not
touch and stay green unchanged.

**Kill condition (brief 18 § Scope 5).** Over the next 30 fleet reviews, if `loop` CLEANs are
contradicted by escapes at a higher rate than `direct` CLEANs, the loop reverts to three
commands. `cleanByVia` prints both rates.

## Canonical Delta

Append to `docs/canonical/pipeline.md` a section `## One command per feature`:

After `/spec:plan`, `/spec:build <spec>` derives the stage from disk and runs design (when
due), the build driver, and the review driver in sequence, each with `--via loop`. Status
transitions are owned by driver states, not commands: plan's lock → `hardened`, the build
driver's preflight → `implementing`, the review driver's close → `done`; the state gate
admits `/spec:build` on all three and stays a prompt-boundary check. One checkpoint is
enforced: a loop-driven review parks at CHECKPOINT after the reviewer returns and admits
DISPOSITIONS only once the session id in `.claude/spec-session.json` has changed (a `/clear`),
once per run, degrading to a warning when no stamp exists. The pre-merge stop is the
worktree step-out, never a forced clear. `/spec:design` and `/spec:review` remain direct entry
points to the same drivers. The loop is scored by the fleet reader's `cleanByVia`
(escapes-per-CLEAN by `via`); a `loop` rate above the `direct` rate over 30 fleet reviews
reverts the loop.
