# 0020. Expired tests leave in their own commit

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/13-expired-tests-leave-in-their-own-commit.md)
- Applies to: specs/20260911/03-tests-expire-at-close.md D5's `--apply` clause — `doCloseWork()`'s
  `expire-tests.js` invocation drops `--apply` and becomes `--root <repoRoot> --spec <specRel>
  --json`, a classification-only dry run; the review-row `tests:{born,kept,retired}` and
  `marks.testsExpiry` recording it feeds are unchanged — and D6 in full — the CLOSE step's printed
  line changes from "part of the close commit" to naming a separate commit, and the deletion
  itself moves out of the close commit into `--mark closed`'s own sequence (gate over the tree
  with tests still present, apply, whole-suite re-run, commit-or-restore).
- Amended by: docs/adr/0021-the-close-stops-deleting-tests.md

## Context

specs/20260911/03 D5/D6 made `doCloseWork()` apply the expiry sweep and fold its deletions into
the close commit itself, on the reasoning that "a deletion the gate re-run cannot see would be an
unverified write." That reasoning held for the gate but broke the record the close commit is
supposed to be: the tree git records as "what the review judged" is that tree *minus* coverage the
review's own `ac-matrix` leg just passed on. The replay harness rebuilds its scratch tree from
exactly that commit and gets a coverage leg that can never go green — `setup-failed` on every
attempt, burning a full replay cycle per closed spec with any retired test.

The incident is a provenance bug, not a replay bug: the tree is wrong, not the harness. Fixes
aimed at the replay side (teaching `ac-matrix` to tolerate a red coverage leg on expired specs, or
attributing the uncovered AC as "explained") were rejected for quieting the symptom while leaving
the historical record wrong forever and blinding the one leg that catches genuinely missing
coverage.

## Options considered

- **A. Leave the deletion inside the close commit, teach the replay side to tolerate it.**
  Rejected — see Context; this was the status quo the incident is against.
- **B. Run the expiry sweep before the gate, so the gate itself observes the post-deletion
  tree.** Rejected: this is what specs/20260911/03 D5 already effectively did via `--apply`
  inside `doCloseWork()`, and it is the exact mechanism that folds the deletion into the close
  commit — the gate seeing the deletion is precisely the coupling this record breaks.
- **C. Split the work: `doCloseWork()` classifies only (dry run, unchanged row/marks shape);
  `--mark closed` runs the resolved host gate over the still-intact tree, then applies the sweep,
  re-runs the whole suite, and commits the deletion separately — restoring and re-running once on
  red to tell a broken deletion apart from a broken close tree.** Adopted.

## Decision

**Option C.** `doCloseWork()`'s `expire-tests.js` invocation narrows to classification only —
`--root <repoRoot> --spec <specRel> --json`, no `--apply` — so the close commit it feeds is the
tree the review actually judged, tests intact. `--mark closed` is where the deletion now happens,
after the resolved host gate has already certified that intact tree: apply the sweep, re-run the
host's whole-suite `testCommand`, and on green stage exactly the retired-and-emptied paths
(`git add --`, never `-A`) into a commit of their own (`chore(tests): expire <n> tests closed with
<spec>`) that touches nothing under `specs/`. On red, restore those paths and re-run the suite
once more: green with them restored means the deletion was the cause, so the close completes
without its expiry and prints a warning naming the count and the sweep remedy; still red means the
close tree itself is broken and the mark refuses exactly as it always had, with no expiry note.

This narrows specs/20260911/03 D5's `--apply` clause (the row and `marks.testsExpiry` it produces
are unchanged) and replaces D6 in full — its single printed line and its "the deleted files ride
the existing close commit" clause both no longer hold.

`spec/templates/grounding-contract.md`'s § Test expiry host obligation — scope per-criterion
carrier checks to specs that are not `done` — is unchanged and is not edited: only its
explanatory sentence about *when* the deletion happens goes slightly stale, and re-stamping every
host's `contractHash` to reword one sentence is a worse trade than the residual staleness recorded
here.

## Consequences

- specs/20260911/03-tests-expire-at-close.md D5 and D6 are not rewritten in place — the spec gains
  only the one `Amended by: ADR-0020` backlink line under D6's row, and this record is the durable
  account of what changed and why. specs/20260911/03's other Decisions (D1–D4, D7–D9) stand
  unchanged.
- The close commit is now provably the tree the review judged: `git log -1 --format=%H --
  <specPath>` resolves the close commit, not the expiry commit, and `git diff --name-status
  <close>^ <close>` carries no `D` row for a retired test. The replay harness's scratch tree built
  from that commit still holds the coverage the review passed on.
- A close that retires nothing makes no additional commit and leaves `git rev-parse HEAD`
  untouched across the mark, exactly as before this record.
- A host whose own check disagrees with test expiry (the field failure this record fixes) no
  longer deadlocks `--mark closed`: the restored re-run lets the close proceed without the
  deletion, reported rather than silently swallowed, while a close tree broken for any other
  reason still refuses with the message it always had.
- `spec/templates/grounding-contract.md`'s § Test expiry bullet carries a now slightly stale
  explanatory sentence about timing; its obligation is unchanged. A later spec that touches that
  contract for another reason may fold the wording in then.
