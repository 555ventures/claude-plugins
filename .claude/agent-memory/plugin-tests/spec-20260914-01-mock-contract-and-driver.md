---
name: spec-20260914-01-mock-contract-and-driver
description: Fixture design for the mock-app driver rewrite (SEED..APPROVED) — stub mock-review via env-pointed state dir, PATH='' for ENOENT/refusal proofs, underspecified seed.md Records syntax
metadata:
  type: project
---

Spec 01 (specs/20260914/01-the-mock-contract-and-the-driver.md) retires the HTML-mock driver
states (SHAPES/KIT/WIREFRAMES) for a six-state machine (SEED→SHELL→SCREENS→THEME→CLIENT→APPROVED)
driven by a separate `@555/mock-review` package the repo never installs. Test fixture
(`tests/mocks/mock-app-fixtures.js`) stubs that package as a bash executable that reads its
canned `contract.json`/`check.json`/`sweep.{json,txt}`/`serve-url.txt` from a directory named by
`MOCK_STUB_DIR` in the child's env — this env var rides along for free through
`{...process.env}` spreads (both the test's own `runNode` call and the driver's own internal
`spawnSync(..., {...process.env, PATH: ...})` for the real package), so per-scenario state swaps
just rewrite files in that directory between driver invocations rather than restarting anything.

**Gotcha reused across this build**: `PATH: ''` (empty string, not unset) as a test env override
reliably reproduces "binary not found" (ENOENT) for a driver's spawned CLI on Linux — POSIX
treats an empty PATH component as cwd-only, so nothing outside the tmpdir is found — while
leaving `runNode`'s own `spawnSync(process.execPath, ...)` unaffected (it uses the absolute
`process.execPath`, never PATH lookup). Cheap and reliable for D2/AC-2-style "no CLI reachable"
proofs; no need to fabricate a broken PATH string.

**Underspecified contract, recorded as a deviation, not a block**: the spec's D4/File Plan say
seed.md's `## Records` entities "map to `src/records/<entity>.ts`" but never spell the line
syntax. Fixtures/tests chose the simplest form (`- <entity>`, one per line) and logged it in
`specs/20260914/01-the-mock-contract-and-the-driver.deviations.md` rather than guessing silently
— the seed-done implementation must match that shape or the fixture (never the assertion) moves.

See also [[scope-reconcile-degenerate-stems]] for the general PATH/env-stub pattern family, and
[[driver-contract-reproducibility-and-worktree-cwd-pins]] for the sibling driver-testing
discipline this build followed (marks-object literal pins, --state derivation checks).
