---
description: Record a defect that escaped a spec's review — one ledger row pointing back at the review run that passed it; the ground truth that makes CLEAN verdicts falsifiable
argument-hint: "[defective file or spec path] [short defect description] — both optional mid-session; derived from the defect being worked on"
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

**Intended model: Sonnet or Haiku.** Mechanical: locate, correlate, derive, confirm, append.

**Derive, don't interview.** The dominant invocation is mid-session, while the defect is
already being diagnosed or fixed — the session holds the defective file, the diagnosis, and
often the fix diff. Every classification field is derived from that evidence first; the user
is asked to *confirm or correct* the derivation in one call, never to supply answers the
context already contains. The single exception is `killedMatch` (step 4), which lives only
in the user's memory. Recording friction is a measurement bug: an escape too annoying to
record never lands, and "zero escapes" silently becomes false evidence that reviews work.

## Input

`$ARGUMENTS` — optional. A defective file's repo-relative path (or spec path) and/or a short
defect description. When invoked bare mid-session, derive the defective file and the defect
from the conversation's current defect work. Arguments override derivation when given. The
description (given or derived) is used only to locate and classify — it is **never written
to the ledger**.

If invoked with no arguments AND no defect is identifiable in the session, ask for the
defective file — that is the only unrecoverable input.

## Red-observation entry path (D8)

`/spec:status --next`'s top pick may be a full oracle-shaped `/spec:escape` entry — a done
spec whose latest qualifying `stage:"observe"` ledger row (written by `observe-ci.js`) is
red, carrying `branch`/`sha`/`url` in its `note`. When invoked on such a spec (the given
`$ARGUMENTS` names the spec directly, or the session is working the oracle's escape pick),
this path replaces step 1's grep-locate — the spec is already named — and replaces the
session's own diagnosis as the evidence source:

1. **Read the run first.** `gh run view {url}` (the `url` from the observe row / oracle
   `note`) — see what actually failed before touching the ledger. Never record an escape from
   the red glyph alone.
2. **Implication check.** If the failure does not implicate this spec — its File Plan files
   or its landed behavior (the run failed on an unrelated suite, a different spec's
   shared-branch neighbor, or CI infra noise) — record NO escape and STOP: name the
   implicated surface instead (the other spec, the shared-branch neighbor, or CI infra) so
   the session or the user can route to the right place. A red observation is evidence
   something broke, never evidence *this spec* broke it.
3. **If implicated**, continue at step 1 below using this spec (skip its grep — already
   located) and the run's failure as the defect description, then proceed through steps 2–7
   normally. `foundBy` derives to `production` (D8: a red CI run on landed code is
   production-adjacent evidence, not user inspection) unless session context overrides it.

The red observation clears only when a newer green qualifying `stage:"observe"` row is later
recorded — this command never writes an observe row itself, only the escape row; fixing the
defect and waiting for the next `/spec:status` or `/spec:review` invocation to re-observe is
what turns the dashboard headline back green.

## Steps

1. **Locate the spec.** If a spec path was given, use it. Otherwise take the defective
   file (from arguments, else from session context) and grep `specs/**` for its path
   (File Plan / manifest sections). The defective file is the one whose spec-landed lines
   held the wrong behavior — where the bug *lived*, not every file the fix touched; if the
   session's fix spans several files and doesn't disambiguate, fold the file choice into
   this step's confirmation. One hit → that spec. Multiple hits are by definition genuine
   ambiguity → derive the most likely candidate (File Plan ownership of the exact path
   outranks review-row recency when they disagree) and ALWAYS confirm via `AskUserQuestion`
   with it as the recommended option. Zero hits → the code wasn't spec-built; say so and
   STOP (the ledger measures the pipeline, not the repo — nothing to correlate).
2. **Check for a duplicate:** grep `.claude/spec-runs.jsonl` for an existing
   `"stage":"escape"` row with the same spec + file pair. If one exists, show it and STOP
   unless the user confirms this is a distinct defect.
3. **Correlate the review run.** From `.claude/spec-runs.jsonl`, take the LAST row with
   `stage:"review"` and this spec path (jq/grep — never read the ledger into context):
   `reviewRunId` = that row's `runId`; `null` if no review row exists or it predates the
   `runId` field. Note the row's `verdict` and `findings.killed` for steps 4–5.
4. **Classify — derive from context, confirm in ONE call.** Derive every field from the
   evidence in hand (the session's diagnosis and fix work, the defective file, the given
   description, the correlated review row), then confirm in a single `AskUserQuestion`
   call. **"One call" is the budget, not "one question"** — the call carries one question
   per field (up to four ride together): each field's derived value is the FIRST option,
   marked "(Recommended)", with its one-line derivation reasoning in the option
   description and the other enum values as alternates. The user's time goes into
   correcting a visible wrong derivation, never into a field-by-field interview across
   multiple calls.
   - `severity`: `hard` (wrong behavior, data loss, security) | `soft` (cosmetic, naming,
     docs). Derive from what the defect *does*.
   - `foundBy`: `user` | `later-spec` | `production`. Derive: invoked mid-build/review of a
     subsequent spec → `later-spec`; the session cites an incident, deployed logs, or
     production behavior → `production`; otherwise `user` (the manual-invocation default).
     A calling command's prescription is derivation evidence and outranks this table —
     `/spec:release` prescribes `foundBy: later-spec`, `preventedBy: runtime-leg` for
     defects its staging walkthrough catches (a staging walk is not production); the
     red-observation entry path (D8) prescribes `foundBy: production`.
   - `preventedBy` — the **prevention delta**: what change would have caught this defect
     before it escaped? `doctrine` (a Gotchas/rules line) | `enforcer` (a mechanical check —
     `/spec:enforce` territory) | `review-check` (a § Review Checks severity row) |
     `runtime-leg` (the smoke/skip/release class of executed check) | `none`. Derive from
     the **fix itself** when the session has one — the diff is direct evidence: a corrected
     wrong assumption an executor would repeat → `doctrine`; a mechanically checkable
     pattern → `enforcer`; a judgment call a reviewer should have weighed → `review-check`;
     only observable with the code running → `runtime-leg`. **`none` is a real answer, never a
     default** — derive it only with stated reasoning that no plausible mechanism exists;
     an escape recorded without naming its prevention delta is a confession booth, not a
     feedback loop.
   - `killedMatch` — **the one underivable field.** Review persists killed findings only as
     counts; their content is unrecoverable, so only the user's memory can answer. If the
     correlated review row had `findings.killed > 0`, it rides as its own question in the
     same call — never derived, never defaulted: "Does this defect match a finding that
     review killed?" Yes → `true`, no → `false`, can't recall → `null`. If `killed` was 0,
     `killedMatch` is `null` without asking. **Unknown is `null`, never a guessed `false`**
     — a wrong `false` poisons the one signal that tunes the refutation filter.
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
   - `doctrine` → **draft the one-line Gotchas entry verbatim from session context**
     (pipeline rules § Gotchas; cite this escape row; tag `[host]` or `[plugin]` by where
     the wrong assumption came from) and present it in ONE dedicated `AskUserQuestion`
     after the row's classification settles — **the line's approval is severable from the
     row's**: it runs whether `preventedBy` was derived or arrived by correction, and
     declining the line never unwinds the row. Accepted → append it; declined → the row
     stands and `/spec:doctor` lists it as an open repair.
   - `enforcer` → recommend `/spec:enforce` (name the rule category the defect implies).
   - `review-check` → draft the one-line § Review Checks severity row the same way, same
     Gotchas discipline, same severable approval ask.
   - `runtime-leg` / `none` → nothing to write; the ledger row itself is the signal.
7. **Report the context, not a fix** — print exactly this shape (rationale: shared
   § Console Output Style); fill the slots, drop any line whose slot is empty, add nothing
   else:

   ```
   📦 **escape logged — {preventedBy} row appended; prevention delta {landed / declined / recommended: <command>}**
   - {N} escape rows now point at this spec
   ⚠️ correlated review said CLEAN — miscalibration signal /spec:doctor aggregates
   ✨ killedMatch: the refutation filter killed a real bug — strongest re-tuning evidence the ledger can hold
   ```

   Then stop. Fixing the defect is a separate, normal-flow decision.

## Rules

- Read-only except the single ledger append and the user-approved one-line prevention-delta
  entry (step 6). Never edits code, specs, or dispositions.
- One row per defect. Step 2's duplicate check runs before every append.
- At most TWO `AskUserQuestion` calls in the main path: the step-4 classification call
  (all field questions ride in it, `killedMatch` included) and the step-6 drafted-line
  approval (only when `preventedBy` is `doctrine` or `review-check`). The only other
  permitted asks: step 1's candidate/file confirmation (multiple grep hits or an ambiguous
  defective file), step 2's duplicate check, and the Input section's defective-file
  fallback when the session holds no defect at all.
- Derived values are shown with their reasoning before the append — the user corrects what
  they can see; a silent wrong derivation is worse than a question.
- `AskUserQuestion` dismissed → STOP, append nothing.
