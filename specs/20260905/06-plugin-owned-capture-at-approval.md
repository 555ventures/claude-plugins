---
date: 2026-09-05
status: done
tier: critical
area: design-render
design: false
breaking: false
depends_on: [specs/20260905/05-desktop-fill-render-rule.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-05
open_markers: 0
diff_base: 13f5d831d9f2336f7c1ca6aa5cb1f1a28ff7ef16
---

# Plugin-owned browser capture, bound at the mocks-first approval marks

## Goal

No rendered check has ever run on a mocks-first product: `/spec:mocks`'s `journey-approved`
and `approved` marks run only the static `design-atlas.js check --matrix`, and
`render-gate --mocks` refuses any host that has not declared `design.render.capture` — none
of Hearwell, nor any genesis-born product, ever has. Done means: the plugin ships its own
dependency-free capture script (an installed Chrome driven over the DevTools protocol with
Node built-ins — executed today on all 31 Hearwell mocks), `render-gate --mocks` falls back to
it when the host declares no capture command and runs the plugin's adaptation rules when the
host declares no manifest, and the mocks driver runs that gate at every `journey-approved`
and at `approved`, refusing the mark on a finding or on a machine with no browser. JJ's ruling
2026-09-05 overturns specs/20260824/01 D1's "never launches a browser itself" for this path
(ADR-0007 amends ADR-0002).

Tier critical: this edits `spec/bin/spec-paths` (a listed critical surface) and changes what
a terminal approval stamp requires of every mocks-first host.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `spec/scripts/render-capture.js` implements the host capture flag contract verbatim (`--url --width --height --theme --state --script --out`) plus a plugin-internal `--batch <cells.json>` (one Chrome for many cells) and `--which` (print the resolved browser path, exit 2 when none) (AC-20260905-06-1, AC-20260905-06-2, AC-20260905-06-3) | Same contract means a host may still declare its own command and nothing else in render-gate changes; batch exists because one Chrome launch costs 2.2–3.4 s measured (A3) and a 62-cell approval run would take minutes per-cell |
| D2 | Browser resolution: `CHROME_BIN` when set is the only candidate (no fallback scan); else the macOS Google Chrome/Chromium app paths, then `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser` on PATH — the notes-layer test's own list (AC-20260905-06-3) | `CHROME_BIN`-only when set makes "no browser" testable on a machine that has one; the list is what already works in this repo |
| D3 | `render-gate --mocks` with no `design.render.capture`: run `render-capture.js --which` first — exit 2 there maps to render-gate exit 2 naming the remedy (install Google Chrome or set `CHROME_BIN`, or declare `design.render.capture`); otherwise capture every cell through one `--batch` call. `--mocks` mode no longer requires `design.render.url` or a `design.render` block at all; `--spec` mode's preconditions are unchanged (AC-20260905-06-4, AC-20260905-06-5, AC-20260905-06-11) | JJ ruling: fail-closed, never warn-and-approve; `--spec` mode needs the host's component URL and stays host-declared |
| D4 | `render-gate --mocks` with no `design.rulesManifest` runs `spec/templates/adaptation-rules.json` (no-overflow error, desktop-fill error, line-length warn) and prints `rules: no design.rulesManifest declared — adaptation rules only (<path>)` in place of the skip line; `--spec` mode keeps the skip line (AC-20260905-06-6, AC-20260905-06-11) | Mocks-first hosts have no genesis manifest; the full template's palette/contrast/cta rows are host-taste and would misfire on wire-stage mocks, the three adaptation rows are viewport physics |
| D5 | `mocks-driver.js` runs `render-gate --mocks <that journey's top-level mocks>` inside `journey-approved` (after `requireNotesResolved`, before the stop decision is consumed) and `render-gate --mocks <every top-level mock>` inside `approved` (after `check --matrix`); exit 1 or 2 refuses the mark with the gate's own output; exit 3 refuses naming the capture failure (AC-20260905-06-7, AC-20260905-06-8, AC-20260905-06-9) | Journey-level catches a phone-column shell at the first journey, when one shell css edit fixes it; `approved` is the whole-set backstop; refusing on 2/3 is the fail-closed ruling |
| D6 | The driver honours a host-declared `design.render.capture` untouched (render-gate's own resolution decides); tests drive the driver with a fixture capture command, and the real Chrome path is pinned once, `[env: CHROME_BIN]`, in render-capture's own test (AC-20260905-06-1, AC-20260905-06-7) | Driver tests stay under the 45 s file budget; the executed browser pin lives where the browser code lives |
| D7 | `spec-paths` gains `render-capture`; `entrypoints.json` gains the row with `spec/scripts/render-gate.js` as its entry point (AC-20260905-06-10) | New-surface checklist (host pipeline rules § Planning); an unregistered script is invisible to the conformance guard |
| D8 | ADR-0007 records the reversal: plugin-owned capture is a fallback for mock-only rendering, host-declared capture stays the component path; ADR-0002 gains an `Amended by ADR-0007` line under § Decision (orchestrator duty, see below) [no-ac: decision record; the doctrine leg reads it] | Roadmap amendment ADRs are the mechanism (memory: Applies to ↔ Amended by backlinks); a reversed D1 without a record is an oral tradition |
| D9 | design.md § Design Canon and mocks.md § marks paragraph each gain one sentence: the rendered adaptation check runs at `journey-approved`/`approved` through the plugin capture when the host declares none; design.md stays ≤ 160 lines [no-ac: doctrine prose; AC-20260824-05-2's cap is the mechanical check] | The invariant a session reads must match what the driver does |
| D10 | Batch cells are captured sequentially in one page session with `Emulation.setDeviceMetricsOverride` per cell, `Page.navigate`, load event + 300 ms settle, then `Runtime.evaluate` of `(<script>)({theme, state})` by value, written to each cell's `--out`; any JavaScript dialog is auto-accepted (AC-20260905-06-2) | The executed spike's exact sequence (A1); the 300 ms settle and dialog handling are what the notes-layer pin already needed |

Orchestrator duty (outside the File Plan table): the `docs/adr/0007-plugin-owned-capture.md`
row's worker also appends `- Amended by: ADR-0007 (plugin-owned capture fallback for
mock-only rendering)` under § Decision of `docs/adr/0002-fidelity-judged-at-render.md` — one
line, no other change to that file.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/render-capture.js | CREATE | scripts | DevTools capture: host contract flags, `--batch`, `--which`, D2 resolution, D10 sequence; header per Worker Rules with `Exit codes:` |
| spec/scripts/render-gate.js | MODIFY | scripts | `--mocks` precondition relax + plugin capture fallback via `--which`/`--batch` (D3); default adaptation manifest + line (D4); `--json` gains `capture: "host"\|"plugin"` |
| spec/templates/adaptation-rules.json | CREATE | doctrine | Three rules: `no-mock-overflow`, `desktop-fill`, `line-length` (copies of the design-rules.json rows) |
| spec/scripts/mocks-driver.js | MODIFY | scripts | `handleJourneyApproved` + `handleApproved` run render-gate `--mocks` (D5), refuse on 1/2/3 with the gate's output |
| spec/bin/spec-paths | MODIFY | scripts | `render-capture` key + usage list (D7) |
| spec/entrypoints.json | MODIFY | doctrine | `spec/scripts/render-capture.js` row, entry point render-gate.js (D7) |
| docs/adr/0007-plugin-owned-capture.md | CREATE | other | Amendment ADR (D8): context, decision, consequences, Applies to ADR-0002 D1 |
| spec/doctrine/design.md | MODIFY | doctrine | One sentence (D9), ≤ 160 lines |
| spec/doctrine/mocks.md | MODIFY | doctrine | § marks paragraph: `journey-approved`/`approved` run the rendered adaptation gate (D9) |
| tests/render/render-capture.test.js | CREATE | tests | AC-20260905-06-1 `[env: CHROME_BIN]`, AC-20260905-06-2 `[env: CHROME_BIN]`, AC-20260905-06-3 |
| tests/render/render-gate.test.js | MODIFY | tests | AC-20260905-06-4, AC-20260905-06-5, AC-20260905-06-6, AC-20260905-06-11; AC-20260824-04-10's fixture inventory gains a `page` block (D4 reaches it) |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260905-06-7, AC-20260905-06-8, AC-20260905-06-9 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260905-06-10 (key list pin extended in place) |
| tests/consistency/entrypoints.test.js | MODIFY | tests | AC-20260905-06-10 (row present) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.88.0 — next free at build time per Gotchas) + changelog paragraph |

## Contracts

`render-capture.js`:

```
render-capture.js --url <u> --width <w> --height <h> --theme <t> --state <s> --script <file> --out <json>
render-capture.js --batch <cells.json>      # [{url,width,height,theme,state,script,out}, …]
render-capture.js --which                   # prints the resolved browser path
Exit codes: 0 = every cell written · 2 = usage, or no browser resolved (stderr names
CHROME_BIN / install Google Chrome / declare design.render.capture) · 3 = the browser
announced no DevTools endpoint within 15 s, a navigation never fired load within 20 s, or the
script threw (stderr names the cell's url)
```

Browser launch (D10, the spike's argv): `--headless=new --disable-gpu --no-first-run
--no-default-browser-check --user-data-dir=<fresh tmp> --remote-debugging-port=0 about:blank`;
the DevTools URL is read from stderr's `DevTools listening on ws://…`; the socket is Node's
global `WebSocket` (Node ≥ 22; this repo runs 26). `Browser.close` is raced against a 2 s
timer, then `SIGKILL`.

`render-gate --mocks` resolution (D3/D4):

```
capture = config.design?.render?.capture   → host command per cell (unchanged)
        | absent → `render-capture.js --which` (exit 2 → gate exit 2, remedy text) then ONE
                   `--batch` over every cell
rules   = config.design?.rulesManifest      → as today
        | absent → spec/templates/adaptation-rules.json, line
                   `rules: no design.rulesManifest declared — adaptation rules only (<abs path>)`
--json  += { capture: "host" | "plugin" }
```

Driver refusal text (D5): `journey "<j>" fails the rendered adaptation gate:\n<render-gate
stdout>` (exit 2, mark not recorded) for gate exit 1; the gate's own stderr for its exit 2/3,
prefixed `render-gate --mocks could not run:`.

## Behavior

At `--mark journey-approved --journey <j>` on a host with no capture command: the driver
spawns render-gate `--mocks` over that journey's `design/mocks/<label>.html` files;
render-gate finds Chrome, serves `design/`, captures every theme × viewport cell in one
browser, runs the adaptation rules per cell, and prints the per-cell ✅/❌ lines. A
phone-column shell yields one `desktop-fill` finding per wide cell per screen and the mark
refuses; the author widens the shell css (or marks the mock `data-narrow`), `shell sync`s,
and re-marks. On a machine with no Chrome the mark refuses before any capture with the
three-way remedy. `approved` repeats over the whole set. Hosts that already declare
`design.render.capture` (prax, salon-os, upwell) see no change in `/spec:sketch`; their
`/spec:mocks` marks, if ever run, use their own capture. Measured cost (A3): ~2.5 s launch +
~0.4 s per cell — Hearwell's 62-cell `approved` ≈ 30 s.

## Acceptance Criteria

- **AC-20260905-06-1** `[env: CHROME_BIN]`: WHEN render-capture.js runs with the host
  contract flags against a served mock whose root carries `data-screen-label` and a 900px
  child at `--width 390` THE SYSTEM SHALL write `--out` as a parseable inventory with
  `page.clientWidth` 390 and `page.scrollWidth` ≥ 900 and exit 0 → test in
  tests/render/render-capture.test.js
- **AC-20260905-06-2** `[env: CHROME_BIN]`: WHEN render-capture.js runs `--batch` over two
  cells of the same mock at widths 390 and 1440 THE SYSTEM SHALL write both `--out` files with
  `page.clientWidth` 390 and 1440 respectively, having launched the browser once (one
  `--user-data-dir` created) → test in tests/render/render-capture.test.js
- **AC-20260905-06-3**: WHEN `CHROME_BIN=/nonexistent/chrome` THE SYSTEM SHALL exit 2 on
  `--which` (and on any capture) naming `CHROME_BIN`, `Google Chrome`, and
  `design.render.capture`, and WHEN `CHROME_BIN` names an existing executable THE SYSTEM SHALL
  print that path on `--which` and exit 0 → tests in tests/render/render-capture.test.js
- **AC-20260905-06-4**: WHEN render-gate.js `--mocks <mock>` runs against a root whose config
  has no `design` block and `CHROME_BIN=/nonexistent/chrome` THE SYSTEM SHALL exit 2 naming
  `CHROME_BIN` and `design.render.capture` — never exit 0 and never print a sentinel → test in
  tests/render/render-gate.test.js
- **AC-20260905-06-5**: WHEN render-gate.js `--mocks` runs against a root with no `design`
  block and `CHROME_BIN` pointing at a fixture executable that honours `--batch` by writing a
  canned inventory per cell THE SYSTEM SHALL invoke it exactly once for 1 theme × 2 viewports,
  report `capture: "plugin"` in `--json`, and exit 0 with `__RENDER_GATE_PASS__` when the
  canned inventories pass the adaptation rules → test in tests/render/render-gate.test.js
  (the fixture stands in for `render-capture.js`'s browser only — `--batch` parsing is
  exercised through the real render-gate → render-capture argv; render-capture's own Chrome
  path is AC-1/AC-2)
- **AC-20260905-06-6**: WHEN render-gate.js `--mocks` runs with a host capture command and no
  `design.rulesManifest` THE SYSTEM SHALL print `rules: no design.rulesManifest declared —
  adaptation rules only (` + the template's absolute path + `)` and, over a canned inventory
  with `page: { scrollWidth: 900, clientWidth: 390 }`, print a `no-overflow` finding and exit
  1 → test in tests/render/render-gate.test.js
- **AC-20260905-06-7**: WHEN `mocks-driver.js --mark journey-approved --journey <j>` runs on a
  fixture host declaring a capture command whose canned inventory for `<j>`'s screen is a
  phone-width column at the 1440 cell THE SYSTEM SHALL exit 2 with `fails the rendered
  adaptation gate` and a `desktop-fill` line, and `status.journeys[j].approved` SHALL remain
  unset → test in tests/mocks/mocks-driver.test.js
- **AC-20260905-06-8**: WHEN the same mark runs with canned inventories that fill the 1440
  cell THE SYSTEM SHALL record `journeys[j].approved` and print the checkpoint line → test in
  tests/mocks/mocks-driver.test.js
- **AC-20260905-06-9**: WHEN `--mark approved` runs on a host with no `design` block and
  `CHROME_BIN=/nonexistent/chrome` THE SYSTEM SHALL exit 2 with `render-gate --mocks could
  not run:` naming `CHROME_BIN`, and `marks.approved` SHALL remain null → test in
  tests/mocks/mocks-driver.test.js
- **AC-20260905-06-10**: WHEN `spec-paths render-capture` runs THE SYSTEM SHALL print an
  absolute path ending in `spec/scripts/render-capture.js`, and `spec/entrypoints.json` SHALL
  carry that path with `spec/scripts/render-gate.js` among its entry points → tests in
  tests/spec-paths.test.js and tests/consistency/entrypoints.test.js
- **AC-20260905-06-11**: WHEN render-gate.js `--spec <spec>` runs against a config with no
  `design.render` THE SYSTEM SHALL CONTINUE TO exit 2 naming `design.render.capture`,
  `design.render.url`, and `/spec:design`, and WHEN `--spec` mode runs with no
  `design.rulesManifest` THE SYSTEM SHALL CONTINUE TO print `rules: no design.rulesManifest
  declared — skipped` → existing AC-20260824-01-7 and AC-20260824-04-9 tests tagged in place
  in tests/render/render-gate.test.js

## Assumptions (escalation triggers)

- A1: an installed Chrome driven over DevTools with Node built-ins captures the real
  inventory expression — **executed** (2026-09-05: `design-atlas.js serve` on Hearwell +
  headless Chrome `--remote-debugging-port=0`, global `WebSocket`, `Target.createTarget` /
  `attachToTarget {flatten}` / `Page.enable` / `Runtime.enable` /
  `Emulation.setDeviceMetricsOverride` / `Page.navigate` / `Page.loadEventFired` + 300 ms /
  `Runtime.evaluate {returnByValue}` of `(<render-inventory.browser.js>)({theme,state})` → 31
  documents with `page`, `entries`, correct `clientWidth` at 1440 and 390). **If false** on a
  host machine: exit 3 names the cell; the mark refuses.
- A2: `render-inventory.browser.js` evaluates unchanged under `Runtime.evaluate` (it is a
  bare expression) — **executed** (same spike, `(${INV})({...})`). **If false**: STOP — the
  file's own header forbids a module wrapper.
- A3: launch cost 2.2–3.4 s per Chrome process, ~0.4 s per additional page in the same
  browser — **executed** (two timed single-cell runs 3354 ms / 2229 ms; four-page batch in
  one launch in the A1 spike). **If false** (slower): still bounded; the driver prints the gate
  output as it lands, and no timeout below 20 s per navigation is hard-coded.
- A4: `fs.existsSync` on the two macOS app paths and `which` on the four Linux names finds
  the browser on JJ's machines — **executed** for the Mac path (the notes-layer test's own
  resolver runs green here). **If false** on some machine: `CHROME_BIN` is the remedy the
  exit-2 message names.
- A5: the pre-image `render-gate --mocks` refuses a host with no `design.render` (exit 2) —
  **verified by reading** the precondition block and AC-20260824-01-7's pin; AC-4/AC-5 are red
  pre-build by construction. **If false**: STOP, re-read specs/20260824/01 D9.
- A6: `mocks-driver.js` reaches render-gate via a sibling path (`path.join(__dirname,
  'render-gate.js')`), never `spec-paths`, per its own `stop open` convention — **verified by
  reading**. **If false**: follow whatever the driver's existing atlas call does.

## Rationale

The 2026-08-24 ruling that the plugin never launches a browser bought two things: no
dependency, and no named tool. The reversal keeps the first — `render-capture.js` imports
only Node built-ins and uses the global `WebSocket` — and gives up the second only as a
fallback: a host that declares its own capture is never touched, and `--spec` mode (which
needs a host component URL) is untouched entirely. The rejected alternative in D1's own row
was "~250 lines, one browser family, unspiked"; the spike today is ~60 lines and executed on
31 real mocks, and the family question is moot for a fallback whose only job is to render a
static mock file. JJ's words: the earlier rule now costs more than it protects.

Fail-closed on "no browser" was a JJ choice between three offered options (plugin Chrome
fail-closed, host-declared only, plugin Chrome warn-and-approve). Binding at
`journey-approved` as well as `approved` is a derived call: the shell canon is written before
the first wireframe, so the defect exists at the first journey, and one shell css edit fixes
it there instead of after 31 screens. The adaptation-only default manifest exists because
mocks-first hosts have no genesis manifest and the full template carries taste rows
(`cta-count` on `--accent`, `contrast`) that would fire on wire-stage tokens.

Fragile spots for build: `--batch` must reuse one page session and reset device metrics per
cell (a fresh target per cell is not a defect but wastes the launch it exists to amortise);
`--which` must resolve identically to a capture run (one resolver); the driver must spawn
render-gate **async-safe** — render-gate runs its own HTTP server in-process, and the driver
calls it via `runChild` (spawnSync) which is fine because the server lives in the *child*;
never move the server into the driver. Test budget: every driver test uses a fixture capture
(D6) — the only Chrome-launching tests are AC-1/AC-2, env-gated, and must finish well inside
the 45 s file budget (two launches ≈ 7 s). The AC-20260824-04-10 fixture repair (a `page`
block on its canned inventory) is a fixture update for a behavior this spec deliberately
changes, retagged, never a weakened assertion. Collision-closure literals leg (run at lock
over "never launches a browser"): `spec/scripts/render-gate.js` header and
`spec/scripts/render-inventory.browser.js` header state it — render-gate is a File Plan row;
render-inventory.browser.js is **waived** (its sentence describes why the file is a bare
expression, which stays true: the plugin's own capture evaluates it the same way a host's
does); `specs/20260824/01-render-gate.md` D1 is a locked historical record, waived;
`spec/scripts/render-compare.js`'s header ("never launches a browser") describes *that*
script, which stays true — **waived**; `spec/templates/grounding-contract.md` § Render gate
says "the host declares how a URL becomes an inventory; the plugin never launches a browser" —
**waived** here: the sentence sits in the host-obligation contract whose hash stamps every
host's config as current, and nothing a host must declare changes under this spec
(`design.render` stays optional with the same sub-keys); the clause is stale as a description
of plugin behavior and is corrected at the next genuine contract change, queued after this
spec, never as a wording-only hash bump (host pipeline rules § Risk Tiers). Executes
leg: `tests/render/render-gate.test.js` AC-20260824-04-10 (fixture repair, in File Plan);
`tests/genesis/` and `tests/mocks/mocks-driver.test.js` drive marks on fixture hosts — those
fixtures declare no capture, so every `journey-approved`/`approved` test there will hit the
`--which` path: the build sets `CHROME_BIN` to a fixture executable in those tests' env (D6)
or declares a fixture capture in their config — repair planned now, not discovered at Phase 4.

Review close (2026-09-06, rv_a8310813af33, CLEAN after two fix rounds). Build deviations, all
one-offs folded here: (1) `tests/mocks/mocks-driver-fixtures.js` gained the shared fixture
capture helpers (`writeFixtureCapture`/`writeCaptureConfig`) and `advanceToJourneyApproved`
calls them — the Executes-leg repair above, landed in the one shared helper; the same two-line
setup was then applied at every pre-existing `journey-approved` site outside the File Plan
(mocks-notes, look-stops, the mocks-driver ledger-gate test, design-doctrine's AC-20260902-10-8
setup) across the two review fix rounds, until the whole suite under
`CHROME_BIN=/nonexistent/chrome` is red only on AC-1/AC-2 — D6's sole sanctioned browser
launches. (2) AC-5's fixture browser is a hand-rolled DevTools-over-WebSocket stub speaking
A1's exact sequence; the shipped render-capture.js speaks the same sequence, so the coupling
held. (3) The render-gate test's canned-capture fixtures gained a `page` block (AC-20260824-04-10
repair, additive). (4) `render-gate --mocks` substitutes a scratch empty tokens.css when
`design/tokens.css` is absent — `journey-approved` precedes `theme-picked` — scoped at review
to the plugin's default adaptation manifest only (a host manifest with no tokens.css keeps
render-rules.js's exit-2 refusal; pinned). (5) The D9 sentence first pushed `/spec:design` and
`/spec:init` two lines over their read-load budgets; compressed in place, design.md holds at
156 — the second consecutive spec (after 20260905/05) to pay this compression, a third earns
a look at the budget itself, not more compression. The mocks.md citation was reordered because
citations-check.js resolves the word before `§` as a basename. (6) ADR-0007 (layer `other`)
was authored by the doctrine worker in the first wave; the `other` wave counted that worker
once. Review dispositions: reconcile leg **waived** by JJ 2026-09-06 — the ADR-0002 backlink is
the spec's stated orchestrator duty and the fixtures helper is the planned repair above;
survivors s0 (untagged real-Chrome launches in pre-existing tests), s1 (AC-2's one-launch clause
pinned by an elapsed-time proxy), s2 (unscoped tokens.css substitution) all fixed. The
grounding-contract § Render gate clause correction is queued (q-slot 5 at close).

## Canonical Delta

In docs/canonical/design.md § Executable design rules, append: "`render-gate --mocks` on a
host with no `design.render.capture` captures through the plugin's own `render-capture.js`
(an installed Chrome over DevTools, Node built-ins only; `CHROME_BIN` overrides), one browser
per run via `--batch`; with no `design.rulesManifest` it runs the plugin's adaptation rules
(`spec/templates/adaptation-rules.json`: no-overflow, desktop-fill, line-length) and says so
on one line; no browser is exit 2 with the remedy, never a pass. `--spec` mode is unchanged:
host-declared capture and URL. `/spec:mocks`'s `journey-approved` and `approved` marks run
this gate over the journey's / the whole set's top-level mocks and refuse on any finding or
capture failure (specs/20260905/06; ADR-0007 amends ADR-0002)."
