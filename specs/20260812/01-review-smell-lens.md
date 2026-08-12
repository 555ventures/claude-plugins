---
date: 2026-08-12
status: done
diff_base: 6a09b2e9f4330fddebb7404ead2e08cf6901b599
risk: T3
open_markers: 0
area: spec-review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 04
---

# Review advisory smell lens: semantic duplication + error masking

## Goal

`wf-review` gains one dedicated advisory finding source — the **smell lens** — scoped to the
two research-backed AI-signature smell classes the deterministic ratchet layer
(specs/20260810/06) cannot see: *semantic* duplication (a diff symbol re-implementing a job an
existing repo symbol already does) and *error masking* (catch/fallback/default code that
converts a shape or contract bug into wrong-but-green behavior). Lens findings are advisory by
construction: they travel in their own return field, never enter the verification kill loop,
never affect the verdict word, and render in their own labeled report section where the user
accepts (→ durable dated row in `docs/audit/advisory-findings.md`) or dismisses (→ expires).
Done means: the lens runs on every full-scope review, its advisory-only property is pinned by
executed tests against `verdict.js`, and the reviewer doctrine sanctions the two classes as
lens output without reopening general taste review.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The lens is one **dedicated Sonnet agent** with its own inline prompt and schema, launched inside `wf-review` in the same `parallel()` barrier as the reviewer panel (its thunk appended after the panel thunks; results split by index). Its `agent()` call **omits `agentType`** — the verify-phase pattern, NOT the panel's `agentType: 'spec:reviewer'` | User ruling this session; a panel extra-duty would put smell findings in the gate-feeding channel where a filter bug lets taste block a merge. The agentType pin matters: copying the panel's would load reviewer.md — including this spec's own "reviewers do not stretch for cross-file smells" carve-out — as the lens's system prompt, disclaiming its exact job |
| D2 | Lens output lands ONLY in a new top-level return field `smells` (plus `lensFailed: boolean`), present in **all three** return sites of the body (REVIEWER_FAILED, zero-findings CLEAN, final); it is never pushed into `findings`, and the verify-loop input expression (`findings.filter(f => f.severity !== 'soft')`) is untouched | Bypass-by-construction, not by prompt (brief requirement); three return sites confirmed at draft time — a field present on only some paths is a downstream shape bug |
| D3 | The field is named `smells`, NOT `advisory` | Soft survivors already carry the test-pinned `verification: 'advisory'` tag (tests/workflow-guards.test.js:96); a same-name sibling in one return object invites report/doctrine confusion |
| D4 | The lens **fails open**: a null lens agent result → `smells: [], lensFailed: true` — it never counts toward `failedReviewers`, never yields REVIEWER_FAILED | Deliberate, sanctioned inversion of the panel's fail-closed rule: fail-closed protects the gate, and the lens by construction never gates; its failure is visible (⚠️ report line), never a stop |
| D5 | Lens runs on `scope: 'full'` only — on fix-delta the agent is not launched and the return carries `smells: [], lensFailed: false` | A fix diff is by definition a response to findings; re-paying the lens per iteration is the cost pattern fix-delta exists to delete |
| D6 | Two classes only, closed enum `['duplication', 'error-masking']` in the lens schema; the prompt forbids everything else (correctness, style, scope opinions). The counterpart requirement for `duplication` is enforced **in code, not prompt**: after the lens returns, a plain filter drops any `duplication` smell lacking a non-empty `counterpart` (dropped count logged) — no schema `if/then`, which the harness validator may not honor. The prompt additionally scopes `error-masking` to patterns whose adjudication needs **cross-file context** (the masked shape/contract lives outside the diff) — a masking pattern fully visible in-diff is the panel's existing medium check, and the lens skips it | Brief's binding scope; the closed enum + code filter keep the carve-out from reopening general taste review, and the cross-file scoping stops the same defect surfacing twice through a blocking and a non-blocking channel |
| D7 | `verdict.js` is **deliberately not edited**; `smells` never reaches the verdict derivation or the ledger row (executed at plan time: identical `CLEAN`/exit 0 with and without the field — see Assumptions A1) | The additive field is invisible to a script that destructures only named fields; keeping the T3 verdict script untouched is the cheapest correct form of "never gates" |
| D8 | Accepted findings append one dated row each to `docs/audit/advisory-findings.md` in the **host repo** (created with a header comment on first append); dismissed findings expire with no record | User ruling this session; brief 05's audit ingests the file wholesale — nothing to migrate |
| D9 | `/spec:review` Phase 2 presents `smells` in its own labeled group AFTER survivor dispositions, with ONE batched `AskUserQuestion` (multiSelect: keep / drop per finding) per full-scope iteration; presentation never blocks Phase 3, and `lensFailed: true` prints one ⚠️ line ("smell lens failed — no advisory findings this run"), never a stop | Advisory findings must not interleave with blocking dispositions; one batched question keeps the user cost at one interaction |
| D10 | Doctrine carve-out lands in three homes: `spec/agents/reviewer.md` (lens ownership note — panel reviewers do not stretch for cross-file smells; existing in-diff duties and the taste prohibition stand), `spec/commands/init.md` § Review Checks template (one sentence: the two classes are plugin-owned advisory lens output, never a blocking reviewer finding), and this host's `.claude/rules/spec-pipeline.md` § Review Checks (same sentence — already-initialized hosts pick it up at next re-init; acceptable for an advisory layer) | Brief requirement; the reviewer.md edit must stay physically clear of the DRIFT_NOTE "semantic backstop" region pinned by tests/consistency/drift-reconcile.test.js (AC-20260810-10-3) |
| D11 | `spec/commands/review.md` return-shape documentation updates in both locations (Phase 1 return line and Rules) to `{verdict, survivors, killed, verify, reviewerCount, scope, tokens, smells, lensFailed}` — appending after `tokens`, keeping the substring pinned by tests/workflow-guards.test.js:112 intact — plus an explicit sentence that `smells` never enters `verdict.js` or the ledger row | The pinned phrase is an unanchored substring, so appending is safe; the explicit never-ledgered sentence stops a future habit-edit of run-ledger expectations |
| D12 | New guard gets a `spec/doctrine/scaffold-ledger.md` row, kind `advisory`: promote when accepted rows in any host's `docs/audit/advisory-findings.md` lead to a landed paydown spec (evidence: spec citing a row); retire if 10 consecutive ledgered full-scope reviews across hosts produce zero accepted findings | Repo convention: every new mechanism carries a promote/retire condition |
| D13 | `spec/.claude-plugin/plugin.json` bumps to 6.57.0 (target, not pin — next-free-version rule per pipeline rules Gotchas) with a description delta; `spec/doctrine/claims-baseline.json` regenerates via `node spec/scripts/claims-lint.js --update-baseline` as the LAST doctrine step, after all new hard-consequence claims carry their `<!-- enforcedBy: ... -->` / `<!-- unenforced: ... -->` markers | Doctrine line counts change → claims hunk required in the same diff (Review Checks); markers must be authored before the regen or the baseline bakes in orphans |
| D14 | New pinning tests live at `tests/review/smell-lens.test.js` (scoped dir per Test Rules; gate resolves `{testDirs}` to `'tests/review/*.test.js'`) | Scoped gate runs stay pin-free |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | LENS schema (class enum, `counterpart`); `lensPrompt()`; lens thunk (no `agentType`, per D1) appended to the panel `parallel()` barrier, launched only when `scope !== 'fix-delta'` (D1/D5); `failedReviewers` computed from the panel slice only (D4); D6's code filter on returned `duplication` smells without `counterpart`; `smells` + `lensFailed` added to all three return sites (D2); args contract comment unchanged (no new args) |
| spec/commands/review.md | MODIFY | doctrine | Phase 1 "What the script does" gains the lens bullet + updated return shape (both locations, D11) + the never-ledgered sentence; Phase 2 gains the advisory presentation group, batched keep/drop `AskUserQuestion` (outcome-phrased options — the question-style hook gates this flow too), durable-append mechanics for `docs/audit/advisory-findings.md` incl. first-append header, `lensFailed` ⚠️ line (D8/D9); report template gains a drop-when-empty `🔍` smells line. Stay clear of Phase 0 step 8 (open intake pin JJ-20260808-01 lives there) |
| spec/agents/reviewer.md | MODIFY | doctrine | Lens-ownership carve-out paragraph (D10) — placed in the sanctioned-exceptions area, physically separate from the Cross-Cutting Checks drift-gate/semantic-backstop block |
| spec/commands/init.md | MODIFY | doctrine | § Review Checks template (near line 316): one sentence declaring the two classes plugin-owned advisory lens output, never a blocking reviewer finding (D10) |
| .claude/rules/spec-pipeline.md | MODIFY | other | Same sentence appended to this host's § Review Checks duplication-calibration bullet (D10) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | Smell-lens row with D12 promote/retire condition, kind `advisory` |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | Regenerate via `claims-lint.js --update-baseline` after all doctrine edits land (last doctrine step, D13) |
| tests/review/smell-lens.test.js | CREATE | tests | AC-20260812-01-1 … AC-20260812-01-8 |
| spec/.claude-plugin/plugin.json | MODIFY | other | 6.56.0 → 6.57.0 (D13 target); append the smell-lens delta to `description` |

Orchestrator integration duty (not a row): `npm run build:workflows` after the body edit;
`node spec/scripts/build-workflows.js --check` before declaring the batch done; commit source +
generated `wf-review.js` together.

## Contracts

Lens agent schema (new, inside `wf-review.body.js`):

```js
const LENS = {
  type: 'object',
  properties: {
    smells: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          class: { type: 'string', enum: ['duplication', 'error-masking'] },
          claim: { type: 'string', description: 'self-contained one-paragraph claim, verifiable from code alone' },
          counterpart: { type: 'string', description: 'file:line of the existing symbol whose job the diff symbol re-does (duplication: REQUIRED — findings without it are dropped after return) or of the masked contract/shape source (error-masking: when identifiable)' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'line', 'class', 'claim'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['smells', 'summary'],
}
```

Workflow return shape, after this spec (all three return sites):

```
{ verdict, survivors, killed, verify, reviewerCount, scope, tokens, smells, lensFailed }
```

`smells` never enters `findings`, the verify loop, `verdict.js`, or the
`.claude/spec-runs.jsonl` ledger row — the ledger row shape is unchanged.

Durable capture file (host repo, created by `/spec:review` on first accepted finding):

```markdown
# Advisory smell findings — accepted at review
<!-- appended by /spec:review (smell lens); ingested wholesale by the hotspot audit (roadmap brief 05) -->

- 2026-08-12 duplication src/foo/format.ts:12 duplicates src/lib/date.ts:40 — {one-line claim} (spec specs/20260812/01-…, runId wf_…)
- 2026-08-12 error-masking src/api/client.ts:88 — {one-line claim} (spec …, runId …)
```

One bullet per accepted finding: date, class, `file:line`, `duplicates {counterpart}` for the
duplication class, the claim, then `(spec {path}, runId {wf id})` provenance.

## Behavior

- **Lens prompt duties** (inline in the body, mirroring `verifyPrompt`'s style): read the diff
  at `REVIEW_ROOT` against `args.base`; for each added/changed symbol run targeted repo
  lookups (grep for same-purpose helpers by name fragments and by behavior-adjacent tokens);
  report ONLY the two classes; `duplication` requires both locations cited (`counterpart` —
  findings without it are dropped by D6's code filter, so citing it is not optional);
  `error-masking` is a finding only when a catch/fallback/default converts a shape/contract
  bug into wrong-but-green behavior AND adjudicating that requires cross-file context (the
  masked shape or contract lives outside the diff) — legitimate defense at a trust boundary
  is not a finding, and a masking pattern fully visible in-diff is the panel's existing
  defensive-fallback medium check, which the lens skips (D6); advisory framing (an empty
  list is the expected outcome for most diffs); read-only; never edit.
- **Workflow flow:** lens thunk runs in the panel barrier; on panel failure the run still
  returns REVIEWER_FAILED (with whatever `smells` the lens returned — the orchestrator
  re-invokes and the journal cache makes the re-run cheap); on zero panel findings the CLEAN
  early return carries the lens result; verification phase never sees lens output.
- **Session flow (`/spec:review` Phase 2):** after survivor dispositions resolve (and only on
  full-scope iterations), present the smells group: per finding one plain-language line —
  class, what duplicates/masks what, both locations. One batched `AskUserQuestion`
  (multiSelect) whose options are outcome-phrased ("keep — append a dated row to the repo's
  advisory log for the future audit" / "drop — no record kept"); the question-style hook
  gates this flow like any other. Accepted → append rows per the Contracts format. Dismissed
  → nothing. Then proceed to Phase 3 exactly as today — the smells group can never change
  the verdict word or block the close. A dismissed `AskUserQuestion` here follows the
  standing rule (STOP the run) — but the verdict/ledger row from Phase 2 step 2 is already
  written by then, so nothing is lost.
- **Report:** the Phase 3 template gains one drop-when-empty line:
  `🔍 smells: {N} advisory — {M} accepted → docs/audit/advisory-findings.md`, and
  `lensFailed: true` renders as `⚠️ smell lens failed — no advisory findings this run`.

## Acceptance Criteria

- **AC-20260812-01-1**: WHEN `spec/workflows/src/wf-review.body.js` is parsed THE SYSTEM SHALL
  contain `smells` and `lensFailed` in all three return-object sites (REVIEWER_FAILED,
  zero-findings CLEAN, final) and SHALL NOT push lens results into the `findings` array
  (source pins: every `return {` block matches `smells`, and the only `findings.push`
  call sites remain the panel-merge loop) → tests/review/smell-lens.test.js
- **AC-20260812-01-2**: WHEN the body source is inspected THE SYSTEM SHALL derive the verify
  work list solely from panel findings (literal pin: the line
  `const verifiableAll = findings.filter(f => f.severity !== 'soft')` is byte-present, and
  no lens identifier — `smells`, `LENS`, the lens agent's label — appears between
  `phase('Verify')` and the final `return {` token, exclusive: the final return object
  itself legitimately carries `smells` per D2) → tests/review/smell-lens.test.js
- **AC-20260812-01-3**: WHEN the body source is inspected THE SYSTEM SHALL launch the lens
  only outside fix-delta scope (the lens thunk is guarded on the fix-delta flag), SHALL
  compute `failedReviewers` from the panel results only, with a null lens result yielding
  `smells: []` + `lensFailed: true` (fail-open pin), SHALL pass no `agentType` on the lens
  `agent()` call (D1 — the substring `agentType` does not appear in the lens call options),
  and SHALL filter returned `duplication` smells lacking a non-empty `counterpart` (D6 —
  the filter expression is byte-present) → tests/review/smell-lens.test.js
- **AC-20260812-01-4**: WHEN `verdict.js` runs against an all-green evidence manifest and a
  workflow return containing zero survivors plus a **non-empty** `smells` array (literal
  fixture: one `duplication` finding) THE SYSTEM SHALL print `CLEAN` and exit 0 — executed,
  not argued (this is the terminal observable of "advisory never gates") →
  tests/review/smell-lens.test.js
- **AC-20260812-01-5**: WHEN `verdict.js` runs twice against the same manifest and the same
  non-empty-survivor workflow return, once with and once without the `smells`/`lensFailed`
  fields THE SYSTEM SHALL CONTINUE TO print the identical verdict word and exit code in both
  runs (literal fixture: 1 hard survivor → `HARD_FINDINGS`, exit 1, both runs) →
  tests/review/smell-lens.test.js
- **AC-20260812-01-6**: WHEN `spec/commands/review.md` is read THE SYSTEM SHALL document the
  return shape including `smells` after `tokens` in both locations while still matching the
  existing pinned substring `verdict, survivors, killed, verify, reviewerCount, scope,
  tokens`, SHALL state that `smells` never enters `verdict.js` or the ledger row, SHALL
  describe the advisory presentation group with the batched keep/drop question and the
  `docs/audit/advisory-findings.md` append (incl. first-append header), and SHALL carry the
  drop-when-empty `🔍` report line and the `lensFailed` ⚠️ line →
  tests/review/smell-lens.test.js
- **AC-20260812-01-7**: WHEN `spec/agents/reviewer.md`, `spec/commands/init.md`, and
  `.claude/rules/spec-pipeline.md` are read THE SYSTEM SHALL find the carve-out in each: the
  two classes (cross-file semantic duplication, error masking) named as advisory smell-lens
  output that panel reviewers do not stretch for and that never blocks — while the
  pre-existing duties stay byte-present **in their actual homes**: reviewer.md keeps its
  defensive-fallback medium check ("Defensive fallbacks that mask shape bugs") and its
  taste prohibition ("Do not report scope/over-engineering opinions"); the
  three-near-identical-blocks duplication calibration lives ONLY in init.md's § Review
  Checks template and this host's `.claude/rules/spec-pipeline.md` (it has never been in
  reviewer.md — do not add it there), and stays byte-present in those two →
  tests/review/smell-lens.test.js
- **AC-20260812-01-8**: WHEN the plugin test suite runs THE SYSTEM SHALL CONTINUE TO find the
  DRIFT_NOTE consistency phrases pinned by tests/consistency/drift-reconcile.test.js
  (AC-20260810-10-3) and the `verification: 'advisory'` soft-survivor tag pinned by
  tests/workflow-guards.test.js — the existing covering tests are the pins (no new test
  authored; File Plan rows tests/consistency/drift-reconcile.test.js and
  tests/workflow-guards.test.js deliberately NOT added since the tests are untouched — this
  AC is satisfied by those suites staying green in the scoped gate) →
  tests/consistency/drift-reconcile.test.js, tests/workflow-guards.test.js

Named residual (terminal-observable rule): D9's rendered report section and the
`AskUserQuestion` flow are model-executed doctrine with no executable terminal in this host —
covered by the AC-6 regex pins and routed to release-stage journey walks, never read as
executed coverage.

## Assumptions (escalation triggers)

- A1: `verdict.js` ignores unknown top-level workflow-return fields — **executed at plan
  time** (2026-08-12): synthetic all-green manifest + CLEAN return with and without
  `smells`/`lensFailed` → both print `CLEAN`, both exit 0; source destructures named fields
  only (verified in the blind-spot sweep). **If false at build time:** STOP — do not edit
  `verdict.js` ad hoc; that is a scope change to a T3 surface requiring a spec amendment.
- A2: The body has exactly three return-object sites (REVIEWER_FAILED ~line 233,
  zero-findings CLEAN ~line 254, final ~line 313) — **if more appear by build time:** every
  return site gets the two fields; AC-1's "every `return {` block" pin covers it
  automatically.
- A3: tests/workflow-guards.test.js:112 pins the review.md return-shape phrase as an
  unanchored substring, so appending `, smells, lensFailed` after `tokens` keeps it green —
  **if the pin is anchored after all:** update that assertion in the same diff (it becomes a
  File Plan deviation, logged).
- A4: The reviewer.md carve-out can be placed without touching the drift-gate/semantic-backstop
  block pinned by tests/consistency/drift-reconcile.test.js — **if any pinned phrase must
  move:** STOP; that pin is another spec's doctrine reconciliation (20260810/10), not this
  spec's to renegotiate.
- A5: Open intake pin JJ-20260808-01 (review.md Phase 0 step 8 verdict.js `--workflow`
  contradiction) is untouched by this spec's Phase 1/Phase 2 edits — **if the fix collides:**
  leave step 8 byte-identical and note the adjacency in the deviations sidecar.
- A6: The question-style hook (tier 1 deterministic + tier 2 judge) will pass an
  outcome-phrased keep/drop question — **if it bounces at runtime:** rephrase per the hook's
  reason; never disable the hook or bypass via raw text.
- A7: `claims-lint.js --update-baseline` reflects all doctrine edits in one run, authored
  markers first — **if false:** run `node spec/scripts/claims-lint.js --check` and follow its
  remedy output.

## Rationale

Both brief open questions were ruled by the user this session: dedicated lens agent (recall +
structural advisory-only beat the marginal Sonnet cost; the panel-duty alternative put smell
findings in the gate-feeding channel where a filter bug could block a merge), and the dated
audit file `docs/audit/advisory-findings.md` as the interim durable home (Rationale-scatter
and Gotchas-semantics alternatives rejected — brief 05 ingests one file wholesale).
Session-derived picks, announced at decision time: full-scope-only (D5), fail-open (D4), and
the `smells` field name (D3 — the `advisory` name collides with the test-pinned soft-survivor
tag). The fail-open inversion is deliberate and needs defending once: fail-closed exists to
protect the gate from silent false-greens; the lens cannot produce a false green because it
cannot gate, so its only failure cost is missed advisory recall — a visible ⚠️ line prices
that honestly. `verdict.js` stays untouched (D7) on executed evidence, which is both the
cheapest and the strongest form of "never gates": a script that never reads the field cannot
be regressed by it. The plan-time execution doubles as the micro-spike for the one
shape-triggered claim (an adjudicating program decides whether an extra JSON field changes
behavior); no third-party dependency adjudicates anything else here — everything is Node
builtins and this repo's own scripts. Fragile spots for execution: the three-return-site
consistency (A2), the two pinned phrase regions the doctrine edits must not disturb (A4, and
workflow-guards' `verification: 'advisory'` pin), and the marker-before-baseline-regen
ordering (D13). The host-rules § Review Checks sentence propagates to other hosts only at
their next `/spec:init` — accepted for an advisory layer, noted in D10 rather than building a
migration path.

Adversarial-check adjudication (two blind refuters + one blind-spot sweep, all findings fixed
in place, none rejected): (1) both refuters independently caught AC-7 misattributing the
three-near-identical-blocks duplication calibration to reviewer.md — it lives only in
init.md's template and this host's rules file; AC-7 now pins each duty in its actual home and
explicitly forbids adding the calibration to reviewer.md; (2) the lens `agent()` call's
`agentType` was unpinned, and the natural copy-paste source (the panel call) would load
reviewer.md — including this spec's own "do not stretch for cross-file smells" carve-out — as
the lens's system prompt; D1 now pins the verify-phase pattern (no `agentType`), AC-3 pins it
mechanically; (3) D6's counterpart-MUST was prompt-only — now a code filter after the lens
returns (schema `if/then` rejected: harness validator support unverified), pinned by AC-3;
(4) the panel's in-diff defensive-fallback medium check and the lens's `error-masking` class
could report the same defect through a blocking and a non-blocking channel — the lens prompt
now scopes `error-masking` to patterns whose adjudication needs cross-file context and
explicitly skips in-diff-resolvable masking (D6); (5) AC-2's scan boundary now excludes the
final `return {` token, which legitimately carries `smells`. Refuter-verified non-findings
worth keeping: both refuters independently re-executed the A1 verdict.js check (CLEAN/0 and
HARD_FINDINGS/1, with and without the new fields); the `{testDirs}` glob for
`tests/review/*.test.js` was executed green (52/52); `build-workflows.js --check` and
`claims-lint.js --check` are clean at baseline, so this spec starts from a non-drifted state.

## Canonical Delta

None — no `docs/canonical/` doc covers the review area in this repo; the review pipeline's
canonical surface is `spec/commands/review.md` itself, which this spec edits directly.
