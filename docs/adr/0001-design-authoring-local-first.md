# 0001. Design authoring is local-first; quality comes from instruction + render critique

- Status: accepted
- Date: 2026-08-20
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (executed experiment, no panel)

## Context

Claude Design became available inside Claude Code on 2026-08-17 (the `/design` skill:
`.dc.html` artboards published as an Artifact running the canvas editor; a read-write
DesignSync bridge to claude.ai/design also exists in-session). The plugin's design surfaces
(sketch workbench, genesis-explore candidate rounds, atlas, design stage) had to decide what,
if anything, to adopt — under one hard constraint and one observed defect:

- **Auth constraint.** The pipeline runs in client repos with only a Claude Code access
  token — no client claude.ai email/password, no website or desktop-app login. Published
  artifacts 404 for anyone not signed into the owning account; DesignSync and standalone
  Claude Design require a first-party claude.ai login.
- **Quality gap.** Same model (Fable) produces visibly weaker design in Claude Code than in
  standalone Claude Design. Established cause pattern (baremetaldigest, Mar 2026, re-verified
  by experiment here 2026-08-20): the gap is instructional/harness, not model — standalone
  wraps the model in a design system prompt and a live-preview loop; bare Claude Code
  designs blind.

Executed evidence (this repo, 2026-08-20): the same session authored one mock without the
instructional layer (result: the stock "warm cream + serif + terracotta" AI-default look)
and one with Anthropic's `frontend-design` plugin plus a render-screenshot-critique loop
(Playwright against a local server, desktop + mobile passes). JJ judged the second
Claude-Design-grade. Same model both runs.

## Options considered

- **A. Local-first: plain local HTML mocks + `frontend-design` instructional layer +
  render-critique loop** — works on a bare Claude Code token, keeps mocks in the repo as
  canon, quality verified by the experiment above.
- **B. Adopt the `/design` canvas as the pipeline's design surface** — adds hand-editing
  (click-to-select, properties panel, Save versioning) but is a research preview, requires
  the owning account's browser session to view, and the save→read-back round-trip is
  unverified.
- **C. Standalone Claude Design / DesignSync round-trip** — best raw quality, but
  structurally excluded: requires a human claude.ai login the pipeline never has in client
  repos.

## Decision

**Option A.** Design authoring stays local-HTML in the repo (the existing mock-first canon),
with quality supplied by two mechanisms that both run on a bare Claude Code token: the
`frontend-design` plugin (user scope) as the instructional layer, and a
render-screenshot-critique loop (serve locally, screenshot desktop + mobile, critique, fix)
as the executed quality gate. The `/design` canvas is an **optional presentation layer
only** — never a pipeline dependency, never canon.

The single most important reason: it is the only option that survives the client-repo auth
model, and the experiment showed it closes the quality gap anyway.

## Consequences

- Design quality in host repos now depends on `frontend-design` being installed —
  bootstrap surfaces (init/genesis) should provision or at least check for it.
- The design-stage quality mechanism is executable and model-agnostic (render + critique),
  fitting the v7 evidence bar: observed, not asserted.
- We forgo hand-editing of mocks by the client until the `/design` canvas's save→read-back
  round-trip is verified; clients describe changes in words, as today.
- The canvas remains available for presentation (a pan/zoom board of mocks) where the
  session owner can view it; nothing in the pipeline may require it.

## Applies to

- `08-design-thinning` — the mechanism review evaluates the render-critique loop as the
  design-quality gate and lands the prose-cut on `frontend-design` as the instructional
  layer; the `/design` canvas is settled as an optional presentation layer, out of the
  dependency graph.
- `10-genesis-single-proposer` — the single proposer's executed grounding includes the
  render-critique loop: candidate tiles/prototypes are rendered and self-critiqued before
  the user judges them.
- `11-init-thinning` — the generation/bootstrap path gains a check-or-provision step for
  the `frontend-design` plugin (user scope), so host repos don't silently design without
  the instructional layer.

## Dissents

- **Option B as primary** stays live as a minority position: if the `/design` canvas's
  save→read-back round-trip is verified (the staged experiment: owner edits a published
  artboard, session extracts the save), client hand-editing becomes possible and the
  presentation layer could grow into an edit surface. Revisit then — not before.
