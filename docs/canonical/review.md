# Review — canonical decisions

- Review scope is derived, not predicted: the reviewer diff is unscoped from base;
  `scope-reconcile.js` reconciles it against the File Plan; out-of-plan files are hard
  findings and reviewed content; `pipelineOwnedPaths` (config, additive over `specs/**` +
  the run ledger) is the only sanctioned exclusion. (specs/20260805/01-review-scope-reconciliation.md)
- A rename's new path is in-plan only when its old path was planned (or pipeline-owned);
  an unplanned file's rename is an ordinary out-of-plan hard finding, still reported in
  `renamed` for visibility. (same spec, review fix 2026-08-06, AC-20260805-01-9)

- The verdict word and the ledger row are both emitted by `verdict.js` from the
  per-iteration evidence manifest (fresh mktemp file; legs re-executed each iteration) +
  reviewer return + dispositions; survivor counts come from the return file, never flags;
  `UNVERIFIED` = required leg missing, `GATE_RED` = blocking leg red; only `gate`/`smoke`/`ci`
  block — `reconcile`/`ac-matrix`/`skip-reconcile`/`at-risk`/`promise-sweep` emit
  dispositionable findings; CI status
  flows through `ci-query.js` — red blocks pre-reviewer, unavailable
  never blocks; verdict.js exit 0 is the only door to Phase 3 close.
  (specs/20260805/02-review-evidence-manifest.md, done 2026-08-06)

  Findings legs are counted, not just colored: every red non-blocking manifest row
  contributes its typed finding count (`observed`'s per-leg count field; floor 1 when that
  field is absent or non-numeric) to the undispositioned pool beside reviewer survivors, and
  `CLEAN` is unreachable until dispositions cover the whole pool — leg findings are always
  hard. **Manifest row v2** is `{"leg","exit","observed"}` where `observed` is always a
  non-null JSON object drawn from the Contracts closed set; any row whose `observed` is a
  string, an array, null, or absent makes the manifest invalid and derives `UNVERIFIED` in
  both profiles — an old-format row is loudly underivable, never silently misread. verdict.js
  holds no packed-string parser: it reads typed fields and copies `observed` objects verbatim
  into ledger leg rows and release keys, so a structurally-absent observation
  (`{"unavailable":"pattern-no-match"|"no-format-declared"}`) is permanently distinguishable
  from a pass and can never be coerced to zero.
  (specs/20260820/06-typed-evidence-manifest.md, done 2026-08-21) Review rows always carry
  `runId` (orchestrator-passed, else generated `rv_`+12hex by verdict.js) — the backlink
  `/spec:escape` correlates on. Build rows count `deviations` as sidecar entries (`^- `
  lines) and `diff.loc` as insertions+deletions, matching review.
  (specs/20260818/01-ledger-truth.md)

  Every authoritative review verdict also retains its evidence: verdict.js requires
  `--retain .claude/spec-runs` alongside `--ledger --workflow` and writes
  `.claude/spec-runs/<runId>.json` — the manifest legs untruncated plus the reviewer's
  survivors/killed with their executed repro evidence verbatim. The artifact rides the close commit in an
  in-place review; in a linked-worktree review the ledger and retained evidence are written
  under the worktree, EXCLUDED from the close commit, and promoted (deduped) into the main root
  only once a merge has actually landed — writing them straight to the main root at close time
  dirties it before `merge` runs and trips `assert_clean_root`/`ff-only`, and committing them
  from the worktree makes `git worktree remove` refuse cleanup after the merge already landed.
  The exception is terminal-red evidence: a worktree review's `RED_BLOCKING` hard-stop appends
  its `GATE_RED` line to the gitignored `<main root>/.claude/spec-runs.stopped.jsonl` at the
  moment of the stop (self-provisioned via git's `info/exclude` when the host lacks the ignore
  line), so a stopped attempt survives an abandoned or force-removed worktree; every ledger
  reader union-merges `spec-runs*.jsonl`, and the rows are drained into the tracked ledger —
  positioned before the close row — when that spec later closes CLEAN, in-place or via merge
  promotion. (specs/20260821/04-stopped-row-durability.md)

  A third `fix-applied` (the iteration cap) appends an **escalate row** at the moment of the
  refusal: an honestly-derived non-CLEAN verdict carrying `escalated: true`, minted by
  `verdict.js` behind `--escalated` with `--fixDispatched 0` (the dispatched fix never landed;
  a derived CLEAN under `--escalated` is refused as evidence drift — never printed). In a
  worktree it lands durably in the main root's gitignored `spec-runs.stopped.jsonl` exactly
  like a hard-stop row, drains into the tracked ledger at close/promotion, and is permanent
  evidence — a capped attempt is never invisible. The waive/reject exit still closes normally;
  its close row lands after the escalate row and remains the observation join's key.
  (specs/20260822/01-escalate-ledger-row.md)

  `/spec:escape` derives `killedMatch` from it. (amended by specs/20260820/07-review-driver.md,
  2026-08-21) Plan locks
  append a `stage:"plan"` ledger row of executed facts (spike count, promise-sweep
  counters, collision counts). The escape ledger and replay catch-rate are the pipeline's
  two ground-truth signals; self-reported review quality is subordinate to both.
  (specs/20260819/01-review-evidence-retention.md)

  Reviewer catch-rate is measured, not assumed: every 5th review (and at least once per
  major version) `/spec:replay` injects one corpus-class defect into the last CLEANed
  spec's tree in a marker-guarded scratch worktree, re-runs the legs, and dispatches the
  standard reviewer blind; the run lands as a `stage:"replay"` ledger row with retained
  evidence, and `replay.js --stats` derives the catch-rate. Outcomes are
  `caught`/`missed`/`leg-caught`/`unresolved`/`setup-failed`. Scoring is never a
  self-reported point: survivors are compared against the mutation patch's own hunks —
  caught when a survivor names any mutated file within ±5 lines of one of its hunks. Only
  `caught`+`missed` enter the catch-rate; a non-measurement outcome (`unresolved`,
  `setup-failed`) is visible in the totals, absent from the rate, and leaves the harness
  due, so the next review session retries rather than waiting five more.
  Cadence is `replay.js --due` policy (every 5th review, at least once per major version) and
  execution is review's own close: the review driver's REPLAY state, between MERGE and DONE,
  runs the dueness and selection checks itself and refuses to conclude the review until a
  `stage:"replay"` row for the selected target exists. Any outcome concludes the state;
  non-measurement outcomes leave the harness due and retry at the next review. REPLAY never
  re-derives or gates the review verdict — CLOSE has committed and MERGE has concluded before
  it runs, so it measures the reviewer while the verdict measures the diff. `/spec:replay`
  remains the manual and retry surface. The printed-advisory form it replaces was tried and
  measured to fail: shipped 2026-08-19, due at 5 reviews, skipped through 12+ reviews in ~48
  hours.
  A sustained miss-rate is the evidence that reopens the second-reviewer question.
  The scratch worktree lives at `<root>/.claude/worktrees/replay-<id>` — inside the repo, so
  agent edits are auto-approved and the scheduled replay runs unattended (an out-of-repo scratch
  tree is denied Edit/Write by the permission classifier, which blocked the mutation worker on
  both live runs of 2026-08-23). It stays invisible to `git status` via an ignore line
  `--setup` self-provisions into `info/exclude` when the host repo lacks it. Isolation comes
  from the detached worktree, that ignore line, and the private-git-dir marker — not from living
  outside the repo; a `--dir` outside the repo remains the manual fallback.
  The mutation worker's writes are sanctioned by the cross-worktree write guard: a write is
  allowed when the TARGET tree carries the `replay-worktree` marker, honoured only when that
  marker sits in a linked worktree's private git dir. The scratch tree is a sink, never a
  source — scratch-anchored writes outward stay blocked — and a write into this repo's own
  git metadata is attributed to its owning worktree and blocked unless that owner is the
  writing session's own tree, so the marker cannot be forged through the tool surface the
  guard governs.
  `--select` emits a pinned, ancestry-validated sha as the replay's diff base — a spec's
  symbolic `build_base` is stale the moment the review's own merge lands — sourced from the
  `diff_base` the review driver stamps into the spec frontmatter at every `status: done` flip.
  A spec closed before stamping existed, whose base no longer validates, is refused (exit 4)
  rather than measured against a distorted diff.
  (specs/20260819/02-mutation-replay.md, specs/20260819/03-replay-first-run-fixes.md,
  specs/20260820/02-replay-scratch-write-access.md,
  specs/20260821/02-replay-review-phase.md,
  specs/20260823/05-replay-unattended-hardening.md)

- `ac-matrix`'s coverage denominator fails closed: an AC bullet no ID grammar can parse counts
  as **uncovered** — unparseable = unknown, never absent — in both drift modes, since a host
  `driftScript` cannot parse a malformed bullet either. The `malformed-ac` hard finding is
  unchanged and never doubled by a second `uncovered-ac` row; the leg's observation is the
  typed object `{"uncovered":N,"oracle":N}` (and skip-reconcile's `{"skipped":N,"sanctioned":N}`),
  mirrored byte-for-byte by `--json`'s `observed` field.

- Skip sanctions resolve on the **spec under review's** bullet when it declares that AC (a hit
  is final, with or without `[env:]` — a re-declared bullet that dropped its gate is
  authoritative), else from the AC's **owning spec**, derived mechanically from the AC-ID
  grammar `AC-{YYYYMMDD}-{NN[a-z]?}-{k}` → the single file matching `^{NN[a-z]?}-.*\.md$`
  under `specs/{YYYYMMDD}/`. Every edge fails closed to `unsanctioned-skip` naming the edge
  that fired: date dir absent, zero or ≥2 filename matches, unreadable, no AC section, AC not
  found, or found without `[env:]`. A cross-spec sanction counts as `sanctioned` and names its
  declaring file in the warning. The per-file read is cached; the **per-AC-ID resolution never
  is** — caching the resolution let two skipped ACs sharing one owning spec answer for each
  other, silently sanctioning an ungated AC in one order and falsely flagging a gated one in
  the other (found by retainer consult at this spec's own review, 2026-08-16).
  (specs/20260815/03-ac-matrix-fail-closed.md, done 2026-08-16)

- The Phase 0 leg inventory carries **`at-risk`**: required on full scope, skipped on
  fix-delta (mirroring `reconcile`), never blocking. `scope-reconcile.js` derives it as an
  additive `atRisk` field — path-stem matching, deliberately language-agnostic — naming the
  test files outside the spec's File Plan whose content references a changed source file;
  review then **runs** them via the host's `testCommand` and turns failures into ordinary
  dispositionable findings. Listing alone was rejected: a listed-only at-risk file is how the
  founding escape survived two process layers. Stems must discriminate — never the empty
  string (a root dotfile strips to `''` and matches every candidate) and never a bare
  single-segment basename; the full repo-relative path always survives so a root-level file
  stays matchable. (specs/20260815/02-at-risk-pins.md, done 2026-08-16; the stem-degeneracy
  clause added by that spec's own review, AC-20260815-02-15)

- The promise sweep's **deterministic half** lives in `promise-sweep.js` — run manifest-less at
  plan lock and in every review scope (full AND fix-delta) by `review-legs.js`. It reads only
  the spec text: it enumerates the `## Decisions` table's non-struck rows and hard-flags any row
  (`orphan-decision`) lacking a carrier — an AC-ID declared in this same spec's Acceptance
  Criteria, anchored full-token match — or a `[no-ac: <reason>]` sanction with a non-empty
  reason. Foreign AC citations are not carriers and raise no finding of their own; an orphan's
  detail lists them so a same-spec typo is visible. `promise-sweep` is required-but-non-blocking
  in both scopes: an absent row derives `UNVERIFIED`, a red row rides the findings disposition
  and never `GATE_RED`. The reviewer retains only the **semantic half** — verifying that a
  carried Decision's cited AC/test actually asserts the promised behavior, executing
  config/override/flag promises with the override set, and treating a false `[no-ac:]` as hard.
  Behavior-section prose is deliberately not enumerated (JJ ruling 2026-08-17); the first escape
  traced to a Behavior-only promise reopens that call. AC parsing is shared with `ac-matrix.js`
  through `spec/scripts/lib/spec-sections.js` — one authority for the AC-ID grammar and section
  extraction. Critical tier adds review capacity only as **named scoped legs** wired via
  `verdict.js --require` (host rules § Review Checks), never a second general reviewer —
  reviewer agreement is measurably not a correctness signal (core.md § Tiers).
  (specs/20260817/07-promise-sweep-leg.md, done 2026-08-18)

- The boot smoke leg certifies **both halves of a process life**: exit 0 now means "boot
  observed ready AND stopped cleanly on the declared stop signal." After readiness (and any
  `--seed` run), `smoke.sh` sends `runtime.stopSignal` to the boot process group, polls
  liveness for `runtime.stopTimeout` seconds (optional, default 30), then `wait`s and requires
  the exit status to be in `runtime.stopExitCodes` (optional, default `[0]`). A process that
  ignores the signal is SIGKILLed and fails as `__SMOKE_FAIL__ shutdown-hung`; one whose
  status falls outside the declared set fails as `__SMOKE_FAIL__ shutdown-unclean` — both
  **exit 6**, which rides `verdict.js`'s existing non-zero-non-4 red-smoke semantics unchanged
  (blocking leg, pre-panel hard stop, `smoke: "fail"` in the ledger). The default `[0]`
  deliberately rejects 128+signum: status alone cannot distinguish a deliberate
  re-raise-after-cleanup from a default-action death, and the default-action death is the
  recorded escape — a host using the re-raise idiom declares `stopExitCodes: [143]`. The
  signal was already being sent from the EXIT trap, where the verdict was already fixed; the
  change is claiming the observation, not adding a probe. Declared-inert hosts (exit 4), hosts
  with no runtime block (exit 3), and boots that never reach ready (exits 1/2) never enter the
  shutdown block. A dedicated post-stop `runtime.stoppedCheck` probe was deliberately deferred:
  re-running `readyCheck` after exit false-passes for the common file-probe form, and an
  assertion that cannot fail is worse than none.
  (specs/20260815/04-runtime-shutdown-leg.md, done 2026-08-16; INTAKE JJ-20260815-05)

- The review stage is a **stepped program**, not prose choreography: `spec-review-driver.js`
  owns the sequence (LEGS -> SKIPS? -> REVIEWER -> DISPOSITIONS -> FIX/ESCALATE? -> CLOSE ->
  MERGE/CONFLICTS -> DONE, with STOPPED terminal on `RED_BLOCKING`) and is the sole invoker of
  `review-legs.js`, `verdict.js`, `merge-back.sh`, `replay.js`, and `spec-status.js` within the
  stage. It EXECUTES every deterministic step itself — base derivation, the per-iteration
  manifest lifecycle (`<spec>.review/manifest-<n>.jsonl`, never reused), all three `verdict.js`
  passes, both ledger appends, the `implementing → done` flip, the merge-back sequence — and
  PRINTS exactly one step at a time for what needs judgment: reviewer + design-leg dispatch,
  dispositions, the Canonical Delta + deviations fold, the close commit, merge strategy,
  conflict resolution. `review.md` is the judgment shell that hosts those conversations; the
  driver never recommends a disposition, never picks a merge strategy, and never renders a
  user-facing report. Marks are a closed, artifact-verified set — state is re-derived from
  frontmatter + sidecar + on-disk artifacts on every invocation, a mark whose artifact vanished
  is demanded again, and the fix-iteration cap (2) is counted from manifest files present, so
  hand-editing the sidecar cannot reach ESCALATE. The `<spec>.review/` sidecar is scratch: never
  committed, deleted at DONE — everything that must outlive the run already lives in
  `.claude/spec-runs`. Every child process the driver spawns runs through one fail-closed
  helper: `spawnSync` returning no exit code (signal death, spawn failure, maxBuffer overflow)
  is refused with exit 2, never read as success — a killed leg runner that wrote no manifest
  must never present as green legs, and a reported-green legs run with no parseable manifest
  rows is refused too (found at this spec's own review, 2026-08-21; executed repro plus a
  negative control against the pre-fix driver). Two mechanisms were retired rather than carried
  as debt: the frozen-base check + detached review worktree (attributing foreign hunks to their
  owning spec covers both the moved-HEAD case it targeted and the interleaved-concurrent case it
  structurally cannot see), and the `done`-spec re-run — a re-review recorded no run at all, so
  a `done` spec whose sidecar lacks this run's own `closeRunId` is refused naming `/spec:escape`,
  the command that exists for defects escaping a review that already passed.
  (specs/20260820/07-review-driver.md, done 2026-08-21)

- **The merge step is re-entrant, and promotion leaves the worktree clean.** A worktree
  review's merge-back sequence can fail mid-promotion; the retry must not deadlock on its own
  landed work. The driver therefore derives containment before acting — when the source branch
  is already fully contained in the target (`git rev-list --count target..source` = 0, or the
  branch is already gone) it skips the `merge-back.sh merge` invocation entirely and resumes at
  promotion/cleanup, both of which are idempotent. `assert_clean_root` and the first-merge path
  are untouched: promotion dirties the main root BY DESIGN (the promoted evidence is committed
  later, at the session's close), so re-running the clean-root assert after a landed merge
  asserts against a state the design guarantees. Evidence promotion likewise **restores** the
  tracked worktree copies (`git -C <wt> checkout -- <path>` after promoting the delta) instead
  of deleting them — a deleted tracked file makes `git worktree remove` refuse (exit 128,
  spiked), which is precisely what set up the deadlock; untracked promoted paths are still
  removed outright. `.claude/agent-memory/**` is pipeline-excluded from scope reconciliation:
  no File Plan can enumerate the memories a worker will write, and review CLOSE's per-file
  content disposal (carry / correct / delete, one stated fate each) is strictly stronger than a
  path flag. Known consequence: collision-closure's repo walk prunes memory files too, so a
  stale literal inside a worker memory is no longer swept — acceptable only because CLOSE reads
  every touched memory on content.
  (specs/20260823/04-review-close-hardening.md, done 2026-08-23)
