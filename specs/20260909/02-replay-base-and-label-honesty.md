---
date: 2026-09-09
status: done
tier: critical
area: replay-harness
design: false
breaking: false
depends_on: [specs/20260908/03-test-fixture-dedupe.md, specs/20260909/01-replay-build-shaped-mutation.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
build_base: main
diff_base: db21bb937bf56889e8779494c7ec6dcc2443046f
---

# The review's base reaches every leg, and the ledger refuses a label its evidence denies

## Goal

Two defects make the replay harness unable to produce an honest number in this repo, and one of
them lets the harness record a number that is not honest. First, `plugin-bump.js --check`
derives its own comparison point as `merge-base(HEAD, main)`; on the replay scratch tree — whose
HEAD is the close commit's parent plus an overlay, and whose branch has already merged — that
merge base collapses onto the parent, above the commit that carried the version bump, so the
check judges a window that excludes the very change it exists to see and goes red on a tree the
review itself judged green. Second, `replay.js --record` accepts `--legs baseline-red:<leg>`
after nothing more than a shape check: it never asks the cited review row whether that leg was
actually red, and a review run id names several ledger rows — the red iterations plus the CLEAN
one — so "was it red at review" has no single answer today. Third, step 7's ladder routes a
deterministic cannot-reproduce-the-review's-state result into an `AskUserQuestion` nobody can
answer from the evidence shown. After this lands: every review leg subprocess is told the base
this review is judging against, `plugin-bump` uses it, one shared selector defines which row a
review run id means, `--record` refuses a `baseline-red` or `pristine-red` claim that row
contradicts, and a scratch tree that cannot reproduce the reviewed state records `setup-failed`
and stops instead of asking the user.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `review-legs.js`'s `sh()` sets `SPEC_REVIEW_BASE` to the exact `--base` value in every leg subprocess's environment. It is applied **after** `opts.env` — `{...process.env, ...opts.env, SPEC_REVIEW_BASE: base}` — so no leg-local override can redirect the base, and `NODE_TEST_CONTEXT` is deleted as today. Every leg — gate, suite, at-risk, patterns, drift, and the script legs — inherits it (AC-20260909-02-1) | A host check that compares HEAD against a base must judge against the base *this review* is judging, not one it re-derives from branch topology that has since changed. One value, set once, at the only place every leg passes through. |
| D2 | `plugin-bump.js resolveBase()` candidate order becomes: `--base <ref>` alone when given, else `[env, 'main', 'origin/main']` where `env` is `process.env.SPEC_REVIEW_BASE` **only when it matches `^[0-9a-f]{40}$`** and is dropped otherwise — first candidate whose `git merge-base HEAD <c>` resolves wins, exactly the fall-through the `main` → `origin/main` pair already uses. Unresolvable-everything is still exit 2 with the `git fetch origin main:main` remedy (AC-20260909-02-3, AC-20260909-02-4, AC-20260909-02-5, AC-20260909-02-6, AC-20260909-02-7) | A value crossing a process boundary into an unknown repository must be a commit identity, not a name: `main` or `HEAD~2` resolves in *every* git repo — including the synthetic marketplaces this script's own tests build in `tmpdir()` — and would silently redirect their base during a review. A 40-hex sha either exists in this repo or does not, so the existing fall-through handles it and no test needs to scrub the variable. |
| D3 | One shared selector defines what a review run id means, used by `--select`'s derivation and by `--record`'s cross-check alike: among ledger rows with `stage === 'review'` and `runId === <id>`, the row with `verdict === 'CLEAN'`; when several, the last in read order; when none is CLEAN, there is no row for cross-check purposes. `--select` keeps choosing exactly the row it chooses today (AC-20260909-02-8) | The real ledger holds five rows for one review run id — four `GATE_RED` iterations recording `suite` exit 1, then the CLEAN row recording `suite` exit 0. A cross-check that took "the last row with this id", or "any row with this id", would call the very label this spec exists to refuse well-founded. |
| D4 | `--record` cross-checks a `baseline-red:<leg>[,<leg>]` claim against D3's row: every named leg must appear in that row's `legs` array **and** be red there under the same `isBaselineLegRed` predicate `--select`'s `deriveBaseline` uses (`smoke` red is `exit ∉ {0,4}`; every other leg is `exit !== 0`). A named leg recorded green, a named leg absent from the array, a row with no `legs` array, or no CLEAN row with that `runId` → exit 2, one stderr line naming the leg and its recorded exit (or its absence) plus the remedy, appending nothing (AC-20260909-02-9, AC-20260909-02-10, AC-20260909-02-11) | `baseline-red` is the one `--legs` value that asserts a fact about a *different* run, and it was the only one nothing checked; the row it cites is already in the ledger the recorder is about to append to. |
| D5 | `--legs` gains a fourth shape, `pristine-red:<leg>[,<leg>]`, accepted **only** with `--outcome setup-failed`; `setup-failed` accepts `none` or `pristine-red:*` and nothing else. It is cross-checked as D4's mirror against the same row: every named leg must be recorded **green**, because the claim is precisely "the review judged this leg green and the scratch tree cannot reproduce that". `--class`, `--patch` and `--workflow` stay refused for `setup-failed` (AC-20260909-02-12, AC-20260909-02-13, AC-20260909-02-14, AC-20260909-02-15) | A tree that cannot reproduce the reviewed state measured nothing, so `setup-failed` is the honest bucket — and it already leaves the harness due, so the next review retries. The leg name is what turns "setup failed" from a shrug into a bug report. |
| D6 | `replay.md` Phase 1 step 7 rung 3's still-red-on-pristine arm is replaced. It becomes: re-run the legs once more against the same pristine tree with a third `{manifestPath}`; **same first failing line** → deterministic, the scratch tree does not reproduce the state the cited review row judged green — a harness defect, never a user question: copy the three manifests to `{root}/.claude/spec-runs/{runId}.manifests/` after `--record` prints the run id and before teardown, `--record … --legs pristine-red:<L>[,<L>] --outcome setup-failed` (no `--class`, `--patch` or `--workflow`), `--teardown`, render Phase 5's `setup-failed` report with `L`'s first failing line where `setupCommand` would be named, STOP, and open a spec against the harness citing the retained manifests. **Green, or red with a different first failing line** → nondeterministic drift: fall through to rung 4's `AskUserQuestion` with all three manifests as evidence. `leg-caught` is still never recorded from an unverified still-red result (AC-20260909-02-16) | A question the user cannot answer from the evidence shown is not a seam, it is a stall; the run that motivated this spec ended in exactly that stall. Determinism is the discriminator the session can actually establish. The manifests are `mktemp` paths a teardown outlives, so "cite the retained manifests" needs somewhere durable to cite. |
| D7 | "The same first failing line" is defined, not left to judgement: the leg's captured output file (`{outDir}/<leg>-output.txt`, or the leg's stderr when it writes none) read top-down, the **first** line matching `/^\s*(✖|not ok)\b/`, with any trailing ` (<number>ms)` duration suffix stripped; a leg whose output has no such line uses its first non-empty stderr line instead. Two runs match when those strings are byte-equal (AC-20260909-02-16) | `node --test` prints a per-test duration on every failure line, so raw equality never matches twice; without a definition the next session compares whatever it happens to look at, and "deterministic" stops being a fact. |
| D8 | `replay.md` Phase 4's matrix gains `setup-failed \| none \| pristine-red:<leg>[,<leg>] \| refused \| refused`, and its "recorded and torn down in Phase 1 step 2 — it never reaches this phase" sentence — already corrected by the sibling spec to name the step-2 and step-5 sites — is corrected again to name all **three**: the step-2 setup gate, step 5's post-apply hook refusal, and step 7 rung 3. Phase 5's `setup-failed` bullets say the failing `setupCommand`, the post-apply hook's stderr, **or** the pristine-red leg's first failing line (AC-20260909-02-16) | A validation matrix that omits an accepted shape is the document teaching the next session to pass the wrong one; a "never reaches this phase" claim becomes false the moment any of the three sites records one. |
| D9 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: version discipline is pinned mechanically by scripts/plugin-bump.js --check in the gate]` | Pipeline rules § Planning: a plugin.json row cites the command and names no version literal. |
| D10 | The two mislabelled ledger rows and the escape row they earned are **not** in this spec's scope; a queued follow-up corrects `rp_799487e5e55c` and `rp_178ef95788d8` to `legs: "green"` in one `ledger(...)` commit citing `rv_cb195f75586e` and `rv_424c02573548`'s own CLEAN rows, and files one `/spec:escape` row against `specs/20260831/01-replay-range-materialization.md` `[no-ac: a ledger data correction has no code surface; the mechanism that would have refused both rows is AC-20260909-02-9]` | Editing run records is a data decision the user owns, and it neither blocks nor is blocked by this spec; the `caught` outcomes stand either way, since the reviewer did run and did catch. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/review-legs.js | MODIFY | scripts | D1: `sh()` sets `SPEC_REVIEW_BASE` to `--base` after `opts.env` in every leg subprocess's environment, beside the existing `NODE_TEST_CONTEXT` scrub; header gains the contract line |
| scripts/plugin-bump.js | MODIFY | scripts | D2: `resolveBase()` candidate order `--base` > a 40-hex `$SPEC_REVIEW_BASE` > `main` > `origin/main`; usage header and the exit-2 message updated |
| spec/scripts/replay.js | MODIFY | scripts | D3–D5: one shared review-row selector used by `--select` and `--record`; `--record` cross-checks `baseline-red:` against that row's `legs`; new `pristine-red:` shape accepted only with `--outcome setup-failed` and cross-checked as its mirror; usage header and the `--legs` refusal message updated |
| spec/commands/replay.md | MODIFY | doctrine | D6–D8: step 7 rung 3's deterministic arm and manifest retention, the first-failing-line definition, Phase 4's matrix row and three-site correction, Phase 5's `setup-failed` bullets |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260909-02-1, AC-20260909-02-2 |
| tests/consistency/plugin-bump.test.js | MODIFY | tests | AC-20260909-02-3, AC-20260909-02-4, AC-20260909-02-5, AC-20260909-02-6, AC-20260909-02-7, AC-20260909-02-17 |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260909-02-8, AC-20260909-02-9, AC-20260909-02-10, AC-20260909-02-11, AC-20260909-02-12, AC-20260909-02-13, AC-20260909-02-14, AC-20260909-02-15, AC-20260909-02-16. Fixture duty: every existing `--legs baseline-red:*` **accept-path** test (AC-20260823-09's family, ~15 occurrences in this file, or their post-dedupe homes) cites a review run id its fixture ledger does not carry, and becomes exit 2 under D4 — each gains a CLEAN review row recording the named leg red, and is retagged in place with AC-20260909-02-10, never loosened to a non-`baseline-red` shape |

Orchestrator duty, outside the table: the build's last step reconciles this repo's own
`size-baseline.json` for the files this spec grows, exactly as every build here already does —
`size-baseline.json` is not a File Plan row and no worker edits it.

## Contracts

```
spec/scripts/review-legs.js

  sh(cmd, opts) child environment =
    { ...process.env, ...opts.env, SPEC_REVIEW_BASE: <the --base value> }   minus NODE_TEST_CONTEXT

  SPEC_REVIEW_BASE — the commit this review is judging against. Set by review-legs.js for every
  leg subprocess, after opts.env so a leg-local value cannot redirect it. A host check that
  resolves its own comparison point reads it as one candidate among its own and MUST ignore any
  value that is not a full 40-hex commit sha: a ref name resolves in every repository, including
  a synthetic one a test builds in a temporary directory, and would silently redirect a base
  there. It is never a substitute for an explicit --base flag.
  (The existing inline `DIFF_BASE=<base>` prefix on the patterns leg is unchanged — it is the
  host patterns script's own documented input, generated into every host by init-gen.js.)
```

```
scripts/plugin-bump.js --check

  base resolution (unchanged except for the middle candidate):
    --base <ref> given      -> candidates = [<ref>]
    otherwise               -> env = process.env.SPEC_REVIEW_BASE
                               candidates = [env if /^[0-9a-f]{40}$/, "main", "origin/main"]
                               (non-matching / unset entries dropped)
    first c with `git merge-base HEAD <c>` exit 0 and non-empty stdout wins -> that sha
    none resolvable         -> exit 2
        explicit : "cannot resolve --base <ref> to a commit — remedy: pass a ref git rev-parse accepts"
        derived  : "no base resolvable: neither $SPEC_REVIEW_BASE, main nor origin/main is a ref
                    here — remedy: git fetch origin main:main or pass --base <ref>"
```

```
spec/scripts/replay.js  --record

  reviewRowFor(rows, runId)   # the one shared selector; --select derives from it too
    candidates = rows where stage === 'review' && runId === <id> && verdict === 'CLEAN'
    none      -> null            (a run id with only red iterations supports no claim)
    several   -> the LAST in read order

  --legs  green
        | red:<leg>
        | baseline-red:<leg>[,<leg>]      cited row must record every named leg RED
        | pristine-red:<leg>[,<leg>]      cited row must record every named leg GREEN,
                                          and --outcome must be setup-failed
        | none

  outcome x legs matrix (rows unchanged except the last):
    caught | missed        green | baseline-red:*                 --patch req, --workflow req
    unresolved             green | baseline-red:*                 --patch req, --workflow req
    unresolved             red:<leg>                              --patch req, --workflow REFUSED
    leg-caught             red:<leg>                              --patch req, --workflow optional
    setup-failed           none | pristine-red:<leg>[,<leg>]      --class/--patch/--workflow REFUSED

  cross-check (baseline-red and pristine-red only; every other shape reads no ledger):
    row = reviewRowFor(readLedgerRows(root), --review-run-id)
    row null                         -> exit 2 "cites --review-run-id <id>, which names no CLEAN
                                        review row in <path> — re-run --select and pass its
                                        printed reviewRunId"
    row has no legs array            -> exit 2 "row <id> records no legs array, so it cannot
                                        support a <shape> claim — pass --legs green or red:<leg>"
    red predicate = leg === 'smoke' ? exit !== 0 && exit !== 4 : exit !== 0     (isBaselineLegRed)
    baseline-red: a named leg absent, or red predicate false
                                     -> exit 2 "--legs baseline-red:<L> claims <L> was already
                                        red at review <id>, whose CLEAN row records <L> exit <n>
                                        — pass --legs red:<L> if the mutation reddened it, or green"
    pristine-red: a named leg absent, or red predicate TRUE
                                     -> exit 2 "--legs pristine-red:<L> claims the scratch tree
                                        cannot reproduce review <id>'s green <L>, whose CLEAN row
                                        records <L> exit <n> — a leg already red at review is
                                        --legs baseline-red:<L>"
    pristine-red: with any --outcome other than setup-failed
                                     -> exit 2 "--legs pristine-red:<L> is accepted only with
                                        --outcome setup-failed — nothing was measured"
  Every refusal appends nothing to the ledger and writes no evidence artifact.
```

```
replay.md — "the same first failing line" (D7)

  source  = {outDir}/<leg>-output.txt when the leg wrote one, else the leg's stderr
  line    = the first line matching /^\s*(✖|not ok)\b/ , with a trailing " (<n>ms)" stripped
  fallback= no such line -> the first non-empty stderr line
  match   = byte-equal strings across the two pristine runs
```

## Behavior

- **What the scratch tree is.** `--setup` stands it at the close commit's *parent* and adds one
  overlay commit re-applying the close commit's non-meta content, so `specs/`, `.claude/` and
  `docs/canonical/` stay at the parent's version and the blind reviewer never reads
  `status: done`. That construction is deliberate and is not what this spec changes.
- **Why the version check reddens there.** The branch has already merged, so `main` contains it;
  `merge-base(HEAD, main)` for a detached HEAD at parent-plus-overlay therefore resolves to the
  parent — which sits *after* the build commit that carried the bump. The window
  `parent..HEAD` shows files changed under `spec/` and a version that did not move, so the check
  reports a skipped bump. Given the base the review itself used, the same tree reports the bump
  it actually made.
- **Where the review's base already goes.** `scope-reconcile` gets it as `--base`, and the
  patterns script gets it as an inline `DIFF_BASE=` prefix. What has no route today is the gate
  and suite legs, which run the host's whole test suite — including any host check that resolves
  a base of its own. `SPEC_REVIEW_BASE` is that route.
- **Why the env value is a 40-hex candidate, not an override.** `plugin-bump.js`'s own tests
  build synthetic marketplaces in `tmpdir()` and run `--check` against them; those child
  processes inherit whatever environment the run has. A ref *name* would resolve in every one of
  them and quietly move their base; a sha either exists in the repository being checked or does
  not, and the existing `main` → `origin/main` fall-through already handles "does not". No test
  needs to scrub the variable and no fixture changes. Both callers pass a full sha today (A5).
- **How the mislabel actually happened.** A review run id is not one row. `rv_cb195f75586e`
  names five: four `GATE_RED` iterations recording `suite` exit 1, then the CLEAN row recording
  `suite` exit 0. `--select` reads the CLEAN row and printed `baselineRed=none`; a session
  reading "the row for this review" could just as easily have read a red iteration and believed
  the label. That is why the selector is defined once and shared, rather than restated at the
  recorder.
- **The step-7 stall.** With the legs red on the pristine tree, rung 3's verification cannot
  clear the mutation, so the ladder falls to rung 4 and asks the user whether the redness is
  pre-existing or mutation-caused. Neither answer is true: the tree does not reproduce the
  reviewed state at all. Re-running once discriminates a broken harness (same failure, twice)
  from drift (different failure, or none), and only the second is a question worth a human.
- **What a deterministic stop costs.** `setup-failed` does not reset the measurement window, so
  the harness stays due and every later review re-runs the whole sequence — two setups and four
  leg runs — to reach the same STOP until a harness spec lands. That is the intended price of
  never recording a number the tree cannot support, and the retained manifests plus the report's
  failing line are what make the harness spec cheap to write.

## Acceptance Criteria

- **AC-20260909-02-1**: WHEN `review-legs.js` runs a leg subprocess THE SYSTEM SHALL set
  `SPEC_REVIEW_BASE` in that subprocess's environment to the exact string passed as `--base`,
  and SHALL apply it after any leg-local `opts.env` so a leg-local value cannot redirect it —
  a synthetic host whose `gateCommand` is `sh -c 'echo base=$SPEC_REVIEW_BASE'`, run with
  `--base 0123456789abcdef0123456789abcdef01234567`, writes
  `base=0123456789abcdef0123456789abcdef01234567` into the leg's captured output, and the
  patterns leg (which passes its own `DIFF_BASE=` prefix) writes the same value → test
  "every leg subprocess is told the base this review is judging against" in
  `tests/review/review-legs.test.js`
- **AC-20260909-02-2**: WHEN `review-legs.js` runs a leg subprocess THE SYSTEM SHALL CONTINUE TO
  remove `NODE_TEST_CONTEXT` from that subprocess's environment — a `gateCommand` of
  `sh -c 'echo ctx=[${NODE_TEST_CONTEXT-unset}]'` invoked from inside `node --test` writes
  `ctx=[unset]` → the existing nested-runner test in `tests/review/review-legs.test.js`,
  retagged with this AC-ID in place
- **AC-20260909-02-3**: WHEN `plugin-bump.js --check` runs with no `--base` and
  `SPEC_REVIEW_BASE` set to a 40-hex commit `git merge-base HEAD <sha>` resolves THE SYSTEM
  SHALL compare against that merge base — synthetic marketplace with one plugin at `./spec`,
  `main` at `1.0.0` (commit `c0`); a branch whose `c1` edits `spec/x.js` **and** bumps the
  manifest to `1.1.0`, and whose `c2` edits `spec/y.js` **and** `specs/n.md`; `main` gains
  `git merge --no-ff` of that branch; the scratch tree is a detached HEAD at `c1` plus one
  overlay commit re-applying `c2`'s `spec/y.js` only: bare `--check` exits 1 printing
  `❌ spec:` (base `1.1.0`, HEAD `1.1.0`, `spec/y.js` changed since `c1`), and the same run with
  `SPEC_REVIEW_BASE=<c0's full sha>` exits 0 printing `✅ spec 1.0.0 → 1.1.0` → test "an
  already-merged branch's scratch tree is green against the review's own base and red against
  the collapsed merge base" in `tests/consistency/plugin-bump.test.js`
- **AC-20260909-02-4**: WHEN both `--base` and `SPEC_REVIEW_BASE` are supplied THE SYSTEM SHALL
  use `--base` — the same host with `SPEC_REVIEW_BASE=<c0's full sha>` (which alone prints
  `✅ spec 1.0.0 → 1.1.0`) and `--base HEAD` exits 0 printing
  `✅ spec 1.1.0 (no change under spec/)` → test "an explicit --base outranks SPEC_REVIEW_BASE"
  in `tests/consistency/plugin-bump.test.js`
- **AC-20260909-02-5**: WHEN `SPEC_REVIEW_BASE` is a 40-hex sha this repository cannot resolve
  THE SYSTEM SHALL fall through to `main` and produce the same result as an unset variable —
  a synthetic host on an unbumped branch with
  `SPEC_REVIEW_BASE=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef` exits 1 with the identical
  `❌ spec:` stdout the unset run prints → test "an unresolvable SPEC_REVIEW_BASE falls through
  to main exactly as an unset one does" in `tests/consistency/plugin-bump.test.js`
- **AC-20260909-02-6**: WHEN `SPEC_REVIEW_BASE` is not a 40-hex sha THE SYSTEM SHALL ignore it
  entirely rather than resolve it — the AC-3 scratch-tree host with `SPEC_REVIEW_BASE=main`
  (a ref that resolves there and would print `✅ spec 1.0.0 → 1.1.0` if honored) exits 1 with
  the identical `❌ spec:` stdout the unset run prints → test "a ref-shaped SPEC_REVIEW_BASE is
  ignored, because a name means a different commit in every repository" in
  `tests/consistency/plugin-bump.test.js`
- **AC-20260909-02-7**: WHEN no `--base` is given and neither `SPEC_REVIEW_BASE`, `main` nor
  `origin/main` resolves THE SYSTEM SHALL CONTINUE TO exit 2 with a stderr line starting
  `plugin-bump: ` and naming `git fetch origin main:main` — a synthetic host on a detached HEAD
  with no `main` branch and `SPEC_REVIEW_BASE=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef` exits 2
  → the existing AC-20260908-01-5 unresolvable-base test in
  `tests/consistency/plugin-bump.test.js`, extended with the env case and retagged with this
  AC-ID
- **AC-20260909-02-8**: WHEN a ledger carries several `stage: "review"` rows sharing one
  `runId` THE SYSTEM SHALL resolve that run id to the CLEAN row for both `--select`'s printed
  `baselineRed` and `--record`'s cross-check — ledger rows in order
  `{runId:"rv_a", verdict:"GATE_RED", legs:[{leg:"suite",exit:1}]}` then
  `{runId:"rv_a", verdict:"CLEAN", legs:[{leg:"suite",exit:0}]}` → `--record --review-run-id
  rv_a --legs baseline-red:suite --outcome caught --patch p --workflow w` exits 2 (the CLEAN
  row records `suite` exit 0), and `--select` on the same ledger prints `baselineRed=none` →
  test "a review run id resolves to its CLEAN row, not to a red iteration that shares the id"
  in `tests/replay/replay.test.js`
- **AC-20260909-02-9**: WHEN `--record --legs baseline-red:<leg>` names a leg the resolved row
  records green THE SYSTEM SHALL exit 2 naming the leg and its recorded exit and append nothing
  — a single CLEAN row `{"runId":"rv_a","legs":[{"leg":"suite","exit":0}]}` with
  `--legs baseline-red:suite --outcome caught --patch p --workflow w` → exit 2, stderr contains
  `suite` and `exit 0`, and the ledger file is byte-for-byte unchanged → test "a baseline-red
  claim the cited review row records green is refused" in `tests/replay/replay.test.js`
- **AC-20260909-02-10**: WHEN `--record --legs baseline-red:<leg>` names a leg the resolved row
  records red THE SYSTEM SHALL append the row exactly as today — the same fixture with
  `legs:[{"leg":"suite","exit":1}]` → exit 0, stdout matching `recorded runId=rp_[0-9a-f]{12}`,
  and one appended row carrying `"legs":"baseline-red:suite"`; and `smoke` at `exit 4` counts as
  green (`baseline-red:smoke` against `{"leg":"smoke","exit":4}` → exit 2) while `smoke` at
  `exit 1` counts as red (→ exit 0) → tests "a founded baseline-red claim records unchanged" and
  "smoke's exit 4 is green to the cross-check, exit 1 is red" in `tests/replay/replay.test.js`,
  together with every existing `baseline-red` accept-path test retagged in place per the File
  Plan's fixture duty
- **AC-20260909-02-11**: WHEN `--record --legs baseline-red:<leg>` cites a `--review-run-id`
  that names no CLEAN review row, or whose CLEAN row carries no `legs` array, THE SYSTEM SHALL
  exit 2 naming that run id and append nothing — `--review-run-id rv_missing` against a ledger
  holding only `rv_a` → exit 2, stderr contains `rv_missing`; a ledger whose only `rv_b` row is
  `{"stage":"review","runId":"rv_b","verdict":"GATE_RED","legs":[…]}` → exit 2, stderr contains
  `rv_b`; a CLEAN row `{"stage":"review","runId":"rv_c","verdict":"CLEAN"}` with no `legs` key →
  exit 2, stderr contains `rv_c` → test "a baseline-red claim citing an absent, never-CLEAN or
  legless review row is refused" in `tests/replay/replay.test.js`
- **AC-20260909-02-12**: WHEN `--record --outcome setup-failed --legs pristine-red:gate,suite`
  cites a CLEAN row recording both legs green THE SYSTEM SHALL exit 0 and append a row whose
  `legs` is the literal string `pristine-red:gate,suite`, `class` `null`, `files` `null` —
  CLEAN row `{"runId":"rv_a","legs":[{"leg":"gate","exit":0},{"leg":"suite","exit":0}]}` → exit
  0 and the appended row's `legs` field equals `"pristine-red:gate,suite"` → test "a pristine-red
  setup-failed row records the legs that could not be reproduced" in `tests/replay/replay.test.js`
- **AC-20260909-02-13**: WHEN `--legs pristine-red:<leg>` names a leg the resolved row records
  red THE SYSTEM SHALL exit 2 naming `baseline-red` as the correct shape and append nothing —
  the same call against `legs:[{"leg":"gate","exit":1}]` → exit 2, stderr contains
  `baseline-red` → test "a pristine-red claim about a leg that was already red is refused" in
  `tests/replay/replay.test.js`
- **AC-20260909-02-14**: WHEN `--legs pristine-red:<leg>` is given with any `--outcome` other
  than `setup-failed` THE SYSTEM SHALL exit 2 naming `setup-failed` as the only accepted outcome
  and append nothing — `--outcome leg-caught --legs pristine-red:gate --patch p` → exit 2,
  stderr contains `setup-failed` → test "pristine-red is accepted only with setup-failed" in
  `tests/replay/replay.test.js`
- **AC-20260909-02-15**: WHEN `--outcome setup-failed` is given `--class`, `--patch` or
  `--workflow` THE SYSTEM SHALL CONTINUE TO exit 2 and append nothing — `--outcome setup-failed
  --legs none --class silent-fallback` → exit 2 → the existing AC-20260823-09 setup-failed
  refusal tests in `tests/replay/replay.test.js`, retagged with this AC-ID in place
- **AC-20260909-02-16**: WHEN `spec/commands/replay.md` is read THE SYSTEM SHALL state, in
  Phase 1 step 7 rung 3, that a still-red pristine result is re-verified once against a third
  manifest, that the three manifests are copied to `{root}/.claude/spec-runs/{runId}.manifests/`
  before teardown, that the same first failing line — defined as the first `✖`/`not ok` line
  with its trailing duration stripped — records `--legs pristine-red:<leg>` with `--outcome
  setup-failed` and stops, and that a different or green result falls through to rung 4's seam;
  SHALL carry a Phase 4 matrix row reading
  `setup-failed | none \| pristine-red:<leg>[,<leg>] | refused | refused`; and SHALL name three
  `setup-failed` sites in Phase 4 rather than claiming the outcome never reaches that phase —
  the step-7 slice matching `/pristine-red:/`, `/setup-failed/`, `/once more|third/i`,
  `/manifests/` and `/first failing line/i`, and the Phase 4 slice matching
  `/pristine-red:<leg>/` and not matching `/never reaches this phase/` → the existing
  AC-20260831-01-7 step-7 prose test in `tests/replay/replay.test.js`, extended and retagged
  with this AC-ID in place — its four inherited assertions (`reset --hard HEAD^`, a fresh
  manifest, the word `pristine`, and a route to rung 4's seam) all still hold and are never
  deleted — plus a sibling Phase 4 assertion
- **AC-20260909-02-17**: WHEN `plugin-bump.js --check` runs at this repository's root with
  `SPEC_REVIEW_BASE` set to `git rev-parse HEAD` THE SYSTEM SHALL exit 0 and print
  `(no change under ` for every marketplace plugin — stdout differing from the bare `--check`
  run at the same root, which prints at least one `→` version-comparison line — proving the
  variable is honored on this real checkout and not only in synthetic hosts → test "on this
  checkout SPEC_REVIEW_BASE moves the window the check judges" in
  `tests/consistency/plugin-bump.test.js`

## Assumptions (escalation triggers)

- A1: on the real replay scratch tree, `plugin-bump.js --check` is red under its own derived
  base and green under the review's base — **executed 2026-09-09** against a `--setup` worktree
  built from `--select`'s own output (`parent=3634701e`, `overlay=cce7be70`,
  `diffBase=ba8b5ae5`): bare `--check --root <tree>` → exit 1,
  `❌ spec: spec/ changed since 3634701 but version is 7.118.0 (base 7.118.0)`;
  `--check --root <tree> --base ba8b5ae5…` → exit 0, `✅ spec 7.117.0 → 7.118.0`. — **if false:**
  the base is not the fault and D1/D2 are withdrawn; nothing else in this spec depends on them.
- A2: `--record` accepts an unfounded `baseline-red` today — **executed 2026-09-09** against a
  scratch root whose ledger held one CLEAN review row `rv_aaaaaaaaaaaa` with `gate` and `suite`
  both `exit 0`: `--record --legs baseline-red:suite --outcome caught --patch … --workflow …`
  printed `recorded runId=rp_fd603d0504d5 via=manual` and exited 0. — **if false:** D4 is already
  implemented and its ACs become regression pins.
- A3: `--record` refuses `pristine-red:` today — **executed 2026-09-09**, same root:
  `--record --legs pristine-red:gate --outcome setup-failed` printed
  `replay.js: --legs must be 'green', 'red:<leg>', 'baseline-red:<leg>[,<leg>]', or 'none', got
  'pristine-red:gate'` and exited 2. — **if false:** D5's shape already exists and only the
  cross-check is new.
- A4: one review run id names several ledger rows with different `legs`, so the selector is
  load-bearing — **executed 2026-09-09**: `rv_cb195f75586e` matches five rows; the first is
  `verdict: GATE_RED` recording `suite` exit 1 (and `ac-matrix` exit 1), the last is
  `verdict: CLEAN` recording `gate` exit 0 and `suite` exit 0. `rv_424c02573548`'s CLEAN row
  likewise records both green, while `rp_799487e5e55c` claims `baseline-red:suite` and
  `rp_178ef95788d8` claims `baseline-red:gate,suite`. — **if false:** D3 collapses to "the row
  with this runId" and the selector is trivial; every other decision stands.
- A5: both callers of `review-legs.js --base` pass a full 40-hex sha — the review driver from
  the spec's `diff_base` frontmatter, `--select` from `row.diff.base` — so D2's 40-hex gate never
  drops a legitimate value. — **if false:** a ref-shaped base makes `plugin-bump` fall back to
  its own derivation, which is exactly today's behavior and never worse; the remedy is to
  resolve `--base` to a sha in `review-legs.js` before exporting, in a follow-up.
- A6: this repo's `plugin-bump.js` judging against `diff_base` instead of branch topology is an
  accepted trade, not a new failure mode. A `diff_base` stale against a rebase widens the
  window and could pass a branch that never bumped — but the host Gotchas already record that a
  stale `diff_base` mis-scopes *every* diff-scoped leg, and the build corrects it at close, so
  this inherits an existing dependency rather than creating one. — **if false / if a stale base
  ever passes an unbumped branch:** narrow the variable to replay by prefixing
  `SPEC_REVIEW_BASE={diffBase}` on replay.md's own `review-legs` invocations instead of setting
  it in `review-legs.js`.
- A7: by the time this builds, `specs/20260908/03-test-fixture-dedupe.md` has landed and the
  repeated host builders in `tests/replay/replay.test.js` and `tests/review/review-legs.test.js`
  live in `tests/replay/replay.fixtures.js` and `tests/review/review-legs.fixtures.js` — read
  from that spec's in-flight worktree on 2026-09-09 (`status: implementing`; its diff against
  `main` creates both fixtures modules and rewrites both test files). New tests here author
  against the fixtures modules, never a re-inlined builder, and the File Plan's `baseline-red`
  fixture duty applies to their post-dedupe homes. — **if false:** 03 has not landed at build
  time; build in place against the inlined builders and record the departure.
- A8: `review-legs.js`'s `sh()` is the single place every leg subprocess is spawned — read from
  `spec/scripts/review-legs.js` on 2026-09-09: `spawn('bash', ['-c', cmd], {cwd: root, env})`
  inside `sh()`, called by every wave-1, wave-1b, wave-2 and tail leg. — **if false:** the
  variable is set in each remaining spawn site instead, and the test asserts on the gate leg,
  which is the one that runs the host suite.

## Rationale

The three defects are one story told at three levels. The scratch tree is built to be
byte-identical to what the review judged, but it is reached by a different route through
history, and any check that infers its own comparison point from history reads that route rather
than the tree. The fix is not to teach the check about replay — a check that knows it is being
tested is a check that can be lied to — but to hand every leg the base the review is actually
judging, which is a fact the review already holds and currently drops on the floor for all but
two legs. `scope-reconcile` gets it as an argument and the patterns script gets it as an inline
environment prefix; the gate and suite legs, which run the host's entire test suite, get nothing.
One environment variable set at the single spawn site closes that.

Making the environment value a 40-hex *candidate* rather than an override is the whole reason
this change is small. `plugin-bump.js`'s existing loop already tries `main`, then `origin/main`,
and falls through silently when one does not resolve; adding a third entry at the head inherits
that behavior exactly. The sha restriction is what makes the argument structural rather than
conventional: a ref name resolves in every repository, so exporting `main` would silently move
the base inside every synthetic marketplace the script's own tests build, while a sha either
exists in the repository under check or does not.

The recorder's hole is narrower but worse, because it is the one that put a false statement into
the permanent record — and the shape of the ledger explains how a careful session still got it
wrong. A review run id names one row per iteration, and the failing iterations really do record
the leg red; only the CLEAN row is the state the close was judged on. So "was this leg red at
review" is ambiguous until something defines it, and defining it once, in a selector both
`--select` and `--record` call, is the fix that makes the cross-check mean anything.
`pristine-red` is deliberately the mirror image: it asserts the cited row recorded the leg
*green*, which is exactly the contradiction that makes the run unmeasurable, and it is accepted
only under the outcome that records no measurement.

Two things were considered and rejected. Reusing the existing `DIFF_BASE` name instead of adding
`SPEC_REVIEW_BASE` would avoid a second name for one concept, but `DIFF_BASE` is a host-facing
input that `init-gen.js` writes into every host's generated patterns script usage line, and
promoting it to a plugin-wide environment contract would change what any host script reading it
observes during a review without those hosts asking for it. Requiring `--record` to resolve the
cited review row for *every* `--legs` shape was rejected because the existing tests, and every
legitimate manual invocation, cite run ids that need not still be in the ledger; only the two
shapes that make a claim about that row need it.

Lock-time collision closure (`collision-closure --literal "never reaches this phase" --literal
"not mutation-caused" --literal "SPEC_REVIEW_BASE"`): two literals hits landed outside the File
Plan. `never reaches this phase` resolves to `spec/commands/replay.md`, already a File Plan row.
`not mutation-caused` resolves to `docs/canonical/review.md`, whose replay paragraph states that
a still-red pristine leg "means not mutation-caused and routes to the attribution question seam
instead" — the exact claim D6 narrows. That hit is closed by this spec's Canonical Delta, which
`/spec:review` applies on CLEAN; it is deliberately not a File Plan row, because a spec never
edits `docs/canonical/` from its own build. Hits inside `.claude/worktrees/` are another spec's
in-flight copy and owe nothing.

Fragile spot to watch during execution: step 7's rung 3 already carries a prose pin
(AC-20260831-01-7) asserting `reset --hard HEAD^`, a fresh manifest, the word "pristine", and a
route to rung 4's seam. All four survive this rewrite — the rung-4 route remains, for the
nondeterministic arm — so the pin is extended and retagged in place, never loosened, and the
build must not delete the assertions it inherits.

Departures recorded during the build and review, folded from the deviations sidecar at close.
All six are one-offs specific to this spec; none is recurring-shaped, so none earned a Gotchas
entry (the section stood at its 15-entry cap at verdict).

- AC-20260909-02-2's File Plan text said `tests/review/review-legs.test.js` carried an existing
  nested-runner test for the `NODE_TEST_CONTEXT` scrub, to be retagged in place. No such test
  existed anywhere in the repo. The AC's own worked example was authored fresh instead — a
  sanctioned green-pre-change pin, since the scrub behavior already lived in `sh()`, never
  weakened.
- The File Plan's fixture-duty note for `tests/replay/replay.test.js` estimated "~15
  occurrences" of a pre-existing `baseline-red:*` accept-path test needing a CLEAN-row fixture.
  Exactly one such test existed (AC-20260823-09-4). Its fixture was fixed and it was retagged
  with AC-20260909-02-10; the "~15" figure was treated as a stale estimate, not a target.
- As first authored, AC-20260909-02-17's sanity assertion required this repo's HEAD to carry the
  spec's committed edits plus the plugin.json bump, so a bare `--check` — judging the
  `merge-base(HEAD, main)` window — would show a real version-comparison line. That made the
  test's redness a fact about branch topology rather than about the behavior under test, and it
  would have gone red on `main` the moment this work merged. The review's first iteration caught
  it; the test now anchors both comparison windows to state it controls — an explicit `--base`
  naming a fixed ancestor commit versus HEAD — so it holds identically on any branch, with more
  assertions than before and none removed.
- Five new `--record` tests (AC-8, AC-9, AC-10, AC-11, AC-14) each re-inlined an identical
  `mutation.patch`/`workflow.json` fixture block instead of using `tests/replay/replay.fixtures.js`
  per A7. The review's first iteration caught it; a shared `writeRecordFixture(root)` builder was
  extracted into that module and all five tests switched to it.
- The build's read-load repair round condensed `replay.md`'s Phase 1 steps 1 and 5 beyond D6–D8's
  scope, dropping four operational facts the script still enforces (the self-provisioned ignore
  line, the `--dir` remedy, `{patchOutFile}`'s exit-3 refusal, and `afterApply` being read from
  the main root). The review's first iteration caught it; all four were restored, offset by
  condensing Phase 4 prose that merely restated the validation matrix above it. `/spec:replay`
  closes at 449 of its 450-line read-load budget — one line of slack, so the next change to that
  file will have to find room before it can add any.
- The test-authoring pass and the implementation wave overlapped: every test in the batch was
  verified genuinely red against the pre-image before the wave landed, and needed no change of
  its own once the implementation arrived.

## Canonical Delta

`docs/canonical/review.md`'s replay paragraph, in the sentence that today reads "red there means
not mutation-caused and routes to the attribution question seam instead", is rewritten to:

> red there means the scratch tree does not reproduce the state the cited review row judged
> green. The legs are re-run once more against the same pristine tree: the same first failing
> line makes it deterministic — a harness defect, recorded as `setup-failed` with
> `--legs pristine-red:<leg>`, reported with that failing line, its manifests retained beside the
> run id, and stopped, so the harness stays due; a green or differently-failing re-run is drift
> and routes to the attribution question seam instead.

`docs/canonical/review-legs.md` gains one section after **Rows carry their scope**:

## The review's base reaches the legs

Two legs used to be the only ones told what this review is judging against: `scope-reconcile`
receives it as an argument, and the host patterns script receives it as an inline `DIFF_BASE=`
prefix. The gate and suite legs run the host's whole test suite, which can contain checks that
resolve a comparison point of their own — and a check that derives its own base from branch
topology reads a different history than the one the review is judging. A merged branch is the
clearest case: `merge-base(HEAD, main)` collapses onto a commit above the change the check
exists to see, so the check reports a skipped step on a tree that never skipped it.
`review-legs.js` therefore sets `SPEC_REVIEW_BASE` to its `--base` value in every leg
subprocess's environment, at the one place all of them are spawned, applied after any leg-local
environment so a leg cannot redirect it. A host check reads it as one candidate among its own
and must ignore any value that is not a full 40-hex commit sha — a ref name resolves in every
repository, including a synthetic one a test builds in a temporary directory, so only a commit
identity may cross that boundary. It never outranks an explicit flag and never becomes a
required input. `DIFF_BASE` keeps its own meaning as the patterns script's documented input.

`docs/canonical/review-legs.md` also gains, in the same section:

**One row per review run id is the CLEAN one.** A review appends a row per iteration under one
`runId`, and the failing iterations record their legs red. Only the CLEAN row describes the
state the close was judged on, so every consumer that asks "what did this review observe"
resolves the run id through one shared selector — the CLEAN row, the last when several — rather
than restating the rule. Two replay rows were recorded claiming a leg was already failing at
review because that ambiguity had no owner.
