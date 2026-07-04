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
#   create   --source S [--root R] [--base REF] [--name N]
#                             -> deterministically `git worktree add` the build tree under
#                                .claude/worktrees/, then print its ABSOLUTE path as the LAST
#                                stdout line. The caller passes that path to EnterWorktree
#                                {path:} and VERIFIES entry. This is the front half of the
#                                lifecycle: it fails LOUDLY (branch/path exists, bad base,
#                                run-from-worktree) so /spec:build never silently lands on the
#                                root branch when isolation was requested. Defaults: base=HEAD,
#                                name=S with '/'->'-'. Must run from the MAIN working tree.
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

ROOT=""; TARGET=""; SOURCE=""; STRATEGY=""; WORKTREE=""; BASE=""; NAME=""
SUB="${1:-}"; shift || true
while [ $# -gt 0 ]; do
  # Every flag REQUIRES a value; a trailing/valueless flag dies loudly. (The old `shift 2` on a
  # 1-arg tail shifted nothing and spun this loop forever.)
  case "$1" in
    --root|--target|--source|--strategy|--worktree|--base|--name)
      [ $# -ge 2 ] || die "flag $1 requires a value"
      case "$2" in --*) die "flag $1 requires a value (got flag '$2')" ;; esac
      ;;
    *) die "unknown arg: $1" ;;
  esac
  case "$1" in
    --root)     ROOT="$2" ;;
    --target)   TARGET="$2" ;;
    --source)   SOURCE="$2" ;;
    --strategy) STRATEGY="$2" ;;
    --worktree) WORKTREE="$2" ;;
    --base)     BASE="$2" ;;
    --name)     NAME="$2" ;;
  esac
  shift 2
done

# realpath that tolerates non-existent / odd paths (also used by the early `create` case)
rp() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }

case "$SUB" in
  ""|-h|--help|help)
    grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
  create)
    # Front half of the worktree lifecycle. `git worktree add` is deterministic and
    # debuggable; EnterWorktree {name:} is a single opaque step that can fail to enter
    # (base-ref fetch, name collision) and leave the build running on the root branch.
    # So: create here, loudly; the caller then EnterWorktree {path:} into this exact path
    # and VERIFIES the session actually moved. All diagnostics go to stderr; the LAST
    # stdout line is the absolute worktree path for the caller to capture.
    [ -n "$SOURCE" ] || die "create needs --source (the new build branch name)"
    CROOT="${ROOT:-$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null)}"
    [ -n "$CROOT" ] || die "create: not inside a git repo and no --root given"
    git -C "$CROOT" rev-parse --git-dir >/dev/null 2>&1 || die "create: '$CROOT' is not a git repo"
    CROOT="$(rp "$CROOT")"   # canonicalize so the registered path == the printed path == what the verify gate compares
    # First porcelain line is `worktree <path>`; strip the prefix (never awk $2 — paths can contain spaces).
    MAIN="$(git -C "$CROOT" worktree list --porcelain 2>/dev/null | head -1 | sed -n 's/^worktree //p')"
    [ "$(rp "$CROOT")" = "$(rp "$MAIN")" ] || die "create: run from the main working tree ($MAIN), not a worktree ($CROOT)"
    git -C "$CROOT" rev-parse -q --verify HEAD >/dev/null 2>&1 || \
      die "create: repository has no commits yet — 'git worktree add' cannot branch from an unborn HEAD. Make an initial commit first (a greenfield repo straight from 'git init' hits this)."
    NAME="${NAME:-$(printf '%s' "$SOURCE" | tr '/' '-')}"
    WT="$CROOT/.claude/worktrees/$NAME"
    # The worktree lives inside the repo; if its path isn't gitignored it shows as untracked
    # and the root tree reads dirty, which trips assert_clean_root at merge time. Catch it now
    # (not after the build) and don't auto-edit .gitignore — that would itself dirty the root.
    git -C "$CROOT" check-ignore -q ".claude/worktrees/$NAME" || \
      die "create: '.claude/worktrees/' is not gitignored — the worktree would dirty the root tree and break merge-back's clean-root gate. Add '.claude/worktrees/' to .gitignore and commit it once, then retry."
    git -C "$CROOT" rev-parse --verify -q "refs/heads/$SOURCE" >/dev/null 2>&1 && \
      die "create: branch '$SOURCE' already exists — pick a new spec branch name or finish/clean up the prior build"
    [ -e "$WT" ] && die "create: worktree path already exists ($WT) — remove it or pass a different --name"
    BASE="${BASE:-HEAD}"
    git -C "$CROOT" rev-parse --verify -q "$BASE" >/dev/null 2>&1 || die "create: base ref '$BASE' not found"
    git -C "$CROOT" worktree add -b "$SOURCE" "$WT" "$BASE" >&2 || die "create: 'git worktree add' failed"
    echo "merge-back: created worktree '$NAME' (branch '$SOURCE', base '$BASE') at $WT" >&2
    rp "$WT"            # absolute path — the LAST stdout line, for EnterWorktree {path:} and --worktree
    exit 0 ;;
  root)
    # Authoritative project root = the FIRST entry of `git worktree list` (the main
    # worktree). Self-discovers from --worktree or $PWD; never requires --root. This is
    # the path the caller must `cd` to — NOT $HOME, NOT `~`, NOT a bare `cd`.
    INSIDE="${WORKTREE:-$PWD}"
    # First porcelain line is `worktree <path>`; strip the prefix (never awk $2 — paths can contain spaces).
    MAIN_LINE="$(git -C "$INSIDE" worktree list --porcelain 2>/dev/null | head -1)"
    case "$MAIN_LINE" in
      "worktree "*) printf '%s\n' "${MAIN_LINE#worktree }" ;;
      *) echo "merge-back: could not determine project root from '$INSIDE'" >&2; exit 2 ;;
    esac
    exit 0 ;;
esac

[ -n "$ROOT" ] || die "--root is required"
git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "--root '$ROOT' is not a git repo"

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
          if git -C "$ROOT" diff --cached --quiet; then
            note "nothing to squash — $SOURCE adds no changes beyond $TARGET"; exit 0
          fi
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

  *) die "unknown subcommand '$SUB' (create|root|inspect|merge|cleanup|verify)" ;;
esac
