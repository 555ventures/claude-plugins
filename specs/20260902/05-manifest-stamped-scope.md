---
date: 2026-09-02
status: implementing
build_base: main
tier: critical
area: review-verification
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: ad22f0beefab6ec5690c94a93b34178cfe1076c0
---

# Manifest-stamped review scope: the verdict reads the pass mode it already ran

## Goal

The review verdict stops asking the reviewer which pass it is in. `review-legs.js` stamps the
scope it ran (`full` or `fix-delta`) onto every evidence row it writes; `verdict.js` derives
the required-leg set from those rows and never from the reviewer's return; a `--mark
dispositions` whose verdict is `UNVERIFIED` is refused with the missing legs named instead of
looping silently. Done means: a fix-delta hard-stop derives `GATE_RED` (today it derives
`UNVERIFIED`), a reviewer return with no `scope` key closes CLEAN on a green fix-delta pass,
and the reviewer contract no longer carries a field only the driver could have known.

## Decisions (locked — workers apply verbatim, never override)

<!-- Carrier contract (specs/20260817/07-promise-sweep-leg.md D8; enforced by promise-sweep.js
     at plan lock and in every review): every row cites ≥1 of this spec's own AC-IDs — the AC
     whose test goes red if the decision is unimplemented — or carries `[no-ac: <reason>]` for
     a row with no testable surface. An empty reason ([no-ac: ]) does not count as a sanction. -->

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `review-legs.js` stamps every row it appends through its own writer with `scope: "full"` (no `--fix-delta`) or `scope: "fix-delta"` (`--fix-delta`), as the row's last key, derived from the one `fixDelta` flag it already holds (AC-20260902-05-1). Rows written by `ac-matrix.js` and `promise-sweep.js` are unchanged (they carry no `scope` key). | One writer, one flag, every stamped row agrees by construction; the two sibling scripts' rows stay byte-identical so no other caller changes. Rejected: passing `--scope` down to both siblings (two more scripts and their tests for symmetry alone). |
| D2 | `verdict.js` on the review profile derives the pass scope from the manifest: over the effective rows (last-per-leg, as today), the set of `scope` values on rows that carry the key. Empty set → `full`. Exactly one value in `{full, fix-delta}` → that scope. Any other outcome (two values, or a value outside the enum) makes the manifest invalid → `UNVERIFIED`. `workflow.scope` is never read (AC-20260902-05-2, AC-20260902-05-3, AC-20260902-05-4, AC-20260902-05-5). The release profile does not consult the key (AC-20260902-05-12). | The manifest is the typed evidence the verdict already trusts; the reviewer's word was unknowable to the reviewer. Rejected: inferring fix-delta from absent reconcile/at-risk rows (a killed leg would look like a fix-delta pass — fail-open); an enum guard on the reviewer's field (accepts a well-formed lie, fixes none of the 18 fleet rows). |
| D3 | On `UNVERIFIED`, `verdict.js` prints exactly one stderr line `verdict.js: UNVERIFIED — <cause>` where `<cause>` is `missing required legs: <a>, <b> (scope <s>)` or `manifest invalid: <reason>` (unparseable row / observed shape / `scope` values disagree: <list> / `scope` outside the enum: <value>). stdout (word line, ledger line) and exit code are unchanged (AC-20260902-05-7). | The word alone gave the driver nothing to say; a diagnostic on stderr keeps the single derivation and the frozen stdout contract. |
| D4 | The review-profile ledger row's `scope` and the retained artifact's `scope` are the manifest-derived scope, present on every review row including the no-workflow hard-stop row, in the key position the reviewer-supplied value occupied (AC-20260902-05-9). | The ledger stops recording a hand-typed field; hard-stop rows gain the scope they always had. |
| D5 | `spec-review-driver.js --mark dispositions`: when the dispositions pass prints `UNVERIFIED`, the mark is refused (exit 2) before any sidecar or disposer-return write, with stderr carrying `verdict.js`'s D3 line verbatim plus the remedy: delete the review sidecar directory (named) and re-run the bare driver command (named) from cold (AC-20260902-05-8). | Dispositions can never cure missing evidence; the silent DISPOSITIONS loop becomes one refusal naming its remedy. Rejected: a `legs-rerun` mark (new state for a class this spec makes rare) and a pre-reviewer completeness check (needs a second required-leg derivation or a new verdict mode). |
| D6 | `scope` leaves the reviewer return contract: `spec/commands/review.md`'s return shape, `spec/agents/reviewer.md`'s Return contract, and the driver's three schema strings (REVIEWER step text, the two `reviewer-returned` refusal messages) name `{verdict, survivors, killed, reviewerCount, tokens}`. A return that still carries `scope` is accepted and the key ignored (AC-20260902-05-13, AC-20260902-05-11). | Derive, don't interview: a field nobody reads is an interview for its own sake. Doctrine edit — locked only on JJ's explicit yes at plan time (recorded in Rationale). |
| D7 | Historical ledger rows stay as written: the 18 mis-derived `UNVERIFIED` rows and the 2 prose-`scope` rows across the fleet are not rewritten or amended by this spec. [no-ac: no code surface — ledger history is append-only] | Rewriting history to match a fix is exactly what the ledger must never do; the fix is proven on new rows. |
| D8 | Existing tests that declared scope through the reviewer return move the declaration onto manifest rows, updated in place and retagged with this spec's AC-ID, never weakened: `verdict.test.js`'s AC-20260815-02-8 and AC-20260817-07-11 (fix-delta) cases. The three whole-row `deepStrictEqual` pins on rows `review-legs.js` writes (`legs-verdict-pair.test.js` AC-20260820-06-6 and AC-20260820-06-7, `review-legs.test.js`'s ci sha-unseen row) gain `scope: "full"` in place, keeping their original AC-IDs and adding AC-20260902-05-1 (AC-20260902-05-1, AC-20260902-05-2). | Host § Gotchas: a colliding pin is updated in place and retagged, never left red or weakened. |
| D9 | `spec/.claude-plugin/plugin.json` bumps to 7.58.0 (next free at build time; host § Gotchas semver race) with a changelog paragraph naming manifest-stamped scope, the manifest-derived ledger scope, the dispositions refusal, and the reviewer-contract change. [no-ac: version bump — host § Review Checks makes an unbumped behavior change a hard finding] | Every behavior change bumps the owning plugin's semver. |
| D10 | The hard-stop pass keeps its invocation (no `--workflow`); it derives `GATE_RED` on a fix-delta manifest by construction of D2, pinned end-to-end through the driver (AC-20260902-05-6). Derivation order (`UNVERIFIED` before `GATE_RED`) is unchanged (AC-20260902-05-10). | The order was never the cause; the missing scope was. Reordering a critical derivation for no observed need widens the diff. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other.
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/review-legs.js | MODIFY | scripts | D1: `appendRow` stamps `scope` as the last key; header's row-shape block documents the key on the rows this script writes |
| spec/scripts/verdict.js | MODIFY | scripts | D2/D3/D4: manifest-derived scope replaces `workflow.scope` in `requiredLegs`, the ledger row and the artifact; stderr diagnostic on `UNVERIFIED`; header rewritten for the no-workflow row now carrying `scope` |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D5: `handleDispositions` refuses an `UNVERIFIED` pass before any write, quoting the D3 line and naming the sidecar + bare command; D6: the three return-shape strings drop `scope` |
| spec/commands/review.md | MODIFY | doctrine | D6: reviewer return shape drops `scope: "full"\|"fix-delta"` |
| spec/agents/reviewer.md | MODIFY | doctrine | D6: § Return contract drops `scope` |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: 7.58.0 + changelog paragraph |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260902-05-1 (new full + fix-delta stamping cases; the ci sha-unseen whole-row pin gains `scope: "full"` in place, retagged) |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260902-05-2, AC-20260902-05-3, AC-20260902-05-4, AC-20260902-05-5, AC-20260902-05-7, AC-20260902-05-9, AC-20260902-05-10, AC-20260902-05-12 (D8 moves for AC-20260815-02-8 and AC-20260817-07-11 fix-delta; AC-20260815-02-6 tagged as the -10 pin) |
| tests/review/legs-verdict-pair.test.js | MODIFY | tests | AC-20260902-05-1, AC-20260902-05-2 (the two at-risk whole-row pins gain `scope: "full"` in place, retagged; one end-to-end `--fix-delta` legs → verdict CLEAN pair with a scope-less return) |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260902-05-6, AC-20260902-05-8, AC-20260902-05-11, AC-20260902-05-13 |

Orchestrator duty (outside the table): after CLEAN, apply the Canonical Delta below to
`docs/canonical/review.md` and `docs/canonical/review-legs.md` (review's own close step).

## Contracts

Manifest row written by `review-legs.js` (additive key; every other writer's rows unchanged):

```jsonc
{"leg":"gate","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":40},"scope":"full"}
{"leg":"gate","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":40},"scope":"fix-delta"}
// ac-matrix / skip-reconcile / promise-sweep rows: {"leg","exit","observed"} exactly as today
```

`verdict.js` scope derivation (review profile only; runs after the last-per-leg fold):

```
carriers = effective rows that have a "scope" key
values   = distinct carriers[].scope
values = {}                       → scope "full"
values = {"full"}                 → "full"
values = {"fix-delta"}            → "fix-delta"      (requiredLegs drops reconcile, at-risk)
anything else                     → manifestValid = false → UNVERIFIED
--profile release                 → the key is not read
```

stderr on `UNVERIFIED` (one line; stdout and exit code unchanged):

```
verdict.js: UNVERIFIED — missing required legs: reconcile, at-risk (scope full)
verdict.js: UNVERIFIED — manifest invalid: scope values disagree: full, fix-delta
verdict.js: UNVERIFIED — manifest invalid: scope outside the enum: "fix-delta over d63af56..HEAD"
verdict.js: UNVERIFIED — manifest invalid: row 3 unparseable
```

Reviewer return (review.md, reviewer.md, driver step text) — `scope` removed:

```
{verdict: "CLEAN"|"REVIEWER_FAILED", survivors: [{severity, claim, file, line, impact, evidence}],
 killed: [{claim, file, line, evidence}], reviewerCount: 1, tokens: <n>}
```

Driver refusal at `--mark dispositions` (exit 2, side-effect-free):

```
verdict.js: UNVERIFIED — missing required legs: reconcile, at-risk (scope full)
--mark dispositions refused: dispositions cannot cure missing evidence — the legs must run
again from cold. Delete <sidecarDir> and re-run:
  node <driver> <spec>
```

Ledger row (review profile): `scope` is present on every row, hard-stop rows included, in
today's key position (after `verdict` / `checkpoint` / `escalated`, before `iteration`).
Retained artifact: `scope` holds the same value; `legs` copies manifest rows verbatim, so
stamped rows carry the key there too. The ledger row's `legs` projection stays
`{leg, exit, observed}`.

## Behavior

- **Full pass.** The driver runs `review-legs.js` with no `--fix-delta`; every row it writes
  says `full`; `ac-matrix`/`promise-sweep` rows carry no key. The verdict sees carriers
  `{full}` and requires all eight legs, exactly as today.
- **Fix pass.** `--mark fix-applied` runs legs `--fix-delta`; gate/smoke/ci (and patterns/drift
  when declared) say `fix-delta`; reconcile/at-risk are absent by design. The verdict sees
  `{fix-delta}` and requires six legs. The reviewer writes no scope. The hard-stop pass, still
  with no `--workflow`, derives `GATE_RED` when the gate is red.
- **Old manifest.** A manifest with no carriers (written before this change) derives as
  `full` — the strictest set; nothing can reach CLEAN with fewer legs than today.
- **Disagreement.** Two carriers with different scopes, or a carrier outside the enum, can
  only come from a hand-edited manifest or a writer bug — the manifest is invalid,
  `UNVERIFIED`, and the D3 line names the values.
- **`UNVERIFIED` at dispositions.** The mark is refused before any write; the D3 line and the
  cold-restart remedy print; `review-state.json` stays byte-identical. The DISPOSITIONS state
  is re-derived unchanged on the next bare invocation, so the session sees the same step and
  the refusal, never a silent loop.
- **Reviewer return with a stray `scope` key** (an older doctrine copy, or this spec's own
  review run on the pre-fix main-checkout pipeline): accepted, ignored.

## Acceptance Criteria

- **AC-20260902-05-1**: WHEN `review-legs.js` runs against a green synthetic host THE SYSTEM
  SHALL append every row it writes with `"scope":"full"` as the last key (e.g.
  `{"leg":"smoke","exit":4,"observed":{"result":"inert"},"scope":"full"}`), and WHEN run with
  `--fix-delta` SHALL append `"scope":"fix-delta"` on every row it writes (gate, smoke, ci at
  minimum), while the `ac-matrix`, `skip-reconcile` and `promise-sweep` rows carry no `scope`
  key in either mode → `tests/review/review-legs.test.js` (new cases; the ci sha-unseen
  whole-row pin retagged) and `tests/review/legs-verdict-pair.test.js` (the two at-risk
  whole-row pins retagged)
- **AC-20260902-05-2**: WHEN `verdict.js` reads a manifest of six green rows each stamped
  `"scope":"fix-delta"` (gate, smoke, ci, ac-matrix, skip-reconcile, promise-sweep — the last
  three unstamped is equivalent) with no reconcile/at-risk rows, and a workflow return
  `{"verdict":"CLEAN","survivors":[],"killed":[],"reviewerCount":1,"tokens":10}` with no
  `scope` key THE SYSTEM SHALL print `CLEAN` and exit 0 → `tests/review/verdict.test.js`
  (AC-20260815-02-8's case moved onto the manifest, retagged) and
  `tests/review/legs-verdict-pair.test.js` (real `--fix-delta` legs → `verdict.js`)
- **AC-20260902-05-3**: WHEN the same six green rows carry no `scope` key anywhere and the
  workflow return says `"scope":"fix-delta"` THE SYSTEM SHALL print `UNVERIFIED` (the
  return's scope is never read; carriers `{}` → `full` → reconcile and at-risk missing) →
  `tests/review/verdict.test.js`
- **AC-20260902-05-4**: WHEN every leg is present and green but the gate row says
  `"scope":"full"` and the smoke row says `"scope":"fix-delta"` THE SYSTEM SHALL print
  `UNVERIFIED` and a stderr line containing `scope values disagree: full, fix-delta`; and WHEN
  a carrier says `"scope":"fix-delta over d63af56..HEAD"` THE SYSTEM SHALL print `UNVERIFIED`
  and a stderr line containing `scope outside the enum` → `tests/review/verdict.test.js`
- **AC-20260902-05-5**: WHEN `verdict.js` runs with no `--workflow` over a manifest stamped
  `fix-delta` whose gate row is `{"leg":"gate","exit":1,…,"scope":"fix-delta"}` and which has
  no reconcile/at-risk rows THE SYSTEM SHALL print `GATE_RED` (exit 1), never `UNVERIFIED` →
  `tests/review/verdict.test.js` (pre-image executed: prints `UNVERIFIED`, spike S1)
- **AC-20260902-05-6**: WHEN the driver's `--mark fix-applied` legs run hard-stops on a red
  gate THE SYSTEM SHALL append a ledger row with `"verdict":"GATE_RED"`,
  `"scope":"fix-delta"` and `"iteration":2`, and `--state` SHALL report `STOPPED` →
  `tests/review/review-driver.test.js` (fixture: green host → one soft survivor → disposer
  `fix` → break `tests/foo.test.js` → `--mark fix-applied`)
- **AC-20260902-05-7**: WHEN `verdict.js` derives `UNVERIFIED` THE SYSTEM SHALL print exactly
  one stderr line beginning `verdict.js: UNVERIFIED — ` (a full manifest missing at-risk →
  `missing required legs: at-risk (scope full)`; a row whose `observed` is a string →
  `manifest invalid: `…), with stdout line 1 still the bare word and, under `--ledger`, line 2
  still the row → `tests/review/verdict.test.js`
- **AC-20260902-05-8**: WHEN `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0`
  is invoked after a gate override row `{"leg":"gate","exit":0,"observed":{"skips":0,"todos":0,
  "testsExecuted":1},"scope":"fix-delta"}` has been appended to a full-scope manifest THE
  SYSTEM SHALL exit 2, leave `review-state.json` byte-identical, write no
  `disposer-return-*.json`, and print stderr containing `verdict.js: UNVERIFIED — manifest
  invalid: scope values disagree`, the sidecar directory path, and the literal bare command
  `node <driver> <spec>` → `tests/review/review-driver.test.js`
- **AC-20260902-05-9**: WHEN `verdict.js --ledger` runs with no `--workflow` over the
  AC-20260902-05-5 manifest THE SYSTEM SHALL print a row whose `scope` is `"fix-delta"`, keyed
  immediately after `verdict` (no `checkpoint`/`escalated` passed), and WHEN run with
  `--workflow` (return without `scope`) and `--retain` SHALL write an artifact whose `scope`
  equals the row's `scope` and whose key order is unchanged → `tests/review/verdict.test.js`
- **AC-20260902-05-10**: WHEN a full-scope manifest (carriers `{full}` or none) lacks the
  at-risk row THE SYSTEM SHALL CONTINUE TO derive `UNVERIFIED`, never `CLEAN` →
  `tests/review/verdict.test.js` (existing AC-20260815-02-6 test, tagged)
- **AC-20260902-05-11**: WHEN a reviewer return carries a `scope` key of any value
  (`"full"`, `"fix-delta"`, or prose) THE SYSTEM SHALL CONTINUE TO accept it at `--mark
  reviewer-returned` and reach DISPOSITIONS → `tests/review/review-driver.test.js` (the
  existing CLEAN_RETURN mark test, tagged)
- **AC-20260902-05-12**: WHEN `verdict.js --profile release` reads a green release manifest in
  which one row carries `"scope":"fix-delta"` THE SYSTEM SHALL CONTINUE TO derive `CLEAN` from
  `RELEASE_LEGS` alone (the key is not read on the release profile) →
  `tests/review/verdict.test.js`
- **AC-20260902-05-13**: WHEN the driver prints the REVIEWER step, or refuses a
  `reviewer-returned` file that is not JSON or lacks `survivors` THE SYSTEM SHALL name the
  return shape as `{verdict, survivors, killed, reviewerCount, tokens}` and the printed text
  SHALL NOT contain the substring `scope` → `tests/review/review-driver.test.js`

## Assumptions (escalation triggers)

<!-- Load-bearing assumptions. If one proves false mid-build, the worker returns
     blocked and adjudication starts HERE. Pair every assumption with its fallback. -->

- A1 (executed, spike S3): `verdict.js`'s row parser accepts a row with an extra `scope` key —
  six rows prefixed `"scope":"fix-delta"` plus a `scope: fix-delta` return printed `CLEAN`,
  exit 0. **if false:** STOP — D1's additive field would invalidate every manifest.
- A2 (executed, pre-image): spike S1 — fix-delta-shaped manifest, red gate, no `--workflow`
  → `UNVERIFIED` exit 1 (AC-5 is red today). Spike S2 — same manifest green, return
  `"scope":"fix-delta over d63af56..HEAD"` → `UNVERIFIED` exit 1; S2b with `"fix-delta"`
  verbatim → `CLEAN` exit 0 (the reviewer-word dependency). Spike S4 — full green manifest,
  no `--workflow` → exit 2 `all legs green — the panel must run` (the guard D5 must not
  disturb). **if false:** the pre-image already behaves as specified; re-derive which ACs are
  `[pre-green:]` before Phase 1.
- A3 (executed grep): the only tests that relax required legs through the return's `scope` are
  `verdict.test.js`'s AC-20260815-02-8 and AC-20260817-07-11 (fix-delta) cases; the only
  whole-row `deepStrictEqual` pins on rows `review-legs.js` writes are
  `legs-verdict-pair.test.js` lines for AC-20260820-06-6/-7 and `review-legs.test.js`'s ci
  sha-unseen pin. **if false:** the build's whole-suite check names the rest — update in
  place and retag (D8), record the deviation.
- A4: `escalate-row.test.js`'s fix iterations run the real `review-legs.js --fix-delta` (so
  their rows are stamped `fix-delta`) and its hand-written full manifests include reconcile
  and at-risk rows, so its returns' `scope: "fix-delta"` becoming ignored changes no verdict
  there. **if false:** stamp `scope` onto that fixture's hand-written rows in place, retagged.
- A5 (executed grep): no script other than `verdict.js` reads `workflow.scope` or a review
  row's `scope` (`init-gen.js`'s `row.scope` is a plugin-registry field). **if false:** STOP.
- A6 (executed, fleet): across the 8 readable ledgers under `~/Projects` (748 review rows),
  18 rows say `UNVERIFIED` with a red gate leg and no reconcile row — hearwell 2, prax 4,
  salon-os 12 — and 2 prax rows carry prose in `scope`. Query: `stage==="review" &&
  verdict==="UNVERIFIED" && legs.gate.exit!==0 && !legs.some(reconcile)`. **if false:** the
  number is Rationale evidence, not a contract; correct it in place.
- A7 (dogfood trap): this spec's own build and review run the MAIN checkout's pre-fix
  `spec-review-driver.js`/`verdict.js` (`spec-paths review-driver` resolves outside the
  worktree), so this spec's reviewer must still write `"scope":"fix-delta"` verbatim on a
  fix-delta pass or the pre-fix verdict loops. **if false** (the worktree's own driver is what
  runs): the reviewer omits `scope` per D6 — either way the return is accepted (AC-11).
- A8: `tests/review/review-driver.test.js`'s `makeHost` fixture can be driven to a red-gate
  fix pass by rewriting `tests/foo.test.js` before `--mark fix-applied` (its gate is `node
  --test {testDirs}`). **if false:** build the AC-6 fixture in `escalate-row.test.js`, whose
  `driveToCapEdge` already reaches iteration 2.

## Rationale

The review pipeline runs its deterministic legs in one of two modes: a full pass, or a
fix-delta pass that deliberately skips reconcile, at-risk and patterns because the fix diff is
a response to findings (CROSS-20260727-01). `verdict.js` learned the mode only from
`workflow.scope === 'fix-delta'` — a word the reviewer typed — and the REVIEWER step never told
the reviewer which pass it was in. Any other spelling made the required set the full one, the
verdict `UNVERIFIED`, and `deriveState`'s `word !== 'CLEAN' → DISPOSITIONS` branch a loop with
no message; a spinning loop appends no ledger row, so the class is invisible to any
escape-derived count. The hard-stop pass never passes `--workflow` at all, so every fix-delta
manifest with a red gate was judged against the full checklist and `UNVERIFIED` won over
`GATE_RED` in the derivation order (A6: 18 fleet rows). `review-state.json` already recorded
`legsMode[n].fixDelta` — the pipeline was asking a party to hand-write a fact it had.

**Why the manifest and not the sidecar.** `verdict.js` is invoked three ways by the driver and
by hand; the manifest is the one input every invocation already receives and already trusts.
The sidecar is driver-private state.

**Why not every row (three writers).** `ac-matrix.js` and `promise-sweep.js` append their own
rows. Stamping those too means a `--scope` flag on two more scripts for symmetry; the
carrier rule (D2) makes the unstamped rows harmless, and gate/smoke/ci — always written by
`review-legs.js` in both modes — guarantee at least three carriers on any real manifest.
Rejected too: reading the gate row alone (a test's hand-appended gate override without the
key would flip a fix-delta iteration to `full`).

**Rejected alternatives recorded for the cold reader.** Inferring fix-delta from absent
reconcile/at-risk rows: a crashed leg is indistinguishable from a skipped one — fail-open. An
enum guard at `reviewer-returned`: accepts a well-formed lie and does nothing for the fleet
rows. Reordering `GATE_RED` ahead of `UNVERIFIED`: the order was never the cause; a red row in
an incomplete manifest is still incomplete evidence. A `legs-rerun` mark for the refusal
remedy: after this fix `UNVERIFIED` at dispositions means a leg crashed — a cold restart is an
honest remedy for a rare state and adds no new driver state. A pre-reviewer completeness check:
`verdict.js` refuses a green complete manifest with no `--workflow` (spike S4) by design, so
the driver cannot ask it without a new mode or a second required-leg derivation.

**Incident Policy standing.** This is a defect fix under the first clause (fix plus behavioral
tests that execute the fixed path), not a new standing guard; the D5 refusal is the error path
of an existing mark naming its remedy (host § Worker Rules). Materiality (A6) is cited as
evidence, not as an admission-bar field. The bar's materiality field counts escape rows and
this class produces none — a doctrine question JJ has not ruled on; flagged, not proposed here.

**No roadmap brief.** Ad-hoc defect-fix specs carry `brief: n/a` by precedent
(specs/20260818/01, specs/20260820/03). The sibling defect found in the same run — comment
citations that stop resolving after their owner is deleted — is planned as its own
standard-tier spec next, not folded here (disjoint files, different class).

**Fragile during execution.** A7: the reviewer for this spec's own review still writes
`"scope":"fix-delta"` on a fix pass. D8's retags must keep the original AC-IDs alongside the
new one. `red-check.js` refuses a non-tests File Plan path edited before the red run — the
three script rows stay untouched until Phase 1 is red. `tests/consistency/observed-grammar-
purity.test.js` pins `verdict.js`'s source against nine packed-string stems and any `.exec(`
call — the D3 diagnostic is built from typed fields and string joins, never a regex.

**Doctrine gate.** D6 edits `review.md` and `reviewer.md`. JJ ruled yes at plan time
(2026-09-02: drop the field from the reviewer's instructions); the two doctrine rows and the
driver's schema strings are in the File Plan on that ruling.

## Canonical Delta

`docs/canonical/review.md` — add under the legs/verdict material: *Review scope is
manifest-derived. `review-legs.js` stamps every row it writes with `scope: "full" |
"fix-delta"`; `verdict.js` reads the pass scope off those rows (carriers must agree; none
means `full`; disagreement or a value outside the enum invalidates the manifest →
`UNVERIFIED`) and never off the reviewer's return, which no longer carries a `scope` field.
On `UNVERIFIED`, `verdict.js` prints one stderr line naming the missing legs or the invalid
row, and the review driver refuses `--mark dispositions` on that word before any write —
dispositions cannot cure missing evidence; the remedy is a cold re-run of the legs. The
review-profile ledger row's `scope` is the manifest-derived value on every row, hard-stop rows
included. (specs/20260902/05-manifest-stamped-scope.md)*

`docs/canonical/review-legs.md` — add a section *Rows carry their scope*: *Every row this
script appends carries `scope` as its last key, `full` or `fix-delta`, from the one
`--fix-delta` flag; rows appended by `ac-matrix.js` and `promise-sweep.js` carry no key and
`verdict.js` treats them as non-carriers. (specs/20260902/05-manifest-stamped-scope.md)*
