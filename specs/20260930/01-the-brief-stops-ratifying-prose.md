---
date: 2026-09-30
status: done
build_base: design-retool
tier: critical
area: genesis
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: d6248b5036abb271eb7882efc3597e3b69d58c57
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260930-01-1, AC-20260930-01-2, AC-20260930-01-3, AC-20260930-01-4, AC-20260930-01-5, AC-20260930-01-6, AC-20260930-01-7]
---

# The brief stops ratifying prose

## Goal

Genesis's early BRIEF step still makes every non-API project write two design artifacts: a
one-page taste doctrine (`docs/design/doctrine.md`, ≤120 lines, a non-empty `## Dissents`) and a
category-only rules manifest (`.claude/genesis/design-rules.json`). ADR-0030 (b) says the design
contract is code, and that no prose enforces it. Brief 30's design stage now writes the real
contract: the design brief plus the auto-loaded rules file, checked by `design-contract-check`
and mechanized by `/spec:enforce`'s `kit-discipline` and per-layer naming cells. The old pair
is a second canon that nothing checks. This spec retires both artifacts, their driver gate,
and every reader: `/spec:enforce`'s design-enum fold, `/spec:doctor`'s hash check, `/spec:init`'s
legacy path, and the grounding contract's `designRulesHash` key. Done means a genesis run
reaches MENUS without either file on disk, and no live plugin surface names either file.
