---
date: 2026-09-01
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/05-checkpoint-fail-closed.md"]
depended_on_by: ["specs/20260901/10-spec-run-command.md"]
brief: 18b
open_markers: 0
build_base: 931c80c4756ce0e1ef36a2050b1577657bd8a54f
diff_base: 931c80c4756ce0e1ef36a2050b1577657bd8a54f
---

# Independent dispositions — a fresh-context disposer replaces the session-change checkpoint

## Goal

The loop no longer parks after the reviewer returns. The property that park protected —
the mind dispositioning review findings has no memory of the build's trade-offs — moves to a
fresh-context `spec:disposer` agent (the reviewer's shape: read-only, paths only, the
session's model) whose return the review driver refuses to advance without. Fix
recommendations dispatch without a question; waive and reject recommendations go to the
user, because only the user waives. The mechanism applies to both review entries, so the
loop and `/spec:review` run one DISPOSITIONS protocol, and every review row records the
outcome and how many recommendations the user overrode. Done means: a fixture host's review
driver lands DISPOSITIONS directly after `reviewer-returned` on both entries, refuses
`--mark dispositions` on non-empty pools without a valid disposer return, accepts one that
covers every finding, and the close row says `checkpoint: {"outcome":"disposer","overrides":N}`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The disposer agent.** `spec/agents/disposer.md` is a new plugin agent (`subagent_type: 'spec:disposer'`), frontmatter `model: inherit`, `tools: Read, Grep, Glob, Bash`, read-only exactly like `spec/agents/reviewer.md` (inspection and repro only; one scratch repro file it deletes before returning; never git state changes). Its doctrine: ground in the host rules, canonical docs, and the spec (Decisions, Contracts, ACs, Rationale) exactly as the reviewer does; for every survivor in the reviewer return and every non-blocking failing leg row in the manifest, return one recommendation `fix` \| `waive` \| `reject` with a reason that quotes the sanctioning spec line or cites an executed check — `reject` only on executed contrary evidence or a demonstrated miscitation, `waive` only on a quoted spec sanction or an explicit out-of-scope ruling, otherwise `fix`. It never sees a build narrative; it is handed paths (spec, pipeline rules, reviewer return, manifest, evidence dir, diff base, root). Return contract in Contracts. `[no-ac: agent doctrine — its enforceable half (return shape, coverage, grounding fields) is pinned on the driver by AC-20260901-09-3 and AC-20260901-09-4; prose pins are not tests (host § Test Rules)]` | Core § Model Placement: independence comes from fresh-context, blind-to-author dispatch. Claude Code's sub-agents doc (A1): `model: inherit` = the main conversation's model; a subagent "doesn't see your conversation history". Rejected: reusing `spec:reviewer` with a disposition prompt (Sonnet-pinned, and the reviewer must never adjudicate — review.md's own rule). |
| D2 | **The driver requires the return.** `spec-review-driver.js`: `--mark dispositions --file <disposer return> --waived N --rejected N --fix-dispatched N`. The pools are the reviewer return's `survivors` (indexed from 0) and the current manifest's rows with `exit !== 0` whose `leg` is not in `BLOCKING_LEGS` — the same two lists the DISPOSITIONS step prints today. When either pool is non-empty, `--file` is required. The driver verifies, in order, refusing with exit 2, the state and sidecar unchanged, and the message naming the failing check: file absent/unreadable; not valid JSON; `verdict === "DISPOSER_FAILED"`; `dispositions` not an array; a survivor index or failing leg with zero entries (names the uncovered ref) or more than one (names the duplicate); an entry whose `ref` matches nothing in either pool; `recommended` outside the enum; `reason` absent or blank after trim; `final` present and outside the enum; `final` present and `!== recommended` without both `overriddenBy === "user"` and a non-blank `overrideReason`; and `--waived`/`--rejected`/`--fix-dispatched` not equal to the counts of `final ?? recommended` over the entries. On success the raw file is copied to `<sidecar>/disposer-return-<n>.json`, and `review-state.json` gains `disposer: {file, iteration: n, overrides: k}` where `k` counts entries whose `final` differs from `recommended`. When both pools are empty, `--file` is not required (a passed file is ignored) and the driver records `disposer: {file: null, iteration: n, overrides: 0, empty: true}`. Every iteration needs its own return: a fix-delta pass's second `reviewer-returned` resets `disposer` exactly as it resets `dispositions` today. (AC-20260901-09-2, AC-20260901-09-3, AC-20260901-09-4, AC-20260901-09-5, AC-20260901-09-7) | The gate must be mechanical and unskippable — the driver, not the session, holds it (core § Feedback Loop: printed reminders are walked past). The count check reuses the contradiction arithmetic verdict.js already runs. Rejected: once-per-run (03 D2's "the second pass is judged by the session that dispatched the fix") — a fresh return per iteration is one cheap dispatch and one rule instead of two. |
| D3 | **Fix without asking; ask only to let a finding stand** (JJ ruling 2026-09-01). `review.md` § Rules, the DISPOSITIONS bullet, is rewritten: dispatch ONE `Agent {subagent_type: 'spec:disposer'}` with the paths the driver's step prints; apply every `fix` recommendation by dispatching Sonnet workers (host `agentMap`) with no question; present every `waive`/`reject` recommendation to the user via `AskUserQuestion` (≤4 per call, the disposer's reason quoted, its recommendation first and labelled), and record the user's answer as `final` with `overriddenBy: "user"` and `overrideReason` when it differs; the session never changes a recommendation on its own and never asks about a `fix` — it may attach `sessionNote` to an entry (informational; the driver ignores it). Waive/Reject rulings still land in the spec's Rationale with date + reason. The reviewer-dispatch bullet is unchanged. `[no-ac: command prose — the enforceable half is D2's driver checks; a question the session asks cannot be observed by a script]` | Core § Question Style: derive before asking; a `fix` is the conservative disposition (reversible, re-reviewed by the fix-delta pass) so it owes no question; a waive is the one call only the user may make (review.md: "only the user waives"). |
| D4 | **CHECKPOINT retired.** `spec-review-driver.js` removes the `CHECKPOINT` state, `checkpointStillParked()`, `checkpointStamp()`, the stamp read and stderr line in `handleReviewerReturned`, the `checkpoint`/`checkpointCleared`/`checkpointOverride` marks, the CHECKPOINT step body, and the `--skip-independence-check-because` branch. `deriveState()` goes `REVIEWER → DISPOSITIONS` for both `via` values. `--mark dispositions` carrying `--skip-independence-check-because` (with or without a value) is refused: exit 2, state unchanged, message naming the flag as retired by ADR-0005 — never silently ignored. A `review-state.json` written by 7.53.0 that still carries `checkpoint`/`checkpointCleared` keys is read without error and lands DISPOSITIONS (unknown keys are never consulted). `readSessionStamp` stays imported: `sessionModel` still derives the row's `model` from the stamp. (AC-20260901-09-1, AC-20260901-09-8, AC-20260901-09-9) | ADR-0005 option B. The stamp hook and lib are unchanged — only the comparison dies. Refusing the retired flag by name keeps a stale doctrine copy or memory from silently succeeding. |
| D5 | **`verdict.js` outcome enum.** `--checkpoint <disposer\|empty\|not-reached>` and `--checkpoint-overrides <N>` (non-negative integer, valid only with `--checkpoint disposer`; `disposer` without it defaults to `0`). Review profile only; now valid with `--via loop`, `--via direct`, and `--via` absent. Refused (exit 2, message naming `--checkpoint`, no verdict word or row printed, at arg-parse time): a value outside the new enum — `cleared`, `stamp-appeared`, `overridden` included; `--checkpoint-reason` (retired — the message says so); `--checkpoint-overrides` without `--checkpoint disposer`, or not a non-negative integer; `--checkpoint` with `--profile release`. Row: `checkpoint` keeps its position immediately after `verdict`: `{"outcome":"disposer","overrides":N}`, `{"outcome":"empty"}`, or `{"outcome":"not-reached"}`. Absent flags → no key, row byte-identical to today. (AC-20260901-09-10, AC-20260901-09-11, AC-20260901-09-12) | The key stays where 05 D3 put it so 02's first-seven-keys and byte-identity pins hold untouched. `empty` is distinct from `disposer` because a row must never claim an agent ran when nothing was there to disposition. Historical rows keep their old values; readers never validate them. |
| D6 | **The driver passes the outcome on every review verdict pass**, both `via` values, inside the one shared arg-builder: `disposer` + `--checkpoint-overrides <disposer.overrides>` when `marks.disposer` is recorded for the current reviewer-return iteration and `empty` is not set; `empty` when it is; `not-reached` when no `disposer` mark exists for that iteration (the hard-stop `GATE_RED` row). (AC-20260901-09-6, AC-20260901-09-13) | 05 D3's "derived from marks, never a separate persisted field" stands; only the derivation changes. |
| D7 | **Doctrine.** `build.md` § Review stage: the **CHECKPOINT (enforced)** bullet is deleted and replaced by one bullet stating that there is no stop between the reviewer's return and dispositions — independence is the disposer, per review.md's DISPOSITIONS rule, on the loop path and the direct path alike; the advisory build-complete line and the pre-merge bullet are unchanged; the description frontmatter and the report example no longer say "the two checkpoints". `review.md` § Input's direct-entry note drops "stops at one additional enforced checkpoint before dispositions" and says both entries run the same DISPOSITIONS protocol. Both files stay within the 500-line read-load budget. (AC-20260901-09-14) | Core § Doctrine Authoring: one binding home — the disposition protocol lives in review.md; the loop cites it. |
| D8 | `spec/.claude-plugin/plugin.json`: version bump target 7.54.0 (next free if taken) with a changelog paragraph in the last-3 form (7.54.0, 7.53.0, 7.52.0 — the 7.51.0 paragraph drops). `[no-ac: manifest — pinned by tests/consistency/plugin-version.test.js]` | Host § Planning: every behavior change bumps the owning plugin's semver. |
| D9 | **Tests.** `tests/review/loop-checkpoint.test.js` is **deleted** — all nine tests pin the retired mechanism (AC-20260901-03-2..5, AC-20260901-05-1..4, -9, -10; superseded per ADR-0005; specs 03 and 05 are `done` and are not edited). `tests/review/disposer-gate.test.js` is created with this spec's driver ACs. In `tests/review/review-driver.test.js` the AC-20260901-02-4 test is rewritten in place: no CHECKPOINT park, no stamp rewrite, the loop row asserts `checkpoint: {"outcome":"empty"}` and the direct row asserts the same key (retagged AC-20260901-09-6); the AC-20260820-07-6 clean-close test is tagged AC-20260901-09-5 in place. In `tests/provenance/provenance.test.js` the AC-20260901-05-6 and AC-20260901-05-7 tests are rewritten in place to AC-20260901-09-10 / AC-20260901-09-11; the AC-20260901-02-6 byte-identity test is tagged AC-20260901-09-12 in place. (AC-20260901-09-5, AC-20260901-09-12) | Roadmap amendment convention: done specs are never edited; the live carrier says what the driver does now. A deleted file is honest when every test in it pins retired behavior. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/agents/disposer.md | CREATE | doctrine | D1: the fresh-context disposer agent (`model: inherit`, read-only tools, grounding, recommendation rules, return contract) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D2, D4, D6: `--file` verification at `--mark dispositions`, `disposer` mark, DISPOSITIONS step body (dispatch + paths + empty-pool form), CHECKPOINT removal, retired-flag refusal, outcome derivation; header CONTRACT + refusal catalogue updated |
| spec/scripts/verdict.js | MODIFY | scripts | D5: new enum, `--checkpoint-overrides`, refusal matrix, row shape; header documents the flags and exit-2 cases |
| spec/commands/review.md | MODIFY | doctrine | D3: DISPOSITIONS rule rewrite; D7: direct-entry note |
| spec/commands/build.md | MODIFY | doctrine | D7: CHECKPOINT bullet → no-stop bullet; frontmatter description; report example |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: 7.54.0 + changelog paragraph (next free version if taken) |
| tests/review/loop-checkpoint.test.js | DELETE | tests | D9: every test pins the retired checkpoint |
| tests/review/disposer-gate.test.js | CREATE | tests | AC-20260901-09-1, AC-20260901-09-2, AC-20260901-09-3, AC-20260901-09-4, AC-20260901-09-7, AC-20260901-09-8, AC-20260901-09-9, AC-20260901-09-13 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260901-09-5 (tag the clean-close test in place), AC-20260901-09-6 (rewrite the AC-20260901-02-4 test in place, D9) |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20260901-09-10, AC-20260901-09-11 (rewrite the 05-6/05-7 tests in place), AC-20260901-09-12 (tag the byte-identity test in place) |
| tests/review/escalate-row.test.js | MODIFY | tests | Build-time collision (2026-09-01, recorded in deviations): fix-cycle setups supply a disposer return via `--file` (D2) and reproducibility re-runs pass the row's own `checkpoint` back as `--checkpoint`/`--checkpoint-overrides` (D6); updated in place, retagged AC-20260901-09-2 / AC-20260901-09-6, never weakened |
| tests/review/stopped-row-durability.test.js | MODIFY | tests | Build-time collision (2026-09-01, recorded in deviations): the worktree GATE_RED reproducibility re-run passes the row's `checkpoint` back as `--checkpoint not-reached` (D6); updated in place, retagged AC-20260901-09-13, never weakened |

Orchestrator duty (outside the table): `tests/consistency/read-load.test.js` is the live
oracle for AC-20260901-09-14 and is not edited. `docs/canonical/pipeline.md` changes only
through the Canonical Delta at review close. `spec/entrypoints.json` is untouched — agent
files are not entry points. At review close, dispose
`.claude/agent-memory/gate-scripts/checkpoint-outcome-derivation-in-shared-arg-builder.md`
explicitly (it teaches the stamp-branch derivation D6 retires; correct it to the new
derivation or delete it — the memory sweep will not surface it because the diff does not touch
it).

## Contracts

```
spec/agents/disposer.md  (frontmatter)
  name: disposer
  description: "Read-only spec-implementation disposer. Reads the spec, the diff, the reviewer's
    findings and the leg evidence with no memory of the build, and returns one grounded
    recommendation per finding. Dispatched at the review driver's DISPOSITIONS step."
  model: inherit
  tools: [Read, Grep, Glob, Bash]

disposer return (the session writes the agent's return to a file and passes --file)
  {
    "verdict": "DISPOSED" | "DISPOSER_FAILED",
    "dispositions": [
      { "ref": "s<i>" | "leg:<name>",
        "recommended": "fix" | "waive" | "reject",
        "reason": "<quoted spec line or executed check>",
        "final": "fix" | "waive" | "reject",          // optional; present when the user answered
        "overriddenBy": "user",                        // required iff final !== recommended
        "overrideReason": "<the user's words>",        // required iff final !== recommended
        "sessionNote": "<informational, ignored>" }    // optional
    ],
    "tokens": <n>
  }
  ref grammar: s<i> = reviewer-return-<n>.json .survivors[i] (0-based);
               leg:<name> = manifest-<n>.jsonl row with exit !== 0 and leg ∉ BLOCKING_LEGS

spec-review-driver.js  (changes)
  --mark dispositions --file <return.json> --waived N --rejected N --fix-dispatched N
    pools empty      : --file optional (ignored); marks.disposer = {file:null, iteration:n, overrides:0, empty:true}
    pools non-empty  : --file required; verified per D2; on success copies to
                       <sidecar>/disposer-return-<n>.json; marks.disposer = {file, iteration:n, overrides:k}
    exit 2 (state + sidecar unchanged, message names the check): --file missing on non-empty pools |
      unreadable | invalid JSON | verdict DISPOSER_FAILED | dispositions not an array | uncovered
      ref (named) | duplicate ref (named) | unknown ref | recommended ∉ enum | blank reason |
      final ∉ enum | final !== recommended without overriddenBy:"user" + non-blank overrideReason |
      counts ≠ (final ?? recommended) tallies | --skip-independence-check-because present (retired,
      ADR-0005)
  deriveState(): ... REVIEWER -> DISPOSITIONS (no CHECKPOINT; both via values)
  handleReviewerReturned(): resets marks.disposer = null alongside marks.dispositions
  printed DISPOSITIONS step (non-empty pools):
    ## Step: dispositions due — dispatch the disposer, apply its recommendations
    survivors (N): ...            leg findings (M): ...
    Dispatch ONE Agent {subagent_type: "spec:disposer"} with the spec path, diff base <base>,
    root <root>, the pipeline-rules path, and this iteration's evidence:
      reviewer return: <sidecar>/reviewer-return-<n>.json
      manifest: <manifest-<n>.jsonl>
      outputs: <outDir>
    Fix recommendations dispatch without a question; waive/reject recommendations go to the user
    (AskUserQuestion; record the answer as final with overriddenBy:"user" when it differs).
    Write the return to a file, then:
      node <driver> <spec> --mark dispositions --file <return.json> --waived N --rejected N --fix-dispatched N
    DISPOSER_FAILED is a failed dispatch, never a disposition — re-dispatch before marking.
  printed DISPOSITIONS step (empty pools):
    ## Step: dispositions due — nothing to disposition
    survivors (0) · leg findings (0). Then:
      node <driver> <spec> --mark dispositions --waived 0 --rejected 0 --fix-dispatched 0
  verdict passes (hard-stop, escalate, close), every via value, shared arg-builder:
    --checkpoint disposer --checkpoint-overrides <marks.disposer.overrides>   (disposer recorded for iteration n)
    --checkpoint empty                                                         (disposer.empty)
    --checkpoint not-reached                                                   (no disposer mark for iteration n)

verdict.js  (changes, review profile only)
  --checkpoint <disposer|empty|not-reached> [--checkpoint-overrides <N>]
  row: { ..., "verdict": "CLEAN", "checkpoint": {"outcome":"disposer","overrides":2}, ... }
       { ..., "verdict": "CLEAN", "checkpoint": {"outcome":"empty"}, ... }
       { ..., "verdict": "GATE_RED", "checkpoint": {"outcome":"not-reached"}, ... }
  absent flags -> no checkpoint key; row byte-identical to today
  exit 2 (arg-parse time, message names --checkpoint, no row): outcome ∉ {disposer, empty,
    not-reached} (cleared / stamp-appeared / overridden included) | --checkpoint-reason (retired) |
    --checkpoint-overrides without --checkpoint disposer | --checkpoint-overrides not a
    non-negative integer | --checkpoint with --profile release
  accepted: --checkpoint with --via loop, --via direct, or --via absent
```

## Behavior

| At `reviewer-returned` | Next state | `--mark dispositions` admitted when | Row `checkpoint` |
|---|---|---|---|
| survivors > 0 or failing non-blocking legs > 0 (either `via`) | DISPOSITIONS | `--file` passes D2's checks and counts agree | `{"outcome":"disposer","overrides":k}` |
| both pools empty (either `via`) | DISPOSITIONS | `--waived 0 --rejected 0 --fix-dispatched 0`, no file | `{"outcome":"empty"}` |
| gate RED_BLOCKING at iteration 1 | STOPPED | n/a | `{"outcome":"not-reached"}` on the GATE_RED row |
| fix-delta pass returns (iteration 2) | DISPOSITIONS | a return for iteration 2 (iteration 1's is not reused) | derived from iteration 2's mark |
| sidecar from 7.53.0 carrying `checkpoint: {sessionId}` | DISPOSITIONS | as above | as above |

The session's DISPOSITIONS work under D3: dispatch the disposer → for `fix` entries dispatch
workers (no question) → for `waive`/`reject` entries ask the user, ≤4 per call, recommendation
first → write the return (with `final`/`overriddenBy`/`overrideReason` where the user differed)
→ mark. The FIX, CLOSE, MERGE, and REPLAY steps are unchanged.

## Acceptance Criteria

- **AC-20260901-09-1**: WHEN a review driver created with `--via loop` (and, separately, one created without `--via`) reaches `--mark reviewer-returned` while a stamp `{"session_id":"s1",…}` exists and is unchanged THE SYSTEM SHALL print `state: DISPOSITIONS` on the next bare invocation (never `CHECKPOINT`), `--state` SHALL print `DISPOSITIONS`, and `review-state.json` SHALL carry no `checkpoint` key → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-2**: WHEN the reviewer return holds one survivor and `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 1` is passed without `--file` THE SYSTEM SHALL exit 2 with stderr naming `--file` and `spec:disposer`, leave `--state` at `DISPOSITIONS`, and leave `review-state.json` byte-identical → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-3**: WHEN the reviewer return holds two survivors, the manifest holds one failing non-blocking leg row `{"leg":"drift","exit":1,…}`, and `--file` names `{"verdict":"DISPOSED","dispositions":[{"ref":"s0","recommended":"fix","reason":"D1 quoted"},{"ref":"s1","recommended":"waive","reason":"D2 sanctions","final":"fix","overriddenBy":"user","overrideReason":"fix it"},{"ref":"leg:drift","recommended":"reject","reason":"executed: matrix full"}],"tokens":5}` with `--waived 0 --rejected 1 --fix-dispatched 2` THE SYSTEM SHALL exit 0, copy the file to `<sidecar>/disposer-return-1.json`, and record `disposer: {"iteration":1,"overrides":1,…}` in `review-state.json` → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-4**: WHEN, against AC-20260901-09-3's pools, `--mark dispositions` is passed with each of: a `--file` path that does not exist; a file holding `not json`; `{"verdict":"DISPOSER_FAILED",…}`; a return omitting `leg:drift`; a return listing `s0` twice; a return with `"ref":"s9"`; `"recommended":"skip"`; `"reason":"  "`; `"final":"later"`; `"final":"waive"` on an `s0` entry recommended `fix` with no `overriddenBy`; and a fully valid return with `--fix-dispatched 3` THE SYSTEM SHALL exit 2 each time with stderr naming the failing check (the uncovered ref `leg:drift`, the duplicate `s0`, the unknown `s9`, `--fix-dispatched` respectively for those cases), write no `disposer-return-1.json`, and leave `review-state.json` byte-identical → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-5**: WHEN both pools are empty THE SYSTEM SHALL CONTINUE TO accept `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0` with no `--file` and land CLOSE → the existing clean-close test in `tests/review/review-driver.test.js` (AC-20260820-07-6), tagged in place
- **AC-20260901-09-6**: WHEN a zero-survivor, zero-leg-finding run closes CLEAN THE SYSTEM SHALL append a close row carrying `checkpoint` deep-equal to `{"outcome":"empty"}` immediately after `verdict`, for a run created with `--via loop` and for one created without `--via` alike; WHEN a run accepted AC-20260901-09-3's return THE SYSTEM SHALL carry `checkpoint` deep-equal to `{"outcome":"disposer","overrides":1}` on its escalate or close row → `tests/review/review-driver.test.js` (the rewritten AC-20260901-02-4 test) and `tests/review/disposer-gate.test.js`
- **AC-20260901-09-7**: WHEN a fix cycle (`--fix-dispatched 1`, `--mark fix-applied`) brings a second `reviewer-returned` with one survivor THE SYSTEM SHALL refuse `--mark dispositions … --fix-dispatched 1` without `--file` (exit 2) even though iteration 1's `disposer-return-1.json` exists, and accept a valid `--file` recording `disposer.iteration: 2` → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-8**: WHEN `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0 --skip-independence-check-because "jq missing"` is passed on any run THE SYSTEM SHALL exit 2 with stderr naming `--skip-independence-check-because` and `ADR-0005`, leaving the state unchanged → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-9**: WHEN `review-state.json` (as 7.53.0 wrote it) carries `"checkpoint":{"sessionId":"s1"}` with no `checkpointCleared`, the stamp still reads `s1`, and the reviewer return is recorded for the current iteration THE SYSTEM SHALL print `state: DISPOSITIONS` → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-10**: WHEN `verdict.js` runs a review-profile ledger pass with `--via loop --checkpoint disposer --checkpoint-overrides 2` THE SYSTEM SHALL print a row whose `checkpoint` sits immediately after `verdict` and deep-equals `{"outcome":"disposer","overrides":2}`; `--checkpoint disposer` alone → `{"outcome":"disposer","overrides":0}`; `--checkpoint empty` → `{"outcome":"empty"}`; `--checkpoint not-reached` → `{"outcome":"not-reached"}`; and the same `--checkpoint disposer` pass with `--via direct` and with `--via` absent SHALL exit 0 with the same key → `tests/provenance/provenance.test.js` (rewrites the AC-20260901-05-6 test in place)
- **AC-20260901-09-11**: WHEN `verdict.js` receives `--checkpoint cleared`, `--checkpoint stamp-appeared`, `--checkpoint overridden`, `--checkpoint bogus`, `--checkpoint-reason "x"` (with any `--checkpoint`), `--checkpoint-overrides 1` without `--checkpoint disposer`, `--checkpoint disposer --checkpoint-overrides -1`, `--checkpoint disposer --checkpoint-overrides 1.5`, or `--checkpoint empty --profile release` THE SYSTEM SHALL exit 2 with stderr naming `--checkpoint` and print no ledger row → `tests/provenance/provenance.test.js` (rewrites the AC-20260901-05-7 test in place)
- **AC-20260901-09-12**: WHEN `verdict.js` runs without `--checkpoint` THE SYSTEM SHALL CONTINUE TO print a row with no `checkpoint` key, byte-identical to today → the existing AC-20260901-02-6 test in `tests/provenance/provenance.test.js`, tagged in place
- **AC-20260901-09-13**: WHEN a run's synthetic gate fails at iteration 1 THE SYSTEM SHALL append a `GATE_RED` row carrying `checkpoint` deep-equal to `{"outcome":"not-reached"}`, for `--via loop` and for a run created without `--via` alike → `tests/review/disposer-gate.test.js`
- **AC-20260901-09-14** `[oracle: gate]`: WHEN `tests/consistency/read-load.test.js` runs THE SYSTEM SHALL find `/spec:build` and `/spec:review` each at or under 500 lines including their `shared-for` sections

## Assumptions (escalation triggers)

- A1: Verified against the Claude Code sub-agents doc 2026-09-01 (code.claude.com/docs/en/sub-agents.md): agent frontmatter `model:` accepts `inherit`, and "Setting the variable to `inherit` is the same as leaving it unset" — the main conversation's model; "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history" — **if false (a future harness pins a default model):** write `model: inherit` regardless; the doctrine names the intent and the row's `model` field records what actually ran.
- A2: Executed 2026-09-01 — `node spec/scripts/verdict.js --via loop --checkpoint disposer --manifest /dev/null --workflow /dev/null` exits 2 with `--checkpoint must be one of cleared|stamp-appeared|overridden|not-reached, got "disposer"`, and `--via direct --checkpoint not-reached` exits 2 with `--checkpoint requires --via loop` — so AC-20260901-09-10's `via direct` and `disposer` clauses are red today — **if false:** the enum already moved; re-read verdict.js before editing.
- A3: Executed 2026-09-01 — read-load measures build at 359 and review at 387 of 500 (176 + 183 shared; 199 + 188 shared), so D7's edits (net negative in build.md, ±10 lines in review.md) fit — **if false:** trim the shell prose; never touch the cap.
- A4: The review driver's `flag()` returns the token after a flag or `true` for a bare trailing flag (line 195 today), and `argv.includes(...)` is how the override branch detects the flag — D4's retired-flag refusal uses the same `argv.includes` test so a bare or valued flag is refused alike — **if false:** the worker returns `blocked`; the detection is decided here.
- A5: `handleDispositions()` already receives the survivor pool from `marks.reviewerReturnFile` and the leg pool by the same `BLOCKING_LEGS` filter the DISPOSITIONS step body uses, and `verdict.js`'s dispositions pass still runs after the new checks (the count check is additive, the arithmetic pass unchanged) — **if false (the pools are computed only in the step body):** hoist one `dispositionPools(n)` helper used by both; never two derivations.
- A6: `tests/review/review-driver.test.js`'s `makeHost`/`toReviewer`/`returnFileWith` helpers and `tests/review/loop-checkpoint.test.js`'s `makeHost({gateFails})`/`writeStamp` helpers are the fixture vocabulary the new test file reuses (copied, since helpers are file-local) — **if false:** the test author builds equivalent fixtures; the ACs' observable shapes stand.

## Rationale

**Why a disposer and not just no gate.** Brief 18 named the one thing a separate review
session bought: a disposition step with no memory of the build. That is worth keeping. What
was wrong was the form — a human ritual whose evidence is a file a hook writes, walked past
in 2 of 2 real runs before 18a and, after 18a, converted into a restart ceremony. A subagent
has the property by construction and the driver can refuse to advance without its artifact:
mechanical, unskippable, testable (ADR-0005).

**Why fix without asking.** A `fix` is the conservative disposition: reversible, re-reviewed
by the fix-delta pass, capped at two iterations. A `waive` is the one call the doctrine
reserves for the user. Asking about fixes would rebuild the very stop this spec removes,
with a decision attached that the user has already delegated (JJ ruling 2026-09-01).

**Why both entries.** A `/spec:review` that dispositions in-session while `/spec:run`
dispatches a disposer is two review doctrines; the loop's kill condition compares `loop`
against `direct` CLEANs, and a different disposition protocol on each side would confound
that comparison. One protocol, one row shape.

**Why `empty` exists.** A row saying `disposer` when no agent ran would be a laundered claim;
`not-reached` already means "the run stopped before dispositions". Three honest values.

**Why the enum reverses 05 D3's refusals.** `--checkpoint` on `--via direct` was refused
because the checkpoint was a loop-only fact. It is no longer; keeping the refusal would leave
direct rows unable to say what happened. The old values are refused rather than accepted-and-
ignored so a stale driver cannot write a value the doctrine no longer defines.

**Why delete `loop-checkpoint.test.js`.** Every test in it asserts a state that no longer
exists or a refusal that no longer fires. Rewriting nine tests "in place" to unrelated
assertions is a fiction; the honest carrier is a new file named for the new mechanism, and
this Rationale plus ADR-0005 record the supersession.

**What is fragile.** The disposer's quality is unmeasured; the row's `overrides` count is the
instrument (brief 18b § 5). The user-override path relies on the session writing
`final`/`overriddenBy` honestly — the driver can check shape, not truth; a session that
silently rewrites `recommended` instead is the one abuse no script sees. Review's
`AskUserQuestion` on waive/reject is the visible surface for that; the doctrine forbids it
explicitly.

**Collision closure (executed at lock, 2026-09-01).** Literals leg for `CHECKPOINT`,
`skip-independence-check-because`, `stamp-appeared`, `checkpointCleared`: hits in
`spec/scripts/spec-review-driver.js`, `spec/scripts/verdict.js`, `spec/commands/build.md`,
`spec/commands/review.md`, `spec/.claude-plugin/plugin.json`,
`tests/review/loop-checkpoint.test.js`, `tests/review/review-driver.test.js`,
`tests/provenance/provenance.test.js` are File Plan rows; `docs/canonical/pipeline.md` is
the Canonical Delta; `spec/scripts/spec-state-gate.sh`'s header comment ("post-checkpoint
resume entry"), `tests/state-gates.test.js`'s comment, and `README.md`'s "mandatory `/clear`
checkpoint" sentences are sibling 10's rows (the rename sweep rewrites those sentences; for
the hours between the two closes the README's loop bullet is stale — accepted, recorded);
`spec/commands/genesis.md`, `spec/doctrine/genesis.md`, `spec/scripts/genesis-driver.js`,
`docs/canonical/genesis.md`, and `tests/genesis/*` use `CHECKPOINT` for the genesis driver's
own `/clear` checkpoints (JJ ruling 2026-08-25, untouched) — waived; `spec/doctrine/core.md:285`,
`spec/commands/design.md:117,167`, `spec/scripts/spec-build-driver.js`, and
`tests/build/build-driver.test.js` say "checkpoint-commit" (the git checkpoint after a green
phase), and `spec/scripts/lib/session-stamp.js:18` and `.claude/commands/doctrine-review.md:56`
carry the word in a comment — waived;
`specs/`, `docs/roadmap/`, `docs/adr/`, `docs/audit/` are historical record under the sweep's
waived prefixes. Paths leg `executes` hits on the review driver and verdict.js beyond the File
Plan (`escalate-row`, `stopped-row-durability`, `legs-verdict-pair`, `merge-reentry`,
`deviations-backstop`, `review-base-derivation`, `frontmatter`, `verdict`, `review-legs`,
`ac-matrix`, `scope-reconcile-at-risk`, `verdict-*`) assert fields, never a full review-row
key set (executed grep 2026-09-01: no `deepStrictEqual(row, …)` or `Object.keys(row)` over a
review row outside provenance's first-seven pin, which the key's position honours) — D6's
added `checkpoint` key on direct rows leaves them green; build's whole-suite check adjudicates.

**Deviations folded at close (2026-09-01).** Three one-offs from the build, none a new
Gotchas class: (1) the `disposer-gate.test.js` carrier for AC-20260901-09-6's second clause
reaches the CLOSE row through a minimal one-survivor pool (waive recommended, user-overridden
to reject, zero fix-dispatched) rather than AC-3's own `fixDispatched: 2` return, because
that return routes through FIX and cannot land a close/escalate row within one mark — the
pinned observable (`checkpoint` deep-equal `{"outcome":"disposer","overrides":1}`) is
identical. (2) Sibling 08 merged to main after this branch was cut, so build Phase 0
fast-forwarded and pinned `build_base`/`diff_base` to the true pre-image
(931c80c4756ce0e1ef36a2050b1577657bd8a54f) per host § Gotchas; D8's 7.54.0 target was taken by
08, so the build shipped 7.55.0 with the same changelog paragraph. (3) The whole-suite gate
reddened 12 out-of-plan tests (`escalate-row.test.js`, `stopped-row-durability.test.js`,
two in `review-driver.test.js`): fix-cycle setups called `--fix-dispatched 1` on a
one-survivor pool without `--file`, which D2 now refuses, and reproducibility re-runs
deep-equal the whole review row, which D6's `checkpoint` key changed — this Rationale's
"assert fields, never a full review-row key set" prediction was wrong for the reproducibility
pins. Both files were added to the File Plan as tests rows and the pins updated in place per
host § Gotchas; no promise changed.

## Canonical Delta

Replace, in `docs/canonical/pipeline.md` § One command per feature, the sentences from "One
checkpoint is enforced:" through "(specs/20260901/05-checkpoint-fail-closed.md, ADR-0004)."
with:

There is no stop between the reviewer's return and dispositions. Independence is a
fresh-context `spec:disposer` agent (read-only, paths only, the session's model) dispatched
at DISPOSITIONS on both review entries; it returns one grounded recommendation per survivor
and leg finding, and the review driver refuses `--mark dispositions` on non-empty pools
without a return that covers every finding exactly once with a non-blank reason. Fix
recommendations dispatch without a question; waive and reject recommendations go to the
user, and the user's answer is recorded as `final` with `overriddenBy: "user"`. Every review
row records `checkpoint: {outcome, overrides}` — `disposer` (with the count of
recommendations the user overrode), `empty` (nothing to disposition), or `not-reached` (the
run stopped before dispositions) — so how often the user overrules the independent disposer
is a ledger query. The session-id checkpoint, its restart remedy, and
`--skip-independence-check-because` are retired (specs/20260901/09-disposer-gate.md,
ADR-0005).
