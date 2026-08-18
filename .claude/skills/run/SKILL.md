---
name: run
description: "Use when exercising this plugin repo locally to see it working — there is no app to boot; 'running' means the test suite and the status viewer."
allowed-tools: Bash(npm test:*), Bash(node --test:*), Bash(node spec/scripts/spec-status.js:*), Bash(bash scripts/spec-patterns.sh:*)
---

# Run — claude-plugins

This is a plugin-source repo: plugins execute inside Claude Code sessions, so there is no
dev server, port, or seed state. "Does it work?" is answered by three commands:

- **Full gate**: `npm test` — the whole `node:test` suite, plainly green (no sanctioned-red
  baseline); it must pass before any change counts.
- **Scoped test run**: `node --test tests/<file>.test.js` — paths are repo-root-relative.
- **Pipeline status of a host** (or this repo once specs exist):
  `node spec/scripts/spec-status.js --root . ` (add `--json` for machine output).

Observation surfaces: test output (TAP), script sentinel lines (`__SMOKE_PASS__` style), and
exit codes — exit codes are the verdict, documented in each script's header comment.

Deeper seeding/observability detail (synthetic host trees, fixtures): see the `spec-verify`
skill.
