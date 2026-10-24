#!/usr/bin/env bash
# fixture.sh — scaffold for the `queue` eval case: a grounded spec host with one shipped spec and one queued item.
# Owner: specs/20261024/03-plugin-evals-with-deterministic-graders.md D4.
# Runs in the eval run's empty workspace before Claude starts; never runs a plugin script.
# Exit codes: 0 workspace ready · 1 a write or git step failed.
set -u
. "$(dirname "$0")/../host.sh" || exit 1
host_init && host_done_spec || exit 1
cat > .git/spec-queue.json <<'JSON' || exit 1
{
  "version": 1,
  "seq": 1,
  "items": [
    { "id": "q1", "kind": "prompt", "payload": "Add a subtract(a, b) function next to add", "added": "2026-01-02T09:00:00.000Z" }
  ]
}
JSON
host_commit || exit 1
