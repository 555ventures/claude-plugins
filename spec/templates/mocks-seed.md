# Seed — { product }

<!-- Grammar: spec/doctrine/mocks.md § Mocks: Seed. `seed-done` closes this file: every key
     below must name a ledger.md product row whose status is confirmed (said-by-user or
     ratified-doc); every journey label must be declared in exactly one journey; each Dense
     screens label must already be declared; each Records entity's file must exist, parse as an
     object with `provenance` "real" or "synthetic", and hold at least three `records`. Written by the mocks driver on a cold root
     (spec-paths mocks-driver), then hand-edited by the session between marks. -->

## Product

{ three sentences: what it is · who it is for · the one job it must do }

## Facts

<!-- One line per key, each naming a confirmed product row in design/mocks/ledger.md. Order is
     fixed; primary-surface and platforms-horizon come first because no screen exists yet. -->
- primary-surface: P1
- platforms-horizon: P2
- tenancy: P3
- offline: P4
- realtime: P5
- ai-in-loop: P6
- residency: P7
- payer: P8
- day-one-integrations: P9
- scale-outage: P10
- vendor-limits: P11
- retention: P12
- legal-floor: P13

## References

<!-- One `- <path or url> — <what to borrow>` line per reference, or `- none`. Anything under
     design/mocks/references/ is picked up automatically — list it here too when it needs a
     note on what to borrow from it. -->
- none

## Records

<!-- One `- <entity>: records/<entity>.json` line per entity the product handles, path relative
     to design/mocks/. Each file is
     { "provenance": "real" | "synthetic", "records": [ ... ] } with at least three records.
     "real" = the client's own records — ask for the awkward ones (the customer with no
     surname, the order with three delivery addresses); always prefer these. "synthetic" = you
     invented them, the honest answer when the product has no customers yet — invent the same
     awkward ones. Wireframes draw these values, never placeholders. -->
- customer: records/customer.json

## Journeys

<!-- One `### <journey-kebab>` per journey: a persona line, then one fenced surfaces block in
     the roadmap-brief grammar (spec/templates/roadmap-brief.md § Surfaces) — names and arrows
     only, one line per edge. Journeys exist before the first screen; the atlas renders them
     today, a later spec can derive roadmap briefs from them. Each edge here is drawn in the
     mock as a real control: the element that leads from one screen to the next carries
     `data-to="<label>"`, checked against these edges at `journey-drawn`. -->
### { journey-kebab }
{ Persona name (role) is invited/starts/arrives, does the one thing this journey is for, and
ends at the last screen. }
```surfaces
{ label }
{ label } -> { label }
```

## Dense screens

<!-- One or two labels already declared in a journey above — the screen(s) most representative
     of the product's real complexity; every theme candidate is judged on this pair. -->
- { label }
- { label }
