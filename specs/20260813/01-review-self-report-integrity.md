---
date: 2026-08-13
status: implementing
diff_base: 31487d8a365778b715d83314f8326721406d4f4a
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260813/02-durable-verification-qualifiers.md"]
brief: n/a
---

# Review Self-Report Integrity

## Goal

The review stage's self-reports become trustworthy where three incident classes showed they are
not: a verifier can no longer kill a finding while its own evidence denies the kill (prompt
guard on the SANCTIONED path plus a mechanical post-verify audit of every `killed[]` entry); a
review-stage agent can no longer mutate shared substrates or leave scratch files that the close
commit ships; and two standing review holes close — the fix-delta full-gate contract becomes
visible at the site that implements fix-delta, and a `runtime.inert` declaration falsified by
the spec's own File Plan becomes a hard finding instead of a silently-off gate. Done = the six
open pins covering this surface run green and every prior review-integrity behavior still holds.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `verifyPrompt` step 2 (SANCTIONED) gains the same self-consistency guard MISCITED got in 6.37.0, containing the literal words "SANCTIONED is forbidden": if the evidence quoted denies a sanction, or fails to quote an actual sanctioning Decision/design-approval row verbatim, SANCTIONED is forbidden and uncertainty resolves toward the finding standing. | prax wf_5a730ede-0f8: `killedBy:"sanction"` with evidence "Not actually sanctioned — correcting: the claim stands unrefuted" rode to CLEAN; the MISCITED guard exists, its sanction twin never did. Rejected alternative: prompt-only fix (D2 adds the mechanical layer because a prompt guard can be misapplied). |
| D2 | Mechanical post-verify `killed[]` audit, deterministic code in `wf-review.body.js` (no agent): a named function `auditKilled(killed)` runs after the verify loop; entries whose evidence is missing/whitespace-only, or whose evidence matches the closed per-label contradiction-marker list (Contracts), are **resurrected** — moved into `survivors` flagged `verification: 'kill-contradicted'` with their evidence attached, counted in a new additive `verify.killContradicted`, and logged. Fail toward survival, never toward a silent kill. | Only the structured `result` enum feeds `verdict.js` today — a self-contradicting kill is invisible to the derivation. Deterministic marker-list, not a judge agent: the observed failure is evidence text literally denying the label; a resurrected finding costs only session adjudication (same cost as `verifier-failed`), so false positives are cheap and false negatives fall back to D1's prompt guard. |
| D3 | The fix-delta site in `wf-review.body.js` (the comment block above `fixDeltaPrompt`) documents the full-gate re-assertion contract in force, containing this literal sentence (present tense — refuter-executed: the pin's regex `fix-?delta…(full gate\|re-?run…gate)` does NOT match past-tense "re-ran"): "a fix-delta CLEAN re-runs the full gate — the orchestrator re-runs the `gate`, `smoke`, `ac-matrix`, `skip-reconcile`, and `ci` legs into a fresh manifest (review.md Phase 2 Fix step), and `verdict.js`'s required-leg set enforces their presence before the verdict stands." No behavior change in the workflow itself. | CROSS-20260727-01's mechanism already landed in review.md (per-iteration `mktemp` manifest + mandated leg re-runs) and verdict.js (required legs on fix-delta); the remaining hole is that the source implementing fix-delta never states the contract, so a future edit to either surface can sever it invisibly. The pin greps this source; the sentence above is pinned verbatim so a transcription can't drift out of the regex. |
| D4 | `verifyPrompt` charter gains a shared-substrate fence containing the literal phrase "shared stateful substrate": a verifier must not mutate any shared stateful substrate — databases, running services, env/config other processes consume — beyond creating and deleting its own repro file; a repro that would require such a mutation returns `NOT_EXECUTABLE` with the needed mutation named, for orchestrator adjudication. | prax wf_ab878c58-31c: a verifier ran `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` against the shared dev DB unprompted; fail-closed verification *expects* crashed verifiers, so a crash between mutation and restore leaves the substrate broken. N=1 → minimum boundary (one charter clause), no execution sandbox machinery until a second host corroborates. |
| D5 | review.md Phase 3 close gains a mandatory hygiene sweep before the close commit: run `git status --porcelain --untracked-files=all`, adjudicate every unexpected path (review-agent scratch files are deleted; legitimate strays explained), and never blind-`git add -A` past an unadjudicated path. | prax spec 20260812/02: a reviewer's scratch `diff2.txt` sat untracked; Phase 3's "commit everything still uncommitted" would ship it on the next close. `--untracked-files=all` per the existing `[host]` gotcha (plain porcelain collapses untracked dirs). |
| D6 | review.md's smoke-leg bullet (Phase 0 step 3) gains the inert-falsifier check: when the smoke leg exits 4 (runtime declared inert), and the spec's File Plan or diff adds a bootable entry point (an executable under a `bin/` path, a process entry with a shebang + argv handling, or a server/daemon bootstrap), that is an automatic **hard** finding — "inert declaration falsified by this spec's own File Plan" — with the remedy named (declare the runtime block, re-run `/spec:init` Phase 1.5, or record the sanctioned inertness in the spec). The new hard-finding claim carries its claims-registry marker inline per § Doctrine Authoring: `<!-- unenforced: session-applied File Plan judgment — no deterministic bootable-entry-point detector exists -->` (refuter finding: an unmarked blocking claim would be silently absorbed as baseline debt by this spec's own `--update-baseline` re-stamp, with no gate ever presenting it). | JJ-20260801-01: three consecutive CLEANs rode `runtime.inert` after `autopilot/bin/autopilotd` made it false; nothing re-validated the exemption. Session-applied check (the smoke leg's exit-4 branch is already session-adjudicated); the class gets its first pinning test in this spec per the row's own D8 sanction. |
| D7 | Scaffold-ledger row for the D2 audit (Kind: gate — it extends the existing fail-closed-survival family: resurrection only ever *adds* survivors flagged for session adjudication, the same cost class as `verifier-failed`), with promote/retire condition: RETIRE the marker list if two quarters of ledger data show zero resurrections that survived session adjudication (pure false-positive noise); WIDEN the marker list from intake evidence, never from taste. | Every new mechanism needs a registered retire condition; the advisory-first convention is honored in substance — a resurrected finding is presented for adjudication, never auto-blocking beyond what a surviving finding already does. |
| D8 | Version bump target 6.59.0 in `spec/.claude-plugin/plugin.json` with the changelog `description` updated; the literal number is a target, not a pin (concurrent sessions race semver — bump to next free and log the deviation). | Standing version-bump discipline; the race caveat is a recorded `[host]` gotcha. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D1 SANCTIONED guard, D2 `auditKilled` + resurrect wiring + `verify.killContradicted`, D3 fix-delta contract comment, D4 substrate fence |
| spec/commands/review.md | MODIFY | doctrine | D5 porcelain sweep in Phase 3; D6 inert-falsifier clause in Phase 0 step 3; Phase 1 return-shape prose notes `kill-contradicted` survivors and the additive `verify.killContradicted` counter |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7 row for the killed[] audit |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for the review.md/scaffold-ledger line-count deltas (`--update-baseline`, same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 version bump + changelog description |
| tests/verifier-kill-integrity.test.js | MODIFY | tests | AC-20260813-01-1, AC-20260813-01-2 (tag existing red pins with AC-IDs; no assertion changes), AC-20260813-01-7 (tag the three green MISCITED-guard pins) |
| tests/review/killed-audit.test.js | CREATE | tests | AC-20260813-01-2 (executes `auditKilled` via `extractFn`/`evalFns` — resurrect on sanction-contradiction, resurrect on empty evidence, keep on clean evidence) |
| tests/review-write-fence.test.js | MODIFY | tests | AC-20260813-01-3, AC-20260813-01-4 (tag existing red pins) |
| tests/fixdelta-full-state.test.js | MODIFY | tests | AC-20260813-01-5 (tag existing red pin) |
| tests/review-runtime-inert-falsifier.test.js | CREATE | tests | AC-20260813-01-6 (red-first doctrine pin on review.md's inert-falsifier clause) |
| spec/INTAKE.md | MODIFY | doctrine | flip PRAX-20260813-01, CROSS-20260813-02, CROSS-20260727-01, JJ-20260801-01 to the fixing version with `mechanism(<path>)` citations |

Orchestrator duty (not a row): `npm run build:workflows` after any `src/` edit; commit source + generated `wf-review.js` together; `node spec/scripts/build-workflows.js --check` before batch close.

## Contracts

```js
// wf-review.body.js — deterministic post-verify audit (D2). Runs after the verify loop,
// before the final return. No agent, no I/O.
// LAYOUT REQUIREMENT (test-mode constraint, refuter-verified): the marker regexes are
// declared INSIDE auditKilled's braces — tests/helpers.js extractFn brace-matches a single
// named `function auditKilled(` and has NO mode for adjacent top-level consts (its real
// users are workflow-guards.test.js and enforce/taxonomy.test.js, both plain named
// functions); a top-level-const layout makes the extracted function throw
// `SANCTION_CONTRA is not defined` under evalFns.
function auditKilled(killed) { // → { kept: [entry…], resurrected: [entry…] }
  // Closed marker lists — data, never a prompt clause; widened only from intake evidence:
  const SANCTION_CONTRA = /not (actually |in fact )?sanctioned|stands unrefuted|no (such|matching) (decision|sanction|approval)|(could|can) ?no?t find (a|the|any) (decision|sanction|approval)/i
  const MISCITE_CONTRA = /confirms the claim|claim (is|stands) (correct|confirmed)|does exist and/i
  // Resurrect (fail toward survival) when ANY of:
  //  - !entry.evidence || entry.evidence.trim() === ''            (any killedBy)
  //  - entry.killedBy === 'sanction'    && SANCTION_CONTRA.test(entry.evidence)
  //  - entry.killedBy === 'miscitation' && MISCITE_CONTRA.test(entry.evidence)
}
// Wiring (NO reassignment of the existing `const killed` — refuter-executed: `killed = kept`
// throws TypeError: Assignment to constant variable):
//   const audited = auditKilled(killed)
//   for (const f of audited.resurrected)
//     survivors.push({ ...f, verification: 'kill-contradicted', evidence: f.evidence })
//   verify.killContradicted = audited.resurrected.length
//   ...and the final return object uses `killed: audited.kept` (the const array itself is
//   never mutated or rebound). Additive key — verdict.js copies workflow.verify verbatim
//   into the ledger row, so no verdict.js change.
// Return-site consistency (sister-spec precedent: smells/lensFailed pinned on all sites):
//   the zero-findings CLEAN early return's hardcoded verify literal gains
//   `killContradicted: 0`, so every verify-bearing return site carries the key.
// log(`killed-audit: resurrected ${n} kill(s) whose evidence contradicts the label`) when n>0.
```

Return shape: unchanged fields plus survivors may now carry `verification: 'kill-contradicted'`;
`verify` gains `killContradicted` (additive — absent keys never broke consumers; review.md's
documented row shape adds it in prose).

`verifyPrompt` literal obligations (pinned by tests): step 2 contains `SANCTIONED is forbidden`;
the charter tail contains `shared stateful substrate`.

## Behavior

- The audit runs on every scope (full and fix-delta) — a fix-delta verifier can self-contradict
  identically. It runs after the verify `parallel()` resolves and before the return object is
  assembled, so `HARD_FINDINGS`/`FINDINGS`/`CLEAN` are derived from the post-audit survivor set.
- A resurrected finding is presented in Phase 2 grouped with `verifier-failed`/`cap-skipped`
  (unverified — session adjudicates); review.md's survivor-presentation sentence extends its
  existing list with `kill-contradicted`.
- D6 is a session check on the smoke leg's exit-4 branch, not a new leg: no manifest row change,
  no verdict.js change. The finding enters Phase 2 dispositions like any mechanical hard finding.

## Acceptance Criteria

- **AC-20260813-01-1**: WHEN a verifier's quoted evidence denies a sanction or fails to quote an
  actual sanctioning Decision/design-approval row THE SYSTEM SHALL forbid returning SANCTIONED —
  `verifyPrompt` step 2 carries the guard with the literal words `SANCTIONED is forbidden`
  (e.g. evidence `"Not actually sanctioned — correcting: the claim stands unrefuted"` → the
  prompt's own text makes returning `result="SANCTIONED"` a contradiction the model must
  resolve toward the finding standing) → `SANCTIONED guard` test in
  tests/verifier-kill-integrity.test.js
- **AC-20260813-01-2**: WHEN a `killed[]` entry's evidence contradicts its `killedBy` label THE
  SYSTEM SHALL resurrect it as a survivor flagged `kill-contradicted` (e.g.
  `{killedBy:'sanction', evidence:'Not actually sanctioned — the claim stands unrefuted'}` →
  survivor with `verification:'kill-contradicted'`, `verify.killContradicted: 1`; an empty
  `evidence` on any kill resurrects identically; `{killedBy:'sanction', evidence:'Decisions D4:
  "workers may skip the retry wrapper" — quoted verbatim'}` → kept) → tests/review/killed-audit.test.js
  and the `mechanically audits` test in tests/verifier-kill-integrity.test.js
- **AC-20260813-01-3**: WHEN wf-review composes a verifier prompt THE SYSTEM SHALL fence shared
  stateful substrates — the literal phrase `shared stateful substrate` with databases, services,
  and env named, and the NOT_EXECUTABLE routing for repros that would need such a mutation →
  CROSS-20260813-02a in tests/review-write-fence.test.js
- **AC-20260813-01-4**: WHEN review reaches the Phase 3 close commit THE SYSTEM SHALL mandate a
  `git status --porcelain --untracked-files=all` sweep with per-path adjudication before
  committing → CROSS-20260813-02b in tests/review-write-fence.test.js
- **AC-20260813-01-5**: WHEN wf-review's source implements fix-delta THE SYSTEM SHALL state the
  full-gate re-assertion contract at that site (fresh manifest, re-run `gate`/`smoke`/
  `ac-matrix`/`skip-reconcile`/`ci`, enforced by verdict.js's required-leg set) →
  tests/fixdelta-full-state.test.js
- **AC-20260813-01-6**: WHEN the smoke leg reports inert (exit 4) and the spec's File Plan or
  diff adds a bootable entry point THE SYSTEM SHALL emit an automatic hard finding naming the
  falsified inert declaration (e.g. File Plan row `CREATE autopilot/bin/autopilotd` while config
  declares `runtime.inert` → hard finding "inert declaration falsified by this spec's own File
  Plan", remedy named) → tests/review-runtime-inert-falsifier.test.js
- **AC-20260813-01-7**: WHEN a MISCITED verification runs THE SYSTEM SHALL CONTINUE TO apply the
  three 6.37.0 guards (whole-file search before ruling on a wrong line number; stale-worktree
  proof for nonexistence claims; evidence-confirms-claim forbids MISCITED) → the three green
  `MISCITED guard` tests in tests/verifier-kill-integrity.test.js
- **AC-20260813-01-8**: WHEN a verifier agent crashes THE SYSTEM SHALL CONTINUE TO keep its
  finding as a survivor flagged `verifier-failed` (fail-closed — the audit layer never converts
  a crash into a kill) → tests/review/killed-audit.test.js (pin asserts `auditKilled` never
  touches survivors; wiring pin on the verifier-failed branch remaining intact in source)

## Assumptions (escalation triggers)

- A1: `extractFn`/`evalFns` (tests/helpers.js) extract and execute ONLY a single named
  top-level function with no module scope (executed evidence, refuters 2026-08-13: a
  top-level-const layout throws `SANCTION_CONTRA is not defined`; the real users are
  workflow-guards.test.js and enforce/taxonomy.test.js, and smell-lens.test.js hand-rolls its
  own extraction). The Contracts block therefore REQUIRES the marker regexes inline inside
  `auditKilled`'s braces — this is the plan, not a contingency. **if false (helpers gain a
  richer mode later):** layout may relax, but only with the pin test updated in the same
  commit.
- A2: The verify-region slice markers the red pins rely on (`2. SANCTIONED` / `3. If the claim
  cannot` / `// ---- Phase: blind review panel`) survive the edit — D1/D2 add text without
  renaming these anchors. **if false:** update the slice markers in the same test-file rows the
  File Plan already owns, preserving the assertions.
- A3: `verify.killContradicted` as an additive key breaks no ledger consumer — verdict.js copies
  `workflow.verify` verbatim; doctor check 12 does not enumerate `verify` keys. **if false:**
  carry the count in the log line only and drop the key (the pin tests don't require it).
- A4: review.md's line-count change is ratchet-visible — the same commit must carry the
  `claims-baseline.json` re-stamp or review flags it hard. **if false (ratchet rejects):** run
  `node "$(spec-paths claims-lint)" --update-baseline` and include the hunk.
- A5: No live review run is in flight in this repo during the build (wf-review.js regenerates).
  **if false:** STOP, ask the user.

## Rationale

This spec burns the densest surface the 2026-08-13 intake measured (7 of 17 findings implicate
review self-reporting). The tier is T3: wf-review's verify layer and review.md's close mechanics
are review-integrity surfaces — a defect here corrupts every host's CLEAN, the exact class the
pipeline exists to prevent. The kill-audit (D2) is deliberately deterministic: the incident's
signature was evidence *literally denying* the label, which a closed marker list catches at zero
model cost; a judge agent was rejected as a second model layer defending against the first,
with its own failure modes and spend. Marker false positives cost one session adjudication;
false negatives fall through to D1's prompt guard — the two layers fail in opposite directions,
which is the point. D3 is documentation-only by design: the mechanism (fresh manifest + required
legs) already landed with the evidence-manifest spec; the honest residue of CROSS-20260727-01 is
that the contract is invisible at the fix-delta site, and the INTAKE row closes citing
`mechanism(spec/commands/review.md, spec/scripts/verdict.js)` with the source comment as the
visibility fix. D4 and the SANCTIONED guard are Tier-C minimum boundaries on N=1 evidence —
one clause each, no sandbox or schema machinery until a second host corroborates (recorded here
as the escalation condition). D6 (runtime-inert falsifier) ships as a session-applied doctrine
check rather than a script: detecting "bootable entry point" mechanically is a heuristic swamp,
while the reviewing session holds the File Plan and the config's runtime block in hand; the
class-level pin this spec creates is the regression floor JJ-20260801-01's D8 sanctioned.
Fragile spots to watch during execution: the pin tests' slice markers (A2), and the codegen
step — `wf-review.js` must be regenerated and committed with the source or the review gate
flags the hand-edit class.

Adversarial-check adjudications (2026-08-13, two blind refuters, both executing repros):
ACCEPTED and folded — the `const killed` reassignment crash in the original wiring comment
(refuter-executed TypeError; wiring now returns `killed: audited.kept`, never rebinds); the
falsified A1 (extractFn has no adjacent-const mode and smell-lens tests never used it —
inline-regex layout is now the required contract, and A1 records the executed evidence); the
tense-incompatible D3 phrasing ("re-ran" fails the pin's `re-?run` regex — D3 now pins a
literal present-tense sentence); the D6 claims-registry marker obligation (unmarked blocking
claim would be baseline-absorbed silently); the `SANCTION_CONTRA` false positive on
"no explicit approval needed …" (a legitimate sanction shape in this repo's own doctrine
voice — the `explicit` alternation is dropped; "no such/matching decision" still matches);
the verify-key consistency across return sites (zero-findings CLEAN literal gains
`killContradicted: 0`, matching the smell-lens precedent of pinning additive fields on every
return site). No findings rejected.

## Canonical Delta

None — this repo's canonical surface is the plugin doctrine itself; the edits above are the
delta. (`docs/canonical/` is deliberately absent here; precedent: every prior spec in this
repo.)
