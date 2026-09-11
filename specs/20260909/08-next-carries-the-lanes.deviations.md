# Deviations — 20260909/08-next-carries-the-lanes

- tests layer (test-author): AC-20260909-08-8 is a sanctioned green-pre-change pin (D5's five
  frozen surfaces are byte-for-byte unchanged by this spec) — it passes today and must keep
  passing after the implementation lands, unlike every other AC in this batch which is red now.
- tests layer (test-author): several existing lane/🔶/🚦 pins in tests/spec-status.test.js mixed
  a lane-render assertion with a `🕓 after that:`/`⛔ blocked:` assertion in one test body (both
  driven by one `--all` run). Per the File Plan's "lane/🔶/escape assertions move to the default
  render; 🕓/⛔ assertions stay on --all", these were split in place into two `runNode` calls
  inside the same test function (one bare, one `--all`) rather than duplicated into two separate
  tests — same fixture, same invariant, no coverage lost.
- doctrine layer: D6 names the amendment ADR `docs/adr/0013-next-carries-the-lanes.md`, but
  `ADR-0013` was already claimed by `docs/adr/0013-client-rehearses-the-journey.md` (landed on
  `main` ahead of this build, part of the 20260910/02-06 series). Shipped as
  `docs/adr/0014-next-carries-the-lanes.md` instead — the next free number, substance
  unchanged — and both `Amended by:` backlinks (`specs/20260903/05-status-diet.md`,
  `docs/roadmap/24-status-and-queue-diet.md`) cite `ADR-0014`. `tests/status/status-diet.test.js`
  line 10 carries a pre-existing comment citing `ADR-0013` for this spec; it is owned by the
  tests layer and outside this worker's file list — the tests worker should retag it to
  `ADR-0014` when touching that file.
- scripts layer (blocked, not fixed here — tests/spec-status.test.js is outside this worker's
  file list): AC-20260909-08-1's first sub-case (`lit`/`litOut`, the fixture asserting
  `⚡ 2 parallel lanes` over `01-a`+`02-b`) reuses `briefs: PARALLEL_BRIEFS`, where brief `02`'s
  header itself declares `Depends on: 01` (via `BRIEFS['02-billing.md']`). Under D5's unchanged
  `laneAdmission`/`deriveNext`, a brief-level dependency on the top pick's own brief makes the
  runner-up serial (`briefSerialReason` fires, confirmed via `--next --json`:
  `"parallel": false, "parallel_reason": "brief 02 depends on 01"`), so it sinks under `🕓 after
  that:` rather than fanning into `⚡` lanes — matching every other passing pairwise-lane test
  in this same file. The AC's own prose ("three hardened specs under three briefs where brief
  03 depends on 01") describes brief `02` as independent of `01`, which `PARALLEL_BRIEFS` does
  not provide; no existing brief-fixture constant in the file expresses "02 independent, 03
  depends on 01". The render code was written to the locked D1/D3/D4 Decisions and passes all
  44 other tests across the three oracle files (including the rest of this same test's
  `dir`/`rAll` sub-case, which uses a `done` brief-01 spec and correctly fans `02`/`03`
  together — the established pattern for this pairwise-lane invariant elsewhere in the file).
  Recommend: the tests layer gives the `lit` sub-case its own brief set with `02` unrelated to
  `01` (or reuses `BRIEFS`/`PARALLEL_BRIEFS` only for a case where the dependency-bearing
  brief's own spec is `done`, as the `dir` sub-case already does).
- other layer (orchestrator): D8 named only `size-baseline.json` for the build-time re-stamp, but
  cutting the new tests' duplication left `tests/spec-status.test.js` and
  `tests/status/status-diet.test.js` scoring BELOW their `dup-baseline.json` ceilings, which
  `dup-windows.js` reports as `stale` and exits 1 on — the same shrink-is-a-finding shape D8
  anticipated for the size ratchet. Re-stamped with `node scripts/dup-windows.js --root . --update`
  (a tightening, never a raise, so no cite is owed) and added the `dup-baseline.json` row to the
  File Plan.
- other layer (orchestrator): the size ratchet needed five `--raise` entries citing this spec
  (`spec/scripts/spec-status.js`, `tests/spec-status.test.js`, `tests/status/status-diet.test.js`
  and the `spec/scripts` + `tests` tree ceilings) before `--update` could tighten the one `stale`
  file — D8 predicted only a shrink. The render moved into the Next block is net-additive in
  `spec-status.js`, and the ten new acceptance criteria are net-additive in the two test files.
