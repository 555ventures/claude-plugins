#!/usr/bin/env bash
# SessionStart hook guard for the derived session queue (D8, specs/20260823/08-derived-
# session-queue.md). Why a bash guard in front of spec-queue.js: every session in every
# host repo pays this hook's cost at startup, even repos that never adopted the queue — so
# the guard must cost ~0 (one or two `git` calls) before ever paying for a node process.
# It never seeds or writes (D7/D8 — the hook must never create the file, and this guard
# never calls a write subcommand); it only decides WHICH read to delegate to:
# `spec-queue.js hello` in a main checkout, or its own finish-this-tree-first line (derived
# from the tree's own `--next`) inside a linked worktree, where the global queue's top pick
# would mislead mid-spec (D9) — the hazard this repo's own plan named by name.
#
# What this deliberately does NOT do: create spec-queue.json (only an explicit spec-queue
# write subcommand seeds, D7); read or reconcile the queue file itself (spec-queue.js hello
# owns that read); fire on `compact`/`fork` (hooks.json's matcher is `startup|resume|clear`
# only — a mid-task context refresh is not a fresh session, D8's rationale).
#
# Exit codes: always 0 — a SessionStart hook must never surface a session-start error;
# silence is a valid, common outcome (no git repo, or a repo that never adopted a queue).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || exit 0
COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 0
case "$GIT_DIR" in /*) ;; *) GIT_DIR="$PWD/$GIT_DIR" ;; esac
case "$COMMON_DIR" in /*) ;; *) COMMON_DIR="$PWD/$COMMON_DIR" ;; esac

if [ "$GIT_DIR" != "$COMMON_DIR" ]; then
  # D9: a linked worktree — the global queue would mislead mid-spec, so print only this
  # tree's own --next top line, never delegate to hello (which would show the global top).
  NEXT_OUT="$(node "$ROOT/scripts/spec-status.js" --root "$PWD" --next 2>/dev/null)"
  TOP_LINE="$(printf '%s\n' "$NEXT_OUT" | sed -n '2p')"
  case "$TOP_LINE" in ""|"✨"*) exit 0 ;; esac
  echo "🧭 worktree session — finish this tree's spec first:"
  echo "$TOP_LINE"
  exit 0
fi

[ -f "$COMMON_DIR/spec-queue.json" ] || exit 0
node "$ROOT/scripts/spec-queue.js" hello
exit 0
