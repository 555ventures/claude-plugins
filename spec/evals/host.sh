#!/usr/bin/env bash
# host.sh — sourced by every spec/evals/<case>/fixture.sh; writes a minimal grounded spec host
# into the current directory (the eval run's empty workspace).
# Owner: specs/20261024/03-plugin-evals-with-deterministic-graders.md D4 — eval runs load no
# project config, so the host grounding the plugin's commands read must come from the fixture.
# It deliberately does NOT run any plugin script (the scaffold runs outside the plugin, before
# Claude starts) and writes no queue, spec or ledger row — each case's fixture adds its own.
# Usage: . "$(dirname "$0")/../host.sh"; host_init
# Exit codes (of host_init): 0 host written · 1 a write or git step failed.

host_init() {
  git init -q -b main . || return 1
  git config user.email eval@example.invalid && git config user.name eval || return 1
  mkdir -p .claude/rules specs docs/roadmap || return 1
  cat > .claude/spec.config.json <<'JSON' || return 1
{
  "generatedBy": "spec@eval-fixture",
  "contractHash": "09b6aa256753",
  "gateCommand": "node --test {testDirs}",
  "testCommand": "node --test",
  "setupCommand": "true",
  "patternsScript": "scripts/spec-patterns.sh",
  "layerGroups": [["code"]],
  "agentMap": { "tests": "general-purpose", "default": "general-purpose" },
  "pipelineRules": ".claude/rules/spec-pipeline.md",
  "runtime": { "inert": "eval fixture — a library with no bootable app" }
}
JSON
  cat > .claude/rules/spec-pipeline.md <<'MD' || return 1
# Spec pipeline grounding — eval fixture

## Risk Tiers

None: every spec here is `standard`.

## Planning

One function per spec, one test file per function.

## Build

No host escalation triggers.

## Worker Rules

Node built-ins only.

## Test Rules

`node:test` + `node:assert`; files are `tests/<name>.test.js`.

## Review Checks

None beyond the defaults.

## Gotchas

None recorded.
MD
  mkdir -p scripts && printf '#!/usr/bin/env bash\nexit 0\n' > scripts/spec-patterns.sh && chmod +x scripts/spec-patterns.sh || return 1
  printf '{ "name": "eval-host", "private": true, "scripts": { "test": "node --test" } }\n' > package.json || return 1
  printf '.claude/worktrees/\n' > .gitignore || return 1
}

# host_done_spec — one shipped spec plus its review ledger row, so status/queue/doctor have
# real history to read.
host_done_spec() {
  mkdir -p specs/20260101 src tests || return 1
  cat > specs/20260101/01-add-two-numbers.md <<'MD' || return 1
---
date: 2026-01-01
status: done
tier: standard
area: math
breaking: false
depends_on: []
brief: n/a
open_markers: 0
---

# Add two numbers

## Goal

`src/add.js` exports `add(a, b)`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `add(a, b)` returns `a + b` (AC-20260101-01-1) | The smallest useful function. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/add.js | CREATE | code | D1 |
| tests/add.test.js | CREATE | tests | AC-20260101-01-1 |

## Acceptance Criteria

- **AC-20260101-01-1**: WHEN `add(2, 3)` is called THE SYSTEM SHALL return `5` → writes tests/add.test.js
MD
  printf "'use strict'\nmodule.exports.add = (a, b) => a + b\n" > src/add.js || return 1
  cat > tests/add.test.js <<'JS' || return 1
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { add } = require('../src/add')
test('AC-20260101-01-1: add(2, 3) returns 5', () => {
  assert.strictEqual(add(2, 3), 5, 'add is broken, every caller gets a wrong sum')
})
JS
  printf '%s\n' '{"ts":"2026-01-01T12:00:00Z","stage":"review","spec":"specs/20260101/01-add-two-numbers.md","tier":"standard","verdict":"CLEAN","findings":{"hard":0,"soft":0}}' > .claude/spec-runs.jsonl || return 1
}

# host_commit — commit everything written so far (the plugin's drivers read committed specs).
host_commit() {
  git add -A && git commit -q -m "eval fixture" || return 1
}
