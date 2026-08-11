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
  line="${line//$'\r'/}"
  case "$line" in *555-SETUP-END*) break;; esac
  b64+="$line"
done

if ! printf '%s' "$b64" | tr -d ' \t' | base64 -d 2>/dev/null | tar -xzf - -C "$STAGE" 2>/dev/null; then
  echo "❌ Decode failed — the paste was truncated or mangled (common with very large blocks)."
  echo "   Easier path if you have ssh access from the source machine:"
  echo "     bash setup/export.sh $(whoami)@$(hostname)    # one step, no paste"
  exit 1
fi

bash "$STAGE/apply.sh"
