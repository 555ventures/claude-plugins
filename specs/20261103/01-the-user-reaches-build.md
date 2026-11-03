---
date: 2026-11-03
status: implementing
tier: standard
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 61135737158cb84fb1f4b16eef781a403beb254d
---

# The user reaches build

## Goal

The apps this pipeline produces confuse the people they are for, because the user image — who
they are, the job they are doing, the situation they are in — is written once during genesis
and the wireframe and then never reaches plan, build or review; and because the gray wireframe
is read as the finished design. After this spec, every seed journey opens with a job story and
carries one off-path beat (first run or empty state), the roadmap brief and the spec carry those
stories forward, build workers and the reviewer read them, the reviewer walks each journey cold,
and the wireframe is declared binding for structure only. No new stage, no new script, no new
config key; one dead artifact (the UX research brief) is deleted.

## Users

- The product owner who runs this pipeline on a host repo: When I plan a feature for an app
  whose users I described at genesis, I want that description to reach the people and agents
  who build and review it, so I can stop finding apps that make sense only to their author.
  First run / empty: a host that never ran genesis has no seed — the roadmap brief's
  `Journeys:` line and the spec's `## Users` block are filled from the feature description
  instead, and the lock refuses a spec that skipped them.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A seed journey's first body line is a **job story** of the exact form `When <situation>, I want <motivation>, so I can <outcome>.` — never a named person. `spec/templates/mocks-seed.md`, `spec/doctrine/mocks.md` § Mocks: Seed, `spec/commands/mocks.md` and `mocks-driver.js`'s SEED step text say "job story", not "persona line". The parser keeps its `persona` key (it is the walkthrough service's wire field, `spec/templates/walkthrough/contract.json`, `maxLength` 300) — only the line's meaning changes. (AC-20261103-01-1, AC-20261103-01-3, AC-20261103-01-6) | Owner's standing answer; a job story is a situation and a motive, which is what the design brief's synthetic-persona ban (`spec/templates/design-brief.md`, `spec/skills/design-brief/SKILL.md` point 1) was protecting — both stay, reconciled in Rationale. Renaming the wire field would touch the service contract a sibling owns. |
| D2 | Every seed journey carries one **off-path beat**: a beat whose `@state` is `first-run` or `empty` (closed set, exported as `OFF_PATH_STATES` from `lib/surfaces.js` next to the job-story regex `JOB_STORY_RE`). `--mark seed-done` refuses — exit 1, naming the journey and the remedy — a journey whose first body line is not a job story, or that has no off-path beat; the check runs in `cmdSeedDone` only, never in `seedProblem`/`deriveState`, so a host already past SEED is not pushed back. Doctrine only points at the check. (AC-20261103-01-1, AC-20261103-01-2, AC-20261103-01-3) | Owner's standing answer: extend the existing seed validator, not a new script. `seedProblem` feeds `deriveState`, so putting the arm there would retroactively re-open every persona-era wireframe — the one place the check must not live. |
| D3 | `spec/templates/roadmap-brief.md` gains a `Journeys:` line in the header block (before the first `##`), followed by one `- <journey-kebab>: <job story verbatim>` line per seed journey, or `Journeys: —` with the stories written from the brief's own Result on a host with no seed. `spec/commands/plan.md` § Entry reads them into the spec's `## Users`. Nothing mechanical parses the line (`genesis-driver.js`'s `roadmapCheck` reads only `Phase:`/`Depends on:`/`First light:`, unchanged). (AC-20261103-01-6) | A line in the header is where every other brief-level fact lives and where the ROADMAP closure check already looks, so authors see it; a parser would be a new guard with no third recurrence (core § Incident Policy). |
| D4 | `spec/templates/spec.md` gains a `## Users` section between `## Goal` and `## Decisions`: one bullet per journey — `- <who>: When <situation>, I want <motivation>, so I can <outcome>. First run / empty: <what they meet before any data exists>` — copied from the roadmap brief's `Journeys:` lines or written from the feature description. `decision-lint.js` refuses the lock with one `missing-users-section` finding (id `Users`, severity hard, exit 1) when the section is absent, or when no non-comment line in it matches `JOB_STORY_RE` imported from `lib/surfaces.js` (a line still carrying `{`/`}` placeholder braces does not count). The arm applies from `USERS_LINT_APPLIES_FROM = '20261103'`, a constant local to `decision-lint.js`; a path with no `specs/<YYYYMMDD>/` segment is linted in full, as every other arm. `--json`'s `counts` object is unchanged. (AC-20261103-01-4, AC-20261103-01-5, AC-20261103-01-6) | `decision-lint` already owns every template-section structural check (Data Model, File Plan rows, breaking); `ac-matrix --lint` is by its own header "ONLY the AC-line lint" and must stay spec-only. One regex authority for the job-story shape, shared with the seed parser. |
| D5 | Build workers read `## Users`: `spec/doctrine/stages/stage-build.md` § Worker Contract's read list becomes "Users, Decisions, Contracts, UI, and their own File Plan rows". The reviewer reads it: `spec/agents/reviewer.md` § Ground yourself first adds Users to the spec sections it lists. (AC-20261103-01-6) | The two readers the goal names; a list edit each, no new dispatch. |
| D6 | `spec/agents/reviewer.md` gains one section, `## The cold walk`, after the promise sweep: for every journey bullet in the spec's `## Users`, the reviewer walks the diff's surface as that user with no prior state — first run, empty — and reports where it stalls (a dead end, a screen that assumes data that does not exist yet, a control with no sentence on success) as a finding under § Severity calibration, with the evidence standard unchanged. One walk per journey, nothing per screen. (AC-20261103-01-6) | Owner's standing answer; a single question with the normal severity rules keeps the reviewer seat's cost flat and gives the finding a disposition path. |
| D7 | In `spec/doctrine/design.md` § Design Authoring Contracts the lead-in `**Grounded vs taste (mock supremacy).**` is replaced by `**The wireframe binds structure, not looks.**` and one rule: an approved screen fixes the set of screens, the controls that move between them, and the order of content on each; it never fixes layout, visuals, label wording or sample data — those are the design stage's and the build's to decide within the kit. The grounded/taste tagging sentences that follow are kept under the new lead-in, re-anchored to that rule. `mock supremacy` is a retired phrase across `spec/doctrine/`, `spec/commands/`, `spec/agents/`, `spec/templates/`. [asked: the owner fixed the rule verbatim — the wireframe fixes screens, the controls between them and content order; never layout, visuals, label wording or sample data] (AC-20261103-01-7) | The old lead-in named a doctrine of mock-wins-everything that is exactly the gray-wireframe-as-final-design confusion; the binding/not-binding split is the smallest statement that fixes it. |
| D8 | Delete `spec/templates/ux-research-brief.md` and the whole `## Genesis: Fresh UX Research (method fixed, content researched)` section of `spec/doctrine/genesis.md`. No `spec-paths` key, driver, command or test produces or reads either (A1); the only `§ Genesis: Fresh UX Research` citation is inside the deleted template. `docs/roadmap/10-*`, `10a-*`, `22-*` and `tests/fixtures/mocks-ledger/dry-run.md` mention `research-brief.md` as history and are untouched. (AC-20261103-01-8) | Zero producers, zero readers — prose that promises an artifact nothing makes. |
| D9 | Untouched: `spec/templates/genesis-brief.md` (and `genesis-driver.js`'s text describing its journey block), the mocks provenance ledger, the tournament. [no-ac: a non-edit has no testable surface; sibling spec 02 owns those files] | Owner's scope fence. |
| D10 | `spec/.claude-plugin/plugin.json` is bumped minor by `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` as a File Plan row; no version literal appears in this spec. [no-ac: scripts/plugin-bump.js --check in the gate is the oracle (pipeline rules § Review Checks)] | Repo convention (pipeline rules § Planning). |
| D11 | Three decision-lint fixture builders that write an undated spec path (`tests/decision-lint/structural-triggers.test.js`, `tests/decision-lint/additive-data-model.test.js`, `tests/host-config/file-shapes.test.js` `lintRow`) gain a `## Users` section holding one job-story bullet, with no new AC-ID in those files. [no-ac: fixture currency — the refusal D4 adds would strand them (pipeline rules § Gotchas, seventh trigger); the behaviour is tested by the ACs D4 cites] | Undated paths are linted in full; the fixtures must become what a real spec is. |
| D12 | Tests follow ADR-0037: the seed and lint behaviour by executing `mocks-driver.js` and `decision-lint.js` against tmpdir hosts; doctrine by reference pins (headings, the `Journeys:` token, the finding class, the job-story form) and one banned phrase, sliced with `section`/`phrase` from `tests/helpers.js`. (AC-20261103-01-6, AC-20261103-01-7, AC-20261103-01-8) | Wording is read by `/doctrine-review`; only references and retired phrases are pinned. |

## File Plan

<!-- Machine-consumed: the build stage parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other | baseline. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/mocks-seed.md | MODIFY | doctrine | D1/D2: the journey block's first line is the job story (exact form in the comment and the placeholder); the comment names the off-path beat (`@first-run` or `@empty`) and that `--mark seed-done` refuses without either; "persona" gone from this file |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1/D2: § Mocks: Seed says "a job story line (`When …, I want …, so I can …`)", names `first-run`/`empty` as the off-path states, and says `--mark seed-done` refuses a journey missing either (pointing at the check, no second grammar); the two-modes paragraph's "prints each journey's persona" → "job story" |
| spec/commands/mocks.md | MODIFY | doctrine | D1: terminal-mode sentence says "job story and sentences" |
| spec/scripts/lib/surfaces.js | MODIFY | scripts | D1/D2/D4: export `JOB_STORY_RE` and `OFF_PATH_STATES`; header and `parseSeedJourneys` comments say the first body line is the job story, kept under the `persona` key for the service wire field; no parse behaviour change |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2: `cmdSeedDone` refuses (exit 1, `die`) a journey whose `persona` line fails `JOB_STORY_RE` or whose beats have no `state` in `OFF_PATH_STATES`, each message naming the journey and the remedy; SEED step text says "a job story line, then numbered beats — one beat `@first-run` or `@empty`"; header comment lists the two refusals |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D3: `Journeys:` line plus per-journey job-story lines in the header block, with the no-seed fallback stated in the header comment |
| spec/commands/plan.md | MODIFY | doctrine | D3/D4: § Entry's roadmap-brief bullet reads the brief's `Journeys:` lines into `## Users` (feature description or behaviour contract: written from it); § Lock step 2 names `missing-users-section` and its remedy (fill `## Users` with one job-story bullet per journey) |
| spec/templates/spec.md | MODIFY | doctrine | D4: `## Users` section after `## Goal` with the bullet form, the copy-from-brief rule, the lint name, and "never a named invented person" in its comment |
| spec/scripts/decision-lint.js | MODIFY | scripts | D4: `USERS_LINT_APPLIES_FROM = '20261103'`; `missing-users-section` arm (section absent, or no comment-stripped, brace-free line matching `JOB_STORY_RE`); header comment documents the arm; `counts` unchanged |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | D5: § Worker Contract read list gains Users |
| spec/agents/reviewer.md | MODIFY | doctrine | D5/D6: § Ground yourself first lists Users among the spec sections; new `## The cold walk` section (one walk per `## Users` journey, no prior state, stall = finding under § Severity calibration) |
| spec/doctrine/design.md | MODIFY | doctrine | D7: new lead-in `**The wireframe binds structure, not looks.**` with the binding/not-binding rule; `mock supremacy` gone; file stays ≤160 lines |
| spec/doctrine/genesis.md | MODIFY | doctrine | D8: delete `## Genesis: Fresh UX Research (method fixed, content researched)` whole, heading through the line before `## Genesis: Executed Assumptions` |
| spec/templates/ux-research-brief.md | DELETE | doctrine | D8: dead template, zero producers and readers (A1) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D10: `node scripts/plugin-bump.js --bump --plugin spec --changelog "..."` — minor; no dependency change |
| tests/decision-lint/structural-triggers.test.js | MODIFY | tests | D11: `spec()` builder writes a `## Users` section with one job-story bullet (fixture currency; no new AC-ID) |
| tests/decision-lint/additive-data-model.test.js | MODIFY | tests | D11: `spec()` builder writes a `## Users` section with one job-story bullet (fixture currency; no new AC-ID) |
| tests/host-config/file-shapes.test.js | MODIFY | tests | D11: `lintRow` writes a `## Users` section with one job-story bullet (fixture currency; no new AC-ID) |
| tests/mocks/seed-job-story.test.js | CREATE | tests | AC-20261103-01-1, AC-20261103-01-2, AC-20261103-01-3 |
| tests/decision-lint/users-section.test.js | CREATE | tests | AC-20261103-01-4, AC-20261103-01-5 |
| tests/consistency/users-reach-build.test.js | CREATE | tests | AC-20261103-01-6, AC-20261103-01-7, AC-20261103-01-8 |

## Contracts

Seed journey block (`design/mocks/seed.md`), after this spec:

```
### owner-onboarding
When I open the clinic's invitation for the first time, I want to see who is already on my roster, so I can confirm it without typing anyone in.
1. "I open the invitation" -> owner-intro
2. "I see nobody is listed yet" -> roster-confirm@empty
3. "I read what happens next" -> reciprocity-brief
```

`lib/surfaces.js` exports (additive):

```js
const JOB_STORY_RE = /^When .+, I want .+, so I can .+$/   // one trimmed line; the parser's first body line
const OFF_PATH_STATES = ['first-run', 'empty']             // closed set of off-path @state tokens
module.exports = { ..., JOB_STORY_RE, OFF_PATH_STATES }
```

`mocks-driver.js --mark seed-done` refusals (both exit 1 via `die`, message shape):

```
design/mocks/seed.md journey "<j>" has no job story — its first line must read `When <situation>, I want <motivation>, so I can <outcome>.` — remedy: write the job story as the block's first line, then re-run `--mark seed-done` (spec/doctrine/mocks.md § Mocks: Seed)
design/mocks/seed.md journey "<j>" has no off-path beat — one beat must land on `<screen>@first-run` or `<screen>@empty` — remedy: add the first-run or empty-state beat, then re-run `--mark seed-done` (spec/doctrine/mocks.md § Mocks: Seed)
```

`decision-lint.js` finding (text-mode line, and the `--json` findings entry):

```
  missing-users-section Users: ## Users is missing or carries no job story — add one `- <who>: When <situation>, I want <motivation>, so I can <outcome>. First run / empty: <…>` bullet per journey (copy the roadmap brief's Journeys: lines)
{ "severity": "hard", "class": "missing-users-section", "id": "Users", "detail": "…" }
```

Roadmap brief header (`spec/templates/roadmap-brief.md`), additive lines before the first `## `:

```
Journeys:
- { journey-kebab }: When { situation }, I want { motivation }, so I can { outcome }.
```

Spec template section (`spec/templates/spec.md`):

```
## Users

- { who }: When { situation }, I want { motivation }, so I can { outcome }. First run / empty: { what they meet before any data exists }
```

## Behavior

- **Seed authoring.** The SEED step prints the new block shape. `--mark seed-done` runs the
  existing `seedProblem` (malformed / zero beats) first, then D2's two refusals per journey in
  seed order, then the ledger gate, then records. `deriveState` is untouched: a host whose seed
  predates this spec (a named-person line, no off-path beat) stays wherever it is; only the next
  `--mark seed-done` on a fresh SEED meets the check. A job-story edit does not change
  `beatHash`, so it never reopens a confirmed journey.
- **Terminal confirm.** The SCREENS terminal block already prints `j.persona` under each
  `### <journey>`; it now shows the job story line verbatim — no code change in that block.
- **Service mode.** `assembleRound` still sends `persona: j.persona` — the service receives the
  job story in the field it already accepts (≤300 chars).
- **Plan.** From a roadmap brief, the planner copies the brief's `Journeys:` lines into
  `## Users`, adding the first-run/empty expectation per bullet; from a feature description or
  behaviour contract, the planner writes the bullets from it. Lock step 2's `decision-lint` run
  refuses with `missing-users-section` until at least one bullet carries a brace-free job story.
- **Build.** Workers read `## Users` first; nothing else in the worker contract changes.
- **Review.** After the promise sweep, the reviewer walks each `## Users` journey cold. A stall is
  a finding (hard when it contradicts a Decision/AC with both sides quoted or has an executed
  repro; soft otherwise). The return contract is unchanged.
- **Design.** The wireframe binds screens, the controls between them, and content order; a build
  that lays out, styles, words or fills a screen differently from the gray mock is not a finding on
  that ground alone.

## Acceptance Criteria

- **AC-20261103-01-1**: WHEN `mocks-driver.js --root <host> --mark seed-done` runs over a seed whose journey `owner-onboarding` opens with `Mika (clinic owner) is invited, confirms her roster, and ends at the brief.` and whose beats include `roster-confirm@empty` THE SYSTEM SHALL exit 1, print no `✅ seed-done recorded`, and name `owner-onboarding`, `job story` and `--mark seed-done` on stderr, leaving `status.marks.seedDone` null → writes tests/mocks/seed-job-story.test.js
- **AC-20261103-01-2**: WHEN the same mark runs over a seed whose journey opens with `When I open the invitation for the first time, I want to see my roster, so I can confirm it.` and whose beats are `1. "I open the invitation" -> owner-intro` and `2. "I see my team" -> roster-confirm` (no `@first-run`/`@empty` state) THE SYSTEM SHALL exit 1 naming the journey, `off-path`, `@first-run` and `@empty` on stderr; and WHEN a beat reads `-> roster-confirm@draft` instead THE SYSTEM SHALL still refuse (the set is closed) → writes tests/mocks/seed-job-story.test.js
- **AC-20261103-01-3**: WHEN every journey opens with a job story and carries a beat `@first-run` or `@empty` THE SYSTEM SHALL exit 0 printing `✅ seed-done recorded`, and the following driver run (state `SCREENS`, terminal mode) SHALL print the journey's job story line verbatim under its `### <journey>` line → writes tests/mocks/seed-job-story.test.js
- **AC-20261103-01-4**: WHEN `decision-lint.js --spec <p> --root <host>` runs over a spec at `specs/20261103/09-x.md` or at an undated path that has no `## Users` section, or whose `## Users` holds only the template bullet `- { who }: When { situation }, I want { motivation }, so I can { outcome }.` THE SYSTEM SHALL exit 1 with exactly one `missing-users-section` finding whose id is `Users` (text line `  missing-users-section Users:`; `--json` `findings[0].class === 'missing-users-section'`) → writes tests/decision-lint/users-section.test.js
- **AC-20261103-01-5**: WHEN the spec at `specs/20261103/09-x.md` carries `## Users` with the bullet `- The clinic owner: When I open the invitation for the first time, I want to see my roster, so I can confirm it. First run / empty: an empty roster with one invite control.` THE SYSTEM SHALL exit 0 with `findings=0`; and WHEN the spec sits at `specs/20261102/09-x.md` with no `## Users` THE SYSTEM SHALL exit 0 with `findings=0` (the arm applies from 20261103) → writes tests/decision-lint/users-section.test.js
- **AC-20261103-01-6**: WHEN the doctrine is read THE SYSTEM SHALL carry: a `## Users` heading in `spec/templates/spec.md`; the token `Journeys:` in `spec/templates/roadmap-brief.md`'s text before its first `## ` heading and in `spec/commands/plan.md` § Entry; `missing-users-section` in `spec/commands/plan.md` § Lock; `Users` in `spec/doctrine/stages/stage-build.md` § Worker Contract's "Workers Read" sentence; `Users` in `spec/agents/reviewer.md` § Ground yourself first and a `## The cold walk` heading in that file; the form `When <situation>, I want <motivation>, so I can <outcome>.` in `spec/templates/mocks-seed.md`; `first-run`, `empty` and `seed-done` in `spec/doctrine/mocks.md` § Mocks: Seed; and zero occurrences of `persona` in `spec/templates/mocks-seed.md`, `spec/doctrine/mocks.md` and `spec/commands/mocks.md` → writes tests/consistency/users-reach-build.test.js
- **AC-20261103-01-7**: WHEN `spec/doctrine/design.md` is read THE SYSTEM SHALL carry the lead-in `The wireframe binds structure, not looks.` inside § Design Authoring Contracts, and no file under `spec/doctrine/`, `spec/commands/`, `spec/agents/` or `spec/templates/` SHALL contain `mock supremacy` → writes tests/consistency/users-reach-build.test.js
- **AC-20261103-01-8**: WHEN the plugin tree is read THE SYSTEM SHALL have no `spec/templates/ux-research-brief.md`, no line starting `## Genesis: Fresh UX Research` in `spec/doctrine/genesis.md`, zero occurrences of `ux-research-brief` or `research-brief.md` under `spec/`, and `citations-check.js` run at the repo root SHALL exit 0 printing `MISS=0` → writes tests/consistency/users-reach-build.test.js

## Assumptions (escalation triggers)

- A1: The UX research brief has zero producers and zero readers. Checked at plan time:
  `grep -rn "ux-research\|research-brief\|Fresh UX" spec tests scripts git .claude` → hits only in
  `spec/templates/ux-research-brief.md:6` (self-citation), `spec/doctrine/genesis.md:201,203,206`
  (the section being deleted) and `tests/fixtures/mocks-ledger/dry-run.md:96` (ledger prose
  fixture mentioning `docs/design/research-brief.md`, not a reader); no `spec-paths` key, no
  `genesis-driver.js` step, no test. `docs/roadmap/10-*.md:114`, `10a-*.md:57`, `22-*.md:35,150`
  mention it as roadmap history. — **if false:** the newly found reader enters the File Plan as a
  fix row pointing it at nothing (the artifact is still deleted), never a second brief.
- A2: Nothing in `tests/` runs `--mark seed-done` against a fixture seed (grep `seed-done` over
  `tests/` hits only `tests/consistency/compat-retired.test.js:95`, a usage-string pin), so D2's
  refusal strands no existing test; `tests/mocks/wireframe-fixtures.js`'s seed pre-sets
  `marks.seedDone` through its status writer. — **if false:** the stranded test's seed gains a job
  story and an `@empty` beat in the same batch; the refusal is never weakened.
- A3: The three undated decision-lint fixture builders named in D11 are the complete set of
  `decision-lint.js` callers under `tests/` (grep `decision-lint.js` over `tests/`: those three plus
  `tests/spec-paths.test.js:159`, a key-resolution pin). — **if false:** the found caller's fixture
  gains the same `## Users` bullet in the same batch (pipeline rules § Gotchas, eighth trigger:
  a caller count is a prediction).
- A4: The walkthrough service accepts a job story in `persona` (`contract.json` `maxLength: 300`
  — the Contracts example above is 143 characters). — **if false:** the SEED step text caps the
  story at 300 characters; the field name still never changes.
- A5: `spec/doctrine/design.md` stays ≤160 lines after D7 (64 lines today; D7 adds at most
  four). — **if false:** condense within § Design Authoring Contracts; never drop a heading.
- A6: Deleting genesis.md's section orphans no `§ Genesis: Fresh UX Research` citation (grep
  above; `citations-check.js` MISS=0 is AC-8's oracle). — **if false:** fix the citation at its
  source in the same batch.

## Rationale

The owner diagnosed two failures: the user image produced at genesis/mocks never reaches the
stages that make the product, and the gray wireframe gets treated as the design. Every Decision is
the smallest edit that threads the user through the existing files: the seed already has a
first-line slot (the persona line) — it becomes the job story (D1); the seed already has a
validator run at `seed-done` — it gains two refusals (D2), placed in `cmdSeedDone` rather than
`seedProblem` because the latter feeds `deriveState` and would push every existing wireframe back
to SEED; the roadmap brief already has a header the ROADMAP check reads — it gains a `Journeys:`
line (D3); the spec template already has sections the lock lints — it gains `## Users` and
`decision-lint` gains one arm (D4), chosen over `ac-matrix --lint` because that script's header
contract restricts it to AC lines; the two readers that matter are named (D5) and the reviewer
gets one question (D6).

**Persona ban vs job story.** The design brief bans synthetic personas because an invented
person is noise. A job story is not a person: it is a situation, a motive and an outcome, and it
is the same shape the design brief's own `JTBD:` line already demands per journey. The seed now
carries that shape upstream so the brief can copy it, and the ban stays as written.

**Why not rename the parser field.** `persona` is the walkthrough service's wire field
(`contract.json`); renaming it is a service-contract change a sibling owns. The key keeps its
name, its content is the job story, and the comment says so.

**Why the off-path set is closed.** "First run or empty state" must be checkable without
judgment; `first-run`/`empty` as the two `@state` tokens is deterministic and matches the state
the existing fixture already draws (`roster-confirm@empty`).

**File Plan size.** Fourteen source-layer rows against the ~12 guideline: the owner pre-assigned
one spec with an explicit scope list and a sibling owning the adjacent files; the overage is two
one-line prose rows (`spec/commands/mocks.md`, the template delete). Splitting would spread one
intent across two landings for no green-state gain.

**Rejected:** a new `## Users` check in `ac-matrix --lint` (contract says AC lines only); a seed
`story:` key (second grammar); a `journeys` parser for the roadmap brief (a guard with no
recurrence); updating `tests/mocks/wireframe-fixtures.js`'s seed (no test there runs `seed-done`,
so it is not stranded — leaving it is the smaller change; a later mocks spec may modernise it).

**Fragile:** D2's refusal is the kind of new refusal that strands shared setups (pipeline rules §
Gotchas, seventh trigger); A2/A3 carry the remedy. `design.md`'s 160-line cap (A5).

**Collision-closure waives (literals leg, run at lock with `mock supremacy`, `persona`,
`ux-research-brief`, `Fresh UX Research`, `Grounded vs taste`; 49 unplanned hits, all waived
here).** `persona` is retired only as the seed's line name in the three files AC-6 names; every
other hit keeps the word on purpose: the walkthrough wire field (`contract.json`,
`lib/mocks-round.js`, `lib/walkthrough-client.js`, `tests/fixtures/walkthrough/hearwell-round.json`,
`docs/spikes/20260929-walkthrough/push-hearwell.js`), the parser key (`lib/surfaces.js`, D1), the
init-gen agent persona (`spec/commands/init.md`, `init-gen.js`, `tests/init-gen/*`,
`tests/commit/escape-row-in-commit.test.js`), the design brief's ban that stays (`design-brief.md`,
`design-brief/SKILL.md`), sibling-owned `genesis-brief.md` and `genesis-driver.js` (D9),
`tests/mocks/wireframe-fixtures.js` and `tests/mocks/seed-reads-brief.test.js` (fixture constant
and assert-message prose; no test there runs `seed-done`), and ADR/roadmap history
(`docs/adr/0013`, `0016`, `0029`, `docs/roadmap/22`, `30`). `mock supremacy` in
`spec/scripts/citations-check.js` is a code comment illustrating a lowercase `§` quote — outside
AC-7's scope, kept. `Fresh UX Research` in `docs/roadmap/10a` is roadmap history, kept. The
`executes` hits on `mocks-driver.js` are callers of marks other than `seed-done` (A2); on
`decision-lint.js` they are D11's three fixtures plus the key-resolution pin; on `surfaces.js`
(`tests/spec-status.test.js`) the exports are additive and parsing is unchanged.

## Canonical Delta

`docs/canonical/design.md` — under "## The wireframe (specs/20261002/01)", append: "A seed journey
opens with a job story (`When <situation>, I want <motivation>, so I can <outcome>.`) and carries
one off-path beat (`@first-run` or `@empty`); `--mark seed-done` refuses a journey without either.
The wireframe binds structure, not looks: an approved screen fixes the set of screens, the
controls between them and the order of content; layout, visuals, label wording and sample data
are the design stage's and the build's. The former mock-wins-everything phrasing is retired.
(specs/20261103/01)"

`docs/canonical/pipeline.md` — append a short paragraph: "A spec carries a `## Users` block — one
job-story bullet per journey with its first-run/empty expectation, copied from the roadmap brief's
`Journeys:` lines or written from the feature description; `decision-lint` refuses the lock
without it (`missing-users-section`). Build workers read it; the reviewer reads it and walks each
journey cold, reporting stalls as findings under the normal severity rules. The genesis UX
research brief and its template are deleted. (specs/20261103/01)"
