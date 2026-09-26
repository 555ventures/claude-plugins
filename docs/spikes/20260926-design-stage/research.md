# Research record — 2026-09-26 design stage (brief 30, specs 20260926/04–06)

Owner: specs/20260926/04-the-design-brief.md D12. Sourced only from the Assumptions and
Contracts sections of specs/20260926/04-the-design-brief.md, specs/20260926/05-the-kit-and-the-journey-stories.md
and specs/20260926/06-the-approval-stop-and-the-roadmap.md, plus brief 30 (docs/roadmap/, 30-*)
and docs/adr/0030-the-kit-is-the-contract.md. No fact below is invented; each is dated and
cites the spec/assumption it comes from.

## Storybook 10.6 CSF and CLI facts

- 2026-09-26, executed (spec 05 A1): a fresh shadcn/Vite app, `npx -y storybook@latest init
  --yes --no-dev --features docs test --disable-telemetry --package-manager npm </dev/null`
  exits 0 in about 21 s with a warm Playwright cache, auto-detects `react-vite`, adds the
  `storybook`/`build-storybook` scripts, writes `.storybook/main.ts` and `preview.tsx`, writes
  example stories under `src/stories/` (deleted by the recipe), leaves five devDependencies
  pinned at `"latest"` (`@chromatic-com/storybook`, `vitest`, `playwright`,
  `@vitest/browser-playwright`, `@vitest/coverage-v8`), and does not import the app's CSS —
  the recipe adds that import to `preview.tsx` by hand. If a future Storybook 11 release
  changes a flag, the kit session reads `init --help`, adapts, and the build records the
  deviation in the spec; the driver itself never runs `init`.
- 2026-09-26, executed on Storybook 10.5.8 and 10.6.0 (spec 05 A2): `storybook build --test
  --quiet -o <dir>` writes `<dir>/index.json` at schema `v: 5`, entries keyed by story id
  carrying `title`, `name`, `importPath` and `tags`, in 3–5 s at the sizes measured; custom
  meta tags carry through to the index, and `play-fn` is auto-added to the tag list for any
  story that declares a `play` function.
- 2026-09-26, executed on salon-os (TanStack Start) (spec 05 A3): the host's `storybook
  build` exits 0 but never emits `iframe.html`, because TanStack Start's plugin replaces the
  client build input with its own entry; restoring builder-vite's `iframe.html` input in
  `.storybook/main.ts`'s `viteFinal` fixes it. This is the fact spec 05's Contracts section
  points back at this file for. On another host where the omission does not reproduce, the
  D2 `no-iframe` refusal in spec 05 still names the missing file; the recipe's note is
  advisory, not load-bearing.
- 2026-09-26, executed (spec 05 A4): a journey story importing `./x.beats.json` and calling
  `step(b.sentence, …)` inside `play` typechecks under `moduleResolution: "bundler"` with no
  `resolveJsonModule` edit, and renders correctly in both dev and the static build. If this
  does not hold on a given host, the recipe adds `resolveJsonModule: true` to `tsconfig.json`.
- 2026-09-26, executed (spec 05 A5): the real TanStack router mounts inside a story via
  `createMemoryHistory({ initialEntries })` at a public route (`/login`); a route whose
  `beforeLoad` calls a server function instead renders the error boundary, so journey stories
  start at a public route or mock the loader.
- CSF facts (spec 05 Contracts, spiked): Storybook 10.6 CSF supplies `canvas`, `userEvent` and
  `step` from the play context and `expect` from the `storybook/test` module; a journey story
  imports its beats file as JSON with no tsconfig change needed (per A4 above) and composes
  only `<kit>` composites, never `@/components/ui` primitives directly.
- Router recipes reported (spec 05 Contracts) for stacks beyond the one spiked host: TanStack
  Router uses `createMemoryHistory` + `createRouter` from `@tanstack/react-router`; react-router
  8 (data mode) uses `createMemoryRouter` from `react-router` and `RouterProvider` from
  `react-router/dom`; Next.js App Router sets `parameters.nextjs.appDirectory = true` and mocks
  navigation by recording `router.push` calls, one story per page. Only the TanStack case above
  is marked executed; the react-router and Next.js recipes are reported, not executed on a
  fixture host in these specs.

## shadcn 4.21 CLI facts

- 2026-09-26, executed on shadcn 4.21.0 on a fresh `shadcn init -t vite -b radix -p nova` app
  (spec 04 A1): `npx shadcn@latest info --json` exits 0 and prints `components: ["button",
  "card", "dialog"]`, `config.resolvedPaths.ui` as an absolute path, and
  `links.components: "https://ui.shadcn.com/docs/components/radix/[component].md"`; the kit
  directory's own files never appear in `components`. If this does not hold on a future
  version, `catalog-inventory.js` falls back to reading `components.json`'s `aliases.ui`
  directory listing instead, and the deviation is recorded.
- 2026-09-26, executed (spec 04 A2): `GET https://ui.shadcn.com/docs/components/radix/card.md`
  returns HTTP 200 `text/markdown` with a `## Composition` section (opening "Use the following
  composition to build a `Card`:" followed by the tree) and then a `## API Reference` section;
  `dialog`, `field` and `select` carry the same section shape. Where this is false for a given
  component, `catalog-inventory.js` records `composition: unavailable` for that name — already
  the designed fallback, not a blocking failure.
- 2026-09-26, executed (spec 04 A3): `npx shadcn@latest docs card --json` returns
  `{"base":"radix","results":[{"component":"card","base":"radix","links":{"docs":…,
  "examples":…}}]}`. This call is unused by `catalog-inventory.js` itself — recorded for the
  design-brief skill's guidance only.
- D4's own citation (spec 04): spiked 2026-09-26, shadcn 4.21.0's `info --json` lists
  `components` and `links.components`, and the per-component `.md` page carries a
  `## Composition` section; `catalog-inventory.js`'s `file:` URL support (read from disk rather
  than fetched) is what lets the test suite exercise the script without a live network call.

## The salon-os static-build finding

- 2026-09-23, measured on salon-os, a host that has carried the mocks-first canon since the
  start (docs/adr/0030-the-kit-is-the-contract.md § Context): 162 kit restyles across 61
  places, the same intent (edit one record) built three different ways (a `Sheet` in 27
  places, a `Dialog`, and an inline row), and zero raw colours only because the theme happens
  to use tokens. The canon (`design/approval.json` plus the mock app) sat beside this drift and
  stopped none of it, because it was a second artifact kept in agreement by hand and hands did
  not keep up. This measurement is the cited basis for ADR-0030's ruling that the mock app
  stops being the product (adopted as Option C, ADR-0030 § Options considered) and for spec
  04 D9's removal of the mock app's auto-pick and scaffold-skip branches from
  `genesis-driver.js`.
- The Storybook static-build behavior specific to salon-os (the missing `iframe.html` under
  TanStack Start, and the `viteFinal` fix) is recorded above under Storybook facts (spec 05 A3)
  — it is the same host, a separate measurement from the 162-restyle finding, and no further
  detail beyond what spec 05's own Assumptions section captured was recorded here.
