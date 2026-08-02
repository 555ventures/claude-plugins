#!/usr/bin/env bash
# SessionStart hook: stdout is injected into the session context.
set -euo pipefail
cat "${CLAUDE_PLUGIN_ROOT}/STYLE.md"
