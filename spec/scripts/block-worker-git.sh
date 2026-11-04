#!/usr/bin/env bash
# PreToolUse guard (matcher Bash): inside a lane worktree — its private git dir carries the
# `spec-lane-open` marker that run.js / fanout write — builder and reviewer agents may not run git
# commit/push/merge/rebase/reset/checkout. The driver commits and merges; a node process it spawns
# is not a Bash tool call, so the driver itself is never blocked.
# Global options before the verb (-C <p>, -c <k=v>, --flag[=v]) are skipped.
# Fail-open: no marker, cwd outside a repo, unparseable input, or no node all allow.
# Exit 0 allow · 2 block (BLOCKED: line on stderr).
set -u
command -v node >/dev/null 2>&1 || exit 0
parsed="$(node -e '
try { const j = JSON.parse(require("fs").readFileSync(0, "utf8"))
  process.stdout.write((j.cwd || "") + "\n" + ((j.tool_input || {}).command || "")) } catch {}' 2>/dev/null)" || exit 0
cwd="${parsed%%$'\n'*}"
cmd="${parsed#*$'\n'}"
[ "$cmd" != "$parsed" ] && [ -n "$cmd" ] || exit 0
[ -n "$cwd" ] || cwd="$PWD"

# Agents run from the main checkout (the Agent tool has no cwd), so `cd <dir>` and `git -C <dir>`
# targets count as well as cwd.
marked=""
while IFS= read -r d; do
  [ -n "$d" ] || continue
  case "$d" in /*) ;; *) d="$cwd/$d" ;; esac
  gd="$(git -C "$d" rev-parse --absolute-git-dir 2>/dev/null)" || continue
  if [ -f "$gd/spec-lane-open" ]; then marked="$gd"; break; fi
done < <(printf '%s\n' "$cwd"; printf '%s\n' "$cmd" | grep -oE '(^|[;&|(]|[[:space:]])(cd|-C)[[:space:]]+[^[:space:];&|)]+' | sed -E 's/.*(cd|-C)[[:space:]]+//' | tr -d "\"'")
[ -n "$marked" ] || exit 0
gd="$marked"

BLOCK='commit|push|merge|rebase|reset|checkout'
RE='(^|[;&|(`]|[[:space:]])git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--[a-z-]+(=[^[:space:]]+)?))*[[:space:]]+[a-z][a-z-]*'
verb=""
while IFS= read -r m; do
  v="${m##*[[:space:]]}"
  if printf '%s' "$v" | grep -qxE "$BLOCK"; then verb="$v"; break; fi
done < <(printf '%s\n' "$cmd" | grep -oE "$RE")
[ -n "$verb" ] || exit 0

{
  echo "BLOCKED: git $verb inside a spec lane worktree (${gd%/.git*}) — agents never run git here; /spec:run commits and merges at its own steps."
  echo "  stale marker (no run in flight)? remove $gd/spec-lane-open"
} >&2
exit 2
