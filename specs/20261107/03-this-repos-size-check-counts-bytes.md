---
date: 2026-11-07
status: hardened
area: tests
depends_on: []
brief: n/a
architecture: true
breaking: false
---

# This repo's size check counts bytes and stops paying for deleted tests

## Intent
- You asked: When you hit a line limit like 400, what will you do; what would the best developer do; does our approach align? Then, after the consult: "Size rules stop rewarding deleted tests: source caps count bytes plus a 120-char line limit, the tests/ total and its ratchet go (test files over cap warn), over-cap needs a locked Decision …; also restore the run tests cut for the cap (start-up refusals, commit-hook→REPAIR)." The criteria half is specs/20261107/04.
- I will build:
  - This repo's `tests/size-check.js` measures capped files in bytes and reds a new or changed `spec/scripts` line over 120 characters.
  - A file or total past its cap passes only on a `tests/size.json` `over` entry citing a locked Decision that names it; the merge-base "cut, do not grow" rule goes.
  - Test files over 500 lines print a warning; the `tests/` total and the merge-base rules for tests go, except the prose-reference rule.
  - The `run.test.js` cases 20261107/02 cut for the 500-line cap come back, each titled with an AC of this spec.
- I will not touch:
  - Anything shipped to host projects: `tests/size-check.js` and `tests/size.json` are this repo's own gate, run by its `npm test`.
  - `run.js` and every other driver's behaviour; the criteria check, `## Retired criteria` and the briefs (20261107/04).
- Users will notice: in this repo a build that grows a file past its cap stops and asks instead of joining lines or deleting tests, and `npm test` warns about long test files instead of failing.
- You lose: the "cut, do not grow" merge-base rule and the 4,000-line test budget.
- Architecture or behaviour change: yes — this repo's size rule (architecture §0) changes from "an over-cap file may not grow" to "growth past a cap is a locked Decision"; confirmed 2026-11-07, recorded as ADR-0047 (no accepted ADR is overturned)
- Client sign-off: byte caps — 40 KB per driver, 16 KB per lib, 400 KB total (2026-11-07); the size-rule change and ADR-0047 — yes to both (with 20261107/04)

## Goal

Fitting this repo's caps stops being cheaper by joining lines or deleting tests: bytes do not shrink when lines are joined, test files have no budget, and growth past a cap is a Decision the user locked.

## Preparation

Measured 2026-11-07: `spec/scripts/` 5,463 lines, 327,290 bytes, 668 lines over 120 characters; run.js 398 lines / 34,941 bytes (longest 295), fanout.js 32,767, migrate.js 422 lines / 25,804 (over its line cap, held at the merge-base); `tests/` 6,168 lines, queue.test.js 939 and migrate.test.js 631. At aa017506 run.js was 1,113 lines / 75,731 bytes (68 bytes a line, now 88) and run.test.js 2,075 lines (now 499); 2ca29409 folded a three-line fix into one line to stay flat. Every behaviour D6 restores is in run.js today: `open()` (detached HEAD, `dirtyMessage`, lane in flight, branch with commits not on trunk), the sidecar ignore check, `markLane` on `AGENT_STEPS`, `builderFiles`, and the commit-hook arm in COMMIT. Nothing here reads criteria, so there is no dependency on 20261107/04's `lib/criteria.js`; 04 depends on this spec, because it grows run.js and run.test.js past today's line caps.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `measure()` in `tests/size-check.js` counts `Buffer.byteLength` for every `caps` glob except `tests/*.test.js`, and `totals` keeps only `spec/scripts/` (bytes). `tests/size.json` caps: driver 40,000, lib 16,000, `spec/scripts/` total 400,000; commands 6,000, agents 4,000, doctrine 8,000 (the old line caps at a 100-column wrap; nothing is over today). Recorded as ADR-0047. [asked: 40 KB / 16 KB / 400 KB] | Bytes are what a reader or a model pays; joining lines saves none, so the cap stops paying for it (run.js lost 64% of its lines but 54% of its bytes). |
| D2 | A line in `spec/scripts/**/*.js` longer than 120 characters is red when the same file at the merge-base holds no identical line; the red names `file:line` and the length. The 668 long lines today are wrapped as their code is touched. | A byte cap alone still allows 300-character lines; checking only new lines keeps this diff off the drivers the pending specs edit, and is how a formatter is usually phased in. |
| D3 | `tests/size.json` gains `over: {"<glob key, file or total>": {"bytes": N, "by": "specs/….md Dn"}}`. A file or total over its cap is green when an entry names it with `bytes` at or above its size and `by` names a non-draft spec on disk whose Decisions row Dn contains that path; a spec without a Decisions section (a stub, 20261107/01) is not read further. `check()`'s merge-base arm is deleted. Whichever of `spec/scripts/run.js`, `spec/scripts/fanout.js`, `spec/scripts/migrate.js` and `spec/scripts/` is over the D1 caps at build time gets an entry `by` this spec's D3 at its build-time size. architecture §0 tells a builder past a cap to stop and say so, never join lines or cut tests. [asked: yes to both] | Growth past a cap becomes a choice the planner writes and the user locks, not a deletion the builder makes to stay flat; the entry lives in size.json because a done spec's body leaves disk (20261107/01). |
| D4 | A `tests/*.test.js` over 500 lines prints `size-check: ⚠️ <file> <n> lines > 500 — split it by behaviour` on stdout and keeps exit 0; `totals["tests/"]` and every merge-base rule for test files go, except the prose-reference rule, which stays red. | A test budget made cutting kept tests the cheap way to land; the prose rule stays because a prose test is blocking (ADR-0037, reviewer.md). |
| D5 | architecture.md §0's size bullet is rewritten to D1–D4; ADR-0047 records the change (it overturns the "cut, do not grow" rule of 32c9962f and f82a903a, which no ADR held). | §0 is the rule every builder of this repo reads. |
| D6 | `tests/run.test.js` regains, ported from `aa017506:tests/run.test.js` to today's fixture: OPEN refusing a detached HEAD, a dirty tracked tree, a fanout lane in flight and a spec branch with commits not on trunk, and re-pointing a merged one; refusing un-ignored sidecars; a lane run finding its spec under `--root`; the marker only while a builder or reviewer is out, a stale one not a lane; an evidence-only change being a FIX round on a cache hit and evidence before `built` not; a rejecting commit hook going to REPAIR and landing once fixed. The trunk-not-a-branch and mid-merge cases stay deleted (that code is gone). | These behaviours are in run.js and no test holds them; they were cut to fit 500 lines, the case this spec exists for. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| tests/size-check.js | MODIFY | D1–D4: bytes, the 120 rule, `over` entries, test warnings; the merge-base growth arm deleted |
| tests/size.json | MODIFY | D1 byte caps, D3 `over` entries, `tests/` total gone |
| tests/size-check.test.js | MODIFY | the growth case replaced by D1–D4 cases (AC-1 to AC-4) |
| docs/v8/architecture.md | MODIFY | D5 §0 |
| tests/run.test.js | MODIFY | AC-5 to AC-7 (D6) |

## Acceptance Criteria

- **AC-20261107-03-1**: WHEN a capped `spec/scripts/*.js` holds fewer bytes than its cap in more lines than the old line cap THE SYSTEM SHALL be green, and WHEN it holds more bytes than its cap with no `over` entry THE SYSTEM SHALL exit 1 naming the file, its bytes and the cap, whatever its size at the merge-base.
- **AC-20261107-03-2**: WHEN a `spec/scripts` file gains a 121-character line THE SYSTEM SHALL exit 1 naming `file:line` and `121 > 120`; a 121-character line identical to one in the file at the merge-base, and a 120-character line, SHALL be green.
- **AC-20261107-03-3**: WHEN a file over its cap has an `over` entry with `bytes` at or above its size whose `by` spec is hardened and whose row Dn contains the path THE SYSTEM SHALL be green; and WHEN `bytes` is below the size, the `by` spec is a draft, or row Dn is missing or does not contain the path THE SYSTEM SHALL exit 1 naming the entry.
- **AC-20261107-03-4**: WHEN a `tests/x.test.js` holds 600 lines and the tests sum past 4,000 lines THE SYSTEM SHALL exit 0 printing `⚠️ tests/x.test.js 600 lines > 500`, and SHALL CONTINUE TO exit 1 on a test file that reads more prose than at the merge-base.
- **AC-20261107-03-5**: WHEN `/spec:run` OPEN meets a detached HEAD, a dirty tracked tree, a fanout lane in flight, a spec branch with commits not on trunk, or run sidecars git does not ignore THE SYSTEM SHALL CONTINUE TO refuse (exit 2) with the remedy and no run state, and SHALL CONTINUE TO re-point a spec branch trunk already holds.
- **AC-20261107-03-6**: WHEN a lane run starts from the main checkout with `--root <lane>` THE SYSTEM SHALL CONTINUE TO find its spec there; and the checkout SHALL CONTINUE TO be marked only at BUILD, REPAIR, FIX and REVIEW, a stale marker making no lane.
- **AC-20261107-03-7**: WHEN a FIX changes only evidence.md THE SYSTEM SHALL CONTINUE TO count a round on a cached gate, evidence written before `built` SHALL CONTINUE TO make no round, and a rejecting pre-commit hook SHALL CONTINUE TO send the run to REPAIR with the hook's output, landing once repaired.
- **AC-20261107-03-8**: WHEN this spec's build gates THE SYSTEM SHALL be green under `npm test`, with each `over` entry D3 wrote and its bytes recorded in `specs/20261107/03-this-repos-size-check-counts-bytes.run/evidence.md`.
- **AC-20261107-03-9**: architecture §0 says what D1–D4 name, and `grep -rn "cut, do not grow" tests docs/v8` has zero hits.

## Retired criteria

- AC-20261107-03-8 — checked at review: the gate result and the evidence.md listing.
- AC-20261107-03-9 — checked at review: prose and a one-time grep; no test reads prose.

## Assumptions

- A1: No host project runs `tests/size-check.js` or reads `tests/size.json` (both live in this repo's `tests/`) — if false: ask before building.
- A2: Every restored behaviour passes against today's run.js unchanged — if false: stop and say which; a regressed behaviour is a `/spec:fix`, not this build.
