---
date: 2026-08-10
status: done
risk: T3                 # touches verdict.js — the sole review/release verdict derivation (pipeline rules § Risk Tiers)
area: cross-cutting
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a               # incident-driven (Prax stale-CI review stop, 2026-08-10); no roadmap brief warranted
spiked: 2026-08-10
open_markers: 0
---

# Per-SHA CI legs: review stops blocking on stale runs; release gains the authoritative CI check

## Goal

`/spec:review`'s `ci` leg currently asks GitHub for the **latest run on the branch**, so a red
run attached to a stale pre-spec commit hard-stops a review of unpushed work and forces
mid-review push-and-wait cycles (Prax incident, 2026-08-10). After this spec: a review blocks
on CI **only when a completed red run exists for the exact commit under review**; everything
else (stale run, unpushed work, in-progress, no CI) records informationally and never blocks.
`/spec:release` gains the authoritative CI leg on the release SHA, and `/spec:doctor` gains a
check that the host's CI workflow invokes the configured `gateCommand` — the single-source-of-
truth rule that prevents local-green/CI-red drift at the root. Done means: no review can ever
be stopped by CI evidence about a different commit, and a red run on the exact reviewed or
released commit still blocks exactly as before.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `ci-query.js` gains a `--commit <sha>` mode, mutually exclusive with `--branch` (exactly one required; both or neither → exit 2). It passes `--commit <sha>` to `gh run list` in place of `--branch <name>`; every other behavior — normalization, the raw-vs-mapped split, `--limit 1`, no retry, no conclusion interpretation — is byte-identical. An empty run list stays `{available:false, transient:false}` (spiked: real gh 2.93.0 returns `[]` exit 0 for a commit CI never saw). `--branch` mode is untouched (observe-ci.js depends on it). | One normalizer, two key modes; rejected a second script (the two-wrappers drift seam D4 of 20260805/02 killed). |
| D2 | review.md's ci leg (Phase 0 step 3) keys on the reviewed commit: `git -C {root} rev-parse HEAD` (always `{root}`, never `{frozenRoot}` — executed evidence comes from the tree that ships, per the frozen-base rule), invoked as `--commit <that sha>`. Exit mapping: a completed run for that commit with `conclusion ∈ {failure, timed_out, cancelled}` → `exit:1`; **everything else** — `available:false` (structural or transient), in-progress → `exit:0`. Observed strings unchanged: `"unavailable"`/`"unavailable-transient"`/`"in-progress"`/`"conclusion=<value>"`. | The key was the defect, not the blocking: per-SHA is the only binding under which a CI verdict is evidence about this diff (GitHub required checks, merge queues, `workflow_run.head_sha` all key per-SHA). |
| D3 | `ci` **stays in `REVIEW_BLOCKING`** in verdict.js. With D2, an `exit:1` ci row can only mean "completed red run on the exact reviewed commit" — precisely the case that must derive GATE_RED. Removing it would let a genuine red ride to CLEAN through the sole derivation script while only prose stopped it. | "Blocks only on red-for-this-commit" must be enforced by verdict.js, not review.md prose; the fix lives entirely in D2's exit mapping. |
| D4 | release.md gains a `ci` leg in Phase 2 (after `ready`, before `e2e`): `--commit $(git -C . rev-parse HEAD)`. Mapping: completed red → `exit:1`; completed non-red → `exit:0`, observed `"conclusion=<value>"`; `available:false` → `exit:0`, observed `"unavailable"`; in-progress → re-invoke every 30s up to 10 minutes, then `exit:0`, observed `"in-progress"`. Whenever observed is not a `conclusion=` value, the pre-promote report MUST carry one ⚠️ line stating CI never delivered a verdict on this exact commit (and, for `unavailable`, that pushing would produce one). Release.md's Phase-2 **immediate-STOP enumeration** ("Any failure here (a red `deploy`/`ready`/`e2e`/`journeys` row): STOP") is extended to include a red `ci` row — without this, a red CI verdict on the release commit would only surface post-promotion (refuter finding). While editing that region, also correct its verdict-origin sentence: an early Phase-2 STOP leaves later legs without manifest rows, and verdict.js checks missing-required legs *before* red legs, so the quoted word on an early stop is `UNVERIFIED`, not `GATE_RED` (executed 2026-08-10: synthetic manifest, red `deploy` only → `UNVERIFIED`); the STOP path quotes whatever word the derivation prints, never a promised `GATE_RED`. The manifest row is appended exactly once, after the poll loop resolves. `RELEASE_LEGS` in verdict.js becomes `['deploy','ready','e2e','journeys','substrate','production','ci']` (all release legs blocking, unchanged rule); the release ledger row gains `"ci":"<observed>"`. | Release is the authoritative boundary AI-SDD practice pushes CI to; unavailable stays green so CI-less hosts and unpushed-flow hosts don't brick releases — release's own executed legs (deploy/e2e/journeys) are the primary evidence, CI is a cross-check, and the human promote confirmation backstops the ⚠️. |
| D5 | doctor.md gains **check 19 — CI-gate parity** (deterministic, advisory): only when `.github/workflows/` exists, split the config `gateCommand` on the regex `/\{[^}]*\}/g`, trim each literal segment, keep segments ≥ 10 chars — and **if no segment survives the floor, the single required segment is the whole trimmed gateCommand with placeholder tokens stripped** (so short commands like `npm test` never degenerate to a vacuously green check — refuter finding) — and require every kept segment to appear as a substring in the concatenation of `.github/workflows/*.yml`+`*.yaml`. Any missing segment → advisory finding: the host's CI does not invoke the configured gateCommand, so CI red/green and pipeline gate red/green can drift; remedy = make one CI step run the gateCommand verbatim. | Root-cause fix for local-green/CI-red: one authored copy of "what checks run" (Makefile-wrapper pattern); advisory because equivalent-but-respelled CI is a false positive this check cannot see. |
| D6 | scaffold-ledger.md: amend the **Verdict derivation** row (its re-tune clause fired — a blocking leg blocked on evidence about a different commit; record the per-SHA re-key) and the **Release stage executed checks** row (new `ci` leg joins the executed set) in place; add exactly ONE new row for check 19 (Mechanism: doctor check 19 CI-gate parity, kind: advisory). | The two existing rows' re-tune clauses license exactly this change; only the new guard needs a new row (review check: new mechanism without a ledger row is hard). |
| D7 | `observe-ci.js` is untouched: default-branch, latest-run keying is correct for its job (post-merge red alarm on the trunk — the async safety-net pattern), and it explicitly never feeds verdict.js. `--branch` mode of ci-query.js is therefore a regression-pinned surface (AC-20260810-07-4). | Three keying strategies, each matched to its question: review = this commit, observe = the trunk's latest, release = the release commit. |

## Contracts

```text
ci-query.js CLI (changed):
  usage: ci-query.js (--branch <name> | --commit <sha>) [--root <dir>]
  exactly one of --branch/--commit; both or neither → usage error, exit 2
  --commit mode runs: gh run list --commit <sha> --limit 1 --json status,conclusion,headSha,url,updatedAt
  output JSON shape unchanged: {available, transient[, status, conclusion, sha, url, runAt]}
  Exit codes unchanged: 0 = answered either way · 2 = usage error

verdict.js (changed):
  RELEASE_LEGS = ['deploy','ready','e2e','journeys','substrate','production','ci']
  REVIEW_LEGS / REVIEW_BLOCKING: UNCHANGED (ci stays in both)
  release ledger row gains: "ci":"<the ci row's observed string>"  (omitted only if the row
  is missing — but a missing row already derives UNVERIFIED)

release.md ledger row schema (changed): …,"substrate":{…},"production":"…","ci":"<observed>"

doctor.md check 19 (new, advisory): gateCommand literal segments (split on {…}, trimmed,
  ≥10 chars) ⊆ concat(.github/workflows/*.yml,*.yaml); skip when no .github/workflows dir.
```

## Behavior

- **Review, the incident case:** reviewed worktree HEAD = `abc1234`, unpushed; branch's latest
  remote run is red on stale `571a6b3`. Old: leg exit 1, hard-stop, "fix CI first". New:
  `--commit abc1234` → gh returns `[]` → `{available:false,transient:false}` → leg
  `exit:0, observed:"unavailable"` → review proceeds; the verdict records the observation.
- **Review, genuine red:** a completed `failure` run exists for the reviewed HEAD itself →
  leg exit 1 → pre-panel hard-stop and GATE_RED derivation, exactly as today.
- **Release:** same mapping plus the bounded in-progress wait (30s × ≤10 min) and the
  mandatory ⚠️ report line whenever CI delivered no verdict on the release commit.
- **Fix-delta re-review:** unchanged wiring — the ci leg re-runs each iteration (review.md
  step re-run list), keyed to `{root}` HEAD each time. Because review-fix dispatches stay
  uncommitted until the Phase 3 close commit, that HEAD is the **same reviewed commit** every
  iteration — which is correct, not a gap: CI cannot have observed uncommitted edits, so the
  re-run's only honest job is re-asserting freshness of the reviewed commit's evidence. CI
  coverage of the close commit itself is owned downstream by observe-ci's default-branch red
  alarm and the release ci leg (refuter finding, adjudicated as boundary, recorded here).
- **Claims registry:** every new/edited blocking-consequence line in review.md/release.md
  carries `<!-- enforcedBy: spec/scripts/verdict.js -->`; check 19's finding line in doctor.md
  carries `<!-- enforcedBy: spec/commands/doctor.md -->`-style marker per the § Doctrine
  Authoring grammar (build worker applies the existing marker conventions; baseline updated
  via `node "$(spec-paths claims-lint)" --update-baseline` in the same batch).

## Acceptance Criteria

- **AC-20260810-07-1**: WHEN `ci-query.js --commit <sha>` runs and a fake `gh` records its
  argv and prints `[{"status":"completed","conclusion":"failure","headSha":"<sha>","url":"u","updatedAt":"t"}]`
  THE SYSTEM SHALL have invoked `gh run list --commit <sha> --limit 1 --json status,conclusion,headSha,url,updatedAt`
  and print `{"available":true,"transient":false,"status":"completed","conclusion":"failure","sha":"<sha>","url":"u","runAt":"t"}`
  with exit 0 → tests/review/ci-query.test.js
- **AC-20260810-07-2**: WHEN `ci-query.js --commit <sha>` runs and fake `gh` exits 0 printing
  `[]` THE SYSTEM SHALL print `{"available":false,"transient":false}` and exit 0 (the
  unpushed/never-seen-commit case — the Prax incident's shape) → tests/review/ci-query.test.js
- **AC-20260810-07-3**: WHEN ci-query.js is invoked with both `--branch` and `--commit`, or
  with neither, THE SYSTEM SHALL print the usage line to stderr and exit 2 →
  tests/review/ci-query.test.js
- **AC-20260810-07-4**: WHEN ci-query.js is invoked with `--branch <name>` THE SYSTEM SHALL
  CONTINUE TO produce the pre-change normalized output for all existing cases (gh absent →
  `{available:false,transient:false}`; gh non-zero without the no-remote message →
  `transient:true`; completed-run passthrough) — tag the three existing AC-20260805-02-10
  tests with this AC-ID → tests/review/ci-query.test.js
- **AC-20260810-07-5**: WHEN `verdict.js --profile release` reads a manifest whose seven legs
  `deploy, ready, e2e, journeys, substrate, production, ci` are all `exit:0` (ci row
  `observed:"conclusion=success"`) THE SYSTEM SHALL print `CLEAN` and the `--ledger` row SHALL
  contain `"ci":"conclusion=success"` — implemented by UPDATING the existing
  AC-20260805-02-8 six-green-legs test in place (add the ci row to its fixture; tag it with
  this AC-ID alongside its old one); its six-leg fixture otherwise regresses to UNVERIFIED
  the moment RELEASE_LEGS grows (refuter-demonstrated) → tests/review/verdict.test.js
- **AC-20260810-07-6**: WHEN `verdict.js --profile release` reads a manifest with the other
  six legs green but NO `ci` row THE SYSTEM SHALL print `UNVERIFIED` and exit 1 →
  tests/review/verdict.test.js
- **AC-20260810-07-7**: WHEN `verdict.js --profile release` reads a manifest whose `ci` row
  has `exit:1` THE SYSTEM SHALL print `GATE_RED` and exit 1 → tests/review/verdict.test.js
- **AC-20260810-07-8**: WHEN a review-profile manifest carries a `ci` row with `exit:1` THE
  SYSTEM SHALL CONTINUE TO derive `GATE_RED` and exit 1 even with a CLEAN workflow return —
  tag the existing AC-20260805-02-3 test with this AC-ID → tests/review/verdict.test.js
- **AC-20260810-07-9**: WHEN tests/review/verdict-doctrine.test.js pins release.md's
  required-legs sentence THE SYSTEM SHALL require all seven legs including `ci` (update the
  existing AC-20260805-02-7 enumeration regex; `ci` appended after `production` so existing
  adjacency windows survive, matched as `` `ci` `` with backticks or `\bci\b` — never a bare
  2-char `ci` inside an unanchored window, which any prose word containing "ci" satisfies) →
  tests/review/verdict-doctrine.test.js
- **AC-20260810-07-10**: WHEN verdict-doctrine.test.js pins review.md's ci-leg invocation THE
  SYSTEM SHALL require `--commit` fed by `rev-parse HEAD` and reject `--branch` anywhere in
  the ci-leg bullet (regex over the step-3 ci bullet: matches `--commit`, and the bullet
  contains no `--branch`) → tests/review/verdict-doctrine.test.js
- **AC-20260810-07-11**: WHEN tests/review/ci-gate-parity.test.js reads doctor.md THE SYSTEM
  SHALL find check 19 containing: the `.github/workflows` existence condition, the
  placeholder-split literal-segment substring rule with the ≥10-char floor, advisory severity,
  and a remedy naming the gateCommand; AND SHALL find a scaffold-ledger.md row registering the
  check with promote/retire conditions → tests/review/ci-gate-parity.test.js
- **AC-20260810-07-12**: WHEN ci-gate-parity.test.js reads release.md THE SYSTEM SHALL find
  the `ci` leg documented with: `--commit` keying, the observed enum
  (`conclusion=<value>`/`unavailable`/`in-progress`), the 30s/10-minute bounded in-progress
  re-poll, the mandatory ⚠️ no-verdict report line, AND the Phase-2 immediate-STOP
  enumeration extended to include a red `ci` row (the pre-promote short-circuit — without it
  a red release-commit run only surfaces post-promotion) → tests/review/ci-gate-parity.test.js

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ci-query.js | MODIFY | scripts | D1: `--commit` mode, exclusive-arg validation, header usage/why update |
| spec/scripts/verdict.js | MODIFY | scripts | D3/D4: RELEASE_LEGS + `ci`; release ledger row `ci` field |
| spec/commands/review.md | MODIFY | doctrine | D2: ci-leg bullet re-keyed to `--commit $(git -C {root} rev-parse HEAD)`; enforcedBy markers kept |
| spec/commands/release.md | MODIFY | doctrine | D4: Phase 2 ci leg, required-legs list, observed-format paragraph, ledger row schema |
| spec/commands/doctor.md | MODIFY | doctrine | D5: check 19 CI-gate parity |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D6: amend Verdict-derivation + Release-stage rows; one new check-19 row |
| tests/review/ci-query.test.js | MODIFY | tests | AC-20260810-07-1, AC-20260810-07-2, AC-20260810-07-3, AC-20260810-07-4 |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260810-07-5, AC-20260810-07-6, AC-20260810-07-7, AC-20260810-07-8 |
| tests/review/verdict-doctrine.test.js | MODIFY | tests | AC-20260810-07-9, AC-20260810-07-10 |
| tests/review/ci-gate-parity.test.js | CREATE | tests | AC-20260810-07-11, AC-20260810-07-12 |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump 6.50.0 → 6.51.0; description gains the per-SHA CI + check-19 clause |
| spec/doctrine/claims-baseline.json | MODIFY | other | `claims-lint --update-baseline` after the doctrine edits (review-check requirement) |

## Assumptions (escalation triggers)

- A1: `gh run list --commit <sha>` exists and returns `[]` exit 0 for a commit CI never saw —
  **EXECUTED 2026-08-10** against installed gh 2.93.0 in this repo: unpushed HEAD
  `f5f0029…` → `[]` exit 0; bogus 40-hex sha → `[]` exit 0; flag accepted, JSON fields
  identical to `--branch` mode. **if false** (a host's older gh rejects the flag): gh exits
  non-zero without the no-remote message → `transient:true` → review maps to exit 0
  informational — safe degradation, never a false block; note the gh-version remedy in the
  observed string only if this ever surfaces.
- A2: "CI never saw this commit" and "repo has no CI at all" are indistinguishable at the gh
  level (both `[]`) — both map to observed `"unavailable"`. **if false** (a host needs the
  distinction): a future `--probe` mode can ask `gh workflow list`; not this spec.
- A3: release may run against an unpushed HEAD (merge-back never pushes), so the
  `unavailable → exit 0 + ⚠️` mapping is load-bearing — fail-closed would brick CI-less and
  unpushed-flow hosts. **if false** (JJ rules release must refuse without a CI verdict): flip
  only release.md's mapping line for `unavailable`/`in-progress` to `exit:1`; script and
  verdict.js need no change.
- A4: the existing AC-20260805-02-3 red-ci test passes unchanged because ci stays blocking
  (D3) — the blast radius named in planning ("must split") dissolved once D3 landed; the
  release-side blast radius is real instead (AC-20260805-02-8's six-leg fixture, handled in
  AC-20260810-07-5). Baseline before this spec: 27/27 across the three touched test files
  (refuter-executed 2026-08-10). **if false** (the review test encodes branch-keying
  somewhere): update its manifest fixture only, never the assertion.
- A5: doctrine edits here change line counts in claims-scoped files, so the claims ratchet
  fires — the baseline row in the File Plan is mandatory, not optional. **if false** (line
  counts happen to balance): the baseline row becomes a no-op; harmless.

## Rationale

The incident: review's ci leg asked "latest run on this branch?" — a question whose answer
can be about any commit — and treated a red answer as evidence against this diff. Research
across AI-SDD tools (Devin, Codex, Copilot agent, Cursor, Kiro) and CI practice (GitHub
required checks, merge queues, the not-rocket-science rule, OpenAI's `workflow_run.head_sha`
autofix pattern) converged: inner loops stay local, CI verdicts bind per-SHA, and drift is
fixed by CI invoking the identical gate command, not by more checking. Hence D1/D2 (re-key),
D4 (authoritative boundary), D5 (root cause).

**D3 is the one deviation from the planning-session shorthand**, which said ci "leaves
REVIEW_BLOCKING": implemented literally, a genuine red-on-this-commit row would derive CLEAN
through verdict.js — the sole derivation — while only review.md prose hard-stopped it,
recreating the prose-asserted-verdict incident class the Verdict-derivation ledger row exists
to prevent. The ratified product behavior ("blocks ONLY on red conclusion for the reviewed
commit") is delivered exactly by D2's mapping + D3's retention. 📌 auto-picked; veto anytime —
the change would be one line in verdict.js plus splitting AC-8.

Release `unavailable → green + ⚠️` (A3) was auto-picked over fail-closed: release's own
executed legs are the primary evidence, CI there is a cross-check, and the human
promote-confirmation gate reads the ⚠️. Check 19 is advisory prose, not a script: a
substring check over YAML needs no new sole-derivation surface, and respelled-but-equivalent
CI commands make a blocking version false-positive-prone. One authoring note for the release
leg: the manifest row is appended exactly once, after the in-progress poll loop resolves —
never once per poll iteration (double rows would corrupt the leg map).

Adversarial check (2 refuters, T3): five findings, all accepted and folded — the release.md
STOP-enumeration gap (now D4 + AC-12), the AC-20260805-02-8 fixture regression (now AC-5),
the check-19 short-gateCommand degeneration (now D5's fallback rule), the unanchored `ci`
regex pin (now AC-9), and the unspecified placeholder-split boundary (now D5's literal
regex). One finding was adjudicated as a boundary rather than a defect: fix-delta iterations
re-assert the same reviewed commit because fixes are uncommitted until close — recorded in
Behavior with the downstream owners (observe-ci, release) named. Nothing was rejected.

Build deviation (2026-08-11, folded at review close): the File Plan's literal bump target
6.51.0 was already taken at HEAD — concurrent specs landed 6.51.0/6.52.0 first — so the build
bumped to the next free version, 6.53.0, with the same changelog clause. One-off application
of the recorded version-race gotcha (pipeline rules § Gotchas: bump targets are targets, not
pins); no new doctrine needed.

## Canonical Delta

None — `docs/canonical/` does not exist in this repo; the plugin's own doctrine files are the
canonical surface and are edited directly by this spec.
