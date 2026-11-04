#!/usr/bin/env bash
# PreToolUse guard: keep Write/Edit/NotebookEdit inside the CURRENT git worktree.
#
# Why: a tool writing an absolute path rooted at a DIFFERENT working tree of the same repo lands the
# edit there and leaves the current worktree's branch clean. Shipped by the spec plugin (hooks.json);
# topology-based and fail-open outside a worktree or on any git/parse error.
# Owner: specs/20260820/02-replay-scratch-write-access.md.
#
# One sanctioned exception: a write into a disposable scratch worktree whose PRIVATE git dir (with a
# `/worktrees/` segment) carries a `scratch-worktree` marker — keyed on the TARGET only, so a session
# inside the marked tree writing OUT to the main checkout still blocks. A target inside THIS repo's git
# metadata is attributed to its owning tree and blocked unless that is the cwd's own, so the marker
# cannot be planted through the fail-open.
#
# Invariant enforced (topology-independent):
#   - target resolves to the SAME worktree as cwd            -> ALLOW
#   - target is in the SAME repo but a DIFFERENT working tree -> BLOCK (pollution)
#   - target is inside THIS repo's git metadata, owned by a
#     tree other than cwd's own                               -> BLOCK (marker forgery)
#   - target is a same-repo LINKED tree whose PRIVATE git
#     dir carries the `scratch-worktree` marker (TARGET only)  -> ALLOW (scratch sink)
#   - target is in a DIFFERENT repo, or outside any repo      -> ALLOW
#
# Anchor is cwd from the hook payload; spawned agents inherit their own worktree as cwd.
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

# Absolutize a `git rev-parse` result: a relative `.git` is joined to the caller's base dir;
# absolute results pass through.
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
# Top-level internals belong to the main checkout, `worktrees/<name>/...` to that linked tree; a write
# whose owner is not the cwd's own private git dir is blocked. Another repo's `.git` falls through.
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
        echo "  scratch-worktree setup, its setup step plants its own marker — never"
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

# --- Scratch-worktree marker allow: TARGET only ---
# `git rev-parse --git-dir` is the tree's PRIVATE git dir (relative `.git` absolutized against $probe).
# Any failure falls through to the BLOCK below; this path can only ALLOW.
tgt_gitdir_raw="$(git -C "$probe" rev-parse --git-dir 2>/dev/null)" && [ -n "$tgt_gitdir_raw" ] && {
  tgt_gitdir="$(absolutize_gitdir "$tgt_gitdir_raw" "$probe")"
  # A legitimate marker is always a LINKED tree's (a `worktrees` segment).
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
