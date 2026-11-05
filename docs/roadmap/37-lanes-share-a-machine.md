# 37 — Lanes share a machine

Phase: P3 · Depends on: 34 · Primary workspaces: spec/scripts/run.js, spec/scripts/doctor.js,
spec/scripts/fanout.js, spec/scripts/lib/host.js, spec/agents/builder.md, spec/commands/{fanout,doctor}.md,
tests · Risk: T2 (a repair counter rule and a gate semaphore; no state format change) · Design
stage: no · Expected specs: 1

<!-- Minted 2026-11-05 from the v8 trial. On shop-bltr, four concurrent gates drove load to 9–19:
     every lane in batch 2 hit a red gate on an untouched slow jsdom test; two lanes independently
     "repaired" it by raising vitest timeouts in the same files, which caused every rebase conflict
     of the batch; one lane spent its repair budget on reruns and escalated; /tmp (a 7.8 GB tmpfs)
     filled mid-gate; lane builders had no .env and could not run DB-backed checks. Folds queue
     items q152, q153, q157, q158, q163. -->

## Result

Four lanes on one laptop behave like four developers who know they share it:

- **A rerun is not a repair.** When the gate fails and the failing tests are all outside the
  lane's diff, run.js re-runs the gate once before counting a repair; a second identical failure
  counts. `--mark repaired` without a builder diff since the last gate is refused ("nothing changed
  — re-run the gate or dispatch a builder"), so an orchestrator cannot spend the budget on reruns.
  The REPAIR brief says: a timeout or flake in a test the diff does not touch, under load, is not
  yours to fix; never raise a host timeout to pass.
- **Gates take turns.** The gate step takes a host-wide lock (`<common>/spec-gate.lock`, held by
  pid, stale after the process is gone) so at most `gateConcurrency` gates run at once (config,
  default 2). A lane waiting for the lock says so in its output. Fan-out's lane count stays what it
  is; builders still work in parallel, only the gates queue.
- **Doctor knows the box.** Doctor prints cores, the measured gate time, free space on `TMPDIR`
  and the filesystem that holds the worktrees, and warns when `lanes` exceeds cores / 2, when the
  gate exceeds two minutes, or when free temp space is under 2 GB. fanout.md tells the orchestrator
  to export `TMPDIR` off a tmpfs for suites that write temp data.
- **Lanes get their env.** `.claude/spec.config.json` gains optional `laneFiles: [".env", …]`:
  untracked files copied from the root into every new lane worktree after `worktree add` and
  before `setupCommand`. Doctor warns when the root has a `.env` (or `.env.local`) and `laneFiles`
  does not name it. Files are never committed (they are gitignored in the host by definition).
- **The report counts the waste.** The lane and batch reports print gate reruns and lock waits so
  the cost of load is visible.

## Not in this brief

- Merge order by File Plan overlap (an existing spec covers it).
- Anything that asks the user (brief 35) or the batch loop (brief 36).

## Acceptance (sketch for the planner)

- A red gate whose failures are outside the diff is re-run once before `attempts.repair` moves.
- `--mark repaired` with no diff since the last gate exits 2 with the remedy.
- Two lanes with `gateConcurrency: 1`: the second gate starts only after the first ends; a dead
  holder's lock is stale and taken over.
- Doctor on a 4-core box with `lanes: 4` prints the warning; with `lanes: 2` it does not.
- A root `.env` and `laneFiles: [".env"]`: every new lane worktree has it before setup runs, and
  `git status` in the lane does not show it.
