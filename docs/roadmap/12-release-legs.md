# 12 — Release legs: the milestone gate's checklist becomes a driver script

Phase: P2
Depends on: none

## Why this brief (stub — expand at plan time)

`/spec:release` is still a prose checklist a session performs by hand — deploy, executed
checks against the artifact, journey walks, substrate rows, report assembly — the same shape
review had before `review-legs.js` collapsed its Phase 0 into one driver. Every deterministic
step drifts per session; only the promote/no-promote judgment and the journey walks need a
model.

## Scope sketch

- A `release-legs.js`-shaped driver runs the deterministic legs (deploy status, executed
  checks, ci, substrate rows), appends manifest rows, prints red/green; `release.md` shrinks
  to judgment steps + disposition + the human promote confirm.
- The feedback-brief step is re-derived against v7 (its intake-stamp consumer died; decide
  what dedup and consumption look like now, or retire the step on evidence).

## Out of scope

- The release surface itself (staging→production flow, confirm gates, ledger row shape).

## Grounding

- Memory `research-20260817-ai-first-best-practice`; `spec/commands/release.md`;
  `spec/scripts/review-legs.js` (the pattern being mirrored).
