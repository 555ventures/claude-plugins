#!/usr/bin/env bash
# UserPromptSubmit hook: enforce the spec state machine at the command boundary.
#   /spec:design-brief requires status: hardened, implementing, or done
#   /spec:design requires status: hardened
#   /spec:build  requires status: hardened (or implementing, for a resume)
#   /spec:review requires status: implementing (or done, for a re-run)
#   all three    require zero [NEEDS CLARIFICATION] markers in the spec
# Also warns (stdout → injected context, never a block) on every pipeline command
# when the host grounding layer's contractHash stamp no longer matches the plugin's
# grounding-contract file — fully automatic; no version bookkeeping involved.
# Exit 2 blocks the prompt and shows stderr to the user. Exit 0 allows.
set -u

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

case "$PROMPT" in
  /spec:plan*|/spec:design*|/spec:build*|/spec:review*) ;;
  *) exit 0 ;;
esac

# --- Grounding-contract drift: warn, never block ---------------------------
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)}"
CONTRACT_HASH=$("$PLUGIN_ROOT/bin/spec-paths" contract-hash 2>/dev/null)
CONFIG="${CLAUDE_PROJECT_DIR:-.}/.claude/spec.config.json"
if [ -n "$CONTRACT_HASH" ] && [ -f "$CONFIG" ]; then
  STAMPED=$(jq -r '.contractHash // empty' "$CONFIG" 2>/dev/null)
  if [ "$STAMPED" != "$CONTRACT_HASH" ]; then
    GENERATED_BY=$(jq -r '.generatedBy // empty' "$CONFIG" 2>/dev/null)
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

# Marker gate. Authoritative source: the frontmatter `open_markers:` counter, written
# mechanically at lock by /spec:plan (the count of LIVE markers after adjudication — quoted
# narration doesn't count). A prose grep is trippable by DESCRIBING the marker syntax in
# Rationale, so when the counter is present the grep is not consulted. Specs predating the
# counter fall back to the grep (live bracketed colon form only).
OPEN_MARKERS=$(awk '/^---[[:space:]]*$/{f++; next} f==1 && /^open_markers:/{print $2; exit}' "$FILE")
if [ -n "$OPEN_MARKERS" ]; then
  case "$OPEN_MARKERS" in
    0) ;;
    *)
      echo "Spec state gate: $SPEC declares open_markers: $OPEN_MARKERS — unresolved [NEEDS CLARIFICATION] markers; resolve them via /spec:plan (which re-counts and rewrites the field) before proceeding." >&2
      exit 2
      ;;
  esac
elif grep -q '\[NEEDS CLARIFICATION:' "$FILE"; then
  echo "Spec state gate: $SPEC contains unresolved [NEEDS CLARIFICATION] markers — resolve them via /spec:plan before proceeding." >&2
  exit 2
fi

STATUS=$(awk '/^---[[:space:]]*$/{f++; next} f==1 && /^status:/{print $2; exit}' "$FILE")

case "$PROMPT" in
  /spec:design-brief*)
    # Brief mode runs right after plan-lock; drift mode runs on shipped (done) specs.
    case "$STATUS" in
      hardened|implementing|done) exit 0 ;;
    esac
    echo "Spec state gate: /spec:design-brief requires status: hardened, implementing, or done — $SPEC has status: ${STATUS:-<missing>}. Run /spec:plan first." >&2
    exit 2
    ;;
  /spec:design*)
    case "$STATUS" in
      hardened) exit 0 ;;
    esac
    echo "Spec state gate: /spec:design requires status: hardened — $SPEC has status: ${STATUS:-<missing>}. Run /spec:plan first." >&2
    exit 2
    ;;
  /spec:build*)
    case "$STATUS" in
      hardened|implementing) exit 0 ;;
    esac
    echo "Spec state gate: /spec:build requires status: hardened (or implementing to resume) — $SPEC has status: ${STATUS:-<missing>}. Run /spec:plan first." >&2
    exit 2
    ;;
  /spec:review*)
    case "$STATUS" in
      implementing|done) exit 0 ;;
    esac
    echo "Spec state gate: /spec:review requires status: implementing (or done for a re-run) — $SPEC has status: ${STATUS:-<missing>}. Run /spec:build first." >&2
    exit 2
    ;;
esac
exit 0
