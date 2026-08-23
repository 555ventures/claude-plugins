---
date: 2026-08-23
status: implementing
tier: critical           # touches spec/bin/spec-paths (key-set edit — critical trigger per pipeline
                         # rules § Risk Tiers) and creates the single invocation point every release
                         # verdict/ledger row flows through (record wraps verdict.js)
area: release-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
build_base: main
brief: 12
open_markers: 0
---

# Release legs: the milestone gate's deterministic checklist becomes a script

## Goal

`/spec:release` is today a ~10-step prose checklist a session performs by hand every
milestone — deploy, ready check, migrations check, CI polling, e2e, substrate rows, hand-printf'd
manifest JSON, and a verdict/ledger call the session must remember on every path including the
failure paths. Every deterministic step drifts per session, and the STOP-path ledger row is
exactly the step a bailing session forgets. This spec gives release what review got in
`review-legs.js`: one script, `spec/scripts/release-legs.js`, that runs the deterministic legs,
owns every manifest row append, and owns every `verdict.js --profile release` invocation —
while `release.md` shrinks to the judgment steps (grounding interview, journey walks, promote
confirm, report). It also retires the feedback-brief flush, whose plugin-side consumer
(`/intake`) died in v7 (JJ 2026-08-23). Done means: a release session issues three script
calls plus judgment, and a red leg or an abandoned run can no longer leave the ledger silent
by omission of a hand-performed step.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | One script, `spec/scripts/release-legs.js`, with three subcommands — `stage`, `append`, `record` — resolved via a new `spec-paths release-legs` key; NO review-driver-style state machine (AC-20260823-01-1, AC-20260823-01-12) | JJ picked legs+record over a full re-entrant driver 2026-08-23: release is user-invoked and interactive (the human promote confirm already anchors the flow); the drift surface is the leg execution and the verdict call, both of which this shape removes. |
| D2 | `stage --root <dir> --manifest <path> [--out-dir <dir>]` runs the deterministic pre-promote legs in this dependency order: wave 1 in parallel = `substrate` + `ci` + `deploy` (mutually independent); `ready` only after `deploy` exits 0; `migrations` (only when the config declares a runnable `migrationsCheck` — a value present and not `"none"`) and `e2e` only after `ready` exits 0. A red `deploy`/`ready` leaves its dependent legs unrun — absent rows, never fabricated ones (AC-20260823-01-1, AC-20260823-01-2) | Mirrors review-legs' wave discipline; verdict.js already reads an absent required leg as UNVERIFIED (spiked), so an early red honestly reports "later legs never observed". |
| D3 | The `substrate` leg runs `manifest-check.sh --manifest .claude/release-manifest.json` and parses the machine sentinel `TOTAL=<n> FAILS=<n> INERT=<n>` verbatim into `{"leg":"substrate","exit":<0 if check exits 0, 1 if it exits 1>,"observed":{"checked":N,"failed":M,"inert":K}}`. Missing `.claude/release-manifest.json`, manifest-check exit 5, or an unmatched sentinel → `stage` exits 2 naming the remedy (build the release manifest per release.md Phase 1) — fail closed, never a guessed row (AC-20260823-01-4) | The sentinel is plugin-owned; if it can't be parsed the plugin drifted and a fabricated count would poison the ledger. Spiked: `TOTAL=2 FAILS=0 INERT=1` observed verbatim. |
| D4 | The `ci` leg wraps `ci-query.js --commit $(git rev-parse HEAD)` with review-legs.js's exact output→row mapping, plus the poll loop release.md used to prescribe in prose: while the run is in-progress, re-invoke every `capabilities.ciPoll.intervalSeconds` (default 30) up to `capabilities.ciPoll.timeoutSeconds` (default 600), then append `{"status":"in-progress"}`; exactly ONE ci row is appended per stage run, after the loop resolves (AC-20260823-01-6, AC-20260823-01-7) | The double-append corruption and the poll cadence were both prose rules a session could fumble; the mapping is copied from review-legs.js so the two ci consumers cannot drift apart. |
| D5 | The `e2e` leg runs `BASE_URL={stagingUrl} {e2eCommand}` and derives counts ONLY from declared capabilities: `skipped` via `skipReportPattern` (review-legs' exact tri-state route); on exit 0, `failed` = `0` and `passed` = `testsExecuted − skipped` when `testCountPattern` matched and `skipped` is numeric, else `passed` = `{"unavailable":"no-format-declared"\|"pattern-no-match"}`; on exit ≠ 0, `passed` and `failed` are both `{"unavailable":"no-format-declared"}` (no failure-count format exists as a declared capability). Literal examples: exit 0 + executed 5 + skipped 1 → `{"passed":4,"failed":0,"skipped":1}`; exit 0 + no `testCountPattern` → `{"passed":{"unavailable":"no-format-declared"},"failed":0,"skipped":…}` (AC-20260823-01-8, AC-20260823-01-9) | Extends the pinned e2e grammar so `passed`/`failed` admit the same typed unavailability `skipped` already has — the UPWELL-20260716-02 rule (never assume a count no format backs) applied to two more slots; the session-extracted-count step this replaces was model judgment on a deterministic leg. |
| D6 | The `ready` leg is a plain `curl -fsS --max-time 10 {stagingUrl}{healthPath}` (bare `stagingUrl` when no `healthPath`), retried up to 3 attempts 5 s apart, exit 0 iff any attempt succeeds. `runtime.readyCheck` is deliberately NOT reused: the contract defines it as a command probing the local boot (e.g. localhost), which is the wrong host for a deployed URL — release.md's current "readyCheck pattern applied to stagingUrl" phrasing was unimplementable as written and is corrected by this rewrite (AC-20260823-01-1, AC-20260823-01-3) | The one honest probe of a remote deploy is a request to the deployed URL; a 3×5 s window absorbs CDN/router settle without inventing a config knob. |
| D7 | `append --manifest <path> --leg journeys --walked N --failed M` and `append --manifest <path> --leg production --result <verified\|skipped\|failed>` are the SOLE emitters for the two session-observed legs: they validate the closed grammar, derive the row's `exit` (journeys: 0 iff failed = 0; production: `failed` → 1, else 0), and refuse (exit 2) a duplicate row for any leg already in the manifest (AC-20260823-01-10, AC-20260823-01-11) | Journey walks and the production version-match stay session judgment, but a hand-printf'd JSON row was an unguarded grammar surface; machine-owned appends make a malformed or double row impossible. |
| D8 | `record --root <dir> --manifest <path> [--milestone <s>] [--briefs N,N]` is the single `verdict.js --profile release --ledger` invocation point on EVERY path — early-leg STOP, red-journeys STOP, declined promote, and the Phase 4 close alike. It derives `--require migrations` itself from the config (`release.migrationsCheck` present and not `"none"`), streams verdict.js's two lines verbatim (word + ledger row), exits with verdict.js's own exit, and fails closed (exit 2, remedy named) when the child dies with a null status (AC-20260823-01-13, AC-20260823-01-14) | The migrations `--require` derivation appeared three times as prose in release.md and the STOP-path verdict call was the step a bailing session skipped; one invocation point makes both structural. Spiked: green manifest minus migrations row + `--require migrations` → UNVERIFIED exit 1. |
| D9 | `stage` refuses (exit 2) a `--manifest` file that already exists and contains rows — one fresh manifest per release run, as release.md already mandates (AC-20260823-01-5) | A re-run appending onto a stale manifest would double every leg row and corrupt verdict.js's leg map silently. |
| D10 | The feedback-brief flush is retired everywhere it lives (JJ 2026-08-23): release.md's Phase 4 step 3 deleted; doctor.md check 12 keeps the `[plugin]`-Gotchas roll-up report but drops the "offer to write them as a feedback brief" clause; `spec/templates/feedback-brief.md` deleted; the `feedback-template` spec-paths key and its usage-line mention removed; `Feedback Loop` dropped from `spec-paths`' `shared-for release` section list (AC-20260823-01-15, AC-20260823-01-16) | The consumer died in v7: no `/intake` command exists, core § Incident Policy says "no ledger row … no intake queue", and core § Feedback Loop's carrier list (ledger, retained evidence, Gotchas) never names briefs — releases were writing documents nothing reads. |
| D11 | `release.md` is rewritten to judgment steps only: Phase 0 grounding interview and shipped-brief derivation, Phase 1 release-manifest maintenance with the user, one `stage` call, journey walks + `append --leg journeys`, promote confirm + `promoteCommand` + production verify + `append --leg production`, `record`, tag, report. All leg mechanics, row grammars, and the poll loop are cited to the script (via `spec-paths release-legs`), never restated; the doc's per-leg row-shape prose (current Phase 2 preamble) moves into the script's header comment (AC-20260823-01-17, AC-20260823-01-18) | The shrink is the brief's point: prose that restates a script's contract re-drifts; the script header is the one home the emitter and its documentation share. |
| D12 | `spec/entrypoints.json` gains a `spec/scripts/release-legs.js` entry (entryPoints: `spec/commands/release.md`) and adds `spec/scripts/release-legs.js` as an entry point of `ci-query.js`, `manifest-check.sh`, and `verdict.js`; release.md's own direct rows for those scripts adjust to whatever the rewritten doc still invokes directly [no-ac: manifest bookkeeping enforced by the existing entrypoints conformance guard, which goes red on any missed entry — its own suite is the oracle] | The location-based entry-point guard demands every executable be reachable from a declared entry; the new script both is one and consumes three. |
| D13 | Version bump: `spec/.claude-plugin/plugin.json` → next free 7.x minor (7.20.0 at plan time — a stale-by-build-time target per the recorded semver-race gotcha, bump to next free and log the deviation), changelog paragraph in `description` per last-3-versions form [no-ac: version discipline enforced by review's hard-finding rule, not a test] | Behavior change ⇒ semver bump; the plugin description is the changelog surface. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/release-legs.js | CREATE | scripts | The three-subcommand release legs script (D1–D9): stage / append / record, header per script conventions (usage, dated why, deliberately-nots, exit codes 0/1/2) |
| spec/bin/spec-paths | MODIFY | scripts | Add `release-legs` key → `$ROOT/scripts/release-legs.js`; remove `feedback-template` key; update the usage line for both; drop `Feedback Loop` from the `release)` SECTIONS list (D1, D10) |
| spec/commands/release.md | MODIFY | doctrine | D11 rewrite: judgment steps + three script calls; delete the feedback flush; correct the ready-check phrasing (D6); row grammars cited to the script header |
| spec/commands/doctor.md | MODIFY | doctrine | Check 12: keep the `[plugin]`-Gotchas roll-up block, delete the feedback-brief offer clause and its `spec-paths feedback-template` reference (D10) |
| spec/templates/feedback-brief.md | DELETE | doctrine | D10 retirement — consumer died in v7 |
| spec/entrypoints.json | MODIFY | doctrine | D12 entries for release-legs.js as entry point and as caller of ci-query.js / manifest-check.sh / verdict.js |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D13 semver bump + changelog paragraph |
| tests/release-legs/release-legs.test.js | CREATE | tests | AC-20260823-01-1 … AC-20260823-01-14 — behavioral: exec the script against synthetic host trees (tmpdir, stub deploy/e2e commands, PATH-stubbed `gh` for the poll loop with fixture `ciPoll.intervalSeconds: 1`) |
| tests/release-legs/doctrine.test.js | CREATE | tests | AC-20260823-01-15, AC-20260823-01-17, AC-20260823-01-18 — release.md/doctor.md shape pins (script cited, flush gone, promote-confirm and never-push retained) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260823-01-16 (`release-legs` resolves, `feedback-template` refused) and AC-20260823-01-19 tag on the existing shared-for release assertions |
| tests/consistency/entrypoints.test.js | MODIFY | tests | Update the two comment inventories that enumerate `feedback-template` among the non-executable keys (behavioral logic is derived, comments only) |
| tests/run-ledger.test.js | MODIFY | tests | Tag the existing release.md ledger-path pin with AC-20260823-01-20 (SHALL CONTINUE TO carrier); adjust the grep only if the rewrite moved the sentence |

Orchestrator duty (outside the table): after the doctrine wave lands, re-run
`node spec/scripts/citations-check.js` expectations via the gate — the release.md rewrite must
not orphan any `§` citation (`shared-for` filtering silently drops mismatches).

## Contracts

```
release-legs.js stage  --root <dir> --manifest <path> [--out-dir <dir>]
release-legs.js append --manifest <path> --leg journeys   --walked <N> --failed <M>
release-legs.js append --manifest <path> --leg production --result <verified|skipped|failed>
release-legs.js record --root <dir> --manifest <path> [--milestone <s>] [--briefs <N,N,…>]

Exit codes (all subcommands): 0 = green/recorded (stage: every leg it ran exited green;
append: the appended row is green; record: verdict.js printed CLEAN) · 1 = red (stage: ≥1 leg
red — summary line `RED_BLOCKING: <legs>` printed, mirroring review-legs.js; append: the
appended row is red; record: verdict.js printed GATE_RED/UNVERIFIED) · 2 = usage or
precondition failure (unreadable config, missing/incomplete release block, missing or invalid
.claude/release-manifest.json, sentinel no-match, non-empty --manifest on stage, duplicate leg
on append, child died with null status) — every 2 names its remedy.

Manifest row grammar (closed; verdict.js --profile release copies observed verbatim):
  {"leg":"substrate","exit":0|1,"observed":{"checked":N,"failed":M,"inert":K}}
  {"leg":"deploy","exit":E,"observed":{"result":"pass"|"fail"}}
  {"leg":"ready","exit":E,"observed":{"result":"pass"|"fail"}}
  {"leg":"migrations","exit":E,"observed":{"result":"pass"|"fail"}}     (only when runnable migrationsCheck)
  {"leg":"ci","exit":0|1,"observed":{"conclusion":"<v>"}|{"status":"in-progress"}|{"unavailable":"no-adapter"|"transient"}}
  {"leg":"e2e","exit":E,"observed":{"passed":N|{"unavailable":R},"failed":M|{"unavailable":R},
      "skipped":K|{"unavailable":R}}}   where R ∈ "no-format-declared"|"pattern-no-match"  (D5)
  {"leg":"journeys","exit":0|1,"observed":{"walked":N,"failed":M}}      (append-only)
  {"leg":"production","exit":0|1,"observed":{"result":"verified"|"skipped"|"failed"}}  (append-only)

Config read (all keys pre-existing in the grounding contract — NO contract edit):
  release.{deployCommand, stagingUrl, e2eCommand, healthPath, migrationsCheck}
  capabilities.{skipReportPattern, testCountPattern, ciPoll.{intervalSeconds,timeoutSeconds}}
stage requires deployCommand + stagingUrl + e2eCommand; promoteCommand/productionUrl are
Phase 3 session concerns the script never reads.
```

## Behavior

- `stage` child processes run via the review-legs `sh()` discipline: `bash -c`, cwd = root,
  `NODE_TEST_CONTEXT` scrubbed, output captured to `--out-dir` files (`deploy.txt`,
  `e2e.txt`, …) named in the summary — a red leg with no retained output is undiagnosable.
- Per-leg summary lines mirror review-legs.js (`✅/❌ <leg> exit=<n> <observed JSON>`), then
  `manifest: <path>`, `outputs: <dir>`, and `RED_BLOCKING: <legs>` before a non-zero exit. In
  release every leg is blocking (verdict's release profile treats all of them as required).
- On a `stage` exit 1 the session's next step is `record` (the STOP still derives its word and
  appends its ledger row — now structurally, because record is the only path to a report).
- A user-declined promote is `append --leg production --result skipped` (exit 0 — a decline is
  not a failure), then `record`.

## Acceptance Criteria

- **AC-20260823-01-1**: WHEN `stage` runs against a synthetic host whose release block declares
  `deployCommand: "true"`, a stagingUrl served by the test (or a curl-able file URL substitute
  per the harness), `e2eCommand` a stub script, plus a valid 2-row release manifest, THE SYSTEM
  SHALL append `substrate`, `ci`, `deploy`, `ready`, `e2e` rows (no `migrations` row —
  `migrationsCheck` absent) and exit 0 — e.g. the deploy row is byte-parseable as
  `{"leg":"deploy","exit":0,"observed":{"result":"pass"}}` → tests/release-legs/release-legs.test.js
- **AC-20260823-01-2**: WHEN `deployCommand` exits 1 THE SYSTEM SHALL append
  `{"leg":"deploy","exit":1,"observed":{"result":"fail"}}`, append NO `ready`/`migrations`/`e2e`
  rows, print a line starting `RED_BLOCKING:` containing `deploy`, and exit 1 → same file
- **AC-20260823-01-3**: WHEN the staging URL refuses connections on every attempt THE SYSTEM
  SHALL append a `ready` row with `exit` ≠ 0 and `{"result":"fail"}` after ≥2 observed attempts
  (stub server counts hits), and exit 1 → same file
- **AC-20260823-01-4**: WHEN `.claude/release-manifest.json` is absent THE SYSTEM SHALL exit 2
  with stderr naming the file and the Phase 1 remedy, appending zero rows; WHEN it is valid with
  1 exec-pass + 1 inert row THE SYSTEM SHALL append
  `{"leg":"substrate","exit":0,"observed":{"checked":2,"failed":0,"inert":1}}` (the spiked
  sentinel `TOTAL=2 FAILS=0 INERT=1` transcribed) → same file
- **AC-20260823-01-5**: WHEN `--manifest` names an existing file already containing ≥1 row THE
  SYSTEM SHALL exit 2 without appending — e.g. a manifest holding one prior `deploy` row
  gains zero rows → same file
- **AC-20260823-01-6**: WHEN the host declares `capabilities.forge: "none"` THE SYSTEM SHALL
  append exactly one ci row `{"leg":"ci","exit":0,"observed":{"unavailable":"no-adapter"}}` → same file
- **AC-20260823-01-7**: WHEN a PATH-stubbed `gh` reports an in-progress run on the first
  invocation and `conclusion: success` on the second, with fixture `ciPoll.intervalSeconds: 1`,
  THE SYSTEM SHALL append exactly ONE ci row, `{"conclusion":"success"}`, exit 0 for that leg —
  never one row per poll iteration → same file
- **AC-20260823-01-8**: WHEN the e2e stub prints output matching declared `testCountPattern`
  (executed 5) and `skipReportPattern` (skipped 1) and exits 0 THE SYSTEM SHALL append the e2e
  row `{"passed":4,"failed":0,"skipped":1}` — literal `5 − 1 = 4`, never the raw executed
  count — and SHALL have exported `BASE_URL={stagingUrl}` into the child env (stub echoes it,
  test asserts on the retained e2e.txt) → same file
- **AC-20260823-01-9**: WHEN the host declares no `testCountPattern` and the e2e stub exits 0
  THE SYSTEM SHALL append `"passed":{"unavailable":"no-format-declared"}` with `"failed":0` —
  never an assumed number → same file
- **AC-20260823-01-10**: WHEN `append --leg journeys --walked 2 --failed 0` runs THE SYSTEM
  SHALL append `{"leg":"journeys","exit":0,"observed":{"walked":2,"failed":0}}` and exit 0;
  WHEN `--failed 1` the row's `exit` SHALL be 1 and the subcommand SHALL exit 1 → same file
- **AC-20260823-01-11**: WHEN `append` targets a leg that already has a manifest row THE SYSTEM
  SHALL exit 2 and append nothing (row count unchanged); WHEN `--leg production --result` is
  outside `verified|skipped|failed` THE SYSTEM SHALL exit 2 naming the closed enum → same file
- **AC-20260823-01-12**: WHEN any subcommand runs on a root whose config lacks a `release`
  block (or `stage` finds it missing `deployCommand`/`stagingUrl`/`e2eCommand`) THE SYSTEM
  SHALL exit 2 with stderr naming the missing key and the release.md Phase 0 interview as the
  remedy → same file
- **AC-20260823-01-13**: WHEN `record` runs against a config declaring
  `migrationsCheck: "true"` (runnable) and a manifest green on all seven base legs but holding
  no `migrations` row THE SYSTEM SHALL print `UNVERIFIED` (line 1, verdict.js's own output
  streamed) and exit 1 — the `--require migrations` derivation is the script's, never a caller
  flag → same file
- **AC-20260823-01-14**: WHEN `record` runs against a fully green manifest (all seven base
  legs; `migrationsCheck` absent) THE SYSTEM SHALL print `CLEAN` and append exactly ONE row to
  `.claude/spec-runs.jsonl` whose parsed fields include `"stage":"release"` and the manifest's
  observed objects copied verbatim (e.g. `"substrate":{"checked":2,"failed":0,"inert":1}`);
  a second `record` invocation appends exactly one more row (no hidden dedup) → same file
- **AC-20260823-01-15**: WHEN release.md and doctor.md are read post-rewrite THE SYSTEM SHALL
  contain no occurrence of `feedback-template`, `spec-feedback`, or `feedback brief` in either
  file → tests/release-legs/doctrine.test.js
- **AC-20260823-01-16**: WHEN `spec-paths release-legs` runs THE SYSTEM SHALL print a path
  ending `spec/scripts/release-legs.js`; WHEN `spec-paths feedback-template` runs THE SYSTEM
  SHALL exit non-zero printing the usage line (the key is retired) → tests/spec-paths.test.js
- **AC-20260823-01-17**: WHEN release.md is read post-rewrite THE SYSTEM SHALL cite
  `spec-paths release-legs` for stage/append/record and SHALL NOT contain a hand-authored leg
  row literal (no `{"leg":` outside a fenced citation of the script's own contract) — the row
  grammar's home is the script header → tests/release-legs/doctrine.test.js
- **AC-20260823-01-18**: WHEN release.md is read post-rewrite THE SYSTEM SHALL CONTINUE TO
  gate promotion behind a fresh per-run `AskUserQuestion` and SHALL CONTINUE TO state that tags
  and pushes are never the pipeline's to make (the never-autonomous rule survives the shrink)
  `[pre-green: predicate-in-test]` → tests/release-legs/doctrine.test.js
- **AC-20260823-01-19**: WHEN `spec-paths shared-for release` runs THE SYSTEM SHALL CONTINUE TO
  serve `## Release Stage` and `## Runtime Verification`, and SHALL no longer serve
  `## Feedback Loop` → tests/spec-paths.test.js (existing assertions tagged, one added)
- **AC-20260823-01-20**: WHEN release.md is read post-rewrite THE SYSTEM SHALL CONTINUE TO name
  `.claude/spec-runs.jsonl` as the single ledger the release row lands in
  `[pre-green: predicate-in-test]` → tests/run-ledger.test.js (existing pin tagged)

## Assumptions (escalation triggers)

- A1: `verdict.js --profile release` needs no edits — it already derives UNVERIFIED for a
  missing required leg before red legs (spiked: deploy-red-only manifest → `UNVERIFIED` exit 1;
  full manifest with red deploy → `GATE_RED` exit 1), honors `--require migrations` (spiked:
  green-minus-migrations → `UNVERIFIED`), and copies `observed` verbatim into the ledger row.
  **if false:** STOP — verdict.js is a critical surface owned by no row here; escalate to the
  user rather than editing it out-of-plan.
- A2: `manifest-check.sh`'s sentinel `TOTAL=<n> FAILS=<n> INERT=<n>` and exit alphabet
  (0 pass / 1 fails / 5 invalid) are stable (spiked 2026-08-23, output above; codes from its
  header). **if false:** fail-closed exit 2 branch in D3 already covers drift at run time; fix
  the sentinel parse in the same session.
- A3: `ci-query.js` prints either the canonical `unavailable — no supported forge adapter` line
  or one-line JSON `{available, transient, status?, conclusion?}` (review-legs.js parses
  exactly this today; spiked here: `{"available":false,"transient":false}` exit 0).
  **if false:** copy whatever review-legs.js's parser does at build time — the two consumers
  must stay identical.
- A4: `curl` exists on the host PATH (the ready leg shells it). The repo's own conventions
  assume only Node + jq, but release already requires a deployable host with network tooling;
  `curl` is present on every macOS/Linux base image this pipeline targets. **if false:** the
  leg's spawn-failure branch reports exit 127 as a red ready row naming curl as the missing
  binary — never a silent pass.
- A5: A PATH-stubbed `gh` can impersonate the forge for the poll-loop test (ci-query.js spawns
  bare `gh`, resolving via PATH — verified by reading its spawnSync call). **if false:** drop
  to testing the no-adapter arm (AC-6) behaviorally and pin the poll loop's single-append rule
  by asserting on a stub-transport unit seam instead; record the deviation.
- A6: No test outside the File Plan pins the retired literals (`feedback-template` etc.) —
  verified at lock via collision-closure (results in Rationale). **if false:** update the
  colliding pin in place and retag with this spec's AC-ID, never weaken it.

## Rationale

The fork that shaped everything: legs-script vs review-style state-machine driver. JJ chose
legs+record (2026-08-23) — release is rare, user-invoked, and already anchored by a human
promote confirm mid-flow, so the re-entrant-marks machinery buys little; what actually drifted
per session was leg execution, row grammar, the ci poll cadence, the migrations `--require`
derivation (stated three times in prose), and the STOP-path verdict call. All five move into
code. The full driver remains available as a later brief if release frequency grows.

`record` as the single verdict invocation point is the load-bearing move: release.md's most
fragile prose was "the STOP still runs verdict.js … the same call runs again in Phase 4" — a
rule whose entire enforcement was session diligence. Now no path reaches a report without it.

The e2e grammar widening (D5) trades a smaller ledger vocabulary for honesty: the old flow had
a model reading runner output to produce `passed`/`failed` integers with no declared format —
exactly the assumed-count class UPWELL-20260716-02 recorded. Red e2e runs now carry typed
unavailability for counts; the redness itself (exit, GATE_RED) is unaffected, and the full
runner output is retained for the report.

Feedback-brief retirement (D10) is evidence-driven, approved explicitly: v7 deleted the
`/intake` consumer, core § Incident Policy forbids intake queues, and § Feedback Loop's carrier
list never names briefs. Host→plugin signal rides the run ledgers (swept by fleet-reader) and
`[plugin]`-tagged Gotchas. Doctor's roll-up REPORT survives; only the write-a-brief offer dies.

Fragile spots for execution: the poll-loop test's PATH-stubbed `gh` (A5 fallback recorded); the
release.md rewrite colliding with prose pins outside the File Plan (collision-closure run at
lock, A6); and `stage`'s wave-1 parallelism — deploy runs concurrently with substrate/ci, which
is safe because substrate's exec rows target production-side invariants and ci reads the forge,
neither touching staging.

No regression pin for review-legs.js/spec-review-driver.js: neither file is touched, and their
own suites already pin their behavior; the one shared seam (ci-query output parsing) is copied,
not moved (A3).

Collision-closure waives (run at lock, 2026-08-23; every in-plan hit is a File Plan row above;
the 14 unplanned hits fall in three buckets, all waived): (1) `.claude/worktrees/spec-02-…/**`
copies — a live sibling build's isolated worktree; its merge-back reconciles against main, and
writing into it is forbidden; (2) `docs/roadmap/12-release-legs.md` — the originating brief,
an intent record this spec satisfies, never a live assertion of the retired step;
(3) `specs/20260820/04-entrypoint-conformance.md` — an immutable historical spec record
(retired literals survive in closed specs by design).

## Canonical Delta

docs/canonical/release-pipeline.md (create if absent): `/spec:release`'s deterministic legs,
row grammar, and verdict/ledger invocation live in `spec/scripts/release-legs.js`
(stage/append/record; grammar documented in its header). The session owns: grounding interview,
release-manifest maintenance, journey walks, promote confirm, tag, report. The feedback-brief
flush is retired as of spec 7.20.x — host→plugin signal rides run ledgers and `[plugin]`
Gotchas only.
