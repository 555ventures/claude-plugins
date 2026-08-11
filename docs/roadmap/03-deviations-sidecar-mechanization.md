# 03 — Deviations sidecar mechanization

Phase: P3
Depends on: none

## Why this brief

The deviations sidecar (`<spec>.deviations.md`, `spec/doctrine/shared.md` § Escalation, `build.md`
Phase 2/§ ledger row, `review.md` Phase 3 close) is today entirely conventional: a worker
*appends* a line by hand when it takes a conservative option under a forced-but-unblocking
departure, `/spec:review` *reads* the file by hand at close and folds recurring entries into the
host rules' Gotchas section, then deletes it. Nothing enforces that a worker who should have
appended actually did, nothing validates the line shape it wrote, and nothing catches a sidecar
that review forgot to fold before deleting. The mechanism works because build workers and review
have so far complied by convention — this brief exists to record that the compliance is not
backstopped, before an unmechanized append/fold cycle produces a silent loss the way asserted
(never executed) liveness did for terminal observability (specs/20260810/02).

Raised and deliberately deferred during specs/20260810/02-terminal-observable-acs.md (D10): the
retainer ruling on 2026-08-10 was that mechanizing this backstop is real but separate work, not a
rider on that spec's narrower fix. This brief is the durable record of that deferral, per
`plan.md` Phase 4 step 2 (session-discovered follow-up work gets a brief, never a conversational
promise).

## Scope

- **Shape validation.** A deterministic check (candidate home: a `spec-paths`-resolved script, or
  a `/spec:review` Phase 3 step) that a `<spec>.deviations.md` sidecar, if present, has one entry
  per line in the `- [<batch id>] <what forced it> → <what you did>` shape workers are instructed
  to write (spec-pipeline task doctrine for build workers). A malformed line is a review finding,
  not a silent skip.
- **Fold-completeness backstop.** Some evidence that review's Phase 3 fold-in step actually ran
  before the sidecar was deleted — e.g. the close commit's diff must show the sidecar path
  removed in the same commit that touches the host rules' Gotchas section (when the sidecar had
  recurring-class entries) or the spec's Rationale (when only one-off entries existed), so an
  accidentally-skipped fold leaves forensic evidence instead of vanishing with the file.
- **Ledger visibility.** `deviations: <n>` already lands in the build ledger row
  (`build.md` § ledger row shape); this brief considers whether the *fold outcome*
  (rows promoted to Gotchas vs. absorbed into Rationale vs. rejected) deserves the same
  visibility at review close, so a pattern of forced departures is discoverable across specs
  without re-reading every closed spec's Rationale by hand.

## Grounding

- `spec/doctrine/shared.md` § Escalation contract — "Deviations sidecar" paragraph (the append
  contract workers follow).
- `spec/commands/build.md` Phase 2 (dispatch grounding includes the sidecar), § ledger row shape
  (`"deviations":<n>` = sidecar line count).
- `spec/commands/review.md` Phase 3 — "Deviation fold-in" step (read, fold recurring entries into
  Gotchas tagged `[host]`/`[plugin]`, absorb one-offs into Rationale, delete).
- specs/20260810/02-terminal-observable-acs.md D10 — the deferral ruling this brief transcribes.
- Precedent: this repo's own scaffold-ledger history (`spec/doctrine/scaffold-ledger.md`) is
  asserted-liveness dying and executed-liveness earning gate status repeatedly — the same
  pattern applies to an append/fold convention with no execution-grounded check behind it.

## Out of scope

- Changing what counts as a forced-but-unblocking departure, or the six-trigger escalation
  contract it sits beside (`shared.md` § Escalation) — this brief mechanizes the existing
  convention, it does not redesign when a worker reaches for the sidecar versus a `blocked`
  return or a retainer consult.
- A new review leg or agent — any mechanization here rides existing gates (`/spec:review` Phase
  3, or a `spec-paths`-resolved script invoked from a step that already runs), per this repo's
  standing bias against minting new mechanisms for what an existing gate can absorb.
- Retroactively validating already-folded/deleted sidecars from closed specs.

## Open questions

- Whether shape validation lives as a review-time script (new `spec-paths` key) or as a regex
  check inline in `/spec:review` Phase 3 prose — the same "gate vs. doctrine" tradeoff every
  ledger row in `scaffold-ledger.md` already states a promote/retire condition for.
- Whether fold-outcome visibility belongs in the review ledger row, the release report, or
  neither until a second incident shows the gap actually costs something (this repo's usual bar
  for spending a new mechanism).
