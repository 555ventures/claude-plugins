---
date: 2026-09-13
status: implementing
build_base: main
tier: critical
area: release
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: ddf493d9d1da4f64463e25be07a93f50596fc093
---

# Silence is not a pass

## Goal

Two products died green. UpWell closed 155 CLEAN specs and never moved one production row; its
release gate could not have said otherwise, because every leg that fails to measure (no CI
adapter, a commit CI never saw, a substrate manifest made entirely of declared exemptions, a
promotion the user declined) resolves to exit 0 and the release verdict reads CLEAN. This spec
makes an unmeasured leg derive `UNVERIFIED` on the release profile and stops the release flow
before promotion when one exists, and it makes genesis emit the first brief as a first-light
brief: the one real record through the deployed path, observed by a person, before any feature
work. Done means a release over a silent leg cannot print CLEAN, and a new roadmap cannot be
marked written without naming its first light.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **One derivation of "unmeasured".** New `spec/scripts/lib/release-unmeasured.js` exports `unmeasuredReason(row)` → a string or `null`, judged from the row's typed `observed` object alone, never its `exit`: a `ci` row whose `observed.unavailable` is a string → `ci:unavailable:<value>`; a `ci` row whose `observed.status === 'in-progress'` → `ci:in-progress`; a `production` row whose `observed.result === 'skipped'` → `production:skipped`; a `substrate` row whose `observed.checked - observed.inert === 0` → `substrate:nothing-executed`. Every other row (including an `e2e` row whose nested slots carry `{"unavailable":"no-format-declared"}` — `executed` already governs e2e at append) → `null`. Both consumers below `require` this module; neither re-derives. (AC-20260913-08-1) | The repo rule against a second derivation: `stage`'s summary and `verdict.js` must agree on what silence looks like or the summary says STOP while the ledger says CLEAN. |
| D2 | **Release verdict: unmeasured derives `UNVERIFIED`.** In `verdict.js`'s `derive()`, on `profile === 'release'` only, after the existing `GATE_RED` check and before `return 'CLEAN'`: when any required leg row has a non-null `unmeasuredReason`, return `UNVERIFIED`. The review profile is untouched — review's ci leg keeps the never-block ruling of specs/20260830/03 D4. The `--ledger` row shape is unchanged; `verdict` carries the word. The header comment's "word restricted to CLEAN\|GATE_RED\|UNVERIFIED" sentence gains "UNVERIFIED also when a required leg is unmeasured (lib/release-unmeasured.js)". (AC-20260913-08-2, AC-20260913-08-3, AC-20260913-08-4) | `UNVERIFIED` already means "the evidence to derive a word is missing"; an unmeasured leg is exactly an absent measurement. A new word would widen a frozen consumer contract for no new meaning. |
| D3 | **`release-legs.js stage` stops before promotion.** The per-leg summary line prints `⚪` (not `✅`) for a row with a non-null `unmeasuredReason`; after the `RED_BLOCKING:` line (when any) it prints `UNMEASURED: <leg>:<reason>[,<leg>:<reason>…]` in row order; the process exits 1 when any row is red **or** unmeasured. Row shapes and row `exit` values are byte-identical to today — `{"unavailable":"no-adapter"}` and `sha-unseen` rows stay exit 0 (their pins are reused unchanged). `append --leg production --result skipped` still appends exit 0 (a decline is not red); `record` then derives UNVERIFIED by D2. The header comment's exit-code list says exit 1 = "any leg red or unmeasured". (AC-20260913-08-5, AC-20260913-08-6, AC-20260913-08-7, AC-20260913-08-11) | release.md routes exit 1 to STOP → `record`; that is the only path that keeps a session from promoting over a leg that measured nothing. Changing row exits instead would redefine the ci leg's honest-absence row, which two consumers copy verbatim. |
| D4 | **release.md says it.** Phase 2's exit list: exit 1 = "at least one leg red **or unmeasured** (`UNMEASURED:` line) — STOP; never promote over a leg that observed nothing". Phase 3's opening paragraph is reversed: a ci leg that never delivered a verdict does **not** promote — it is an `UNMEASURED` stop like any other. Phase 4's report: the two ci `warns` lines (no verdict; sha-unseen with a red branch) are deleted, and the 🚫 outcome names the unmeasured legs verbatim from the `UNMEASURED:` line; a declined promotion reports 🚫 `UNVERIFIED — nothing was measured in production`. The `release-legs.js` header's sha-unseen comment keeps its row ruling and adds one clause: "verdict.js maps it UNVERIFIED on the release profile (lib/release-unmeasured.js)". (AC-20260913-08-8) | The command text is what the session executes; a script that exits 1 under prose that says "continue" is the contradiction this spec exists to remove. |
| D5 | **Genesis emits a first-light brief.** `spec/doctrine/genesis.md` § Genesis: Roadmap Decomposition step 1 gains: "**Brief 01 is the first-light brief.** Its Result is one real record through the deployed production path — created by a real actor, observed by a person, named in one `First light:` header line (`First light: <the one record and where it is observed>`). One spec, one acceptance criterion, no feature. Feature briefs start at 02." Step 4's self-check gains "brief 01 carries `First light:`". `spec/templates/roadmap-brief.md`'s header block gains the line `First light: { brief 01 only — the one real record through the production path, and where a person observes it }`. `genesis-driver.js`'s `ROADMAP` step text names the rule in one sentence. `roadmapCheck()` returns `{ ok:false, reason:'first-light-missing', detail:<file> }` when the brief whose filename starts `01-` has no `First light:\s*\S` in its header (text before the first `## `); `handleRoadmapWritten` dies with `docs/roadmap/<file> has no "First light:" header — brief 01 is the first-light brief: name the one real record that proves the production path end to end (one line), then re-mark roadmap-written`. The check runs after `missing-headers` and before `cycle`; a roadmap with no `01-` brief is not refused by this check. (AC-20260913-08-9, AC-20260913-08-10) | UpWell's wiring was proven in month four because nothing put it first. A brief the driver refuses to close without is the one item in this series that needs no discipline from anyone. The check is on the AI session writing briefs, not on the user. |
| D6 | **Plugin bump.** `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` after the last edit. `[no-ac: scripts/plugin-bump.js --check in the gate is the oracle]` | Repo rule. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/release-unmeasured.js | CREATE | scripts | D1: `unmeasuredReason(row)`; header names this spec, what it does not judge (`exit`, e2e's nested slots), `Exit codes: n/a (library)` |
| spec/scripts/verdict.js | MODIFY | scripts | D2: release-profile `UNVERIFIED` on any unmeasured required row, after `GATE_RED`, before `CLEAN`; header sentence |
| spec/scripts/release-legs.js | MODIFY | scripts | D3: `⚪` summary glyph, `UNMEASURED:` line, exit 1 on unmeasured; header exit list + sha-unseen clause (D4) |
| spec/commands/release.md | MODIFY | doctrine | D4: Phase 2 exit-1 wording, Phase 3 reversal, Phase 4 report (warns deleted, 🚫 outcomes) |
| spec/doctrine/genesis.md | MODIFY | doctrine | D5: first-light rule in step 1, self-check item in step 4 |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D5: `First light:` header line with its brief-01-only comment |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D5: `roadmapCheck` `first-light-missing`, `handleRoadmapWritten` refusal, `ROADMAP` step sentence |
| spec/.claude-plugin/plugin.json | MODIFY | other | D6: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/release-legs/unmeasured.test.js | CREATE | tests | AC-20260913-08-1, AC-20260913-08-2, AC-20260913-08-3, AC-20260913-08-5, AC-20260913-08-6, AC-20260913-08-7, AC-20260913-08-8, AC-20260913-08-11 |
| tests/verdict-require-leg.test.js | MODIFY | tests | AC-20260913-08-4 tag on the existing all-measured CLEAN pin (reuse, unchanged assertions) |
| tests/genesis/first-light.test.js | CREATE | tests | AC-20260913-08-9, AC-20260913-08-10 |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | A3 fixture currency: `writeRoadmap` adds a `First light:` header line to any brief whose name starts `01-`; no AC tag (the fixture edit is not this spec's behavior) |
| tests/release-legs/release-legs.test.js | MODIFY | tests | A2 if-false (build-time addition): `AC-20260823-01-1` asserted `stage` exit 0 over a no-adapter ci leg — now expects exit 1 plus `UNMEASURED: ci:unavailable:no-adapter`, row assertions byte-identical; retagged AC-20260913-08-5 |
| tests/release-legs/e2e-unobserved.test.js | MODIFY | tests | A2 if-false (build-time addition): `AC-20260908-05-4` / `-5` same no-adapter ci exit-0 assertion — exit 1 plus the `UNMEASURED:` line, e2e row assertions byte-identical; retagged AC-20260913-08-5 |
| tests/review/verdict.test.js | MODIFY | tests | D2 retires the v7 "unmeasured ci still derives CLEAN" pin (`AC-20260813-02-4`) on the release profile — now asserts `UNVERIFIED`; retagged AC-20260913-08-2 |

## Contracts

```js
// spec/scripts/lib/release-unmeasured.js
// unmeasuredReason(row) -> string | null   (row = one release manifest row {leg, exit, observed})
unmeasuredReason({ leg:'ci', exit:0, observed:{ unavailable:'no-adapter' } })            // 'ci:unavailable:no-adapter'
unmeasuredReason({ leg:'ci', exit:0, observed:{ unavailable:'sha-unseen', branch:'main', branchConclusion:'failure' } }) // 'ci:unavailable:sha-unseen'
unmeasuredReason({ leg:'ci', exit:0, observed:{ status:'in-progress' } })                 // 'ci:in-progress'
unmeasuredReason({ leg:'production', exit:0, observed:{ result:'skipped' } })            // 'production:skipped'
unmeasuredReason({ leg:'substrate', exit:0, observed:{ checked:2, failed:0, inert:2 } })  // 'substrate:nothing-executed'
unmeasuredReason({ leg:'substrate', exit:0, observed:{ checked:2, failed:0, inert:1 } })  // null
unmeasuredReason({ leg:'e2e', exit:0, observed:{ passed:3, failed:0, skipped:{ unavailable:'no-format-declared' }, executed:3 } }) // null
unmeasuredReason({ leg:'ci', exit:0, observed:{ conclusion:'success' } })                // null
```

`release-legs.js stage` summary (new lines in **bold**):

```
✅ deploy      exit=0 {"result":"pass"}
⚪ ci          exit=0 {"unavailable":"no-adapter"}
manifest: .claude/release-legs.jsonl
outputs: <dir>  (…)
UNMEASURED: ci:unavailable:no-adapter
```
exit 1.

`roadmapCheck` refusal (exit 2, stderr):
```
docs/roadmap/01-onboarding.md has no "First light:" header — brief 01 is the first-light brief: name the one real record that proves the production path end to end (one line), then re-mark roadmap-written
```

## Behavior

Release, Phase 2: `stage` runs → any `⚪` row → `UNMEASURED:` line, exit 1 → the session STOPs to
`record`, which derives `UNVERIFIED` and writes the ledger row → the 🚫 report names the legs.
Phase 3 is never reached over an unmeasured leg. A user who declines promotion still gets a
row; its word is `UNVERIFIED`, its outcome line says nothing was measured in production.

Genesis, ROADMAP: the step text tells the session brief 01 is the first-light brief. `--mark
roadmap-written` refuses by name when `01-*.md` has no `First light:` header. A host with no
`01-` brief (legacy numbering) is not refused by this check.

## Acceptance Criteria

- **AC-20260913-08-1**: WHEN `unmeasuredReason` is called with each row in Contracts THE SYSTEM
  SHALL return exactly the value shown beside it (eight cases, including the three `null`s) → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-2**: WHEN `verdict.js --profile release --manifest <m>` runs over seven exit-0
  rows where `ci` is `{"unavailable":"no-adapter"}`, `production` is `{"result":"skipped"}` and
  `substrate` is `{"checked":2,"failed":0,"inert":2}` THE SYSTEM SHALL print `UNVERIFIED` as its
  first stdout line and exit non-zero (the pre-image prints `CLEAN`, executed A1) → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-3**: WHEN the same manifest also carries a red `deploy` row (`exit:1`) THE
  SYSTEM SHALL print `GATE_RED` (red outranks unmeasured) → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-4**: WHEN `verdict.js --profile release` runs over seven measured green rows
  (`ci` `{"conclusion":"success"}`, `production` `{"result":"verified"}`, `substrate`
  `{"checked":8,"failed":0,"inert":1}`) THE SYSTEM SHALL CONTINUE TO print `CLEAN` → reuses tests/verdict-require-leg.test.js :: AC-20260815-07-3
- **AC-20260913-08-5**: WHEN `release-legs.js stage` runs on a host whose `capabilities.forge` is
  `"none"` and whose other legs are green THE SYSTEM SHALL print a `⚪ ci` summary line, a
  final `UNMEASURED: ci:unavailable:no-adapter` line, and exit 1, while the appended ci row is
  still `{"leg":"ci","exit":0,"observed":{"unavailable":"no-adapter"}}` → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-6**: WHEN `release-legs.js stage` runs against a release manifest whose every
  check is `kind:"inert"` THE SYSTEM SHALL append `{"leg":"substrate","exit":0,"observed":{"checked":1,"failed":0,"inert":1}}`, print `UNMEASURED: substrate:nothing-executed`, and exit 1 → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-7**: WHEN `release-legs.js append --leg production --result skipped` runs THE
  SYSTEM SHALL CONTINUE TO append `{"leg":"production","exit":0,"observed":{"result":"skipped"}}`
  and exit 0 → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-11**: WHEN `release-legs.js record` runs over a manifest whose other six rows
  are measured green and whose `production` row is `{"result":"skipped"}` THE SYSTEM SHALL print
  `UNVERIFIED` and write a ledger row whose `verdict` is `"UNVERIFIED"` and whose `production`
  is `"skipped"` → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-8**: WHEN `spec/commands/release.md` is read (whitespace squashed) THE SYSTEM
  SHALL contain `UNMEASURED:`, the phrase `never promote over a leg that observed nothing`, and
  `nothing was measured in production`, and SHALL NOT contain `still derives plain CLEAN` or
  `ci never delivered a verdict on this commit` → writes tests/release-legs/unmeasured.test.js
- **AC-20260913-08-9**: WHEN `genesis-driver.js --mark roadmap-written` runs on a host at
  `scaffold-complete` whose roadmap has `00-overview.md` and `01-onboarding.md` with `Phase: P0 ·
  Depends on: —` and no `First light:` line THE SYSTEM SHALL exit 2 and print the D5 refusal
  naming `docs/roadmap/01-onboarding.md` and `First light:` on stderr, leaving `status.roadmap`
  unchanged → writes tests/genesis/first-light.test.js
- **AC-20260913-08-10**: WHEN the same host's `01-onboarding.md` header carries `First light: one
  patient visit row written by a caregiver, visible in the admin list` THE SYSTEM SHALL accept
  the mark (exit 0), AND WHEN a host's only briefs are `02-a.md` and `03-b.md` (no `01-`) THE
  SYSTEM SHALL accept the mark without a first-light refusal → writes tests/genesis/first-light.test.js

## Assumptions (escalation triggers)

- A1 (executed): `verdict.js --profile release` over the AC-2 manifest prints `CLEAN`, exit 0
  today — spike run 2026-09-13 in the scratchpad, output `CLEAN` / `exit=0`. **if false:** the
  defect is already fixed elsewhere — STOP, ask the user.
- A2 (executed by reading): `tests/release-legs/release-legs.test.js :: AC-20260823-01-6` and
  `:: AC-20260830-03-4` assert the appended ci row only, never `stage`'s process status; `tests/release-legs/e2e-unobserved.test.js :: AC-20260908-05-10` asserts the substrate row and the exit-2 empty-checks case only. D3's exit-1 change reddens none of them. **if false:** rewrite the reddened test to expect exit 1 plus the `UNMEASURED:` line, keeping its row assertion byte-identical; never weaken D3.
- A3 (prediction, count unknown): `tests/genesis/genesis-driver.test.js`'s `writeRoadmap` helper is the only brief writer that reaches `--mark roadmap-written`, and some of its callers name a `01-` brief. **if false:** any other fixture that reddens with `first-light-missing` gets a `First light:` header line in the same batch; never widen the check's filename match or weaken it.
- A4: `manifest-check.sh`'s `TOTAL=` counts every row including inert ones (read: `TOTAL=$(jq '.checks | length')`, `INERTS` incremented per inert row), so `checked - inert` is the executed count. **if false:** STOP, ask the user.
- A5: `release-legs.js`'s summary loop is the only place the `✅/❌` glyph is chosen (line ~360). **if false:** apply D3's glyph rule at every emission site; never a second reader of the manifest.

## Rationale

The letter that motivated this series claimed every gate is a contradiction detector and that
silence reads as success. On the release profile that claim is literally true in code: a ci row
with no adapter, a commit CI never saw, an all-inert substrate manifest and a declined promotion
all sit at exit 0, and `verdict.js` reaches `CLEAN` by falling through. A1 executed it.

**Why `UNVERIFIED` and not a new word.** The release word set is a frozen contract (three words,
header comment, ledger consumers). `UNVERIFIED` already means "the derivation lacks evidence";
an unmeasured leg is that case. A fourth word (`UNMEASURED`) was rejected: it would change every
consumer for a distinction the report line already makes verbatim.

**Why rows keep exit 0.** specs/20260830/03 D4 (ci honest absence) made the `sha-unseen` row
identical across review and release so two consumers never drift; that ruling stands for the
row. What changes is what the release verdict makes of it. Review is deliberately untouched: a
review's ci leg is advisory by design and the reviewer's evidence is elsewhere. Release has no
elsewhere.

**Why `GATE_RED` outranks unmeasured.** A red leg is the more actionable fact; the unmeasured
legs still print on the `UNMEASURED:` line.

**Why first light lives in genesis and is refused by the driver.** The three failures split into
"wrong product" and "built but never ran". Only the second is inside the pipeline, and the
cheapest cure is ordering: the first brief proves the wiring with one real record before any
feature spends a spec. The refusal is on the AI session's own artifact, not on the user; the
user's decision that forcing is a discipline problem applies to gates on their actions, and this
is not one.

**Collision closure (lock, 2026-09-13).** Literal `ci never delivered a verdict`: the only live hit
outside stale `.claude/worktrees/` is `release.md` itself (a File Plan row); the leg's
`tests/review/verdict.test.js` hit is a fuzzy match with no such phrase in the file (grep
confirmed) — waived.

**Fragile.** A3's caller count is a prediction; its remedy is written. `release.md` is prose the
session executes — AC-8 pins the sentences that carry the reversal, squashed, because the file
hard-wraps.

## Canonical Delta

None — this repo has no `docs/canonical/release.md`; `release.md`, `genesis.md` and the two
script headers are the canonical surfaces and are edited in place.
