---
description: Record a defect that escaped a spec's review — one ledger row pointing back at the review run that passed it; the ground truth that makes CLEAN verdicts falsifiable
argument-hint: <defective file or spec path> [short defect description — used to locate, never stored]
---

# Spec Escape: Record a Defect the Pipeline Missed

An **escape** is a real defect found *after* `/spec:review` closed the spec that built the
code — found by you, by a later spec's build/review tripping over it, or in production.
Recording escapes is what makes the run ledger's quality story falsifiable: a CLEAN verdict
with no escapes behind it is evidence the review was trustworthy (or safe to cut); a CLEAN
verdict contradicted by an escape is a miscalibrated filter. This command records exactly
ONE ledger row and fixes nothing — the fix goes through the normal flow (direct work, or a
new spec).

Commit-time capture already covers the common case: `/git:commit` offers an escape row
whenever a fix-shaped commit touches spec-landed lines. This command remains the path for
everything that offer misses — escapes found by inspection, a later spec, or production,
with no commit in the loop to trigger the offer.

**Intended model: Sonnet or Haiku.** Mechanical: locate, correlate, classify, append.

## Input

`$ARGUMENTS` — the defective file's repo-relative path (preferred) or the spec path, plus a
short description of the defect. The description is used only to locate and classify — it is
**never written to the ledger**.

## Steps

1. **Locate the spec.** If the argument is a spec path, use it. Otherwise grep `specs/**`
   for the defective file's path (File Plan / manifest sections). One hit → that spec.
   Multiple hits → `AskUserQuestion` with the candidates. Zero hits → the code wasn't
   spec-built; say so and STOP (the ledger measures the pipeline, not the repo — nothing to
   correlate).
2. **Check for a duplicate:** grep `.claude/spec-runs.jsonl` for an existing
   `"stage":"escape"` row with the same spec + file pair. If one exists, show it and STOP
   unless the user confirms this is a distinct defect.
3. **Correlate the review run.** From `.claude/spec-runs.jsonl`, take the LAST row with
   `stage:"review"` and this spec path (jq/grep — never read the ledger into context):
   `reviewRunId` = that row's `runId`; `null` if no review row exists or it predates the
   `runId` field. Note the row's `verdict` and `findings.killed` for steps 4–5.
4. **Classify — ask, never guess** (`AskUserQuestion`, one call):
   - `severity`: `hard` (wrong behavior, data loss, security) | `soft` (cosmetic, naming, docs).
   - `foundBy`: `user` | `later-spec` (a subsequent spec's build/review surfaced it) | `production`.
   - `killedMatch` — only if the correlated review row had `findings.killed > 0`: "Does this
     defect match a finding that review killed?" Yes → `true`, no → `false`, can't recall →
     `null`. If `killed` was 0, `killedMatch` is `null` without asking. **Unknown is `null`,
     never a guessed `false`** — a wrong `false` poisons the one signal that tunes the
     refutation filter.
   - `preventedBy` — the **prevention delta**: what change would have caught this defect
     before it escaped? `doctrine` (a Gotchas/rules line) | `enforcer` (a mechanical check —
     `/spec:enforce` territory) | `review-check` (a § Review Checks severity row) |
     `runtime-leg` (the smoke/skip/release class of executed check) | `none` (state
     explicitly that no plausible mechanism exists). **`none` is a real answer, never a
     default** — an escape recorded without naming its prevention delta is a confession
     booth, not a feedback loop.
5. **Append exactly ONE line** to `.claude/spec-runs.jsonl` (repo root; `printf '%s\n' '<json>' >>`):

   ```
   {"ts":"<YYYY-MM-DD>","stage":"escape","spec":"<repo-relative spec path>","file":"<repo-relative defect file>","reviewRunId":"<wf_…>"|null,"foundBy":"<user|later-spec|production>","severity":"<hard|soft>","killedMatch":true|false|null,"preventedBy":"<doctrine|enforcer|review-check|runtime-leg|none>","via":"commit|manual"}
   ```

   Fixed shape — paths/enums/booleans only, **never prose or finding text** (the defect
   description belongs in whatever fixes it, not in the ledger). `via` is optional: omit
   it or set `"manual"` when this command was invoked directly; `/git:commit`'s escape
   check sets `"commit"` when it drove the append.
6. **Close the loop on the prevention delta** (the one write beyond the ledger row, and the
   only one): by `preventedBy` value —
   - `doctrine` → offer to append the one-line Gotchas entry NOW (pipeline rules § Gotchas;
     cite this escape row; tag `[host]` or `[plugin]` by where the wrong assumption came
     from). Accepted → append it; declined → the row stands and `/spec:doctor` lists it as an
     open repair.
   - `enforcer` → recommend `/spec:enforce` (name the rule category the defect implies).
   - `review-check` → offer the one-line § Review Checks severity row, same Gotchas
     discipline.
   - `runtime-leg` / `none` → nothing to write; the ledger row itself is the signal.
7. **Report the context, not a fix:** how many escape rows now point at this spec; whether
   the correlated review's verdict was `CLEAN` (a contradicted CLEAN is the miscalibration
   signal `/spec:doctor` aggregates); if `killedMatch: true`, say explicitly that the
   refutation filter killed a real bug — the strongest re-tuning evidence the ledger can
   hold; and the prevention delta's disposition (landed / declined / recommended command).
   Then stop. Fixing the defect is a separate, normal-flow decision.

## Rules

- Read-only except the single ledger append and the user-approved one-line prevention-delta
  entry (step 6). Never edits code, specs, or dispositions.
- One row per defect. Step 2's duplicate check runs before every append.
- `AskUserQuestion` dismissed → STOP, append nothing.
