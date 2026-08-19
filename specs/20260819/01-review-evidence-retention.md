---
date: 2026-08-19
status: implementing
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260819/02-mutation-replay.md]
open_markers: 0
diff_base: 0474ac30657515ab82569452ada920e5983a8909
brief: 14
---

# Reviewer evidence retention, a plan trace, and the ground-truth standing

## Goal

Make reviewer conduct auditable after the fact and give the plan stage a ledger presence.
After this spec: every authoritative review verdict persists the reviewer's full structured
return (survivors, killed, executed repro evidence) as a durable artifact keyed by the
ledger row's `runId`; `/spec:escape` reads that artifact to derive `killedMatch` instead of
relying on user memory; every spec lock appends a `stage:"plan"` ledger row of executed
facts; and core.md names the two ground-truth signals (escape ledger, replay catch-rate)
that self-reported review quality is subordinate to. Done = retention demonstrated by
executed tests; the doctrine edits landed and reviewer-verified.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `verdict.js` gains `--retain <dir>`: on the review profile with `--ledger` AND `--workflow`, the flag is REQUIRED (absent → exit 2 naming `--retain .claude/spec-runs` as the remedy) and writes `<dir>/<runId>.json` (dir created if missing) — the full-fidelity evidence artifact (AC-20260819-01-1, AC-20260819-01-2, AC-20260819-01-3) | The runId incident (20260818/01 D5) proved choreography forgets flags; a required flag in the sole verdict derivation is the fail-closed seat — rejected alternative: optional flag (silently rots to evidence-less rows forever) |
| D2 | No-workflow `--ledger` invocations (Phase 0 hard-stop rows) do not require `--retain`; when it is passed anyway, the artifact is written with `reviewer: null` (manifest legs only) (AC-20260819-01-4) | No reviewer ran, so requiring retention would block the stop-path row 20260813 D3 exists to keep; uniform flag semantics beat a third arm |
| D3 | `--retain` on `--profile release` is a usage error, exit 2 (AC-20260819-01-5) | Release rows carry no runId and no reviewer return — accepting the flag would mint an artifact nothing can key or read |
| D4 | The stdout and ledger contracts are byte-unchanged: line 1 verdict word, line 2 ledger row, legs `observed` still truncated at 120 in the row, `findings` keeps its seven keys, no new row key (the artifact path is derivable as `<dir>/<runId>.json`) (AC-20260819-01-6, AC-20260819-01-7) | Every existing consumer indexes stdout lines [0]/[1] (grep-verified 2026-08-19); the retained file is the full-fidelity home, the row stays the summary |
| D5 | review.md threads `--retain .claude/spec-runs` on every Phase 2 authoritative pass (fix-delta iterations included); Phase 0's hard-stop invocation stays retain-free; Phase 3's hygiene sweep names `.claude/spec-runs/*.json` from this run as expected artifacts that ride the close commit — kept, never deleted as scratch [no-ac: doctrine choreography; regex-over-prose pins are unsanctioned (Test Rules) — the reviewer verifies the hunks against this row] | The hygiene sweep deleting reviewer output is the exact defect brief 14 names; the artifact must survive Phase 3 and merge back with the branch |
| D6 | plan.md lock appends ONE ledger row (`printf '%s\n' '<json>' >>`, escape.md's mechanism): `{"ts","stage":"plan","spec","tier","brief","spikes":N,"promiseSweep":{"rows","carried","sanctioned","orphans"},"collisions":{"hits","waived"}` (omitted when the closure never ran)`,"verdict":"locked"}` — executed facts only, never prose or judgment self-scores [no-ac: doctrine choreography, same sanction as D5] | JJ ruling 2026-08-19: the row over spec-is-the-ledger — plan becomes visible to ledger tooling; the schema asserts only what the session executed (spike count, sweep counts, closure counts), so the row cannot flatter itself |
| D7 | escape.md steps 3–4: when `.claude/spec-runs/<reviewRunId>.json` exists, the session reads its `killed[]` claims and DERIVES `killedMatch` (user confirms the derivation); user memory becomes the fallback, used only when no artifact exists [no-ac: doctrine choreography, same sanction as D5] | killedMatch is the ledger's strongest re-tuning signal and today lives "only in the user's memory" (escape.md's own words) — retention makes it derivable, and derive-don't-interview is standing doctrine |
| D8 | core.md § Feedback Loop names the standing: the escape ledger and reviewer replay catch-rate (brief 14's harness, sibling spec 02) are the pipeline's only two ground-truth signals; self-reported review quality is explicitly subordinate; retained evidence artifacts and plan rows join the carriers list [no-ac: doctrine invariant text, same sanction as D5] | The brief's fourth Scope item verbatim; Feedback Loop is the one binding home for ledger-carrier doctrine |
| D9 | Existing verdict.test.js invocations that pass `--ledger` + `--workflow` on the review profile are updated in place to add `--retain <tmpdir>` — colliding pins per the standing Gotcha, never weakened, never left red [no-ac: mechanical flag threading; the retagged pins' own asserts are the coverage and the suite gate is the oracle] | D1 makes the flag required, which reddens ~19 green invocations by construction; the additive-flag variant of the exhaustive-pin collision (20260818/01 D8's shape) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | MODIFY | scripts | D1–D4: --retain parsing, requiredness matrix, artifact write, release rejection; header usage + Exit codes note updated |
| spec/commands/review.md | MODIFY | doctrine | D5: Phase 2 authoritative-pass flag, Phase 3 hygiene-sweep carve-out |
| spec/commands/plan.md | MODIFY | doctrine | D6: lock step 3.5 — append the plan row before the status flip |
| spec/commands/escape.md | MODIFY | doctrine | D7: retained-evidence read in steps 3–4; killedMatch derivation order |
| spec/doctrine/core.md | MODIFY | doctrine | D8: Feedback Loop ground-truth standing + carriers |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version 7.2.0 → 7.3.0; description changelog paragraph (last-3-versions form) |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260819-01-1 … -7; D9 flag threading through existing pins |

## Contracts

Retained evidence artifact — `<retainDir>/<runId>.json`, written atomically (temp + rename)
by verdict.js on every review-profile `--ledger` invocation that has `--retain`:

```
{
  "runId":   "<the row's runId — passed --run-id verbatim, else the generated rv_ id>",
  "ts":      "<ISO-8601, same instant as the ledger row>",
  "spec":    "<--spec value>",
  "tier":    "<--tier value>",
  "iteration": N,
  "scope":   "<workflow.scope>",            // null on a no-workflow write
  "verdict": "<derived word>",
  "dispositions": {"waived": N, "rejected": N, "fixDispatched": N},
  "legs":    [ <manifest rows VERBATIM — observed untruncated> ],
  "reviewer": <the --workflow file's parsed JSON verbatim: survivors[] and killed[]
               with their evidence strings intact>   // null when --workflow absent (D2)
}
```

Requiredness matrix (review profile only; release rejects the flag, D3):

```
--ledger + --workflow + --retain   → row + artifact (reviewer block present)
--ledger + --workflow, no --retain → exit 2: "authoritative review rows must retain
                                     evidence — add --retain .claude/spec-runs"
--ledger, no --workflow            → row as today; --retain optional (reviewer: null)
no --ledger                        → --retain ignored-with-warning? NO — exit 2 usage
                                     (retention without a row has no runId to key)
```

Plan ledger row (D6, appended by plan.md lock choreography):

```
{"ts":"<ISO-8601>","stage":"plan","spec":"<repo-relative spec path>","tier":"<tier>",
 "brief":"NN"|"n/a","spikes":N,"promiseSweep":{"rows":N,"carried":N,"sanctioned":N,
 "orphans":0},"collisions":{"hits":N,"waived":N},"verdict":"locked"}
```

Fixed shape — numbers, enums, and paths only, never prose (escape-row discipline). `spikes`
counts executed micro-spikes recorded in Assumptions; `promiseSweep` copies the lock run's
printed counters verbatim; `collisions` is omitted entirely when no Decision triggered the
closure sweep.

## Behavior

The review flow this changes: the Phase 2 authoritative pass gains one flag, and a new
`.claude/spec-runs/<runId>.json` appears in `git status` before the close commit — Phase 3
adjudicates it as expected and commits it, so the evidence merges back with the branch and
is readable forever at the path the ledger row's `runId` implies. Fix-delta iterations each
retain their own artifact under their own runId; the escape flow correlates on the LAST
review row, whose artifact reflects the verdict that actually closed the spec. A plan
session's lock now ends with one mechanical append — the same printf discipline escape.md
already uses — before the status flip, so an interrupted lock leaves either no row or a
complete one, never a partial.

## Acceptance Criteria

- **AC-20260819-01-1**: WHEN verdict.js runs the review profile with `--ledger`,
  `--workflow`, and `--retain <dir>` THE SYSTEM SHALL write `<dir>/<runId>.json` carrying
  the derived verdict, dispositions, every manifest leg row with `observed` untruncated,
  and the workflow return verbatim (e.g. a leg row whose `observed` is 300 chars → ledger
  row slice of 120, artifact string all 300 bytes; `reviewer.survivors[0].evidence`
  byte-equal to the workflow file's) → new tests in tests/review/verdict.test.js
- **AC-20260819-01-2**: WHEN the review profile runs with `--ledger` and `--workflow` but
  no `--retain` THE SYSTEM SHALL exit 2 with a message naming `--retain .claude/spec-runs`
  as the remedy and print no verdict word (e.g. the AC-1 fixture minus the flag → exit 2,
  stderr contains `--retain`) → same file
- **AC-20260819-01-3**: WHEN retention runs THE SYSTEM SHALL name the artifact by the
  row's runId — creating `<dir>` if missing (e.g. `--run-id wf_abc123` → `wf_abc123.json`;
  no `--run-id` → filename matching `^rv_[0-9a-f]{12}\.json$` equal to the row's generated
  `runId`) → same file
- **AC-20260819-01-4**: WHEN `--ledger` runs without `--workflow` (the hard-stop row) THE
  SYSTEM SHALL not require `--retain`, and WHEN `--retain` is passed on that invocation THE
  SYSTEM SHALL write the artifact with `"reviewer": null` and the legs verbatim (e.g. the
  GATE_RED fixture + `--retain <tmpdir>` → exit 1, artifact exists, `reviewer` is null) →
  same file
- **AC-20260819-01-5**: WHEN `--profile release` is passed with `--retain` THE SYSTEM
  SHALL exit 2 as a usage error (e.g. a green release manifest + `--retain <tmpdir>` →
  exit 2, no artifact written) → same file
- **AC-20260819-01-6**: WHEN `--ledger` prints a review row THE SYSTEM SHALL CONTINUE TO
  truncate each leg's `observed` at 120 chars and carry exactly the seven `findings` keys —
  retention adds no ledger key (e.g. the AC-1 fixture's row: `observed.length === 120`,
  `Object.keys(row.findings).length === 7`) → same file
- **AC-20260819-01-7**: WHEN retention succeeds THE SYSTEM SHALL CONTINUE TO print exactly
  the verdict word as stdout line 1 and the ledger row as stdout line 2 with nothing after
  (e.g. the AC-1 fixture → `stdout.trim().split('\n').length === 2`) → same file

## Assumptions (escalation triggers)

- A1: No consumer indexes verdict.js stdout beyond lines [0] and [1], and no pin asserts an
  exact stdout line count that D4 would violate — verified by grep 2026-08-19 (all 19
  `--ledger` pin sites split and index [0]/[1] only) — **if false:** update the pin in
  place per the colliding-pin Gotcha, never weaken.
- A2: A directory named `.claude/spec-runs/` is invisible to every ledger reader —
  verified by execution 2026-08-19: synthetic root with `.claude/spec-runs/rv_abc.json`
  present → `spec-status --json` exits 0, zero anomalies (readLedgerRows globs
  `^spec-runs.*\.jsonl$` files only) — **if false:** STOP, ask the user (the dir name is
  the JJ-ratified artifact home).
- A3: The authoritative verdict invocation runs with cwd = repo root, so the relative
  `--retain .claude/spec-runs` resolves correctly — review.md already appends the ledger
  cwd-relative on the same step — **if false:** review.md passes the absolute path.
- A4: Version 7.3.0 is free at build time — **if false:** bump to the next free version
  and log the deviation (standing Gotcha: concurrent sessions race the semver).

## Rationale

Brief 14's first finding is that the reviewer is the one pipeline component whose work is
argued, not executed-and-retained: its return lives in a mktemp file, its scratch dies in
the Phase 3 sweep, and the ledger keeps counts. Retention placement fell to verdict.js
(not review.md choreography, not review-legs.js) because the script already holds every
input the artifact needs at the only moment they coexist — the manifest, the workflow
return, the dispositions, and the runId it mints — and because the runId incident showed
choreography-carried duties rot silently. Making the flag REQUIRED on the authoritative
invocation is the fail-closed half: a review that forgets retention now fails loudly at
verdict time instead of succeeding amnesiac. The artifact home `.claude/spec-runs/`
(JJ-confirmed 2026-08-19) matches the ledger's pipeline-owned location; unique runId
filenames cannot merge-conflict, and because the close commit ships them, they travel with
merge-back — collapsing the "beside the spec travels better" argument. Repro transcripts
are inlined verbatim, not referenced: the workflow return already carries them, and a
reference to a deleted scratch path is exactly the auditability hole being closed. The plan
row (JJ-confirmed over declaring the spec to be plan's ledger) deliberately records only
executed counters; a "lock quality" self-score was rejected as self-report — the brief's
fourth item makes that subordination explicit doctrine. No collision-closure run: no
Decision retires or narrows a literal (D1–D9 are additive; D5's sentence edit keeps every
existing literal). Fragile to watch: D9's flag threading touches ~19 pinned invocations —
a worker must add the flag and a tmpdir, never relax an assert to get green.

## Canonical Delta

Append to the verdict paragraph of `docs/canonical/review.md` (after the 20260818/01
addition):

> Every authoritative review verdict also retains its evidence: verdict.js requires
> `--retain .claude/spec-runs` alongside `--ledger --workflow` and writes
> `.claude/spec-runs/<runId>.json` — the manifest legs untruncated plus the reviewer's
> survivors/killed with their executed repro evidence verbatim. The artifact rides the
> close commit and merges back; `/spec:escape` derives `killedMatch` from it. Plan locks
> append a `stage:"plan"` ledger row of executed facts (spike count, promise-sweep
> counters, collision counts). The escape ledger and replay catch-rate are the pipeline's
> two ground-truth signals; self-reported review quality is subordinate to both.
> (specs/20260819/01-review-evidence-retention.md)
