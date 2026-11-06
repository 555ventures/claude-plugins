# spec — doctrine

## What this plugin does

It turns an idea into merged code. `/spec:plan` writes and locks a spec with the user
(`draft → hardened`). `/spec:run`, or `/spec:fanout` for several, has one builder write it
test-first in a worktree, gates on the host's `testCommand`, has a fresh reviewer read the diff
against the spec's Intent, Decisions and criteria, and merges. New projects start with
`/spec:genesis`, existing repos with `/spec:init`. Scripts do the mechanics; you supply judgment.

## Files

Config is `.claude/spec.config.json`; specs are `specs/YYYYMMDD/NN-slug.md`; briefs, ADRs and
design live in `docs/roadmap/`, `docs/adr/`, `design/`. You edit specs, briefs and ADRs. Only
scripts write state: `<spec>.run/`, the queue and fanout files in the git common dir, and
`.claude/pending-question.json`.

## Seats

| Seat | Model | Effort |
|---|---|---|
| genesis, prototype, plan, architecture review | fable | high |
| orchestrator (run, fanout) | opus | medium |
| builder | sonnet; opus from the second attempt | high |
| reviewer | opus | low |
| queue groom checks | haiku | low |

Config `seats` overrides these. Dispatch with the model the driver prints. Installed, agents
are namespaced: `spec:builder`, `spec:reviewer`.

## How to drive a driver

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/<x>.js <args>`, do the printed step, run its `--mark`
line, and repeat until the final report. After a
`✅ checkpoint` line `/clear` is safe and the same command resumes. Exit 2 is a refusal naming
its remedy. Every command ends with one report rendered by `lib/report.js`.

## When to ask

One test for every stop: would the client need to sign this off? If a developer would take it
to the client (architecture, behaviour, design, direction), ask; otherwise decide. The real
forks `/spec:plan` names are asked once, batched, before lock; product facts are asked, never
derived. Also ask before anything irreversible (production promote, deleting unmerged work,
destructive git), for a yes on an `architecture: true` Intent (asked once, at
`plan.js lock --confirmed`), or when a step says to. A builder never improvises on a fork; a
lane's driver writes the question to `.claude/pending-question.json` and the orchestrator relays
every lane question verbatim in one AskUserQuestion per RELAY. The orchestrator never answers for
the user; only `📌 Auto-picked` lines are unrelayed. A lane never edits a spec, and only the user
waives a Decision (`amend`): an unmet Decision or false Assumption is a question (`unmet`).
`/spec:fix` asks once, after green, when it authored strings or choices (keep / revert / plan); a fix that needs an architecture or behaviour change is sent to `/spec:plan`, never asked.
Otherwise decide and print `📌 Auto-picked <choice> — <reason> (veto anytime)`.

Question style: plain words, every option carrying its consequence, the recommended option first,
readable cold in ten seconds by someone with no repo context.

## Glossary

- **lane**: a fanout sub-agent running `/spec:run` on one spec in its own worktree.
- **mark**: `--mark <verb>`, telling a driver its step is done.
- **pin**: a note the user leaves on a prototype screen; behaviour pins become tests.
- **seat**: a role with a model and effort.
- **checkpoint**: the line after an accepted mark.
- **Intent block**: the top of every spec (asked, will build, won't touch, architecture
  change, client sign-off), given verbatim to builder and reviewer with the Decisions table.
