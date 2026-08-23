---
date: 2026-08-23
status: hardened
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# Review-close hardening: frontmatter comments, merge re-entrancy, agent-memory scope

## Goal

Fix the three pipeline defects surfaced at the 2026-08-23 close of specs/20260823/01
(rv_6825fa48c98d): (1) frontmatter values with inline `#` comments flow verbatim into the run
ledger and every git consumer — one shared reader that strips them per YAML unquoted-scalar
semantics ends the class; (2) the review driver's merge step is not re-entrant — a retry after a
mid-promotion failure deadlocks on its own promoted evidence, and the promotion step itself
guarantees the cleanup failure by deleting a tracked file in the worktree; (3)
`.claude/agent-memory/**` is structurally out-of-plan on every worker-dispatching build. Done
means: a commented `tier:`/`build_base:` line parses clean everywhere, a wedged merge retry
completes instead of dying, and worker memories never raise an out-of-plan finding again.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | CREATE `spec/scripts/lib/frontmatter.js` — the sole frontmatter derivation: `fmBlock(text)`, `fmValue(text, key)`, `fmMap(text)`; unquoted values are cut at the first whitespace-preceded `#`, quoted values unwrap and never strip (AC-20260823-04-1, AC-20260823-04-2, AC-20260823-04-3) | Strip-at-source per YAML semantics heals every consumer at once; rejected: refusing commented lines (breaks existing files loudly for a habit YAML itself tolerates) — full story in Rationale |
| D2 | Route all four JS frontmatter readers — spec-review-driver.js, spec-design-driver.js, spec-status.js, replay.js — through lib/frontmatter.js; delete their local regex copies (AC-20260823-04-4, AC-20260823-04-10) | Sole-derivation discipline: four independent copies of the same regex is how the class recurred; spec-state-gate.sh's awk `$2` read is already comment-immune and stays |
| D3 | Correct the `[plugin]` frontmatter Gotcha in `.claude/rules/spec-pipeline.md`: a `tier:` note is NOT harmless — it corrupts the ledger row's tier field, which fleet-reader then excludes under the misleading reason `pre-v7-tier`; note the class is now closed by lib/frontmatter.js `[no-ac: prose correction in the host rules file; nothing pins that text — grepped tests/ 2026-08-23, zero hits]` | The entry's "harmless" claim is false at the ledger boundary and teaches the wrong risk model |
| D4 | `handleMergeStrategy` becomes re-entrant: when the source branch is already fully contained in the target (`git rev-list --count target..source` = 0, or the branch is already deleted), skip the `merge-back.sh merge` invocation and proceed straight to `finishMerge`; the first-merge path and `assert_clean_root` are untouched (AC-20260823-04-5, AC-20260823-04-8) | Promotion dirties the main root BY DESIGN (evidence is committed later, at the session's close), so a retry must never re-run the clean-root assert once the merge has landed |
| D5 | `promoteEvidenceAndClean` restores tracked worktree copies instead of deleting them: per promoted path, if tracked in the worktree (`git -C <wt> ls-files --error-unmatch <path>` exits 0) → `git -C <wt> checkout -- <path>` after promoting the delta; untracked → `fs.rmSync` as today (AC-20260823-04-6) | Deleting a tracked file guarantees `git worktree remove` refuses (spiked: exit 128), which is what set up the retry deadlock; restore leaves the worktree genuinely clean |
| D6 | Add `.claude/agent-memory/**` to `BASELINE_GLOBS` in `spec/scripts/lib/glob-match.js`; fix the stale header comment naming hotspot.js as a consumer (actual: scope-reconcile.js, collision-closure.js) (AC-20260823-04-7, AC-20260823-04-9) | No File Plan can enumerate the memories a worker will write; review CLOSE's per-file content disposal is strictly stronger than a path flag (Fable consult, JJ accepted 2026-08-23); rejected: host-config `pipelineOwnedPaths` (the class is universal, not host-specific) |
| D7 | Bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.22.0 — a target, not a pin, per the host semver-race gotcha) with the description changelog entry `[no-ac: the version-bump obligation is enforced by review's hard check, not a test]` | Behavior change across review, status, replay, and scope surfaces |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/frontmatter.js | CREATE | scripts | Sole frontmatter derivation: `fmBlock`/`fmValue`/`fmMap` with YAML-style inline-comment stripping (D1); header documents the rv_6825fa48c98d + rv_e83659d49386 incidents |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | Replace local `fmVal` with lib/frontmatter (D2); already-landed skip in `handleMergeStrategy` (D4); tracked-restore in `promoteEvidenceAndClean` (D5) |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | Replace local `fmVal` with lib/frontmatter (D2) |
| spec/scripts/spec-status.js | MODIFY | scripts | Replace the per-line frontmatter kv loop with lib/frontmatter's `fmMap` (D2) |
| spec/scripts/replay.js | MODIFY | scripts | Replace the per-line frontmatter kv loop with lib/frontmatter's `fmMap` (D2) |
| spec/scripts/lib/glob-match.js | MODIFY | scripts | `BASELINE_GLOBS` gains `.claude/agent-memory/**`; header consumer list corrected (D6) |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | Rewrite the frontmatter Gotcha entry per D3 — tier corruption is real at the ledger boundary; class closed by lib/frontmatter.js |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump + changelog description (D7) |
| tests/frontmatter/frontmatter.test.js | CREATE | tests | AC-20260823-04-1, AC-20260823-04-2, AC-20260823-04-3, AC-20260823-04-4, AC-20260823-04-10 |
| tests/review/merge-reentry.test.js | CREATE | tests | AC-20260823-04-5, AC-20260823-04-6, AC-20260823-04-8 |
| tests/scope-reconcile-glob-rows.test.js | MODIFY | tests | AC-20260823-04-7, AC-20260823-04-9 |

## Contracts

```js
// spec/scripts/lib/frontmatter.js — the sole frontmatter reader (library, no exit codes)
fmBlock(text)        // -> the raw frontmatter block between the leading '---' fences, '' when absent
fmValue(text, key)   // -> the scalar for `key`, '' when absent; accepts full text or a raw block
fmMap(text)          // -> { key: value } for every top-level `^[A-Za-z_]+:` line, same stripping
// Stripping rule (all three): a value quoted with matching ' or " unwraps verbatim (never
// stripped); an unquoted value is cut at the FIRST `#` preceded by whitespace, then trimmed.
// `#` with no preceding whitespace is content, not a comment.
module.exports = { fmBlock, fmValue, fmMap }
```

`merge-back.sh` is deliberately untouched: its exit-code alphabet (3 = conflicts, 4 = CWD
refusal) and `assert_clean_root` are load-bearing and unchanged; both driver-side fixes (D4, D5)
change only when and how the driver invokes it.

## Behavior

The recorded deadlock chain this spec breaks (2026-08-23, rv_6825fa48c98d): the merge landed →
`finishMerge` promoted evidence into the main root (dirtying it by design) and deleted the
worktree's tracked ledger copy (dirtying the worktree) → `git worktree remove` refused → the
driver died mid-`finishMerge` → the retry re-entered `handleMergeStrategy`, re-ran
`merge-back.sh merge`, and died on `assert_clean_root` against its own promoted evidence — a
permanent wedge at MERGE with no recorded mark. After D4+D5: the promotion leaves the worktree
clean (restore, not delete), and any retry detects the landed merge and resumes at promotion/
cleanup, which are already idempotent (ledger dedup by exact line, evidence copy by filename,
sidecar relocation early-returns once outside the worktree).

Order-sensitive detail for D4: resolve the source branch first; if the branch no longer exists,
treat the merge as landed (cleanup already tolerates a gone worktree and a gone branch). If it
exists, `rev-list --count target..source` = 0 → landed; > 0 → first-merge path, unchanged.

## Acceptance Criteria

- **AC-20260823-04-1**: WHEN `fmValue` reads a key whose unquoted value carries a
  whitespace-preceded inline comment THE SYSTEM SHALL return only the value (literal:
  `tier: critical           # touches spec/bin/spec-paths (key-set edit)` → `critical`) →
  test in tests/frontmatter/frontmatter.test.js
- **AC-20260823-04-2**: WHEN the value is quoted THE SYSTEM SHALL return the quoted content
  verbatim, `#` included (literal: `area: "notes # misc"` → `notes # misc`) → test in
  tests/frontmatter/frontmatter.test.js
- **AC-20260823-04-3**: WHEN an unquoted value contains `#` with no whitespace before it THE
  SYSTEM SHALL return the value whole (literal:
  `design_source: https://claude.ai/design/p/x#frag` → `https://claude.ai/design/p/x#frag`) →
  test in tests/frontmatter/frontmatter.test.js
- **AC-20260823-04-4**: WHEN the review driver reads a spec whose `build_base:` line carries a
  trailing inline comment THE SYSTEM SHALL resolve the same base as the comment-free form and
  proceed past base derivation (literal: `build_base: <sha>   # set by enter-worktree` derives
  `<sha>`; no `fatal: invalid object name`) → test in tests/frontmatter/frontmatter.test.js
  (exec spec-review-driver.js against a synthetic host repo)
- **AC-20260823-04-5**: WHEN `--mark merge-strategy` re-runs after the source branch is fully
  contained in the target THE SYSTEM SHALL skip the merge invocation and proceed to evidence
  promotion and cleanup even when the main root carries uncommitted promoted evidence (literal:
  `git rev-list --count main..spec/x` = `0` + a dirty root → no `root working tree is dirty`
  death, driver reaches its REPLAY/DONE tail) → test in tests/review/merge-reentry.test.js
- **AC-20260823-04-6**: WHEN evidence promotion clears a worktree copy whose path is tracked in
  the worktree with uncommitted appended rows THE SYSTEM SHALL restore it to the worktree's HEAD
  content instead of deleting it (literal: tracked `.claude/spec-runs.jsonl` with one appended
  row → after promotion `git -C <wt> status --porcelain` is empty and `git worktree remove <wt>`
  exits 0 without `--force`) → test in tests/review/merge-reentry.test.js
- **AC-20260823-04-7**: WHEN the changed set contains a file under `.claude/agent-memory/`
  absent from the File Plan THE SYSTEM SHALL report it excluded, not out-of-plan (literal:
  changed `.claude/agent-memory/gate-scripts/x.md` → `outOfPlan: []`, the path listed in
  `excluded`) → test in tests/scope-reconcile-glob-rows.test.js
- **AC-20260823-04-8**: WHEN the merge has not yet landed and the main root is dirty THE SYSTEM
  SHALL CONTINUE TO refuse the first merge with the dirty-root remedy (literal:
  `git rev-list --count main..spec/x` ≥ 1 + a dirty root → `root working tree is dirty — commit
  or stash before merge-back`) → test in tests/review/merge-reentry.test.js
- **AC-20260823-04-9**: WHEN the changed set contains an unplanned file outside every exclusion
  THE SYSTEM SHALL CONTINUE TO report it out-of-plan (literal: changed `src/stray.js` not in the
  File Plan → `outOfPlan: ["src/stray.js"]`) `[pre-green: predicate-in-test]` — the existing
  covering assertions in tests/scope-reconcile-glob-rows.test.js are retagged, never duplicated
- **AC-20260823-04-10**: WHEN any of the four frontmatter-reading scripts parses spec
  frontmatter THE SYSTEM SHALL do it through lib/frontmatter.js (literal: each of
  spec-review-driver.js, spec-design-driver.js, spec-status.js, replay.js contains
  `require('./lib/frontmatter')` and no surviving local `^' + k + ':\\s*(.+)$'` construction) →
  test in tests/frontmatter/frontmatter.test.js

## Assumptions (escalation triggers)

- A1: `git worktree remove` refuses when a tracked file is deleted uncommitted in the worktree,
  and succeeds after `git checkout -- <path>` restores it — **executed 2026-08-23**: scratch
  repo, delete tracked `ledger.jsonl` in worktree → `git worktree remove` exit 128 `contains
  modified or untracked files, use --force`; after `git -C wt checkout -- ledger.jsonl` →
  exit 0. **if false:** D5's restore is insufficient — STOP, re-derive the clean condition.
- A2: after a landed merge, `git rev-list --count target..source` prints `0` and
  `git merge-base --is-ancestor source HEAD` exits 0, both unaffected by a dirty working tree —
  **executed 2026-08-23**: post-`merge --no-ff` scratch repo, count = 0, is-ancestor exit 0
  (reverse direction exit 1), unchanged with an untracked file present. **if false:** detect via
  `merge-base --is-ancestor` alone; if neither is reliable, STOP.
- A3: `.claude/spec-runs.jsonl` may be tracked or untracked depending on the host — D5 decides
  per path via `git ls-files --error-unmatch`. **if false** (always tracked): the untracked arm
  is dead code but harmless.
- A4: nothing pins the retired local `fmVal` regexes or the Gotcha's "harmless" sentence —
  grepped `tests/` 2026-08-23, zero hits for both. **if false:** update the pin in place and
  retag with this spec's AC-ID, never weaken.
- A5: the corrupted historical ledger row (the 20260823/01 close row whose tier field carries
  the comment text) stays append-only and uncorrected; fleet-reader already excludes it
  (`pre-v7-tier` reason). **if that label misleads later fleet analysis:** separate
  fleet-reader labeling work — out of scope here.
- A6: concurrent sessions race the plugin semver — the build bumps to the next free minor and
  records the deviation (standing host gotcha). **if 7.22.0 is taken:** bump to the next free
  minor, same changelog paragraph.

## Rationale

All three defects surfaced at one review close (rv_6825fa48c98d, 2026-08-23; waive reasoning for
the agent-memory instance recorded in specs/20260823/01's Rationale). Strip-not-reject (D1):
stripping matches what a YAML parser would do, silently heals the two recorded incidents
(rv_e83659d49386's blocked review; this close's corrupted ledger row), and breaks nothing
well-formed; rejection would fail existing hosts loudly over a habit the format itself permits.
The conservative reading also favors strip — tolerance is additive and reversible, refusal is
not. One spec, not three: each fix is small, all land green independently but share the review
area, and the whole plan fits one build. No tier-enum validation added to verdict.js: the
corruption is healed at its sole source, and verdict.js is the highest-blast-radius file in the
repo — widening its contract for a closed route fails the fix-admission bar. D6 goes in
`BASELINE_GLOBS`, not host config, because the class is structural to every host that dispatches
workers (Fable consult, JJ accepted 2026-08-23). Known consequence: collision-closure's repo
walk now also prunes memory files, so a stale literal inside a worker memory is no longer swept
— acceptable because review CLOSE disposes every touched memory per-file on content. Fragile to
watch: D5 touches the promotion path that runs exactly once per worktree review — the test must
build the full synthetic worktree-review state rather than assert on prose.

Collision waive, 2026-08-23 (lock sweep, `is harmless` / `only compared to`): the only hits
outside this spec's File Plan are copies of `.claude/rules/spec-pipeline.md` (and an unrelated
2026-08-10 spec) inside two live sibling build worktrees (`spec-02-init-gen-input-hardening`,
`spec-03-silent-drop-hardening`). Waived: sibling worktrees are owned by their own sessions and
never edited cross-tree; their merges inherit or trivially conflict with D3's corrected entry.

## Canonical Delta

docs/canonical/review.md — merge-back section: add that the driver's merge step is re-entrant
(a retry after a landed merge skips `merge-back.sh merge` and resumes at promotion/cleanup,
which are idempotent); evidence promotion restores tracked worktree copies to HEAD rather than
deleting them, so `git worktree remove` runs without `--force`; `.claude/agent-memory/**` is
pipeline-excluded from scope reconciliation — worker memories are adjudicated at CLOSE per-file,
never as out-of-plan findings.

docs/canonical/pipeline.md — grounding section: spec frontmatter is read through
`spec/scripts/lib/frontmatter.js` (the sole derivation); inline `#` comments on key lines are
stripped per YAML unquoted-scalar semantics, so a trailing note on `tier:` or `build_base:` is
cosmetic, not corrupting.
