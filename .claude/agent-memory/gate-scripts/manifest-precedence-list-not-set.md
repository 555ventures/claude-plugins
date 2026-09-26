---
name: manifest-precedence-list-not-set
description: when a spec's D-decision lists several manifest filenames for one stack (e.g. python's pyproject.toml | setup.py | requirements.txt), pick by an if/else-if chain in the decision's own listing order, never a Set/object lookup that could reorder
metadata:
  type: feedback
---

A D-decision that lists several candidate manifests for one stack, in prose order, is specifying
a precedence chain, not a set of equally-valid alternatives. `workspace-scan.js`
(specs/20260926/03 D1) implements this as a straight-line `if (has(x)) return … else if (has(y))
…` ladder in the decision's exact prose order (package.json → pyproject.toml → setup.py →
requirements.txt → go.mod → …), so a directory carrying two manifests always resolves to the
first-listed one deterministically.

**Why:** the spec explicitly calls out "decide deterministically which manifest wins when a dir
has several manifests, pick by the D1 listing order, note that choice in the header" — a
map/Set-based dispatch has no inherent order guarantee across engines/versions, and a header
comment that only says "see D1" without restating the win order leaves a future reader unable to
verify determinism by reading the script alone.

**How to apply:** when a script's header cites a D-decision that lists ordered fallback options,
restate the win order in the header's own prose (not just "per D1"), and implement the check as
literal sequential `if` branches — never a lookup table whose iteration order is incidental.
