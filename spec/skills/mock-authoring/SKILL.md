---
name: mock-authoring
description: The five rules for drawing a screen as one gray json-render file in the wireframe — load before the first edit at a draw step
---

# Mock Authoring

Load this skill before the first edit of a screen file. It carries the half of the contract
`--mark journey-drawn` cannot see the intent behind — the checkable half still shows up as a
finding if you miss it. Screens live under `design/mocks/screens/`; the model is a plain gray
wireframe the walkthrough service renders, with no colours and no shared layout (the design
stage owns both).

1. **One file per screen and state, named exactly as the beat names it.**
   `design/mocks/screens/<screen>.json` or `<screen>@<state>.json` — the json-render spec
   itself (`root`, `elements`, optional `state`). A beat's `screen[@state]` is the file's name;
   a file name outside `^[\w][\w-]*(@[\w][\w-]*)?\.json$` is a `bad-screen-file` finding.
2. **Only the catalog's components and their props.** The catalog is
   `spec/templates/walkthrough/catalog.json`; an unknown component or prop is a finding at `--mark journey-drawn`.
3. **Every move between two screens of a journey is a real control that navigates there.** An
   element whose `on.press` navigates to the next screen; a move with no such control is a
   `no-control` finding.
4. **Sample values are invented from the seed, awkward cases included, and one person or record
   reads the same on every screen.** Never ask the user for data; the name on screen one is the
   name on screen four.
5. **An element's key is its stable name — a note is pinned to it, so a key is never renamed
   while the element lives.**

`spec/templates/walkthrough/screen.example.json` is one valid screen file — copy its shape,
never edit it in place.
