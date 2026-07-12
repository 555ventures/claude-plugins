---
description: Registry of every distrust/guard mechanism in the spec pipeline — gate, advisory, or structural — each with its justifying incident/measurement and the condition that promotes or retires it; read by /spec:doctor's scaffold audit
---

# Scaffold Ledger: Distrust & Guard Mechanisms

Every harness component encodes an assumption about what the model can't do on its own —
and those assumptions must be stress-tested each model generation (Anthropic's harness-design
principle). This file is where the pipeline's assumptions are named, dated, and made
falsifiable, so "we've always had this check" never substitutes for evidence. The lifecycle
rule: a mechanism is **ADVISORY** until measurement promotes it to a **GATE**; a **GATE** is
**RETIRED** when its justifying data stops holding for the current model generation; **no
mechanism ships without naming the measurement that would retire or promote it.** A row with
no promote/retire condition is a mechanism nobody has agreed to ever remove or upgrade — that
is a defect in the row, not a property of a permanent mechanism (permanence is still a
condition: "retire never," stated, with its reason).

| Mechanism | Kind | Justification (incident/measurement, dated) | Earned under | Promote/retire condition |
|---|---|---|---|---|
| Worker git ban | gate | A worker's repo-wide `git checkout .` destroyed sibling workers' uncommitted edits (pre-2026). | Sonnet 4-era | Retire never — cheap, structural, zero-token. |
| Closed-alphabet args (no free text) | structural | Args JSON corruption misdiagnosed for 3 sessions as a size cap (2026-06). | Harness-level, model-independent | Retire only if the harness guarantees object delivery (no string-vs-object encoding inconsistency left to defend against). |
| Gate sentinel + self-contradiction guard (`__GATE_PASS__`) | gate | A Haiku gate-reader reported a non-zero typecheck as clean. | Haiku 4-era | Retire if gate execution moves out of model hands entirely (a script reads the exit code directly; no model narrates pass/fail). |
| Fail-closed reviewer (`REVIEWER_FAILED` ≠ `CLEAN`) | gate | A crashed sole reviewer would otherwise return a false CLEAN. | Structural | Retire never. |
| Refutation filter (claim-only refuters) | gate — RETIRED v5 | 2026-07 ledgers: killed only 4 findings across the full window; execution audit overturned 2 of 3 audited kills. | Sonnet 4.5-era | Retired — argument-based kills ran an unaffordable false-kill rate; replaced by execution-grounded verification. Re-promote only if a future ledger shows argument-only kills recovering a low false-kill rate. |
| Mandatory T3 retainer checkpoints | gate — RETIRED v5 | 2026-07 ledgers: 100% PASS across every measured run. | Opus 4-era | Retired — a gate that never blocks is spend, not signal; surprise-driven consults remain. Re-promote if a future ledger shows a checkpoint catching a real issue. |
| Execution-grounded verification (kills need repro/sanction/miscitation) | gate | Same 2026-07 measurements (2/3 audited kills wrong). | Fable 5-era | Retire per-severity if two consecutive quarters of escape data show zero killed-and-real findings. |
| Behavioral evaluator (verify skill driving ACs) | advisory | Introduced v5 on Anthropic's measured verification-skill ROI; no local ground truth yet. | Fable 5-era | PROMOTE to gate when the ledger shows its verdicts track escapes; retire if two quarters of data show no signal. |
| Vision design review | advisory | Introduced v5; catches render-vs-mock divergence no deterministic check can. | Fable 5-era | Promote/retire on catalog-loop hit rate. |
| Driver-stepped design session | structural | Resumed sessions unreliably reconstructed phase state from conversation; state moved to disk (v3). | Opus 4-era | Keep while zero-token; re-evaluate only if the driver itself becomes a maintenance hotspot. |
| Diff-scaled review panel | gate-sizing | 2026-07 ledgers: a 197-loc diff drew a 308K-token review; 61% of review spend returned CLEAN. | Fable 5-era | Re-tune thresholds each quarter from ledger loc-vs-findings data. |
| Roadmap as genesis phase (no standalone /spec:roadmap command) | structural | UpWell (2026-07): the genesis chain ended with no plannable unit — the user hand-authored docs/roadmap/ to make /spec:plan invocable. The artifact was proven needed; a separate command would re-pay for context genesis already holds hot, and an optional command is skippable-by-default (the exact observed failure). | Fable 5-era | PROMOTE to a /spec:roadmap command when a brownfield (non-genesis) project needs a roadmap and the template-only path (roadmap-overview.md + roadmap-brief.md, hand-invoked) proves insufficient in practice. RETIRE the phase if two genesis projects discard or ignore their generated roadmaps. |

## Adding a row

A new mechanism enters this ledger the same run it enters the pipeline — never
retroactively. Every row requires all five fields:

- **Mechanism** — the guard by name, matching the string/marker it manifests as in generated
  files (so the doctor's grep can find it).
- **Kind** — `gate` (blocks), `advisory` (reports, never blocks), `structural` (zero-token
  shape, not a runtime check), or a named variant when the mechanism doesn't block/report but
  tunes another gate's intensity (e.g. `gate-sizing`).
- **Justification** — the incident or measurement that earned the mechanism, dated. "Seemed
  prudent" is not a justification; an incident (what broke, when) or a measurement (a ledger
  query, its result, its date range) is.
- **Earned under** — the model generation the justification was measured against (family +
  version, e.g. `Sonnet 4.5-era`), or `structural`/`harness-level, model-independent` when no
  model generation applies.
- **Promote/retire condition** — the specific, checkable condition that would move this row
  (advisory → gate, gate → retired, or an explicit "retire never" with its reason). Must name
  a measurement or a ledger query where one is possible — not "if it stops being useful."

**A row without a promote/retire condition is invalid** — do not land it; the mechanism ships
with no way for a future model generation, or a future `/spec:doctor` run, to know when to
stop trusting it or start trusting it more.
