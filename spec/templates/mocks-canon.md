# Canon — { product }

<!-- Grammar: spec/doctrine/design.md § Design Canon. `canon-written` closes this file: it
     must exist before any design/mocks/*.html (canon first, one screen at a time), and
     design/wire/tokens.css + design/wire/wire.css must exist alongside it (copied from
     spec/templates/mocks/ when absent). Written once at the start of WIREFRAMES, then held
     as the one-hand reference every screen is drawn against. -->

## Shells

{ The app shell(s) this product needs, if any — persistent chrome around a content slot (nav,
header, tab bar). Name each shell and what it always shows; "none" is a legitimate answer for
a single-surface product. }

## Primitives

<!-- ≥1 bullet, "- **<name>** — <purpose>". The inventory that keeps one hand consistent
     across every screen — a button, a card, a list row, a form field — named once here and
     reused, never reinvented per screen. -->
- **{ Primitive name }** — { the one purpose it serves and where it recurs }

## Rules

{ The layout and composition rules that hold across every screen: spacing scale, when a list
becomes a card, how empty/loading/error states are shown, what "dense" means for this product.
Taste rules the render check can't encode — binding by convention, not by script. }

## Grounding

This canon is binding against `docs/design/research-brief.md` and `design/mocks/seed.md` — a
screen that contradicts either is a canon or seed problem, never a screen-local exception.
