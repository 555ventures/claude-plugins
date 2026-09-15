# Seed — { product }

<!-- Grammar: spec/doctrine/mocks.md § Mocks: Seed. `seed-done` closes this file: every declared
     `## Records` entity must have a written app/src/records/<entity>.ts, and app/mock.config.ts
     must exist. Every journey label must be declared in exactly one journey. Written by the
     mocks driver on a cold root (spec-paths mocks-driver), then hand-edited by the session
     between marks. -->

## Product

{ three sentences: what it is · who it is for · the one job it must do }

## Records

<!-- One `- <entity>` line per kind of data the product handles. Each entity is written by hand
     as app/src/records/<entity>.ts (copy the shape of design/examples/records.example.ts) — a
     typed array derived from the Product sentence above, docs/design/research-brief.md and
     anything under design/mocks/references/. Invent every value, awkward ones included (the
     customer with no surname); this is a mock, never ask the user for data. Screens draw these
     values, never literals (spec/skills/mock-authoring/SKILL.md). -->
- customer

## Journeys

<!-- One `### <journey-kebab>` per journey: a persona line, then one fenced surfaces block in the
     roadmap-brief grammar (spec/templates/roadmap-brief.md § Surfaces) — names and arrows only,
     one line per edge. Journeys exist before the first screen; SCREENS draws them in this order.
     Each edge here is drawn as a real control: the element that leads from one screen to the
     next carries `data-to="<label>"`, checked against `src/journeys.ts` at `journey-drawn`. -->
### { journey-kebab }
{ Persona name (role) is invited/starts/arrives, does the one thing this journey is for, and
ends at the last screen. }
```surfaces
{ label }
{ label } -> { label }
```
