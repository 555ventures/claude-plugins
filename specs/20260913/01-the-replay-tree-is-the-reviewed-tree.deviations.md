# Deviations — 01-the-replay-tree-is-the-reviewed-tree

- D2/D3 (`replay.js --select`) implemented verbatim — the `git log -1 -- <spec>` + `^` derivation
  is DELETED with no fallback for `commit=`, exactly as D2 states ("DELETED, not demoted"). This
  regresses 8 previously-green `tests/replay/replay.test.js` cases whose fixtures predate the ref
  scheme: AC-20260823-09-1/-2/-3, AC-20260909-02-8, AC-20260823-05-5/-8, AC-20260819-03-9
  (collision fix), and the unnamed "--select skips a candidate review run already named by a
  pristine-red setup-failed replay row" test. Each builds its ledger row by hand via `writeLedger`
  after `commitSpecFlow`/`commitReal`, never calling the new `writeReviewRefs()` helper the
  rewritten AC-20260913-01-3 test in the same file introduces — so under D2's literal "no
  fallback" rule for `commit=`, every one of them now hits the new exit-4 refusal (no `close`
  ref). This is a scripts/tests boundary I cannot cross: the scripts layer's own instructions
  forbid editing `tests/**`, and satisfying these fixtures would require re-adding exactly the
  history-walk fallback D2 orders deleted. The fix belongs in the tests layer — add
  `writeReviewRefs(root, runId, parent, commit)` calls to each of the 8 fixtures above, mirroring
  the pattern already present in the AC-20260913-01-3 test in the same file — never a script-side
  compatibility shim.
- D1 (`spec-review-driver.js`'s new refs) regresses one further pre-existing test outside my file
  list: `tests/review/review-driver-replay-record.test.js`'s AC-20260821-02-3. Its fixture forces
  an "unresolvable --select target" by amending the close flip into the pre-existing implement
  commit (`commitClose(host, { amend: true })`), which orphans that commit from the branch so the
  OLD `git log -1` + `^` derivation's parent-hop landed on a commit predating the spec entirely.
  D1's `judged` ref is written at the close-row append (before the amend) and keeps pointing at
  that now-orphaned sha regardless — which is the ENTIRE point of writing it as a ref (A1: a ref
  keeps an orphaned commit resolvable) — so `--select` now succeeds where the fixture's amend
  trick relied on it failing. The AC's underlying claim (a due-but-unresolvable close still
  reaches DONE with the advisory printed) is untested by any fixture that survives D1 landing;
  the fix belongs in the tests layer (a fixture that produces a genuinely missing/unresolvable ref
  pair, e.g. one lacking a `close` ref at all), not a scripts-side change.
