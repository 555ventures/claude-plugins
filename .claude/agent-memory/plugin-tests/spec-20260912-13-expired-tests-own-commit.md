---
name: spec-20260912-13-expired-tests-own-commit
description: Test-layer authoring for moving expired-test deletion out of the close commit into its own post-close commit
metadata:
  type: project
---

Spec: specs/20260912/13-expired-tests-leave-in-their-own-commit.md. Amends
specs/20260911/03-tests-expire-at-close.md D5 (`--apply` clause) and D6 (fully) via ADR-0020 — the
close commit must stay the tree the review judged (tests present); the expiry deletion becomes a
separate path-scoped commit made inside `--mark closed`, and the gate now runs BEFORE any deletion.

**Test design that made 5 new/rewritten cases genuinely red against the pre-image:**
- `tests/expiry/test-expiry.test.js`'s dry-run test (AC-20260911-03-3, dual-tagged with
  AC-20260912-13-1): `emptied` is computed only inside expire-tests.js's `if (apply)` block, so a
  dry run always reported `emptied: []` — asserting `out.emptied.includes(...)` on a DRY run reds
  cleanly. D1 moves the span-removal/collapse pass in-memory, always-on; `apply` only gates the
  disk writes.
- `tests/review/review-driver-close-expiry.test.js` — `makeExpiryHost()` fixture unchanged
  (specs/20260911/88-drv-expiry.md, one plain + one pin AC in the same file so retiring the plain
  one never empties it). Reused directly across all 5 rewritten/new cases:
  - AC-2 (rewrite of the old AC-20260911-03-7 first test): asserts the plain test's AC-ID is STILL
    on disk at CLOSE (old code deletes eagerly via `--apply` in `doCloseWork()` — reds on file
    content) and the new D3 wording `🧹 N tests expire with this spec (M files removed) — deleted
    in their own commit when you mark closed` (old text said "part of the close commit" — reds on
    stdout).
  - AC-3 (new): drives to CLOSE, commits "close" by hand (`git add -A && git commit`), captures
    that sha, runs `--mark closed`, and asserts a SECOND commit exists whose message is exactly
    `chore(tests): expire <n> tests closed with <specRel>`, whose only changed path (`git diff
    --name-only <close> <head>`) is the retired file, and that `git log -1 -- <specRel>` still
    resolves to the FIRST commit. Reds because current code never commits anything at
    `--mark closed` (HEAD stays at the manual "close" commit — `notStrictEqual` fails on equal).
  - "gate red right after expiry..." (rewrite, AC-4's target): the OLD scenario (gate observes a
    tree with tests already deleted) is now impossible because the gate runs before any deletion —
    rewritten to model D6's actual fork: a `testCommand` stand-in (`check-test.sh`, greps the
    plain AC-ID) that's green pre-apply, red post-apply, green again after the restore-checkout.
    Asserts `--mark closed` exits 0, prints the exact D7 warning pieces (`⚠ expiry skipped`, the
    retired count, `§ Test expiry`, `--all-done --apply`), makes no commit, and restores the file.
    Reds because current code has no restore-and-retry logic at all — it dies immediately on the
    first red `testCommand` with the OLD `expiryHint()` wording tied to the gate-red arm.
  - AC-5 (new): same fixture but `testCommand` is unconditionally red (`always-red.sh`) — asserts
    refusal (`suite red at close`, exit 2), no `⚠ expiry skipped`, no commit, and — critically —
    that the file was RESTORED despite the refusal (current code never restores, so this reds on
    file content even though the exit code/message already matched).
  - AC-6 (new): `onlyPin` fixture (retired:0) — asserts `git rev-parse HEAD` is byte-identical
    across `--mark closed`. This is a **sanctioned green-pre-change pin** (see the spec's own
    deviations sidecar): current code never commits anything at `--mark closed` regardless of
    retired count, so this holds true already and only becomes a live regression guard once D5's
    commit logic lands.
  - The two untouched `SHALL CONTINUE TO`-shaped tests (`AC-20260911-03-7: WHEN nothing is
    retired...` and `a close-time gate that goes red when expiry retired nothing carries no
    expiry note`) needed ZERO edits — their assertions were already true under both old and new
    Decisions, confirmed by a full-suite run showing exactly the 5 intended cases red and all
    ~1130 others green.

**Reusable pattern**: a `testCommand`/`gateCommand` stand-in script that `grep -q`s an AC-ID
literal inside the fixture's own test file is a cheap way to simulate a host's "coverage per
criterion" check reacting to a test's presence/absence across an apply-then-restore cycle, without
needing a real second host repo.
