#!/usr/bin/env bash
# Deterministic boot-smoke leg — the executed-program check behind every review verdict.
# Boots the host app (config runtime.bootCommand), polls runtime.readyCheck until it passes
# or times out, then tears the process group down. No model narrates pass/fail: the exit
# code and the __SMOKE_*__ sentinel line are the verdict (same lesson as the gate sentinel).
#
# Usage: smoke.sh [--config <path>] [--timeout <seconds>] [--seed]
#   --config   path to spec.config.json (default .claude/spec.config.json under CWD)
#   --timeout  override runtime.readyTimeout (default 120s)
#   --seed     also run runtime.seedCommand after ready (for behavioral checks; boot-only by default)
#
# Exit codes:
#   0  boot observed ready            (__SMOKE_PASS__)
#   1  readyCheck never passed        (__SMOKE_FAIL__ not-ready)
#   2  boot process died before ready (__SMOKE_FAIL__ boot-crashed)
#   3  no runtime block in config     (__SMOKE_FAIL__ no-runtime) — "the host gives review no
#      way to boot" is itself a blocking finding, not a skipped check
#   4  runtime declared inert         (__SMOKE_INERT__) — sanctioned only for hosts with no
#      bootable process (libraries, pure CLIs); the declared reason is printed
#   5  usage / config parse error
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

if [ -z "$BOOT" ] || [ -z "$READY" ]; then
  echo "__SMOKE_FAIL__ no-runtime: runtime block is missing bootCommand or readyCheck"
  exit 3
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
    echo "__SMOKE_PASS__ ready after ${ELAPSED}s (boot: $BOOT | ready: $READY)"
    exit 0
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo "__SMOKE_FAIL__ not-ready: readyCheck never passed within ${TIMEOUT}s. Last boot output:"
tail -30 "$LOG" | sed 's/^/    /'
exit 1
