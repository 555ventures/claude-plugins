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
contradiction. The review stage's component-manifest check includes commitment entries in its
near-duplicate comparison, and an `author` decision fulfilling a commitment entry cites it
as its justification.

## Design stage (2026-08-24, specs/20260824/02)

The design stage is a six-step body, not a driver: **preflight** → **author** →
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
the design stage's worker envelope carries `shell`.

The kit is the shell's sibling canon family for the content slot: `design/kit/<name>.html` (root
`data-kit-canon`, one `data-kit-primitive="<key>"` element per shared primitive with a
`data-purpose` when-to-use line, chrome `data-contract="none"`, content `data-slot="content"`,
states via `data-state-btn`), linking the wireframe register and never skinned
(specs/20260907/04). Same walk-up resolution (`resolveCanonDir(from, family)`), same checker.

Fidelity lives in sketch (specs/20260906/06): `/spec:mocks` ends gray; `/spec:sketch` authors
each brief's surfaces at production fidelity in the picked theme, reworks the brief's
wireframes into it, writes a three-line UX argument per surface into the brief, and closes
with the states-presence check and the render gate, every round — `check --states`,
`render-gate --mocks`.
`design-atlas.js check` flags a mock linking `wire/` after `design/tokens.css` exists: warn at
`sketch`, violation at `ratified` only — `approved` gray wireframes from mocks sign-off are
exempt — and flags a `ratified` mock with unresolved notes on its label the
same way.

The theme is already picked when sketch runs: specs/20260910/04 (ADR-0013) returns the pick to
`/spec:mocks`'s own `THEME` state, and `/spec:sketch` finds `theme state` reporting `picked`.
`mocks-driver.js` carries a `theme` subcommand family — `theme state` derives `absent`/`picked`
from `design/tokens.css` and refuses outright when that file is the wireframe gray register
byte-for-byte; `theme compose --direction <k>` validates one candidate directory and refuses a
direction whose `tokens.css` does not re-value every role `wire-tokens.css` declares, naming the
missing roles; `theme shortlist --directions <a,b[,c]>` opens the `theme-picked` pick stop over
the user's own shortlist; `--mark theme-picked [--direction <k>]` writes `design/tokens.css`,
appends the `theme: <k>` provenance row and consumes the stop. `theme open` and `theme adopt`
are retired — each exits 2 naming its replacement. A host that already picked at sketch keeps a
legacy no-stop path: `--mark theme-picked --direction <k>` is accepted when `design/tokens.css`
is byte-equal to that direction's, and refused naming `theme shortlist` when it is still the
wireframe gray register. Candidates are the signed-off gray kit re-rendered at production fidelity per direction
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
`spec/templates/mocks/wire-tokens.css` is shadcn Neutral's own register: its eighteen colour
roles plus `--radius`, under shadcn's names and `oklch()` values exactly as the registry serves
them, plus three pipeline-local roles (`--font`, `--shadow`, `--shadow-lg`). `wire.css` is a CSS
port of the shadcn component look on those roles — filled `.btn` by default on `--primary`, the
3px translucent focus ring, the raised-pill tab row, radii on shadcn's four-step scale, dashed
`--border` placeholders for undrawn content. A theme direction re-values all twenty-two roles,
and the role-completeness leg reads the template at run time, so the register file is the single
source of what a theme owes. The chrome register (`viewer.css`'s `--v-*`) is separately owned and
is not value-equal: chrome answers to `design/chrome-mocks/`, the wireframe register answers to
shadcn. A host repo holding an older register moves onto the current one with `mocks-driver.js
--refresh-register`, which classifies by role names, rewrites both wire files, renames role
references across `design/`, and is idempotent.

## Render gate (2026-08-24, specs/20260824/01)

Fidelity between a mock and its component is judged at the render by `render-gate.js`
(`spec-paths render-gate`): the host's `design.render.capture` command turns a URL into an
inventory using the plugin's `render-inventory.browser.js` (painted text, roles, boxes,
`srOnly`/`fixed`/`outOfFlow`/`dataPositioned` flags); `render-compare.js` matches painted
text by LCS over in-flow entries, reports `text-missing`/`text-extra`/`order`/`role`/
`positioning`/`geometry` findings with tolerances `{dx 1%, dw 1%, dh 15%}` and `dyRel`
disabled, auto-excuses static-control→link with a `📌` line, and never computes pixels.
Story ids per mock state live in `.claude/design-coverage.json` claims (`stories`). The
matrix is `design/targets.json`, fail-closed when absent. The review stage runs the gate as
an advisory evidence leg on designed specs when `design.render` is declared.

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

A wireframe carries no styles of its own (2026-09-13, specs/20260912/09). A mock that links the
wire register links only `wire/tokens.css`, `wire/wire.css` and `wire/project.css`, carries no
`<style>` block that declares a rule (an `@import`-only block is permitted) and no `style=`
attribute. The project's own vocabulary lives in `design/wire/project.css` alone; it may not
declare a class the shared kit declares, and it may not hold more distinct classes than the
shared kit does — the cap is read from the shared kit at run time. A class used on exactly one
screen is warned, never refused. The universal `box-sizing` rule hygiene requires is satisfied
by linking the register, which carries it. Every run over a resolved project kit prints its
class count against the cap, its rule count and its layout share — the proportion of rules whose
declarations are all layout or spacing — which is the measurement the deferred component-kit
decision reads.

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
exit, the design gate, and the review stage's design leg; the checklist survives only at the
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
(+ optional ISO date), kind `product|process|exclusion` — and free text lives only in `claim`,
`rejected`, and `note`. A product row that is `invented` (not `overridden`) or `inferred` +
`open` blocks every advance; `ratified-doc` rows and every `process` row never block and are
counted on the fixed `📒 ledger:` line. A ledger that does not parse never opens a gate. The
lib is the one writer of rows: edits rewrite only the touched row and leave every other byte
identical; a literal pipe inside a cell is written `\|`.

### Exclusions (2026-09-12, specs/20260910/05 + specs/20260911/05 + specs/20260912/01 + specs/20260912/02)

An `exclusion` row is what the product will NOT do, and it is **derived, never typed**
(`lib/mocks-exclusions.js`'s `deriveExclusions`, materialized by `mocks-driver.js ledger derive`;
`ledger add --kind exclusion` is refused toward `ledger derive`). Its `tag` is always
`said-by-user`, and its `note` names the decision it came from: `non-goal: <brief line>` (a
discovery non-goal tagged Later or Won't-this-time), `answer: <noteId>` (the client answering `no`
to a question on a row the session invented), or `withdrawn: <noteId>` (a client note withdrawn as
`not-needed`). The `note` is the row's identity, so it carries the brief LINE and never the tag — a
shared key makes every non-goal after the first silently underivable. Derivation reconciles rather
than only appending: `deriveExclusions` returns `{add, retire}`, and a row whose source decision
was undone is set `overridden <today>` rather than deleted, since the `note` cell is the audit
trail. Exclusion rows never block the gate and are counted on the `📒 ledger:` line.

Three renders, one source. Rows are materialized on the client's own walk-page request
(`lib/mocks-exclusions.js`'s `materialize`, run by `ledger derive`, `client open`, the
`GET /client/walk/<j>.html` route and `--mark approved`), so the closing screen lists them the
first time anyone looks, with no session command run first. The client answers each one `Correct`
or `No — we need this`; the latter sets the row `overridden` with `rejected: client-needed` and is
never re-derived. The confirm control no longer waits on the list — approval is the session's own
bookkeeping, not a gate on the client's consent to our rows. `--mark approved` derives once more,
never refuses on an exclusion row, and writes `design/mocks/exclusions.md` stamped with the
approval date under `## Agreed by the client` and `## Not contested` — the snapshot a statement of
work cites, never rewritten in place. `genesis-driver.js --mark roadmap-written` requires every
`confirmed` or `open` exclusion's claim verbatim under `docs/roadmap/00-overview.md`'s
`## Parking lot`, naming an open one "not contested", so a client's silence can never silently
unfence a non-goal; an `overridden` row is never required. The BRIEF step's derived-from line
carries both counts.

A client withdrawal carries `withdrawReason` (`not-needed | fixed-elsewhere | mistake`), validated
on the client route and by `validateNotes`. The client-facing control ships (specs/20260911/04):
an open request carries `Never mind` on both client pages, because without it a client who changes
their mind locks the journey — they cannot withdraw, `notes address` refuses to answer a request
whose screen capture is unchanged, and the only exit is the seven-day `notes waive` timeout.

The card explains itself (specs/20260912/01). It carries a heading counting the rows, and a lead
posing the question and stating that an unanswered row is recorded as not contested at sign-off.
One provenance sentence sits on each of the two rows whose claim this pipeline CONSTRUCTED from
something the client said in other words — their answer to a question (`answer:`), or a request
they took back (`withdrawn:`) — each followed by their original words quoted; a row transcribed
straight from the brief's non-goals carries none, because its source text is the claim itself, and
neither does a row whose note names an unresolvable id. The ledger's internal `not: ` prefix
renders as `We won't build: `, never raw. Every non-`open` row carries a state line saying what the
client answered, held by `data-verdict` ∈ `agree|needed|dropped`, in place of its buttons. The
in-session render after an answer is the same markup as the reload render: the handler activates
the row's own hidden state line from the section's `data-said-*` attributes instead of disabling
the buttons. `design/client-mocks/walk.html` is the binding reference for the card's states.

An answer is the client's to change until the session marks the work approved
(specs/20260912/02). An answered row carries `Change answer`, which posts `verdict: 'reconsider'`
and returns the row to `open` with its `rejected` cell cleared. Once `design/mocks/status.json`
carries `marks.approved`, the card is a dated record: it renders the approval date, states every
outcome including an unanswered row's ("recorded as not contested"), renders no control, and
`POST /client/__walk/exclusion` answers 409 naming the date and pointing at the note box. A
client-origin request resolved `withdrawn` carries `Put it back` on the walk page, on the client
index's closed list, and on the exclusion row it produced; the put-back reopens the note — clearing
`resolution` and `withdrawReason`, not only the status, or the derived row's source never reads as
gone — and the next `materialize` retires the derived row by the existing derivation. Confirming a
journey swaps the sign-off block to its confirmed render in place and answers in the message slot.
Both way-back controls render inline inside the sentence they belong to on the walk page, and as an
ordinary action button on the index's closed list, per the two approved mocks.

## The mocks command (2026-09-14, specs/20260914/01)

`/spec:mocks` drives a greenfield product's own Vite + React + shadcn app instead of gray HTML
wireframes (ADR-0028). `spec/scripts/mocks-driver.js` (`spec-paths mocks-driver`) derives
`SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED` on every run from three sources: disk
(`design/mocks/status.json`, schemaVersion 2), and the separate reviewer package's own
`mock-review check --json`, `design/notes.json` and `design/approval.json` — never a second,
hand-rolled read of any of the three. It writes only `design/mocks/status.json`
(`marks {seedDone, shellDrawn, themePicked, approved}`, `journeys {<id>: {drawn, approved}}`,
`reopens []`); a `schemaVersion: 1` file refuses outright (`remedy: rm design/mocks/status.json`
— no host holds data on the old path). SEED holds until `seedDone`; SHELL until `shellDrawn`;
SCREENS until every journey the seed's `### <journey>` blocks declare is both drawn and
approved (a journey added mid-SCREENS reopens the state); THEME until `themePicked`; CLIENT
until `approved`; then APPROVED. The driver prints exactly one step block (`Read only:` +
`Doctrine:` lines, plus `Skill: mock-authoring — load it before the first edit` at SHELL,
SCREENS and THEME), the provenance ledger's counts line and the checkpoint line on every
accepted mark, and gates every mark that used to run `gateVerdict` — `seed-done`,
`journey-approved`, `theme-picked`, `approved` — on the ledger exactly as before. `--reopen
journey:<j>|shell|theme` clears state, cascades (a shell reopen invalidates the theme and every
journey's approval; a re-picked theme invalidates every approval), and appends one `reopens` row
without deleting a file; `--reopen shapes|kit` refuses naming the retired state.

The contract between this plugin and the separate reviewer package is one file,
`spec/templates/mock/contract.json` (`spec-paths mock-contract`): `contractVersion`, the
package name and bin, the verb list (`contract`, `sweep`, `answer`, `check`, `serve`), the host
layout, and the JSON shapes of `notes.json`, `approval.json`, `decisions.json`, `check --json`
and `sweep --json` as required-key lists the driver validates by hand. `spec/scripts/lib/mock-
cli.js` is the sole caller of the package, spawning `mock-review <verb> …` with the app's own
`node_modules/.bin` prepended to PATH. A `contractVersion` mismatch between the installed
package and the template refuses (exit 2) naming both numbers with `remedy: npm i -D
@555/mock-review@<major>`; an unreachable `mock-review` refuses with `remedy: npm i -D
@555/mock-review`; a JSON verb's stdout failing the contract's shape check refuses naming the
verb and the missing key. Every refusal ends with `remedy: <command>`.

SEED prints, in order: `Read only: design/mocks/seed.md`; the scaffold command verbatim
(a `npx shadcn … init` invocation that creates the app subdirectory the driver tracks as
`status.app` and resolves every later host-app path through); the package install line; one
`cp` line per scaffold template (`mock.config.ts`, `src/journeys.ts`, and two example files
under `design/examples/` that sit outside every contract host glob so the reviewer never lists
them as a screen or a records file). `--mark seed-done` refuses on a `## Records` entity with no
matching `src/records/<entity>.ts` file, a missing `mock.config.ts`, or a contract refusal — it
never asks the user for data.

Retired verbs refuse (exit 2) naming their replacement: the old `notes`/`stop`/`theme
state|compose|shortlist`/`look`/`look-probe`/`look-via` verbs point at the package's own
`sweep`/`answer`/`check --look` commands and at authoring `src/themes/<k>.css` directly;
`--refresh-register`, `--mark kit-signed|shape-picked|canon-written`, `ledger derive` and
`client log` are retired outright. SHAPES and KIT no longer exist: stock shadcn is the kit, and
a single app's journeys already fix the structure a shape pick used to name.

CLIENT is a loop, not a one-way form (specs/20260911/04). A journey's state is derived from the
client's own requests, never stored — `lib/mocks-walk.js journeyState` returns `unseen | walking |
changes-requested | fixed | ok | waived`, and an open request outranks a stale confirmation by
construction, so a request on an OK'd journey takes the confirmation back into `journeys[j].history`
and the confirm route refuses 409 until nothing is open or awaiting the client's check. The client
accepts (`Looks good`) or reopens (`Still not right`, their words threaded onto the note) an
addressed request on the page, and takes back an open one with `Never mind`. The index is the
client's own view of the product: one card per walkable journey whose hero is a four-slot rail of
its screens rendered as the real mocks scaled down, a dot on the screen carrying a request, one
action whose verb follows the state, a `Something missing?` composer, and the client's request list
below. A journey is listed when its page exists, never when a session flag says so, so redrawing one
never takes it away from the client; a journey with no drawn page is absent, and the request that
asked for it is the acknowledgement. The player is two zones — the screens as a step indicator in
the bar, the mock framed as an object under its caption — and confirming is the last step of the
walk: on the final screen `Next` becomes `Confirm this journey` with the sign-off block in the
stage. The CLIENT step prints whether the server answers, one state line per journey, then `📥 what
the client left` with the one command that answers each item. The client server is the user's own
long-lived process — started once in their terminal, kept running until `approved`, never started
or stopped by a session. The 13 seed fact keys are closed (`primary-surface platforms-horizon tenancy offline
realtime ai-in-loop residency payer day-one-integrations scale-outage vendor-limits retention
legal-floor`), each mapped in `seed.md ## Facts` to a confirmed `product` ledger row. The
seed's six sections are Product · Facts · References · Records · Journeys · Dense screens
(specs/20260910/06, ADR-0013). Records carries one `- <entity>: records/<entity>.json` line
per entity, each path relative to `design/mocks/` and each file a JSON array of at least three
record objects, which the session derives from the seed's own Product and Facts,
`docs/design/research-brief.md` and anything under `design/mocks/references/` — never from the
user, who is asked for nothing here. `seed-done` refuses a missing section, a `- none` line, a
path that does not exist, does not parse, or is not an array, and fewer than three records,
naming the entity and that one derive-it remedy — and when a cold host derives no entity at all,
the remedy still prints with the literal `<entity>` placeholder. Dense screens carries one or two labels, each declared
in a journey — the pair every theme candidate is judged on; the singular `## Dense screen`
heading with one line continues to parse, so hosts already past SEED are untouched.
`journey-drawn` prints `⚠️ <label>: carries none of the seed's records` for every screen
carrying no record value and refuses a journey where no screen carries one — a settings screen
legitimately shows no record, a whole journey drawn on placeholders does not.
`spec/scripts/lib/mock-seed-checks.js`'s `recordValues`/`recordHits` are that one derivation. A screen also names the record it shows (specs/20260912/10, ADR-0023): an
element displaying a seeded value carries `data-record="<entity>[i].<field>"` pointing into
`design/mocks/records/<entity>.json`, the reference must resolve, and the element's visible text
must equal the resolved value exactly. A distinctive seed value — one containing a space or at
least eight characters long, occurring in exactly one record — shown outside every bound element
is refused; any other stray seed value is warned. The three rules warn at `journey-drawn` and
refuse at `journey-approved`, on the same bound-mock predicate the invention checks use, and the
older journey-level checks above are unchanged. Registers
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
`check` prints a running `ⓘ unabsorbed total: <n> across <m> screen(s)` after its CHECK
PASS/FAIL block on every run, and the per-screen `ⓘ <label>: <n> kit, <m> bespoke` breakdown
under `--verbose` (specs/20260912/14); advisory findings at `sketch` collapse to one
`⚠️ <n> warn(s) — --verbose to list` line, while violations always print in full. The rule still
warns at `sketch` and violates at `ratified`/`approved`/`--matrix`, and
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
artboards with state tabs · note inspector with `J K Esc \`; `stop open journey:<j>` points there;
the approve control mirrors the on-disk gate: a journey's approval is blocked by open notes
**on that journey's screens**, and
a whole-product note blocks the final `approved` sign-off instead of every journey (ADR-0019); when
a journey is clean and product-wide notes remain, the page says how many still block sign-off.
Plugin chrome — atlas, review page, galleries, notes layer — is authored under the frontend-design skill in the shadcn idiom on `viewer.css`'s
register (design.md § Design Canon), never on product tokens.

The atlas renders one frame per screen, with the declared state count in the card's meta line
(ADR-0016); every card's preview, screen or shape, links to that screen's own page,
`/screen/<label>.html`: one board with its state tabs and live notes layer, this screen's notes, the
whole-project notes and the composer. There is no lightbox and no link to a raw mock file;
`lib/review-page.js` exports `buildScreenPage` beside `buildReviewPage`.
Plugin chrome binds to a file: the atlas index answers to `design/chrome-mocks/atlas.html` and the
journey review page to `design/chrome-mocks/review.html`, cited as `design_source` by any spec that
edits them (specs/20260912/05, /06). The review page's rail carries a `Whole project` row for the
items that belong to no screen, and the server renders the same counts the page re-derives on load.

## Page notes (2026-09-03, specs/20260902/10)

Feedback on mocks is written on the served pages, never in chat and never in mock markup.
`design-atlas.js serve` injects a notes layer (`lib/notes-layer.browser.js`, on `viewer.css`'s
`--v-*` roles) into every served `.html` at serve time; `?clean` skips the injection and is what
the driver's look and the render gate's capture append. Notes live in `design/mocks/notes.json`
at two scopes — a mock note is anchored to a screen + state, a project note to the whole
product, never to an element — and are written only through `lib/mocks-notes.js`
(`readNotes`, `validateNotes`, `writeNotes`, `addNote`, `resolveNote`, `addressNote`,
`turnOf`, `groupOpen`, `unresolvedFor`). The server binds loopback only and exposes
`GET /__notes/notes.js|viewer.css|list?screen=<label>|*` and `POST /__notes/add|resolve`;
`address` is a driver-only file write (`mocks-driver.js notes open|address`),
never HTTP, so a page can never mark the session's work done. The loop is a conversation. The session answers with `notes address` (a fix or a question back)
and the note becomes the author's turn; the author replies on the page as often as they like and
the note becomes the session's turn again; the author ends it with Approve (`resolution:
"accepted"`) or Reject (`resolution: "withdrawn"`, final, hidden from the owner's pages and kept on
disk). `turnOf(n)` in `lib/mocks-notes.js` derives the turn — `session` red, `you` amber, `done`
green — and every per-note surface (box, badge, card, row, pin) uses it; count chips keep their
own colours. `notes open` lists only the notes whose turn is the session's (specs/20260913/05). Triage bins are a closed set — `mock detail`, `product understanding`,
`question back`, `propose to decline` — and a note that hits a canon primitive changes
`canon.md` first, every dependent screen after. Project notes outrank mock notes only at the
product's own sign-off: `approved` refuses while any project note is unresolved or any note
anywhere is unresolved; `journey-approved` refuses only while any note on that journey's own
screens is unresolved (`addressed` is not `resolved`) (ADR-0019). The client answers and
raises on the client route as the `CLIENT` state (specs/20260907/10, ADR-0012), on the clientâs own
pages rather than the session's review page. A note carries `origin: client|session`, set by the route it arrived on
(`/client/__notes/*` stamps `client`, `/__notes/*` stamps `session`) and never accepted from a body. A client's mock-scope note captures its screen at
raise through `lib/client-capture.js` — the look command's URL form and first-declared viewport,
`captures/<id>.before.png` beside `notes.json`, sha256 on the note; `notes address --port <n>`
re-captures and refuses when the hash is unchanged, else stores the after image and moves the
note to `addressed`. Only the client route resolves a client note — `withdrawn` from `open`,
`accepted` from `addressed` — and a session-route resolve is a 403. `notes waive --id
--reason` releases a client note after seven days of client silence. `writeNotes` is a tmp-file
rename, never an in-place overwrite. Zero unresolved notes on a journey is its
approval. The CLIENT step prints `Approval means "this is the product I understand" — the
written brief, not these screens, holds scope`. `/spec:atlas` and `/spec:sketch` route their annotation loops
through the same serve + `notes open`; the annotation-MCP discovery clause is retired.
`mocks-driver.js notes open` summarises what it would otherwise repeat (specs/20260912/14):
the journey-listed open notes stop after twenty with
a `… <n> more open note(s)` tail; `notes open --all` prints both in full. The open-notes counts line and the project-notes block are never summarised.

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
on a screen. `design-atlas.js`
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

**Only a person writes a note.** Every note in the store was typed by a person. Nothing in the
pipeline creates one; a note carrying `kind: "question"` or `kind: "walk"` is a record left by a
retired producer and is never listed, grouped, counted or gated on, though it stays on disk and
a stored `no` answer still derives its exclusion row. A free-form note carries no reason the
composer authored — an older note's `reason` still renders as a badge. The writer list is
`readNotes`, `validateNotes`, `writeNotes`, `addNote`, `authoredByPerson`, `resolveNote`,
`addressNote`, `turnOf`, `reopenNote`, `groupOpen`, `unresolvedFor`, `waiveNote`,
`replaceRegion`, `deleteNote`; the routes are `GET /__notes/notes.js|anchor.js|viewer.css|list`
and `POST /__notes/add|resolve|region|delete|reopen`.


**Client player (specs/20260910/03).** The client route serves the client's own two pages —
`/client/index.html` (every seed journey, how many of the session's guesses are still open on
each, which are confirmed) and `/client/walk/<j>.html` (one screen at a time in a frame), both
built by `lib/walk-page.js`'s two pure builders and driven by `lib/walk.browser.js`, served
verbatim at `GET /__walk/player.js`. The client advances by the mock's own `data-to` control;
every wrong click lands in `design/mocks/walk.json` as a miss and is never shown to them.
`lib/mocks-walk.js` is that file's one writer (`readWalk`, `writeWalk`, `recordEvent`,
`confirmJourney`, `waiveJourney`, `isClosed`); both event kinds stamp the journey's
`lastEventAt`, which is the waiver's silence clock. Approve unlocks only once the server's own
record shows the journey's last screen reached, stays disabled while any guess is open, and
records one typed sentence. Both halves are enforced twice: the page never advances its own
state ahead of a save — a mark hides, the open count drops, a note clears and a reached label
counts only on a response the server actually returned, and any refusal or network failure
leaves the page as it was and says so in `[data-wk="msg"]`. The player's own chrome is English for every client; the mocks inside
the frame stay in whatever language the client's product is written in, and everything the
client types — sentences, notes, reasons — is stored and re-rendered verbatim. A client's `no`
with a reason promotes to a `said-by-user` ledger
row; the session's own review page keeps today's behavior and is the session's surface only.
`--mark approved` refuses while any journey is neither confirmed nor waived
(`client waive --journey <j> --reason "<r>"`, after seven days), and `client log` prints each
journey's sentence or its reached count and misses. The client route never asks who they are.

## The marks layer's interaction core (2026-09-13, specs/20260913/02)

**The marks layer holds one mode at a time.** The region-note layer is in exactly one of
`idle`, `arming`, `drawing` or `composing`, written only through `setMode`. Entering
`composing` is how drawing ends, so no caller turns drawing off by hand. The drag binds on the
overlay and holds the pointer with `setPointerCapture` — never on `document`, never behind a
`closest()` guard, and never behind a click-swallowing shield: capture alone keeps the mock
underneath inert. Drag geometry clamps to the mock document's own box before it is captured,
because a region outside the document can never re-anchor.

**Affordances are derived from the mode, not written.** The overlay carries `data-mode` and
viewer.css derives cursor, pointer-events, touch-action and the marking scrim from it.

**Geometry scales with the board; chrome does not.** A framed board's marks are painted by the
frame's own layer and scale with it. The note card must not: the frame builds it in the host
page's document and hands it up with the box's frame-local coordinates, and the host — which
alone knows the board's scale — places it at full size beside the box, outside the clipping
shot. There is one card renderer, wherever the card lands.

**Selection is state and reveal is an effect.** The host page is the only writer of selection;
the framed layer emits intents up and receives state down. Scrolling a box into view and
pulsing it fire only when the selection came from somewhere other than that box, so clicking a
box never animates the box under the cursor. A data change reconciles the box layer by id; a
view-state change toggles one class. The layer is never rebuilt to move a highlight.
