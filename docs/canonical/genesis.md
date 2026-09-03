# Genesis — canonical decisions

## Decision record (one proposer)

- Since specs/20260825/01 the genesis architect and design stages have no proposer panel.
  `wf-research.js` (one Sonnet agent per dimension slice, web-enabled) builds ranked option
  menus on disk; the planning session is the proposer — it reads the menus and writes the ADRs
  directly. A second perspective on a hard fork is a second research call over a different
  dimension slice, never a second reader of the same brief. `wf-panel.js`, its `spec-paths`
  key, `## Panel Roles`, and `panel-results-*.json` are retired. The archetype registry names
  dimension keys only — no framework, language, runtime, or catalog product appears in
  doctrine. (specs/20260825/01-genesis-panel-collapse.md, done 2026-08-25)
- Workflow scripts (`spec/workflows/wf-*.js`) are ordinary review surface: this repo's
  `pipelineOwnedPaths` entry for them — written for a code generator deleted in `61e2e5a`
  (2026-08-17) — is retired, so an unplanned edit is an out-of-plan finding at review and
  collision-closure's literals leg can see inside them at plan lock. A spec that edits one
  gives it a File Plan row. `wf-research.js` additionally keeps a standing banned-literal
  sweep in `tests/consistency/genesis-doctrine.test.js` with a stricter list than its
  doctrine siblings, because that sweep runs on every test run while the literals leg runs
  only at lock. (specs/20260825/05-workflow-scripts-in-review-scope.md)

## Discovery (consultant posture)

- Since specs/20260825/02 the genesis interview is adaptive, not scripted. The one fixed
  structure is the coverage audit — ten keys (`payer`, `tenancy`, `data-sensitivity`,
  `residency`, `ai-use`, `unattended`, `integrations`, `scale-outage`, `vendor-budget`,
  `offline-mobile`) recorded in `brief.md`'s `## Coverage` as covered/dark/n-a lines; dark keys
  are asked before any menu. The brief (`spec/templates/genesis-brief.md`) is re-rendered to
  the console after every answer and is the discovery record; a throwaway `sketch.html` checks
  understanding early and is pruned at design lock. Hard-to-reverse dimensions = registry floor
  + keys derived from coverage answers. Every `wf-research` option carries `because` (the
  answers behind its rank) and `priced` (a consequence at the stated scale).
  (specs/20260825/02-genesis-consultant-discovery.md, done 2026-08-26)

## Currency (executed)

- Since specs/20260825/03 every research menu option carries
  `packages: [{registry, name, version}]` and is resolved by `registry-check.js`
  (`spec-paths registry-check`) against the registry's per-version JSON endpoint — npm, PyPI,
  crates.io — and endoflife.date's cycle list for runtimes. A `missing` option is dropped into
  `droppedForCurrency` before the user sees the menu; survivors carry a `currency` block;
  unreachable registries stamp `unverified` and never block (exit 3). The Haiku recency pass,
  `verifyKeys`, and `still_current` are retired. Exit codes: 0 ok · 1 dropped · 2 malformed ·
  3 unreachable; sentinels `__REGISTRY_OK__`, `__REGISTRY_DROPPED__ n=<k>`,
  `__REGISTRY_UNREACHABLE__`. (specs/20260825/03-genesis-currency-executed.md, done 2026-08-26)

## Driver (the whole greenfield path)

- Since specs/20260825/04 `/spec:genesis "<idea>"` is the greenfield entry point, looping on
  `genesis-driver.js` (`spec-paths genesis-driver`): states DISCOVERY → MENUS → EXPLORE →
  DECIDE → SCAFFOLD → SKELETON → GATE → ROADMAP → HANDOFF, derived from `status.json`
  (schemaVersion 2) plus on-disk artifacts on every invocation. The driver runs the coverage-audit gate, the
  registry check per menu, the decision-record closure check, the scaffold command, the
  zero-day gate, and the roadmap closure check; the session holds the interview, the picks, the
  ADRs, the skeleton, and the roadmap decomposition. Every accepted mark prints
  `✅ checkpoint — … safe to /clear`. The former separate architect command is retired (its
  file deleted, its name swept from every live surface). Child output from `scaffoldCommand`/`gateCommand` streams straight to
  `.claude/genesis/scaffold.log`/`gate.log` via the log fd — never through a Node pipe — and the
  excerpt the driver prints back is bounded in **bytes** (`LOGTAIL_MAX_BYTES`), not lines.
  (specs/20260825/04-genesis-driver.md, done 2026-08-26)

- Since specs/20260827/01 the driver races finalists between `MENUS` and `DECIDE` for tournament
  archetypes (`web-app`, `realtime-trading`, `backend-api`, `mobile-app`, `desktop-app`): states
  `FINALISTS` → `RACE` (driver-only: scaffold into
  `.claude/genesis/tournament/finalists/<name>/`, zero-day gate, boot through `smoke.sh` with a
  per-finalist `.genesis-smoke.json`) → `PROBE` (the session builds one probe slice per finalist
  with Sonnet workers, two retries per task, recording `tournament/evidence/<name>/probe.json`
  with harness-reported tokens) → `PICK` (the driver re-runs gate + boot, writes
  `tournament/benchmark.json`/`.md` and `gallery.html`; the user picks by rewriting `## Picks`).
  `--mark menus-done` requires `- archetype: <registry key>` in `## Picks` and stores
  `status.archetype`. `decided` requires the descriptor's `scaffoldCommand` to be the winner's
  and an ADR to cite `benchmark.md`, then deletes the raced copies; the winner is re-scaffolded
  clean into the root. Every step text prints a `Doctrine:` pointer; the command no longer
  carries per-state pointers. (specs/20260827/01-genesis-tournament.md, done 2026-08-27)

- Since specs/20260902/08 the design stage has left genesis for `/spec:mocks`
  (specs/20260902/07): the in-driver explore funnel (specs/20260827/02) and design-lock state
  (specs/20260827/03) are retired with their marks and templates. The driver chain is
  DISCOVERY → BRIEF → MENUS → tournament → DECIDE → SCAFFOLD → SKELETON → GATE → ROADMAP →
  HANDOFF → GROUNDED (`status.json` schemaVersion 3, `brief` record, no `explore`).
  `discovery-done` requires `- archetype: <registry key>` in `## Picks` and hands off to
  `/spec:mocks` for visual archetypes. BRIEF requires `design/mocks/status.json` APPROVED with
  an open ledger gate and `--mark brief-written` ratifies the one-page doctrine (Dissents
  naming every composed-but-unpicked direction), the category-only `design-rules.json`, and
  THEME's `design/tokens.css` (`design: "ratified"`; `backend-api`/`data-ml` record
  `skipped`). The tournament's tile probe task and the discovery sketch are retired; the
  `design/components.json` check moves to `skeleton-landed`. A legacy status past MENUS
  resumes at BRIEF via `--mark brief-written --legacy` (no re-run forced); the init hook
  accepts `design: ratified` and still blocks on a partial legacy canon.
  (specs/20260902/08-genesis-shrink-brief-state.md, done 2026-09-03)

- Since specs/20260827/04 `decided` also validates `.claude/genesis/conventions.json` (the nine
  ops floor rows DECIDED or DEFERRED-with-reason; enforceable rows name a probe under
  `testTree`), `skeleton-landed` requires every enforceable probe file and a ≤150-line
  `CLAUDE.md`/`AGENTS.md` naming the gate command and the test tree, and `HANDOFF` is a judgment
  step: the session authors `.claude/genesis/init-profile.json` (init.md Phase 4's shape) and
  `--mark profile-written` has the driver run `init-gen.js generate` (log at
  `.claude/genesis/init-gen.log`, remedies keyed on its exit code, `--refresh` passed through),
  landing the terminal state `GROUNDED` with `next: /spec:enforce`. Greenfield genesis is init +
  enforce; `/spec:init` is the brownfield entry and the regeneration owner.
  (specs/20260827/04-genesis-conventions-handoff.md, done 2026-08-30)

- **Brief from the approved set (specs/20260902/11).** BRIEF generates `## Journeys` and
  `## Non-UI Coverage` from `design/mocks/seed.md` and the ledger — `--mark brief-written`
  checks that every seed journey and label appears under `## Journeys` and that the six non-UI
  keys (`jobs notifications retention integrations admin pricing`) are `covered`/`n/a`, never
  `dark`; the BRIEF step prints its derivation sources (confirmed `product` ledger rows by id,
  journey and label counts, unresolved page-note count). MENUS prints the seed's
  `primary-surface` and `platforms-horizon` rows above the framework dimension and prices every
  framework option against them (`wf-research` `contextPaths` include the seed).
  `roadmap-written` requires every seed label in exactly one brief's ```surfaces block and
  refuses naming unplaced or double-placed labels. `skeleton-landed` requires the shell canon
  extracted from the densest composed screen (`design/shell/app.html` passing `check`), every
  top-level mock `data-shell`-stamped via `design-atlas.js shell adopt --apply`, a green
  `check --matrix design/mocks`, and a `design/components.json` entry per `canon.md` primitive.
  Legacy runs and non-visual archetypes see none of the new refusals.
  (specs/20260902/11-brief-from-approved-set.md, done 2026-09-03)
