---
date: 2026-08-13
status: hardened
open_markers: 0
risk: T3
area: model-placement
design: false
breaking: false
depends_on: ["specs/20260813/08-question-contract.md"]
depended_on_by: ["specs/20260813/10-host-capabilities.md"]
brief: n/a
---

# Model placement mechanics — Fable seat with fallback, explicit effort, underivable-fork consults

## Goal

Give "consult Fable more" its mechanical seat instead of a manual ask: the panel aggregator
(the workflow layer's highest-judgment seat) moves to Fable behind a dispatch-level model
fallback — with every doctrine site that asserts the seat is Opus updated in the same spec —
every workflow seat declares model AND effort explicitly under a stated rule, the
"uncorrelated model" doctrine claim is narrowed to what is true at both places it appears,
and forks with no derivable recommended default trigger a Fable retainer consult recorded in
a ledger that /spec:audit mines. JJ ratified the three rulings 2026-08-13 (Fable-first
aggregator with Opus fallback; wording-narrowing over reviewer-tier change; wave shape).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `fragments/dispatch.js.frag`: `dispatch()` gains a model fallback — `MODEL_FALLBACK = { fable: 'opus' }`; when a call with `opts.model === 'fable'` throws, retry ONCE with the fallback model, logging `model 'fable' unavailable — falling back to 'opus'`; a second failure propagates. **The existing agentType-not-found branch changes from `return agent(prompt, {...opts, agentType: 'general-purpose'})` to `return dispatch(prompt, {...opts, agentType: 'general-purpose'})`** so the two retries genuinely compose (a fable+custom-type call falls to general-purpose, then to opus); `__fellBack: true` on the retried opts guards single-retry. | No workflow can pin Fable safely today — dispatch retries only on agentType-not-found (G2). The recursion change is load-bearing: without it the agentType retry's own failure propagates past the model fallback (refuter-traced), making the composed worst case unreachable. |
| D2 | The aggregator seat flips to Fable everywhere it is named, in one spec: `wf-panel`'s aggregate seat becomes `model: 'fable', effort: 'high'`; the same file's `meta.description` and `phases[].detail` ("Opus aggregator") are updated to "Fable aggregator (Opus fallback)"; shared.md § Model Placement's Exceptions bullet ("…the panel aggregator, and design-doctrine authoring stay Opus seats") is edited to remove the panel aggregator from the Opus list and state its Fable-first-with-Opus-fallback placement; genesis-architect.md's and genesis-design.md's model-checklist lines ("Opus session/aggregator…") are updated to match. | The seat writes the decision matrix, hard forks, and ADR input — JJ's explicit 2026-08-13 ruling over the prior Opus carve-out. Blind-spot/refuter-traced: four doctrine sites assert the Opus seat; flipping only the code would make the wave reintroduce the exact doctrine-vs-code contradiction it exists to close. |
| D3 | shared.md § Model Placement gains the effort rule as one clause on the existing never-inherit-model sentence (edit in place): every `agent()`/`dispatch()` seat declares `model` AND `effort` explicitly — mechanical/transcription seats (gates, extraction, red-check, currency probes, **wf-design skeleton-expansion workers** — expansion is transcription of a decided plan, per that seat's own in-code rationale) `low`; analysis seats (proposers, researchers, reviewers, verifiers, enforce research, **wf-build implementation workers**) `medium`; synthesis/judgment seats (panel aggregator) `high`. Bodies are updated so every seat conforms; the five pre-existing `'low'` sites keep their values byte-identical. | Effort is currently set 5×, always `low`, always mechanical; judgment seats inherit silently (G3). The wf-design-worker classification is explicit because a naive "workers = medium" reading would bump a deliberately-low pinned seat (refuter-caught conflict with AC-5). |
| D4 | § Model Placement's uncorrelated-review claim is narrowed **at both loci where it appears** — the headline sentence ("an uncorrelated model reviews the result") and its restatement (~15 lines later: "cross-model independence from the planning author is the entire value of the review gate…"). Replacement sentence (Contracts carries the literal): review independence comes from blind-to-author dispatch and execution-grounded verification, never model diversity. | Workers and reviewers are all Sonnet — the sentences claim a property the pipeline doesn't have (G4); JJ ruled wording-fix over reviewer-tier change. Blind-spot-caught: fixing only the headline leaves the restatement as an unfixed echo. |
| D5 | Underivable-fork rule, one clause added to § Question Style's existing derive-first passage (paid for within § Question Style's own prose — **§ Escalation Contract and its six build triggers are NOT touched**: they gate build-execution failures, a different mechanism, and none of them is superseded by this rule): when a genuine fork has NO derivable recommended default (codebase, session, ledgers, and the fork payload's `recommendation` field — spec 08 D3 — all silent), the command consults the Fable retainer for a decision brief and derives the default from it, announcing via 📌; the consult appends one row to the host's `docs/consults.md` (header comment on first append, per the debt-ledger/advisory-findings convention; row: `date · command · fork one-liner · derived default`). | Converts "JJ asks for Fable manually every time" into a bounded automatic class — brief-not-decision keeps the anchoring guard. Refuter-corrected: the original "fold the six-trigger list" instruction targeted a list with no matching item and risked thinning a load-bearing build gate. |
| D6 | `/spec:audit`'s ledger-mining list gains `docs/consults.md`: ≥2 rows with the same fork class are promoted through the audit's **existing closed fate enum** (typically `rule-row` — the default becomes doctrine/config — or `enforcer` when mechanizable; `refactor-brief(NN)` when structural). No new fate, no enum change. | The consult ledger is only worth its rows if something reads them; audit already owns ≥2-recurrence promotion. Refuter-corrected: the original "config key / template field" outcomes didn't map onto the closed, test-enforced fate enum. |
| D7 | `tests/helpers.js` `extractFn` gains async preservation: when the matched `function name(` is preceded by `async `, the extracted source keeps the `async` keyword (today it silently drops it, making every `await`-bearing extraction a SyntaxError under `evalFns`). | `dispatch` is an `async function` — the sanctioned source-shape test mode is otherwise unusable for AC-1/2/3 (refuter-executed: `evalFns(src, ['dispatch'])` → SyntaxError at HEAD). `dispatch` is the repo's only top-level async extraction target, so the fix is surgical. |
| D8 | Scaffold-ledger rows: model fallback (retire: when the harness exposes model availability to workflows), effort rule (retire: if the harness ever prices effort automatically), consult ledger (promote: each ≥2-recurrence promotion IS the promotion; retire: if two quarters produce zero rows, fold the rule back into retainer prose). Version bump target 6.67.0. | Doctor check 13; repo discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/fragments/dispatch.js.frag | MODIFY | workflows | D1 MODEL_FALLBACK + single retry + log; agentType branch recurses through dispatch() |
| spec/workflows/src/wf-panel.body.js | MODIFY | workflows | D2 aggregate seat fable/high + meta.description + phases detail; D3 proposers+research seats medium |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D3 reviewer/verifier seats explicit medium |
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | D3 implementation-worker seats medium (mechanical low sites unchanged) |
| spec/workflows/src/wf-design.body.js | MODIFY | workflows | D3 expansion workers stay low (explicit), gate seat low unchanged |
| spec/workflows/src/wf-research.body.js | MODIFY | workflows | D3 menu agents medium (haiku verifier stays low) |
| spec/workflows/src/wf-enforce.body.js | MODIFY | workflows | D3 research seat medium, mechanical seats low |
| spec/doctrine/shared.md | MODIFY | doctrine | D2 Exceptions bullet; D3 effort clause; D4 both uncorrelated loci; D5 underivable-fork clause (§ Question Style only) |
| spec/commands/genesis-architect.md | MODIFY | doctrine | D2 model-checklist line ("Opus session/aggregator" → Fable-first aggregator) |
| spec/commands/genesis-design.md | MODIFY | doctrine | D2 model-checklist line (same) |
| spec/commands/audit.md | MODIFY | doctrine | D6 consults.md in the mining list, promotion via existing fates |
| tests/helpers.js | MODIFY | tests | D7 extractFn async preservation |
| tests/model/dispatch-fallback.test.js | CREATE | tests | AC-20260813-09-1, AC-20260813-09-2, AC-20260813-09-3, AC-20260813-09-9, AC-20260813-09-10 |
| tests/model/effort-explicit.test.js | CREATE | tests | AC-20260813-09-4, AC-20260813-09-5 |
| tests/model/doctrine-placement.test.js | CREATE | tests | AC-20260813-09-6, AC-20260813-09-7, AC-20260813-09-8 |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D8 three rows |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 bump + changelog |

## Contracts

```js
// dispatch.js.frag delta:
const MODEL_FALLBACK = { fable: 'opus' }
async function dispatch(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    if (opts.agentType !== 'general-purpose' && String(e).includes('not found')) {
      log(`agentType '${opts.agentType}' not in the workflow registry — retrying on general-purpose`)
      return dispatch(prompt, { ...opts, agentType: 'general-purpose' })   // was: agent(...) — recursion makes retries compose
    }
    if (opts.model && MODEL_FALLBACK[opts.model] && !opts.__fellBack) {
      log(`model '${opts.model}' unavailable — falling back to '${MODEL_FALLBACK[opts.model]}'`)
      return dispatch(prompt, { ...opts, model: MODEL_FALLBACK[opts.model], __fellBack: true })
    }
    throw e
  }
}

// Effort bands (closed set, § Model Placement):
//   low    — gates, extraction, red-check, currency probes, wf-design expansion workers
//            (transcription seats; the existing 5 sites stay byte-identical)
//   medium — proposers, researchers, reviewers, verifiers, wf-build implementation workers,
//            enforce research
//   high   — panel aggregator (synthesis/judgment)

// D4 replacement sentence (literal, used at both loci; test pins presence + absence):
//   "review independence comes from blind-to-author dispatch and execution-grounded
//    verification, never model diversity"
//   pinned-absent: /uncorrelated model/

// docs/consults.md (host-side, created on first append WITH header comment, sibling of
// docs/audit/debt-ledger.md convention):
// <!-- Fable consult ledger — appended by any command hitting an underivable fork
//      (shared.md § Question Style). Mined by /spec:audit; ≥2 same-class rows promote. -->
// | 2026-08-13 | /spec:plan | store per-tenant or global? | per-tenant (brief: isolation > reuse) |
```

## Behavior

- Fallback ordering inside `dispatch()`: try as-given → agentType-not-found retries
  general-purpose *through dispatch()* → any error from a `fable` seat retries once as
  `opus`. Worst case chain: fable+custom-type → general-purpose+fable → general-purpose+opus.
  `__fellBack` guards loops; `MODEL_FALLBACK` maps only `fable` (an `opus` outage has no
  cheaper judgment tier worth silently substituting).
- The effort sweep changes behavior only where seats previously inherited: existing `low`
  sites keep their values byte-identical (regression-pinned by AC-5).
- AC-4's call-site scan is a depth-counting scanner (brace/paren matcher in the style of
  `extractFn`), NOT a bare regex — prompts contain unbalanced-looking parens inside template
  literals (e.g. the gate sentinel subshell), so a non-greedy regex would false-negative
  (refuter-analyzed infeasibility).
- The underivable-fork consult is bounded: it fires only when the derive pass AND the fork
  payload's recommendation field are both empty — panels and workflows that do their spec-08
  job never trigger it.

## Acceptance Criteria

- **AC-20260813-09-1**: WHEN `dispatch` is executed (evalFns, post-D7 helpers) with a fake
  `agent` that throws on `model:'fable'` and succeeds otherwise THE SYSTEM SHALL return the
  success result with the retry's `model === 'opus'` and a log line containing
  `falling back to 'opus'` → tests/model/dispatch-fallback.test.js
- **AC-20260813-09-2**: WHEN the fake throws on BOTH attempts THE SYSTEM SHALL propagate the
  second error (single-retry guard: exactly 2 calls observed) →
  tests/model/dispatch-fallback.test.js
- **AC-20260813-09-3**: WHEN dispatch is executed with an unknown `agentType` on a non-fable
  seat THE SYSTEM SHALL CONTINUE TO retry on general-purpose (existing behavior pin, green
  pre-change) → tests/model/dispatch-fallback.test.js
- **AC-20260813-09-4**: WHEN every `agent(`/`dispatch(` call site across the six bodies is
  enumerated by a depth-counting scanner THE SYSTEM SHALL find explicit `model:` and
  `effort:` on each (the failing example it must catch: wf-panel's aggregate seat today has
  no `effort:`) → tests/model/effort-explicit.test.js
- **AC-20260813-09-5**: WHEN the five pre-existing `effort: 'low'` sites are scanned THE
  SYSTEM SHALL CONTINUE TO carry `'low'` (regression pin, green pre-change; includes
  wf-design's expansion-worker seat per D3's explicit classification) →
  tests/model/effort-explicit.test.js
- **AC-20260813-09-6**: WHEN wf-panel is read THE SYSTEM SHALL pin `model: 'fable'` and
  `effort: 'high'` at the aggregate seat AND SHALL NOT contain `Opus aggregator` in
  meta/phases text; genesis-architect.md and genesis-design.md SHALL NOT contain
  `Opus session/aggregator` → tests/model/doctrine-placement.test.js
- **AC-20260813-09-7**: WHEN § Model Placement is read THE SYSTEM SHALL contain the
  three-band effort rule and the D4 replacement sentence, SHALL NOT match
  `/uncorrelated model/`, and the Exceptions bullet SHALL NOT list the panel aggregator as
  an Opus seat → tests/model/doctrine-placement.test.js
- **AC-20260813-09-8**: WHEN § Question Style and audit.md are read THE SYSTEM SHALL contain
  the underivable-fork consult clause naming `docs/consults.md`, audit's mining list SHALL
  include it with promotion routed through the existing fate enum, and § Escalation Contract
  SHALL CONTINUE TO carry its six triggers unmodified (regression pin, green pre-change) →
  tests/model/doctrine-placement.test.js
- **AC-20260813-09-9**: WHEN `extractFn` extracts an `async function` THE SYSTEM SHALL
  preserve the `async` keyword (literal: `extractFn('async function f(){await g()}', 'f')`
  evaluates under evalFns without SyntaxError) → tests/model/dispatch-fallback.test.js
- **AC-20260813-09-10**: WHEN dispatch is executed with BOTH an unknown agentType and a
  fake that rejects `model:'fable'` THE SYSTEM SHALL succeed via the composed chain (final
  observed call: general-purpose + opus) → tests/model/dispatch-fallback.test.js

## Assumptions (escalation triggers)

- The harness rejects an unavailable model by throwing from `agent()` (not by silently
  substituting). Unverifiable from this repo (availability is a runtime/plan property; the
  vendored SDK types document the enum, not availability behavior). Mitigation: D1 is
  error-shape-agnostic — any throw on a fable seat falls back; the only load is that errors
  surface as throws, which the existing agentType retry already relies on
  (refuter-verified: every non-matching error is a bare `throw e`). If false → the fallback
  is inert, the seat fails loudly, and the fix is a driver-level model probe (follow-up).
- `effort` accepts `'medium'`/`'high'` (vendored SDK types: `'low'|'medium'|'high'|'xhigh'|'max'|number`
  — the three-band rule deliberately narrows this; the wider enum stays legal for future
  rules). If a seat rejects a band → drop to the nearest accepted value, record deviation.
- Retainer consult mechanics (brief-not-decision, citations, could-not-verify) are already
  doctrine; D5 only adds the trigger + ledger. If the retainer section proves not to cover
  fork-shaped consults → escalate, don't extend prose unilaterally.
- Spec 06 lands before this spec's build (chain order), so the shared.md claims re-stamp
  here captures cumulative state — `--update-baseline` recomputes fresh counts, no conflict
  (refuter-verified mechanism).

## Rationale

Audit provenance: Class G (G1–G4). All three user-facing rulings ratified by JJ this
session. The prior "broad Fable whenever useful" rejection (v6.11.0) stands — D5 is
deliberately narrower: it fires only on the empty-derivation case, produces a brief never a
decision, and self-audits via D6's promotion loop.

Refuter-driven corrections (two seats + blind-spot, 2026-08-13): D2 grew from one code
point to all five naming sites (shared.md Exceptions bullet, two genesis checklists,
wf-panel's own meta text) — flipping only the code would have shipped the exact
doctrine-vs-code contradiction the wave closes; D4 now names both uncorrelated-claim loci
with a literal replacement sentence; D5 dropped the "fold the six-trigger list" instruction
entirely (no list item matches "genuine fork"; the Escalation Contract gates a different
mechanism and is now regression-pinned untouched by AC-8); D6 routes promotion through the
audit's existing closed fate enum; D1's Contract now spells out the recursion change that
makes the retries compose (the prose claim was unreachable from the literal delta); D7
(helpers.js async fix) was added because the sanctioned test mode is broken for async
functions — refuter-executed SyntaxError at HEAD.

Rejected: MODEL_FALLBACK entries beyond fable (no evidence of opus outages; silent sonnet
substitution at a judgment seat would be a quality lie); a config knob for the aggregator
model (one ruling, one code point); extending the audit fate enum for consult promotions
(the existing fates express every outcome).

## Canonical Delta

None.
