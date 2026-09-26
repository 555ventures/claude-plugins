# 0030. The kit is the contract

- Status: accepted
- Date: 2026-09-24
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (docs/roadmap/27–30; the 2026-09-23/24 research sweeps and executed
  spikes under docs/spikes/20260923-design-retool/; every clause below was ratified by JJ
  item by item on 2026-09-24)

## Context

Since ADR-0028 the mock app is the product's own source and `design/approval.json` is the
canon every later spec is gated on: plan warns, the design stage refuses, review checks the
hash, and "authority inverts at built" tells a shipped screen it may go stale. JJ's ruling
(2026-09-23): the shipped result is repeatedly not what was pictured, and every small design
correction costs a re-authored mock, a re-approval, a sketch round and a spec — four steps for a
padding change. The plugin's own numbers agree. Measured 2026-09-23 on salon-os, a host that
has carried the canon since the start: 162 kit restyles at 61 places, the same intent (edit one
record) built three ways (Sheet 27 places, Dialog, inline row), zero raw colours only because
the theme happens to use tokens. The canon sat beside the drift and stopped none of it,
because it is a second artifact kept in agreement by hand, and hands do not keep up.

Two research sweeps over post-July-2026 sources (design-to-code practice; consistency without
a mock canon) found no one defending a hand-maintained mock layer next to the code; the field's
direction is one artifact, with the contract in code: tokens and a kit enforced by lint that
fails the build, the catalog exposed to the agent, a separate calibrated evaluator, deterministic
diffs with a human approving baselines, real users only. Three further sweeps found the pieces
worth adopting (shadcn's own lint, Impeccable's deterministic detectors, RefDiff for structural
diffs, Storybook journey stories) and the pieces nobody has built: pins that become tests, an
approved render as the reference for a from-scratch rebuild, a state inventory that gates.

Three executed spikes settled what prose could not. A structural diff (element tree + computed
styles) catches a one-step padding change and a one-token colour change with zero noise across
nine no-change runs, in under a second per screen. A token lint over 511 files finds the drift
in 1.5 s and it collapses to two missing kit variants. Three wireframe formats (hand-written
shadcn TSX, json-render, A2UI) cost the same tokens per screen within 15%; json-render is
chosen anyway, for stability, not for tokens: every element carries a node id the client's pin
can anchor to, no iframe and no overlay injection, and a regeneration round is a JSON swap.

Three constraints from JJ shaped the rest. The wireframe and journey confirmation exist so that
the client, JJ and the model share one picture before anything is built; clients work on it
over weeks, on phones, across several projects, with their own staff accounts, and never through
JJ's laptop — so that phase is a hosted service, built as a service from the first line even
while it runs locally, and it never carries product code, so it works the same for a web app,
a mobile app or a CLI. Prototype code must never reach production, however many rounds it took
— so a prototype's render, not its UI code, is what the build is judged against; the data and
API layer is the one part that is kept, because a schema built twice is two products. And the
service serves a client; the designed product is reviewed by JJ, in the product's own
showcase, with no client gate.

## Options considered

- **A. Keep the canon, add a prototype command on top.** Rejected: it keeps every step of the
  four-step cost and adds a fifth.
- **B. Harden the prototype in place, no rebuild.** The field's tracer-bullet advice; rejected
  for UI because many rounds accrete structure and JJ's rounds are many. Kept for the data and
  API layer.
- **C. Rebuild the UI from the approved render; the contract is the kit; client phases are a
  hosted service that renders only wireframes and screenshots; genesis owns the design stage.**
  Chosen.

## Decision

Option C, in four briefs. Order of execution: **27 → 30 → 28**; 29 lands when the service's
first version runs.

(a) **The approval file is not a gate** (27). `/spec:sketch`, the design stage between plan
and build, `design_source` and `designed:` are deleted. Roadmap `surfaces` blocks remain
structure, not a gate.

(b) **The design contract is code** (27). A host with a UI stack carries tokens, a kit, an
intent-to-pattern table and a naming-convention table (one section per layer: code, schema,
API routes, and the wire format at the boundary) in its auto-loaded rule file, and one
intent-named composite per pattern row. The doctor verifies presence; no prose enforces it.

(c) **Gates are deterministic and wired per workspace** (27). Raw colours, arbitrary values,
restyles and primitive imports outside the kit directory are lint errors; naming is checked per
layer by the stack's own linter or a small script; Impeccable's detectors run where available;
every composite has a fixture story per declared state. `/spec:enforce` discovers and wires
them per workspace, so a Python backend and a TypeScript frontend each get their own set. The
plugin asks for the tables and one checker per layer; how is per stack.

(d) **Three lanes, chosen by the shape of the ask** (27, 28). Direct: a one-sentence change
with no behaviour or data change goes through the gates straight to main, no spec, no branch;
the merge review-row gate applies to spec branches only. Behaviour: a prototype (h).
Structural: schema or API change, plan first.

(e) **A note is one record with an optional anchor** (29). Anchor = a json-render node id or an
image coordinate; no anchor = a screen note. Region (drag) notes are retired. Pins that name a
behaviour become tests before a rebuild.

(f) **The client's surface is a hosted service, built as a service from the start** (29).
`mock-review` is retooled into `walkthrough`: one app, run locally for JJ now and deployed to
Railway for clients later, Postgres (Neon) from day one, Better Auth designed in and enabled
when hosted. A round is either json-render specs rendered by the service's own gray catalog
(the wireframe, interactive) or a sequence of PNG screenshots (designed screens and prototypes,
view only). The service never carries product code, so it is stack-agnostic. The plugin is a
scripted HTTP client with four calls and a pinned API version; every pull lands as files, so git
stays the ledger. Never MCP. The npm package and contract v3 retire when the service's first
version runs; until then `/spec:mocks` runs as today.

(g) **Genesis owns the design stage** (30). After the stack pick, Fable writes the design brief
(users and context, one JTBD line per journey with journeys locked before entities, IA as
task+frequency, the installed catalog read whole, the intent-to-pattern table, the naming
tables), then the tokens, shell and kit, then every approved journey as a walkable Storybook
journey story on the real stack. Journey screens may be drawn by Sonnet only after the kit
exists, all journeys in one session, from the brief. JJ approves in Storybook; there is no
client gate; a PNG round to walkthrough is optional. The roadmap derives from the designed set.
Journey stories are a genesis artifact: frozen after approval, never gated later. The living
showcase is the composites' state stories.

(h) **Prototype: functional, on the kit, then freeze, export, delete, rebuild** (28). A
prototype runs in a throwaway worktree on `proto/<brief>` with a Neon dev branch, locally,
exposed through Tailscale only when someone else must see it; it applies the kit, carries
behaviour and data, and iterates across sessions on pins. Freeze requires the kit gates green;
it captures every route × state with a structural diff tool, records stable ids and names as
the contract, derives tests from behavioural pins, exports the data and API layer (schema,
migrations, endpoints, their tests) to `harden/<brief>`, then deletes the worktree and
`proto/<brief>`. The build rebuilds the UI from main and must match the capture route by
route; the data and API layer is hardened in place from `harden/<brief>` through the naming and
kit gates. `/spec:run` refuses while `proto/<brief>` exists; `/git:merge` refuses `proto/*`.

(i) **Completeness is JJ's check.** No mechanical coverage of approved journey beats by specs;
JJ confirms per brief by hand.

(j) **ADR-0028 is superseded.** With wireframes rendered by the service, no mock app exists
before genesis; the product's source is born at the design stage.

Discovery prototypes before a seed exists stay outside the pipeline (one provenance line in the
seed template). Cut on 2026-09-24 by JJ, each returning only on a measured need: voice-spec
linting, root-cause diff grouping, Storybook agentic review, a framework-agnostic contract
beyond the principle in (c), per-journey deferral, a restyle ratchet, rubric calibration, a
Vibe Annotations reference note, and a client-side prototype of the walk+map page.

## Consequences

- One artifact, one contract, mechanical gates: a padding change is a commit, not four steps.
- The plugin gains a network dependency for the wireframe command, behind one script, and the
  wireframe stage needs the service running (locally is enough).
- Storybook enters every web host at the design stage; other stacks satisfy (c) with their own
  showcase and diff.
- The rewrite bet is unmeasured in the field; the first two prototype runs record round count
  and post-rebuild diff count.
- Prototype and product share one database engine, so what the prototype settles in the schema
  is what ships.

## Applies to

- 26-react-mock-system — superseded in premise when brief 29's service runs: the mock app, the
  reviewer package and contract v3 retire; until then `/spec:mocks` runs unchanged and
  `design/approval.json` stops gating plan, run and review (27).
- 22-mocks-first-genesis — narrowed: genesis still reads an approved journey set first; the
  roadmap derives from the designed set after JJ's design approval (30).
- 02-design-path-model-placement — amended: design authorship (design brief, kit, naming
  tables) is Fable; journey screens may be drawn by Sonnet after the kit exists, in one session
  (30).
- ADR-0028 — superseded by this ADR (j).

## Dissents

Positions this session proposed and JJ rejected on 2026-09-24, kept so the option space is on
record:

- **Neon Auth** for the service — rejected for Better Auth: portable with the repository,
  organization plugin fits per-project staff membership.
- **Defer json-render wireframes to a watch** — rejected: stability (node-id pins, no iframe,
  JSON-swap regeneration) is the reason, not token cost.
- **Carry designed journeys and prototypes into the service as embedded builds** — rejected:
  the service must stay stack-agnostic; screenshots do the job.
- **Railway preview + Neon branch per prototype, or SQLite locally** — rejected for one engine
  (Neon dev branch) because the data layer is kept, and no Railway because JJ reviews locally.
- **A separate lanes brief** — rejected as too small; folded into 27 and 28.
- **A mechanical beat-coverage check** (approved beats ↔ spec ACs) — rejected: JJ confirms
  completeness per brief by hand.
