#!/usr/bin/env bash
# PreToolUse guard (matcher Write|Edit): keep writes inside the CURRENT git worktree.
# A path rooted at a DIFFERENT working tree of the same repo would land the edit there and leave
# this worktree's branch clean. Copy-trim of v7.
#   same worktree as cwd                                  → allow
#   this repo's git metadata, owned by another tree       → block (marker forgery)
#   a plugin worktree under <cwd tree>/.claude/worktrees/ → allow (agents run from the main
#                                                           checkout: the Agent tool has no cwd)
#   same repo, other tree                                 → block
#   another repo, or outside any repo                     → allow
# Fail-open on any git/parse error. Exit 0 allow · 2 block.
set -uo pipefail
command -v node >/dev/null 2>&1 || exit 0
parsed="$(node -e '
try { const j = JSON.parse(require("fs").readFileSync(0, "utf8")), t = j.tool_input || {}
  process.stdout.write((j.cwd || "") + "\n" + (t.file_path || t.notebook_path || "")) } catch {}' 2>/dev/null)" || exit 0
cwd="${parsed%%$'\n'*}"
file_path="${parsed#*$'\n'}"
[ "$file_path" != "$parsed" ] && [ -n "$file_path" ] || exit 0
[ -n "$cwd" ] || cwd="$PWD"

canon() { [ -n "$1" ] && (cd "$1" 2>/dev/null && pwd -P); }
absdir() { [ -n "$1" ] || return 1; case "$1" in /*) canon "$1" ;; *) canon "$2/$1" ;; esac; }

cur_top="$(canon "$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)")" || exit 0
cur_common="$(absdir "$(git -C "$cwd" rev-parse --git-common-dir 2>/dev/null)" "$cwd")" || exit 0
[ -n "$cur_top" ] && [ -n "$cur_common" ] || exit 0

case "$file_path" in /*) abs="$file_path" ;; *) abs="$cwd/$file_path" ;; esac
probe="$(dirname "$abs")"
while [ ! -d "$probe" ] && [ "$probe" != "/" ]; do probe="$(dirname "$probe")"; done
probe="$(canon "$probe")" || exit 0

# Git metadata: top level belongs to the main checkout, worktrees/<name>/… to that linked tree.
case "$probe/" in
  "$cur_common"/*)
    cur_gitdir="$(absdir "$(git -C "$cwd" rev-parse --git-dir 2>/dev/null)" "$cwd")" || exit 0
    owner="$cur_common"; rest="${probe#"$cur_common"}"
    case "$rest" in /worktrees/*) name="${rest#/worktrees/}"; owner="$cur_common/worktrees/${name%%/*}" ;; esac
    [ "$owner" = "$cur_gitdir" ] && exit 0
    echo "BLOCKED: write targets another working tree's git metadata ($owner); never plant markers by hand." >&2
    exit 2 ;;
esac

tgt_top="$(canon "$(git -C "$probe" rev-parse --show-toplevel 2>/dev/null)")" || exit 0
[ -n "$tgt_top" ] || exit 0
tgt_common="$(absdir "$(git -C "$probe" rev-parse --git-common-dir 2>/dev/null)" "$probe")" || exit 0
[ "$tgt_common" = "$cur_common" ] || exit 0
[ "$tgt_top" = "$cur_top" ] && exit 0

case "$tgt_top/" in "$cur_top"/.claude/worktrees/*) exit 0 ;; esac

{
  echo "BLOCKED: write escapes the current worktree into another working tree of the same repo."
  echo "  target lands in:  $tgt_top"
  echo "  current worktree: $cur_top"
  echo "  rewrite the path under the current worktree, e.g. ${abs/#$tgt_top/$cur_top}"
} >&2
exit 2
