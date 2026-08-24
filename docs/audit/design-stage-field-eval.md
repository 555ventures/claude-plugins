# Design-stage field evaluation — 2026-08-24

What `/spec:sketch` → `/spec:design` actually produced in two host repos (prax, salon-os),
measured by read-only agents against disk and git, plus two executed render-diff spikes
(`render-gate-spike-2026-08-24.md`, `render-gate-spike-prax-2026-08-24.md`). Consumed by
roadmap brief 08 and ADR-0002. Numbers are as-measured on 2026-08-24; nothing here
is a recommendation.

## Population

| | prax | salon-os |
| --- | --- | --- |
| UI stack | React (TanStack Start), Tailwind, Storybook, i18n catalog (`copyCatalogs`) | React 19 (TanStack Start), Tailwind 4, shadcn, Storybook |
| Non-web hosts on this machine using the design stage | 0 | 0 |
| Mocks (`design/mocks/*.html`) | 84 (53 ratified / 21 approved / 10 sketch) | 14 (11 ratified / 3 approved) |
| `design: true` specs / `designed:` stamped | 31 / 28 | 11 / 10 |
| `design: true` specs that reached `done` without `designed:` | 0 | 0 |
| `design/components.json` entries (with `authorJustification`) | 26 (10) | 56 (43) |
| Commits touching `design/` | 48 | 48 |

## What works (measured)

- **Copy fidelity holds.** Sampled visible mock strings found verbatim in shipped source:
  prax 9/9, salon-os 5/5. Components are near-literal transcriptions of mock structure and
  DOM order; only the styling vocabulary changes (mock BEM/inline → Tailwind utilities).
- **The mock is the authority in practice.** No spec on either host skipped the design
  stage; every designed spec's `design_source` is a local `design/mocks/` file.
- **Atlas + coverage ledger exist and are derived**, not hand-maintained.

## What does not happen (measured)

- **The human catalog iteration loop.** The `ITERATE` state (user runs Storybook, reviews,
  Approve/Iterate rounds) is the stated reason `/spec:design` sits between plan and build.
  Across 38 designed specs there is **one** user-driven round commit (salon-os `3e179bd`).
  prax's 17 "round" commits are fidelity-review-driven (the model fixing its own render),
  not user iteration. salon-os's `storybook-static/` was last built 2026-08-18 while five
  design runs completed 2026-08-21 → 08-23.
- **The visual fidelity review.** salon-os contact-vault's `design-state.json` carries
  `fidelity-reviewed: true`; its `design-log.md` records that mark as "a waiver, not a
  performed review". prax trade-attribution *did* perform two rounds (`7fd756e`,
  `a6eb36c`) — and the render spike still found four unrecorded divergences (below).
- **Sidecar deletion at reconcile.** The driver's RECONCILE step says `rm -rf` the
  `##-name.design/` sidecar; on disk: salon-os 5/5 designed-spec sidecars remain, prax 3
  remain. They are gitignored (`specs/**/*.design/`), so nothing surfaces them. Each holds
  `extract.json` (~730 KB on prax) plus 400–650 `slice-*.html` files.

## Where the delta process is spent

`deltas.json` rows are the evidence-gated exemption from the source-grep fidelity gate.
salon-os has 20 rows across 3 sidecars: 8 excuse first-run tile copy for unbuilt routes,
6 excuse the mock's own dev-only state-switcher scaffolding, 6 excuse "absent producer"
copy plus one grounded-doctrine removal. prax has 1 row, excusing a fidelity-checker
granularity bug (intake PRAX-20260821-01). **Zero rows on either host excuse a taste or
layout divergence.** The exemption process is consumed by mock scaffolding and pipeline
defects, not by design decisions.

## Cost shape per design run

- Wall clock (first design commit → `designed:` stamp): prax 29–52 min per spec; salon-os
  same-day, 2–4 commits per spec.
- Agent boots on the driver's happy path (derived from the step text, not metered): Haiku
  match pass, Fable retainer, wf-design (foundation + N implement + showcase workers + gate
  + repair), Fable vision consult, per-round Sonnet worker, Sonnet reconcile + Haiku
  re-read — ~8–12 per spec, for typically 2–5 components.
- Output ratio: prax `2b-trade-attribution.html` 279 lines → 1,265 lines of
  components + fixtures + stories; salon-os `vault.html` 884 → 609 component lines plus a
  shared 2,529-line `showcase.stories.tsx`.
- Plugin-side churn: 67 commits on the design-stage files (`design.md`, `design` command,
  driver, `wf-design.js`, `fidelity-check.js`, `dc-extract.js`) between 2026-06-12 and
  2026-08-23.

## What the render-diff spikes found on CLEAN specs

Both surfaces had passed `/spec:review`. An accessibility-tree text/order + geometry diff
between the mock render and the Storybook story render, same viewport and theme:

| | salon-os contact-vault | prax trade-attribution |
| --- | --- | --- |
| Mock strings matched verbatim | 37/38 | 20/27 |
| Real, unrecorded divergences | 7 (cards 32 px narrower than mock; docked primary action ships in-flow 281 px lower; memo one line short; audit-note shrink-wrap; +3 minor) | 4 (headline P&L number at 14.5 px vs the mock's and `--text-headline`'s 26 px; header title one type-role small; caption/label swap; `--pos` green lost on the R figure) |
| What the existing process recorded | source-grep gate passed; visual review waived | no gate leg at all; two human rounds performed |
| Inventory noise floor (3 captures/side) | 0.00% | 0.00% |
| Zero-false-positive geometry tolerance | 0% | none without excluding data-positioned chart chips (12% noise > 4.4% signal); with exclusion ≈ {dx 1%, dw 1%, dh 15%} |
| Pixel-diff layer | ranking inverted (artefact first, real defect fifth) | ranking flat (real defect 22.3% vs non-defect 22.1%) |

False-positive classes the gate must handle by design (all seen on prax): CSS
`text-transform` invisible to DOM text (read `innerText`); `aria-label` replacing a glyph's
text; DOM order ≠ paint order for absolutely-positioned siblings; unbound mock regions
(status bar) consuming frame height; mock-side hygiene (no `border-box` reset, no
line-heights, 1 px device frame); fixtures exercising more branches than the mock
illustrates; static mock controls vs real links (role class, excuse by policy).

## Ledger note

No run ledger, escape row, or replay result on either host records a layout divergence,
because no mechanism could observe one — the source-grep gate has no geometry and the
visual review was waived or non-recording. The count is zero by blindness. The 11
divergences above are the first measurement of the class; both hosts' escape ledgers are
the place they should be recorded (`/spec:escape` against the two specs).
