---
date: 2026-09-01
status: implementing
tier: standard
area: design
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 20
open_markers: 0
diff_base: 8486d309a82b754a67d4931a243371e6f4c45919
---

# Shell-composed mocks — one canonical app shell, content-only sketches, planning-seat authorship

## Goal

Every visual host gets one canonical shell mock per declared shell (`design/shell/app.html` at
minimum, with its stylesheet beside it), authored in the planning seat when the navigation
shell is decided. Page mocks declare their shell, author only the content slot, and carry the
shell chrome as a marked region that `design-atlas.js shell sync` rewrites from canon —
byte-identical everywhere by mechanism, never by an author copying. `design-atlas.js check`
turns shell drift into a harness failure at the same tiers the existing checks bind (warn at
`sketch`), genesis refuses `tokens-landed` without the shell canon, and the `AppShell` code
primitive is authored from the shell mock. Sketch-tier authorship moves to the planning seat
for both `/spec:atlas` and `/spec:sketch` (session exemplars, one sequential Fable overflow,
Sonnet mechanical only), grounded in the picked position brief, with the seat and position
named in the report — the rule living in one restored paragraph of design.md § Design Atlas
that both commands cite (ADR-0003, reversing specs/20260810/01 D8). Done means: a host with
page mocks can adopt them in one confirmed pass, a shell edit reaches every non-built mock in
one sync run, and a hand-edited sidebar in any ratified mock fails `check`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Shell canon = `design/shell/<name>.html` (root `data-shell-canon="<name>"`, slots `data-slot="nav"`/`"header"`/… + exactly one empty `data-slot="content"`, every non-content slot `data-contract="none"`) plus a linked `design/shell/<name>.css` holding the shell's styles; `check` validates canon files under their own rule set and never asks them for a `data-screen-label` (AC-20260901-04-7) | The shell is chrome, not a surface: it has no label, no status, no place in the atlas; its stylesheet is a linked file like `tokens.css` so a style tweak reaches every mock without a sync run (JJ pick 2026-09-01); non-content slots are excluded from the render gate's comparison by the existing `data-contract="none"` mark because stories render the content region |
| D2 | A page mock declares `data-shell="<name>"` or `data-shell="none"` on its `[data-screen-label]` root; a declaring mock's root inner is exactly one `data-shell-region="<name>"` element (the canon root retagged) whose only author-owned bytes are the content slot's inner HTML and, on the root, an optional `data-active="<nav key>"`; the mock links `../shell/<name>.css` after `tokens.css` (AC-20260901-04-5, AC-20260901-04-9) | Sync-in-place over compose-at-build (brief's recommendation): mocks stay full self-contained pages, so render-gate, render-rules, and the atlas consume them unchanged and `design_source` resolution keeps ADR-0002's "no extraction" rule |
| D3 | Region identity = byte equality of the mock root's inner HTML against the **expected region**: canon root inner with the mock's content-slot inner spliced in and the active-nav marker derived (`aria-current="page"` on the canon element whose `data-nav` equals the mock's `data-active`, defaulting to the screen label; the attribute stripped everywhere else; no match → no marker) (AC-20260901-04-3, AC-20260901-04-8) | Byte equality is the only compare that needs no HTML parser and no tolerance table; the one per-page shell fact (which nav item is active) is derived by the sync, so it survives every sync and never counts as drift; executed spike in Assumptions |
| D4 | `check` gains a shell family for mocks, bound only when a `design/shell/` dir resolves by the same walk-up `targets.json` uses: (a) no `data-shell`; (b) a declared name with no `design/shell/<name>.html`; (c) region ≠ expected, the finding naming the first differing slot; (d) `<nav`/`<header`/`role="navigation"|"banner"` inside the content slot; (e) declared shell, missing `shell/<name>.css` link. Each is a violation at `ratified`/`approved`/`--matrix` and a `⚠️` warn line (exit unaffected) at `sketch`; `data-shell="none"` mocks get no shell findings; no shell dir → the family is off and output is unchanged (AC-20260901-04-1, AC-20260901-04-2, AC-20260901-04-3, AC-20260901-04-4, AC-20260901-04-5, AC-20260901-04-6) | Same tiering as the hygiene family (specs/20260824/03 D2) so a sweep can land before the shell is final; the shell-dir gate keeps every legacy host and fixture green exactly as absent `targets.json` does; in-content sub-navigation uses `role="tablist"` or a plain container — `<nav>`/`<header>` are shell vocabulary |
| D5 | `design-atlas.js shell sync [--root <r>] [<mock|dir>…]`: rewrites each declaring mock's root inner to the expected region and inserts the css link when missing; prints one line per mock (`synced` / `unchanged` / `skipped (no shell)` / `skipped (undeclared)` / `skipped (built)`); the default walk skips `built` mocks (ledger claim whose spec is `done` — the same derivation `build` uses, extracted into `lib/shell-region.js`) while an explicit mock path syncs regardless; a declaring mock with no content slot is refused with exit 1 naming `shell adopt`, other mocks still synced; idempotent (AC-20260901-04-9, AC-20260901-04-10, AC-20260901-04-11) | Mock authority inverts at `built` (design.md § Design Canon) so a stale built mock is allowed and re-synced only at the next design touch — the explicit path IS that touch; the header's "never edits its inputs" is narrowed to `check`/`build`/`gallery` — `shell` is the one writer and writes only the region |
| D6 | `design-atlas.js shell adopt [--root <r>] [--shell <name>] [--apply]`: for every mock with no `data-shell`, detects chrome = direct children of the root that are `<nav>`/`<header>`/`<aside>` or carry `role="navigation"|"banner"`; without `--apply` prints one table row per mock (`path | chrome: <tags or none> | proposal: <name> or "undeclared — decide" | active: <label> | drift: yes/no`) and writes nothing; with `--apply` strips the chrome, wraps the rest as the content slot inside the expected region, stamps `data-shell="<name>"`, inserts the css link; zero-chrome mocks are never touched and never stamped `none`; `<name>` = the sole canon when one exists, else `--shell` is required (exit 2 naming the canon names) (AC-20260901-04-12, AC-20260901-04-13) | Session-confirmed in one table (brief Scope 7): the plan is printed, the user confirms, `--apply` writes; a page with no detected chrome stays undeclared with its warn line rather than silently becoming shell-less forever — leaving it is the cheaper-to-reverse default |
| D7 | Genesis `--mark tokens-landed` (visual archetypes) additionally requires `design/shell/app.html` to exist and `design-atlas.js check design/shell` to exit 0, refused naming the file / carrying the check output otherwise; the doctrine paragraph names the shell canon as authored in-session before the mark, alongside the signature-screen promotion; the existing `check --matrix design/mocks` now binds D4 on the approved signature screens, so they must declare and sync the shell (AC-20260901-04-14) | The shell decision stays a genesis DECIDED row; its mock-side artifact lands where `tokens.css` does, checked by the same driver so the mark cannot pass without it |
| D8 | `--mark rules-locked` doctrine: `AppShell` is authored **from** `design/shell/app.html` (slots ↔ nav slots + content region), and `/spec:design`'s worker envelope gains `shell: <canon path or null>` so surfaces are implemented into the primitive, never around it [no-ac: doctrine prose + an envelope key with no script reader — `base-primitive-containment` already forbids a second shell in code] | One decision, two artifacts (mock shell, code shell) — brief Scope 4 |
| D9 | design.md § Design Atlas regains the shared authorship paragraph, phrased for both commands: the session authors the journey-central set in-session (≤5, ≥1 per declared journey); one sequential `Agent {model: "fable"}` dispatch (Opus fallback, core § Model Placement) authors the rest with those paths as exemplars, never one agent per surface; Sonnet for mechanical edits only; a repo with no shell canon authors it in-session before any page mock; `shell sync` runs on the pass's mocks before `check`. `atlas.md` and `sketch.md` replace their local rules and the phantom citation with a pointer; core.md § Model Placement lists "sketch-tier authorship (atlas sweep, sketch scoped sweep)" among the planning-seat duties [no-ac: doctrine prose; the seat is a dispatch choice no script observes] | ADR-0003 Option B, reversing specs/20260810/01 D8; the shared home D8 mandated is restored where D8 put it |
| D10 | Grounding set for every sketch author (both commands), in order: the picked position brief → research brief → owning brief → doctrine → `tokens.css` → the shell canon. The position brief = the `## Position: <kebab>` section of `design/explore/positions.md` whose kebab is the `design-pick.json` winner's dir basename minus `r0-`; an external winner → `position: external — <name>`; no genesis state → `position: none`. Both reports add one `bullets` line: `🎨 position: <kebab|none|external — name> · authored {N} in-session · {M} fable · {K} sonnet-mechanical` [no-ac: report prose assembled by the session; `report-render.js` is unchanged] | Taste reaches the author as words, not only as surviving CSS variables (brief Scope 6); the seat becomes visible in the terminal rather than discovered by asking |
| D11 | `design.md` stays ≤160 lines and every command's read-load budget holds: the new Canon/Atlas lines are paid for by condensing § Design Render Gate and the harness paragraph without dropping a rule (AC-20260901-04-15) | The cap is the enforcement (specs/20260824/05); a doctrine that grows past it is the retired-history creep the cap exists to forbid |
| D12 | Version bump to the next free 7.51.x with the changelog paragraph; no new `spec-paths` key (sync/adopt are `design-atlas.js` subcommands; the region logic lives in `spec/scripts/lib/shell-region.js`, outside the entrypoint scan) [no-ac: plugin-version guard] | One script keeps the exhaustive entrypoints/spec-paths pins untouched (Gotchas: adding a member costs a review waive) |
| D13 | No atlas status/design-coverage anomaly, no `/spec:status` trigger, no atlas card for the shell canon [no-ac: deliberate absence — 2026-08-31 ruling and brief Out of scope] | This is a mock harness check, not a coverage trigger |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/shell-region.js | CREATE | scripts | Region scanner (depth-counting tag walk, void elements, comments), `expectedRegion()` (D3 splice + active-nav derivation), `diagnoseMock()` (D4 findings a–e), `checkCanon()` (D1 rules), `resolveShellDir()` walk-up, `builtLabels()` extracted from `build`'s ledger derivation |
| spec/scripts/design-atlas.js | MODIFY | scripts | `check`: shell family for mocks (tiered, D4) + canon-file rule set (D1); `shell sync` (D5) and `shell adopt` (D6) subcommands; header usage/exit codes updated (exit 1 also = sync refusal; `shell` is the only writer) |
| spec/scripts/genesis-driver.js | MODIFY | scripts | `handleTokensLanded`: `design/shell/app.html` exists + `check design/shell` exit 0 (D7); header comment block updated |
| spec/doctrine/design.md | MODIFY | doctrine | § Design Canon: `shell/` dir entry, `data-shell`/`data-slot`/`data-active`/`data-shell-region` marks, sync + built inversion (D1–D5); § Design Authoring Contracts: AppShell authored from the shell mock (D8); § Design Atlas: restored authorship paragraph + grounding set + report line (D9, D10); condensed to stay ≤160 lines (D11) |
| spec/doctrine/core.md | MODIFY | doctrine | § Model Placement: planning seat holds "sketch-tier authorship (atlas sweep, sketch scoped sweep)" (D9) |
| spec/doctrine/genesis.md | MODIFY | doctrine | `--mark tokens-landed`: author `design/shell/app.html` + css in-session before the mark, driver checks list gains the two shell checks (D7); `--mark rules-locked`: AppShell authored from the shell mock (D8) |
| spec/commands/atlas.md | MODIFY | doctrine | Model note + § The sweep: pointer to design.md § Design Atlas's authorship paragraph, shell-first + `shell sync` before `check`, position grounding, the `🎨` report bullet (D9, D10); phantom "one warm author" citation removed |
| spec/commands/sketch.md | MODIFY | doctrine | Model note + step 3: same pointer; exit step runs `shell sync` on the brief's sketch mocks before `check --matrix`; report bullet (D9, D10) |
| spec/commands/design.md | MODIFY | doctrine | Worker envelope gains `shell`; grounding sentence names the shell canon so surfaces are built into `AppShell` (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.51.0 — next free at build time per Gotchas) + changelog paragraph (D12) |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260901-04-1, AC-20260901-04-2, AC-20260901-04-3, AC-20260901-04-4, AC-20260901-04-5, AC-20260901-04-6, AC-20260901-04-7, AC-20260901-04-8 |
| tests/design-shell.test.js | CREATE | tests | AC-20260901-04-9, AC-20260901-04-10, AC-20260901-04-11, AC-20260901-04-12, AC-20260901-04-13, AC-20260901-04-16 |
| tests/genesis/design-state.test.js | MODIFY | tests | AC-20260901-04-14 (the tokens-landed fixture gains a shell canon + declaring, synced approved mock; existing AC-20260827-03-3 asserts stay green) |

Orchestrator duty (outside the table): after the doctrine rows land, run
`node --test tests/consistency/*.test.js` — the design.md line cap, the read-load budget, and
`citations-check` are the oracles for D11 and the pointer edits.

## Contracts

**Shell canon file** (`design/shell/app.html`, D1):

```html
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="app.css">
<style>* { box-sizing: border-box; }</style></head><body>
<div data-shell-canon="app" class="shell">
  <nav data-slot="nav" data-contract="none" aria-label="Main">
    <a data-nav="inbox" href="#">Inbox</a>
    <a data-nav="settings" href="#">Settings</a>
  </nav>
  <header data-slot="header" data-contract="none">…</header>
  <main data-slot="content"></main>          <!-- whitespace-only inner, always -->
</div></body></html>
```

Canon rules `check` applies to any file whose first labeled root is `data-shell-canon` (never
asked for `data-screen-label`; hygiene/matrix families bind as if `approved`):

| Rule | Violation text (`<f>: ` prefix as today) |
|------|-------------------------------------------|
| `data-shell-canon` value = file basename | `data-shell-canon="shell" does not match the file name app — rename one` |
| links `tokens.css` and `<name>.css` | `does not link app.css — the shell's stylesheet lives beside it` |
| exactly one `data-slot="content"`, whitespace-only inner | `content slot must be empty — the shell carries no feature content` / `needs exactly one data-slot="content"` |
| every other `data-slot` carries `data-contract="none"` | `slot "nav" must carry data-contract="none" — shell chrome never enters the render gate's comparison` |
| off-token colors in the html **and** the css | existing text, path = the offending file |
| font-size without line-height (hygiene b) over the css | existing text, path = the css file |

**Page mock** (D2):

```html
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../shell/app.css">
<div data-screen-label="inbox" data-status="sketch" data-shell="app" data-active="inbox">
  <div data-shell-region="app" class="shell">      <!-- ← everything from here… -->
    <nav data-slot="nav" data-contract="none" aria-label="Main">
      <a data-nav="inbox" href="#" aria-current="page">Inbox</a>
      <a data-nav="settings" href="#">Settings</a>
    </nav>
    <header data-slot="header" data-contract="none">…</header>
    <main data-slot="content">                   <!-- …to here is sync-owned; -->
      <h1>Inbox</h1> …                             <!-- the slot's inner is author-owned -->
    </main>
  </div>
</div>
```

**Expected region derivation** (D3, `lib/shell-region.js`):

```
expectedRegion(canonHtml, name, contentInner, active):
  root      = element with data-shell-canon="<name>" (depth-counting walk; void elements
              area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr and `/>` never
              open a level; <!-- --> skipped)
  openTag   = root's opening tag with data-shell-canon="<name>" → data-shell-region="<name>"
              (every other attribute byte-preserved)
  inner     = root inner with the content slot's inner replaced by contentInner
  inner     = for every opening tag carrying data-nav="<k>": strip ` aria-current="…"`,
              then append ` aria-current="page"` before `>` when k === active
  return openTag + inner + `</` + root.tagName + `>`
diagnoseMock(mockHtml, shellDir) → { shell, findings: [{code, text}], expected }
  codes: undeclared | unknown-shell | drift(slot) | own-chrome | missing-css-link
```

**CLI** (`design-atlas.js`, D5/D6):

```
design-atlas.js shell sync  [--root <repo>] [<mock|dir>…]        # default: <root>/design/mocks
design-atlas.js shell adopt [--root <repo>] [--shell <name>] [--apply]
  stdout, sync (one line per mock):
    synced design/mocks/inbox.html | unchanged … | skipped (no shell) … |
    skipped (undeclared) … | skipped (built) …
    cannot sync design/mocks/x.html: no data-slot="content" inside the root — run
      design-atlas.js shell adopt (or wrap the content in data-slot="content")   → exit 1
  stdout, adopt: header `SHELL ADOPT (plan)` or `SHELL ADOPT (applied)`, then
    design/mocks/lobby.html | chrome: nav, header | proposal: app | active: lobby | drift: yes
    design/mocks/signin.html | chrome: none | proposal: undeclared — decide | active: signin | drift: —
Exit codes: 0 pass/written · 1 check violations or a sync refusal · 2 usage/IO
```

**check output** (D4): at `sketch`, shell findings print as `  ⚠️ <f>: <text>` lines before the
`CHECK PASS (n file(s))` line; at bound tiers they are ordinary violations under `CHECK FAIL`.

| Code | Text |
|------|------|
| undeclared | `no data-shell on the [data-screen-label] root — declare data-shell="<name>" or data-shell="none"` |
| unknown-shell | `declares data-shell="admin" but design/shell/admin.html does not exist — author the shell canon or declare data-shell="none"` |
| drift | `shell region differs from canon (nav slot) — run design-atlas.js shell sync` (`header slot` / `outside slots`) |
| own-chrome | `own nav/header markup inside the content slot — the shell owns chrome; in-content sub-navigation uses role="tablist" or a plain container` |
| missing-css-link | `declares data-shell="app" but does not link design/shell/app.css` |

**`/spec:design` worker envelope** (D8): `{spec, mock, tokens, doctrine, manifest, targets,
shell, states, storyFormat, componentDir}` — `shell` = `design/shell/<name>.html` for the mock's
declared shell, `null` for `none`/undeclared.

**Report bullet** (D10, both commands):
`🎨 position: instrument · authored 4 in-session · 7 fable · 0 sonnet-mechanical`

## Behavior

- **Sweep/sketch pass order** (D9): resolve the shell (author it in-session if `design/shell/`
  is absent — visual hosts only) → resolve the position brief (D10) → session authors the
  journey-central set → one sequential Fable dispatch for the overflow, exemplar paths in the
  prompt → `shell sync <this pass's mocks>` → `check` → rebuild → report with the `🎨` line.
- **Sketch exit** additionally runs `shell sync` on the brief's `sketch` mocks before
  `check --matrix`, so a canon change since authoring never blocks ratification for a
  mechanical reason; a drift finding that survives sync is real (own chrome, missing slot).
- **Adopt flow** (D6): `shell adopt` → the session shows the table via `AskUserQuestion`
  (plain-language gloss: which mocks get the app shell, which stay undeclared) → on yes,
  `shell adopt --apply` → `check` → the residual findings are the first measured shell-drift
  set, reported as warns/violations per tier.
- **Genesis** (D7): the session authors `design/shell/app.html` + `app.css` in-session right
  after the signature-screen promotion, syncs the promoted mocks, then marks `tokens-landed`.
- **Edge cases:** a canon whose root is unclosed or lacks a content slot → `check` names it
  (canon rule) and `sync` refuses every mock declaring it with exit 1; a mock root with
  `data-shell="none"` may carry any chrome; a `data-active` naming no `data-nav` key yields a
  region with no `aria-current` (never a finding); a comment or string inside the region
  containing `<` is walked as markup — authors keep `<` out of comment text in the canon.

## Acceptance Criteria

- **AC-20260901-04-1**: WHEN `check` runs on a mock under `design/mocks/` whose walk-up finds
  `design/shell/app.html` and whose root lacks `data-shell` THE SYSTEM SHALL, at
  `data-status="sketch"`, print `  ⚠️ <f>: no data-shell on the [data-screen-label] root — …`
  and exit 0 with `CHECK PASS`; at `ratified`/`approved` or under `--matrix` it SHALL count
  the same text as a violation and exit 1 → `check: shell — undeclared` in tests/design-atlas.test.js
- **AC-20260901-04-2**: WHEN a mock declares `data-shell="admin"` and no
  `design/shell/admin.html` exists THE SYSTEM SHALL emit the unknown-shell text (tiered as
  AC-1) → `check: shell — unknown name` in tests/design-atlas.test.js
- **AC-20260901-04-3**: WHEN a declaring mock's root inner differs from the expected region THE
  SYSTEM SHALL emit the drift text naming the first differing slot (canon nav label `Settings`
  edited to `Preferences` in the mock → `(nav slot)`; a `<button>` appended inside the header
  slot → `(header slot)`), and a byte-identical region SHALL pass with zero shell findings →
  `check: shell — drift names the slot` in tests/design-atlas.test.js
- **AC-20260901-04-4**: WHEN a declaring mock's content slot contains `<nav>` or `<header>` or
  `role="navigation"`/`role="banner"` THE SYSTEM SHALL emit the own-chrome text; the same
  markup in a `data-shell="none"` mock SHALL produce no shell finding → `check: shell — own
  chrome` in tests/design-atlas.test.js
- **AC-20260901-04-5**: WHEN a mock declares `data-shell="app"` and links no
  `shell/app.css` THE SYSTEM SHALL emit the missing-css-link text (tiered as AC-1) → `check:
  shell — css link` in tests/design-atlas.test.js
- **AC-20260901-04-6**: WHEN no `design/shell/` dir resolves for a mock THE SYSTEM SHALL
  CONTINUE TO emit zero shell findings and pass the existing two-mock fixture with
  `CHECK PASS (2 file(s))` → the existing test `check: labeled token-consuming mocks pass;
  label/tokens/color violations fail closed` in tests/design-atlas.test.js, tagged with this ID
- **AC-20260901-04-7**: WHEN `check` runs on `design/shell/app.html` THE SYSTEM SHALL pass a
  canon meeting every D1 rule without a `data-screen-label` finding, and SHALL fail each of:
  `data-shell-canon="shell"` (name mismatch text), a content slot containing `<p>x</p>`
  (empty-slot text), a nav slot lacking `data-contract="none"` (slot text naming `"nav"`), a
  `#333` literal in `app.css` (off-token text naming the css path), a `font-size` rule in
  `app.css` without `line-height` (hygiene text naming the css path) → `check: shell canon
  rules` in tests/design-atlas.test.js
- **AC-20260901-04-8**: WHEN the mock root carries `data-active="settings"` THE SYSTEM SHALL
  compute an expected region whose `data-nav="settings"` element alone carries
  ` aria-current="page"`; absent `data-active` the key is the screen label; a key matching no
  `data-nav` yields no `aria-current` anywhere; a synced mock SHALL pass `check` unchanged →
  `check/sync: active nav derived` in tests/design-atlas.test.js
- **AC-20260901-04-9**: WHEN `shell sync --root <r>` runs over a mocks dir holding one
  drifted declaring mock, one in-sync declaring mock, one `data-shell="none"` mock, and one
  undeclared mock THE SYSTEM SHALL print `synced …`, `unchanged …`, `skipped (no shell) …`,
  `skipped (undeclared) …` respectively, exit 0, leave the drifted mock's content-slot inner
  byte-identical, insert `<link rel="stylesheet" href="../shell/app.css">` after the tokens
  link when absent, and a second run SHALL print `unchanged` for both declaring mocks →
  `sync: rewrites the region, keeps content, idempotent` in tests/design-shell.test.js
- **AC-20260901-04-10**: WHEN a declaring mock's label is claimed in
  `.claude/design-coverage.json` by a spec at `status: done` THE SYSTEM SHALL print
  `skipped (built) <path>` and leave its bytes unchanged on the default walk, and SHALL sync it
  when its path is passed explicitly → `sync: built mocks skipped unless named` in
  tests/design-shell.test.js
- **AC-20260901-04-11**: WHEN a declaring mock has no `data-slot="content"` inside its root
  THE SYSTEM SHALL print the `cannot sync … run design-atlas.js shell adopt` line, exit 1,
  and still sync every other mock in the same run → `sync: refuses a slot-less mock, syncs
  the rest` in tests/design-shell.test.js
- **AC-20260901-04-12**: WHEN `shell adopt --root <r>` runs (no `--apply`) over an undeclared
  mock whose root holds `<nav>…</nav><header>…</header><section>…</section>` and an undeclared
  mock with no chrome THE SYSTEM SHALL print `SHELL ADOPT (plan)`, a row
  `… | chrome: nav, header | proposal: app | active: <label> | drift: yes` and a row `… |
  chrome: none | proposal: undeclared — decide | …`, and leave every file byte-identical →
  `adopt: plan table, writes nothing` in tests/design-shell.test.js
- **AC-20260901-04-13**: WHEN `shell adopt --apply` runs THE SYSTEM SHALL rewrite the
  chrome-bearing mock so that `check` reports zero shell findings, its root carries
  `data-shell="app"`, the `<section>` markup is inside the content slot byte-for-byte, the
  css link is present, the zero-chrome mock is byte-identical, and with two canon files and no
  `--shell` SHALL exit 2 naming both names → `adopt: --apply wraps content into the region` in
  tests/design-shell.test.js
- **AC-20260901-04-14**: WHEN `--mark tokens-landed` runs for a visual archetype with a
  verbatim `tokens.css`, an approved matrix-clean mock, and `components.json` but no
  `design/shell/app.html` THE SYSTEM SHALL refuse with exit 2 naming `design/shell/app.html`
  and `re-mark tokens-landed`; with an `app.html` whose content slot holds text it SHALL
  refuse carrying the check output naming `design/shell`; with a passing canon and the
  approved mock declaring `data-shell="app"` and synced it SHALL accept and write
  `design: "tokens-landed"` → `AC-20260901-04-14: tokens-landed requires the shell canon` in
  tests/genesis/design-state.test.js
- **AC-20260901-04-15** `[oracle: gate]`: WHEN the doctrine rows land THE SYSTEM SHALL
  CONTINUE TO keep `spec/doctrine/design.md` ≤160 lines and every command's read-load within
  budget (the existing consistency tests are the oracle)
- **AC-20260901-04-16** `[pre-green: absence-invariant]`: WHEN `build` runs on a repo with
  `design/shell/app.html` present THE SYSTEM SHALL CONTINUE TO count only `design/mocks/`
  surfaces (the fixture's `atlas: 5 surface(s)` line unchanged; no `app` surface, no shell
  card) → `build: the shell canon is never a surface` in tests/design-shell.test.js

## Assumptions (escalation triggers)

- A1: A depth-counting tag walk (void elements + `/>` never open a level, comments skipped)
  finds the region and content-slot bounds on real mock markup without an HTML parser —
  **executed 2026-09-01** (scratch `spike-shell.js`, deleted): nested `<div><div>`, `<br>`,
  `<img>`, `<input>`, a `<!-- <div> -->` comment inside the header slot; clean mock → no
  finding; `Settings→Preferences` → `differs … (nav slot)`; appended header button →
  `(header slot)`; `<nav>` in content → own-chrome; no `data-shell` → undeclared;
  `data-shell="none"` → none; canon change → drift, then sync → clean, content byte-identical,
  re-sync idempotent; `data-active="settings"` produces `aria-current="page"` on the settings
  item only — **if false** on a host mock: the finding names the mock and the byte offset;
  fall back to the same walk over `<template>`-free markup and record the shape in Gotchas.
- A2: Every existing test fixture and every host mock dir has no `design/shell/` dir, so D4's
  shell-dir gate keeps them byte-identical in output — **if false:** the fixture gains the
  gate's precondition, never a weakened check.
- A3: `tests/genesis/design-state.test.js`'s tokens-landed fixture can carry a canon + a
  declaring, synced approved mock without disturbing its AC-20260827-03-3 asserts — **if
  false:** update the fixture in place and retag, never weaken (Gotchas: exhaustive pins).
- A4: `Agent {model: "fable"}` is dispatchable from the session with the documented Opus
  fallback (core § Model Placement) — **if false:** ADR-0003 Option C (all in-session) is the
  recorded fallback; no code path depends on it.
- A5: The `report-render.js` `bullets` slot renders a free-text line unchanged — **if false:**
  the `🎨` line moves to `warns`; STOP and ask before restyling the renderer.

## Rationale

The brief's observation is that chrome drifts because nothing shares it and nothing checks
it. The fix has three legs and this spec keeps them separable: a canon artifact (D1), a
mechanism that makes every mock's chrome a derived value (D2–D5), and a check that turns the
derivation's failure into a harness finding (D4). Sync-in-place was chosen over composing
content-only mocks at build because every consumer (render gate, render rules, atlas, genesis
driver) reads mocks as full pages today and ADR-0002 rests on "the mock IS the design_source";
composition would have re-opened extraction. Byte equality (D3) was chosen over a structural
compare because the only per-page variation the shell legitimately has — the active nav item —
can be derived, and a derived value never needs tolerance. The shell's CSS is a linked file
(JJ's pick) for the same reason `tokens.css` is: one source, instant propagation, no sync
step; the trade is one more link per mock and a canon-file rule set that reads the css.

D6 leaves zero-chrome mocks undeclared rather than stamping `none`: a warn line per page until
a human decides is cheaper to reverse than a silent "shell-less forever". D7 puts the driver
check at `tokens-landed` because that is where the signature screens are promoted and where
`tokens.css` is already checked — the shell is the navigation decision's mock-side artifact
exactly as `tokens.css` is the token canon's. D9/D10 are ADR-0003's seat and grounding fixes;
they are prose because the seat is a dispatch choice no script can observe, and the
restored paragraph is placed where D8 originally put it so `atlas.md`'s citation stops being a
phantom. Watch during build: design.md is at its 160-line cap, so the worker must condense
(D11) — the consistency suite is the oracle; and the tokens-landed fixture change (A3) is the
one place an exhaustive pin may collide. Rejected: a separate `shell-sync.js` script (adds a
`spec-paths` key and an entrypoints-pin waive for no reader benefit); a `built` atlas card for
the canon (out of scope, 2026-08-31 ruling); tolerating whitespace in the compare (a
tolerance table is a second parser).

Collision closure at lock (literals `one warm author`, `sequential Sonnet`, `Sonnet overflow`,
`exemplar-grounded`, `never edits its inputs`): 11 hits — `atlas.md`, `sketch.md`, and
`design-atlas.js` are File Plan rows; the 7 hits in `docs/roadmap/20-shell-composed-mocks.md`
and `docs/adr/0003-…` are **waived** — both are historical records that quote the retired D8
wording by design and are never edited by a spec. Paths leg: `tests/design-atlas.test.js` and
`tests/genesis/design-state.test.js` execute the changed scripts and are in the plan; the other
genesis tests never mark `tokens-landed` (grep-verified), so D7 cannot reach them. No test
pins the retired literals (hand grep of `tests/` per Gotchas' retired-literal entry).

## Canonical Delta

Replace the section **"Atlas gap sweep dispatch (2026-08-10, same spec)"** in
`docs/canonical/design.md` with:

**Sketch-tier authorship and the shell canon (2026-09-01, specs/20260901/04)**

Sketch-tier authorship is a planning-seat duty for both `/spec:atlas`'s gap sweep and
`/spec:sketch`'s scoped sweep (ADR-0003, superseding specs/20260810/01 D8): the session authors
the journey-central set in-session (≤5, at least one per declared journey); one sequential
`Agent {model: "fable"}` dispatch (Opus fallback) authors the overflow with those paths as
exemplars, never one agent per surface; Sonnet takes mechanical edits only. Every author reads
the picked position brief (`design/explore/positions.md`, the `design-pick.json` winner's
section) ahead of tokens, and the report names the position and the author split. Single
doctrine home: design.md § Design Atlas.

Coherence is a shell artifact: `design/shell/<name>.html` (root `data-shell-canon`, named
`data-slot`s, an empty content slot, non-content slots `data-contract="none"`) plus a linked
`design/shell/<name>.css`. Page mocks declare `data-shell="<name>"` or `"none"`, own only the
content slot's inner HTML and an optional `data-active`, and carry the chrome as a
`data-shell-region` element that `design-atlas.js shell sync` rewrites from canon (built mocks
skipped unless named). `check` binds a shell family once `design/shell/` exists — undeclared,
unknown name, region drift (named to the slot), own `<nav>`/`<header>` in content, missing css
link — as violations at `ratified`/`approved`/`--matrix` and warns at `sketch`.
`shell adopt` (plan table, then `--apply`) migrates pre-shell mocks. Genesis `tokens-landed`
requires `design/shell/app.html` passing `check`; `rules-locked` authors `AppShell` from it and
`/spec:design`'s worker envelope carries `shell`.
