#!/usr/bin/env bash
# PreToolUse guard: keep Write/Edit/NotebookEdit inside the CURRENT git worktree.
#
# Why this exists: a worktree shares the repo object store but has its own working
# directory. When a tool writes to an absolute path rooted at a DIFFERENT working
# tree of the same repo — the main checkout, or a sibling/nested worktree — the
# edit silently lands there and leaves the current worktree's branch clean. That
# is the "isolated worktree, but the work landed somewhere else" failure.
#
# Shipped by the spec plugin (wired in hooks/hooks.json), so it fires for every
# session in any repo where the plugin is enabled. It is topology-based and
# fail-open: outside a worktree, or on any git/parse error, it allows the write,
# so it is inert for ordinary single-checkout work and only bites genuine escapes.
# This is the mechanical complement to /spec:build's worktree isolation and the
# Worker Contract's git ban — workers run with cwd = their own worktree, so a
# parallel worker that writes an absolute path into the root checkout is blocked.
#
# One sanctioned exception (2026-08-20, specs/20260820/02): /spec:replay's mutation
# worker is correctly dispatched from a main-anchored session to Edit a disposable
# scratch worktree that `replay.js --setup` stood up — a cross-worktree write that is
# the whole point of the tool, not pollution. The first live run blocked it and the
# worker tunneled the same write through Bash instead, tripping an Auto-Mode Bypass
# warning. The fix: allow when the TARGET tree's PRIVATE git dir (outside the working
# tree, so the blind reviewer never sees it) carries a `scratch-worktree` marker file,
# planted only by `replay.js --setup` and gone after `--teardown` / `git worktree
# remove`. The scratch tree is a sink, never a source: the allow keys on the TARGET
# only, so a session anchored inside the marker-carrying tree writing OUT to the main
# checkout still blocks.
#
# That marker allow turned out to be forgeable through this hook's own fail-open: a
# target inside a repo's `.git`-internal paths made `rev-parse --show-toplevel` exit
# 128 (not inside any working tree), and the old `[ -n "$tgt_top" ] || exit 0` read
# that as "not our concern" and allowed it — including writes that PLANT a
# `scratch-worktree` file where none belongs, permanently disarming the guard for
# that tree. Fixed by attributing any target inside THIS repo's git metadata to its
# owning tree (main checkout, or the linked tree named by a `worktrees/<name>`
# segment) and blocking unless that owner is the cwd's own git dir — this runs
# BEFORE the old tgt_top resolution, so the forging write itself is now blocked. The
# marker allow is additionally narrowed to git dirs with a `/worktrees/` segment,
# since `replay.js --setup` only ever plants into a linked tree.
#
# Invariant enforced (topology-independent):
#   - target resolves to the SAME worktree as cwd            -> ALLOW
#   - target is in the SAME repo but a DIFFERENT working tree -> BLOCK (pollution)
#   - target is inside THIS repo's git metadata, owned by a
#     tree other than cwd's own                               -> BLOCK (marker forgery)
#   - target is a same-repo LINKED tree whose PRIVATE git
#     dir carries the `scratch-worktree` marker (TARGET only)  -> ALLOW (replay sink)
#   - target is in a DIFFERENT repo, or outside any repo      -> ALLOW
#
# Correct for every nesting: a worktree spawned from another worktree, or a spec
# build worker's isolated worktree, each runs with cwd = its OWN worktree (spawned
# agents inherit the worktree as cwd), so writes there pass and escapes are
# blocked. Anchor is cwd from the hook payload = the tool call's working directory.
#
# Contract: reads PreToolUse JSON on stdin. exit 0 = allow, exit 2 = block.
# Fail-open: any git/parse failure allows the write (never wedge the session),
# except a target inside this repo's own git metadata, which is attributed to its
# owning worktree and blocked on mismatch rather than falling through to fail-open.
set -uo pipefail

input="$(cat)"

cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
# Write/Edit send file_path; NotebookEdit sends notebook_path — guard both.
file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"

[ -n "$file_path" ] || exit 0
[ -n "$cwd" ] || cwd="$PWD"

# Canonicalize a directory path (resolves symlinks: macOS /tmp -> /private/tmp).
canon() { (cd "$1" 2>/dev/null && pwd -P); }

# Absolutize a `git rev-parse` result (git-common-dir / git-dir): git prints
# these relative to the directory rev-parse ran in when the repo was reached
# via a relative path, so a bare `.git` needs the caller's base dir joined
# back on before it's meaningful to canon() or compare against another
# absolutized path. Already-absolute results pass through unchanged.
absolutize_gitdir() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$2/$1" ;;
  esac
}

# --- Current worktree identity (from cwd) ---
cur_top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cur_common_raw="$(git -C "$cwd" rev-parse --git-common-dir 2>/dev/null)" || exit 0
[ -n "$cur_top" ] && [ -n "$cur_common_raw" ] || exit 0
cur_common_raw="$(absolutize_gitdir "$cur_common_raw" "$cwd")"
cur_top="$(canon "$cur_top")" || exit 0
cur_common="$(canon "$cur_common_raw")" || exit 0

# --- Absolutize the target, then walk up to its nearest existing ancestor dir ---
case "$file_path" in
  /*) abs="$file_path" ;;
  *)  abs="$cwd/$file_path" ;;
esac
probe="$(dirname "$abs")"
while [ ! -d "$probe" ] && [ "$probe" != "/" ]; do
  probe="$(dirname "$probe")"
done

# --- .git-internal targets: attribute to the owning worktree, fail CLOSED cross-owner ---
# A target inside THIS repo's common git dir never falls through to the fail-open
# below (that fail-open is the marker-forgery bug, specs/20260820/02): top-level
# internals belong to the main checkout, `worktrees/<name>/...` to that linked tree.
# A write whose owner is not the cwd's own private git dir is blocked here, before
# the old tgt_top resolution ever runs — this closes the plant-then-read forgery at
# its root instead of trusting whatever marker a prior write left behind. A target
# under a DIFFERENT repo's `.git` does not match $cur_common and falls through
# unchanged to the existing fail-open below.
probe_canon="$(canon "$probe")" || probe_canon=""
if [ -n "$probe_canon" ]; then
  case "$probe_canon/" in
    "$cur_common"/*)
      cur_gitdir_raw="$(git -C "$cwd" rev-parse --git-dir 2>/dev/null)" || exit 0
      cur_gitdir="$(absolutize_gitdir "$cur_gitdir_raw" "$cwd")"
      cur_gitdir="$(canon "$cur_gitdir")" || exit 0
      owner="$cur_common"
      rest="${probe_canon#"$cur_common"}"
      case "$rest" in
        /worktrees/*/*|/worktrees/*)
          name="${rest#/worktrees/}"; name="${name%%/*}"
          [ -n "$name" ] && owner="$cur_common/worktrees/$name" ;;
      esac
      [ "$owner" = "$cur_gitdir" ] && exit 0
      {
        echo "BLOCKED: write targets another working tree's git metadata in the same repo."
        echo "  target metadata dir: $probe_canon"
        echo "  owned by:            $owner"
        echo "  current tree's dir:  $cur_gitdir"
        echo "  Git-internal state of a sibling tree is never a write target; if this is"
        echo "  replay harness setup, replay.js --setup plants its own marker — never"
        echo "  hand-plant one."
      } >&2
      exit 2
      ;;
  esac
fi

# --- Target worktree identity (from the target's directory) ---
tgt_top="$(git -C "$probe" rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$tgt_top" ] || exit 0   # target not inside any git repo -> allow
tgt_common_raw="$(git -C "$probe" rev-parse --git-common-dir 2>/dev/null)" || exit 0
tgt_common_raw="$(absolutize_gitdir "$tgt_common_raw" "$probe")"
tgt_top="$(canon "$tgt_top")" || exit 0
tgt_common="$(canon "$tgt_common_raw")" || exit 0

# Different repo -> not our concern.
[ "$tgt_common" = "$cur_common" ] || exit 0
# Same worktree -> allow.
[ "$tgt_top" = "$cur_top" ] && exit 0

# --- Replay-scratch marker allow (D1/D2, specs/20260820/02): TARGET only ---
# `git rev-parse --git-dir` returns the tree's PRIVATE git dir: a bare relative `.git`
# from a main checkout, or an absolute `.../.git/worktrees/<name>` from a linked
# worktree (both observed in the executed spike) — absolutize a relative result
# against $probe, same as the git-common-dir resolution above. Any failure here (git
# error, empty result, missing marker) simply falls through to the BLOCK below: this
# path can only ALLOW, never widen a failure into a block, and it never inspects the
# cwd side, so a write anchored inside a marked tree and aimed at the main checkout
# still hits the BLOCK.
tgt_gitdir_raw="$(git -C "$probe" rev-parse --git-dir 2>/dev/null)" && [ -n "$tgt_gitdir_raw" ] && {
  tgt_gitdir="$(absolutize_gitdir "$tgt_gitdir_raw" "$probe")"
  # `replay.js --setup` cmdSetup hard-refuses to plant into a git dir without a
  # `worktrees` segment, so a legitimate marker is always a LINKED tree's marker —
  # a marker sitting at a main checkout's top-level `.git` is never legitimate.
  case "$tgt_gitdir" in
    */worktrees/*) [ -f "$tgt_gitdir/scratch-worktree" ] && exit 0 ;;
  esac
}

# Same repo, different working tree -> pollution. Block.
{
  echo "BLOCKED: write escapes the current worktree into another working tree of the same repo."
  echo "  target lands in:  $tgt_top"
  echo "  current worktree: $cur_top"
  echo "  Rewrite the path under the current worktree, e.g.:"
  echo "    ${abs/#$tgt_top/$cur_top}"
} >&2
exit 2
