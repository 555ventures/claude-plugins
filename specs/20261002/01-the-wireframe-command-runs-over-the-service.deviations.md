# Deviations — 01-the-wireframe-command-runs-over-the-service

- tests/consistency/genesis-doctrine.test.js: the File Plan's "whole Brief State approval-file case" also carried a third clause (ban on `shell adopt`, `check --matrix`, `data-shell`, `design/components.json` in spec/doctrine/genesis.md) beyond the two absence clauses the new sweep covers; deleting the case per the File Plan drops that ban with it. No other test pins those four literals in genesis.md — flagged for the orchestrator, not re-added (a re-add would be a new pin the spec does not list).
- tests/mocks/wireframe-states.test.js and wireframe-rounds.test.js: each AC that bundles several independent WHEN-clauses (spec ACs 3, 8, 9, 11, 12) is split into several flat `test(...)` cases carrying the same AC-ID in the name, so a failure names the clause; no clause dropped.
- tests/walkthrough/stub-service.js: no change needed — A6's scripted-list-per-key behaviour covers every answer the new tests script.
- Orchestrator: the test author's deletion of the Brief State case in tests/consistency/genesis-doctrine.test.js
  also dropped its third clause, the ban on four retired second-artifact literals in spec/doctrine/genesis.md,
  which no other test pins. That ban is surviving behaviour, so it is kept as its own AC-free case (citing
  specs/20260926/04 D9), not deleted.
- D8 (scripts layer): in service mode without `--waive`, the driver reads the latest `round.json` for the current story hash BEFORE running `pull-approvals`, not after. Same refusals, same outcomes; a local read first means the "service does not show the current story" refusal needs no network call, and a stub with no approvals scripted is never asked. Forced by tests/mocks/wireframe-rounds.test.js (the stale-story host scripts no approvals answer).
- D3 (scripts layer): `roundFindings` takes an optional fifth argument, readScreens's own `bad-screen-file` findings, and returns them first, because its four-argument contract signature has no other way to return "them together with the rest". The driver passes them through; callers that omit it get the other three kinds only.
