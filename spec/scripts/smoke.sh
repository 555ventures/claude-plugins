#!/usr/bin/env bash
# Deterministic boot-smoke leg — the executed-program check behind every review verdict.
# Boots the host app (config runtime.bootCommand), polls runtime.readyCheck until it passes
# or times out, then — after readiness (and any --seed run) — sends the declared
# runtime.stopSignal and requires a bounded, clean exit before tearing the process group down.
# The stop half was previously only sent from the EXIT trap, where the leg's verdict was
# already fixed and the observation discarded (INTAKE JJ-20260815-05: a stranded pidfile lock
# rode two CLEAN reviews on this gap). No model narrates pass/fail: the exit code and the
# __SMOKE_*__ sentinel line are the verdict (same lesson as the gate sentinel). This script
# deliberately does NOT re-run readyCheck after shutdown (undefined for file-probe hosts —
# would false-pass) and does NOT add a post-stop probe (deferred, see shared.md).
#
# Usage: smoke.sh [--config <path>] [--timeout <seconds>] [--seed]
#   --config   path to spec.config.json (default .claude/spec.config.json under CWD)
#   --timeout  override runtime.readyTimeout (default 120s)
#   --seed     also run runtime.seedCommand after ready (for behavioral checks; boot-only by default)
#
# Exit codes:
#   0  boot observed ready AND stopped cleanly on stopSignal (__SMOKE_PASS__ … stopped cleanly …)
#   1  readyCheck never passed        (__SMOKE_FAIL__ not-ready)
#   2  boot process died before ready (__SMOKE_FAIL__ boot-crashed)
#   3  no runtime block in config     (__SMOKE_FAIL__ no-runtime) — "the host gives review no
#      way to boot" is itself a blocking finding, not a skipped check
#   4  runtime declared inert         (__SMOKE_INERT__) — sanctioned only for hosts with no
#      bootable process (libraries, pure CLIs); the declared reason is printed
#   5  usage / config parse error
#   6  shutdown failed after readiness:
#        __SMOKE_FAIL__ shutdown-hung:    still alive runtime.stopTimeout seconds after
#                                          stopSignal (group is then SIGKILLed)
#        __SMOKE_FAIL__ shutdown-unclean: exit status outside runtime.stopExitCodes
#   7  environment already ready before boot was ever spawned (D4 below):
#        __SMOKE_FAIL__ stale-ready: readyCheck passed before bootCommand was spawned — a
#                                     process from a previous run is likely still answering;
#                                     stop it (or clean the stale ready state), then re-run.
#
# specs/20260821/03-cross-spec-skip-mapping.md D4 (2026-08-21, UpWell defect 2): this script used
# to trust whatever readyCheck answered on the FIRST poll after boot spawn — an orphaned server
# left over from a crashed prior run (or any other environment whose ready predicate is already
# true) made readiness look instantaneous, crediting THIS run's boot for a readiness it never
# produced, then SIGTERMing its own still-building process (observed: shutdown-unclean, exit
# 143). Fixed by probing readyCheck ONCE, immediately before bootCommand is ever spawned: a
# predicate that is already true cannot distinguish this run's readiness from history, so it
# fails closed as stale-ready without spawning boot at all — deliberately even for hosts whose
# ready state legitimately persists across runs (a probe file never cleaned), since the honest
# remedy in either case is for the operator to clean the stale state before re-running.
set -u

CONFIG=".claude/spec.config.json"
TIMEOUT_OVERRIDE=""
RUN_SEED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --config)  CONFIG="${2:?--config needs a path}"; shift 2 ;;
    --timeout) TIMEOUT_OVERRIDE="${2:?--timeout needs seconds}"; shift 2 ;;
    --seed)    RUN_SEED=1; shift ;;
    *) echo "usage: smoke.sh [--config <path>] [--timeout <seconds>] [--seed]" >&2; exit 5 ;;
  esac
done

if [ ! -f "$CONFIG" ]; then
  echo "__SMOKE_FAIL__ no-runtime: config not found at $CONFIG" ; exit 3
fi
if ! jq -e . "$CONFIG" >/dev/null 2>&1; then
  echo "__SMOKE_FAIL__ config-parse: $CONFIG is not valid JSON" >&2; exit 5
fi

HAS_RUNTIME=$(jq -r 'has("runtime")' "$CONFIG")
if [ "$HAS_RUNTIME" != "true" ]; then
  echo "__SMOKE_FAIL__ no-runtime: $CONFIG declares no runtime block — the host gives review no way to boot (add runtime.bootCommand+readyCheck, or runtime.inert with a reason)"
  exit 3
fi

INERT=$(jq -r '.runtime.inert // empty' "$CONFIG")
if [ -n "$INERT" ]; then
  echo "__SMOKE_INERT__ $INERT"
  exit 4
fi

BOOT=$(jq -r '.runtime.bootCommand // empty' "$CONFIG")
READY=$(jq -r '.runtime.readyCheck // empty' "$CONFIG")
SEED=$(jq -r '.runtime.seedCommand // empty' "$CONFIG")
STOP_SIGNAL=$(jq -r '.runtime.stopSignal // "SIGTERM"' "$CONFIG")
TIMEOUT=$(jq -r '.runtime.readyTimeout // 120' "$CONFIG")
[ -n "$TIMEOUT_OVERRIDE" ] && TIMEOUT="$TIMEOUT_OVERRIDE"
STOP_TIMEOUT=$(jq -r '.runtime.stopTimeout // 30' "$CONFIG")
STOP_EXIT_CODES=$(jq -r '(.runtime.stopExitCodes // [0]) | join(" ")' "$CONFIG")

if [ -z "$BOOT" ] || [ -z "$READY" ]; then
  echo "__SMOKE_FAIL__ no-runtime: runtime block is missing bootCommand or readyCheck"
  exit 3
fi

# D4: pre-boot staleness probe — one readyCheck run before bootCommand is ever spawned. See the
# header note above for why this fails closed instead of trusting the first post-boot poll.
if bash -c "$READY" >/dev/null 2>&1; then
  echo "__SMOKE_FAIL__ stale-ready: readyCheck already passed before bootCommand was spawned — a process from a previous run is likely still answering. Stop it (or clean the stale ready state), then re-run."
  exit 7
fi

LOG=$(mktemp "${TMPDIR:-/tmp}/spec-smoke.XXXXXX")
cleanup() {
  if [ -n "${BOOT_PID:-}" ] && kill -0 "$BOOT_PID" 2>/dev/null; then
    kill -s "$STOP_SIGNAL" -- "-$BOOT_PID" 2>/dev/null || kill -s "$STOP_SIGNAL" "$BOOT_PID" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$BOOT_PID" 2>/dev/null || break
      sleep 1
    done
    kill -0 "$BOOT_PID" 2>/dev/null && { kill -9 -- "-$BOOT_PID" 2>/dev/null || kill -9 "$BOOT_PID" 2>/dev/null; }
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

# New process group (set -m) so teardown reaps the whole tree, not just the shell.
set -m
bash -c "$BOOT" >"$LOG" 2>&1 &
BOOT_PID=$!
set +m

ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  if ! kill -0 "$BOOT_PID" 2>/dev/null; then
    echo "__SMOKE_FAIL__ boot-crashed: boot process exited before readyCheck passed (after ${ELAPSED}s). Last output:"
    tail -30 "$LOG" | sed 's/^/    /'
    exit 2
  fi
  if bash -c "$READY" >/dev/null 2>&1; then
    if [ "$RUN_SEED" -eq 1 ] && [ -n "$SEED" ]; then
      if ! bash -c "$SEED" >>"$LOG" 2>&1; then
        echo "__SMOKE_FAIL__ seed-failed: app booted ready but seedCommand failed. Last output:"
        tail -30 "$LOG" | sed 's/^/    /'
        exit 1
      fi
    fi
    # Shutdown observation (D1): the signal was already being sent from the EXIT-trap
    # cleanup below, but by then the leg's verdict was already fixed — claim it here,
    # before the pass line, while the exit status still counts.
    STOP_ELAPSED=0
    kill -s "$STOP_SIGNAL" -- "-$BOOT_PID" 2>/dev/null || kill -s "$STOP_SIGNAL" "$BOOT_PID" 2>/dev/null
    while [ "$STOP_ELAPSED" -lt "$STOP_TIMEOUT" ]; do
      kill -0 "$BOOT_PID" 2>/dev/null || break
      sleep 1
      STOP_ELAPSED=$((STOP_ELAPSED + 1))
    done
    if kill -0 "$BOOT_PID" 2>/dev/null; then
      kill -9 -- "-$BOOT_PID" 2>/dev/null || kill -9 "$BOOT_PID" 2>/dev/null
      echo "__SMOKE_FAIL__ shutdown-hung: process ignored ${STOP_SIGNAL} for ${STOP_TIMEOUT}s. Last output:"
      tail -30 "$LOG" | sed 's/^/    /'
      exit 6
    fi
    wait "$BOOT_PID"
    STOP_STATUS=$?
    STATUS_OK=0
    for code in $STOP_EXIT_CODES; do
      [ "$STOP_STATUS" = "$code" ] && { STATUS_OK=1; break; }
    done
    if [ "$STATUS_OK" -ne 1 ]; then
      echo "__SMOKE_FAIL__ shutdown-unclean: exit status ${STOP_STATUS} on ${STOP_SIGNAL} (128+signum means the default signal action killed it — no handler ran). Last output:"
      tail -30 "$LOG" | sed 's/^/    /'
      exit 6
    fi
    echo "__SMOKE_PASS__ ready after ${ELAPSED}s, stopped cleanly (exit ${STOP_STATUS}) after ${STOP_ELAPSED}s (boot: $BOOT | ready: $READY)"
    exit 0
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo "__SMOKE_FAIL__ not-ready: readyCheck never passed within ${TIMEOUT}s. Last boot output:"
tail -30 "$LOG" | sed 's/^/    /'
exit 1
