---
description: Genesis-stage supplement to the spec pipeline's shared invariants — read by the three greenfield genesis commands, not a workflow entry point
---

# Spec Pipeline: Genesis-Stage Supplement

Genesis-stage supplement — read by `/spec:genesis` (whose driver loop owns discovery through
the `BRIEF` ratification, § Genesis: Brief State), in addition to `core.md`.

## Genesis: Discovery Interview (the intake posture)

**The coverage audit is the one fixed structure.** Ten keys the model cannot derive because they are
invisible unless asked — `payer`, `tenancy`, `data-sensitivity`, `residency`, `ai-use`,
`unattended`, `integrations`, `scale-outage`, `vendor-budget`, `offline-mobile` — each recorded in
`.claude/genesis/brief.md`'s `## Coverage` block as
`- <key>: covered | dark | n/a — <one line in the user's words>`. Discovery ends when no key is
`dark`; a user who declines a key is recorded `n/a — declined: <reason>`, which counts as closed. A
key a coverage answer already closes ("must use <vendor>") is written `constrained` in
`## Open Dimensions` and never asked again as a fork (§ Genesis: Hard-to-Reverse Dimensions).

**Coverage is confirmed in rounds, not interrogated.** The DISCOVERY step prints fifteen keys grouped `round N of 4` — the ten above, the four `## Non-UI Coverage` keys that are not duplicates (`jobs`, `notifications`, `retention`, `admin`) and `success-metric` — each with its current brief value. Derive one guess per key from the idea and ask each round as one `AskUserQuestion` of up to four questions; every question names its key in parentheses (`Who pays for the product (payer) — …?`) and offers `confirm: <guess> (Recommended)` / `correct it` / `not applicable`. Write the answers into `## Coverage` / `## Non-UI Coverage`; `success-metric` is written as `- success-metric: <label>` under `## Picks`. `## Non-UI Coverage`'s `integrations` and `pricing` lines are copied from the `integrations` and `payer` answers, never asked. Product facts stay asked; only their form is a sentence to confirm.

**The brief is the interface.** `.claude/genesis/brief.md` is authored from the template
`genesis-brief.md` (`$(spec-paths templates)/genesis-brief.md`) with exactly six `## ` sections in
order: `What I think you're building`, `Coverage`, `Non-goals`, `Open Dimensions`,
`Research Angles`, `Picks`. `## What I think you're building` + `## Coverage` are printed in full
exactly once, at the end of discovery, immediately before `--mark discovery-done`.

**Archetype and hand-off.** `discovery-done` requires a `- archetype: <registry key>` line in
`## Picks` (§ Genesis: Archetype Registry). The archetype is a printed pick: derive it from the idea, print `📌 Auto-picked archetype <key> — <one-line reason> (veto anytime)`, then write the line.
Printed by `genesis-driver.js` at BRIEF; never restated here.

- **Escape hatch on every round.** "Other / not sure" is the one open lane (and the tool's free-text
  channel).
- **Non-goals are recorded, not parked.** Adjacent features the user rules out go into
  `## Non-goals` as soon as they surface, marked In / Later / Won't-this-time.

**The woven loop (research-backed rounds).** A research-backed round:

1. The user's last answer, or a coverage answer, opens one or more dimensions. The command calls
   **`wf-research`** — research agents only, no proposers — with `args` = paths/keys/booleans
   (`stage`, `dimensionKeys`, `briefPath`, `contextPaths`).
2. It returns one **option menu per dimension** — 2–4 current options, ranked recommended-first,
   each carrying an honest `tradeoff`, a `because`, a `priced` consequence at the brief's stated
   scale, a recency stamp grounded in sources, an `is_minority` flag preserving any contrarian
   option, and a required `why_recommended`.
3. The command writes each menu to `.claude/genesis/interview-research/{dimension}.json`, then
   presents an `AskUserQuestion` built **from the menu**: options recommended-first, each
   description built as `tradeoff` · `because` · `priced` · "current as of `<fetchedAt>`", rank 1
   labeled "(Recommended)" with `why_recommended` as the stated reason.

Enforced by `registry-check.js` — its header comment is the contract; the driver runs it on every accepted menu.

**Auto-pick before you ask.** After `--mark menu-written` the MENUS step classifies every open, unpicked dimension from its research file: `auto` when exactly one option holds rank 1, that option is not `is_minority`, and its `priced` string begins `n/a`; `ask` otherwise (a rank tie, a minority leader, a priced leader, no rank). For each `auto` dimension print the step's `📌 Auto-picked <dim>: <label> — <why_recommended> (veto anytime)` line to the owner and write its `write:` line under `## Picks` (the driver never writes `brief.md`); an owner veto is a `## Picks` edit before `menus-done`. Paid services are always asked — a priced leader is never auto-picked, even inside the stated vendor budget. The `ask (N)` dimensions are asked batched four per `AskUserQuestion`, recommended first, built from their menus as above.

**Discovery is product / user / business / legal only — never organizational.** Team skill,
headcount, ownership, ops staffing are never asked: Claude is always the implementer.

## Genesis: Brief State

**Precondition (archetypes that owe a mocks set only, § Genesis: Archetype Registry).** `web-app`,
`mobile-app`, `realtime-trading`, and `desktop-app` must show `design/mocks/status.json` at
`state: "APPROVED"` and `gateVerdict(design/mocks/ledger.md)` at `open`, before
`--mark brief-written` is even attempted.

**Derivation sources.** The BRIEF step counts the journeys in `design/mocks/seed.md` and the waiting
items of the latest round's `notes.json` through `lib/mocks-round.js`'s `openNoteCount` — `0` with
no round — printed as `seed journeys: N · notes open: N`.

**On success:** `marks.briefWritten`, `status.brief = {mocks: "design/mocks/status.json" |
null, legacy: false|true, ratifiedAt: "<ISO>"}`, and `status.design = "ratified"` (or
`"skipped"` for the four design-skipped archetypes).

**Legacy resume.** A `status.json` with `marks.menusDone` and no `marks.briefWritten` derives BRIEF
with a step text opening `legacy: explore/design artifacts accepted in place of a mocks set`.
`--mark brief-written --legacy` skips the mocks precondition entirely and records
`brief.legacy: true`.

**Brief generation is derived, never guessed.** On a fresh run that owes a mocks set,
`.claude/genesis/brief.md` gains two sections after `## Picks`: `## Journeys` and
`## Non-UI Coverage` (`- <key>: covered|n/a — <one line>` for the six closed keys
`jobs notifications retention integrations admin pricing`). `--mark brief-written` refuses when any
seed journey or label is missing from `## Journeys`, or any Non-UI Coverage key is missing or still
`dark`.

## Genesis: Tournament of Scaffolds

Between `MENUS` and `DECIDE`, **tournament archetypes** (`web-app`, `realtime-trading`,
`backend-api`, `mobile-app`, `desktop-app`) race real finalist stacks instead of deciding on
argument alone: `FINALISTS` → `RACE` (driver-only) → `PROBE` → `PICK`. Every other archetype
derives `MENUS → DECIDE` unchanged and writes no `.claude/genesis/tournament/`; a skipped race
(`--mark finalists-skipped`) records `tournament.skipped` and advances the same way.

**The wireframe is not the product.** A host with an approved wireframe runs `MENUS`, the
tournament, and `SCAFFOLD` exactly like any other host.

**FINALISTS.** The session composes 2–3 finalist stack combinations from the menus; at least one
must equal the brief's current `## Picks` on every key it names (the incumbent). Race or skip is one `AskUserQuestion` whose recommended option is the step's printed `default:` line — race when `framework` or `language-runtime` was asked at MENUS, skip when every tournament dimension was auto-picked.
Printed by `genesis-driver.js` at RACE and PROBE; never restated here.

**PICK.** **Executed evidence informs the user's pick; it never makes it** — two finalists
that both pass are ranked by the coverage answers, stated, never by the numbers alone. The
user picks by rewriting the brief's `## Picks` to the winner's labels; `--mark picked` matches
it against exactly one finalist's picks.

**Re-scaffold clean.** `decided` re-scaffolds the winner clean into the project root (its
`scaffoldCommand` run exactly as a non-tournament `SCAFFOLD` would) and deletes the raced copies
(`tournament/finalists/`, `tournament/logs/`) once an ADR cites `tournament/benchmark.md` as
evidence; `benchmark.json`, `benchmark.md`, `gallery.html`, and `evidence/` survive as the decision
record's evidence appendix.

**Artifacts.** `spec/templates/finalists.json`; `tournament/evidence/<name>/probe.json`
(session-written, one entry per expected task); `tournament/benchmark.json`/`.md` and
`tournament/gallery.html` (driver-written).

## Genesis: Decision Record (one proposer)

`AskUserQuestion` **cannot run inside a workflow**, so the commands never nest it — the session owns
every question and every file write.

The session is the proposer. Input: every `interview-research/{dimension}.json` on disk; output: one
ADR per hard-to-reverse dimension, `## Options considered` copied from the menu's ranked options,
`## Decision` the pick, `## Dissents` per the rule below.

A hard fork — a dimension still without a `## Picks` line after MENUS, or a user hesitation signal — is an
`AskUserQuestion`: options verbatim from the menu, `tradeoff` in each description.

`## Dissents` carries every non-picked ranked option, every `is_minority` option, and every
user-rejected option.

**Conventions are derived, not asked.** The DECIDE step prints `conventions auto-pick (8)`: derive each of those eight ops-convention keys from the stack and print `📌 Auto-picked <key> — <reason> (veto anytime)`. Analytics is a vendor/privacy choice and belongs to discovery: the step's `success-metric:` line carries the label DISCOVERY wrote under `## Picks`, or says to ask it in the user's words when absent.

## Genesis: Ops Conventions ADR

Write the ops-conventions ADR (`docs/adr/NNNN-operational-conventions.md`, one ADR, one table). Rows
(a floor, not a ceiling): **error taxonomy** (the error shape/base classes and user-facing vs
internal split — binding for **every process entrypoint**, never only the serving path), **logging**
(structured or not, shape, what is never logged), **naming & identifiers** (casing and plurality for
tables/columns/indexes/ constraints; primary-key strategy AND id-minting — one generator module +
prefix registry; per-surface casing ownership — DB vs wire vs logs vs analytics tags — with the
boundary stated), **wire representations** (decided once at the contracts seam: non-JSON-native
types such as bigint/decimal money, timestamp form on the wire — UTC-only vs offsets tolerated — and
the discriminator field name), **cross-plane constants** (any literal referenced on both sides of a
language/process seam — env var names, header and auth-scheme names, queue/topic names, redaction
key lists — lives in the generated contracts surface or carries a test that pins both sides to one
source), **env/config management**, **CI** (the gate runs on every push — wired at scaffold time, §
Genesis: Day-Zero Skeleton), **background/async work**, and **success-metric instrumentation** (the
discovery measurement pick — the analytics seam, or "not measured in v1"). These are boring-default
rows the session fills from the research; `AskUserQuestion` only on a genuine fork. A DECIDED row in
a category `/spec:enforce` can mechanize is stated **checker-enforceable** — no taste clauses; the
rejected taste variant goes in Dissents. Each row is DECIDED or DEFERRED-with-reason. The rows above
are samples of one **generating question** — *"what will two context-free executors, weeks apart,
decide differently unless a row decides it now: every value class crossing a surface boundary, every
name a second writer will mint, every operational behavior a spec will assume but never state?"*
After filling the dictated rows, run one **derive pass** against that question and propose rows the
floor missed. Then the **coverage check**: a second same-session read of the finished table against
the generating question, whose only outputs are added rows or nothing. Both passes are **advisory**;
derivation can add rows but its silence never certifies completeness.

## Genesis: Hard-to-Reverse Dimensions (always escalate via AskUserQuestion)

A hard fork on any of these is a **mandatory** `AskUserQuestion` (verbatim, recommended first),
never synthesized away.

- **architect:** persistence model · framework · monorepo topology · primary
  language/runtime · auth approach · component library · deployment target.
- **design:** component library · token tier count · accessibility baseline · doctrine
  adjective conflicts (the core taste direction) · **navigation shell** (sidebar / top-nav /
  tabs — the app's structural skeleton) · **layout system** (breakpoints, grid, container
  widths) · **color schemes** (light / dark / system — token structure is hard to retrofit).

### Derived dimensions (from coverage answers)

| Coverage answer | Derived dimension key(s) |
|---|---|
| `tenancy` = organisations | `tenancy-model` |
| `residency` ≠ global, or `data-sensitivity` = regulated | `data-residency` |
| `ai-use` = yes | `llm-provider`, `vector-store`, `eval-harness` |
| `ai-use` = yes AND customer data is used | `data-in-training` |
| `unattended` = yes | `background-jobs` |
| `scale-outage` any answer | `observability` |
| `integrations` names a versioned external API | `api-versioning` |

## Genesis: Archetype Registry (the master variable)

The project **archetype** conditions the hard-to-reverse dimension floor, research angles, and
**whether/what kind of design stage runs**.

| Archetype | Hard-to-reverse dimension keys (floor) | Mocks set owed |
|---|---|---|
| `web-app` | `language-runtime` `framework` `persistence` `auth` `component-library` `hosting` `monorepo-topology` | yes |
| `mobile-app` | `language-runtime` `framework` `persistence` `auth` `hosting` | yes |
| `conversational-bot` | `language-runtime` `framework` `persistence` `auth` `hosting` | no |
| `backend-api` | `language-runtime` `framework` `persistence` `auth` `hosting` | no |
| `realtime-trading` | `language-runtime` `framework` `persistence` `auth` `component-library` `hosting` `monorepo-topology` | yes |
| `cli-devtool` | `language-runtime` `framework` `persistence` `hosting` | no |
| `data-ml` | `language-runtime` `framework` `persistence` `hosting` | no |
| `desktop-app` | `language-runtime` `framework` `persistence` `auth` `component-library` `hosting` | yes |

`backend-api`, `data-ml`, `conversational-bot` and `cli-devtool` owe nothing beyond DISCOVERY:
BRIEF's ratification (`--mark brief-written`, § Genesis: Brief State) records `design: "skipped"`
directly and `/spec:init` writes no `design` block. `web-app`, `mobile-app`, `realtime-trading`, and
`desktop-app` owe an `APPROVED` `design/mocks/status.json` (`/spec:mocks`) before BRIEF opens
(§ Genesis: Brief State).

## Genesis: Fresh UX Research (method fixed, content researched)

Every project gets a **freshly researched** UX/psychology brief — never a frozen principle list
baked into a template or a command.

The output is `docs/design/research-brief.md` (template: `ux-research-brief.md` via
`spec-paths templates`), and every admitted principle must survive the method:

- **Falsifiable interface rules, not vibes.** Each principle translates to a checkable rule with
  numeric ALWAYS/NEVER bounds where possible, tagged with the screens/archetype conditions it
  applies to.
- **Evidence-tiered.** Each rule carries `evidence: strong | conditional | weak` grounded in the
  research pass — conditional rules state their boundary conditions inline; weak ones are
  hypotheses, admitted only with a `predicts:` line.
- **`predicts:` observable (the telemetry hook).** Every behavioral rule names the observable it
  predicts ("fewer abandons at step 2", "higher first-run completion").
- **Ethics floor (binding, not researched away):** no fake scarcity, no fabricated social proof,
  symmetric choices (declining as easy as accepting), no confirm-shaming. Litmus: a technique
  that only works when the user doesn't notice it is a dark pattern — out, regardless of its
  evidence tier or conversion data.
- **Anti-slop negations.** The brief lists what the candidates must NOT do for this audience (the
  stock patterns fresh generation defaults to).

## Genesis: Executed Assumptions (dependency-adjudicated claims never lock by argument)

**Rule: before an ADR locks, every dependency-adjudicated convention it binds is executed once
against the pinned dependency** — a scratch file in the scaffold (or a throwaway `npx`/equivalent
run pre-scaffold), output observed, file deleted. The ADR cites the executed check and its observed
output in its evidence, alongside the research citations. A convention that cannot be cheaply
executed is recorded as an open risk in the ADR, never silently trusted. The per-feature pipeline
applies the same rule at plan time (`/spec:plan` § Micro-spikes).

## Genesis: Enforcement Handoff to the spec pipeline

The split is **decide vs implement**: `DESIGN_BRIEF` (§ Genesis: Design Stage) *decides* and records
design rules in the rules file; the spec pipeline *implements* them as actual lint/contracts/sweeps
wired to the gate. `HANDOFF` (§ Genesis: State Machine, § Genesis: Conventions Probe Suite) has the
session author `.claude/genesis/init-profile.json` and the driver run `init-gen.js generate` against
it directly landing the terminal `GROUNDED` state with `next: /spec:enforce`. The contract:

- Design rules reach `/spec:enforce` through the `design` block; any other design rule is a written
  host rule. Where no mechanical enforcer fits the stack, the category becomes a Review-Check prose
  rule — never silently dropped.

## Genesis: Day-Zero Skeleton

Land the test + CI skeleton — the enforcement half of the ops ADR, day zero:

- one **example test per declared layer**, and the **e2e harness stub** when the archetype warrants
  one (web/mobile/desktop): installed, one smoke test, wired into a script;
- a **CI workflow** for the repo's forge (detect from the remote; **no remote → ask the user now**:
  connect one, or explicitly record CI-inert in the descriptor) that runs `setupCommand` then
  `gateCommand` on every push/PR;
- the **runtime substrate the archetype implies** — a health/liveness route (bootable archetypes), a
  seed entry point stub, and local service provisioning (compose file or script) wherever the
  scaffold's `.env.example` references services nothing creates;
- the **conventions probe suite** (§ Genesis: Conventions Probe Suite) — one executable test per
  checker-enforceable DECIDED ops-conventions row;
- the **binding subset** (`CLAUDE.md`/`AGENTS.md`, § Genesis: Conventions Probe Suite) — the
  ≤150-line file naming the gate command and the test tree.

**The wireframe is not the skeleton.** `SCAFFOLD` runs its `scaffoldCommand` for every host —
the wireframe the user approved in `/spec:mocks` is a throwaway, never the day-zero skeleton.
`--mark skeleton-landed` refuses on the probe, binding-subset, and zero-day-gate checks above
only; it runs no check against the wireframe.

## Genesis: Conventions Probe Suite

The ops-conventions table (§ Genesis: Ops Conventions ADR) stops being a paragraph nobody re-runs:
at `DECIDE` the session records every row into `.claude/genesis/conventions.json` (template via
`spec-paths templates`, schemaVersion 1) — each row DECIDED or DEFERRED-with-reason, naming the ADR
that carries its rationale. A checker-enforceable DECIDED row (`enforceable: true`) names a `probe`
path under the descriptor's `testTree`; at `SKELETON` the session lands one **executable test per
such row**, at that path, in the host's own test tree. A `DEFERRED` row carries its `reason` in the
JSON instead of a probe.

The **binding subset** — the root `CLAUDE.md` or `AGENTS.md` a fresh agent actually reads before it
writes code — is the primary artifact of this closure, and every ops-conventions ADR is its
rationale appendix (`## Dissents` still required in each). It stays **≤150 lines** and names, as
literals: the `gateCommand`, the `testTree`, the conventions the landed probes pin, and — once
`/spec:enforce` has run — the enforcement manifest's path.

## Genesis: State Machine

`.claude/genesis/status.json` (template via `spec-paths templates`, schemaVersion 3).
`genesis-driver.js` (resolved by `/spec:genesis`) derives the current state on **every invocation**
from `status.json` plus the artifacts actually on disk — never from the enum alone; a mark whose
named artifact vanished is demanded again. The states: `DISCOVERY` → `BRIEF` → `MENUS` →
[`FINALISTS` → `RACE` (driver-only) → `PROBE` → `PICK`, tournament archetypes only, § Genesis:
Tournament of Scaffolds] → `DECIDE` → `SCAFFOLD` (driver-only) → `SKELETON` → `GATE` (driver-only) →
`GATE_RED` | `DESIGN_BRIEF` → [`DESIGN_KIT` → `DESIGN_JOURNEYS` → `AWAITING_DESIGN_APPROVAL`, §
Genesis: Design Stage] → `ROADMAP` → `HANDOFF` → `GROUNDED` (terminal for this stage). No
`status.json` on disk → the driver creates it from the template and prints `DISCOVERY`.

**Checkpoint contract.** Every accepted `--mark` prints, as its last line,
`✅ checkpoint — genesis state saved (<prev> → <next>); safe to /clear and re-run /spec:genesis`.

- `architect`: `pending → decisions-recorded → scaffold-complete`
- `design`: `pending → ratified` (or `skipped`)
- `brief`: `null` until `--mark brief-written`, then `{mocks, legacy, ratifiedAt}`
  (§ Genesis: Brief State)
- `designStage`: `null` until the first derivation past the green gate, then either
  `{ skipped: 'non-visual' | 'non-storybook', at }` or `{ paths, brief, catalog, briefAt }`
  once `design-brief-written` is accepted (§ Genesis: Design Stage)

The roadmap (the driver's `ROADMAP` state, § Genesis: Roadmap Decomposition) deliberately has **no
enum value of its own**: it is verified by artifact existence only — `architect: scaffold-complete`
with no `docs/roadmap/00-overview.md` means the driver resumes at `ROADMAP`.

**BRIEF derivation.** The driver enters `BRIEF` on the first derivation once `discoveryDone` holds
and `!marks.briefWritten` — regardless of any later legacy marks (§ Genesis: Brief State's legacy
resume). **Re-entry verifies the named artifacts physically exist — never trust the phase enum
alone**.

## Genesis: Design Stage

`DESIGN_BRIEF` is derived after the zero-day gate is green (`architect: scaffold-complete`) and
before `ROADMAP`, on a host where `designStageApplies()` holds: the archetype is visual (§ Genesis:
Archetype Registry) **and** the stack descriptor's `designCatalog === 'storybook'`. Any other host —
`data-ml`, `backend-api`, a visual archetype on a non-Storybook catalog — records
`status.designStage = { skipped: 'non-visual' | 'non-storybook', at }` on the first derivation past
the gate and continues straight to `ROADMAP`. `DESIGN_BRIEF` is re-derived whenever
`marks.designBriefWritten` is unset or either `docs/design/brief.md` or
`.claude/genesis/design-paths.json` has vanished from disk.

**The direction round.** Before the Fable dispatch the step prints a `## Direction round` block — `navigation shell`, `layout system`, `color schemes`, `accessibility baseline`, `token tiers`, each with one `(Recommended)` default derived from the archetype. Ask it as one `AskUserQuestion` of up to four (`token tiers` joins only when the kit catalogue offers more than one tier model; otherwise print the `2 (Recommended)` line as a `📌` pick), hand the answers to the dispatch, and the brief carries them as `## Direction` after `## Users and context`. `--mark design-brief-written` refuses while that section is absent from `docs/design/brief.md`. These are the mandatory design forks of § Genesis: Hard-to-Reverse Dimensions; journey approval, client review and `approve` stay human look stops.

**`--mark design-brief-written`** verifies three artifacts, refusing by name on the first failure:
`.claude/genesis/design-paths.json` (schema-complete, `storybook.port` an integer 1024–65535);
`docs/design/brief.md`; and the rules file's `## Intent to pattern`/`## Naming` tables via
`design-contract-check.js`'s `--rules --kit --tokens` overrides. On success the mark records
`status.designStage = { paths, brief, catalog, briefAt }` and the run advances to `DESIGN_KIT`.

**The kit (`DESIGN_KIT`).** Derived once `marks.designBriefWritten` holds and re-derived whenever `marks.kitLanded` is unset or `.storybook/main.*` has vanished from disk.
Printed by `genesis-driver.js` at DESIGN_KIT; never restated here.

**The journeys (`DESIGN_JOURNEYS`).** Derived once `marks.kitLanded` holds and re-derived whenever
`marks.journeysDrawn` is unset or a journey story has vanished from disk. **The beats-file
contract:** at every print the driver derives `<journeys>/<journey>.beats.json` from the seed's own
beats (`{ journey, beatHash, beats: [{ n, sentence, screen, state }] }`), rewriting only a file
whose hash no longer matches the seed. **The primitive ban:** no file under the journeys directory
may import a primitive — by specifier equal to or under `primitivesAlias`, or by relative path
resolving into `primitives` — a journey composes kit composites only; the refusal names the file and
the specifier. `--mark journeys-drawn` proves, via the rebuilt Storybook index, that every journey
carries a story tagged both `journey` and `play-fn` with a passing build.

**The approval stop (`AWAITING_DESIGN_APPROVAL`).** JJ approves the designed set in Storybook itself
— no client gate exists at this stop. The step probes the live index (`storybook.indexUrl` when set,
else `http://127.0.0.1:<port>/index.json`). On success it prints one verified `🎨 ready for review`
URL plus one `journey: <j> → <url>` line per journey in seed order and the composite-state count,
ending the turn on a reply line inviting the one literal word **`approve`** (design.md § Design
Canon's look-stop contract).
Printed by `genesis-driver.js` at `AWAITING_DESIGN_APPROVAL`; never restated here.

Only the literal `approve` runs `--mark design-approved`, which re-verifies the fresh index and
writes `docs/design/approval.json`. No per-file or per-screen hash is recorded — **frozen after
approval, never gated later**. On success the run advances to `ROADMAP`, which reads this record (§
Genesis: Roadmap Decomposition).

A picture round is optional and never a gate: the project's `pictures` block (the contract's
§ Pictures) says how its pictures are made, and `node "$(spec-paths pictures)" --root .` sends one.

## Genesis: Roadmap Decomposition

The two format contracts are templates: `$(spec-paths templates)/roadmap-overview.md` and
`$(spec-paths templates)/roadmap-brief.md` — Read both first. The governing principle: **briefs are
stable intent; specs are perishable execution detail.**

1. **Decompose.** Slice the confirmed goal + ADRs into ordered briefs, each sized to one planning
   session. Slice by **landing unit** (each brief leaves the system green and demonstrable), never
   by layer.
   Wire `depends_on` as a DAG; assign phases (P0 = walking skeleton → first milestone → …); derive
   milestone gates from the discovery success outcome (observable states, not feature lists). Design
   column: `yes` only for user-facing briefs in archetypes whose design stage isn't `none` — and
   every `yes` brief carries a `## Surfaces` fenced block (screen labels + journey edges, names and
   arrows only; the template documents the grammar). Seed the **ops track** with external clocks and
   the **parking lot** with the "Later / Won't-this-time" answers from discovery; promotion out
   requires an amendment ADR applying to the receiving brief.

   **Brief 01 is the first-light brief.** Its Result is one real record through the deployed
   production path — created by a real actor, observed by a person, named in one `First light:`
   header line (`First light: <the one record and where it is observed>`). One spec, one
   acceptance criterion, no feature. Feature briefs start at 02.
2. **Veto window, then milestone gates.** Print the proposed sequence table (brief names, phases, dependencies) and proceed unless vetoed — briefs are markdown and `spec-queue move` reorders later. Ask once, in one `AskUserQuestion`, the milestone gates: they are product commitments.
3. **Write** `docs/roadmap/00-overview.md` + one `NN-{kebab}.md` per brief. **Never write a status
   column** — per-brief status is derived from specs' `brief:` frontmatter (`/spec:status`), not
   tracked.
4. **Self-check (checklist, not a workflow):** no `depends_on` cycles; every ADR is carried by ≥1
   brief's Grounding or is genuinely cross-cutting (note which); no two briefs claim the same scope;
   each milestone gate is satisfiable by the briefs sequenced before it.

**Journey placement.** Decomposition derives from the designed set: once `docs/design/approval.json`
exists (§ Genesis: Design Stage), the ROADMAP step prints one
`approved: <j> — <n> beats · screens: <a, b, c> · story: <id>` line per approved journey read
straight from that record, and `--mark roadmap-written`'s placement check reads its label set from
the record's `screens`. `--mark roadmap-written` requires every declared label to appear in
**exactly one brief**'s `## Surfaces` block — a label placed in zero briefs is unplaced scope, a
label placed in two is duplicated scope, and both refuse by name.

**Agreed and not-contested exclusions land in the Parking lot.** `--mark roadmap-written` also
requires every `confirmed` or `open` `exclusion` ledger row's claim (spec/doctrine/mocks.md §
Provenance Ledger) to appear verbatim under the overview's `## Parking lot` heading, refusing by
claim otherwise. `overridden` rows are never required.

## Genesis: On-disk Handoff (the genesis artifacts)

The genesis artifacts live in `.claude/genesis/` (machine/transient) and `docs/adr/` (durable):

- **`.claude/genesis/brief.md`** — authored from the template `genesis-brief.md`
  (`$(spec-paths templates)/genesis-brief.md`, § Genesis: Discovery Interview): `## Open Dimensions`
  (each line `- <key>: open|constrained [— note]`), `## Research Angles`, `## Picks` (each line
  `- <key>: <label>`).
- **`.claude/genesis/status.json`** — the genesis state machine (§ Genesis: State Machine).
- **`.claude/genesis/tournament/`** (tournament archetypes only, § Genesis: Tournament of Scaffolds)
  — `finalists/<name>/` and `logs/` (deleted once `decided`), `evidence/<name>/probe.json`
  (session-written), `benchmark.json`/`benchmark.md`/`gallery.html` (driver-written, survive
  `decided`).
- **`.claude/genesis/stack-descriptor.json`** — architect's output (template via `spec-paths templates`).
- **`.claude/genesis/conventions.json`** — `DECIDE`'s ops-conventions ledger (template via
  `spec-paths templates`, § Genesis: Conventions Probe Suite).
- **`design/mocks/`** (durable, authored by `/spec:mocks`) — the approved-set workspace BRIEF reads
  directly: `seed.md`, `status.json`, `ledger.md`, `screens/`, and the pulled `design/rounds/`
  notes.
- **`.claude/genesis/design-paths.json`** — `DESIGN_BRIEF`'s session-authored path map (template
  `spec/templates/design-paths.json`, § Genesis: Design Stage): `kit`, `tokens`, `rules`,
  `primitives`, `primitivesAlias`, `journeys`, `storybook`.
- **`<journeys>/<journey>.beats.json`** (durable, driver-written at every `DESIGN_JOURNEYS` print, §
  Genesis: Design Stage) — the derived beats a journey story imports and iterates.
- **`<kit>/<Composite>.stories.*`** and **`<journeys>/<journey>.journey.stories.*`** (durable,
  session-authored at `DESIGN_KIT`/`DESIGN_JOURNEYS`) — the state stories that prove a composite's
  declared states and the journey stories the beats files feed.
- **`.claude/genesis/storybook-static/`** (transient, gitignored) — the Storybook static export
  `runStorybookBuild` rebuilds at every `kit-landed`/`journeys-drawn` attempt.
- **`docs/design/brief.md`** — `DESIGN_BRIEF`'s authored brief (template
  `spec/templates/design-brief.md`, § Genesis: Design Stage).
- **`docs/design/approval.json`** (durable, written once by `--mark design-approved` on JJ's literal
  `approve`, § Genesis: Design Stage) — `schemaVersion`, `approvedAt`, `storybook.port`, per journey
  `{ story, file, beats, screens }`, and `composites: { <Composite>: [<states>] }`.
- **`docs/design/catalog.md`** (durable) — the driver-generated shadcn inventory
  (`catalog-inventory.js`, § Genesis: Design Stage).
- **`.claude/genesis/interview-research/{dimension}.json`** — the woven-loop option menus.
- **`docs/adr/NNNN-*.md`** — architecture/design decision records (template via `spec-paths templates`).
- **`docs/roadmap/`** (durable) — the decomposition that makes the pipeline invocable after setup:
  `00-overview.md` (sequence table, milestone gates, ops track, parking lot) plus one `NN-*.md`
  planning brief per `/spec:plan` unit (templates: `roadmap-overview.md`, `roadmap-brief.md` via
  `spec-paths templates`).
- **`.claude/genesis/init-profile.json`** (session-authored) — `HANDOFF`'s judgment artifact:
  the init profile (`spec/commands/init.md` Phase 4's shape) the driver hands to `init-gen.js
  generate` at `--mark profile-written` (§ Genesis: Enforcement Handoff to the spec pipeline).
