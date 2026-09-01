#!/usr/bin/env bash
# UserPromptSubmit hook (D1, specs/20260901/02-run-provenance.md, 2026-09-01): on a prompt whose
# text starts with /spec: this stamps <cwd>/.claude/spec-session.json = {session_id,
# transcript_path, cwd, ts}, written atomically (temp file + mv).
#
# Incident (2026-09-01, spec run-provenance): no ledger row could name which model held the
# session that produced it — the session model is not in the shell environment (executed spike
# A1), and the only carriers are a hook's stdin (session_id, transcript_path) and the transcript
# itself. This hook is the sole route from a hook's stdin to a driver subprocess that has neither.
# lib/session-stamp.js later reads this file plus the named transcript to derive the model at
# ledger-row-write time (never here — this hook only files the two strings verbatim).
#
# What this deliberately does NOT do: print anything on a non-empty stdout (a UserPromptSubmit
# hook's stdout is injected into the model's context on every single /spec: prompt), validate the
# stamped values beyond "did stdin parse as JSON with a usable cwd", or retry a failed write —
# every failure mode (a non-/spec: prompt, malformed stdin, a missing cwd, an unwritable .claude
# directory, a missing jq) degrades to a silent no-op, never a blocked prompt. D9 (recorded, not
# solved, specs/20260901/02-run-provenance.md): two sessions prompting /spec: in the same root
# last-writer-wins this file — there is no per-session identity to key it by.
#
# Exit codes: 0 (always) — a stamp must never block a prompt, so there is no other value to report.
set -u

# A missing jq leaves no safe way to parse stdin or emit JSON — degrade to a no-op before ever
# reading stdin.
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null) || exit 0
[ -z "$PROMPT" ] && exit 0

case "$PROMPT" in
  /spec:*) ;;
  *) exit 0 ;;
esac

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
[ -z "$CWD" ] && exit 0
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)

CLAUDE_DIR="$CWD/.claude"
mkdir -p "$CLAUDE_DIR" 2>/dev/null || exit 0
[ -w "$CLAUDE_DIR" ] || exit 0

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TMP="$CLAUDE_DIR/.spec-session.$$.tmp"
jq -n --arg session_id "$SESSION_ID" --arg transcript_path "$TRANSCRIPT_PATH" \
  --arg cwd "$CWD" --arg ts "$TS" \
  '{session_id: $session_id, transcript_path: $transcript_path, cwd: $cwd, ts: $ts}' \
  > "$TMP" 2>/dev/null || { rm -f "$TMP" 2>/dev/null; exit 0; }
mv -f "$TMP" "$CLAUDE_DIR/spec-session.json" 2>/dev/null || rm -f "$TMP" 2>/dev/null

exit 0
