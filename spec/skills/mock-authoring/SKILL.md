---
name: mock-authoring
description: The four rules for drawing a screen, component or shell in the mock app — load before the first edit at SHELL, SCREENS or THEME
---

# Mock Authoring

Load this skill before the first edit of any SHELL, SCREENS or THEME step. It carries the half of
the contract `mock-review check` cannot see the intent behind — the checkable half still shows up
as a `check --json` finding if you miss it.

1. **A screen imports only from `react`, `@/components/ui`, `@/components`, `@/shells` and
   `@/records`.** Nothing else — a screen that reaches past those five layers is a `layer`-kind
   error finding.
2. **Every project component and shell carries one `/** … */` doc line above its export and a
   named `examples` export.** `mock-review sweep`'s inventory is built from these; a component or
   shell with neither is invisible to your own worklist and is a `doc`-kind error finding.
3. **Screens take their data from `src/records`, never literals.** Compose content from the typed
   arrays under `src/records/` — the files SEED demanded from the seed's `## Records` entities —
   never a hand-typed string standing in for what a record should supply.
4. **Read the shadcn component's official example source before composing.** Don't guess a prop
   shape from memory; look at how the component is actually used.

`design/examples/screen.example.tsx` and `design/examples/records.example.ts` are the starting
shapes — copy from them, never edit them in place. They sit outside every contract host glob, so
the reviewer never lists them as a real screen or a real records file.
