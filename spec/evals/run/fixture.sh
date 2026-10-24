#!/usr/bin/env bash
# fixture.sh — scaffold for the heavy `run` eval case: a grounded spec host with one shipped
# spec and one hardened spec (subtract) for /spec:run to carry to done.
# Owner: specs/20261024/03-plugin-evals-with-deterministic-graders.md D3/D4.
# Runs in the eval run's empty workspace before Claude starts; never runs a plugin script.
# Exit codes: 0 workspace ready · 1 a write or git step failed.
set -u
. "$(dirname "$0")/../host.sh" || exit 1
host_init && host_done_spec || exit 1
mkdir -p specs/20260102 || exit 1
cat > specs/20260102/01-subtract-two-numbers.md <<'MD' || exit 1
---
date: 2026-01-02
status: hardened
tier: standard
area: math
breaking: false
depends_on: []
brief: n/a
open_markers: 0
---

# Subtract two numbers

## Goal

`src/subtract.js` exports `subtract(a, b)`, the sibling of `add`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `subtract(a, b)` returns `a - b` (AC-20260102-01-1) | Mirrors `add`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/subtract.js | CREATE | code | D1 |
| tests/subtract.test.js | CREATE | tests | AC-20260102-01-1 |

## Acceptance Criteria

- **AC-20260102-01-1**: WHEN `subtract(5, 3)` is called THE SYSTEM SHALL return `2` → writes tests/subtract.test.js

## Assumptions (escalation triggers)

- A1: none.

## Rationale

The smallest change that exercises every build and review step.
MD
host_commit || exit 1
