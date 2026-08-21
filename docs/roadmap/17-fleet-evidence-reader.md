# 17 — Fleet evidence reader (read-only)

Phase: P2
Depends on: none

## Why this brief

The pipeline is data-starved by construction. Every run-ledger row, escape record, and replay
result lives in whichever repo produced it, and nothing reads across them. Measured 2026-08-20:
**11 spec-grounded repos on this machine, 8 with ledgers, ~1,250 rows — this repo's 176 are 14%
of the evidence that exists.** The remaining 86% has never been read together, so every question
about whether the pipeline works has been answered from the least representative sample available
(this repo is ~93% self-repair — the pipeline fixing itself, in the one codebase that resembles no
product).

Three failures this makes concrete:

- **The dead leg.** `review-legs.js`'s at-risk leg passed `[object Object]` to the runner and
  reported `exit=0 files=N` while executing zero tests (2026-08-16 → 2026-08-20). It was visible
  fleet-wide the whole time — exit-0-only across every run in hearwell (5) and prax (2). "Which
  legs have never once gone red anywhere" would have printed the smell weeks before a host review
  tripped over it by hand.
- **The starved incident policy.** `core.md` § Incident Policy promotes a class to a standing
  deterministic guard on its **third recurrence** — counted per repo. Fleet-wide there are **26
  escapes vs the 3 visible here**; a class recurring once in each of three repos never trips the
  trigger. The rule is correct and its denominator is wrong.
- **The unevaluable gate.** JJ's 2026-08-20 ruling made host passes count toward brief 08's gate.
  One query settles it: **8 distinct host specs CLEANed post-v7 (salon-os 5, upwell 3) — clause 1
  (≥5 product passes) is MET**; clause 2 (self-repair share <20%) is not (~65%). Without the
  reader that answer costs ad-hoc jq archaeology and gets skipped or gotten wrong.

Also measured and worth acting on separately: `killedMatch` is null in 22 of 26 escape rows (brief
14's retention isn't yet feeding escape classification), and **2 replay rows across ~380 fleet
reviews**, with seven repos never having replayed.

**The reader is the admission bar's evidence source** (JJ's 2026-08-20 ruling; `core.md`
§ Incident Policy). The bar's derivable tests — materiality's recurrence count, generality's
ledger-recorded class members, removability's countable kill condition — are answered by this
reader, not asserted by the proposer. That is also the reader's invocation point: it runs
whenever a standing guard is proposed or a rejection's reopen condition is evaluated, because
the bar requires its numbers. Until it lands, bar fields are filled from the local ledger and
must say so.

## Scope

One zero-dependency script in `spec/scripts/` conventions (usage header, hand-rolled flags,
`--json` the sole machine format, exit 0 = derived / 2 = usage). No stored state — ~1,250 rows
parse in milliseconds; there is nothing to cache.

- **Discovery: filesystem scan, no registry.** A repo is in scope iff
  `<root>/.claude/spec.config.json` exists, one level under `--repos-root` (default `~/Projects`),
  skipping dotdirs, `node_modules`, and worktree checkouts — brief 03's already-ratified rule,
  reused verbatim. A stored repo list is a spec violation: this repo's registries rot.
- **Population first, always.** Every render leads with repos scanned, rows read, and the
  oldest/newest timestamp per repo. The reader's biggest lie-risk is silent absence — a repo not
  cloned on this machine simply does not exist to it, and the output must say so rather than
  imply fleet completeness.
- **Six fixed queries**, ranked by the failure each would have caught:
  1. **Per-leg red-recency** — runs since each leg last exited non-zero, per repo and fleet-wide.
     A smell detector, not an oracle (a leg can be legitimately clean); the proof-level version
     needs brief 16's executed-count fields. The smell alone would have caught the at-risk death.
  2. **Brief-08 gate evaluation** — distinct host specs CLEANed post-cutover, and in-window
     self-repair share.
  3. **Escape aggregates fleet-wide** — `preventedBy` distribution and per-class recurrence, so
     the Incident Policy's third-recurrence trigger has an honest denominator. The render
     explicitly flags **recurrent-unguarded** classes (≥3 recurrences, no standing guard) —
     the priced cost of the admission bar's rejection bias.
  4. **Replay coverage debt** — replay rows and reviews-since-last-replay per repo. The reader
     cannot schedule (ruled out below); making the debt visible is the only lever that respects
     the autopilot ruling.
  5. **CLEAN-contradicted-by-escape rate** per repo, via the `reviewRunId` join.
  6. **Schema-drift census** — rows failing the current shape, counted per repo. Prices brief 16's
     one-time re-grounding cost, and is free once the parser exists.
- **Drift-tolerant, never silently.** Rows whose shape the reader cannot classify land in a
  counted `unclassifiable` bucket and are printed. Three concrete drift instances already exist
  (pre-v7 rows with `tier:"T3"` and no legs; an escape row with `preventedBy:"test"` outside the
  enum; early rows missing `runId`). Coercing an unknown to zero is the exact defect
  specs/20260820/03 fixed — the reader must not reproduce it against itself.
- **`observed` is opaque, by written contract.** The reader reads structured fields only (leg name
  + exit code, verdict, stage, ts, escape enums, replay outcomes; plan rows' `promiseSweep` is
  already typed JSON). It must never regex the packed strings (`rows=13 carried=12 …`) — that
  would mint precisely the parser brief 16 exists to delete. A test pins that the reader source
  contains no regex over `observed`. When 16's typed fields land the reader gains depth
  additively, including the intended-vs-executed contradiction check fleet-wide.

## Out of scope

- **Any scheduling, watching, daemon, hook, or alerting** — parked by JJ's 2026-08-18 autopilot
  ruling. On-demand invocation only. An aggregator that grows a scheduler is autopilot in
  analytics clothing, and that is this brief's named failure mode.
- **Any write channel.** The reader records nothing, gates nothing, and modifies no repo.
- **New questions as flags.** The six queries are fixed; a seventh needs a spec, not a `--flag`.
  No trends, no charts, no HTML.
- **Command registration in v1.** Manual invocation first — register `/spec:fleet` only once real
  usage shows the paste is annoying. Manual path before automation layers is the standing bar.
- **Per-repo detail views** — each repo's own `/spec:status` owns that.
- **True fleet reach.** The reader sees this machine's checkouts, not the fleet; anything wider
  waits on whatever replaces brief 03.

## Grounding

- `docs/roadmap/03-fleet-provisioning.md` — the discovery rule reused here. **Flag:** 03 itself
  provisions the deleted autopilot daemon (`autopilotd`, hub adapter, enroll) and post-deletion
  reads as substantially dead; it likely wants a superseded marker. Separate decision.
- `docs/roadmap/05-hotspot-audit.md` — superseded, but its out-of-scope line ("cross-host
  aggregation — needs fleet evidence first") names this reader as its own precondition.
- `docs/roadmap/14-reviewer-measurement.md` — complementary: 14 makes the evidence exist, 17 reads
  it. Query 3's `killedMatch`-null rate is a progress metric for 14.
- `docs/roadmap/15-derived-session-queue.md` — 15 defers a cross-repo *queue* aggregator ("what's
  next on this machine"); 17 answers "what happened across these repos". Same discovery mechanics,
  different question — genuinely new work, not the thing 15 deferred, and 17 does not need 15's
  store.
- `docs/roadmap/16-pipeline-spine-as-code.md` — independent. Build 17 now; do not wait for 16 and
  do not force 16 earlier. 17 landing first gives 16 a measured drift census to price its
  re-grounding against.
- `docs/roadmap/08-design-thinning.md` § Gate — the decision waiting on query 2 today.
- `spec/scripts/spec-status.js` — the sole-derivation, zero-stored-state script style this follows.
- `spec/doctrine/core.md` § Incident Policy — the per-repo denominator query 3 corrects.

## Open questions

- Does the Incident Policy's third-recurrence trigger formally adopt the fleet denominator once it
  is computable, or stay per-repo with the fleet count as advisory? A doctrine change either way —
  needs JJ's explicit ruling, not a reader default.
- Is the six-query list sufficient, or does every session want a different slice? If the latter,
  the honest answer is jq literacy rather than a deriver, and this brief should be retired rather
  than extended.
