---
date: 2026-09-09
status: done
build_base: main
tier: standard           # driver + doctrine only; verdict.js and every other named critical surface untouched
area: review
design: false
breaking: false
depends_on: [specs/20260909/04-review-soft-floor.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: f65750a7e58218ba80634219dff6eb4a97172e27
---

# The fix-delta reviewer pass reviews the fix, not the range again

## Goal

After a fix lands, the second and later reviewer passes review only the files the fix touched:
the driver snapshots the working tree when the reviewer returns and again when the fix is
marked applied, writes the changed-file list to the sidecar, and prints a REVIEWER step that
names that list, the prior reviewer return and the prior disposer return. The reviewer's
contract for that pass is: re-verify every finding routed to fix, report hard regressions inside
the listed files, and open nothing outside them. Done means: iteration 2's step text carries the
delta list, a fix that changed nothing is refused before any legs run, and a reviewer handed
the list cannot legitimately re-open the full range.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | At `--mark reviewer-returned` for iteration n the driver snapshots the working tree as a git tree object via a scratch index (`GIT_INDEX_FILE=<sidecar>/snap-index git add -A . && git write-tree`, index file deleted after), storing the sha as `marks.treeSnapshot[n]`; the real index and worktree are never touched (AC-20260909-05-1) | Fixes are uncommitted edits; `git stash create` omits untracked files (spiked: a new test file is invisible to it), the scratch-index write-tree sees both (spiked) |
| D2 | At `--mark fix-applied`, after the cap check and before `runLegsIteration`, the driver snapshots again and writes `<sidecar>/fix-delta-<n+1>.txt` = `git diff --name-only <snap_n> <snap_now>` (one repo-relative path per line, sorted); an empty diff is refused with exit 2 naming "no file changed since the reviewer returned — the fix workers wrote nothing" and no manifest is created (AC-20260909-05-2, AC-20260909-05-3) | A fix that changed nothing would re-run legs and re-dispatch a reviewer for no delta; refusing before legs saves the whole iteration |
| D3 | `deriveState()` demands the snapshot like any other artifact: a `reviewer-returned` mark whose `treeSnapshot[n]` is missing (older sidecar) falls back to snapshotting at fix-applied time against `HEAD`'s tree, and the delta file then lists every file dirty against HEAD (AC-20260909-05-4) | Re-entrant: a session that upgrades mid-run still gets a delta list, wider rather than absent |
| D4 | The REVIEWER step on iteration ≥ 2 prints a variant headed `## Step: dispatch the reviewer — fix-delta pass` naming: the delta file path, the prior reviewer return (`reviewer-return-<n-1>.json`), the prior disposer return (`disposer-return-<n-1>.json`), and the same manifest/outputs lines; the text contains no `scope` substring (AC-20260909-05-5) | The reviewer needs the list and the two prior returns to verify closure; AC-20260902-05-13 forbids the word "scope" in that step |
| D5 | `spec/agents/reviewer.md` gains § The fix-delta pass: when the dispatcher names a delta file, the range under review is those files as they now stand; every prior survivor whose disposition was `fix` is re-verified and lands in `killed` (closed, with the executed evidence) or in `survivors` again (not closed, same claim text); new findings are reported only for lines inside the listed files; a finding outside the list is a finding about the range, reported as a `soft` naming the file, never a review of it [no-ac: agent prose contract; the driver half is AC-20260909-05-5] | Fresh eyes on the whole range every pass is what produced a new soft each round; the pass has a purpose, and this names it |
| D6 | `spec/commands/review.md` § Reviewer dispatch names the extra inputs of a fix-delta pass and states the reviewer's range for that pass is the delta file [no-ac: doctrine prose] | The session hands paths, never contents; the step prints them, the doctrine says why |
| D7 | The delta file and snapshots live in the sidecar only and die with it at DONE; nothing is added to the ledger row or the retained artifact [no-ac: absence invariant — the retained-artifact key pins in tests/review/verdict.test.js stay green] | Scratch state; the ledger records outcomes, not intermediate ranges |
| D9 | The A2 collision reaches two setups outside the original File Plan — `tests/review/escalate-row.fixtures.js`'s shared `driveToCapEdge()` and `tests/review/disposer-gate-refusals.test.js`'s AC-20260901-09-7 setup both mark `fix-applied` with no file edit. Both are corrected in place the same way `review-driver-fix-cycle.test.js` was (a content-preserving edit before each `fix-applied`), never by narrowing D2's refusal [no-ac: the corrected pins are the existing ACs, unchanged] | Build-time ruling: the tests are red because the spec's new refusal is correct; the pipeline forbids a red suite, so the stale setups are fixed, not waived |
| D10 | `size-baseline.json` is a File Plan row: the driver and six test files grow past their caps under D1–D4 and D9, so the sanctioned reconcile (`node scripts/size-ratchet.js --root . --reconcile --cite <this spec>`) runs and its raises land in the plan rather than out of it [no-ac: `size-ratchet.js --root .` exiting 0 is the oracle, pinned by AC-20260908-01-9] | Review-time ruling on the reconcile leg's out-of-plan finding; spec 04 settled the identical class the same way |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1–D4: `snapshotTree()` helper (scratch index), `marks.treeSnapshot`, delta file at fix-applied with empty-delta refusal, REVIEWER fix-delta variant text |
| spec/agents/reviewer.md | MODIFY | doctrine | D5: § The fix-delta pass |
| spec/commands/review.md | MODIFY | doctrine | D6: reviewer dispatch inputs for the fix-delta pass |
| tests/review/fix-delta-pass.test.js | CREATE | tests | AC-20260909-05-1, AC-20260909-05-2, AC-20260909-05-3, AC-20260909-05-4, AC-20260909-05-5 |
| tests/review/review-driver-fix-cycle.test.js | MODIFY | tests | AC-20260909-05-6 — SHALL CONTINUE TO pins: the cycle's fixture now edits a file between dispositions and fix-applied |
| tests/review/escalate-row.fixtures.js | MODIFY | tests | D9 — shared `driveToCapEdge()` edits a file before each `fix-applied` so D2's refusal does not fire on a stale setup |
| tests/review/disposer-gate-refusals.test.js | MODIFY | tests | D9 — same collision fix in its AC-20260901-09-7 setup |
| tests/review/escalate-cap-durable.test.js | MODIFY | tests | D9 — same collision fix in its durable-cap setups |
| tests/review/escalate-row-step.test.js | MODIFY | tests | D9 — same collision fix in its local `driveToCapEdgeHard()` mirror and trailing `fix-applied` |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 bump |
| size-baseline.json | MODIFY | other | D10 — the ratchet reconcile this spec's growth forces, every raise citing this spec |

## Contracts

```text
sidecar additions (review-state.json):
  marks.treeSnapshot: { "<n>": "<tree sha>" }        written at reviewer-returned n
  <sidecar>/fix-delta-<n>.txt                         written at the fix-applied that creates manifest-<n>
      one repo-relative path per line, LF, sorted, no blank lines

snapshotTree(repoRoot, sidecarDir) → sha
  env GIT_INDEX_FILE=<sidecar>/snap-index ; git -C <root> add -A . ; git -C <root> write-tree
  removes <sidecar>/snap-index afterwards; never touches .git/index

--mark fix-applied
  cap check (unchanged, first)
  delta = git diff --name-only <treeSnapshot[n]> <snapshotTree()>
  delta empty → exit 2: "no file changed since the reviewer returned — the fix workers wrote
                         nothing; dispatch them again or close through waive/reject"
  else write fix-delta-<n+1>.txt, then runLegsIteration(n+1, {fixDelta:true}) as today

REVIEWER step, iteration ≥ 2:
  ## Step: dispatch the reviewer — fix-delta pass
  Legs are green. Dispatch ONE Agent {subagent_type: "spec:reviewer"} with the spec path,
  diff base <base>, root <root>, and this pass's inputs:
    changed files: <sidecar>/fix-delta-<n>.txt
    prior reviewer return: <sidecar>/reviewer-return-<n-1>.json
    prior disposer return: <sidecar>/disposer-return-<n-1>.json
    manifest: … / outputs: …
  Write its structured return ({verdict, survivors, killed, reviewerCount, tokens}) … (unchanged tail)
```

## Behavior

- Iteration 1 returns one hard finding in `a.js`; the disposer routes it to fix; the worker edits
  `a.js` and adds `tests/a.test.js`. `--mark fix-applied` writes `fix-delta-2.txt` with those two
  lines and runs the legs. The next invocation prints the fix-delta REVIEWER step naming the file.
- The worker edits nothing (returned early): `--mark fix-applied` exits 2 with the empty-delta text;
  `manifest-2.jsonl` does not exist; `marks.pendingFix` stays true.
- A prior-version sidecar has no `treeSnapshot`: fix-applied diffs HEAD's tree against the live
  snapshot, so the delta lists every dirty file — wider, never empty by accident.

## Acceptance Criteria

- **AC-20260909-05-1**: WHEN `--mark reviewer-returned` is accepted for iteration 1 in a host whose
  tree has one modified tracked file and one untracked file THE SYSTEM SHALL write
  `marks.treeSnapshot["1"]` as a 40-hex sha for which `git cat-file -t <sha>` prints `tree` and
  `git ls-tree -r --name-only <sha>` lists the untracked file, and `git status --porcelain` before
  and after the mark SHALL be byte-identical → test in tests/review/fix-delta-pass.test.js
- **AC-20260909-05-2**: WHEN `--mark fix-applied` follows a fix that modified `a.js` and created
  `tests/a.test.js` THE SYSTEM SHALL write `<sidecar>/fix-delta-2.txt` containing exactly
  `a.js\ntests/a.test.js\n` and create `manifest-2.jsonl` → test in
  tests/review/fix-delta-pass.test.js
- **AC-20260909-05-3**: WHEN `--mark fix-applied` follows no file change THE SYSTEM SHALL exit 2
  with stderr containing `no file changed since the reviewer returned`, create no
  `manifest-2.jsonl`, and leave review-state.json byte-identical → test in
  tests/review/fix-delta-pass.test.js
- **AC-20260909-05-4**: WHEN review-state.json carries no `treeSnapshot` (hand-removed to model an
  older sidecar) and one file is dirty against HEAD at `--mark fix-applied` THE SYSTEM SHALL write
  the delta file listing that file and proceed (exit 0) → test in
  tests/review/fix-delta-pass.test.js
- **AC-20260909-05-5**: WHEN the driver prints the REVIEWER step with `manifest-2.jsonl` present
  THE SYSTEM SHALL print a heading containing `fix-delta pass`, lines naming `fix-delta-2.txt`,
  `reviewer-return-1.json` and `disposer-return-1.json`, the return shape
  `{verdict, survivors, killed, reviewerCount, tokens}`, and no `scope` substring; and WHEN only
  `manifest-1.jsonl` exists THE SYSTEM SHALL print the iteration-1 text with none of those three
  filenames → tests in tests/review/fix-delta-pass.test.js
- **AC-20260909-05-6**: WHEN a fix is applied with a real file edit THE SYSTEM SHALL CONTINUE TO run
  legs `--fix-delta` on a fresh manifest, return to `REVIEWER`, and refuse the third `fix-applied`
  at the cap → tests in tests/review/review-driver-fix-cycle.test.js

## Assumptions (escalation triggers)

- A1 (executed micro-spike, 2026-09-09, git 2.50.1): in a scratch repo with `a.txt` committed, then
  `a.txt` modified and `n.txt` untracked, `GIT_INDEX_FILE=.git/spk-index git add -A . && git
  write-tree` produced tree `7a5e391e…`; `git diff --name-only <clean-tree> 7a5e391e…` printed
  `a.txt` and `n.txt`; `git status --short` afterwards still read ` M a.txt` / `?? n.txt`; the
  clean-tree snapshot equalled `HEAD^{tree}` (`08585692…`); `git stash create` diffed against HEAD
  listed `a.txt` only — **if false:** on a host git older than the spike's, fall back to
  `git stash create` plus `git ls-files --others --exclude-standard` unioned; record in Decisions.
- A2: the existing fix-cycle fixture (tests/review/review-driver.fixtures.js) marks `fix-applied`
  without editing any file — **if false** (it already edits one): AC-6's fixture change is a no-op.
- A3: `.gitignore`d files are excluded by `git add -A` and so never appear in a delta — a worker
  writing only into an ignored path (e.g. `.claude/spec-runs.stopped.jsonl`) reads as "nothing
  changed" — **if false:** none; this is the intended reading, recorded here so the refusal text
  is not mistaken for a driver bug.

## Rationale

Spec 04 stops softs from re-entering the loop; this spec stops the loop's second pass from being
a first pass again. Today the iteration-2 reviewer receives the same base and the same
whole-range instruction, and only the deterministic legs know it is a fix-delta run. The reviewer
doctrine's own "the range is what you were handed" rule is the lever: hand it the fix's file list
and the rule does the narrowing, no new reviewer logic needed.

The snapshot mechanism was chosen over asking workers to commit (a review-time commit changes
the close-commit sequence and the merge-back range) and over `git stash create` (blind to
untracked files, which is exactly what a new test file is). The empty-delta refusal is the cheap
half of the win: a worker that returned without writing used to cost a full legs run and a
reviewer dispatch before anyone noticed.

Not done here: matching prior survivors to new ones by identity. The reviewer re-verifies by
reading the prior return; the driver does not enforce that every fix-routed ref reappears. A
claim-text match is fragile and a location match moves under edits; if escape rows ever show a
fix-routed finding silently dropped on the second pass, that is the trigger to build it.

Deviations folded at close (one-offs; the recurring shape went to pipeline rules § Gotchas as
the collision entry's seventh trigger):

- D1's `git add -A .` is carried with a negative pathspec excluding the sidecar, which D1's text
  does not spell. Without it every sidecar write the driver makes between two snapshots
  (reviewer/disposer returns, review-state.json, the scratch index's own lock file) lands in the
  fix's delta and AC-20260909-05-2's exact two-line delta is unreachable — load-bearing, not a
  convenience.
- Incident, caught in this spec's own review run and fixed in the same session: on a host whose
  `.gitignore` already covers the review sidecar (this repo's `specs/**/*.review/` line), that
  negative pathspec names an ignored path and `git add` refuses the whole command — the snapshot
  died and no mark could land, which would have blocked every review in such a repo. The
  exclusion is now carried only when `git check-ignore` says the sidecar is not already ignored
  (redundant when it is, since `add -A` skips it anyway), with a behavioral pin in
  tests/review/fix-delta-pass.test.js observed red against the unguarded code.
- D6's prose pushed `/spec:review` past its 340-line read-load budget and D1–D4/D9 pushed the
  driver and six test files past the size ratchet. The command file's two Input paragraphs were
  merged and the fix-delta bullet condensed rather than raising the read-load cap; the ratchet
  took its sanctioned reconcile, which is what D10 then put in the File Plan.

## Canonical Delta

docs/canonical/review.md, the stepped-program paragraph: add "the driver snapshots the tree at
each `reviewer-returned` (scratch-index write-tree, untracked files included) and at
`fix-applied` writes `<sidecar>/fix-delta-<n>.txt`, refusing a fix that changed no file before
any legs run; the iteration-≥2 REVIEWER step is the fix-delta pass and hands the reviewer that
list plus the prior reviewer and disposer returns — the reviewer re-verifies fix-routed findings
and reports only inside the listed files." (specs/20260909/05-fix-delta-reviewer-pass.md)
