---
date: 2026-08-05
status: done
open_markers: 0
risk: T3
area: status
design: false
breaking: false
depends_on: [02-review-evidence-manifest.md]
depended_on_by: [04-intake-class-discipline.md]
brief: n/a
spiked: 2026-08-05
---

# done-unobserved — the pipeline owns the post-verdict window

## Goal

Nothing owns the time between `/spec:review` flipping a spec to `done` and the first CI run
on the landed code — the window where the confirmed 2026-08 escape lived undetected for
days. This spec gives `done` a derived sub-state: a spec is **done-unobserved** until a CI
run *that verifiably contains the spec's close commit* is recorded in the run ledger. A new
`observe-ci.js` (built on spec 02's `ci-query.js`) performs the observation at the next
pipeline invocation (no daemon); `spec-status.js` derives and renders the sub-state; a red
observation turns the dashboard headline red and becomes the top `--next` pick — a
`/spec:escape` entry carrying its evidence, shaped for both humans and the autopilot
oracle. CI-less hosts resolve observations instantly and see zero noise. Done means: a
green dashboard can no longer coexist with a silently red run of the landed code — and the
mechanism can never stamp a spec green on evidence for code it doesn't contain.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New ledger stage `observe`: `{"ts","stage":"observe","spec","branch","ci":"green|red|none","sha","url","runAt"}` (`sha`/`url`/`runAt` null on `ci:"none"`), appended only by `spec/scripts/observe-ci.js`. Doctor check 12's stage enum gains `observe`. | The ledger is the append-only event stream every derivation reads; `url`/`runAt` make the row self-evidencing (the escape path and the latest-row rule both need them). |
| D2 | Qualifying rows for a spec = its `stage:"observe"` rows appearing after its latest `stage:"review"` row, read across the live ledger AND year archives (`.claude/spec-runs*.jsonl`, filename order then line order). Pending = `done` + zero qualifying rows. State = the qualifying row with the greatest `runAt` (tie → red wins). | Archives must count or archiving a red row silently launders it (refuter finding); `runAt`-max (not line order) is deterministic across union-merged worktree histories, where append order tracks merge order, not time (refuter-executed demonstration). |
| D3 | `observe-ci.js [--root <dir>] [--json]`: candidate set = done specs that are pending OR currently red (red stays under watch until a newer qualifying run clears it). Per candidate: resolve `branch` (spec's `build_base`, else `git symbolic-ref refs/remotes/origin/HEAD`, else current branch — symbolic-ref exits 128 when origin/HEAD was never set, an observed common state, not an error); query `node "$(spec-paths ci-query)" --branch {branch}` at most ONCE per distinct branch per run (in-run cache). Outcomes: structural unavailability (`available:false, transient:false` — no gh, no remote, no runs) → append `ci:"none"` (observation completes; CI-less hosts resolve silently); transient failure (`available:false, transient:true` — gh executed and errored) → append NOTHING, print one ⚠️ line (stays pending — a token blip must not permanently silence observation); run not completed → append nothing; completed → D4 validity check, then append green/red. Never append a row identical (same `sha` + `ci`) to the spec's current latest qualifying row — idempotent. Exit 0 = ran, 2 = usage, 4 = refused (CWD inside `.claude/worktrees` — observation writes happen at root only, per the merge-back exit-4 precedent). | The transient/structural split is the refuter-found silent-window regression; the red-stays-watched rule lets an externally-fixed branch clear to green; exit-4 kills the divergent-worktree double-write class at the source instead of tolerating it at merge. |
| D4 | Validity: an observed run counts for a spec only if the run's commit contains the spec's close commit — `closeSha = git log -1 --format=%H -- {spec path}` (the review close commit edits the spec file's status), then `git merge-base --is-ancestor {closeSha} {run.sha}`. If `run.sha` is locally unknown (`git cat-file -e` fails), one `git fetch origin {branch}` then re-check. Unknown or not an ancestor → append nothing (stays pending). | Merge-back never pushes (review.md:281) — the branch's latest run routinely predates the close, and without ancestry the mechanism stamps specs green on code the run never tested (refuter finding 1, the worst false-green in the series); "unpushed = unobserved" is the honest state. |
| D5 | `spec-status.js` derivation + render: `done`+pending → `done ⏳ unobserved` (lane summary `⏳ n unobserved`); red → `🔴 done-but-red` per-spec line (branch, sha, run url inline) AND the dashboard **headline glyph turns 🔴** (a red observation is a dashboard-level alarm, not a lane detail) AND `--next` emits the top pick as a full oracle-shaped entry `{action:"/spec:escape", path:{spec}, status:"done", brief, blockers:[], parallel:false, parallel_reason:null, note:"CI red on {branch} @{sha} — {url}"}`; green/`none` → plain done. The sub-state never blocks `depends_on` satisfaction. Escape entries rank above every other action; while one exists, the all-specs-done → plan-next-brief branch is suppressed (escapes outrank new planning). Escape entries are excluded from the ⚡ parallel-lane fan-out (they are not worktree build work). | Escapes-in-waiting outrank new work; the full entry shape (pinned by tests/autopilot/lane.test.js:70) with `blockers:[]` and an evidence-bearing `note` is what keeps the autopilot lane from crashing on — or blindly dispatching — an entry it can't act on (blind-spot finding). |
| D6 | `spec-status.js` reads the ledger files offline only (absence = no pendings; network lives solely in `observe-ci.js`); its header consumer list and `--next` mapping comment are updated in the same edit (autopilot's `lane.js` is added as a named consumer — it was already consuming `--next --json` undocumented). | The viewer stays instant and deterministic; the header comment is that file's authoritative contract doc and silently drifting it is the exact class this series retires. |
| D7 | Invocation points (no daemon): `/spec:status` runs `observe-ci` before the derivation script; `/spec:review` runs it once in Phase 4 AFTER merge-back has relocated to root (observing previously-closed specs; the just-closed spec becomes pending now and is observed at the next invocation). `observe-ci` is NOT an evidence-manifest leg: it appends to the run ledger only, never to spec 02's manifest, and never feeds `verdict.js`. | Root-only, post-merge-back placement plus D3's exit-4 guard means no worktree ever writes observe rows; the manifest/ledger distinction is stated because both specs edit review.md's phases and "leg" is otherwise ambiguous (refuter finding). |
| D8 | `escape.md` gains the red-observation entry path: invoked on a spec whose latest qualifying observe row is red, the session derives its evidence from that row (branch/sha/url), reads the run first (`gh run view {url}`), and — if the failure does not implicate this spec (its File Plan files or landed behavior) — records NO escape and stops, naming the implicated surface instead; the red clears only when a newer green qualifying run is observed. `docs/canonical/autopilot.md`'s oracle contract adds `/spec:escape` to the action set with this evidence flow. | Without a derive path, the top pick is a dead-end interview and a false-escape generator against healthy specs on shared branches (both refuters); the canonical autopilot doc otherwise goes stale the day this ships (blind-spot finding). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/observe-ci.js | CREATE | scripts | D3/D4; consumes `ci-query.js` (spec 02); header + exit codes (0/2/4) per Worker Rules |
| spec/scripts/spec-status.js | MODIFY | scripts | D2/D5/D6 derivation, render, --next escape entry, header consumer list |
| spec/bin/spec-paths | MODIFY | scripts | add `observe-ci` key + usage line |
| spec/commands/status.md | MODIFY | doctrine | run observe-ci before the derivation script |
| spec/commands/review.md | MODIFY | doctrine | one Phase 4 post-merge-back observe step (D7) |
| spec/commands/escape.md | MODIFY | doctrine | D8 red-observation derive path (incl. the no-escape-if-unimplicated stop) |
| spec/commands/doctor.md | MODIFY | doctrine | check 12 stage enum + observe-row hygiene sentence (archive-aware) |
| docs/canonical/autopilot.md | MODIFY | doctrine | oracle action set gains `/spec:escape` + evidence-note contract |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | advisory row: observation window, promote/retire condition |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | bump 6.41.0 + description line |
| tests/status/observe-ci.test.js | CREATE | tests | AC-20260805-03-1 … AC-20260805-03-4, AC-20260805-03-8, AC-20260805-03-9, AC-20260805-03-10 |
| tests/status/done-unobserved.test.js | CREATE | tests | AC-20260805-03-5, AC-20260805-03-6 |
| tests/spec-status.test.js | MODIFY | tests | AC-20260805-03-7 (CONTINUE TO pins) |
| tests/autopilot/lane.test.js | MODIFY | tests | AC-20260805-03-11 (lane consumes an escape entry without special-casing) |
| tests/spec-paths.test.js | MODIFY | tests | pin the new `observe-ci` key |

## Contracts

```
observe row:    {"ts":"YYYY-MM-DD","stage":"observe","spec":"specs/…/01-x.md","branch":"main",
                 "ci":"green|red|none","sha":"<sha>"|null,"url":"<run url>"|null,
                 "runAt":"<ISO>"|null}
observe-ci.js:  [--root <dir>] [--json]  · exit 0 ran / 2 usage / 4 refused-in-worktree
                --json → {"observed":[{spec,ci}],"pending":[spec],"skipped":[{spec,why}]}
spec-status:    --json spec entries gain "observation":"pending|green|red|none|n/a"
                (n/a = spec not done); --next escape entries carry the FULL entry shape
                {action,path,status,brief,blockers,parallel,parallel_reason,note}
```

## Behavior

- Test seam (sanctioned mode 1): tests exec `observe-ci.js` against a synthetic host in
  `tmpdir()` with a fake `gh` shell script prepended to `PATH` printing canned JSON (and,
  for invocation-count ACs, appending to a counter file) — zero network in the suite; the
  ancestry fixtures are small real git repos built by the test (close commit → descendant
  commit), which is what `runBash`/`gitRepo` helpers exist for.
- Output: one line per outcome (`📡 observed {spec}: {ci}`), one ⚠️ per transient skip,
  silent when nothing is pending.
- Multiple done specs, one branch: one cached `ci-query` result may complete several
  observations (rows per spec, same sha) — per-branch query, per-spec rows.
- `git fetch origin {branch}` runs at most once per branch per run, and only when a run sha
  is locally unknown (D4) — a no-remote host never fetches (it never reaches D4; structural
  unavailability already resolved it).
- Doctor check 12 addition: observe rows are exempt from the build/review required-field
  expectations (no `tier`/`runId`); hygiene checks (parse, stage enum, line length,
  git-tracked) apply unchanged.

## Acceptance Criteria

- **AC-20260805-03-1**: WHEN a pending done spec's branch reports a completed successful
  run whose commit contains the close commit THE SYSTEM SHALL append `ci:"green"` with the
  run's sha/url/runAt (fixture: closeSha=C1, fake gh headSha=C2 where C2 descends from C1 →
  row `"ci":"green","sha":"C2"`) → exec test in tests/status/observe-ci.test.js
- **AC-20260805-03-2**: WHEN the run concluded failure/timed_out/cancelled (and passes the
  same ancestry check) THE SYSTEM SHALL append `ci:"red"`; WHEN the run is not completed
  THE SYSTEM SHALL append nothing → exec test in tests/status/observe-ci.test.js
- **AC-20260805-03-3**: WHEN unavailability is structural (no gh on PATH / `[]`) THE SYSTEM
  SHALL append `ci:"none"` with null sha; WHEN gh executes but exits non-zero THE SYSTEM
  SHALL append nothing and print a ⚠️ line naming the spec (transient — stays pending)
  → exec test in tests/status/observe-ci.test.js
- **AC-20260805-03-4**: WHEN the observed run's commit does NOT contain the close commit
  (or is locally unknown after one fetch attempt) THE SYSTEM SHALL append nothing (fixture:
  headSha=C0 an ancestor of closeSha → no row, spec stays pending) → exec test in
  tests/status/observe-ci.test.js
- **AC-20260805-03-5**: WHEN a done spec has no qualifying observe row THE SYSTEM SHALL
  render done-unobserved and report `"observation":"pending"`; WHEN its latest qualifying
  row (by `runAt`) is green or `none` THE SYSTEM SHALL render plain done — including when
  an older red row exists (green `runAt` newer → green wins) → exec test in
  tests/status/done-unobserved.test.js
- **AC-20260805-03-6**: WHEN a done spec's latest qualifying row is red THE SYSTEM SHALL
  (a) turn the dashboard headline glyph 🔴, (b) emit the `--next` top pick
  `{action:"/spec:escape", path, status:"done", brief, blockers:[], parallel:false,
  parallel_reason:null, note}` with branch/sha/url in `note`, above every build/review
  action, and (c) suppress the all-done→plan-next-brief branch while it exists → exec test
  in tests/status/done-unobserved.test.js
- **AC-20260805-03-7**: WHEN `.claude/spec-runs.jsonl` is absent THE SYSTEM SHALL CONTINUE
  TO derive and render every existing status, `--next` pick, and `--brief` result unchanged
  (tag existing covering tests; green pre-change — sanctioned pin exception) →
  tests/spec-status.test.js
- **AC-20260805-03-8**: WHEN two pending specs share a branch THE SYSTEM SHALL invoke the
  ci query exactly once for that branch in one run (fake gh counter file reads 1; two rows
  appended) → exec test in tests/status/observe-ci.test.js
- **AC-20260805-03-9**: WHEN CWD is inside `.claude/worktrees/…` THE SYSTEM SHALL exit 4
  writing nothing, with the remedy (run from the repo root) in the message → exec test in
  tests/status/observe-ci.test.js
- **AC-20260805-03-10**: WHEN a second run observes the identical run state (same sha, same
  conclusion) THE SYSTEM SHALL append no duplicate row → exec test in
  tests/status/observe-ci.test.js
- **AC-20260805-03-11**: WHEN the autopilot lane's oracle returns an escape entry THE
  SYSTEM SHALL CONTINUE TO pick and dispatch it through the existing generic path (no
  special case, no crash — the entry shape carries everything `pickFrom` reads) → extend
  tests/autopilot/lane.test.js (tag with this AC-ID)

## Assumptions (escalation triggers)

- A1: gh CLI evidence **executed 2026-08-05** in this repo: `gh run list --branch main
  --limit 1 --json status,conclusion,headSha,url,updatedAt` → `[]` exit 0 (fields valid;
  CI-less repo yields the structural-unavailability path, so this repo's own specs resolve
  instantly as `ci:"none"`). **if false:** none — this is observed, not guessed.
- A2: `git symbolic-ref refs/remotes/origin/HEAD` → `refs/remotes/origin/main` exit 0 here
  (executed), but exits 128 wherever origin/HEAD was never set — an ordinary state
  (refuter-reproduced in a scratch clone), handled by the D3 fallback chain; a wrong branch
  guess yields `none`/pending, never an invented green/red.
- A3: The review Phase 3 close commit always touches the spec file (the `status: done`
  flip), so `git log -1 --format=%H -- {spec}` identifies it. **if false** (a host
  committing the flip separately): the derived closeSha is an ancestor of the true close —
  the ancestry check then errs toward accepting slightly-older runs; mitigated because the
  close commit and code merge land in one merge-back; if a real false-green is ever traced
  here, record the close sha explicitly in the review ledger row instead (needs spec 02's
  row schema — escalate, don't improvise).
- A4: `ci-query.js` exists with the D4-of-spec-02 contract (this spec `depends_on` 02).
  **if false:** blocked — build order violation, stop.
- A5: The autopilot lane treats all non-`/spec:plan` actions generically
  (`lane.js:213-236`, verified by the blind-spot sweep) and its entry-shape pin is
  tests/autopilot/lane.test.js:70. **if false:** the lane gains a generic pass-through fix
  in the same diff — never an action special-case.
- A6: Reading `.claude/spec-runs*.jsonl` (live + archives) via substring prefilter keeps
  the dashboard instant. **if false:** parse only `"stage":"observe"|"review"` lines.

## Rationale

This is the narrow version of "own the post-merge window": observation, not remediation —
record what CI actually said about code that verifiably contains the landed change, and
route red to the existing escape machinery with its evidence attached. The first draft had
four real holes the refuter round exposed, all now load-bearing decisions: ancestry
validation (a branch's latest run routinely predates an unpushed close — observing it was
the false-green twin of the escape this series answers), the transient/structural
unavailability split (a token blip must not permanently buy silence), `runAt`-max instead
of append order (union merges reorder), and archive-aware reads (archiving must not
launder a red). The blind-spot sweep added the autopilot oracle as an undocumented
consumer — the escape entry now ships oracle-shaped with its evidence in `note`, escape.md
gains the derive-from-row path with an explicit no-escape-if-unimplicated stop (false
escapes against healthy specs on shared branches were otherwise guaranteed), and the
canonical autopilot doc updates in the same spec. The daemon alternative stays rejected
(no resident processes; autopilot exists for hosts that want push). Watch during
execution: `spec-status.js` is a declared T3 sole-derivation surface — the AC-7 CONTINUE
TO net stays green at every step; review.md is touched by 01, 02, and this spec — strict
dependency-order builds.

Adversarial-check dispositions (2026-08-05, two refuters + blind-spot sweep): FIXED — all
of: archive laundering (D2), stale/unlinked run evidence (D4 ancestry), transient-gh
permanence (D3), worktree double-write (D3 exit-4 + D7 root-only), escape dead-end/false
escapes (D8), `--next` oracle entry shape + lane crash risk (D5, AC-11), headline glyph
(D5), leg-terminology ambiguity (D7), per-branch cache untested (AC-8), branch-derivation
wording (A2). REJECTED — "distinguish which spec on a shared branch caused the red": the
observation layer cannot attribute blame and must not guess — attribution is exactly the
triage D8 routes to the escape session, which reads the failing run with full context.

Review dispositions (2026-08-06, iteration 1 FINDINGS → iteration 2 CLEAN): WAIVED —
out-of-plan `docs/roadmap/00-overview.md` + `01-claims-registry.md` (pre-existing untracked
roadmap work stream, not this spec's scope; same class waived in the two prior reviews).
FIXED — D2's qualifying-row algorithm existed in two copies (spec-status.js +
observe-ci.js); extracted to `spec/scripts/lib/observation.js`, both scripts now require it.
FIXED — doctor check 12's `observe` enum addition was unpinned; full five-value enum regex
pin added to tests/run-ledger.test.js per the AC-20260805-02-8 precedent.

## Canonical Delta

docs/canonical/status.md (create if absent): "`done` carries a derived observation
sub-state from `stage:"observe"` ledger rows (written by `observe-ci.js` — root-only,
ancestry-validated against the spec's close commit, transient failures never resolve):
pending until a containing run's outcome is recorded; the latest-`runAt` qualifying row is
the state; red turns the dashboard headline 🔴 and outranks all other `--next` picks as an
oracle-shaped `/spec:escape` entry carrying branch/sha/url; `ci:"none"` completes
observation only on structurally CI-less hosts."
