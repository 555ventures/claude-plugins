- [tests-report] AC-20260813-06-7 requires exercising wf-panel's proposal-survival throw via
  `evalFns` on its "named filter helper", but no function name is locked in the Decisions table
  → pinned the contract as `assertProposalSurvival(proposals)` (throws when `proposals.length < 3`,
  naming the count; returns `proposals` otherwise), matching this repo's existing
  `assertGateArgs`/`assertResolutions`/`crossCheckSentinels` naming convention in
  `wf-build.body.js`, so the implementer has an unambiguous, testable target.
- [doctrine] D11's literal version target (6.64.0) was already taken at HEAD (6.65.0 landed by
  a concurrent commit before this batch ran) → bumped to the next free version, 6.66.0, per the
  spec-pipeline gotcha "a spec Decision naming a literal version-bump target can be stale by
  build time" (specs/20260810/02 D11 precedent).
- [workflow-bodies] D9 requires every return to "pin runId explicitly" but no Decision or
  existing sandbox global (`args`, `agent`, `parallel`, `phase`, `log`, `budget`, `workflow`)
  establishes HOW a script obtains its own run id — `workflow` is declared but unused anywhere
  in this repo, and referencing a bare undeclared identifier would throw at runtime. `args` is
  the only closed-alphabet channel that can carry an id without risk (workflow-author.md: "args
  is a closed alphabet — paths, ids, enums, booleans"), and build.md's existing resume language
  ("reuse the prior runId if known") already implies the orchestrator persists/threads it →
  added `args.runId` to all six bodies' args contracts and echoed `args.runId` into every return
  (never throws if absent; degrades to `runId: undefined` on an unupdated caller). Command-side
  minting/threading is spec 07's adoption work.
- [workflow-bodies] D6's "exhaustion returns surface exhaustedBy ... plus agentsFailed" names
  only the one wf-build/wf-design return that already carries `exhaustedBy`; the gate-repair
  loop that can produce repair-agent deaths lives in the shared `gate-loop.js.frag` (out of
  batch scope) and exposes no death count today → counted repair-dispatch deaths via the
  `repairFn` closure (defined in each `.body.js`, called by the shared loop) plus one for a
  gate-agent death (`exhaustedBy === 'agent-died'`), folded only into that one exhaustion
  return — TestAuthors/Implement/Author-phase agent deaths already short-circuit to an earlier
  `blocked` return before this point, so `agentsFailed` there would always read 0.
- [workflow-bodies] D6's "alsoConsidered: [labels] for options cut by the 2–4 cap" assumed a
  cap already exists; wf-research's OPTION_SET_SCHEMA only *describes* 2–4 options to the
  researcher agent, with no enforced max, and the trailing comment left "curates 2–4" to the
  command (out of batch scope) → enforced the cap (top 4 by `rank`) inside the workflow itself,
  before the Verify phase (so currency checks are never spent on an option about to be cut),
  recording every cut label into `alsoConsidered`.
