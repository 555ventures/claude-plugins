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
scripts write state: `<spec>.run/`, the queue, fanout and release (`spec-release.json`, the
green staging run `/spec:release` promotes from) files in the git common dir, and
`.claude/pending-question.json`. A done or superseded spec is a stub (frontmatter, title, goal,
`text: <sha>`); `git show <sha>:<path>` prints its text.

## Seats

| Seat | Model | Effort |
|---|---|---|
| genesis, prototype, plan | the session's model | the session's effort |
| orchestrator (run, fanout) | opus | medium |
| builder | sonnet; opus from the second attempt | high |
| reviewer | opus | high; xhigh on an `architecture: true` spec |
| queue groom checks | haiku | medium |

Config `seats` overrides these. Dispatch with the model the driver prints. Installed, agents
are namespaced: `spec:builder`, `spec:reviewer`.

## How to drive a driver

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/<x>.js <args>`, do the printed step, run its `--mark`
line, and repeat until the final report. After a
`✅ checkpoint` line `/clear` is safe and the same command resumes. Exit 2 is a refusal naming
its remedy. Every command ends with one report rendered by `lib/report.js`.

## When to ask

One test, three buckets: would the client need to sign this off?
- **Ask** what a developer would take to the client (architecture, behaviour, design, direction; product
  facts are asked, never derived), anything irreversible (production promote, deleting unmerged work,
  destructive git) and the yes on an `architecture: true` Intent (`plan.js lock --confirmed`).
  `/spec:plan` asks its forks once, batched, before lock; a run asks only a false Assumption, a choice the
  spec did not make or a Decision it cannot keep, in the agent's own words, and only the user waives a
  Decision (`amend`). A lane writes its question to `.claude/pending-question.json`; the orchestrator
  relays each verbatim in one AskUserQuestion per RELAY and never answers for the user. A dismissed
  AskUserQuestion stops the run, queued as a decide item; a dismissed promote question promotes nothing.
- **Automate** the mechanical with a rule: a cap on a spec waits for your amend (a fix queues a fix), spec edits revert, a
  secret stays out of the commit, advisories become one fix item, a fix needing a behaviour change goes to
  `/spec:plan`. A builder never improvises on a fork; a lane never edits a spec.
- **Report** each rule's decision as a `📌` line (`📌 Auto-picked <choice> — <reason> (veto anytime)`),
  after the spec's `Users will notice:` line; rulings go into the commit message, never the spec.

Question style: plain words, every option carrying its consequence, the recommended option first,
readable cold in ten seconds by someone with no repo context.

## Glossary

- **lane**: a fanout sub-agent running `/spec:run` on one spec, or `/spec:fix` on one fix, in its own worktree.
- **mark**: `--mark <verb>`, telling a driver its step is done.
- **pin**: a ruling from a prototype round, recorded as a sentence (On <route>[, given …]: <note>); behaviour pins become ACs and pin tests, look pins are checked at LOOK.
- **seat**: a role with a model and effort.
- **checkpoint**: the line after an accepted mark.
- **Intent block**: the top of every spec (asked, will build, won't touch, architecture
  change, client sign-off), given verbatim to builder and reviewer with the Decisions table.
