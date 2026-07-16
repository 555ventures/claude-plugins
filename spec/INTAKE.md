# Intake Ledger: Host Findings → Plugin Fixes

The plugin-side half of the feedback loop. Hosts emit findings (feedback briefs in
`docs/spec-feedback/`, `[plugin]`-tagged Gotchas, escape rows); the plugin repo's `/intake`
command triages them into this ledger. This file **ships with the plugin** so host-side
`/spec:doctor` (upstream-fixes check) can compare its rows against the host's stamped
`generatedBy` version and report which findings the host is still working around that a
newer plugin already fixed.

**The intake contract:** an accepted finding is a **failing test first** — reproduced
against this repo's test suite (a fixture host under `tests/fixtures/` where the finding
needs one) before any fix lands. The test is the backlog item, the duplicate key, and the
regression guard; "when did this test start passing" is the `Fixed in` column. A finding
that cannot be reproduced is either host-specific (routed back as a `[host]` gotcha) or not
yet understood (not accepted). Rows predating this contract (the UpWell 2026-07 brief,
absorbed into v5.3.0) cite the scaffold-ledger row or doc test that pins the fix instead —
marked `pre-contract`.

Statuses: `open` (accepted, test failing, fix not landed) · `fixed@<version>` ·
`rejected` (with reason) · `already-fixed` (reporter's version predates the fix).

| ID | Source | Category | Stage | Pinned by | Fixed in |
|---|---|---|---|---|---|
| UPWELL-20260716-01 | UpWell brief Part 1–2 (static-only verification passed a program that cannot boot; 2 CLEAN reviews on a crash-loop) | missing-substrate | review | `tests/smoke-manifest.test.js` (boot smoke leg, fail-closed) | 5.3.0 |
| UPWELL-20260716-02 | UpWell brief 3.2 (skipped tests reported as passes; AC matrix counted collected, not executed) | reporting-integrity | review | `pre-contract` — review.md skip reconciliation + scaffold-ledger "Skipped-test reconciliation" row | 5.3.0 |
| UPWELL-20260716-03 | UpWell brief Part 2 (init stamped complete with Deliverable #6 never written; authored ≠ activated) | reporting-integrity | init | `tests/smoke-manifest.test.js` (manifest-check fail-closed) | 5.3.0 |
| UPWELL-20260716-04 | UpWell brief 3.4 (ADR bound a convention the pinned dependency rejects; spike triggered on felt uncertainty) | doctrine-rot | genesis | `pre-contract` — scaffold-ledger "Shape-triggered micro-spike" row | 5.3.0 |
| UPWELL-20260716-05 | UpWell brief 3.5 (poisoned generated doctrine had no repair path short of full re-init) | doctrine-rot | doctor | `pre-contract` — doctor.md `--fix` repair mode | 5.3.0 |
| UPWELL-20260716-06 | UpWell brief Part 4 (escape ledger existed, qualifying incident occurred, ledger empty — no consumer, no capture trigger) | workflow-defect | escape | `pre-contract` — `preventedBy` field + commit-time capture (git plugin 1.2.0) + scaffold-ledger "Prevention delta" row | 5.3.0 |
| UPWELL-20260716-07 | UpWell brief 3.6 (plugin defects living as host folklore; each host re-pays the discovery) | doctrine-rot | doctor | `tests/feedback-loop.test.js` (provenance tags, brief flush, this ledger) | 5.4.0 |
| UPWELL-20260716-08 | UpWell brief Part 4 (state gate trippable by describing the marker syntax in prose) | workflow-defect | plan | `tests/state-gates.test.js` (frontmatter marker counter authoritative) | 5.3.0 |
| UPWELL-20260716-09 | UpWell brief Part 4 (AC-ID tags collide across specs touching one test file) | template-bug | plan | `pre-contract` — `templates/spec.md` AC-{YYYYMMDD-NN} namespacing | 5.3.0 |
| UPWELL-20260716-10 | UpWell brief 3.7 (designed affordance entered build with spec authority and no spec scrutiny) | workflow-defect | design | `pre-contract` — scaffold-ledger "Affordance ↔ contract reconcile" row | 5.3.0 |
| UPWELL-20260716-11 | UpWell brief Part 3 (per-spec CLEAN verdicts don't compose; no executed milestone gate) | missing-substrate | release | `pre-contract` — commands/release.md + scaffold-ledger "Release stage executed checks" row | 5.3.0 |
| UPWELL-20260716-12 | UpWell genesis run (chain ended with no plannable unit; roadmap hand-authored) | missing-substrate | genesis | `pre-contract` — scaffold-ledger "Roadmap as genesis phase" row | 5.2.0 |

## Adding a row

`/intake` appends rows; nothing else writes here. Every row needs all six columns. `Pinned
by` names the failing-then-passing test (or, `pre-contract`, the doc/ledger artifact); a row
whose pin is neither is invalid — do not land it. When a fix ships, update `Fixed in` in the
same commit that lands the fix, so host doctors and this repo never disagree about what a
version contains.
