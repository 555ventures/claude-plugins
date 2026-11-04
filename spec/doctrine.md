# spec — doctrine

## What this plugin does

It turns a feature idea into merged code quickly. You plan a spec with the user. One builder
writes it test-first in a worktree, the host's test command decides green, a fresh reviewer
reads the diff against the spec's Intent, and green merges. Scripts do the mechanics; you
supply judgment.

## Files it reads

- `.claude/spec.config.json`: `testCommand` (the gate), trunk, seats, lanes.
- `specs/YYYYMMDD/NN-slug.md` (the specs), plus `<spec>.run/state.json` for a run in flight.
- `<git-common-dir>/spec-queue.json` and `spec-fanout.json`: the queue and the lanes.
- `.claude/pending-question.json`: lane questions waiting on the user.
- `docs/roadmap/`, `docs/adr/`, `design/`: briefs, ADRs, mocks, prototypes.

Only scripts write state files. You edit specs, briefs and ADRs.

## Lifecycle

`draft → hardened → implementing → done`. `/spec:plan` writes and locks a spec. `/spec:run`,
or `/spec:fanout` for several, takes it to done. New projects start with `/spec:genesis`;
existing repos start with `/spec:init`. A prototype's contract feeds `/spec:plan`.

## Seats

| Seat | Model | Effort |
|---|---|---|
| genesis, prototype, plan, architecture review | fable | high |
| orchestrator (run, fanout) | opus | medium |
| builder | sonnet, then opus after a red retry | high |
| reviewer | opus, or fable when `architecture: true` | low |

Config `seats` overrides these; dispatch with the model the driver prints.

## How to drive a driver

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/<x>.js <args>`. Do the one step it prints, run the
printed `--mark` line, and run the driver again, until it prints the final report. A
`✅ checkpoint` line means `/clear` is safe and the same command resumes. Exit 2 is a refusal
that names its remedy. Every command ends with one report rendered by `lib/report.js`.

## When to ask

Ask the user only:

- before anything irreversible: a production promote, deleting unmerged work, destructive git;
- for a yes on a spec whose Intent says `architecture: yes`;
- when a driver step says to ask.

Use AskUserQuestion, recommended option first. Otherwise derive the answer and print `📌 Auto-picked <choice> — <reason> (veto anytime)`. A lane never asks.
Its question goes to `.claude/pending-question.json` for the orchestrator to relay.

## Glossary

- **lane**: a fanout sub-agent running `/spec:run` on one spec in its own worktree.
- **mark**: `--mark <verb>`, which tells a driver its step is done.
- **pin**: a note the user leaves on a prototype screen. Behaviour pins become tests.
- **seat**: a role with a model and effort.
- **checkpoint**: the line after an accepted mark; `/clear` is safe.
- **Intent block**: the top of every spec, covering what was asked, what will be built, what
  won't be touched, and whether the architecture changes. Builder and reviewer get it
  verbatim.
