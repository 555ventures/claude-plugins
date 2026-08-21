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
- **Every executable declares who calls it.** `spec/entrypoints.json` maps each executable under
  `spec/scripts/` (minus `lib/`) and `spec/workflows/` to the files that invoke it, and
  `tests/consistency/entrypoints.test.js` diffs those declarations against the repo's real call
  sites in both directions on every run. Four conditions are red: a script nothing invokes, a
  declared call site that no longer invokes, an invocation the manifest does not know, and a
  `spec-paths` key resolving to a deleted file. Zero entry points has no sanctioned form — an
  orphan is deleted or re-wired, never marked exempt. The inventory is admit-everything-by-location
  on purpose: any file-name or extension filter is itself the evasion surface (see the Gotchas
  entry). Adding, deleting, or renaming a script must update the manifest in the same diff.
- **Guards ban the name, not the shape.** Where a guard exists to force one route to a resource,
  it forbids *naming* the resource outside the sanctioned module rather than trying to detect uses
  of it: `tests/host-config/config-read.test.js` reports any line under `spec/scripts/` containing
  the stem `spec.config` outside a comment, with a closed list of three literal exempt paths
  (`lib/host-config.js`, `smoke.sh`, `spec-state-gate.sh`). Two supporting rules travel with it. The
  comment exemption is `//` plus `#` not followed by an identifier character, and nothing else —
  `*`, `/*`, and a trailing `//` all begin or contain executable code, so treating them as prose is
  a hole, and a legitimate mention that trips the rule is rewritten as its own `//` line. And the
  guard's falsification is an end-to-end canary over a synthetic tree, never a fixture string fed to
  the predicate alone: a guard with two components can fail open in either, and only the walk-plus-
  predicate-plus-exemption path proves both. "Does this line read X?" is
  undecidable from source text and every read-detecting predicate grows clauses until one is
  hoisted around; "does this line name X?" is decidable in one comparison. The exemption is a list
  of literal paths, never a pattern — a list cannot be joined by a new file merely existing, which
  is the distinction between this and the extension filters the Gotchas entry condemns. Accepted
  residual: deliberately split or computed literals and readdir-based discovery still evade, which
  is irreducible without an AST and out of scope for a zero-dependency repo.
- **The gate resolves `{testDirs}` to the glob form** (`node --test 'tests/<scope>/*.test.js'`)
  — a bare directory runs nothing on Node 26.

History: the baseline mechanics (pre-image snapshots, `--gate` wrap choreography,
green-by-subtraction qualification) are preserved in git history through v6.91.0 and in the
superseded specs under `specs/20260814/` and `specs/20260816/`.
