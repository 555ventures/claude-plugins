---
date: 2026-09-26
status: done
tier: standard
area: genesis
breaking: false
depends_on: [specs/20260926/04-the-design-brief.md]
depended_on_by: [specs/20260926/06-the-approval-stop-and-the-roadmap.md]
brief: 30
spiked: 2026-09-26
build_base: design-retool
open_markers: 0
diff_base: d1a54dd1de7027602dc6960a144fd09da42ee5f7
---

# The kit and the journey stories

## Goal

After the design brief, genesis lands the design contract as code on the product's real stack:
Fable authors the tokens, the shell and one intent-named composite per pattern row with a fixture
story per declared state, sets Storybook up in the host, and then every approved journey is
rebuilt as a walkable journey story — an app shell, the host's real router in memory mode,
fixtures, and one `step()` per seed beat — drawn from the brief, by Sonnet if the session so
chooses, only after the kit exists and all journeys in one session. The driver derives the beats
each story walks from the seed, builds Storybook's static export at each mark, and refuses a kit
whose composites lack a state story, a journey without its story, a story that does not walk the
seed's beats, or a journey file that imports a primitive. Done means: on a fixture host with a
stub Storybook build, `kit-landed` and `journeys-drawn` refuse and accept for the reasons above,
and HANDOFF stamps brief 27's `design` block from the design paths.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Two more states in `genesis-driver.js`, derived only where the design stage applies (spec 04 D1): `DESIGN_KIT` while `marks.designBriefWritten && !marks.kitLanded`, then `DESIGN_JOURNEYS` while `!marks.journeysDrawn`; marks `kit-landed` and `journeys-drawn`. A vanished `.storybook/main.*` re-derives `DESIGN_KIT`; a vanished journey story re-derives `DESIGN_JOURNEYS`. `design-brief-written`'s next state becomes `DESIGN_KIT`; `journeys-drawn`'s next state is `ROADMAP` (spec 06 interposes the approval stop). (AC-20260926-05-1, AC-20260926-05-2) | ADR-0030 (g): brief, then kit, then journeys; each a mark so a `/clear` between them is safe. |
| D2 | New library `spec/scripts/lib/storybook-index.js`: `readIndex(staticDir)` → `{ ok, entries[] \| reason }` (`index.json` parsed, `iframe.html` required — a build that exits 0 without it is `reason: 'no-iframe'`); `normalizeName(s)` = lower-case, non-alphanumerics stripped; `stateStoriesCheck(entries, composites, kitDir)` → the first `{ composite, state }` whose story is missing, where a composite's entries are those whose `importPath` basename is `<Composite>.stories.<ext>` under `kitDir` or whose `title`'s last `/` segment equals the composite, and a state is present when some such entry's `name` normalizes to the state; `journeyStoriesCheck(entries, journeys, journeysDir)` → per journey the entry whose `importPath` ends `/<journey>.journey.stories.<ext>` under `journeysDir` and whose `tags` include both `journey` and `play-fn`, or the first missing one; `importSpecifiers(text)` → every specifier from `import … from '…'`, bare `import '…'`, `require('…')` and `import('…')` after stripping `//` and `/* */` comments, admitting both quote forms. (AC-20260926-05-3, AC-20260926-05-4, AC-20260926-05-5) | Spiked 2026-09-26: a TanStack Start host's `storybook build` exits 0 and prints "completed successfully" while emitting no `iframe.html`, so the exit code alone is a false pass; index entries carry `importPath`, `title`, `name`, `tags` and custom tags survive. One reader, reused by spec 06, comment-stripped before it parses (pipeline rules § Gotchas). |
| D3 | `runStorybookBuild()`: the driver runs `design-paths.storybook.buildCommand` through `runShell` (`cwd = root`, stdout+stderr streamed to `.claude/genesis/storybook-build.log`), writes `<staticDir>/.gitignore` containing `*` before the first run, and returns `{ exit, ms, index }` where `index` is D2's `readIndex(staticDir)`. Both marks refuse on a non-zero exit (quoting the log's tail, `logTail`) or a `no-iframe`/unparseable index, naming `iframe.html` or `index.json`. (AC-20260926-05-6, AC-20260926-05-7) | The build is the executed evidence that the stories compile; streaming through `runShell` is the driver's existing large-output pattern. |
| D4 | The `DESIGN_KIT` step text: `## Step: author the tokens, the shell and the kit`; `Read only:` the brief, the catalog, the rules file, `design-paths.json`; `Doctrine: … § Genesis: Design Stage`; `Session: start a fresh session for this step — Model: Fable (authors tokens, shell and composites)`; `Skill: frontend-design — load it if installed; ⚠️ missing = warn and continue`; the composites listed one per line as `composite: <C> — states: <S1, S2>` from the brief's table; the Storybook setup recipe (Contracts — the non-interactive init, the preview CSS import, the example-stories deletion, the `latest` re-pin, the TanStack Start iframe-input note); `Then:` naming `--mark kit-landed`. (AC-20260926-05-8) | Brief 30 scope 2; the fresh-session line is scope 3's rule; frontend-design is the standing theme-authoring skill (warn, never block). |
| D5 | `--mark kit-landed` requires, in order: `design-paths.json` valid (spec 04 D3); `design-contract-check --rules --kit --tokens` exits 0 (every composite present, tables filled, tokens file present); `.storybook/main.{ts,js,mts,mjs,cjs}` exists under `root`; D3's build succeeds; D2's `stateStoriesCheck` finds every declared state (refusal `composite <C>: no state story <S> under <kit> — export a story named <S> in <C>.stories.tsx`). On success `marks.kitLanded = true`, `status.designStage.kit = { build: { exit, ms, stories }, at }`. (AC-20260926-05-9, AC-20260926-05-10, AC-20260926-05-11) | ADR-0030 (c): every composite has a fixture story per declared state; the brief declared the states (spec 04 D6), the index proves them. |
| D6 | At `DESIGN_JOURNEYS`'s print the driver writes, for every seed journey, `<journeys>/<journey>.beats.json` = `{ journey, beatHash, beats: [{ n, sentence, screen, state }] }` derived from `lib/surfaces.js`'s `parseSeedJourneys` (`sentence` is the parsed `beat` text) and `beatHash`, creating the directory, rewriting a file whose `beatHash` differs, never touching one that matches. `--mark journeys-drawn` recomputes the hash and refuses a mismatch (`beats for <j> changed since the last print — re-run the driver, then re-draw`). (AC-20260926-05-12) | Brief 30: "a story whose steps equal the seed's beats" — the story imports the driver's own derivation and iterates it, so equality holds by construction and the mark only has to prove the import. |
| D7 | The `DESIGN_JOURNEYS` step text: `## Step: rebuild every approved journey as a journey story`; `Read only:` the brief, the rules file, `design-paths.json`, every `<journeys>/<j>.beats.json`, the kit directory; `Doctrine: … § Genesis: Design Stage`; `Session: start a fresh session for this step — Model: Sonnet may draw the journey screens from the brief; all journeys in this one session`; per journey `journey: <j> — <n> beats → <journeys>/<j>.journey.stories.tsx`; the rules: import composites from `<kit>` only, never `<primitivesAlias>`; meta `title: 'Journeys/<j>'`, `tags: ['journey']`; `import beats from './<j>.beats.json'`; `play` iterates `beats` calling `step(b.sentence, …)`; the host's real router in memory mode (Contracts recipes); fixtures from the records; `Then:` naming `--mark journeys-drawn`. (AC-20260926-05-13) | Brief 30 scope 2 and open question 3, default taken: one Sonnet session per product; the real router in memory mode where it supports it (open question 2). |
| D8 | `--mark journeys-drawn` requires, per seed journey: exactly one file matching `<journeys>/<j>.journey.stories.*`; its comment-stripped text contains an import specifier ending `/<j>.beats.json` or equal to `./<j>.beats.json`, and matches `/\bstep\s*\(/`; D6's hash holds; then the primitive ban over every `.ts/.tsx/.js/.jsx` under `<journeys>`: no `importSpecifiers` entry equals `primitivesAlias`, starts with `primitivesAlias + '/'`, or (relative) resolves inside `<primitives>` — refusal `journey file <f> imports a primitive (<specifier>) — import composites from <kit> only`; then D3's build and D2's `journeyStoriesCheck` (refusal `journey <j>: no story tagged journey with a play function in the index`). On success `marks.journeysDrawn = true`, `status.designStage.journeys = { build, stories: { <j>: <story id> }, at }`. (AC-20260926-05-14, AC-20260926-05-15, AC-20260926-05-16, AC-20260926-05-17) | ADR-0030 (g): journey screens import composites only — the primitive ban applies here first; the `journey` + `play-fn` tags in the index prove the story exists and walks. |
| D9 | HANDOFF's `config.design` line reads `design-paths.json` when `status.designStage.kit` exists: `config.design set to { "kit": "<kit>", "tokens": "<tokens>", "rules": "<rules>" }` plus `, "app": "<status.app>"` when the mocks status carries `app`; when the stage was skipped or never reached, the existing `{ "app": … }` line (or none) is unchanged. The `Read only:` list adds `design-paths.json`. (AC-20260926-05-18) | Brief 27's contract: `kit`, `tokens`, `rules` are required once the block exists; genesis is the one place that knows them before `/spec:init` would. |
| D10 | `spec/doctrine/genesis.md` § Genesis: Design Stage grows the kit and journey rules (the Storybook setup recipe by pointer to `spec-paths shared-genesis --section`, the beats-file contract, the primitive ban, the model placement: Fable authors tokens/shell/kit, Sonnet may draw journeys after the kit, all in one session), the § State Machine chain names `DESIGN_KIT → DESIGN_JOURNEYS`, and § On-disk Handoff gains rows for `<journeys>/<j>.beats.json`, the stories and `.claude/genesis/storybook-static/` (gitignored). `spec/doctrine/design.md` § Design Canon gains: composites' state stories are the living showcase, gated by brief 27's `kit-discipline`; journey stories are a genesis artifact. [no-ac: prose; `citations-check` and the ≤160 pin are the oracles] | Doctrine follows the driver. |
| D12 | User ruling at build (2026-09-27): spec 04's `tests/genesis/design-stage-brief.test.js` pins the retired `(DESIGN_BRIEF → ROADMAP)` checkpoint that D1 replaces; it enters this File Plan as a fix row — its checkpoint literal becomes `(DESIGN_BRIEF → DESIGN_KIT)`, its test title follows, and every other assertion and its spec-04 tag stay unchanged. [no-ac: collision fix of a predecessor pin; D1's own AC carries the new transition] | A predecessor CONTINUE-TO pin on a surface this spec retires is updated in place, never weakened (pipeline rules § Gotchas, fourth trigger). |
| D11 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: bump — `plugin-bump.js --check` is the oracle] | Version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1 states + marks; D3 `runStorybookBuild`; D4/D7 step texts; D5/D8 mark handlers; D6 beats writer; D9 HANDOFF line; usage list gains the two marks; header comment updated |
| spec/scripts/lib/storybook-index.js | CREATE | scripts | D2 — index reader (iframe required), name normalizer, state-story and journey-story checks, comment-stripped import scanner; header cites this spec, `Exit codes: n/a (library)` |
| spec/doctrine/genesis.md | MODIFY | doctrine | D10 — Design Stage kit/journey rules, chain, on-disk rows |
| spec/doctrine/design.md | MODIFY | doctrine | D10 — living showcase vs genesis artifact sentences; ≤160 lines, AC-20260926-01-8 literals kept |
| spec/.claude-plugin/plugin.json | MODIFY | other | D11 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/genesis/design-stage-kit.test.js | CREATE | tests | AC-20260926-05-1, AC-20260926-05-2, AC-20260926-05-6, AC-20260926-05-7, AC-20260926-05-8, AC-20260926-05-9, AC-20260926-05-10, AC-20260926-05-11, AC-20260926-05-12, AC-20260926-05-13, AC-20260926-05-14, AC-20260926-05-15, AC-20260926-05-16, AC-20260926-05-17, AC-20260926-05-18 |
| tests/genesis/design-stage-brief.test.js | MODIFY | tests | D12 — spec 04's brief-written checkpoint pin now expects `(DESIGN_BRIEF → DESIGN_KIT)`; nothing else changes |
| tests/genesis/storybook-index.test.js | CREATE | tests | AC-20260926-05-3, AC-20260926-05-4, AC-20260926-05-5 |
| tests/fixtures/genesis/storybook-build-stub.js | CREATE | tests | a stub build: copies a named fixture `index.json` into the `-o` dir and writes `iframe.html`; flags `--no-iframe` and `--fail` |
| tests/fixtures/genesis/storybook-index/kit-and-journeys.json | CREATE | tests | a `v: 5` index with `Kit/BookingSheet` `Idle`/`Saving`/`Error`, `Kit/DestructiveConfirmDialog` `Idle`/`Confirming`, `Journeys/first-visit` and `Journeys/daily-check` tagged `journey`,`play-fn` |
| tests/fixtures/genesis/storybook-index/missing-state.json | CREATE | tests | the same without `Kit/BookingSheet` `Error` |
| tests/fixtures/genesis/storybook-index/journey-untagged.json | CREATE | tests | the same with `Journeys/daily-check` lacking the `journey` tag |

## Contracts

`<journeys>/<journey>.beats.json` (D6):

```json
{ "journey": "first-visit", "beatHash": "3f9a1c2b4d5e",
  "beats": [
    { "n": 1, "sentence": "I open the app", "screen": "home", "state": null },
    { "n": 2, "sentence": "I tap new booking", "screen": "booking", "state": "empty" } ] }
```

A journey story (D7/D8), Storybook 10.6 CSF (spiked: `canvas`, `userEvent`, `step` come from the
play context; `expect` from `storybook/test`; the JSON import needs no tsconfig change):

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import beats from './first-visit.beats.json'
import { JourneyShell } from './first-visit/JourneyShell'   // composes <kit> composites only

const meta = { title: 'Journeys/first-visit', component: JourneyShell, tags: ['journey'] } satisfies Meta<typeof JourneyShell>
export default meta
export const Default: StoryObj<typeof meta> = {
  play: async ({ canvas, userEvent, step }) => {
    for (const b of beats.beats) {
      await step(b.sentence, async () => { /* act on the screen b.screen; assert with expect(canvas…) */ })
    }
  },
}
```

Router in memory mode (D7; spiked 2026-09-26 on salon-os for TanStack, researched for the rest):

```tsx
// TanStack Router — the host's real routeTree (routes whose loaders call server functions fail
// in Storybook; mock them or start the journey at a public route)
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/login'] }) })
<RouterProvider router={router} />
// react-router 8 (data mode): createMemoryRouter from 'react-router', RouterProvider from 'react-router/dom'
// Next.js App Router: parameters.nextjs.appDirectory = true; the navigation mock only records
// router.push — a Next journey chains one story per page and asserts getRouter().push calls.
```

Storybook setup recipe printed at `DESIGN_KIT` (D4; spiked on storybook 10.6.0 / shadcn 4.21.0):

```
npx -y storybook@latest init --yes --no-dev --features docs test --disable-telemetry --package-manager <pm> </dev/null
  → .storybook/main.ts + .storybook/preview.tsx, scripts "storybook"/"build-storybook", example stories under src/stories/ (delete them)
Add `import '<tokens css or app css>'` to .storybook/preview.tsx (init does not import the app's CSS).
Re-pin the devDependencies init left at "latest" (@chromatic-com/storybook, vitest, playwright, @vitest/browser-playwright, @vitest/coverage-v8).
TanStack Start hosts: Start's planning plugin replaces the client build input with its own entry, so `storybook build` emits no iframe.html — restore builder-vite's iframe.html input in .storybook/main.ts viteFinal (docs/spikes/20260926-design-stage/research.md).
```

`storybook-index.js` inputs (D2), the `index.json` shape spiked on 10.5.8 and 10.6.0:

```json
{ "v": 5, "entries": {
  "kit-bookingsheet--idle": { "type": "story", "id": "kit-bookingsheet--idle", "title": "Kit/BookingSheet", "name": "Idle",
    "importPath": "./src/components/kit/BookingSheet.stories.tsx", "componentPath": "./src/components/kit/BookingSheet.tsx",
    "tags": ["dev", "test", "manifest", "composite"] },
  "journeys-first-visit--default": { "type": "story", "id": "journeys-first-visit--default", "title": "Journeys/first-visit", "name": "Default",
    "importPath": "./src/journeys/first-visit.journey.stories.tsx", "tags": ["dev", "test", "manifest", "journey", "play-fn"] } } }
```

`status.designStage` after this spec (extends spec 04 D8):

```jsonc
{ …, "kit": { "build": { "exit": 0, "ms": 3200, "stories": 5 }, "at": "<ISO>" },
  "journeys": { "build": { "exit": 0, "ms": 3400, "stories": 7 }, "stories": { "first-visit": "journeys-first-visit--default" }, "at": "<ISO>" } }
```

Test stub build command (fixture): `node tests/fixtures/genesis/storybook-build-stub.js --index <fixture.json> -o <staticDir> [--no-iframe] [--fail]` — the fixture host's `design-paths.storybook.buildCommand` names it with the `-o` matching `staticDir`.

## Behavior

Fable's kit session: loads frontend-design if present, runs the init recipe, writes `tokens.css`
(`@theme`), the shell and each composite with its stories, then marks. A refusal names the first
missing state story; the session adds the export and re-marks. The Sonnet session (or the same
Fable session) then reads the beats files the driver just wrote and draws every journey; a
journey that imports `@/components/ui/button` is refused by specifier, one whose story lacks
`tags: ['journey']` or a `play` is refused by the index. The static export under
`.claude/genesis/storybook-static/` is gitignored and rebuilt at every mark.

Build cost: spiked at 3–5 s for a handful of stories; the mark runs it once.

## Acceptance Criteria

- **AC-20260926-05-1**: WHEN `--mark design-brief-written` is accepted on a host where the stage applies THE SYSTEM SHALL print `(DESIGN_BRIEF → DESIGN_KIT)` and `--state` SHALL print `DESIGN_KIT\n`; WHEN `kit-landed` is then accepted THE SYSTEM SHALL print `(DESIGN_KIT → DESIGN_JOURNEYS)`; WHEN `journeys-drawn` is accepted THE SYSTEM SHALL print `(DESIGN_JOURNEYS → ROADMAP)` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-2**: WHEN `kit-landed` has been accepted and `.storybook/main.ts` is deleted THE SYSTEM SHALL derive `DESIGN_KIT` on the next `--state`; WHEN `journeys-drawn` has been accepted and `src/journeys/daily-check.journey.stories.tsx` is deleted THE SYSTEM SHALL derive `DESIGN_JOURNEYS` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-3**: WHEN `readIndex(dir)` runs on a dir holding a valid `index.json` and no `iframe.html` THE SYSTEM SHALL return `{ ok: false, reason: 'no-iframe' }`; with both present it SHALL return `ok: true` and `entries` as the array of `entries` values (e.g. the `kit-and-journeys.json` fixture → 7 entries) → writes tests/genesis/storybook-index.test.js
- **AC-20260926-05-4**: WHEN `stateStoriesCheck(entries, [{composite:'BookingSheet', states:['Idle','Saving','Error']}], 'src/components/kit')` runs over the `missing-state.json` fixture THE SYSTEM SHALL return `{ composite: 'BookingSheet', state: 'Error' }`; over `kit-and-journeys.json` it SHALL return `null`; and `normalizeName('Empty list') === normalizeName('EmptyList') === 'emptylist'` → writes tests/genesis/storybook-index.test.js
- **AC-20260926-05-5**: WHEN `importSpecifiers(text)` runs on a file containing `import { Button } from "@/components/ui/button"`, `import x from './a.json'`, a commented-out `// import y from '@/components/ui/card'`, `const z = require('@/components/kit/BookingSheet')` and `await import("./lazy")` THE SYSTEM SHALL return exactly `["@/components/ui/button", "./a.json", "@/components/kit/BookingSheet", "./lazy"]` in order → writes tests/genesis/storybook-index.test.js
- **AC-20260926-05-6**: WHEN `--mark kit-landed` runs with a `buildCommand` that exits 1 THE SYSTEM SHALL exit 2 with stderr containing `storybook build` and the log's last line, leave `marks.kitLanded` unset, and `.claude/genesis/storybook-build.log` SHALL exist → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-7**: WHEN the build exits 0 but writes no `iframe.html` THE SYSTEM SHALL exit 2 with stderr containing `iframe.html`; and `<staticDir>/.gitignore` SHALL contain `*` after any build attempt → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-8**: WHEN the bare run prints `DESIGN_KIT` THE SYSTEM SHALL include the lines `Session: start a fresh session for this step — Model: Fable`, `Skill: frontend-design — load it if installed`, `composite: BookingSheet — states: Idle, Saving, Error`, a line containing `storybook@latest init --yes --no-dev`, a line containing `iframe.html`, and `--mark kit-landed` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-9**: WHEN `--mark kit-landed` runs with the kit directory missing the `DestructiveConfirmDialog` composite THE SYSTEM SHALL exit 2 with stderr containing `composite-missing` and `DestructiveConfirmDialog` before any build runs (the stub's call-counter file stays absent) → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-10**: WHEN the contract check passes but no `.storybook/main.*` exists THE SYSTEM SHALL exit 2 with stderr containing `.storybook/main` and `storybook@latest init` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-11**: WHEN the build succeeds against the `missing-state.json` fixture THE SYSTEM SHALL exit 2 with stderr `composite BookingSheet: no state story Error under src/components/kit`; against `kit-and-journeys.json` THE SYSTEM SHALL exit 0, set `marks.kitLanded === true` and `status.designStage.kit.build.exit === 0` with `.stories === 7` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-12**: WHEN the bare run first prints `DESIGN_JOURNEYS` on a seed with journeys `first-visit` (beats `1. "I open the app" -> home`, `2. "I tap new booking" -> booking@empty`) and `daily-check` THE SYSTEM SHALL write `src/journeys/first-visit.beats.json` with `beats[1] = {"n":2,"sentence":"I tap new booking","screen":"booking","state":"empty"}` and `beatHash` equal to `lib/surfaces.js`'s `beatHash` of those beats; WHEN the seed's beat 2 is then edited and `--mark journeys-drawn` runs THE SYSTEM SHALL exit 2 with stderr containing `first-visit` and `changed since the last print`; a subsequent bare run SHALL rewrite the file with the new hash → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-13**: WHEN the bare run prints `DESIGN_JOURNEYS` THE SYSTEM SHALL include `Session: start a fresh session for this step — Model: Sonnet may draw`, `all journeys in this one session`, `journey: first-visit — 2 beats → src/journeys/first-visit.journey.stories.tsx`, a line containing `never @/components/ui`, and `--mark journeys-drawn` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-14**: WHEN `--mark journeys-drawn` runs with no `src/journeys/daily-check.journey.stories.*` file THE SYSTEM SHALL exit 2 with stderr containing `daily-check` and `no journey story`; WHEN the file exists but imports `./other.beats.json` THE SYSTEM SHALL exit 2 with stderr containing `daily-check.beats.json`; WHEN it imports the right file but contains no `step(` THE SYSTEM SHALL exit 2 with stderr containing `step(` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-15**: WHEN `src/journeys/first-visit/Screen.tsx` contains `import { Button } from '@/components/ui/button'` THE SYSTEM SHALL exit 2 with stderr `journey file src/journeys/first-visit/Screen.tsx imports a primitive (@/components/ui/button) — import composites from src/components/kit only`; WHEN it instead contains `import { Button } from "../../components/ui/button"` (resolving into `primitives`) THE SYSTEM SHALL exit 2 naming that specifier; a commented-out primitive import SHALL NOT be refused → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-16**: WHEN every journey file is clean and the build runs against `journey-untagged.json` THE SYSTEM SHALL exit 2 with stderr `journey daily-check: no story tagged journey with a play function in the index`; against `kit-and-journeys.json` THE SYSTEM SHALL exit 0 with `status.designStage.journeys.stories["first-visit"] === "journeys-first-visit--default"` and `marks.journeysDrawn === true` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-17**: WHEN `journeys-drawn` is accepted THE SYSTEM SHALL have run the build exactly once during that mark (the stub's call counter reads 1) and the checkpoint line SHALL read `(DESIGN_JOURNEYS → ROADMAP)` → writes tests/genesis/design-stage-kit.test.js
- **AC-20260926-05-18**: WHEN the bare run prints `HANDOFF` on a host whose `status.designStage.kit` exists and whose `design-paths.json` names `src/components/kit`, `src/styles/tokens.css`, `.claude/rules/design.md` THE SYSTEM SHALL print `config.design set to { "kit": "src/components/kit", "tokens": "src/styles/tokens.css", "rules": ".claude/rules/design.md" }` and `Read only:` SHALL name `design-paths.json`; on a host whose stage was skipped THE SYSTEM SHALL print no `"kit":` → writes tests/genesis/design-stage-kit.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-09-26, storybook 10.6.0 on a fresh shadcn/Vite app): `npx -y storybook@latest init --yes --no-dev --features docs test --disable-telemetry --package-manager npm </dev/null` exits 0 in ~21 s with a warm Playwright cache, detects `react-vite`, adds the `storybook`/`build-storybook` scripts, writes `.storybook/main.ts` + `preview.tsx`, example stories under `src/stories/`, leaves five devDependencies at `"latest"`, and does not import the app CSS. — **if false (a Storybook 11 release changes a flag):** the kit session reads `init --help`, adapts, and the build records the deviation in the spec; the driver never runs init.
- A2 (executed 2026-09-26 on 10.5.8 and 10.6.0): `storybook build --test --quiet -o <dir>` writes `<dir>/index.json` (`v: 5`, entries keyed by id with `title`, `name`, `importPath`, `tags`) in 3–5 s at these sizes; custom meta tags carry through; `play-fn` is auto-added to stories with `play`. — **if false:** D2 reads whatever key holds the tag list; STOP if none does.
- A3 (executed 2026-09-26, salon-os = TanStack Start): the host's `storybook build` exits 0 without emitting `iframe.html`; restoring builder-vite's `iframe.html` input in `viteFinal` fixes it. — **if false on another host:** D2's `no-iframe` refusal still names the file; the recipe's note is advisory.
- A4 (executed 2026-09-26): a story importing `./x.beats.json` and calling `step(b.sentence, …)` in `play` typechecks under `moduleResolution: "bundler"` with no `resolveJsonModule` edit and renders in dev and static. — **if false:** the recipe adds `resolveJsonModule: true`.
- A5 (executed 2026-09-26): the real TanStack router mounts in a story via `createMemoryHistory({ initialEntries })` at a public route (`/login`); a route whose `beforeLoad` calls a server function renders the error boundary. — **if false:** unchanged; the recipe already tells the session to mock or start public.
- A6: `runShell` (the scaffold/gate runner) accepts an arbitrary shell string with `cwd` and a log fd. — **if false:** add the parameter; never buffer the build through a pipe.
- A7: no existing test pins HANDOFF's `config.design set to { "app"` line verbatim other than through the mock-app fixture retired in spec 04. — **if false:** the hit enters this File Plan as a fix row (the `app` key is still printed when the mocks status carries it).

## Rationale

The beats file is the driver's derivation, not the story's declaration: the brief asked for "a
story whose steps equal the seed's beats", and parsing `step()` literals out of TSX was
rejected — a `+`-chain or a variable defeats any regex, and the pipeline rules record that class
biting five times. A story that imports the derivation and iterates it satisfies the equality by
construction; the mark proves the import and the `step(` call, and the index proves the story
exists and has a play function.

`iframe.html` is required because the salon-os spike showed the one static build that matters
most (a TanStack Start host) exiting 0 with no iframe at all. An exit-code check would have been
a false pass on the first real host.

Play functions are not executed at the marks. `vitest --project=storybook` does run them headless
(spiked, 2 s), but it needs Playwright browsers and the addon; JJ walks every journey in
Storybook at the approval stop (spec 06), which is the review the brief asks for. Executing them
mechanically can return on a measured need.

Rejected: a story-only router switch (the brief's default is the real router in memory mode,
and the spike confirmed it works); parsing steps from the built preview (Storybook exposes no
step names outside the runtime); a per-journey Sonnet session (the brief's default is one).

Build notes (2026-09-27, folded from the deviations sidecar and the build/review rounds):
- The stub build's call counter is the `STORYBOOK_BUILD_CALL_COUNTER` env var (unset = no
  counter), mirroring `shadcn-stub.js`'s `STUB_COUNTER`; the driver never knows about it.
- `journeyStoriesCheck`'s internal return shape is unpinned by design — AC-14/16/17 pin only its
  observable effect through `--mark journeys-drawn`.
- D12 was a user ruling at build: spec 04's brief-written checkpoint pin was the predecessor
  CONTINUE-TO collision D1 retires; updated in place, spec-04 tag kept.
- The whole-suite gate's `dependency-free` scanner read a comment's `require('…')` placeholder
  and a test input line as package imports; the comment was reworded and the input literal split,
  runtime string unchanged.
- Review iteration 1 fixed two hard findings: `importSpecifiers` dropped a bare side-effect
  import followed by a from-import (the lazy from-clause alternative spanned it — bare is now
  tried first, and AC-5's test pins the case), and the missing-state refusal lacked D5's remedy
  tail (AC-11 now pins the full string). One advisory soft stands: the "design stage does not
  apply" refusal is copied three times in the driver.

## Canonical Delta

docs/canonical/genesis.md § Driver: after `DESIGN_BRIEF` the chain runs `DESIGN_KIT` (Fable
authors tokens, shell and one composite per pattern row with a story per declared state; Storybook
is installed by the printed recipe; `kit-landed` runs `design-contract-check` with path overrides,
requires `.storybook/main.*`, runs the paths file's `buildCommand`, requires `iframe.html` and
`index.json`, and checks every declared state has a story) then `DESIGN_JOURNEYS` (the driver
writes `<journeys>/<j>.beats.json` from the seed; journey stories import it and `step()` each
beat; `journeys-drawn` checks the import, the hash, the primitive ban over the journeys directory
and a `journey`+`play-fn` entry per journey in the rebuilt index). HANDOFF stamps `design: {kit,
tokens, rules}` from the paths file.

docs/canonical/design.md § The design contract is code: composites' state stories are the living
showcase; journey stories are a genesis artifact.
