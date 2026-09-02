# 10 — Executed genesis: consultant discovery, one proposer, a tournament of scaffolds
Amended by: ADR-0006 (brief 22 — mocks-first genesis)

Phase: P3
Depends on: 08

## Why this brief

Rewritten in place 2026-08-24 (was: "Genesis panel collapse: one strong proposer, executed
grounding"). The panel collapse survives as landing unit A below; the rest of the brief
widens the target from *how genesis argues* to *what evidence genesis decides on*.

The genesis MoA panel (blind Sonnet proposers → aggregator) is the last surviving committee
after v7 killed the review panel, and the evidence against it has only firmed: capable
models outgrow collaboration (Nature MI, Jul 24 2026 — capability-saturation threshold
predicts panel help/hurt, 94% held-out accuracy); panel verdicts are unreproducible
run-to-run (<50% consistent, arXiv 2607.27942, Jul 30 2026); deliberation over *identical*
evidence collapses into herding, gains appear only with partitioned evidence per agent
(arXiv 2607.01661, Jul 2 2026); and no shipping harness (Claude Code, Codex, Kiro, Cursor,
Amp — Jul/Aug 2026 releases) runs a proposer panel — all are interview → single planner →
approve → execute.

The 2026-08-24 sweep (memory `research-20260824-genesis-best-practice`) found the deeper
problem is not how genesis argues but **what it argues about and on what evidence**:

- The hard-to-reverse list researches dimensions 2026 practice calls *cheap* to reverse
  (framework, hosting, rendering strategy — the last now framework-coupled) and skips the ones
  it calls irreversible: multi-tenancy/data-partition model, API versioning, data residency and
  customer-data-in-training posture, the AI layer (provider abstraction, LLM SDK, vector/memory
  store, eval harness), background-jobs platform, observability.
- Those irreversibles are product questions wearing engineering clothes. Today's interview
  spends three cold batches on product/user/scope and jumps to stack menus; the constraints
  that actually rank a hosting or tenancy option — who pays, whether customers are
  organisations, where data must live, what runs unattended, existing vendor contracts — are
  invisible to the model and only surface if the user is asked, in their own terms.
- Decisions lock by argument. The only executed check is that the winner's scaffold boots.
  Conventions beat typing as the agent lever, but only when enforced — agents recalled
  framework APIs 8–35% of the time unprompted (Rails Foundation benchmark, 2026-08-13);
  tooling-enforced constraints lifted reviewer recall 54.5%→90.9% over scaffolding prose
  (arXiv 2607.02389). No harness reads ADRs; agents read CLAUDE.md/AGENTS.md and gates.
- Currency is an opinion. The Haiku recency pass is not told to pin to release pages;
  2026 blog roundups assert Bun 2.0, Deno 3.0, Tauri 3.0 and Storybook 11 — none exist —
  and nothing verifies a package *exists* on the registry (slopsquatting is a live RCE class,
  Jul 2026). The archetype registry names stacks in doctrine ("Remix" is already dead as a
  framework name), against core § Rule Enforcement's no-named-tools rule.

## Scope

Four landing units, each independently green (core § Decomposition); plan as `##-` siblings
in this order.

### A — Panel collapse (the original brief)

- Replace the panel in `genesis-architect`/`genesis-design` with **one strong proposer** over
  the retained research fan-out; delete `wf-panel.js`. Where a second perspective is wanted on
  a hard fork, it is a *partitioned-evidence* second leg (a different research slice), never a
  second reader of the same brief.
- Resolves brief 08's open question on wf-panel's fate; sequence with 08 so the design-family
  thinning and this collapse touch the frozen workflow files once, not twice. Brief 08 hands
  the genesis-family thinning (genesis.md cut, wf-research fate, enforce inversion) to this
  unit.

### B — Consultant discovery: the brief is the interface

- **Product discovery first, adaptive, never scripted.** The interview runs the way a
  consultant interviews a client: start open, reflect back, follow the answer; depth is earned
  by signal (hesitation, vagueness, high stakes) — the current "probe once, never recursion"
  cap is deleted. What is fixed is a **coverage audit** the session runs silently before it
  recommends anything: who pays and how; organisations vs individuals (tenancy); data
  sensitivity and regulation; where users are and where data must live; whether the product
  itself uses AI and whether customer data may train anything; what must run unattended;
  day-one integrations; six-month scale and outage cost; vendor and budget limits;
  offline/mobile realities. Dark areas are asked then, phrased in the user's own words. Every
  batch passes core § Question Style's ten-second cold test.
- **The brief is the interface.** Claude's understanding is kept *visible and growing* — a
  one-page "what I think you're building" (`.claude/genesis/brief.md`, rendered for the user
  after every answer) and, as soon as there is enough to draw, one throwaway sketch of the
  core screen ("is this roughly it?"). Questions are the marked gaps in that page; corrections
  are edits to it; the finished page *is* the discovery brief — the separate read-back gate
  goes. The throwaway sketch reuses the `/spec:sketch` machinery and is discarded at pick.
- **Hard-to-reverse dimensions are derived from the answers**, not a fixed engineering list:
  the 2026 irreversibles above are *added* to the menu set (never substituted for framework /
  hosting / persistence / component library — those stay); a dimension the answers close is
  never asked.
- **Every dimension stays a research-backed option menu the user picks from** — recommended
  first, "Other / not sure" hatch, no silent auto-pick of "reversible" dimensions (memory
  `feedback-genesis-options-not-autopick`: business constraints are invisible to the model).
  Each option's description names the answers that drove its rank ("recommended because you
  said EU-only and teams share data").
- **Consequences priced against the user's own numbers.** With the stated scale and
  constraints in hand, the research agents make each option's consequence concrete — an
  estimated monthly bill at the stated six-month scale and where it jumps; which options a
  residency answer removes; what a later tenancy switch costs in migration terms. Generic
  tradeoff prose ("repriced often") is a defect once numbers are available.

### C — Tournament of scaffolds: decisions on executed evidence

- After the picks, the user may mark **2–3 finalists to race** (one finalist = today's boot
  check). Each finalist is scaffolded for real (its `create-*` run), then put through the same
  executed probe: zero-day gate, boot to readiness, and one **probe slice** — a thin vertical
  feature the archetype implies (web: an authed CRUD screen + one background job + one style
  tile rendered with the real component library), built by the same Sonnet workers the
  pipeline will use. The decision record is a **benchmark table**: booted / gate / worker
  retries / tokens / screenshots side by side. Executed evidence *informs* the user's pick; it
  never makes it. Two finalists that both pass are ranked by the user's own constraints,
  stated.
- **Explore folds into the gallery.** Style tiles render inside each finalist's scaffold, so
  stack and design are judged together in one locally rendered gallery
  (render-screenshot-critique loop with the `frontend-design` instructional layer active, per
  ADR-0001). A design the user already made elsewhere — a Claude Design export or any local
  mock bundle — enters as **one more candidate** (`dc-extract` harvests literals when there is
  no token block; memory `claude-design-export-format-reality`); `genesis-explore` therefore
  stops being a mandatory stage: `explore: external` records a supplied candidate, the state
  gate admits it, and `genesis-design` ratifies it exactly like a funnel winner. Fresh UX
  research is not owed on the supplied-candidate path — the user already decided.
- Archetypes without a scaffold-able probe (`data-ml`, `conversational-bot`) degrade to a
  single candidate with the boot check; the tournament is for web / mobile / desktop / api.
- Cost is stated at kickoff (roughly one mini-build per finalist) and is a go/no-go line.

### D — Conventions first, currency deterministic, spine as code

- **The primary artifact is what agents read and gates run**, not ADRs: a <150-line
  `CLAUDE.md`/`AGENTS.md` carrying the binding subset, the gate command, lint config,
  `enforcement.json`, and a **conventions probe suite** — one executable test per
  checker-enforceable conventions row (the Phase A table's rows are the floor). ADRs become
  the generated rationale appendix (Dissents kept). Greenfield genesis thereby *is* init +
  enforce for that repo; `/spec:init` stays the brownfield entry and the regeneration owner.
- **Currency is executed, not opined.** The Haiku recency pass is replaced by a deterministic
  registry check (`npm view` / `pip index` / equivalent, pinned to endoflife.date and official
  release pages): a version that does not exist on the registry cannot enter a menu, which
  kills fake-major roundups and slopsquatting in one script. The archetype registry in
  `genesis.md` shrinks to archetype → dimension keys — **no named stacks in doctrine**; the
  live menu is the only place a framework name appears.
- **One stepped driver** (`genesis-driver.js`, the review-driver shape from brief 16) owns
  states, the coverage audit, the tournament's probe runs and the benchmark table; the session
  holds only taste, the sketch, and the user's picks. The three commands collapse to the
  states the driver exposes; `genesis-explore` becomes a driver state, entered or skipped.

**Proof condition to plan:** one greenfield prompt run both ways. (1) The single proposer's
decision record is no weaker than the panel's — judged, *and* its conventions probe suite
runs green in the zero-day gate where the panel's ADRs enforced nothing. (2) The tournament
table for two finalists is produced from executed runs, and every version in every menu
resolves on its registry. (3) A supplied Claude Design export reaches a ratified canon
without `genesis-explore` running.

## Out of scope

- The ADR file format and `docs/adr/` as the rationale home (kept; demoted, not removed).
- Extending the supplied-candidate route to `/spec:sketch` or `/spec:design` — their Claude
  Design escape hatch already exists (design.md, "Claude Design as a source").
- Re-running the tournament at release time when a vendor reprices (reopen triggers) —
  incremental on top of this brief; note in the release brief if wanted.
- The DESIGN.md / DTCG-JSON canon interchange and the WCAG 2.2 AA baseline pin — brief 08's
  design-canon territory; this brief consumes whatever 08 ratifies.

## Grounding

- Amended by ADR-0001 — the proposer's executed grounding includes the render-critique loop;
  design quality mechanisms must run on a bare Claude Code token.
- Memory `research-20260824-genesis-best-practice` — the 2026-08-24 four-agent sweep: dated
  citations for every claim in § Why, the fake-major list, the dimension gaps.
- Memory `feedback-genesis-options-not-autopick` — JJ's rulings that shaped units B and C:
  options always user-picked, discovery first and adaptive, brief-as-interface, priced
  consequences.
- Memory `research-20260817-ai-first-best-practice` — the earlier citations behind unit A.
- `docs/roadmap/08-design-thinning.md` — the coordinating brief; hands genesis-family thinning
  here.
- `docs/roadmap/16-pipeline-spine-as-code.md` — the driver shape unit D adopts.
- `spec/doctrine/core.md` §§ Rule Enforcement, Question Style, Decomposition, Model Placement
  — the invariants each unit is checked against at plan time.

## Open questions for planning

- Where the visible growing brief renders: console re-print of `brief.md` after each batch
  (bare-token safe) vs a local page the sketch already serves. Default: console, sketch page
  only once a sketch exists.
- Probe-slice definition per archetype (the mobile and desktop slices are not obvious) and
  the token budget cap per finalist.
- Whether the conventions probe suite lives in the host's test tree (runs in its gate forever)
  or in `.claude/genesis/` (runs once). Default: host test tree — a convention nobody re-runs
  is prose.
