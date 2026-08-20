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
# tree, so the blind reviewer never sees it) carries a `replay-worktree` marker file,
# planted only by `replay.js --setup` and gone after `--teardown` / `git worktree
# remove`. The scratch tree is a sink, never a source: the allow keys on the TARGET
# only, so a session anchored inside the marker-carrying tree writing OUT to the main
# checkout still blocks.
#
# Invariant enforced (topology-independent):
#   - target resolves to the SAME worktree as cwd            -> ALLOW
#   - target is in the SAME repo but a DIFFERENT working tree -> BLOCK (pollution)
#   - target is a same-repo different tree whose PRIVATE git
#     dir carries the `replay-worktree` marker (TARGET only)  -> ALLOW (replay sink)
#   - target is in a DIFFERENT repo, or outside any repo      -> ALLOW
#
# Correct for every nesting: a worktree spawned from another worktree, or a spec
# build worker's isolated worktree, each runs with cwd = its OWN worktree (spawned
# agents inherit the worktree as cwd), so writes there pass and escapes are
# blocked. Anchor is cwd from the hook payload = the tool call's working directory.
#
# Contract: reads PreToolUse JSON on stdin. exit 0 = allow, exit 2 = block.
# Fail-open: any git/parse failure allows the write (never wedge the session).
set -uo pipefail

input="$(cat)"

cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
# Write/Edit send file_path; NotebookEdit sends notebook_path — guard both.
file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"

[ -n "$file_path" ] || exit 0
[ -n "$cwd" ] || cwd="$PWD"

# Canonicalize a directory path (resolves symlinks: macOS /tmp -> /private/tmp).
canon() { (cd "$1" 2>/dev/null && pwd -P); }

# --- Current worktree identity (from cwd) ---
cur_top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cur_common_raw="$(git -C "$cwd" rev-parse --git-common-dir 2>/dev/null)" || exit 0
[ -n "$cur_top" ] && [ -n "$cur_common_raw" ] || exit 0
case "$cur_common_raw" in /*) ;; *) cur_common_raw="$cwd/$cur_common_raw" ;; esac
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

# --- Target worktree identity (from the target's directory) ---
tgt_top="$(git -C "$probe" rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$tgt_top" ] || exit 0   # target not inside any git repo -> allow
tgt_common_raw="$(git -C "$probe" rev-parse --git-common-dir 2>/dev/null)" || exit 0
case "$tgt_common_raw" in /*) ;; *) tgt_common_raw="$probe/$tgt_common_raw" ;; esac
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
  case "$tgt_gitdir_raw" in /*) tgt_gitdir="$tgt_gitdir_raw" ;; *) tgt_gitdir="$probe/$tgt_gitdir_raw" ;; esac
  [ -f "$tgt_gitdir/replay-worktree" ] && exit 0
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
