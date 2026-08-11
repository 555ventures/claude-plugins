#!/usr/bin/env bash
# Export THIS machine's Claude Code setup to another machine.
#
#   bash export.sh user@host   # ONE step: streams the setup over ssh and
#                              # applies it there. Nothing else to do.
#
#   bash export.sh             # no ssh access? copies a data block to the
#                              # clipboard; on the remote machine run
#                              #   bash <(curl -fsSL https://raw.githubusercontent.com/555ventures/claude-plugins/main/setup/import.sh)
#                              # and paste when prompted.
#
# Works for any user: it reads whatever config the current machine has
# (settings, statusline, hooks, user-scope MCP servers) and bundles it.
# Nothing secret is included: OAuth tokens stay in the keychain, and the
# permission allowlist (machine-local history, may contain private paths)
# is stripped.
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# --- gather ---------------------------------------------------------------
jq 'del(.permissions, .feedbackSurveyState)' "$CLAUDE_DIR/settings.json" \
  | sed "s|$HOME|__HOME__|g" > "$STAGE/settings.json"

[ -f "$CLAUDE_DIR/statusline-command.sh" ] && cp "$CLAUDE_DIR/statusline-command.sh" "$STAGE/"
[ -d "$CLAUDE_DIR/hooks" ] && cp -R "$CLAUDE_DIR/hooks" "$STAGE/hooks"
[ -f "$CLAUDE_DIR/keybindings.json" ] && cp "$CLAUDE_DIR/keybindings.json" "$STAGE/"
jq '.mcpServers // {}' "$HOME/.claude.json" > "$STAGE/mcp-servers.json"

# Directory-sourced marketplaces (local plugin repos) must exist on the
# remote machine too — record their git remotes so the installer can clone.
jq -r '(.extraKnownMarketplaces // {}) | to_entries[]
       | select(.value.source.source == "directory") | .value.source.path' \
  "$CLAUDE_DIR/settings.json" | while read -r p; do
    git -C "$p" remote get-url origin 2>/dev/null || true
  done > "$STAGE/plugin-repos.txt"

# --- embedded installer (runs on the remote machine) ----------------------
cat > "$STAGE/apply.sh" <<'APPLY'
#!/usr/bin/env bash
set -euo pipefail
CLAUDE_DIR="$HOME/.claude"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$CLAUDE_DIR/hooks"

[ -f "$CLAUDE_DIR/settings.json" ] && cp "$CLAUDE_DIR/settings.json" "$CLAUDE_DIR/settings.json.bak" && echo "Backed up existing settings.json -> settings.json.bak"

# Clone any local-directory plugin repos this setup depends on, at the same
# relative-to-$HOME path the source machine used.
while read -r url; do
  [ -n "$url" ] || continue
  dest="$HOME/Projects/$(basename "$url" .git)"
  [ -d "$dest/.git" ] || { mkdir -p "$HOME/Projects"; git clone "$url" "$dest"; }
  echo "Plugin repo ready: $dest"
done < "$HERE/plugin-repos.txt"

sed "s|__HOME__|$HOME|g" "$HERE/settings.json" > "$CLAUDE_DIR/settings.json"
[ -f "$HERE/statusline-command.sh" ] && cp "$HERE/statusline-command.sh" "$CLAUDE_DIR/" && chmod +x "$CLAUDE_DIR/statusline-command.sh"
[ -d "$HERE/hooks" ] && cp -R "$HERE/hooks/." "$CLAUDE_DIR/hooks/"
[ -f "$HERE/keybindings.json" ] && cp "$HERE/keybindings.json" "$CLAUDE_DIR/"

if command -v claude >/dev/null; then
  while read -r name; do
    json=$(jq -c --arg n "$name" '.[$n]' "$HERE/mcp-servers.json")
    claude mcp add-json --scope user "$name" "$json" >/dev/null 2>&1 \
      && echo "MCP added: $name" || echo "MCP skipped (exists?): $name"
  done < <(jq -r 'keys[]' "$HERE/mcp-servers.json")
else
  echo "⚠️  claude not installed — install it (npm i -g @anthropic-ai/claude-code),"
  echo "    then re-paste this block to register MCP servers."
fi

cat <<'DONE'

✅ Setup applied. One-time logins to finish (no keys to copy):
  1. claude          → log in; trust marketplaces when asked (plugins auto-install)
  2. /mcp            → authenticate any OAuth MCP servers (e.g. Neon, mobbin)
  3. CLI-based MCPs need their CLI, e.g.: brew install railway && railway login
DONE
APPLY
chmod +x "$STAGE/apply.sh"

# --- ssh mode: stream + apply in one step ---------------------------------
if [ $# -ge 1 ]; then
  TARGET="$1"
  echo "🚀 Streaming setup to $TARGET ..."
  tar -czf - -C "$STAGE" . \
    | ssh "$TARGET" 'D=$(mktemp -d) && tar -xzf - -C "$D" && bash "$D/apply.sh" && rm -rf "$D"'
  echo "✅ Setup applied on $TARGET."
  exit 0
fi

# --- emit one paste-able data block ---------------------------------------
# Pure data: base64 tarball + end marker. import.sh reads until the marker.
BLOCK=$(tar -czf - -C "$STAGE" . | base64; echo "555-SETUP-END")

IMPORT_CMD='bash <(curl -fsSL https://raw.githubusercontent.com/555ventures/claude-plugins/main/setup/import.sh)'

# Auto-copy to clipboard when possible (macOS pbcopy / Linux xclip|wl-copy)
if command -v pbcopy >/dev/null; then
  printf '%s\n' "$BLOCK" | pbcopy
elif command -v wl-copy >/dev/null; then
  printf '%s\n' "$BLOCK" | wl-copy
elif command -v xclip >/dev/null; then
  printf '%s\n' "$BLOCK" | xclip -selection clipboard
else
  cat <<EOF

# ── Copy EVERYTHING between the lines (no clipboard tool found) ──
$BLOCK
# ─────────────────────────────────────────────────────────────────
EOF
  echo "Then on the remote machine, run:"
  echo "  $IMPORT_CMD"
  echo "and paste when prompted. (Remote prereqs: jq + git)"
  exit 0
fi

cat <<EOF
✅ Setup block copied to clipboard ($(printf '%s' "$BLOCK" | wc -c | tr -d ' ') bytes).

On the remote machine, run:
  $IMPORT_CMD
and paste when prompted, then press Enter. (Remote prereqs: jq + git)
EOF
