---
date: 2026-11-09
status: done
area: tests
depends_on: []
brief: n/a
architecture: true
breaking: false
---

# The size cap counts what a lane adds

## Intent
- You asked: "what would be the architecturally sound, structural fix" for v8 being slower than v7 at implementing specs; then "Use Opus/High to spec:plan".
- I will build:
  - This repo's size check judges a lane by the bytes it adds since its merge-base with main, not by where trunk's growth left the file.
  - A file or total within its cap at the merge-base may cross the cap once, by at most 5% of the cap, with a warning.
  - A file or total already over its cap at the merge-base may not grow at all ("cut, do not grow", now on bytes).
  - A locked `over` entry still lets a file pass either rule.
- I will not touch:
  - The caps themselves, the 120-character rule, the test-file warning, the prose-reference rule, `over` entry checks (`overFails`); anything shipped to host projects; the review loop (20261109/02).
- Users will notice: a lane is no longer stopped at landing because other lanes grew the same file while it was built. A file that crosses its cap prints `⚠️ … the next change to it must not grow it`, and the next spec that touches it must cut it or lock an `over` entry.
- You lose: the rule that every byte over a cap is a Decision you locked. A file may sit up to 5% over its cap on trunk until someone touches it.
- Architecture or behaviour change: yes — departs from ADR-0047's "past its cap passes only on an over entry"; you said yes 2026-11-10 (ADR-0052)
- Client sign-off: a lane is judged by the bytes it adds, with a one-time 5% crossing — yes (2026-11-10)

## Goal

Replayed on 20261108/01's fourth build (run.js 39,003 bytes at its base, +982 from the lane, trunk +911 meanwhile, about 40,900 after the rebase), the size check passes with a warning. The next branch that grows run.js from there is red until it cuts.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | `tests/size-check.js` `capped(key, n, cap)` takes the merge-base size `b` (0 when the file is new) and is red only when `n > cap` and either `b > cap` and `n > b`, or `n - b` is more than 5% of `cap` (the allowance; driver 2,000, lib 800, agent 200, command 300, doctrine 400, `spec/scripts/` total 20,000). The same rule for every capped file and for each total; `baseTexts()` already holds every merge-base text. [asked: yes, judge the lane by what it adds (2026-11-10)] | The absolute test charges a lane for trunk's growth: 20261108/01 was stopped after rebase although its own +982 fit the room it was built in. f82a903a's merge-base rule was dropped because line caps paid for packing lines and deleting tests (ADR-0047); bytes do not shrink when lines join and tests have no budget, so that harm cannot come back. The allowance bounds the one crossing; past it every lane must cut. |
| D2 | The allowance is a constant in `size-check.js` (`cap / 20`), not a `tests/size.json` key. | One number derived from the cap; a key per glob would be a second table to keep in step with the caps. |
| D3 | A red keeps its form `<key> <n> bytes > cap <cap> — <why>`; with no `over` entry the why names the rule and remedy: `over its cap at the merge-base (<b>): cut it to <b> or less, or stop and say so` or `this branch added <n-b>, more than <allowance>: cut what it added, or stop and say so`. A file or total over its cap that passes prints `size-check: ⚠️ <key> <n> bytes > cap <cap> — the next change to it must not grow it`. | A builder can tell trunk's debt from its own growth; the warning reaches the next planner, who names the cut in a Decision (plan.md step 1). |
| D4 | `overFails` and the `over` entry are unchanged: an entry at or above the size, citing a locked Decision that names the path, passes either red. | The route for a real raise stays a Decision you lock. |
| D5 | `docs/v8/architecture.md` §0 says the D1 rule; ADR-0052 `the-size-cap-counts-what-a-lane-adds` (accepted, written at lock after your yes; next free number) supersedes ADR-0047 and carries its byte caps forward; ADR-0047's Status becomes `superseded by ADR-0052`. | A live ADR states the old rule (plan.md step 4). |
| D6 | `tests/size-check.test.js`: the AC-20261107-03-1 case drops its step "over its cap at the base and holding is red" (D1 makes it green) and keeps the rest; the AC-20261107-03-3 case's total-red pattern reads D3's new why; AC-1 to AC-3 below are new cases. | That step pins the rule D1 replaces. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| tests/size-check.js | MODIFY | D1, D2, D3 |
| tests/size-check.test.js | MODIFY | D6, AC-1 to AC-3 |
| docs/v8/architecture.md | MODIFY | D5 §0 |
| docs/adr/0052-the-size-cap-counts-what-a-lane-adds.md | CREATE | D5 (at lock) |
| docs/adr/0047-growth-past-a-cap-is-a-locked-decision.md | MODIFY | D5 Status |

## Acceptance Criteria

- **AC-20261109-03-1**: WHEN a capped file is within its cap at the merge-base and the branch adds at most 5% of the cap, carrying it past the cap, THE SYSTEM SHALL exit 0 and print `size-check: ⚠️ <file> <n> bytes > cap <cap> — the next change to it must not grow it`; AND WHEN the branch adds more than 5% THE SYSTEM SHALL exit 1 naming the bytes added and the allowance.
- **AC-20261109-03-2**: WHEN a capped file is over its cap at the merge-base THE SYSTEM SHALL exit 0 while the branch keeps it at that size or smaller, AND exit 1 naming the merge-base size when the branch grows it by one byte.
- **AC-20261109-03-3**: WHEN the `spec/scripts/` total crosses or exceeds its cap THE SYSTEM SHALL apply AC-1 and AC-2 to the total with 5% of the total's cap; AND a file new since the merge-base SHALL count all its bytes as added; AND a valid `over` entry SHALL CONTINUE TO turn either red green.

## Assumptions

- A1: `size-check.js` keeps measuring from `git merge-base HEAD main`: in a lane before landing that is where it started, after landing's rebase it is the new trunk — if false: nothing; D1 reads whatever `baseTexts()` returns, as today.
- A2: `spec/scripts/` is at 397,584 of 400,000 bytes today, and 20261108/01, 04 and 06 each create a lib file, so the total will cross soon under any rule — if false: nothing changes here.
