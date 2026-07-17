---
description: Adversarial panel over the plugin's own doctrine diff — two uncorrelated executor-perspective reviewers read every change to spec/commands/ and spec/doctrine/ since the last shipped version and report under-specification and contradictions before the bump. Advisory; never blocks.
argument-hint: [git ref to diff against, optional — default is the last plugin.json bump]
---

# Doctrine Review: Executor-Perspective Panel on Doctrine Diffs

This command runs **in the claude-plugins repo only** — dev tooling, deliberately NOT
shipped in `spec/commands/`. It closes the one review asymmetry in the system: host code
gets a diff-scaled adversarial panel; doctrine — the highest-replication artifact, where one
gap poisons every future host — gets `npm test` (regex pins on *past* incidents) and a sole
author's read. Natural cadence: after doctrine edits land, before the version bump that
ships them.

**Why executor-perspective:** every intake row in the recurring classes (closed lists,
ambiguous stage ownership, unstated seam decisions — PRAX-20260717-01, the 6.4.1 reviewer
carve-out) was detectable at write time by one question nobody was asking. The author and
their session context cannot ask it — they know what the text *means*. A stranger reading
only the text can.

## Phase 1 — Assemble the diff

Diff base: the last commit that touched `spec/.claude-plugin/plugin.json` (the last shipped
version), or the ref given as `$ARGUMENTS`. Collect the diff restricted to `spec/commands/`,
`spec/doctrine/`, and `spec/templates/`. If the diff is empty, report "nothing to review"
and stop. Note any generated-workflow drift while here: if `spec/workflows/src/` changed but
`spec/workflows/*.js` didn't (or vice versa), flag it — that's a build:workflows miss, not a
panel question.

## Phase 2 — The panel (two uncorrelated reviewers)

Spawn **two independent reviewers** — separate subagents, neither seeing the other's output,
prompted differently so their blind spots don't correlate (the same reason review doctrine
forbids same-context verification). Each gets the diff, the full text of every changed file,
and read access to the repo. Their briefs:

**Reviewer A — the context-free executor.** "You are a faithful but **context-free**
executor (a stranger to this repo's history) receiving only this doctrine text in a host
repo. Walk the changed passages and report every place you would **under-deliver or
improvise**: a list you can satisfy while missing its intent, a decision the text forces you
to invent, a term with no binding definition, an ownership boundary two stages could each
read as the other's. For each: the passage, what you'd do wrong, and what one sentence would
have prevented it."

**Reviewer B — the contradiction sweep.** "Read the diff, then sweep the OTHER doctrine
surfaces (`spec/commands/*.md`, `spec/doctrine/*.md`, `spec/templates/`) for anything this
change now **contradicts**, half-updates, or orphans: a stage that still describes the old
behavior, a template field the new text no longer mentions, a cross-reference that dangles,
two rules an executor cannot satisfy simultaneously. Cite both sides of every conflict
(file: passage vs file: passage)."

## Phase 3 — Report (advisory — never blocks)

Findings ranked by replication cost (how many future hosts pay if it ships), each with the
passage, the failure it predicts, and the one-line fix. The panel **never blocks the bump**
— per the scaffold-ledger lifecycle it ships ADVISORY, because the T3-checkpoint and
refutation-filter retirements are measured evidence against speculative gates. Promotion to
bump-blocking requires what the ledger row names: a panel finding that, left unfixed, shows
up as a host incident (i.e., the panel demonstrably predicts intake rows).

Record the outcome either way: findings fixed pre-bump, findings waived (with why), or
clean. That record IS the promote/retire measurement — an unrecorded advisory run can never
earn promotion.

## Rules

- Reviewers are read-only; fixes are normal-flow work behind `npm test`.
- Never run the panel on its own output loop (no reviewing the review's fixes with the same
  reviewers — fresh spawns or ship).
- A finding that names a *missing* convention row or an *ambiguous* ownership boundary is
  the panel doing its job; "this prose could be shorter" is not a finding.
