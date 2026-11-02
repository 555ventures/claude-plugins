#!/usr/bin/env node
'use strict'
// scripts/test-stdout-blocking.js — usage: node --test --test-force-exit --require ./scripts/test-stdout-blocking.js …
// Preloaded by package.json `scripts.test` and .claude/spec.config.json `testCommand`/`gateCommand`. No CLI.
//
// Owner: tests/consistency/test-stdout-blocking.test.js (the /spec:fix pin for dropped test tails).
//
// Why: `--test-force-exit` calls process.exit() once a test file's reporter stream has ENDED, not
// once its bytes reached the reader. Under process isolation each file's child streams its results
// to the runner over a non-blocking stdout pipe; whatever libuv still holds when process.exit()
// fires is discarded, the child exits 0, and the runner drops the child's test plan — so the tail
// of a file's tests vanishes once the pipe buffer fills and the gate goes green with them unrun.
// Blocking writes mean process.exit() never runs with undelivered bytes, so the flag keeps its
// hang bound (specs/20260909/07-hang-bound-and-port-check.md) without swallowing results.
// `--require` on the runner is forwarded to every child's execArgv, so one flag covers the runner's
// own stdout and every per-file child.
//
// What this deliberately does NOT do: touch stderr, or act on a stream with no pipe handle (a file
// destination is already synchronous; a handle without setBlocking is left as-is).
//
// Exit codes: n/a — a preload, never executed directly.

const handle = process.stdout && process.stdout._handle
if (handle && typeof handle.setBlocking === 'function') handle.setBlocking(true)
