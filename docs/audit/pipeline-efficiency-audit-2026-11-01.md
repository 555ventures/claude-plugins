# Pipeline efficiency audit — 2026-11-01

Question asked: is the idea → ADR → roadmap brief → spec → merge workflow efficient, measured
over its two live hosts (zubu-connect, zubu-web) and the plugin's own history? Window:
2026-09-22 (first host commit) to 2026-11-01. Method: four read-only agents, one per host
funnel, one over both hosts' `.claude/spec-runs.jsonl` and retained `rv_*.jsonl` evidence, one
over this repo's git history and doctrine. All numbers below are executed counts from git and
the ledgers unless marked *unverified*.

## Verdict

The middle of the pipeline is efficient; the two ends are not. Spec → build → reviewed merge is
fast and reliable. What wastes effort is (1) upstream decisions that flip after code has shipped,
which the pipeline cannot see, (2) a fixed ceremony tax paid by every spec regardless of size, and
(3) the plugin itself now consuming as much effort as the products it serves.

## Headline numbers

| Measure | zubu-connect | zubu-web |
|---|---|---|
| ADRs / decisions → briefs → specs | 10 → 15 → 38 | 63 → 14 → 51 |
| Specs → merged | 38/38 | 46/51 (4 superseded unbuilt, 1 hardened) |
| Build start → CLEAN (median / max) | 51 min / 94.6 h | 32 min / 15.3 h |
| Plan lock → CLEAN (median / max) | 9.3 h / 98.7 h | 3.1 h / 137.8 h |
| Non-merge commits that touch only docs/specs/.claude | 154/278 (55%) | 161/274 (59%) |
| `chore(ledger)` commits | 39 | 51 |
| Ceremony commits per spec (lock, close, ledger, session marker, merge) | ≈5 | ≈5 |
| Specs on `tier: critical` | 31/38 | 34/46 |
| Specs longer than their code diff | 15/38 | 7/46 |
| Spec lines per production code line (repo-wide) | 0.66 | 0.33 |
| Whole-suite runs per CLEAN review (mean) | 3.45 | 3.0 |
| Reviews whose gate reported skips (forces an extra legs run) | 41/42 | 37/58 |
| Build gate repair rounds > 1 | 9/39 | 13/47 |
| GATE_RED stops | 2 | 12 (≥6 at unchanged HEAD) |
| Rework / fix-only specs | 7 | 5 |
| Out-of-band fixes committed to main with no spec | 10 (9 after 10-26) | 31 fix-type commits |
| Escape rows after CLEAN | 9 | 5 |
| Specs with `brief: n/a` | 5 (13%) | 8 (16%) |
| Reviewer candidates → survivors | 315 → 81 | 366 → 76 |
| Survivor severity | 155 soft / 2 hard across both | |
| Reviewer tokens per review (median) | 32k | 58k |

Plugin vs products, same window:

| | claude-plugins | zubu-connect | zubu-web |
|---|---|---|---|
| Commits | 313 | 317 | 316 |
| Commits touching code (hosts) | — | 124 | 113 |
| Lines +/− | 59k / 36k | 62k / 3k | 133k / 15k |
| Commits in ISO week 44 | 90 | 58 | 41 |
| Commits in ISO week 40 | 58 | 87 | 101 |

Plugin: 95 releases in 41 days (7.199.0 → 7.294.0). Of 55 plugin specs since 09-22, ≈25 are
meta-work (the pipeline fixing its own ledger, legs, gates, doctrine); 8 of the last 10 are
meta-work. Design path rebuilt six times (briefs 22 → 22a → 26 → 27 → 28 → 28a → 29 → 30;
ADRs 0024–0036 mostly retirements). Host grounding repaired about weekly (21 and 42 commits
touching rules/agents/config/manifest). Doctrine prose shrank (commands −35%, doctrine −42%,
run-session load 540 → 444 lines); complexity moved to scripts (+5.2k) and templates (+2k).

## The three leaks

### 1. Direction changes after code shipped (largest loss, invisible to the pipeline)

- zubu-web: D49 (2026-10-04) landed 5 days after the first spec. It retired brief 04's four
  hardened specs (`specs/20261004/01-04`, 2,530 lines, 0 built), briefs 05 and 06, and later
  deleted the Sanity adapter, the zone-rule code (20261001/05) and the static Workers deploy
  (20260929/01). Hosting changed three times in 26 days (D41 → D49 → D60). Spec 20261017/03 was
  built to Railway's `X-Real-IP` two days before D60 retired Railway. Roughly 20–30% of
  generation-one code lines were discarded (*unverified exact figure*). Five weeks in,
  byzubu.com has not cut over.
- zubu-connect: the R2 → S3 switch went through two `brief: n/a` specs (20261024/01,
  20261026/01) instead of an ADR, as `docs/roadmap/00-overview.md` requires; it made
  20261012/01's restic-to-R2 backup obsolete 12 days after it shipped; brief bodies still carry
  23 R2 mentions. ADR-0010 is cited by no brief though its own text names brief 06. Brief 11's
  four specs were marked done without ever being deployed (commit 5142065).
- The pipeline's doctrine names the escape ledger as "the one ground-truth signal", and
  supersession of built code produces no ledger row. `fleet-reader` therefore counts this class
  at zero, and § Incident Policy can never earn a guard for it.

### 2. Fixed ceremony per spec regardless of size

- ≈5 bookkeeping commits per spec; over half of host commits are process-only.
- 77% of host specs run `tier: critical` though `core.md` § Tiers says standard is the norm.
  Cause is host-side: each host's rules § Risk Tiers triggers plus "non-empty Data Model is
  critical by construction".
- Worst single case: ADR-0009 (56 lines) + brief 05a (43) + spec 20261005/04 (306) = 405 lines
  for a 16-line code change with 17 acceptance criteria.
- Each legs run executes gate + suite + at-risk + smoke; close runs gate + suite again on an
  unchanged tree; `--mark skips-extracted` starts a whole new legs run just to attach skip names
  (`spec-review-driver.js:1287-1294, 2406`); connect's skips are static (19–20 every time).
  Worst case 03-workers-deploy-ops: 4 legs runs (skips 9 → 110 → 9) + close = 5 whole-suite runs,
  ledger says `iteration:0`.
- Nothing records durations; `review-close.md:30` says "Cost is accepted by contract"; nothing
  measures throughput.

### 3. The plugin competes with the products

- 313 plugin commits vs 235 code-bearing product commits; week 44 was 90 vs 99.
- Half of plugin commits are its own ledger/lock/close/merge rows.
- Tests near-totally rewritten (+22k / −19.5k).

## What clearly works

- Cheap-worker builds: ≈900–1,250-line diffs reach a reviewed state in a median of 0.6–0.9 h;
  mean gate rounds 1.18–1.4; first review CLEAN in 84 of 100.
- The reviewer kills 77% of its own candidates and leaves ≈1.6 real findings per spec; only
  14 escapes across 84 built specs; 12 GATE_RED stops in web caught real reds before merge.
- The doctrine corrects itself (prose shrinking).

## Ledger defects found on the way

- Duplicate build rows on resume (same runId and ts): `bd_dd116bc58894` (connect),
  `bd_7a2b6d665cb3` (web).
- Review-row `iteration` changed meaning at fc9c1a8e (7.259.0): manifest count → fix rounds;
  skip-driven legs runs are no longer counted.
- `fixDispatched` is 0 on all 100 host review rows.
- `rv_45e46837518f`: GATE_RED at iteration 2 then CLEAN at iteration 1, same head.
- Stale worktree with full `node_modules`: `zubu-web/.claude/worktrees/spec-03-workers-deploy-ops`.
- Plan-row timestamps are hand-rounded; no done row exists (last CLEAN review used as done).

## Decision taken (2026-11-01)

Fix approach must align with `spec/doctrine/core.md`: no new doctrine prose, no policy rows,
no magic-number rules; guards are scripts earned by ledger-counted recurrence.

- **Keep specs 20261101/05, 06, 07 unchanged.** They target exactly leak 2 (gate = suite,
  rerun only red, scoped gate + slow tier) and 05 already adds per-leg wall-clock.
- **One new spec:** supersession ledger rows (see queue). Prerequisite for ever guarding leak 1.
- **One `/spec:fix`:** the three ledger defects above (Direct lane per § Incident Policy).
- **Host-side, no plugin change:** narrow each host's rules § Risk Tiers so standard becomes
  the real default.
- **Deferred until the above exist:** a throughput line in `/spec:status` (host specs shipped
  per week beside plugin specs closed per week, derived from ledgers, signal only, no cap);
  a lock-time lint refusing `brief: n/a` specs that touch a host-declared vendor/hosting
  surface, admissible only after `fleet-reader` counts the supersession class three times.
- **Recommended but not yet decided:** freeze new plugin capability for two weeks; only the
  items above land until zubu-web is cut over. Success metric proposal: host specs reaching
  production per week.

## Sources

- `zubu-connect/docs/{adr,roadmap}`, `zubu-connect/specs`, `zubu-connect/.claude/spec-runs.jsonl`
- `zubu-web/docs/{decisions.md,roadmap}`, `zubu-web/specs`, `zubu-web/.claude/spec-runs.jsonl`,
  `zubu-web/specs/20261025/0{2,3}-*.review/review-state.json`
- `spec/scripts/review-legs.js:58, 263-349`, `spec/scripts/spec-review-driver.js:830, 969,
  1287-1294, 1742, 1764, 2406`, `spec/bin/spec-paths`, `spec/doctrine/core.md`,
  `docs/canonical/review-close.md:30`
- Cost of the audit: four agents, ≈315k agent tokens, ≈5 min wall-clock.
