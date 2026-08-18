---
date: 2026-08-17
status: implementing
diff_base: d5fdcc63ff0e5c85c6729eb44a3956469f0ef8c2
tier: critical           # edits verdict.js + review-legs.js — both named critical triggers in host rules § Risk Tiers
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 09
open_markers: 0
---

# Promise-sweep leg: every Decision row names its carrier

## Goal

The v7 replay eval measured the single reviewer's one systematic miss class: spec Decisions
that promise behavior nothing implements — no test fails, so nothing points at them (all
five measured misses were Decisions-table rows). This spec retires the prose response
(reviewer diligence) with a deterministic leg: a new `promise-sweep.js` enumerates every
Decisions-table row and requires each to name a carrier — an AC-ID from the same spec
(whose test the existing ac-matrix leg already forces to exist and execute) — or an
explicit `[no-ac: <reason>]` sanction. Orphans are hard findings on the review disposition
flow; the same script runs advisory at plan lock so orphans die at authoring time. Done
means: the leg runs in every review (`review-legs.js`), its absence fails the verdict
closed (`verdict.js`), reviewer.md's prose sweep shrinks to the semantic half, and core.md
records the critical-tier ruling — scoped non-redundant legs, never a second general
reviewer.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New sibling script `spec/scripts/promise-sweep.js` (never an ac-matrix extension): `--spec <path> [--manifest <path>] [--json]`. It reads ONLY the spec text — no `--root`, no File Plan, no test-file reads (ac-matrix owns AC→test). Enumerates `## Decisions` table rows whose first cell matches a D-ID; each non-struck row must be carried (D2). Exit codes: 0 = no findings · 1 = findings (disposition flow) · 2 = usage error, unreadable spec, or no `## Decisions` section (stderr names the remedy). Finding class: `orphan-decision`, severity hard. Observed grammar: `rows=N carried=C sanctioned=S orphans=O`. With `--manifest`, appends exactly one JSONL row `{"leg":"promise-sweep","exit":<0|1>,"observed":"…"}`; without it, writes nothing (plan-lock mode). (AC-20260817-07-1, AC-20260817-07-2, AC-20260817-07-7, AC-20260817-07-8) | Spec-text-only keeps the chain factored: promise-sweep proves Decision→AC, ac-matrix proves AC→test→executed — no second coverage machinery. Rejected: extending ac-matrix.js (its two legs are byte-pinned critical surface; a third concern in one file grows the blast radius the tier exists to bound). |
| D2 | Carrier grammar: a row is **carried** when it contains ≥1 AC-ID token — anchored occurrences only (not preceded by `[A-Za-z0-9]`, not followed by `[0-9A-Za-z]`, the 20260817/05 discipline) — that exists as a well-formed bullet in this spec's `## Acceptance Criteria`. An AC-ID absent from this spec's AC section is **not** a carrier and raises no finding of its own (Decisions legitimately cite foreign specs' ACs as provenance); an uncarried row's `orphan-decision` detail lists any such unmatched citations so a same-spec typo is visible. A row is **sanctioned** when it contains `[no-ac: <non-empty reason>]` (empty reason ≠ sanction). Carried wins over the tag when both appear. Struck rows (first cell `~~D…~~`) are superseded: excluded from `rows=` and never findings. (AC-20260817-07-3, AC-20260817-07-4, AC-20260817-07-5, AC-20260817-07-6) | Executed corpus spike: 58 specs, 511 rows, 0 missing Decisions section — enumeration is deterministic; only 4.1% of rows cite ACs today, so the carrier is authored going forward, never inferred from prose. Rejected: a dangling-ref finding class — it would fire on every provenance citation of a foreign AC (routine false alarms rubber-stamp the check). |
| D3 | Shared parsing moves to new `spec/scripts/lib/spec-sections.js`: `AC_ID_RE`, `AC_ID_RE_GLOBAL`, `extractSection`, `parseAcBullets` — lifted verbatim from ac-matrix.js, which now imports them; every ac-matrix observed string, finding class, and exit code stays byte-identical. ac-matrix.js's stale header claim that `ac-id-lint.test.js` lifts the regex from its source is corrected to name the lib as the single authority (that test does not exist — grep evidence in A3). (AC-20260817-07-14) | One authority for the AC-ID grammar and section extraction; duplicating the regex in a sibling script would be a second derivation of a load-bearing shape. Rejected: promise-sweep requiring ac-matrix.js as a module — it is a script that executes on require. |
| D4 | Wiring: `review-legs.js` runs promise-sweep in every scope — full AND `--fix-delta` (spec text may be amended during fixes; the leg is milliseconds) — appending its manifest row like ac-matrix does. `verdict.js`: `'promise-sweep'` joins `REVIEW_LEGS` as required-but-non-blocking in BOTH scopes (absent row → `UNVERIFIED`, the fail-closed presence rule; red row → findings disposition, never `GATE_RED`; it does not join `REVIEW_BLOCKING`). (AC-20260817-07-9, AC-20260817-07-10, AC-20260817-07-11, AC-20260817-07-12, AC-20260817-07-13) | Mirrors ac-matrix's standing exactly — the leg the brief says to generalize. The executed redden spike (A2) enumerated exactly three fixture suites this extension reds; all are File Plan rows, retargeted in place, never weakened. |
| D5 | `plan.md`'s Lock checklist gains the executable half of its existing promise-trace sentence: run `node "$(spec-paths promise-sweep)" --spec {spec path}` (no `--manifest`); zero `orphan-decision` findings to lock — resolve each by citing the delivering AC in the row or recording `[no-ac: <reason>]`. `spec-paths` gains the `promise-sweep` key (usage line updated). (AC-20260817-07-15; the plan.md prose edit itself: [no-ac: lock-checklist choreography — the invoked script's behavior is pinned by AC-20260817-07-1..8]) | Orphans caught at authoring cost one edit; caught at review they cost a disposition round. The lock sentence "an AC that goes red in its absence" stops being hand-verified for Decisions. |
| D6 | `reviewer.md`'s "The promise sweep" section shrinks to the semantic half: the deterministic leg owns enumeration; the reviewer (a) verifies each carried Decision's cited AC/test actually asserts the promised behavior (a citation that doesn't deliver is hard — the existing AC↔test semantic backstop's sibling), (b) still verifies config/override/flag promises by executing the path with the override set, (c) treats a `[no-ac:]` whose reason is false — the decision IS testable behavior — as a hard finding, (d) keeps the regression-pin-deletion rule. The no-prose-demotion rule (evidence-standard section) is untouched. Net prose down. [no-ac: doctrine prose; its enforcement surface is D1's script + the reviewer's judgment residue by design] | Choreography-to-code per the brief: the enumerable half was exactly what a per-session prose walk performed unreliably; the semantic half is what no script can own. |
| D7 | `core.md` § Tiers records the ruling that closes the replay eval's open call: critical tier adds review capacity only as **narrowly-scoped, non-redundant legs registered by name** (host pipeline rules § Review Checks; wired via `verdict.js --require`) — never a second general reviewer (reviewer agreement is measurably not a correctness signal — Spearman ρ 0.20–0.59, Aug 2026). Promise-sweep itself runs at every tier; the ruling governs future capacity. No other sharpening of the critical admission criteria (brief open question 3: current triggers stand — no evidence they misfired). [no-ac: doctrine ruling; the --require mechanism it cites is already pinned by AC-20260815-04's verdict-require-leg suite] | Evidence-backed (brief Grounding); `--require` already exists, so the ruling names a mechanism, not a wish. Reopen condition per the brief: a post-09 escape showing a miss class no scoped leg can own. |
| D8 | `spec/templates/spec.md`: the Decisions section gains a comment stating the carrier contract (every row cites ≥1 of this spec's AC-IDs — the AC whose test goes red if the decision is unimplemented — or `[no-ac: <reason>]` for rows with no testable surface), and the example row shows a carrier. The Behavior section comment gains the funnel rule: testable promises written there must be restated as Acceptance Criteria — Behavior prose is deliberately NOT enumerated (JJ ruling 2026-08-17, this session). [no-ac: template prose; enforced on every future spec by D1's script at plan lock and review] | JJ picked signal quality over full enumeration: all five measured misses were table rows; structuring free prose forces duplicate promise homes and routine waivers that rubber-stamp the check. First escape traced to a Behavior-only promise reopens the call. |
| D9 | `spec/.claude-plugin/plugin.json` bumps to 7.1.0 (target, not pin — build takes the next free version on a race) with the last-3-versions description changelog. [no-ac: manifest metadata; the version-bump-on-behavior-change rule is a host Review Checks hard finding, reviewer-enforced] | Behavior change ⇒ semver bump per host Planning rules. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/spec-sections.js | CREATE | scripts | AC_ID_RE, AC_ID_RE_GLOBAL, extractSection, parseAcBullets lifted verbatim from ac-matrix.js (D3) |
| spec/scripts/ac-matrix.js | MODIFY | scripts | import from lib/spec-sections.js; behavior byte-identical; correct stale ac-id-lint header claim (D3) |
| spec/scripts/promise-sweep.js | CREATE | scripts | the leg per D1/D2; header comment per script conventions (usage, incident, NOT-do, exit codes) |
| spec/scripts/review-legs.js | MODIFY | scripts | run promise-sweep in every scope incl. --fix-delta; header leg list updated (D4) |
| spec/scripts/verdict.js | MODIFY | scripts | 'promise-sweep' joins REVIEW_LEGS, both scopes, non-blocking; header note (D4) |
| spec/bin/spec-paths | MODIFY | scripts | promise-sweep key + usage line (D5) |
| spec/templates/spec.md | MODIFY | doctrine | Decisions carrier contract + example carrier; Behavior funnel rule (D8) |
| spec/agents/reviewer.md | MODIFY | doctrine | promise-sweep section shrinks to semantic half per D6 |
| spec/commands/plan.md | MODIFY | doctrine | Lock checklist: run promise-sweep, zero orphans to lock (D5) |
| spec/commands/review.md | MODIFY | doctrine | Phase 0 step 2 leg list gains promise-sweep (D4) |
| spec/doctrine/core.md | MODIFY | doctrine | § Tiers: scoped-legs-never-second-reviewer ruling (D7) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | 7.1.0 + description changelog (D9) |
| tests/review/promise-sweep.test.js | CREATE | tests | AC-20260817-07-1..8 behavioral tests against synthetic specs in tmpdir |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260817-07-11, AC-20260817-07-12; SIX_GREEN-family fixtures gain the promise-sweep row, retargeted in place (A2) |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260817-07-9, AC-20260817-07-10; roster loop + synthetic host spec gains a carried Decision |
| tests/verdict-gatered-no-workflow.test.js | MODIFY | tests | AC-20260817-07-13; both fixture manifests gain the promise-sweep row, CONTINUE TO pins retargeted in place (A2) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260817-07-15; 'promise-sweep' joins the documented-keys list |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20260817-07-14 retag only — existing suite is the byte-identity pin for D3; no assertion changes |

## Contracts

```
promise-sweep.js --spec <path> [--manifest <path>] [--json]

  exit 0  no findings
  exit 1  findings emitted (review disposition flow; never a script failure)
  exit 2  usage error, unreadable --spec, or no `## Decisions` section

  manifest row (appended only when --manifest given; sole writer of this row):
    {"leg":"promise-sweep","exit":<0|1>,"observed":"rows=N carried=C sanctioned=S orphans=O"}

  finding (stdout; --json mirrors ac-matrix's {findings, warnings, observed} shape):
    {severity:"hard", class:"orphan-decision", id:"D3",
     detail:"D3: no carrier — cite one of this spec's AC-IDs or add [no-ac: <reason>]
             (unmatched citations: AC-20250101-01-1)"}

lib/spec-sections.js exports (lifted verbatim from ac-matrix.js):
  AC_ID_RE          /^AC-\d{8}-\d{2}[a-z]?-\d+$/
  AC_ID_RE_GLOBAL   /AC-\d{8}-\d{2}[a-z]?-\d+/g
  extractSection(text, heading)   // ##/### prefix-tolerant, case-insensitive, level-bounded
  parseAcBullets(sectionText)     // {id, token, malformed, oracle, env} per top-level bullet

verdict.js: REVIEW_LEGS = [..., 'at-risk', 'promise-sweep']; excluded from neither scope's
required set; never in REVIEW_BLOCKING.
```

Decision-row enumeration: within `extractSection(text, 'Decisions')`, a row is a line
matching `^\|\s*(~~)?\s*D\d+` (optional letter/prime suffix tolerated, unlinted); the whole
row text (all cells) is scanned for carriers. Anchored AC-ID occurrence: full-token match
with no `[A-Za-z0-9]` immediately before and no `[0-9A-Za-z]` immediately after.

## Behavior

Review flow: review-legs runs the leg alongside the others; a red promise-sweep row never
blocks the reviewer dispatch (findings leg, like ac-matrix); verdict derives `UNVERIFIED`
when the row is absent, and findings ride the normal Phase 2 disposition (fix = add the
carrier or the sanction to the spec; waive/reject = user only). Plan flow: the Lock
checklist runs the script manifest-less and the session resolves every orphan before
flipping `hardened`. This spec's own Decisions table is written to its own contract — at
its review, the leg it ships will parse it.

## Acceptance Criteria

<!-- Test fixtures are synthetic specs written to tmpdir() by the tests; literal examples
     below are the fixture content contracts (critical tier: every AC carries one). -->

- **AC-20260817-07-1**: WHEN promise-sweep.js runs against a spec whose Decisions row `| D1 | does X (AC-20260899-99-1) | why |` cites an AC-ID declared as a bullet `- **AC-20260899-99-1**: …` in its Acceptance Criteria THE SYSTEM SHALL exit 0 with observed `rows=1 carried=1 sanctioned=0 orphans=0` → tests/review/promise-sweep.test.js
- **AC-20260817-07-2**: WHEN a non-struck Decisions row contains no AC-ID token and no `[no-ac:]` tag (e.g. `| D1 | does X | why |`) THE SYSTEM SHALL exit 1 and emit one hard `orphan-decision` finding whose detail names `D1` → tests/review/promise-sweep.test.js
- **AC-20260817-07-3**: WHEN a row carries `[no-ac: doctrine-only ruling]` and no AC-ID THE SYSTEM SHALL count it sanctioned (`sanctioned=1`, exit 0), and WHEN the tag's reason is empty (`[no-ac: ]`) THE SYSTEM SHALL treat the row as an orphan → tests/review/promise-sweep.test.js
- **AC-20260817-07-4**: WHEN a row cites `AC-20260899-99-11` and the AC section declares only `AC-20260899-99-1` THE SYSTEM SHALL NOT count the citation as a carrier (anchored full-token match, no prefix phantom: `AC-20260899-99-1` inside `AC-20260899-99-11` is not an occurrence) and SHALL report the row as an orphan listing the unmatched citation → tests/review/promise-sweep.test.js
- **AC-20260817-07-5**: WHEN a row cites only a foreign AC-ID absent from this spec's AC section (e.g. `AC-20250101-01-1` as provenance) THE SYSTEM SHALL emit an `orphan-decision` whose detail lists that unmatched citation, and WHEN the same row also cites a declared own-spec AC-ID THE SYSTEM SHALL count it carried with no finding → tests/review/promise-sweep.test.js
- **AC-20260817-07-6**: WHEN the table contains a struck row `| ~~D2~~ | retired | — |` THE SYSTEM SHALL exclude it entirely (a spec whose only other row is carried reports `rows=1 carried=1 … orphans=0`, exit 0) → tests/review/promise-sweep.test.js
- **AC-20260817-07-7**: WHEN `--spec` names a file with no `## Decisions` section THE SYSTEM SHALL exit 2 with a stderr line naming the missing section and the spec path (literal: exit code `2`, stderr contains `no ## Decisions section`) → tests/review/promise-sweep.test.js
- **AC-20260817-07-8**: WHEN `--manifest <path>` is given THE SYSTEM SHALL append exactly one line `{"leg":"promise-sweep","exit":<0|1>,"observed":"rows=… carried=… sanctioned=… orphans=…"}` to it, and WHEN omitted THE SYSTEM SHALL write no file at all (plan-lock mode) → tests/review/promise-sweep.test.js
- **AC-20260817-07-9**: WHEN review-legs.js runs against the green synthetic host (its spec's Decisions rows carried) THE SYSTEM SHALL produce a manifest containing a `promise-sweep` row with exit 0 alongside the existing seven legs → tests/review/review-legs.test.js
- **AC-20260817-07-10**: WHEN review-legs.js runs with `--fix-delta` THE SYSTEM SHALL still emit the `promise-sweep` row (the leg is excluded from no scope) → tests/review/review-legs.test.js
- **AC-20260817-07-11**: WHEN a verdict.js manifest lacks the `promise-sweep` row THE SYSTEM SHALL derive `UNVERIFIED` on both full and fix-delta scopes (literal: seven-leg green manifest without the row → `UNVERIFIED`, exit 1) → tests/review/verdict.test.js
- **AC-20260817-07-12**: WHEN the `promise-sweep` row reports exit 1 (findings) and every other leg is green with a clean workflow return THE SYSTEM SHALL treat the leg as executed-green for presence — never `GATE_RED` — and reach `CLEAN` once findings are dispositioned (mirror of ac-matrix's standing) → tests/review/verdict.test.js
- **AC-20260817-07-13**: WHEN a manifest carries a red gate row plus all required rows including `promise-sweep` THE SYSTEM SHALL CONTINUE TO derive `GATE_RED` (exit 1) on the documented no-`--workflow` pre-reviewer invocation, and a green complete manifest without `--workflow` SHALL CONTINUE TO exit 2 → tests/verdict-gatered-no-workflow.test.js
- **AC-20260817-07-14**: WHEN ac-matrix.js runs after the lib extraction THE SYSTEM SHALL CONTINUE TO emit byte-identical observed strings (`uncovered=N oracle=M`, `skipped=N sanctioned=M`), finding classes, and exit codes → existing suite tests/ac-matrix/ac-matrix.test.js (retagged, not duplicated)
- **AC-20260817-07-15**: WHEN `spec-paths promise-sweep` runs THE SYSTEM SHALL print a path to an existing file (the key joins the documented-keys resolution test) → tests/spec-paths.test.js

## Assumptions (escalation triggers)

- A1: The Decisions enumeration mechanics hold corpus-wide — executed spike 2026-08-17
  (scratchpad script over `specs/**`): 58 specs, 511 D-rows parsed, 1 struck, 0 specs
  missing a `## Decisions` heading; 4.1% of rows cite AC-IDs today (carrier is prospective,
  authored at plan time). — **if false** (a spec shape the row regex misses at build):
  widen the row regex in D1's script, never the requirement.
- A2: Extending `REVIEW_LEGS` reds exactly three fixture suites — executed spike
  2026-08-17: patched `verdict.js` REVIEW_LEGS with `'promise-sweep'`, ran `npm test`,
  observed failures confined to tests/review/verdict.test.js (11 tests),
  tests/verdict-gatered-no-workflow.test.js (2), tests/review/review-legs.test.js (1);
  reverted, suite green (0 failing). All three are File Plan rows. — **if false** (more
  suites red at build, e.g. a concurrent session's new pins): attribute by execution per
  the host Gotcha, retarget in place, record the deviation.
- A3: No test lifts `AC_ID_RE` from ac-matrix.js's source location — grep evidence
  2026-08-17: `ac-id-lint.test.js` (named in ac-matrix's header) does not exist; the only
  test-side mentions are comments. — **if false**: retarget that pin to
  lib/spec-sections.js in place.
- A4: 7.1.0 is free at build time — target, not pin (host Gotcha: concurrent sessions race
  semver); build takes the next free version and records the deviation.
- A5: review-legs.js appends the promise-sweep row on every path including a red-gate run
  (all legs run before the summary decides `RED_BLOCKING`) — preserved by construction in
  D4's wiring. — **if false**: the AC-20260817-07-13 pin catches it (a missing row would
  derive UNVERIFIED, not GATE_RED); fix the ordering, never the pin.

## Rationale

The brief's three open questions resolved: (1) clause enumeration — Decisions-table rows
only, per JJ's ruling this session (style-gated question, answered "Keep prose free"): all
five replay misses were table rows; structuring Behavior forces duplicate promise homes
and routine waivers that rubber-stamp the check; the reopen trigger is the first escape
traced to a Behavior-only promise. (2) Carrier syntax — in-row AC-ID citation, leg-side
anchored matching; the sanction lives in the row as `[no-ac:]`. The corpus spike (A1)
killed leg-side inference from prose: 4% density. Routing through ACs reuses the entire
existing AC→test enforcement chain instead of growing a parallel one. (3) Critical-tier
criteria — unchanged beyond D7's ruling sentence; no evidence the current triggers misfire.

The File Plan is 18 rows, over the ~15 guideline: one primary area, and eight rows are
one-to-five-line edits (key registration, leg-list mentions, fixture retargets, a retag).
Splitting would slice by layer — the forbidden shape — since every row serves the single
landing unit "the leg exists, is wired, and is fail-closed".

Collision-closure waives (run at lock, 2026-08-17): `likely` hit
tests/scope-reconcile-at-risk.test.js (verdict.js edit) — waived on executed contrary
evidence: A2's spike ran the exact REVIEW_LEGS extension through `npm test` and that suite
stayed green (it builds no verdict manifest). Literals hits `AC_ID_RE`/`parseBullets` in
tests/ac-matrix-coverage-holes.test.js — waived: comment-only references that stay accurate
once the lib is the named authority. `promise sweep` in docs/audit/v7-replay-eval.md and
docs/roadmap/09-promise-sweep-leg.md — waived: historical record and the founding brief;
neither is edited by a spec they ground.

This spec dogfoods its own contract: every Decisions row above cites its delivering AC or
carries a `[no-ac:]`, because the leg it ships will parse this file at its own review.

Fragile spots for build: verdict.js's `derive()` checks presence before blocking-red, so
every fixture manifest that expects `GATE_RED` must carry the new row (A2's two
gatered-no-workflow tests are exactly this); the synthetic host spec inside
review-legs.test.js must gain a carried Decision row or the new leg honestly reports an
orphan and the "green host" test's exit-0 assertion still holds (non-blocking) but the
row-exit assertion must expect it — give the fixture a carrier instead.

## Canonical Delta

docs/canonical/review.md, the verdict/legs bullet: extend the leg roster sentence —
`promise-sweep` joins the required-but-non-blocking findings legs (`reconcile`/`ac-matrix`/
`skip-reconcile`/`at-risk`): it enumerates the spec's Decisions rows and hard-flags any
non-struck row lacking a same-spec AC-ID carrier or `[no-ac: <reason>]` sanction
(specs/20260817/07-promise-sweep-leg.md). Add one bullet: the promise sweep's deterministic
half lives in `promise-sweep.js` (run at plan lock manifest-less and in every review scope
by review-legs.js); the reviewer retains only the semantic half — carrier-delivers-the-
promise verification and executed config/override checks. Critical tier adds review
capacity as named scoped legs via `verdict.js --require`, never a second general reviewer
(core.md § Tiers).
