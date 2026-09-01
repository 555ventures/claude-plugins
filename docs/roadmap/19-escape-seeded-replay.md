# 19 — Escape-seeded replay: classify escapes, derive the corpus, make recurrence count

Phase: P2
Depends on: 17 (fleet evidence reader — the numbers below come from it)

## Why this brief

The pipeline has two ground-truth signals (core § Feedback Loop): the escape ledger and the
replay catch-rate. Measured 2026-09-01 they do not meet:

- **Replay is saturated.** 8 of 8 injected mutations in this repo were caught; the corpus is
  six hand-authored classes (`replay-corpus.md`, JJ-confirmed 2026-08-19 over escape-derived
  because "the escape ledger holds too few rows today").
- **Escapes keep happening and are mostly unclassed.** Fleet-wide: 35 escape rows past CLEAN
  verdicts, 31 with no kill match, **11 with a class, 24 without**, 8 distinct class values,
  exactly one class (`prefix-collision-coverage-fail-open`, 4) reaching the third-recurrence
  bar that core § Incident Policy needs before a standing guard may exist.
- **Nothing validates a class.** `escape.md` derives `class` and allows `null`; no script
  checks it. `replay.js --class` accepts any string (`replay.js:234`). The fleet reader's
  `unclassed` is a computed bucket that absorbs missing, null, and malformed values alike.
- **Kill-match is starved at the source.** Of 52 retained review artifacts here, 2 carry a
  non-empty `killed[]`, and killed entries have no file/line — so `killedMatch` is null on most
  escapes and cannot say what the reviewer dismissed.

The 2026-08-19 ruling's reopen condition is half met: enough rows exist (35), but not enough
classified ones (11). So the corpus cannot be derived first; the classes must exist first.

## Result

Every escape row carries a validated class or an explicit `unclassed-reason`; the 24 unclassed
fleet rows are backfilled by amendment rows, derived from their fix diffs and confirmed in one
table. The replay corpus has a derived section: every class with two or more fleet recurrences
and no corpus entry is surfaced by the fleet reader, and its recipe is authored once from the
escape's own fix diff with the ledger rows cited. `replay.js` validates `--class` against the
corpus ids and prefers under-replayed derived classes when due. The third-recurrence rule fires
on real counts. Reviewer changes (model, effort, legs) become measurable.

## Current state

- `spec/commands/escape.md` step 4 — `class` derived, `null` when underivable, no validator;
  row appended by the session with `printf`, no script owns escape.
- `spec/scripts/replay.js` — class chosen by the session from the corpus prose (fewest rows
  first); `--record --class` unvalidated; `--due` every 5th review; `--stats` byClass keyed on
  the raw value; `--score` mechanical (hunk ±5 lines).
- `spec/doctrine/replay-corpus.md` — six classes with recipe, leg-invisibility requirement,
  worked example; refresh rule: at least once per major version, and a real escape revealing a
  new blind-spot shape folds in as a new class.
- `spec/scripts/fleet-reader.js:280-311` — `byClass`, `recurrentUnguarded` (≥3, excludes
  `unclassed`); drift census has no reason for a missing class.

## Scope

1. **Class contract** — one deterministic script owns escape-row validation (class shape,
   enum for `preventedBy`, `unclassed-reason` required when class is null); `escape.md` calls
   it before the append; the fleet reader's drift census flags rows that fail it. A class
   registry is derived, never stored: corpus ids ∪ ledger class values.
2. **Backfill** — one session run over the 24 unclassed fleet rows: derive each class from the
   escape's spec, file, and fix diff (Sonnet, path-only inputs), present ONE confirmation table
   (core § Question Style: derive, then confirm), and append `stage:"escape-class"` amendment
   rows keyed by the original row's `ts`+`spec`+`file` — the ledger stays append-only.
   The fleet reader joins amendments when counting.
3. **Corpus derivation** — the fleet reader prints "classes with ≥2 recurrences and no corpus
   entry"; for each, the session authors one corpus section (recipe from the fix diff,
   leg-invisibility requirement, worked example = the real escape, ledger rows cited) under a
   `## Derived classes` heading. The six hand-authored classes stay until a derived class
   supersedes each by name. `replay.js --class` validates against the corpus ids; selection
   prefers derived classes with the fewest replay rows.
4. **Kill-match input** — reviewer returns carry `file`/`line` on killed claims as on survivors
   (reviewer agent contract), so future `killedMatch` derivations can match on location.
5. **Admission-bar hookup** — the recurrence count the bar cites comes from the joined
   (row + amendment) count; the bar's Materiality field says so.

## Out of scope

- The reviewer-model experiment (Claude Fable 5.1 at low effort as reviewer) — a later brief,
  admitted once this brief's catch-rate can discriminate.
- Unified build loop — brief 18 (its `via` field is what this brief's instrument will split on).
- Second general reviewer — core § Tiers rules against it; only a sustained replay miss-rate
  reopens it (core § Feedback Loop).
- Retained-artifact retention policy — brief 14.

## Grounding

- `spec/doctrine/core.md` § Feedback Loop (two ground-truth signals; replay cadence policy),
  § Incident Policy (third recurrence; admission bar; fleet reader as evidence source).
- `spec/doctrine/replay-corpus.md` preamble — refresh rule and the 2026-08-19 ruling.
- JJ ruling 2026-08-19: corpus hand-authored until the escape ledger can grow one.
- Fleet reader output 2026-09-01: escapes 35 / classed 11 / unclassed 24 / distinct 8;
  replay rows 8/8 caught here; artifacts 52 with 2 non-empty `killed[]`.

## Open questions for planning

- Amendment rows vs in-place ledger edits for the backfill — the ledger has never been edited
  in place; confirm the append-only rule holds even for a data repair.
- Minimum recurrence to derive a corpus class: 2 (grow the corpus fast) or 3 (match the
  guard bar)?
- Class taxonomy: open kebab-case ids (today) vs a fixed list — open keeps derivation honest,
  fixed keeps recurrence counting stable; a normalizer (alias table) may be the middle.
- How much of the 24-row backfill can be derived without a fix diff (rows whose fix commit is
  not locatable) — those may have to carry `unclassed-reason: no-fix-diff`.
