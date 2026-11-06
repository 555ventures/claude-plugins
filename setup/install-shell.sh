#!/usr/bin/env bash
# Point ~/.zshrc at the repo's setup/shellrc.sh. Idempotent: replaces any previous
# claude-plugins block (including old copied ones) with a single `source` line.
#
#   bash ~/Projects/claude-plugins/setup/install-shell.sh
set -euo pipefail

RC="${ZDOTDIR:-$HOME}/.zshrc"
START='# >>> claude-plugins shell setup >>>'
END='# <<< claude-plugins shell setup <<<'

touch "$RC"
awk -v s="$START" -v e="$END" '$0==s{skip=1} !skip; $0==e{skip=0}' "$RC" > "$RC.tmp"
cat >> "$RC.tmp" <<EOF
$START
# Managed by claude-plugins/setup/install-shell.sh. Edit setup/shellrc.sh in the repo, not here.
[ -f "\$HOME/Projects/claude-plugins/setup/shellrc.sh" ] && source "\$HOME/Projects/claude-plugins/setup/shellrc.sh"
$END
EOF
mv "$RC.tmp" "$RC"
echo "✅ ~/.zshrc now sources claude-plugins/setup/shellrc.sh. Open a new shell (or: source ~/.zshrc)."
