# 0046. A done spec is a stub; history holds its text

- Status: accepted
- Date: 2026-11-07

## Context

Finished specs stayed in `specs/` at full size forever: 320 here (304 done, ~24 KB median,
8.6 MB), 60–100 new specs a month in every host. Nothing in the pipeline reads a done spec's
body except `plan.js` pin coverage and a fix lane on that spec; every other reader derives
state from the frontmatter (ADR-0041 §3). Real use over 32 days and 1,225 sessions: a done
spec's body was read in 1.7 % of sessions, 0.4 % of tool output, and every such read is
answerable by `git show`. The cost that did show up is upkeep (439 `[retired:]` tags across 95
done specs) and planners reading whole sibling specs. Deleting done specs outright was rejected:
brief state is derived from member specs on disk, so a brief with no files reads `unplanned`,
and `after:` gates, bound fixes and pin coverage break.

## Options considered

- **Keep every spec whole** — status quo; unbounded growth, the planner reads history.
- **Delete done specs when their brief closes** — breaks brief state, gates, fixes and pin
  coverage; two thirds of specs have no brief; no brief-closed event exists.
- **Compact done specs to their record sections** — halves size, does not bound it.
- **Stub at merge** — keep the frontmatter, title, goal, AC ids (with pin cites) and the sha
  of the commit holding the full text; delete the rest in a trunk commit after every merge.

## Decision

Stub at merge. A done or superseded spec on disk is its frontmatter plus `text: <sha>` and
`acs: [ids]`, its title and its Goal; `git show <sha>:<path>` prints the full text. The sweep
runs after every merge, in every host, on every finished spec not yet a stub — existing specs
included, with no migrate step. A fix on a stub hydrates the full text into its own copy, and
the next sweep stubs it again.

## Consequences

- `specs/` grows by ~300 bytes per finished spec instead of ~24 KB; the planner and reviewer
  stop being sent to old bodies; the `[retired:]` tags leave with the bodies.
- One `chore(spec): stub …` commit follows each merge; a host's first merge after upgrade
  stubs its whole backlog in one commit.
- Reading a finished spec's Decisions or As built takes one `git show`; a shallow clone
  cannot hydrate a stub for a fix and is refused with the fetch to run.
