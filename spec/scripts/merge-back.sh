#!/usr/bin/env bash
# Deterministic merge-back mechanics for /spec:review Phase 4.
#
# WHY A SCRIPT (and what it deliberately does NOT do):
#   A subprocess cannot move the harness session's working directory. Only an
#   ExitWorktree(keep) tool call, or a `cd` issued in the MAIN session, relocates
#   the session. So this script never tries to relocate — instead the `cleanup`
#   subcommand REFUSES to remove a worktree the session is still inside (exit 4),
#   turning review.md's "relocate first" rule into a mechanical guarantee. That is
#   the one defense against landing the session in $HOME after `git worktree remove`.
#
#   All git runs via `git -C <root>` so the merge targets the root checkout
#   regardless of where the session sits. Strategy + conflict judgment stay with
#   the model: `merge` exits 3 on conflicts for the model to resolve, then commit.
#
# Subcommands:
#   root     [--worktree W]   -> prints the absolute PROJECT root (the main worktree), so the
#                                caller cd's to a verified path and never guesses "root".
#                                Project root != $HOME. Run from inside the worktree if no W.
#   inspect  --root R --target T --source S
#   merge    --root R --target T --source S --strategy {merge-commit|ff-only|squash|rebase-ff} [--worktree W]
#   cleanup  --root R --source S [--worktree W]
#   verify   --root R
#
# Exit codes:
#   0  success
#   2  usage / precondition failure (bad args, dirty tree, wrong branch at root)
#   3  merge conflicts — model must resolve, `git add`, and commit
#   4  refused: session CWD is inside the worktree — relocate to root first
set -u

die()  { echo "merge-back: $*" >&2; exit 2; }
note() { echo "$*"; }

ROOT=""; TARGET=""; SOURCE=""; STRATEGY=""; WORKTREE=""
SUB="${1:-}"; shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --root)     ROOT="${2:-}"; shift 2 ;;
    --target)   TARGET="${2:-}"; shift 2 ;;
    --source)   SOURCE="${2:-}"; shift 2 ;;
    --strategy) STRATEGY="${2:-}"; shift 2 ;;
    --worktree) WORKTREE="${2:-}"; shift 2 ;;
    *) die "unknown arg: $1" ;;
  esac
done

case "$SUB" in
  ""|-h|--help|help)
    grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
  root)
    # Authoritative project root = the FIRST entry of `git worktree list` (the main
    # worktree). Self-discovers from --worktree or $PWD; never requires --root. This is
    # the path the caller must `cd` to — NOT $HOME, NOT `~`, NOT a bare `cd`.
    INSIDE="${WORKTREE:-$PWD}"
    git -C "$INSIDE" worktree list --porcelain 2>/dev/null \
      | awk 'NR==1 && $1=="worktree"{print $2; f=1} END{exit !f}' \
      || { echo "merge-back: could not determine project root from '$INSIDE'" >&2; exit 2; }
    exit 0 ;;
esac

[ -n "$ROOT" ] || die "--root is required"
git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "--root '$ROOT' is not a git repo"

# realpath that tolerates non-existent / odd paths
rp() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }

assert_clean_root() {
  [ -z "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ] || \
    die "root working tree is dirty — commit or stash before merge-back"
}

assert_target_checked_out() {
  local head; head="$(git -C "$ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || echo)"
  [ "$head" = "$TARGET" ] || \
    die "root HEAD is '$head', expected target '$TARGET' — the merge applies to the branch checked out at --root"
}

case "$SUB" in
  inspect)
    [ -n "$TARGET" ] && [ -n "$SOURCE" ] || die "inspect needs --target and --source"
    git -C "$ROOT" rev-parse --verify -q "$SOURCE" >/dev/null || die "source branch '$SOURCE' not found"
    git -C "$ROOT" rev-parse --verify -q "$TARGET" >/dev/null || die "target branch '$TARGET' not found"
    assert_clean_root
    COUNT=$(git -C "$ROOT" rev-list --count "$TARGET..$SOURCE" 2>/dev/null || echo 0)
    FILES=$(git -C "$ROOT" diff --stat "$TARGET...$SOURCE" 2>/dev/null)
    BASE=$(git -C "$ROOT" merge-base "$TARGET" "$SOURCE" 2>/dev/null)
    note "commits ($TARGET..$SOURCE): $COUNT"
    note "merge-base: ${BASE:-<none>}"
    note "--- git log --oneline $TARGET..$SOURCE ---"
    git -C "$ROOT" log --oneline "$TARGET..$SOURCE"
    note "--- git diff --stat $TARGET...$SOURCE ---"
    printf '%s\n' "$FILES"
    if   [ "$COUNT" -eq 0 ]; then note "RECOMMEND: nothing to merge — $SOURCE has no commits beyond $TARGET"
    elif [ "$COUNT" -eq 1 ]; then note "RECOMMEND: ff-only (single commit)"
    elif [ "$COUNT" -le 5 ]; then note "RECOMMEND: merge-commit (small feature history)"
    else                          note "RECOMMEND: squash (many commits)"
    fi
    ;;

  merge)
    [ -n "$TARGET" ] && [ -n "$SOURCE" ] && [ -n "$STRATEGY" ] || die "merge needs --target, --source, --strategy"
    assert_clean_root
    assert_target_checked_out
    case "$STRATEGY" in
      merge-commit)
        git -C "$ROOT" merge --no-ff --no-edit "$SOURCE" && { note "merged $SOURCE into $TARGET (merge commit)"; exit 0; }
        ;;
      ff-only)
        if git -C "$ROOT" merge --ff-only "$SOURCE"; then note "fast-forwarded $TARGET to $SOURCE"; exit 0
        else die "fast-forward not possible — $TARGET has diverged from $SOURCE; pick merge-commit or squash"; fi
        ;;
      squash)
        if git -C "$ROOT" merge --squash "$SOURCE"; then
          git -C "$ROOT" commit -m "merge: squash $SOURCE into $TARGET" && { note "squash-merged $SOURCE into $TARGET"; exit 0; }
        fi
        ;;
      rebase-ff)
        [ -n "$WORKTREE" ] || die "rebase-ff needs --worktree (source is rebased inside its own worktree)"
        [ -d "$WORKTREE" ] || die "rebase-ff: worktree '$WORKTREE' not found"
        if ! git -C "$WORKTREE" rebase "$TARGET"; then
          note "REBASE CONFLICTS in worktree $WORKTREE — resolve, 'git -C $WORKTREE rebase --continue', then re-run merge"
          exit 3
        fi
        git -C "$ROOT" merge --ff-only "$SOURCE" && { note "rebased $SOURCE onto $TARGET and fast-forwarded"; exit 0; }
        ;;
      *) die "unknown strategy '$STRATEGY' (merge-commit|ff-only|squash|rebase-ff)" ;;
    esac
    # fell through a non-ff strategy: distinguish conflicts from other failure
    if [ -n "$(git -C "$ROOT" ls-files -u 2>/dev/null)" ]; then
      note "MERGE CONFLICTS — resolve in the root working tree, 'git -C $ROOT add' each, then commit"
      exit 3
    fi
    die "merge failed without recorded conflicts — inspect 'git -C $ROOT status' manually"
    ;;

  cleanup)
    [ -n "$SOURCE" ] || die "cleanup needs --source"
    if [ -n "$WORKTREE" ]; then
      # HARD GUARD: never remove the worktree the session is standing in.
      PWD_RP="$(rp "$PWD")"; WT_RP="$(rp "$WORKTREE")"
      case "$PWD_RP/" in
        "$WT_RP/"*)
          echo "merge-back: REFUSING cleanup — session CWD ($PWD_RP) is inside the worktree to be removed ($WT_RP)." >&2
          echo "Relocate first: ExitWorktree(action=\"keep\") if this session entered it, else \`cd $ROOT\` in the main session. Then re-run cleanup." >&2
          exit 4 ;;
      esac
      if [ -d "$WORKTREE" ]; then
        git -C "$ROOT" worktree remove "$WORKTREE" || die "git worktree remove failed for '$WORKTREE' (dirty? use git -C '$ROOT' worktree remove --force after checking)"
        note "removed worktree $WORKTREE"
      else
        git -C "$ROOT" worktree prune
        note "worktree path '$WORKTREE' already gone — pruned"
      fi
    fi
    if git -C "$ROOT" rev-parse --verify -q "$SOURCE" >/dev/null; then
      git -C "$ROOT" branch -d "$SOURCE" && note "deleted branch $SOURCE" \
        || die "branch -d '$SOURCE' refused (not fully merged?) — verify, then 'git -C $ROOT branch -D $SOURCE' only if intended"
    else
      note "branch '$SOURCE' already gone"
    fi
    ;;

  verify)
    note "--- git log --oneline -3 ($ROOT) ---"
    git -C "$ROOT" log --oneline -3
    note "--- git status ($ROOT) ---"
    git -C "$ROOT" status --short --branch
    note "--- git worktree list ---"
    git -C "$ROOT" worktree list
    ;;

  *) die "unknown subcommand '$SUB' (inspect|merge|cleanup|verify)" ;;
esac
