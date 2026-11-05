# 36 — A batch ends clean

Phase: P3 · Depends on: 34 · Primary workspaces: spec/scripts/fanout.js, spec/scripts/lib/driver.js,
spec/scripts/lib/git.js, spec/commands/fanout.md, docs/v8/interface-contract.md, tests · Risk: T2
(the fan-out loop and the merge order change; lane and run state formats do not) · Design stage: no ·
Expected specs: 1

<!-- Minted 2026-11-05 from the v8 trial's third round of findings on niko-hub, shop-bltr and this
     repo, after spec 02 (brief 34) landed. Folds queue items q159, q162, q164, q166 and the
     report-text findings. Everything here is driver behaviour; nothing asks the user more. -->

## Result

A fan-out batch starts with a fresh orchestrator, lands only green work on trunk, drains the fixes
its own lanes created, and tells the truth in every report:

- **A batch ends the turn.** After `reported`, the driver does not loop to PLAN in the same turn.
  REPORT ends with `N specs and M fixes left — /clear, then /spec:fanout to continue` (or `queue
  drained`), and fanout.md says the orchestrator stops there. shop-bltr ran three batches, twelve
  specs and five hours in one session; every lane's return sat in that context.
- **Fixes are lanes too.** A `/spec:fix …` queue item written by a parked lane is runnable: PLAN
  picks it after the spec it came from is `done`, a lane runs `/spec:fix` the way it runs
  `/spec:run`, and the merge path is the same. The interface contract's `--include-fixes` flag is
  deleted; the behaviour is the default.
- **Trunk never goes red from a moved base.** At MERGE, when a lane's run base is older than the
  trunk head, the driver rebases, runs the gate on the rebased lane, and fast-forwards only on
  green; a red result sends the lane back with the first failing line, the same way a conflict
  does. A lane whose base is the trunk head lands as today. MERGE_RED stays for the case where
  trunk itself was red, and its body prints the first failing error line, not the task list.
- **Dismiss can discard.** `--mark dismissed --lane N --discard` removes the lane worktree and
  branch after the WIP commit (so the sha is printed and recoverable from the reflog for a day) and
  sets the spec back to hardened. Without `--discard`, dismissed keeps everything as today.
  `dismissed` is accepted at DISPATCH, MERGE_RED and REPORT too.
- **A mark that already happened is not an error.** When a mark is re-run after a refused auto step
  and its effect is already in the state, the driver runs the pending auto steps, prints the
  checkpoint and exits 0 (today it merges, then refuses "not accepted at REPORT" with exit 2, and
  an orchestrator reads a successful merge as a failure).
- **Reports say what trunk has.** The dismissed line says `spec left hardened in the lane` and
  names trunk's status when it differs (superseded, done); the REPORT and MERGE_READY lines print
  the current branch head. The WAIT body says a lane at ESCALATE holds a question until it is
  marked returned.
- **Evidence has a channel.** An AC that asks for something "recorded in the commit message" cannot
  be met: the driver owns the message. The lane writes `<spec>.run/evidence.md` (listings, renders,
  counts the ACs name) and the driver appends it to the build commit body at COMMIT; plan.md says
  evidence ACs name that file. (04 AC-10 and 05 AC-14 in this repo were unmeetable as written.)
- **A missing state file is named, not hidden.** When lane markers exist but `spec-fanout.json`
  does not, the driver refuses with the newest `spec-v7-backup/*/spec-fanout.json` as the remedy
  instead of printing "queue drained" (two running lanes were reported drained on both hosts after
  a migrate wipe). `gate-repaired` with no new commit is allowed and the MERGE_RED text says so
  (a flaky re-run needs no commit).
- **The contract lists what exists.** interface-contract.md names the marks and flags the code
  accepts and no others (`groom` is gone from § 7), and queue.js refuses a trailing `--type` or
  `--after` with no value instead of ignoring it.

## Not in this brief

- Load, concurrency and host environment: brief 37.
- Asking the user: brief 35.

## Acceptance (sketch for the planner)

- After `reported` with specs left, the driver output ends with the `/clear` line and no PLAN
  body; the next bare run plans.
- A parked lane's `/spec:fix` item is picked once its spec is done and lands through the same
  merge path.
- Two lanes out, trunk moves by one, the second lane's rebased gate is red: the lane is sent back
  with the failing line; trunk head is unchanged.
- `dismissed --discard` leaves no worktree or branch and prints the WIP sha.
- A refused `returned` (dirty tree) followed by the same mark after the tree is clean exits 0.
