# 555-tools

A Claude Code plugin marketplace with three plugins:

- **spec**: build products quickly with AI, one spec at a time.
- **git**: an add-all commit in two approvals, a guided merge, and per-spec worktree entry.
- **style**: an outcome-first output style that applies wherever the plugin is enabled.

## spec v8

You fill the queue and plan each feature with the strong model. Then the plugin builds it.
One builder writes the spec test-first in its own git worktree, and your own test command
decides green. One fresh reviewer reads the diff against the spec's Intent, Decisions and criteria, and
green merges. A typical spec goes from queued to merged in minutes. Nothing that changes
architecture or behaviour, and nothing irreversible, happens without your yes. Everything
else is decided for you and printed as `📌 Auto-picked … (veto anytime)`. State lives in
small files, so any run survives a crash or a `/clear` and resumes where it stopped.

## Install

```
/plugin marketplace add 555ventures/claude-plugins
/plugin install spec@555-tools
/plugin install git@555-tools            # optional, used by /spec:fix
/plugin install style@555-tools          # optional
```

Needs `git` and Node 22 or newer.

## Lifecycle

A spec moves `draft → hardened → implementing → done`. `/spec:plan` writes and locks it.
`/spec:run`, or `/spec:fanout` for several at once, builds, reviews and merges it. A hook
refuses to run a draft, and blocks destructive git in every checkout while a lane is open.

```
/spec:init                                                   # existing repo, once; commit its files
/spec:plan "let signed-in users export invoices as CSV"      # → specs/20261104/01-invoice-export.md
/spec:run  specs/20261104/01-invoice-export.md               # hardened → done
```

Brand-new project:

```
/spec:mocks                                   # optional: approve the screens first
/spec:genesis "a trading simulator for retail traders in Japan"
/spec:plan docs/roadmap/01-<slug>.md
```

Lost? Run `/spec:status`.

## Commands

| Command | What it does |
|---|---|
| `/spec:init [notes]` | Detects the test command and trunk and writes `.claude/spec.config.json`. Lint and typecheck go into the gate |
| `/spec:doctor [--fix]` | Checks the config, the gate, gitignored worktrees and leftover runs. `--fix` applies the remedies after one yes |
| `/spec:connect [--project <id>] [--name <text>] [--base-url <url>]` | Links the project to the hosted walkthrough review service |
| `/spec:genesis <idea>` | Greenfield only. Covers discovery, a researched stack, ADRs, a green scaffold and roadmap briefs |
| `/spec:mocks` | Gray wireframes of each journey, approved before genesis |
| `/spec:prototype <idea \| brief \| stem> [--stem <name>]` | A throwaway app you argue with in chat; each ruling becomes a pin sentence you confirm. It ends in a behaviour contract that `/spec:plan` turns into ACs and `/spec:run` proves with pin tests before you look at it |
| `/spec:plan <description \| spec \| brief \| contract.json>` | Writes a spec with an Intent block, asks only the real forks, then locks and queues it |
| `/spec:run <spec> [--in-place]` | Builds, gates, reviews and merges one spec in its own worktree |
| `/spec:fanout [<spec>…] [--pick]` | Drains the queue as parallel lanes. Bare picks the batch for you; `--pick` lets you tick it. Each lane rebases onto main as it lands, with the gate green after each |
| `/spec:fix [symptom]` | Root cause in one sentence, a regression test, the fix, the gate, then `/git:commit` |
| `/spec:queue [next\|list\|add\|move\|done\|show]` | Your intended work order |
| `/spec:status` | Roadmap, what to run next, and waiting questions |
| `/spec:release [note]` | Deploys to staging, runs checks against it, and promotes on your yes. Only you start it |
| `/spec:migrate` | One-time upgrade of a v7 repo. It prints a plan, then applies it on your yes |
| `/spec:enforce` | Retired. Init folds lint and typecheck into the gate |
| `/git:commit` | `git add -A` and commit, in two approvals |
| `/git:merge [branch]` | Inspect, pick a strategy, repair conflicts and clean up the worktree |
| `/git:enter-worktree <spec>` | Create or re-enter `.claude/worktrees/spec-<stem>` by hand |

## Seats

| Role | Model |
|---|---|
| genesis, prototype, plan, architecture review | Fable, high effort |
| run and fanout orchestrator | Opus, medium |
| builder | Sonnet, high, retried on Opus after a red gate |
| reviewer | Opus, low (Fable when a spec says `architecture: true`) |

Override any seat with `seats` in `.claude/spec.config.json`.

## Upgrading from v7

Commit or stash your work, then run `/spec:migrate`. It prints a plan, and on your yes trims
the config, archives v7-only files under `docs/archive/v7/`, and commits it all as one
`chore(spec): migrate v7 → v8`. Specs, briefs, ADRs, mocks and prototypes stay as they are.
Before touching the git folder it backs up the v7 queue, fan-out state and review refs to
`.git/spec-v7-backup/<time>/`.

To roll back a repo: `git revert <migrate commit>`, then copy the backup files back into
`.git` and restore the refs listed in `refs.txt` with `git update-ref`. The last v7 plugin
is tagged `spec-v7-final`; branch `v7-legacy` has the retirement notes.

## For plugin authors

Behaviour lives in `spec/scripts/` and is tested by running it (exit codes, files, JSON).
Command prose states intent and hard rules only. See `docs/v8/` for the design and
architecture.
