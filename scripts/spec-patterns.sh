#!/usr/bin/env bash
# Mechanical shortcut-pattern sweep — deterministic input to /spec:review.
# Usage: [DIFF_BASE=<ref>] scripts/spec-patterns.sh [dir ...]    (defaults to spec git autopilot tests scripts)
# Pure report: always exits 0. Sanctioned exceptions exist — the reviewer judges; this only counts.
set -u
DIRS=("$@")
[ ${#DIRS[@]} -eq 0 ] && DIRS=(spec git autopilot tests scripts)
# Drop dirs that don't exist yet (autopilot grows over time).
EXISTING=()
for d in "${DIRS[@]}"; do [ -d "$d" ] && EXISTING+=("$d"); done
DIRS=("${EXISTING[@]}")
echo "## Mechanical pattern sweep"; echo "Scope: ${DIRS[*]}"; echo
sweep() {
  local name="$1"; shift
  local out; out=$(rg -n "$@" "${DIRS[@]}" 2>/dev/null || true)
  local count=0
  [ -n "$out" ] && count=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
  echo "### ${name}: ${count}"
  if [ -n "$out" ]; then
    printf '%s\n' "$out" | head -15 | sed 's/^/    /'
    [ "$count" -gt 15 ] && echo "    ... (${count} total)"
  fi
  echo
}
# Deferred work left in the diff.
sweep "deferred-work comments (TODO/FIXME/HACK/XXX)" -e 'TODO|FIXME|HACK\b|XXX' -g '!*.frag'
# Suite discipline: skipped/todo tests hide regressions.
sweep "skipped or todo tests" -e '\btest\.skip|\bit\.skip|\btest\.todo|\{ *skip: *true'
# Zero-dependency rule: any non-builtin require in scripts/tests is dependency creep.
sweep "non-builtin require() (dependency creep)" -P -e "require\('(?!node:|\./|\.\./)(?!fs'|path'|os'|child_process'|assert'|url'|crypto'|util'|events'|stream'|readline'|http'|https')" -g '*.js'
# Bash convention is `set -u` with explicit failures; `set -e` hides which step died.
sweep "set -e in bash (convention: set -u + explicit failures)" -e '^set -e' -g '*.sh'
# Closed-alphabet args: JSON.stringify into workflow args is the free-text incident class.
sweep "prose stringified into workflow args" -e 'args[^\n]*JSON\.stringify' -g '*.body.js' -g '*.md'
# Assertions without a consequence message read as noise at failure time.
sweep "single-arg assert.ok (no consequence message)" -e 'assert\.ok\([^,)]+\)\s*$' -g 'tests/*.test.js'
# Generated surface: wf-*.js must only change via the build step.
echo "### generated-surface edits vs ${DIFF_BASE:-main} (sanctioned tool: npm run build:workflows)"
git diff --name-only "${DIFF_BASE:-main}" -- 'spec/workflows/wf-*.js' 2>/dev/null | sed 's/^/    /'
echo
echo "Sweep complete. Counts are leads, not verdicts — sanctioned exceptions exist."
exit 0
