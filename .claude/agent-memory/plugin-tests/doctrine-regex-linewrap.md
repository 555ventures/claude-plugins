---
name: doctrine-regex-linewrap
description: Doctrine regex pins must use \s+ (not a literal space) between words that can straddle a hard-wrapped markdown line break
metadata:
  type: feedback
  reviewed: 2026-08-30
---

Doctrine `.md` files in this repo hard-wrap prose at ~85-90 chars. A regex pin like
`/reachability is (never|not) exempt/i` (literal space between words) will silently
false-negative on any file where that exact phrase happens to fall across a wrapped line
break (e.g. `spec/templates/spec.md` wraps "reachability is\n     never exempt" while
`build.md`, `core.md`, `init.md` happen to keep the same phrase on one line). The fix is
`\s+` between words spanning more than a couple tokens, not a literal space — this is not a
weakening, it's correcting a false negative caused by markdown reflow that has nothing to do
with the doctrine's substance.

**Why:** Hit in specs/20260810/02-terminal-observable-acs.md's AC-3 pin (CARVE_OUT regex) —
three of four exemption-home files matched fine, the fourth failed only because of where the
phrase fell in that file's paragraph wrap, not because the doctrine was wrong.

**How to apply:** When writing/repairing a doctrine regex pin that spans multiple words and
will be checked against prose in `spec/commands/`, `spec/doctrine/`, or `spec/templates/`,
default to `\s+` for inter-word gaps beyond the first, rather than a literal space — cheap
insurance against line-wrap false negatives, and it doesn't loosen what the pin requires
semantically.

**Recurred 2026-08-14:** `tests/workflow-runid-provenance.test.js` (JJ-20260814-02, build.md's
resume sentence) — `reuse the prior \`runId\` if known` wraps as `reuse the prior\n
\`runId\` if known` in build.md. First-draft regex used a literal space and failed with a
false "sentence not found" instead of the intended red assertion; caught immediately by
actually executing the test (`node --test`) rather than trusting the regex by inspection —
reinforces always running a new doctrine pin once before reporting it, not just reading the
source for the phrase.
