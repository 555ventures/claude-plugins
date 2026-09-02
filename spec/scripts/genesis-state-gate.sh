#!/usr/bin/env bash
# UserPromptSubmit hook: enforce the genesis state machine at the command boundary.
#   /spec:init   when a .claude/genesis/ exists: BLOCK on a partial design canon; warn on gaps
# Coarse gate only — the commands themselves do artifact-level re-entry verification.
# The hook is inert unless a .claude/genesis/status.json is present, so brownfield /spec:init runs
# (repos that never used the genesis stage) are never touched.
# Exit 2 blocks the prompt and shows stderr to the user. Exit 0 allows; stdout is injected context.
#
# specs/20260827/03-genesis-design-state.md D6: the design lock folds into the driver
# as the new DESIGN state; the retired design-lock command is deleted, and this hook's own arm for
# it — shared with the already-retired explore command's arm from
# specs/20260827/02-genesis-explore-state.md via the same require_scaffold helper — is deleted
# too. Both retired commands' prompts now fall through untouched (exit 0, no arm) at every state.
# The init arm below is untouched in behavior (its exit codes per `design` value are
# byte-identical); only its messages are reworded to point at the genesis design state instead of
# the deleted command.
set -u

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

case "$PROMPT" in
  "/spec:genesis "*|"/spec:genesis"|/spec:init*) ;;
  *) exit 0 ;;
esac

# /spec:genesis is the entry point — it owns its own re-entry; never gated here.
case "$PROMPT" in
  "/spec:genesis "*|"/spec:genesis") exit 0 ;;
esac

ROOT="${CLAUDE_PROJECT_DIR:-.}"
STATUS="$ROOT/.claude/genesis/status.json"
[ -f "$STATUS" ] || exit 0   # no genesis in play → nothing to enforce

DES=$(jq -r '.design // "pending"' "$STATUS" 2>/dev/null)

case "$PROMPT" in
  /spec:init*)
    case "$DES" in
      rules-locked|skipped) exit 0 ;;
      doctrine-drafted|tokens-landed)
        echo "Genesis state gate: /spec:init found a partial design canon (design: $DES) — the genesis design state (re-run /spec:genesis) has not locked its rules. Finish it (or reach design: skipped for a headless archetype) before grounding, so spec:init consumes one canon instead of half-adopting." >&2
        exit 2
        ;;
      *)
        # design pending: not an error — a headless archetype legitimately has no design stage.
        echo "Genesis note: a .claude/genesis/ exists but the genesis design state has not run (design: ${DES:-pending}). If this archetype has no UI that is expected — spec:init will write no design block. Otherwise re-run /spec:genesis first so spec:init can ground the design canon."
        exit 0
        ;;
    esac
    ;;
esac
exit 0
