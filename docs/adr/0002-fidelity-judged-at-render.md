# 0002. Mock→component fidelity is judged at the render, not in the source

- Status: proposed
- Date: 2026-08-24
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (two executed spikes, no panel)

## Context

The design stage holds framework code to a mock through a deterministic **source** gate
(`fidelity-check.js`: whitespace-collapsed file text vs the mock's extracted strings, order,
and grid/flex declarations) plus a model **vision** consult and a human catalog loop. The
source gate is what the sidecar machinery exists to feed — `dc-extract` classes strings and
slices regions so the grep knows what to look for, `skeletons.json` maps regions to files so
it knows where, `deltas.json` rows excuse what it cannot reconcile.

Field evidence (`docs/audit/design-stage-field-eval.md`, 2026-08-24, 38 designed specs
across two hosts): copy fidelity holds (100% of sampled strings), but the human loop ran
once, the vision review was waived on one host and non-recording on the other, sidecars are
never deleted, and every delta row excuses scaffolding or a checker bug — never a design
decision. Two executed render-diff spikes then compared the mock render with the Storybook
render on CLEAN specs and found **11 real layout divergences the recorded process had not
seen** — including a headline number shipped at 56% of its ratified size on a surface with
two performed human review rounds. The source gate is structurally blind to geometry; the
render is the only place both mock and component are comparable, and the only interface
every stack shares.

Core doctrine already demands this shape: rules a script can check are never checked by an
LLM at runtime (core § Rule Enforcement); no verdict rests on static legs alone (core §
Runtime Verification); authored ≠ activated.

## Options considered

- **A. Judge fidelity at the render** — accessibility-tree text (painted text, i.e.
  `innerText`) + DOM-order-in-flow + region geometry, mock render vs component render, at
  the host's declared matrix; pixels excluded. Deterministic, measured at 0.00% capture
  noise on both hosts, strictly stronger than the source gate on both.
- **B. Keep the source gate and add geometry to it** — impossible: file text has no
  geometry; a layout leg would need a render anyway.
- **C. Keep the source gate and make the vision consult mandatory** — a runtime LLM check
  for what a script can measure (core § Rule Enforcement's named downgrade), and the
  consult was already waived once and non-recording once under that exact rule.

## Decision

**Option A.** Fidelity between a mock and its component is a property of two renders, judged
by a deterministic comparison of accessibility-tree text, in-flow order, and bound-region
geometry, run across the host's declared theme × viewport matrix. Pixel similarity is not a
signal at any threshold (measured inverted on one host, flat on the other) and is excluded.
The source-grep gate, the extract sidecar, the skeleton binding map, and the delta-row
exemption process lose their consumer and are retired with it.

The single most important reason: it is the only comparison that sees what shipped, and it
found what two human rounds, one waived review, and one passing grep all missed.

## Consequences

- The fidelity gate becomes executed observation, satisfying core § Runtime Verification
  for the design stage for the first time.
- A render path per host becomes a hard requirement (a catalog story or a fixture route) —
  declared in the host's `design` config block, never a named tool in plugin files.
- Mocks gain hygiene obligations the harness check must enforce at sketch time:
  `border-box`, declared line-heights, no device frame, non-contract regions and
  data-positioned elements marked as such, sample data shared with fixtures.
- The comparison is stack-agnostic by construction (a11y tree + geometry); only the
  render adapter is stack-specific, and only the web adapter is built until a non-web host
  exists.
- The design stage's remaining reasons to be a separate stage (catalog loop, skeleton
  authoring) fall away; whether it folds into build's first wave is a separate decision
  (brief 08 fences it out; the v7.0 freeze on hooks and `spec-status.js` binds it).
- We forgo the source gate's one genuine strength — catching a paraphrase in code the
  render would also show — because the render shows it.

## Applies to

- `08-design-thinning` — rewritten in place (unplanned brief): the mechanism review's
  verdicts are pre-filled from the field evaluation, the thinning framing is struck, and
  Scope becomes the render gate, host-declared adapter, mock states/fixtures/hygiene,
  executable design rules, the thin `/spec:design` command, and the doctrine cut.

## Dissents

- **Pixel similarity as triage** stays a minority position: per-region SSIM at
  `deviceScaleFactor 2` on Latin-only surfaces might rank usefully. Both measurements were
  at scale 1 on CJK and mixed text. Revisit only with a measured ranking that beats geometry.
- **Fold into build now** (lift the v7.0 freeze in the same brief) — held back until brief
  08's gate is met; recorded in brief 08's Out of scope.
