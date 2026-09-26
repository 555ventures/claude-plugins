---
name: design-brief
description: The method for authoring docs/design/brief.md and the rules file's tables at genesis's DESIGN_BRIEF step — load before the first line
---

# Design Brief

Load this skill before writing the first line of `docs/design/brief.md` at `DESIGN_BRIEF`. It
carries the judgment half of the contract the driver's own mechanical checks (spec/doctrine/
genesis.md § Genesis: Design Stage) cannot see — the checkable half still shows up as a refusal
if you miss it.

1. **Users and context come from confirmed ledger rows and the seed, never invented.** A
   synthetic persona is noise, not grounding — write only what a confirmed row or the seed
   actually says about who uses this and the context they're in.
2. **One JTBD line per journey, journeys before any entity.** Each `### <journey>` block opens
   with a line in the exact form `JTBD: When <trigger>, I want to <goal>, so I can <outcome>.`
   The brief locks journeys before any entity or data-model section exists — that ordering is
   the point, not an accident of template layout.
3. **Navigation is task plus frequency, never one list-detail pair per entity.** Name what the
   user does and how often (`several per day`, `weekly`, …), then where it starts — a
   navigation table shaped around entities instead of tasks is the failure mode this point
   exists to head off.
4. **Read the catalog whole, then split it.** `docs/design/catalog.md` is the installed
   catalog's full inventory — read it entirely before writing `## Catalog`, then split every
   component it lists into `### Used` or `### Excluded`, one reason per exclusion. A `### Used`
   name absent from `docs/design/catalog.md` is a refusal, not a judgment call.
5. **One composite per intent, states as story export names.** `## Composites` carries one row
   per distinct intent (`edit one record`, `confirm destructive`, …), and its `States` column
   names the story export names the kit will carry — not prose descriptions of state.
6. **The tables live in the rules file, in the stack's idiom, never copied into the brief.**
   Write `## Intent to pattern` and `## Naming` into the auto-loaded rules file directly — one
   naming section per layer (the layers the rules file's own naming grammar already splits on).
   The brief's `## Composites` table and the rules file's `## Intent to pattern` `Composite`
   column must name exactly the same set; a second, hand-kept copy is what this split exists to
   avoid.
