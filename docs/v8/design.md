# spec v8 — design

## What you asked

A lean plugin that helps one person build products rapidly with AI. Same commands and
workflow as v7. A spec should go from "queued" to "merged" in minutes, not 30–60. Agents mainly
fill the queue and you read it and reorder it (ADR-0044); you drive `/spec:plan` yourself, and the
plugin picks from the queue, builds, and merges. You must say yes to anything that changes architecture or behaviour. Nothing
irreversible happens without asking. Reporting style comes from the `style` plugin.
Genesis, mocks, prototype, connect, doctor stay, trimmed.

## What v8 builds

- Same command names: genesis, mocks, connect, prototype, plan, queue, run, fanout, fix,
  status, doctor, init, release, enforce, migrate (temporary), plus git commit / merge.
- One strong model builds a spec end to end in its own worktree; the host test command is
  the gate; green merges. One state file per in-flight spec; a crash resumes from it.
- One fresh-context reviewer at low effort reads the diff against the spec's intent block.
  Fable reviews when the spec is flagged `architecture: true`.
- Fan-out drains the queue N lanes at a time, merges in order, batches lane questions.
- Three hooks: tests-green-before-merge, no destructive git in lanes, no writes outside the
  lane's worktree. Everything else is one page of doctrine.
- Behavioural tests only: exit codes, files, structured JSON output. No wording pins.

## What v8 does not do

- No ledger rows, version bumps, lock/close commits, review legs, disposer, AC matrix,
  prose gates, retired-wording bans, provenance ledgers, design canon, tournaments.
- No Sonnet worker waves with attribution between them.
- No doctrine that enumerates behaviour the model already has.

## Seats

| Seat | Model | Effort |
|---|---|---|
| genesis, prototype pins, plan, architecture review | Fable | high |
| orchestrator (run / fanout loop) | Opus | medium |
| builder, one per spec | Sonnet | high; auto-retry on Opus after one red gate |
| reviewer | Opus | low; Fable when `architecture: true` |
| mechanical lookups | Haiku | low |

## Size budget

| Area | v7 | v8 target |
|---|---|---|
| scripts | 29.5k LOC | ≤ 4k |
| tests | 47k LOC | ≤ 4k |
| rule prose shipped to hosts | 48k words | ≤ 2.5k |
| words loaded for plan + run | 13.3k | ≤ 2k |
| wall-clock per typical spec | 30–60 min | ≤ 10 min |

## State on disk (host repo)

See `architecture.md` §2 for the authoritative table. In short: `.claude/spec.config.json`
(same path as v7), `<spec>.run/state.json` (one sidecar per in-flight spec, gitignored),
`<git-common-dir>/spec-queue.json` and `spec-fanout.json` (same location as v7),
`.claude/pending-question.json`, `design/`, `docs/roadmap/`, `docs/adr/`. Exactly one
module (`lib/state.js`) reads and writes each file.

## Spec lifecycle

`draft → hardened → implementing → done` (v7 names kept, so no spec migration), stored in frontmatter `status:`. A hook
refuses `/spec:run` on a `draft`. Everything else is the driver's job.

## Acceptance gate for v8 itself

Three real specs from the v7 queue, run through v7 and v8 on the same host tree. Compare
diff quality, wall-clock, tokens. v8 ships only if it is par or better on all three. Then a
second orchestrated audit confirms every command works as the interface contract says.
