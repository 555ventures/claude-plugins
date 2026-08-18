# Gate integrity

v7.0.0 (2026-08-17) retired the sanctioned-red apparatus this doc used to describe — the
`.claude/suite-baseline.json` baseline, the `suite-baseline.js --gate` wrapper, the
`sanctionedReds` observed suffix, and the `CLEAN-with-qualifier` verdict word. The standing
rules that replaced it:

- **Gates are plainly green.** `npm test` exits 0 on untouched code; there is no
  sanctioned-failing set and no failing-pins-as-TODO convention. A red gate is a regression
  or unfinished work, never a backlog entry.
- **One derivation per verdict.** `verdict.js` is the sole source of the review/release
  verdict word, derived from the evidence manifest `review-legs.js` writes plus the
  reviewer's return and disposition counts. Nothing else computes or asserts CLEAN.
- **Fail closed on absent evidence.** A required leg missing from the manifest derives
  UNVERIFIED; a child process that dies without an exit code is a failure, never a pass
  (`spawnSync` `status: null` — signal kill, spawn failure, maxBuffer overflow — must be an
  explicit red branch in any wrapper; see the 2026-08-17 Gotchas entry).
- **The gate resolves `{testDirs}` to the glob form** (`node --test 'tests/<scope>/*.test.js'`)
  — a bare directory runs nothing on Node 26.

History: the baseline mechanics (pre-image snapshots, `--gate` wrap choreography,
green-by-subtraction qualification) are preserved in git history through v6.91.0 and in the
superseded specs under `specs/20260814/` and `specs/20260816/`.
