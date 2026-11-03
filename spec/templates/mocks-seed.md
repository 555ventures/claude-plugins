# Seed — { product }

<!-- Grammar: spec/doctrine/mocks.md § Mocks: Seed. `seed-done` closes this file: it declares at
     least one journey, every journey opens with a job story and has a beat, one beat is off-path,
     and no line is malformed. Written by the mocks
     driver on a cold root (spec-paths mocks-driver), then hand-edited by the session between
     marks. -->

## Product

{ three sentences: what it is · who it is for · the one job it must do }

## Journeys

<!-- One `### <journey-kebab>` per journey: a job story line — `When <situation>, I want <motivation>, so I can <outcome>.` — then numbered beats, one per line —
     `N. "client sentence" -> screen[@state]`. Quotes are mandatory; `N` runs contiguously from
     1; `screen` and `state` match `^[\w][\w-]*$`; `@state` is optional, except that one beat per journey lands on `@first-run` or `@empty` (the
     off-path beat; `--mark seed-done` refuses a journey without it). Alternates ("if X then
     Y") are separate journey blocks; the same sentence or the same screen may appear in any
     number of journeys. Journeys exist before the first screen; SCREENS draws them in this
     order and copies each beat verbatim into the screen files. Each consecutive beat pair whose
     screens differ is drawn as a real control: an element on the first screen whose press
     navigates to the next, checked at `journey-drawn`. Invent every sample value from these
     sentences, awkward ones included (the customer with no surname); never ask the user for
     data. -->
### { journey-kebab }
When { situation }, I want { motivation }, so I can { outcome }.
1. "{ I open the app }" -> { home }
2. "{ I see nothing here yet }" -> { login }@{ first-run | empty }
