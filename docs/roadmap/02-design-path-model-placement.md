# 02 — Design-path model placement: registry-weighted canon, registry-grounded workers, session exit review

Phase: P1
Depends on: none

## Why this brief

2026-08-10 research ruling (four-agent sweep, post-June-2026 sources only, after Fable 5's
launch). Findings that survived: (a) for UI design work the quality difference shows up in
the authored artifact, so the taste stage belongs to the frontier model authoring directly —
applied to `/spec:sketch` in v6.48.0, not this brief; (b) the best-evidenced cross-screen
consistency mechanism is a persistent, machine-readable style artifact re-read on every
generation call — a live component registry hit ~95% design-system compliance in CHI 2026
testing, beating a prose style guide in the prompt; (c) the delegation consensus ("frontier
plans and reviews, cheap models execute, ~96% quality at ~46% cost") holds for transcription
work — which is what `/spec:design`'s expansion of ratified mocks is; (d) drift enters
wherever a worker re-decides something already decided, so the fix is to shrink what is left
to decide, then check the result at the exit.

This brief carries the genesis-design and design-stage halves of that ruling.

## Scope

- **/spec:genesis-design — re-weight the canon toward machine-readable artifacts.** The
  ratified output today is design doctrine (prose) + `design/tokens.css` + category-only
  enforcement rules. Add a named **component vocabulary** artifact (the building blocks the
  product commits to, each with role and usage boundaries — registry shape, not prose) that
  every later generation call re-reads alongside tokens. Prose doctrine keeps intent and
  rationale; anything a worker must obey moves into tokens or the vocabulary.
- **/spec:design — registry-grounded workers.** wf-design's author pass grounds workers in
  the component vocabulary so they pull real building blocks instead of inventing lookalikes;
  the vocabulary joins the grounding set the same way tokens do today.
- **/spec:design — session fidelity review at the exit.** After the gate passes, the session
  model reviews rendered output against the ratified mock (the "frontier at the bookends"
  pattern: taste decided at sketch, transcription delegated, fidelity judged at exit). Findings
  route through the existing drift/iteration loop; the review is judgment, not a new gate
  script.
- **/spec:atlas sweep placement.** The atlas gap sweep still dispatches parallel per-surface
  Sonnet agents — same drift exposure the sketch ruling retired. Decide whether it adopts the
  sketch contract (sequential single dispatch, exemplar grounding) or is exempt because atlas
  sketches are disposable gap-fillers; record the ruling either way.

## Grounding

- The v6.48.0 sketch change (spec/commands/sketch.md — the same ruling's first half) and its
  session transcript (2026-08-10): four research agents, findings summarized in the Why above.
- spec/doctrine/shared.md § Model Placement, § Design Canon, § Binding Pipeline — the seams
  this brief edits.
- Claude Design export reality + design v6 pipeline memory: tokens-as-code is already the
  genesis-explore output shape; the component vocabulary extends the same principle one level
  up.
- CHI 2026 registry-compliance result (dl.acm.org/doi/10.1145/3772363.3798616 — flagged
  low-confidence at research time; re-verify before citing in doctrine).

## Out of scope

- `/spec:sketch` — shipped in v6.48.0; do not re-open here.
- wf-design's unified-author-pass structure and its deterministic gates — the ruling endorses
  keeping expansion delegated; this brief grounds and reviews it, never in-sources it.
- Retiring the sketch overflow valve or changing sketch tier fidelity.

## Open questions

- Component vocabulary format: standalone `design/components.md` registry vs a structured
  block inside the design doctrine — and what deterministic check keeps it honest
  (claims-lint-style ratchet? doctor check?).
- Does the exit fidelity review need an evidence-manifest leg (screenshot pair per surface)
  or is a session judgment line in the coverage ledger enough?
- Greenfield-only or does `/spec:init` derive a vocabulary for brownfield hosts from the
  existing component tree?
