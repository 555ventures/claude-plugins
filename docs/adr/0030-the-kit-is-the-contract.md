# 0030. The kit is the contract

- Status: accepted
- Date: 2026-09-24
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (docs/roadmap/27–30; the 2026-09-23/24 research sweeps and executed
  spikes under docs/spikes/20260923-design-retool/)

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
shadcn TSX, json-render, A2UI) cost the same tokens per screen within 15%, which killed the
premise that a schema DSL is cheaper; TSX stays for wireframes.

Two constraints from JJ shaped the rest. Clients drive the wireframe and design approvals over
weeks, on phones, across several projects each, with their own staff accounts, and never through
Tailscale or the user's laptop — so a client-paced phase is its own hosted surface, never a
state inside a session-stepped driver. And prototype code must never reach production, however
many rounds it took — so a prototype's render, not its code, is what the build is judged
against.

## Options considered

- **A. Keep the canon, add a prototype command on top.** Rejected: it keeps every step of the
  four-step cost and adds a fifth.
- **B. Harden the prototype in place, no rebuild.** The field's tracer-bullet advice; rejected
  for UI because many rounds accrete structure and JJ's rounds are many. Kept for the data and
  API layer, where a second build is a second product.
- **C. Rebuild from the approved render; the contract is the kit; client phases are a hosted
  service; genesis owns the design stage.** Chosen.

## Decision

Option C, in four briefs shipped in order, each independently valuable:

(a) **The approval file is not a gate** (27). `/spec:sketch`, the design stage between plan
and build, `design_source` and `designed:` are deleted. Roadmap `surfaces` blocks remain
structure, not a gate.

(b) **The design contract is code** (27). A host with a UI stack carries tokens, a kit, an
intent-to-pattern table in its auto-loaded design file, and one intent-named composite per row.
The doctor verifies presence; no prose enforces it.

(c) **Gates are deterministic and live in the host's gate command** (27): raw colours,
arbitrary values, restyles and primitive imports outside the kit directory are lint errors;
Impeccable's detectors run; every composite has a fixture story per declared state.

(d) **Pins are the reaction record** (28). A reaction is an element-pinned annotation with a
stable id, screen, state, note, author and round; prose without an anchor is flagged. Pins that
name a behaviour become tests before the rebuild starts.

(e) **Freeze, capture, delete, rebuild, verify** (28). On approval the prototype's render is
captured per route and state with a structural diff tool, stable ids and names are recorded as
the contract, the worktree and branch are deleted, and the build reads only brief, pins,
captures and tests. UI is rebuilt and must match route by route; the data and API layer is
hardened in place under a structural sub-plan. `/spec:run` refuses while the prototype branch
exists; `/git:merge` refuses `proto/*`. The first two runs measure round count and post-rebuild
diff; harden-in-place for UI is the named fallback.

(f) **Client-paced phases are a hosted service the plugin talks to over HTTP** (29). The
`mock-review` package and contract v3 are retired; the repository is retooled into
`walkthrough`. The plugin's client is a script with four calls and a pinned API version; every
pull lands as files, so git stays the ledger. Never MCP: mechanics run in scripts.

(g) **Genesis owns the design stage** (30). Between the stack pick and the roadmap, the
strongest model writes the design brief (users, context, one JTBD line per journey with
journeys locked before entities, IA as task+frequency, the catalog read whole, the pattern
table), then the kit, then every approved journey as a walkable Storybook journey story on the
real stack; genesis pauses at a client gate and derives the roadmap from the designed set.

(h) **The showcase is living** (30). Every screen is a story; a shared-component change re-runs
the baseline diff on every story; baselines change only by human acceptance.

The wireframe stays a gray throwaway in the mock app's TSX, never referenced after the design
stage. Discovery prototypes before a seed exists stay outside the pipeline by ruling. Voice-spec
linting, root-cause diff grouping, Storybook agentic review, a framework-agnostic contract, a
restyle ratchet, per-journey deferral, rubric calibration and json-render wireframes were each
cut on 2026-09-24 as unearned; each returns only on a measured need.

## Consequences

- One artifact, one contract, mechanical gates: a padding change is a commit, not four steps.
- Storybook is required in every web host from the design stage on; a second stack's export is
  a later brief.
- The plugin gains a network dependency for the two client-paced commands, behind one script.
- Two client waits per engagement (wireframe, design) instead of one, in exchange for a design
  the client approved on the real stack.
- The rewrite bet is unmeasured in the field; the plugin measures it on its first two runs and
  carries the fallback as configuration.

## Applies to

- 26-react-mock-system — narrowed: the mock app remains the product's source and `/spec:mocks`
  keeps its states; `design/approval.json` stops gating plan, run and review (27); the reviewer
  package and contract v3 are retired in favour of a hosted service (29).
- 22-mocks-first-genesis — narrowed: genesis still reads an approved product first; the roadmap
  derives from the designed set after a second client gate (30).
- 02-design-path-model-placement — amended: design authorship (design brief, kit, journey
  stories) is the strongest available model; drawing from the brief may be Sonnet (30).

## Dissents

- **Harden in place for UI as well** (the field's tracer-bullet position; also this session's
  first answer): keep the prototype, pin tests, clean, review. Rejected by JJ on round count and
  on the standing rule that prototype code never reaches production; retained as the measured
  fallback in (e).
- **One genesis driver owning the client phases** (this session's second answer): rejected by
  JJ because the client's clock is weeks and the driver's is hours; the phases are separate
  commands and genesis pauses at a gate.
- **json-render as the wireframe format** (this session's third answer, twice): the constraint
  benefit is real but not urgent with one author per project; deferred, not rejected.
