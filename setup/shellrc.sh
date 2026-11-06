# Shell shortcuts for the claude-plugins repo. ~/.zshrc sources this file; it never copies it.
# The repo owns it, so a script that moves moves its shortcut in the same commit, and
# tests/setup.test.js fails when a path named here stops existing.
CLAUDE_PLUGINS_DIR="${CLAUDE_PLUGINS_DIR:-$HOME/Projects/claude-plugins}"

spec-status() { node "$CLAUDE_PLUGINS_DIR/spec/scripts/status.js" "$@"; }
