---
name: shared-for-scope-and-readload-margin
description: shared-for <cmd> only pulls sections from core.md/design.md, never from mocks.md/genesis.md; read-load budgets can have near-zero margin
metadata:
  type: feedback
  reviewed: 2026-09-12
---

`spec-paths shared-for <cmd>` (in `spec/bin/spec-paths`) only ever reads `doctrine/core.md`
and `doctrine/design.md` — never `doctrine/mocks.md` or `doctrine/genesis.md`, even for the
`mocks`/`genesis` commands. Those stage-supplement files are read by their drivers directly
(`shared-mocks`, `shared-genesis` keys), not counted in `tests/consistency/read-load.test.js`'s
per-command BUDGET. So editing `spec/doctrine/mocks.md` or `genesis.md` doesn't cost read-load
budget — only editing `spec/commands/<cmd>.md` itself and the `core.md`/`design.md` sections
`shared-for <cmd>` lists does.

**Why:** Found this while building specs/20260910/05 (D8 doctrine wiring): `/spec:mocks`'s
read-load budget was 325 with current usage at 322 — only 3 lines of margin between the command
file's own line count and the budget. Assuming doctrine.md edits were free-of-cost would have
been wrong reasoning in the other direction (mocks.md/genesis.md aren't budget-exempt across
the board — always check `spec-paths shared-for <cmd>`'s case statement for which sections a
given doctrine file actually contributes).

**How to apply:** Before editing any `spec/doctrine/*.md` section, grep
`spec/bin/spec-paths`'s `shared-for)` case block for whether the target command pulls that
file/section at all. If it does, and the command's read-load margin is thin, prefer extending
an *existing* line (add clauses/words) over adding a new line — line *count* is what's
budgeted, not prose density. Verify with `spec-paths shared-for <cmd> | wc -l` +
`wc -l spec/commands/<cmd>.md` before and after.
