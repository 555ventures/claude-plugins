---
date: 2026-08-14
status: done
diff_base: 4fd90683d604be55c9ed042045cdd7ed8ffb5177
open_markers: 0
risk: T2
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260814/01-ac-matrix-script.md", "specs/20260814/04-lock-signal-window.md"]
depended_on_by: ["specs/20260814/05-collision-closure.md"]
brief: 07
spiked: 2026-08-14
---

# suite-baseline.js — the sanctioned-red set becomes a checked-in, review-checked artifact

## Goal

The repo's expected-failing tests are folklore: prose plus a stale count in Test Rules, so a
full-suite run is unjudgeable, the pipeline gate had to be scoped, and a Decision that broke
five out-of-scope pins shipped through a green gate and a qualified-CLEAN review
(the 2026-08-14 escape on specs/20260813/10-host-capabilities.md). This spec declares the
set as `.claude/suite-baseline.json`, adds `spec/scripts/suite-baseline.js` (`--check` /
`--update`), and gives it two consumers: one **advisory** leg in review's Phase 0 — drift in
either direction becomes one mechanical finding — and one **blocking** check at the end of
`/spec:build` Phase 4, where a newly-broken test stops the build instead of shipping (D10,
amended 2026-08-14 on JJ's ruling after the third out-of-plan pin collision). Done = the
script's exec pins run green, the review.md leg line, the build.md consumer clause, and the
Test Rules pointer pins run green, and `verdict.js` provably derives the same word with or
without the new leg's row.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | CREATE `spec/scripts/suite-baseline.js` (repo script conventions: header with usage / dated incident / does-NOT-do / exit codes, hand-rolled `--flag value` parsing, remedy-naming errors). Registered as `spec-paths suite-baseline`. It is the sole derivation of expected-vs-observed suite-failure comparison — the hand-run base-worktree name-diff recipe is retired (it survives only as history in the memory that recorded it); never a second failing-set differ anywhere. | The tacit baseline is the root cause; a checked-in set plus one checker replaces forensic archaeology. Mechanizing the base-vs-HEAD diff as a leg was rejected — it re-pays base-tree derivation and the no-`node_modules` trap on every review. |
| D2 | Baseline artifact `.claude/suite-baseline.json`, host-owned (sibling of `spec-runs.jsonl`): `{"failing":[{"file":"<repo-relative>","name":"<full test name>"},…]}`, rows sorted by file then name, exact set. An optional `"flaky": true` on a row exempts it from BOTH drift directions (measured 2026-08-14: two autopilot tests swap failure membership run-to-run — without the marking, exact-set match coin-flips a noise finding every review). **Absent file = empty set** (the common host case: a clean suite needs no artifact). `--update` preserves existing flaky marks on surviving `(file,name)` rows and never sets `flaky` itself — declaring instability is a human/disposition judgment. | The `claims-baseline.json` ratchet shape, ratified twice; flaky is additive vocabulary forced by executed evidence, cheapest-to-reverse. |
| D3 | `--check --root <dir>` contract: read the host's `testCommand` via `lib/host-config.js` `readConfig` (the sole config reader), run it **bare** (no appended paths — the full suite IS what the declared `testCommand` runs with no arguments) with CWD `{root}`, in the review tree only — the script never creates or consults a second tree (no base-commit worktree: the incident's environmental-failure trap). Compare observed failing names to the baseline both directions. Exit 0 = exact match (flaky-exempt); 1 = drift, one line per test — `NEW-FAILING <file> :: <name>` / `FIXED-NOT-REMOVED <file> :: <name>` — plus a summary line `newFailing=<N> fixedNotRemoved=<M>` and a final remedy line naming `node "$(spec-paths suite-baseline)" --update --root <dir>` as the sole remedy; 2 = usage / unreadable-JSON baseline / no `testCommand` in config; 4 = unavailable (D4), printing `unavailable — <reason>`. | Names, never counts (counts lie — the incident's first trap); both directions because a pin that quietly went green is baseline rot exactly as a new failure is regression. |
| D3a | **Pre-image mode (amendment 2026-08-14 — attribution).** Two additions, one comparison engine, no second script: (i) `--snapshot --root <dir> --out <file>` runs the suite exactly as `--check` does and writes the observed failing set in the baseline row shape — suite exit 0 → an empty set is written; an unparseable trailer → exit 4 with **no file written**, never a partial or guessed snapshot. (ii) `--check … --pre <file>` performs **one** suite run and **two** comparisons: against the baseline as today, plus against the pre-image, and emits `PRE-NEW-FAILING <file> :: <name>` lines with a second summary line `preNewFailing=<N> preFixed=<M>`. The baseline's `flaky: true` rows are exempt from **both** pre-image directions as well — without that, a flake that passes at snapshot time and fails at check time is a false block, which is the single biggest hole in a raw pre-image. A missing or corrupt `--pre` file → exit 2 naming the remedy. | Attribution is the missing axis: the baseline answers "is this expected?", the pre-image answers "did *this build* cause it?". Same tree, same install, minutes apart — so it never pays D3's killed detached-base-worktree trap, and it makes the pre-image portable to worktree builds too, which A6's overnight membership movement proves also need it. |
| D4 | Failing-name extraction, v1 (no new capability key — deferred, see Rationale): suite exit 0 → the failing set is **empty by definition, zero output parsing, any runner** (so exit-0 + non-flaky baseline rows = derivable FIXED-NOT-REMOVED drift, never `unavailable` — a refinement over the consult brief). Suite exit non-zero → parse the node:test spec-reporter trailer: from the `✖ failing tests:` marker, pair each `test at <file>:<line>:<col>` line with its following `✖ <name> (<duration>)` line, strip the duration suffix (executed: Node v26.0.0 emits this format piped/non-TTY; 11 pairs matched 1:1). Non-zero exit with no parseable trailer → exit 4 `unavailable — cannot extract failing test names from runner output`, never a guess. | Honest-unavailability over silent wrongness (the `forge:"none"` precedent); the zero-parse exit-0 path makes clean-suite hosts fully portable with no format knowledge at all. |
| D5 | review.md Phase 0 step 3 gains one background leg (the `patterns` precedent — **recorded, never required**): `node "$(spec-paths suite-baseline)" --check --root {root}`, leg `suite`, observed `newFailing=<N> fixedNotRemoved=<M>` (or `unavailable — <reason>` on exit 4, which carries no finding). Exit 1 yields ONE mechanical **hard** finding — "suite drift vs .claude/suite-baseline.json: {lines}" — entering Phase 2 dispositions exactly as step 7's reconcile findings do. Step 8's hard-stop **trigger** list (gate/smoke/ci) is unchanged; step 8's closing sentence enumerating findings-producing legs ("`reconcile`, `ac-matrix`, `skip-reconcile` … never trigger this stop", review.md:188 at HEAD) gains `suite` — an additive word in the never-stops list, the only step-8 edit (refuter-corrected: that enumeration lives in step 8's close, not step 7). The leg re-runs on fix-delta iterations exactly as `patterns` does. `verdict.js` is untouched: `suite` joins neither `REVIEW_LEGS` nor `REVIEW_BLOCKING` — required-leg status would break every six-green-shaped fixture across five suites, re-committing the incident this spec fixes. Promotion is the scaffold-ledger row's evidence-gated condition, not v1. | Advisory-first is the repo's sanctioned guard lifecycle; verdict.js ignores unknown legs (read at HEAD: rows land in `legRows`, only `requiredLegs` are checked), so the leg rides free by construction. |
| D6 | Seeding (build duty, in the `.claude/suite-baseline.json` File Plan row): run `--update --root .` once at the repo root, then run `--check` twice more; any test present in one run's failing set but not the other gets hand-marked `"flaky": true` (measured candidates 2026-08-14: the autopilotd pidfile-SIGTERM test in `tests/autopilot/lock.test.js` and the preflight ready-file test — but the lock test's swap cause is fixed by `specs/20260814/04-lock-signal-window.md`, now a `depends_on`, so seeding runs post-fix and marks only what the double-check still observes). The seeded file is committed with the batch. | The one-time seeding is the forensic recipe's last performance; the double-check rule makes flake-marking deterministic instead of remembered. |
| D7 | `.claude/rules/spec-pipeline.md` § Test Rules: the parenthetical count `(11 as of 2026-08-01)` is **deleted**; the sentence now points at `.claude/suite-baseline.json` as the authoritative sanctioned-failing set (deletion + pointer, no net-new prose). `docs/canonical/autopilot.md`'s countless mention of INTAKE pins stays true and untouched (corpus stem-grep 2026-08-14: these are the only two loci; no test pins the count literal). | The stale count is the tacit baseline made visible as a lying number — the artifact replaces it. |
| D8 | Scaffold-ledger row, **one row, two consumers with different entry strengths**: review's `suite` leg enters ADVISORY (promote when a `newFailing` finding survives disposition as a real defect; retire after two quarters of zero non-flake catches across hosts); build's Phase 4 check (D10) enters **BLOCKING on pre-image-attributed `preNewFailing` only** — arrived-broken drift warns, never blocks — on shipped-escape evidence and the `scope-reconcile` precedent (ledger row 48 entered as a mechanical hard finding at review on this same evidence shape); its retire condition is two quarters of zero pre-image blocks. Claims-baseline re-stamp for review.md's + build.md's line deltas rides the same commit; plugin.json bump target 6.75.0 (target, not a pin — concurrent sessions race semver). | Doctor check 13; repo hard review checks (missing ledger/baseline hunks). Split strengths because the two consumers face different blast radii — see D10. |
| D9 | v1 explicitly does NOT: touch `verdict.js` (its five format suites are spec 01's untouched regression net, A5 there); create worktrees or run at base commits; attribute a drift to a cause (disposition's job); run **inside build's inner scoped-gate repair loops** — exactly one snapshot run at build Phase 0 and one check run at build Phase 4 after the scoped gate is already green (D3a/D10; the loops' speed rationale survives untouched, which is all the original review-only fence protected); compare counts; add a capabilities key (reopen: the first non-node host carrying a red baseline). | Fencing the fix to the root cause keeps the blast radius at one advisory review leg plus one end-of-build check; every exclusion carries its reopen condition. |
| D10 | **`/spec:build` gains a BLOCKING consumer with exact attribution** (amendment 2026-08-14, JJ ruling; revised same session after a retainer consult refuted the first draft's safety argument — see Rationale). **Phase 0:** at the exact step that flips `hardened → implementing` and writes `diff_base` — before any build edit — run `node "$(spec-paths suite-baseline)" --snapshot --root {root} --out .claude/spec-preimage/{specid}.json`, where `{specid}` is the spec path's date dir + number joined by a hyphen (`specs/20260814/03-suite-baseline.md` → `20260814-03`). **A resume NEVER re-snapshots** — the snapshot is bound to that one status-flipping step, which a resumed build skips by construction; re-snapshotting mid-build would absorb this build's own red TDD tests into the pre-image and mask them at Phase 4. **Phase 4:** after the resolved `gateCommand` is green and beside the existing `scope-reconcile` advisory, before the checkpoint-commit, run `--check --root {root} --pre .claude/spec-preimage/{specid}.json` exactly once. Disposition is four-way: **`preNewFailing > 0` BLOCKS** into Phase 4's existing repair path (the colliding pin is updated in place and retagged with the new AC-ID per § Gotchas, never weakened, never left red), then re-run; after the repair ceiling, consult the retainer, then escalate. **`newFailing > 0` with `preNewFailing = 0` WARNS loudly** — `pre-existing at Phase 0 — not this build's diff` — printing every name and the `--update` remedy, and **never enters the repair path**. **`fixedNotRemoved > 0` WARNS** with the `--update` remedy. **Exit 4, or a missing pre-image, WARNS and falls back** to blocking on baseline `newFailing`, printing the fallback note — conservative and deterministic, never a fresh mid-build snapshot. Exit 2 is a build-config defect: print the remedy and escalate. This check is part of Phase 4, so it covers the fast path exactly as the rest of Phase 4 does. Reopen (recorded, not v1): a host whose bare `testCommand` exceeds its `gateCommand` by an order of magnitude gets a config opt-out — never a silent skip. | The escape (five pins, green scoped gate, qualified-CLEAN review) is behavioral, not textual: the broken tests never name the changed file, so no grep can reach them and only execution adjudicates. Blocking is safe at Phase 4 in a way D5 is not at review — Phase 4 has no verdict machinery, so no fixture and no `verdict.js` line moves. **The attribution split is not a nicety: without it this Decision was incoherent.** Its repair prescription (retag the pin in place) is only correct for breakage this build caused; applied to breakage that arrived broken, it has the orchestrator editing tests another spec owns — the out-of-plan hot-patch `specs/20260814/05` exists to prevent. And the first draft's "a worktree build's baseline and code branched together" safety claim is falsified by this spec's own A6: failing membership moved overnight with zero code change, so stale-baseline false blocks reach worktree builds too. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/suite-baseline.js | CREATE | scripts | D1–D4: run testCommand bare, parse trailer, exact-set compare, flaky exemption, --update |
| spec/bin/spec-paths | MODIFY | scripts | D1: `suite-baseline` key |
| spec/commands/review.md | MODIFY | doctrine | D5: step-3 `suite` leg line; step-7 findings-producing list gains `suite`; step-8 stop list unchanged |
| spec/commands/build.md | MODIFY | doctrine | D10: Phase 0 pre-image capture at the `diff_base` write (never on resume) + Phase 4 `--pre` check with the four-way disposition |
| .gitignore | MODIFY | other | D10: ignore `.claude/spec-preimage/` — the per-build pre-image is scratch, never committed |
| .claude/rules/spec-pipeline.md | MODIFY | other | D7: Test Rules count deleted, pointer to the artifact |
| .claude/suite-baseline.json | CREATE | other | D6: seeded via `--update` + double-`--check` flake-marking, committed |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D8: advisory row with promote/retire conditions |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D8: ratchet re-stamp for review.md's line delta (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: bump + changelog description |
| tests/suite-baseline/suite-baseline.test.js | CREATE | tests | AC-20260814-03-1 … AC-20260814-03-8 |
| tests/suite-baseline/doctrine.test.js | CREATE | tests | AC-20260814-03-9, AC-20260814-03-10, AC-20260814-03-11, AC-20260814-03-12 |
| tests/terminal-observable-acs.test.js | MODIFY | tests | AC-20260814-03-13: add `suite-baseline` to the spec-paths key-set `expected` array + retag (amended 2026-08-14 — see Rationale) |

## Contracts

```
# spec/scripts/suite-baseline.js
node suite-baseline.js (--check [--pre <file>] | --update | --snapshot --out <file>) --root <dir>
# Exit codes: 0 = exact match (or --update wrote) · 1 = drift (--check only) ·
#   2 = usage, unreadable baseline JSON, or no testCommand in .claude/spec.config.json ·
#   4 = unavailable (suite failed but no failing names extractable) — prints
#   `unavailable — <reason>`, never guesses
# --check drift output, one line per test then a summary + remedy line:
#   NEW-FAILING <file> :: <name>
#   FIXED-NOT-REMOVED <file> :: <name>
#   newFailing=<N> fixedNotRemoved=<M>
#   remedy: node "$(spec-paths suite-baseline)" --update --root <dir>
# .claude/suite-baseline.json (host-owned; absent file = empty set):
#   {"failing":[{"file":"tests/foo.test.js","name":"the invariant sentence","flaky":true?},…]}
#   rows sorted by file then name; "flaky": true exempts a row from both drift directions;
#   --update preserves flaky marks on surviving (file,name) rows and never sets them
# Review evidence-manifest row (advisory — NOT in verdict.js REVIEW_LEGS/REVIEW_BLOCKING):
#   {"leg":"suite","exit":<code>,"observed":"newFailing=<N> fixedNotRemoved=<M>"}
#   (exit 4 → observed "unavailable — <reason>", no finding)
# --snapshot (D3a): writes the observed failing set in the baseline row shape to --out.
#   suite exit 0 → writes {"failing":[]}   ·   unparseable trailer → exit 4, NO file written
# --check --pre <file> (D3a): ONE suite run, TWO comparisons. Adds, after the baseline lines:
#   PRE-NEW-FAILING <file> :: <name>
#   preNewFailing=<N> preFixed=<M>
#   The baseline's `flaky: true` rows are exempt from BOTH pre-image directions too.
#   Missing/corrupt --pre file → exit 2 naming the remedy.
#
# Build consumer (D10 — one snapshot at Phase 0, one check at Phase 4, never in repair loops):
#   Phase 0, at the diff_base write, before any edit (a resume NEVER re-snapshots):
#     --snapshot --root {root} --out .claude/spec-preimage/{specid}.json
#     {specid} = the spec path's date dir + number, hyphen-joined (→ `20260814-03`)
#   Phase 4, after the scoped gate is green:
#     --check --root {root} --pre .claude/spec-preimage/{specid}.json
#   preNewFailing>0                      → BLOCK: repair path, retag the pin, re-run
#   newFailing>0 AND preNewFailing==0    → WARN `pre-existing at Phase 0 — not this build's
#                                          diff`, names + --update remedy, NO repair path
#   fixedNotRemoved>0                    → WARN: --update remedy; the update rides the batch
#   exit 4, or pre-image file missing    → WARN + fallback to blocking on baseline newFailing,
#                                          printing the fallback note; never a fresh snapshot
#   exit 2                               → build-config defect: print the remedy and escalate
```

## Behavior

- `--check` flow: read config `testCommand` (via `lib/host-config.js`; absent → exit 2 with
  remedy) → spawn it bare, CWD `{root}`, capturing stdout+stderr → derive the observed
  failing set (exit 0 → empty; else parse the trailer; else exit 4) → normalize file paths
  repo-relative, strip ` (<duration>ms)` suffixes → compare to the baseline's non-flaky rows
  both directions → report per D3.
- The suite leg runs inside review Phase 0 step 3's existing parallel background barrier —
  measured full-suite wall-clock here is ~10s (two runs, 2026-08-14), under the gate leg's
  own cost; net Phase 0 latency is unchanged.
- Review's `{root}` for a worktree build is the build worktree itself — the same tree the
  gate leg already executes in (installed, current). The trap D3 kills is a *second*,
  detached tree at an old commit, which has no `node_modules` and fails environmentally.
- Duplicate test names across files are disambiguated by the `(file, name)` pair key.
- INTAKE synergy: turning a pin green only by implementing its intake item now has a
  mechanical witness — the pin's baseline row goes FIXED-NOT-REMOVED until `--update`
  removes it, so the ledgered intake state and the declared set can no longer silently
  disagree.

## Acceptance Criteria

- **AC-20260814-03-1**: WHEN the suite run reports a failing test absent from the baseline
  THE SYSTEM SHALL exit 1 printing `NEW-FAILING <file> :: <name>` for it, the summary
  `newFailing=1 fixedNotRemoved=0`, and a remedy line naming `--update` (literal fixture: a
  synthetic host whose one test file fails and whose baseline file is absent) →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-2**: WHEN a baseline row without `flaky` names a test that passes THE
  SYSTEM SHALL exit 1 printing `FIXED-NOT-REMOVED <file> :: <name>` and
  `newFailing=0 fixedNotRemoved=1` (literal fixture: one passing test, baseline listing it)
  → tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-3**: WHEN the observed failing set exactly equals the baseline's
  non-flaky rows THE SYSTEM SHALL exit 0 with `newFailing=0 fixedNotRemoved=0` →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-4**: WHEN a `"flaky": true` row's test passes, AND WHEN it fails, THE
  SYSTEM SHALL exit 0 in both cases (the row matches either state; literal fixture: same
  baseline, two runs with the test toggled) → tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-5**: WHEN `.claude/suite-baseline.json` is absent THE SYSTEM SHALL treat
  the expected set as empty — a clean suite exits 0; a failing suite exits 1 with
  NEW-FAILING lines → tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-6**: WHEN the suite command exits 0 THE SYSTEM SHALL derive the empty
  failing set without parsing runner output (literal fixture: a `testCommand` printing
  non-node:test text and exiting 0, baseline carrying one non-flaky row → exit 1
  `FIXED-NOT-REMOVED`); and WHEN the suite command exits non-zero with no parseable
  `✖ failing tests:` trailer THE SYSTEM SHALL exit 4 printing
  `unavailable — cannot extract failing test names from runner output` →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-7**: WHEN `--update` runs THE SYSTEM SHALL rewrite the baseline to the
  observed failing set sorted by file then name, preserving `"flaky": true` on surviving
  `(file,name)` rows and never adding a flaky mark (literal fixture: pre-existing flaky row
  survives an update; a new row appears without `flaky`) →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-8**: WHEN invoked with an unknown flag, a corrupt baseline JSON, or a
  config lacking `testCommand` THE SYSTEM SHALL exit 2 with a stderr line naming the remedy;
  and WHEN `spec-paths suite-baseline` runs THE SYSTEM SHALL print the script's path (the
  key-registration carrier) → tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-9**: WHEN review.md Phase 0 is read THE SYSTEM SHALL list the `suite`
  leg in step 3 as a background leg invoked via `spec-paths suite-baseline`, recorded but
  not required; the findings-producing-legs enumeration in step 8's closing sentence SHALL
  include `suite`; and step 8's hard-stop trigger list SHALL CONTINUE TO name only `gate`,
  `smoke`, and `ci` → tests/suite-baseline/doctrine.test.js
- **AC-20260814-03-10**: WHEN `verdict.js` derives from a manifest whose six review legs are
  green plus a red `suite` row (`exit:1`) THE SYSTEM SHALL CONTINUE TO derive the same
  verdict word as without that row (literal: six-green manifest → `CLEAN` with and without
  the suite row), and `verdict.js` source SHALL CONTINUE TO exclude `suite` from
  `REVIEW_LEGS` and `REVIEW_BLOCKING` → tests/suite-baseline/doctrine.test.js
- **AC-20260814-03-11**: WHEN `.claude/rules/spec-pipeline.md` § Test Rules is read THE
  SYSTEM SHALL name `.claude/suite-baseline.json` as the sanctioned-failing-set authority
  and SHALL NOT contain a hardcoded failing-pin count (the `11 as of 2026-08-01` literal is
  gone) → tests/suite-baseline/doctrine.test.js
- **AC-20260814-03-12**: WHEN `spec/commands/build.md` is read THE SYSTEM SHALL name the
  `--snapshot … --out .claude/spec-preimage/{specid}.json` capture at the Phase 0 step that
  writes `diff_base`, SHALL state that a resumed build never re-snapshots, SHALL invoke
  `--check … --pre` exactly once at Phase 4 after the resolved `gateCommand` is green, and
  SHALL state the four-way disposition literally — `preNewFailing` blocks into the repair
  path; `newFailing` with `preNewFailing` zero warns as pre-existing and does NOT enter the
  repair path; `fixedNotRemoved` warns naming `--update`; exit 4 or a missing pre-image warns
  and falls back to blocking on baseline `newFailing`; and Phase 0 step 3's scoped-gate
  resolution SHALL CONTINUE TO carry no suite-baseline invocation (the inner repair loops stay
  scoped — regression pin on D9's surviving fence) → tests/suite-baseline/doctrine.test.js
- **AC-20260814-03-14**: WHEN `--snapshot --out <file>` runs against a suite exiting non-zero
  with a parseable trailer THE SYSTEM SHALL write the observed failing set in the baseline row
  shape; WHEN the suite exits 0 it SHALL write `{"failing":[]}`; and WHEN the trailer is
  unparseable it SHALL exit 4 and write **no file at all** (literal fixture: assert the path
  does not exist after the run — a partial snapshot would silently redefine "this build's
  fault") → tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-15**: WHEN `--check --pre <file>` runs and a test fails that is absent from
  the pre-image THE SYSTEM SHALL print `PRE-NEW-FAILING <file> :: <name>` for it and a
  `preNewFailing=<N> preFixed=<M>` summary; and WHEN a test fails that IS in the pre-image it
  SHALL be excluded from `preNewFailing` while still counting toward `newFailing` if the
  baseline lacks it (literal fixture: pre-image lists X; X and Y both fail; empty baseline →
  `newFailing=2`, `preNewFailing=1` naming only Y) →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-16**: WHEN a baseline row carries `"flaky": true` THE SYSTEM SHALL exempt
  that `(file,name)` from **both** pre-image directions as well as both baseline directions
  (literal fixture: the test is absent from the pre-image and fails at check time → exit 0,
  `preNewFailing=0` — the false-block a raw pre-image would produce) →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-17**: WHEN `--pre` names a missing or unparseable file THE SYSTEM SHALL
  exit 2 with a stderr line naming the remedy, never silently degrading to a baseline-only
  comparison (a silent degrade would report `preNewFailing=0` and let this build's own
  breakage warn through as pre-existing) → tests/suite-baseline/suite-baseline.test.js
- **AC-20260814-03-13**: WHEN `spec/bin/spec-paths`'s complete key set is scraped from its
  live case statement THE SYSTEM SHALL CONTINUE TO deep-equal the pinned `expected` array,
  with `suite-baseline` present in both (regression pin, green pre-change; D1's new key breaks
  this closed deep-equal by construction — the pin is the only place that key set is asserted)
  → tests/terminal-observable-acs.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-08-14): full suite via `npm test` twice and bare `node --test` once —
  ~10.1–10.3s wall each (35–36s user, ~475% CPU), 757/758 tests, 11 fail, 1 skipped, Node
  v26.0.0; piped (non-TTY) output uses the spec reporter whose `✖ failing tests:` trailer
  pairs a `test at <file>:<line>:<col>` line 1:1 with each `✖ <name> (<duration>)` line
  (11/11 pairs). **if false at build** (child_process spawn observes a different format):
  capture the real spawned output first, adjust the parser to what is observed, record the
  deviation — never assume the shell-piped format.
- A2 (executed 2026-08-14): bare `node --test` (the declared `testCommand`) discovers one
  file `npm test`'s glob misses — `autopilot/contract/contract.test.ts`, failing
  deterministically (vendored typebox import, sanctioned-inert per ADR-0007) — so the
  seeded baseline will carry that row; it is expected, honest, and self-consistent because
  `--update` and `--check` run the identical command. **if false** (the .ts row doesn't
  appear at seed time): seed with what is observed; the baseline records reality, not this
  assumption.
- A3 (executed 2026-08-14): failure membership swaps run-to-run for the autopilotd
  pidfile-SIGTERM test (`tests/autopilot/lock.test.js`, failed run 1, passed runs 2–3) and
  the preflight ready-file test (failed run 2 only) — D2's `flaky` field and D6's
  double-check marking rule exist because of this. **if false / more swaps at build:** mark
  whatever the double-check observes; log a deviation if the flaky set exceeds these two.
- A4 (read at HEAD, verdict.js:110–168): unknown manifest legs land in `legRows` and are
  ignored — only `requiredLegs` membership is checked — so the advisory `suite` row cannot
  affect any verdict word. **if false:** STOP — D5's advisory design is impossible without
  a verdict.js change, which D9 forbids; consult the user.
- A5: spec 01 (`ac-matrix-script`) lands before this builds (`depends_on`); its D5
  restructures review.md steps 5–6 but leaves step 3's background-leg block in place, so
  this spec's leg line is an additive, disjoint hunk. **if false / merge collision:**
  rebase the doctrine batch onto review.md at HEAD; the leg line is additive wherever
  step 3's leg list lives.
- A6: the nine non-flaky failing names are stable day-to-day (identical across all three
  runs). **if false at seed time:** the double-check rule (D6) absorbs it — a third
  unstable test gets marked, with a deviation line. **Partially falsified 2026-08-14 (later
  same day, re-executed at consult time): the bare suite reported 10 failing, not 11 —
  membership moved overnight.** This does not change D2/D6 (it is exactly the instability
  the `flaky` field and the double-check rule exist for) but it does mean the seeded set is
  whatever D6's double-check observes at build time, never the count recorded here.
- A7 (read at HEAD, build.md Phase 4): Phase 4 today is the resolved `gateCommand` + repair
  ceiling, then the D9-advisory `scope-reconcile` paragraph, then checkpoint-commit. D10's
  clause is an additive third paragraph in that same section, disjoint from Phase 0 step 3's
  gate resolution. **if false / build.md's Phase 4 has been restructured by a concurrent
  spec:** place the clause wherever the post-gate/pre-checkpoint-commit boundary lives, keep
  the ordering invariant (gate green → suite check → commit), and record the deviation.

## Rationale

Escape-driven (the 2026-08-14 escape row on specs/20260813/10): a behavior change in a
shared script broke five green-at-base pins in suites outside the spec's scoped gate; gate,
panel, and Gotcha were each structurally blind. The Fable retainer consult ruled the
candidate fix (mechanize the base-vs-HEAD failing-name diff as a review leg) the right
instinct pointed at the wrong mechanism — it re-pays base-tree derivation plus both
measured traps (counts lie; a detached base worktree has no `node_modules`) on every
review, while leaving the tacit baseline standing. Declaring the set is the fix; the
recipe's one legitimate remaining use is D6's one-time seeding.

Why advisory (D5/D9): the incident itself is the proof — five six-green-shaped fixtures
across five suites assume today's leg set; making `suite` required would break them all,
i.e. re-commit the escape as part of fixing it. The scaffold-ledger promote condition is
the sanctioned path to required status, on evidence. Why no capability key (D4): the key
lives in the hash-stamped grounding contract — a T3 surface whose edit flags every host
stale — and v1 needs no format knowledge for the dominant case (suite exits 0). Deferral is
the cheapest-to-reverse option; the reopen condition is recorded in D9 and brief 07. Why
`testCommand` bare rather than `npm test`'s glob (D3, refined mid-planning on executed
evidence): the config's declared command is the portable fact; seeding and checking with
the identical command makes the baseline self-consistent even where discovery differs
(A2's vendored `.ts` row — honest, expected). Why regression pins on the verdict word
(AC-10): this spec's whole safety argument is "the leg changes no verdict"; the pin makes
that argument mechanical, executed against real `verdict.js` without touching spec 01's
five-suite regression net.

Adversarial-check adjudication (2026-08-14, one refuter, everything else executed clean —
verdict.js fed both manifests printed CLEAN twice; the spawned non-TTY trailer shape held on
Node v26 including the `.ts`-file-as-single-test case; the new tests dir is picked up by
both the npm glob and the scoped gate glob): ACCEPTED and folded — D5/AC-9 originally cited
"step 7" as home of the findings-producing-legs list; the enumeration lives in step 8's
closing sentence (review.md:188), so the edit is an additive word in the never-stops list
and the hard-stop trigger list stays untouched.

**Third amendment (2026-08-14, same session — pre-image attribution; D3a added, D10 rewritten,
D8/D9 re-fenced, `.gitignore` row + AC-14…17).** JJ asked for the debt to be fixed structurally
rather than priced in. The debt was: D10 as first amended blocked on `newFailing` against the
repo-global baseline, so a build could halt on breakage another concurrent session left behind,
with no mechanical way to tell "I broke this" from "it arrived broken". The retainer consult
found that this was not merely inconvenient — it was **incoherent**. D10's own remedy sends a
`newFailing` into the repair path to retag the pin in place; applied to arrived-broken failures
that has the orchestrator editing tests another spec owns, which is precisely the out-of-plan
hot-patch `specs/20260814/05` was written to prevent. It also falsified the first amendment's
safety argument with this spec's own A6: failing membership moved overnight with zero code
change, so a stale baseline false-blocks worktree builds too, not only in-place ones. The fix
is attribution by construction — the build snapshots its own suite state before its first edit,
in the same tree with the same install (so it never pays D3's killed detached-worktree trap),
and Phase 4 blocks only on what that pre-image proves this build caused. Arrived-broken drift
still surfaces, loudly, and still reaches a human — at review, via D5's advisory leg, which is
the stage that has disposition machinery. The baseline is not made redundant: it keeps three
build-time jobs (the `flaky` vocabulary, the arrived-broken warn direction, and
`fixedNotRemoved` hygiene). Cost is one extra ~10s suite run per build. Residue accepted and
recorded: an unmarked flake first failing at Phase 4 still false-blocks (window narrowed from
"since the baseline was updated" to this build's duration); a concurrent in-place edit landing
between Phase 0 and Phase 4 is still misattributed as own-diff (only worktrees close that);
breakage the operator's own uncommitted work caused before Phase 0 is absorbed as arrived-broken
and caught only at review.

**Second amendment (2026-08-14, same session — the `spec-paths` key-set pin).** The plan-time
paths sweep authored in `specs/20260814/05-collision-closure.md` was run by hand across every
in-flight spec and found the same invisible collision in three of them, this one included: D1
adds a `spec-paths` key, and `tests/terminal-observable-acs.test.js` holds a **closed**
`deepStrictEqual` over the complete key set — the only place that set is pinned — so the new
key reddens it by construction, from outside this spec's File Plan and outside its scoped
gate. Added as a File Plan row plus the AC-13 regression pin rather than left to surface as a
mid-build out-of-plan patch, which is what happened on `specs/20260814/01` and had to be
waived at review.

**Amendment (2026-08-14, JJ ruling — D10 added, D8/D9 re-fenced, build.md row + AC-12
added; re-hardened same session, before any build).** Spec 01 closed with an out-of-plan
test-pin edit — the third recurrence of the colliding-pin class — and JJ asked for the
structural fix rather than a per-instance waiver. A Fable retainer consult first proposed a
grep-derived "closure" of tests naming the spec's File Plan paths, run blocking at build.
Live measurement retired that design in this session: (i) the bare suite is **10.1s**, the
grep closure **2.5s** — a 7-second saving, so the closure's entire economic case was the
red-by-design baseline that *this spec* declares away; (ii) the closure is a closure over
*naming*, while the escape this spec exists to fix (20260813/10, five pins) is *behavioral* —
a shared script's changed return value breaks tests that never name it, so no grep can
reach them. A heuristic that approximates an oracle you can afford to run is a hot patch.
D10 therefore runs the real oracle, once, where it is already safe to block. Two properties
make blocking cheap here that do not hold for D5's review leg: Phase 4 has no verdict
machinery (no fixture, no `verdict.js` line moves — D5's five-suite argument is untouched
and D5 is unchanged), and in a worktree build the baseline JSON and the code branched
together, so a `newFailing` row can only come from this build's own diff. The residue is
recorded honestly: an in-place build stacking onto a repo another session left broken now
stops — which is the correct outcome, not a regression; and a host whose bare suite dwarfs
its gate gets D10's recorded config-opt-out reopen, never a silent skip. The grep mechanism
is not dead — it survives, reduced to plan-time advisory listing plus the retired-literal
corpus sweep that has *no* execution oracle at any stage, in its own successor spec
(specs/20260814/05-collision-closure.md).

Fragile spots for build: the trailer parser must skip the `✖ failing tests:` header line
itself (it matches `^✖ `); duration suffixes must strip before comparison; file paths in
`test at` lines are absolute-or-relative depending on invocation — normalize to
repo-relative before keying.

**Build deviation, absorbed (2026-08-14).** D8's plugin.json bump target 6.75.0 was already
taken at HEAD (JJ-20260815-04 shipped it first), so the doctrine batch bumped to 6.76.0 with
the same changelog paragraph. This is the § Gotchas version-race class exactly as recorded —
a one-off, no new Gotcha owed.

**Review disposition (2026-08-15, CLEAN-with-qualifier).** One finding survived verification,
DEMONSTRATED: `keyOf` joined its `(file, name)` key with a **raw NUL byte typed into the
source** rather than the `'\0'` escape, which made git classify the whole script as binary —
`git diff` printed `Binary files … differ`, `git blame` was dead, and every future edit to the
sole derivation of suite-drift comparison would have been un-reviewable. Runtime semantics were
correct throughout and all pins passed, which is why no gate caught it. **Fixed** (the raw byte
replaced by the two-character escape; separator still U+0000, tests re-run green), then
re-reviewed at `scope: "fix-delta"` — CLEAN, no new findings. The `CLEAN-with-qualifier`
qualifier is the `ci` leg reporting `unavailable` (no CI run exists for this commit), not a
finding.

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
