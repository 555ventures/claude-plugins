---
paths:
  - "spec/scripts/**"
  - "spec/bin/**"
  - "scripts/**"
  - "autopilot/**"
---

# Gate-script conventions

- Zero dependencies: Node built-ins only in JS; `jq` is the only external binary in bash. Never add a package.
- Bash: `#!/usr/bin/env bash` + `set -u` (never `set -e`). JS: `#!/usr/bin/env node` + `'use strict'`.
- Header comment before the first statement: usage line, why (dated incident), what it deliberately does NOT do, `Exit codes:` list.
- Exit codes are the verdict: 0 pass, 1 findings, 2 usage/precondition, script-specific above. Errors → stderr, `scriptname: message`, naming the remedy command.
- Hand-rolled `--flag value` parsing; no arg library. Machine output = sentinel lines or `--json`; derivers never store state.
- Agent: `gate-scripts` · exemplars: `spec/scripts/spec-status.js`, `spec/scripts/merge-back.sh`.
