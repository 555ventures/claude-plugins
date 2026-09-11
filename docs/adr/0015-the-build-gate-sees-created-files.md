# 0015. The build gate sees the files the build created

- Status: accepted
- Date: 2026-09-10
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260910/08-gate-sees-created-files.md)
- Applies to: specs/20260901/01-build-driver.md D12 — only its "never runs a git write (its git
  calls are `rev-parse`, `diff --shortstat`, `status --porcelain`)" clause, which becomes "its
  only index write is the intent-to-add of untracked File Plan paths immediately before the
  gate child"; every other clause of D12 stands (no agent dispatch, no Decisions-table writes,
  no report rendering, no worktree creation/entry/exit).
- Amended by: —

## Context

specs/20260901/01 D12 locked the build driver's absence contract: it never runs a git write, and
named the three read-only calls it does make. That contract was correct until the gate itself
became the thing an index-reading host check runs against. A file the build just created is
untracked until the checkpoint commit, so a check whose inventory is `git ls-files` — a size
baseline, a duplication scan, a file manifest — cannot see it at build time. It runs green over
an inventory that is missing the build's own new files, and reds only at review, after the
commit made them tracked, where the finding is argued instead of fixed.

specs/20260910/08-gate-sees-created-files.md closes that gap by having `runGate()` add every
untracked, non-ignored File Plan path to the index with intent-to-add (`git add -N`) immediately
before the gate child spawns. That is a git write, so D12's absolute "never" no longer holds and
must be narrowed by an accepted record rather than a silent edit — the precedent set by
ADR-0011 and ADR-0014 for a locked contract a later spec needs to change.

## Options considered

- **A. Run a second gate at `--mark committed`**, after the checkpoint commit has made the new
  files tracked. Rejected (specs/20260910/08 D1): amends specs/20260910/07 D1's locked "exactly
  one gate run per round," doubles every build's wall-clock, and leaves an open question — what
  a red gate means once the commit already exists.
- **B. Move the checkpoint commit earlier, before the gate.** Rejected: changes repair semantics
  for every host — a repair round would then be amending a commit rather than the working tree.
- **C. Make index-reading checks (e.g. `size-ratchet.js`) read the working tree instead of the
  index.** Rejected: contradicts that script's own tested rule that untracked files never count,
  and would fix exactly one host's one check while every other index-reading post-gate check
  stayed blind.
- **D. Stage the untracked File Plan paths with intent-to-add inside `runGate()`, before the
  gate child spawns.** Adopted.

## Decision

**Option D.** D12's git-write clause is narrowed from "never runs a git write" to "its only
index write is the intent-to-add of untracked File Plan paths immediately before the gate
child." The narrowing is bounded on every side specs/20260910/08 locks down:

- The pathspec is the spec's own File Plan paths and nothing wider — an untracked file outside
  the File Plan is never staged (D2).
- The staged entries are never reverted by the driver; they persist through repair rounds and
  are consumed by the checkpoint commit (D3).
- A File Plan path a `.gitignore` hides is warned about, left untracked, and does not block the
  gate (D4).
- A failed `git ls-files`/`git add -N` call is a fail-closed refusal — exit 2, no gate child
  spawned, no `gateRuns` entry — never a gate that ran blind (D5).

Every other clause of D12 stands untouched: the driver still never dispatches agents, writes the
Decisions table, renders a report, or creates/enters/leaves a worktree, and its other three git
calls (`rev-parse`, `diff --shortstat`, `status --porcelain`) are unchanged reads.
`spec/commands/build.md` § Rules' matching "or runs a git write" clause is narrowed in the same
build to name this one exception, citing this record.

## Consequences

- specs/20260901/01-build-driver.md D12 is not rewritten in place — it gains only the one
  `Amended by: ADR-0015` backlink line, and this record is the durable account of what changed
  and why.
- The driver's own header `does NOT` list (`spec/scripts/spec-build-driver.js`) is corrected in
  the same build to match the narrowed contract.
- A host whose index-reading check has a stale baseline now reds at build time instead of
  review time — earlier and cheaper to fix, and the intended effect of this record. For this
  repo specifically, a build creating a file under a size-ratcheted tree now reds its own gate
  on `tree-over`; the sanctioned repair is `size-ratchet.js --reconcile --cite <spec>`, which
  reads the same index the gate just populated.
- `git stash` refuses outright on a tree holding intent-to-add entries, and an unstaged diff
  shows such a file's full content instead of omitting it as untracked — neither is on the
  driver's own path, so neither is a new failure mode this record introduces, only one to be
  aware of when working the tree by hand mid-build.
