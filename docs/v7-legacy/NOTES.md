# v7 legacy notes (2026-11-04)

This branch is the last v7 plugin state, tag `spec-v7-final` (8d518e95, main at 6c3d110e).
v8 replaced it: a from-scratch rewrite with the same commands, developed on branch `v8`.
Why, with numbers: `docs/v8/` on the v8 branch (audit, design, blind v7-vs-v8 comparison,
treatment experiments).

## Rolling back to v7

1. On main: `git revert -m 1 <v8 merge commit>` (or reset main to `spec-v7-final` before pushing).
2. In a host that ran `/spec:migrate`: `git revert <migrate commit>`, then copy the files from
   `<git-common-dir>/spec-v7-backup/<timestamp>/` back into the git dir and restore refs with
   `git update-ref` from `refs.txt`.
3. If a marketplace refresh will not downgrade 8.x to 7.x, ship v7's code as 8.0.1 or reinstall.

## Queue items left open at retirement

All six target v7 code that v8 deleted. They were cleared from the queue at retirement.
Disposition per item:

| id | about | status under v8 |
|---|---|---|
| q31 | always-same asks in init, plan, fix, doctor | resolved by design: v8 init asks only what it cannot detect, plan has no tier lock, fix has no decisions stop |
| q33 | fan-out marks /spec:fix lanes stopped because of ledger appends | moot: v8 has no ledger |
| q24 | brief 33, every question is a driver stop | moot: v7 roadmap brief |
| q32 | fan-out lanes cut from a stale base | resolved by design: v8 cuts lane worktrees from trunk at DISPATCH; re-check once fan-out runs on a real host |
| q40 | tag sole-executor tests [invariant] | moot: v8 has no test expiry |
| q41 | catch-up expiry sweep | moot: v8 has no test expiry |

Full text as recorded:

```
### q31
q31  prompt

/spec:fix Repeated always-same asks outside the drivers: /spec:init policy rounds 1+2 (8 questions; write POLICY_DEFAULTS with one 📌 line per key, veto --ask-policy), init substrate create, init no-remote CI inert, init write-confirm when the dry-run shows no drift; /spec:plan critical 'lock it now?' (lock + 📌, veto --draft); /spec:fix authored-strings decisions stop (print as 📌 veto window, stops.fixDecisions); /spec:doctor --fix per-patch yes (apply all cited patches, veto --ask; test deletion stays human)

### q33
q33  prompt

/spec:fix fanout-driver inspectReturned marks every /spec:fix lane 'stopped — returned without a recognised stop' because it requires a clean worktree, but /spec:fix appends its fix row to .claude/spec-runs.jsonl uncommitted after /git:commit (q29 lane, 2026-11-04); the merge step never runs and the fix row is lost with the worktree. Treat a dirty tree whose only change is spec-runs.jsonl appends as merge-ready and promote the rows at MERGE like spec lanes do

### q24
q24  brief

brief 33 (every-question-is-a-driver-stop)

### q32
q32  prompt

/spec:fix Fan-out lane worktrees are cut from a stale base (the harness worktree for spec 08 sat at 7558f342 after spec 06 merged as 00f8cd2a), so a lane builds on old code; the dispatch prompt's first command must fast-forward the lane branch to the main root's HEAD and refuse if it cannot. Also the build driver's preflight moves a spec to implementing while a depends_on spec is not done on the lane's base — refuse there with the remedy instead

### q40
q40  prompt
⏳ gate met

/spec:fix tag sole-executor tests [invariant]: run the suite under --experimental-test-coverage once per test file, mark every test that is the only executor of a spec/scripts code path with [invariant] in its title, so the catch-up sweep under spec 13's keep rule keeps real guards; root cause: no existing test carries the tag the new keep rule reads

### q41
q41  prompt
⏳ gate met

/spec:fix run the catch-up expiry sweep once under spec 13's keep rule, after the [invariant] tagging pass: node spec/scripts/expire-tests.js --root . --all-done --apply, commit the deletions, record tests and wall-clock before and after; root cause: ~1,150 AC-tagged tests of closed specs predate close-time expiry (replaces q26, whose gate was spec 20261103/05 and whose rule retired only 83)
```

## Branches holding unmerged v7 work

Uncommitted work in each worktree was committed onto its branch as `wip` before the
worktrees were removed. The branches are kept.

| branch | holds |
|---|---|
| fix/q29 | stop-policy query for /spec:fix rejectWithEvidence, plus a ledger edit (wip) |
| fix/q31 | partial q31 lane: init/plan prose, policy-round test, config (wip) |
| worktree-agent-a0b912af44c354a81 | review-legs spike and a gate-reuse spike test (wip) |
| worktree-agent-a803bb2fe055ef381 | lock of 20261103/15 (already on main via merge) |
| plan/review-manifest-one-reader | lock of 20261104/01 (merged) |
| plan/fanout-two-modes | lock of 20261103/12 (merged) |

## v7 features v8 does not carry

Fan-out `--include-fixes`, `--override-serial`, `--ask`; status `NN` and `--all`; queue
`groom` and the `add` options; enforce as a command; init policy rounds; plan's critical-tier
lock; fix's decisions and waive stops; commit's escape, fix and supersession rows; review legs,
disposer, ledger, test expiry, tiers; genesis tournament and Storybook design stage; mocks waive;
prototype pictures and states.json; spec sections Users, Contracts, UI, Data Model, Behavior,
Rationale, Canonical Delta. The blind comparison found none of these improved the shipped code.
