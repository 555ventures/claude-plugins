# Spike: JSON-RENDER (@json-render/* 0.21.0, shadcn catalog)

**Tokens (o200k_base)**

| File | Tokens | Chars |
|---|---|---|
| specs/shell.json | 319 | 971 |
| specs/owner-intro.json | 1,043 | 3,286 |
| specs/owner-session.json | 1,277 | 3,965 |
| specs/reciprocity-brief.json | 1,267 | 3,926 |
| specs/roster-confirm.json | 1,331 | 4,176 |
| catalog-additions.ts (navigate action) | 68 | 290 |
| **Authored total** | **5,305** | **16,614** |
| Setup commands (separate) | 203 | 701 |
| One-time glue, not counted (App.tsx, catalog.ts) | 526 | 2,169 |

I wrote 6 files. Writing the specs took about 4.5 minutes of wall-clock time. The whole spike, including setup, took about 8 minutes.

**Data:** The screens use the library's own data binding. All records are loaded as the `state` model, and the specs read them with `$state`, `$template`, `repeat` and `$item`. Nested repeats cover `askedOf`, `topics`, `brands` and languages. No record values are pasted into the specs.

**Shell:** The shared header is written once in `shell.json`. Each screen is layered on top of it with the library's `deepMergeSpec`. Each screen sets its own step number through `state.ui`.

**Next-screen control:** Each one has `on.press → {action:"navigate", params:{"data-to":"<next>"}}`. This is not a DOM attribute. The shadcn components drop props they don't know. The click-through test passed: owner-session → reciprocity-brief → roster-confirm.

**Setup pain**
- `npm create vite` with an absolute `/private/...` path dropped the leading slash and scaffolded inside the current repo. I moved it out.
- `shadcn init` stops at a preset prompt even with `-y`. It needs `-p nova`.
- The README quickstart (StateProvider + ActionProvider) crashes with "useVisibility must be used within a VisibilityProvider". `JSONUIProvider` is needed instead.
- Tailwind needs `@source` entries for both the package dist and the specs folder.

**Retries on invalid JSON:** 0. `validateSpec` and `catalog.validate` passed on the first write. But a probe showed `catalog.validate` only checks component type names. A bad enum, an unknown prop such as `data-to`, and an undeclared action all pass. So "valid" is a weak guarantee. There were 2 visual fixes after rendering: the header didn't stretch to full width, and the brief's section rules had uneven widths.

**What the catalog couldn't express**
- **Colour:** `Alert type:info` is hard-coded blue. I left out `type` to keep it gray.
- **Responsive layout:** `Grid` has fixed columns. I used the `className` escape hatch, e.g. `lg:grid-cols-[2fr_1fr]`.
- **Tables:** `Table` needs string arrays, so records can't be bound to it. I used repeat cards instead.
- **Counts:** there are no derived values without a registered `$computed` function.
- **`data-to`:** it can't be put in the DOM.

**Swapping in a real kit later:** The specs only name catalog types such as Card, Stack and Button. Keep `catalog.ts` and replace `shadcnComponents` in `defineRegistry` with the real kit's components under the same names and prop schemas, plus the kit's CSS. The spec JSON doesn't change. The `className` strings in the specs are Tailwind-specific and would have to move with it.

**Judgment:** Easy for an agent to write, with no failed first writes. But the output is about 2× longer than equivalent TSX, the validator is too weak to catch wrong props, and anything responsive falls back to raw Tailwind strings.

Files are in /private/tmp/claude-501/-Users-jj-Projects-claude-plugins/dd9972ad-2a26-4cf2-997f-590e6ce1aa5c/scratchpad/spike-wf/:
- json-render/specs/*.json
- json-render/tokens.json
- json-render/setup-commands.sh
- json-render/app/ (validate.mjs, shoot.mjs, count-tokens.mjs)
- shots/json-render/*.png (8 files)
