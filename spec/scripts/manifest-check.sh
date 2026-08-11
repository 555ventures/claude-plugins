#!/usr/bin/env bash
# Deterministic deliverable-manifest check — the "authored ⇒ activated" gate behind /spec:init.
# Init writes .claude/spec-manifest.json declaring every deliverable and the activation each
# claims; this script verifies each claim by existence or EXECUTION and fails closed. Init may
# not stamp generatedBy/contractHash until this exits 0 — the stamp asserts "my output was
# mechanically verified," not "I ran." /spec:doctor re-runs it as the activation check.
#
# Manifest shape (one JSON object):
#   { "checks": [ { "claim": "<one line>", "kind": "<kind>", "target": "<path|command|remote>" } ] }
# Kinds:
#   file    target path exists and is non-empty
#   exec    target command runs from the repo root and exits 0
#   smoke   the plugin's smoke.sh passes (target = optional config path override)
#   remote  `git remote get-url <target>` resolves (CI-activation proxy: no remote = CI inert)
#   inert   a recorded exemption — always passes, always printed (target = the stated reason).
#           An inert row is an explicit declaration, never a silent skip.
#
# Usage: manifest-check.sh [--manifest .claude/spec-manifest.json]
# Exit 0 = every check passed. Exit 1 = failures (each listed). Exit 5 = missing/invalid manifest.
# After the human prose summary, prints one machine sentinel line: TOTAL=<n> FAILS=<n> INERT=<n>
# (release.md's substrate paragraph parses these three counts verbatim — 2026-08-10 fix: the
# INERT count was previously attributed from prose that never printed it).
set -u

MANIFEST=".claude/spec-manifest.json"
[ "${1:-}" = "--manifest" ] && MANIFEST="${2:?--manifest needs a path}"

if [ ! -f "$MANIFEST" ]; then
  echo "manifest-check: no manifest at $MANIFEST — /spec:init has not written its deliverable manifest" >&2
  exit 5
fi
if ! jq -e '.checks | type == "array" and length > 0' "$MANIFEST" >/dev/null 2>&1; then
  echo "manifest-check: $MANIFEST is invalid — expected {\"checks\": [ ... ]} with at least one entry" >&2
  exit 5
fi

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
FAILS=0
INERTS=0
TOTAL=$(jq -r '.checks | length' "$MANIFEST")

i=0
while [ "$i" -lt "$TOTAL" ]; do
  CLAIM=$(jq -r ".checks[$i].claim // \"(no claim)\"" "$MANIFEST")
  KIND=$(jq -r ".checks[$i].kind // empty" "$MANIFEST")
  TARGET=$(jq -r ".checks[$i].target // empty" "$MANIFEST")
  case "$KIND" in
    file)
      if [ -s "$TARGET" ]; then echo "PASS  file    $CLAIM ($TARGET)"
      else echo "FAIL  file    $CLAIM — $TARGET missing or empty"; FAILS=$((FAILS+1)); fi
      ;;
    exec)
      if bash -c "$TARGET" >/dev/null 2>&1; then echo "PASS  exec    $CLAIM ($TARGET)"
      else echo "FAIL  exec    $CLAIM — '$TARGET' did not exit 0"; FAILS=$((FAILS+1)); fi
      ;;
    smoke)
      OUT=$(bash "$PLUGIN_ROOT/scripts/smoke.sh" ${TARGET:+--config "$TARGET"} 2>&1); RC=$?
      if [ "$RC" -eq 0 ] || [ "$RC" -eq 4 ]; then echo "PASS  smoke   $CLAIM ($(printf '%s' "$OUT" | head -1))"
      else echo "FAIL  smoke   $CLAIM — $(printf '%s' "$OUT" | head -1)"; FAILS=$((FAILS+1)); fi
      ;;
    remote)
      if git remote get-url "${TARGET:-origin}" >/dev/null 2>&1; then echo "PASS  remote  $CLAIM (${TARGET:-origin})"
      else echo "FAIL  remote  $CLAIM — git remote '${TARGET:-origin}' does not resolve (authored CI is inert without it; either add a remote or record this row as kind:inert with the reason)"; FAILS=$((FAILS+1)); fi
      ;;
    inert)
      echo "INERT $CLAIM — declared: ${TARGET:-<no reason given>}"
      INERTS=$((INERTS+1))
      ;;
    *)
      echo "FAIL  ?       $CLAIM — unknown kind '$KIND'"; FAILS=$((FAILS+1))
      ;;
  esac
  i=$((i+1))
done

if [ "$FAILS" -gt 0 ]; then
  echo "manifest-check: $FAILS of $TOTAL checks FAILED — the grounding layer is not activated; do not stamp generatedBy/contractHash"
  echo "TOTAL=$TOTAL FAILS=$FAILS INERT=$INERTS"
  exit 1
fi
echo "manifest-check: all $TOTAL checks passed"
echo "TOTAL=$TOTAL FAILS=$FAILS INERT=$INERTS"
exit 0
