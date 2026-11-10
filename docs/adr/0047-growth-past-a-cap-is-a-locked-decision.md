# 0047. Growth past a cap is a locked Decision; caps count bytes

- Status: superseded by ADR-0052
- Date: 2026-11-07
- Deciders: JJ + session (specs/20261107/03-this-repos-size-check-counts-bytes.md)
- Applies to: this repo's own `tests/size-check.js`, `tests/size.json` and `docs/v8/architecture.md` §0; nothing shipped to host projects.

## Context

The v8 size caps (architecture §0) became a gate in 32c9962f and were tied to the merge-base in f82a903a: a file over its line cap could not grow past its size where the branch left main ("cut, do not grow"), and `tests/` had a 4,000-line total. No ADR recorded either. In the 20261107/02 build the cheapest way to land was to pack lines and delete tests: run.js went from 1,113 to 398 lines but only from 75.7 to 34.9 KB (68 → 88 bytes a line, longest line 295), run.test.js went from 2,075 to 499 lines, 94 AC-IDs lost their citing tests (55 re-cited by hand), and 2ca29409 folded a three-line fix into one line to stay flat. The user asked what the best developer would do; an independent consult answered that line caps reward exactly this, and that a limit worth keeping should measure what a reader pays and make growth a visible decision.

## Options considered

- **Keep line caps and the merge-base rule** — the measured outcome above: packed lines and deleted tests of kept behaviour.
- **Drop all caps** — loses the pressure that stopped the plugin doubling in three days.
- **Byte caps, a 120-character limit on new lines, growth past a cap as a locked Decision, no test budget** (chosen).

## Decision

Capped source and prose files are measured in bytes (driver 40,000, lib 16,000, `spec/scripts/` total 400,000; commands 6,000, agents 4,000, doctrine 8,000). A new or changed `spec/scripts` line over 120 characters is red. A file or total past its cap passes only on a `tests/size.json` `over` entry whose `by` names a locked spec Decision naming that path; the merge-base "cut, do not grow" rule is deleted. Test files over 500 lines warn; the `tests/` total and the test ratchet go; the prose-reference rule stays. Bytes do not shrink when lines are joined, so the cap stops paying for packing, and deleting a test no longer buys room for code.

## Consequences

- A builder past a cap stops and asks; the planner writes the raise as a Decision the user locks.
- The 668 long lines of today are wrapped only as their code is touched.
- `size.json` carries `over` entries, which two specs raising the same file can conflict on at rebase; that is a real collision of two decisions.
- Test-file size is advice, not a gate; long test files are split by behaviour when touched.
