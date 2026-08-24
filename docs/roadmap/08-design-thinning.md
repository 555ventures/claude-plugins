# 08 — Design stage: render-gated redesign (v7.1)

Phase: P3
Depends on: none

## Gate to plan this brief

Five product specs (not self-repair) through the v7.0 pipeline with a self-repair share
below 20% of specs authored in the window. Until the gate is met, `/spec:plan` on this
brief should be declined — the v7.0 bet must prove itself on the core loop before the
design surface is rebuilt on top of it.

**Host passes count (JJ, 2026-08-20).** The gate asks whether the pipeline works, and a
spec shipped in a real product repo is the strongest available answer; a self-repair spec
in this repo is the weakest — the pipeline building fixes for itself, in the one codebase
that resembles no product. Counting only this repo's ledger measures the wrong population.
A qualifying pass is a spec taken to `done` by `/spec:review` in a host repo, evidenced by
its own run ledger row.

**Progress is currently underdetermined, and that is itself the finding.** This repo's
ledger shows 1 of 5 (specs/20260817/06) at ~93% self-repair across 15 in-window specs. Host
passes are invisible here — every ledger, escape row, and replay result lives in whichever
repo produced it, and nothing reads across them. The 2026-08-20 at-risk escape (a review leg
dead for ~10 reviews) was found while reviewing a HOST spec and reached this repo only
because a session happened to patch it directly. Until a read-only cross-repo evidence
reader exists, this gate cannot be evaluated from data — count host passes by hand at plan
time, and treat the counting friction as evidence for building the reader.

*Hand-count 2026-08-24 (unverified against ledger rows): salon-os has 6 specs stamped
`designed:` after the v7.0 cut (08-18 → 08-23); prax more. Plan time must confirm each
reached `done` via review.*

## Why this brief

The v7.0 redesign (2026-08-17) rebuilt the core pipeline and deliberately carried the design
family **as-is**: the `sketch`, `atlas`, and `design` commands, the design doctrine
(`spec/doctrine/design.md`, ~500 lines carried verbatim), and the frozen `wf-design.js`.
~~v7.1 applies the same treatment to that surface: prose-cut, mechanism review, and
direct-dispatch orchestration.~~ *(superseded by ADR-0002)*

The mechanism review has since been **executed** (`docs/audit/design-stage-field-eval.md`,
2026-08-24; 38 designed specs across prax and salon-os) and its verdict is not "thin it":

- The parts that work are **mock-first authoring** (copy fidelity 100% of sampled strings on
  both hosts), the atlas, and the component manifest. They are not touched here.
- The stage's justification — the human catalog iteration loop between plan and build —
  ran **once in 38 specs**. The vision fidelity review was waived on one host and
  non-recording on the other. Sidecars are never deleted. Every `deltas.json` row excuses
  mock scaffolding or a checker bug; none excuses a design decision.
- Two executed render-diff spikes (`docs/audit/render-gate-spike-2026-08-24.md`,
  `docs/audit/render-gate-spike-prax-2026-08-24.md`) found **11 real layout divergences on
  CLEAN specs** — a headline number shipped at 56% of its ratified size, a docked action
  shipped in-flow — that the source-grep gate is structurally blind to and the human/vision
  loop did not see. Capture noise measured 0.00% on both hosts.

Thinning a stage whose gate cannot see what it guards would preserve the blindness at lower
cost. This brief replaces the gate and deletes what only existed to feed it.

## Scope

1. **Render gate (ADR-0002)** — one deterministic script compares the mock render with the
   component render: accessibility-tree **painted** text (`innerText`, never DOM text —
   CSS `text-transform` false positive measured), in-flow element order (absolutely
   positioned siblings excluded — DOM≠paint order measured), and bound-region geometry
   (data-positioned elements excluded — chart chips measured at 12% noise vs 4% signal;
   per-axis tolerances near `{dx 1%, dw 1%, dh 15%}`, vertical-relative off). Runs across
   the host's declared `targets.json` matrix, not the draft framing (the width-cap escape
   D19 on prax was invisible at 390 px). Static mock controls rendering as real links are
   auto-excused with a printed `📌 Auto-picked` line, never a question. **Pixels are not a
   signal** at any threshold (ranking inverted on one host, flat on the other) — excluded,
   not advisory. Fail-closed at the gate; pinned by a behavioral test over a synthetic
   mock+component pair.
2. **Render adapter, host-declared** — the host's `design` config block declares the render
   path (a catalog story URL pattern or a fixture route); the plugin ships the comparison
   and a web adapter keyed off that declaration. No plugin file names Playwright or
   Storybook (core § Host Grounding). Only the web adapter is built — n=0 non-web hosts;
   "adapter per stack, comparison shared" is the extension rule.
3. **Mock states, fixtures, and hygiene in the harness** — `design/fixtures/<surface>.json`
   feeds both the mock (`{{ }}`/`sc-for`) and the story, so both sides render identical data
   by construction; `data-state` variants declare the states a surface owes; non-contract
   regions (device chrome, proto strips) and data-positioned elements are marked. The
   deterministic harness check gains mock hygiene: `border-box` reset, declared
   line-heights, no device frame (each measured as a false-positive source). Matrix
   expansion moves to sketch exit: **ratified = approved**, one stamp.
4. **Design rules execute on the render** — the rules genesis-design authored "falsifiable
   with numeric thresholds" (`design-rules.json`) run as a script over the a11y tree +
   geometry + pixels (CTA count, touch-target size, contrast, colors ∈ token palette) at
   sketch exit and at the build gate, replacing the Sonnet rule-checklist walk and the
   source-side hex grep (core § Rule Enforcement).
5. **Thin `/spec:design` and delete the feed** — the command's body becomes: transcription
   workers (one warm Sonnet per surface, mock HTML in context, manifest as canon) behind
   the host gate + the render gate, one reconcile, `designed:` stamp. Deleted with their
   consumers: `dc-extract`, the `.design/` sidecar, `skeletons.json` + `skeletons-check`,
   `fidelity-check.js` (source grep), `deltas.json`, the Haiku match pass, the Fable
   retainer, the vision consult, the `ITERATE` catalog loop, and `wf-design.js` (its
   author pass becomes direct dispatch — the inversion build/review got). The frozen v7.0
   surface — hooks, `spec-status.js`, config keys, `spec-paths` design keys, the
   `designed:` field — is untouched; the command keeps its seat in the state machine.
6. **Doctrine cut** — `design.md`'s Binding Pipeline section is rewritten to the render
   gate (contracts and invariants only); Canon, Authoring Contracts, and Atlas sections get
   the ~80% cut the core commands got. Retainer language goes with the retainer (core §
   Model Placement: no resident consultant). `frontend-design` is the instructional layer
   (ADR-0001).

## Out of scope

- Any change to mock-first authoring, the atlas, or sketch-per-brief as user-facing
  surfaces — measured working; this brief changes what judges the code, not how the mock is
  made.
- Folding `/spec:design` into `/spec:build`'s first wave — the frozen v7.0 state machine
  binds it; a later brief once this one has shipped and the freeze is revisited.
- Non-web render adapters — built when a non-web host exists, never before.
- The genesis-family thinning (genesis.md prose cut, `wf-panel`/`wf-research` replacement,
  the `/spec:enforce` inversion question) — cross-referenced to brief 10 (genesis single
  proposer), which owns the genesis research seats; see Open questions.
- The frozen v7.0 stable APIs (`spec-status.js`, config keys, `spec-paths` design keys,
  hooks).

## Grounding

- Amended by ADR-0002 — fidelity is judged at the render, not in the source; the source
  gate, extract sidecar, skeletons, and delta rows lose their consumer.
- Amended by ADR-0001 — design authoring stays local-first; quality via `frontend-design` +
  render critique; `/design` canvas is presentation-only.
- `docs/audit/design-stage-field-eval.md` — the executed mechanism review this brief acts
  on; `docs/audit/render-gate-spike-2026-08-24.md` and
  `docs/audit/render-gate-spike-prax-2026-08-24.md` — the two red runs and the
  false-positive classes Scope 1 and 3 must handle.
- `docs/audit/v7-replay-eval.md` — the evidence bar v7 review work is held to.
- `spec/doctrine/core.md` § Rule Enforcement, § Runtime Verification, § Incident Policy
  (admission bar: generality two hosts, materiality 11 measured — ledger count zero by
  blindness, falsifiability two red runs, removability "N consecutive gated specs with zero
  geometry findings", portability argued not proven), § Model Placement, § Host Grounding.
- Memory `research-20260824-genesis-best-practice` (Aug-2026 sweep, design-side items only):
  the field's agent-readable design canon is DESIGN.md + DTCG 2025.10 token JSON — emit
  alongside `tokens.css`, which makes Scope 4's "color ∈ token palette" check a lookup,
  not a CSS parse; a11y baseline pins to WCAG 2.2 AA for the executable rules; the named
  anti-slop violation class is the **unspecified default** — exactly what Scope 3's mock
  hygiene (undeclared line-heights, box model) turns into a check.
- Memory `research-20260817-ai-first-best-practice` (July-2026+ sweep): stale scaffolding
  actively distorts newer models; mock-first ("code-based references beat prose
  descriptions of intent") is a keep-signal — the render gate strengthens it.

## Open questions for planning

- Does the genesis-family thinning (genesis.md cut, `wf-panel`/`wf-research`, enforce
  inversion) land in brief 10 or get its own brief? Brief 10 is being amended concurrently
  (explore: external state); coordinate rather than restate.
- Does `/spec:design` keep an explicit opt-in human confirm for surfaces a spec flags as
  high-stakes, or is the atlas's mock | built side-by-side the only human surface?
- Do the two hosts' 11 measured divergences get recorded as `/spec:escape` rows before
  planning, so the removability query has a baseline?
