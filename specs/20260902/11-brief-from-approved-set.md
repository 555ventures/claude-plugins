---
date: 2026-09-02
status: hardened
tier: critical             # spec-status.js is a frozen-API critical surface (pipeline rules § Risk Tiers)
area: genesis
design: false
breaking: false
depends_on: [specs/20260902/08-genesis-shrink-brief-state.md, specs/20260902/10-page-notes-review-loop.md]
depended_on_by: []
brief: 22
open_markers: 0
---

# Brief from the approved set, roadmap from the journeys, shell and inventory extracted

## Goal

Genesis derives instead of guessing: BRIEF generates its content from the approved set and
the ledger (journeys, surfaces, personas, states, product facts) plus a non-UI coverage
checklist so screen-less facts are not dropped; ROADMAP decomposition derives from the seed's
journeys and every journey label lands in exactly one brief; SCAFFOLD/SKELETON extract the
shell canon and the component inventory from the composed set (brief 20's `shell adopt` and
drift check are the mechanism, fed from extraction); the framework menu is priced against the
seed's primary-surface and horizon rows; and the misunderstandings table becomes a pipeline
record with a `/spec:status` count line. Done = each derivation is a driver closure check
with a refusal that names the missing item.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `.claude/genesis/brief.md` gains two sections after `## Picks`: `## Journeys` (one `### <journey>` per seed journey — persona line + the seed's surfaces block copied verbatim, plus a `states:` line per screen listing its `data-state-btn` names) and `## Non-UI Coverage` (`- <key>: covered\|n/a — <one line>` for the closed keys `jobs notifications retention integrations admin pricing`); the template `genesis-brief.md` carries both (eight headings) and `--mark brief-written` (visual archetypes with a mocks set) refuses when any seed journey or label is missing from `## Journeys`, or any coverage key is missing/`dark` (AC-20260902-11-1, AC-20260902-11-2) | The brief is generated from the set, not from memory; the checklist is the counter to "polished prototypes drop the screen-less facts". |
| D2 | The BRIEF step text prints the derivation sources — every `product` ledger row `said-by-user`/`ratified-doc` with its id, the journeys and label counts, `notes.json` unresolved count (must be 0, already gated) — and the instruction to write `## What I think you're building` from them, never from the discovery interview alone (AC-20260902-11-2) | Provenance flows into the brief: a fact the brief states is a row the user confirmed. |
| D3 | MENUS step text (visual archetypes with a mocks set) prints, above the framework dimension, the `primary-surface` and `platforms-horizon` rows verbatim and the line `price every framework option against these two rows`; `wf-research`'s `contextPaths` for the `framework` dimension include `design/mocks/seed.md` (AC-20260902-11-3) | Hearwell picked Next.js without knowing a native app was coming; the seed now knows, and the menu must be priced against it. |
| D4 | `roadmap-written` (visual archetypes with a mocks set) additionally requires every label declared in `seed.md`'s journeys to appear in exactly one brief's ```` ```surfaces ```` block and refuses naming unplaced or double-placed labels; the ROADMAP step text lists journeys → suggested brief slices (one brief per journey by default, split when a journey's Scope exceeds a page) (AC-20260902-11-4) | Decomposition derives from journeys; the atlas's gap/orphan badges then mean what they say from day one. |
| D5 | Extraction at SCAFFOLD/SKELETON (visual archetypes with a mocks set): the SKELETON step text instructs the session to author `design/shell/app.html` + `app.css` **from the densest composed screen's chrome** and run `design-atlas.js shell adopt --apply` over `design/mocks/`; `skeleton-landed` additionally requires `design/shell/app.html` to pass `check`, every top-level `design/mocks/*.html` to declare `data-shell`, `design-atlas.js check --matrix design/mocks` to exit 0, and `design/components.json` to contain an entry named for every primitive bullet in `design/mocks/canon.md ## Primitives` (plus `components-check.js` exit 0, spec 08) (AC-20260902-11-5) | ADR-0006 reverses ADR-0003's bootstrap order: the shell and inventory are extracted from the composed set; `shell adopt` + the drift check are kept as the mechanism. |
| D6 | `spec-status.js` renders one line after 🗺️ Roadmap when `design/mocks/ledger.md` exists with ≥1 catch: `🧭 misunderstandings: {N} caught before build (latest {id} at {step})`; `--json` and `--next --json` shapes are unchanged (AC-20260902-11-6, AC-20260902-11-7) | The brief: promote the table to a pipeline record with a status count line; the frozen `--json` shape is never widened for a render line. |
| D7 | `spec/commands/status.md` names the line; `spec/doctrine/genesis.md` § Genesis: Brief State gains the derivation rules (D1–D3), § Genesis: Roadmap Decomposition the journey rule (D4), § Genesis: Day-Zero Skeleton the extraction (D5); `spec/commands/genesis.md` stays ≤120 lines (AC-20260902-11-8) | One doctrine home per fact; the command stays a shell. |
| D8 | Version bump → 7.65.0 target; changelog names brief-from-set, journey-derived roadmap, extraction, and the status line | § Planning. `[no-ac: standing plugin-version pin]` |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1–D5: brief section checks, BRIEF/MENUS/ROADMAP/SKELETON step texts, journey placement check, extraction checks |
| spec/scripts/spec-status.js | MODIFY | scripts | D6: the 🧭 line (render only; reads the ledger through lib/mocks-ledger.js) |
| spec/templates/genesis-brief.md | MODIFY | doctrine | D1: `## Journeys`, `## Non-UI Coverage` (eight headings) |
| spec/doctrine/genesis.md | MODIFY | doctrine | D7 |
| spec/commands/genesis.md | MODIFY | doctrine | D7: BRIEF derivation note, ≤120 lines |
| spec/commands/status.md | MODIFY | doctrine | D7: the count line |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 |
| tests/genesis/brief-state.test.js | MODIFY | tests | AC-20260902-11-1, AC-20260902-11-2, AC-20260902-11-3 |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | AC-20260902-11-4, AC-20260902-11-5 |
| tests/spec-status.test.js | MODIFY | tests | AC-20260902-11-6, AC-20260902-11-7 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260902-11-1 (template headings pin → eight), AC-20260902-11-8 |

## Contracts

`genesis-brief.md` (template) — the two new sections, exact:

```markdown
## Journeys
{ generated from design/mocks/seed.md — one block per journey, machine-read by genesis-driver.js:
  `### <journey>` · persona line · the seed's ```surfaces block verbatim · one `states: <label>: a, b, c` line per screen }

## Non-UI Coverage
- jobs: dark
- notifications: dark
- retention: dark
- integrations: dark
- admin: dark
- pricing: dark
```

Driver checks (D1/D4/D5), refusal strings:

```
brief-written:  `## Journeys is missing journey <j>` · `label <l> (journey <j>) is missing from ## Journeys` ·
                `## Non-UI Coverage key(s) dark or missing: notifications, pricing`
roadmap-written: `seed label(s) not placed in any brief's surfaces block: session-live, roster` ·
                 `seed label(s) placed in two briefs: signin (01-onboarding.md, 03-staff.md)`
skeleton-landed: `design/shell/app.html does not exist — author it from the densest composed screen, then run design-atlas.js shell adopt --apply` ·
                 `mock(s) without data-shell: consent.html` · `components.json is missing primitive(s) from canon.md: read-back card, orb`
```

Status line (D6), exact: `   🧭 misunderstandings: 13 caught before build (latest M14 at THEME)` — printed
directly under the 🗺️ Roadmap block (before 📡 Observation); omitted when the ledger is absent,
unparsable, or has zero catches.

MENUS step (D3), the two added lines:

```
seed: primary-surface (P1) — Primary surface is the web: phone-first sessions …
seed: platforms-horizon (P1b) — A native mobile app for sessions IS coming within 12–24 months …
price every framework option against these two rows (research contextPaths include design/mocks/seed.md)
```

## Behavior

- **Applicability:** D1/D3/D4/D5 apply when `status.brief.mocks` is set (a fresh visual run);
  legacy runs (`brief.legacy: true`) and non-visual archetypes see none of the new refusals —
  their steps SHALL CONTINUE TO behave as spec 08 left them.
- **Brief generation is judgment:** the driver checks the sections exist and cover the seed; the
  session writes the prose. The BRIEF step lists what to derive from where; nothing here writes
  brief.md.
- **Journey placement** reads every `docs/roadmap/NN-*.md` surfaces block (the atlas's
  `parseSurfaces` grammar) and the seed's; an extra label in a brief that no journey declares
  is allowed (new scope), a seed label in zero or two briefs is not.
- **Extraction** is authored by the session and closed by the driver: the densest composed
  screen is the seed's `## Dense screen`; `shell adopt --apply` stamps every mock; the
  components manifest gains one commitment entry per canon primitive (`name` = the bullet's
  bold text). `skeleton-landed` refusals name the exact missing item.
- **Misunderstandings line:** read-only; `spec-status.js` requires
  `./lib/mocks-ledger.js` and reads `<root>/design/mocks/ledger.md`; any read/parse failure
  omits the line silently (viewer, never a verdict).

## Acceptance Criteria

- **AC-20260902-11-1**: WHEN `spec/templates/genesis-brief.md` is read THE SYSTEM SHALL
  contain exactly eight `## ` headings in order (`What I think you're building`, `Coverage`,
  `Non-goals`, `Open Dimensions`, `Research Angles`, `Picks`, `Journeys`, `Non-UI Coverage`)
  and a six-line all-`dark` Non-UI Coverage block, and the ten-line Coverage block SHALL
  CONTINUE TO be present → `tests/consistency/genesis-doctrine.test.js` (the AC-20260825-02-2
  pin is updated in place to eight headings)
- **AC-20260902-11-2**: WHEN `--mark brief-written` runs on a fresh visual run whose
  `brief.md` lacks `## Journeys` THE SYSTEM SHALL exit 2 naming `## Journeys` and the first
  missing journey; when `## Journeys` omits label `roster` of journey `owner-onboarding` it
  SHALL exit 2 naming `roster` and `owner-onboarding`; when `## Non-UI Coverage` has
  `- pricing: dark` it SHALL exit 2 naming `pricing`; when all hold it SHALL CONTINUE TO
  accept (spec 08's checks unchanged); and the BRIEF step text SHALL list every confirmed
  product row id (`P1`, `P1b`, …) and the journey count → `tests/genesis/brief-state.test.js`
- **AC-20260902-11-3**: WHEN the MENUS step prints for a fresh visual run with `framework`
  open THE SYSTEM SHALL print the `primary-surface` and `platforms-horizon` rows' ids and
  claims and the literal `price every framework option against these two rows`; for a legacy
  run it SHALL CONTINUE TO print the unchanged MENUS text → `tests/genesis/brief-state.test.js`
- **AC-20260902-11-4**: WHEN `--mark roadmap-written` runs on a fresh visual run with seed
  labels `signin invite session-live` and briefs whose surfaces blocks declare `signin invite`
  THE SYSTEM SHALL exit 2 naming `session-live`; with `signin` in two briefs it SHALL exit 2
  naming `signin` and both files; with every label placed once it SHALL CONTINUE TO run the
  cycle check and accept → `tests/genesis/genesis-driver.test.js`
- **AC-20260902-11-5**: WHEN `--mark skeleton-landed` runs on a fresh visual run with no
  `design/shell/app.html` THE SYSTEM SHALL exit 2 naming the file and `shell adopt --apply`;
  with a shell but `consent.html` lacking `data-shell` it SHALL exit 2 naming `consent.html`;
  with `canon.md` primitives `read-back card` and `orb` and a manifest holding only `orb` it
  SHALL exit 2 naming `read-back card`; with every check satisfied it SHALL CONTINUE TO run
  the zero-day gate → `tests/genesis/genesis-driver.test.js`
- **AC-20260902-11-6**: WHEN `spec-status.js` runs on a root whose `design/mocks/ledger.md`
  carries 13 catches (fixture from spec 06, latest `M14` at `THEME`) THE SYSTEM SHALL print
  `🧭 misunderstandings: 13 caught before build (latest M14 at THEME)` between the 🗺️
  Roadmap block and the anomalies section; with no ledger, an unparsable ledger, or zero
  catches it SHALL print no 🧭 line → `tests/spec-status.test.js`
- **AC-20260902-11-7**: WHEN `spec-status.js --json` and `--next --json` run on that root THE
  SYSTEM SHALL CONTINUE TO emit the same top-level keys as before this spec (no
  `misunderstandings` key) → `tests/spec-status.test.js`
- **AC-20260902-11-8**: WHEN `spec/commands/status.md` is read THE SYSTEM SHALL contain
  `🧭 misunderstandings`; `spec/doctrine/genesis.md` § Genesis: Brief State SHALL contain
  `Non-UI Coverage`, § Genesis: Roadmap Decomposition SHALL contain `exactly one brief`, §
  Genesis: Day-Zero Skeleton SHALL contain `shell adopt --apply`; `spec/commands/genesis.md`
  SHALL be ≤120 lines; `citations-check.js` SHALL report `MISS=0` →
  `tests/consistency/genesis-doctrine.test.js`

## Assumptions (escalation triggers)

- A1: `parseSurfaces` (design-atlas.js) is importable or duplicable in the driver without a
  new spec-paths key — the driver reads roadmap blocks with the same tiny grammar (label,
  `a -> b`, `#`); a shared `lib/surfaces.js` extraction is allowed if both callers switch to it
  in this spec (add the row at build, orchestrator duty). **if grammars diverge:** blocked —
  one grammar, one parser.
- A2: `shell adopt --apply` (specs/20260901/04 D6) stamps `data-shell` and wraps content for
  composed screens whose chrome matches the canon's detected shape. **if adopt cannot detect
  a composed screen's chrome:** the session hand-declares that mock (`data-shell` + region)
  and the drift check catches the rest; the refusal string stays.
- A3: `spec-status.js`'s render section can insert one line after the Roadmap block without
  touching `deriveNext` or the JSON branches (the render is a separate block at the file's
  end). **if false:** blocked — the frozen API is not to be touched for a render line.
- A4: Executed-check requirement for the `dark` grammar: the Non-UI keys reuse Coverage's
  `covered|dark|n/a` line parser (`parseCoverage`'s regex, already in the driver). **if the
  parser is key-list-bound:** parameterize it; never a second parser.

## Rationale

This spec closes the loop the reorder opened: the set is approved, now genesis must use it.
Three derivations are mechanical enough to be driver checks (journey coverage of the brief,
label placement in briefs, extraction closure at skeleton); one is a printed instruction the
session cannot miss (pricing against the surface rows). The non-UI checklist is the answer to
the research's counter-source — a polished set pre-commits scope and drops what has no
screen; six keys is the floor the dry run found necessary (jobs, notifications, retention,
integrations, admin, pricing).

The misunderstandings line is deliberately render-only: `spec-status.js` is a frozen API for
`--json` consumers, and a count line is a habit, not a contract. Extraction is session
judgment closed by the driver, not a script that infers the common chrome across mocks —
that inference was measured unreliable enough that ADR-0003 introduced the shell canon in
the first place; `shell adopt` is the deterministic half and stays.

Rejected: generating `## What I think you're building` by script (prose is judgment);
writing catches into `.claude/spec-runs.jsonl` (spec 06 rationale); a per-brief
`design:` auto-stamp from the seed (the roadmap template's `Design column` rule already
covers it; the journey placement check is enough).

Collision closure (lock, paths leg; D1 narrows the template's six-heading pin —
`tests/consistency/genesis-doctrine.test.js` is a row): `spec-status.js` `executes` hits
(`tests/frontmatter/frontmatter.test.js`, `tests/queue/queue-overlay.test.js`,
`tests/replay/replay.test.js`, `tests/review/review-driver.test.js`,
`tests/status/red-alarm.test.js`) are waived — the 🧭 line prints only when
`design/mocks/ledger.md` exists with ≥1 catch, none of those fixtures has one, and `--json`
shapes are pinned unchanged by AC-7; `genesis-driver.js` `executes` hits
(`conventions-handoff.test.js` data-ml, `tournament.test.js` backend-api) never set
`brief.mocks`, so D1–D5's refusals never fire for them (Behavior › Applicability);
`explore-states.test.js`/`design-state.test.js` are deleted by spec 08.
`spec/scripts/components-check.js`'s header comment ("Callers: the genesis design state's
`rules-locked` mark") is retargeted to `skeleton-landed` as an orchestrator duty alongside
D5 — a comment edit, out of the table on purpose (§ Gotchas: name the file, not an ID).

## Canonical Delta

`docs/canonical/genesis.md` gains **Brief from the approved set (specs/20260902/11)**:
BRIEF generates `## Journeys` and `## Non-UI Coverage` from the seed and ledger (driver-checked
for coverage of every journey, label, and the six non-UI keys); MENUS prices the framework
against the seed's primary-surface and horizon rows; `roadmap-written` requires every seed
label in exactly one brief; `skeleton-landed` requires the shell canon extracted from the
densest composed screen, every mock `data-shell`-stamped via `shell adopt --apply`, and a
components manifest covering every canon primitive. `docs/canonical/status.md`: the dashboard
prints `🧭 misunderstandings: N caught before build (latest …)` from `design/mocks/ledger.md`;
`--json` shapes unchanged.
