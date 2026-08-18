# 09 — Deterministic promise sweep: every Decision/Behavior clause names its carrier

Phase: P1
Depends on: none

## Why this brief

The v7 replay eval measured the single reviewer's one systematic miss class: spec clauses
that promise behavior nothing implements — no test fails, so nothing points at them
(lane-engine 3/5 misses, hub-wired-daemon 2/4, all this class). The pre-cutover response was
prose (reviewer.md's mandatory promise sweep + no-prose-demotion), i.e. reviewer diligence —
exactly the hope-based compliance v7 exists to retire. The 2026-08-17 research sweep
(July-2026+ sources only) supplied the measured fix: grounding checks in *enumerated spec
clauses* — one carrier per clause — beat description-level checking by 38 percentage points
(arXiv 2607.06636, Jul 7 2026), and Anthropic's own AI-native SDLC (claude.com, Jul 21 2026)
adds review capacity as narrowly-scoped, non-redundant legs, never duplicate generalist
reviewers.

This brief also **closes the open critical-tier call** from the replay eval: no second
general reviewer. Reviewer agreement is measurably not a correctness signal (Spearman
ρ 0.20–0.59, Digital Applied Aug 2 2026; Nature MI Jul 24 2026 — capable models outgrow
collaboration). Critical tier gets scoped extra legs instead, this one first.

## Scope

- **A promise-sweep leg** — deterministic script (sibling or extension of `ac-matrix.js`,
  which already owns enumerate-and-match for AC bullets) that enumerates every clause in the
  spec's Decisions and Behavior sections and requires each to map to a carrier: a
  tests-layer File Plan row / test reference, or an explicit sanctioned no-carrier reason.
  Orphan clauses emit findings rows to the evidence manifest; `verdict.js` consumes them
  like ac-matrix rows.
- **review-legs.js runs it** as a findings leg (parallel with the others; disposition flow,
  not a hard-stop).
- **reviewer.md shrinks** — the prose promise-sweep paragraph shipped pre-cutover reduces to
  dispositioning the leg's findings. Choreography-to-code, net prose down.
- **core.md tier section** records the ruling: critical tier = the standard path plus scoped
  non-redundant legs (registered by name), never a duplicate reviewer.

## Out of scope

- A second general reviewer in any tier — rejected on the evidence above; reopen only if a
  post-09 escape shows a miss class no scoped leg can own.
- Genesis/panel changes (brief 10) and any design-family surface (brief 08).

## Grounding

- `docs/audit/v7-replay-eval.md` — the measured miss class this leg exists to catch.
- Memory `research-20260817-ai-first-best-practice` — the dated citations above.
- `spec/scripts/ac-matrix.js` + `spec/scripts/review-legs.js` — the machinery being
  generalized; row shapes and exit-code conventions to match.
- `spec/doctrine/core.md` § Incident Policy — this is the sanctioned third-strike shape: a
  deterministic guard for a class measured recurring (2 of 3 replay targets).

## Open questions

- Clause enumeration mechanics: require ID'd bullets in Decisions/Behavior at plan time
  (template change, ac-matrix precedent) vs deriving clause identity from the prose as-is.
- Carrier syntax: per-clause pointer in the spec vs leg-side matching against the File Plan
  and test sources; where a sanctioned no-carrier reason lives.
- Whether "critical" tier admission criteria in core.md need sharpening while the section is
  open.
