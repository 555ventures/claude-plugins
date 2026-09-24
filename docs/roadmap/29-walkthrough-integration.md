# 29 — Walkthrough integration: the reviewer becomes a hosted service, the plugin a client

Phase: P2 · Depends on: 27, 28 · Primary workspaces: spec/scripts/{mocks-driver,prototype-driver}.js,
spec/scripts/lib/{walkthrough-client,mock-cli}.js, spec/templates/mock/contract.json,
spec/commands/{mocks,prototype}.md, spec/doctrine/mocks.md, spec/bin/spec-paths, tests ·
Risk: T3 (the npm-in-app reviewer contract v3 is retired; `design/notes.json` and
`design/approval.json` stop being written by a package; a network dependency enters the mocks
and prototype commands) · Design stage: no · Expected specs: 3

<!-- Minted 2026-09-24 (docs/adr/0030). Third of four. The service itself is built in the
     mock-review repository, retooled and renamed `walkthrough`; this brief owns only the
     plugin side and the HTTP contract. The handoff prompt for that repository is in this
     brief's Grounding. -->

## Result

Clients open one link per project, on a phone, with their own account, and see whatever the
engagement is at: gray wireframe journeys before genesis, designed journeys after genesis
(brief 30), functional prototypes per brief (brief 28). They walk a journey through its real
controls under a slim step bar, open a thumbnail map, pin elements, send a batch, and approve a
journey on the map. Nothing runs on the user's machine while a client works. The plugin talks
to the service through one scripted HTTP client with a pinned API version: push a static build
plus records, push a preview URL, pull pins and approvals as files into the host repo, mark a
round. Git stays the ledger: every round's pins and approvals land as files. The
`@555-ventures/mock-review` npm package and its contract v3 are retired; `/spec:mocks` keeps
its states and marks, reads its check from a plugin script over the app's source, and pushes
the app's static build per round.

## Current state

`spec/templates/mock/contract.json` (contract v3) binds `/spec:mocks` to the package's seven
verbs; `lib/mock-cli.js` (179 lines) spawns it and refuses a version mismatch; the package owns
the served page, `design/notes.json` and `design/approval.json`; the client's link comes from
`client open` and is served from the user's machine (Tailscale for remote clients). Verified
2026-09-24: Vibe Annotations and every click-to-code tool are localhost-only and extension-based,
so none works for a client on a phone; Chromatic's review has no pinned comments and needs
accounts and snapshots; no maintained Storybook annotation addon exists; a preview-only Storybook
build is plain static files embeddable same-origin. The user's constraints (2026-09-24): clients
have several projects each, staff need their own IDs and passwords, no Tailscale, no dependency
on the user's laptop.

## Scope

1. **The HTTP contract and the client** (spec 01) — `lib/walkthrough-client.js`: four calls
   (`push-round` with a static build directory + records + journey file, or a preview URL;
   `pull-pins`; `pull-approvals`; `mark-round`), API version pinned in the plugin, base URL and
   token from `.claude/spec.config.json`, every pull written to
   `design/rounds/<n>/{pins,approvals}.json`. `spec/templates/walkthrough/contract.json` names
   the shapes (pin: id, screen, state, node id or stable id, note, author, round; approval:
   journey, by, round, hash of the beats shown). ADR-0030 (f) binds: HTTP, scripted, never MCP.
2. **Mocks over the service** (spec 02) — `/spec:mocks` builds the app's preview-only static
   export per round and pushes it with the records and `src/journeys.ts`; the check (screens,
   shells, journeys, layer and doc findings) moves into a plugin script over the source tree
   (react-docgen-free: a static import walk and the journey file), so `mock-cli.js`, contract
   v3, the `sweep` / `answer` / `approve` / `waive` / `serve` verbs and the package dev
   dependency are deleted; `journey-approved` reads the pulled approval whose beat hash matches
   the seed. DELETE rows for the retired files; zero-hit grep for `mock-review`.
3. **Prototypes over the service** (spec 03) — brief 28's overlay posts to the service when the
   config names a base URL and to the local file otherwise; the prototype driver pushes a
   Railway preview URL per round (the host's own preview environment on the `proto/<brief>`
   branch) and pulls pins into the same `pins.json`. One overlay, two sinks.

## Out of scope

- The service's own code, schema, auth and deployment — the `walkthrough` repository (handoff
  below). This brief fixes the contract the service must satisfy.
- Live regeneration inside the service — a later walkthrough brief, if rounds prove too slow.
- json-render specs and a gray catalog — watch (queue); the first carrier is the static export
  of the existing mock app.
- Genesis's design stage pushing designed journeys — brief 30 uses spec 01's client unchanged.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — (f) and the two-clocks ruling: client-paced
  phases are their own surface; a session touches them only when a round lands.
- docs/adr/0029-the-client-confirms-the-story.md — the beat hash the approval carries.
- docs/adr/0028-the-mock-is-the-app.md — narrowed: the reviewer is no longer a package in the
  app; the app's source layout stays.
- .claude/rules/spec-pipeline.md § Worker Rules — the client is `fetch` over built-ins.
- **Handoff prompt for the walkthrough repository** (new session there; ≤15 lines):
  > Retool this repository (mock-review) into `walkthrough`, a hosted review service. Keep the
  > overlay, notes and approval code; delete the in-app CLI (`check`, `sweep`, `answer`,
  > `serve`) and the contract handshake. Version one: Railway, Neon Postgres, Neon Auth with
  > passwords; tables client → project → journey → screen → spec version per round, users with
  > owner/staff roles and per-project membership, pins and approvals carrying user ids; one page
  > per project: walk view (screen full-bleed, slim step bar, real controls navigate), thumbnail
  > map with pin counts and approve-on-map after every step is walked; pin overlay with batch
  > send, pins anchored to stable ids; rounds hosting either an uploaded preview-only static
  > build (served same-origin under the overlay) or a preview URL (overlay loaded by the app);
  > four API calls under a version prefix as claude-plugins' `spec/templates/walkthrough/contract.json`
  > will specify; an admin script to create staff accounts. No dashboards, no notifications, no
  > self-signup, no regeneration. Prototype the walk + map page with one client before locking.

## Open questions for planning

- Static export path for the mock app: Storybook preview-only build, or Vite's own build of
  the mock app with the reviewer mount removed. Default: Vite build; Storybook enters with
  brief 30.
- Where the token lives: `.claude/spec.config.json` (committed) versus an env var. Default:
  env var named in the config, read by `env-preflight.js`.
