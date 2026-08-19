---
date: 2026-08-19
status: implementing
tier: standard
area: review
design: false
breaking: false
depends_on: [specs/20260819/01-review-evidence-retention.md]
depended_on_by: []
open_markers: 0
diff_base: fe096c335ee22bd4dfffa0d7ed91bedb74fd7443
brief: 14
---

# Scheduled mutation replay: the reviewer's catch-rate becomes a measured number

## Goal

Generalize the one-time v7 replay eval (docs/audit/v7-replay-eval.md) and the ad-hoc
2026-08-18 consult injection into a scheduled, deterministic harness: every 5th review, a
known defect from a typed corpus is injected into a just-CLEANed spec's tree in a scratch
worktree, the standard reviewer is dispatched blind, and catch/miss lands as a
`stage:"replay"` ledger row. Done = the harness's mechanics are pinned by executed tests,
the corpus ships with 6 classes aimed at measured blind spots, the cadence is core.md
policy, and `replay.js --stats` prints a catch-rate — the number that makes v7's
one-reviewer bet falsifiable.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New script `spec/scripts/replay.js` (spec-paths key `replay`) owning the deterministic mechanics as flag modes: `--due`, `--select`, `--setup`, `--apply`, `--score`, `--record`, `--stats`, `--teardown` — hand-rolled flags, zero dependencies, header per Worker Rules (AC-20260819-02-1 … -8) | The brief demands a script-owned harness; one script with modes beats eight scripts (one glob, one header, one test file) — rejected: folding modes into review-legs.js (its header forbids deciding whether to run) |
| D2 | `--due`: due when review rows appended after the last replay row (read-order, live+archives via lib/observation.js readLedgerRows) number ≥ 5; exit 0 = due (prints `due reviewsSince=N`), exit 1 = not due, exit 2 = usage (AC-20260819-02-1) | JJ-confirmed cadence 2026-08-19: every 5th review (~20% review-cost overhead); read-order matches the observation reader's union-merge stance |
| D3 | `--select`: among CLEAN review rows with a `runId` appended after the last replay row, prefer `tier:"critical"`, tie → latest; target commit = `git log -1 --format=%H -- <spec path>` (the close commit touches the spec's status flip); prints `spec=… reviewRunId=… commit=…` (AC-20260819-02-2) | Critical-tier priority sampling per the brief; the close commit is the newest commit guaranteed to contain exactly the reviewed tree for that spec |
| D4 | `--setup --commit <sha> --dir <path>`: REFUSES a `--dir` inside the repo (exit 3), creates `git worktree add --detach`, writes a `.replay-worktree` marker inside; `--teardown --dir <path>` refuses without the marker (exit 3), else `git worktree remove --force` (AC-20260819-02-3, AC-20260819-02-8) | The main tree is never touched — restore is worktree removal; the marker guard means teardown can only ever delete a directory this harness created (this session's own spike accidentally created a worktree inside the repo — the refusal pins that mistake) |
| D5 | `--apply --dir <d> --patch <file> --class <id>`: `git apply` then commit on the detached HEAD (`replay: <class>`), so the mutation is inside `base..HEAD` — the diff surface the reviewer and every leg actually read (AC-20260819-02-4) | An uncommitted mutation is invisible to `git diff base..HEAD`; the throwaway detached commit dies with the worktree |
| D6 | Leg verification reuses `review-legs.js` run by the orchestrating session against the worktree (`--root <dir>`) — replay.js never re-derives legs; a red leg records outcome `leg-caught` and skips the reviewer dispatch (AC-20260819-02-6 covers the row) | review-legs.js is the sole leg derivation (Risk Tiers); a leg that catches the mutation is itself a data point, and the ~100k-token reviewer dispatch is wasted on it |
| D7 | `--score --workflow <file> --file <path> --line N`: ≥1 finding with the mutated file and line within ±5 → prints `caught`; findings but none matching → `ambiguous` (session adjudicates via one AskUserQuestion); zero findings → `missed`; exit 0 always when parseable (AC-20260819-02-5) | Deterministic proxy first, judgment only on the ambiguous residue — a pure-deterministic scorer would misgrade a reviewer that names the defect from its call site |
| D8 | `--record --spec … --review-run-id … --class … --file … --legs green\|red:<leg> --outcome caught\|missed\|leg-caught [--patch <file>] [--workflow <file>] [--tokens N]`: generates runId `rp_` + 12 lowercase hex, appends the pinned ledger row to `.claude/spec-runs.jsonl`, writes `.claude/spec-runs/<rp_id>.json` (patch + reviewer return verbatim; reviewer null on leg-caught) (AC-20260819-02-6) | Script-owned append (unlike escape's choreography) because the row's shape is the catch-rate's substrate; evidence retention mirrors sibling spec 01's artifact discipline |
| D9 | `--stats`: aggregates replay rows — total, caught, missed, leg-caught, per-class counts, and `catch-rate = caught/(caught+missed)` (leg-caught excluded: the reviewer was never asked) (AC-20260819-02-7) | The catch-rate view lives in the harness, NOT in spec-status.js — its `--root/--next/--json` shape and five action strings are a frozen API (Risk Tiers) that a sixth surface must not touch |
| D10 | New command `spec/commands/replay.md` orchestrates: due → select → a Sonnet worker authors the mutation patch from the corpus class recipe (one retry if legs go red) → legs in the worktree → dispatch the reviewer BLIND with review.md Phase 1's exact contract (same agent, same inputs, no replay mention anywhere in its prompt) → score → record → teardown → report via report-render [no-ac: doctrine choreography; regex-over-prose pins are unsanctioned (Test Rules) — the reviewer verifies the file against this row] | Blindness is the measurement's validity: a reviewer told it is being tested measures nothing; mutation authoring is model work, so it lives in the command, not the script |
| D11 | Corpus `spec/doctrine/replay-corpus.md` (key `replay-corpus`): 6 hand-authored classes (Contracts section lists them), each with a recipe requiring the mutation to sit inside the target spec's File Plan files and leave all legs green by construction; refreshed each major pipeline version; real escapes fold in as new classes [no-ac: prose corpus; its parse surface is pinned via AC-20260819-02-9's structural check] | JJ-confirmed 2026-08-19 over escape-derived: 2 escape rows today means a derived corpus starves for months; hand-authored classes aim at the pre-cutover eval's measured misses |
| D12 | core.md § Feedback Loop gains the cadence policy: replay is due every 5th review and at minimum once per major pipeline version, critical-tier targets first; a sustained replay miss-rate is the evidence that reopens the second-reviewer question [no-ac: doctrine invariant text, same sanction as D10] | Cadence as session memory is the anti-pattern the brief names; the reopen sentence closes the loop brief 09's Out-of-scope opened |
| D13 | review.md's CLEAN close report gains a `warns` slot line when `replay.js --due` exits 0 (`🧪 reviewer replay due — run /spec:replay`) — advisory, never blocking [no-ac: doctrine choreography, same sanction as D10] | The deterministic reminder that makes "scheduled" real without a scheduler; blocking a CLEAN on a measurement chore would invert priorities |
| D14 | spec-paths: keys `replay` + `replay-corpus`, usage line updated, `shared-for replay` = Host Grounding, Tiers, Model Placement, Decisions, Question Style, Console Output Style, Feedback Loop (AC-20260819-02-10) | New-surface checklist (Planning rules); Feedback Loop is where the cadence policy lives, so the command must be served it |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | ADD | scripts | D1–D9: all harness modes; header with usage, incident (brief 14 / 2026-08-18 consult), NOT-do list (never re-derives legs, never touches the main tree), full Exit codes list |
| spec/doctrine/replay-corpus.md | ADD | doctrine | D11: the 6 classes from Contracts, each id + recipe + leg-invisibility requirement + worked example |
| spec/commands/replay.md | ADD | doctrine | D10: frontmatter (description, argument-hint), orchestration, blind-dispatch contract, report slots |
| spec/bin/spec-paths | MODIFY | scripts | D14: two keys, usage line, shared-for replay section list |
| spec/commands/review.md | MODIFY | doctrine | D13: replay-due warns line in the CLEAN close report |
| spec/doctrine/core.md | MODIFY | doctrine | D12: Feedback Loop cadence + reopen sentence |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version 7.3.0 → 7.4.0; description changelog paragraph (last-3-versions form) |
| tests/replay/replay.test.js | ADD | tests | AC-20260819-02-1 … -9 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260819-02-10; update any key-set/usage pin in place (the known spec-paths additive-collision class) |

## Contracts

Replay ledger row (D8 — fixed shape, numbers/enums/paths only, never prose):

```
{"ts":"<ISO-8601>","stage":"replay","spec":"<target spec path>","runId":"rp_<12hex>",
 "reviewRunId":"<the replayed review row's runId>","class":"<corpus class id>",
 "file":"<mutated repo-relative path>","legs":"green"|"red:<leg>",
 "outcome":"caught"|"missed"|"leg-caught","tokens":N}
```

Evidence artifact `.claude/spec-runs/<rp_id>.json`: `{runId, ts, spec, reviewRunId, class,
file, patch: "<unified diff verbatim>", reviewer: <workflow return verbatim> | null}`.

Corpus v1 classes (D11) — each recipe binds: mutation inside the target spec's File Plan
files; all nine legs green by construction (a red leg at verify time → outcome leg-caught,
never a corpus fix-up mid-run):

```
promise-carried-not-delivered  — a Decision's cited AC test asserts an adjacent fact;
                                 the promised behavior itself is edited away (the
                                 reviewer's semantic-residue duty, its measured weak spot)
self-consistent-polarity       — flip a guard's polarity AND its covering assert (suite
                                 green, behavior inverted)
silent-fallback                — replace a throwing error path with a defaulting fallback
                                 the spec forbids
boundary-shift                 — off-by-one on a spec'd inclusive/exclusive bound whose
                                 literal example never became a test
dead-wiring                    — a flag/config key still parsed but its read site severed
                                 (config promises are verified by executing the path)
doc-contract-lie               — a header/doc claim (exit code, format) contradicted by a
                                 code change; docs carry no test
```

Exit codes (replay.js header): 0 = mode succeeded (`--due`: due) · 1 = `--due` not due ·
2 = usage / unreadable input · 3 = safety refusal (worktree dir inside repo; teardown
without marker) · 4 = git operation failed.

## Behavior

The scheduled loop: a CLEAN review close prints the due warning; the user (or a session)
runs `/spec:replay`; the command selects the target, a Sonnet worker authors one mutation
from one corpus class, the harness stands up a scratch worktree outside the repo, commits
the mutation on a detached HEAD, the session runs review-legs there — red means the legs
caught it (recorded, cheap, no reviewer) — green means the standard reviewer is dispatched
exactly as review.md Phase 1 dispatches it, blind. The score lands as one ledger row plus
one evidence artifact; the worktree is removed; the main tree was never touched at any
point. Over versions, `replay.js --stats` turns those rows into the catch-rate that either
vindicates the one-reviewer bet or reopens it with evidence. An `ambiguous` score is the
one judgment seam: the session shows the finding beside the injected defect and asks.

## Acceptance Criteria

- **AC-20260819-02-1**: WHEN the ledger holds N review rows appended after the last replay
  row THE SYSTEM SHALL exit 0 printing `due reviewsSince=N` at N ≥ 5 and exit 1 at N < 5
  (e.g. 5 review rows, 0 replay rows → exit 0; a replay row then 4 review rows → exit 1)
  → new tests in tests/replay/replay.test.js
- **AC-20260819-02-2**: WHEN selecting THE SYSTEM SHALL prefer a critical-tier CLEAN row
  over a later standard-tier one within the window and print `spec= reviewRunId= commit=`
  (e.g. rows [critical@t1, standard@t2] → the t1 spec; [standard@t1, standard@t2] → t2) →
  same file
- **AC-20260819-02-3**: WHEN `--setup` is given a `--dir` inside the repo root THE SYSTEM
  SHALL refuse with exit 3 and create nothing; WHEN given an outside dir THE SYSTEM SHALL
  create a detached worktree containing the `.replay-worktree` marker (e.g. `--dir
  <repo>/x` → exit 3; `--dir <tmp>/x` → worktree at the commit, marker present) → same file
- **AC-20260819-02-4**: WHEN `--apply` runs THE SYSTEM SHALL leave the mutation committed
  on the worktree's detached HEAD so `git diff <base>..HEAD` contains the patch's hunks
  (e.g. a one-line patch → `git -C <dir> diff <base>..HEAD` includes that line; `git
  status --porcelain` in the worktree is clean) → same file
- **AC-20260819-02-5**: WHEN `--score` reads a workflow return THE SYSTEM SHALL print
  `caught` on a finding at the mutated file within ±5 lines, `ambiguous` on findings
  elsewhere, `missed` on zero findings (e.g. mutation at lib/x.js:40 — finding
  `{file:"lib/x.js",line:43}` → caught; `{file:"lib/y.js",line:40}` → ambiguous; `[]` →
  missed) → same file
- **AC-20260819-02-6**: WHEN `--record` runs THE SYSTEM SHALL append exactly one ledger
  row matching the Contracts shape with a fresh `rp_` runId and write
  `.claude/spec-runs/<rp_id>.json` holding the patch verbatim (and `reviewer: null` when
  `--outcome leg-caught`) (e.g. runId matches `^rp_[0-9a-f]{12}$`; row keys are exactly
  the Contracts set) → same file
- **AC-20260819-02-7**: WHEN `--stats` reads a ledger with 2 caught, 1 missed, 1
  leg-caught THE SYSTEM SHALL print totals per outcome, per-class counts, and
  `catch-rate 2/3` (leg-caught excluded from the denominator) → same file
- **AC-20260819-02-8**: WHEN `--teardown` targets a dir without the `.replay-worktree`
  marker THE SYSTEM SHALL refuse with exit 3 and delete nothing; with the marker THE
  SYSTEM SHALL remove the worktree (e.g. a plain mkdir dir → exit 3 and still present; a
  --setup dir → removed and pruned from `git worktree list`) → same file
- **AC-20260819-02-9**: WHEN the shipped corpus file is parsed THE SYSTEM SHALL find all 6
  class ids from Contracts, each carrying a recipe section (structural check executed
  against `spec/doctrine/replay-corpus.md` — the one sanctioned prose-shape assert, on the
  file whose ids `--record --class` values must match) → same file
- **AC-20260819-02-10**: WHEN `spec-paths replay` / `spec-paths replay-corpus` run THE
  SYSTEM SHALL print the two paths and `spec-paths shared-for replay` SHALL emit the D14
  section list (existing shared-for heading test covers name validity) → tests in
  tests/spec-paths.test.js
- **AC-20260819-02-11**: WHEN spec-status derives against a ledger containing
  `stage:"replay"` rows THE SYSTEM SHALL CONTINUE TO exit 0 with zero anomalies (executed
  2026-08-19 in planning: synthetic root + replay row → exit 0, anomalies 0) → same file
  as AC-1

## Assumptions (escalation triggers)

- A1: review-legs.js runs green from a detached worktree given `--root <dir>` — the
  pre-cutover replay eval ran exactly this (docs/audit/v7-replay-eval.md), and a detached
  worktree at HEAD ran a scoped suite green in 2s in this planning session — **if false:**
  worker returns blocked; the command's setup step gains the missing environment step.
- A2: Dependency setup in a fresh worktree = the host's `setupCommand` (here `npm
  install`), with the replay-eval note (symlink `autopilot/node_modules`) as the recorded
  fallback — **if false:** a setup-red is an environment artifact: fix and re-verify,
  NEVER record it as leg-caught.
- A3: The last commit touching the spec path is (or contains) the reviewed tree — the
  close commit flips `status: done` and commits with the tree; a later amendment commit
  still contains the reviewed code as a superset — **if false:** `--select`'s printed
  commit is overridden by hand for that run.
- A4: No exhaustive spec-paths key-list pin exists today — grep 2026-08-19 found only the
  SECTIONS-heading validity checks — **if false:** update the pin in place (the third-
  recurrence spec-paths collision class; its test file is already in the File Plan).
- A5: Version 7.4.0 is free at build time — **if false:** next free version + logged
  deviation (standing Gotcha).
- A6: `Feedback Loop` remains a `## ` heading in core.md after sibling spec 01's D8 edit
  (01 edits the section body, never the heading) — **if false:** D14's shared-for list and
  the heading test both red; reconcile the heading first.

## Rationale

The harness's one structural idea: everything deterministic is a script mode, everything
judgment-shaped (authoring the mutation, adjudicating an ambiguous score) stays in the
session, and the one expensive seat (the reviewer) is dispatched with review.md's own
contract so the measurement measures the real reviewer, not a variant. Tier is standard,
stated reasoning: the harness never touches the main tree (scratch worktrees outside the
repo, marker-guarded teardown), and none of the host's critical triggers match — the
closest neighbor, merge-back.sh, is critical because it mutates real branches, which this
never does. Scoring is a deterministic proxy with a judgment escape: pure file+line match
would misgrade a reviewer that names the defect from its call site — `ambiguous` exists so
a human grades only the residue. `leg-caught` is excluded from the catch-rate denominator
deliberately: the question is the reviewer's blind-spot rate on leg-invisible defects; a
leg catch is corpus feedback (the class was not leg-invisible after all), not reviewer
evidence. Rejected: time-based cadence (sessions are not scheduled — a review-count
trigger fires exactly where the reminder can print); a `--next` action string for dueness
(spec-status's five action strings are a frozen autopilot API); escape-derived corpus v1
(JJ-confirmed against — starves at 2 escape rows). Depends on spec 01 because replay's
evidence artifacts reuse the `.claude/spec-runs/` home and correlate on the `runId`
discipline 01 completes. Fragile to watch: AC-2's tier-priority selection reads `tier`
from review rows — older rows lack the field; treat absent as standard.

## Canonical Delta

Append to `docs/canonical/review.md` after sibling spec 01's paragraph:

> Reviewer catch-rate is measured, not assumed: every 5th review (and at least once per
> major version) `/spec:replay` injects one corpus-class defect into the last CLEANed
> spec's tree in a marker-guarded scratch worktree, re-runs the legs, and dispatches the
> standard reviewer blind; catch/miss/leg-caught lands as a `stage:"replay"` ledger row
> with retained evidence, and `replay.js --stats` derives the catch-rate. A sustained
> miss-rate is the evidence that reopens the second-reviewer question.
> (specs/20260819/02-mutation-replay.md)
