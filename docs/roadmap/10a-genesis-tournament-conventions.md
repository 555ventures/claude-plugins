# 10a — Executed genesis, second half: tournament of scaffolds, conventions first
Amended by: ADR-0006 (brief 22 — mocks-first genesis)

Phase: P3
Depends on: 10

## Why this brief

Successor to brief 10 (`10-genesis-single-proposer.md`), minted at its planning session
(2026-08-25). Brief 10's four landing units were planned as `specs/20260825/01..04` — panel
collapse, consultant discovery, executed currency, and the genesis driver for the architect
stage. Its units C (tournament of scaffolds, explore folded into the gallery, the supplied
external candidate) and the remainder of D (conventions-first artifact set, the explore/design
states inside the driver, the single `/spec:genesis` command end-to-end) depend on that
driver's real shape and were deferred here so their specs describe code that exists. Every
claim in brief 10's § Why still binds; this brief restates only what it owns.

JJ rulings at brief 10's plan (do not re-ask): the end state is **one command**,
`/spec:genesis "<idea>"`, re-invoked until done, every step re-entered from disk with a
printed `✅ checkpoint … safe to /clear` line (specs/20260825/04 D9); the proposer is the
session itself.

## Scope

Two landing units, each independently green; plan as `##-` siblings after specs/20260825/04
is `done`.

### C — Tournament of scaffolds: decisions on executed evidence

- After the picks, the user may mark **2–3 finalists to race** (one finalist = the driver's
  existing scaffold + zero-day gate). Each finalist is scaffolded for real into
  `.claude/genesis/tournament/<finalist>/` (its `create-*` run, driver-executed), then put
  through the same executed probe: zero-day gate, boot to readiness (the finalist's declared
  `bootCommand` + `readyCheck`, `smoke.sh`'s contract), and one **probe slice** built by
  Sonnet workers via direct dispatch. The decision record is a **benchmark table**
  (`.claude/genesis/tournament/benchmark.json` + a rendered `.md`): booted / gate exit / probe
  tasks passed / worker retries / tokens / screenshots side by side. **Tokens are observable**:
  the harness reports `subagent_tokens` per Agent completion (executed 2026-08-25 — a trivial
  Haiku dispatch reported `21927`), so the column records what the harness reported, never an
  estimate. Executed evidence *informs* the user's pick; it never makes it. Two finalists that
  both pass are ranked by the user's own coverage answers, stated.
- **Probe slices per archetype (proposal — confirm at plan):** `web-app`/`realtime-trading`:
  one authed CRUD screen + one background job + one style tile rendered with the real
  component library; `backend-api`: one authed CRUD resource + one background job;
  `mobile-app`/`desktop-app`: one authed list→detail screen + one async task + one style tile in
  the real UI kit; `data-ml`, `conversational-bot`, `cli-devtool`: no tournament — single
  candidate, boot check only. Cap per finalist: two retries per probe task, then the finalist
  is recorded failed at that task and spent no further.
- **Explore folds into the gallery.** The explore stage's Round 0 (positions → tiles) runs
  **before** the tournament as a driver state; the two culled positions render inside each
  finalist's scaffold with its real component library, so one locally rendered gallery judges
  stack × design together (render-screenshot-critique with `frontend-design` active, ADR-0001;
  screenshots are session-captured via the render MCP — no finalist declares a capture
  command yet, so `render-gate --mocks` is not available at this point). A design the user
  already made elsewhere (a Claude Design export or any local mock bundle) enters as **one more
  candidate**: `explore: external` records it, the state gate admits it, and the design state
  ratifies it exactly like a funnel winner — fresh UX research is not owed on that path. The
  export has no token block (memory `claude-design-export-format-reality`) and `dc-extract` is
  gone (specs/20260824/05): the external candidate is accepted as a plain mock bundle and its
  literals are the tokens the design state authors from — no extraction script.
- **The winner is re-scaffolded clean** into the project root from its `scaffoldCommand`
  (proposal — confirm at plan): the probe slice is benchmark code built under retry caps with
  no spec and no review, and must not become the foundation; the tournament dirs are deleted
  after the pick, the benchmark table survives as the decision's evidence appendix.
- Cost is stated at kickoff (roughly one mini-build per finalist, with the last tournament's
  measured token column when one exists) and is a go/no-go line.

### D′ — Conventions first, spine as code (the remainder of brief 10 unit D)

- **The primary artifact is what agents read and gates run**, not ADRs: a <150-line
  `CLAUDE.md`/`AGENTS.md` carrying the binding subset, the gate command, lint config,
  `enforcement.json`, and a **conventions probe suite** — one executable test per
  checker-enforceable ops-conventions row (genesis.md § Genesis: Ops Conventions ADR's rows are
  the floor), living in the **host's test tree** so the gate runs it forever (brief 10's open
  question — default taken). ADRs become the generated rationale appendix (Dissents kept).
- **Greenfield genesis IS init + enforce for that repo:** the driver's HANDOFF state runs
  `init-gen.js generate` from a profile derived from `stack-descriptor.json` and hands off to
  `/spec:enforce` the way `/spec:init` does; `/spec:init` stays the brownfield entry and the
  regeneration owner (brief 11). `frontend-design` provisioning stays brief 11's.
- **Explore and design become driver states**, entered or skipped: `genesis-explore.md` and
  `genesis-design.md` are deleted; their judgment seats (position briefs, starter tokens,
  critique rounds, the pick, canon authoring) become steps the driver prints; the state gate's
  explore/design arms go with them; `/spec:genesis` runs the whole greenfield path. Every state
  boundary prints the checkpoint line.

**Proof condition (series exit, run once on a greenfield prompt):** (1) the single proposer's
decision record is no weaker than the panel's — judged — *and* its conventions probe suite runs
green in the zero-day gate where the panel's ADRs enforced nothing; (2) the tournament table
for two finalists is produced from executed runs, and every version in every menu resolves on
its registry (specs/20260825/03); (3) a supplied Claude Design export reaches a ratified canon
without the explore funnel running.

## Out of scope

- Everything brief 10 fences off (ADR format kept; sketch/design escape hatch untouched;
  release-time re-tournament; DESIGN.md/DTCG interchange and WCAG pin — brief 08's).
- The `/spec:enforce` workflow inversion — ruled out at brief 10's plan (specs/20260825/01
  D12): no incident, frozen script, symmetry is not a reason.
- Non-web render adapters for the gallery (brief 08's rule: built when a non-web host exists).

## Grounding

- `docs/roadmap/10-genesis-single-proposer.md` — § Why (all citations), § Scope C and D.
- `specs/20260825/04-genesis-driver.md` — the driver's states, marks, checkpoint contract,
  `status.json` v2; `specs/20260825/03-genesis-currency-executed.md` — the menu `packages` and
  `currency` shapes the tournament's finalists inherit.
- Amended by ADR-0001 — the gallery's render-critique loop runs on a bare Claude Code token.
- `spec/scripts/smoke.sh` — boot-to-readiness contract the finalist probe reuses.
- `spec/scripts/init-gen.js` — the generator D′'s HANDOFF invokes.
- Memory `research-20260824-genesis-best-practice`, `feedback-genesis-options-not-autopick`,
  `claude-design-export-format-reality`, `spec-20260824-brief-08-render-gate-series` (the
  `dc-extract` drop and the `render-gate --mocks` note).

## Open questions for planning

- Keep vs re-scaffold the winner (proposal above: re-scaffold clean; the alternative keeps the
  probe slice as the walking skeleton and brief 01 of the roadmap starts from it).
- The mobile/desktop probe slices and whether `desktop-app` gets a style tile at all.
- Where `explore: external` candidates must live (`design/explore/external/`?) and the
  minimum the state gate verifies before admitting one (a root `data-screen-label` per file).
