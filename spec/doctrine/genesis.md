---
description: Genesis-stage supplement to the spec pipeline's shared invariants — read by the three greenfield genesis commands, not a workflow entry point
---

# Spec Pipeline: Genesis-Stage Supplement

Genesis-stage supplement — read by `/spec:genesis` (whose driver loop owns discovery through
the `BRIEF` ratification, § Genesis: Brief State), in addition to `shared.md`.

## Genesis: Discovery Interview (the intake posture)

Genesis Phase 1 intake is an **adaptive, consultant-style interview**, not a form and not a
scripted question list — both genesis stages run it this way. The AI is the interviewer, the
user is the client. Open with a reflect-back of `$ARGUMENTS` — what you think is being built,
for whom, the core job it does — then follow the answer: depth is earned by signal (hesitation,
vagueness, a high-stakes area), never spent on a fixed script. There is no probe cap and no
fixed batch list; order, depth, and follow-ups are the session's judgment, round by round.

**The coverage audit is the one fixed structure.** Ten keys the model cannot derive because
they are invisible unless asked — `payer`, `tenancy`, `data-sensitivity`, `residency`,
`ai-use`, `unattended`, `integrations`, `scale-outage`, `vendor-budget`, `offline-mobile` —
each recorded in `.claude/genesis/brief.md`'s `## Coverage` block as `- <key>: covered | dark |
n/a — <one line in the user's words>`. The session audits silently after every answer (an
answer can close a key nobody asked about directly) and asks the highest-stakes still-`dark`
key next, phrased in plain language that passes core § Question Style's ten-second cold test —
never the key's identifier. Discovery ends when no key is `dark`; a user who declines a key is
recorded `n/a — declined: <reason>`, which counts as closed. A key a coverage answer already
closes ("must use <vendor>") is written `constrained` in `## Open Dimensions` and never asked
again as a fork (§ Genesis: Hard-to-Reverse Dimensions).

**The brief is the interface.** `.claude/genesis/brief.md` is authored from the template
`genesis-brief.md` (`$(spec-paths templates)/genesis-brief.md`) with exactly six `## ` sections
in order: `What I think you're building`, `Coverage`, `Non-goals`, `Open Dimensions`,
`Research Angles`, `Picks`. After **every** `AskUserQuestion` round the session rewrites the
file and prints its `What I think you're building` + `Coverage` sections to the console
verbatim — the running, readable record of what Claude understands, corrected in place as the
user answers. There is no separate sign-off question: the finished page IS the discovery
brief, because it has already been re-rendered and corrected after every answer a dedicated
sign-off would only repeat.

**Archetype and hand-off.** `discovery-done` requires a `- archetype: <registry key>` line in
`## Picks` (§ Genesis: Archetype Registry) — the seed's primary-surface answer already settles
it, so it is recorded here rather than re-asked at `MENUS`. The DISCOVERY step's closing text
hands off accordingly: an archetype whose registry row owes a mocks set is told `next: run
/spec:mocks in this repo (seed → shapes → wireframes → theme → skin → review → approved), then
--mark brief-written` — or, when `design/mocks/status.json` is already `APPROVED`, `an approved
set exists — --mark brief-written`; an archetype that owes no set is told `--mark
brief-written` directly. There is no throwaway sketch step — the first rendered artifact this
pipeline produces is a real mock (or, for a non-visual archetype, none at all), never a
disposable HTML round.

- **Escape hatch on every round.** "Other / not sure" is the one open lane (and the tool's
  free-text channel) — it counters closed-set option bias and is the signal that earns a
  follow-up. Phrase every option neutrally; no leading or double-barreled options.
- **Non-goals are recorded, not parked.** Adjacent features the user rules out go into `##
  Non-goals` as soon as they surface, marked In / Later / Won't-this-time — written exclusions
  focus the build; unwritten ones get assumed in.

**The woven loop (research-backed rounds).** The interview is *not* "user provides everything, AI
summarizes." A round is **cold** (user-contextual — the coverage audit, non-goals, taste; the
session authors these itself) or **research-backed** (stack, framework, component library,
visual-trend — the option menu is researched **live** from the user's last answer). A
research-backed round:

1. The user's last answer, or a coverage answer, opens one or more dimensions. The command calls
   **`wf-research`** — research agents only, no proposers — with `args` = paths/keys/booleans
   (`stage`, `dimensionKeys`, `briefPath`, `contextPaths`). Batch every dimension
   one answer opens into a single parallel call. Cross-cutting angles available to any archetype —
   `scope-discipline` (what to include vs deliberately exclude), `competitive-teardown`,
   `accessibility`, and the locale bundle (`i18n-rtl`, `locale-formatting`, `cultural-color`,
   `locale-norms`) — are switched on by the audience scope, not the archetype, and fold into the
   same call.
2. It returns one **option menu per dimension** — 2–4 current options, ranked recommended-first,
   each carrying an honest `tradeoff`, a `because` (the coverage keys and answers that drove this
   option's rank), a `priced` consequence at the brief's stated scale (a concrete monthly figure
   and its jump point, a migration cost, or the honest `n/a — no number in the brief`), a recency
   stamp grounded in sources, an `is_minority` flag preserving any contrarian option (MAINTAINED
   DISSENT — carried forward into `## Dissents` at decision time), and a required
   `why_recommended` (one line: why rank 1 wins for THIS project — the stated reason behind the
   ranking, not just the ranking itself).
3. The command writes each menu to `.claude/genesis/interview-research/{dimension}.json` (stamping
   `fetchedAt` itself — the workflow can't), then presents an `AskUserQuestion` built **from the
   menu**: options recommended-first, each description built as `tradeoff` · `because` · `priced`
   · "current as of `<fetchedAt>`", neutral phrasing, the escape hatch, rank 1 labeled
   "(Recommended)" with `why_recommended` as the stated reason. The user reacts to an informed,
   priced menu, never a blank field; the pick seeds the next round.

**Model placement in the loop:** **Sonnet** builds the menu (research + option synthesis, incl.
`because`/`priced`); currency is executed by `registry-check.js`, which the driver runs on every accepted menu,
over each option's `packages` — a version absent from its registry never enters a menu;
unreachable registries stamp `unverified`, never block; **Opus** (the session) curates which
2–4 options ship, orders them, enforces neutral phrasing, and owns the write. This holds the
pipeline doctrine: Sonnet research, a deterministic registry check, Opus session/curation.

**Provenance.** Every shipped option's `sources` + `fetchedAt` live in
`interview-research/{dimension}.json`; the *picked* option's provenance is copied into the
brief's `## Picks` and flows into the ADR rationale/citations. A research call that returns
nothing in good time falls back to a model-knowledge menu stamped `unverified` — `because` and
`priced` are then the session's own lines, marked `(unverified)` — the loop never blocks.

**Discovery→Decision bridge (no redundancy).** Split by reversibility: `wf-research` *elicits*
(today's options, so the user picks informed); the Decision Record (§ Genesis: Decision Record
(one proposer)) *decides* the hard-to-reverse forks directly, from the same menus, no second
reader. A dimension settled in the woven loop is written **`constrained`** in `## Open Dimensions`,
and its `interview-research/*.json` is reused as `contextPaths` for any later dimension instead of
being re-researched. A settled dimension's ADR may still carry a `minority_position` sourced from
the menu's non-picked ranks, but it is never reopened as a hard fork.

**Discovery is product / user / business / legal only — never organizational.** Team skill,
headcount, ownership, ops staffing are never asked: Claude is always the implementer. "Team skill"
(the real-world #1 stack driver) collapses to a silent default — favor boring, typed, testable
stacks Claude implements reliably — applied as a Phase-2 tiebreaker, not a question.

## Genesis: Brief State

`BRIEF` sits between `DISCOVERY` and `MENUS` in the driver loop (§ Genesis: State Machine) —
entered once `discoveryDone` records an archetype and no `marks.briefWritten` exists yet,
regardless of any later legacy marks. It is the ratification gate: nothing genesis decides
past this point is decided about a product the user has not already seen, corrected, and
approved on real screens (or, for a legacy run, on its existing explore/design artifacts).

**Precondition (archetypes that owe a mocks set only, § Genesis: Archetype Registry).**
`web-app`, `mobile-app`, `realtime-trading`, and `desktop-app` must show
`design/mocks/status.json` at `state: "APPROVED"` and `gateVerdict(design/mocks/ledger.md)`
(spec 06's `lib/mocks-ledger.js`, read directly — never re-implemented here) at `open`, before
`--mark brief-written` is even attempted; a refusal names the blocking state or the ledger row
and tells the session to `run /spec:mocks`. `backend-api`, `data-ml`, `conversational-bot`, and
`cli-devtool` never owe this precondition — they proceed straight to ratification.

**Ratification (`--mark brief-written`), tiered by archetype:**

- `backend-api` / `data-ml` — nothing beyond DISCOVERY; the mark records `design: "skipped"`.
- `conversational-bot` / `cli-devtool` — a one-page `docs/design/doctrine.md` (voice/persona or
  TUI doctrine, `## Dissents` non-empty) plus `.claude/genesis/design-rules.json` passing the
  retained `designRulesCheck` (rules array, category enum, grounding enum — an empty array is
  allowed).
- `web-app` / `mobile-app` / `realtime-trading` / `desktop-app` — both of the above, plus a
  `## Dissents` naming every composed-but-unpicked direction from
  `design/mocks/status.json.directions`, and `design/tokens.css` present (THEME already wrote
  it — BRIEF checks presence only, never re-authors it).

**Doctrine (never values).** `docs/design/doctrine.md` carries taste-only rulings — postures,
habits, judgments that genuinely resist encoding — plus a required `## Dissents` section. Any
sentence naming a size, step, ratio, weight, tracking, duration, or specific color belongs in a
token, not doctrine — a value living only in prose is the defect this state guards against.
Tag every ruling's grounding (shared § Design Authoring Contracts, its "Grounded vs taste"
rule): `grounded` (binds even against an explicit mock) or `taste` (yields to one); default to
`taste` unless the ruling names an external anchor. The driver checks: the file exists, is
≤120 lines, carries `## Dissents` followed by ≥1 non-blank line, and — for archetypes that owe
a mocks set — that every key of `design/mocks/status.json.directions` other than `status.theme`
appears as a substring in the Dissents body (a legacy run with no mocks status falls back to
whatever rejected-direction record its existing design artifacts still carry, when one exists,
else no name is required).

**Design rules.** `.claude/genesis/design-rules.json` (template via `spec-paths templates`):
each rule carries a `targetCategory` **enum only** (§ Genesis: Enforcement Handoff),
`appliesTo`/`exemptGlobs`, `severity`, `rationale`, and `grounding` (`grounded` | `taste`) —
never a tool name; `/spec:enforce` owns the category→enforcer selection at runtime.
Non-visual archetypes may carry an empty `rules` array.

**On success:** `marks.briefWritten`, `status.brief = {mocks: "design/mocks/status.json" |
null, legacy: false|true, ratifiedAt: "<ISO>"}`, and `status.design = "ratified"` (or
`"skipped"` for `backend-api`/`data-ml`).

**Legacy resume.** A `status.json` with `marks.menusDone` and no `marks.briefWritten` derives
BRIEF with a step text opening `legacy: explore/design artifacts accepted in place of a mocks
set`. `--mark brief-written --legacy` skips the mocks precondition entirely (never the
ratification checks above) and records `brief.legacy: true`; every downstream legacy mark stays
valid, so the run lands on its real next state — MENUS, DECIDE, SCAFFOLD, SKELETON, GATE,
ROADMAP, or HANDOFF — after this one mark, never a forced re-run of MENUS.

**Components check relocates.** `--mark skeleton-landed` (archetypes that own a mocks set)
additionally requires `design/components.json` to exist and `components-check.js` to exit 0 —
the session seeds this manifest at SKELETON from the approved set's primitives, until spec 11's
extraction lands.

## Genesis: Tournament of Scaffolds

Between `MENUS` and `DECIDE`, **tournament archetypes** (`web-app`, `realtime-trading`,
`backend-api`, `mobile-app`, `desktop-app`) race real finalist stacks instead of deciding on
argument alone: `FINALISTS` → `RACE` (driver-only) → `PROBE` → `PICK`. Every other archetype
derives `MENUS → DECIDE` unchanged and writes no `.claude/genesis/tournament/`; a skipped race
(`--mark finalists-skipped`) records `tournament.skipped` and advances the same way.

**FINALISTS.** The session composes 2–3 finalist stack combinations from the menus (a
finalist is a combination the session composes, never a single option); at least one must
equal the brief's current `## Picks` on every key it names (the incumbent), so the race stays
consistent with the pick already in view. The step is a go/no-go line, printed before any
spend: the archetype's probe tasks — their table lives in the driver
(`genesis-driver.js`), never restated here, so the two can't drift apart — the two-retry cap,
and `cost: roughly one mini-build per finalist (scaffold + gate + boot + probe slice)`, plus
the last measured token figure once one exists.

**RACE (driver-only).** For each named finalist the driver scaffolds it for real into
`.claude/genesis/tournament/finalists/<name>/`, runs its zero-day gate, and boots it to
readiness through `smoke.sh`'s existing boot contract, recording exit codes and the boot
sentinel. A finalist whose scaffold fails is recorded and spent no further; a finalist with a
recorded race is never re-raced.

**PROBE.** The session builds one thin probe slice per surviving finalist with Sonnet workers,
under a hard two-retry cap per task, and records `tournament/evidence/<name>/probe.json`
(tokens are the harness-reported figure the session copies in, never estimated). `--mark
probe-done` triggers the driver to re-run gate + boot for each finalist post-probe and
assemble `tournament/benchmark.json`/`benchmark.md` (the finalists side by side: scaffold/gate
/boot pre and post, probe pass rate, retries, tokens, screenshots) and
`tournament/gallery.html`.

**PICK.** **Executed evidence informs the user's pick; it never makes it** — two finalists
that both pass are ranked by the coverage answers, stated, never by the numbers alone. The
user picks by rewriting the brief's `## Picks` to the winner's labels; `--mark picked` matches
it against exactly one finalist's picks.

**Re-scaffold clean.** The probe slice is benchmark code, built under retry caps with no spec
and no review — it must never become the foundation everything later inherits. `decided`
re-scaffolds the winner clean into the project root (its `scaffoldCommand` run exactly as a
non-tournament `SCAFFOLD` would) and deletes the raced copies (`tournament/finalists/`,
`tournament/logs/`) once an ADR cites `tournament/benchmark.md` as evidence; `benchmark.json`,
`benchmark.md`, `gallery.html`, and `evidence/` survive as the decision record's evidence
appendix.

**Artifacts.** `spec/templates/finalists.json` (the template the session composes a run's
`finalists.json` from — 2–3 entries, each `{name, picks, scaffoldCommand, gateCommand,
bootCommand, readyCheck}`); `tournament/evidence/<name>/probe.json` (session-written, one
entry per expected task); `tournament/benchmark.json`/`.md` and `tournament/gallery.html`
(driver-written). § Genesis: On-disk Handoff lists the full roster alongside the
`tournament/` directory.

## Genesis: Decision Record (one proposer)

`AskUserQuestion` **cannot run inside a workflow**, so the commands never nest it — the session
owns every question and every file write; `wf-research` is a callable subroutine that returns
research only, never a decision.

The session is the proposer. Input: every `interview-research/{dimension}.json` on disk (plus any
partitioned second leg, below); output: one ADR per hard-to-reverse dimension, `## Options
considered` copied from the menu's ranked options, `## Decision` the pick, `## Dissents` per the
rule below.

A hard fork — two menu options within one rank of each other, or a user hesitation signal — is an
`AskUserQuestion`: options verbatim from the menu, `tradeoff` in each description, rank 1 first
labeled "(Recommended)" with `why_recommended` as the reason. Dismissed → STOP (shared § Decisions),
never invent the declined answer.

`## Dissents` carries every non-picked ranked option, every `is_minority` option, and every
user-rejected option — MAINTAINED DISSENT survives the collapse: a correct minority view is
recorded, never silently dropped.

A second perspective on a hard fork is a second `wf-research` call with a **different**
`dimensionKeys` slice (e.g. `hosting-cost-shape` beside `hosting`) — a *partitioned-evidence*
research leg, never a second agent reading the same brief. Deliberation over identical evidence
herds; partitioned evidence is the shape that measured gains.

## Genesis: Ops Conventions ADR

Write the ops-conventions ADR (`docs/adr/NNNN-operational-conventions.md`, one ADR, one table).
Robust software is mostly conventions-under-load, and in a greenfield repo nobody else ever
decides them — `/spec:init` can only extract what exists. Rows (a floor, not a ceiling — add
any convention-under-load the research surfaces): **error taxonomy** (the error shape/base
classes and user-facing vs internal split — binding for **every process entrypoint** (workers,
queue handlers, seeds, scheduled/sync tasks), never only the serving path, and exception text
persisted anywhere — DB columns, event payloads, stdout — goes through the taxonomy, never a
raw exception string; measured 3-for-3 across audited hosts: the request path got the
discipline, every background path hand-rolled its own), **logging** (structured or not, shape,
what is never logged — same every-entrypoint scope: a worker or seed script rolling its own
logger without the redaction list violates this row, it is not a local style choice),
**naming & identifiers** (casing and plurality for tables/columns/indexes/
constraints; primary-key strategy AND id-minting — one generator module + prefix registry;
per-surface casing ownership — DB vs wire vs logs vs analytics tags — with the boundary
stated, and per surface the file globs that constitute it plus its decided spelling
exemplars, so a later reader can tell a boundary crossing from a typo),
**wire representations** (decided once at the contracts seam: non-JSON-native types
such as bigint/decimal money, timestamp form on the wire — UTC-only vs offsets tolerated —
and the discriminator field name), **cross-plane constants** (any literal referenced on
both sides of a language/process seam — env var names, header and auth-scheme names,
queue/topic names, redaction key lists — lives in the generated contracts surface or
carries a test that pins both sides to one source; a value mirrored by hand and "kept in
sync by comment" is a silent-outage class, banned; checker-enforceable — the same seam the wire row decides,
applied to identifiers instead of types), **env/config management** (file layout, secrets never in
git, the sanctioned secret store), **CI** (the gate runs on every push — wired at scaffold time,
§ Genesis: Day-Zero Skeleton), **background/async work** (in-process, queue, or none-in-v1), and
**success-metric instrumentation** (the discovery measurement pick — the analytics seam, or "not
measured in v1"). These are boring-default rows the session fills from the research;
`AskUserQuestion` only on a genuine fork (e.g. a paid observability vendor, or the concrete id
scheme — ULID vs nanoid and the prefix table are a product-owner pick; that one generator module
exists is not). A DECIDED row in a category `/spec:enforce` can mechanize is stated
**checker-enforceable** — no taste clauses ("strict plural", never "plural where natural reads
better"); the rejected taste variant goes in Dissents. Each row is DECIDED or DEFERRED-with-reason —
same ledger discipline as the design canon. The rows above are samples of one **generating question**
— *"what will two context-free executors, weeks apart, decide differently unless a row
decides it now: every value class crossing a surface boundary, every name a second writer
will mint, every operational behavior a spec will assume but never state?"* After filling
the dictated rows, run one **derive pass** against that question — walk the research and
the archetype's value-crossing boundaries (its API seams, storage, logs, external
integrations: the same axis the casing-ownership row enumerates) and propose rows the
floor missed; derived rows follow the same fill discipline as dictated ones (boring
defaults, `AskUserQuestion` only on a genuine fork). Then the **coverage check**: a
second same-session read of the finished table against the generating question, whose
only outputs are added rows or nothing — it writes no certification and asks nothing
new. Both passes are **advisory** — the coverage checker shares the deriver's blind
spots (same-model correlation, the reason review doctrine forbids same-context
verification), so derivation can add rows but its silence never certifies completeness.

## Genesis: Hard-to-Reverse Dimensions (always escalate via AskUserQuestion)

A hard fork on any of these — two menu options within one rank of each other, or a user hesitation
signal — is a **mandatory** `AskUserQuestion` (verbatim, recommended first), never synthesized
away. Constrained dimensions (user already chose, or settled in the Phase-1 research-woven loop)
skip the fork.

- **architect:** persistence model · framework · monorepo topology · primary
  language/runtime · auth approach · component library · deployment target.
- **design:** component library · token tier count · accessibility baseline · doctrine
  adjective conflicts (the core taste direction) · **navigation shell** (sidebar / top-nav /
  tabs — the app's structural skeleton) · **layout system** (breakpoints, grid, container
  widths) · **color schemes** (light / dark / system — token structure is hard to retrofit).

### Derived dimensions (from coverage answers)

The registry floor (§ Genesis: Archetype Registry) always applies; the rows below are **added
on top of it**, never substituted for it, mapped directly from the coverage audit's answers
(§ Genesis: Discovery Interview). A dimension a coverage answer already closes ("must use
`<vendor>`") is written `constrained` in `## Open Dimensions` and never asked as a fork.

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
**whether/what kind of design stage runs**. Establish it (and the locale/audience scope) first in
architect intake. Locale composes *on top* of archetype (a Japanese mobile app and a Japanese web
app share locale angles, differ in surface). Illustrative — dimension keys are the fixed floor;
research candidates within each key are verified against current ecosystems at research time,
never named here:

| Archetype | Hard-to-reverse dimension keys (floor) | Mocks set owed |
|---|---|---|
| `web-app` | `language-runtime` `framework` `persistence` `auth` `component-library` `hosting` `monorepo-topology` | yes |
| `mobile-app` | `language-runtime` `framework` `persistence` `auth` `hosting` | yes |
| `conversational-bot` | `language-runtime` `framework` `persistence` `auth` `hosting` | no — voice/persona doctrine |
| `backend-api` | `language-runtime` `framework` `persistence` `auth` `hosting` | no |
| `realtime-trading` | `language-runtime` `framework` `persistence` `auth` `component-library` `hosting` `monorepo-topology` | yes · density doctrine |
| `cli-devtool` | `language-runtime` `framework` `persistence` `hosting` | no — TUI doctrine |
| `data-ml` | `language-runtime` `framework` `persistence` `hosting` | no |
| `desktop-app` | `language-runtime` `framework` `persistence` `auth` `component-library` `hosting` | yes |

`backend-api` and `data-ml` owe nothing beyond DISCOVERY: BRIEF's ratification (`--mark
brief-written`, § Genesis: Brief State) records `design: "skipped"` directly and `/spec:init`
writes no `design` block. `conversational-bot` and `cli-devtool` owe a one-page doctrine plus
category-only rules but no mocks set. `web-app`, `mobile-app`, `realtime-trading`, and
`desktop-app` owe an `APPROVED` `design/mocks/status.json` (`/spec:mocks`) before BRIEF opens
(§ Genesis: Brief State).

## Genesis: Fresh UX Research (method fixed, content researched)

Every project gets a **freshly researched** UX/psychology brief — never a frozen principle list
baked into a template or a command. Anchoring to old UX psychology is the failure mode this
section exists to prevent: a list that was current when the plugin shipped is training-data
folklore two model generations later. What is **fixed** is the *method*; what is **researched
live** (via `wf-research`, UX dimension keys, web-enabled Sonnet) is the *content* — current
evidence for this app's archetype, audience, and domain.

The output is `docs/design/research-brief.md` (template: `ux-research-brief.md` via
`spec-paths templates`), and every admitted principle must survive the method:

- **Falsifiable interface rules, not vibes.** Each principle translates to a checkable rule with
  numeric ALWAYS/NEVER bounds where possible ("primary action reachable in ≤1 tap from the core
  screen"), tagged with the screens/archetype conditions it applies to. The bar is
  **verifiable-by-a-stranger**: a checker who was never in the room must be able to look at a
  screen and say pass or fail. A principle that cannot be phrased that way is recorded as
  context, never as a rule — unencoded taste is advisory by definition and will be violated.
- **Evidence-tiered.** Each rule carries `evidence: strong | conditional | weak` grounded in the
  research pass (replication status, effect size, domain match) — conditional rules state their
  boundary conditions inline; weak ones are hypotheses, admitted only with a `predicts:` line.
- **`predicts:` observable (the telemetry hook).** Every behavioral rule names the observable it
  predicts ("fewer abandons at step 2", "higher first-run completion"). This is what lets a host
  with telemetry later promote a rule to standing doctrine or retire it on evidence — the design
  analog of the scaffold ledger's promote/retire condition. No telemetry yet → the field still
  ships; it costs one line and makes the rule falsifiable on the day telemetry exists.
- **Ethics floor (binding, not researched away):** no fake scarcity, no fabricated social proof,
  symmetric choices (declining as easy as accepting), no confirm-shaming. Litmus: a technique
  that only works when the user doesn't notice it is a dark pattern — out, regardless of its
  evidence tier or conversion data.
- **Anti-slop negations.** The brief lists what the candidates must NOT do for this audience
  (the stock patterns fresh generation defaults to) — researched per project, since slop drifts
  with the generation.

Mechanizable rules flow into `design-rules.json` categories at BRIEF's ratification mark
(§ Genesis: Brief State); the rest bind every `/spec:mocks` session and every later
mock-authoring or build session — not by being read and remembered, but by being checked. A
rule that carries a `renderCheck` is executed by `render-rules.js` over the render inventory
(shared § Design Canon), never walked by a model; the **rule-checklist pass** runs during
`/spec:mocks`' review, which precedes `design-rules.json` and so has no manifest to execute
yet: a checker walks the admitted rules against each candidate before approval, citing rule
IDs. The falsifiable phrasing above is what makes both possible.

## Genesis: Executed Assumptions (dependency-adjudicated claims never lock by argument)

Genesis decisions are verified by argument — research citations, the session's own reading
of the research menus on disk, user rulings. That is the right bar for taste and
architecture forks, and the **wrong** bar for any claim a third-party dependency
adjudicates: naming/format conventions the dependency validates, cron/schedule strings,
config keys, DSL fragments, version-pinned API shapes.
Those are falsifiable in one executed line, and no volume of reading substitutes: a host
once bound a naming convention its own same-day-pinned dependency rejects at runtime —
argued through and research-backed, and wrong; the app could never boot.

**Rule: before an ADR locks, every dependency-adjudicated convention it binds is executed
once against the pinned dependency** — a scratch file in the scaffold (or a throwaway
`npx`/equivalent run pre-scaffold), output observed, file deleted. The ADR cites the executed
check and its observed output in its evidence, alongside the research citations. A convention
that cannot be cheaply executed is recorded as an open risk in the ADR, never silently
trusted. The per-feature pipeline applies the same rule at plan time (`/spec:plan`
Phase 1.5's shape-triggered micro-spike); genesis is where it matters most, because init
distills ADRs into binding doctrine with no downstream re-verification.

## Genesis: Enforcement Handoff to the spec pipeline

The split is **decide vs implement**: `BRIEF` (§ Genesis: Brief State) *decides* and records
design rules; the spec pipeline *implements* them as actual lint/contracts/sweeps wired to the
gate. One enforcement brain, and it lives downstream —
`/spec:enforce` (which `/spec:init` invokes at the end of bootstrap). For a greenfield repo,
the grounding step this brain depends on runs earlier still: `HANDOFF` (§ Genesis: State
Machine, § Genesis: Conventions Probe Suite) has the session author
`.claude/genesis/init-profile.json` and the driver run `init-gen.js generate` against it
directly — the same generator `/spec:init` Phase 5 runs, invoked here instead of by that
command — landing the terminal `GROUNDED` state with `next: /spec:enforce`. `/spec:init`
stays the brownfield entry and the regeneration owner (`--refresh`); re-running it on a
genesis-grounded repo is a refresh, not first-time bootstrap. The contract:

- `design-rules.json` rules carry a `targetCategory` **enum only** — `color | typography | i18n |
  structure | a11y | density | layout` — **never a tool name** — plus a `grounding` (`grounded` | `taste`, shared
  § Design Authoring Contracts, its "Grounded vs taste" rule; mechanizable closure rules are `grounded`), which records whether the rule binds
  against an explicit mockup or yields to it. `/spec:enforce` folds these into its language-neutral
  enforcement taxonomy and owns the single category→enforcer selection per detected stack, chosen
  at runtime (discover-against-live-sources then verify-it-runs), never from a hardcoded mapping.
  Where no mechanical enforcer fits the stack, the category becomes a Review-Check prose rule —
  never silently dropped. Category-only tagging is what keeps the handoff robust to a stack swap:
  an engine pre-tagged here would break the moment the stack changed.
- `/spec:doctor` warns when a design-rules category has **no enforcer** on the current stack (the
  early-detection benefit), and recommends `/spec:enforce` — without any plugin file naming a tool.

## Genesis: Day-Zero Skeleton

Land the test + CI skeleton — the enforcement half of the ops ADR, day zero:

- one **example test per declared layer** (trivial but real — it exercises the runner and
  shows the convention the `tests`-kind agent will follow), and the **e2e harness stub** when
  the archetype warrants one (web/mobile/desktop): installed, one smoke test, wired into a
  script — so `/spec:build`'s TDD never meets a repo where the harness itself is missing;
- a **CI workflow** for the repo's forge (detect from the remote; **no remote → ask the
  user now**: connect one, or explicitly record CI-inert in the descriptor — a written
  workflow with no remote executes zero times, and "authored but never activated" is the
  failure class this stage must not seed; `/spec:init`'s manifest check verifies whichever
  was chosen) that runs `setupCommand` then `gateCommand` on every push/PR. An enforcement
  rule that only runs on a developer's machine is advisory, not enforced;
- the **runtime substrate the archetype implies** — a health/liveness route (bootable
  archetypes), a seed entry point stub, and local service provisioning (compose file or
  script) wherever the scaffold's `.env.example` references services nothing creates. These
  are what `/spec:init`'s runtime block, verify skill, and smoke leg will bind to — cheaper
  to land here, while the scaffold tool's conventions are hot, than to retrofit at init;
- the **conventions probe suite** (§ Genesis: Conventions Probe Suite) — one executable test
  per checker-enforceable DECIDED ops-conventions row, landed in the same test tree these
  other skeleton tests exercise, so the gate wired above runs the conventions forever;
- the **binding subset** (`CLAUDE.md`/`AGENTS.md`, § Genesis: Conventions Probe Suite) — the
  ≤150-line file naming the gate command and the test tree, the primary artifact a fresh agent
  actually reads.

## Genesis: Conventions Probe Suite

The ops-conventions table (§ Genesis: Ops Conventions ADR) stops being a paragraph nobody
re-runs: at `DECIDE` the session records every row into `.claude/genesis/conventions.json`
(template via `spec-paths templates`, schemaVersion 1) — each row DECIDED or
DEFERRED-with-reason, naming the ADR that carries its rationale. A checker-enforceable DECIDED
row (`enforceable: true`) names a `probe` path under the descriptor's `testTree`; at
`SKELETON` the session lands one **executable test per such row**, at that path, in the host's
own test tree — the same tree `## Genesis: Day-Zero Skeleton` already wires into the gate, so
the zero-day gate that runs on every push executes the conventions forever. A `DEFERRED` row
carries its `reason` in the JSON instead of a probe; deferral is a recorded choice, never a
silent gap.

The **binding subset** — the root `CLAUDE.md` or `AGENTS.md` a fresh agent actually reads
before it writes code — is the primary artifact of this closure, and every ops-conventions ADR
is its rationale appendix (`## Dissents` still required in each). It stays **≤150 lines** and
names, as literals: the `gateCommand`, the `testTree`, the conventions the landed probes pin,
and — once `/spec:enforce` has run — the enforcement manifest's path. Admission checks
existence and size only, never content quality; content is the session's judgment, the same
decide-vs-mechanize split § Genesis: Enforcement Handoff to the spec pipeline draws.

## Genesis: State Machine

`.claude/genesis/status.json` (template via `spec-paths templates`, schemaVersion 3). The
architect stage is now driver-owned: `genesis-driver.js` (resolved by `/spec:genesis`) derives
the current state on **every invocation** from `status.json` plus the artifacts actually on
disk — never from the enum alone; a mark whose named artifact vanished is demanded again. The
states: `DISCOVERY` → `BRIEF` (mark-driven, § Genesis: Brief State) → `MENUS` →
[`FINALISTS` → `RACE` (driver-only) → `PROBE` → `PICK`, tournament archetypes only, § Genesis:
Tournament of Scaffolds] → `DECIDE` → `SCAFFOLD` (driver-only) → `SKELETON` → `GATE`
(driver-only) → `GATE_RED` | `ROADMAP` → `HANDOFF` → `GROUNDED` (terminal for this stage).
`HANDOFF` is itself a judgment step — the session authors `.claude/genesis/init-profile.json`
and the driver runs `init-gen.js generate` against it (§ Genesis: Enforcement Handoff to the
spec pipeline) — never the terminal print itself; `GROUNDED` is reached only once that run
exits 0. No `status.json` on disk → the driver creates it from the template and prints
`DISCOVERY`; no `brief.md` on disk → the DISCOVERY step names `genesis-brief.md`
(`$(spec-paths templates)/genesis-brief.md`) as the source.

**Checkpoint contract.** Every accepted `--mark` prints, as its last line, `✅ checkpoint —
genesis state saved (<prev> → <next>); safe to /clear and re-run /spec:genesis`; every step's
text opens with `Read only:` followed by the files that step needs — never the whole
`.claude/genesis/` directory. This is what makes a full genesis safe to run across as many
`/clear`s as it needs: state lives on disk, never in chat context.

- `architect`: `pending → decisions-recorded → scaffold-complete` (driven by the marks above,
  never a command's own phase tracking)
- `design`: `pending → ratified` (or `skipped`); a legacy file may still carry
  `doctrine-drafted` or `tokens-landed` — § Genesis: Brief State's legacy resume
- `brief`: `null` until `--mark brief-written`, then `{mocks, legacy, ratifiedAt}`
  (§ Genesis: Brief State)

The roadmap (the driver's `ROADMAP` state, § Genesis: Roadmap Decomposition) deliberately has
**no enum value of its own**: nothing downstream gates on it (design and init don't depend on
it), so it is verified by artifact existence only — `architect: scaffold-complete` with no
`docs/roadmap/00-overview.md` means the driver resumes at `ROADMAP`.

**BRIEF derivation.** The driver enters `BRIEF` on the first derivation once `discoveryDone`
holds and `!marks.briefWritten` — regardless of any later legacy marks (§ Genesis: Brief
State's legacy resume). A legacy `status.json` carrying `marks.menusDone` and no
`marks.briefWritten` derives `BRIEF` too, with its step text opening `legacy:` — the run
resumes there with its existing explore/design artifacts rather than being forced back through
`MENUS`. `/spec:init` is blocked when `design` is a legacy partial value
(`doctrine-drafted`/`tokens-landed`); it proceeds on `ratified` or `skipped`, and is merely
warned when `design` is still `pending`. **Re-entry verifies the named artifacts physically
exist — never trust the phase enum alone** (a phase can be set while a side-effect was rolled
back).

## Genesis: Roadmap Decomposition

Runs immediately after the zero-day gate is green, **while the interview, decision, and ADR
context is still hot** — this decomposition is half-formed in the session already; a later
session would pay full price to reconstruct it worse. The roadmap is what makes the pipeline
invocable after setup: without it, genesis ends and the user has no unit to hand `/spec:plan`.

The two format contracts are templates: `$(spec-paths templates)/roadmap-overview.md` and
`$(spec-paths templates)/roadmap-brief.md` — Read both first. The governing principle: **briefs
are stable intent; specs are perishable execution detail.** Briefs cite ADRs (also stable) and
are hydrated into specs lazily, one `/spec:plan` session at a time, when "Current state" can be
written against real code. Never pre-plan the whole roadmap into specs.

1. **Decompose.** Slice the confirmed goal + ADRs into ordered briefs, each sized to one
   planning session (1–4 specs; a brief whose Scope can't be told in ~1 page splits). Slice by
   **landing unit** (each brief leaves the system green and demonstrable), never by layer.
   **An ops-conventions row records a choice, never scaffolds its mechanism:** the
   facade/runtime an ops decision implies (queue wrapper, enqueue helper, analytics seam)
   lands in the same brief as its **first consumer** — never as a standalone infrastructure
   brief, and never wired into boot for an empty registry (measured: two audited hosts each
   carried a well-tested dead queue facade every review re-flagged).
   Wire `depends_on` as a DAG; assign phases (P0 = walking skeleton → first milestone → …);
   derive milestone gates from the discovery success outcome (observable states, not feature
   lists). Design column: `yes` only for user-facing briefs in archetypes whose design stage
   isn't `none` — and every `yes` brief carries a `## Surfaces` fenced block (screen labels +
   journey edges, names and arrows only; the template documents the grammar) so the design
   atlas can render the whole-product journey and its gaps. Seed the **ops track** with external clocks (OAuth registrations, hosting
   provisioning, partner asks) and the **parking lot** with the "Later / Won't-this-time"
   answers from discovery — recorded so they stop leaking into briefs; promotion out requires an amendment
   ADR applying to the receiving brief.
2. **Confirm the sequence.** One `AskUserQuestion` round presenting the proposed sequence table
   (brief names, phases, dependencies, milestone gates) before writing files. Dismissed → STOP.
3. **Write** `docs/roadmap/00-overview.md` + one `NN-{kebab}.md` per brief. Post-genesis
   product-shape decisions are amendment ADRs whose effects are edited into the briefs they
   name at decision time (the overview states the rule; adr.md template § Applies to) — no
   side-channel amendment dir exists. **Never write a status column** —
   per-brief status is derived from specs' `brief:` frontmatter (`/spec:status`), not tracked.
4. **Self-check (checklist, not a workflow):** no `depends_on` cycles; every ADR is carried by
   ≥1 brief's Grounding or is genuinely cross-cutting (note which); no two briefs claim the same
   scope; each milestone gate is satisfiable by the briefs sequenced before it; brief 01 depends
   on nothing and is plannable immediately after `/spec:init` + `/spec:enforce`.

## Genesis: On-disk Handoff (the genesis artifacts)

Genesis follows the same on-disk-handoff spine as the per-feature pipeline (shared § Workflows
Encode Shape): every cross-stage handoff is a **file**, never conversation context — a
re-invocation of a genesis command was never in the originating conversation; it Reads files only.
The genesis artifacts live in `.claude/genesis/` (machine/transient) and `docs/adr/` (durable):

- **`.claude/genesis/brief.md`** — authored from the template `genesis-brief.md`
  (`$(spec-paths templates)/genesis-brief.md`, § Genesis: Discovery Interview): `## What I
  think you're building`, `## Coverage` (the ten-key audit — grammar per § Genesis: Discovery
  Interview), `## Non-goals`, `## Open Dimensions` (each line `- <key>: open|constrained [—
  note]`) and `## Research Angles` (the two machine-keyed sections the workflow agents read —
  key → focus, and each marked hard-to-reverse or not), `## Picks` (each line `- <key>:
  <label>`). These are the grammars `genesis-driver.js` parses mechanically at its
  `discovery-done`, `menu-written`, and `menus-done` marks — write what the driver can read.
  The command writes and re-renders this after every answer; the workflow's `args` only ever
  carries the *keys*.
- **`.claude/genesis/status.json`** — the genesis state machine (§ Genesis: State Machine),
  carrying `tournament` (null for a non-tournament archetype or a skipped race).
- **`.claude/genesis/tournament/`** (tournament archetypes only, § Genesis: Tournament of
  Scaffolds) — `finalists/<name>/` and `logs/` (deleted once `decided`), `evidence/<name>/
  probe.json` (session-written), `benchmark.json`/`benchmark.md`/`gallery.html`
  (driver-written, survive `decided`). Template: `spec/templates/finalists.json`, the shape
  the session composes a run's `finalists.json` from.
- **`.claude/genesis/stack-descriptor.json`** — architect's output (template via `spec-paths templates`).
- **`.claude/genesis/conventions.json`** — `DECIDE`'s ops-conventions ledger (template via
  `spec-paths templates`, § Genesis: Conventions Probe Suite): schemaVersion 1, `testTree`,
  and the DECIDED/DEFERRED rows the driver validates at `decided` and again (probe existence,
  the binding subset) at `skeleton-landed`.
- **`design/mocks/`** (durable, authored by `/spec:mocks`, spec 07's `mocks-driver.js`) — the
  approved-set workspace BRIEF reads directly: `seed.md`, `canon.md`, `status.json`,
  `ledger.md`, `tokens.css`, and the approved journeys' screens. BRIEF never writes here — it
  only reads `status.json`/`ledger.md` for the precondition and checks `tokens.css` for
  presence (§ Genesis: Brief State).
- **`design/components.json`** (durable) — the component manifest, seeded by BRIEF's
  ratification with the base primitives, extended by every `/spec:design` reconcile (shared §
  Design Authoring Contracts, component manifest).
- **`.claude/genesis/design-rules.json`** — design's output: category-only enforcement rules.
- **`.claude/genesis/interview-research/{dimension}.json`** — the woven-loop option menus,
  each surviving option stamped with a `currency` block and each menu carrying any
  `droppedForCurrency` entries `registry-check.js` removed.
- **`docs/adr/NNNN-*.md`** — architecture/design decision records (template via `spec-paths templates`).
- **`docs/roadmap/`** (durable) — the decomposition that makes the pipeline invocable after
  setup: `00-overview.md` (sequence table, milestone gates, ops track, parking lot) plus one
  `NN-*.md` planning brief per `/spec:plan` unit
  (templates: `roadmap-overview.md`, `roadmap-brief.md` via `spec-paths templates`).
  Post-genesis amendments are ADRs with an `Applies to` list, their effects edited into the
  named briefs at decision time (consumed briefs get a letter-suffixed successor) — no
  side-channel amendment files; the numbered sequence is the only work queue. Briefs are
  **stable intent** hydrated into specs lazily; per-brief status is never written here — it is
  derived from specs' `brief:` frontmatter (`/spec:status`, or `/spec:doctor` check 14 for
  the audited version). Brownfield repos (no
  genesis) hand-author from the same templates; a dedicated command exists only if evidence
  demands one.
- **`.claude/genesis/init-profile.json`** (session-authored) — `HANDOFF`'s judgment artifact:
  the init profile (`spec/commands/init.md` Phase 4's shape) the driver hands to `init-gen.js
  generate` at `--mark profile-written` (§ Genesis: Enforcement Handoff to the spec pipeline).
- **`.claude/genesis/init-gen.log`** (driver-written) — the streamed stdout+stderr of that
  `generate` run; a refused mark quotes its tail, the full log survives on disk for a deeper
  read.

## Genesis: Dismissed Questions

The shared Decisions rule (`shared.md` § Decisions) holds for genesis too: a dismissed genesis
`AskUserQuestion` STOPS the run — never invent the declined answer; state is safely on disk,
re-invoke to continue. Genuine hard-to-reverse forks always go to the user, never silently decided.
