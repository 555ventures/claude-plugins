# Spike: A2UI, owner-onboarding gray wireframes

**Stack:** Vite 8 + React 19, `@a2ui/react@0.11.1` (v0_9 entry) with `@a2ui/web_core@0.11.0`, protocol v0.9. The host loads the 8 records files unchanged into the data model, then sends `_shell.json` and one `specs/<label>.json` for each screen. Every Button that moves the journey forward carries `action.event {name:"navigate", context:{next:"<label>"}}`. Playwright clicked through all 3 transitions at both widths.

## Tokens (o200k_base)
| Group | Files | Tokens | Chars |
|---|---|---|---|
| (a) Specs | shell 143, intro 1017, session 1165, brief 1316, roster 1181 | **4822** | 15098 |
| (b) Catalog | catalog.tsx 405, gray.css 582 | **987** | 3291 |
| Host glue | main.tsx, index.html, vite.config, package.json | 788 | 2768 |
| (c) Setup commands | | 99 | 294 |

- **Files authored:** 16.
- **Wall-clock:** about 3 min for specs, about 5 min for catalog and host, about 9 min in total after reading the docs.
- **Retries:** 0 invalid JSON, 1 schema error, 2 render fixes.
  - The schema error was `context:{next:null}`. The renderer threw, and with no error boundary the whole surface went blank.

## Setup pain
- **Broken published styling.** The npm build turns its CSS modules into empty objects (`Button_default = {}`), so no Button class reaches the DOM. `v0_9/index.css` isn't in the package's exports map. As a result the `primary` and `borderless` variants never reach the DOM. I replaced Button in the catalog (about 8 lines).
- **Hidden dependency.** The React renderer quietly pulls in Lit, which logs a dev-mode warning.
- **zod version.** The renderer needs zod 3. Installing zod 4 at the top level would break custom schemas.

## What the format could not express
- **Breakpoints.** A2UI has no responsive layout. I added a `Split` component to the catalog: panes stack on a phone and sit side by side on desktop, at 2:1 or 1:1.
- **Conditionals.** There is no if/else, so null fields render empty. Kodai's card reads "nominated by" with nothing after it, and the hole area reads "Asking next:" with nothing after it.
- **Array joins.** `formatString` prints an array as JSON. I used a horizontal `List` template with `path:""` instead.
- **Filtering.** Records are picked by index (`/sessions/1`, `/decisions/0`) because there are no queries.
- **Shared shell.** There are no includes across screens. I wrote the shell once as a separate `updateComponents` message, and the host merges it into every surface.

## Gray catalog now, real kit later
The specs name only catalog component types (`Card`, `Button`, `Split`) plus the catalog id. Moving to a real kit means shipping a new catalog under the same component names:
- a shadcn implementation built with `createComponentImplementation`,
- a SwiftUI renderer (the repo includes Swift),
- a React Native renderer, which doesn't exist yet, so someone writes one.

The specs stay byte-identical. Custom components like `Split` must be implemented in every kit.

## Maturity
- The v0.9 spec and React README are clear.
- Data binding and templates worked on the first try.
- The React package is shaky: styling is broken on npm, invalid input crashes the renderer, and `Text` warns when no markdown renderer is configured.

## Judgment
The flat JSON is easy for an agent to write correctly. It costs about 1,000–1,300 tokens per screen, all copy comes from bound record data, and there were no JSON errors. But it has no conditionals or breakpoints, and the React renderer needs patching before the output is presentable.

## Files
- `spike-wf/a2ui/specs/{_shell,owner-intro,owner-session,reciprocity-brief,roster-confirm}.json`
- `spike-wf/a2ui/catalog/{catalog.tsx,gray.css}`
- `spike-wf/a2ui/src/main.tsx`
- `spike-wf/a2ui/tokens.json`
- `spike-wf/a2ui/scripts/{tokens,shoot}.mjs`
- `spike-wf/shots/a2ui/<label>-{390,1280}.png` (8 files)
