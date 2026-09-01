---
date: 2026-08-19
status: done
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
| D3 | `--select`: among CLEAN review rows with a `runId` appended after the last replay row, prefer `tier:"critical"`, tie → latest; target commit = `git log -1 --format=%H -- <spec path>` (the close commit touches the spec's status flip); `parent` = that commit's parent; `diffBase` = the target spec's frontmatter `build_base` (else `diff_base`), read at `parent`; prints `spec=… reviewRunId=… commit=… parent=… diffBase=…` (AC-20260819-02-2) | Critical-tier priority sampling per the brief; the close commit is the newest commit guaranteed to contain the reviewed tree, but it also carries the status flip and the Canonical Delta — `parent` is the pre-review tree the harness must stand the worktree up at, and `diffBase` is the base the original review actually diffed against |
| D4 | `--setup --commit <sha> --dir <path>`: REFUSES a `--dir` inside the repo (exit 3), creates `git worktree add --detach`, writes a marker file named `replay-worktree` into the worktree's PRIVATE git dir (resolved via `git -C <dir> rev-parse --git-dir`, which for a linked worktree ends `/.git/worktrees/<name>`) — nothing is written into the worktree's working tree; exits 4 if the resolved path has no `worktrees` segment; `--teardown --dir <path>` resolves the same private git dir and refuses with exit 3 when the dir is missing, `rev-parse --git-dir` fails, the resolved path has no `worktrees` segment, or the marker is absent — else `git worktree remove --force` (AC-20260819-02-3, AC-20260819-02-8) | The main tree is never touched — restore is worktree removal; the marker lives in the worktree's private git dir rather than its working tree, so it cannot be swept into a commit by `git add -A` and cannot appear in `git status` — the leak becomes structurally impossible rather than merely excluded (this is stronger than the iteration-1 approach, which wrote into the worktree and leaked into the host's shared `.git/info/exclude`); the marker guard means teardown can only ever delete a directory this harness created (this session's own spike accidentally created a worktree inside the repo — the refusal pins that mistake) |
| D5 | `--apply --dir <d> --patch <file> --class <id> [--subject <text>]`: `git apply` then commit on the detached HEAD with `<text>` (default `build: follow-up`) as the subject — REFUSES a subject that opens with `replay` or contains the class id — so the mutation is inside `base..HEAD` — the diff surface the reviewer and every leg actually read (AC-20260819-02-4) | A subject naming the class or announcing the harness is a blindness leak the reviewer can read straight out of `git log`; a subject derived from the target spec's own build commit is indistinguishable from the real thing because it IS the real thing — so the refusal is narrow (leading `replay`, or the class id) rather than a vocabulary blocklist, which would have refused this very spec's real build subject. An uncommitted mutation is invisible to `git diff base..HEAD`; the throwaway detached commit dies with the worktree |
| D6 | Leg verification reuses `review-legs.js` run by the orchestrating session against the worktree (`--root <dir>`) — replay.js never re-derives legs; a red leg records outcome `leg-caught` and skips the reviewer dispatch (AC-20260819-02-6 covers the row) | review-legs.js is the sole leg derivation (Risk Tiers); a leg that catches the mutation is itself a data point, and the ~100k-token reviewer dispatch is wasted on it |
| D7 | `--score --workflow <file> --file <path> --line N`: a workflow return that isn't `verdict: CLEAN` with a `survivors` array → exit 2, prints nothing (a usage error, never a score — the caller re-dispatches the reviewer and never records the attempt); otherwise ≥1 finding with the mutated file and line within ±5 → prints `caught`; findings but none matching → `ambiguous` (session adjudicates via one AskUserQuestion); zero findings → `missed`; exit 0 when parseable (AC-20260819-02-5) | Deterministic proxy first, judgment only on the ambiguous residue — a pure-deterministic scorer would misgrade a reviewer that names the defect from its call site; an unparseable return is not a data point about the reviewer's catch rate, it's a failed dispatch, and scoring it as `missed` would silently corrupt the catch-rate denominator |
| D8 | `--record --spec … --review-run-id … --class … --file … --legs green\|red:<leg> --outcome caught\|missed\|leg-caught [--patch <file>] [--workflow <file>] [--tokens N]`: generates runId `rp_` + 12 lowercase hex, appends the pinned ledger row to `.claude/spec-runs.jsonl`, writes `.claude/spec-runs/<rp_id>.json` (patch + reviewer return verbatim; reviewer null on leg-caught) (AC-20260819-02-6) | Script-owned append (unlike escape's choreography) because the row's shape is the catch-rate's substrate; evidence retention mirrors sibling spec 01's artifact discipline |
| D9 | `--stats`: aggregates replay rows — total, caught, missed, leg-caught, per-class counts, and `catch-rate = caught/(caught+missed)` (leg-caught excluded: the reviewer was never asked) (AC-20260819-02-7) | The catch-rate view lives in the harness, NOT in spec-status.js — its `--root/--next/--json` shape and five action strings are a frozen API (Risk Tiers) that a sixth surface must not touch |
| D10 | New command `spec/commands/replay.md` orchestrates: due → select → a Sonnet worker authors the mutation patch from the corpus class recipe (one retry if legs go red) → legs in the worktree → dispatch the reviewer BLIND with review.md Phase 1's exact contract (same agent, same inputs, no replay mention anywhere in its prompt) → score → record → teardown → report via report-render [no-ac: doctrine choreography; regex-over-prose pins are unsanctioned (Test Rules) — the reviewer verifies the file against this row] | Blindness is the measurement's validity: a reviewer told it is being tested measures nothing; mutation authoring is model work, so it lives in the command, not the script |
| D11 | Corpus `spec/doctrine/replay-corpus.md` (key `replay-corpus`): 6 hand-authored classes (Contracts section lists them), each with a recipe requiring the mutation to sit inside the target spec's File Plan files and leave all legs green by construction; refreshed each major pipeline version; real escapes fold in as new classes [no-ac: prose corpus; its parse surface is pinned via AC-20260819-02-9's structural check] | JJ-confirmed 2026-08-19 over escape-derived: 2 escape rows today means a derived corpus starves for months; hand-authored classes aim at the pre-cutover eval's measured misses |
| D12 | core.md § Feedback Loop gains the cadence policy: replay is due every 5th review and at minimum once per major pipeline version, critical-tier targets first; a sustained replay miss-rate is the evidence that reopens the second-reviewer question [no-ac: doctrine invariant text, same sanction as D10] | Cadence as session memory is the anti-pattern the brief names; the reopen sentence closes the loop brief 09's Out-of-scope opened |
| D13 | review.md's CLEAN close report gains a `warns` slot line when `replay.js --due` exits 0 (`🧪 reviewer replay due — run /spec:replay`) — advisory, never blocking [no-ac: doctrine choreography, same sanction as D10] | The deterministic reminder that makes "scheduled" real without a scheduler; blocking a CLEAN on a measurement chore would invert priorities |
| D14 | spec-paths: keys `replay` + `replay-corpus`, usage line updated, `shared-for replay` = Host Grounding, Tiers, Model Placement, Decisions, Question Style, Console Output Style, Feedback Loop (AC-20260819-02-10) | New-surface checklist (Planning rules); Feedback Loop is where the cadence policy lives, so the command must be served it |

**Amended 2026-08-31** (direct fix, spec plugin 7.44.0): D10's "a Sonnet worker authors the
mutation patch" is superseded — the orchestrating session now authors the mutation itself
(replay.md Phase 1 step 4, Edit/Write into `{dir}`). A dispatched authoring agent was refused
by hosts' unattended permission layer (salon-os 2026-08-31, three refusals; same layer as the
2026-08-23 /private/tmp Edit/Write denial), and the delegation carried no measurement value:
blindness is a property of the Phase 2 reviewer dispatch, never of who wrote the patch. D10's
rationale ("mutation authoring is model work, so it lives in the command, not the script")
survives unchanged — the amendment moves the model work in-session, not into `replay.js`.
Everything else in D10 (blind reviewer contract, retry, score/record/teardown) stands.

**Amended 2026-08-31** (specs/20260831/01-replay-range-materialization.md D8): D3's "worktree
stands at the parent" is completed, not reversed — `--setup` still stands the tree up at
`--commit` (the parent) first, but now gains `--overlay <closeSha>`, which re-applies the close
commit's non-meta content as one build-shaped commit before the mutation ever lands. The judged
range for a `diff.dirty:true` review row is completed by the close commit that follows it
(range-identity spec 20260824/06 D3/D7), so the bare parent alone under-states the range the
original review actually judged whenever fix-worker edits rode that close commit. `parent` and
`diffBase` as D3 derives them are unchanged; `--setup` without `--overlay` stays byte-identical
to this spec's original behavior (specs/20260831/01 D7) for any caller that omits the flag.

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
2 = usage / unreadable input, incl. `--apply`'s refused `--subject` and `--score`'s
unusable reviewer return (not `verdict: CLEAN` with a `survivors` array) · 3 = safety
refusal (worktree dir inside repo; `--teardown` on a dir that is missing, resolves no
git dir, has no `worktrees` segment, or holds no marker) · 4 = git operation failed, incl.
`--select`'s missing `build_base`/`diff_base` (a data-precondition failure, not a git
failure) and `--setup` resolving a git dir with no `worktrees` segment (not a linked
worktree).

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
  over a later standard-tier one within the window and print
  `spec= reviewRunId= commit= parent= diffBase=` (e.g. rows [critical@t1, standard@t2] →
  the t1 spec, `parent` = the t1 close commit's parent, `diffBase` = that spec's
  frontmatter `build_base`/`diff_base` read at `parent`; [standard@t1, standard@t2] → t2)
  → same file
- **AC-20260819-02-3**: WHEN `--setup` is given a `--dir` inside the repo root THE SYSTEM
  SHALL refuse with exit 3 and create nothing; WHEN given an outside dir THE SYSTEM SHALL
  create a detached worktree and write the `replay-worktree` marker into its private git dir
  (`git -C <dir> rev-parse --git-dir`), leaving the host repo unchanged — its
  `.git/info/exclude` byte-identical and `git status --porcelain` in the main tree empty
  (e.g. `--dir <repo>/x` → exit 3; `--dir <tmp>/x` → worktree at the commit, marker present
  at `<git -C <tmp>/x rev-parse --git-dir>/replay-worktree`, host `.git/info/exclude`
  unchanged and host `git status --porcelain` empty) → same file
- **AC-20260819-02-4**: WHEN `--apply` runs THE SYSTEM SHALL leave the mutation committed
  on the worktree's detached HEAD, with the passed `--subject` (default `build:
  follow-up`) as the commit subject, so `git diff <base>..HEAD` contains the patch's hunks
  and nothing else — the `replay-worktree` marker lives in the private git dir per D4 and
  so can never reach the working tree, the index, or the diff (e.g. a one-line patch with
  `--subject "build(20260819/02): scheduled mutation replay harness"` → `git -C <dir> log
  -1 --format=%s` prints that subject verbatim, `git -C <dir> diff --name-status
  <base>..HEAD` lists only the patched file; `git status --porcelain` in the worktree is
  clean) → same file
- **AC-20260819-02-5**: WHEN `--score` reads a workflow return THE SYSTEM SHALL print
  `caught` on a finding at the mutated file within ±5 lines, `ambiguous` on findings
  elsewhere, `missed` on zero findings, and exit 2 printing nothing on a return that isn't
  `verdict: CLEAN` with a `survivors` array (e.g. mutation at lib/x.js:40 — finding
  `{file:"lib/x.js",line:43}` → caught; `{file:"lib/y.js",line:40}` → ambiguous; `[]` →
  missed; `{verdict:"REVIEWER_FAILED"}` or a return with no `survivors` array → exit 2,
  nothing printed) → same file
- **AC-20260819-02-6**: WHEN `--record` runs THE SYSTEM SHALL append exactly one ledger
  row matching the Contracts shape with a fresh `rp_` runId and write
  `.claude/spec-runs/<rp_id>.json` holding the patch verbatim (and `reviewer: null` when
  `--outcome leg-caught`) (e.g. runId matches `^rp_[0-9a-f]{12}$`; row keys are exactly
  the Contracts set) → same file
- **AC-20260819-02-7**: WHEN `--stats` reads a ledger with 2 caught, 1 missed, 1
  leg-caught THE SYSTEM SHALL print totals per outcome, per-class counts, and
  `catch-rate 2/3` (leg-caught excluded from the denominator) → same file
- **AC-20260819-02-8**: WHEN `--teardown` targets a dir whose private git dir (`git -C
  <dir> rev-parse --git-dir`) holds no `replay-worktree` marker THE SYSTEM SHALL refuse
  with exit 3 and delete nothing; with the marker present there THE SYSTEM SHALL remove the
  worktree (e.g. a plain mkdir dir → `rev-parse --git-dir` fails or has no `worktrees`
  segment → exit 3 and still present; a --setup dir → marker found at
  `.git/worktrees/<name>/replay-worktree` → removed and pruned from `git worktree list`)
  → same file
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

**2026-08-19 (review disposition — four confirmed defects, fixed under user approval):**
the harness's first review found that (1) the worktree stood up at the close commit and
the legs/reviewer diffed from it, so the reviewer read only the mutation's ~3 lines instead
of the 600–1000-line diff a real review judges — inflating the catch rate so far that the
sustained-miss-rate trigger in core.md's Feedback Loop could never fire; (2) the applied
commit's subject `replay: <class>` leaked the class id straight into `git log`; (3) the
`.replay-worktree` marker file appeared in the diff and in `git status`, both readable by
the dispatched reviewer; and (4) `--score`'s `missed` branch conflated an unusable reviewer
return with a genuine zero-finding miss, silently corrupting the catch-rate denominator.
All four are fixed in place in this spec — D3, D5, D7 and their ACs above — because none
changes the harness's structural idea (see above), only its fidelity to it; (2) and (3) are
now covered by one blindness invariant in replay.md's Rules rather than three separate
checklist items. The base correction (1) is not a design amendment: D10 already locks
"review.md Phase 1's exact contract, same inputs," and review.md derives its diff base from
the target spec's frontmatter (`build_base`/`diff_base`) read at the pre-review commit —
targeting the close commit itself was already a deviation from D10's own locked contract,
not a new decision, so D3's correction closes that deviation rather than opening one.
A fix iteration on this same review then surfaced a fifth: the (3) fix wrote the
`.replay-worktree` marker inside the worktree but kept it out of `git status` via a write
into the worktree's `.git/info/exclude` — `info/exclude` is not per-worktree, and
`git rev-parse --git-path info/exclude` run inside a linked worktree resolves to the MAIN
repo's `.git/info/exclude`, so the write landed in the host repo and survived teardown,
breaking this very spec's own "the main tree is never touched" guarantee. The marker moved
to the worktree's PRIVATE git dir (`git rev-parse --git-dir`, which for a linked worktree
ends `/.git/worktrees/<name>` and is deleted by `git worktree remove`) — nothing enters the
working tree at all, so the marker cannot be swept into a commit by `git add -A` and cannot
appear in `git status` in either the worktree or the host. The blind spot that let this
through is the same shape as (3): no test ever asserted the host repo was unmodified after
`--setup`; AC-20260819-02-3 now closes it directly by pinning the host's
`.git/info/exclude` byte-identical and `git status --porcelain` empty after `--setup`.

**2026-08-19 (waived — agent-memory scratch files):** this review's diff also carried five
files under `.claude/agent-memory/` outside the File Plan. JJ waived them: they are the
helper agents' own scratch notes (doctrine-author, gate-scripts, plugin-tests), ship no
behavior, and the same class of file has landed the same way in three prior CLEAN reviews.

## Canonical Delta

Append to `docs/canonical/review.md` after sibling spec 01's paragraph:

> Reviewer catch-rate is measured, not assumed: every 5th review (and at least once per
> major version) `/spec:replay` injects one corpus-class defect into the last CLEANed
> spec's tree in a marker-guarded scratch worktree, re-runs the legs, and dispatches the
> standard reviewer blind; catch/miss/leg-caught lands as a `stage:"replay"` ledger row
> with retained evidence, and `replay.js --stats` derives the catch-rate. A sustained
> miss-rate is the evidence that reopens the second-reviewer question.
> (specs/20260819/02-mutation-replay.md)
