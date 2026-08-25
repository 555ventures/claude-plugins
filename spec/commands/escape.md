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
context already contains. `killedMatch` (step 4) derives the same way when the correlated
review's retained evidence artifact exists; user memory is the fallback, used only when it
does not. Recording friction is a measurement bug: an escape too annoying to
record never lands, and "zero escapes" silently becomes false evidence that reviews work.

## Input

`$ARGUMENTS` — optional. A defective file's repo-relative path (or spec path) and/or a short
defect description. When invoked bare mid-session, derive the defective file and the defect
from the conversation's current defect work. Arguments override derivation when given. The
description (given or derived) is used only to locate and classify — it is **never written
to the ledger**.

If invoked with no arguments AND no defect is identifiable in the session, ask for the
defective file — that is the only unrecoverable input.

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
   `runId` field. Note the row's `verdict` and `findings.killed` for steps 4–5. When
   `reviewRunId` is set, check for `.claude/spec-runs/<reviewRunId>.json` — if it exists,
   read its `killed[]` claims (evidence strings intact); step 4 derives `killedMatch` from
   them. When the correlated row carries `diff.base`/`diff.head` (rows from 7.32.0 on),
   those name the reviewed range and `diff.dirty: true` means the close commit that
   follows the row completes it; older rows carry neither, and this step proceeds exactly
   as today.
4. **Classify — derive from context, confirm in ONE call.** Derive every field from the
   evidence in hand (the session's diagnosis and fix work, the defective file, the given
   description, the correlated review row), then confirm in a single `AskUserQuestion`
   call. **"One call" is the budget, not "one question"** — the call carries one question
   per field (up to five ride together): each field's derived value is the FIRST option,
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
     defects its staging walkthrough catches (a staging walk is not production).
   - `class` — a stable kebab-case defect-class id derived from the evidence (same naming
     style as replay-corpus.md's classes, e.g. `silent-fallback`), naming what kind of
     defect this is rather than this incident's specifics. Value is null when underivable —
     unknown is null, never a guess.
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
   - `killedMatch` — derive from the retained review artifact when step 3 found one;
     user memory is the fallback, used only when no artifact exists. **Artifact path:**
     compare the defect against the artifact's `killed[]` claims (evidence intact) and
     derive a match — an entry whose claim/evidence names this defect's file and behavior →
     `true`; the artifact present with `killed[]` non-empty but nothing matching → `false`;
     genuinely ambiguous even with the evidence in hand → `null`. It rides as its own
     question in the same call, the derived value first and marked "(Recommended)" with its
     reasoning citing the matched claim — the user CONFIRMS or corrects it, same as every
     other field (derive-don't-interview). **Fallback path (no artifact — an older review
     predating retention, or `reviewRunId` is `null`):** if the correlated review row had
     `findings.killed > 0`, ask from memory, never derived: "Does this defect match a
     finding that review killed?" Yes → `true`, no → `false`, can't recall → `null`. Either
     path: if there is nothing to match against (`findings.killed` was 0, or the artifact's
     `killed[]` is empty), `killedMatch` is `null` without asking. **Unknown is `null`,
     never a guessed `false`** — a wrong `false` poisons the one signal that tunes
     execution-grounded verification.
5. **Append exactly ONE line** to `.claude/spec-runs.jsonl` (repo root; `printf '%s\n' '<json>' >>`):

   ```
   {"ts":"<ISO-8601>","stage":"escape","spec":"<repo-relative spec path>","file":"<repo-relative defect file>","reviewRunId":"<wf_…>"|null,"foundBy":"<user|later-spec|production>","severity":"<hard|soft>","killedMatch":true|false|null,"class":"<kebab-case defect-class id>"|null,"preventedBy":"<doctrine|enforcer|review-check|runtime-leg|none>","via":"commit|manual"}
   ```

   Fixed shape — paths/enums/booleans only, **never prose or finding text** (the defect
   description belongs in whatever fixes it, not in the ledger). `via` is optional: omit
   it or set `"manual"` when this command was invoked directly; `/git:commit`'s escape
   check sets `"commit"` when it drove the append.
6. **Close the loop on the prevention delta** (the one write beyond the ledger row, and the
   only one): by `preventedBy` value —
   - `doctrine` → **draft the one-line Gotchas entry verbatim from session context**
     (pipeline rules § Gotchas; cite this escape row; tag `[host]` or `[plugin]` by where
     the wrong assumption came from). Check whether the target section is at cap:
     `node "$(spec-paths prose-cap)" --file <host pipelineRules> --section Gotchas`; exit 1
     means it is — evict before appending (on a legacy over-cap host the next review close
     is ratcheted against its verdict-time count, so the append must be paired with at least
     one eviction here, never a net growth), naming one of exactly three fates: **delete**
     (wrong, dead-cited, or mechanized), **merge** (durable engineering truth →
     `docs/canonical/{area}.md`), or **mechanize** (a recurring class → a script). At cap,
     present the drafted entry **together with the eviction it displaces** in the same
     severable `AskUserQuestion`; below cap, present the drafted entry alone. Either way the
     ask runs in ONE dedicated `AskUserQuestion`
     after the row's classification settles — **the line's approval is severable from the
     row's**, and from the eviction's when one is present: declining the entry or the
     eviction leaves the section unchanged, and declining either never unwinds the row.
     Accepted → append the entry (and apply the eviction when one was displaced); declined →
     the row stands and `/spec:doctor` lists it as an open repair.
   - `enforcer` → recommend `/spec:enforce` (name the rule category the defect implies).
   - `review-check` → draft the one-line § Review Checks severity row the same way, same
     Gotchas discipline, same severable approval ask.
   - `runtime-leg` / `none` → nothing to write; the ledger row itself is the signal.
7. **Report the context, not a fix.** Assemble slots and render via
   `node "$(spec-paths report-render)" --slots <file>`, print the script's output verbatim
   (rationale: shared § Console Output Style):
   - `outcome`: anchor `✅` (record-completion is an outcome, not an artifact pointer —
     the closed anchor set wins over a bespoke lead), text `escape logged — {preventedBy}
     row appended; prevention delta {landed / declined / recommended: <command>}`.
   - `bullets`: one line, `- {N} escape rows now point at this spec`.
   - `warns`: `correlated review said CLEAN — miscalibration signal /spec:doctor aggregates`
     when the step-3 correlated review row's verdict was CLEAN, else omit.
   - `found`: `killedMatch: execution-grounded verification killed a finding that later
     proved real — strongest re-tuning evidence the ledger can hold` when `killedMatch` is
     `true`, else omit.
   - `next`: `{kind:'command', text:'/spec:enforce — mechanize the {category} check this
     escape implies'}` when `preventedBy` is `enforcer`; otherwise
     `{kind:'status-verbatim', text: <this session's captured `spec-status --next`
     output>}` — the step-6 prevention delta only ever names a runnable command in the
     enforcer case; every other case already wrote (or declined) its fix inside step 6, so
     the close routes to what's next across the pipeline instead of repeating it.

   ```report
   ✅ **escape logged — enforcer row appended; prevention delta recommended: /spec:enforce**
   - 3 escape rows now point at this spec
   ⚠️ correlated review said CLEAN — miscalibration signal /spec:doctor aggregates
   ✨ killedMatch: execution-grounded verification killed a finding that later proved real — strongest re-tuning evidence the ledger can hold
   Next: /spec:enforce — mechanize the report-shape check this escape implies
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
