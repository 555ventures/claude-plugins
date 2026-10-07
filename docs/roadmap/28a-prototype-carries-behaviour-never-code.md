# 28a — Prototype carries behaviour, never code: plan-shaped entry, loose rounds, a contract out, the worktree lives until the specs are done

Phase: P2 · Depends on: 28 · Amends: 28 and ADR-0030 clauses (d), (h) and the discovery-prototype
ruling (via a new amendment ADR, minted by this brief's plan) · Primary workspaces:
spec/commands/{prototype,plan,run}.md, spec/scripts/{prototype-driver,spec-build-driver,spec-status}.js,
spec/scripts/lib/{freeze,pins}.js, spec/doctrine/core.md § Pipeline Entry,
spec/doctrine/stages/stage-build.md, spec/templates/{grounding-contract,roadmap-brief,prototype-spec}.md,
git/commands/merge.md, tests · Risk: T2 (a config block changes shape → contract hash changes, hosts
owe a re-stamp; a doctrine paragraph changes; the `harden/<stem>` branch leaves the flow) ·
Design stage: no · Expected specs: 3

<!-- Minted 2026-10-07 from JJ's own words on how the prototype is used, after /spec:prototype
     refused brief 01 of a host for two reasons (no prototype block; "Lane: structural"). Brief 28
     shipped as specs/20260928/01–03 and is done; this brief changes what the command is FOR, not
     how its driver steps. Three rulings by JJ on 2026-10-07 reverse three of 2026-09-24:
     (1) a prototype may start from free-form words, not only a brief — the "discovery prototypes
     stay outside the pipeline" ruling is lifted; (2) no code leaves the prototype, not even the
     data/API layer — ADR-0030's "a schema built twice is two products" is a price JJ accepts for
     architecturally sound production code; (3) design is carried by captures judged by eye, never
     a structural diff — the RefDiff route-by-route gate is retired. -->

## Why this brief

JJ uses the prototype as a sketchpad, not as a pipeline stage: talk through an idea in plain
words, say "prototype it", click through a running throwaway app, react, repeat; only after
approve does anything durable get written. Brief 28 built the opposite entry: a brief path is
required, the brief must carry `Lane: behaviour` (stamped by genesis at mint time from a crude
"schema or API = structural" rule), and the freeze exports the prototype's data and API layer to
`harden/<stem>` for the build to merge — which is exactly the "copy a messy codebase into
production" JJ rejects. On 2026-10-07 the command refused a host's first-light brief on both
counts although the brief's own text names an observable surface ("where a person observes it").

The one rule that replaces all of it: **carry behaviour across, never code.** The prototype is a
reference, never a source. Code moves from it only by being read and rewritten under a spec whose
File Plan comes from the production architecture.

## Result

`/spec:prototype` takes the same three input shapes as `/spec:plan`: a feature description in
plain words (or nothing, with the idea in the conversation — written to disk at the first step),
a roadmap brief path, or a prototype stem to re-open. It opens a disposable worktree on
`proto/<stem>` with its own throwaway database (the host's `dbCreate`/`dbDestroy`), no gates, no
review; rounds are fast and loose, and every reaction is a pin as today. `approve` produces a
**behaviour contract** and nothing else leaves the worktree: the pins as plain sentences, a
capture (screenshot) of every route × state as the design reference, and one end-to-end test per
behavioural pin that runs against any build of the app. The driver then opens `/spec:plan` with
the contract as its feature description; plan does what it already does — amend an existing
brief, amend a draft spec, or mint new ones (brief `n/a` when no roadmap applies) — plus one new
duty: cite the prototype stem as the behaviour reference and **never read its file tree**. The
build's capture gate replays the contract's end-to-end tests against the production build —
green means production does what JJ approved with zero prototype lines in it; the look stop
shows the production screens beside the prototype captures and JJ says close enough or not; no
pixel or structural diff anywhere. The worktree and `proto/<stem>` are deleted when the last spec
citing the stem reaches `done`, derived by `spec-status`, never at freeze. Choosing
`/spec:prototype` is choosing the behaviour lane: the brief's `Lane:` field is advisory, and the
command never refuses on it.

## Current state

- `spec/commands/prototype.md` — `$ARGUMENTS` is a brief path only; the entry rule names
  `Lane: behaviour`; setup refuses without the config `prototype` block (D1 of
  specs/20260928/01), naming `/spec:doctor`.
- `spec/scripts/lib/freeze.js` — refuses unless the host gate is green on the prototype tree;
  RefDiff capture per route × state; `contract.json`; derived Playwright tests; `git` export of
  the config `export` globs to `harden/<stem>`; then deletes the worktree and branch; one ledger
  row.
- `spec/doctrine/stages/stage-build.md` — behaviour lane: merges `harden/<stem>`, RefDiff gate
  route by route with a look stop on diff; `/spec:run` refuses while `proto/<stem>` exists.
- `git/commands/merge.md` — refuses `proto/*`, pointing at `harden/<stem>` as what lands.
- `spec/templates/grounding-contract.md` § Prototype — `export` is a required non-empty array.
- `spec/doctrine/core.md` § Pipeline Entry — three lanes; "a spec branch lands only through the
  review stage's merge-back; a direct change never has a branch, which is how the lanes are
  told apart at commit time." A `proto/*` branch (has a branch, never lands) is unnamed.
- `spec/templates/roadmap-brief.md` — the `Lane:` comment says a behaviour brief "sends
  /spec:plan's Entry to /spec:prototype instead of hydrating into a spec directly".
- docs/adr/0030 (d) and (h), and its post-decision line "Discovery prototypes before a seed exists
  stay outside the pipeline".

## Scope

1. **Entry matches plan; the lane gate goes** (spec 01) — `prototype-driver.js` derives the
   stem from any of the three input shapes (words → a slug the driver prints and the user may
   rename once; brief path → the brief stem; existing stem → re-open) and writes the idea text
   into `design/prototypes/<stem>/status.json` at OPEN (core § On-Disk Handoff: the spoken idea
   is on disk before any round). The `Lane:` check is deleted from the command; the roadmap-brief
   template's `Lane:` comment is rewritten to "advisory; prototype is the behaviour lane by
   choice". The config `prototype` block loses `export` (the contract hash changes; hosts owe a
   re-stamp via `/spec:doctor`). Rounds run with no gate: the driver never invokes `gateCommand`
   on the prototype tree. The refusal for a missing `prototype` block stays, and its text says
   what the block is for in one sentence.
2. **Approve produces a contract, exports nothing, deletes nothing** (spec 02) — `lib/freeze.js`
   is renamed to its new job (the "freeze" verb and the kit-gates-green precondition are
   retired): write `contract.json` (pins as sentences, routes × states, the `test`-marked pins),
   screenshot every route × state into `design/prototypes/<stem>/captures/` (the design
   reference — a picture, not a structural tree; the RefDiff capture and its gate are deleted),
   derive one Playwright test per behavioural pin into the host's `e2eFile` path (red until the
   production build passes), append one ledger row, and **hand off to plan**: print the exact
   `/spec:plan` invocation carrying the contract path as its feature description. No
   `harden/<stem>`; the worktree and branch stay. `/git:merge` keeps refusing `proto/*` and its
   message names the contract, not a harden branch.
3. **Plan cites, build replays, status derives the delete** (spec 03) — `/spec:plan` Entry gains
   the contract shape: read the contract and captures; amend a brief, amend a draft spec, or mint
   new ones; every spec it produces carries `prototype: <stem>` in frontmatter; the planning
   session never reads anything under `proto/<stem>` or the prototype worktree (a Read of either
   path is a hard finding at review); the File Plan comes from the production tree and the
   host's rules. The build driver's behaviour lane: input = spec + contract + captures + tests;
   the capture gate is the contract's end-to-end tests executed against the production build (a
   required blocking leg, core § Runtime Verification); the look stop shows production screens
   beside the captures; the `harden/<stem>` merge step is deleted; `/spec:run`'s "refuse while
   `proto/<stem>` exists" is deleted (the branch now lives through the build by design).
   `spec-status` derives "every spec with `prototype: <stem>` is `done`" and prints the one
   delete command (worktree + branch + `dbDestroy`); the review driver's close runs it when the
   closing spec is the last citer. Core § Pipeline Entry gains two sentences: choosing
   `/spec:prototype` is choosing the behaviour lane (the brief label is advisory); a `proto/*`
   branch is the third kind at commit time — it has a branch and never lands, its contract lands
   through a spec. The amendment ADR records (d), (h) and the discovery-prototype ruling as
   amended, with Applies-to ↔ Amended-by backlinks.

## Out of scope

- Folding the wireframe stage (`/spec:mocks`) into the prototype as "one stage at two
  fidelities" — the radical version, parked by JJ on 2026-10-07 until this brief has run on a
  real host and the 2026-10-05 pictures round has been used.
- The pin overlay, the round loop, the Neon dev branch mechanics and the walkthrough PNG round —
  brief 28 and 29 as shipped; untouched.
- A scaffold step for a prototype on an empty `main` — the first round builds whatever the idea
  needs, as any round does; the command names this in one sentence and adds no state.
- Any pixel or structural comparison between prototype and production — rejected by JJ on
  2026-10-07: design is judged by eye at the look stop.

## Grounding

- docs/adr/0030-the-kit-is-the-contract.md — (d) lanes, (h) prototype, the discovery-prototype
  line; this brief's plan mints the amendment ADR and backlinks it.
- specs/20260928/01–03 — the shipped command, freeze and build lane this brief rewrites.
- spec/doctrine/core.md § Pipeline Entry, § On-Disk Handoff, § Runtime Verification, § Rule
  Enforcement (gates protect what lands; the prototype never lands — the two rules depend on
  each other and the command says so).
- spec/commands/plan.md § Input, § Entry — the three input shapes this brief mirrors.
- Amended by ADR-0035 — the prototype carries behaviour, never code; minted by this brief's plan on
  2026-10-07 (specs/20261007/01–03).
- JJ, 2026-10-07 (this session): "I do not want you to just copy messy codebase into production
  codebase, but architecturally sound, high quality code. You can keep the worktree until this
  is done, it will be either roadmap or spec's responsibility to implement the production grade
  codebase."

## Open questions for planning

- Stem from words: driver-derived slug the user may rename once, or asked. Default: derived and
  printed as `📌 Auto-picked <stem> (veto anytime)`.
- Hand-off to plan: the driver opens plan in the same session, or prints the paste. Default:
  prints the paste (plan is Fable's seat; the prototype loop is Sonnet's — core § Model
  Placement), queued via `spec-queue --top`.
- Which plan output when a brief already exists for the idea: amend it, or mint `NNa`. Default:
  plan decides as it does today from the roadmap; the brief gains a `Prototype: <stem>` line
  either way.
- Delete at last-citer close: automatic in the review driver, or printed by status for the user.
  Default: printed by status; the review driver runs it only under `--via loop`.
