# Deviations — 11-brief-from-approved-set

- Test-author pass (tests/genesis/brief-state.test.js, tests/genesis/genesis-driver.test.js,
  tests/spec-status.test.js, tests/consistency/genesis-doctrine.test.js): D1's `brief-written`
  checks apply to every non-legacy visual-archetype ratification, which is the exact condition
  several pre-existing accept-path fixtures in tests/genesis/brief-state.test.js already exercise
  (`writeValidBriefArtifacts`, consumed by the AC-20260902-08-5 "ok"/AC-20260902-08-6/
  AC-20260902-08-14 tests) — none of those fixtures' `brief.md` carries `## Journeys`/
  `## Non-UI Coverage`. They are untouched here (still asserting the pre-D1 contract correctly,
  nothing weakened) but will redden once D1 lands, purely because they now also owe D1's new
  sections. The build worker landing D1 needs to add a compliant `## Journeys`/`## Non-UI
  Coverage` block (or an equivalent `design/mocks/seed.md` fixture) to those specific call sites
  so they stay green — this is a known, scoped collision, not a surprise to triage blind.
- Build Phase 0 (orchestrator): `main` moved under the worktree — specs/20260903/01 merged onto
  main (plugin 7.70.0) after this branch forked at ecd408a, and red-check refused `pre-image is
  not pure` on spec/.claude-plugin/plugin.json (§ Gotchas: build_base is a moving ref). The
  branch had no commits yet, so it was fast-forwarded to main (55883225) and `diff_base` was
  re-pinned from ecd408a to 55883225 — the true pre-image of this build. D8's 7.65.0 target is
  stale; the build bumps to the next free version (7.71.0).
- scripts worker (spec/scripts/genesis-driver.js): D5's Applicability line ("D1/D3/D4/D5 apply
  when status.brief.mocks is set") is implemented literally — `skeleton-landed` refuses a
  fresh visual run missing design/shell/app.html, an undeclared top-level design/mocks/*.html,
  a failing `check --matrix design/mocks`, or a components.json missing a canon.md primitive,
  unconditionally once status.brief.mocks is set. tests/genesis/genesis-driver.test.js's own
  `advanceToRoadmapVisual` helper (its header comment: "D5's own new shell/data-shell/primitive
  checks are exercised separately, by this file's AC-20260902-11-5 test, not by every
  roadmap-written caller") calls `advanceToSkeletonVisual` — which writes no
  design/shell/app.html and no design/mocks/*.html at all — then expects `--mark
  skeleton-landed` to accept with only a components.json fixture. That assumption predates D1's
  landing and is now false: the mark refuses `design/shell/app.html does not exist …`, so
  AC-20260902-11-4/-12 (genesis-driver.test.js:861) redden at their own test-setup call, before
  the roadmap-placement behavior they pin is ever exercised. This is the same class of
  collision already logged above for tests/genesis/brief-state.test.js's
  `writeValidBriefArtifacts` — a shared pre-D1/D5 fixture helper the new checks now also apply
  to — not a defect in the D4/D5 implementation, which AC-20260902-11-5/-11-13 (the dedicated
  D5 fixture, in the same file) proves correct and green. The tests worker owes
  `advanceToRoadmapVisual` (or `advanceToSkeletonVisual`) a compliant design/shell/app.html +
  data-shell-declaring design/mocks/*.html fixture (the same shape AC-20260902-11-5's own
  `writeShellDirGD`/`mockDeclaringGD` helpers already provide in this file) so AC-20260902-11-4/
  -12 exercise D4's placement check instead of failing at setup. Not weakened here.
- scripts worker: a third instance of the same D1 collision, outside my file batch —
  tests/genesis/tournament.test.js's `raceWebApp` helper (via `ratifyBriefArtifacts(dir)`, a
  file-local pre-D1 fixture with no `## Journeys`/`## Non-UI Coverage`) now fails at its own
  `brief-written` test-setup call, reddening `AC-20260902-08-8, AC-20260902-08-15`. Same class
  and same fix shape as the `writeValidBriefArtifacts`/`advanceToRoadmapVisual` entries above —
  `ratifyBriefArtifacts` owes a compliant `## Journeys`/`## Non-UI Coverage` block (or a seed.md
  fixture) for its web-app archetype. Not weakened here.
- Build REPAIR round 1 (orchestrator): the lock-time collision closure waived
  tests/genesis/tournament.test.js on the claim that it never sets `brief.mocks`; its
  `raceWebApp` fixture does (web-app archetype with a mocks set), so D1's `brief-written` check
  reddened AC-20260902-08-8/-15 at fixture setup. Scope widened by one File Plan row for that
  file (fixture extension only, never weakened) — auto-picked as the conservative option under
  core § Question Style (no product consequence, cheapest to reverse).
- Test repair round 1: fixed the five fixture collisions named above, all by extension (never
  weakened, no implementation edits). tests/genesis/brief-state.test.js's
  `writeValidBriefArtifacts` now appends a compliant `## Journeys`/`## Non-UI Coverage` block
  onto whatever brief.md the caller already wrote (`ensureJourneysAndNonUiSections`); the same
  fix landed by hand at AC-20260902-08-5's `noTokens` sub-case, which builds its own artifacts
  inline rather than through that helper. AC-20260902-08-14 also needed a compliant
  `design/shell/app.html` (D5, unconditional once `status.brief.mocks` is set) plus one
  data-shell-declaring mock, since `check --matrix` refuses (exit 2, usage error) an EMPTY
  design/mocks/ rather than passing trivially. tests/genesis/genesis-driver.test.js's D5 fixture
  was added to `advanceToRoadmapVisual` only, deliberately NOT to the shared
  `advanceToSkeletonVisual` it wraps — that second helper is also called directly by this file's
  own AC-20260902-11-5 test, which needs to vary the shell/mocks fixture per sub-case (missing
  shell, undeclared mock, missing primitive); folding a fixed compliant fixture into the shared
  helper would have broken that test's "no shell" case. tests/genesis/tournament.test.js's
  `ratifyBriefArtifacts` got the same `## Journeys`/`## Non-UI Coverage` append as
  `writeValidBriefArtifacts` (no D5 fixture needed — this file's only visual-archetype call site
  never reaches skeleton-landed). `npm test`: 1044/1044 passing.
