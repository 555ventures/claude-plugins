# spec — doctrine

## What this plugin does

It turns a feature idea into merged code. `/spec:plan` writes and locks a spec with the user
(`draft → hardened`). `/spec:run`, or `/spec:fanout` for several, has one builder write it
test-first in a worktree, gates on the host's `testCommand`, has a fresh reviewer read the diff
against the spec's Intent, and merges (`implementing → done`). New projects start with
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

Config `seats` overrides these. Dispatch with the model the driver prints.

## How to drive a driver

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/<x>.js <args>`, do the one step it prints, run the
printed `--mark` line, and re-run the driver until it prints the final report. After a
`✅ checkpoint` line `/clear` is safe and the same command resumes. Exit 2 is a refusal naming
its remedy. Every command ends with one report rendered by `lib/report.js`.

## When to ask

Only before anything irreversible (production promote, deleting unmerged work, destructive
git), for a yes on an Intent that changes architecture or behaviour, or when a step says to.
Use AskUserQuestion, recommended option first. Otherwise decide and print
`📌 Auto-picked <choice> — <reason> (veto anytime)`. A lane never asks: its driver writes the
question to `.claude/pending-question.json` for the orchestrator to relay.

## Glossary

- **lane**: a fanout sub-agent running `/spec:run` on one spec in its own worktree.
- **mark**: `--mark <verb>`, telling a driver its step is done.
- **pin**: a note the user leaves on a prototype screen; behaviour pins become tests.
- **seat**: a role with a model and effort.
- **checkpoint**: the line after an accepted mark.
- **Intent block**: the top of every spec (asked, will build, won't touch, architecture
  change), given verbatim to builder and reviewer.
