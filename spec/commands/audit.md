---
description: Hotspot-targeted whole-repo debt audit — derives churn×complexity hotspots, hunts cross-spec smells over only those files, verifies every finding against live code, and forces exactly one disposition per finding into a ledger the next audit reads first
argument-hint: [--since <days>] [--top <n>], optional
---

# Spec Audit: Hotspot-Targeted Debt Intake

The pipeline's slow, whole-repo judgment layer. Per-spec review and the smell lens (shared §
Model Placement's `/spec:enforce` neighbor) both work file-by-file inside one diff; nothing
looks at the repo's shape over time. `/spec:audit` closes that gap: it targets the files where
churn and complexity compound (the empirically backed debt signal — CodeScene/Tornhill), hunts
the four canonical cross-spec smells there, verifies each finding against live code, and
disposes of every surviving finding into a durable ledger — so a finding either gets a fate or
it gets suppressed as already-adjudicated, and it never just quietly recurs next time.

**Intended model: Opus** — judgment-adjacent work outside the build/review loop, the same
placement class as `/spec:enforce` (named exception, shared § Model Placement). The hunt readers
and the per-finding verifiers are **Sonnet**, dispatched inline from this session — no
`wf-audit` workflow exists; the fan-out (~10 readers, one verifier per finding) is inside
inline-dispatch scale.

**Setup:** run `spec-paths shared-for audit` and read its output. Read the host's
`.claude/spec.config.json`. No `.claude/spec.config.json` → STOP: tell the user to run
`/spec:init` first.

## Input

`$ARGUMENTS` — optional `--since <days>` (default 90) and `--top <n>` (default 10), passed
through to the hotspot derivation.

## The disposition ledger

`docs/audit/debt-ledger.md` (host repo, co-located with the review smell lens's
`docs/audit/advisory-findings.md`) is one row per adjudicated finding:

```
| Date | Class | Location | Finding | Fate | Reference |
| 2026-08-12 | duplication | src/a.ts:40 + src/b.ts:88 | <one-line claim> | refactor-brief(07) | docs/roadmap/07-dedupe-parsers.md |
```

Fate is a **closed enum**: `refactor-brief(NN)` | `rule-row` | `enforcer` | `rejected(<reason>)`
— no fate is ever silent or deferred to memory. <!-- enforcedBy: tests/audit/audit.test.js -->
Class is a kebab-case slug; the canonical four are `duplication`, `boundary-erosion`,
`dead-seam`, `error-masking` (open set — new slugs are allowed; promotion counts by exact slug).

**This command never edits host source and never gates any pipeline stage** — findings become
dispositions only; no `spec-state-gate.sh` case exists for it and `spec/hooks/hooks.json` is
untouched. <!-- enforcedBy: tests/audit/audit.test.js -->

## Phase 0 — Ledger first (read before hunting)

1. **Read the ledger.** Absent file = first audit ever (treat as empty). This audit reads the
   ledger **before** presenting any new finding. <!-- enforcedBy: tests/audit/audit.test.js -->
2. **Suppress recurrence.** A candidate finding whose class + location file matches a prior
   `rejected` row is dropped before it is ever shown — it was already adjudicated.
3. **Recurrence promotion.** Count ledger rows per class slug across fates `refactor-brief` and
   `rule-row`, cumulative, all time. **Any slug at ≥2 rows MUST be re-adjudicated for promotion
   to `enforcer`** via a dedicated `AskUserQuestion` before any new finding is presented — the
   question states the class, the ≥2 prior fates it landed under, and the outcome-phrased choice
   (mechanize now vs. keep paying it down brief-by-brief). <!-- enforcedBy:
   tests/audit/audit.test.js --> A declined promotion is recorded as a normal `rejected(<reason>)`
   ledger row for the *promotion* candidacy — it does not touch the earlier rows' own fates.
4. **Ingest the smell lens's seed candidates.** Read `docs/audit/advisory-findings.md` (absent =
   no-op, never an error — the lens may not have shipped or fired yet on this host). Its accepted
   rows enter Phase 3 disposition exactly like this audit's own verified findings, tagged
   `source: review-lens`. This audit never re-derives per-diff smells itself — that is the
   lens's job (shared § Model Placement's review panel).

## Phase 1 — Target (derive the hotspots)

Run `node "$(spec-paths hotspot)" --root . --json` — pass through `--since`/`--top` from
`$ARGUMENTS` (see Contracts below). Present the ranked table (path, commits, complexity, score)
with one line of framing. **The audit reads only these files** for new findings — readers may
pull directly-referenced neighbors for verification context, never to originate a new finding
outside the hotspot set.

## Phase 2 — Hunt (parallel Sonnet readers)

Dispatch one `Agent {model: "sonnet"}` per hotspot file (or per directory when hotspots
cluster; cap ~10 agents). Each reader hunts the four canonical smell classes over its assigned
file(s) only — `duplication`, `boundary-erosion`, `dead-seam`, `error-masking` — and returns
structured findings: `{class, locations: ["file:line", …], claim, evidence}` with the claim
quoting the offending code. An empty findings list from a reader is a valid outcome, never a
sign of a missed prompt.

## Phase 3 — Verify (one Sonnet verifier per finding)

For every surviving candidate (this audit's own Phase 2 findings plus Phase 0's ingested
`review-lens` rows), dispatch one `Agent {model: "sonnet"}` blind to the reader's reasoning: it
checks the claim against live code — both cited locations exist, the duplication/masking is
real, the seam is genuinely dead. A failed verification drops the finding with one summary
line; it is never presented as a finding.

## Phase 4 — Disposition (one fate per finding, executed immediately)

Present surviving findings in batched `AskUserQuestion` calls, **≤4 findings per call**, one
question per finding, options phrased by outcome (not mechanism):

- **Write a refactor brief** → `refactor-brief(NN)`
- **Add a rule** → `rule-row`
- **Mechanize a check** → `enforcer`
- **Not worth acting on (name why)** → `rejected(<reason>)`

`AskUserQuestion` dismissed → STOP; ledger rows already appended this run stay appended, nothing
further is asked or written.

**Every answer executes immediately** (D8) — the fate is never queued for later:

- `refactor-brief(NN)`: read `docs/roadmap/00-overview.md`'s conventions (create
  `docs/roadmap/` + a minimal overview if absent — never invent the brief-writing recipe here,
  it lives at `/spec:plan`'s roadmap-brief intake). `NN` = max existing `docs/roadmap/NN-*.md`
  number **+ 1** — never fill a gap; this is what keeps `spec-status`'s sequence-order skip
  anomaly quiet. Write the brief from `roadmap-brief.md`, and append a Sequence-table row when
  the overview carries one.
- `rule-row`: show the user the exact clause text before writing it, then append it to the
  host's pipeline rules file.
- `enforcer`: record the proposed `/spec:enforce` cell (stack × category, from the reserved
  taxonomy) in the ledger row's Reference column; the report offers `/spec:enforce` next.
- `rejected(<reason>)`: record the reason verbatim in the ledger row.

Append the ledger row for each disposed finding to `docs/audit/debt-ledger.md` (create the file
with a header comment naming the Contracts-section row shape, on first append).

## Report

Print exactly this shape (rationale: shared § Console Output Style); fill the slots, drop any
line whose slot is empty, add nothing else:

```
✅ **audit complete — {N} findings, {M} disposed**
   (or: 🚫 **{what blocked disposition}**)
- hotspots scanned: {top-N list, one line}
- fates: {refactor-brief: n · rule-row: n · enforcer: n · rejected: n}
📦 ledger: docs/audit/debt-ledger.md

Next: /spec:enforce — mechanize the {category} check just recorded (iff any `enforcer` fate
landed this run; otherwise this line is dropped entirely)
```

## Contracts

`hotspot.js --json` output (the sole hotspot derivation, `spec-paths hotspot` — see
`spec/scripts/hotspot.js`'s own header for the score formula and exclusions):

```jsonc
{
  "window": { "sinceDays": 90 },
  "hotspots": [
    { "path": "spec/scripts/verdict.js", "commits": 14, "complexity": 213, "score": 2996 }
  ]
}
```

## Rules

- **Never edits host source.** Only ledger rows, roadmap briefs, and (with the user's explicit
  approval, verbatim shown first) pipeline-rules clauses. <!-- enforcedBy:
  tests/audit/audit.test.js -->
- **Never gates any pipeline stage.** No `spec-state-gate.sh` case, no `spec/hooks/hooks.json`
  change — findings are dispositions, never a blocking input to another command.
  <!-- enforcedBy: tests/audit/audit.test.js -->
- **Ledger-first, always.** Phase 0 runs before Phase 1 on every invocation, no exceptions.
- **A dismissed `AskUserQuestion` STOPs the run** — rows already appended stand; nothing further
  is written or asked.
- **`§` citations** in this file carry a resolvable file word (`shared § Model Placement`, never
  a bare `§ Name`) — `citations-check.js` scans this file automatically.
