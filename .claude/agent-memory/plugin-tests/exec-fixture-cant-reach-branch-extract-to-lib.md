---
name: exec-fixture-cant-reach-branch-extract-to-lib
description: When an AC's exec-a-script fixture structurally cannot produce the input shape the AC names (a real binary always emits a superset), extract the parser to spec/scripts/lib/ and prove the branch with a direct test instead of patching the exec fixture.
metadata:
  type: feedback
  reviewed: 2026-09-03
---

Finding pattern (2026-08-24, specs/20260823/09-replay-baseline-attribution.md
AC-20260823-09-8): a driver test claimed to prove a five-token selection line (baseline
tokens ABSENT) parses without dying. Its fixture (`makeReplayHost` + `driveToClose` +
`commitClose`) drives the REAL `spec/scripts/replay.js`, whose `--select` line
unconditionally appends `baselineRed=`/`baselineLegs=` as VALUES (never omits the keys,
`unknown` used as a value) — so that exec fixture can only ever produce a seven-token
line. The test's two assertions passed trivially regardless of whether the `|| null`
fallback worked; the absence branch had zero coverage despite a green, confidently-named
test.

**Fix shape**: extract the parsing function (`parseSelection`) out of the driver script
into `spec/scripts/lib/<name>.js` (byte-identical regex/logic — confirm with a quick
`node -e` before/after diff), have the driver `require` it, then add a new
`tests/<name>/<name>.test.js` that calls the module directly with a hand-built string for
the unreachable shape. Retarget the old exec test to what it ACTUALLY proves (here: "a
seven-token line still enters REPLAY") and strip the AC-ID it can no longer honestly claim
— move the AC-ID onto the new direct test. Update the spec's AC `→ path` pointer to the
new test file; leave the AC wording and File Plan table alone unless explicitly asked.

**Why**: this is the same class of defect as [[review-finding-pins-no-ac]] and
[[ac-example-unreachable-branch]] — a claimed proof that is structurally vacuous. The tell
is: does the SUT (the real binary/script the fixture drives) ever actually produce the
input shape the AC names, or only a superset/different shape? If never, no amount of
fixture tweaking inside the exec harness fixes it — the function needs to be reachable
directly.

**How to apply**: when reviewing or writing an exec-a-script test whose AC names a
specific absence/edge shape, check the upstream script that GENERATES the fixture's input
for whether it can ever actually omit/vary that shape. If it can't, extracting the
pure-logic function to `spec/scripts/lib/` (established precedent:
`file-plan.js`/`frontmatter.js`/`observation.js`, each with a matching
`tests/<name>/<name>.test.js` requiring the lib directly) is the standing fix, not a
elaborate exec-fixture workaround.
