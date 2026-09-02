# Scripts and tests

Timeless Node/git/testing engineering truths, pruned out of the host rules' § Gotchas section
in the 2026-08-23 prose-debt triage (`.claude/rules/spec-pipeline.md`). These are library-API
facts a future planner should be able to find here, not pipeline-incident narratives — the
fuller incident write-ups live in each cited spec's history.

- **A synchronously-resolving fake starves the macrotask queue.** A poll/retry loop over an
  injected transport that resolves synchronously never yields to the macrotask queue and OOMs
  instead of failing; give it an explicit `await new Promise(r => setImmediate(r))` per
  iteration. (specs/20260801/01-telegram-adapter.md)
- **No microtask drain observes a real child process.** A `flush()`-style `setImmediate` drain
  cannot see anything gated on a spawned process; an assertion that follows a spawn needs a
  bounded real-time `waitFor(predicate, ms)` poll instead. (specs/20260801/03-lane-engine.md)
- **`git status --porcelain` collapses an untracked directory to one line.** File-level
  consumers need `--untracked-files=all`, or every file inside a new directory is invisible to
  them. (specs/20260805/01-review-scope-reconciliation.md)
- **`spawnSync` blocks the loop an in-process stub lives on.** A CLI test against an
  in-process stub server must use async `spawn` — `spawnSync` blocks the parent's event loop
  for the child's whole lifetime, so the stub can never answer and the test hangs to timeout.
  (specs/20260808/01-autopilot-enroll.md)
- **`spawnSync`'s `status` is `null` on signal kill, spawn failure, or `maxBuffer`
  overflow, and `process.exit(null)` exits 0** — pin the null branch explicitly. Default
  `maxBuffer` (1MB) eats a verbose `node:test` trailer; `stdout.write()` before `exit()`
  truncates at 64KB — use `fs.writeSync(1, …)`. (specs/20260816/01-gate-baseline-reconcile.md)
- **A contiguous-sentence regex pin cannot see text split across concatenated string
  literals.** The file and rendered output read correctly; the pin is red for a reason no diff
  review surfaces. Keep a pinned sentence whole in one literal; append additions as separate
  segments. (specs/20260816/01-gate-baseline-reconcile.md)

- **A path-substring sweep over a test corpus is blind to root-stripped spellings.** When
  test helpers join script paths against an intermediate root (`path.join(SPEC, 'scripts/x.js')`),
  no test ever spells the repo-relative path the sweep searches for; measured 77% of
  test→script execution edges invisible in this repo (2026-08-30). Match the target's
  two-segment suffix — it subsumes the full spelling and needs no host-specific prefix — and
  classify runnable targets by extension *or* shebang, never extension alone.
  (specs/20260830/01-collision-closure-exec-recall.md)

## Prose budgets

The host rules' § Gotchas section is capped at 15 entries, enforced by `prose-cap.js` (review
CLOSE and this repo's own suite); appending at cap requires an eviction — delete, merge here,
or mechanize. Agent-memory notes are disposed when a spec's diff touches what they are *about*
(memory-sweep `diff-hit`) or after 10 undisposed review closes (`ttl-expired`); a carry
disposition records `reviewed: YYYY-MM-DD` in the note's metadata. Comment narration is capped
per file by `.claude/comment-narration.baseline.json` while the sweep runs, and at zero once it
is deleted.

The plugin's own code-group comments — everything under `spec/scripts`, `spec/bin`, `scripts`,
and `tests` — are at zero narration. A new comment there states the current invariant plus one
owner id (a spec path, AC-ID, D-number, ADR, or run id) and nothing else; the standing scan in
`tests/consistency/comment-narration-live.test.js` refuses anything else, and the tracked
baseline holds no code-group path to fall back on. A mechanism explanation survives on its
merits — the rule bans history, not reasons — but it lives in exactly one file, and every other
site that would repeat it carries a one-line citation instead.
