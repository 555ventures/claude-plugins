#!/usr/bin/env bash
# UserPromptSubmit hook: enforce the spec state machine at the command boundary.
#   /spec:run    requires status: hardened, implementing, or done (the loop's resume and
#                no-op entries — a /clear then re-pasting /spec:run <spec>) — the design, build
#                and review stages are reached only through this command; they are prose under
#                spec/doctrine/stages/, not invokable commands, so they carry no arm of their own
#   /spec:plan   requires zero [NEEDS CLARIFICATION] markers in the spec
#   Marker gate: the frontmatter `open_markers:` counter is written by the planning session
#                about itself, so the gate never trusts it alone — a counter above 0 blocks, and
#                a counter of 0 is re-verified by counting live `[NEEDS CLARIFICATION:` markers in
#                the body; any live hit blocks. Narration that quotes the marker drops the colon
#                form (write `[NEEDS CLARIFICATION]` bare) — the recount is the contract.
# Also warns (stdout → injected context, never a block) on exactly the two gated
# commands (/spec:plan, /spec:run — the same case pattern below) when the host grounding
# layer's contractHash stamp fails to match the plugin's grounding-contract file —
# fully automatic; no version bookkeeping involved. A config with no generatedBy has no
# grounding layer yet and gets no warning.
# Owner: specs/20261005/02-connect-runs-first.md
# Exit 2 blocks the prompt and shows stderr to the user. Exit 0 allows.
set -u

# `jq` is a hard dependency of every UserPromptSubmit gate: without it the prompt cannot be
# extracted, so the empty-PROMPT early exit below would silently allow every gated command and
# the whole hook-enforced state machine would be off with no signal. That is the one failure a
# host must never absorb quietly, so an absent jq announces itself instead. stdout on this hook
# is injected context, never a block — the session still runs, it just knows the gates are down.
# This gate owns the notice for all three UserPromptSubmit hooks (genesis-state-gate.sh and
# spec-session-stamp.sh share the same dependency), so exactly one warning appears per prompt.
if ! command -v jq >/dev/null 2>&1; then
  echo "spec plugin: \`jq\` is not installed, so the hook-enforced state machine cannot run — /spec:plan and /spec:run are NOT being checked against spec status, and the grounding-drift warning is off. Install jq (macOS: brew install jq · Debian/Ubuntu: apt-get install jq). This notice repeats on every prompt until jq is present."
  exit 0
fi

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

case "$PROMPT" in
  /spec:plan*|/spec:run*) ;;
  *) exit 0 ;;
esac

# --- Grounding-contract drift: warn, never block ---------------------------
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)}"
CONTRACT_HASH=$("$PLUGIN_ROOT/bin/spec-paths" contract-hash 2>/dev/null)
CONFIG="${CLAUDE_PROJECT_DIR:-.}/.claude/spec.config.json"
if [ -n "$CONTRACT_HASH" ] && [ -f "$CONFIG" ]; then
  STAMPED=$(jq -r '.contractHash // empty' "$CONFIG" 2>/dev/null)
  GENERATED_BY=$(jq -r '.generatedBy // empty' "$CONFIG" 2>/dev/null)
  if [ -n "$GENERATED_BY" ] && [ "$STAMPED" != "$CONTRACT_HASH" ]; then
    echo "Spec grounding drift: the plugin's grounding contract (hash $CONTRACT_HASH) no longer matches .claude/spec.config.json's contractHash stamp ('${STAMPED:-<missing>}', generatedBy '${GENERATED_BY:-<unknown>}') — the grounding layer predates current plugin contracts. Run /spec:doctor to assess (or /spec:init to refresh). Proceeding is fine if the drift is known-benign."
  fi
fi

case "$PROMPT" in
  /spec:plan*) exit 0 ;;
esac

# Extract the first specs/... .md path from the prompt (with or without @ prefix).
SPEC=$(printf '%s' "$PROMPT" | grep -oE '[^ @"]*specs/[^ "]+\.md' | head -1)
[ -z "$SPEC" ] && exit 0   # no path to validate — let the command's own gate handle it

ROOT="${CLAUDE_PROJECT_DIR:-.}"
FILE="$SPEC"
[ -f "$FILE" ] || FILE="$ROOT/$SPEC"
[ -f "$FILE" ] || exit 0   # nonexistent path — command will surface that itself

# Marker gate. The frontmatter `open_markers:` counter is self-reported by /spec:plan (the
# session that wrote the spec), so a 0 is never taken on trust: the body is re-counted for
# live `[NEEDS CLARIFICATION:` markers (colon form) and any hit blocks, whatever the counter
# says. Narration that quotes a resolved marker uses the bare `[NEEDS CLARIFICATION]` form.
OPEN_MARKERS=$(awk '/^---[[:space:]]*$/{f++; next} f==1 && /^open_markers:/{print $2; exit}' "$FILE")
case "${OPEN_MARKERS:-0}" in
  0) ;;
  *)
    echo "Spec state gate: $SPEC declares open_markers: $OPEN_MARKERS — unresolved [NEEDS CLARIFICATION] markers; resolve them via /spec:plan (which re-counts and rewrites the field) before proceeding." >&2
    exit 2
    ;;
esac
LIVE_MARKERS=$(grep -c '\[NEEDS CLARIFICATION:' "$FILE")
if [ "$LIVE_MARKERS" -gt 0 ]; then
  echo "Spec state gate: $SPEC has $LIVE_MARKERS live [NEEDS CLARIFICATION: …] marker line(s) while open_markers declares ${OPEN_MARKERS:-<missing>} — the counter is self-reported and the gate re-counts. Resolve each marker via /spec:plan (record the ruling in Decisions); a quote of a resolved marker drops the colon form." >&2
  exit 2
fi

STATUS=$(awk '/^---[[:space:]]*$/{f++; next} f==1 && /^status:/{print $2; exit}' "$FILE")

case "$PROMPT" in
  /spec:run*)
    case "$STATUS" in
      hardened|implementing|done) exit 0 ;;
    esac
    echo "Spec state gate: /spec:run requires status: hardened, implementing, or done — $SPEC has status: ${STATUS:-<missing>}. Run /spec:plan first." >&2
    exit 2
    ;;
esac
exit 0
