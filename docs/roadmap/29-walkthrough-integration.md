# 29 — Walkthrough integration: the reviewer becomes a hosted service, the plugin a client

Phase: P2 · Depends on: 27 · Primary workspaces: spec/scripts/{mocks-driver,prototype-driver,genesis-driver}.js,
spec/scripts/lib/{walkthrough-client,mock-cli}.js, spec/templates/mock/contract.json,
spec/templates/walkthrough/ (new), spec/commands/{mocks,prototype}.md, spec/doctrine/mocks.md,
spec/bin/spec-paths, tests · Risk: T3 (the npm-in-app reviewer contract v3 and the mock app are
retired; `design/notes.json` and `design/approval.json` stop being written by a package; a
network dependency enters the wireframe command) · Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 (docs/adr/0030), rewritten the same day from the ratified list. Lands
     when the walkthrough service's first version runs; independent of 28 and 30. The service
     itself is built in the mock-review repository, retooled and renamed `walkthrough`, as a
     service from the first line (run locally now, hosted later); this brief owns only the
     plugin side and the HTTP contract. The handoff prompt for that repository is in this
     brief's Grounding. -->

## Result

The wireframe and journey confirmation live in `walkthrough`, one app in two modes: run
locally for JJ today, the same code deployed to Railway for clients later, with Postgres
(Neon) from day one and Better Auth designed in and enabled when hosted. The service renders
wireframes itself from json-render specs with its own gray catalog (gray by construction, every
element carrying a node id), and it shows designed screens and prototypes as PNG screenshots
(view only). It never carries product code, so a web app, a mobile app and a CLI are reviewed
the same way. A note is one record with an optional anchor (node id on a wireframe, image
coordinate on a screenshot; none = screen note); a journey is approved with the hash of the
beats shown. The plugin talks to the service through one scripted HTTP client with a pinned
API version: push a round (json-render specs + journey file, or a PNG sequence), pull notes,
pull approvals, mark a round; every pull lands as files under `design/rounds/<n>/`, so git
stays the ledger. `/spec:mocks` becomes the wireframe command over the service: its states
and marks stay, its screens are json-render specs authored in the session (v1 regenerates
per round in the session, not live), its check runs in a plugin script over the spec files.
The `@555-ventures/mock-review` npm package, contract v3 and the React mock app are retired.

## Current state

`spec/templates/mock/contract.json` (contract v3) binds `/spec:mocks` to the package's seven
verbs; `lib/mock-cli.js` (179 lines) spawns it and refuses a version mismatch; the package owns
the served page, `design/notes.json` and `design/approval.json`; the client's link comes from
`client open` and is served from the user's machine (Tailscale for remote clients). The
package's overlay, notes, approval flow and thumbnail map are the UI the service keeps; its CLI
verbs and the in-app contract handshake are what it loses. Verified 2026-09-24: Vibe
Annotations and every click-to-code tool are localhost-only and extension-based; Chromatic's
review has no pinned comments; no maintained Storybook annotation addon exists. Spike
2026-09-23 (docs/spikes/20260923-design-retool/json-render.md): json-render's shadcn catalog
renders the hearwell owner-onboarding journey at the same token cost as TSX; its validator
checks component names only, so the plugin's catalog carries its own Zod schema; the React
Native renderer exists for a later native shell. The user's constraints (2026-09-24): clients
have several projects each, staff need their own IDs and passwords, no Tailscale, no dependency
on the user's laptop, and the service must not depend on the product's stack.

## Scope

1. **The HTTP contract and the client** (spec 01) — `lib/walkthrough-client.js`: four calls
   (`push-round` with either json-render specs + journey file or a PNG sequence with screen
   names; `pull-notes`; `pull-approvals`; `mark-round`), API version pinned in the plugin, base
   URL and token from `.claude/spec.config.json` (the token itself from an env var named
   there), every pull written to `design/rounds/<n>/{notes,approvals}.json`.
   `spec/templates/walkthrough/contract.json` names the shapes: note (id, screen, state,
   anchor = node id | image x/y | none, text, author, round); approval (journey, by, round,
   beat hash); round (kind = wireframe | screenshots). The gray catalog's schema
   (`spec/templates/walkthrough/catalog.json`, Zod-shaped) is versioned with the contract so
   the service and the session author against one vocabulary. ADR-0030 (e), (f) bind: one note
   model; HTTP, scripted, never MCP.
2. **The wireframe command over the service** (spec 02) — `/spec:mocks` authors json-render
   specs (one file per screen, journeys as today's `journeys` file) against the gray catalog,
   pushes a round per iteration, pulls notes and applies them in the next session-side
   regeneration, and reads `journey-approved` from the pulled approval whose beat hash matches
   the seed. The check (screens, shells, journeys, notes answered) moves into a plugin script
   over the spec files; `mock-cli.js`, contract v3, the `sweep` / `answer` / `approve` /
   `waive` / `serve` verbs, the package dev dependency and the React mock app scaffold are
   deleted. DELETE rows for the retired files; zero-hit grep for `mock-review`. The
   `mock-authoring` skill is rewritten for specs.
3. **Screenshot rounds** (spec 03) — the prototype driver (brief 28) and genesis's design stop
   (brief 30) can push a PNG sequence (from the freeze captures or the Storybook build) as a
   `screenshots` round when the client is configured, and pull the notes into the same
   `pins.json` / approval files. Optional in both callers, never a gate.

## Out of scope

- The service's own code, schema, auth and deployment — the `walkthrough` repository (handoff
  below). This brief fixes the contract the service must satisfy.
- Live regeneration inside the service — a later walkthrough brief, if session-side rounds
  prove too slow.
- The thumbnail map, multiple projects per client and staff accounts — the service's hosting
  step, outside this brief's contract.
- A client-side prototype of the walk page before locking — cut by JJ on 2026-09-24.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — (e), (f), the two-clocks ruling, and the
  stack-agnostic constraint.
- docs/adr/0029-the-client-confirms-the-story.md — the beat hash the approval carries.
- docs/adr/0028-the-mock-is-the-app.md — superseded: the reviewer is no longer a package in
  the app, and the app itself retires here.
- .claude/rules/spec-pipeline.md § Worker Rules — the client is `fetch` over built-ins.
- docs/spikes/20260923-design-retool/json-render.md — the catalog, the validator gap, the
  provider and Tailwind `@source` findings.
- **Handoff prompt for the walkthrough repository** (new session there; ≤15 lines):
  > Retool this repository (mock-review) into `walkthrough`, a review service built as a
  > service from the start: one app, run locally today, deployed to Railway later. Keep the
  > overlay, notes, approval and thumbnail-map UI; delete the in-app CLI (`check`, `sweep`,
  > `answer`, `serve`) and the contract handshake. Storage is Postgres on Neon from day one
  > (dev branch locally); auth is Better Auth with passwords and its organization plugin,
  > designed in now, enabled when hosted. Tables: client → project → journey → screen → round
  > (kind wireframe | screenshots) → spec or image; notes with an optional anchor (node id or
  > image x/y; none = screen note); approvals with the beat hash; users owner/staff with
  > per-project membership. Wireframes render from json-render specs with the gray catalog
  > that claude-plugins' `spec/templates/walkthrough/catalog.json` specifies; screenshots
  > render as an image sequence with the same note overlay. Four API calls under a version
  > prefix per `spec/templates/walkthrough/contract.json`. v1 scope: rendering + notes +
  > journey approval + the four calls; map, multi-project and staff accounts at hosting time.
  > No dashboards, no notifications, no self-signup, no regeneration.

## Open questions for planning

- Whether the gray catalog's Zod schema lives in the plugin (versioned with the contract) or
  in the service (fetched at push). Default: plugin, so a session can validate before pushing.
- Screenshot sizing for phone review: one width, or the freeze's two widths. Default: the
  freeze's widths, the client picks.
