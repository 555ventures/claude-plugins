#!/usr/bin/env bash
# Import a Claude Code setup exported by export.sh.
#
# On the remote machine:
#   bash <(curl -fsSL https://raw.githubusercontent.com/555ventures/claude-plugins/main/setup/import.sh)
#   → paste the block export.sh put on your clipboard, press Enter. Done.
set -euo pipefail

for bin in jq git base64 tar; do
  command -v "$bin" >/dev/null || { echo "❌ Missing prereq: $bin (install it, then re-run)"; exit 1; }
done

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "📋 Paste your setup block (copied by export.sh), then press Enter:"
b64=""
while IFS= read -r line; do
  [ "$line" = "555-SETUP-END" ] && break
  b64+="$line"$'\n'
done

printf '%s' "$b64" | base64 -d | tar -xzf - -C "$STAGE" \
  || { echo "❌ Could not decode — paste the whole block, including the final 555-SETUP-END line."; exit 1; }

bash "$STAGE/apply.sh"
