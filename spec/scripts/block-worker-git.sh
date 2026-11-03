#!/usr/bin/env bash
# PreToolUse guard (matcher Bash): refuse non-read-only git while a build wave is open.
#
# Usage: reads the PreToolUse JSON on stdin; wired in hooks/hooks.json.
# Owner: specs/20261103/03-workers-never-run-git.md (D1, D3, D4) — the mechanical enforcer of
# core § Worker Git Ban. The signal is the plugin-owned `spec-wave-open` file in the cwd tree's
# PRIVATE git dir, kept in sync by spec-build-driver.js; never an env var, never agent identity
# (`agent_type` is read for the message only).
#
# Verb policy: an allowlist of read-only verbs; every other verb is refused. Global options
# before the verb (-C <path>, -c <k=v>, --flag[=value]) are skipped by the extraction grammar.
#
# Does NOT: write or clear the marker (the driver does), run any git write, or decide on
# anything but marker presence + verb. Fail-open: no marker, cwd outside a repo, no git
# invocation, a git invocation inside quotes, or jq absent all allow.
#
# Exit codes: 0 allow (every fail-open branch) · 2 block, BLOCKED: line on stderr
set -u

command -v jq >/dev/null 2>&1 || exit 0
input="$(cat)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
agent="$(printf '%s' "$input" | jq -r '.agent_type // empty' 2>/dev/null)"
[ -n "$cmd" ] || exit 0
[ -n "$cwd" ] || cwd="$PWD"

gd="$(git -C "$cwd" rev-parse --git-dir 2>/dev/null)" || exit 0
[ -n "$gd" ] || exit 0
case "$gd" in /*) ;; *) gd="$cwd/$gd" ;; esac
marker="$gd/spec-wave-open"
[ -f "$marker" ] || exit 0

ALLOW='status|diff|log|show|rev-parse|ls-files|ls-tree|blame|grep|describe|cat-file|name-rev|shortlog|rev-list|merge-base|show-ref|diff-tree|version|help'
RE='(^|[;&|(`]|[[:space:]])git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--[a-z-]+(=[^[:space:]]+)?))*[[:space:]]+[a-z][a-z-]*'

verb=""
while IFS= read -r m; do
  v="${m##*[[:space:]]}"
  if ! printf '%s' "$v" | grep -qxE "$ALLOW"; then verb="$v"; break; fi
done < <(printf '%s\n' "$cmd" | grep -oE "$RE")
[ -n "$verb" ] || exit 0

mspec="$(jq -r '.spec // "unknown spec"' "$marker" 2>/dev/null)" || mspec="unknown spec"
mstate="$(jq -r '.state // "unknown state"' "$marker" 2>/dev/null)" || mstate="unknown state"
driver="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)}/scripts/spec-build-driver.js"
{
  echo "BLOCKED: git $verb during $mstate of $mspec — implementation workers never run git (core § Worker Git Ban); the orchestrator commits at the checkpoint step after this step closes."
  echo "  agent: ${agent:-session}"
  echo "  stale marker (no build running)? the driver clears it on its next step-print: node $driver $mspec"
} >&2
exit 2
