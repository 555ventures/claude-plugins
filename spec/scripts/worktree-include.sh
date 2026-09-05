#!/usr/bin/env bash
# worktree-include.sh --root <main worktree root> --dest <existing directory>
#
# specs/20260904/02-worktree-include-shared-owner.md D1/D2: the sole owner of "copy the
# .worktreeinclude-matched, gitignored files from --root into --dest". merge-back.sh's `create`
# and replay.js's `--setup` both call this instead of each carrying their own copy of the
# selection+copy pipeline — the duplication this spec closes. It does NOT touch any tracked
# file, does NOT edit .gitignore/.worktreeinclude/exclude files, and NEVER copies anything under
# .claude/worktrees/ (even when the manifest itself names that path) — that directory can hold
# live sibling worktrees a stray copy would corrupt.
#
# Selection (unchanged from the inline block this replaces): files that are BOTH gitignored in
# --root AND matched by --root/.worktreeinclude, excluding anything under .claude/worktrees/. No
# manifest, or a manifest matching only tracked or absent-on-disk files, is a silent no-op.
#
# Exit codes:
#   0  copied N >= 0 files (N = 0 when there is no manifest, or the manifest matches nothing
#      gitignored) — stdout is always empty; stderr carries the "copied N" line only when N > 0
#   2  usage/precondition failure: --root or --dest missing, --root not a git repo, or --dest
#      not an existing directory — nothing enumerated, nothing copied
#   3  enumeration succeeded but the copy itself failed (the tar pipeline exited non-zero) — a
#      WARNING naming the consequence is printed on stderr
set -u

die() { echo "worktree-include: $*" >&2; exit 2; }

ROOT=""; DEST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root|--dest)
      [ $# -ge 2 ] || die "flag $1 requires a value"
      case "$2" in --*) die "flag $1 requires a value (got flag '$2')" ;; esac
      ;;
    *) die "unknown arg: $1" ;;
  esac
  case "$1" in
    --root) ROOT="$2" ;;
    --dest) DEST="$2" ;;
  esac
  shift 2
done

[ -n "$DEST" ] || die "--dest is required (usage: --root <main worktree root> --dest <existing directory>)"
[ -n "$ROOT" ] || die "--root is required (usage: --root <main worktree root> --dest <existing directory>)"
git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "--root '$ROOT' is not a git repo"
[ -d "$DEST" ] || die "--dest '$DEST' does not exist — create it first, e.g. mkdir -p '$DEST'"

INCLUDES=""
if [ -f "$ROOT/.worktreeinclude" ]; then
  INCLUDES="$(cd "$ROOT" && git ls-files -oi --exclude-from=.worktreeinclude \
    | grep -v '^\.claude/worktrees/' | git check-ignore --stdin 2>/dev/null)"
fi

if [ -n "$INCLUDES" ]; then
  N=$(printf '%s\n' "$INCLUDES" | wc -l | tr -d ' ')
  if (cd "$ROOT" && printf '%s\n' "$INCLUDES" | tar -cf - -T - 2>/dev/null | tar -xf - -C "$DEST" 2>/dev/null); then
    echo "worktree-include: copied $N .worktreeinclude-matched file(s) into $DEST" >&2
  else
    printf 'worktree-include: WARNING — .worktreeinclude copy failed; %s may be missing env/config files\n' "$DEST" >&2
    exit 3
  fi
fi
exit 0
