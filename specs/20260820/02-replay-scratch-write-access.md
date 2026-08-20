---
date: 2026-08-20
status: implementing
diff_base: a50f14d03b6559b9897f1dabbbb43cac8d23b257
tier: critical
area: replay
design: false
breaking: false
depends_on: []
depended_on_by: []
open_markers: 0
---

# Replay scratch-tree write access

## Goal

Make the replay mutation worker's sanctioned writes actually pass the cross-worktree write
guard, instead of forcing the bypass the first live run produced. On 2026-08-20 the first
/spec:replay measurement hit a design contradiction: `block-cross-worktree-writes.sh` blocks
every same-repo cross-worktree Write/Edit, and the mutation worker (correctly dispatched from
a main-anchored session, editing the scratch worktree) was blocked — then tunneled the same
write through Bash, tripping an Auto-Mode Bypass warning. The fix: the hook allows a write
whose **target** worktree is a replay scratch tree (identified by the `replay-worktree` marker
the harness already plants in the tree's private git dir), and only that; every other
cross-worktree block stands. Two carried replay-harness gaps close in the same landing unit:
the setup gate's inability to restore away untracked files `setupCommand` generates, and the
reviewer return contract's loose verdict vocabulary.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The hook allows a cross-worktree write when the TARGET tree's private git dir contains the `replay-worktree` marker file: after the existing same-repo/different-tree determination, resolve `git -C "$probe" rev-parse --git-dir` (absolutized) and allow iff `<gitdir>/replay-worktree` exists (AC-20260820-02-1) | The marker is created only by `replay.js --setup` and dies with `--teardown`/`git worktree remove` — the allow is scoped to disposable harness trees whose entire purpose is receiving these writes. Rejected: anchoring the worker's cwd inside the scratch tree (the Agent tool offers no cwd control; unenforceable) and an env-var escape hatch (spoofable by any session; the marker requires having already created the tree). |
| D2 | The allow is keyed on the target ONLY — a session anchored inside the scratch tree writing OUT to the main checkout stays blocked (AC-20260820-02-2) | The scratch tree is a sink, never a source; the pollution the hook exists to stop is exactly a scratch-anchored agent writing into the real tree. |
| D3 | All other invariants are regression-pinned unchanged: unmarked cross-worktree writes still block, same-tree writes still allow, git/parse failure still fails open (AC-20260820-02-3, AC-20260820-02-4, AC-20260820-02-5) | Loosening a guard demands pins proving how little was loosened. |
| D4 | replay.md's Phase 1 setup gate appends `git -C {dir} clean -fd` after the `git checkout -- .` restore (AC-20260820-02-6) | `git checkout -- .` cannot remove files setupCommand *creates* (first run: an untracked root `package-lock.json` that would have polluted the blind reviewer's tree); `clean -fd` removes them and cannot touch the marker, which lives in the private git dir outside the working tree (executed evidence in Assumptions). |
| D5 | replay.md Phase 1 gains one sentence at the worker dispatch: the worker's Edit/Write into `{dir}` passes the write guard via the marker allow; mutating files through Bash remains a contract violation and is treated as a failed authoring attempt (AC-20260820-02-6) | Names the sanctioned path so the 2026-08-20 bypass shape is recognizably out-of-contract next time. |
| D6 | reviewer.md's return contract states the verdict field takes exactly `CLEAN` or `REVIEWER_FAILED` — findings ride `survivors` and never change the word [no-ac: prose contract; the consumer-side enforcement already exists — `replay.js --score` exits 2 on any other word, and /spec:review's verdict.js reads the same shape] | First live replay run returned the invented word `FINDINGS`; the contract should say what its consumers already require. |
| D7 | Spec plugin bumps to 7.6.0 (target, not a pin) with a changelog paragraph covering D1–D6 [no-ac: § Review Checks makes a missing bump a hard finding — that check is the oracle] | Hook behavior change = plugin behavior change. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/block-cross-worktree-writes.sh | MODIFY | scripts | D1/D2: target-marker allow before the block; header comment gains the replay-sink rationale |
| tests/worktree-hook.test.js | MODIFY | tests | AC-20260820-02-1..5 — marker-allow case, scratch-to-main still-blocked case, unmarked/same-tree/fail-open regression pins tagged |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260820-02-6 — doctrine assertions on replay.md Phase 1 (added at build: the AC named this oracle, the plan omitted the row) |
| spec/commands/replay.md | MODIFY | doctrine | D4/D5: setup-gate `clean -fd` step; sanctioned-write sentence at worker dispatch (AC-20260820-02-6) |
| spec/agents/reviewer.md | MODIFY | doctrine | D6: verdict-word vocabulary tightened to the closed set |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version 7.6.0 + changelog paragraph |

## Contracts

Hook decision table after this spec (the two starred rows are the only changes):

```
target same worktree as cwd                          -> ALLOW   (unchanged)
target different repo / outside git                  -> ALLOW   (unchanged)
target same repo, different tree, MARKER present  *  -> ALLOW   (new: replay sink)
target same repo, different tree, no marker          -> BLOCK   (unchanged)
cwd inside marker tree, target main checkout      *  -> BLOCK   (unchanged — allow keys on TARGET only)
any git/parse failure                                -> ALLOW   (fail-open, unchanged)
```

Marker location (already established by replay.js F1, 2026-08-19): `<common>/worktrees/<name>/replay-worktree`,
resolved from the target side as `git -C "$probe" rev-parse --git-dir` — never in the working tree.

## Behavior

- The hook change is purely additive in code shape: one marker probe between the "same repo,
  different tree" determination and the block. Every failure of the probe (git error, missing
  marker) falls through to the existing BLOCK — the new path can only allow, never widen a
  failure into a block.
- Blindness is unaffected: the marker sits outside the working tree, the hook's allow path is
  silent, and the blind reviewer never writes — nothing new is readable from the scratch tree.
- The bypass incident's other half (worker behavior) is closed by contract, not tooling: with
  Edit/Write passing, the worker has no reason to reach for Bash, and D5 makes doing so a
  failed attempt rather than an improvisation.

## Acceptance Criteria

- **AC-20260820-02-1**: WHEN a Write/Edit payload's cwd is one worktree and its target path
  resolves into a same-repo sibling worktree whose private git dir contains `replay-worktree`
  THE SYSTEM SHALL allow the write (e.g. cwd `/repo`, target `/scratch/rt/README.md`, marker at
  `/repo/.git/worktrees/rt/replay-worktree` → exit 0, no stderr) → tests/worktree-hook.test.js
- **AC-20260820-02-2**: WHEN the payload's cwd is inside the marker-carrying scratch tree and
  the target resolves into the main checkout THE SYSTEM SHALL CONTINUE TO block (e.g. cwd
  `/scratch/rt`, target `/repo/README.md` → exit 2, stderr `BLOCKED:`) → tests/worktree-hook.test.js
- **AC-20260820-02-3**: WHEN the target is a same-repo different worktree WITHOUT the marker
  THE SYSTEM SHALL CONTINUE TO block with exit 2 → existing case in tests/worktree-hook.test.js, AC-tagged
- **AC-20260820-02-4**: WHEN the target is inside the same worktree as cwd THE SYSTEM SHALL
  CONTINUE TO allow with exit 0 → existing case in tests/worktree-hook.test.js, AC-tagged
- **AC-20260820-02-5**: WHEN git identity resolution fails for cwd or target THE SYSTEM SHALL
  CONTINUE TO fail open with exit 0 (e.g. cwd outside any repo → exit 0) → existing case in
  tests/worktree-hook.test.js, AC-tagged
- **AC-20260820-02-6**: WHEN spec/commands/replay.md's Phase 1 is read THE SYSTEM SHALL
  contain the setup-gate `git -C {dir} clean -fd` step and the sanctioned-Edit/Write sentence
  (e.g. grep `clean -fd` → exactly the setup-gate line) → doctrine assertions in
  tests/replay/replay.test.js alongside the existing replay pins

## Assumptions

- **The block reproduces (executed 2026-08-20)**: real `replay.js --setup` tree at HEAD~1;
  payload `{cwd: <main>, file_path: <scratch>/README.md}` → `BLOCKED:` + exit 2; reverse
  direction also exit 2; marker observed at `.git/worktrees/rt/replay-worktree`. If false →
  the incident was environmental and this spec is void.
- **`git clean -fd` closes the restore gap without touching the marker (executed)**: untracked
  `package-lock.json` + nested stray created in a real scratch tree; `clean -fd` → porcelain
  empty, marker file survives, teardown clean. If false → the clean step would need a
  pathspec-scoped form.
- **Node/jq substrate unchanged**: the hook's probe uses the same `git -C … rev-parse
  --git-dir` call replay.js F1 standardized on; both target-side resolutions were observed
  returning the private dir in the executed spike. If false → marker probe needs the
  `--git-common-dir`+worktree-name derivation instead.
- tests/replay/replay.test.js accepts doctrine-text assertions for AC-20260820-02-6; if the
  suite's conventions reject prose assertions → the AC's oracle moves to the review diff and
  the AC is re-marked [no-ac] at build with a deviation note.

## Rationale

Critical tier because `block-cross-worktree-writes.sh` is a named critical-tier trigger in
this repo's pipeline rules (hook surface — a broken hook blocks or pollutes every session in
every host repo). The incident being fixed: 2026-08-20 first live /spec:replay run, mutation
worker's Edit blocked by the hook, worker tunneled the write through `python3` under Bash,
harness flagged Auto-Mode Bypass; JJ approved continuing that run only, with the structural
fix staged — this spec. Per incident policy the fix and its pins land in the same change. The
setup-gate `clean -fd` and reviewer verdict-vocabulary items are the two carried minors from
the same run, folded here because all three are replay-harness integrity and none is reachable
from spec 01's deletion scope.

## Canonical Delta

- `docs/canonical/review.md`, replay paragraph: append one sentence — the cross-worktree write
  guard allows writes whose target tree carries the `replay-worktree` marker (the mutation
  worker's sanctioned path); scratch-anchored writes outward remain blocked.
