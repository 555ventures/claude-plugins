---
date: 2026-08-20
status: implementing
diff_base: 730a2bc2725f5bc1485cac4fc13c41be21856374
open_markers: 0
tier: critical
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260820/06-typed-evidence-manifest.md"]
depended_on_by: []
brief: 16
---

# Review Driver — the review stage becomes a stepped program; review.md becomes the judgment shell

## Goal

The review stage gets what design already has: one deterministic driver
(`spec-review-driver.js`, the `spec-design-driver.js` pattern) that owns the stage's
sequencing — legs, all three verdict passes, ledger appends, the status flip, the
merge-back sequence — executing every subprocess-able step itself and printing exactly one
step at a time for the judgments only a session can make (reviewer dispatch, finding
dispositions, canonical-delta application, merge strategy). Today the session hand-performs
~14 choreography steps from prose around `review-legs.js`; procedural hallucination —
skipping or fabricating a required step while reporting success — is the measured largest
agent-failure class (38.5%, agenticrail.nz 2026-08-08), and a driver-owned sequence
structurally eliminates it rather than auditing for it. Done means: no review step can be
silently skipped (the driver refuses to advance past unverified artifacts), `review.md`
shrinks to a thin shell — invoke the driver, host the judgment conversations — and the
judgment points stay first-class: the driver names which judgment is due and hands over the
evidence paths, never the answer.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/spec-review-driver.js` on the design-driver contract: `<spec.md>` prints current state + only that step's instructions; `--mark <mark>` verifies the step's artifacts then advances; `--state` prints the bare state name; exit 0 = step printed, 2 = precondition failure or refused mark; state = spec frontmatter + `<spec>.review/review-state.json` sidecar + on-disk artifacts, re-entrant from cold (AC-20260820-07-1, AC-20260820-07-9, AC-20260820-07-11) | The in-repo proven shape for "a stage the model cannot skip steps of" — same contract, same exit alphabet, zero new conventions to learn; re-derivation from artifacts is what makes resume correct by construction |
| D2 | The driver EXECUTES deterministic steps itself — base derivation (`build_base`→`diff_base`→branch), frozen-base check + detached-worktree add/remove, per-iteration manifest lifecycle (`<spec>.review/manifest-<n>.jsonl`, never reused), `review-legs.js`, diffLoc, all three `verdict.js` passes, both ledger appends (verdict's line 2 verbatim), the `implementing → done` flip, `merge-back` inspect/merge/cleanup/verify, `replay --due`, `spec-status --next` capture — and PRINTS instruction steps for session-only work: skip-name extraction, reviewer + design-leg dispatch, dispositions, Canonical Delta + deviations fold, hygiene adjudication, the close commit, merge strategy, conflict resolution (AC-20260820-07-1, AC-20260820-07-6) | The brief's split: deterministic spine in code, judgment surfaced explicitly; every step the driver executes is one the session can no longer skip, mis-flag, or hand-compose (the ledger line and verdict flags were the two most re-typed contracts in the stage) |
| D3 | Marks are a closed set: `skips-extracted --file <f>` · `reviewer-returned --file <json>` · `dispositions --waived N --rejected N --fix-dispatched N` · `fix-applied` · `closed` · `merge-strategy <merge-commit\|ff-only\|squash\|rebase-ff>` · `conflicts-resolved`; every mark is verified before it lands — a missing/malformed reviewer return file, a `REVIEWER_FAILED` verdict, disposition counts exceeding the survivor+leg-finding pools, or `closed` on a dirty tree are refused with exit 2 and the state unchanged (AC-20260820-07-3, AC-20260820-07-4, AC-20260820-07-5, AC-20260820-07-7) | An unverifiable mark accepted on trust would re-open the procedural-hallucination class inside the driver itself; refusal messages name the repair, mirroring the design driver |
| D4 | `RED_BLOCKING` from review-legs: the driver itself runs the no-workflow hard-stop verdict, appends the `GATE_RED` ledger line, prints the red leg + remedy, and lands in terminal state `STOPPED`; a later invocation restarts at LEGS with a fresh manifest (AC-20260820-07-2) | "A stopped attempt is never invisible" was a prose duty the session could forget; driver-owned, it is unforgettable — and the reviewer stays structurally unreachable on a red substrate |
| D5 | Fix loop: `dispositions --fix-dispatched N>0` → FIX state (prints the worker-dispatch step); `fix-applied` → the driver re-runs legs `--fix-delta` on a fresh manifest and returns to REVIEWER for the fix-delta pass; iteration cap 2 is driver-enforced — a third `fix-applied` is refused and state ESCALATE prints the escalation step (AC-20260820-07-8) | The cap lived in prose and its miscounting was invisible; the driver counts iterations in the sidecar and the cap becomes unpassable rather than advisory |
| D6 | Merge phase: the driver runs `merge-back` inspect and prints the RECOMMEND line + the strategy question as the session's judgment step; `--mark merge-strategy <s>` is refused (exit 2, relocate instruction) while the driver's own inherited CWD is inside the build worktree; accepted, it runs merge (exit 3 → CONFLICTS state; `conflicts-resolved` verified by a concluded merge) then cleanup + verify + `spec-status --next` (printed verbatim) in one advance, deletes the sidecar, lands DONE; when review ran on the originating branch the driver skips MERGE with the one-line note (AC-20260820-07-12) | Relocation was the one step whose omission deletes the directory the session stands in — the inherited-CWD check makes the driver refuse instead of instruct, and merge-back's own exit-4 refusal stays as the second belt |
| D7 | `review.md` becomes the thin shell: setup, the driver loop protocol (the design.md shape), and the judgment rules that bind the session — the executed-evidence standard, "no finding dies by argument", disposition rules, conflict-by-intent, question style — with the standing pinned sentences kept verbatim ("derived by `verdict.js`, never asserted in prose", "Never hand-write the word", the `.claude/spec-runs.jsonl` reference, the env-preflight doc-parity sentence); all choreography paragraphs the driver now owns are deleted (AC-20260820-07-13) | The brief's target end state; the kept sentences are load-bearing pins (tests/run-ledger.test.js) and true statements about the driver's behavior — updating in place beats retagging four pins for zero semantic change |
| D8 | `spec/entrypoints.json` updated in the same diff: the driver's entry (`spec/commands/review.md` via `spec-paths review-driver`) and its script-to-script edges (`review-legs.js`, `verdict.js`, `merge-back.sh`, `spec-status.js`, `replay.js`); `review.md`'s moved edges are dropped from the manifest as the prose invocations disappear [no-ac: the entrypoints conformance suite (AC-20260820-04-*) is the standing oracle — any mismatch is already a red test] | Spec 04's guard makes this update mandatory and same-diff by construction; declaring it here keeps the worker from discovering it as a surprise red |
| D9 | The driver never recommends a disposition, never picks a merge strategy, and never renders user-facing reports — it prints machine summaries plus which judgment is due with the evidence paths; report assembly stays with the session via `report-render.js` (AC-20260820-07-6 pins the machine summary's presence, not its prose) [no-ac: the negative half — absence of recommendations — is a design constraint with no stable observable; enforced by review at the diff] | The brief's named failure mode: over-mechanizing adjudication is the autopilot mistake in new clothes; judgment points are repositioned, never automated |
| D10 | Sidecar lifecycle: `<spec>.review/` (state file, per-iteration manifests, reviewer-return copies) is never committed — the driver's printed hygiene listing marks it and `.claude/spec-runs/*.json` as EXPECTED; the sidecar is deleted at DONE (and dies with the worktree at cleanup, by design — every artifact that outlives the run already lives in `.claude/spec-runs`) (AC-20260820-07-12) | Durable evidence has a durable home (retention artifacts + ledger, spec 20260819/01); run-state is scratch and must not survive to confuse the next run |

### Build-time rulings (2026-08-21, post-green consult — the review session reads these from disk)

| ID | Ruling | Evidence |
|----|--------|----------|
| R1 | D2 partially unimplemented: base derivation shipped; the frozen-base check + detached-worktree add/remove did not, and `spec/commands/review.md` § Protocol still asserts the driver runs the frozen-base check. The scope cut of a locked critical-tier Decision takes a user disposition at review (fix or waive — never self-waived); the review.md sentence is corrected under either arm. Adjudication note: the old mechanism triggers only when HEAD has moved past the spec's last commit and would NOT have shielded this spec's own review from 8b0d668's interleaved foreign hunks — R4's attribution is the operative protection here. The `merge-base HEAD main\|master` fallback replacing the legacy "current branch" rung is accepted: it reaches only specs with neither `build_base` nor `diff_base` and replaces a degenerate self-diff with the fork point. | executed: grep + full driver read (zero frozen/detach hits); false claim at review.md line 30; old prose at `git show 730a2bc:spec/commands/review.md` Phase 0 |
| R2 | The Behavior line "a re-run of a `done` spec starts a fresh run" is dead and booby-trapped: spec-state-gate admits `done`, review.md Input promises the re-run, the driver prints terminal DONE — and recreating the sidecar directory by hand walks a full review whose CLOSE prints "the driver has already run the authoritative verdict" with `runId: undefined`, zero ledger append, zero retained evidence. Hard finding: either run the authoritative pass on a `done`-status re-review, or retire the re-run promise from review.md Input + this Behavior line and make the driver refuse a `done` spec with a recreated sidecar (exit 2 naming `/spec:escape`). Which arm is a user decision at review. | executed: synthetic host, done + mkdir sidecar → CLEAN dispositions → CLOSE, ledger 0→0; confirmed in source — `doCloseWork` is gated on `status !== 'done'` |
| R3 | D10's promote-on-merge lifecycle is accepted as the only self-consistent ordering (both constraints re-verified). Two consequences are findings: (1) a STOPPED/ESCALATE/abandoned worktree run's `GATE_RED` row lives only in the worktree ledger — invisible to `replay --due`, `spec-status`, and `/spec:escape` at the main root — and merge-back cleanup's refusal remedy (`worktree remove --force`) destroys it permanently; terminal-red evidence must not require a landed merge to become durable. (2) CLOSE's printed "Commit everything still uncommitted" plus prior doctrine's "evidence rides the close commit" reading breaks the tail: the merge LANDS, then evidence promotion deletes now-tracked files, the worktree goes dirty, cleanup exits 2, DONE never prints; the CLOSE step text must explicitly exclude `.claude/spec-runs.jsonl` and `.claude/spec-runs/` from the close commit, and the Canonical Delta states evidence no longer rides it. | executed: two worktree fixtures — red-gate abandon (row destroyed by the printed remedy) and committed-evidence merge (cleanup exit 2 after the merge landed) |
| R4 | `diff_base` 730a2bc stands — the true pre-image; no later sha excludes the sibling session's interleaved work without hiding this spec's own hunks in 8b0d668. 8b0d668 is not amended; f856f1c's message is the standing correction of record. Review proceeds by attribution: `spec/scripts/review-legs.js` + `tests/review/review-legs-smoke-wave.test.js` = the concurrent session's 7.14.1 smoke-wave fix, waived as foreign; the five `.claude/agent-memory/**` files and the ledger row = session bookkeeping, waived; `specs/20260821/02-replay-review-phase.md` = pipeline-owned, already excluded. The reviewer receives this list at dispatch so foreign hunks are never litigated as spec-07 scope; waives recorded in Rationale with attribution. | executed: `scope-reconcile --base 730a2bc` exit 3, seven outOfPlan paths |
| R5 | D4 amended by ruling: STOPPED is sticky/idempotent; "a later invocation restarts at LEGS with a fresh manifest" reads as "a later invocation, after the red iteration's manifest (or the sidecar) is deleted, restarts at LEGS with a fresh manifest." Restart-on-bare-invocation is unimplementable against AC-9's no-side-effect guarantee (a `--state` probe would append a duplicate `GATE_RED`); the printed remedy names the exact paths. | accepted as recorded; AC-9 pins the no-side-effect guarantee |
| R6 | `marks.escalated` accepted: adversarial sidecar edits executed both directions — hand-setting the flag flips only the printed label (a `fix-applied` under the fake flag still succeeds; the cap ignores it), and clearing it from a real ESCALATE buys nothing (fourth `fix-applied` refused exit 2, no manifest-4). The Rationale warning's substance — enforcement never derives from a stored counter — holds; the spoofable label carries no authority. plugin.json 7.14.0-not-7.13.0 accepted per the standing `[host]` semver-race gotcha. | executed: two synthetic hosts, edits + refusals observed |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | CREATE | scripts | D1–D6, D9, D10: the state machine (LEGS → SKIPS? → REVIEWER → DISPOSITIONS → FIX/ESCALATE? → CLOSE → MERGE/CONFLICTS → DONE; STOPPED terminal), executes deterministic steps, verifies marks |
| spec/commands/review.md | MODIFY | doctrine | D7: thin shell — driver protocol + judgment rules; choreography deleted; pinned sentences kept |
| spec/bin/spec-paths | MODIFY | scripts | `review-driver` case entry + usage-line token |
| spec/entrypoints.json | MODIFY | other | D8: driver entry + its five script edges; review.md's moved edges dropped |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump target 7.13.0 (next free at build time) + description changelog |
| tests/review/review-driver.test.js | CREATE | tests | AC-20260820-07-1 … AC-20260820-07-12 — behavioral, tmpdir synthetic hosts with git |
| tests/spec-paths.test.js | MODIFY | tests | `review-driver` key resolves to the script (existing key-resolution pattern) |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260820-07-13 — tag the existing review.md sentence pins as regression carriers |

## Contracts

```
# spec-review-driver.js (design-driver contract shape)
spec-review-driver <spec.md>                  -> print current state + ONLY that step
spec-review-driver <spec.md> --mark <mark>    -> verify artifacts, record, print next step
spec-review-driver <spec.md> --state          -> state name only
Exit codes: 0 = step printed · 2 = precondition failure or refused mark (message names the repair)

# States (derived from frontmatter + sidecar + artifacts; never trusted from the sidecar alone)
LEGS          driver work: base, frozen-base check (+ detached worktree when needed), fresh
              manifest <spec>.review/manifest-<iteration>.jsonl, review-legs.js, diffLoc
STOPPED       terminal after RED_BLOCKING: hard-stop verdict run, GATE_RED ledger line
              appended, red leg + remedy printed; re-invocation restarts LEGS
SKIPS         gate row reports skips > 0 and no skips file yet -> prints extraction step
              mark: skips-extracted --file <f>   (driver re-runs legs --skips, fresh manifest)
REVIEWER      prints dispatch step (reviewer + conditional design legs, return shape)
              mark: reviewer-returned --file <json>   (shape-validated; REVIEWER_FAILED refused)
DISPOSITIONS  driver runs presentation verdict; prints survivors + leg findings + which
              judgment is due
              mark: dispositions --waived N --rejected N --fix-dispatched N   (pool-validated)
FIX           prints worker-dispatch step; mark: fix-applied -> legs --fix-delta, -> REVIEWER
ESCALATE      third fix iteration refused; prints escalation step
CLOSE         driver work: authoritative verdict (--ledger --retain .claude/spec-runs),
              ledger line 2 appended verbatim, status -> done; prints Canonical Delta +
              deviations fold + hygiene listing (EXPECTED paths marked) + close-commit step
              mark: closed   (refused unless status done ∧ tree clean apart from sidecar)
MERGE         driver runs merge-back inspect; prints RECOMMEND + strategy judgment step
              mark: merge-strategy <s>   (refused while driver CWD is inside the worktree)
              -> merge; exit 3 -> CONFLICTS (mark: conflicts-resolved, verified concluded);
              then cleanup + verify + spec-status --next verbatim, sidecar deleted -> DONE
              (skipped with a one-line note when review ran on the originating branch)
DONE          terminal; re-prints the next pointer

# Sidecar
<spec>.review/review-state.json    marks, iteration count, manifest paths, base, runIds
<spec>.review/manifest-<n>.jsonl   one per iteration, never reused
Never committed; deleted at DONE.
```

## Behavior

- The session's whole protocol is the design-stage loop: run the driver, do exactly the
  printed step, mark it, re-run. Deterministic steps happen inside the driver invocation
  itself — a session that only ever follows printed steps can no longer skip a ledger
  append, reuse a stale manifest, hand-compose a verdict flag, or forget the hard-stop row.
- Judgment arrives as a named step with evidence paths: "dispositions due — survivors at
  <path>, leg findings N; mark with the counts the user ruled." The conversation, the
  recommendations, and the user questions stay session-authored under review.md's rules.
- Interruption at any point resumes correctly: the driver re-derives state from disk and
  re-prints the current step; a mark that was recorded is never re-demanded; a mark whose
  artifact vanished is demanded again.
- A re-run of a `done` spec starts a fresh run (new sidecar), exactly like today's re-review.

## Acceptance Criteria

- **AC-20260820-07-1**: WHEN the driver is invoked on an `implementing` spec in a synthetic
  host whose legs all pass THE SYSTEM SHALL execute review-legs itself (manifest
  `manifest-1.jsonl` exists with the leg rows) and print the REVIEWER dispatch step —
  never a leg instruction (literal: stdout names the reviewer step; state `REVIEWER`) →
  tests/review/review-driver.test.js
- **AC-20260820-07-2**: WHEN the synthetic gate fails THE SYSTEM SHALL append exactly one
  `GATE_RED` ledger line to `.claude/spec-runs.jsonl` (byte-equal to verdict.js's stdout
  line 2), print the red leg and its remedy, and report state `STOPPED`; no reviewer step
  is ever printed → tests/review/review-driver.test.js
- **AC-20260820-07-3**: WHEN `--mark reviewer-returned --file <missing-or-malformed>` is
  passed THE SYSTEM SHALL exit 2 naming the defect and leave the state unchanged →
  tests/review/review-driver.test.js
- **AC-20260820-07-4**: WHEN the return file's `verdict` is `REVIEWER_FAILED` THE SYSTEM
  SHALL refuse the mark (exit 2) and print the re-dispatch instruction →
  tests/review/review-driver.test.js
- **AC-20260820-07-5**: WHEN `--mark dispositions` counts exceed the survivor + leg-finding
  pools THE SYSTEM SHALL exit 2 (verdict.js's contradiction arithmetic, surfaced through
  the driver) and leave the state unchanged → tests/review/review-driver.test.js
- **AC-20260820-07-6**: WHEN a clean run reaches CLOSE (reviewer returned clean, zero
  survivors, `dispositions 0 0 0`) THE SYSTEM SHALL have run the authoritative verdict with
  `--retain .claude/spec-runs`, appended exactly one ledger line byte-equal to verdict's
  stdout line 2, flipped `status: implementing → done`, and printed the close-step
  instructions (Canonical Delta, hygiene listing with `.claude/spec-runs/*.json` and the
  sidecar marked EXPECTED, close commit) → tests/review/review-driver.test.js
- **AC-20260820-07-7**: WHEN `--mark closed` is passed while the tree is dirty beyond the
  sidecar THE SYSTEM SHALL exit 2 naming the unexpected paths →
  tests/review/review-driver.test.js
- **AC-20260820-07-8**: WHEN `dispositions --fix-dispatched 1` is marked THE SYSTEM SHALL
  print the FIX step; after `fix-applied` it SHALL re-run legs `--fix-delta` on a fresh
  `manifest-2.jsonl` and return to REVIEWER; a third `fix-applied` SHALL be refused with
  state `ESCALATE` (literal: iteration cap 2) → tests/review/review-driver.test.js
- **AC-20260820-07-9**: WHEN the driver is re-invoked with no mark THE SYSTEM SHALL print
  the same step again with no side effects — no duplicate manifest rows, no duplicate
  ledger lines (literal: two consecutive no-mark invocations at REVIEWER → identical state,
  ledger byte-identical) → tests/review/review-driver.test.js
- **AC-20260820-07-10**: WHEN the gate row reports skips > 0 and no skips file was marked
  THE SYSTEM SHALL print the SKIPS extraction step; after `skips-extracted --file <f>` it
  SHALL re-run legs with `--skips <f>` on a fresh manifest → tests/review/review-driver.test.js
- **AC-20260820-07-11**: WHEN `--state` is passed THE SYSTEM SHALL print the bare state
  name only (e.g. `REVIEWER`) → tests/review/review-driver.test.js
- **AC-20260820-07-12**: WHEN `merge-strategy` is marked from the main root in a two-branch
  fixture THE SYSTEM SHALL run merge, cleanup, and verify, print `spec-status --next`'s
  output verbatim, delete the sidecar, and land `DONE`; the same mark passed while the
  driver's CWD is inside the build worktree SHALL be refused (exit 2, relocate instruction)
  → tests/review/review-driver.test.js
- **AC-20260820-07-13**: WHEN the plugin suite runs THE SYSTEM SHALL CONTINUE TO find in
  `review.md` the sentences "derived by `verdict.js`, never asserted in prose", "Never
  hand-write the word", and the `.claude/spec-runs.jsonl` reference (tag the existing
  tests/run-ledger.test.js pins with this AC-ID) → tests/run-ledger.test.js

## Assumptions (escalation triggers)

- A1: the design-driver contract (state sidecar + verified marks + one-step printing +
  exit 0/2) is the ratified house pattern for stage drivers (spec-design-driver.js header,
  design.md Protocol; brief 16 names review-legs.js and this pattern as the templates) —
  **if false** (JJ wants a different driver shape): STOP, this spec's Contracts are wrong
  wholesale.
- A2: every subprocess the driver owns has a documented exit alphabet it can branch on —
  review-legs 0/1/2, verdict 0/1/2, merge-back 0/2/3/4, spec-status/replay 0/1 (verified in
  source headers 2026-08-20) — **if false:** the missing code is a defect in that script,
  fixed there first, never papered over in the driver.
- A3: the driver inherits the session's CWD, so `process.cwd()` inside the worktree is a
  faithful relocation check — **if false** (a host invokes it detached): merge-back's own
  exit-4 refusal remains the second belt; record the host pattern.
- A4: `review.md`'s pinned sentences survive the thin-shell rewrite verbatim, so the
  run-ledger pins stay green and are tagged, not rewritten — **if false** (a pin trips on
  the new prose): update the pin in place + retag per the collision gotcha, never weaken.
- A5: spec 06 lands first (`depends_on`), so the driver reads typed manifest rows
  (`observed.skips` for the SKIPS branch) from day one — **if 06 is blocked:** STOP and
  re-order; building the driver against the string grammar would add a consumer to the
  surface 06 deletes.
- A6: the reviewer return shape (`{verdict, survivors, killed, reviewerCount, scope,
  tokens}`) is stable as pinned in review.md/verdict.js — the driver validates that shape
  — **if a reviewer-side change lands concurrently:** the validator and this spec's AC-3
  update together, recorded as a deviation.

## Rationale

The brief's first move at the stage where the evidence is strongest: review had the most
hand-performed deterministic steps (14) wrapped around the pipeline's most safety-critical
derivations, and its precedent script's header already states the thesis ("this script IS
that phase"). The whole-stage stepped shape was chosen by JJ over machine-halves and
minimal-absorb (2026-08-20, this session): the halves variant leaves prose seams exactly at
the judgment island's borders, which is where the field-report class lives. What the driver
executes vs prints follows one rule — can a subprocess do it without judgment? — so agent
dispatch, dispositions, prose application, commits, and strategy stay session-owned; D9
guards the other direction (the autopilot mistake). Entry-point bookkeeping: this spec
pushes script-to-script edges from 12 to ~17, at spec 04 D12's "materially past a dozen"
successor trigger — deliberately deferred, recorded here rather than silently: the growth
is hub-shaped (one new caller), per-edge declaration stays linear and keeps 04's rename
detection, and the honest re-evaluation point is the build/plan drivers (the next hubs),
where the reachability rewrite becomes its own spec. Fragile to watch at build: the merge
tests must use async-safe fixtures (merge-back tests already model this); the driver must
re-verify artifacts on every invocation rather than trusting sidecar marks (a deleted
return file demands the mark again); and ESCALATE must not be reachable by sidecar editing
alone — the iteration count derives from manifest files present, not a stored counter.

Collision closure (executed at lock, 2026-08-20, 6 literal stems): the only edited grammar
carrier is `review.md`, a File Plan row. Recorded waives: every other `spec-paths
review-legs/verdict/merge-back/spec-status/replay` hit (replay.md, release.md, doctor.md,
plan.md, status.md, init.md, enter-worktree.md, core.md) is that stage's own genuine
invocation, untouched by this spec — 07 moves only review.md's edges, and the entry-point
conformance suite (spec 04) is the deterministic enforcement that the manifest moves with
them; `mktemp` hits outside review.md are unrelated uses (release/replay's own manifests,
smoke.sh, verdict.js retention temp file, setup scripts); `docs/canonical/review.md` is
owned by this spec's Canonical Delta; the paths-leg `likely` on
`tests/consistency/entrypoints.test.js` needs no test edit — that suite derives from the
live repo, and D8's same-diff manifest update is the closure.

## Canonical Delta

`docs/canonical/review.md`: the flow description is rewritten around the driver — states,
marks, what the driver executes vs prints, the sidecar lifecycle, and the rule that
review.md hosts judgment while the driver owns sequencing; the existing "sole derivation"
entries (verdict.js, scope-reconcile.js) gain the sentence that the driver is their sole
invoker within the review stage.
