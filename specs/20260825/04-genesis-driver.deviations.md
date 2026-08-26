- A6 falsified at build: the assumption's executed sweep covered `spec/`, `README.md`, and
  `docs/canonical` but not `tests/`, and two test files pin the retired command name in eleven
  places. Per A6's own remedy ("add the row; never a stale reference") the orchestrator updated
  them in place: `tests/consistency/genesis-doctrine.test.js` (AC-20260825-01-4's file list,
  AC-20260825-01-6's `shared-for` key, AC-20260825-02-1's file list, AC-20260825-03-9's file list
  — the currency mechanism moved from the command into the driver, so the pin follows it to
  `spec/scripts/genesis-driver.js`) and `tests/genesis/research-menu.test.js`
  (AC-20260825-02-5's menu-build pin, whose binding home is now `spec/doctrine/genesis.md`'s
  woven-loop step, and AC-20260825-02-6's `shared-for` key). Every pin kept its original AC-ID —
  the invariants belong to specs 01/02/03 and only their file moved; none was weakened or dropped.
- A4 partly falsified: the assumption states that `genesis-brief.md`'s section comments carry the
  `## Open Dimensions` and `## Picks` line grammars, and they do not — the shipped template
  describes them only in prose. A4's remedy ("the driver follows the template on disk; amend the
  template comment, never fork the grammar") was applied: `spec/templates/genesis-brief.md`, a
  file outside the File Plan, gained one grammar line in each of those two section comments. The
  `## Coverage` block was left byte-identical because AC-20260825-02-2 counts its non-blank lines.
