# Deviations — 03-plan-cites-the-build-replays-and-status-derives-the-delete

- tests/build/build-driver-replay.test.js AC-1: the AC says `--mark harden-merged` exits 2 containing `is unknown`, but the driver's shipped generic refusal reads `unknown mark "<name>" (...)` and D3 does not reword it; the pin accepts either `--mark harden-merged is unknown` or `unknown mark "harden-merged"` rather than force an unlocked rewording.
- tests/build/build-driver-replay.test.js AC-3: the Contracts example spells the sidecar `<spec>.md.build/`, but the real sidecar is `<spec>.build/` (spec file minus `.md`); `replay-state.json.log` is pinned as the repo-relative path of `<sidecar>/replay-1.log`.
- tests/build/build-driver.fixtures.js: added `toGreenGate(host)` (integrated mark without asserting COMMIT, since a `prototype:` spec derives REPLAY there) and a `prototype` param on `specBody`; `makeHost`'s `lane`/`contract` options are removed (`host.contractPath` replaces `contract`).
- Retired-tag set (A7) widened past the lock prediction: AC-20260928-03-2 … -5 (pointers at the
  deleted lane test, never cited by ID under tests/) and spec 20261005/03 AC 16 and AC 19
  (CONTINUE-TO `reuses` pointers at the deleted lane and sign-in tests) are tagged
  `[retired: …]` alongside the lock-time set. AC-20260928-99-6..8 dropped out of tests/ too but
  are fixture IDs no spec defines — nothing to tag.
- D1's plan.md bullet is held to its five-line cap by eliding the closing clause "the prototype is
  a reference only" (the bullet's own "Never read `proto/<stem>` or its worktree" carries the rule)
  and shortening "the build driver copies it" to "driver-copied"; every other D1 element is verbatim.
- spec-build-driver.js: `--mark replayed` also refuses (exit 2, names `prototype.url` and /spec:doctor) when `prototype.url` is undeclared, and when the contract's test file is missing under design/prototypes/<stem>/ (names `--mark tests-derived`); D3(d) lists neither refusal, but PROTO_URL and the copy source cannot be resolved without them.
- spec-build-driver.js: `--mark replayed` copies the test file before running e2eRun and counts each attempt in `marks.replayRuns` (build-state.json) so the log is `replay-<k>.log` with k rising across red retries; the contract names `replay-1.log` only for the first attempt.
- review-legs.js: the `contract` row is appended immediately before the ac-matrix wave (not in the earlier file-reading wave) because ac-matrix reads oracle standing by leg name off the manifest it is handed.
- tests/review/prototype-close.test.js fixture conflict (not fixed, tests are not mine): its `prototype:` spec has no build row with `replay.passed/looked` in the review worktree's `.claude/spec-runs.jsonl`, so D5/AC-6's red `contract` row (exit 1) is a leg finding the setup cannot disposition without a disposer file, and the three prototype cases stop at DISPOSITIONS. With a passing build row written into the worktree ledger before the implement commit, all four cases pass against the unchanged driver.
- tests/review/prototype-close.test.js: the fixture appends a build row {stage build, spec, replay {tests 2, passed true, looked true}} to the review worktree ledger before the implement commit for prototype: cases, as a real session would, so the contract leg is green and dispositions reach CLOSE.
