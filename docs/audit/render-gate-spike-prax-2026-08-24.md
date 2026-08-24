# Render-gate spike — 2026-08-24, run 2 (prax trade-attribution)

Copied verbatim from the throwaway worktree `prax@spike/render-gate` (`spike/REPORT.md`); scripts on that branch. Run 1 (salon-os): `render-gate-spike-2026-08-24.md`. Field evidence: `design-stage-field-eval.md`. Consumed by roadmap brief 08 and ADR-0002.


Subject: the trade-attribution screen (`specs/20260814/03-trade-attribution-screen.md`).
Mock `design/mocks/2b-trade-attribution.html` vs component
`apps/web/src/components/trade/TradeAttributionScreen.tsx` (+ `CandleChart.tsx`),
rendered at the same framing.

Worktree: `/private/tmp/claude-501/-Users-jj-Projects-claude-plugins/a2b0419f-00fe-4fb7-b8cd-688920c2d075/scratchpad/prax-spike`
Branch: `spike/render-gate` (left in place, not merged, not pushed)

Method held identical to run 1 (salon-os): same three layers, same fixed/sticky
bucketing, same LCS text matching, 3 captures per side, same classification
table. Only host-forced values changed (paths, story id, root selector, ports,
colour scheme).

---

## 1. Environment facts

| fact | value |
| --- | --- |
| Framing | first viewport in `design/targets.json` — **mobile, 390 x 844**, `deviceScaleFactor 1` |
| Theme | **dark, on both sides.** `design/targets.json` lists `themes: ["dark","light"]` — dark first. `design/tokens.css:14` says "Dark is the canon default (`:root`)", so the mock is dark with no attribute set. `apps/web/.storybook/preview.ts` sets `withThemeByDataAttribute({ defaultTheme: 'dark', attributeName: 'data-scheme' })`. Verified in-page: the component iframe carries `data-scheme="dark"`. The brief's "light theme" assumption is wrong for this host; both sides ran dark. |
| Mock URL | `http://127.0.0.1:8899/design/mocks/2b-trade-attribution.html`, root `[data-screen-label="2b-trade-attribution"]` (python3 `http.server` over the worktree root, so `../tokens.css` resolves) |
| Story id | `trade--trade-attribution-screen-full` (`Trade / Trade Attribution Screen Full`), `parameters.layout: 'fullscreen'`, found via `/index.json` |
| Component URL | `http://localhost:6006/iframe.html?id=…&viewMode=story&globals=theme:dark`, root = `body` |
| Storybook | dev server, v10.5.2, port 6006. Self-reported **121 ms manager + 645 ms preview**; wall clock from `pnpm --filter web storybook` spawn to a serving `/index.json` **≈ 60 s** incl. Vite dep optimisation. `build-storybook` fallback not needed. Non-fatal boot warning: `Vite Failed to resolve dependency: use-sync-external-store/shim/with-selector`. |
| Playwright | `@playwright/test` **1.61.1** (resolved from `e2e/node_modules` — the workspace root does not expose it), Chromium **149.0.7827.55**, headless |
| Node | v26.0.0 |
| Capture cost | mock **1.12 s**, component **1.29 s**, compare **83 ms** — ~2.5 s per surface once Storybook is warm |
| Copy catalog | `.claude/spec.config.json` `design.copyCatalogs = ["apps/web/src/i18n/en.json"]`. Every shipped string on the component side comes from `m[...]`/`fill()` against that catalog (D9/D15). Irrelevant to a render diff — the diff reads painted output, not the source of the string — **except** that the catalog is where the one real copy-shaped divergence resolves (see §3 #3, `text-transform`). |
| Proto / state-switcher strip | **none in this mock.** Both captures are unmodified; nothing hidden. |
| Chart technology | **not canvas.** `CandleChart` is a hand-rolled **SVG** chart (D2, ADR-0012 "no new systems"); `lightweight-charts` is not a dependency of this repo (0 hits in `pnpm-lock.yaml`). Its IN/OUT/STOP labels are deliberately HTML `<div>` chips layered over the SVG (D18), not SVG `<text>`. See §6. |

Playwright API facts from run 1, re-confirmed here:

- `page.accessibility.snapshot()` does not exist in 1.61 either. Inventory is an
  in-page DOM walk (document order, `aria-hidden` subtrees pruned, own-text
  only), with `locator.ariaSnapshot()` captured alongside as a cross-check.
- `waitUntil: 'networkidle'` never fires against Storybook dev. Capture waits on
  `load` + first painted text + `document.fonts.ready`.

Scripts: `spike/render-gate.mjs` (capture; one added `--scheme` flag),
`spike/compare.mjs` (three layers, unchanged), `spike/probe.mjs` (ad-hoc
computed-style probe written for root-causing).
Artefacts: `spike/out/{mock,comp}.{inventory.json,axtree.yaml,png}`,
`spike/out/det-{mock,comp}-{1,2,3}.*`, `spike/out/compare.{txt,json}`.

---

## 2. Determinism (measured, not assumed)

Three consecutive captures per side:

| | inventory JSON | full-page PNG |
| --- | --- | --- |
| mock r1 vs r2 | **byte-identical** | **differs** |
| mock r1 vs r3 | **byte-identical** | **byte-identical** |
| component r1 vs r2 / r3 | **byte-identical** | **byte-identical** |

**Layer 1 + Layer 2 noise floor: 0.00%.** Inventories — text, order, roles and
every bounding box to 2 dp — are byte-identical across all three runs on both
sides. That is the only floor the gate candidates depend on.

**Layer 3 noise floor is nonzero here, unlike run 1.** Mock run 2 differs from
runs 1 and 3 by exactly **28 pixels of 331,632 (0.0084%)**, every one of them at
**max channel delta 1/255**. Their coordinates are all on the mock frame's
antialiased rounded edge — `x ∈ {390,391}` down the right border, `y ∈ {844,845}`
along the bottom, clustered at the corner arcs of the root's
`border-radius: 36px`. It is 1-LSB rasterisation jitter in the corner arc, below
`pixelmatch`'s `threshold: 0.1`, so it scores 0 differing pixels under the
Layer-3 metric actually used. Recorded because run 1 reported byte-identical
PNGs and this host does not.

---

## 3. Layer 1 — TEXT / ORDER (hard gate candidate)

| metric | value |
| --- | --- |
| mock strings | **27** |
| render strings | **25** |
| matched verbatim (LCS) | **20** |
| missing in render | **7** |
| extra in render | **5** |
| order violations | **1** |
| role mismatches on matched pairs | **4** |

### Every miss / extra / role change, classified by hand-reading both files

| # | string(s) | dir | class | evidence |
| --- | --- | --- | --- | --- |
| 1 | `09:52` | missing | **unbound region — device chrome** | The mock's `2b-trade-attribution/statusbar` region. The spec's own mock comment and D10 both say the status bar is "deliberately left OUT of every binding — its clock is device chrome no shipped screen renders", and `.claude/design-coverage.json` binds exactly five regions (`/chart /footer /header /headline /rules`) — never `/statusbar`. Not a component defect. The gate needs a region-scoping input; it cannot diff a whole mock file blind. |
| 2 | `‹` (back) missing / `Back to verdict` (link) extra | both | **extractor artefact — `aria-label` overrides own text** | Both sides render the glyph `‹`. The component's back control is `<a aria-label="Back to verdict">‹</a>` (`TradeAttributionScreen.tsx`, `BACK_CHEVRON`); the extractor's rule "an interactive element with an aria-label reports the label as its accessible name" replaces `‹` with `Back to verdict`. One visible glyph, reported as a miss **and** an extra, and the extra collides by text with the footer's genuine "Back to verdict" button. Self-inflicted by the extractor; the mock's static `<div>‹</div>` has no accessible name to collide with. |
| 3 | `4H CANDLES · THE EXACT MOMENT EACH RULE FIRED` missing / `4h CANDLES · …` extra | both | **`text-transform` blind spot — FALSE POSITIVE, new class** | The catalog template is `"{tf} CANDLES · …"` and the fixture carries `timeframe: "4h"` (lowercase is what the wire carries). The renderer applies `className="… uppercase …"`. Measured in-page: `textContent` = `"4h CANDLES…"`, `getComputedStyle().textTransform` = `"uppercase"`, `innerText` = `"4H CANDLES…"`. **The painted glyphs match the mock exactly; the DOM text node does not.** The 2026-08-14 fidelity-review commit `7fd756e` recorded fixing precisely this ("The eyebrow rendered `4h CANDLES`; the mock says `4H CANDLES` … Fixed in the RENDERER") — the fix is the CSS `uppercase`, and a DOM/a11y-text differ cannot see it. Fixable by reading `innerText` instead of `textContent`, but as written the gate fails closed on a correct component. |
| 4 | `18 MAR 04:00 · close 71,240.5 > band_upper 71,105` missing / `… · funding_rate 0.0004 ≤ 0.001` extra | both | **fixture is richer than the mock — real, sanctioned** | The mock hand-drew one entry comparison. `FULL_COMPARISONS` deliberately carries three shapes (one held, one `held:false` dropped per D4, one constant-side), so two render. Not a defect: D4 pins the grammar, not the count. But it is an unavoidable class — any fixture that exercises more branches than the mock illustrates breaks verbatim matching. |
| 5 | `24 MAR 12:00 · exit 74,660 ·` **and** `+4.8% on risk` missing / `24 MAR 12:00 · exit 74,660 · +4.8% on risk` extra | both | **REAL DIVERGENCE — the mock's `--pos` span is gone** | Mock element 146/147: the EX sub-line splits, with `+4.8% on risk` in `<span style="color: var(--pos)">` — the R figure is painted green. The component renders `exitSubline` as one `fill()` result in a single node; measured computed colour `rgb(196, 202, 211)` = `--text-color-muted-aa` for the whole line. Two mock entries collapse to one component entry, and the collapse *is* the defect. Nothing in the spec's D-rows or the design-log rounds records this as an excused divergence. Layer 1 caught a colour defect it was not designed to look for, via the element-count change. |
| 6 | `STOP` | order violation (1) | **DOM order ≠ visual order — FALSE POSITIVE** | The mock emits `STOP, IN, OUT` in document order; the component emits `IN, OUT, STOP` (`CandleChart.tsx` renders the two top chips then the stop chip). All three are `position: absolute` chips whose painted positions are identical in kind on both sides — Layer 2 reports `vertical order identical: YES`. The single order violation is an artefact of matching on DOM order when the elements are taken out of flow. |
| 7–10 | `‹` `›` `Back to verdict` `Next trade ›` | role: mock `text` → render `link` | **real divergence, sanctioned** | The mock draws all four controls as static `<div>`s; the component renders real TanStack `<Link>`s (D7, D14). Same class as run 1's `button → link`. Must be excused by policy, not tolerance. |

Net: of 12 unmatched entries, **2 are a real defect** (#5), **4 are false
positives** (#2 ×2, #3 ×2, plus the single order violation #6), **3 are
harness/fixture asymmetries the gate needs configured inputs to suppress**
(#1, #4), and **3 are the sanctioned static-mock→real-link role class** (#7–10).

---

## 4. Layer 2 — GEOMETRY (hard gate candidate)

20 matched pairs. Vertical position measured **relative to the first matched
pair** on each side. Position/size normalised by viewport width (390 px); height
by ratio. The `fixed`/`sticky` bucket is **empty on this surface** (0 pairs) — the
mock's root is a flex column with a pinned footer rather than a
`position: fixed` bar, so run 1's occlusion hazard does not arise here.

| metric | all / in-flow (20) |
| --- | --- |
| max position delta | **12.01%** |
| max width delta | **8.85%** |
| max height delta (ratio) | **42.47%** |
| vertical order identical | **YES** |
| pairs beyond 10% | **5** |
| nonzero deltas | dx **20/20** (min 0.26%), dw **13/20** (min 0.51%), dh **19/20** (min 0.46%) |

### The nine divergences behind every nonzero delta

| id | delta | what | real in production? |
| --- | --- | --- | --- |
| **D1** | dx **4.36%** (17.0 px) on `of 88`; dh **10.53%**; dh 4.58% on the title | **Header title is one type-role too small.** Mock element 106 is `font-size: 14.5px` = the `--text-title` token ("ui · screen titles · weight 600"). The component's header uses `className="… text-body …"` = 12.5 px. The `of 88` span, sliced from the same catalog template, therefore starts 17 px to the left. | **Yes** — the route renders this component. |
| **D2** | dw **8.85%** (34.5 px), dh **42.47%** (34 → 19.56 px) | **The headline P&L number renders at 56% of ratified size.** Mock: `font-family: var(--font-mono); font-size: 26px; font-weight: 600` — that is exactly `--text-headline: 26px /* mono · headline numbers · weight 600 */`, the token named for this. The component uses `text-title` (measured `fontSize: "14.5px"`, `lineHeight: "19.575px"`). The single biggest, most visible divergence on the screen, and a straight token-role misapplication. | **Yes.** |
| **D3** | dx **9.10%** (35.5 px), dw 3.32%, dh 8.19% | **`on risk · held 6d 8h` is a caption, not a label.** Mock `font-size: 12px` = `--text-label` ("ui · row titles"); component `text-caption` = 10.5 px (measured). Its dx is mostly cascade from D2 — a shorter headline pulls the baseline-aligned sibling left. | **Yes.** |
| **D4** | dh **0.46–13.29%** on 12 pairs | **Mock under-specifies line-height.** The mock sets `font-size` with no `line-height` → `normal`; the component applies the token leadings (`--text-micro--line-height: 1.35`, `--text-caption--line-height: 1.4`, `--text-body--line-height: 1.45`). Identical class to run 1's D5: **the component is the token-correct side**. | Yes (mock is the wrong side) |
| **D5** | dw **0.51%** (2 px), dh **9.09%** (22 → 20 px) on `EN`/`SZ`/`EX` | **Box model, not layout.** Mock chips are `width: 26px; height: 20px; border: 1px` under the mock's default `content-box` (no reset in the file) → 28×22 border boxes. The component measures `boxSizing: "border-box"`, `width: 26px`, `height: 20px` → 26×20. Same intent, different box model. | No — mock-side artefact of a missing `border-box` reset. |
| **D6** | dx **12.01%** (46.9 px) on `IN`, **7.77%** (30.3 px) on `OUT` | **Plot-interior geometry is a function of the data.** The mock hand-drew **30** candles with markers pinned at `left: 31.6%` / `78.3%`. The fixture delivers **54** bars (54 `<rect>`s measured) with entry at slot 9 and exit at slot 47 → `17.59%` / `87.96%` (measured `left` on the chips). Nothing is wrong with either side. This is the **largest position delta on the surface and it is not a defect** — the decisive tolerance result below. | **No** — data-driven. |
| **D7** | dyRel **2.96%** (11.5 px) at the chart, propagating ~2.5–3.1% through the rules card | **The chart card is 14 px taller than the mock's band.** Mock chart band is `height: 150px` with the IN/OUT chips overflowing above it at `top: -4px`. The component's `VIEWBOX_HEIGHT = LABEL_ZONE (14) + PLOT_HEIGHT (150) = 164` reserves the label zone *inside* the card (measured svg height 164 px). Partly offset upward by D2's shorter headline; the net at the chart is −11.5 px. | **Yes**, and it is the direct consequence of the D11 fidelity fix — traded for a stop chip that no longer clips. |
| **D8** | dh **4.35%** (46 → 44 px) on the footer's `Back to verdict` | Same `content-box` vs `border-box` class as D5: mock `height: 44px; border: 1px` → 46. `Next trade ›` has no border and matches at **dh 0.00%**. | No — mock-side artefact. |
| **D9** | dyRel **8.75%** (34.1 px) on both footer buttons; dx **0.26%** (1 px) on **20/20** pairs | **Two structural offsets.** (a) The 1 px dx floor on every pair is the mock root's `border: 1px solid var(--border-screen)` device frame — the component has no frame. (b) The footer's 34.1 px is the **unbound status bar consuming height**: both sides are 844 px tall with a bottom-pinned footer, so the 44 px the mock spends on `/statusbar` compresses its content by that much relative to its own header. Anchoring to the first matched pair removes a constant offset but **cannot** remove this, because the footer is anchored to the opposite edge. | No — both are frame/scoping artefacts, and (b) is a measurement hazard the gate must handle. |

### Tolerance — the decisive result, and it differs from run 1

**There is no single zero-false-positive tolerance on this surface.**

The reason is D6. The largest position delta on the whole surface — `IN` at
**12.01%** — is not a divergence at all: it is a chart marker sitting where the
fixture's 54 bars put it, against a mock that hand-drew 30. Meanwhile the
largest *real* position delta is D1 at **4.36%**. A single `dx` threshold that
stays silent on D6 (> 12.01%) is silent on every real divergence on the screen;
one that catches D1 (≤ 4.36%) fires on D6. **The ordering is inverted: noise
exceeds signal on the position axis.**

The gate is only viable with **plot-interior elements excluded by policy** (the
IN/OUT/STOP chips, and by extension anything positioned from data). With that
exclusion, per-axis zero-false-positive tolerances exist and are tight:

| axis | largest non-real delta after excluding the plot | smallest zero-FP tolerance | real divergences still caught |
| --- | --- | --- | --- |
| dx | 0.77% (D5/D9, 1–3 px frame + box model) | **> 0.77%** | D1 (4.36%), D3 (9.10%) |
| dw | 0.51% (D5 chip border) | **> 0.51%** | D2 (8.85%), D3 (3.32%), D1 (1.23%) |
| dh | 13.29% (D4 mock line-height, D5/D8 box model) | **> 13.29%** | D2 (**42.47%**) |
| dyRel | 8.75% (D9 unbound status bar) | **> 8.75%** | none on this surface |

So a workable fail-closed setting on this host is roughly
`{dx 1%, dw 1%, dh 15%}` with the plot excluded and `dyRel` disabled — and it
still catches D1, D2 and D3, the three real geometric defects. The `dh` floor is
the ugly one: it is set entirely by the *mock's* own under-specification (D4), so
13% of height error is invisible to the gate until the mocks declare
line-heights.

Smallest observed nonzero deltas, for calibration: **dx 0.26%** (1 px, the mock
frame border, on 20/20 pairs); **dw 0.51%** (2 px, chip border); **dh 0.46%**
(the rules-card eyebrow, pure leading rounding). Against a 0.00% inventory noise
floor, none of these is jitter — every one is nameable.

### Pairs beyond 10%

```
of 88                   dx=4.36%  dy=0.00%  dw=1.23%  dh=10.53%   (D1, D4)
⛁ RUN 12 · v3 · FROZEN   dx=0.26%  dy=0.03%  dw=1.03%  dh=13.29%   (D4, D9a)
+4.8%                   dx=0.26%  dy=0.48%  dw=8.85%  dh=42.47%   (D2)
18–24 MAR 24            dx=0.26%  dy=2.78%  dw=0.00%  dh=13.29%   (D4, D7)
IN                      dx=12.01% dy=2.96%  dw=0.00%  dh=5.88%    (D6, D7)
```

---

## 5. Layer 3 — PIXEL (advisory; run because the deps were already vendored)

20 regions compared (no sr-only or sub-4 px boxes on this surface), each crop
taken from both full-page PNGs at the matched element's own bbox, trimmed to the
common size, scored with `pixelmatch` (threshold 0.1) plus a normalised RGB RMS.

| statistic | value |
| --- | --- |
| differing-pixel share | min **0.05%**, p50 **12.31%**, p90 **22.86%**, max **25.10%** |
| normalised RMS | p50 **16.15%**, max **29.65%** |

Full ranking (badPct): `of 88` 25.10 · `on risk · held 6d 8h` 22.86 · `+4.8%`
22.27 · `OUT` 22.10 · `18–24 MAR 24` 20.18 · `BTC-P · Trade 47` 15.81 · `EN`
14.62 · `IN` 14.35 · `EX` 13.08 · `SZ` 12.31 · `20-day high breakout fired`
11.75 · `⛁ RUN 12 · v3 · FROZEN` 9.39 · `0.75% risk per trade` 9.14 ·
`Back to verdict` 6.68 · `Trailing stop hit` 6.62 · epistemic line 6.38 · `›`
4.09 · `‹` 3.95 · `WHICH RULES FIRED, IN ORDER` 3.51 · `Next trade ›` 0.05.

The failure mode here is different from run 1's, and no better. Run 1's ranking
was *inverted* (a screenshot artefact on top, the real defect fifth). Here the
ranking is loosely correct at the top but has **no dynamic range**: 18 of 20
regions score between 3.5% and 25.1%, and the one unambiguous catastrophe on the
screen — D2, a headline rendered at 56% of its ratified size — scores **22.27%**,
statistically indistinguishable from `OUT` at 22.10% (D6, not a defect at all)
and `18–24 MAR 24` at 20.18% (D4, the mock's own fault). There is no threshold
that separates D2 from two non-defects. Only `Next trade ›` at 0.05% is cleanly
identified as "the same". Layer 3 is not a gate candidate on this host either.

---

## 6. The chart — how a non-DOM-text chart actually shows up

The brief anticipated a canvas chart (`lightweight-charts`) whose text would be
invisible to the a11y tree, producing a `canvas-rendered` miss class. **That
class did not occur, and cannot occur on this component.** The facts:

- `CandleChart` is a hand-rolled SVG, no chart library (D2 cites ADR-0012, "no
  new systems"). `lightweight-charts` appears zero times in `pnpm-lock.yaml`.
- Its only text — `IN`, `OUT`, `STOP` — is rendered as absolutely-positioned
  **HTML `<div>` chips layered over the SVG**, never `<text>`. D18 records why:
  the SVG uses `preserveAspectRatio="none"` against a fixed 300-unit viewBox, so
  its coordinate system scales non-uniformly and would stretch glyphs (~1.19× at
  390 px, ~2.24× in the 672 px column). `vectorEffect="non-scaling-stroke"`
  exempts stroke width only, not text.
- Consequence for Layer 1: all three chart strings are **present and matched
  verbatim on both sides**. Zero `canvas-rendered` misses. The 54 `<rect>`/
  `<line>` candle elements carry no text and are simply invisible to the
  extractor — which is correct, they are geometry, not content.
- The SVG root carries `role="img" aria-label="4h CANDLES · …"`, duplicating the
  eyebrow string. The extractor did **not** emit it (an `<svg>` with no own text
  and a non-interactive role is skipped), so no spurious duplicate. A less
  careful extractor would have produced one.

What the chart *does* cost the gate is Layer 2, not Layer 1: **D6**, where marker
chip positions are a pure function of the sample data and produce the largest —
and entirely spurious — position delta on the surface. The policy a gate needs is
therefore not "canvas text is unreachable" but **"anything positioned from data
is out of scope for geometry"**. That policy is technology-independent: it would
also be the right answer for a canvas chart, where the chips would be missing
from Layer 1 instead.

---

## 7. Against what the existing gate and the fidelity rounds recorded

This host has **no `fidelity-check` script and no design leg in `scripts/gate.sh`**
— unlike run 1's host, there is no source-grep fidelity gate here at all. What
exists is:

- `.claude/design-coverage.json`, a *bookkeeping* manifest: it records that five
  regions of `2b-trade-attribution` (`/chart /footer /header /headline /rules`)
  were claimed by `specs/20260814/03-trade-attribution-screen.md` on 2026-08-14.
  `/statusbar` is absent, matching D10's "deliberately unbound". It asserts
  coverage, never fidelity — no copy, order or geometry check runs against it.
- No `.design/` sidecar directory and **no `deltas.json` anywhere in the repo**.
  Excused divergences live as `D`-rows in the spec's Decision table (D1–D22).
- Two human render-vs-mock rounds, both in git: `7fd756e`
  ("fidelity review round — chart geometry, honest degradation states": nine
  divergences, seven fixed, two ruled) and `a6eb36c` ("round 1 — chart labels out
  of the stretched coordinate system"), reconciled into D10–D19 by `297b5c7`.
  Both were performed — this host did not waive the visual half the way run 1's
  did.

Measured against that:

- **The render diff found three real geometric divergences none of it recorded.**
  D1 (header title at `text-body` where the mock says `--text-title`), **D2** (the
  headline P&L number at `text-title` 14.5 px where the mock and the token
  `--text-headline` both say 26 px mono/600), and D3 (`on risk · held` at
  caption where the mock says label). D2 is a screen-defining number rendered at
  56% of its ratified size, on a surface that had **two** dedicated
  render-vs-mock review rounds and a full `pnpm gate`. Nothing in D1–D22 excuses
  any of them.
- **Layer 1 found a fourth: the missing `--pos` span on the EX sub-line** (§3 #5).
  The mock paints `+4.8% on risk` green inside a muted line; the component paints
  the whole line muted-aa. D13 pins that `rNetLabel` is reused byte-for-byte in
  the `{r}` hole — which it is — but nothing pinned the tone, so it was lost.
- **It reproduces what the rounds *did* catch, and confirms one fix.** D11's
  "STOP chip must never clip the card edge" holds — the chip measures fully
  inside. D18's HTML-chip layering holds — all three labels are DOM text at their
  markers. D12's SZ-without-subline and EX-truncated-title both match verbatim.
- **The sharpest case runs the other way from run 1.** Commit `7fd756e` recorded
  fixing the eyebrow's `4h` → `4H` "in the RENDERER". The fix is a CSS
  `text-transform: uppercase`, and it is correct — the painted glyphs read
  `4H CANDLES`. But the render diff, reading DOM text, **fails closed on it**. In
  run 1 the grep passed a construct chosen to satisfy it while the render showed
  the outcome had not happened; here the human round produced a genuinely correct
  fix and the render diff calls it a defect. Both gates can be fooled — in
  opposite directions.
- **D19's escape is the standing warning.** The spec itself records that
  `TradeAttributionScreen` "shipped with NO cap at all at first pass — invisible
  to mock fidelity (the bound mock is a 390 frame) and to every gate leg (no
  lint/typecheck leg covers layout)", calling it "the third measured instance". A
  render diff at the first viewport only would have missed it too. Nothing in
  this spike tests wider viewports.

---

## 8. Wall clock

~1 h 05 min: worktree + `pnpm install` (~6 min, incl. resolving that
`@playwright/test` lives in `e2e/` and vendoring `pngjs`/`pixelmatch` into
`spike/vendor` rather than touching any manifest), reading the mock / component /
CandleChart / stories / fixtures / spec D-rows / design commits (~25 min),
adapting the two scripts (~5 min — one `--scheme` flag; nothing else was forced),
Storybook boot + captures + determinism runs (~8 min), root-causing D1–D9 against
`tokens.css` / `styles.css` and the in-page computed-style probe (~15 min), this
report (~10 min). Storybook booted on the first attempt; the `build-storybook`
fallback was never needed.

---

## 9. Verdict

**Qualified yes — Layer 1 + Layer 2 can be a fail-closed gate here, but only
behind two configured exclusions that run 1 did not need, and Layer 1 as written
produces false positives this host makes unavoidable.** The measurement half is
sound: three captures per side gave byte-identical inventories on both sides, a
0.00% noise floor on every text, order and geometry axis, so nothing needs a
tolerance to absorb jitter. Against that floor the diff found four real
divergences that two human render-vs-mock review rounds, a full `pnpm gate` and
the repo's coverage manifest all missed — a header title one type-role small
(D1), the screen's headline P&L number rendered at 14.5 px where both the mock
and the token literally named `--text-headline` say 26 px (D2, a 42% height
error on the most prominent element), a sibling caption/label swap (D3), and the
loss of the mock's `--pos` green on the EX sub-line's R figure, which Layer 1
surfaced as a span collapse. But the tolerance story is materially worse than run
1's 0%: the largest position delta on the surface, 12.01%, is a chart marker
placed by 54 fixture bars against a mock that hand-drew 30 — noise strictly
exceeding the largest real signal at 4.36% — so **no single zero-false-positive
threshold exists** until plot-interior elements are excluded by policy, after
which per-axis floors of roughly `{dx 1%, dw 1%, dh 15%}` work and still catch
D1–D3. The `dh` floor of 13.29% is set entirely by the mocks' own missing
line-heights, which is 13% of height error the gate cannot see. What would flake
beyond that: a DOM/a11y text differ is blind to `text-transform`, and this
component's *correct*, deliberately-fixed `4h`→`4H` uppercase reads as a copy
defect — reading `innerText` instead of `textContent` fixes it, and until it is
fixed the gate fails closed on correct code; the extractor's `aria-label`
override turns one back chevron into a simultaneous miss and extra that collides
by text with a real button; DOM order and visual order diverge for
absolutely-positioned chips, producing an order violation the geometry layer
simultaneously reports as clean; unbound mock regions (the status bar) both break
Layer 1 unless region-scoped and poison every bottom-anchored `dyRel`
measurement, because anchoring to the first matched pair removes a constant
offset but not a consumed-height one; the mock's 1 px device frame puts a 0.26%
dx floor under all 20 pairs; and the mock's `content-box` chips and buttons
disagree with the component's `border-box` by 2 px in both axes, which is a mock
hygiene problem masquerading as a component defect. The anticipated canvas class
never appeared — this chart is SVG with HTML label chips (D18), so all three
chart strings match verbatim and the real chart cost is geometric, not textual.
Layer 3 remains a non-candidate: on this host it is not inverted so much as
flat — 18 of 20 regions score between 3.5% and 25.1% differing pixels, and D2,
the one catastrophic visual defect, scores 22.27% against a non-defect at
22.10%.

---

## 10. Cross-host

| dimension | run 1 — salon-os / contact-vault | run 2 — prax / trade-attribution |
| --- | --- | --- |
| Framing | mobile 390×844, **light** | mobile 390×844, **dark** (host canon: `:root` is dark, Storybook `defaultTheme: 'dark'`) |
| Strings: mock / render / matched | 38 / 38 / **37** (97.4%) | 27 / 25 / **20** (74.1%) |
| Unmatched by class | 1 miss = harness (story under-renders shell); 1 extra = extractor wrapper nesting | 1 miss = unbound region; 2 = extractor `aria-label` override; 2 = `text-transform` blind spot; 2 = fixture richer than mock; **2 = real defect** (lost `--pos` span) |
| Order violations | 0 | **1** — false positive (absolutely-positioned chips, DOM order ≠ paint order; Layer 2 says order identical) |
| Role mismatches | 4 (`button` → `link`) | 4 (`text` → `link`) — same sanctioned class |
| Real layout divergences | **7** (D1–D7), all named | **4 real of 9** (D1, D2, D3, D7 real; D4 mock's fault; D5, D8 box model; D6 data-driven; D9 frame/scoping) |
| Biggest real divergence | D2, docked action ships in-flow, 281 px (72.12% dyRel) | D2, headline number at 56% of ratified size (42.47% dh, 34.5 px dw) |
| Noise floor — inventory | 0.00%, byte-identical ×3 | 0.00%, byte-identical ×3 |
| Noise floor — PNG | byte-identical ×3 | **not** identical: 28 px of 331,632 (**0.0084%**) at ΔRGB = 1, on the mock frame's rounded-corner antialiasing; scores 0 under `pixelmatch(threshold 0.1)` |
| Zero-false-positive tolerance | **0%** — any threshold > 0 is safe | **none exists** unmodified (D6 noise 12.01% > D1 signal 4.36%). With plot-interior elements excluded: dx > 0.77%, dw > 0.51%, dh > 13.29%, dyRel disabled |
| `fixed`/`sticky` bucket | 10 pairs; essential (D2 alone reports a spurious 72% uncorrected) | **0 pairs** — mock uses a flex column with a pinned footer, not `position: fixed`; the bucketing cost nothing and did nothing |
| Existing gate on that spec | `fidelity-check` source-grep **passed**; visual half **waived, never performed** | **no fidelity script and no design gate leg at all**; `design-coverage.json` is bookkeeping only; two human render-vs-mock rounds **were** performed (`7fd756e`, `a6eb36c`) |
| Diff vs that gate | reproduced the copy result, added 7 layout divergences the grep is blind to | added **4** divergences two performed human rounds + a full gate missed, incl. a 26 px → 14.5 px headline |
| Chart / canvas | none | SVG, not canvas; labels are HTML chips (D18) → **zero `canvas-rendered` misses**; cost is geometric (D6), not textual |

**New failure classes seen in run 2 that salon-os did not show**

1. **`text-transform` blindness** — a DOM/a11y text differ cannot see CSS-applied
   casing. Painted `4H`, DOM `4h`. Fails closed on correct code. (Fix: read
   `innerText`.)
2. **Noise > signal on the position axis** — data-driven plot geometry (D6,
   12.01%) exceeds every real divergence (max 4.36%), destroying any single
   threshold. Forces a plot-interior exclusion policy.
3. **`aria-label` override collision** — the extractor replaces a glyph's text
   with its accessible name, which then collides by text with a different, real
   control bearing the same string.
4. **DOM order vs paint order** — absolutely-positioned siblings emitted in a
   different source order produce an order violation with no visual counterpart.
5. **Unbound region consumes height** — a mock region excluded from every binding
   (the status bar) eats 44 px of a fixed-height frame, poisoning `dyRel` for
   every bottom-anchored element. Anchoring to the first matched pair does not
   remove it.
6. **Mock-side box-model drift** — mock files without a `border-box` reset report
   bordered elements 2 px larger in both axes than a Tailwind component.
7. **Mock device frame** — a 1 px root border puts a hard dx floor under 100% of
   pairs.
8. **PNG rasterisation jitter** — 1-LSB nondeterminism in rounded-corner
   antialiasing, absent in run 1.
9. **Fixture richer than mock** — a fixture built to exercise three branches
   against a mock that illustrates one breaks verbatim matching by construction.

**Classes salon-os showed that prax did not**

1. **`position: fixed` under `fullPage`** — run 1's single largest reported delta
   (72%) was an artefact requiring explicit bucketing. Prax has zero fixed/sticky
   pairs, so the correction was inert.
2. **Story under-renders the app shell** — run 1's one Layer-1 miss was a story
   that omitted `topBarStart`. Prax's story wraps the screen in a real
   `RouterProvider` with every destination registered (D1), so nothing was
   under-rendered.
3. **Wrapper-nesting doubling** — run 1's extra came from a component wrapping a
   button label in an inner element. Prax's controls hold their text directly.
4. **A gate engineered around itself** — run 1's D3 was a construct chosen
   specifically to satisfy the grep's whitespace collapsing. Prax has no
   source-grep fidelity gate for such a construct to be engineered against.

The shared results across both hosts: inventory capture is **byte-deterministic**
on every axis a gate would read; **Layer 3 is not a gate at any threshold** (run
1 inverted, run 2 flat); **role divergence (static mock control → real link) must
be excused by policy, never by tolerance**; and in both hosts the render diff
found **real layout divergences that the spec's own recorded process — grep gate
in run 1, two human review rounds in run 2 — did not catch**.
