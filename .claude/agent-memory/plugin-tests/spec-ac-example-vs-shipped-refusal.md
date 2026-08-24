---
name: spec-ac-example-vs-shipped-refusal
description: an AC's illustrative "e.g." text can contradict the very refusal rule it's demonstrating — verify AC worked examples empirically against the shipped script before encoding them as test literals
metadata:
  type: feedback
  reviewed: 2026-08-23
---

specs/20260819/02-mutation-replay.md's AC-20260819-02-4 gives a worked example: `--subject
"build(20260819/02): scheduled mutation replay harness"` expected to print verbatim and succeed.
That string is literally this repo's own build commit subject for the spec (`git log` shows
`c7b48e7 build(20260819/02): scheduled mutation replay harness`), reused as flavor text — but it
contains both "mutation" and "replay", so under the SAME spec's own D5 refusal rule
(`/replay|mutation|corpus/i.test(subject)`) the shipped `spec/scripts/replay.js` actually REFUSES
it with exit 2. Verified directly: `node -e "console.log(/replay|mutation|corpus/i.test('build
(20260819/02): scheduled mutation replay harness'))"` → `true`.

**Why:** AC "e.g." examples are prose, sometimes lifted from real repo history without being
re-checked against the Decision's own rules in the same spec. Encoding one verbatim into a test
would have pinned a false expectation (test asserting success where the real code exits 2), or
worse, silently passed by accident if the regex happened not to fire.

**How to apply:** when a spec's AC gives a worked-example literal (a subject string, a flag value,
a file path) for a case expected to SUCCEED, run it once against the actual current script before
hardcoding it in a test assertion — don't transcribe example prose on faith. If it contradicts the
Decision, don't block on it unless the dispatcher's own instructions require that literal text;
substitute a different compliant example that demonstrates the same clause, and (if dispatched via
wf-build) still flag the discrepancy in the return so the spec's example text gets corrected later.
See [[stale-dispatch-premise-concurrent-session]] for the related discipline of re-verifying
dispatch-prompt claims against live repo state rather than trusting the narrative.
