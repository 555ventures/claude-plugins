# 0052. The size cap counts what a lane adds

- Status: accepted
- Date: 2026-11-10
- Deciders: JJ + session (specs/20261109/03-the-size-cap-counts-what-a-lane-adds.md)
- Applies to: this repo's own `tests/size-check.js` and `docs/v8/architecture.md` §0; nothing shipped to host projects.
- Supersedes: ADR-0047, whose byte caps (driver 40,000, lib 16,000, `spec/scripts/` total 400,000; commands 6,000, agents 4,000, doctrine 8,000), 120-character rule and `over` entries carry forward unchanged.

## Context

ADR-0047 let a file or total past its cap pass only on a locked `over` entry, judged by the absolute size at landing. A lane that fitted the room it was built in was stopped after rebase because other lanes had grown the same file meanwhile: 20261108/01 added 982 bytes into room that trunk's growth had since used. The lane paid for trunk's growth. The merge-base rule f82a903a had was dropped by ADR-0047 because line caps paid for packing lines and deleting tests; bytes do not shrink when lines join and tests have no budget, so that harm cannot come back.

## Options considered

- **Keep the absolute test** — charges each lane for the others' growth and stops finished work at landing.
- **Drop the caps** — loses the pressure that stopped the plugin doubling in three days.
- **Judge the lane by the bytes it adds since its merge-base, with a one-time 5% crossing** (chosen).

## Decision

`tests/size-check.js` judges each capped file and the `spec/scripts/` total by the bytes the branch adds since its merge-base with main (a new file counts all its bytes). Within its cap at the merge-base, a file or total may cross the cap once by at most 5% of the cap, with a warning that the next change to it must not grow it; past that it is red. Already over its cap at the merge-base, it may not grow at all. A valid `over` entry still passes either red, and its warning names the entry, not the no-growth rule. The allowance is `cap / 20` in code, not a `size.json` key. Carried forward from ADR-0047 unchanged: the byte caps, the 120-character limit on new `spec/scripts` lines, the 500-line warning on a test file (advice, not a gate), and the prose-reference rule.

## Consequences

- A lane is no longer stopped at landing because trunk grew the file while it was built.
- A file may sit up to 5% over its cap on trunk until the next spec that touches it cuts it or locks an `over` entry; the warning reaches that planner.
- Not every byte over a cap is a locked Decision any more; a real raise still is.
