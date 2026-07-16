#!/usr/bin/env bash
# UserPromptSubmit hook: enforce the genesis state machine at the command boundary.
#   /spec:genesis-explore requires architect: scaffold-complete (and the stack descriptor to exist)
#   /spec:genesis-design  requires the same, PLUS explore: picked|skipped (legacy status files
#                         with no explore field pass with an injected warning — pre-v6 genesis)
#   /spec:init            when a .claude/genesis/ exists: BLOCK on a partial design canon; warn on gaps
# Coarse gate only — the commands themselves do artifact-level re-entry verification.
# The hook is inert unless a .claude/genesis/status.json is present, so brownfield /spec:init runs
# (repos that never used the genesis stage) are never touched.
# Exit 2 blocks the prompt and shows stderr to the user. Exit 0 allows; stdout is injected context.
set -u

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

case "$PROMPT" in
  /spec:genesis-architect*|/spec:genesis-explore*|/spec:genesis-design*|/spec:init*) ;;
  *) exit 0 ;;
esac

# /spec:genesis-architect is the entry point — it owns its own re-entry; never gated here.
case "$PROMPT" in
  /spec:genesis-architect*) exit 0 ;;
esac

ROOT="${CLAUDE_PROJECT_DIR:-.}"
STATUS="$ROOT/.claude/genesis/status.json"
[ -f "$STATUS" ] || exit 0   # no genesis in play → nothing to enforce

ARCH=$(jq -r '.architect // "pending"' "$STATUS" 2>/dev/null)
EXPL=$(jq -r 'if has("explore") then .explore else "ABSENT" end' "$STATUS" 2>/dev/null)
DES=$(jq -r '.design // "pending"' "$STATUS" 2>/dev/null)
DESC=$(jq -r '.stackDescriptorPath // ".claude/genesis/stack-descriptor.json"' "$STATUS" 2>/dev/null)

require_scaffold() {
  # $1 = command name for the message
  if [ "$ARCH" != "scaffold-complete" ]; then
    echo "Genesis state gate: $1 requires architect: scaffold-complete — .claude/genesis/status.json has architect: ${ARCH:-<missing>}. Finish /spec:genesis-architect first (decisions recorded, project scaffolded, zero-day gate green)." >&2
    exit 2
  fi
  if [ ! -f "$ROOT/$DESC" ] && [ ! -f "$DESC" ]; then
    echo "Genesis state gate: status says architect: scaffold-complete but the stack descriptor ($DESC) is missing — the scaffold state is inconsistent. Re-run /spec:genesis-architect to reconcile before continuing." >&2
    exit 2
  fi
}

case "$PROMPT" in
  /spec:genesis-explore*)
    require_scaffold "/spec:genesis-explore"
    exit 0
    ;;
  /spec:genesis-design*)
    require_scaffold "/spec:genesis-design"
    case "$EXPL" in
      picked|skipped) ;;
      ABSENT)
        # legacy status.json predating the explore stage — allow, but say why it passed
        echo "Genesis note: this status.json predates /spec:genesis-explore (no explore field) — genesis-design will run its legacy direction interview instead of ratifying a pick. New projects should run /spec:genesis-explore first."
        ;;
      *)
        echo "Genesis state gate: /spec:genesis-design requires explore: picked (or skipped) — the pick precedes the lock. status.json has explore: ${EXPL:-pending}. Finish /spec:genesis-explore first (research brief signed off, candidates rendered, design-pick.json recorded)." >&2
        exit 2
        ;;
    esac
    exit 0
    ;;
  /spec:init*)
    case "$DES" in
      rules-locked|skipped) exit 0 ;;
      doctrine-drafted|tokens-landed)
        echo "Genesis state gate: /spec:init found a partial design canon (design: $DES) — /spec:genesis-design has not locked its rules. Finish /spec:genesis-design (or mark it skipped for a headless archetype) before grounding, so spec:init consumes one canon instead of half-adopting." >&2
        exit 2
        ;;
      *)
        # design pending: not an error — a headless archetype legitimately has no design stage.
        echo "Genesis note: a .claude/genesis/ exists but /spec:genesis-design has not run (design: ${DES:-pending}). If this archetype has no UI that is expected — spec:init will write no design block. Otherwise run /spec:genesis-design first so spec:init can ground the design canon."
        exit 0
        ;;
    esac
    ;;
esac
exit 0
