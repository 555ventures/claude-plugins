---
name: contracts-block-overrides-decision-table-example
description: When a Decision table's inline example finding text conflicts with the spec's Contracts block and the pinned AC tests, follow the Contracts block/tests, not the table cell's literal
metadata:
  type: feedback
  reviewed: 2026-09-12
---

A spec Decision table cell can show a `text:` example (e.g. `'<label>: region <n> carries
neither data-kit nor data-bespoke — …'`) that is looser/imprecise compared to the spec's own
Contracts section, which gives the byte-exact wire format (`<file>: region <n> carries
neither…` — no label). When the two disagree, and every red AC test matches the Contracts
block verbatim, implement to the Contracts block + tests and log a one-line deviation noting
the table cell's literal was not followed. Don't guess which is "more authoritative" from
prose alone — the Contracts section is the wire-format oracle, and pinned tests are the
executable oracle; a Decision table cell's inline example is illustrative, not load-bearing.

**Why:** discovered on specs/20260907/04-kit-canon-family.md D4 — the table cell's example
text carried a `<label>: ` prefix that no Contracts line or AC test expected.

**How to apply:** whenever a Decision's inline `text:`/example string looks handwritten and a
Contracts block or AC test exists for the same surface, diff them before implementing; on
conflict, code to Contracts+tests and log the deviation rather than picking one by feel.
