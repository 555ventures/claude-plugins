#!/usr/bin/env bash
# Export THIS machine's Claude Code setup as one paste-able block.
#
#   bash export.sh          # prints a block — copy it, paste into the remote
#                           # machine's terminal, press enter. That's it.
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

# --- emit one paste-able block -------------------------------------------
B64=$(tar -czf - -C "$STAGE" . | base64)

BLOCK=$(cat <<EOF
D=\$(mktemp -d) && base64 -d <<'CCSETUP' | tar -xzf - -C "\$D" && bash "\$D/apply.sh"
$B64
CCSETUP
EOF
)

# Auto-copy to clipboard when possible (macOS pbcopy / Linux xclip|wl-copy)
if command -v pbcopy >/dev/null; then
  printf '%s\n' "$BLOCK" | pbcopy
  echo "✅ Setup block copied to clipboard ($(printf '%s' "$BLOCK" | wc -c | tr -d ' ') bytes)."
  echo "   Paste into the remote machine's terminal and press enter."
  echo "   (Remote prereqs: jq + git — brew install jq git)"
elif command -v wl-copy >/dev/null; then
  printf '%s\n' "$BLOCK" | wl-copy
  echo "✅ Setup block copied to clipboard. Paste into the remote terminal."
elif command -v xclip >/dev/null; then
  printf '%s\n' "$BLOCK" | xclip -selection clipboard
  echo "✅ Setup block copied to clipboard. Paste into the remote terminal."
else
  cat <<EOF

# ───────────────────────────────────────────────────────────────
# Copy EVERYTHING between the lines, paste into the remote
# machine's terminal, press enter.
# Prereqs there: jq + git  (brew install jq git)
# ───────────────────────────────────────────────────────────────
$BLOCK
# ───────────────────────────────────────────────────────────────
EOF
fi
