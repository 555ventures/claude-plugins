---
date: 2026-09-02
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/03-unified-build-loop.md"]
depended_on_by: []
brief: 18a
open_markers: 0
build_base: main
diff_base: 53da29e06b1fc3146cde390c4f135288bc68b93b
---

# Loop checkpoint fails closed — no stamp parks the run, one awkward override, outcome on the ledger

## Goal

The unified build loop's one enforced stop stops when its evidence is missing. Today a
`--via loop` review that reaches `reviewer-returned` with no `.claude/spec-session.json`
prints a warning and admits DISPOSITIONS in the build session — the path 2 of 2 real loop
reviews on this machine took, with no ledger trace (ADR-0004). After this spec the same run
parks at `CHECKPOINT` with a remedy naming the cause (restart Claude Code — the stamp hook is
loaded at session start), lifts when any stamp appears, and can be walked past only by one
deliberately awkward flag whose reason lands on the review row; every loop review row records
the checkpoint outcome as a typed field. Done means: a fixture host's review driver invoked
`--via loop` with no stamp parks and refuses `--mark dispositions`, admits it once a stamp
exists or the override flag carries a reason, refuses the flag everywhere else, and the close
row says which of those happened.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **No stamp parks.** `spec-review-driver.js`: at `reviewer-returned` a `--via loop` run still records `checkpoint: {sessionId}` from `readSessionStamp(repoRoot)` (`null` when absent); `checkpointStillParked()` becomes: `via === "loop"` and not `checkpointCleared` and a `checkpoint` key exists and (`checkpoint.sessionId === null` ? the current stamp is also absent : the current stamp's `session_id` equals `checkpoint.sessionId`). A null-recorded park lifts the moment any stamp exists (any `session_id`); a non-null park lifts on a differing id exactly as today. Admitting DISPOSITIONS past either park records `checkpointCleared: true` (sticky, once per run). The stderr line at a no-stamp `reviewer-returned` and the `CHECKPOINT` step body for a null park both name `.claude/spec-session.json`, contain the literal phrase `restart Claude Code`, say a stale plugin hook set is the usual cause (hooks load at session start, so `/clear` does not help), and name `/spec:build <spec>` as the re-run; the step heading is `## Step: checkpoint — restart Claude Code, then re-run /spec:build <spec>`. The non-null park's step body and `--mark dispositions` refusal text are unchanged. (AC-20260901-05-1, AC-20260901-05-2, AC-20260901-05-9) | Under `--via loop` a missing stamp can only mean the pipeline's own prompt hook is not running (ADR-0004: the prax cache roll 7.47.0→7.50.0); a gate a missing file waives is the printed-reminder form core § Feedback Loop measured to fail. Rejected: keeping the degrade with a louder warning (same form); requiring a *changed* id after a null park (there is no recorded id to differ from — any stamp implies a process whose hook set includes the stamp hook). |
| D2 | **One override, no-stamp parks only.** `--mark dispositions … --skip-independence-check-because "<reason>"` (the flag takes exactly one value, the reason) admits DISPOSITIONS when the run is parked with `checkpoint.sessionId === null`, recording `checkpointCleared: true` and `checkpointOverride: {reason, ts}` in `review-state.json` before the disposition work. Refused (exit 2, state and sidecar unchanged, message naming the flag) when: the reason is absent or blank after trim; the run is parked with a non-null `checkpoint.sessionId` (message names `/clear` as the remedy — the override is not a bypass for the build session); the run is not parked at all (nothing to override — accepting it would launder a false `overridden` onto the ledger); or `via` is `direct`. No short alias, no environment variable form. (AC-20260901-05-3, AC-20260901-05-4) | The one truly stuck case is a host whose hook is present but cannot write the stamp (no `jq`, unwritable `.claude/`); prax's ask was one explicit, awkward flag whose use is visible. Refusing it on a same-session park keeps the checkpoint a gate. Rejected: a separate `--mark checkpoint-overridden` (a second mark to reach the same state); admitting the flag on same-session parks with a reason (the exact bypass D2 of 03 exists to prevent). |
| D3 | **Outcome on every loop review row.** `verdict.js` gains `--checkpoint <cleared|stamp-appeared|overridden|not-reached>` and `--checkpoint-reason <text>`; review profile only. The row gains `checkpoint` inserted immediately after `verdict` (before `escalated`): `{"outcome":"<value>"}`, or `{"outcome":"overridden","reason":"<text>"}` when overridden. Refused (exit 2, message naming `--checkpoint`, no verdict word or row printed, checked at arg-parse time): a value outside the enum; `--checkpoint-reason` without `--checkpoint overridden`; `--checkpoint overridden` without a non-blank reason; `--checkpoint` with `--profile release`; `--checkpoint` with `--via direct` or `--via` absent. With neither flag the row is byte-identical to today. The driver derives the value from its marks — `overridden` when `checkpointOverride` is set, else `cleared` when `checkpointCleared` and `checkpoint.sessionId !== null`, else `stamp-appeared` when `checkpointCleared` and `checkpoint.sessionId === null`, else `not-reached` — inside the one shared via/model arg-builder, so all three verdict passes (hard-stop, escalate, close) carry it on `via: loop` runs and never on `via: direct` runs. (AC-20260901-05-5, AC-20260901-05-6, AC-20260901-05-7, AC-20260901-05-8, AC-20260901-05-10) | Core § Incident Policy derives materiality from the ledger; today neither loop row can say the gate was skipped. After `verdict` rather than after `model` because AC-20260901-02-3 pins the first seven keys `ts, spec, stage, tier, via, model, runId` and AC-20260901-02-6 pins byte-identity when provenance flags are absent — both stay untouched. Rejected: a key on the retained artifact (the row is the query surface); a fleet-reader question (one `jq` line answers it — brief 18a § Out of scope). |
| D4 | `spec/commands/build.md` § Review stage, the **CHECKPOINT (enforced)** bullet: adds that a run with no stamp parks the same way with the restart remedy (stale plugin hook set — hooks load at session start), that any stamp then admits, and that `--skip-independence-check-because "<reason>"` is the last resort whose reason lands on the review row as `checkpoint.outcome: overridden`; the `/clear` form stays. `review.md` unchanged. Within the 500-line read-load budget. `[no-ac: command prose — behavior pinned by AC-20260901-05-1..4; regexes over prose are not tests (host § Test Rules)]` | Core § Doctrine Authoring: the loop's stops live in build.md; the driver prints the step. |
| D5 | `spec/.claude-plugin/plugin.json`: version bump target 7.52.0 (next free version if taken) with a changelog paragraph in the last-3 form (7.52.0, 7.51.0, 7.50.0 — the 7.49.0 paragraph drops). `[no-ac: manifest — the durable invariant is pinned by tests/consistency/plugin-version.test.js]` | Host § Planning: every behavior change bumps the owning plugin's semver. |
| D6 | The degrade test — the second `AC-20260901-03-4` test in `tests/review/loop-checkpoint.test.js` (no stamp → warning + DISPOSITIONS) — is **rewritten in place** to AC-20260901-05-1 and retagged; it is never left beside the new test. The once-per-run `AC-20260901-03-4` test keeps its tag (that clause of the AC still holds). specs/20260901/03 is `done` and is not edited; ADR-0004 records the supersession. (AC-20260901-05-1) | Roadmap amendment convention (ADR `Applies to`, successor brief 18a): done specs are never edited; the test is the live carrier and must say what the driver does now. |
| D7 | **A flag name is not a reason** (review ruling, 2026-09-02). D2's "reason absent" includes the case where the token following `--skip-independence-check-because` is itself a flag (starts with `--`): the driver refuses exactly as for a bare or blank reason (exit 2, state and sidecar unchanged, message naming the flag), never admitting `--waived`-style tokens as the recorded reason. (AC-20260901-05-4) | Review 2026-09-02 found `--skip-independence-check-because --waived 0 …` admitted with `checkpointOverride.reason == "--waived"` — a laundered override on the ledger row, the exact outcome D2/D3 exist to make visible. A4 covered only the bare-flag-at-end case. User ruled fix over waive. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1, D2, D3: null-park predicate, restart step body + stderr, override flag + refusals, `checkpointOverride` mark, outcome in the shared verdict arg-builder; header comment names the new refusals |
| spec/scripts/verdict.js | MODIFY | scripts | D3: `--checkpoint` / `--checkpoint-reason`, refusal matrix, row key after `verdict`; header comment documents the flags and exit-2 cases |
| spec/commands/build.md | MODIFY | doctrine | D4: CHECKPOINT bullet — restart remedy, any-stamp admission, the override flag and its ledger consequence |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D5: 7.52.0 + changelog paragraph (next free version if taken) |
| tests/review/loop-checkpoint.test.js | MODIFY | tests | AC-20260901-05-1 (rewrite the degrade test in place, D6), AC-20260901-05-2, AC-20260901-05-3, AC-20260901-05-4, AC-20260901-05-9 (tag the four unchanged tests in place), AC-20260901-05-10 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260901-05-5 (add the `checkpoint` assertion to the existing AC-20260901-02-4 loop test, tag in place) |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20260901-05-6, AC-20260901-05-7, AC-20260901-05-8 (tag the existing AC-20260901-02-6 byte-identity test in place) |

Orchestrator duty (outside the table): `tests/consistency/read-load.test.js` is the live
oracle for D4's budget and is not edited. `docs/canonical/pipeline.md` changes only through
the Canonical Delta at review close.

## Contracts

```
spec-review-driver.js  (changes)
  checkpointStillParked():
    marks.via === 'loop' && !marks.checkpointCleared && !!marks.checkpoint &&
      (marks.checkpoint.sessionId === null
        ? checkpointStamp() === null                       // null park: lifts on ANY stamp
        : checkpointStamp() === marks.checkpoint.sessionId) // same-session park: unchanged
  review-state.json gains: checkpointOverride: { reason: string, ts: ISO-8601 }   (D2 only)
  stderr at a no-stamp reviewer-returned (--via loop):
    spec-review-driver: no session stamp at .claude/spec-session.json — the loop checkpoint
    cannot verify a session change, so this run is parked at CHECKPOINT. Restart Claude Code
    (a stale plugin hook set is the usual cause: hooks load at session start, /clear does not
    reload them), then re-run /spec:build <spec>. Last resort: --mark dispositions ...
    --skip-independence-check-because "<reason>" — the reason lands on the review row.
  printed step (null park):
    [spec-review-driver] state: CHECKPOINT  spec: <spec>
    ## Step: checkpoint — restart Claude Code, then re-run /spec:build <spec>
    No session stamp at .claude/spec-session.json: the loop cannot verify that the session
    dispositioning this review is not the one that built it. A stale plugin hook set is the
    usual cause (hooks load at session start; /clear does not reload them). Restart Claude
    Code, re-run, and the driver resumes at DISPOSITIONS. Last resort, recorded on the ledger:
      node <driver> <spec> --mark dispositions ... --skip-independence-check-because "<reason>"
  printed step (same-session park): unchanged from specs/20260901/03 D2
  --mark dispositions [--waived N --rejected N --fix-dispatched N]
        --skip-independence-check-because "<reason>"
    admitted  : parked && marks.checkpoint.sessionId === null && reason.trim() !== ''
                -> marks.checkpointCleared = true; marks.checkpointOverride = {reason, ts}
    exit 2    : reason absent/blank | parked with non-null sessionId (remedy: /clear, re-run)
              | not parked (nothing to override) | marks.via === 'direct'
                (state and sidecar unchanged; message names --skip-independence-check-because)
  verdict passes (hard-stop, escalate, close), via:"loop" only, appended to the shared arg-builder:
    --checkpoint <outcome> [--checkpoint-reason <marks.checkpointOverride.reason>]
    outcome := checkpointOverride ? 'overridden'
             : checkpointCleared && checkpoint.sessionId !== null ? 'cleared'
             : checkpointCleared && checkpoint.sessionId === null ? 'stamp-appeared'
             : 'not-reached'

verdict.js  (additions, review profile only)
  --checkpoint <cleared|stamp-appeared|overridden|not-reached>
  --checkpoint-reason <text>            (required with, and only with, --checkpoint overridden)
  row: { ..., "runId": "rv_…", "verdict": "CLEAN", "checkpoint": {"outcome":"cleared"}, ... }
       { ..., "verdict": "CLEAN", "checkpoint": {"outcome":"overridden","reason":"<text>"}, ... }
  absent flags -> no checkpoint key; row byte-identical to today
  exit 2 (arg-parse time, message names --checkpoint, no row): value outside the enum |
    --checkpoint-reason without --checkpoint overridden | overridden with no/blank reason |
    --checkpoint with --profile release | --checkpoint with --via direct or --via absent
```

## Behavior

| At `reviewer-returned` (`via: loop`) | Recorded | Next invocation | Lifts when |
|---|---|---|---|
| stamp `s1` present | `checkpoint: {sessionId: "s1"}` | `CHECKPOINT`, `/clear` form (unchanged) | stamp reads any id ≠ `s1` → `cleared` |
| no stamp | `checkpoint: {sessionId: null}` + stderr restart line | `CHECKPOINT`, restart form | any stamp exists → `stamp-appeared`; or the override flag → `overridden` |
| `checkpointCleared` already true (fix cycle) | unchanged | `DISPOSITIONS` (once per run, unchanged) | n/a |
| `via: direct` | no `checkpoint` key | `DISPOSITIONS` (unchanged) | n/a; rows carry no `checkpoint` |

A hard-stop (`GATE_RED`) row on a loop run is written before the checkpoint exists →
`checkpoint: {"outcome":"not-reached"}`. The escalate row is written after dispositions →
whichever outcome admitted them.

## Acceptance Criteria

- **AC-20260901-05-1**: WHEN a `--via loop` review driver reaches `--mark reviewer-returned` with no `.claude/spec-session.json` on the host THE SYSTEM SHALL write a stderr line containing both `.claude/spec-session.json` and `restart Claude Code`, `--state` SHALL print `CHECKPOINT`, the bare invocation's stdout SHALL contain `restart Claude Code` and `/spec:build`, and `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0` SHALL exit 2 leaving `--state` at `CHECKPOINT` (e.g. fixture with no stamp, CLEAN return → `--state` = `CHECKPOINT`, mark exit = `2`) → the rewritten degrade test in `tests/review/loop-checkpoint.test.js`
- **AC-20260901-05-2**: WHEN, after AC-20260901-05-1's park, a stamp `{"session_id":"s9",…}` is written THE SYSTEM SHALL print `state: DISPOSITIONS` on the next invocation, accept `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0` (exit 0), record `checkpointCleared: true` with `checkpoint.sessionId` still `null` in `review-state.json`, and the CLOSE row appended by that mark SHALL carry `"checkpoint":{"outcome":"stamp-appeared"}` → `tests/review/loop-checkpoint.test.js`
- **AC-20260901-05-3**: WHEN, after AC-20260901-05-1's park and with no stamp written, `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0 --skip-independence-check-because "hook cannot write .claude on this host"` runs THE SYSTEM SHALL exit 0, record `checkpointCleared: true` and `checkpointOverride: {"reason":"hook cannot write .claude on this host","ts":<ISO-8601>}` in `review-state.json`, and the CLOSE row SHALL carry `"checkpoint":{"outcome":"overridden","reason":"hook cannot write .claude on this host"}` → `tests/review/loop-checkpoint.test.js`
- **AC-20260901-05-4**: WHEN `--skip-independence-check-because` is passed (a) on a run parked with stamp `s1` unchanged since `reviewer-returned`, (b) with reason `""` on a no-stamp park, (c) on a `--via direct` run at `DISPOSITIONS`, or (d) on a no-stamp park with no reason value and another flag immediately following (`--skip-independence-check-because --waived 0 --rejected 0 --fix-dispatched 0`) THE SYSTEM SHALL exit 2 with stderr naming `--skip-independence-check-because`, leave `--state` unchanged (`CHECKPOINT`, `CHECKPOINT`, `DISPOSITIONS`, `CHECKPOINT` respectively), and write no `checkpointOverride` key; in case (a) the stderr SHALL also contain `/clear` → `tests/review/loop-checkpoint.test.js`
- **AC-20260901-05-5**: WHEN a `--via loop` run parks on stamp `s1`, the stamp is rewritten to `s2`, and dispositions close the run THE SYSTEM SHALL append a CLOSE row carrying `"checkpoint":{"outcome":"cleared"}` (e.g. the existing AC-20260901-02-4 loop fixture's CLEAN row) → the existing AC-20260901-02-4 test in `tests/review/review-driver.test.js`, assertion added and tagged in place
- **AC-20260901-05-6**: WHEN `verdict.js` runs a review-profile ledger pass with `--via loop --checkpoint cleared` THE SYSTEM SHALL print a row whose keys include `verdict` immediately followed by `checkpoint`, with `row.checkpoint` deep-equal to `{"outcome":"cleared"}`; WHEN run with `--via loop --checkpoint overridden --checkpoint-reason "jq missing"` THE SYSTEM SHALL print `row.checkpoint` deep-equal to `{"outcome":"overridden","reason":"jq missing"}` → `tests/provenance/provenance.test.js`
- **AC-20260901-05-7**: WHEN `verdict.js` receives `--checkpoint skipped`, or `--checkpoint overridden` with no `--checkpoint-reason`, or `--checkpoint cleared --checkpoint-reason x`, or `--checkpoint cleared` with `--via direct` (or no `--via`), or `--checkpoint cleared --profile release` THE SYSTEM SHALL exit 2 with stderr containing `--checkpoint` and print no ledger row (stdout empty) → `tests/provenance/provenance.test.js`
- **AC-20260901-05-8**: WHEN `verdict.js` runs a review-profile ledger pass with no `--checkpoint` flag THE SYSTEM SHALL CONTINUE TO print a row with no `checkpoint` key, byte-identical to today's row for the same inputs → the existing AC-20260901-02-6 test in `tests/provenance/provenance.test.js`, tagged in place
- **AC-20260901-05-9**: WHEN a `--via loop` run's stamp is unchanged since `reviewer-returned` THE SYSTEM SHALL CONTINUE TO park at `CHECKPOINT` with a step body naming `/clear` and refuse `--mark dispositions` (exit 2); WHEN the stamp changes THE SYSTEM SHALL CONTINUE TO admit DISPOSITIONS once and record `checkpointCleared: true`; WHEN `checkpointCleared` is true THE SYSTEM SHALL CONTINUE TO land `DISPOSITIONS` on a second `reviewer-returned` in the same session; WHEN the run is `via: direct` THE SYSTEM SHALL CONTINUE TO land `DISPOSITIONS` with no `checkpoint` key, stamp or not → the existing AC-20260901-03-2, AC-20260901-03-3, first AC-20260901-03-4, and AC-20260901-03-5 tests in `tests/review/loop-checkpoint.test.js`, tagged in place
- **AC-20260901-05-10**: WHEN a `--via loop` run's synthetic gate fails at iteration 1 THE SYSTEM SHALL append a `GATE_RED` row carrying `"checkpoint":{"outcome":"not-reached"}`; WHEN a `--via direct` run's gate fails the same way THE SYSTEM SHALL append a `GATE_RED` row with no `checkpoint` key → `tests/review/loop-checkpoint.test.js`

## Assumptions (escalation triggers)

- A1: Claude Code loads a plugin's hook set at session start and `/clear` does not reload it — observed in prax 2026-09-01 (the session kept running 7.47.0's hooks after the cache rolled to 7.50.0); the docs read 2026-09-02 confirm `/clear` yields a new session id (code.claude.com/docs/en/checkpointing) but do not state hook reload behavior — **if false (a `/clear` does reload hooks):** nothing breaks — a stamp appears after the clear and D1 admits on any stamp; only the printed remedy is stronger than needed.
- A2: Executed 2026-09-02 — `node --test tests/review/loop-checkpoint.test.js` is 5/5 green against the pre-image, including the degrade test (no stamp → `DISPOSITIONS`), so D6's rewrite is genuinely red until D1 lands — **if false:** STOP; the pre-image is not what ADR-0004 describes.
- A3: `tests/provenance/provenance.test.js` AC-20260901-02-3 pins only the first seven row keys and AC-20260901-02-6 pins byte-identity with provenance flags absent; inserting `checkpoint` after `verdict` only when passed leaves both green — **if false:** STOP, ask the user; both are AC-pinned row shapes.
- A4: The driver's `flag()` helper returns `true` for a flag with no following value, so a bare `--skip-independence-check-because` reads as "reason absent" — **if false:** parse the flag explicitly; the refusal contract in D2 is what is pinned.
- A5: Executed 2026-09-02 — read-load measures `/spec:build` at 353 of 500 lines (171 command + 182 shared), leaving room for D4's bullet — **if false:** trim the bullet; never touch the cap.
- A6: The stamp file is written only by `spec-session-stamp.sh`, so a stamp appearing where none existed at park time implies a process whose hook set includes the stamp hook (a new session) — **if false (another writer exists):** the override's reason field remains the audit trail; the residual is recorded in Rationale, not solved.
- A7: `verdict.js`'s three driver passes share one arg-builder (`viaModelArgs()`, read fresh per call) so appending `--checkpoint` there reaches hard-stop, escalate, and close identically — **if false:** the worker returns `blocked`; the insertion point is decided here.

## Rationale

**Why fail closed now, after locking the degrade on 2026-09-01.** The degrade was ratified
on the argument that the driver should not stall on evidence it cannot obtain. The evidence
since: both real loop reviews on this machine took the degrade, the checkpoint has never
fired, and the ledger cannot say so (ADR-0004). Core § Feedback Loop already measured the
printed-reminder form to fail for replay; a warning on the independence gate is the same
form on the gate whose whole value is that it cannot be walked past. A missing stamp under
`--via loop` is not "no evidence" — it is evidence that the pipeline's own hook layer is not
running, which core § Tiers puts on the critical tier.

**Why the restart remedy, not `/clear`.** The hook set is loaded at session start; a clear
keeps the process. Telling the user to `/clear` here would loop them back to the same park.

**Why a null park lifts on any stamp.** There is no recorded id to differ from, and a stamp
can only be written by the hook (A6); its appearance is the "hooks are running now" signal,
which in practice is a new process and therefore a new session. The residual — a stamp
written in the same session by a hook that loaded late — is not something Claude Code does
today and would show up as a `stamp-appeared` row whose session id equals the build
session's; not ledger-visible, accepted.

**Why the override is refused on same-session parks.** That park has a cheap, correct remedy
(`/clear`); admitting a reasoned override there would be exactly the bypass D2 of 03 exists
to prevent. The flag covers one case only: the hook is present and the stamp cannot be
written. Refusing it when the run is not parked keeps `overridden` truthful on the ledger.

**Why `checkpoint` sits after `verdict`.** Sibling 02's tests pin the first seven keys and
byte-identity-when-absent; the field is review-profile-only and appended only when passed.

**What is fragile.** The remedy text names a cause the docs do not confirm (A1); the fix
does not depend on it. Two sessions prompting `/spec:` in one root (02 D9) still last-writer-
wins the stamp; unchanged.

**Collision closure (executed at lock, 2026-09-02).** Literals leg for `degrad`, `admits
DISPOSITIONS directly`, `cannot verify a session change`, `printed warning`: the exact
carriers of the retired clause are `spec/scripts/spec-review-driver.js` and
`tests/review/loop-checkpoint.test.js` (File Plan rows), `docs/canonical/pipeline.md`
(Canonical Delta), and `spec/.claude-plugin/plugin.json`'s 7.50.0 changelog paragraph —
**waived**: a changelog paragraph is historical record; the 7.52.0 paragraph supersedes it in
the same file. `docs/adr/0004-loop-checkpoint-fails-closed.md` and
`docs/roadmap/18a-checkpoint-fail-closed.md` quote the retired clause as history (written
this session) — waived, roadmap/ADR prose is record, never a live claim. Every other
`degrad` hit (27 files) is an unrelated use of the word — waived. Counted: 35 literal hits,
32 waived, 3 handled (driver, test, canonical). Executes leg for
`spec-review-driver.js` (8 suites) and `verdict.js` (14 suites): the File Plan rows are
`loop-checkpoint`, `review-driver`, and `provenance`; no other suite creates a `--via loop`
driver run (grep `'loop'` across `tests/`, 2026-09-02), and `verdict.js` is byte-identical
without the new flags, so the remaining suites exercise unchanged paths and stay green.

**Kill condition (brief 18a § Scope 5).** Over the next 30 fleet loop reviews, more than 3
rows with `checkpoint.outcome == "overridden"` removes the override (ADR-0004 option C):
`jq -c 'select(.stage=="review" and .via=="loop") | .checkpoint' .claude/spec-runs.jsonl`.

## Canonical Delta

In `docs/canonical/pipeline.md` § One command per feature, replace the sentence beginning
"One checkpoint is enforced:" through "degrading to a warning when no stamp exists." with:

One checkpoint is enforced: a loop-driven review parks at CHECKPOINT after the reviewer
returns and admits DISPOSITIONS only once the session id in `.claude/spec-session.json` has
changed (a `/clear`), once per run. A missing stamp parks the same way and names the cause's
remedy — restart Claude Code, since the plugin hook set that writes the stamp is loaded at
session start — and lifts when any stamp appears; the only other exit is
`--skip-independence-check-because "<reason>"` on the dispositions mark. Every loop review
row records `checkpoint: {outcome}` — `cleared`, `stamp-appeared`, `overridden` (with the
reason), or `not-reached` — so how often the gate is skipped, and why, is a ledger query
(specs/20260901/05-checkpoint-fail-closed.md, ADR-0004).
