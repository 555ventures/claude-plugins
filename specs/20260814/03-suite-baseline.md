---
date: 2026-08-14
status: hardened
open_markers: 0
risk: T2
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260814/01-ac-matrix-script.md", "specs/20260814/04-lock-signal-window.md"]
depended_on_by: []
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
`--update`), and rides one **advisory** leg in review's Phase 0 — drift in either direction
becomes one mechanical finding. Done = the script's exec pins run green, the review.md leg
line and Test Rules pointer pins run green, and `verdict.js` provably derives the same word
with or without the new leg's row.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | CREATE `spec/scripts/suite-baseline.js` (repo script conventions: header with usage / dated incident / does-NOT-do / exit codes, hand-rolled `--flag value` parsing, remedy-naming errors). Registered as `spec-paths suite-baseline`. It is the sole derivation of expected-vs-observed suite-failure comparison — the hand-run base-worktree name-diff recipe is retired (it survives only as history in the memory that recorded it); never a second failing-set differ anywhere. | The tacit baseline is the root cause; a checked-in set plus one checker replaces forensic archaeology. Mechanizing the base-vs-HEAD diff as a leg was rejected — it re-pays base-tree derivation and the no-`node_modules` trap on every review. |
| D2 | Baseline artifact `.claude/suite-baseline.json`, host-owned (sibling of `spec-runs.jsonl`): `{"failing":[{"file":"<repo-relative>","name":"<full test name>"},…]}`, rows sorted by file then name, exact set. An optional `"flaky": true` on a row exempts it from BOTH drift directions (measured 2026-08-14: two autopilot tests swap failure membership run-to-run — without the marking, exact-set match coin-flips a noise finding every review). **Absent file = empty set** (the common host case: a clean suite needs no artifact). `--update` preserves existing flaky marks on surviving `(file,name)` rows and never sets `flaky` itself — declaring instability is a human/disposition judgment. | The `claims-baseline.json` ratchet shape, ratified twice; flaky is additive vocabulary forced by executed evidence, cheapest-to-reverse. |
| D3 | `--check --root <dir>` contract: read the host's `testCommand` via `lib/host-config.js` `readConfig` (the sole config reader), run it **bare** (no appended paths — the full suite IS what the declared `testCommand` runs with no arguments) with CWD `{root}`, in the review tree only — the script never creates or consults a second tree (no base-commit worktree: the incident's environmental-failure trap). Compare observed failing names to the baseline both directions. Exit 0 = exact match (flaky-exempt); 1 = drift, one line per test — `NEW-FAILING <file> :: <name>` / `FIXED-NOT-REMOVED <file> :: <name>` — plus a summary line `newFailing=<N> fixedNotRemoved=<M>` and a final remedy line naming `node "$(spec-paths suite-baseline)" --update --root <dir>` as the sole remedy; 2 = usage / unreadable-JSON baseline / no `testCommand` in config; 4 = unavailable (D4), printing `unavailable — <reason>`. | Names, never counts (counts lie — the incident's first trap); both directions because a pin that quietly went green is baseline rot exactly as a new failure is regression. |
| D4 | Failing-name extraction, v1 (no new capability key — deferred, see Rationale): suite exit 0 → the failing set is **empty by definition, zero output parsing, any runner** (so exit-0 + non-flaky baseline rows = derivable FIXED-NOT-REMOVED drift, never `unavailable` — a refinement over the consult brief). Suite exit non-zero → parse the node:test spec-reporter trailer: from the `✖ failing tests:` marker, pair each `test at <file>:<line>:<col>` line with its following `✖ <name> (<duration>)` line, strip the duration suffix (executed: Node v26.0.0 emits this format piped/non-TTY; 11 pairs matched 1:1). Non-zero exit with no parseable trailer → exit 4 `unavailable — cannot extract failing test names from runner output`, never a guess. | Honest-unavailability over silent wrongness (the `forge:"none"` precedent); the zero-parse exit-0 path makes clean-suite hosts fully portable with no format knowledge at all. |
| D5 | review.md Phase 0 step 3 gains one background leg (the `patterns` precedent — **recorded, never required**): `node "$(spec-paths suite-baseline)" --check --root {root}`, leg `suite`, observed `newFailing=<N> fixedNotRemoved=<M>` (or `unavailable — <reason>` on exit 4, which carries no finding). Exit 1 yields ONE mechanical **hard** finding — "suite drift vs .claude/suite-baseline.json: {lines}" — entering Phase 2 dispositions exactly as step 7's reconcile findings do. Step 8's hard-stop **trigger** list (gate/smoke/ci) is unchanged; step 8's closing sentence enumerating findings-producing legs ("`reconcile`, `ac-matrix`, `skip-reconcile` … never trigger this stop", review.md:188 at HEAD) gains `suite` — an additive word in the never-stops list, the only step-8 edit (refuter-corrected: that enumeration lives in step 8's close, not step 7). The leg re-runs on fix-delta iterations exactly as `patterns` does. `verdict.js` is untouched: `suite` joins neither `REVIEW_LEGS` nor `REVIEW_BLOCKING` — required-leg status would break every six-green-shaped fixture across five suites, re-committing the incident this spec fixes. Promotion is the scaffold-ledger row's evidence-gated condition, not v1. | Advisory-first is the repo's sanctioned guard lifecycle; verdict.js ignores unknown legs (read at HEAD: rows land in `legRows`, only `requiredLegs` are checked), so the leg rides free by construction. |
| D6 | Seeding (build duty, in the `.claude/suite-baseline.json` File Plan row): run `--update --root .` once at the repo root, then run `--check` twice more; any test present in one run's failing set but not the other gets hand-marked `"flaky": true` (measured candidates 2026-08-14: the autopilotd pidfile-SIGTERM test in `tests/autopilot/lock.test.js` and the preflight ready-file test — but the lock test's swap cause is fixed by `specs/20260814/04-lock-signal-window.md`, now a `depends_on`, so seeding runs post-fix and marks only what the double-check still observes). The seeded file is committed with the batch. | The one-time seeding is the forensic recipe's last performance; the double-check rule makes flake-marking deterministic instead of remembered. |
| D7 | `.claude/rules/spec-pipeline.md` § Test Rules: the parenthetical count `(11 as of 2026-08-01)` is **deleted**; the sentence now points at `.claude/suite-baseline.json` as the authoritative sanctioned-failing set (deletion + pointer, no net-new prose). `docs/canonical/autopilot.md`'s countless mention of INTAKE pins stays true and untouched (corpus stem-grep 2026-08-14: these are the only two loci; no test pins the count literal). | The stale count is the tacit baseline made visible as a lying number — the artifact replaces it. |
| D8 | Scaffold-ledger row (ADVISORY): promote when a `newFailing` finding survives disposition as a real defect; retire after two quarters of zero non-flake catches across hosts. Claims-baseline re-stamp for review.md's line delta rides the same commit; plugin.json bump target 6.75.0 (target, not a pin — concurrent sessions race semver). | Doctor check 13; repo hard review checks (missing ledger/baseline hunks). |
| D9 | v1 explicitly does NOT: touch `verdict.js` (its five format suites are spec 01's untouched regression net, A5 there); create worktrees or run at base commits; attribute a drift to a cause (disposition's job); run during build's scoped gate loops (review-only — the scoped gate's speed rationale survives intact); compare counts; add a capabilities key (reopen: the first non-node host carrying a red baseline). | Fencing the fix to the root cause keeps the blast radius at one advisory leg; every exclusion carries its reopen condition. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/suite-baseline.js | CREATE | scripts | D1–D4: run testCommand bare, parse trailer, exact-set compare, flaky exemption, --update |
| spec/bin/spec-paths | MODIFY | scripts | D1: `suite-baseline` key |
| spec/commands/review.md | MODIFY | doctrine | D5: step-3 `suite` leg line; step-7 findings-producing list gains `suite`; step-8 stop list unchanged |
| .claude/rules/spec-pipeline.md | MODIFY | other | D7: Test Rules count deleted, pointer to the artifact |
| .claude/suite-baseline.json | CREATE | other | D6: seeded via `--update` + double-`--check` flake-marking, committed |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D8: advisory row with promote/retire conditions |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D8: ratchet re-stamp for review.md's line delta (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: bump + changelog description |
| tests/suite-baseline/suite-baseline.test.js | CREATE | tests | AC-20260814-03-1 … AC-20260814-03-8 |
| tests/suite-baseline/doctrine.test.js | CREATE | tests | AC-20260814-03-9, AC-20260814-03-10, AC-20260814-03-11 |

## Contracts

```
# spec/scripts/suite-baseline.js
node suite-baseline.js (--check | --update) --root <dir>
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
  unstable test gets marked, with a deviation line.

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

Fragile spots for build: the trailer parser must skip the `✖ failing tests:` header line
itself (it matches `^✖ `); duration suffixes must strip before comparison; file paths in
`test at` lines are absolute-or-relative depending on invocation — normalize to
repo-relative before keying.

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
