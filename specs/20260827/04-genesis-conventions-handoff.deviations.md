- **[scripts layer] Cross-file collision: D2/D3/D7 ripple into exhaustive/helper assertions
  outside this spec's File Plan.** `genesis-driver.js` now implements D2 (`--mark decided`
  requires `.claude/genesis/conventions.json`), D3 (`--mark skeleton-landed` requires every
  enforceable probe file plus a valid `CLAUDE.md`/`AGENTS.md`), and D7 (`freshStatus()` gains
  `handoff: null`, matching `spec/templates/status.json`'s new key) exactly as the Decisions
  require — verified against `tests/genesis/conventions-handoff.test.js` (AC-20260827-04-1/2/3/4,
  3 of 4 assertions green; see the second entry below for the one that isn't) and against
  `spec/templates/conventions.json` (the shipped template itself passes its own `decided`
  validation). This is a behavior change with no conditional escape hatch — every host now needs
  a valid `conventions.json` to reach `SCAFFOLD`, and a valid `CLAUDE.md`/`AGENTS.md` to reach
  `ROADMAP` — so it reddens every OTHER test that drives a synthetic host through `decided` /
  `skeleton-landed` without those artifacts and was not retargeted in this spec's own File Plan:
    - `tests/genesis/genesis-driver.test.js` — 8 of its own pre-existing tests now fail
      (`AC-20260825-04-4/5/6/7`, both F6 review-finding tests, F3, and the three logTail GATE_RED
      tests), because its shared `writeValidDecideArtifacts()`/`advanceThroughScaffold()` helpers
      never write `conventions.json` or a binding-subset file. `AC-20260825-04-1`'s exhaustive
      `Object.keys(st).sort()` pin also fails — it does not list the new `handoff` key.
    - `tests/genesis/tournament.test.js` (AC-20260827-01-7, AC-20260827-01-8) and, by the same
      mechanism, `tests/genesis/design-state.test.js` and `tests/genesis/explore-states.test.js`
      (unverified individually, but every one drives `advanceToDecide`-shaped local helpers with
      the same gap) — none of these files are in this spec's File Plan at all.
  This is the exact "locked Decision retires/narrows a live assertion outside the File Plan"
  class `.claude/rules/spec-pipeline.md` § Gotchas already documents (the entry citing
  specs/20260813/07 D8, specs/20260814/04, specs/20260814/01) and the "spec that ADDS a member to
  an exhaustive live-file pin" class (specs/20260823/08 D8) — both explicitly caught at the
  build's own whole-suite check, not at plan lock, and fixed by retargeting the colliding pin in
  place. I did not touch any file outside my assigned batch (`spec/scripts/genesis-driver.js`
  only) to work around this — `tests/` belongs to the `plugin-tests` agent. Flagging here so the
  whole-suite check / next test-owning pass updates the four files' shared helpers (write
  `conventions.json` + probes + a binding-subset file wherever `decided`/`skeleton-landed` is
  driven) and retargets `AC-20260825-04-1`'s key list, rather than this being mistaken for new
  breakage at review.

- **[scripts layer] AC-20260827-04-4's `--refresh` regression sub-case rests on a stale
  assumption about `init-gen.js`'s diff detection.** The test hand-edits ONLY
  `.claude/spec.config.json`'s `generatedBy` field and expects a same-profile re-run of `--mark
  profile-written` (no `--refresh`) to be refused (`init-gen` exit 3, per D4/Behavior). Executed
  repro against the real, unmodified `spec/scripts/init-gen.js` (outside this spec's File Plan,
  not editable here): `buildFileTargets()` registers the config target with `stripKeys:
  ['generatedBy', 'contractHash']` (init-gen.js:376), and `compareExisting()` deletes both keys
  from the on-disk copy before comparing it to the freshly-built object (init-gen.js:463-466) —
  by design, since those two fields are expected to change on every stamp. A direct two-run repro
  (fresh host, `baseProfile()`-equivalent profile, hand-edit `generatedBy` only, re-run `generate`
  with no `--refresh`) exits **0**, not 3, and the manifest-check PASS/INERT lines print exactly
  as they do on the first run — confirming no diff was ever detected. `genesis-driver.js`'s
  `handleProfileWritten()` passes `init-gen`'s real exit code straight through
  (`AC-20260827-04-1/2/3` and AC-4's first three assertions — profile-written succeeds, writes
  `.claude/spec.config.json` with `generatedBy`/`contractHash`, records `handoff.initGenExit: 0`,
  prints the `(HANDOFF → GROUNDED)` checkpoint, and the next bare run prints `state: GROUNDED`
  with `next: /spec:enforce` and `convention probes: 5` — all pass), so this is not an
  implementation gap on this file's side. The test's hand-edit needs to target a field that
  actually participates in the comparison (e.g. `cfg.gateCommand`, which is NOT stripped) to
  produce a genuine offender and observe `init-gen` exit 3. I did not edit the test (owned by
  `plugin-tests`) or `init-gen.js` (owned by a different worker, not in this spec's File Plan) to
  work around this.
