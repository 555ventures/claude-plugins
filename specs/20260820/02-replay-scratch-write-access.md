---
date: 2026-08-20
status: done
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
| D1 | The hook allows a cross-worktree write when the TARGET tree's private git dir contains the `replay-worktree` marker file AND that git dir has a `/worktrees/` segment (i.e. it is a linked worktree's private dir, never the main checkout's top-level `.git`): after the existing same-repo/different-tree determination, resolve `git -C "$probe" rev-parse --git-dir` (absolutized) and allow iff `<gitdir>/replay-worktree` exists and `<gitdir>` matches that shape (AC-20260820-02-1, AC-20260820-02-9) | **Amended 2026-08-20**: the marker is created only by `replay.js --setup` and dies with `--teardown`/`git worktree remove`, but the original rationale's claim that "the marker requires having already created the tree" was false — the target-worktree resolution this allow sits behind was already fail-open on any path inside a repo's `.git` (`rev-parse --show-toplevel` exits 128 there, and the surrounding `[ -n "$tgt_top" ] \|\| exit 0` turns that into an unconditional allow), so planting the marker at another tree's top-level `.git` took two ordinary permitted Writes and zero git access. Narrowing the allow to linked-worktree git dirs matches the only shape `replay.js --setup` can ever plant (it hard-refuses any other location) and means a marker forged at a non-linked location — e.g. out-of-band directly into the main checkout's `.git` — is never honoured, independent of D8's block on the plant itself. Still rejected: cwd-anchoring (the Agent tool offers no cwd control; unenforceable) and an env-var escape hatch (spoofable without even a Write). |
| D2 | The allow is keyed on the target ONLY — a session anchored inside the scratch tree writing OUT to the main checkout stays blocked (AC-20260820-02-2) | The scratch tree is a sink, never a source; the pollution the hook exists to stop is exactly a scratch-anchored agent writing into the real tree. |
| D3 | All other invariants are regression-pinned unchanged: unmarked cross-worktree writes still block, same-tree writes still allow, git/parse failure still fails open — with one now-named exception (D8): a target that resolves inside THIS repo's own common git dir is attributed to its owning worktree and blocked when that owner isn't the cwd's own tree, rather than falling through to the old unconditional fail-open (AC-20260820-02-3, AC-20260820-02-4, AC-20260820-02-5) | Loosening a guard demands pins proving how little was loosened; the fail-open narrowing itself demands the same, which is what D8 and AC-20260820-02-7..11 pin. |
| D4 | replay.md's Phase 1 setup gate appends `git -C {dir} clean -fd` after the `git checkout -- .` restore (AC-20260820-02-6) | `git checkout -- .` cannot remove files setupCommand *creates* (first run: an untracked root `package-lock.json` that would have polluted the blind reviewer's tree); `clean -fd` removes them and cannot touch the marker, which lives in the private git dir outside the working tree (executed evidence in Assumptions). |
| D5 | replay.md Phase 1 gains one sentence at the worker dispatch: the worker's Edit/Write into `{dir}` passes the write guard via the marker allow; mutating files through Bash remains a contract violation and is treated as a failed authoring attempt (AC-20260820-02-6) | Names the sanctioned path so the 2026-08-20 bypass shape is recognizably out-of-contract next time. |
| D6 | reviewer.md's return contract states the verdict field takes exactly `CLEAN` or `REVIEWER_FAILED` — findings ride `survivors` and never change the word [no-ac: prose contract; the consumer-side enforcement already exists — `replay.js --score` exits 2 on any other word, and /spec:review's verdict.js reads the same shape] | First live replay run returned the invented word `FINDINGS`; the contract should say what its consumers already require. |
| D7 | Spec plugin bumps to 7.6.0 (target, not a pin) with a changelog paragraph covering D1–D6 [no-ac: § Review Checks makes a missing bump a hard finding — that check is the oracle] | Hook behavior change = plugin behavior change. |
| D8 | **Added 2026-08-20 (review-gate finding)**: before the target-worktree resolution that fails open, if the resolved target path lies inside THIS repo's own common git dir (`git -C <cwd> rev-parse --git-common-dir`), attribute it: a path under `<common>/worktrees/<name>/…` belongs to worktree `<name>`; any other path under `<common>` belongs to the main checkout. BLOCK when the owning worktree differs from cwd's own worktree; ALLOW when it's the same worktree writing into its own metadata. A target outside THIS repo's common git dir (a different repo's `.git`, or a genuine parse failure) is untouched by this check and keeps the existing fail-open (AC-20260820-02-7, AC-20260820-02-8, AC-20260820-02-9, AC-20260820-02-10, AC-20260820-02-11) | Closes the forging path that made D1's marker check spoofable: the pre-existing fail-open on any path inside a repo's `.git` let a session plant the marker in another tree's private git dir with two ordinary Writes, then have it honoured. This is guard self-consistency, not a new security boundary — Bash can still `touch` the marker anywhere and that route is flagged by the harness as an Auto-Mode Bypass; what this closes is the *silent* Write/Edit route that let the same guard disarm itself without tripping anything. Scoped to THIS repo's own git metadata so cross-repo fail-open (D3) and a session's own-tree git writes (needed for ordinary git operations) stay untouched. An independent Fable review confirmed the finding as hard and ranked this class-level fix above an instance-level marker-basename block; the flip condition is a real host flow needing to Write/Edit shared git metadata from a worktree-anchored session — none found. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/block-cross-worktree-writes.sh | MODIFY | scripts | D1/D2/D8 (amended 2026-08-20): target-marker allow narrowed to linked-worktree git dirs only; a new git-metadata attribution check precedes the fail-open fallback and blocks a target inside THIS repo's own git metadata whose owning worktree isn't cwd's own; header comment gains the replay-sink rationale plus the self-consistency finding |
| tests/worktree-hook.test.js | MODIFY | tests | AC-20260820-02-1..5 and AC-20260820-02-7..11 (amended 2026-08-20) — marker-allow case (linked-only), scratch-to-main still-blocked case, unmarked/same-tree/fail-open regression pins, plus git-metadata attribution block/own-tree-allow/different-repo-fail-open cases |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260820-02-6 — doctrine assertions on replay.md Phase 1 (added at build: the AC named this oracle, the plan omitted the row) |
| spec/commands/replay.md | MODIFY | doctrine | D4/D5: setup-gate `clean -fd` step; sanctioned-write sentence at worker dispatch (AC-20260820-02-6) |
| spec/agents/reviewer.md | MODIFY | doctrine | D6: verdict-word vocabulary tightened to the closed set |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version 7.6.0 + changelog paragraph |

## Contracts

Hook decision table after this spec (starred `*` rows are this spec's original changes; dagger `†` rows
are the 2026-08-20 review-gate amendment — D1's narrowing and D8's attribution block):

```
target same worktree as cwd                                    -> ALLOW   (unchanged)
target different repo / outside git                            -> ALLOW   (unchanged)
target same repo, different tree, marker present AND         †  -> ALLOW   (narrowed: linked-worktree
  marker's git dir has a /worktrees/ segment                                git dirs only)
target same repo, different tree, marker absent, OR          †  -> BLOCK   (unchanged / forgery-by-
  marker present at a non-linked git dir (e.g. top-level .git)              non-linked-plant closed)
cwd inside marker tree, target main checkout                 *  -> BLOCK   (unchanged — allow keys
                                                                              on TARGET only)
target inside THIS repo's own common git dir, owning         †  -> BLOCK   (new: git-metadata
  worktree differs from cwd's own worktree                                  attribution, D8)
target inside THIS repo's own common git dir, owning         †  -> ALLOW   (new: own-tree metadata
  worktree is the same as cwd's own worktree                                writes still allowed)
target inside a DIFFERENT repo's git metadata, or any            -> ALLOW   (fail-open, unchanged)
  other git/parse failure
```

Marker location (already established by replay.js F1, 2026-08-19): `<common>/worktrees/<name>/replay-worktree`,
resolved from the target side as `git -C "$probe" rev-parse --git-dir` — never in the working tree. D8's
attribution parses the same `<common>/worktrees/<name>/…` shape from the other direction: `<common>` comes
from `git -C <cwd> rev-parse --git-common-dir`, and any resolved target path under `<common>` that is NOT
under a `/worktrees/<name>/` segment belongs to the main checkout itself.

## Behavior

- The marker path (D1) is still allow-only in code shape: one probe between the "same repo,
  different tree" determination and the block, now also checking the probed git dir's shape.
  Every failure of that probe (git error, missing marker, non-linked git dir) falls through to
  the existing BLOCK — this path can only allow, never widen a failure into a block.
- **Amended 2026-08-20**: the statement above no longer describes the hook as a whole. D8 adds
  an earlier, separate check — git-metadata attribution — that deliberately DOES turn a former
  fail-open ALLOW into a BLOCK, for one specific target class: a path inside THIS repo's own
  common git dir whose owning worktree isn't the cwd's own. That narrowing is not a side
  effect; it is the fix. The review-gate finding that produced it was exactly a fail-open being
  used to defeat the guard through the guard's own tool surface (§ Rationale), so closing it
  had to widen a block somewhere. The two invariants coexist: the marker-allow path still only
  ever allows-or-falls-through; the attribution path is the one place in this hook that blocks
  something the pre-amendment code allowed.
- Blindness is unaffected: the marker sits outside the working tree, the hook's allow path is
  silent, and the blind reviewer never writes — nothing new is readable from the scratch tree.
- The bypass incident's other half (worker behavior) is closed by contract, not tooling: with
  Edit/Write passing, the worker has no reason to reach for Bash, and D5 makes doing so a
  failed attempt rather than an improvisation.
- Threat model, stated plainly (D8): this is guard self-consistency, not a new security
  boundary. Anyone with Bash can still `touch` a marker anywhere — but that route is flagged by
  the harness as an Auto-Mode Bypass, and the Write/Edit route was silent. A PreToolUse guard
  on Write/Edit must not be defeatable by Write/Edit; D8 removes the two-Write defeat, not the
  Bash one (which was never in scope for this hook).

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

The following ACs (added 2026-08-20, review-gate amendment, D8) cover the git-metadata
attribution block — `tests/worktree-hook.test.js` is the oracle for all five:

- **AC-20260820-02-7**: WHEN a Write/Edit payload's cwd is a linked worktree and its target
  path resolves into the main checkout's own top-level `.git` (the marker-plant location the
  2026-08-20 forgery repro used) THE SYSTEM SHALL block the write (e.g. cwd `/scratch/rt`,
  target `/repo/.git/replay-worktree` → exit 2, stderr `BLOCKED:`)
- **AC-20260820-02-8**: WHEN a Write/Edit payload's target path resolves into a DIFFERENT
  linked worktree's private git dir than cwd's own (the sibling variant) THE SYSTEM SHALL block
  the write (e.g. cwd `/repo` main checkout, target `/repo/.git/worktrees/rt2/replay-worktree`
  where `rt2` is not cwd's own tree → exit 2, stderr `BLOCKED:`)
- **AC-20260820-02-9**: WHEN a `replay-worktree` marker file exists at a non-linked git dir
  (e.g. planted out-of-band directly at the main checkout's top-level `.git`, bypassing D8)
  THE SYSTEM SHALL still block an unrelated cross-worktree write, because D1's marker allow
  requires the marker's own git dir to contain a `/worktrees/` segment (e.g. marker present at
  `/repo/.git/replay-worktree`, cwd `/scratch/rt2`, target `/repo/README.md` → exit 2, stderr
  `BLOCKED:` — proves the marker's mere presence there grants nothing)
- **AC-20260820-02-10**: WHEN a Write/Edit payload's target path resolves into cwd's OWN
  worktree's private git dir THE SYSTEM SHALL CONTINUE TO allow the write (e.g. cwd
  `/scratch/rt`, target `/repo/.git/worktrees/rt/HEAD` → exit 0, no stderr — a session may
  still write its own tree's git metadata)
- **AC-20260820-02-11**: WHEN a Write/Edit payload's target path resolves into a DIFFERENT
  repo's git metadata (not THIS repo's common git dir at all) THE SYSTEM SHALL CONTINUE TO fail
  open (e.g. cwd `/repo`, target `/other-repo/.git/some-file` where `/other-repo` is an
  unrelated repository → exit 0, no stderr)

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
- **The D1-forgery reproduces via the pre-existing git-metadata fail-open (executed 2026-08-20,
  independently confirmed three times)**: cwd `wt2`, target `root/README.md` → exit 2 BLOCKED;
  cwd `wt2`, target `root/.git/replay-worktree` → exit 0 ALLOWED (plant permitted); after the
  plant, cwd `wt2`, target `root/README.md` → exit 0 ALLOWED (guard permanently disarmed); the
  sibling variant, cwd `root`, target `root/.git/worktrees/wt2/replay-worktree` → exit 0
  ALLOWED. If false → D8 and AC-20260820-02-7..11 are void and the finding reduces to D1's
  documentation error only (still worth the rationale correction, not worth the attribution
  block).

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

**Amendment, 2026-08-20**: this spec's own review gate raised a hard finding before close —
D1's marker allow is forgeable through the very tool surface the hook guards. Writes into a
repo's `.git`-internal paths were already fail-open (`git -C <path-inside-.git> rev-parse
--show-toplevel` exits 128, and `[ -n "$tgt_top" ] || exit 0` turns that into an allow); D1 was
the first thing that ever read a file at that fail-open location for an access-control
decision, turning an inert gap into a two-step, silent, permanent disarm of the guard (repro in
Assumptions). An independent Fable review confirmed the finding, rated it hard, and ranked the
class-level fix (D8's attribution block, applied to the whole shape of "target lands inside
this repo's own git metadata") above an instance-level fix (blocking only the literal
`replay-worktree` basename) — the narrower fix would have left the same fail-open reachable
through any other filename an access-control decision might someday key on. The flip condition
recorded against D8 is a real host flow that needs to Write/Edit shared git metadata from a
worktree-anchored session; none was found across this repo's own usage. Per incident policy the
fix and its pins land in the same change as the finding that produced them, same as the
original run's bypass.

## Canonical Delta

- `docs/canonical/review.md`, replay paragraph: append one sentence — the cross-worktree write
  guard allows writes whose target tree carries the `replay-worktree` marker, honoured only
  when that marker sits in a linked worktree's private git dir (the mutation worker's
  sanctioned path); scratch-anchored writes outward remain blocked, and a write into THIS
  repo's own git metadata is now attributed to its owning worktree and blocked unless that
  owner is the writing session's own tree.
