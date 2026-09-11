# Design — canonical decisions

*Retired 2026-08-24 (specs/20260824/05): the source-grep fidelity gate, `dc-extract`, the
`.design/` sidecar, skeleton binding maps, delta rows, the Fable retainer, the vision
consult, the exit fidelity review, and `copyCatalogs` as a required key.*

## Component vocabulary (2026-08-10, specs/20260810/01-design-path-model-placement.md)

The product's committed building blocks live as **commitment entries** in
`design/components.json` (`name`, `purpose`, `boundaries`) — the same manifest that holds
landed components; absence of `props`/`mockRefs` is what marks an entry as commitment-only.
Seeded at SKELETON (checked by `components-check.js` at `skeleton-landed`,
specs/20260902/08). Validated by `components-check.js` (spec-paths key `components-check`):
**fail-closed** at genesis `skeleton-landed`, **advisory** at the design driver's preflight (brownfield
files may predate the canonical shape; the legacy `{"components": [...]}` wrapper is tolerated
with a warning).
Consumed as binding canon by `wf-design` workers via the `componentManifestPath` arg — a
named block is bound or authored to fulfil its entry, never re-invented as a lookalike, and
a `boundaries` contradiction is a fork (`blocked`), same standing as a token-value
contradiction. `/spec:review`'s component-manifest check includes commitment entries in its
near-duplicate comparison, and an `author` decision fulfilling a commitment entry cites it
as its justification.

## Design stage (2026-08-24, specs/20260824/02)

`/spec:design` is a six-step command body, not a driver: **preflight** → **author** →
**host gate** → **render gate** → **your look** (blocking) → **reconcile + `designed:`**.
Step position is derived from disk on every invocation — there is no state file, no
`.design/` sidecar lifecycle, and no workflow. Authoring is direct Sonnet dispatch, one
warm worker per surface with the mock HTML in context and `design/components.json` as
canon; the mock IS the binding map, so the skeleton paraphrase hop and its checker are
gone. The story bound to a mock state renders exactly the values the mock illustrates for
that state (a story exercising extra branches is a separate, unbound story), and the
render gate is the drift detector for that rule. Story ids land in the coverage ledger's
claims. The user's Storybook look is kept and blocking after both gates are green — the
gates measure what a human cannot overlay, not the reverse. Retired with the driver:
`spec-design-driver.js`, `wf-design.js`, `skeletons-check.js`, the Haiku match pass, the
Fable retainer, the vision consult, and the `ITERATE` catalog loop.

## Sketch-tier authorship and the shell canon (2026-09-01, specs/20260901/04)

Authorship of every mock pass — `/spec:atlas`'s gap sweep, `/spec:sketch`'s scoped sweep, and
`/spec:mocks`'s screens, wireframe or themed — is one in-session hand (ADR-0006,
specs/20260902/09, superseding ADR-0003's sequential-dispatch split and specs/20260810/01 D8):
no `Agent` dispatch writes a mock at any stage or tier; subagents run judgment-free checks
only. Grounding opens with the mocks seed and canon (`design/mocks/seed.md` →
`design/mocks/canon.md` → research brief → owning brief → doctrine → `tokens.css` → shell
canon), and every command's report carries one line: `🎨 authored {N} in-session · {K}
check-only dispatches`. Single doctrine home: design.md § Design Atlas.

Coherence is a shell artifact: `design/shell/<name>.html` (root `data-shell-canon`, named
`data-slot`s, an empty content slot, non-content slots `data-contract="none"`) plus a linked
`design/shell/<name>.css`. Page mocks declare `data-shell="<name>"` or `"none"`, own only the
content slot's inner HTML and an optional `data-active`, and carry the chrome as a
`data-shell-region` element that `design-atlas.js shell sync` rewrites from canon (built mocks
skipped unless named). `check` binds a shell family once `design/shell/` exists — undeclared,
unknown name, region drift (named to the slot), own `<nav>`/`<header>` in content, missing css
link — as violations at `ratified`/`approved`/`--matrix` and warns at `sketch`.
`shell adopt` (plan table, then `--apply`) migrates pre-shell mocks. The shell canon is
extracted from the approved set at SCAFFOLD (spec 11); genesis authors `AppShell` from it and
`/spec:design`'s worker envelope carries `shell`.

The kit is the shell's sibling canon family for the content slot: `design/kit/<name>.html` (root
`data-kit-canon`, one `data-kit-primitive="<key>"` element per shared primitive with a
`data-purpose` when-to-use line, chrome `data-contract="none"`, content `data-slot="content"`,
states via `data-state-btn`), linking the wireframe register and never skinned
(specs/20260907/04). Same walk-up resolution (`resolveCanonDir(from, family)`), same checker.

Fidelity lives in sketch (specs/20260906/06): `/spec:mocks` ends gray; `/spec:sketch` authors
each brief's surfaces at production fidelity in the picked theme, reworks the brief's
wireframes into it, writes a three-line UX argument per surface into the brief, and closes
with the fixed critique pass — `check --states`, `render-gate --mocks`, and the journey walk
(specs/20260907/08): one fresh-context `design-critic` (Opus, read-only) per journey — per brief
at sketch — reading the journey's screens in declared order with the gray empty/loading/error
states entered as branches at the step where they occur, reporting only the six flow breaks (no
path back, no path forward, a state with no exit, a step needing data no earlier step collected,
a control meaning two things across screens, an error state with no recovery), each cited to a
screen and one of that screen's declared states or refused. Findings are page notes carrying
`kind: "walk"`; the session closes one with `notes address`, only the served page resolves it,
and no journey is marked walked while one of its findings is still open.
`design-atlas.js check` flags a mock linking `wire/` after `design/tokens.css` exists: warn at
`sketch`, violation at `ratified` only — `approved` gray wireframes from mocks sign-off are
exempt — and flags a `ratified` mock with unresolved notes on its label (critic or human) the
same way.

The theme itself is picked in sketch (specs/20260907/06). `mocks-driver.js` carries a `theme`
subcommand family outside the mocks state machine — `theme state` derives `absent`/`picked`
from `design/tokens.css` and refuses outright when that file is the wireframe gray register
byte-for-byte; `theme compose --direction <k>` validates one candidate directory; `theme open`
opens the `theme-picked` pick stop over every valid candidate; `theme adopt` writes
`design/tokens.css`, appends the `theme: <k>` provenance row at step `SKETCH` and consumes the
stop. Candidates are the signed-off gray kit re-rendered at production fidelity per direction
at `design/theme/<kebab>/kit.html`; the picked direction's kit page is the fidelity reference
every later sketch surface is built from. `adopt` writes no mark — `design/tokens.css` on disk
is the sole "a theme is picked" signal, and a re-pick is a fresh stop, never a reopen. Adopting
supersedes rather than refuses: every other confirmed `theme:` row, same direction or not, is
marked `overridden <today>` in the same write, so exactly one confirmed `theme:` row survives
across all directions and a later genesis brief is never grounded on two contradictory picks.
Sketch's first run is the theme run whenever a kit family resolves and no theme is picked; with
no kit family it prints one gray-floor warning and sketches gray as before.

## One token set (2026-09-03, specs/20260902/09)

`spec/templates/mocks/viewer.css` is the one token set: shadcn's Neutral theme values as plain
CSS custom properties (`--v-*`) plus the full chrome register (cards, 1px borders with a soft
shadow, filled primary button, badges, inputs, toolbar, status chips). `design-atlas.js`'s
`page()` inlines it into every chrome page (atlas, galleries, the preview toolbar, the notes
layer, the sketch workbench), and the chrome's own rules consume only `var(--v-*)` roles — no
literal color outside the inlined `:root{…}` block, output byte-stable across runs.
`spec/templates/mocks/wire-tokens.css` carries the same values under flat role names
(`--bg --fg --muted --muted-bg --border --primary --primary-fg --ring --radius --font`), and
`wire.css` is a CSS port of shadcn's component look on those roles (filled `.btn.primary` on
`--primary`, `--shadow` on cards and inputs, dashed `--border` placeholders for undrawn content —
ADR-0013 retired the flat no-fills register); a test pins the two files value-equal per role. A
theme is the same roles re-valued; chrome never adopts product tokens.

## Render gate (2026-08-24, specs/20260824/01)

Fidelity between a mock and its component is judged at the render by `render-gate.js`
(`spec-paths render-gate`): the host's `design.render.capture` command turns a URL into an
inventory using the plugin's `render-inventory.browser.js` (painted text, roles, boxes,
`srOnly`/`fixed`/`outOfFlow`/`dataPositioned` flags); `render-compare.js` matches painted
text by LCS over in-flow entries, reports `text-missing`/`text-extra`/`order`/`role`/
`positioning`/`geometry` findings with tolerances `{dx 1%, dw 1%, dh 15%}` and `dyRel`
disabled, auto-excuses static-control→link with a `📌` line, and never computes pixels.
Story ids per mock state live in `.claude/design-coverage.json` claims (`stories`). The
matrix is `design/targets.json`, fail-closed when absent. `/spec:review` runs the gate as an
advisory evidence leg on designed specs when `design.render` is declared.

## Mock hygiene and marks (2026-08-24, specs/20260824/03)

At `ratified`/`approved` (equivalent for every consumer), `design-atlas.js check` enforces a
universal `border-box` reset, a declared `line-height` wherever a block declares `font-size`,
no `border`/`border-radius` on the `[data-screen-label]` root, and state controls placed
outside the contract — plus the matrix rules (viewport meta, dark block). The mark vocabulary
a mock declares is `data-screen-label` (root, one per file), `data-status`,
`data-state-btn="<state>"`, `data-contract="none"` (non-contract subtree),
`data-positioned` (children placed from data), and `data-narrow` (a deliberately narrow root at
every width). The matrix expansion runs at `/spec:sketch`
exit — expand, `check --matrix`, render the matrix screenshots, then ratify — so ratification
is the single stamp that makes a mock render-gate-ready.

Every wireframe declares its empty, loading and error states (`data-state-btn`) or opts a state
out on the root (`data-no-state="<name>"`) with the product reason in the ledger
(specs/20260906/05); `design-atlas.js check --states` is the presence check, run by the mocks
driver at `journey-drawn` and `journey-approved`; the render gate captures every declared state
as before.

## Executable design rules (2026-08-24, specs/20260824/04)

`design-rules.json` entries may carry a `renderCheck` object with a closed `kind` set —
`target-size {min}`, `cta-count {max, tokens[]}`, `contrast {min, minLarge}`, `palette {}`,
the adaptation kinds `no-overflow {}` and `line-length {maxCh, minViewport}` (specs/20260831/02),
and `desktop-fill {minFraction, minViewport}` (specs/20260905/05) — measures the in-flow content
span against `page.clientWidth` at cells at or above `minViewport`, failing a phone-width column
unless the mock's root declares `data-narrow` (inventory top-level `narrow`);
an unknown kind is a manifest error, and entries without one are counted as `source-side=<n>`,
never silently dropped. `render-rules.js` (`spec-paths render-rules`) executes them over render
inventories against a palette resolved from `tokens.css` (hex / `rgb()` / one-level `var()`,
both the light and `[data-theme="dark"]` blocks; anything else is one advisory `unresolvable`
line). `render-inventory.browser.js` supplies `effectiveBackground` (nearest non-transparent
ancestor-or-self background) and `fontWeight` at `schemaVersion` 1. `render-gate.js` runs the
rules over every component inventory when the host declares `design.rulesManifest` — findings
print under the cell and fail the gate; no manifest prints one skip line — and its
`--mocks <mock>…` mode captures mocks only (no ledger, no comparison) so `/spec:sketch` exit
runs the same rules over the mock render. The Sonnet rule-checklist walk is retired from sketch
exit, the design gate, and `/spec:review`'s design leg; the checklist survives only at the
explore stage, which precedes `design-rules.json` and so has no manifest to execute.
The canon template's § Shells asks what each shell does at every declared viewport
(specs/20260905/05 D8).
`render-gate --mocks` on a host with no `design.render.capture` captures through the plugin's
own `render-capture.js` (an installed Chrome over DevTools, Node built-ins only; `CHROME_BIN`
overrides), one browser per run via `--batch`; with no `design.rulesManifest` it runs the
plugin's adaptation rules (`spec/templates/adaptation-rules.json`: no-overflow, desktop-fill,
line-length) and says so on one line; no browser is exit 2 with the remedy, never a pass.
`--spec` mode is unchanged: host-declared capture and URL. `/spec:mocks`'s `journey-approved`
and `approved` marks run this gate over the journey's / the whole set's top-level mocks and
refuse on any finding or capture failure (specs/20260905/06; ADR-0007 amends ADR-0002).

## Provenance ledger (2026-09-02, specs/20260902/06)

The mocks ledger, `design/mocks/ledger.md`, is a markdown file with fixed-word columns parsed
by `spec/scripts/lib/mocks-ledger.js` (`parseLedger`, `gateVerdict`, `countsLine`,
`appendAssumption`, `appendCatch`, `setStatus`; grammar in `spec/doctrine/mocks.md`, resolved
via `spec-paths shared-mocks`; empty ledger at `spec/templates/mocks-ledger.md`). Two tables:
Assumptions (`id · step · kind · claim · tag · status · rejected · dependents · note`) and
Misunderstandings (`id · what · step · cost · note`). Every enum cell is one fixed word — tag
`said-by-user|ratified-doc|inferred|invented`, status `open|confirmed|overridden|decided`
(+ optional ISO date), kind `product|process` — and free text lives only in `claim`,
`rejected`, and `note`. A product row that is `invented` (not `overridden`) or `inferred` +
`open` blocks every advance; `ratified-doc` rows and every `process` row never block and are
counted on the fixed `📒 ledger:` line. A ledger that does not parse never opens a gate. The
lib is the one writer of rows: edits rewrite only the touched row and leave every other byte
identical; a literal pipe inside a cell is written `\|`.

## The mocks command (2026-09-02, specs/20260902/07)

`/spec:mocks` is the standalone design stage. `spec/scripts/mocks-driver.js` (`spec-paths
mocks-driver`) derives `SEED → SHAPES → KIT → WIREFRAMES → WALK → CLIENT → APPROVED`
(specs/20260907/10, ADR-0012; specs/20260907/04, ADR-0010 amending ADR-0008) from `design/mocks/status.json`
(schemaVersion 1) plus the artifacts on disk: the skin and review states are retired; a
wireframe is never skinned inside mocks — `/spec:sketch` owns fidelity per brief. The driver
prints exactly one step
(`Read only:` + `Doctrine:` lines), checkpoints every accepted mark (`✅ checkpoint — mocks state
saved (<prev> → <next>); safe to /clear and re-run /spec:mocks`, preceded by the `📒 ledger:`
counts line), gates every advance on the provenance ledger (`gateVerdict`, refusing on
`open:false` and naming the rows), and records a sub-mark per journey (`journey-drawn`,
`journey-approved`), and
`--reopen journey:<j>|walk:<j>|shapes|kit` (recorded, printed, nothing deleted). WALK sits
between WIREFRAMES and CLIENT (specs/20260907/08): each declared journey is walked once by a
fresh critic and stamped with `journey-walked --journey <j>`, which refuses while any walk
finding on that journey is still open, so the stage cannot close on a journey nobody
walked. The whole mocks stage
is gray (specs/20260907/07): the taste decision is picked on `/spec:sketch`'s first run against
the signed-off kit (specs/20260907/06), and `design/tokens.css` on disk — never a mark and never
a status field — is the one signal that a theme exists. CLIENT (specs/20260907/10, ADR-0012)
replaces the one-look sign-off as the stage's single human gate: the session exposes its own
running serve and records the address with `client open --address <url>`, refused unless
`<url>/client/__notes/list` answers — the plugin never opens a tunnel itself. `--mark approved`
keeps the decided `approved` stop as the decider ceremony, prints `waived: N` plus one reason
line per waived note, and closes on the ledger and the notes alone: a waived note or a
`waived <date>` ledger row satisfies the same gates a resolved note or a confirmed row does.
It stamps every top-level mock
`data-status="approved"` and records the stop's decider, so a mock approved by `/spec:mocks` is
always a gray wireframe and the atlas's wire-register rule exempts it by design.
`--reopen journey:<j>` clears that journey's approval and the terminal approval. The 13 seed fact keys are closed (`primary-surface platforms-horizon tenancy offline
realtime ai-in-loop residency payer day-one-integrations scale-outage vendor-limits retention
legal-floor`), each mapped in `seed.md ## Facts` to a confirmed `product` ledger row. The
seed's six sections are Product · Facts · References · Records · Journeys · Dense screens
(specs/20260910/06, ADR-0013). Records carries one `- <entity>: records/<entity>.json` line
per entity, each path relative to `design/mocks/` and each file a JSON array of at least three
of the client's real records; `seed-done` refuses a missing section, a `- none` line, a path
that does not exist or does not parse as an array, and an array shorter than three, naming the
entity and the remedy — and when a cold host derives no entity at all, the remedy still prints
with the literal `<entity>` placeholder. Dense screens carries one or two labels, each declared
in a journey — the pair every theme candidate is judged on; the singular `## Dense screen`
heading with one line continues to parse, so hosts already past SEED are untouched.
`journey-drawn` prints `⚠️ <label>: carries none of the client's records` for every screen
carrying no record value and refuses a journey where no screen carries one — a settings screen
legitimately shows no record, a whole journey drawn on placeholders does not.
`spec/scripts/lib/mock-seed-checks.js`'s `recordValues`/`recordHits` are that one derivation. Registers
are link signatures: a wireframe links `design/wire/tokens.css` + `wire.css` (copied from
`spec/templates/mocks/` at `canon-written`), a composed direction screen links its
direction's `tokens.css` and no `wire/` stylesheet. "Links" is one derivation for every
check that asks — `spec/scripts/lib/wire-register.js` reads the stylesheets a page actually
applies (`<link>` with a stylesheet `rel` in any quoting form or attribute order, plus CSS
`@import`, comments stripped) and answers whether any of them has `wire` as a whole path
segment. A `<link>` the browser does not apply as a stylesheet, and a path merely named like
the register (`my-wire/`, `v.wire/`), are not the register; a register applied through
`@import` is. No script outside that module spells the rule itself.
The driver's
`ledger add|set|catch|check|counts` subcommands are the only writers of `design/mocks/ledger.md`.
SSH rule: `design-atlas.js serve` serves `design/` statically and prints
`serving http://localhost:<port>/atlas/index.html — remote: ssh -L <port>:localhost:<port> <host>`;
the driver's own look is `mocks-driver.js look <label> [--state <s>]` through the Playwright
CLI (`look-probe` gates every screen-producing state unless `look-via browser` was declared).
`design-atlas.js build` renders seed journeys (owner `seed:<journey>`), one frame per
`data-state-btn` state, a `shapes` section, and skips `references/`. Greenfield chain:
`/spec:mocks → /spec:genesis → /spec:enforce → /spec:plan`.

`KIT` (specs/20260907/04, ADR-0010 amending ADR-0008) writes `design/kit/<name>.html`, a canon
family sibling to `design/shell/` under the same marks and the same checker, gray and never
skinned, signed off on the page via `stop open kit` / `--mark kit-signed`. Once a kit family
resolves, every content region of a labeled mock is either `data-kit="<key>"` or
`data-bespoke="<key>: <difference>"` (the key must name a primitive the family declares);
`check` prints `ⓘ <label>: <n> kit, <m> bespoke` per screen plus an unabsorbed total after its
CHECK PASS/FAIL block, warns at `sketch` and violates at `ratified`/`approved`/`--matrix`, and
`journey-approved` refuses on an unmarked region. A primitive key is unique per family, not per
file. `--reopen kit` clears the kit sign-off and the terminal approval only, never a journey's
own approval. A tree with no `design/kit/` is unaffected.

Every seed edge is a real control (specs/20260910/02, ADR-0013): the element whose click leads
onward from a mock carries `data-to="<label>"`, and `journey-drawn` refuses while any seed edge
has no such control, or while any `data-to` names a screen no seed journey declares —
`spec/scripts/lib/mock-seed-checks.js`'s `edgeGaps` checks a journey's own edges for a missing
control, but tests an unfamiliar `data-to` against the union of every seed journey's declared
labels, so a control may point at a screen a different journey owns. `GET
/mocks/<label>.html?walk` injects `/__walk/walk.js` (`spec/scripts/lib/walk-mode.browser.js`)
before the last `</body>`, composing with `?clean`/`?state=`; inside the served frame, a click on
a `data-to` control posts `{walk:'to', from, to}` to `window.parent` and any other click posts
`{walk:'miss', from, target}`, describing what was clicked, while state switchers post nothing —
with no parent frame the script installs nothing. This is the mechanism an embedding player
reads to know where a click went.

The journey look surface is the review page `/review/<j>.html` (specs/20260906/04): screens rail ·
artboards with state tabs (`?state=<s>` on the served mock) · question inspector answered in place
with `J K Y N Esc \`; `stop open journey:<j>` points there; the approve control mirrors the on-disk
gate (disabled while any question or note is open). Plugin chrome — atlas, review page, galleries,
notes layer — is authored under the frontend-design skill in the shadcn idiom on `viewer.css`'s
register (design.md § Design Canon), never on product tokens.

## Page notes (2026-09-03, specs/20260902/10)

Feedback on mocks is written on the served pages, never in chat and never in mock markup.
`design-atlas.js serve` injects a notes layer (`lib/notes-layer.browser.js`, on `viewer.css`'s
`--v-*` roles) into every served `.html` at serve time; `?clean` skips the injection and is what
the driver's look and the render gate's capture append. Notes live in `design/mocks/notes.json`
at two scopes — a mock note is anchored to a screen + state, a project note to the whole
product, never to an element — and are written only through `lib/mocks-notes.js`
(`readNotes`, `validateNotes`, `writeNotes`, `addNote`, `resolveNote`, `addressNote`,
`replyNote`, `groupOpen`, `unresolvedFor`). The server binds loopback only and exposes
`GET /__notes/notes.js|viewer.css|list?screen=<label>|*` and `POST /__notes/add|resolve`;
`address` and `reply` are driver-only file writes (`mocks-driver.js notes open|address|reply`),
never HTTP, so a page can never mark the session's work done. The loop is asymmetric: the
session addresses (`open → addressed`, with the change and an optional ledger row recorded
under the note) and replies; the author resolves on the page after a re-look; no driver
subcommand resolves. Triage bins are a closed set — `mock detail`, `product understanding`,
`question back`, `propose to decline` — and a note that hits a canon primitive changes
`canon.md` first, every dependent screen after. Project notes outrank mock notes:
`journey-approved` and `approved` refuse while any project note is unresolved or any note on
the journey's screens is unresolved (`addressed` is not `resolved`); client review is the same
page and the same notes, served on the client route as the `CLIENT` state (specs/20260907/10,
ADR-0012). A note carries `origin: walk|client|session`, set by the route it arrived on
(`/client/__notes/*` stamps `client`, `/__notes/*` stamps `session`, `notes add --kind walk`
stamps `walk`) and never accepted from a body. A client's mock-scope note captures its screen at
raise through `lib/client-capture.js` — the look command's URL form and first-declared viewport,
`captures/<id>.before.png` beside `notes.json`, sha256 on the note; `notes address --port <n>`
re-captures and refuses when the hash is unchanged, else stores the after image and moves the
note to `addressed`. Only the client route resolves a client note — `withdrawn` from `open`,
`accepted` from `addressed` — and a session-route resolve is a 403. `notes waive --id --reason`
releases a client note or a question after seven days of client silence (a question's ledger row
becomes `waived <date>`; the note's `answer.verdict` is `waived`). `writeNotes` is a tmp-file
rename, never an in-place overwrite. Zero unresolved notes on a journey is its
approval. The CLIENT step prints `Approval means "this is the product I understand" — the
written brief, not these screens, holds scope`. `/spec:atlas` and `/spec:sketch` route their annotation loops
through the same serve + `notes open`; the annotation-MCP discovery clause is retired.

**Picks (specs/20260905/01).** A look stop is a record in `design/mocks/picks.json` (one
writer, `lib/mocks-picks.js`: `readPicks`, `writePicks`, `validatePicks`, `openStop`,
`decideStop`, `consumeStop`, `pending`) of candidate groups — a group is one flow, its screens in
order, so a shape file, a theme direction, and a per-surface variant inside a journey are the same
shape. The served atlas lists open stops at the top (`#stops`, links only) and renders each in
place in the section its screens live in, derived from the key grammar `<mark>[:<journey>]`: a
`pick` stop as a compare table (one row per step, one column per candidate, full cards, sticky
column headers) with a one-click **Pick this** per group and an optional why-line after it, an
`approve` stop as **Approve** / **Change** with a note. The decision posts to the notes server's
`POST /__picks/decide` (`GET /__picks/list` returns the pending stops) and lands in `picks.json`,
re-pickable until the mocks driver consumes it; a new `openStop` with the same key supersedes the
old one. The notes layer shows one scope per page, declared by the server's
`<meta name="notes-scope" content="project|mock">`: project notes on the atlas index, mock notes
on a screen, and the index's bar hides while the lightbox is open (`body.lb-open`). `design-atlas.js`
exports `buildAtlas`, `page`, `frameTag`, `createRequestHandler(root, {prefix})` — one handler,
mountable under a prefix — and runs its CLI only as a main module.

**Look server (specs/20260905/04).** There is no resident process. A mock look stop is served by
that project's own `design-atlas.js serve`, which the session starts as a tracked background task
before the first `stop open` of a run and stops at sign-off or when the session ends (a server a
previous session left up is reused — serve answers `already serving`). `serve --port 0` binds an
OS-chosen port and prints the bound port in its banner; the test harness
(`tests/mocks/chrome-harness.js`) uses that form so concurrent runs never share a port, treats any
first line other than `serving` as a refusal, and bounds every DevTools wait with a deadline
(specs/20260909/03). No test chooses a port number: `tests/helpers.js` exports the one
`freePort()` and the one `serveAtlas(root, {port, script})` that every serve-backed harness binds
through — `serveAtlas` spawns the real serve child on `--port 0`, resolves with the port the
banner announced, and kills that child on its own timeout (specs/20260909/06). `design-atlas.js stop
open|decide|list` own the stop CLI (`stop open` writes the stop through `lib/mocks-picks.js`,
probes the served page for the stop's block and prints the one link
`http://localhost:<port>/atlas/index.html#stop-<id>`; exit 3 names the serve command as the
remedy); the mocks driver's `stop open <step>` delegates there. The user's path is the 🎨 link;
the serve command is never printed to them. Picks on the page, the two-line hand-off, marks
refusing without a decided stop, and the derived `rejected` cell are unchanged from specs
20260905/01–02.

**Questions (specs/20260906/03).** A note with `kind: "question"` is a ledger assumption row
pinned to a screen by the session (`ledger add … --screen`, `ledger ask`); the page answers it
(`/__notes/answer` yes/no + text), and the answer writes the row's status (`confirmed` /
`overridden` + date) before resolving the note. `journey-approved` (and
`approved`) refuse while a question on the journey is unanswered, naming the ledger ids — the
question-aware notes gate runs ahead of the generic ledger gate, so that line is the first one
printed. Free-form notes carry an optional `reason` (missing-screen · wrong-direction ·
wrong-words · other). Catch provenance is derived from `addressed.ledgerRow` and printed by
`ledger counts` as question · note · unlinked — never a ledger column.
