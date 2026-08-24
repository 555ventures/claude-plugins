# Render-gate spike — 2026-08-24 (salon-os contact-vault)

Copied verbatim from the throwaway worktree `salon-os@spike/render-gate` (`spike/REPORT.md`); scripts `spike/render-gate.mjs` + `spike/compare.mjs` live on that branch. Companion field evidence: `design-stage-field-eval.md`. Consumed by roadmap brief 08a.


Subject: the contact-vault surface (`specs/20260821/04-contact-vault.md`).
Mock `design/mocks/vault.html` vs component `src/components/vault-screen.tsx`
(+ `audit-note.tsx`, `subject-strip.tsx`), rendered at the same framing.

Worktree: `/private/tmp/claude-501/-Users-jj-Projects-claude-plugins/a2b0419f-00fe-4fb7-b8cd-688920c2d075/scratchpad/salon-spike`
Branch: `spike/render-gate` (left in place, not merged, not pushed)

---

## 1. Environment facts

| fact | value |
| --- | --- |
| Framing | first viewport in `design/targets.json` — **mobile, 390 x 844**, `deviceScaleFactor 1` |
| Theme | **light** (`colorScheme: 'light'`; Storybook `initialGlobals.theme = 'light'`, passed explicitly as `globals=theme:light`) |
| Mock URL | `http://127.0.0.1:8899/design/mocks/vault.html`, root `[data-screen-label="ヴォールト"]` (python3 `http.server` over the worktree root, so `../tokens.css` resolves) |
| Story id | `showcase-living-showcase--vault-screen-populated` (`VaultScreen / 入力済み`), `parameters.layout: 'fullscreen'` |
| Component URL | `http://localhost:6006/iframe.html?id=…&viewMode=story&globals=theme:light`, root = `body` |
| Storybook | dev server, v10.5.8, port 6006. Self-reported **77 ms manager + 1.27 s preview**; wall clock from `pnpm storybook` spawn to a serving `/index.json` **<= 30 s** (first poll at 30 s already succeeded, incl. Vite dep optimisation). `build-storybook` fallback not needed. |
| Playwright | `@playwright/test` 1.62.1, Chromium **151.0.7922.34**, headless |
| Node | v26.0.0 |
| Capture cost | mock **807 ms**, component **1162 ms**, compare **88 ms** — ~2 s per surface once Storybook is warm |
| Proto / state-switcher strip | **none in this mock.** `vault.html` carries no ruling-21 scaffolding region (the sidecar's design-log R8 records this as compliance, not asymmetry). Nothing to hide; both captures are unmodified. |

Two Playwright API facts worth recording, both hit during the spike:

- `page.accessibility.snapshot()` **no longer exists** in 1.62 — the supported
  surface is `locator.ariaSnapshot()`. The inventory is therefore built by an
  in-page DOM walk (document order, `aria-hidden` subtrees pruned, own-text
  only so wrappers do not re-report their children), with `ariaSnapshot()`
  captured alongside as a cross-check.
- `waitUntil: 'networkidle'` **never fires** against Storybook dev — the HMR
  websocket stays open. The capture waits on `load` + first painted text.

Scripts: `spike/render-gate.mjs` (capture), `spike/compare.mjs` (three layers).
Artefacts: `spike/out/{mock,comp}.{inventory.json,axtree.yaml,png}`,
`spike/out/compare.{txt,json}`, `spike/out/crops/`.

---

## 2. Determinism (measured, not assumed)

Three consecutive captures per side:

| | inventory JSON | full-page PNG |
| --- | --- | --- |
| mock r1 vs r2 / r3 | **byte-identical** | **byte-identical** |
| component r1 vs r2 / r3 | **byte-identical** | **byte-identical** |

The measured run-to-run noise floor is **0.00%** on every axis. Exact-zero
deltas do occur among matched pairs (e.g. `本日の連絡を記録する` dx/dw/dh all
0.00%; `女性`/`顧客` dw 0.00%), so the pipeline is capable of reporting exact
equality — it is not smearing everything with jitter.

---

## 3. Layer 1 — TEXT / ORDER  (hard gate candidate)

| metric | value |
| --- | --- |
| mock strings | **38** |
| render strings | **38** |
| matched verbatim (LCS) | **37** |
| missing in render | **1** |
| extra in render | **1** |
| order violations | **0** |
| role mismatches on matched pairs | **4** |

The mock's 38 entries match the sidecar's recorded extract exactly
("1 surface, 9 regions, **38 copy strings**").

### Every miss / extra / role change, classified by hand-reading both files

| # | string | dir | class | evidence |
| --- | --- | --- | --- | --- |
| 1 | `女性詳細に戻る` (button) | missing | **fixture / harness — story is not the full screen** | Production supplies it: `src/routes/_authed.tsx` renders `topBarStart` as a `RouterLink` with `aria-label={chrome.back.label}`, and `src/routes/_authed.test.ts:60` pins `/women/wom_x/vault` -> back label `女性詳細に戻る`. `VaultScreenDemo` in `showcase.stories.tsx` calls `<AppShell title navItems activeKey>` and passes **no** `topBarStart`. Not a component defect. |
| 2 | `本日の連絡を記録する` (text) | extra | **inventory artefact — markup nesting depth** | Mock's `<button class="btn-primary">` holds the label as a direct text child -> 1 entry. The component's `PrimaryAction` wraps the label in an inner element -> button + inner text = 2 entries. Same single visible string. The identical doubling already occurs **symmetrically on both sides** for all four tab items (button/link + `<span>` label), so it is a known shape of the extractor, not a one-off. |
| 3–6 | `ホーム` `女性` `顧客` `案件` | role: mock `button` -> render `link` | **real divergence, sanctioned** | The mock draws `<button class="tab">` as static scaffolding; `AppShell` renders real navigation through its `linkComponent` prop (`RouterLink` in production, plain `<a>` in the story). The mock cannot navigate; the component must. |

No string in the mock is absent from the render for a real reason, and no
copy was invented. `QRコード画像` — the `sr-only` span the design-log R10.1
flagged as owed copy the gate must look for — is present on **both** sides and
correctly identified as visually-hidden (1x1 px) by both captures.

---

## 4. Layer 2 — GEOMETRY  (hard gate candidate)

37 matched pairs measured. Vertical position is compared **relative to the
first matched pair** on each side (absolute page-y is not comparable: one
missing element above shifts everything). Position and size are normalised by
viewport width (390 px); height uses a ratio.

| metric | all pairs | in-flow (27) | viewport-anchored, fixed/sticky (10) |
| --- | --- | --- | --- |
| max position delta | 72.12% | **4.10%** | 72.12% (dyRel) / 2.05% (dx) |
| max width delta | 28.97% | **28.97%** | 15.38% |
| max height delta (ratio) | 33.33% | **33.33%** | 11.72% |
| vertical order identical | **NO** | — | — |
| pairs beyond 10% | **13** | | |

Splitting the fixed/sticky bucket out matters: under a `fullPage` screenshot a
`position: fixed` element is rendered once at its **viewport-anchored** y, so
its page-y lands on whatever content happens to sit there. The capture records
a `fixed` flag per entry for exactly this reason.

### The seven divergences behind every nonzero delta

| id | delta | what | real in production? |
| --- | --- | --- | --- |
| **D1** | dx **4.10%** (16 px) on **27/27** in-flow pairs; dw **8.21%** (32 px) on card content | **Horizontal double-inset.** `AppShell`'s `<main className="px-4 …">` already insets 16 px, and every `VaultScreen` section adds `mx-4`. The mock insets 16 px total. Card content: mock x=33 w=324 -> component x=49 w=292. **The shipped cards are 32 px narrower than the ratified mock.** | **Yes** — `AuthedLayout` -> `AppShell` -> `Outlet` -> `VaultScreen` is the production path. |
| **D2** | dyRel **72.12%** (281 px) | **The docked primary action is not docked.** Mock `.thumb-zone-bar` is `position: fixed; bottom: calc(76px + safe)`, floating above the tab bar. `AppShell` has exactly that slot (`primaryAction` prop, fixed). `AuthedLayout` **never passes `primaryAction`**, and `VaultScreen` renders `<div className="flex justify-center px-5 py-3"><PrimaryAction …>` inline at the end of its body. The action scrolls with content instead of docking. Largest single divergence. | **Yes** |
| **D3** | dh **33.33%** (66.28 -> 44.19 px, 3 lines -> 2) | **内部メモ renders one line short.** Both sides use `pre-line`. The mock's `<p class="memo-body">` is pretty-printed, so its **leading newline survives** and renders a blank first line; the component's template literal has none. Confirmed visually (`spike/out/memo-{mock,comp}.png`). | **Yes** |
| **D4** | dw **28.97%** (113 px) | **`AuditNote`'s text block shrink-wraps.** Mock `.audit-note__text { flex: 1; min-width: 0 }`; the component's wrapper `<div>` around title+meta carries no `min-w-0 flex-1`, so it sizes to content (195 px vs 308 px). Heights are identical at this copy length — **latent**, surfaces the moment the title or meta grows. | **Yes**, latent |
| **D5** | dh **11.72%** (18 -> 20.39 px) on 6 pairs | **Caption line-height.** The mock's `.detail-card__label` and `.tab__label` set `font-size` but omit `line-height` -> `normal`; the component's `text-caption` role applies `--type-caption-leading`. The **component is the token-correct side**; the mock under-specifies. | Yes (mock is the wrong side) |
| **D6** | dx 2.05%, dw **15.38%** | **Top-bar title box.** `AppShell` always reserves `min-w-(--tap-min)` (44 px) for both `topBarStart` and `topBarEnd`, even when empty; the mock reserves only the leading back button and lets the title run to the edge. Title: mock x=60 w=314 -> component x=68 w=254. | Partly (trailing 44 px is structural; leading is the harness gap from Layer 1 #1) |
| **D7** | dw 1.03%, dx <=1.54% | **Tab item widths** 93.5 -> 97.5 px. Mock `.tab-bar` has `padding: var(--space-1) var(--space-2)`; `AppShell`'s `<nav>` has no horizontal padding, so four tabs divide the full 390 px. | Yes, small |

### Tolerance

**The smallest tolerance that yields zero false positives on this surface is 0%.**

There is no pair that fires without a nameable cause: every nonzero delta among
the 37 matched pairs traces to D1–D7. Combined with a byte-identical
determinism result, there is nothing for a tolerance to absorb.

Smallest observed nonzero deltas, for calibration:

- **dw 0.03%** (0.12 px, tab label `ホーム`) — a deterministic sub-pixel
  shaping difference downstream of D5/D7's box change, reproducible across all
  three runs. Not jitter.
- in-flow **dx min 3.85%**, in-flow **dh min 9.46%** — i.e. once you are above
  the sub-pixel band, the next thing you hit is already a 16 px real shift.

Practically: any threshold strictly greater than 0 is false-positive-free here.
The floor is set by **how much real divergence you are willing to excuse**, not
by measurement noise. A gate set at 1% of viewport width would fire on D1–D6; a
gate set at 10% would fire on 13 pairs and still catch D1 (via dw), D2, D3, D4
and D6.

### Pairs still differing beyond 10% (real layout divergence)

```
連絡先ヴォールト            dx=2.05%  dy=0.00%  dw=15.38% dh=0.00%    (D6)
この画面の閲覧は記録されました   dx=4.10%  dy=2.69%  dw=28.97% dh=0.00%    (D4, D1)
2026-08-20 14:32 田中     dx=4.10%  dy=2.69%  dw=28.97% dh=0.00%    (D4, D1)
連絡先                    dx=4.10%  dy=2.69%  dw=8.21%  dh=11.72%   (D1, D5)
内部メモ                   dx=4.10%  dy=3.31%  dw=8.21%  dh=11.72%   (D1, D5)
連絡は昼過ぎ以降が…            dx=4.10%  dy=3.92%  dw=8.21%  dh=33.33%   (D3, D1)
連絡記録                   dx=4.10%  dy=1.75%  dw=8.21%  dh=11.72%   (D1, D5)
最終連絡日                  dx=4.10%  dy=1.39%  dw=0.00%  dh=11.72%   (D1, D5)
本日の連絡を記録する             dx=0.00%  dy=72.12% dw=0.00%  dh=0.00%    (D2)
ホーム / 女性 / 顧客 / 案件    dx<=1.54% dy=3.11%  dw<=0.03% dh=11.72%   (D5, D7)
```

---

## 5. Layer 3 — PIXEL  (advisory)

36 regions compared (sr-only and sub-4px boxes excluded), each crop taken from
both full-page PNGs at the matched element's own bbox, trimmed to the common
size, scored with `pixelmatch` (threshold 0.1) plus a normalised RGB RMS.

| statistic | value |
| --- | --- |
| differing-pixel share | p50 **3.31%**, p90 **22.92%**, max **80.21%** |
| normalised RMS | p50 **8.17%**, max **55.58%** |

### Worst 5 regions, eyeballed

| # | region | size | bad px | RMS | reason (read from the crops) |
| --- | --- | --- | --- | --- | --- |
| 0 | `最終更新: 2026-08-14 田中` | 292x20 | **80.21%** | 55.58% | **Occlusion artefact, not a divergence of this element.** The mock's `position: fixed` thumb-zone bar (D2) is painted once at its viewport-anchored y in the `fullPage` screenshot and lands squarely on this line — the mock crop is mostly the blue button. |
| 1 | `女性` | 24x18 | 25.93% | 19.52% | **Visually identical** (crops read the same accent-blue glyphs). A ~2 px box shift (D7) inside a tiny crop makes antialiased CJK strokes miss. |
| 2 | `顧客` | 24x18 | 22.92% | 15.19% | Same cause as #1. |
| 3 | `案件` | 24x18 | 22.92% | 15.86% | Same cause as #1. |
| 4 | 内部メモ body | 292x44 | 14.38% | 23.41% | **The one genuine visual divergence in this list** — D3, one line short. |

The ordering is the finding: the single real visual defect (#4) ranks **below
three visually-identical tab labels**, and the top region is a screenshot
artefact. On small CJK text at `deviceScaleFactor 1`, per-region pixel scores
are dominated by sub-pixel offset and are **anti-correlated with severity**.
Layer 3 cannot be a gate; it is not even a reliable triage ranking here.

---

## 6. Against what the existing source-grep gate recorded

From the sidecar `specs/20260821/04-contact-vault.design/`
(`design-log.md`, `design-state.json`):

- The deterministic half **passed**: "`fidelity-check` passed fail-closed on
  copy, element order and layout across all six bound regions", build gate
  green (350 tests, 0 clones). Extract: 38 copy strings, 0 colour literals.
- The visual half **did not run**. `design-state.json` carries
  `"fidelity-reviewed": true`, and the log records it plainly as "a **waiver,
  not a performed review**" — the render-vs-mock `FIDELITY_REVIEW` consult was
  never dispatched; the user approved directly. Nothing judged spacing rhythm,
  size hierarchy or token-role application.
- No `deltas.json` exists for this spec (the three that exist are
  `20260816/02`, `20260814/04`, `20260814/03`), so nothing was recorded as an
  excused divergence for contact-vault.

Measured against that:

- **The render diff reproduces the grep's copy result independently.** 38 mock
  strings, 37 matched verbatim, 0 order violations, and both the single miss
  and single extra are explained as harness/extractor effects rather than
  component defects. Layer 1 finds nothing the grep missed on copy.
- **The render diff finds seven layout divergences the grep could not have
  seen** (D1–D7), because `fidelity-check.js` reads raw file text collapsed by
  `/\s+/g` — it has no geometry at all. "Layout across all six bound regions"
  passed while the shipped cards are 32 px narrower (D1) and the mock's docked
  thumb-zone action ships as an in-flow button 281 px lower (D2).
- **D3 is the sharpest case.** The design-log's B2 ruling was *engineered
  around* the grep's whitespace collapsing: "a template literal spanning two
  source lines matches (the newline collapses to dc-extract's space) while a
  `'\n'` escape stays a literal backslash-n and would fail. Author the template
  literal; never the space-joined single line." The stated goal was that "the
  rendered break matches the ratified mock." It does not — the mock renders
  **three** lines (its own pretty-printed leading newline survives `pre-line`),
  the component renders **two**. The grep passed the exact construct that was
  chosen to satisfy it, and the render shows the outcome it was chosen to
  guarantee did not happen.

---

## 7. Wall clock

~1 h 10 min of the 2 h budget: worktree + `pnpm install` (~2 min), reading the
mock / component / sidecar / shell (~20 min), `render-gate.mjs` incl. two
Playwright API dead-ends (~15 min), `compare.mjs` + fixed/sticky bucketing
(~15 min), determinism runs, crop eyeballing and root-causing D1–D7 against
`app-shell.tsx` / `_authed.tsx` (~15 min), this report (~10 min). Storybook
booted on the first attempt; the `build-storybook` fallback was never needed.

---

## 8. Verdict

**Yes — Layer 1 + Layer 2 can be a fail-closed gate on this surface, and on
this surface they ran at zero false positives.** Layer 1 produced 37/38 verbatim
matches with 0 order violations and exactly two unmatched entries, both of which
are properties of the harness and the extractor rather than the component;
Layer 2 produced no delta that lacks a named structural cause, against a
measured noise floor of exactly 0.00% (three captures per side, byte-identical
inventories *and* byte-identical PNGs), so the smallest zero-false-positive
tolerance is 0% and any threshold above it is safe. It is also strictly stronger
than the gate it would replace: it reproduces the source-grep's copy result
independently while additionally catching seven layout divergences the grep is
structurally blind to — including D3, the one the design-log's B2 ruling was
explicitly engineered to make the grep pass. What would flake: the two
unmatched Layer-1 entries are both fixable-by-convention rather than inherent —
the miss disappears if stories render the same chrome the route does (pass
`topBarStart`), and the extra disappears if the extractor collapses a
button/label wrapper pair, but until both are pinned, any component that adds or
removes a wrapper element, or any story that under-renders the shell, moves the
counts; role classification (mock `button` vs shipped `link`) will fire on every
mock that draws navigation as static scaffolding and must be excused by policy,
not by tolerance; `position: fixed` elements need the explicit bucketing added
here or their page-y is meaningless under a `fullPage` screenshot (uncorrected,
D2 alone reports a spurious 72% on any fixed element); dynamic fixture content —
dates, names, counts — would break verbatim matching wherever a story is not
pinned to the mock's own sample values, which for this spec only holds because
retainer ruling B1 put the mock's values in the fixtures; and the whole thing
inherits Storybook's boot as a dependency, where `networkidle` never settles and
`page.accessibility.snapshot()` no longer exists, so the capture is pinned to
`load` + first-paint waits and `locator.ariaSnapshot()`. Layer 3 is not a gate
candidate at any threshold: its worst region was a screenshot occlusion
artefact, its next three were visually identical tab labels, and the one real
visual defect ranked fifth.
