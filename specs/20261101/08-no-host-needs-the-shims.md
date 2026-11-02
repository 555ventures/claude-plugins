---
date: 2026-11-01
status: done
tier: critical
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-01
open_markers: 0
build_base: main
diff_base: aaab34b17bafff47a26a17fa860b07e6243aee6e
---

# No host needs the shims

## Goal

Delete the compatibility paths that no host state has needed for weeks: the genesis driver's
legacy resume (`--legacy`, the trusted-mark closure, the retired-mark refusal table), the
genesis hook's `rules-locked` design value, the queue's `auto_placed` strip, and the bespoke
"this flag is retired" stubs in four scripts whose generic unknown-flag refusal already does the
job. The ledger readers are deliberately untouched — this repo's own ledger still carries the
rows they read. Done means every named path is gone, a repo-wide sweep refuses its vocabulary
coming back, the fleet drift census over `~/projects` is byte-identical before and after, and
each script still refuses the retired input (exit 2) through its generic path.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `genesis-driver.js` loses the legacy resume outright: the `legacyResume` branch in `deriveState` and in the `BRIEF` step, the `--legacy` flag and its `[--legacy]` usage mention, the `legacyTrusted` closure trust at DECIDE/ROADMAP, and the `RETIRED_MARKS` table (the eight former design marks fall to the generic `unknown mark` refusal). The writer stops stamping `brief.legacy`: `status.brief` becomes `{mocks, ratifiedAt}`. `loadStatus` keeps reading a status that still carries `brief.legacy` or `explore` as-is — an unknown key is never a schema error. (AC-20261101-08-1, AC-20261101-08-2, AC-20261101-08-3, AC-20261101-08-4, AC-20261101-08-16) | Spike S1: 20 repos under `~/projects`, zero with `menusDone && !briefWritten`, zero with `brief.legacy: true`; the resume has had nothing to resume since 2026-09-02. Rejected: keeping `--legacy` as a refusing stub — that is the pattern this spec deletes. |
| D2 | `genesis-state-gate.sh`'s `/spec:init` arm passes only `ratified|skipped` silently; `rules-locked` leaves the case and `spec/commands/init.md`'s consume list, so a status carrying it falls to the existing `Genesis note` arm (exit 0, note printed). The partial-canon block arm (`doctrine-drafted|tokens-landed`, exit 2) STAYS — it is a guard with an engaged red fixture (`tests/consistency/red-fixture-coverage.test.js`), not a fallback. (AC-20261101-08-5, AC-20261101-08-6) | Spike S1: no repo carries `rules-locked`; the value has had no writer since 2026-09-02. Deleting the block arm would leave the hook unable to block anything — a different decision, not taken here. |
| D3 | `stripAutoPlaced` is deleted from `lib/queue.js` and from both callers (`spec-queue.js`'s persisted reconcile, `spec-status.js`'s virtual reconcile). Reconcile is dedupe + append-missing only; an `auto_placed` key on a queue item is an ordinary unknown key, preserved like any other, never written by the plugin. (AC-20261101-08-7) | Spike S1: every queue file under `~/projects` has zero `auto_placed` keys (the one textual hit is this spec's own queue prompt). Rejected: keeping the strip "because it is cheap" — a strip for a key nothing writes is a path no test can keep honest. |
| D4 | The bespoke retired-flag stubs are deleted and each script's generic refusal takes over: `verdict.js` (`--checkpoint-reason` → `usage()` exit 2), `commit-coverage.js` (`--since`/`--repos-root` → `unknown flag`), `spec-queue.js` (`--after`/`--brief` → `add: unknown flag`), `mocks-driver.js` (`--mark shell-drawn|theme-picked` → `--mark … is unknown`; `--reopen shell|theme` → `--reopen must be journey:<j>`; `client open|waive` → `unknown command "client"`). `spec-review-driver.js`'s `--skip-independence-check-because` refusal STAYS: that driver's `flag()` reader has no generic unknown-flag refusal, so deleting the stub would make the flag silently accepted — the exact outcome ADR-0005 forbids. (AC-20261101-08-8, AC-20261101-08-9, AC-20261101-08-10, AC-20261101-08-11, AC-20261101-08-12, AC-20261101-08-17) | Exit code 2 is unchanged in every case; only the message becomes the generic one. Rejected: adding a generic unknown-flag refusal to the review driver — a new surface on a critical script, out of this spec's subtraction-only scope. |
| D5 | The ledger readers are untouched: `lib/escape-row.js` keeps `backfill` in `VIA` and the single-`file` fallback in `escapeFiles`; `fleet-reader.js` keeps `escape-class`, `replay`, `observe` in `STAGES`. Only the two `fleet-reader.js` comments describing amendment-stage rows (a stage already absent from `STAGES`) are deleted. (AC-20261101-08-13, AC-20261101-08-14) | Spike S2: this repo's own `.claude/spec-runs.jsonl` holds 3 `via:backfill`, 20 legacy-`file` escape, 3 `escape-class`, 38 `replay`, 8 `observe` rows; zubu-web holds 1 legacy-`file` escape row. Deleting any reader turns in-shape history into drift-census noise. Q12's "via:backfill, amendment stage" bullet was written against the two product hosts only. |
| D6 | One new consistency test sweeps `spec/`, `tests/`, `scripts/` and `README.md` for the retired vocabulary, fragment-assembled so it never matches itself, waiving `spec/.claude-plugin/plugin.json` (the changelog surface) by path: `--legacy` (not followed by a word char or dash), `legacyResume`, `legacyTrusted`, `RETIRED_MARKS`, `brief.legacy`, `rules-locked`, `stripAutoPlaced`, `checkpointReasonArg`, `--checkpoint-reason`, `window and fleet shares`, `--after is retired`, `--brief is retired`, `shell-drawn`, `theme-picked`, `client waive`, `client open`, `{mocks, legacy, ratifiedAt}`. The same file hosts the executed generic-refusal checks of D4. (AC-20261101-08-15) | `tests/consistency/replay-retired.test.js` is the idiom; a sweep is the only test that goes red when a shim regrows as a comment or a doc line. `docs/canonical` is excluded on purpose: its delta lands at review close, after the gate. |
| D7 | Closed as out of scope with evidence: the five `spec-paths` keys with no caller (`workflows`, `review-legs`, `shared-design`, `scope-reconcile`, `ci-query`) stay [asked: the user chose to leave them — zero behaviour, hook-grade surface]; the ten over-exported library names stay [asked: the user chose to drop the trim — cosmetic]; `mocks-driver.js`'s `schemaVersion` move-aside stays (umezawabussan-web's `design/mocks/status.json` is at v1 — live); the audit's "unreferenced files" bucket is empty (spike S3: every script under `spec/scripts`, `spec/workflows`, `scripts/` is referenced by basename outside itself). [no-ac: scope ruling with executed evidence, nothing to build] | Q12 carried the audit session's lost inventory; this row is the re-derivation so the next reader never repeats it. |
| D8 | Doctrine follows the code: `spec/doctrine/genesis.md` loses the **Legacy resume** paragraph and its two `brief` shape lines read `{mocks, ratifiedAt}`; `spec/doctrine/mocks.md` loses the refused-verbs sentence; `spec/commands/init.md`'s consume arm reads `ratified` or `skipped`; `genesis-state-gate.sh`'s header no longer narrates the legacy values. The plugin bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` with a changelog paragraph that names none of D6's literals. (AC-20261101-08-15) | The sweep (D6) is what pins the prose; a changelog that spelled the literals would be the sweep's only offender, hence the path waiver and the wording rule. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1: delete `legacyResume` (derive + BRIEF step), `--legacy`, `legacyTrusted`, `RETIRED_MARKS`; `status.brief` written as `{mocks, ratifiedAt}`; usage line without `[--legacy]`; header comments 129-141 reworded |
| spec/scripts/genesis-state-gate.sh | MODIFY | scripts | D2: `ratified\|skipped) exit 0`; header comment stops naming the legacy consume value; block arm untouched |
| spec/scripts/lib/queue.js | MODIFY | scripts | D3: delete `stripAutoPlaced` and its export |
| spec/scripts/spec-queue.js | MODIFY | scripts | D3: drop the `stripAutoPlaced` import/call; D4: delete the `--after`/`--brief` branches (generic `add: unknown flag` takes over) |
| spec/scripts/spec-status.js | MODIFY | scripts | D3: drop the `stripAutoPlaced` import and call; the virtual reconcile comment stops mentioning the key |
| spec/scripts/verdict.js | MODIFY | scripts | D4: delete `checkpointReasonArg`, its parse branch and refusal block; comments 189-214/374 reworded |
| spec/scripts/commit-coverage.js | MODIFY | scripts | D4: delete the `--since`/`--repos-root` branch (generic `unknown flag` takes over) |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D4: `checkRetired` keeps only the unknown-command refusal; the four retired-verb refusals go |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D5: delete the two amendment-row comment sentences (lines 21, 462-463); no code change |
| spec/doctrine/genesis.md | MODIFY | doctrine | D8: delete the Legacy resume paragraph; brief shape `{mocks, ratifiedAt}` in § Brief State and the state-field list; BRIEF derivation sentence loses "regardless of any later legacy marks" |
| spec/doctrine/mocks.md | MODIFY | doctrine | D8: delete the refused-verbs sentence (`--mark shell-drawn` … `client waive`); the unknown-command sentence stays |
| spec/commands/init.md | MODIFY | doctrine | D8: consume arm reads `ratified` or `skipped`; partial-canon arm unchanged |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph naming no D6 literal>"`; no dependency change |
| tests/consistency/compat-retired.test.js | CREATE | tests | AC-20261101-08-8, AC-20261101-08-9, AC-20261101-08-10, AC-20261101-08-11, AC-20261101-08-12, AC-20261101-08-15 |
| tests/genesis/brief-no-shims.test.js | CREATE | tests | AC-20261101-08-1, AC-20261101-08-2, AC-20261101-08-3, AC-20261101-08-4, AC-20261101-08-16 |
| tests/genesis-gate.test.js | MODIFY | tests | AC-20261101-08-5, AC-20261101-08-6 |
| tests/queue/spec-queue.test.js | MODIFY | tests | AC-20261101-08-7, AC-20261101-08-10 |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20261101-08-17 (the retired-flag case leaves the named-refusal list) |
| tests/escape/escape-row.test.js | MODIFY | tests | AC-20261101-08-13 |
| tests/fleet-reader/slim-escapes.test.js | MODIFY | tests | AC-20261101-08-14 (tag only) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | D1/D6 collision closure: drop the `genesis-driver.js` waiver for `positions-authored`/`tiles-culled` and the waiver naming the nonexistent `tests/genesis/brief-state.test.js`; reword the D10 assertion message that names the deleted consume value |

## Contracts

```text
genesis status.json (v3) — `brief` after --mark brief-written:
  before: { mocks: "design/mocks/status.json" | null, legacy: boolean, ratifiedAt: "<ISO>" }
  after:  { mocks: "design/mocks/status.json" | null, ratifiedAt: "<ISO>" }
  read:   any extra key (legacy, explore, exploreRecord) is kept as-is and ignored.

genesis-driver.js --mark <mark>: accepted set unchanged; every other name, including the eight
  former design marks, → exit 2, stderr `unknown mark "<name>" (…)`; no `[--legacy]` in the list.

genesis-state-gate.sh, prompt /spec:init, status.design:
  ratified | skipped            → exit 0, silent
  doctrine-drafted | tokens-landed → exit 2 (unchanged)
  anything else (incl. rules-locked, pending) → exit 0 + `Genesis note:` line on stdout

Generic refusals that now cover the retired inputs (exit 2 in every case):
  verdict.js         --checkpoint-reason <x>   → stderr begins `usage: verdict.js`
  commit-coverage.js --since <x> | --repos-root <x> → stderr `unknown flag --since` / `unknown flag --repos-root`
  spec-queue.js add  --after <x> | --brief <x>  → stderr `spec-queue: add: unknown flag --after` / `… --brief`
  mocks-driver.js    --mark shell-drawn|theme-picked → stderr `--mark shell-drawn is unknown` / `--mark theme-picked is unknown`
                     --reopen shell|theme      → stderr `--reopen must be journey:<j>`
                     client open|waive         → stderr `unknown command "client"`

lib/queue.js exports: dedupeItems, reconcileMissingBriefs, … (stripAutoPlaced removed)
```

## Data Model

Genesis `status.json` only: new `--mark brief-written` writes `brief` without a `legacy` key.
existing rows: unaffected — a status already carrying `brief.legacy` (zubu-connect, umezawabussan-web
both carry `legacy: false`) is read as-is and derives the same state (AC-20261101-08-16). The
ledger (`.claude/spec-runs.jsonl`) and queue (`spec-queue.json`) shapes are not changed by this spec.

## Behavior

- **Host-state proof at build (D5), executed by the orchestrator before TESTS and recorded in the
  build report:** `node spec/scripts/fleet-reader.js --repos-root ~/projects --json` → the
  `drift.byRepo` block must be byte-identical to the pre-change run (spike S2 output: every repo's
  `drift` is `{}` or `{"pre-v7-tier":N}` only; no `via-out-of-enum`, `stage-unknown` or
  `files-missing` bucket). Any new bucket is a `blocked` return, not a fix.
- **Genesis after D1:** a status past MENUS that never ratified a brief derives DISCOVERY or BRIEF
  from its live artifacts exactly like a fresh run; on a visual archetype the BRIEF step names
  `/spec:mocks`, on a design-skipped archetype it prints the mark command. `--legacy` on argv is
  inert: the driver reads no such flag, and the mocks precondition fires as it would without it.
- **Gate after D2:** a status with `design: rules-locked` is treated as "no ratified canon": note
  printed, prompt allowed. No host carries the value; the note is the correct message if one ever
  does.
- **Flags after D4:** each retired input exits 2 through the generic path. The review driver's
  bespoke refusal is unchanged (`tests/review/disposer-gate-refusals.test.js` AC-20260901-09-8).
- **Sweep scope (D6):** `spec/`, `tests/`, `scripts/`, `README.md`; skips `node_modules`, `.git`,
  the test file itself and `spec/.claude-plugin/plugin.json`. `docs/`, `specs/` and the ledger are
  never swept.

## Acceptance Criteria

- **AC-20261101-08-1**: WHEN a root is driven to `discovery-done` with `- archetype: web-app` (a
  fully-covered brief, as `tests/genesis/genesis-driver.test.js`'s `advanceToMenus` builds one), its
  `status.json` is then edited to `marks.menusDone: true` with `marks.briefWritten` absent and no
  `design/mocks/status.json` exists, and the driver runs bare THE SYSTEM SHALL print a `## Step:
  brief` block naming `/spec:mocks` and containing no line beginning `legacy:` (e.g. stdout matches
  `/spec:mocks/` and not `/^legacy:/m`) → writes tests/genesis/brief-no-shims.test.js
- **AC-20261101-08-2**: WHEN the same root receives `--mark brief-written` followed by the retired
  flag (assembled in the test as `'--leg' + 'acy'`) THE SYSTEM SHALL exit 2 with stderr containing
  `run /spec:mocks first` and leave `marks.briefWritten` unset (the precondition fires; the flag is
  inert) → writes tests/genesis/brief-no-shims.test.js
- **AC-20261101-08-3**: WHEN `--mark positions-authored` (the test assembles the name as `'positions-' + 'authored'`, since `tests/consistency/genesis-doctrine.test.js` sweeps that literal) is passed on any root THE SYSTEM SHALL exit
  2 with stderr beginning `unknown mark "positions-authored"` and the usage list containing no
  `[--leg` + `acy]` segment (e.g. `--mark tiles-culled` → `unknown mark "tiles-culled" (discovery-done
  | brief-written | menu-written --file <f> | …`) → writes tests/genesis/brief-no-shims.test.js
- **AC-20261101-08-4**: WHEN `--mark brief-written` is accepted on a `data-ml` root THE SYSTEM SHALL
  write `status.brief` with exactly the keys `mocks` and `ratifiedAt` (e.g.
  `{"mocks":null,"ratifiedAt":"2026-11-01T…"}` — `Object.keys(status.brief)` deep-equals
  `["mocks","ratifiedAt"]`) → writes tests/genesis/brief-no-shims.test.js
- **AC-20261101-08-16**: WHEN a `status.json` is hand-written with
  `brief: {mocks: null, legacy: false, ratifiedAt: "2026-09-30T05:56:05.757Z"}`, `explore: "picked"`
  and every mark true THE SYSTEM SHALL CONTINUE TO load it without error (`--state` exits 0 and
  prints a state name, never a parse or schema refusal; e.g. stdout matches `/^[A-Z_]+$/m`)
  → writes tests/genesis/brief-no-shims.test.js
- **AC-20261101-08-5**: WHEN `/spec:init` is prompted with `.claude/genesis/status.json` carrying
  `design: "rules-locked"` THE SYSTEM SHALL exit 0 and print a stdout line beginning `Genesis note:`
  that names `BRIEF` (e.g. `{"design":"rules-locked"}` → exit 0, stdout matches `/^Genesis note:.*BRIEF/`)
  → rewrites tests/genesis-gate.test.js :: AC-20260902-08-9
- **AC-20261101-08-6**: WHEN `/spec:init` is prompted with `design: "ratified"` or `design: "skipped"`
  THE SYSTEM SHALL CONTINUE TO exit 0 with no `Genesis note:` line, and with `design:
  "doctrine-drafted"` SHALL CONTINUE TO exit 2 with stderr echoing `doctrine-drafted` and naming
  `BRIEF` (e.g. `{"design":"skipped"}` → exit 0, stdout `""`) → writes tests/genesis-gate.test.js
- **AC-20261101-08-7**: WHEN `spec-queue next` runs over a queue file holding a brief item twice and
  a spec item twice, one carrying `auto_placed: "2026-08-23T10:02:00Z"` THE SYSTEM SHALL write the
  file back with each brief/spec collapsed to its first occurrence and the `auto_placed` key still
  present on its item (e.g. 4 items → 2 items, `items[0].auto_placed === "2026-08-23T10:02:00Z"`)
  → rewrites tests/queue/spec-queue.test.js :: AC-20260903-03-5:
- **AC-20261101-08-8**: WHEN `verdict.js` receives a well-formed manifest invocation plus the retired
  reason flag (assembled as `'--checkpoint' + '-reason'`, value `x`) THE SYSTEM SHALL exit 2 with
  stderr beginning `usage: verdict.js` and print no ledger row on stdout (e.g. stdout `""`)
  → writes tests/consistency/compat-retired.test.js
- **AC-20261101-08-17**: WHEN `verdict.js` receives any of the nine remaining `--checkpoint`
  refusal cases THE SYSTEM SHALL CONTINUE TO exit 2 with stderr naming `--checkpoint` and print no
  ledger row (e.g. `--checkpoint cleared` → exit 2, stderr matches `/--checkpoint/`)
  → reuses tests/provenance/provenance.test.js :: AC-20260901-09-11
- **AC-20261101-08-9**: WHEN `commit-coverage.js --since 2026-01-01 --commit <sha>` or
  `--repos-root /x --commit <sha>` runs THE SYSTEM SHALL exit 2 with stderr containing `unknown flag
  --since` / `unknown flag --repos-root` and not the phrase `window and fleet` (e.g. `--since
  2026-01-01` → `commit-coverage: unknown flag --since`) → writes tests/consistency/compat-retired.test.js
- **AC-20261101-08-10**: WHEN `spec-queue add x --after q1` or `spec-queue add --brief 05` runs in a
  repo THE SYSTEM SHALL exit 2 with stderr containing `add: unknown flag --after` / `add: unknown flag
  --brief` and write no queue file (e.g. `add --brief 05` → `spec-queue: add: unknown flag --brief — …`)
  → rewrites tests/queue/spec-queue.test.js :: AC-20260903-03-9
- **AC-20261101-08-11**: WHEN `mocks-driver.js --root <r> --mark shell-drawn` or `--mark theme-picked`
  runs on a fresh root THE SYSTEM SHALL exit 2 with stderr containing `--mark shell-drawn is unknown`
  / `--mark theme-picked is unknown` and the remedy list `seed-done|journey-drawn|journey-approved|approved`
  (e.g. `--mark shell-drawn` → `mocks-driver: --mark shell-drawn is unknown — remedy: --mark seed-done|…`)
  → writes tests/consistency/compat-retired.test.js
- **AC-20261101-08-12**: WHEN `mocks-driver.js --root <r> --reopen shell` runs THE SYSTEM SHALL exit 2
  with stderr containing `--reopen must be journey:<j>`; and WHEN `client waive` or `client open` runs
  THE SYSTEM SHALL exit 2 with stderr containing `unknown command "client"` (e.g. `client waive` →
  `mocks-driver: unknown command "client" — remedy: run with no argument…`) → writes tests/consistency/compat-retired.test.js
- **AC-20261101-08-13**: WHEN `validateEscapeRow` receives `{stage:"escape", spec:"specs/a.md",
  file:"x.js", via:"backfill", class:null, sha:null}` THE SYSTEM SHALL CONTINUE TO return `[]` and
  `escapeFiles` SHALL CONTINUE TO return `["x.js"]` (e.g. `{file:"x.js"}` → `["x.js"]`;
  `{files:["a","b"]}` → `["a","b"]`) → writes tests/escape/escape-row.test.js
- **AC-20261101-08-14**: WHEN the fleet reader scans a repo whose ledger holds a legacy `file` escape
  row, a slim `files` escape row and an `escape-class` row THE SYSTEM SHALL CONTINUE TO count all
  three in shape with an empty drift census for that repo (e.g. `drift: {}`)
  → reuses tests/fleet-reader/slim-escapes.test.js :: AC-20261025-02-3
- **AC-20261101-08-15**: WHEN every file under `spec/`, `tests/`, `scripts/` and `README.md`
  (skipping `node_modules`, `.git`, the sweep's own file and `spec/.claude-plugin/plugin.json`) is
  read THE SYSTEM SHALL find zero occurrences of each D6 literal, matching `--legacy` only when not
  followed by `[\w-]` (e.g. `--legacy-peer-deps` → no hit; `--mark brief-written --legacy` → hit),
  and the failure message SHALL list every `<path> :: <literal>` hit → writes tests/consistency/compat-retired.test.js

## Assumptions (escalation triggers)

- A1: No status.json under `~/projects` has `marks.menusDone` true with `marks.briefWritten`
  absent, and none has `brief.legacy: true`. **Spike S1 (executed 2026-11-01):** 20 repos scanned;
  genesis status present in 3 — zubu-connect (`design: skipped`, `brief.legacy: false`, all marks
  true), umezawabussan-web (`design: ratified`, `brief.legacy: false`, all marks true), zubu-menu
  (`design: skipped`, no `marks`, no `brief`); `--state` on the three prints `GROUNDED`, `ROADMAP`,
  `DISCOVERY` — none is the legacy-resume shape. No repo carries `rules-locked`; every
  `spec-queue.json` (claude-plugins, umezawabussan-web, zubu-ai, zubu-connect, zubu-dashboard,
  zubu-menu, zubu-web) has zero `auto_placed` keys. — **if false:** STOP, ask the user which host
  is mid-resume; the deletion waits for that host to ratify.
- A2: The ledger readers must keep reading what the fleet has written. **Spike S2 (executed):**
  `fleet-reader.js --repos-root ~/projects --json` → 8 ledgers, every `drift` bucket is `{}` or
  `{"pre-v7-tier":N}`; this repo's ledger: `via` ∈ {backfill 3, commit 7, direct 2, driver 24,
  loop 378, manual 16, spec-fix 15}, `stage` includes escape-class 3, observe 8, replay 38; 20
  escape rows with `file:`; zubu-web: 1 escape row with `file:`. — **if false** (a bucket
  appears after the change): the worker returns `blocked`; D5 is the ruling, no reader is edited.
- A3: Each script in D4 has a generic refusal that fires on the retired input. **Verified by
  reading:** `verdict.js` parser `else { usage(); process.exit(2) }`; `commit-coverage.js` `else
  die('unknown flag ' + a)`; `spec-queue.js` `else if (/^--/.test(a)) … unknown flag`;
  `mocks-driver.js` `--mark … is unknown` (line 781), `--reopen must be journey:<j>` (cmdReopen),
  `unknown command` (checkRetired's last branch). `spec-review-driver.js` has none (`flag()` only
  reads) — hence D4 keeps its stub. — **if false:** the stub for that script stays and the AC is
  retagged `[pre-green: fallback-rejection]` is NOT allowed — return `blocked` and name the script.
- A4: Nothing under `spec/scripts`, `spec/workflows`, `scripts/` is an orphan file. **Spike S3
  (executed):** basename sweep (with and without extension) over the repo minus `specs/`,
  `docs/roadmap|adr|audit` → zero files with no reference outside themselves (`lib/driver-core.js`
  is required by two drivers). — **if false:** the orphan is listed in a `spec-queue add` for a
  later direct-lane delete, never deleted here.
- A5: `tests/genesis/brief-state.test.js` does not exist (the waiver in `genesis-doctrine.test.js`
  is stale). **Verified:** `tests/genesis/` holds no such file. — **if false:** keep the waiver.

## Rationale

Q12 was queued nine minutes before the audit report that was supposed to carry its inventory,
and the report never got one — so the first job here was to re-derive the list against the
real fleet, not the two product hosts the earlier session had in view. That re-derivation changed
the shape of the work in two places. First, the "ledger enum" bullet is wrong for this repo: the
plugin's own ledger is the oldest in the fleet and still holds every row shape the readers
tolerate, so D5 keeps the readers and makes the fleet census the proof. Second, the review
driver's retired-flag refusal is not a shim but the only thing standing between a stale doctrine
copy and a silently accepted override, because that driver never grew a generic unknown-flag
path; deleting it would recreate the ADR-0005 hole. Every other stub sits behind a generic
refusal, so the exit code survives and only the wording changes.

The genesis cut is the largest and the safest: the legacy resume existed for a status frozen
mid-run on 2026-09-02, and twenty repos later none is in that shape. The hook change is
deliberately minimal — `rules-locked` is the only consume-side legacy value; the block arm is a
guard with a red fixture and keeping it costs nothing.

The user chose to leave the five uncalled `spec-paths` keys and the ten over-exports: both are
zero-behaviour edits on surfaces where a slip is silent. Those rulings are recorded in D7 so the
next audit does not re-open them without new evidence.

Fragile: the sweep bans `rules-locked` and `--legacy` across `tests/`, so every test that today
spells them as input-under-test is rewritten in this spec (gate test, doctrine-sweep waivers,
provenance case). A worker who adds a new test spelling a retired literal plainly will see the
sweep go red — assemble from fragments, as the idiom does.

Collision closure (executed at lock with `--literal rules-locked stripAutoPlaced checkpoint-reason
RETIRED_MARKS legacyResume shell-drawn`): every live-surface hit is a File Plan row. Waived:
`docs/adr/0005-disposer-replaces-session-checkpoint.md`, `docs/roadmap/18a-checkpoint-fail-closed.md`,
`docs/roadmap/18b-disposer-and-run.md` — dated records that name the retired flag as history, never
edited. The `executes` hits (tests that run the touched scripts) stay green by construction: every
change is to a retired input's refusal wording or to a dead branch no live fixture reaches.

Build deviations (folded at close, 2026-11-01; each a recurrence of an existing Gotchas entry,
so none earns a new one — the Gotchas section is at its 15-entry cap):
- RED_FINDINGS `gutted-rewrite`: AC-17's pointer verb fixed from `rewrites` to `reuses` — its text
  is CONTINUE TO (§ Gotchas red-check entry, "fix the verb").
- RED_FINDINGS `broken-reuse`: AC-6's pointer changed to `writes tests/genesis-gate.test.js` —
  AC-5 rewrites the same named case red, so it could not also be a green reuse target.
- The orchestrator reworded AC-16's test title to say "a legacy brief key" instead of the dotted
  literal, which the AC-15 sweep banned. No assertion changed.
- `mocks-driver.js`'s not-confirmed remedy now reads "the client visits <link>" (was "opens"):
  the `client open` ban is a bare substring (§ Gotchas, tenth trigger). No test pinned the old
  wording.
- Host-state proof (Behavior, D5): `fleet-reader.js --repos-root ~/projects --json`
  `driftCensus.byRepo` drift buckets identical before and after the change (8 repos; only
  `{}` / `pre-v7-tier`).

### Advisory debt (review rv_dcdba3f101b5)
- a0 /home/jj/projects/claude-plugins/.claude/worktrees/spec-08-no-host-needs-the-shims/spec/scripts/genesis-driver.js:2354 — genesis-driver.js still narrates a 'legacy run' category in five comments after D1 deleted the only thing that made a run legacy (the resume path and brief.legacy). Lines 197, 508, 2354, 2687 and 3062 say 'legacy or skipped-stage host' / 'legacy and non-visual runs see none of this' while the header's Applicability line at 139 was reworded to drop the word. Not a D6 literal (the sweep bans specific tokens, not the word), so no test pins it.
- a1 /home/jj/projects/claude-plugins/.claude/worktrees/spec-08-no-host-needs-the-shims/spec/scripts/genesis-state-gate.sh:17 — genesis-state-gate.sh header comment grammar slip introduced by this diff: 'the blocked message for the partial-canon values doctrine-drafted/ tokens-landed reads to "re-run /spec:genesis to reach BRIEF"' — the rewording turned 'is reworded to' into 'reads to'.

## Canonical Delta

- `docs/canonical/genesis.md`, the sentence "A legacy status past MENUS resumes at BRIEF via
  `--mark brief-written --legacy` (no re-run forced); the init hook accepts `design: ratified` and
  still blocks on a partial legacy canon." becomes: "A status past MENUS that never ratified a brief
  derives BRIEF from its live artifacts exactly like a fresh run — there is no legacy resume and no
  resume flag; `status.brief` is `{mocks, ratifiedAt}`. The init hook passes `design: ratified` or
  `skipped` silently, prints its note for any other value, and still blocks on a partial canon
  (`doctrine-drafted`/`tokens-landed`). (specs/20261101/08-no-host-needs-the-shims.md D1, D2)"
- `docs/canonical/scripts.md`, new bullet at the end: "**A retired flag is refused by the script's
  generic unknown-flag path, never by a bespoke stub.** A stub that names a retired flag is a
  compatibility path that outlives the state it served; the one sanctioned exception is a script
  with no generic refusal (`spec-review-driver.js`'s `flag()` reader), where the bespoke refusal IS
  the guard. The ledger readers (`lib/escape-row.js`, `fleet-reader.js` `STAGES`) keep every shape
  the fleet has ever written — the plugin's own ledger is the oldest and still carries them; the
  proof for any reader change is a byte-identical fleet drift census.
  (specs/20261101/08-no-host-needs-the-shims.md D4, D5)"
