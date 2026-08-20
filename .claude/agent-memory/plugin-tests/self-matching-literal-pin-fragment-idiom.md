---
name: self-matching-literal-pin-fragment-idiom
description: a grep-for-string pin that must also scan its own file assembles the forbidden string from split fragments at runtime rather than exempting its own path
metadata:
  type: feedback
---

When a suite pin greps the tracked tree for a literal string (a package name, a banned
byte, a banned phrase) and the pin's own file is itself tracked, spelling the forbidden
string whole anywhere in the pin's source — test title, assert message, comment — makes
the pin fail against itself with no way to go green.

The house resolution, confirmed twice now (`tests/tracked-text-purity.test.js`'s raw-NUL
pin, spelled as `'\x00'` instead of the literal byte; `tests/consistency/dependency-free.test.js`'s
SDK-package pin, assembled as `SDK_SCOPE + '/' + SDK_NAME` at runtime) is to make the
string un-literal in source — never to filter the pin's own path out of the hit list.
Both pins explicitly reject a self-exemption allowlist: an exemption fails silent if a
future edit ever rejoins the fragments back into a literal, whereas an un-literal spelling
keeps failing loudly if that happens. Messages may still *print* the runtime-assembled
value (e.g. `JSON.stringify(live)`, `'a raw NUL...'` describing the byte) — only the
literal *source spelling* is forbidden, not the described concept.

Always carry a loud comment at the fragment/escape site explaining WHY (the pin scans
every tracked file for this exact string) and naming the cost (a plain-text sweep for the
whole string will no longer surface this file — point the reader at the AC-id or filename
instead).

**Why:** dispatched from JJ 2026-08-20 fixing `tests/consistency/dependency-free.test.js`
(spec `specs/20260820/01-autopilot-removal.md`), which was red against itself because its
test title and messages spelled `@anthropic-ai/claude-agent-sdk` in full.

**How to apply:** whenever authoring or repairing a literal/regex pin whose own file lives
inside the tree it scans, check first whether the forbidden string appears in the pin's own
source, and if so, split/escape it rather than adding a self-path exemption.
