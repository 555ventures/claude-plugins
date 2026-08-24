---
date: 2026-08-24
status: implementing
tier: critical           # edits spec/templates/grounding-contract.md (contract hash stamped into every host) and spec/bin/spec-paths (key-set edit) — both named critical triggers in .claude/rules/spec-pipeline.md § Risk Tiers
area: design-stage
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260824/02-design-stage-on-render-gate.md, specs/20260824/04-render-rules.md]
brief: 08
spiked: 2026-08-24
diff_base: 11ab010188f3afb04a5b22d202e52c131bd17aa0
open_markers: 0
---

# Render Gate — mock↔component fidelity judged at the render

## Goal

Ship the deterministic render gate ADR-0002 decides: one script that captures the mock render
and the component render across the host's declared theme × viewport matrix, compares
painted text, in-flow order, and bound-region geometry, and fails closed on divergence.
The plugin ships the in-page measuring script and the comparison; the host declares how a
URL becomes an inventory (`design.render` in its config). Pixels are not a signal and are
never computed. Done means: on a synthetic mock+component pair reproducing the eleven
measured divergences (headline at 56% height, docked action in-flow, static control → link),
the gate prints the named finding and exits 1, while every measured false-positive class
(`text-transform`, aria-label glyphs, out-of-flow chips, data-positioned chart chips, mock box
model, device frame, sr-only text) passes — and `/spec:review` runs it as an advisory
evidence leg on designed specs in hosts that declare a render path.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The host declares the capture: `design.render.capture` is a command the plugin invokes per matrix cell with the flag contract in Contracts (`--url --width --height --theme --state --script --out`); the plugin ships `render-inventory.browser.js` (the in-page script the capture evaluates) and never launches a browser itself (AC-20260824-01-8) | JJ ruling 2026-08-24; keeps the plugin dependency-free and names no tool (core § Host Grounding); rejected a plugin-driven browser-protocol adapter — ~250 lines, one browser family, unspiked |
| D2 | The inventory is the accessibility-tree-shaped walk in Contracts: document order, own **painted** text (text nodes with the element's computed `text-transform` applied — never `textContent`), role, `aria-label` kept as a separate `name` facet, box, and the flags `srOnly`, `fixed`, `outOfFlow`, `dataPositioned` (AC-20260824-01-13) | prax `4h`→`4H` measured: DOM text differs from paint on correct code; the aria-label override collided a glyph with a real button — so the label is a facet, and matching uses the painted glyph |
| D3 | Exclusions are structural, never tolerances: `aria-hidden="true"` and `data-contract="none"` subtrees never enter the inventory; entries under `position:absolute` (`outOfFlow`) are matched by presence and excluded from ORDER; entries that are `fixed`/`sticky` on either side, `srOnly`, or under a `data-positioned` ancestor are excluded from GEOMETRY (AC-20260824-01-2, AC-20260824-01-4, AC-20260824-01-13) | Each exclusion maps to one measured false-positive class (prax #1 #2 #6 D6, salon-os `fullPage` fixed bucket); exclusion by mark keeps the tolerance at the signal floor |
| D4 | Geometry tolerances are script constants: `dx > 1%` of viewport width, `dw > 1%` of viewport width, `dh > 15%` of the taller box — each a finding; vertical position (`dyRel`) is computed into the JSON but never a finding (AC-20260824-01-3) | Brief Scope 1 / prax spike: per-axis zero-false-positive floors were dx 0.77%, dw 0.51%, dh 13.29% with the plot excluded; `dyRel` is poisoned by unbound-region height (prax D9) and disabled; no host override — a knob nobody has data for is a knob nobody should turn |
| D5 | A matched pair whose `fixed` flag differs is a `positioning` finding (`mock fixed, component in-flow` or the reverse) (AC-20260824-01-5) | salon-os D2: the docked primary action shipped in-flow 281 px lower — invisible to geometry once fixed entries are excluded, visible as a class change |
| D6 | Role divergence: a matched pair whose mock role is `button` or `text` and whose component role is `link` is auto-excused with one printed `📌 Auto-picked` line; every other role mismatch is a `role` finding (AC-20260824-01-6) | Both spikes: static mock controls render as real links on every mock that draws navigation; excused by policy with a veto line, never by tolerance or a question |
| D7 | No pixel layer: the gate never screenshots, never diffs images; the capture contract does not ask for a PNG (AC-20260824-01-8) | Measured inverted on one host, flat on the other (ADR-0002); excluded, not advisory |
| D8 | The plugin serves the host's `design/` directory itself over Node's built-in `http` module on an ephemeral `127.0.0.1` port for the mock side, so `../tokens.css` resolves; the mock URL is `http://127.0.0.1:<port>/mocks/<file>` (AC-20260824-01-8, AC-20260824-01-9) | Executed spike (Assumptions A1); removes a host obligation the spikes met with `python3 -m http.server` |
| D9 | The matrix is `design/targets.json` (themes × viewports); a missing file is exit 2 with the remedy naming the `design-targets.json` template — never a silent single-frame default (AC-20260824-01-7) | prax D19: a width cap escape was invisible at 390 px; the gate runs the declared matrix or not at all |
| D10 | Story binding lives in the coverage ledger: `.claude/design-coverage.json` `sources[<mock path>].regions[<surface label>]` gains `stories: {"<state>": "<story id>"}`; the component URL is `design.render.url` with `{story}`, `{theme}`, `{width}`, `{height}`, `{state}` substituted; a state with no story id is an `unbound-state` finding raised before any capture (AC-20260824-01-8, AC-20260824-01-10) | The ledger is already the repo-level record of what a spec bound; a second binding file fails the simplicity bar; story ids are not derivable from labels (`ヴォールト` → `showcase-living-showcase--vault-screen-populated`) |
| D11 | States are declared by the mock: the ordered distinct values of `data-state-btn` attributes in the file; none → the single state `default` (passed to the capture as `-`, which the in-page script treats as "no switch") (AC-20260824-01-8, AC-20260824-01-13) | Codifies the switcher both hosts already draw (salon-os `applyState`); the in-page script clicks the matching control, so no mock-side runtime is added |
| D12 | Exit alphabet: 0 = pass (`__RENDER_GATE_PASS__`), 1 = findings (`__RENDER_GATE_FAIL__`), 2 = precondition (missing `design.render`, `targets.json`, `design_source`, mock file, ledger claim), 3 = capture failure (capture command non-zero, unparseable inventory, readiness timeout) — never a pass; every non-zero path names its remedy (AC-20260824-01-7, AC-20260824-01-10, AC-20260824-01-11, AC-20260824-01-12) | Worker Rules: sentinel lines + documented exit codes; a capture failure must never read as green (authored ≠ activated) |
| D13 | Readiness: when `design.render.ready` is declared and fails, and `design.render.boot` is declared, the gate spawns `boot` detached, polls `ready` every 2 s up to `readyTimeout` (default 120 s), and kills the process it started on exit; a process it did not start is never touched; timeout → exit 3 (AC-20260824-01-12) | Mirrors `smoke.sh`'s boot/ready contract; salon-os Storybook served `/index.json` in ≤30 s, prax ≈60 s |
| D14 | `render-compare.js` is a standalone script over two inventory JSON files (`--mock --comp --width [--json]`), required by `render-gate.js`; the comparison never reads the filesystem beyond its two inputs (AC-20260824-01-1 … AC-20260824-01-6) | The behavioral pin the brief demands runs on synthetic pairs with no browser; separating capture from comparison is what makes that pin honest |
| D15 | Contract edit (the one per spec): `design.render` (`capture`, `url`, optional `ready`, `boot`, `readyTimeout`) is added to `spec/templates/grounding-contract.md`'s `design` block; every other design key is untouched here [no-ac: the contract hash change is observed by `spec-paths contract-hash` and every host's `/spec:doctor`; a prose test would duplicate that oracle] | Host Grounding: the host declares, the plugin executes; `copyCatalogs`/`screenshot` demotion waits for spec 05, which retires their consumers |
| D16 | `/spec:review`'s design legs gain one advisory line: when the host config declares `design.render`, run `node "$(spec-paths render-gate)" --spec <spec> --out <evidence dir>` and hand its report path to the reviewer as evidence; absent `design.render` → one printed skip line naming the key; never a `verdict.js` leg [no-ac: prose dispatch line; the script's behavior is pinned by AC-1…AC-12 and its activation by the entrypoints guard] | The gate needs a consumer to land green (entrypoints); review is the cheapest honest one and re-checks after build wired the components |
| D17 | New-surface checklist: `spec-paths` keys `render-gate`, `render-compare`, `render-inventory` + usage line; `spec/entrypoints.json` rows (`render-gate.js` ← `spec/commands/review.md`; `render-compare.js`, `render-inventory.browser.js` ← `spec/scripts/render-gate.js`); plugin.json bump to next free 7.31.x with changelog [no-ac: enforced fail-closed by tests/spec-paths.test.js, tests/consistency/{entrypoints,plugin-version}.test.js] | The guards fail the suite if any item is skipped |
| D18 | Orchestrator ruling (2026-08-24, build): the `render-compare` summary field stays spelled `geometry=<n>` exactly as Contracts locks it; the AC-3/AC-4/AC-5 exclusion assertions probe the **finding-line** form (`^geometry ` at line start), never the bare word anywhere in stdout (AC-20260824-01-3, AC-20260824-01-4, AC-20260824-01-5) | The summary key set is a machine contract spec 02/04 will parse; a clean run's `geometry=0` is not a finding, so the probe — not the contract — was the imprecise half. Resolved against Contracts' own literal rather than escalated: the spec states the answer in its own text |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/render-inventory.browser.js | CREATE | scripts | In-page measuring script (D2, D3, D11): an IIFE-expression `(function(opts){…})` the capture evaluates with `{theme, state}`; sets `data-theme`, clicks `[data-state-btn]`, walks `[data-screen-label]` (or body), returns the inventory document; zero Node APIs |
| spec/scripts/render-compare.js | CREATE | scripts | Text/order/geometry comparison over two inventories (D3–D7, D14); findings + `📌 Auto-picked` lines; `--json`; exit 0/1/2; header + exit codes per Worker Rules |
| spec/scripts/render-gate.js | CREATE | scripts | Driver (D8–D13): config/targets/spec/ledger preconditions, built-in mock server, readiness/boot, per-cell capture via the host command, `render-compare` per cell, report + sentinel, `--json`; exit 0/1/2/3 |
| spec/bin/spec-paths | MODIFY | scripts | Add keys `render-gate`, `render-compare`, `render-inventory` and the usage-line entries |
| spec/entrypoints.json | MODIFY | scripts | Rows for the three new scripts (D17) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | `design.render` block documented in the `design` line (D15) — the single contract edit of this spec |
| spec/commands/review.md | MODIFY | doctrine | Design legs: the advisory render-gate run + skip line (D16) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | REVIEWER step printed text (the `design specs also get …` line): name the advisory render-gate run when `design.render` is declared (D16) — text only, no state change |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.31.0, next-free rule) + changelog paragraph (last-3 form) |
| tests/render/render-compare.test.js | CREATE | tests | AC-20260824-01-1, AC-20260824-01-2, AC-20260824-01-3, AC-20260824-01-4, AC-20260824-01-5, AC-20260824-01-6 |
| tests/render/render-gate.test.js | CREATE | tests | AC-20260824-01-7, AC-20260824-01-8, AC-20260824-01-9, AC-20260824-01-10, AC-20260824-01-11, AC-20260824-01-12 |
| tests/render/render-inventory.test.js | CREATE | tests | AC-20260824-01-13 |
| tests/spec-paths.test.js | MODIFY | tests | Extend the key-set pin with the three new keys (the 20260814/01 additive-collision class, closed in-plan) |

## Contracts

Host config — `.claude/spec.config.json` `design` block gains `render` (documented in
`grounding-contract.md`; no plugin file names a tool):

```jsonc
"design": {
  "tool": "storybook", "command": "pnpm storybook", "storyFormat": "CSF3 stories",
  "doctrine": "docs/design/doctrine.md",
  "render": {
    "capture": "node scripts/render-capture.mjs",      // REQUIRED: the host's capture command (contract below)
    "url": "http://localhost:6006/iframe.html?id={story}&viewMode=story&globals=theme:{theme}",
                                                        // REQUIRED: component render URL; placeholders {story} {theme} {width} {height} {state}
    "ready": "curl -sf http://localhost:6006/index.json",   // optional: exits 0 once the render server serves
    "boot": "pnpm storybook --ci --quiet",              // optional: started (detached) when `ready` fails; killed on exit
    "readyTimeout": 120                                  // optional, seconds, default 120
  }
}
```

Capture command contract (host-owned script; the spikes' `render-gate.mjs` satisfies it with
one flag rename). Invoked once per (side × state × theme × viewport) as:

```
<capture> --url <u> --width <w> --height <h> --theme <light|dark> --state <name|-> \
          --script <abs path of render-inventory.browser.js> --out <abs json path>
```

It MUST: open `--url` at viewport `w×h`, `deviceScaleFactor 1`, emulating
`prefers-color-scheme: <theme>`; wait for `load`, first painted text, and `document.fonts.ready`;
evaluate the file at `--script` (a JS expression evaluating to a function) with the argument
`{"theme": "<theme>", "state": "<state>"}`; write the function's return value to `--out` as
JSON; exit 0. Any other exit code, or a missing/unparseable `--out`, is exit 3 for the gate. It
MUST NOT screenshot on the gate's behalf (D7). Example host implementation (host file, not
plugin):

```js
// scripts/render-capture.mjs — host-owned; the plugin never reads this file
import { chromium } from '<the host's browser automation package>'
const a = Object.fromEntries(process.argv.slice(2).map((v, i, xs) => v.startsWith('--') ? [v.slice(2), xs[i + 1]] : []).filter(Boolean))
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: +a.width, height: +a.height }, deviceScaleFactor: 1, colorScheme: a.theme })
await p.goto(a.url, { waitUntil: 'load' })
await p.waitForFunction(() => (document.body?.innerText || '').trim().length > 0)
await p.evaluate(() => document.fonts.ready)
const fn = (await import('node:fs')).readFileSync(a.script, 'utf8')
const inv = await p.evaluate(`(${fn})(${JSON.stringify({ theme: a.theme, state: a.state })})`)
;(await import('node:fs')).writeFileSync(a.out, JSON.stringify(inv))
await b.close()
```

Inventory document (`schemaVersion: 1`) — the in-page script's return value:

```jsonc
{
  "schemaVersion": 1,
  "theme": "light",            // documentElement data-theme after the script set it
  "state": "populated",        // root data-state after the switch, or null
  "root": "[data-screen-label]",   // selector used; "body" when no labeled root exists (component side)
  "entries": [
    { "i": 0, "role": "heading", "text": "連絡先ヴォールト", "name": null, "tag": "h1",
      "box": { "x": 60, "y": 13.5, "w": 314, "h": 33 },
      "srOnly": false, "fixed": true, "outOfFlow": false, "dataPositioned": false,
      "color": "rgb(17, 17, 17)", "background": "rgba(0, 0, 0, 0)", "fontSize": "20px", "lineHeight": "26px" }
  ]
}
```

Entry rules (D2, D3, D11): an element becomes an entry when it has own painted text (direct
text nodes, whitespace-collapsed, computed `text-transform` applied: `uppercase` /
`lowercase`; `capitalize` is applied per word) or an interactive role (`button`, `link`,
`textbox`, `combobox`, `checkbox`, `radio`); an interactive element with no own text takes its
`innerText`, then `title`. `name` = `aria-label` or null. Roles: explicit `role=` attribute,
else tag-derived (`h1–h6` → `heading`, `a` → `link`, `button` → `button`, inputs by type, else
`text`). Subtrees pruned entirely: `aria-hidden="true"`, `data-contract="none"`, computed
`display:none` / `visibility:hidden`. Flags inherit downward: `fixed` (position fixed/sticky
on self or ancestor), `outOfFlow` (position absolute), `dataPositioned` (`data-positioned`
attribute on self or ancestor). `srOnly` = box `w ≤ 2 || h ≤ 2`. Boxes are page coordinates
(`getBoundingClientRect` + scroll), 2 dp. `state`: when `opts.state` is not `-`, the script
clicks `[data-state-btn="<state>"]` before walking; `opts.theme` is written to
`documentElement`'s `data-theme` before walking.

`render-compare.js --mock <json> --comp <json> --width <px> [--json]`:

- **Match**: LCS over painted `text` of the ORDER sequence (entries with `outOfFlow:false`
  and `srOnly:false`); `outOfFlow` and `srOnly` entries are matched by text multiset
  presence only. `name` never participates in matching.
- **Findings** (one line each, class first): `text-missing "<text>"` (mock string absent
  from the component) · `text-extra "<text>"` · `order "<text>"` (present on both sides but
  only reachable out of order; count = present-both − LCS pairs) · `role "<text>" (mock
  <role>, component <role>)` · `positioning "<text>" (mock fixed, component in-flow)` /
  `(mock in-flow, component fixed)` · `geometry <axis> <pct>% "<text>" (<mock px> → <comp
  px>)` for each axis over tolerance on GEOMETRY pairs (matched, neither side `fixed`, not
  `srOnly`, neither side `dataPositioned`): `dx = |mx − cx| / width`, `dw = |mw − cw| /
  width`, `dh = |mh − ch| / max(mh, ch)`; thresholds `dx > 0.01`, `dw > 0.01`, `dh > 0.15`.
  `dyRel` (relative to the first matched pair) is emitted in `--json` only.
- **Auto-excuse** (D6): mock role ∈ {`button`,`text`} → component `link` prints
  `📌 Auto-picked static→link excused: "<text>" — a static mock control renders as a real
  link (veto: draw it as a link in the mock, or mark it data-contract="none")` and is not a
  finding.
- Output: findings, then `matched=<n> missing=<n> extra=<n> order=<n> role=<n>
  positioning=<n> geometry=<n> excused=<n>`; exit 0 when every count except `matched` and
  `excused` is 0, else 1; 2 = usage/unreadable input (stderr names the file).

`render-gate.js --spec <path> [--root <dir>] [--out <dir>] [--json] [--no-boot]`:

- Preconditions (exit 2, remedy named): `design.render.capture` and `design.render.url`
  present in `<root>/.claude/spec.config.json`; `<root>/design/targets.json` parses with
  `themes[]` and `viewports[]`; the spec's `design_source` resolves to one mock file or a
  directory of mock files under `design/`; each mock has a `data-screen-label` root; each
  mock's label has a ledger claim with `stories`.
- Cells: for each mock × state (D11) × theme × viewport. For each cell: start the built-in
  server once (D8), capture the mock (`--url http://127.0.0.1:<port>/mocks/<file>`), capture
  the component (`--url` = pattern substituted), run `render-compare`, write
  `<out>/<label>.<state>.<theme>.<viewport>.{mock,comp,compare}.json`. `--out` defaults to
  the session scratchpad when `CLAUDE_SCRATCHPAD` is set, else `<root>/.claude/spec-runs/render/<spec-stem>/`.
- A state with no story id → `unbound-state "<label>" "<state>"` finding, no capture for
  that surface; a capture exiting non-zero → exit 3 with the exact command and exit code on
  stderr; a `ready` probe that never passes within `readyTimeout` → exit 3.
- Report: one line per cell `✅|❌ <label> <state> <theme> <viewport>: <counts>` then every
  finding, then `__RENDER_GATE_PASS__` / `__RENDER_GATE_FAIL__`. `--json` prints
  `{cells:[{label,state,theme,viewport,findings:[…],counts:{…}}], excused:[…], exit}`.
- Exit codes: 0 pass · 1 findings · 2 precondition · 3 capture/readiness failure.

Coverage ledger extension (D10), additive:

```jsonc
{ "sources": { "design/mocks/vault.html": { "regions": {
    "ヴォールト": { "spec": "specs/20260821/04-contact-vault.md", "at": "2026-08-24",
                  "stories": { "default": "showcase-living-showcase--vault-screen-populated" } } } } } }
```

## Behavior

- The gate is stack-agnostic by construction: everything stack-specific (browser, catalog,
  URL shape) lives in the host's `capture` and `url`; the plugin's two scripts read JSON.
- The excused-role veto line prints once per distinct text per run, never per cell.
- When the host declares neither `ready` nor `boot`, the gate assumes the render server is up
  and lets the first capture's failure surface as exit 3.
- `render-compare` is deterministic and order-preserving: identical inputs produce
  byte-identical output (the spike measured a 0.00% inventory noise floor on both hosts; the
  comparison must not add any).

## Acceptance Criteria

- **AC-20260824-01-1**: WHEN `render-compare.js` is given two inventories with identical
  ORDER-sequence texts THE SYSTEM SHALL print `missing=0 extra=0 order=0` and exit 0; WHEN the
  component inventory lacks one mock text and carries one text the mock lacks (mock
  `["A","B","C"]`, comp `["A","C","D"]`) THE SYSTEM SHALL print `text-missing "B"` and
  `text-extra "D"` and exit 1 → `render-compare.test.js`
- **AC-20260824-01-2**: WHEN two in-flow entries swap order (mock `["A","B","C"]`, comp
  `["A","C","B"]`) THE SYSTEM SHALL print one `order` finding and exit 1; WHEN the swapped
  entries carry `outOfFlow:true` on both sides (the prax `STOP,IN,OUT` → `IN,OUT,STOP` chips)
  THE SYSTEM SHALL print `order=0` and exit 0 → `render-compare.test.js`
- **AC-20260824-01-3**: WHEN a GEOMETRY pair differs by the literal deltas below at
  `--width 390` THE SYSTEM SHALL decide exactly as listed: `h 34 → 19.56` (dh 42.5%) →
  `geometry dh 42.5% "+4.8%" (34px → 19.56px)` exit 1 · `h 22.09 → 19.15` (dh 13.3%) → no
  finding · `w 292 → 257.5` (dw 8.85%) → finding · `w 28 → 26` (dw 0.51%) → no finding ·
  `x 60 → 77` (dx 4.36%) → finding · `x 0 → 3` (dx 0.77%) → no finding; and `dyRel` never
  produces a finding at any value → `render-compare.test.js`
- **AC-20260824-01-4**: WHEN a matched pair has `dataPositioned:true` on either side and
  `x 123 → 169.9` (dx 12.01%) THE SYSTEM SHALL emit no geometry finding; WHEN the same pair has
  `dataPositioned:false` on both sides THE SYSTEM SHALL emit `geometry dx 12.01% …` and exit 1
  → `render-compare.test.js`
- **AC-20260824-01-5**: WHEN a matched pair is `fixed:true` on the mock side and `fixed:false`
  on the component side THE SYSTEM SHALL print `positioning "本日の連絡を記録する" (mock fixed,
  component in-flow)`, exit 1, and emit no geometry finding for that pair → `render-compare.test.js`
- **AC-20260824-01-6**: WHEN a matched pair is mock role `button` and component role `link`
  THE SYSTEM SHALL print one line starting `📌 Auto-picked static→link excused: "ホーム"`,
  count it under `excused=1`, and exit 0; WHEN a matched pair is mock role `text` and component
  role `heading` THE SYSTEM SHALL print `role "Title" (mock text, component heading)` and exit 1
  → `render-compare.test.js`
- **AC-20260824-01-7**: WHEN `render-gate.js --spec` runs against a root whose config has no
  `design.render` THE SYSTEM SHALL exit 2 and print, on stderr, `.claude/spec.config.json
  design.render.capture` and `design.render.url`; WHEN `design.render` is present but
  `design/targets.json` is absent THE SYSTEM SHALL exit 2 and name `design/targets.json` and
  `design-targets.json` (the template) → `render-gate.test.js`
- **AC-20260824-01-8**: WHEN a synthetic root declares `capture` = a fake script that appends
  its argv to a log and copies a canned inventory to `--out`, `targets.json` with 2 themes × 3
  viewports, one mock with two `data-state-btn` values, and a ledger claim binding both states
  THE SYSTEM SHALL invoke the capture exactly 24 times (2 sides × 2 states × 2 themes × 3
  viewports), every invocation carrying `--url --width --height --theme --state --script --out`,
  with `--script` resolving to the plugin's `render-inventory.browser.js`, mock `--url` matching
  `^http://127\.0\.0\.1:\d+/mocks/<file>$`, component `--url` equal to the pattern with
  `{story}`/`{theme}`/`{width}`/`{height}`/`{state}` substituted, and no PNG/screenshot flag →
  `render-gate.test.js`
- **AC-20260824-01-9**: WHEN the fake capture fetches `--url` and `<origin>/tokens.css` over
  HTTP and records both statuses in the inventory it writes THE SYSTEM SHALL have served both
  with status 200 (the mock's `../tokens.css` resolves through the built-in server) →
  `render-gate.test.js`
- **AC-20260824-01-10**: WHEN a mock declares state `empty` and the ledger claim's `stories`
  lacks `empty` THE SYSTEM SHALL print `unbound-state "<label>" "empty"`, invoke the capture
  zero times for that surface, print `__RENDER_GATE_FAIL__`, and exit 1 → `render-gate.test.js`
- **AC-20260824-01-11**: WHEN the capture command exits 7 for any cell THE SYSTEM SHALL exit 3,
  print neither sentinel, and print on stderr the invoked command line and `exit 7` →
  `render-gate.test.js`
- **AC-20260824-01-12**: WHEN `ready` fails until a file exists and `boot` is a script that
  creates that file after 1 s and then sleeps THE SYSTEM SHALL proceed to capture, and after
  exit the boot process (pid written by the fake boot) SHALL no longer be alive; WHEN `ready`
  never passes and `readyTimeout` is 3 THE SYSTEM SHALL exit 3 within 10 s naming
  `design.render.ready` → `render-gate.test.js`
- **AC-20260824-01-13**: WHEN `render-inventory.browser.js` is evaluated against the stub DOM
  in the test (a `document` whose elements expose `tagName`, `getAttribute`, `hasAttribute`,
  `childNodes`, `children`, `innerText`, `getBoundingClientRect`, `click`, and a global
  `getComputedStyle`) THE SYSTEM SHALL: return `4H CANDLES` for a text node `4h candles` under
  `textTransform: "uppercase"`; omit every entry under `aria-hidden="true"` and under
  `data-contract="none"`; flag `outOfFlow:true` under `position: "absolute"` and `fixed:true`
  under `position: "fixed"`; flag `dataPositioned:true` under an ancestor carrying
  `data-positioned`; with `{state:"empty"}` call `click()` on the element whose
  `data-state-btn` is `empty` and with `{state:"-"}` click nothing; set `data-theme` on the
  document element to `opts.theme` → `render-inventory.test.js`

## Assumptions (escalation triggers)

- A1 (executed micro-spike, 2026-08-24, Playwright-driven Chromium against a scratch
  `design/` tree served by a 14-line Node `http` server on `127.0.0.1:8899`): the in-page
  walker prototype returned `textContent: "4h candles"` vs `innerText: "4H CANDLES"` for a
  `text-transform: uppercase` element and the walker's own text-transform application produced
  `"4H CANDLES"`; an `<svg aria-hidden="true">` text and a `data-contract="none"` block
  (`Device clock 09:52`) produced no entries; three `position:absolute` chips came back
  `outOfFlow:true, dataPositioned:true` under a `data-positioned` container; a
  `position:fixed` docked button came back `fixed:true`; a 1×1 sr-only span came back
  `srOnly:true`; a link `<a aria-label="Back to verdict">‹</a>` came back `text:"‹",
  name:"Back to verdict"`; calling the walker with `{theme:"dark", state:"empty"}` set
  `data-theme="dark"` (body background `rgb(16, 16, 16)` from the tokens dark block), clicked
  the `empty` state control (root `data-state="empty"`, `Row one/Row two` gone, `Nothing yet`
  present), and computed colors changed to the dark token values; `../tokens.css` resolved
  (body background `rgb(255, 255, 255)` = the light token). One console error: `/favicon.ico`
  404 — harmless, the server may answer 204 for that path. — **if false:** STOP, ask the user
  (the whole gate rests on it).
- A2: The stub-DOM test (AC-13) exercises the walker's branching, not browser rendering; the
  rendering claims are A1's executed evidence and the two 2026-08-24 spike reports — **if
  false** (a browser behaves differently from the stub on a documented branch): amend the
  walker and A1 in the same build round, never the test.
- A3: The `tests/consistency/observed-grammar-purity.test.js` guard (if it scans script prose)
  accepts the new scripts' headers written per Worker Rules — **if false:** rewrite the header
  wording, never weaken the guard.
- A4: `design_source` on designed specs in both hosts is a single mock path under
  `design/mocks/` (measured: every designed spec, field eval § What works) — **if false** (a
  bundle dir or a `claude.ai/design` URL): a directory is walked for `*.html`; a URL is exit 2
  naming the mock-first rule.
- A5: The coverage ledger's existing region-keyed claims (`<surface>#<region>`) coexist with
  label-keyed claims — the atlas derives `label = ref.split('#')[0]` (read 2026-08-24) — **if
  false:** key the new claims `<label>#screen` and update the atlas test in the same build.
- A6: No host currently declares `design.render`; the review leg's skip line is the only
  behavior hosts see until they declare it — **if false:** none needed.

## Rationale

The brief's Scope 1 and 2 are one landing unit: the comparison and the capture contract are
useless apart, and the review leg is the cheapest honest consumer that lets the gate land
green before `/spec:design` is rebuilt on it (spec 02). Everything the spikes measured became
either an exclusion by mark (a class the mock author or the walker can name) or a tolerance
constant; nothing became a knob, because two hosts gave no data for tuning one. The three
measured "false positive on correct code" classes — painted casing, aria-label glyph
collision, absolutely-positioned chip order — are closed in the walker (painted text,
`name` facet, `outOfFlow`) rather than in policy, because they are properties of every DOM.
The docked-action class is caught by the `positioning` finding rather than by geometry,
because the only geometry that could see it (`dyRel`) is exactly the axis the unbound-region
class poisons; disabling `dyRel` and adding a class-change finding catches D2 without the
prax D9 noise. Pixels are excluded per ADR-0002; the capture contract deliberately has no
screenshot output so no host can wire one back in as a "quick advisory".

Rejected: a plugin-driven browser (JJ 2026-08-24 — dependency and tool-naming cost, and a
second high-unknown spike); a shared fixture file feeding mock and story (JJ 2026-08-24 — no
host mock uses placeholders; the mock's illustrated values are the source and the comparison
itself is the drift detector); a per-host tolerance block (no data); deriving story ids from
labels (non-ASCII labels collide in catalog ids). The critical tier comes from the contract
hash: every host's `/spec:doctor` will report stale grounding after this lands — expected,
and the remedy is the one-line `design.render` declaration the gate prints.

Collision-closure at lock (2026-08-24): the only `likely` hit is
`tests/consistency/entrypoints.test.js` against the entrypoints/spec-paths/review.md rows — the
exhaustive live-file pin class the build's whole-suite check adjudicates (Gotcha: no waive
owed); `mentions` hits are visibility only.

Watch during execution: the fake-capture tests must exercise the real `render-gate.js` entry
(never a synthetic stand-in — `synthetic-repro-presented-as-real` is a live class); the boot
lifecycle test must assert on the child's pid liveness after exit, not on a log line.

## Canonical Delta

`docs/canonical/design.md` gains a section **Render gate (2026-08-24, specs/20260824/01)**:
fidelity between a mock and its component is judged at the render by
`render-gate.js` (`spec-paths render-gate`): the host's `design.render.capture` command turns
a URL into an inventory using the plugin's `render-inventory.browser.js` (painted text, roles,
boxes, `srOnly`/`fixed`/`outOfFlow`/`dataPositioned` flags); `render-compare.js` matches
painted text by LCS over in-flow entries, reports `text-missing`/`text-extra`/`order`/`role`/
`positioning`/`geometry` findings with tolerances `{dx 1%, dw 1%, dh 15%}` and `dyRel`
disabled, auto-excuses static-control→link with a `📌` line, and never computes pixels.
Story ids per mock state live in `.claude/design-coverage.json` claims (`stories`). The matrix
is `design/targets.json`, fail-closed when absent. `/spec:review` runs the gate as an advisory
evidence leg on designed specs when `design.render` is declared. The `Exit fidelity review`
paragraph is marked **superseded by the render gate** (its driver state is retired by spec 02).
