---
name: path-stub-binaries-for-cli-retry-loops
description: Technique for testing a spawnSync'd CLI's retry/poll loop against an external binary (curl, gh) — PATH-stubbed executables with invocation-counter files, plus a REAL child-process HTTP server (never in-process) for reachable-URL legs.
metadata:
  type: feedback
  reviewed: 2026-09-02
---

When a gate script under test shells out to a real external binary in a retry/poll loop (e.g.
release-legs.js's `ready` leg retrying `curl`, or its `ci` leg polling `gh` via ci-query.js), and
the AC requires proving the loop actually iterated (≥2 attempts, or "in-progress then resolved"),
the right fixture is a PATH-stubbed replacement binary, not a real network target:

- Write a tiny executable script (`chmod 0o755`, real shebang) named exactly `curl`/`gh` into a
  scratch bin dir, and prepend that dir onto `PATH` in the test's `runNode(..., {env: {...
  process.env, PATH: binDir + path.delimiter + process.env.PATH}}})` call. `bash -c` invocations
  inside the script under test resolve the stub before the real binary.
- To count invocations across multiple child-process spawns (each poll iteration is a FRESH
  process, so no in-memory state survives between them), have the stub read/increment/write a
  counter file on every invocation, and branch its output on the counter value (e.g. gh: count<2
  -> in_progress JSON, count>=2 -> completed/success JSON). Assert on the counter file's final
  value from the test, not on log parsing.
- For a leg that must reach a REAL reachable URL (e.g. `ready` against a passing `stagingUrl`),
  spawn a tiny HTTP server as a genuine CHILD process (`spawn(process.execPath, [serverFile,
  portFile])`, `stdio:'ignore'`) that binds an OS-assigned ephemeral port and writes it to a
  portFile once listening; the test polls (async `waitFor`) for the portFile rather than guessing
  a fixed port. This is the same in-process-vs-child-process split as the repo's own Gotchas entry
  on spawnSync-vs-spawn — spawnSync on the CLI under test is fine as long as every stub IT talks
  to lives in a separate OS process.

**Why:** spec 20260823/01 (release-legs.js) needed AC-3 (curl refused-connection retry, ≥2
observed attempts) and AC-7 (gh poll loop, exactly ONE ci row across multiple poll iterations) —
both required observing a retry loop's iteration count without relying on real 5s/30s network
timing being deterministic or fast.

**How to apply:** any future spec whose script under test shells to `curl`/`gh`/another external
CLI inside a retry or poll loop, where the AC cares about iteration count or resolved-vs-pending
state transitions.
