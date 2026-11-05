# 34 — Lanes that wait for each other

Phase: P3 · Depends on: 32 · Primary workspaces: spec/scripts/fanout.js, spec/scripts/run.js,
spec/scripts/lib/git.js, spec/commands/fanout.md, spec/doctrine.md, spec/scripts/block-worker-git.sh,
docs/v8/interface-contract.md, tests · Risk: T2 (the driver gains a rebase step it never had; the
hook's blocked verbs stay as they are) · Design stage: no · Expected specs: 1

<!-- Minted 2026-11-05 from the v8 fan-out trial on niko-hub and shop-bltr (orchestrator log:
     the trial ran 8 + 12 hardened specs through /spec:fanout on the unfixed 8.0.0 plugin).
     niko-hub batch 1 put three lanes that declared `depends_on` on the fourth lane's spec in
     one batch; two dead-ended at FIX, were dismissed, re-picked in batch 2 on their stale
     worktrees, and dead-ended again because nothing rebases a reused worktree and the hook
     forbids anyone but the driver from doing it. shop-bltr's pilot avoided it only by ordering
     its queue by hand. The small findings of the same trial landed as bf5e0e30. -->

## Result

A fan-out never builds a spec beside or ahead of a spec it depends on, a lane that stops
because it waits for another lane keeps its work and resumes on the trunk that has it, and a
lane never rewrites a locked decision on its own:

- **PLAN reads `depends_on`.** A hardened queued spec whose `depends_on` names a spec that is
  not `done` on trunk waits, and the Waiting line says why: `waits — depends on 20261102/11
  (lane 4 this batch)` when the dependency is in the batch, `blocked — depends on 20261102/08
  (draft)` when it can never land in this fan-out. A dependency that is `done` or missing from
  disk does not hold anything. SELF-PICK offers only specs whose dependencies are done or
  already picked ahead of them, and refuses a tick that would reorder them. The batch keeps
  queue order among the specs it can run; the next batch picks up what waited.
- **A stopped lane keeps its work.** When a lane returns stopped (any reason: question, dependency,
  escalation), the driver commits the worktree's staged build as a single `wip(spec): <stem>`
  commit on the lane branch before anything else happens to it. `dismissed` keeps that commit;
  nothing in the plugin ever discards a lane's uncommitted build.
- **A reused worktree is rebased at `planned`.** When PLAN picks a spec whose worktree and branch
  already exist, `--mark planned` rebases the lane branch onto trunk before dispatch, exactly
  the way MERGE does: a clean rebase dispatches as usual with `state.base` moved to the new
  trunk; a conflicting rebase is left in progress and the dispatch prompt tells the lane agent
  to resolve it first (the same prompt MERGE prints today). The DISPATCH body names each reused
  lane and its new base. A lane whose run state says the rebase is already in progress is not
  touched twice.
- **Waiting is a verb.** At WAIT and RELAY a lane that stopped for a dependency takes `--mark
  waiting --lane N --on <spec>` instead of `answered`/`dismissed`: the lane keeps its WIP commit
  and worktree, leaves the active set so the batch's other lanes merge, and PLAN re-picks it
  automatically once `<spec>` is `done` on trunk (then the rebase above runs). RELAY's question
  text for a dependency stop offers `waiting` first, and a lane that writes a pending question
  of kind `dependency` is marked that way without asking the user.
- **Merge-ready lanes do not wait for the slowest lane.** When every lane is done or stopped the
  driver merges as today; in addition, while lanes are still out, a `returned` lane that is
  MERGE_READY is rebased and fast-forwarded at once when no other lane in the batch is sent back
  or mid-rebase. The trunk gate runs per landing as today. A later lane's rebase onto the moved
  trunk is the existing path.
- **A lane never edits Decisions.** run.md and doctrine say it in one line each; at FIX a
  decision that cannot be met is a pending question (`amend` with the proposed text as the
  option description), never an edit to the spec or to another spec. REVIEW blocks a diff that
  changes a locked Decisions row or any other spec file.
- **The report tells the truth after a rebase.** MERGE_READY and the batch report print the
  lane branch's current head, not the pre-rebase commit.
- **The contract matches the code.** docs/v8/interface-contract.md lists the marks that exist
  (`planned`, `picked`, `dispatched`, `returned`, `resent`, `answered`, `resumed`, `dismissed`,
  `waiting`, `gate-repaired`, `reported`) and no others, and drops the flags fanout never read.

## Not in this brief

- Lane count versus machine load (four concurrent gates made unrelated tests flake in both
  repos). A doctor hint only; separate queue item.
- A gate rerun counting as a repair (shop-bltr lane 4 spent its repair budget on load flakes
  without a builder). Separate queue item for run.js.
- Migrating v7 spec bodies (`## Goal` → `## Intent`); the brief fallback landed in bf5e0e30.

## Acceptance (sketch for the planner)

- A queue of A, B(depends A), C(depends draft D): AUTO picks A and holds B with the in-batch
  reason and C with the draft reason; after A is done, B is picked.
- A lane stopped with staged files: the lane branch has one wip commit; `dismissed` keeps it.
- PLAN re-picking a spec with an existing worktree two commits behind trunk: after `planned`
  the branch is on trunk, state.base is trunk, the dispatch names the rebase; with a conflict
  the rebase is in progress and the prompt says resolve first.
- `waiting --on X`: the lane leaves the active set, the batch merges, and the next PLAN picks it
  once X is done.
- Two lanes out, one returns MERGE_READY: it lands before the other returns.
- A builder diff that edits a Decisions row: REVIEW blocks it.
