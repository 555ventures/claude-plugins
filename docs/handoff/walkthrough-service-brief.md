# Planning brief: the walkthrough service

For a new session in the service's own repository (today `github.com/555ventures/mock-review`,
to be renamed `walkthrough`). Written 2026-09-29 from the prototype and from
`specs/20260929/01-the-walkthrough-contract-and-the-client.md` in claude-plugins. This document
states conclusions; the new session re-derives detail from the files named under Sources.

## Result

One hosted review service: a client opens a link, reads their own story step by step beside a
gray wireframe or a picture of the designed screen, leaves notes on the part they mean, and
confirms the story. The plugin pushes rounds and pulls notes and approvals over HTTP. The
service never carries product code.

## Fixed (decided, do not reopen)

- TypeScript. React 19 on the page, because wireframes are drawn by `@json-render/react` 0.21.
- Postgres on Neon from day one; a dev branch locally.
- Better Auth: email and password, the organization plugin for staff membership per project.
  Clients sign in; no token in an address.
- One long-running Node service on Railway; run locally today.
- HTTP and JSON for the plugin, version in the path. Never MCP.
- One note record with an optional anchor: `{ node, index }` on a wireframe, `{ x, y, width }`
  on a picture, or none. Drag-to-mark is retired.
- The client view is the storyboard JJ approved on 2026-09-29. Production is a fresh build
  judged against the prototype's screens. Prototype code is thrown away, except the data and
  API layer, which is hardened.
- View settings (phone or desktop, zoom per width) are remembered per browser, never synced.

## The contract the service must satisfy

`spec/templates/walkthrough/contract.json` and `catalog.json` in claude-plugins are the source.
The service copies both files in and runs its own contract tests against them: every `examples`
entry is replayed, every answer is checked against its shape. The files are plain JSON in a
subset of JSON Schema, so any standard validator reads them.

Seven calls under `/v1`: `hello`, `pushRound`, `putImage`, `pullNotes`, `replyNote`,
`pullApprovals`, `markRound`. One refusal body everywhere, the reviewer's own endpoints
included: `{ error, detail, apiVersion }`.

What the prototype does not have yet and the contract requires:

1. `hello` answers `revision` and `sunset`.
2. `pushRound` stores the caller's `contentHash`; `round-exists` returns it in `detail`.
3. `putImage` checks `x-content-sha256` and refuses `checksum-mismatch`.
4. `pullNotes` returns a `cursor` and honours `since`.
5. Limits are enforced (`too-large`, `rate-limited` with `Retry-After`).
6. Tokens are per project and revocable (`bad-token`, `wrong-project`).
7. A screen without a state has no `state` key; the image key is `<name>--<width>` then.
8. Push validation runs from `catalog.json`, the same rules as the plugin's offline check.

Service-only rules, outside the plugin's contract:

- "Changed" compares with the round the client confirmed, not with the previous round.
- "Read" is stored on the service per person, not in the browser.
- A picture round stays hidden until every declared picture arrived.
- Notes belong to the project, not to a round; a pin stays on its element across rounds.

## Prototype debt that must not survive

The server is a development server. There is no migration history. A catch-all `extra` column
holds note fields. Old reviewer code remains, with five failing test files. There are no
automated tests for the client view. The keyboard cannot pick an element. The frame height
jumps on a first visit.

## Stack: open, JJ picks

Researched 2026-09-29, sources dated after 2026-07-01 unless marked. Versions are the ones
found that day.

| Choice | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| App shape | Hono 4.13 API + Vite React page. Plain web requests; Better Auth mounts in one line; event streams and raw uploads are simple. You own routing and any server rendering. | TanStack Start 1.168. Typed routes; json-render 0.21 ships a renderer for it; Railway is a hosting partner. Its API changes often; Better Auth needs its cookie plugin last. | Next.js 16.3. Largest ecosystem. Self-hosting needs more setup; weakest route typing. |
| Data access | Drizzle 0.45 + drizzle-kit. Better Auth adapter checks the schema at start; SQL migration history. Its 1.0 is still beta. | Kysely 0.29 + kysely-ctl. Better Auth adapter has transactions. Types kept by hand. | Prisma 7.10. Best tooling; a code generation step; version 8 is a release candidate. |
| API and contract | Plain handlers, answers checked against `contract.json` by a standard JSON Schema validator. The contract file stays the one source. | `@hono/zod-openapi` 1.6. Schemas generate an OpenAPI file. That would be a second contract beside ours. | oRPC 1.x. Contract-first; more machinery than ten calls need. |
| Tests | Vitest 5 + Playwright 1.63 against a real Postgres. | The same with a Neon branch per run (no recent source found). | PGlite in process: fast, but one connection only, so locking cannot be tested (source dated before July). |
| Lint and format | Biome 2.4 plus strict `tsc`. One tool; type-aware rules are approximate. | ESLint 10 with typescript-eslint, plus a formatter. Most complete; slowest. | Oxlint 1.80 + oxfmt. Fastest; type-aware rules still settling. |

Recommended by the research: Hono + Vite React page, Drizzle, Vitest 5 + Playwright on real
Postgres, Biome. For the API row this brief recommends option 1 instead of the research's
pick, because the plugin's contract file already exists and a generated second file would
drift from it. Runner-up: TanStack Start with Drizzle, if server rendering of the reviewer
pages matters more than a simple API.

Not confirmed by a recent source: Better Auth with React Router 8; json-render 0.21 under
Next.js; upload size limits and event streams behind Railway's proxy; release dates of the
Hono, Next.js and TanStack Start versions above.

## Order of work

1. Pick the stack. Set up the gates before any feature: strict types, lint that fails the
   build, design tokens and components enforced, tests required, migrations with history,
   continuous integration.
2. Data and API layer first, hardened from the prototype's, with the contract tests green.
3. Thin slices after that, each complete (data, API, screen, tests) and each judged against
   the prototype's screens: a step, adding a note, reading notes, the whole story and the
   confirm, the stories page, a picture round.
4. Sign-in and hosting.

## Out of scope for v1

Dashboards, notifications, self-signup, regeneration inside the service, a thumbnail map.

## Sources

- claude-plugins: `specs/20260929/01-the-walkthrough-contract-and-the-client.md`,
  `docs/adr/0030-the-kit-is-the-contract.md`, `docs/adr/0029-the-client-confirms-the-story.md`,
  `docs/spikes/20260929-walkthrough/FINDINGS.md`.
- The prototype, branch `proto/walkthrough`: `docs/design/client-view.md` (the binding design),
  `docs/design/client-view-shots/`, `src/catalog/README.md`, `src/server/walkthrough/README.md`,
  `src/server/db/schema.sql`, `PROTOTYPE-PLAN.md`.
