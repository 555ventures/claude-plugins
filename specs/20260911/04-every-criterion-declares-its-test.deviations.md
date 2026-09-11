# Deviations — 20260911/04-every-criterion-declares-its-test

- **AC-20260911-04-18 is a sanctioned green-pre-change pin, not a stale-assumption block.** Its own
  substance ("D10's widening moves this repo's live count by exactly zero") is true independent of
  whether D10 has landed — the Assumptions section's own rationale is that no live file in this
  repo exercises the widened shapes. `tests/ceiling/count-tests.test.js`'s new AC-20260911-04-18
  case proves this executably today: it captures the real repo's count via the shipped
  `count-tests.js --root .`, then builds a faithful reconstruction of D10's exact token-list
  widening patched onto a scratch copy of the real `lib/scan-test-calls.js`, runs it over the same
  live corpus, and asserts the two totals match. This passes today (green pre-change) and would
  fail if a future edit ever introduced a live file matching one of D10's newly-recognized
  operator/keyword shapes — a real regression guard, not a vacuous pin.

- **`spec/entrypoints.json` gained two `entryPoints` rows (`spec/commands/plan.md`,
  `spec/templates/spec.md`) under `spec/scripts/count-tests.js`, a file outside the doctrine
  batch's File Plan.** The doctrine edits to `plan.md` (Lock step 2) and `spec.md` (the AC
  comment) each name `spec-paths count-tests` as the reference lookup, which
  `tests/consistency/entrypoints.test.js`'s reverse-invocation check requires the manifest to
  declare — an omission in the File Plan, not a design fork. Fixed in place rather than blocked,
  since the remedy is mechanical and the File Plan never named an owner for it.
- Orchestrator applied the single-key `.claude/spec.config.json` edit (testNameFilter, D11) directly instead of dispatching a general-purpose worker for one JSON line; that wave held no other file.

- **`ac-matrix.js --lint`'s `--json` `observed.lint` carries D3's two new keys only for specs dated
  on or after `DISPOSITION_APPLIES_FROM`; the Contracts block shows the five-key shape
  unconditionally.** Forced by `tests/ac-matrix/lint-mode.test.js`'s AC-20260907-01-4, a live
  `deepStrictEqual` pin on the exact 3-key object for an undated tmpdir fixture spec — a test
  outside this spec's File Plan, which the five-key shape would redden. The human summary line
  always prints all five counters, so AC-20260911-04-2's and AC-20260911-04-14's pinned strings are
  unaffected; only the JSON object's key set is applicability-scoped. Recorded rather than
  rewriting an unowned pin.
