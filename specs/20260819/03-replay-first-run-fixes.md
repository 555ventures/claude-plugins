---
date: 2026-08-19
status: done
tier: standard
diff_base: 944554272b63bd9294b7631b77c435331d269a37
area: review
design: false
breaking: false
depends_on: [specs/20260819/02-mutation-replay.md]
depended_on_by: []
open_markers: 0
brief: 14
---

# Replay First-Run Fixes: Patch-Hunk Scoring, Non-Measurement Outcomes, Pair Mutations

## Goal

The mutation-replay harness (specs/20260819/02) closed CLEAN on 2026-08-19 and has never
executed anywhere. A post-CLEAN consult found four defects that would corrupt its first
number, and one of them is a recorded escape (ledger 2026-08-20, `preventedBy: runtime-leg`):
the `self-consistent-polarity` corpus class is unbuildable because the mutation worker is
bound to one file while the recipe requires a code+test pair. This spec makes the score
derive from the mutation patch the harness already holds (never a single self-reported
line), makes runs that end without a real answer recordable without polluting the catch-rate
(`unresolved`, `setup-failed`), gates every run on the host's `setupCommand` executing
inside the scratch worktree, and unbinds the pair mutation. A 2026-08-19 portability consult
added three more, all of them host-config defects this repo's own git settings hide: the
harness never emitted its own patch (host `diff.noprefix`/`core.quotePath` settings make one
D1 cannot parse), `--apply`'s `git add -A` would sweep whatever the new setup gate's
`setupCommand` wrote into the very diff the blind reviewer reads, and scoring compared the
reviewer's raw path string against the patch's. Done = the first real replay run on any host,
under any git config, can only ever produce a trustworthy row.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--score` drops `--file`/`--line` and takes `--patch <file>` — the canonical patch `--apply` emitted (D9): mutated files and post-image line ranges are parsed from the patch's own `+++ b/<path>` / `@@` hunk headers; a survivor whose normalized path (D11) names a mutated file and whose line lies within ±5 lines of any hunk in that file is `caught` (AC-20260819-03-1, AC-20260819-03-2, AC-20260819-03-3, AC-20260819-03-4) | The patch is ground truth the harness already retains; a single worker-reported point under-scores multi-file mutations and misplaced-but-real findings. Parsing stays strict (`b/`-prefixed, unquoted) precisely because D9 makes this harness the only emitter — tolerating arbitrary prefixes instead would blunt the exit-2 tripwire whose remaining job is to reject a patch this harness did not produce. Fully-deterministic scoring (no ambiguous seam) rejected — a reviewer naming the defect from its call site would score `missed` and false-fire the alarm. |
| D2 | replay.md Phase 1 step 3 unbinds the worker: it edits the File Plan files the class recipe requires — one for most classes, the matched code-guard + covering-assertion pair for `self-consistent-polarity` — and replay-corpus.md states that pair spans whichever File Plan files its two sites live in: two files where the stack keeps tests apart, one where it co-locates them (Rust `#[cfg(test)] mod tests`, Elixir, doctests) [no-ac: doctrine-prose contract; its deterministic consumer is D1's multi-file scorer (AC-20260819-03-1), and its first executed exercise is the next real replay run] | The one-file binding made the corpus's hardest class dead on every stack that keeps tests in separate files — the recorded escape this spec closes. Dropping the class instead was rejected (JJ 2026-08-19): it is the class that tests spec-vs-code reading rather than trust-in-green-tests. |
| D3 | A dismissed `ambiguous` adjudication records `--outcome unresolved` (reviewer return retained via `--workflow`) instead of recording nothing, then tears down (AC-20260819-03-5, AC-20260819-03-11) | Discard-on-dismiss censored exactly the hardest cases out of the catch-rate; an unresolved row preserves the evidence for later adjudication and keeps the harness due. |
| D4 | replay.md Phase 1 gains a setup gate: after `--setup`, run the host's `setupCommand` (from `.claude/spec.config.json`) inside `{dir}`; a non-zero exit records `--outcome setup-failed --legs none` (no class, no patch, no workflow — nothing was measured), tears down, and stops (AC-20260819-03-6, AC-20260819-03-13) | The scratch-worktree setup path has never executed on any host; on heavy-dependency hosts it is the likeliest failure, and a setup failure recorded as anything else corrupts the number silently. |
| D5 | `--due` and `--select` define their window by the last **measurement** row — a `stage:"replay"` row with outcome `caught`/`missed`/`leg-caught`; `unresolved` and `setup-failed` rows never reset the clock, so the next review session retries immediately and may re-select the same CLEAN review (AC-20260819-03-7, AC-20260819-03-8, AC-20260819-03-9) | JJ 2026-08-19: a broken setup must get noticed and retried at the next review, not leave the reviewer unmeasured for five more; the measurement stays overdue until a real result lands. |
| D6 | `--stats` gains `unresolved` and `setup-failed` buckets (totals and per-class where a class exists); catch-rate stays `caught/(caught+missed)` — non-measurement rows never enter the denominator (AC-20260819-03-12) | A run with no truth value must be visible in the totals and absent from the rate; folding either into the denominator deflates the number the instrument exists to protect. |
| D7 | `--record` drops `--file` and derives the row's `files` array from `--patch`; validation matrix: `caught`/`missed`/`unresolved` require `--patch` + `--workflow` and `--legs green`; `leg-caught` requires `--patch` and `--legs red:<leg>`; `setup-failed` requires `--legs none` and refuses `--class`/`--patch`/`--workflow` (AC-20260819-03-5, AC-20260819-03-6, AC-20260819-03-13) | A hand-passed file can contradict the patch it rides with; deriving from the patch makes the mismatch unrepresentable, and requiring the reviewer return on scored outcomes keeps every catch/miss auditable from its artifact. |
| D8 | `spec/.claude-plugin/plugin.json` bumps to the next free version (target 7.5.0) with the changelog-form description update [no-ac: manifest metadata; review's version-bump check is the enforcing eye] | Behavior change without a bump is a hard review finding in this repo. |
| D9 | `--apply` gains a **required** `--patch-out <file>` and becomes the harness's only patch emitter: after committing, it re-emits the mutation diff from `HEAD^..HEAD` under pinned git config (`-c core.quotePath=off -c diff.noprefix=false -c diff.mnemonicPrefix=false -c diff.srcPrefix=a/ -c diff.dstPrefix=b/`, `--no-ext-diff --no-color`) to that path, and refuses a `--patch-out` resolving inside `--dir` with exit 3 before applying anything; replay.md captures the worker's raw edit with the same pinned flags, and `--score`/`--record` are handed the emitted file (AC-20260819-03-14, AC-20260819-03-15) | Host git config is not ours. `diff.noprefix`, `diff.mnemonicPrefix`, `diff.srcPrefix`/`dstPrefix` and `core.quotePath` (on by default, quoting every non-ASCII path) each produce a patch D1's parser reads as zero hunks — a `--score` exit 2 with no recordable outcome, i.e. the harness permanently dead on that host with only a dueness row to show for it. Executed against a hostile-config repo (A5). Emitting canonically in code beats parsing tolerantly: one seam, owned by the harness, and the same defect would otherwise also break `git apply`'s default `-p1`. A `--patch-out` written inside `{dir}` would be a harness artifact in the exact tree the reviewer reads — a blindness violation, refused structurally. |
| D10 | `--apply` applies with `git apply --index` and commits the index only — never `git add -A`; replay.md's D4 setup gate ends by restoring tracked files (`git checkout -- .`) inside `{dir}` before class selection (AC-20260819-03-16) [no-ac for the doctrine half: the restore is orchestration prose whose deterministic companion is this row's index-only commit] | D4 inserts `setupCommand` **before** `--apply`, which spec 02 built against a pristine tree. On any host whose setup rewrites a lockfile or generates tracked code, `git add -A` would commit that churn into the exact `base..HEAD` diff the blind reviewer reads, and scope-reconcile reports it out-of-plan straight from the working tree even while uncommitted — self-inflicted noise that scores `ambiguous` and erodes blindness. Both halves executed (A6): the index-only commit is why unrelated churn stays dirty, and the working-tree restore is why staying dirty is not enough. |
| D11 | `--score` normalizes survivor paths before matching: a leading `./` is stripped, and an absolute path names a mutated file when it ends on that file's repo-relative path at a path-segment boundary (AC-20260819-03-17) | The reviewer contract states only that a finding carries a verified `file:line`, never the path form, and the blind reviewer is rooted at `{dir}` — so an absolute or `./`-prefixed return scores `ambiguous` on a correct catch and burns the one human adjudication seam on a mechanical mismatch, every run, on any host whose reviewer happens to emit that form. Pinning the form in the reviewer contract instead was rejected: normalizing in the scorer costs one function and touches no host-visible contract. |
| D12 | `replay-corpus.md`'s `dead-wiring` recipe gains one clause: the severed value must be captured into a consumed-but-ignored sink, never left a stranded local [no-ac: doctrine-prose recipe constraint; its enforcing eye is the run's own leg verdict — a class that trips a leg records `leg-caught`, which spec 02 D11 defines as corpus feedback] | On compiled or strict-lint hosts (Go's unused-variable compile error, `-D warnings` Rust, a `no-unused-vars` rule inside `gateCommand`) the recipe as written is leg-visible by construction, so those hosts would spend replay runs measuring their toolchain instead of the reviewer. The other five classes survive the portability sweep unchanged. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | MODIFY | scripts | D1 patch-hunk scoring; D3/D4 outcome vocabulary; D5 measurement-window dueness/selection; D6 stats buckets; D7 record validation + files-from-patch; D9 required `--patch-out` canonical emission + inside-dir refusal; D10 index-only apply; D11 survivor-path normalization; header usage/exit-code text updated to match |
| spec/commands/replay.md | MODIFY | doctrine | D2 pair binding in Phase 1 step 3; D4 setup-gate step; D3 dismissed-adjudication recording; D9 pinned capture flags + `--patch-out`; D10 post-setup tracked-file restore; Phase 3/4 flag shapes updated; Report outcome lines for unresolved/setup-failed |
| spec/doctrine/replay-corpus.md | MODIFY | doctrine | D2: `self-consistent-polarity` recipe states the matched pair spans whichever File Plan files its two sites live in (one where the stack co-locates tests); D12: `dead-wiring` sink clause |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 version bump + last-3-versions description |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260819-03-1 … AC-20260819-03-17; colliding `--score --file/--line` and outcome-enum pins updated in place and retagged; the two AC-20260819-02-4 `--apply` pins gain `--patch-out` in place, assertions and IDs untouched (A7) |

## Contracts

`replay.js` usage (changed modes only):

```
--apply --dir <path> --patch <file> --patch-out <file> --class <id> [--subject <text>]
--score --workflow <file> --patch <file>
--record --spec <path> --review-run-id <id> --legs green|red:<leg>|none
         --outcome caught|missed|leg-caught|unresolved|setup-failed
         [--class <id>] [--patch <file>] [--workflow <file>] [--tokens N]
```

Patch emission (D9): `--apply` writes `--patch-out` from
`git -c core.quotePath=off -c diff.noprefix=false -c diff.mnemonicPrefix=false
-c diff.srcPrefix=a/ -c diff.dstPrefix=b/ diff --no-ext-diff --no-color HEAD^ HEAD` inside
`{dir}`, after the commit. Unknown config keys on older git are ignored and default to the
same prefixes. Every downstream mode (`--score`, `--record`) reads that file, never the
caller's raw capture.

Path normalization (D11): a survivor's `file` is compared after stripping a leading `./`;
an absolute path matches a mutated file when it ends on that file's repo-relative path at a
path-segment boundary (`/tmp/x/lib/guard.js` matches `lib/guard.js`, `x/mylib/guard.js` does
not match `lib/guard.js`).

Hunk parsing (D1): a mutated file is every `^\+\+\+ b/(.*)$` path in the patch; each
`^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@` header under it contributes a post-image range
`[start, start + max(count,1) − 1]` (an omitted count is 1; a pure-deletion `count 0` hunk
keeps a 1-line window at `start`). A survivor scores `caught` when its `file` equals a
mutated file and its `line` lies within any of that file's ranges widened by ±5. Survivors
present but none matching → `ambiguous`; empty survivors → `missed`. A patch that parses to
zero hunks is unusable input → exit 2.

Ledger row (replaces spec 02's shape — zero `stage:"replay"` rows exist, verified at plan):

```
{"ts":"<ISO-8601>","stage":"replay","spec":"<path>","runId":"rp_<hex>","reviewRunId":"<id>",
 "class":"<corpus id>"|null,"files":["<repo-relative path>", …]|null,
 "legs":"green"|"red:<leg>"|"none","outcome":"caught|missed|leg-caught|unresolved|setup-failed",
 "tokens":N}
```

`class` and `files` are `null` only on `setup-failed`. The evidence artifact
(`.claude/spec-runs/rp_*.json`) mirrors the row plus `patch` (verbatim text, `null` when no
`--patch`) and `reviewer` (verbatim JSON, `null` when no `--workflow`).

Exit codes (replay.js header, changed entries): 2 additionally covers a `--score --patch`
that parses to zero hunks, an `--apply` missing `--patch-out`, and every D7
validation-matrix refusal; 3 additionally covers an `--apply --patch-out` that resolves
inside `--dir` (refused before the patch is applied); the `--due` exit-1 "not due" meaning
is unchanged but computed against the last measurement row (D5). All other codes keep spec
02's meanings.

## Behavior

- **Phase 1 (replay.md):** after `--setup` succeeds, the orchestrator runs the host's
  `setupCommand` inside `{dir}`. Non-zero → record `setup-failed` (D4's flag shape),
  teardown, report `🚫 replay setup-failed — the scratch copy could not be prepared`; the
  harness stays due (D5). On success the gate restores tracked files inside `{dir}`
  (`git checkout -- .`) so nothing `setupCommand` rewrote reaches the tree the legs and the
  reviewer read (D10), and class selection proceeds. The mutation worker edits the File Plan
  files the recipe requires (D2) and returns the edited paths — no line number; the patch
  carries the positions. The caller captures that edit with D9's pinned flags, and
  `--apply --patch-out {patchFile}` re-emits the canonical patch every later mode reads.
- **Phase 3:** `--score --workflow {return} --patch {patchFile}` (the `--patch-out`
  emission, never the caller's raw capture). `ambiguous` still asks
  the one judgment question (nearest finding beside the patch hunks); a dismissed question
  now records `unresolved` with the reviewer return attached, then tears down — the run is
  never silent.
- **Phase 5 report:** `unresolved` → ⚠️ line naming the retained runId for later
  adjudication; `setup-failed` → 🚫 line naming the failing setup command.
- Blindness invariants, marker guard, teardown-always, and subject refusal are untouched.

## Acceptance Criteria

- **AC-20260819-03-1**: WHEN `--score` reads a CLEAN return whose survivors include
  `{file:"tests/guard.test.js", line:3}` and a `--patch` whose hunks are
  `lib/guard.js @@ +1,5` and `tests/guard.test.js @@ +1,3` THE SYSTEM SHALL print `caught`
  and exit 0 (a finding on the second file of a two-file mutation scores) → tests/replay/replay.test.js
- **AC-20260819-03-2**: WHEN survivors are non-empty but none lie within ±5 of any hunk
  range in a mutated file (e.g. sole survivor `{file:"lib/guard.js", line:40}` against
  `lib/guard.js @@ +1,5` → window 1–10) THE SYSTEM SHALL print `ambiguous` and exit 0 → tests/replay/replay.test.js
- **AC-20260819-03-3**: WHEN the CLEAN return's survivors array is empty THE SYSTEM SHALL
  print `missed` and exit 0 → tests/replay/replay.test.js
- **AC-20260819-03-4**: WHEN `--score --patch` names a file that parses to zero
  `+++ b/` hunk headers THE SYSTEM SHALL exit 2 with stderr naming the patch path and the
  remedy, printing no score → tests/replay/replay.test.js
- **AC-20260819-03-5**: WHEN `--record --outcome unresolved --legs green` rides with
  `--patch` and `--workflow` THE SYSTEM SHALL append a row with `outcome:"unresolved"` and
  `files` parsed from the patch, and write the artifact with the reviewer return verbatim → tests/replay/replay.test.js
- **AC-20260819-03-6**: WHEN `--record --outcome setup-failed --legs none` rides with no
  `--class`/`--patch`/`--workflow` THE SYSTEM SHALL append
  `{…,"class":null,"files":null,"legs":"none","outcome":"setup-failed",…}` and write the
  artifact with `patch:null, reviewer:null` → tests/replay/replay.test.js
- **AC-20260819-03-7**: WHEN the ledger holds a measurement replay row, then 5 review rows,
  then a `setup-failed` replay row THE SYSTEM SHALL report `due reviewsSince=5` and exit 0
  from `--due` (a non-measurement row never resets the clock) → tests/replay/replay.test.js
- **AC-20260819-03-8**: WHEN fewer than 5 review rows follow the last measurement replay
  row THE SYSTEM SHALL CONTINUE TO report not due and exit 1 from `--due` → tests/replay/replay.test.js
- **AC-20260819-03-9**: WHEN a CLEAN review row is followed only by a `setup-failed` replay
  row THE SYSTEM SHALL still select that review from `--select` (the retry targets the same
  review) → tests/replay/replay.test.js
- **AC-20260819-03-10**: WHEN `--score --workflow` reads a return that is not
  `verdict:"CLEAN"` with a `survivors` array THE SYSTEM SHALL CONTINUE TO exit 2 printing
  no score → tests/replay/replay.test.js
- **AC-20260819-03-11**: WHEN `--record --outcome` is any value outside
  `caught|missed|leg-caught|unresolved|setup-failed` THE SYSTEM SHALL CONTINUE TO exit 2 → tests/replay/replay.test.js
- **AC-20260819-03-12**: WHEN `--stats` reads one row of each outcome THE SYSTEM SHALL
  print all five buckets and `catch-rate 1/2` (unresolved and setup-failed absent from the
  denominator) → tests/replay/replay.test.js
- **AC-20260819-03-13**: WHEN `--record --outcome caught` omits `--patch` or `--workflow`,
  or `--outcome setup-failed` rides with `--class`, THE SYSTEM SHALL exit 2 naming the
  violated requirement → tests/replay/replay.test.js
- **AC-20260819-03-14**: WHEN `--apply --patch-out {out}` runs in a worktree whose repository
  config sets `diff.noprefix=true` and `diff.mnemonicPrefix=true` with `core.quotePath` left
  on, against a mutation touching a non-ASCII path, THE SYSTEM SHALL write `{out}` with
  unquoted `+++ b/<path>` headers that `--score --patch {out}` parses to at least one hunk
  (the bare `git diff` in that repo produces neither) → tests/replay/replay.test.js
- **AC-20260819-03-15**: WHEN `--apply` omits `--patch-out` THE SYSTEM SHALL exit 2 naming the
  flag, and WHEN `--patch-out` resolves inside `--dir` THE SYSTEM SHALL exit 3 with nothing
  applied, nothing committed, and no file written → tests/replay/replay.test.js
- **AC-20260819-03-16**: WHEN `--apply` runs in a worktree carrying an unrelated modified
  tracked file and an unrelated untracked file THE SYSTEM SHALL commit only the patch's own
  files (`HEAD^..HEAD` names nothing else) and leave both unrelated changes uncommitted → tests/replay/replay.test.js
- **AC-20260819-03-17**: WHEN a survivor's `file` is `./lib/guard.js`, and when it is an
  absolute path ending in `/lib/guard.js`, with a line inside a `lib/guard.js` hunk window,
  THE SYSTEM SHALL print `caught` in both cases → tests/replay/replay.test.js

## Assumptions (escalation triggers)

- A1: `git diff` hunk headers are `+++ b/<path>` + `@@ -a[,b] +c[,d] @@`, count omitted when
  1 — **executed 2026-08-19**: two-file lockstep diff plus a single-line file; parser spike
  returned `[{"file":"lib/guard.js","start":1,"count":5},{"file":"one.txt","start":1,"count":1},{"file":"tests/guard.test.js","start":1,"count":3}]` —
  **if false:** the format is git-stable; a deviation means a non-git patch was passed —
  exit 2 path covers it.
- A2: the host `setupCommand` (`npm install`) exits 0 inside a fresh detached worktree of
  this repo — **executed 2026-08-19**: `up to date in 176ms`, exit 0 — **if false:** that is
  exactly D4's `setup-failed` path; on THIS host it would signal a broken checkout — STOP,
  ask the user.
- A3: zero `stage:"replay"` rows exist in the ledger — **executed 2026-08-19**: grep count
  0 — so D7's row-schema change (`files` array, nullable `class`) breaks no reader —
  **if false:** a row landed between plan and build; migrate or version the schema — STOP,
  ask the user.
- A5: pinned `-c` flags neutralize hostile host diff config — **executed 2026-08-19**: in a
  repo with `diff.noprefix=true`, `diff.mnemonicPrefix=true` and a non-ASCII path, bare
  `git diff` emitted `+++ "caf\303\251.js"` and prefix-less `+++ lib/guard.js`; the pinned
  form emitted `+++ b/café.js` and `+++ b/lib/guard.js` (git 2.50.1) — **if false:** the
  harness's own emission is the single seam to repair; never widen D1's parser.
- A6: `git apply --index` + `git commit` commits only the patch's files — **executed
  2026-08-19**: with `lockfile.txt` modified and an untracked file present, `HEAD^..HEAD`
  named only `lib/guard.js` and both unrelated changes stayed dirty in `git status -uall` —
  which is also exactly why D10's setup-gate restore is required, since scope-reconcile reads
  the working tree, not just the commit — **if false:** STOP, ask the user.
- A7: the two AC-20260819-02-4 `--apply` pins invoke the mode without `--patch-out` and go red
  the moment D9 requires it; both gain the flag in place with their assertions untouched, and
  keep their own AC-IDs because nothing they assert changed (retagging would misattribute a
  spec-02 invariant to this spec) — **if false** (an `--apply` invocation outside that file):
  the collision sweep at lock enumerates it; treat as a File Plan gap and escalate.
- A4: tests/replay/replay.test.js pins the old `--score --file/--line` shape and the
  three-value outcome enum; both are colliding pins updated in place and retagged with this
  spec's AC-IDs (never weakened) — **if false** (a pin outside that file asserts the old
  shape): the collision sweep at lock enumerates it; treat as File Plan gap and escalate.

## Rationale

All four defects are plugin-general, none stack-specific: the one-file binding breaks the
pair class on every host that keeps tests in separate files; point-scoring and
dismiss-censoring are structural; the setup gate has simply never run anywhere. The 2026-08-19
Fable consult recommended exactly this bundle landed **before** the first real run, and
explicitly rejected two alternatives recorded here: a fully-deterministic scorer (it would
score a reviewer that names the defect from its call site as `missed`, deflating the rate
and false-firing the reopen-second-reviewer trigger) and an automated ambiguity judge
(deferred until human adjudications exist to validate it against — `unresolved` rows are
that future training set). Dropping the dead class was rejected by JJ in favor of unbinding
the worker. Dueness-reset-on-any-row was rejected by JJ: a persistently failing setup must
stay loudly overdue. The repo-measured magnitudes from the consult (45–65% needs-judgement,
51% unrelated-finding base rate) deliberately informed nothing here — only the mechanisms.
The 2026-08-19 portability consult that added D9–D12 asked one question the first pass did not:
what breaks on a host that is not this one. It refuted a proposed `setupCommand` timeout and a
consecutive-failure circuit breaker (`/spec:review` only prints the cheap `--due` advisory, so
the worktree cost lands only when a human runs `/spec:replay`, and D4's report already names the
failing command — the human is the breaker), refuted a host-capability probe gating replay
availability (executing `setupCommand` IS the probe; a declared capability is the same fact,
stale), and refuted prefix-tolerant parsing in favour of harness-owned emission. It also
declined to add `.worktreeinclude` copying to `--setup`: on hosts whose setup needs credentials
the scratch tree lacks, `setup-failed` is an honest row, and the mechanism should be earned on a
real occurrence rather than speculated. The escape row for the dead class is recorded (2026-08-20, `preventedBy: runtime-leg` —
only an executed authoring dry-run would have caught an impossible recipe; two reading
passes missed it). Fragile to watch at build: the canonical doc's outcome wording is
outside the File Plan by design — the Canonical Delta below owns it at review time.

Review waives (2026-08-20, JJ): scope-reconcile reported two out-of-plan paths —
`.claude/agent-memory/plugin-tests/MEMORY.md` and its new
`spec-collision-sweep-can-miss-same-file-collisions.md` note. Both are the test worker's own
agent memory, the same non-contract surface the lock-time waive above already classifies;
the new note records that this spec's own A4/A7 collision list missed a third `--record --file`
collision inside the assigned test file, which is worker learning worth retaining. Waived, not
fixed: deleting them would discard the lesson, and agent memory is never a File Plan deliverable.

Collision-sweep waives (lock, 2026-08-19): `.claude/agent-memory/plugin-tests/replay-js-cwd-not-root.md`
mentions the three-value outcome enum — agent memory, not a contract surface; stale phrasing
there self-corrects on next touch. The "never guess" hits in init.md/plan.md/spec-status.js/
merge-back.sh/spec.md are unrelated uses of a generic stem (the never-guess-mark-it drafting
rule), not the retired replay.md dismissal clause — only replay.md carries that claim and it
is in the File Plan.

## Canonical Delta

In `docs/canonical/review.md`, amend the replay paragraph (currently "catch/miss/leg-caught
lands as a `stage:"replay"` ledger row"): outcomes are
`caught`/`missed`/`leg-caught`/`unresolved`/`setup-failed`; scoring compares survivors to
the mutation patch's own hunks (±5 lines, any mutated file); only `caught`+`missed` enter
the catch-rate, and a non-measurement outcome leaves the harness due, so the next review
session retries. Append citation `(specs/20260819/03-replay-first-run-fixes.md)`.
