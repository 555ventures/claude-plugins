# 35 — The client says yes

Phase: P3 · Depends on: 34 · Primary workspaces: spec/doctrine.md, spec/commands/{plan,run,fix,fanout}.md,
spec/agents/{builder,reviewer}.md, spec/templates/spec.md, spec/scripts/{plan,run,fanout}.js,
spec/scripts/lib/pending.js, docs/v8/interface-contract.md, tests · Risk: T2 (new question kinds and
one lock check; no driver step is removed) · Design stage: no · Expected specs: 1

<!-- Minted 2026-11-05 from the v8 trial and a three-way audit of v7's and v8's stop rules. JJ is
     the client contact on client projects: any change a developer would need the client to approve
     (architecture, behaviour, design, direction) must reach JJ. The trial drained 20 specs across
     two repos with zero questions, while lanes rewrote locked Decisions twice. v8's design note
     promised "you must say yes to anything that changes architecture or behaviour"; the code asks
     once, at lock, for `architecture: true` only, and doctrine says "never at run". v7 asked far
     too often, but its product questions came from a few rules that cost nothing when a run is
     clean. This brief brings those back and nothing else. Spec 02 (brief 34) already added the
     `unmet --decision` question and the driver-side spec-edit check; this brief sits on top. -->

## Result

A run asks JJ exactly when a developer would ask the client, and never otherwise. One test decides
every stop: **would the client need to sign this off?** Everything below that line is decided,
auto-picked and reported afterwards. A clean run asks nothing; a run that meets a real fork asks
once, batched.

- **"Real fork" is defined.** plan.md replaces "ask the user only about real forks" with a list:
  a UI flow or screen the user will see change; a permission, restriction or something taken away
  from a user; what happens to existing data (migration, deletion, visibility, retention); pricing,
  limits or a paid service; a breaking change for existing users or integrations; a hard-to-reverse
  architecture choice (persistence, framework, auth, deploy target). Anything on the list is asked
  in ONE batched AskUserQuestion of at most four questions before lock, recommended option first,
  each option carrying its consequence. Anything off the list is decided and written into
  Decisions with its reason. **Product facts are asked, never derived**: a business rule the brief
  or code does not state is a `[NEEDS CLARIFICATION: …]` marker, and the lock refuses open markers
  as today.
- **The lock sees the yes.** The Intent line becomes `Client sign-off: none | <what was asked> —
  <what JJ chose>`. `plan.js lock` refuses when a Decisions row restricts users or the spec is
  marked `breaking: true` and the Intent line says `none` (one regex over the Decisions column,
  the v7 restriction words: cannot, only <role> can, immutable, requires a reason, hidden from).
  `architecture: true` keeps `--confirmed`; `breaking: true` is a frontmatter key again and needs
  the same yes. No tier, no lint beyond this.
- **Assumptions can stop.** The template's `if false:` arm allows the literal `ask` as its value.
  The builder brief prints Assumptions (today it omits them). A builder whose assumption proves
  false uses the written fallback when there is one and returns blocked with the assumption's id
  when the arm says `ask`; run.js turns a blocked return naming an assumption into a pending
  question of kind `assumption` with the fallback options the planner wrote, or retry / park /
  amend when none. The answer is written into the Decisions table and the matching AC in the same
  edit, by the driver, never by the builder.
- **A builder never improvises on a fork.** builder.md says: when the spec leaves a choice the
  client would notice (the "real fork" list above), or a Decision cannot be honoured as written,
  stop and say which, do not pick. run.js (`unmet`, from spec 02) carries it. The same list and
  rule go to the reviewer, whose findings gain a third severity `needs-decision`: a diff that
  silently made such a choice is neither blocking nor advisory; it becomes a pending question of
  kind `decision` naming the choice, with keep / change-to / amend options, before FIX is spent.
- **Only the client waives.** A blocking finding against a Decision cannot be dismissed by a fix
  round that changes the Decision; ESCALATE's `amend` option carries the proposed text (spec 02)
  and is the only path. The driver's spec-edit check (spec 02) stays.
- **Fix keeps one stop.** fix.md lists, after the fix is green, every user-facing string it
  authored and every display or policy choice it made (hidden, reordered, defaulted, reformatted),
  in one AskUserQuestion of at most four; a vetoed item reverts to the pre-fix behaviour. When the
  list is empty the stop is skipped silently. A fix whose root cause needs a schema, API or
  behaviour change stops and offers `/spec:plan` with the diagnosis, as today, but as a refusal
  the driver prints, not prose.
- **Scope widening asks only on named paths.** `.claude/spec.config.json` gains optional
  `askPaths: ["apps/server/src/db/**", "…"]`. A builder that must touch a file outside the File
  Plan goes ahead and lists it, as today; when the file matches `askPaths` the run stops with a
  pending question of kind `scope` (add to scope / file separately / park). The reviewer brief
  marks out-of-plan files that match `askPaths`.
- **Canonical Delta is applied.** When a spec has a `## Canonical Delta` section, the builder
  applies it to the named `docs/canonical/<area>.md` in the build (OTHER_SECTIONS names it; the
  File Plan gains the target implicitly). migrate.js stops promising otherwise. Closes queue item
  q156.
- **Fan-out relays, never answers.** fanout.md says the orchestrator relays every lane question
  to the user verbatim in one AskUserQuestion per RELAY and never answers for them; the only
  unrelayed picks are the ones a step marks `📌 Auto-picked`. The RELAY body groups questions by
  kind (`assumption`, `decision`, `scope`, `unmet`, `escalate`, `conflict`) and prints the lane's
  recommended option first.
- **Doctrine says it in one paragraph.** doctrine.md § When to ask replaces "never at run" with
  the sign-off test, the real-fork list by reference, "product facts are asked, never derived",
  "a builder never improvises on a fork", "only the client waives", and the question style that
  survives from v7: plain language, consequences in every option, recommended first, readable
  cold in ten seconds by someone with no repo context.
- **The contract lists the kinds.** interface-contract.md lists every pending-question kind and
  which step writes it.

## Not in this brief

- v7's `stops.*` policy knobs, tiers, deviations sidecar, promise sweep, AC lint, mandatory
  spikes, genesis's fifteen-key discovery, init's policy rounds: not coming back.
- Mocks, prototype and release stops: unchanged, they already ask.
- Genesis direction round: a later brief, if mocks and prototype prove insufficient.

## Expected question volume

Zero on a clean run. At plan: one batched question per spec that touches the list, usually none.
At build: one per real fork or false assumption with no written fallback. At review: one per
silent client-level choice. At fix: one when strings or policy changed. Far below v7.

## Acceptance (sketch for the planner)

- A spec with a Decisions row "customers cannot cancel after cut-off" and `Client sign-off: none`
  refuses to lock; with the line filled it locks.
- A builder brief contains the Assumptions block; a blocked return naming `A2` whose arm is `ask`
  yields a pending question of kind `assumption`; answering writes the ruling into Decisions and
  the AC.
- A reviewer finding of severity `needs-decision` becomes a pending question before any FIX round.
- A fix that authored one string stops once; a fix with none does not stop.
- An out-of-plan edit under an `askPaths` glob stops with kind `scope`; one outside does not.
- A spec with `## Canonical Delta` lands its rows in the canonical doc in the build commit.
- RELAY prints kinds and never an answer; fanout.md contains the relay rule.
