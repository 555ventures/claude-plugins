# Review — canonical decisions

- Review scope is derived, not predicted: the reviewer diff is unscoped from base;
  `scope-reconcile.js` reconciles it against the File Plan; out-of-plan files are hard
  findings and reviewed content; `pipelineOwnedPaths` (config, additive over `specs/**` +
  the run ledger) is the only sanctioned exclusion. (specs/20260805/01-review-scope-reconciliation.md)
- `pipelineOwnedPaths` is for generated surfaces only. This repo's own entry for
  `spec/workflows/wf-*.js` outlived its generator (`build-workflows.js`, deleted in `61e2e5a`
  2026-08-17) and hid an unplanned edit to a frozen workflow script from scope-reconcile — and
  pruned the file from collision-closure's literals leg — through a CLEAN review; it is retired.
  A hand-authored file, frozen or not, is never pipeline-owned: the Frozen-scripts rule is
  enforced by scope-reconcile's out-of-plan finding, and a spec that edits a workflow script
  gives it a File Plan row. Three tests exercise this repo's real config through the real
  entrypoints so a reintroduced entry goes red. (specs/20260825/05-workflow-scripts-in-review-scope.md)
- A rename's new path is in-plan only when its old path was planned (or pipeline-owned);
  an unplanned file's rename is an ordinary out-of-plan hard finding, still reported in
  `renamed` for visibility. (same spec, review fix 2026-08-06, AC-20260805-01-9)

- The verdict word and the ledger row are both emitted by `verdict.js` from the
  per-iteration evidence manifest (fresh mktemp file; legs re-executed each iteration) +
  reviewer return + dispositions; survivor counts come from the return file, never flags;
  `UNVERIFIED` = required leg missing, `GATE_RED` = blocking leg red; only `gate`/`suite`/`smoke`/`ci`
  block — `reconcile`/`ac-matrix`/`skip-reconcile`/`at-risk`/`promise-sweep` emit
  dispositionable findings; CI status
  flows through `ci-query.js` — red blocks pre-reviewer, unavailable
  never blocks; verdict.js exit 0 is the only door to Phase 3 close.
  (specs/20260805/02-review-evidence-manifest.md, done 2026-08-06)

  Findings legs are counted, not just colored: every red non-blocking manifest row
  contributes its typed finding count (`observed`'s per-leg count field; floor 1 when that
  field is absent or non-numeric) to the undispositioned pool beside reviewer survivors: the
  pool is hard survivors plus leg findings, and soft survivors are advisory —
  counted in the row's `findings.soft`, retained verbatim in the artifact, never dispositioned,
  never fix-dispatched at DISPOSITIONS. `CLEAN` is unreachable until dispositions cover the hard
  pool; `FINDINGS` means exactly one thing, a dispatched fix that has not landed.
  (specs/20260909/04-review-soft-floor.md, done 2026-09-09)
  Softs are advisory to the end. At DISPOSITIONS and FIX they print after the hard pool and may
  ride the fix round the same workers run; the fix-delta pass re-reviews whatever changed. The
  CLOSE verdict writes one `- a<i> file:line — claim` line per soft under the spec's
  `## Rationale` as `### Advisory debt (review <runId>)`, in the same write that flips the
  status, so the debt rides the close commit; the CLOSE step prints the softs under an advisory
  heading. A soft worth fixing after close is a Direct-lane commit through the host gate.
  `--mark closed` always measures the committed close tree against the judged tree snapshot
  (overlay paths excluded; paths tracked in neither the judged commit nor HEAD nor a fix-delta
  list are reviewer-created and skipped) and refuses any counted line or binary change with
  `close tree drifted from the judged tree`. The close row is never re-stamped after verdict.js
  writes it. (specs/20261024/06-close-tree-equals-judged-tree.md)

  A spec stamped `prototype: <stem>` gains one more row, `contract`, read from the spec's last
  build row (`replay.passed` and `replay.looked` both true → exit 0, else
  `unavailable: no-replay`); it never blocks by itself — a red or absent one is a hard finding
  through `ac-matrix`'s oracle rule on the pin criteria that name it.
  (specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md)
  **Manifest row v2** is `{"leg","exit","observed"}` where `observed` is always a
  non-null JSON object drawn from the Contracts closed set; any row whose `observed` is a
  string, an array, null, or absent makes the manifest invalid and derives `UNVERIFIED` in
  both profiles — an old-format row is loudly underivable, never silently misread. verdict.js
  holds no packed-string parser: it reads typed fields and copies `observed` objects verbatim
  into ledger leg rows and release keys, so a structurally-absent observation
  (`{"unavailable":"pattern-no-match"|"no-format-declared"}`) is permanently distinguishable
  from a pass and can never be coerced to zero.
  (specs/20260820/06-typed-evidence-manifest.md, done 2026-08-21) Review rows always carry
  `runId` (orchestrator-passed, else generated `rv_`+12hex by verdict.js) — the backlink an
  escape row's `reviewRunId` carries. Build rows count `deviations` as sidecar entries (`^- `
  lines) and `diff.loc` as insertions+deletions, matching review.
  (specs/20260818/01-ledger-truth.md)

  Every authoritative review verdict also retains its evidence: verdict.js requires
  `--retain .claude/spec-runs` alongside `--ledger --workflow` and writes
  `.claude/spec-runs/<runId>.jsonl` — the manifest legs untruncated plus the reviewer's
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

  Every review row names the code it judged (specs/20260824/06-review-range-identity.md, done
  2026-08-24): `spec-review-driver.js` resolves its base ref to a full sha once (a base that
  does not resolve is a `die` naming the `diff_base` remedy — never a warn-and-continue) and
  re-reads `HEAD` at every verdict pass, passing `--base-sha`/`--head-sha`/`--dirty` to all
  three ledger passes; `verdict.js` copies the pair into the row's `diff` object
  (`{loc, base, head, dirty}`, key order fixed) and the retained artifact's top-level `diff`,
  refusing (exit 2, before any derivation) anything but a 40-hex pair, one flag without the
  other, or either on the release profile. `dirty: true` means uncommitted tracked edits were
  present at pass time, so the close commit that follows completes the range. The reconcile
  leg's row carries its out-of-plan paths beside the count — `{"outOfPlan":N,"files":[…]}`,
  verbatim from `scope-reconcile.js`, capped at 40 with `filesOmitted` when the cap bites —
  and `countLegFinding` still reads the number. Rows and artifacts from before this landed are
  never backfilled. No waive cap exists by ruling: CLEAN stays derivable at any user-adjudicated waive
  count, and high-waive surfacing waits for an escape row that correlates with one.

  A third `fix-applied` (the iteration cap) appends an **escalate row** at the moment of the
  refusal: an honestly-derived non-CLEAN verdict carrying `escalated: true`, minted by
  `verdict.js` behind `--escalated` with `--fixDispatched 0` (the dispatched fix never landed;
  a derived CLEAN under `--escalated` is refused as evidence drift — never printed). In a
  worktree it lands durably in the main root's gitignored `spec-runs.stopped.jsonl` exactly
  like a hard-stop row, drains into the tracked ledger at close/promotion, and is permanent
  evidence — a capped attempt is never invisible. The waive/reject exit still closes normally;
  its close row lands after the escalate row and remains the observation join's key.
  (specs/20260822/01-escalate-ledger-row.md)

  The escape row carries spec, files, review run id, class, sha and via; the
  review-survivor match counter and its derivation are
  retired. Plan locks append a `stage:"plan"` ledger row of executed facts (spike count, promise-sweep
  counters, collision counts). The escape ledger is the pipeline's one ground-truth
  signal; self-reported review quality is subordinate to it.
  (specs/20260819/01-review-evidence-retention.md)

- Every escape row carries a validated defect class; `spec/scripts/lib/escape-row.js` is the
  one validator and `escape-row.js` the one writer (`--append`, duplicate-refusing). The row
  is `{ts, stage, spec, files, reviewRunId, class, sha, via}`, legacy rows still accepted.
  The fleet reader counts recurrences on the row's class and flags unvalidated rows in the
  drift census (`class-missing`). The third-recurrence bar's Materiality field cites that
  count.

- Reviewer returns carry `file`/`line` (or explicit null) on every killed claim, enforced at
  the `reviewer-returned` mark, so dismissed claims can be matched by location.
  (specs/20260901/08-corpus-derivation-and-kill-match.md)

- A review records the two commits bounding what it judged as refs under
  `refs/spec-review/<runId>/` — `judged` at the close row's own head sha, `close` at the close
  commit — written best-effort so a failed write can never block a close. A consumer reads that
  pair and derives neither: a commit identified by "the newest commit touching the spec file" is
  a different commit as soon as anything else touches that file.
  (specs/20260913/01-the-replay-tree-is-the-reviewed-tree.md)

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
  Routes 2 and 3 map a skip to the first AC cited at or after the test's own name, falling back
  to the file's citations. (specs/20261024/01-review-driver-reads-recorded-facts.md)

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
  clause added by that spec's own review, AC-20260815-02-15). The walk classifies by what the
  repository considers its own, not by directory name: it prunes every git-ignored path
  (derived once per run from `git ls-files -o -i --exclude-standard --directory`), so an
  ignored working copy — a `.claude/worktrees/**` checkout, a `*.build/` scratch dir — is never
  handed to the host's test command as if it were a real test file. The prune is active only
  when `--root` is the repository top level and both git calls succeed; any other outcome
  filters nothing and leaves the pre-existing walk exactly as it was, because a wrongly pruned
  set is silently too narrow while an unpruned one is merely too wide.
  (specs/20260907/03-ignored-paths-and-unobserved-count.md D1/D2/D3)

- The Phase 0 leg inventory carries **`suite`**: required in both scopes, blocking. It runs the
  host's bare `testCommand` from the repo root in its own wave after gate/reconcile/ci and before
  at-risk and smoke, writes `<out-dir>/suite-output.txt`, and types its row like the gate's
  (`skips`, `todos`, `testsExecuted`); a declared `testCountPattern` forces exit 1 whenever the
  run observed no test executing — either an observed `0` or a `{"unavailable":"pattern-no-match"}`
  the pattern never matched, since a format that was promised and produced nothing is the same
  unsupported claim as a counted zero; `{"unavailable":"no-format-declared"}` never forces,
  because a host that promised no observation is contradicted by nothing. The at-risk leg carries
  the identical rule. The predicate and both count parsers live in
  `spec/scripts/lib/count-observation.js`; release's e2e leg imports the same functions
  (specs/20260908/05-release-e2e-unobserved-count.md D1). A host with no `testCommand` gets a
  red `{"unavailable":"no-test-command"}` row, never a silent skip. The close-time re-run runs the same command after the resolved gate.
  (specs/20260903/02-whole-suite-review-leg.md; the unobserved-count extension
  specs/20260907/03-ignored-paths-and-unobserved-count.md D4/D5)

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

- **One port per smoke run.** When the host's `runtime.readyCheck` reads the shell variable
  `PORT`, `smoke.sh` allocates a free loopback port for the run and exports it as `PORT` to
  `bootCommand`, `readyCheck` and `seedCommand`; the pass line names the port. Two smoke runs of
  one repo can then overlap. A ready check that names a fixed port is left exactly as it was and
  cannot run beside a second launch: the pre-boot probe exits 7 saying another process is already
  answering on this address. `spec/scripts/lib/app-port.js` is the one allocator and the one
  definition of "reads PORT".
  (specs/20261005/03-one-port-per-launch.md, done 2026-10-05)

- The review stage is a **stepped program**, not prose choreography: `spec-review-driver.js`
  owns the sequence (LEGS -> SKIPS? -> REVIEWER -> DISPOSITIONS -> FIX/ESCALATE? -> CLOSE ->
  MERGE/CONFLICTS -> DONE, with STOPPED terminal on `RED_BLOCKING`) and is the sole invoker of
  `review-legs.js`, `verdict.js`, `merge-back.sh`, and `spec-status.js` within the
  stage. It EXECUTES every deterministic step itself — base derivation, the per-iteration
  manifest lifecycle (`<spec>.review/manifest-<n>.jsonl`, never reused), all three `verdict.js`
  passes, both ledger appends, the `implementing → done` flip, the merge-back sequence — and
  PRINTS exactly one step at a time for what needs judgment: reviewer + design-leg dispatch,
  dispositions, the Canonical Delta + deviations fold, the close commit, merge strategy,
  conflict resolution. An empty hard pool after `reviewer-returned` is dispositioned by the
  driver itself (no mark); `--mark dispositions --file` derives the waived/rejected/fix tallies
  from the disposer return, the count flags being an optional cross-check.
  `review.md` is the judgment shell that hosts those conversations; the
  driver never recommends a disposition, never picks a merge strategy, and never renders a
  user-facing report. Marks are a closed, artifact-verified set — state is re-derived from
  frontmatter + sidecar + on-disk artifacts on every invocation, a mark whose artifact vanished
  is demanded again, and the fix-iteration cap (2) counts the fix-delta manifests present on disk, so
  hand-editing the sidecar cannot reset it. The `<spec>.review/` sidecar is scratch: never
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
  a `done` spec whose sidecar lacks this run's own `closeRunId` is refused naming `/spec:fix`,
  which repairs a defect that escaped a review that already passed — its commit records the
  escape row.
  (specs/20260820/07-review-driver.md, done 2026-08-21)
  The driver snapshots the tree at each `reviewer-returned` (scratch-index write-tree, untracked
  files included) and at `fix-applied` writes `<sidecar>/fix-delta-<n>.txt`, refusing a fix that
  changed no file before any legs run; the iteration-≥2 REVIEWER step is the fix-delta pass and
  hands the reviewer that list plus the prior reviewer and disposer returns — the reviewer
  re-verifies fix-routed findings and reports only inside the listed files.
  (specs/20260909/05-fix-delta-reviewer-pass.md)
  A manifest's number is a storage key. Its kind is the `scope` stamp on its rows; the fix cap
  counts fix-delta manifests. The live iteration is the sidecar's recorded `iteration`; SKIPS
  re-fires per iteration when the gate's skip count differs from the count recorded at
  extraction. `skips-extracted` refuses an empty file against a gate reporting skips and warns on
  a count mismatch. (specs/20261024/01-review-driver-reads-recorded-facts.md)

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

- **The deviations sidecar is backstopped by the driver, not by convention.** The review driver
  validates the deviations sidecar against the bullets-only entry grammar whenever it derives
  state, persists the observation (`entries`, `malformed`) in the review sidecar, and enumerates
  every entry into the printed CLOSE step. `--mark closed` refuses (exit 2, remedy named) while
  the sidecar still exists on disk, or while the last observation records a malformed —
  flush-left, count-invisible — line, even after the file's deletion. The grammar's closing
  conditions are exhaustive and exactly two: a blank line and a header close an open entry;
  nothing else does, a malformed line included, so a stray flush-left line inflates the evidence
  listing by exactly itself and never by the valid continuations beneath it. Fold outcome is
  deliberately not ledgered — it would be self-attested at exactly the moment the backstop exists
  to distrust; the build row's `deviations` count remains the cross-spec signal.
  (specs/20260823/07-deviations-sidecar-backstop.md, done 2026-08-23)
- **Review scope is manifest-derived.** `review-legs.js` stamps every row it writes with
  `scope: "full" | "fix-delta"`; `verdict.js` reads the pass scope off those rows (carriers must
  agree; none means `full`; disagreement or a value outside the enum invalidates the manifest →
  `UNVERIFIED`) and never off the reviewer's return, which no longer carries a `scope` field. On
  `UNVERIFIED`, `verdict.js` prints one stderr line naming the missing legs or the invalid row,
  and the review driver refuses `--mark dispositions` on that word before any write —
  dispositions cannot cure missing evidence; the remedy is a cold re-run of the legs. The
  review-profile ledger row's `scope` is the manifest-derived value on every row, hard-stop rows
  included. (specs/20260902/05-manifest-stamped-scope.md, done 2026-09-02)
- **A repro's comment cites the basis it actually has.** A review finding may be true on
  contract reading alone, but a repro that exercises a synthetic stand-in rather than the real
  entrypoint has not observed the real code path failing — so the comment it leaves behind in
  permanent code or tests must say which of the two it rests on, and must not transcribe the
  synthetic run's numbers as if the real path produced them. Grep-answerable as a standing
  question: any code or test comment citing a repro's numbers where the repro did not invoke the
  real entrypoint under the conditions the finding claims.
  (merged from pipeline rules § Gotchas 2026-09-11; specs/20260823/08-derived-session-queue.md review)
