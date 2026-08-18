# 14 — Reviewer measurement: retained evidence, scheduled mutation replay, a plan trace

Phase: P1
Depends on: none

## Why this brief

Sequence after the ledger-truth fix spec staged 2026-08-18 — mutation replay writes ledger
rows and needs that spec's `runId` + fail-closed verdict landed first.

v7's central bet is that one executed-evidence reviewer plus deterministic legs replaces
the panel. The 2026-08-18 Fable retainer consult (run on v7's first full pipeline pass,
specs/20260817/07-promise-sweep-leg.md, close commit f7a2b8a) found the bet is currently
unfalsifiable from inside the pipeline:

- **Reviewer conduct is structurally unauditable.** The reviewer's structured return lives
  in a temp file, its scratch is deleted by the Phase 3 hygiene sweep, and the ledger keeps
  only counts. After the fact, nothing distinguishes a rigorous CLEAN from a rubber-stamp —
  in a pipeline whose motto is executed-not-argued, the reviewer is the one component whose
  work is argued.
- **One mutation-replay data point exists, and it was ad hoc.** The consult injected a
  spec-violating defect invisible to all nine deterministic legs into the just-CLEANed tree
  and dispatched the reviewer blind; it caught both halves with executed repro (~98k
  tokens). That rules out rubber-stamping *once*, on a deliberately loud defect. Catch-rate
  over time — the only metric that can separate "reviewer is good" from "blind spot we
  haven't hit yet" — is not collected by anything.
- **The plan stage leaves no trace.** Zero plan rows across all 149 ledger entries, at the
  stage core.md names the judgment concentration point. Build and review are accountable;
  the stage that decides what they do is not.

The escape ledger and mutation replay are the pipeline's only two ground-truth signals —
everything else is self-report. This brief routes the reviewer through both.

## Scope

- **Reviewer evidence retention** — every review persists the reviewer's structured return
  (survivors, killed, and the executed repro evidence each carries) as a durable run
  artifact the hygiene sweep is taught to keep, keyed by the ledger row's `runId`. review.md
  Phase 3 stops treating it as scratch. An escape investigation can then read what the
  reviewer actually checked, not just how many findings it returned.
- **Scheduled mutation replay** — a deterministic harness (script-owned: select a
  just-CLEANed spec, apply a defect from a small typed corpus, verify all legs stay green,
  dispatch the standard reviewer blind, restore the tree) recording catch/miss as a ledger
  row with its own `stage`, so catch-rate is derivable by spec-status tooling. Cadence is
  policy in core.md, not session memory: per major pipeline version at minimum, with
  every-Nth-review as the candidate default.
- **A plan trace** — plan lock appends a ledger row (spike results, promise-sweep counts,
  lock verdict), closing the open design question from the consult. The alternative —
  core.md explicitly declaring the spec artifact to be plan's ledger — is the fallback if
  a row proves redundant with the spec frontmatter; deciding is in scope, silence is not.
- **core.md records the standing** — reviewer catch-rate and the escape ledger named as the
  two ground-truth signals; self-reported review quality explicitly subordinate to them.

## Out of scope

- A second general reviewer in any tier — ruled out by brief 09 on measured evidence;
  a sustained replay miss-rate is the only thing that reopens it, and this brief is what
  makes that number exist.
- The review-accounting fixes themselves (fail-closed verdict, explicit-inert legs, honest
  counts, `runId`) — owned by the ledger-truth spec already staged from the 2026-08-18
  session; this brief consumes them.
- Grading or scoring the retained reviewer evidence automatically — retention first;
  judgment on it stays with escape investigations and replay runs.

## Grounding

- The 2026-08-18 Fable consult findings (session-resident; the CLEAN-on-red-findings-leg
  repro, the ci/at-risk fail-open demonstration, and the mutation-replay transcript) — the
  measured basis for every Scope item.
- `docs/audit/v7-replay-eval.md` — the pre-cutover replay methodology this generalizes
  from a one-time eval into a scheduled harness.
- `.claude/spec-runs.jsonl` — 149 rows, stages build/review/release only; the absent plan
  stage and count-only findings fields are the gap.
- `spec/doctrine/core.md` § Tiers + Incident Policy — judgment-concentration claim for
  plan; third-strike shape for turning a measured miss class into a deterministic guard.
- Memory `spec-review-retainer-beats-solo-panel` — prior evidence that unaudited review
  passes hide real findings.

## Open questions

- Artifact home and shape for retained reviewer evidence: under `specs/{date}/` beside the
  spec (travels with merges) vs a `.claude/spec-runs/` sibling dir keyed by `runId`
  (pipeline-owned, one glob) — and whether repro transcripts are inlined or referenced.
- Defect corpus for replay: hand-authored per major version vs derived mechanically from
  past escapes and killed findings; minimum corpus size before catch-rate means anything.
- Replay cadence default (every Nth review vs time-based) and whether critical-tier specs
  get priority sampling.
- Plan-row schema: what a plan lock can assert honestly (spikes executed, sweep counts)
  without inviting self-report of judgment quality.
