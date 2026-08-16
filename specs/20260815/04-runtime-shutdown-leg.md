---
date: 2026-08-15
status: implementing
diff_base: 97454d27f69e35355a41d950d714e5b8f855536c
open_markers: 0
risk: T3
area: runtime-verification
design: false
breaking: false
depends_on: ["specs/20260815/03-ac-matrix-fail-closed.md"]
depended_on_by: []
spiked: 2026-08-15
brief: n/a
---

# Runtime leg, shutdown half — observe the stop the leg already signals

## Goal

The runtime leg certifies "this program starts" and is silent on "this program stops
cleanly" — where a long-running service's state-corrupting defects live. Both escape rows in
this repo's ledger name `runtime-leg` as the gate that should have caught them; the stranded
pidfile lock (`wf_1d6e7652-ec3`) rode two CLEAN reviews and blocked the daemon's own restart
(INTAKE JJ-20260815-05). `smoke.sh` already sends the host's declared `runtime.stopSignal` —
but only inside its EXIT trap, where the leg's verdict is already fixed: the signal is spent
and the observation discarded. This spec claims the observation: after readiness, send the
stop signal, require exit within a bounded window with a declared-acceptable status, and
state the shutdown half in the doctrine that argues the boot half. Done = the shutdown
assertion runs before the verdict is fixed, default-action signal death and ignore-the-signal
hangs both fail the leg, declared-inert hosts stay exempt, both intake pin tests run green,
and JJ-20260815-05 is stamped fixed.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/smoke.sh`: after readiness passes (and `--seed`'s seedCommand, when run), the leg sends `runtime.stopSignal` to the boot process group (the same dual `kill -s … -- -$PID \|\| kill -s … $PID` form cleanup uses), polls liveness up to `runtime.stopTimeout` seconds, then `wait`s for the exit status. Not exited in time → SIGKILL the group, print `__SMOKE_FAIL__ shutdown-hung: process ignored ${STOP_SIGNAL} for ${stopTimeout}s` + log tail, **exit 6**. Exited with a status outside `runtime.stopExitCodes` → print `__SMOKE_FAIL__ shutdown-unclean: exit status ${STATUS} on ${STOP_SIGNAL} (128+signum means the default signal action killed it — no handler ran)` + log tail, **exit 6**. Otherwise the pass line becomes `__SMOKE_PASS__ ready after ${ELAPSED}s, stopped cleanly (exit ${STATUS}) after ${STOP_ELAPSED}s (boot: … \| ready: …)`, exit 0. The EXIT-trap cleanup stays verbatim as the safety net (idempotent once the process is dead). | The signal was already being sent; only the observation was missing. Exit 6 extends the documented alphabet without collision (0–5 taken); the sentinel-bearing failure lines satisfy the intake pin's shape (assertion outside the trap, `__SMOKE_*__` on the shutdown lines). |
| D2 | Two **optional additive `runtime` keys**, defaults preserving the no-declaration case: `stopTimeout` (integer seconds, default **30**) and `stopExitCodes` (integer array, default **[0]**). Read via jq with defaults (`.runtime.stopTimeout // 30`, `(.runtime.stopExitCodes // [0])`). A host whose service re-raises the signal after cleanup (the classic idiom, exiting 128+signum *deliberately*) declares `stopExitCodes: [143]` — the default deliberately rejects 143, because status-alone cannot distinguish re-raise-after-cleanup from default-action death, and default-action death IS the escape (spike: the daemon with a handler exits 0; the no-handler control exits 143). Documented in BOTH homes: two `// OPTIONAL:` lines in init.md's worked-example config (the `seedCommand`/`readyTimeout`/`stopSignal` precedent), and `spec/templates/grounding-contract.md`'s runtime section — **the contract template IS touched (T3 trigger, tier upgraded accordingly)**: exit 0's certification genuinely strengthens from "boots ready" to "boots ready and stops cleanly", which is precisely the this-is-not-wording case the edit rule reserves. Fan-out named and accepted: every host's stamped `contractHash` goes stale on landing, the drift warning is the designed notification, and a host whose service can't stop cleanly starts failing its smoke leg — that is the leg working, remedied by fixing shutdown or declaring `stopExitCodes`. | Requiring 0 by default is the only assignment that catches the recorded escape; hiding a strengthened certification from the hash-stamped contract would make the drift stamp lie to every host at once (derived pick, 📌-announced at plan). |
| D3 | `spec/doctrine/shared.md` § Runtime Verification gains the shutdown half (2–3 sentences, touch-time prose): static legs also all pass on a program that cannot cleanly stop; the leg therefore sends the declared stop signal after readiness and requires a bounded, clean exit (`stopTimeout`/`stopExitCodes`); declared-inert hosts stay exempt. `spec/commands/review.md`'s smoke-leg bullet updates its exit-0 meaning: "boot observed ready **and stopped cleanly on the declared stop signal**"; the existing "any other exit = automatic hard finding" sentence already absorbs exit 6 unchanged. | The doctrine currently argues only the boot half; the pin (`tests/runtime-leg-shutdown.test.js` test 2) asserts the section states the claim the script now enforces. |
| D4 | The intake row's "re-run the declared readiness/state checks afterwards" clause is **deliberately not adopted**: `readyCheck` semantics after exit are undefined for the common file-probe form (the ready file persists; a re-run would false-pass, laundering the assertion). The universal, host-declared half is the exit observation D1 lands. A dedicated post-stop probe (`runtime.stoppedCheck`) is deferred with a named reopen: adopt it when a host has a real post-stop assertion to declare (e.g. lock file absent). | An assertion that cannot fail is worse than no assertion — this is the same reasoning the pin itself applies to the trap-spent signal. The exit-status check DOES catch the recorded escape (spike evidence, D2). |
| D5 | Fixture repair, recorded — the plan-time hand sweep (spec 02's at-risk class applied by hand; its leg is unbuilt when this spec builds) found exactly two collision surfaces: (a) `tests/smoke-manifest.test.js`'s pass-path fixture boots `sleep 30` with no signal handler, so D1 reddens it (dies 143 ∉ [0]) — its boot command gains the `trap 'exit 0' TERM` handler form, its pins get CONTINUE TO tags, unweakened; (b) `tests/autopilot/smoke-leg.test.js` runs smoke.sh against this repo's REAL config — it stays green (the daemon exits 0, spike-verified) but its assertion-message prose spells the old exit alphabet and gains the `6` row. The build re-greps `tests/` for `smoke` before its first edit and folds any further referencing suite in as a deviation. | The spec that adds a shutdown requirement must fix the fixtures that legitimately lacked one; naming the sweep duty — and its two executed hits — keeps the collision class from riding this very spec. |
| D6 | v1 deliberately does NOT: add a `stoppedCheck` probe (D4's reopen); touch `verdict.js` (exit 6 is non-zero non-4 → already red-blocking via `legIsRed`; `deriveSmoke` already maps it to `'fail'` — both read against source at plan time); touch `wf-review` or release doctrine beyond the review.md bullet; handle Windows signal semantics (no Windows host exists; reopen with the first one); re-order `--seed` (seed still runs pre-shutdown, while the process is alive). | Exit 6 riding the existing red-smoke semantics is the whole point — a shutdown failure hard-stops review exactly as a boot failure does, with zero verdict-surface change. |
| D7 | `spec/.claude-plugin/plugin.json` bumps — target 6.80.0 (target, not a pin; build takes the next free number). `spec/doctrine/claims-baseline.json` re-stamped via `node "$(spec-paths claims-lint)" --update-baseline` in the same commit (shared.md, review.md, and scaffold-ledger.md line counts move). `spec/doctrine/scaffold-ledger.md`: the existing runtime/smoke-leg row is updated **in place** — mechanism now names the shutdown half; its promote/retire conditions re-anchor to signals that exist post-change (retire wording that counted only boot outcomes widens to boot+shutdown outcomes); no new row (this extends an existing gate, it does not add one), no blank line enters the table region. `spec/INTAKE.md` row JJ-20260815-05 flips to fixed @ landed version, same commit. | Version/claims/intake discipline per host rules; a ledger row that under-describes its mechanism fails doctor's enforcement-claim check. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/smoke.sh | MODIFY | scripts | D1/D2: shutdown observation between readiness and pass, exit 6, header exit-code list + usage updated, stopTimeout/stopExitCodes reads |
| spec/doctrine/shared.md | MODIFY | doctrine | D3: § Runtime Verification shutdown half |
| spec/commands/review.md | MODIFY | doctrine | D3: smoke bullet's exit-0 meaning (existing `enforcedBy: spec/scripts/verdict.js` marker kept) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D2: runtime optional-keys line gains stopTimeout/stopExitCodes; § Runtime verification sentence gains the shutdown half — genuine contract change, hash moves by design |
| spec/commands/init.md | MODIFY | doctrine | D2: two `// OPTIONAL:` lines in the worked-example runtime block |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7: runtime/smoke-leg row updated in place — shutdown half named, conditions re-anchored |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D7: full-corpus re-stamp, same commit |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: bump + changelog description (target 6.80.0) |
| spec/INTAKE.md | MODIFY | other | D7: JJ-20260815-05 → fixed @ landed version |
| tests/smoke-shutdown-behavior.test.js | CREATE | tests | AC-20260815-04-1 … AC-20260815-04-4 (red-first, temp-config fixtures, stopTimeout 2) |
| tests/runtime-leg-shutdown.test.js | MODIFY | tests | AC-20260815-04-5, AC-20260815-04-6: tag the two intake pins (green on D1/D3 landing) |
| tests/smoke-manifest.test.js | MODIFY | tests | AC-20260815-04-7: D5 fixture repair + CONTINUE TO tags (exit 2/3/4 paths and pass path, unweakened) |
| tests/autopilot/smoke-leg.test.js | MODIFY | tests | D5(b): assertion-message alphabet prose gains the `6` row; behavior unchanged (real-config run, spike-verified green) |
| tests/consistency/stale-refs.test.js | MODIFY | tests | AC-20260815-04-8: extend the existing init.md `stopSignal` presence pin to also require `stopTimeout` and `stopExitCodes`, and TAG it with the literal `AC-20260815-04-8` (the coverage grep is a substring test — an untagged AC reads as uncovered, a hard finding; refuter catch) (red-first) |

## Contracts

```
# smoke.sh — exit-code alphabet (D1; 0–5 unchanged, 6 added):
#   0  boot observed ready AND stopped cleanly   (__SMOKE_PASS__ … stopped cleanly (exit N) …)
#   1  readyCheck never passed                    (unchanged)
#   2  boot process died before ready             (unchanged)
#   3  no runtime block in config                 (unchanged)
#   4  runtime declared inert                     (unchanged — shutdown check never runs)
#   5  usage / config parse error                 (unchanged)
#   6  shutdown failed:
#        __SMOKE_FAIL__ shutdown-hung:    still alive stopTimeout s after stopSignal (then SIGKILL)
#        __SMOKE_FAIL__ shutdown-unclean: exit status N ∉ stopExitCodes

# .claude/spec.config.json runtime block (D2 — optional, additive):
"runtime": { …existing…, "stopTimeout": 30, "stopExitCodes": [0] }   # values shown = defaults

# fixture shapes (tests, D5/AC literals — bash, no stack dependency):
clean:          touch {d}/ready; trap 'exit 0' TERM; while :; do sleep 1; done   → exit 0
default-action: touch {d}/ready; exec sleep 60                                   → 143 → smoke exit 6
ignore-signal:  touch {d}/ready; trap '' TERM; while :; do sleep 1; done         → hung → smoke exit 6
override:       default-action fixture + "stopExitCodes":[143]                   → smoke exit 0
```

## Behavior

- Flow: ready loop passes → optional seed → `STOP_ELAPSED` clock starts → signal the group →
  poll `kill -0` each second up to `stopTimeout` → alive: hung path (SIGKILL group, exit 6) —
  dead: `wait "$BOOT_PID"` collects the status (`bash -c` propagates the child's status,
  including 128+signum; spike control observed 143) → status check → pass/unclean.
- Two wait windows, reconciled: the EXIT trap's pre-existing fixed 10s-then-SIGKILL teardown
  now matters only on the paths that never reach the shutdown block (not-ready, boot-crashed,
  seed-failed) — on every path through the shutdown block the process is already dead (waited
  or SIGKILLed) when the trap fires, so `kill -0` fails and cleanup no-ops. The two windows
  never race.
- The inert (exit 4), no-runtime (exit 3), not-ready (exit 1), and boot-crashed (exit 2)
  paths return before the shutdown block is reached — untouched by construction.
- Review semantics, unchanged by design: exit 6 is a red blocking smoke leg → step 8
  pre-panel hard-stop, remedy line "the app boots but does not stop cleanly on
  {stopSignal} — fix shutdown handling (or declare runtime.stopExitCodes if re-raise is
  intended)".

## Acceptance Criteria

- **AC-20260815-04-1**: WHEN the booted process ignores the stop signal THE SYSTEM SHALL fail
  the leg as hung (literal: ignore-signal fixture, `stopTimeout: 2` → exit 6, stdout contains
  `__SMOKE_FAIL__ shutdown-hung`) → tests/smoke-shutdown-behavior.test.js (red-first: today
  this fixture exits 0)
- **AC-20260815-04-2**: WHEN the process dies by default signal action THE SYSTEM SHALL fail
  the leg as unclean (literal: default-action fixture → wait status 143 ∉ [0] → exit 6,
  stdout contains `__SMOKE_FAIL__ shutdown-unclean` and `143`) →
  tests/smoke-shutdown-behavior.test.js (red-first)
- **AC-20260815-04-3**: WHEN the host declares `stopExitCodes: [143]` THE SYSTEM SHALL accept
  a 143 exit as clean (literal: override fixture → exit 0, pass line contains `stopped
  cleanly (exit 143)`) → tests/smoke-shutdown-behavior.test.js (red-first)
- **AC-20260815-04-4**: WHEN the process exits 0 on the stop signal THE SYSTEM SHALL pass with
  the shutdown recorded (literal: clean fixture → exit 0, pass line matches
  `__SMOKE_PASS__ ready after \d+s, stopped cleanly \(exit 0\)`) →
  tests/smoke-shutdown-behavior.test.js
- **AC-20260815-04-5**: WHEN smoke.sh is scanned per the intake pin THE SYSTEM SHALL carry a
  shutdown assertion outside the EXIT trap bearing `__SMOKE_*__` sentinels →
  tests/runtime-leg-shutdown.test.js test 1 (tagged; green on D1)
- **AC-20260815-04-6**: WHEN § Runtime Verification is read THE SYSTEM SHALL state the
  shutdown half → tests/runtime-leg-shutdown.test.js test 2 (tagged; green on D3)
- **AC-20260815-04-7**: WHEN the config declares inert, lacks a runtime block, or the boot
  crashes pre-ready THE SYSTEM SHALL CONTINUE TO exit 4 / 3 / 2 with today's sentinels, and a
  clean-handler boot SHALL CONTINUE TO exit 0 → tests/smoke-manifest.test.js (fixtures
  repaired per D5, assertions unweakened, tagged)
- **AC-20260815-04-8**: WHEN init.md's worked-example config is scanned THE SYSTEM SHALL
  document `stopTimeout` and `stopExitCodes` as optional runtime keys →
  tests/consistency/stale-refs.test.js (the existing `stopSignal` presence pin, extended;
  red-first)

## Assumptions (escalation triggers)

- A1: the dogfood daemon exits 0 on SIGTERM via its handler — **executed 2026-08-15**: booted
  via the live config's bootCommand, ready observed, `kill -s SIGTERM`, `wait` →
  `daemon-exit=0`; no-handler control (`sleep`) → `143`. **if false** (a host's own smoke
  goes red on landing): that is the leg doing its job — fix shutdown or declare
  `stopExitCodes`, never loosen the default.
- A2: `bash -c "$BOOT"` propagates the underlying process's exit status including signal
  deaths — control observed 143 through the wrapper — **if false** on some boot-command
  shape: the status check reads the wrapper's status honestly; document the compound-command
  caveat in the header.
- A3: exit 6 is free and rides verdict.js's existing red-smoke semantics (`legIsRed`: non-0
  non-4; `deriveSmoke`: → `'fail'`) — read against source at plan time — **if false**: STOP,
  the verdict contract moved underneath this spec.
- A4: only `tests/smoke-manifest.test.js` and the intake pin reference smoke.sh's behavior —
  **if false**: D5's hand sweep folds the extra suite in as a deviation.

## Rationale

The cheapest true assertion won: the signal was already sent, so the delta is a wait, a
status compare, and two failure paths — no new probe, no new leg, no verdict change. The
default `[0]` was the only genuinely contested value: accepting 128+signum by default would
green the exact recorded escape (default-action death), while rejecting it breaks hosts using
the deliberate re-raise idiom — resolved by making the default catch the escape and the idiom
a one-key declaration, with the spike supplying the ground truth (handler → 0, no handler →
143). The intake row's "re-run readiness checks" clause was examined and rejected (D4) as an
assertion that cannot fail for file-probe hosts — the same standard the row itself applies.
Refuter/reviewer note: the shutdown block must sit between the ready/seed success and the
pass line, never in cleanup — the pin's structural regex enforces exactly this. Fixture
repair in D5 is honest scope: the old fixtures weren't wrong, the contract under them moved;
their assertions stay byte-equivalent with handler-bearing boot commands. Adversarial check
(2 refuters, execution-grounded): one finding, fixed — the stale-refs File Plan row now
mandates embedding the literal AC-ID (the coverage grep is a substring test; an extended but
untagged assertion would read as an uncovered AC). Every executable mechanic — group-signal
trap delivery, wait-after-poll status propagation, jq defaults, stopTimeout 0, the
dead-before-shutdown race, both pin regexes against candidate lines — was executed by the
refuters and observed to behave as this spec claims.

## Canonical Delta

`docs/canonical/review.md` — the smoke-leg paragraph: exit 0 now certifies boot AND clean
shutdown on the declared stop signal; exit 6 = shutdown failure (hung or unclean status),
red-blocking like any smoke failure; `stopTimeout`/`stopExitCodes` documented as the optional
runtime keys. `docs/canonical/pipeline.md` — the runtime-verification sentence gains the
shutdown half.
