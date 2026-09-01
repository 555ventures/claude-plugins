---
date: 2026-08-31
status: implementing
open_markers: 0
diff_base: 86390013d547a3f932c8e75668265e7fd4b3bc0b
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-31
---

# Replay Range Materialization — the baseline worktree honors the judged range's true upper bound

## Goal

Replay's baseline worktree stands at the close commit's parent (F3), but the range-identity
spec (20260824/06 D3/D7) defines a `diff.dirty:true` review row's judged range as *completed
by the close commit that follows it* — fix-worker edits uncommitted at pass time ride that
commit. For those rows (12 of 17 recent flagged CLEAN rows here, 5 of 6 in upwell) the
baseline tree is below the judged range: legs green over the close-commit tree go red at the
parent, and replay.md step 7 rung 3 (newly-red → retry once → still red) records a **false
`leg-caught`**, polluting the catch-rate — one of the pipeline's two ground-truth signals
(the live upwell incident, rv_128f1a459e42 / rp_d4b6fcf66c93). Done means: `--setup`
materializes the close commit's tree in the worktree with review-outcome surfaces surgically
held at the parent (blindness preserved), step 7 verifies a still-red leg against the
pristine baseline before ever recording `leg-caught`, and dirty closes stay first-class
replay targets — neither refused at close (that would reverse 20260824/06 D3, pinned by
AC-20260824-06-6) nor made select-ineligible (that would starve ~70% of the candidate pool).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--setup` gains `--overlay <closeSha>` (paired with the existing `--commit <parentSha>`): after `git worktree add --detach` at `--commit`, derive `git diff --name-status --no-renames <commit> <overlay>` and, for every row whose path does NOT open with a D2 meta prefix, materialize the overlay side — `A`/`M` via `git checkout <overlay> -- <path>`, `D` via `git rm` — then commit once with the D5 subject; zero non-meta rows → no commit, HEAD stays at `--commit`. The printed line appends ` overlay=<sha> overlaid=<N>` after the existing tokens (AC-20260831-01-1, AC-20260831-01-2, AC-20260831-01-3) | The judged range's upper bound is the close commit (20260824/06 D3/D7); executed spike 2026-08-31 confirmed the checkout/rm/commit sequence reproduces exactly the filtered delta with clean status. Rejected: standing the worktree AT the close commit — its subject (`review(NN): CLEAN`), the status flip, the ledger row, and the canonical delta all leak "already reviewed" to the blind reviewer |
| D2 | The meta prefix set is the literal repo-relative prefixes `specs/`, `.claude/`, `docs/canonical/` — the three surfaces where a close commit records the review's outcome (status flip + Decision amendments + retained sidecar; ledger + evidence + rules/agent-memory; canonical delta citing the spec). Overlay rows under them are never materialized (AC-20260831-01-2) | Every inspected dirty close commit's meta content lives under exactly these three (7a39f07, d19a52b, c7d8af1, 42be1a4, and upwell's defective row); the compact set errs toward blindness — a meta-classified path that ever carries real fix content shows up as baseline divergence, which D6's pristine rung now catches instead of silently misrecording |
| D3 | The overlay applies uniformly to every selected row — no `diff.dirty` branch, `--select` untouched (it already prints `commit=` and `parent=`) (AC-20260831-01-3) | A clean-at-pass close commit is meta-only, so the uniform rule degenerates to today's behavior by construction (the AC's zero-row case); one code path, no row-shape sniffing, and 20260824/06 D9's "replay --select untouched" stays true |
| D4 | `--overlay` must resolve to a commit and be a descendant of `--commit` (`git merge-base --is-ancestor <commit> <overlay>`); equal shas are refused too — else exit 4 naming the remedy (re-run `--select` and pass its printed pair) (AC-20260831-01-4) | Mirrors `--select`'s own ancestor validation; a swapped or stale pair would silently materialize a reversed or unrelated delta |
| D5 | `--setup` gains optional `--subject` for the overlay commit, default `build: follow-up`; refused with exit 2 when it opens with `replay` (case-insensitive) — the class-id half of `--apply`'s F2 refusal does not apply because no class exists at setup time (AC-20260831-01-5) | Same blindness invariant, narrower check by construction; replay.md passes the same build-shaped subject it already derives for `--apply`, so the overlay commit is indistinguishable from a real build commit |
| D6 | replay.md Phase 1 step 7 rung 3 gains a pristine-baseline verification before `leg-caught`: when a newly-red leg is STILL red after the one re-authoring retry, run `git -C {dir} reset --hard HEAD^` (drops exactly the mutation commit; the overlay commit — or the parent when no overlay commit exists — remains), re-run review-legs with a fresh manifest, and: red on the pristine tree → NOT mutation-caused — route to rung 4's question seam with both manifests as evidence; green on the pristine tree → `leg-caught` stands, recorded as today (AC-20260831-01-7) | A false `leg-caught` censors the reviewer measurement and falsely resets the due window (the exact upwell damage); the extra leg run costs only the rare still-red path, not every replay — the blanket re-run 20260823/09 rejected. Executed spike 2026-08-31: reset drops only the mutation commit, keeps the marker, leaves status clean. Rejected: auto-explaining a pristine-red without asking — divergence after the overlay fix means environment drift, and silently proceeding would misattribute it |
| D7 | `--setup` without `--overlay` is byte-identical to today (manual fallback and any older caller); replay.md's own invocation always passes `--overlay {commit}` (AC-20260831-01-6) | The flag is additive; the doctrine, not the script, owns when the overlay is mandatory — same split as `--apply`'s subject derivation |
| D8 | Append amendment notes to the two done specs whose locked prose this supersedes: specs/20260819/02 (F3/D3's "worktree stands at the parent" is completed by the overlay — the judged range ends at the close commit) and specs/20260823/09 (the step-7 ladder gains the pristine-verification rung between rung 3's retry and `leg-caught`) [no-ac: provenance prose in done specs, the 20260819/02 "Amended 2026-08-31" precedent] | A cold reader of either spec would otherwise re-derive the parent rule as still authoritative |
| D9 | `spec/.claude-plugin/plugin.json` bumps to 7.46.0 (target, not pin — next free version at build time per Gotchas) with the description changelog updated [no-ac: version-bump discipline is review's own hard check] | Behavior change in a shipped script + command doctrine |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | MODIFY | scripts | D1–D5, D7: `--overlay`/`--subject` on `--setup`, overlay algorithm, descendant validation, subject refusal; F3 comment and header (usage line, Exit codes) updated to the range-materialization rule |
| spec/commands/replay.md | MODIFY | doctrine | D6, D7: Phase 1 step 1 passes `--overlay {commit}` and explains the materialized range; step 7 pristine-verification rung; Rules § Blindness notes the meta prefixes never enter the tree |
| specs/20260819/02-mutation-replay.md | MODIFY | doctrine | D8: amendment note under the existing 2026-08-31 amendment block |
| specs/20260823/09-replay-baseline-attribution.md | MODIFY | doctrine | D8: amendment note (step-7 ladder gains the pristine rung) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: version 7.46.0 target + description changelog |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260831-01-1 … AC-20260831-01-7 |

## Contracts

`--setup` invocation (replay.md Phase 1 step 1):

```
node "$(spec-paths replay)" --setup --commit {parent} --overlay {commit} --spec {spec} [--subject "{subject}"]
```

Printed line (existing tokens first — the driver-side `dir=` parse is prefix-tolerant —
new tokens appended): `setup dir=<abs path> commit=<parentSha> overlay=<closeSha> overlaid=<N>`
where `N` is the count of materialized non-meta paths (0 → no overlay commit exists).
Without `--overlay` the line is byte-identical to today's two-token form.

Overlay algorithm (D1, inside `--setup` after the marker write):

1. `git diff --name-status --no-renames <commit> <overlay>` (run `-C <dir>`), parse
   `<STATUS>\t<path>` rows; statuses are `A`/`M`/`D` only under `--no-renames`.
2. Drop rows whose `<path>` opens with `specs/`, `.claude/`, or `docs/canonical/`
   (literal string prefix on the repo-relative path).
3. Remaining rows: `A`/`M` → `git checkout <overlay> -- <path>`; `D` → `git rm -q <path>`
   (a close-deleted path cannot be checkout'd from the overlay — pathspec error, spiked).
4. ≥1 row → single `git commit` with the D5 subject; 0 rows → no commit.

Exit codes delta (header list): 2 additionally covers D5's refused `--subject`; 4
additionally covers D4's non-descendant/equal `--overlay`.

## Behavior

Step 7 attribution ladder after this spec, per red leg `L` (rungs 1, 2, 4 unchanged from
20260823/09):

1. `L == reconcile` → explained. 2. `L ∈ baselineRed` → explained.
3. `L ∈ baselineLegs`, not in `baselineRed` → newly red: teardown, fresh `--setup` (same
   `{parent}` + `{commit}` overlay), re-author once, re-run legs. STILL red → **pristine
   verification (D6)**: `git -C {dir} reset --hard HEAD^`, fresh manifest, re-run
   review-legs. `L` green pristine → `leg-caught` (record as today, `--legs red:<L>`).
   `L` red pristine → not mutation-caused: fall through to rung 4's question seam,
   presenting both manifests.
4. Unattributable → the 20260823/09 D5 question seam, unchanged (dismissed →
   `unresolved` via the workflow-refusing `red:<leg>` arm).

The record grammar (`--record` matrix) is untouched: a pristine-red resolved
"pre-existing" by the seam records `baseline-red:<legs>` exactly as an explained rung-2 leg
does; dismissal records `unresolved`.

## Acceptance Criteria

- **AC-20260831-01-1**: WHEN `--setup --commit <parent> --overlay <close>` runs against a
  fixture whose close commit modifies a non-meta file, adds a non-meta file, and deletes a
  non-meta file alongside meta edits THE SYSTEM SHALL materialize exactly the three non-meta
  changes as one commit with the default subject, leaving `git status --porcelain` empty and
  the scratch marker in place, and print ` overlay=<close> overlaid=3` (e.g. close commit =
  {M `lib/a.js`, A `tests/new.test.js`, D `lib/dead.js`, M `specs/01-x.md`, M
  `.claude/spec-runs.jsonl`} → `git diff --name-status <parent> HEAD` in the worktree lists
  exactly `M lib/a.js`, `A tests/new.test.js`, `D lib/dead.js`; `git log -1 --format=%s` →
  `build: follow-up`; teardown still removes the worktree) → tests/replay/replay.test.js
- **AC-20260831-01-2**: WHEN the overlay runs THE SYSTEM SHALL leave every meta-prefix path
  at the `--commit` version: the spec file still reads `status: implementing`, the worktree
  ledger has no close-time row, `docs/canonical/` matches the parent, and a close-added
  `.claude/spec-runs/<id>.json` evidence file is absent → tests/replay/replay.test.js
- **AC-20260831-01-3**: WHEN `--overlay` names a close commit whose non-meta delta is empty
  (meta-only close — the clean-close degenerate case) THE SYSTEM SHALL create no overlay
  commit (worktree HEAD == `--commit`), exit 0, and print ` overlaid=0` →
  tests/replay/replay.test.js
- **AC-20260831-01-4**: WHEN `--overlay` is not a strict descendant of `--commit` (an
  unrelated sha, an ancestor, or the same sha) THE SYSTEM SHALL exit 4 before creating the
  worktree, naming the remedy (re-run `--select` and pass its printed `commit`/`parent`
  pair) → tests/replay/replay.test.js
- **AC-20260831-01-5**: WHEN `--setup … --subject "replay harness check"` is invoked THE
  SYSTEM SHALL refuse with exit 2 naming the constraint; a build-shaped subject (e.g.
  `build(20260830/03): ci leg honest absence`) SHALL be accepted and become the overlay
  commit's subject verbatim → tests/replay/replay.test.js
- **AC-20260831-01-6**: WHEN `--setup` runs without `--overlay` THE SYSTEM SHALL CONTINUE TO
  create the worktree at `--commit` with the marker and the two-token printed line, refusing
  in-repo dirs outside `.claude/worktrees/` exactly as today (existing setup tests retagged
  in place, never duplicated) → tests/replay/replay.test.js
- **AC-20260831-01-7**: WHEN replay.md Phase 1 is read THE SYSTEM SHALL state, in step 1,
  that setup passes `--overlay {commit}` and why (the judged range ends at the close
  commit), and, in step 7 rung 3's own text: the pristine-baseline verification
  (`reset --hard HEAD^`, fresh manifest, re-run legs) between the failed retry and
  `leg-caught`, red-pristine routing to rung 4's seam (prose pin, AC-20260823-09-9 pattern —
  section-scoped grep, never whole-file) → tests/replay/replay.test.js

## Assumptions (escalation triggers)

- A1: The checkout/rm/commit overlay reproduces exactly the filtered close-commit delta.
  **Executed spike 2026-08-31** (scratchpad, deleted): synthetic repo, close commit with
  3 non-meta + 4 meta changes; after overlay, `git diff --name-status parent HEAD` listed
  exactly the 3 non-meta rows, status clean, spec file still `implementing`, ledger 1 line,
  log subjects leak-free; negative control: `git checkout <close> -- <close-deleted path>`
  errors (`pathspec … did not match`), confirming `D` needs `git rm` — **if false:** the
  build's own AC-1 fixture is the same shape and would go red; STOP and re-derive.
- A2: A leg green over the close tree can be red at the bare parent (the defect's
  precondition). **Executed spike 2026-08-31**: `node --test` asserting on a function whose
  fix rode the close commit — GREEN at the close tree, RED at the parent tree — **if false:**
  the Goal's premise collapses; STOP.
- A3: `git reset --hard HEAD^` drops only the mutation commit and preserves the
  private-git-dir marker and clean status. **Executed spike 2026-08-31**: HEAD returned to
  the overlay commit, marker present, status clean — **if false:** D6's rung re-runs legs on
  a corrupted tree; the fresh-manifest legs run would surface it as mass redness; STOP.
- A4: The driver-side parse of `--setup`'s printed line tolerates appended tokens —
  verified by grep 2026-08-31: replay.md/driver parse `dir=` off the line
  (tests/replay/replay.test.js:704 pins that parse), no exhaustive-line pin exists —
  **if false:** update the pin in place per the additive-token precedent (20260823/09 A2).
- A5: The three meta prefixes cover every surface where a close commit records the review's
  outcome. Measured against all four recent dirty close commits here plus upwell's —
  **if false** (a close commit writes outcome prose elsewhere, e.g. a roadmap ADR riding
  the close): that path overlays into the tree — a blindness leak to escalate and add to D2's
  set; divergence in the other direction (meta-classified fix content) is caught by D6's
  pristine rung and lands in the question seam, never a silent misrecord.
- A6: The close commit is single-parent (linear close flow; `--select` already resolves
  `<close>^`) — **if false:** `--select`'s existing rev-parse takes first-parent; the
  overlay derives from the same pair, so both stay consistent; escalate if a merge-shaped
  close ever appears.

## Rationale

Both fixes proposed by the originating feedback were rejected as design reversals, and that
rejection is this spec's frame: refusing dirty closes reverses 20260824/06 D3 (the close row
deliberately precedes the close commit; "reordering the row after the commit" was explicitly
rejected there, and AC-20260824-06-6 pins acceptance), and making `diff.dirty:true` rows
select-ineligible would disqualify the majority of healthy candidates (12/17 recent flagged
CLEAN rows here, 5/6 in upwell) and starve the catch-rate. The defect is replay-side only:
F3 stood the baseline below the judged range that D3/D7 define. The overlay materializes the
range's true upper bound while keeping the three review-outcome surfaces at the parent — the
same blindness F3 bought, bought surgically instead of by truncating the range. The overlay
is committed (not left as working-tree edits) because the reviewer and the reconcile/at-risk
legs read `base..HEAD`; an uncommitted overlay would be visible to gate tests but invisible
to the diff surface — an incoherent tree. Uniformity (D3) over a dirty-only branch: the
degenerate case costs nothing and removes a row-shape dependency. The pristine rung (D6)
exists because the overlay makes the baseline *reproducible*, not *identical* — replay runs
days after the review, and environment drift remains; the rung converts the residual
divergence from a silent false `leg-caught` into a question, at the cost of one leg run on
the rare still-red path (the blanket per-replay re-run stays rejected per 20260823/09).
Fragile to watch: D2's prefix set is a measurement, not a law — A5 names both failure
directions.

Collision-closure (2026-08-31, literals `close commit's parent` / `stands up at the close
commit`): replay.md's hit is the File Plan's own step-1 rewrite. Waived:
tests/replay/replay.test.js's `close commit's parent` hits — they pin `--select`'s printed
`parent=` token (the 2026-08-19 F3 regression pin), and `--select` is deliberately untouched
(D3), so the literal survives correctly on that surface. Waived (executes tier, out of
plan): tests/frontmatter, tests/parse-selection, tests/review/review-driver, and
tests/spec-paths exec replay.js only through surfaces this spec does not change —
`--overlay` is additive and `--setup` without it is pinned byte-identical (AC-20260831-01-6),
so their fixtures cannot observe the change. This repo's own 8 replay rows are all `caught`; no ledger remediation is owed
here, and upwell's row is upwell's to note.

## Canonical Delta

docs/canonical/review.md, replay-harness section: after the sentence describing the scratch
worktree path derivation, append — "The worktree materializes the judged range's true upper
bound: `--setup --commit <parent> --overlay <close>` stands the tree at the close commit's
parent, then re-applies the close commit's non-meta content (everything outside `specs/`,
`.claude/`, `docs/canonical/`) as one build-shaped commit — a `diff.dirty:true` row's
fix-worker edits ride the close commit (range identity, specs/20260824/06), so the parent
alone under-states the range and made legs falsely newly-red. Before `leg-caught` is ever
recorded, step 7 now verifies the still-red leg against the pristine (mutation-free)
baseline via `reset --hard HEAD^` plus a fresh leg run — red there means not
mutation-caused and routes to the attribution question seam instead.
(specs/20260831/01-replay-range-materialization.md)"
