---
date: 2026-08-23
status: implementing
open_markers: 0
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-23
diff_base: 6ae2d45a4bc3e873d18bcdc95eaedf01597b4265
---

# Replay unattended hardening — writable scratch worktree + pinned diff base

## Goal

The scheduled mutation replay cannot run unattended, twice over. First, `replay.js --setup`
refuses any scratch worktree inside the repo root (exit 3), forcing it under `/private/tmp`,
where the permission classifier denies every agent Edit/Write — the mutation-authoring worker
blocked on manual approval on both live runs of 2026-08-23 (rv_387d84a3b424's replay; the
first worker returned `blocked` after even a no-op whitespace edit was denied). Second,
`--select` emits `diffBase` from spec frontmatter, where `build_base` is typically the moving
ref `main` — stale the moment the review's own merge lands, so the replay panel diffs against
the wrong base (observed: reconcile exit 3, two phantom out-of-plan files, two phantom
unrealized files, until hand-pinned to the true pre-image sha). Done = a due replay stands its
scratch worktree up inside the repo's gitignored `.claude/worktrees/` (where agent writes are
auto-approved, as build worktrees already prove daily) with the main tree's `git status` still
empty, and `--select` emits a pinned, ancestry-validated sha — or refuses loudly — never a
moving ref.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--setup` accepts a `--dir` inside the repo root **iff** it resolves inside `<root>/.claude/worktrees/`; any other in-repo path keeps the exit-3 refusal verbatim, and outside-repo dirs stay accepted unchanged (AC-20260823-05-1, AC-20260823-05-2, AC-20260823-05-6) | Narrow allow-list over "any gitignored path" — the guard stays fail-closed everywhere the repo's own precedent (build worktrees) doesn't already sanction |
| D2 | Before `git worktree add`, `--setup` on an in-repo `--dir` runs `git check-ignore -q` on it; not ignored → append `.claude/worktrees/` to `<common git dir>/info/exclude` (skipped when the line is already present), so the worktree is status-invisible in every host repo, not just ones whose `.gitignore` has the line (AC-20260823-05-3, AC-20260823-05-4) | Host repos aren't guaranteed to ignore `.claude/worktrees/`; an unignored worktree dirties `git status` and breaks `merge-back`'s clean-root assertion — same self-provisioning precedent as the driver's stopped-ledger exclude |
| D3 | `spec-review-driver.js` stamps `diff_base: <sha>` into the spec frontmatter at the `implementing → done` flip when the frontmatter has no `diff_base`, resolving the review's base ref at flip time (`git rev-parse --verify <base>^{commit}` — pre-merge, so a symbolic `main` still names the true pre-image); an existing `diff_base` is never overwritten (AC-20260823-05-7) | The close commit is the last moment the moving ref and the true pre-image coincide; stamping there gives every future `--select` a durable pin without touching `verdict.js` (critical surface) or the ledger row shape |
| D4 | `--select` reads frontmatter at the **close commit** (not its parent), tries `diff_base` then `build_base`, and emits the first candidate that `git rev-parse --verify`-resolves to a full sha that is an ancestor of `parent` and not equal to `parent`; no candidate qualifies → exit 4 naming the stale-base cause and the remedy (the pin is stamped at every future review close) (AC-20260823-05-5, AC-20260823-05-8) | Ancestry is the executable truth test: the real pre-image passes it and a post-merge `main` fails it (spiked); reading at the close commit is a harness-side read the blind reviewer never sees, and it is where D3's stamp lives |
| D5 | `spec/commands/replay.md` Phase 1 step 1 directs `{dir}` to a fresh uniquely-named path under `<root>/.claude/worktrees/` (e.g. `replay-<random>`), and the Rules bullet "The main tree is never in scope" is reworded: isolation comes from the detached worktree + ignore + marker guard, not from living outside the repo `[no-ac: doctrine prose; review's citations/patterns legs are the enforcement]` | The doctrine currently mandates the exact `mktemp -d` placement that makes the run un-automatable; the safety story must name the real mechanisms |
| D6 | Exit alphabets keep their meanings: `--setup` exit 3 narrows its population (the `.claude/worktrees/` arm moves to success), `--select` exit 4 widens its population (unresolvable/stale base joins missing-frontmatter); both header `Exit codes:` lists updated in place `[no-ac: header prose; the review-checks exit-code rule is the enforcement]` | New exit codes would ripple into `replay.md` and the driver's `--select` parsing; population shifts inside existing codes ripple nowhere |
| D7 | Version bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.25.0 — a target, not a pin: 7.23.0 is spec 03's target, 7.24.0 spec 04's next-free landing; concurrent sessions race semver) with the last-3-versions description update `[no-ac: manifest bookkeeping; review's version-bump check is the enforcement]` | Behavior change (guard population, `--select` output semantics, driver stamp) mandates a minor bump |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | MODIFY | scripts | D1/D2 `--setup` in-repo allow arm + ignore self-provision; D4 `--select` pinned-base derivation; D6 header exit-code doc updates |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D3 `diff_base` stamp at the `status: done` flip (sibling edit to the existing flip regex), absent-only |
| spec/commands/replay.md | MODIFY | doctrine | D5 Phase 1 step 1 `{dir}` location + Rules § main-tree bullet rewording; drop the "outside the repo (e.g. `mktemp -d`)" mandate |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260823-05-1, AC-20260823-05-2, AC-20260823-05-3, AC-20260823-05-4, AC-20260823-05-5, AC-20260823-05-6, AC-20260823-05-8; update any assertion pinning the old "pass a --dir outside the repo" remedy text |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260823-05-7 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 version + description changelog |

## Contracts

`--select` stdout line keeps its exact shape — `spec=… reviewRunId=… commit=… parent=…
diffBase=…` — but `diffBase` is now always a full 40-hex sha (never a ref name). The driver's
REPLAY-step parser (`/spec=(\S+)\s+…diffBase=(\S+)/`) is shape-compatible and needs no change.

`--setup` acceptance predicate (D1), in guard order:

```
resolvedDir inside <root>/.claude/worktrees/  → allowed (D2 ignore-provision first)
resolvedDir inside <root> otherwise           → exit 3 (unchanged refusal)
resolvedDir outside <root>                    → allowed (unchanged)
```

Frontmatter stamp (D3), written only when no `^diff_base:` line exists, inserted directly
after the `build_base:` line (or before the closing `---` when no `build_base` exists):

```
diff_base: <40-hex sha>   # stamped by /spec:review at close — the resolved pre-image
```

(The stamp value is the bare sha; the comment above is illustrative, not emitted — inline `#`
comments on ref-valued keys are a recorded incident.)

## Behavior

Unattended flow after this spec: the driver's REPLAY step fires → session picks
`{dir} = <root>/.claude/worktrees/replay-<random>` → `--setup` provisions the ignore line if
the host lacks it, stands up the detached worktree, plants the marker in the private git dir
(unchanged mechanics — spiked: an in-repo linked worktree's git-dir carries the `worktrees`
path segment the marker guard and `--teardown` both key on) → the mutation worker's Edit
calls land inside the project root and pass both the permission classifier and the
cross-worktree hook's existing marker allow (the hook is topology-based and needs no change)
→ legs and the blind reviewer read `--base <pinned sha>` from `--select` → teardown removes
the worktree; `git status` in the main root was empty throughout.

Stale-base refusal (D4): the exit-4 message names the candidate values tried, states that a
moving ref no longer names the pre-image once the review's merge lands, and gives the remedy
— reviews closed from this version on stamp `diff_base` at close, so the next review's replay
selects cleanly; there is no manual override flag (a hand-supplied base would be an unmeasured
guess riding into a measurement).

## Acceptance Criteria

- **AC-20260823-05-1**: WHEN `--setup --commit <sha> --dir <root>/.claude/worktrees/replay-x`
  is invoked in a repo that ignores `.claude/worktrees/` THE SYSTEM SHALL create the detached
  worktree there with the `replay-worktree` marker in its private git dir and exit 0 (e.g.
  `--dir <root>/.claude/worktrees/replay-x` → stdout `setup dir=<abs path> commit=<sha>`,
  exit 0; a follow-up `--teardown --dir` of the same path exits 0 and removes it) → in
  tests/replay/replay.test.js
- **AC-20260823-05-2**: WHEN `--setup --dir` resolves inside the repo root but not inside
  `<root>/.claude/worktrees/` THE SYSTEM SHALL CONTINUE TO refuse with exit 3 and create
  nothing (e.g. `--dir <root>/scratch` → exit 3, no worktree registered) → in
  tests/replay/replay.test.js
- **AC-20260823-05-3**: WHEN `--setup` targets `<root>/.claude/worktrees/<name>` in a repo
  whose ignore rules do not cover that path THE SYSTEM SHALL append `.claude/worktrees/` to
  the repo's `info/exclude` before creating, so that after setup `git check-ignore -q
  .claude/worktrees/<name>` exits 0 and `git status --porcelain` in the root prints nothing →
  in tests/replay/replay.test.js
- **AC-20260823-05-4**: WHEN the repo's `info/exclude` already contains the
  `.claude/worktrees/` line THE SYSTEM SHALL not append a duplicate (two consecutive setups →
  exactly one occurrence of the line) → in tests/replay/replay.test.js
- **AC-20260823-05-5**: WHEN `--select`'s chosen spec carries `diff_base: <sha>` at the close
  commit and that sha is an ancestor of the close commit's parent THE SYSTEM SHALL emit
  `diffBase=<that full sha>` (never the spec's `build_base` ref name) → in
  tests/replay/replay.test.js
- **AC-20260823-05-6**: WHEN `--setup --dir` resolves outside the repo root THE SYSTEM SHALL
  CONTINUE TO create the worktree there exactly as today (the manual fallback path survives)
  → existing setup tests retagged in tests/replay/replay.test.js
- **AC-20260823-05-7**: WHEN the driver flips a spec whose frontmatter has `build_base` but no
  `diff_base` to `status: done` THE SYSTEM SHALL write `diff_base: <sha>` (the base ref
  resolved at flip time) into the frontmatter in the same edit, and SHALL leave an existing
  `diff_base` value byte-identical (e.g. frontmatter `build_base: main` → after flip,
  frontmatter contains `status: done` and `diff_base: <40-hex sha of main at flip>`) → in
  tests/review/review-driver.test.js
- **AC-20260823-05-8**: WHEN no frontmatter base candidate at the close commit resolves to an
  ancestor of the close parent distinct from it (e.g. only `build_base: main` and `main` has
  since absorbed the merge, so it is a descendant — not an ancestor — of the parent) THE
  SYSTEM SHALL exit 4 emitting no `spec=…` selection line, with stderr naming the stale-base
  cause and the stamped-at-close remedy → in tests/replay/replay.test.js

## Assumptions (escalation triggers)

- A1: Agent Edit/Write calls inside the repo root are auto-approved while `/private/tmp`
  paths are classifier-denied — observed 2026-08-23 twice (mutation worker `blocked` after a
  denied no-op whitespace edit; second worker succeeded only after a manual `/permissions`
  grant), and `.claude/worktrees/` already hosts build worktrees that agents edit unattended
  daily — **if false** (a host where in-repo writes still prompt): the run degrades to
  today's behavior — blocked on a manual approval, never corrupted.
- A2 (spiked): a detached worktree inside a gitignored in-repo dir is status-invisible and
  keeps the standard linked-worktree git-dir shape. Executed 2026-08-23 in a scratch repo:
  `git check-ignore -q .claude/worktrees/x` → exit 1 pre-provision; after appending
  `.claude/worktrees/` to `.git/info/exclude` → exit 0; `git worktree add --detach
  .claude/worktrees/replay-abc HEAD` into a pre-created empty dir → exit 0;
  `git status --porcelain | wc -l` → `0`; `rev-parse --git-dir` →
  `…/.git/worktrees/replay-abc` (carries the `worktrees` segment the marker/teardown guards
  key on); `worktree remove --force` → exit 0 — **if false:** D2's provisioning arm is the
  guard; a still-dirty status would break merge-back's clean-root assert → STOP, ask the user.
- A3 (spiked): `git merge-base --is-ancestor` discriminates exactly the observed distortion.
  Executed 2026-08-23 against the real repo: `--is-ancestor b9aa7b7 <close parent ee245df>`
  → exit 0 (true pre-image passes); `--is-ancestor main <close parent>` → exit 1 (post-merge
  main fails) — **if false:** D4 has no executable truth test → STOP, ask the user.
- A4 (spiked, negative claim): today's `--setup` refuses the in-repo dir this spec legalizes.
  Executed 2026-08-23: `replay.js --setup --commit HEAD --dir .claude/worktrees/replay-spike`
  → exit 3, "resolves inside the repo root … pass a --dir outside the repo" — **if false:**
  AC-2's pin is wrong about the pre-image; re-derive the guard before building.
- A5 (spiked): no `diff_base` exists in worktree-built specs' frontmatter for D3 to collide
  with. Executed 2026-08-23: `git show 4bf635f:specs/20260823/02-….md` frontmatter carries
  `build_base: main` and no `diff_base` — **if false** (a build wrote one): D3 stamps only
  when absent — no overwrite by construction.
- A6: the driver's done-flip is a single regex replace on the spec text
  (`specText.replace(/^status:\s*.*$/m, 'status: done')`), so D3's stamp is a sibling edit at
  one site — **if false:** the worker returns `blocked` naming the actual flip mechanism.

## Rationale

Both defects share one cause: the harness was designed for a strictly-outside-the-repo
scratch tree and a same-instant replay, and both premises broke on the first driver-scheduled
run (2026-08-23, review rv_387d84a3b424). The permission classifier is the harness's, not the
pipeline's — so the fix moves the worktree to where the classifier already trusts, rather
than fighting the classifier. `.claude/worktrees/` over a new dedicated dir: it is already
gitignored here, already precedented as the place agent-editable worktrees live, and the
narrow D1 allow-list means no new "any ignored path" hole. Persisting the pin in frontmatter
over the ledger row: the row is composed by `verdict.js`, a critical-tier surface this
standard-tier spec deliberately avoids; the driver already edits frontmatter at the flip.
Fail-closed (exit 4) over deriving a base post-hoc: after a merge lands there is no honest
derivation left (`merge-base` degenerates to the parent itself), and a wrong base silently
distorts a measurement whose whole value is being trusted. Rejected: a `--base` override flag
on `--select` (an unmeasured hand-supplied guess inside a measurement path); relaxing exit 3
to "any gitignored path" (every widening of a safety guard is a new hole). Tier standard: no
pipeline-rules critical surface is touched — `verdict.js`, `review-legs.js`, `merge-back.sh`
untouched; the driver edit is additive stamping behind existing tests. Regression pins: AC-2
and AC-6 pin the guard's surviving refusal/acceptance arms; `--select`'s window/tier
selection semantics are untouched and stay pinned by the existing suite.

Collision-closure adjudication (2026-08-23, `--literal "outside the repo" --literal
"mktemp -d"`): all unplanned hits waived. `spec/doctrine/design.md:486` uses "outside the
repo" for design-artifact scratchpad guidance — a different claim, untouched by D5.
`tests/run-ledger.test.js` (paths-leg `likely`) pins review.md's REPLAY-state wiring and the
`replay-recorded` mark, not the dir-location prose — survives D5 byte-for-byte.
`setup/export.sh`, `setup/import.sh`, `spec/commands/release.md` use `mktemp -d` for
unrelated scratch purposes, not the retired replay-dir mandate. Historical specs
(20260814/04, 20260819/02, 20260821/03) are immutable planning records, never edited
retroactively. The `.claude/worktrees/spec-03-*` hits are gitignored build-worktree
duplicates of the same files, not independent surfaces.

## Canonical Delta

In `docs/canonical/review.md`, the replay paragraph (the marker-guarded scratch worktree
description) changes: the scratch worktree lives at `<root>/.claude/worktrees/replay-<id>` —
inside the repo so agent edits are auto-approved and the scheduled replay runs unattended —
kept invisible to `git status` by an ignore line `--setup` self-provisions into
`info/exclude` when the host lacks it; isolation comes from the detached worktree, the ignore
line, and the private-git-dir marker, not from living outside the repo (a `--dir` outside the
repo remains the manual fallback). Additionally: `--select` emits a pinned ancestry-validated
sha as the diff base — a spec's symbolic `build_base` is stale once the review's merge lands
— sourced from the `diff_base` the review driver stamps into frontmatter at every
`status: done` flip; a spec closed before stamping existed, whose base no longer validates,
is refused (exit 4) rather than measured against a distorted diff.
