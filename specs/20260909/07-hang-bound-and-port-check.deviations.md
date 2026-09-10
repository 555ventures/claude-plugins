# Deviations — 20260909/07-hang-bound-and-port-check

- tests/test-file-budget.test.js's AC-20260909-07-3 "passing fixture" half (OK-case, stderr
  destination, none on stdout) is a sanctioned pin exception, green pre-change: D2 states the
  reporter's "output contract ... is unchanged" and A2 is an already-executed micro-spike
  confirming `--test-reporter-destination` routes this exact reporter's output correctly
  regardless of the host config's own wiring. Verified empirically (2026-09-10) against the
  live reporter binary with `--test-timeout=45000 --test-force-exit` also applied — the
  sentinel landed on stderr only, none on stdout, before any implementation-layer file in this
  spec's batch changed. Only the AC-3 RED half (`SPEC_TEST_FILE_BUDGET_MS=5` / 30ms fixture) and
  AC-20260909-07-1/-2 (the host config actually carrying D1's wiring) are the genuinely red
  tests in this file; AC-1/AC-2 stay red until the `other`-layer File Plan row lands.
- AC-20260909-07-8 (D5, tests/doctor/port-check-clean.test.js) is red, not green, against
  port-check.js implemented exactly to D3/Contracts. Cause: tests/doctor/port-check.test.js
  (AC-4's own fixture file, not in this worker's batch and not editable per the worker
  contract) writes its five synthetic-tree fixtures via literal string arguments —
  `fs.writeFileSync(..., 'server.listen(4173)\n')`, `'const p = 41230 + (process.pid % 300)\n'`,
  `"module.exports = ['serve', '--port', String(4599)]\n"`, plus two assertion-message
  template strings quoting `server.listen(4173)` / `String(4599)` — and port-check.js walks
  every regular file under `<root>/tests` with no name/extension filter (D3's Gotcha
  explicitly forbids classifying by filename shape). Those literals are real substrings of
  the test file's own source text, so port-check.js's three Contracts-verbatim regexes
  (applied as plain per-line text, exactly as specified) correctly flag them: 6 findings, all
  inside tests/doctor/port-check.test.js itself, zero anywhere else in the tree — confirming
  D9's flip and spec 06's cleanup both landed clean. No fix is available inside this worker's
  authority: narrowing the walk or the regexes to dodge this would weaken the check (forbidden
  by the Gotcha and by "never weaken an assertion"), and the file causing the self-match is a
  test file outside this batch (forbidden to edit). Verified 2026-09-10 with
  `node spec/scripts/port-check.js --root .` — output limited to
  `tests/doctor/port-check.test.js:22,23,24,25,26,60`. Flagging for the orchestrator/tests-owner
  rather than guessing at a fix: either AC-4's fixtures need non-self-matching literals (e.g.
  built via string concatenation so the raw source bytes don't spell the pattern), or D3/AC-8
  need an explicit, principled exemption this spec does not currently state.
