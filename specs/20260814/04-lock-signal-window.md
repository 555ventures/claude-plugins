---
date: 2026-08-14
status: hardened
open_markers: 0
risk: T3
area: autopilot-daemon
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260814/03-suite-baseline.md"]
brief: n/a
spiked: 2026-08-14
---

# Close autopilotd's lock-acquire → signal-handler window

## Goal

`autopilotd` writes its pidfile lock, then builds adapter and lanes, and only then installs
its SIGTERM/SIGINT handlers — so a stop signal landing in that window kills the process via
the default action and leaves a stale lockfile, falsifying the D5 "released on clean
shutdown" contract of specs/20260810/05-service-bootstrap.md (escape row appended
2026-08-15, `foundBy:"user"`, `preventedBy:"runtime-leg"`; the covering test flagged it only
as intermittent full-suite noise). This spec installs a provisional release-and-exit
handler in the same synchronous tick as lock acquisition; the full lane-stopping handlers
replace it once lanes exist. Done = the DI pins and ordering pin run green and the
previously-flaky lifecycle test passes its stability loop.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `autopilot/daemon/lock.js` gains `installEarlyLockRelease({ stateDir, pid, processImpl = process, fsImpl = fs })`: registers one listener each for `SIGTERM` and `SIGINT` on `processImpl` that calls the module's own `releaseLock({ stateDir, pid, fsImpl })` then `processImpl.exit(0)` (exit 0 = the documented "normal shutdown on SIGTERM/SIGINT" code — no new exit code); returns `{ remove() }` which deregisters both listeners via `processImpl.removeListener`. DI seams follow the module's existing `killImpl`/`fsImpl` convention so the handler chain is unit-executable with zero timing. | The logic lives beside `acquireLock`/`releaseLock` (single lock-lifecycle module, mode-4 DI-testable); a bin-inline closure would be untestable except by racing real signals. |
| D2 | `autopilot/bin/autopilotd`: call `installEarlyLockRelease` **immediately after `acquireLock` succeeds, synchronously — no `await` between them — and before `buildAdapterAndLanes`**. `installSignalHandlers(adapter, lanes, stateDir, early)` takes the returned handle and calls `early.remove()` before registering the full shutdown handlers (double-signal force-exit(1) semantics live only in the full handler, unchanged) — **and its call site moves to immediately after `buildAdapterAndLanes`, BEFORE `adapter.start()` and the lane-start loop** (refuter-caught: leaving it after the start calls would keep the provisional handler covering live lanes, reaching exit 0 without stopping them; both stop paths are pre-start-safe — `lane.stop()` guards on `loopPromise`, `adapter.stop()` on `running` — so the full graceful path is valid from the moment construction returns). The early handler therefore covers **construction only**: an early-window exit 0 releases the lock with zero lanes ever started, so the header's bundled exit-0 contract ("every lane stopped, state persisted, adapter stopped, lock released") is satisfied vacuously — the header's new sentence states exactly that. | The spike proved the ordering is the whole fix (`late: stale=true`, `early: stale=false`); moving the full-handler install to pre-start shrinks the provisional coverage to the one gap it was designed for. |
| D3 | Signals before the lock exists (during `registerRepos`) stay default-action kills — nothing stale exists yet, deliberately out of scope. A construction **throw** (not a signal) between lock and handlers also stays out of scope: stale-pid recovery already owns that path, and conflating it here would grow the diff on a T3 boot surface. | Narrowest change that closes the falsified contract; both residuals are named, bounded, and recovery-covered. |
| D4 | Tests (`tests/autopilot/lock.test.js`, same file as the existing pins): (a) DI unit pins executing the real handler chain — captured listener → real `releaseLock` on a real `tmpdir()` lockfile → fake `exit` recorded; (b) a source-ordering pin over the bin, **anchored on the call-site slice, never whole-file distance** (refuter-caught brittleness: unrelated `await` tokens sit between the require line and the call site): slice the source from the `acquireLock({` call expression to the `buildAdapterAndLanes` call and assert the slice contains `installEarlyLockRelease` and no `await` token; separately assert `installSignalHandlers(` appears in source before `adapter.start()` and that its function body calls `early.remove()`. This is the repo's read()-content pin technique applied to the one script with no importable seam — justified in Rationale, not a new test mode to extend; (c) the existing lifecycle test (`AC-20260810-05-12`) is additionally tagged `AC-20260814-04-4` as the regression pin — green pre-change in isolation. Post-change stability evidence is an **orchestrator duty** (line under the File Plan), not an AC clause. No test-only seam enters the daemon. | Deterministic coverage without racing signals: the DI pin executes the fix, the slice pin makes the window structurally absent, the lifecycle test stays the end-to-end net. |
| D5 | `autopilot/.claude-plugin/plugin.json` bump target 0.10.1 (target, not a pin), description notes the shutdown-window fix. No scaffold-ledger row — this is a defect fix, not a new pipeline guard. | Version-bump discipline (pipeline rules § Planning); ledger rows are for mechanisms with promote/retire lifecycles. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/daemon/lock.js | MODIFY | scripts | D1: `installEarlyLockRelease` + header update |
| autopilot/bin/autopilotd | MODIFY | scripts | D2: wire early release after `acquireLock`; `installSignalHandlers` removes it; header sentence |
| tests/autopilot/lock.test.js | MODIFY | tests | AC-20260814-04-1, AC-20260814-04-2, AC-20260814-04-3, AC-20260814-04-4 (D4 retag) |
| autopilot/.claude-plugin/plugin.json | MODIFY | doctrine | D5: bump + changelog description |

Orchestrator duty (D4c): after the batch goes green, run the scoped suite ten times in a row
(`for i in $(seq 10); do node --test 'tests/autopilot/lock.test.js' || break; done`) and
record the 10/10 result in the build report — stability evidence, not a gate; a failure in
the loop is a `blocked` return, never a silent retry.

## Contracts

```
# autopilot/daemon/lock.js (additive; existing exports unchanged)
installEarlyLockRelease({ stateDir, pid, processImpl = process, fsImpl = fs })
#   registers SIGTERM + SIGINT listeners: releaseLock({stateDir, pid, fsImpl}) then
#   processImpl.exit(0)
#   returns { remove() } — deregisters both listeners (processImpl.removeListener)
# acquireLock({ stateDir, pid, killImpl, fsImpl })   — unchanged
# releaseLock({ stateDir, pid, fsImpl })             — unchanged (only-if-own-pid semantics)
```

## Behavior

- Boot order after this spec: `registerRepos` → `mkdirSync(stateDir)` → `acquireLock` →
  `installEarlyLockRelease` (same tick) → `buildAdapterAndLanes` →
  `installSignalHandlers` (removes the early listeners, installs the full graceful path —
  valid pre-start since both stop calls guard) → `adapter.start()` → lane-start loop.
- A signal in the formerly-unprotected window now releases the lock and exits 0 — from a
  service manager's view, indistinguishable from a fast clean stop.
- The early handler never touches lanes/adapter (none exist yet) and never installs the
  double-signal force path — a second signal during its synchronous release+exit is moot.

## Acceptance Criteria

- **AC-20260814-04-1**: WHEN `installEarlyLockRelease` is invoked with a fake `processImpl`
  and a real `tmpdir()` lockfile holding the given pid, and the captured SIGTERM listener
  is called, THE SYSTEM SHALL remove the lockfile via the real `releaseLock` and record
  `exit(0)` on the fake (literal: lockfile content `"12345"`, pid `12345` → file absent,
  exit code `0`); the SIGINT listener SHALL behave identically →
  tests/autopilot/lock.test.js
- **AC-20260814-04-2**: WHEN `remove()` on the returned handle is called THE SYSTEM SHALL
  deregister both listeners (fake `processImpl` listener registry empty for both signals)
  → tests/autopilot/lock.test.js
- **AC-20260814-04-3**: WHEN the source slice of `autopilot/bin/autopilotd` from the
  `acquireLock({` call expression to the `buildAdapterAndLanes` call is read THE SYSTEM
  SHALL contain `installEarlyLockRelease` and no `await` token in that slice; and
  `installSignalHandlers(` SHALL appear in source before `adapter.start()`, with its body
  calling `early.remove()` (call-site slice pin; the live in-window signal timing itself
  has no deterministic external repro without a test seam — that residual is covered by
  this pin plus AC-4's end-to-end net) → tests/autopilot/lock.test.js
- **AC-20260814-04-4**: WHEN a real spawned `autopilotd` acquires the lock and receives
  SIGTERM THE SYSTEM SHALL CONTINUE TO exit cleanly with the lockfile removed (the
  existing `AC-20260810-05-12` lifecycle test, additionally tagged with this ID — green
  pre-change in isolation; post-change 10-run stability evidence is the orchestrator duty
  under the File Plan) → tests/autopilot/lock.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-08-14, scratch harness outside the repo): a child that writes a
  lockfile, busy-works 300ms, then installs its SIGTERM handler leaves the file after a
  parent's SIGTERM-on-lock-appearance (`late: lockfile stale after SIGTERM = true`); the
  identical child installing the handler immediately after the write removes it
  (`early: … = false`). **if false at build:** the fix premise is wrong — STOP, re-diagnose
  with the retainer.
- A2 (executed 2026-08-14): `tests/autopilot/lock.test.js` lifecycle test passes 10/10 in
  isolation and was observed failing only under full-suite load (failure mode: exited
  within 5s, lockfile present, empty stderr — the pre-handler-kill signature). **if false**
  (isolation failures appear): a second defect exists beyond the window — STOP, escalate.
- A3 (read at HEAD): `autopilotd` orders `acquireLock` (bin:325) before
  `installSignalHandlers` (bin:268–284, wired after lane construction), with
  `registerRepos` awaited before the lock — so the only stale-lock signal window is the one
  D2 closes. **if false:** the bin restructured concurrently — rebase and re-verify the
  ordering pin's regex against the new shape.
- A4 (read at HEAD): `lock.js` exports `acquireLock`/`releaseLock`/`LockError` with the
  `fsImpl`/`killImpl` DI convention and releaseLock's only-if-own-pid guard. **if false:**
  align D1's signature with what exists; never fork a second release path.

## Rationale

Escape-driven fix (the 2026-08-15 escape row on specs/20260810/05): the daemon's shutdown
contract promised lock release on clean SIGTERM, but the handler installing that promise
arrived milliseconds too late, and the covering test could only report the hole as
intermittent suite noise. T3 by the universal process-boundary trigger — signal handling on
boot-path code — which is also why the fix is deliberately minimal: one new DI-testable
function, one synchronous call site, explicit handler replacement. Alternatives rejected:
installing the *full* shutdown handlers early (they close over `adapter`/`lanes`, which
don't exist yet — a null-guarded variant would put branching on the T3 path to save one
`remove()` call); a test-only construction-delay env seam in the daemon to make the window
spawn-reproducible (test scaffolding in production boot code — the DI pin executes the same
chain deterministically without it); fixing only the test's timing (the flake was a true
positive — "fixing" it would delete the one signal the defect ever emitted). The regression
pin rides the existing lifecycle test rather than a duplicate, per the pin-tagging rule.

Adversarial-check adjudications (2026-08-14, two blind refuters — all four findings
ACCEPTED, none rejected): (1) the full-handler install site moves to pre-start, else the
provisional handler would cover live lanes and reach exit 0 without stopping them (D2
amended; stop-path pre-start safety refuter-verified against lane.js/hub-adapter.js);
(2) cross-spec collision with specs/20260814/03 — its seeding would have flaky-marked the
very test this spec stabilizes; resolved by wiring 03 `depends_on` this spec so seeding
runs post-fix and its double-check rule observes a stable test; (3) the "10 consecutive
runs" clause had no carrier — now an explicit orchestrator-duty line under the File Plan;
(4) the ordering pin re-anchored on the call-site slice (unrelated `await` tokens sit
between the require line and the call site — whole-file distance checks misfire). A
refuter also independently corroborated A1 at scale: 0/60 stale-lock survivals with the
immediate handler vs 10/10 stale with the delayed one. The slice pin over a bin script is
the read()-content technique applied to the one file with no importable seam — a deliberate
narrow use, not a new test mode; the alternative (no ordering pin) would leave regression
detection to the probabilistic flake signal this incident proved unjudgeable.

Fragile spot for build: the slice pin must anchor on the `acquireLock({` call expression
(never the require line) and tolerate the `try/catch` around it.

## Canonical Delta

None — docs/canonical/autopilot.md describes lane/adapter behavior, not the lock lifecycle
ordering; nothing there changes.
