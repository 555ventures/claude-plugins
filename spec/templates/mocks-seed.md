# Seed — { product }

<!-- Grammar: spec/doctrine/mocks.md § Mocks: Seed. `seed-done` closes this file: every key
     below must name a ledger.md product row whose status is confirmed (said-by-user or
     ratified-doc); every journey label must be declared in exactly one journey; the Dense
     screen label must already be declared. Written by the mocks driver on a cold root
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

## Journeys

<!-- One `### <journey-kebab>` per journey: a persona line, then one fenced surfaces block in
     the roadmap-brief grammar (spec/templates/roadmap-brief.md § Surfaces) — names and arrows
     only, one line per edge. Journeys exist before the first screen; the atlas renders them
     today, a later spec can derive roadmap briefs from them. -->
### { journey-kebab }
{ Persona name (role) is invited/starts/arrives, does the one thing this journey is for, and
ends at the last screen. }
```surfaces
{ label }
{ label } -> { label }
```

## Dense screen

<!-- One label already declared in a journey above — the screen most representative of the
     product's real complexity; theme directions must survive composing against it. -->
- { label }
