#!/usr/bin/env bash
# UserPromptSubmit hook: enforce the spec state machine at the command boundary.
#   /spec:design requires status: hardened
#   /spec:build  requires status: hardened (or implementing, for a resume)
#   /spec:review requires status: implementing (or done, for a re-run)
# Exit 2 blocks the prompt and shows stderr to the user. Exit 0 allows.
set -u

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

case "$PROMPT" in
  /spec:design*|/spec:build*|/spec:review*) ;;
  *) exit 0 ;;
esac

# Extract the first specs/... .md path from the prompt (with or without @ prefix).
SPEC=$(printf '%s' "$PROMPT" | grep -oE '[^ @"]*specs/[^ "]+\.md' | head -1)
[ -z "$SPEC" ] && exit 0   # no path to validate — let the command's own gate handle it

ROOT="${CLAUDE_PROJECT_DIR:-.}"
FILE="$SPEC"
[ -f "$FILE" ] || FILE="$ROOT/$SPEC"
[ -f "$FILE" ] || exit 0   # nonexistent path — command will surface that itself

STATUS=$(awk '/^---[[:space:]]*$/{f++; next} f==1 && /^status:/{print $2; exit}' "$FILE")

case "$PROMPT" in
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
