# 0003. Sketch coherence comes from a canonical shell; sketch-tier authorship sits in the planning seat

- Status: accepted
- Date: 2026-09-01
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (observation + doctrine audit, no panel)
- Amended by: ADR-0006 (brief 22) — bootstrap-before-mocks order and Fable-dispatch authorship superseded; drift check kept

## Context

Specs/20260810/01 decision D8 (brief 02, shipped) settled the atlas gap sweep's placement:
one sequential **Sonnet** author for every gap surface, coherence supplied by citing earlier
mocks as **exemplars**, with the rule recorded in shared § Design Atlas as the single home for
both the atlas and the sketch contracts. Two things have changed since:

- **The mechanism does not hold.** JJ's observation (2026-09-01): "whenever you design
  something, it drifts because you don't use shared layout or app shell." The pipeline
  decides the navigation shell once at genesis and scaffolds it once in code (`AppShell`),
  but the mock layer — authored first, and the render gate's `design_source` — has no shell
  artifact; every mock redraws its chrome by hand and no check compares them. Exemplar
  chaining is prose asking an author to copy consistently, which is exactly the failure mode.
- **The seat is wrong for what the artifact is.** The greenfield sweep is the
  product-understanding contract the user audits at sketch-edit prices (`/spec:atlas` § The
  sweep). Authoring it on Sonnet means the user audits Sonnet's grasp of the product; the
  planning model's grasp is never written down. Core § Model Placement's own principle —
  the expensive model authors the contract, cheap models execute it behind gates — points
  the other way. `/spec:sketch` already runs the session as author with a Sonnet overflow
  valve past 5 surfaces; a Fable subagent with Opus fallback (core § Model Placement) now
  exists as a dispatch target, so the overflow no longer has to trade taste for context.
- **D8's doctrine home was lost.** The v7 rewrite of `design.md` dropped the shared "one
  warm author per pass" paragraph; `atlas.md` still cites it. Nothing deterministic sees a
  phantom citation.

Also observed: the genesis explore pick (stance, anti-defaults, reference direction) is not
in the sketch author's grounding set — taste reaches the author only through `tokens.css`.

## Options considered

- **A. Keep D8; strengthen exemplar prose** — zero mechanism change; drift stays invisible
  to gates and the seat stays wrong for the contract artifact.
- **B. Canonical shell mock + mechanical sync + drift check; sketch authorship in the
  planning seat (session + Fable subagent overflow, Sonnet mechanical only); picked position
  in the grounding set; restore the shared paragraph** — one structural fix for coherence,
  one seat fix for taste, one grounding fix for inheritance. Sonnet's cost advantage on
  sketch-tier HTML is a few dollars per sweep against an artifact the user then reviews for
  an hour.
- **C. Fable authors every sketch in-session** — best taste, but a 25-surface greenfield
  sweep burns the planning context the holistic review that follows needs.

## Decision

**Option B.** Coherence is a shell artifact, not an author's memory: one canonical
responsive shell mock per declared shell, page mocks declare their shell and author content
only, the shell region is synced from canon by script and checked byte-for-byte, and the
`AppShell` code primitive is authored from the shell mock. Sketch-tier authorship is a
planning-seat duty for both `/spec:atlas` and `/spec:sketch`: the session authors the
journey-central exemplars (up to 5, at least one per declared journey), one sequential
`Agent {model: "fable"}` dispatch (Opus fallback) authors the overflow from them, Sonnet is
used for mechanical edits only. Every sketch author reads the picked position brief. The
rule lives in one restored shared paragraph that both commands cite.

The single most important reason: the sweep is the contract the user audits, and a contract
is authored by the expensive model and held coherent by a mechanism, never by copying.

## Consequences

- Shell drift becomes a build error at `check` time instead of a review finding; a shell
  change is one sync run plus one atlas look, not N re-authors.
- Sketch authors' job shrinks to the content region — the actual product-understanding
  question — which also lowers the context cost that motivated D8's Sonnet choice.
- Sweep and sketch cost rise modestly (Fable subagent for overflow); wall-clock is
  unchanged (sequential either way).
- Existing full-page mocks need a one-time adopt pass; residual diffs are the first
  measured shell-drift findings.
- D8 of specs/20260810/01 is superseded in effect; that spec is `done` and is not edited —
  the successor brief carries the change.
- Reference-pixel grounding (Mobbin) stays parked: measure whether shell + position
  grounding closes the observed drift before adding another input.

## Applies to

- `02-design-path-model-placement` — shipped (specs/20260810/01 done); never edited. Its
  D8 (atlas sweep on one sequential Sonnet author, exemplar-grounded, shared-home paragraph)
  is superseded by this decision. **Successor: `20-shell-composed-mocks`** — numbered rather
  than `02a` because the shell layer is new scope beyond 02's units; it carries the D8
  reversal (`Amends: 02` header line, Scope 5) alongside the shell canon.
- `20-shell-composed-mocks` — authored in this session with this ADR; Grounding cites it.

## Dissents

- **Option A (keep Sonnet for the atlas sweep as a disposable gap-filler tier)** stays on
  record as the 2026-08-10 position: atlas sketches are cheap scaffolding the per-brief
  sketch later refines. Rejected because `/spec:sketch` never re-authors an existing mock, so
  a Sonnet-authored gap-filler becomes the ratified surface unless the user edits it by hand.
- **Option C (all in-session)** stays live as the fallback if `Agent {model: "fable"}` is
  unavailable and Opus output is judged not to match the session's exemplars; the brief's
  exemplar-cap question measures the context cost that would decide it.
