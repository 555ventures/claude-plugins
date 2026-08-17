---
description: Independent execution-verified review gate — flips spec to done, updates canonical docs, commits and merges back
argument-hint: <spec path>
---

# Spec Review: Independent Gate

Deterministic gates + one independent, execution-verified review covering **shape** (shortcuts,
shims, rule-bending) and **correctness** (matches spec, ACs covered, wiring complete) in a
single pass. On CLEAN: flips `status → done`, applies the spec's Canonical Delta, commits,
and merges the build branch back into its originating branch (Phase 4). This is the only
command that flips `done`.

**Orchestrator: Sonnet. Reviewers and verifiers: Sonnet — never Fable.** Review independence
comes from blind-to-author dispatch and execution-grounded verification, never model
diversity (shared § Model Placement). Judgment on
survivors (fix / waive / reject) happens in this session with the user — the workflow never
adjudicates (the kill-grounding standard lives in Rules).

**Setup:** run `spec-paths shared-for review` and read its output (the shared invariants scoped to this command). Read the host's
`.claude/spec.config.json` and its pipeline rules file. If either is missing, STOP: tell the user to run `/spec:init` first. <!-- unenforced: model-judgment step, no deterministic carrier exists -->
Also run `spec-paths wf-review` once and keep the printed absolute path — it is the `scriptPath` for the Workflow call below.

## Input

`$ARGUMENTS` — path to a spec with `status: implementing` (or `done` for a re-run).

## Phase 0 — Preflight (parallel)

Before step 1, create `{manifestPath}` — a fresh `mktemp` file, created alongside
`{patternsPath}` below (never reused across iterations: this per-iteration freshness is what
makes stale evidence structurally unrepresentable — the fix-delta hole where a re-review could
ride pre-fix leg rows). Every leg named below appends one JSONL row on completion:
`{"leg":"<name>","exit":<code>,"observed":"<≤120-char counts/enums, never a command string>"}`.

**`{root}` is bound here, at first use, and holds through Phases 0–3:** the working tree under
review — the session's current toplevel (`git rev-parse --show-toplevel`); for a worktree
build that is the worktree itself. Phase 4 resolves a second, distinctly named symbol,
`{mainRoot}`, for the steps that structurally need the main tree.

1. Determine the diff base by reading the spec frontmatter, in this recovery order:
   **`build_base`** (a worktree build — `/git:enter-worktree` wrote it there so a fresh review
   session recovers the originating branch from disk, never from conversation context) →
   **`diff_base`** (an in-place build — `/spec:build` wrote this sha before its first edit; the
   diff is `git diff {diff_base}..HEAD`, and merge-back still no-ops exactly as today's
   absent-`build_base` path skips it) → **current-branch-name fallback** (legacy specs
   predating both fields only): `git -C {root} rev-parse --abbrev-ref HEAD` (the root working
   tree's current branch). `{target}` is the recovered `build_base` (or the branch-name
   fallback) used as the merge-back target in Phase 4; the fallback is safe and self-checking:
   `{mergeBack} inspect` and `assert_target_checked_out` require `{target}` to equal root HEAD,
   so a wrong guess fails loudly at merge-back rather than diffing/merging silently against the
   wrong branch.
   **Frozen-base check (same step):** derive the spec's last commit —
   `git -C {root} log -1 --format=%H -- {spec path} <File Plan paths>` — and compare to
   `git -C {root} rev-parse HEAD`. Equal (the overwhelmingly common case): `{frozenRoot} = ''`,
   done. Unequal, the review waited while later specs landed — a naive `git diff {base}..HEAD`
   sweeps their files into this spec's panel (measured: 27 files, 26 from other specs). Create
   `git -C {root} worktree add --detach <mktemp -d>/frozen <that commit>` and pass its path as
   `{frozenRoot}`: the panel reads and diffs there; every executed leg (gate, smoke, ci) still
   runs at `{root}` — executed evidence must come from the tree that ships. If any of the
   spec's own File Plan files differ between the frozen commit and HEAD, the frozen view lies
   about what ships: drop the frozen worktree and review at HEAD, attributing each foreign
   hunk to its owning spec. Remove the worktree (`git -C {root} worktree remove --force`)
   after Phase 1 returns.
2. **Scope reconciliation (mechanical, first — sub-second):** `scope-reconcile.js`
   (resolved via `spec-paths scope-reconcile`) computes changed-set-vs-File-Plan: run
   `node "$(spec-paths scope-reconcile)" --root {root} --base {base} --spec {spec path} --json > {reconcilePath}`
   (`{reconcilePath}` = fresh `mktemp` path), then the same invocation with `--dirs` in place of
   `--json` — its output feeds step 3's sweep, replacing File-Plan dirs (D8: one derivation of
   the changed set, never a second). Exit 2 (unreadable spec/no File Plan) STOPs the run; exit 3
   (`outOfPlan` non-empty) doesn't — it feeds step 7. Leg `reconcile`,
   `observed:"outOfPlan=<N>"`. Skip entirely, including the manifest row (`reconcile` is not
   required on this scope per D3), on `scope: "fix-delta"` (Phase 2's Fix step sets
   `reconcilePath: ''` — the fix diff is by definition a response to findings).
3. Launch in parallel (background bash) — each appends its row (leg name, exit, `observed`)
   to `{manifestPath}` on completion:
   - `DIFF_BASE={base} bash {patternsScript} {dirs from step 2's --dirs output} > {patternsPath}`
     — the host's mechanical shortcut sweep (`patternsScript` from config), redirected to a
     temp file (`patternsPath` = a fresh `mktemp` path); keep the absolute path for the
     workflow call. The reviewers read it rather than receiving the output inline, which keeps
     `args` a small control channel. Leg `patterns`, `observed:"matches=<N>"` — always
     recorded (20260805/02 D1), though not a required leg.
   - the host's `gateCommand` — the deterministic gate. Before this leg runs, resolve it exactly
     as `build.md` Phase 0 step 3 already does (cited, not duplicated): `{testDirs}` resolved to
     the glob form before the leg runs, from the spec's File Plan tests rows; unresolvable →
     `unavailable`, naming the token — never a raw `{testDirs}`-bearing command execution. **Run
     the resolved command wrapped through the sanctioned-red baseline** (this wrap is stated
     here, not cited from build.md — review is a separate session):
     `node "$(spec-paths suite-baseline)" --gate "<resolved gateCommand>" --root {root}`, or
     `--gate-file <path>` (verbatim-to-mktemp) when the resolved command contains a double quote
     or `$`. An `unavailable` gate is a red leg for step 8's purposes (hard-stop before the
     panel, remedy = fix the host's `gateCommand`/File Plan tests rows so the placeholder
     resolves), exactly like a failing gate command. **Capture the runner's skip/todo counts**
     from its output using the host's declared `capabilities.skipReportPattern` (config key, D1
     — no format is universal: go test, cargo, pytest without `-rs`, and Gradle all omit skip
     lines by default): when declared and it matches, capture group 1 as skips and group 2 (if
     present, else 0) as todos — they feed the skipped-test reconciliation in step 6; when the
     pattern is absent, `"none"`, or doesn't match, the skip portion is honestly
     `unavailable — host runner declares no skip format`, never assumed-zero. When the wrapped
     run printed a `__SUITE_BASELINE__` sentinel with `sanctioned=<S>`, S>0, capture S as
     `sanctionedReds` and append it to `observed`. Leg `gate`,
     `observed:"skips=<N> todos=<M>"` or `observed:"skips=<N> todos=<M> sanctionedReds=<K>"`
     (or `"unavailable: <token>"` when the gate itself is unresolvable, or
     `"unavailable — host runner declares no skip format"` when the gate ran but the skip format
     is undeclared/unmatched). A gate that went green only because every failure was a
     sanctioned baseline pin (wrapper exit 0, sentinel `residual=0`) is recorded exit 0 with
     `sanctionedReds` in `observed` — visibly different from a plainly green gate, never
     silently identical.
   - `bash $(spec-paths smoke)` — the **boot smoke leg** (shared invariants § Runtime
     Verification). Exit 0 = boot observed ready **and stopped cleanly on the declared stop
     signal**; exit 4 = runtime declared inert (sanctioned, note it in the verdict); any other
     exit is an automatic **hard finding** <!-- enforcedBy: spec/scripts/verdict.js --> — including
     exit 3, "the host gives review no way to boot," which is a grounding-layer defect, not a
     skippable check. This leg is deterministic; no reviewer adjudicates it. Leg `smoke`,
     `observed:"pass"`/`"inert"`/`"fail"` — this row is what makes **the boot smoke leg
     green** (or declared inert) a derivation input rather than a claim.
     **Inert-falsifier check (session-applied, exit 4 only):** when the smoke leg reports
     inert, check the spec's own File Plan and diff for a bootable entry point — an executable
     under a `bin/` path, a process entry with a shebang + argv handling, or a server/daemon
     bootstrap. Finding one is an automatic **hard** finding <!-- unenforced: session-applied File Plan judgment — no deterministic bootable-entry-point detector exists -->:
     "inert declaration falsified by this spec's own File Plan," with the remedy named — declare
     the runtime block, re-run `/spec:init` Phase 1.5, or record the sanctioned inertness in the
     spec (JJ-20260801-01: three consecutive CLEANs rode `runtime.inert` after a bootable entry
     point made it false, and nothing re-validated the exemption).
   - `node "$(spec-paths ci-query)" --commit $(git -C {root} rev-parse HEAD) --root {root}` —
     the **ci leg**, keyed on the reviewed commit itself (D2) — always `{root}` HEAD, never
     `{frozenRoot}` (executed evidence must come from the tree that ships). A completed run
     for that exact commit with `conclusion` ∈ (`failure`/`timed_out`/`cancelled`) maps to
     `exit:1` (hard-stops pre-panel below, "fix CI first"); everything else — no run seen for
     this commit (structural or transient), or an in-progress run — maps to `exit:0`. Leg
     `ci`, `observed:"unavailable"`/`"unavailable-transient"`/`"in-progress"`/`"conclusion=<value>"`.
   - **at-risk leg (D1/D3, specs/20260815/02-at-risk-pins.md — the scoped gate's compensating
     derivation):** read `{reconcilePath}`'s `atRisk` field (populated by step 2, before this
     parallel batch launches — the same dependency `patternsScript`'s dirs already have).
     Non-empty `atRisk` → run the host's `testCommand` with the at-risk files appended (cwd
     `{root}`) — the same file-path repro contract the Phase 1 verifier agents already rely on.
     Skip entirely, including the manifest row, on `scope: "fix-delta"` (`reconcilePath` is `''`
     there, exactly like `reconcile`). `files=0` → no run, exit 0. No `testCommand` in config →
     exit 0, `observed:"unavailable — host declares no testCommand"`. A red at-risk leg yields
     ONE mechanical **hard** finding <!-- enforcedBy: spec/scripts/scope-reconcile.js --> —
     "at-risk pins red: pins that live outside the scoped gate failed on this diff; {failing
     files/digest, session-extracted from runner output}" — entering Phase 2 dispositions like
     reconcile's out-of-plan finding; a pre-existing sanctioned red (e.g. this repo's INTAKE
     pins) is a five-second waive naming the pin. **Never a step-8 pre-panel stop**
     <!-- enforcedBy: spec/scripts/verdict.js -->. Leg `at-risk`, `observed:"files=<N>"` (or
     the `unavailable` string above).
   - **if config declares `driftScript`**: `{driftScript} {spec path}` — the host's AC-drift
     checker. Leg `drift`, when this leg ran.
   - `node "$(spec-paths suite-baseline)" --check --root {root}` — the **suite leg** (D5,
     specs/20260814/03-suite-baseline.md): drift against `.claude/suite-baseline.json`, the
     checked-in sanctioned-red set, recorded but not required — the `patterns` precedent —
     leg `suite`, `observed:"newFailing=<N> fixedNotRemoved=<M>"` (or `"unavailable —
     <reason>"` on exit 4, which carries no finding). Exit 1 yields ONE mechanical **hard** <!-- enforcedBy: spec/scripts/suite-baseline.js -->
     finding — "suite drift vs .claude/suite-baseline.json: {lines}" — entering Phase 2
     dispositions exactly as step 7's reconcile findings do. Re-runs on fix-delta iterations
     exactly as `patterns` does.
4. Read the spec once; extract AC list, tier, area. Compute `{diffLoc}` =
   insertions + deletions from `git diff --shortstat {base}` — it scales the reviewer panel
   (a small diff never pays a 2-reviewer panel, whatever the tier).
5. **AC hygiene + coverage (mechanical, script-derived):** extract skipped/todo test names from
   the step-3 gate leg's already-completed output into `{skipsPath}` (a fresh `mktemp` path) per
   the host's declared skip-name format; when names cannot be attributed, pass no `--skips` at
   all — the honest-unavailability path, never assumed-zero. Then run
   `node "$(spec-paths ac-matrix)" --spec {spec path} --root {root} --manifest {manifestPath}
   [--skips {skipsPath}] [--has-drift-script]` — after all step-3 legs have appended to
   `{manifestPath}` (its `[oracle:]` absent-leg check and the `--skips` input both need the gate
   leg finished) and before step 8's manifest read. It lints the spec's AC-ID shape (strips HTML
   comments, walks only the top-level `- ` bullets of `## Acceptance Criteria` — nothing outside
   that section) and, **no `driftScript` only**, computes the AC↔test coverage matrix against
   the File Plan's test rows; pass `--has-drift-script` to skip only the coverage-matrix portion
   (the host driftScript owns coverage — lint and step 6's skip reconciliation still run in both
   modes). A malformed AC-ID, an uncovered AC (zero test hits, no `[oracle:]` declaration), and
   an `[oracle: <manifest leg>]` declaration whose leg is red or absent in `{manifestPath}` are
   each an automatic `hard` finding, identical in standing — the declared oracle never ran. An
   `[oracle:]`-declared AC whose leg is green is covered by declaration, excluded from
   `uncovered`, and reported as a named warning line ("AC-x: oracle = `<leg>` leg") — never
   silent green. (Pin presence — `SHALL CONTINUE TO` on defect-fix specs — is plan lock's check,
   never review's.) The script appends `{"leg":"ac-matrix","exit":<0|1>,"observed":"uncovered=<N>
   oracle=<M>"}` (`M` = the count of `[oracle:]`-covered ACs) to `{manifestPath}` itself — its
   non-zero exit means findings were emitted, not that the leg failed to execute; those findings
   ride the normal Phase 2 disposition flow. <!-- enforcedBy: spec/scripts/ac-matrix.js -->
6. **Skipped-test reconciliation (mechanical, same invocation, both drift modes):** the step-5
   run above also reconciles skips — the matrix counts **executed** tests, never collected ones,
   a skip is not a pass. An AC whose mapped test **skipped** is an automatic `hard` finding —
   identical in standing to an uncovered AC — **unless** the AC carries an explicit
   environment-gating declaration (`[env: VAR_NAME]`) on its AC line in the spec under review
   or in the AC's owning spec (derived from the AC-ID). A declared env-gated AC that skipped is
   reported as a **warning naming the un-run environment** — never silent green. (Ground truth:
   UpWell 2026-07 — a test holding a defect real pg-boss rejects
   with a throw sat `describe.skipIf`-skipped through two CLEAN verdicts because the matrix
   reconciled against collected tests.) The script appends
   `{"leg":"skip-reconcile","exit":<0|1>,"observed":"skipped=<N> sanctioned=<M>"}` (the legacy
   `skipped=<N>` form, with no `sanctioned=`, stays parseable — a missing `M` is read as 0, never
   inferred) — like `ac-matrix`, its non-zero exit means findings, not non-execution. `verdict.js`
   derives `row.testsSkipped` from `M` plus the gate leg's total (Phase 2's ledger row shape,
   below), never a second computation of the same join. <!-- enforcedBy: spec/scripts/ac-matrix.js -->
7. **Scope reconciliation findings (mechanical, 20260805/01 D7):** step 2's exit 3 yields ONE mechanical
   **hard** <!-- enforcedBy: spec/scripts/scope-reconcile.js --> finding: "out-of-plan changes: {list}" with each file's diffstat. A non-empty
   `unrealized` yields ONE mechanical **soft** finding: "planned but untouched: {list}". Both
   enter Phase 2 dispositions like any AC finding. `excluded`/`renamed` carry no finding — they
   print in the Phase 2 verdict presentation (visibility, never a disposition).
8. **Hard stop on red blocking legs (before Phase 1):** read `{manifestPath}`. If the `gate`,
   `smoke`, or `ci` row is red (non-zero exit; smoke exit 4 counts green-inert), hard-stop
   **before** invoking the Phase 1 `wf-review` panel below — panel spend must not be incurred
   on a red substrate. The stopped attempt still runs
   `node "$(spec-paths verdict)" --manifest {manifestPath} --ledger --spec {spec path} --tier
   {tier} --diff-loc {diffLoc} --iteration <n>` (no `--workflow` — none exists yet; the
   derivation reaches `GATE_RED` from the manifest alone before it would need one) and appends
   the printed row **verbatim** to `.claude/spec-runs.jsonl` — a stopped attempt is never
   invisible to doctor's correlations or the observation derivation. Report the named red leg
   via the shared STOP shape <!-- enforcedBy: tests/consistency/report-shape.test.js -->: assemble `outcome: {anchor:'🚫', text:'{leg} failed — {plain
   consequence}'}` and `next: {kind:'command', text:'{named remedy}'}`, write to a temp file,
   and run `node "$(spec-paths report-render)" --slots <file>`, printing its output verbatim;
   do not proceed to Phase 1.

   ```report
   🚫 **{leg} failed — {plain consequence}**
   Next: {named remedy}
   ```

   Findings-producing legs (`reconcile`, `ac-matrix`, `skip-reconcile`, `suite`, `at-risk`)
   never trigger this stop — their findings enter Phase 2.

## Phase 1 — Review workflow

Invoke `Workflow {scriptPath: <spec-paths wf-review output>, args: {specPath, tier, base,
scope: "full", prevFindingsPath: "", diffLoc: <from Phase 0>, reconcilePath: <temp file from
Phase 0 step 2, or '' on fix-delta scope>,
patternsPath: <temp file from Phase 0>, hasDriftScript: <config declares driftScript>,
reproCommand: <config testCommand, or "">, frozenRoot: <from Phase 0 step 1's frozen-base
check, '' when HEAD is still the spec's last commit>}}`. (`testCommand` is the host's test-runner
prefix — the verifier agents append their repro file path to it; when absent, pass `""`
and they discover the runner themselves.)

What the script does (shape lives in the script, not here):
- **Reviewers:** 1 by default; 2 only for T3 with `diffLoc ≥ 300` (blind to each other,
  different emphases), running as the plugin's read-only `spec:reviewer` agent. Each reads
  the spec, diffs against `base`, checks shape + correctness against the host's rule
  surfaces, returns structured findings. Neutral framing — an empty findings list is a valid
  outcome; nothing in the prompt manufactures findings.
- **Verification (execution-grounded):** every non-soft finding gets one Sonnet verifier.
  A finding dies ONLY on grounded evidence: `NOT_DEMONSTRABLE` (a good-faith minimal repro
  fails to exhibit an executable claim), `SANCTIONED` (a spec Decision/design approval quoted
  verbatim), or `MISCITED` (the cited location plainly doesn't say what the claim asserts —
  actual content quoted). `DEMONSTRATED` findings survive with repro evidence — the strongest
  fix candidates. `NOT_EXECUTABLE` claims (naming, layering, structure) survive flagged
  `unverifiable` for THIS session to adjudicate. A crashed verifier or a cap-skipped finding
  survives visibly flagged — fail-closed, never a silent kill or a silent confirm. `soft`
  findings skip verification and pass through as `advisory`.
- **Smell lens (advisory, full-scope only):** one dedicated Sonnet agent, launched inside the
  same panel `parallel()` barrier, scans the diff for two classes only — semantic duplication
  (a diff symbol re-implementing a job an existing repo symbol already does) and error masking
  needing cross-file context to adjudicate. `duplication` findings lacking a `counterpart` are
  dropped after the agent returns. The lens fails open: a null lens result yields `smells: []`,
  `lensFailed: true`, and never counts toward `failedReviewers` or `REVIEWER_FAILED`. On
  `scope: "fix-delta"` the lens is not launched at all (`smells: []`, `lensFailed: false`). Its
  output never enters `findings`, the verify loop, or the verdict derivation — it travels only
  in the `smells`/`lensFailed` return fields below.
- Returns `{verdict, survivors, killed, verify, reviewerCount, scope, tokens, smells, lensFailed}`
  where `verify = {verified, demonstrated, killedByExecution, sanctioned, miscited,
  unverifiable, failed, capSkipped, killContradicted}`, each finding in `survivors`/`killed`
  now carries a required `impact` — one plain-English line, no code identifiers, the report's
  display line (identifiers stay in the finding's `claim`/`evidence` for the ledger) — and each
  `smells` entry is `{file, line, class, claim, counterpart?, suggestion?}`.
  `killContradicted` is additive — a `killed[]`
  entry whose own evidence contradicts its `killedBy` label is mechanically resurrected as a
  survivor flagged `verification: 'kill-contradicted'` before this return is assembled;
  `verify.killContradicted` is its count.
  **`verdict: "REVIEWER_FAILED"` means a reviewer agent died — that is a failed RUN, never a
  CLEAN: re-invoke the workflow (journal cache makes it cheap) before any verdict is read.**
  `tokens` is the workflow's output-token spend — carry it into the Phase 3 report. If
  `verify.failed` or `verify.capSkipped` is non-zero, those survivors stand unverified — say
  so in the verdict presentation. `smells` and `lensFailed` are advisory-only by construction:
  neither field ever reaches `verdict.js` or the `.claude/spec-runs.jsonl` ledger row — the
  verdict word and ledger shape are exactly what they were before this field existed.

## Design-compliance legs (UI-bearing specs only)

When the spec has `design: true` or a `design_source`, the session dispatches two additional
checks — **two parallel Sonnet `Agent` calls, sent in the same message as (or right after) the
Phase 1 workflow invocation**; they are in-session checks, not `wf-review` legs, because they
audit design artifacts the workflow's args contract deliberately doesn't carry. (Both exist
because authoring sessions don't remember; checkers with lists do — full doctrine in shared.md
§ Design Canon (rule checklist) + § Design Authoring Contracts (component manifest),
deliberately outside this command's scoped read.)

- **Rule-checklist leg:** one agent walks `docs/design/research-brief.md`'s admitted rules
  (falsifiable by construction) against the spec's built screens/bound mocks, citing rule IDs —
  "UX-7: max one primary CTA; this screen has three" is a finding; "feels off" is not. Skip
  (and say so in the report) if no research brief exists.
- **Component-manifest leg:** one agent verifies every `authorJustification` in
  `design/components.json` (the durable carrier — the run's binding maps died with the design
  sidecar at reconcile). A component born of an `author` decision with no `authorJustification`
  is a `hard` finding; a justification whose named nearest entry actually covers the need, or a
  new entry that near-duplicates an existing one (name/purpose comparison), is a finding with
  the reuse named — **the near-duplicate comparison includes commitment entries**
  (name+purpose+optional `boundaries`, no `props`/`mockRefs` yet — shared § Design Authoring
  Contracts): authoring a lookalike of a committed block is the same finding, and an `author`
  decision that fulfils a commitment entry must cite that entry, by name, as its justification.

Their findings enter Phase 2 as ordinary findings at the stated severities. Both legs skip
silently on specs with no UI surface — never nag a backend diff about design.

## Drift gate

Two modes, decided by host config:

- **`driftScript` declared** — its output is part of the verdict. For **uncovered ACs** (in
  spec, no test): add the missing tests (via `/spec:build` resume if the spec is mid-pipeline).
  For **orphaned ACs** (in test, no spec): the AC may have been removed — update the test
  docstring/name or remove the test. Re-run the script to verify. An AC the `driftScript`
  reports uncovered but that carries an `[oracle: <manifest leg>]` declaration is adjudicated
  against that manifest leg, not the script's test grep — covered when the leg is green,
  `hard` when it is red or absent.
- **No `driftScript`** — the Phase 0 grep matrix IS the drift gate, now executed by
  `ac-matrix.js` (`spec-paths ac-matrix`, step 5's invocation): an AC-ID with zero test hits is
  an automatic `hard` finding — no verifier pass, it is a deterministic fact the script
  computes. The reviewer's AC ↔ test coverage check remains as the semantic backstop — a test
  that *names* an AC-ID but doesn't actually test the behavior is still a `hard` finding. Same
  carve-out here: an `[oracle: <manifest leg>]` AC is covered by declaration (step 5), never
  counted against this leg's `uncovered`.

## Phase 2 — Verdict

**The verdict word is derived by `verdict.js`, never asserted in prose here.** Compute it
twice per iteration:

1. **Right after Phase 1 returns** (skipped when Phase 0 step 8 already hard-stopped): write
   the Phase 1 return to a temp file and run `node "$(spec-paths verdict)" --manifest
   {manifestPath} --workflow <that temp file> --waived 0 --rejected 0 --fixDispatched 0`. This
   first pass only decides whether survivors below need presenting — its word is not what gets
   printed or ledgered.
2. **After the dispositions below are resolved** (or immediately, on a Phase 0 step 8 hard
   stop): re-run with the real `--waived/--rejected/--fixDispatched` counts, plus `--ledger
   --spec {spec path} --tier {tier} --diff-loc {diffLoc} --iteration <n> --run-id {the
   wf-review Workflow invocation's run id}`. This run is
   authoritative — print line 1 (the verdict word) **verbatim**, and append line 2 (the ledger
   row) **verbatim** to `.claude/spec-runs.jsonl` (repo root; create on first append) —
   **after** the survivor dispositions are resolved, so the row records how each finding
   actually ended (a row whose survivors were then all waived is otherwise indistinguishable
   from an unresolved one). `verdict.js` exit 0 gates and is required for entry into the Phase 3
   close; every other exit leaves it unreachable.

CLEAN is therefore a residual of the derivation, never computed here — `verdict.js`'s own
header names the required-leg set, including the **boot smoke leg green** (or declared inert)
requirement from Phase 0 step 3, and the full exit-code contract (0/1/2); read its printed word
and exit code, never reconstruct the definition independently.

Ledger row shape (the exact JSON `verdict.js --ledger` prints on line 2 — append exactly ONE line,
verbatim, never hand-assembled, never prose or finding text):

```
{"ts":"<ISO-8601>","spec":"<repo-relative spec path>","stage":"review","tier":"<T1|T2|T3>","runId":"<wf_…>","verdict":"<CLEAN|CLEAN-with-qualifier|FINDINGS|HARD_FINDINGS|REVIEWER_FAILED|UNVERIFIED|GATE_RED>","scope":"<full|fix-delta>","iteration":<n>,"diff":{"loc":<n>},"smoke":"<pass|fail|inert>","testsSkipped":{"total":<n>,"sanctioned":<n>,"unsanctioned":<n>},"tokens":{"workflow":<n>},"legs":[{"leg":"gate","exit":0},…],"findings":{"survived":<n>,"killed":<n>,"waived":<n>,"rejected":<n>,"fixDispatched":<n>,"reviewerCount":<n>},"verify":{"verified":<n>,"demonstrated":<n>,"killedByExecution":<n>,"sanctioned":<n>,"miscited":<n>,"unverifiable":<n>,"failed":<n>,"capSkipped":<n>}}
```

`verdict` is the D5 derived-verdict enum, printed by `verdict.js` and copied verbatim —
**never hand-write the word, and never write `CLEAN` while any survivor is undispositioned**:
`waived`/`rejected`/`fixDispatched` account for every survivor, which is why the row is
written only after the dispositions resolve. A `CLEAN` row with non-zero `survived` is
therefore well-formed and expected — it records findings the user disposed of, never findings
that were ignored. `legs` mirrors `{manifestPath}`'s name+exit pairs. Fixed shape,
counts/enums only — never finding text or prose (disposition *reasons* land in the spec's
Rationale). One line per Phase-1 invocation, so fix→re-review iterations each leave a row —
that history is what calibrates the verification layer over time. `runId` is the Workflow
invocation's run id: when a defect later surfaces in code this review passed, `/spec:escape`
records a row pointing back at it — the ground truth behind every CLEAN.

Regardless of survivors, print step 2's `excluded` matches (pipeline-owned, one line) and each
`renamed` pair (`↷ old → new`, one line) — visibility without a finding.

If survivors exist, present them with the pattern-sweep context, grouped by verification
status: `demonstrated` first (a verifier *reproduced the defect by execution* — show the
`evidence`; rejecting one means overriding a reproduced failure), then `unverifiable`
(structural claims no repro can decide — this session adjudicates them on the cited rule),
then `advisory` (soft), then any `verifier-failed`/`cap-skipped`/`kill-contradicted` (unverified
— say so; `kill-contradicted` is a mechanically resurrected kill whose own evidence denied its
label — present the evidence). With
each survivor, **quote the spec lines its disposition hinges on** — the Decision, Assumption,
or AC text the finding claims was violated (already in hand from Phase 0; quote verbatim,
recommend the evidence-implied disposition — fix/waive/reject, argued from the quoted lines,
never a bare menu). The recurring disposition call is "over-strict spec text vs. actual code
defect," and it must be made against the author's recorded intent, not recalled intent. Then
`AskUserQuestion` per finding group, batched ≤4 findings per call:
- **Fix** — dispatch Sonnet workers (routed via the host's `agentMap`, matching the build
  routing). Then re-review **incrementally**: create a fresh `{manifestPath}` (a new `mktemp`
  path, never the prior iteration's — stale rows cannot leak into the new derivation), and
  **re-run the `gate`, `smoke`, `ac-matrix`, `skip-reconcile`, and `ci` legs into it** (the
  existing fix-delta full-gate-reassertion rule, made mechanical — `reconcile` stays exempt,
  matching Phase 0 step 2's `scope: "fix-delta"` skip). The re-run `gate` leg is the same
  wrapped invocation as step 3 above —
  `node "$(spec-paths suite-baseline)" --gate "<resolved gateCommand>" --root {root}` (or
  `--gate-file`) — never the bare resolved command; a fix→re-review iteration re-derives
  `sanctionedReds` exactly as the first pass did. Write the surviving findings to a temp
  JSON file, and re-invoke the workflow with `scope: "fix-delta"`, `prevFindingsPath: <that
  file>`, `reconcilePath: ''` (the fix diff is by definition responding to findings, not new
  scope to reconcile), and `base: <the commit the just-reviewed diff ended at>` — one reviewer
  reads only the fix diff and the prior findings, never the whole codebase again. Pay a
  `scope: "full"` re-review (with reconciliation) only if the fixes touched files outside the
  prior finding set. Then derive this iteration's verdict the same two-pass way (Phase 2 above)
  against the fresh manifest. Max 2 fix→re-review
  iterations; beyond that, escalate.
- **Waive** — record in the spec's Rationale section with date + reason. Only the user
  waives — never invented, never implied.
- **Reject** — the finding is wrong anyway; record the rejection reason the same way.

**Advisory smell presentation (full-scope iterations only, after the dispositions above
resolve):** this group can never change the verdict word or block Phase 3 — proceed regardless
of its outcome. If `lensFailed` is true, print one line — `⚠️ smell lens failed — no advisory
findings this run` — and skip straight to Phase 3; no lens ran. Otherwise, for each entry in
`smells` present one plain-language line: class, what duplicates/masks what, both `file:line`
locations (`counterpart` for `duplication`). Write `smells` to a fresh `mktemp` JSON file and
run `node "$(spec-paths advisory-append)" --root {root} --spec {spec path} --run-id {wf id}
--smells <that file>`, printing its output verbatim — the script appends the rows (creating the
ledger with its header comment on first append), suppresses duplicates of still-open rows, and
announces the auto-keep with its 📌 line. Keep is the conservative option per shared.md
§ Question Style: a kept row is later-rejectable at audit via `rejected(<reason>)`, while a
dropped signal is unrecoverable — the derivation, not a question.

## Phase 3 — Close (on CLEAN)

1. Flip frontmatter `status: implementing → done`.
2. Apply the spec's **Canonical Delta** to `docs/canonical/{area}.md` (create the file from
   the delta if it doesn't exist yet).
   **Deviation fold-in:** if a `<spec>.deviations.md` sidecar exists (build workers log forced
   departures from the plan there), read it now. A deviation that will recur on future specs
   (a wrong assumption about the codebase, a convention the spec template didn't know) becomes
   a one-line entry in the host rules' **Gotchas** section, citing this spec and tagged
   `[host]` or `[plugin]` by provenance (a plugin-template gap is `[plugin]` — `/spec:doctor`
   rolls those up as the upstream bug list) — that is the territory correcting the map.
   One-off deviations just get absorbed into the spec's Rationale. Delete the sidecar after
   folding.
3. **Hygiene sweep (mandatory, before the close commit):** run
   `git status --porcelain --untracked-files=all` and adjudicate every unexpected path —
   review-agent scratch files (e.g. a verifier's stray repro) are deleted, legitimate strays
   are explained in the report. Never blind-`git add -A` past an unadjudicated path (prax spec
   20260812/02: a reviewer's scratch `diff2.txt` sat untracked and would have shipped on the
   next close's `git add -A`).
4. **Close commit:** commit everything still uncommitted on the working branch — status flip,
   canonical docs, any review-fix dispatches. The orchestrator owns git; never `--no-verify`.
5. **Report:** assemble the slots object — `outcome` (✅ `CLEAN — merged` on CLEAN, 🚫 `{N}
   hard findings — build must fix` <!-- unenforced: report slot template text, not a blocking rule --> on non-CLEAN), `bullets` (one `- {surviving finding: what
   breaks, where}` line per survivor), `warns` (`waived: {finding — one-phrase reason}` per
   waived finding, plus `smell lens failed — no advisory findings this run` when
   `lensFailed`), `artifacts` (`ledger: {ledger row path}` always, plus `smells: {N} advisory
   — {M} recorded → docs/audit/advisory-findings.md` when the smell lens ran — the 🔍 glyph
   retires to a plain artifact pointer, the fixed anchor set is closed), and `next` — on
   CLEAN, `{kind:'none', reason:'merge-back runs next'}` (Phase 4 follows automatically, so
   this report is not the run's terminal close); on non-CLEAN, `{kind:'command',
   text:'/spec:build {spec path} — fix the {N} hard findings'}` <!-- unenforced: report slot template text, not a blocking rule --> (sanctioned same-spec chain,
   A1 — this IS review's terminal close, since Phase 4 never runs on non-CLEAN). Write the
   slots to a temp file and run `node "$(spec-paths report-render)" --slots <file>`, printing
   its output verbatim. Kill lists, full gate tables, and drift detail go to the ledger row,
   not the console — print paths.

   ```report
   ✅ **CLEAN — merged**
   - {surviving finding: what breaks, where — one plain-language line each}
   ⚠️ waived: {finding — one-phrase reason}
   ⚠️ smell lens failed — no advisory findings this run
   📦 ledger: {ledger row path}
   📦 smells: {N} advisory — {M} recorded → docs/audit/advisory-findings.md
   Next: nothing needs you — merge-back runs next
   ```

   ```report
   🚫 **{N} hard findings — build must fix**
   - {surviving finding: what breaks, where — one plain-language line each}
   📦 ledger: {ledger row path}
   Next: /spec:build {spec path} — fix the {N} hard findings
   ```

Then proceed directly into Phase 4 — the user does not re-invoke anything.

## Phase 4 — Merge-back (on CLEAN, after the close commit)

Merges the working branch into the originating branch recorded by `/git:enter-worktree`. Skip
the merge mechanics (steps 1–6) with a one-line note if the review ran directly on the
originating branch — nothing to merge — but still run step 7 (Observe): in-place builds still
need 20260805/03 D7's invocation point.

Run `spec-paths merge-back` once and keep the printed path — it is `{mergeBack}`, the sole
derivation of the git mechanics (exit-code alphabet: 3 = conflicts, 4 = CWD-inside-worktree
refusal — the merge-back script's own header comment).

**Resolve `{mainRoot}` now, before step 1** — the **project root** (the repo's main working
tree) — never `$HOME`/`~` or `/`. This is a second, distinctly named symbol from Phase 0's
`{root}`: Phase 4's inspect and strategy steps run *before* the session relocates, so a single
Phase-0 binding would hand these steps the worktree path instead of the main tree. Get it via
`{mergeBack} root --worktree {worktree}` (or `{mergeBack} root` from inside the worktree) and
use the printed absolute path verbatim as `{mainRoot}` for every step below. `{target}` is the
originating branch recovered in Phase 0 step 1; `{source}` the build branch; `{worktree}` the
worktree path (omit `--worktree` if none was used).

1. **Inspect:** `{mergeBack} inspect --root {mainRoot} --target {target} --source {source}`. It
   STOPs (exit 2) if the root tree is dirty. Show its summary and `RECOMMEND` line.
2. **Strategy — `AskUserQuestion`, always** (a real fork): merge-commit / ff-only / squash /
   rebase-ff. Put `inspect`'s `RECOMMEND` option first.
3. **Relocate to root FIRST — the fix for the session landing in `$HOME`.** A subprocess
   cannot move the session CWD, so do this *before* any worktree removal:
   - This session entered via `EnterWorktree`: call `ExitWorktree(action="keep")` — restores
     CWD to {mainRoot}, leaves worktree + branch intact. Never `action="remove"` after
     merging — the harness still sees the branch as unmerged then.
   - Otherwise (worktree predates this session, `ExitWorktree` is a no-op): `cd` the **main**
     session to the **absolute `{mainRoot}` path** printed by `{mergeBack} root` — never a bare
     `cd`, `cd ~`, or `cd /` (that lands in `$HOME`, the bug this step prevents).
   The merge runs via `git -C {mainRoot}` regardless; the relocate is what stops `cleanup` from
   deleting the directory you're standing in.
4. **Merge:** `{mergeBack} merge --root {mainRoot} --target {target} --source {source}
   --strategy {choice} [--worktree {worktree}]`. Exit 3 (conflicts): resolve by intent — read
   **both sides** of every conflicted file, never a blind `--ours`/`--theirs`/`merge --abort`;
   non-trivial conflicts get an `AskUserQuestion` (keep target / keep source / combine), then
   `git -C {mainRoot} add`, a concise `diff --cached` summary, and `commit --no-edit`.
   (Rebase-ff: resolve in `{worktree}`, `git -C {worktree} rebase --continue`, re-run `merge`.)
   Exit 2: precondition failure (e.g. ff-only on diverged branches) — report and re-ask
   strategy.
5. **Cleanup:** `{mergeBack} cleanup --root {mainRoot} --source {source} [--worktree
   {worktree}]` — removes the worktree and deletes `{source}`. Exit 4 means step 3's relocate
   was skipped: do it, then re-run cleanup.
6. **Verify:** `{mergeBack} verify --root {mainRoot}` — confirms a clean tree, worktree gone.
7. **Observe (20260805/03 D7):** now relocated to root with the merge landed, run
   `node "$(spec-paths observe-ci)" --root {mainRoot}` once — closes the loop on
   *previously*-closed specs (this spec stays silent until a later CI check attributes a red
   run to it). Normally prints nothing; print its output verbatim when it does. Appends to the
   run ledger only — never the manifest, never `verdict.js` (CLEAN was already decided in
   Phase 2).
8. **Never push, never force-push.** Pushing remains an explicit user action.

## Next pointer (every CLEAN close — merge-back run or skipped)

Close the session's output — after the Phase 4 verify result, or straight after the skip
note when Phase 4 didn't run — by re-printing the one-line CLEAN verdict contiguous with the
close (A2: a run of merge-back mechanics must not separate the outcome from the
recommendation). Capture the **verbatim** output of:

```
node "$(spec-paths spec-status)" --root {mainRoot} --next
```

`{mainRoot}`: the `{mergeBack} root` output when Phase 4 ran, else `git rev-parse
--show-toplevel` on the spec path. The script is the only source of the "what now"
suggestion; if its pick surprises you, say so — its lines still print unaltered. If the run
errors, print the error and no Next line (absent beats hand-derived) — skip the render below
entirely. Otherwise assemble `outcome: {anchor:'✅', text:'CLEAN — merged'}`, `next:
{kind:'status-verbatim', text: <the captured output>}`, write to a temp file, and run
`node "$(spec-paths report-render)" --slots <file>`, printing its output verbatim:

```report
✅ **CLEAN — merged**
{spec-status --next, verbatim}
```

Non-CLEAN closes get no Next pointer — the verdict line already names the fix step.

## Rules

- **Never Read `wf-review.js`.** The complete `args` contract is in Phase 1 (`{specPath, tier,
  base, scope, prevFindingsPath, diffLoc, patternsPath, hasDriftScript, reproCommand,
  reconcilePath, frozenRoot}`) and the return shape is
  `{verdict, survivors, killed, verify, reviewerCount, scope, tokens, smells, lensFailed}`
  where `verify` now additionally carries `killContradicted`, and each finding in
  `survivors`/`killed` carries a required `impact` line (Phase 1's return-shape bullet).
  `smells`/`lensFailed` are the advisory smell lens's output — they never enter `verdict.js`
  or the ledger row (Phase 1's smell lens bullet).
  The reviewer/verifier fan-out and all control flow are the workflow's concern — its shape
  lives in the script, not in orchestrator context. Invoke it (by `scriptPath`) and act on
  its return.
- Reviewers are **read-only**; verifiers create only their own repro file and delete it —
  fixes are always separate dispatches.
- **No finding dies by argument.** Kills carry grounded evidence (failed repro / quoted
  sanction / quoted miscitation) — that grounding is the workflow's contract; never litigate
  a survivor away in-session without the same standard.
- Killed findings appear in the report with their evidence. Silent drops void the gate's
  audit value.
- Deterministic gate failures are fixed before review findings are litigated — don't review a
  red build.
- Merge-back is part of CLEAN, not an extra ask — but strategy choice and non-trivial
  conflict resolutions always go through `AskUserQuestion` (git discipline — never push,
  never `--no-verify`, relocate before cleanup — lives in the Phase 3/4 steps).
