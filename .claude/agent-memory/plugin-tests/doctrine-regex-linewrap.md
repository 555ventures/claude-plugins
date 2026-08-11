---
name: doctrine-regex-linewrap
description: Doctrine regex pins must use \s+ (not a literal space) between words that can straddle a hard-wrapped markdown line break
metadata:
  type: feedback
---

Doctrine `.md` files in this repo hard-wrap prose at ~85-90 chars. A regex pin like
`/reachability is (never|not) exempt/i` (literal space between words) will silently
false-negative on any file where that exact phrase happens to fall across a wrapped line
break (e.g. `spec/templates/spec.md` wraps "reachability is\n     never exempt" while
`build.md`, `shared.md`, `init.md` happen to keep the same phrase on one line). The fix is
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
