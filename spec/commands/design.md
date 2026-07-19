---
description: Optional UI design stage, driver-stepped — the expensive model authors skeletons and judges; Sonnet expands them via wf-design; the user iterates in the catalog; spec reconciled to the approved design
argument-hint: <spec path> [claude.ai/design URL | local mockup file/dir]
---

# Spec Design: Driver-Stepped Plan + Implement + Catalog Iteration

For UI-bearing specs (`design: true`) in hosts whose config declares a `design` block (component
catalog — shared § Design Stage). Sits between `/spec:plan` and `/spec:build`: authors the
foundation + real, **kept** stateless components + catalog entries by **expanding pre-authored
skeletons**, lets the user iterate in the running catalog, then reconciles the spec and sets
`designed: YYYY-MM-DD`. Build treats these components as done inputs.

**Intended model: mock-always (v6) — the fork is where the mock comes from, not whether one
exists.**
- **Mock-bound** (a `design_source` — a bound mock — exists, usually under `design/mocks/`):
  **Sonnet session.** Against a
  bound region, skeleton authoring is grounded transcription, not taste — the taste was already
  spent upstream, in the mock. Consult the **Fable retainer** (`Agent {model:"fable"}`, Opus
  fallback; continue the SAME agent via SendMessage across the session rather than re-spawning)
  ONLY at judgment points: component-boundary/reuse decisions against the existing component
  catalog, blocked or ambiguous bindings, any `deltas.json` proposal, and family furniture
  asymmetry (a shell-level element present in some sibling mocks and absent in others — see the
  sibling-grounding rule below).
- **No mock yet:** author it first — the **mock-authoring preamble** below — then proceed
  mock-bound. On roadmap-derived specs the preamble runs on **Sonnet + the Fable retainer**
  (direction-level questions escalate to the atlas, where roadmap taste lives); on standalone
  no-roadmap specs it runs on the **session model** — the user picked the seat at invocation
  (Opus default, Fable when the surface warrants it; shared § Model Placement).

Either way the expensive seat **writes no framework code**; Sonnet expands 100% of components
via `wf-design`.

**Mock-authoring preamble (no `design_source` anywhere).** Taste is spent here, in a file
cheap to iterate — never directly in framework code. Author `design/mocks/<label>.html` for
each of the spec's UI surfaces under the **design harness** (shared § Design Stage): plain
HTML consuming `design/tokens.css` by role, root `data-screen-label` per surface, real copy in
its final register (it becomes the fidelity contract), grounded in the spec's UI section +
doctrine + `docs/design/research-brief.md` (when present). If `design/targets.json` is missing,
create it first (archetype-derived defaults from the `design-targets.json` template, one
confirm with the user). Then the staged loop — **matrix-at-approval** (shared § Design Stage),
which is what keeps iteration cheap:

1. **Draft to direction approval.** Draft the mock on the **draft framing** — the
   most-constrained declared viewport, light theme. Run the deterministic check
   (`spec-paths design-atlas` → `node <atlas> check design/mocks/<label>.html`) and the
   render→screenshot→critique loop, then the **rule-checklist pass** (a Sonnet checker walks
   the research-brief's admitted rules against the screen, citing rule IDs — shared § Design
   Stage). Iterate with the user — serve the file or point at the atlas — to direction
   approval.
2. **Matrix expansion pass** (only once the direction is approved). Media queries + viewport
   meta, dark via the tokens.css theme block, one responsive file, never per-device variants —
   gated by `check --matrix`, with matrix screenshots (each viewport, both themes on the draft
   framing) shown to the user for the **fast matrix confirm**.
3. **Stamp and bind.** Only then set `data-status="approved"` (approval is two-step by
   doctrine, and the check enforces the matrix on approved mocks, so the stamp can't precede
   either half), persist the path as `design_source:` frontmatter, and hand over to the
   ordinary mock-bound flow below.

(The Claude Design escape hatch — designing the surface at `claude.ai/design` and passing its
URL — remains supported and follows the identical mock-bound flow after fetch.)

**Setup:** run `spec-paths shared-for design` and read its output (the shared invariants scoped
to this command). Read the host's `.claude/spec.config.json` and its pipeline rules file. Then
run `spec-paths design-driver` once and keep the printed path — it is `{driver}` below.

## Input

`$ARGUMENTS` — path to a spec with `status: hardened` (hook-enforced), plus an optional second
arg: a **design source** — either a `claude.ai/design` mockup URL, or a **local path** (a single
exported HTML file, or a handoff-bundle directory of HTML screens + optional per-screen
`*.prompt.md` notes). On the first invocation, if a source is passed and frontmatter has no
`design_source`, persist it into frontmatter, then proceed — thereafter frontmatter is
authoritative. No `design_source` anywhere → run the mock-authoring preamble first (above),
which produces one. A local source is extracted directly by `dc-extract --bundle` (no DesignSync
fetch); a URL is fetched read-only via DesignSync (the escape hatch — recommend `/design-sync`
seeding once per project on that path, so the mock arrives speaking the repo's tokens).

## Protocol — the driver owns the state machine

Loop until the driver prints `DONE`:

1. Run `node {driver} <spec path>`. It inspects the on-disk state (frontmatter, the
   `##-name.design/` sidecar, progress marks) and prints the **current step's instructions** —
   fetch/extract, skeleton authoring, the `wf-design` invocation, visual review, the human
   iteration loop, reconcile.
2. Execute exactly that step. Record progress the way the step says
   (`node {driver} <spec> --mark <mark>` after a step completes green).
3. Re-run the driver. It verifies the step's artifacts actually exist before advancing — never
   skip ahead of it, and never re-do a step it reports complete.

Re-entrancy is the driver's job: a fresh session (or a session resuming days later) runs step 1
and lands exactly where the work stopped. All state is on disk; nothing depends on this
conversation. The iteration loop is deliberately **cold between rounds** — the sidecar's
`design-log.md` carries each round's rulings, so no expensive session idles while the user looks
at the catalog.

When the driver prints `DONE`, report — open with one outcome line (`✅ designed — N components
kept, manifest extended, spec reconciled; next /spec:build`), then only what changes the user's
next step (§ Console Output Style).

## Rules (session-binding — the driver cannot enforce these)

- **The expensive model writes no framework code.** It authors `skeletons.json`, adjudicates
  forks, issues visual-review notes and iteration rulings; Sonnet/Haiku apply every edit (sole
  exception: the driver's micro-edit rule for one-line exact-string changes).
- **Gate-green ≠ visually right.** A green author is structural (skeleton-expanded) only; the
  screenshot review (when configured) or the human catalog loop is the visual gate. Never show
  the user output you have not at least gated.
- **With a mock bound, the mock is a contract, not an influence — bound region by region.** A
  canvas export is a whole screen; the spec binds only the REGIONS it builds
  (`regionRef: "<surface>#<region>"`, from the driver's feasibility report), and the bound
  region's slice is the binding authority for structure, copy, element order, and layout;
  skeletons carry judgment only (a binding map: token mapping over the literal harvest, props,
  states, forks, variant confirmations — no tree). The driver checks each bound region
  **fail-closed** at `author-green` and `round-green`, by string class: copy passes verbatim in
  code **or as a declared copy-catalog value** (the i18n home); `{{ }}` bindings render from
  props; sc-for sample rows live in story fixtures. Unbound regions are notes — the repo-level
  coverage ledger (written at `approved`) hands them to later briefs. A refused mark lists the
  divergences. The ONLY sanctioned divergence is an evidence-gated `deltas.json` row (verbatim
  slice quote, verified mechanically, plus an impossibility proof) — a taste rationale is never
  valid evidence; taste yields to the mock (shared § mock supremacy). Fold delta rows into spec
  Decisions at reconcile.
- **Sibling mocks ground asymmetry detection — never transcription.** When the bound surface
  belongs to a mock family (other mocks of the same route group or shared entry frame), the
  session seat reads the siblings' **extract inventories** (region labels + furniture from the
  dc-extract slices — never raw sibling mock HTML; detection needs "signup has a disclaimer bar
  region, signin doesn't", not markup) before authoring skeletons. **Furniture** here is
  shell-level chrome — legal/disclaimer bars, header marks, footer cross-links — not content.
  Furniture present in some siblings and absent in others is a **judgment point, never a silent
  transcription**: if the divergent furniture carries `grounded`-category copy (legal, a11y,
  destructive-action safety), consult the retainer and surface the question — a mock's
  *omission* is not evidence against a grounded ruling (shared § mock supremacy); otherwise
  honor each mock and record the asymmetry as a one-line doctrine note at reconcile. Siblings
  ground **questions**, never **bindings**: workers never see sibling material, and copy,
  structure, and order still bind only to the surface's own region — this rule creates asks,
  never unification.
- **A variant screen is not a second contract.** The extract's `variantProposals` (heavy copy
  overlap = same screen re-themed / re-laid-out) resolve to token-pair (theme) or responsive
  (breakpoint) obligations on the SAME skeletons — never a duplicate string binding.
- Tokens and the design doctrine are **binding canon** — extending is normal, contradicting is a
  fork, adjudicated via the driver's steps, never silently overridden.
- Components built here are **real and kept**; `/spec:build` wires them, never rebuilds them.
- **Component manifest discipline (shared § Design Stage).** Read `design/components.json` at
  preflight, before any bind-vs-author decision. Every `author` decision records the nearest
  existing manifest entry and one line on why it fails — a missing justification is a gate
  failure; `/spec:review`'s component-manifest check verifies its content against the manifest.
  At reconcile, extend the manifest with every component this run created or newly bound
  (`name`, `purpose`, `props`, `mockRefs`, and — for `author` decisions — `authorJustification`,
  copied verbatim from the binding map: the sidecar is deleted at reconcile, so the manifest is
  where the justification survives for review). Creating must cost more than reusing — that gradient is the anti-duplication
  mechanism, not anyone's memory.
- **A `built` surface re-entering design re-syncs its mock first** (mock authority expired at
  `built` — shared § mock-authority lifecycle): refresh the mock to current shipped reality
  (screenshot the live screen, update the file), then design the change on top. Never design
  against a stale contract, and never treat post-`built` staleness discovered here as a defect —
  it was permitted.
- Design changes propagate **forward into the spec at reconcile** — never left for build to discover.
- **Affordance ↔ contract reconcile (blocking, at reconcile).** Before `designed:` is set,
  build the matrix: every interactive affordance of every approved component (each event
  prop × each visual state it renders in) maps to a server-accepted transition in the spec's
  Contracts/Behavior sections. An affordance the server would reject is a **fork**, not a
  styling choice — `AskUserQuestion` (change the component / change the contract via a spec
  Decision), never pass it through to build (measured: UpWell spec 03 — a designed card
  rendered a re-confirm affordance on declined items through the same handler as proposed
  ones; the server throws `VALIDATION` on that transition; build wired it as-is *because the
  component's shape said to*). Design output enters build with a spec's authority; this
  matrix is where it earns a spec's scrutiny.
- Workers never run git; the session owns every checkpoint-commit. The coverage ledger
  (`.claude/design-coverage.json`, written by the driver at `--mark approved`) is durable repo
  state — include it in that checkpoint-commit; it must survive the sidecar deletion.
- **Never Read `wf-design.js`** — the AUTHOR step prints the full `args` contract; the workflow
  is invoked by `scriptPath` and its source is never session context.
- `AskUserQuestion` dismissed → STOP (state is safely on disk; re-invoke to continue).
