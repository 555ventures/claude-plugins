---
name: ac-example-unreachable-branch
description: an AC's "e.g." example can point at a script branch that is dead code (unreachable via any real call), and a remedy-string AC can be vacuous as a red pin because the literal was already hardcoded — verify reachability and vacuity empirically before writing the exec test
metadata:
  type: feedback
  reviewed: 2026-09-03
---

specs/20260820/08-config-name-ban.md AC-20260820-08-9 gave `review-legs.js` with an unreadable
config → stderr contains `cannot read .claude/spec.config.json under --root` (review-legs.js:77,
inside a `try { config = readConfig(root) } catch (e) { ... }`). But `readConfig()` in
`lib/host-config.js` internally swallows every read/parse failure to `{}` — it can never throw —
so that catch block is unreachable dead code under any `--root` value. The only reachable remedy
in that script for an absent/unreadable config is the *next* line's `if (!config.gateCommand)`
message (review-legs.js:81, "no gateCommand in .claude/spec.config.json under --root"), which is
also one of the same D9 migration targets and does render the path.

Separately, that reachable test turned out **vacuous as a red pin**: the current source already
hardcodes the literal `.claude/spec.config.json` in that message, so asserting the rendered output
contains the path passes identically before and after the CONFIG_RELPATH migration (the string
VALUE doesn't change, only its construction). Per this repo's rules § Gotchas generalized
vacuous-rejection/output entry (4th/5th occurrence), the fix is not to force a false red — keep the
test as the correct post-implementation assertion and log the vacuity, trusting a sibling
source-level pin (here, `config-read.test.js`'s `scanConfigReadOffenders` production pin) to be the
thing that actually reddens pre-migration.

**Why:** an AC's worked example is prose written against the spec author's mental model of the
script, not a transcript of an actual execution. [[spec-ac-example-vs-shipped-refusal]] already
covers examples that contradict the very rule they demonstrate; this is the sibling failure mode —
an example that names a branch no call path can reach. Both require executing the real script
before encoding the example as a test literal, never transcribing on faith.

**How to apply:** before writing an exec-a-script test from an AC's `e.g.`, read the target
function's full control flow and ask "can any input actually take this branch?" — trace what the
called library function can and cannot throw, not just what the AC prose implies. If the exact
branch is unreachable, test the reachable sibling that serves the same normative AC text (here,
"any of the seven remedy strings renders the path") and log the departure as a deviation rather
than blocking. Then separately check: does this exec test already pass against CURRENT
(pre-implementation) code? If yes, it's a vacuous red pin — per the Gotchas generalized
vacuous-rejection/output rule, keep it as-is (it's still the correct post-implementation
assertion) and log the vacuity instead of trying to artificially redden it; rely on a sibling
source-level test to carry the actual TDD-red signal.
