---
date: 2026-09-10
status: hardened
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260910/03-client-journey-player.md, specs/20260910/06-real-records-and-two-dense-screens.md]
brief: 22a
open_markers: 0
---

# Every journey edge is a real control: `data-to` on the advancing element, refused at journey-drawn when missing, and a walk mode that reports where a click went

## Goal

ADR-0013 makes the client walk a journey by clicking the control that actually leads to the
next screen. Today a mock declares screens and states but nothing says which element goes
where, so no player can advance on a real click and no check can tell a drawn journey from a
pile of screens. This spec adds the declaration (`data-to="<label>"` on the advancing control),
refuses `journey-drawn` while any seed edge lacks one or any `data-to` names an undeclared
screen, and serves a mock in walk mode (`?walk`) so a click inside the frame reports "advanced
to X" or "missed on Y" to the page that embeds it. Done means a journey cannot be marked drawn
until it is clickable end to end, and a served mock can tell its embedder where a click went.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The advancing control is declared in the mock: the element whose click leads to the next screen carries `data-to="<label>"` where `<label>` is a screen declared in any seed journey. One screen may carry several (a hub screen with three exits). `spec/scripts/lib/mock-seed-checks.js` exports `edgeGaps(journey, readHtml)`: for a journey `{labels, edges}` it returns `{missing: [{from, to}], unknown: [{from, to}]}` — `missing` is every seed edge `from -> to` whose `from` mock carries no `data-to="to"` inside its `[data-screen-label]` root; `unknown` is every `data-to` on a journey screen naming a label no seed journey declares (AC-20260910-02-1) | The seed already draws the edges; the mock is the only place that knows which control is the edge. A `data-to` is an attribute, not a link — a wireframe never carries an `href` to another mock |
| D2 | `journey-drawn --journey <j>` refuses, after the per-label checks and before `check --states`, when `edgeGaps` returns any `missing` or `unknown` entry — one line per gap: `<from>.html: no control carries data-to="<to>" — the seed edge <from> -> <to> has no clickable path; add data-to="<to>" to the control that leads there` and `<from>.html: data-to="<x>" names a screen no journey declares`, then `re-mark journey-drawn --journey <j>`. The edges come from `lib/surfaces.js`'s `parseSeedJourneys` (AC-20260910-02-2) | A journey that cannot be clicked through is not drawn; refusing at the mark is the same door `check --states` uses |
| D3 | Walk mode: `GET /mocks/<label>.html?walk` injects `<script src="<prefix>/__walk/walk.js"></script>` before the last `</body>` (the `stateClickScript` placement rule, after the state script when both are present), and `GET /__walk/walk.js` serves `spec/scripts/lib/walk-mode.browser.js` verbatim, `no-store`. `?walk` composes with `?clean` and `?state=`; `?clean` strips the notes layer but never the walk script (AC-20260910-02-3) | One mechanism, two entry points, as `?state=` already does; a separate file so the script is testable under `vm` the way `review.browser.js` is |
| D4 | `walk-mode.browser.js`, on load, reads the screen label from the first `[data-screen-label]` and installs one capture-phase `click` listener on `document`: a click whose target is inside a `[data-to]` calls `preventDefault()` and posts `{walk: "to", from: <label>, to: <data-to>}` to `window.parent` with `location.origin` as the target origin; any other click posts `{walk: "miss", from: <label>, target: <descriptor>}` where `descriptor` is the clicked element's lowercase tag name, `#id` when it has one, and its trimmed `textContent` cut to 40 characters, joined by a space. A click inside `[data-state-btn]` or `[data-contract="none"]` posts nothing (state switchers are tooling). When `window.parent === window` the script installs nothing (AC-20260910-02-4) | The embedder — spec 03's player — is the only reader; the descriptor is what the session needs to see where the client went wrong, and it is never shown to the client |
| D5 | `spec/doctrine/mocks.md` § Mocks: Authoring Rules gains **Every edge is a real control** (the `data-to` rule, refused at `journey-drawn`), § Mocks: Look and Serve names `?walk`; `spec/commands/mocks.md`'s WIREFRAMES step tells the authoring session to put `data-to` on the advancing control; `spec/templates/mocks-seed.md`'s `## Journeys` comment names it (AC-20260910-02-5) | Doctrine binding home; the command is where the authoring session reads it |
| D6 | Every test that marks `journey-drawn` or a later mark over an inline mock (one written in the test file, not through `writeWireframe`) gains `data-to` on that mock for the seed's outgoing edge where the test expects the mark to accept; `writeWireframe` in the fixtures gains `data-to` for the journey's next label by default (`opts.to`), so every `advanceTo*` helper keeps passing. A test asserting an earlier refusal (a missing wire link, a wrong label) is untouched — the edge check runs after those (AC-20260910-02-6, AC-20260910-02-7) | The fixture repair the collision closure listed, planned now; never a weakened gate |
| D7 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D8 | `size-baseline.json` is raised for `spec/scripts/mocks-driver.js`, `spec/scripts/design-atlas.js` and the `spec/scripts` tree by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/02-click-to-advance-and-real-records.md` at build close [no-ac: the ratchet's own live test is the oracle] | Both entry points sit at their ceilings; the new gate is the mechanism paying its size |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mock-seed-checks.js | CREATE | scripts | D1 `edgeGaps` — pure, no `fs` |
| spec/scripts/lib/walk-mode.browser.js | CREATE | scripts | D4 the injected walk script |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2 edge refusal at `journey-drawn`, edges via `surfaces.js` |
| spec/scripts/design-atlas.js | MODIFY | scripts | D3 `?walk` injection, `GET /__walk/walk.js`, usage header |
| spec/templates/mocks-seed.md | MODIFY | doctrine | D5 `## Journeys` comment names `data-to` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D5 authoring rule, `?walk` |
| spec/commands/mocks.md | MODIFY | doctrine | D5 WIREFRAMES step line |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 bump |
| size-baseline.json | MODIFY | other | D8 raise, cited to this spec |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D6 `writeWireframe` gains `data-to` (`opts.to`, default = the journey's next label) |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | D6 inline mocks gain `data-to` |
| tests/mocks/mocks-driver-4.test.js | MODIFY | tests | D6 inline mocks gain `data-to` |
| tests/mocks/mocks-driver-look-stops.test.js | MODIFY | tests | D6 inline mocks gain `data-to` |
| tests/mocks/mocks-driver-look-stops-2.test.js | MODIFY | tests | D6 inline mocks gain `data-to` |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | D6 inline mocks gain `data-to` |
| tests/mocks/mocks-driver-wire.test.js | MODIFY | tests | D6 inline mocks that expect acceptance gain `data-to` |
| tests/consistency/wire-register.test.js | MODIFY | tests | D6 inline mocks that expect acceptance gain `data-to` |
| tests/mocks/mock-edges.test.js | CREATE | tests | AC-20260910-02-1, AC-20260910-02-2, AC-20260910-02-6, AC-20260910-02-7 |
| tests/mocks/walk-mode.test.js | CREATE | tests | AC-20260910-02-3, AC-20260910-02-4 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260910-02-5 |

## Contracts

```html
<!-- D1: the advancing control. Any element; the value is a declared screen label. -->
<button class="btn primary" data-to="invite">Send invite</button>
<a class="list-item" data-to="session-live">Aoi Tanaka · today 14:00</a>
```

```js
// D1: spec/scripts/lib/mock-seed-checks.js
edgeGaps({ labels: ['signin','invite'], edges: [['signin','invite']] }, (label) => html)
// → { missing: [{from:'signin', to:'invite'}], unknown: [{from:'signin', to:'nowhere'}] }
```

```js
// D4: messages posted to window.parent by walk-mode.browser.js (targetOrigin = location.origin)
{ walk: 'to',   from: 'signin', to: 'invite' }
{ walk: 'miss', from: 'signin', target: 'button#help Need help?' }
```

## Behavior

The authoring session draws a screen exactly as before, then marks the control that leads
onward with `data-to`. `journey-drawn` runs the same per-label checks it runs today, then
compares the seed's edges against the mocks: every edge needs one control and every control
must point at a declared screen. Refusals name the edge and the remedy.

A page that embeds a mock (spec 03's player) loads it with `?clean&walk`. Inside the frame a
click on an element carrying `data-to` is swallowed and reported upward as `to`; any other
click is reported as `miss` with a short description of what was clicked. State switcher
buttons are ignored. A mock opened directly in a tab behaves as it always has: with no parent
frame the script does nothing.

## Acceptance Criteria

- **AC-20260910-02-1**: WHEN `edgeGaps({labels:['a','b','c'], edges:[['a','b'],['b','c']]}, read)` runs with `a.html` containing `<button data-to="b">` and `<a data-to="zzz">` inside its root, `b.html` containing no `data-to` THE SYSTEM SHALL return `{missing:[{from:'b',to:'c'}], unknown:[{from:'a',to:'zzz'}]}`; with every edge covered `{missing:[], unknown:[]}`; a `data-to` outside the `[data-screen-label]` root SHALL count as absent → `tests/mocks/mock-edges.test.js`
- **AC-20260910-02-2**: WHEN `--mark journey-drawn --journey onboarding` runs over a seed edge `signin -> invite` and `signin.html` carries no `data-to="invite"` THE SYSTEM SHALL exit 2 with stderr containing `signin.html: no control carries data-to="invite"` and `re-mark journey-drawn --journey onboarding`, and SHALL leave `status.journeys.onboarding` absent; with `data-to="nowhere"` added it SHALL exit 2 with `data-to="nowhere" names a screen no journey declares`; with `data-to="invite"` it SHALL accept → `tests/mocks/mock-edges.test.js`
- **AC-20260910-02-3**: WHEN `GET /mocks/signin.html?clean&walk` is served THE SYSTEM SHALL respond 200 with a body carrying `<script src="/__walk/walk.js"></script>` before the last `</body>`, no `notes-scope` meta, and (with `&state=error`) the state click script before the walk script; `GET /mocks/signin.html?clean` SHALL carry no `/__walk/walk.js`; `GET /__walk/walk.js` SHALL respond 200 with `spec/scripts/lib/walk-mode.browser.js` byte-verbatim and `Cache-Control: no-store` → `tests/mocks/walk-mode.test.js`
- **AC-20260910-02-4**: WHEN `walk-mode.browser.js` is evaluated under `vm` against a stub document whose root carries `data-screen-label="signin"` and a stub `window.parent` recording `postMessage` calls THE SYSTEM SHALL, on a click inside `<button data-to="invite">`, call `preventDefault` and post `{walk:'to', from:'signin', to:'invite'}` with the stub `location.origin`; on a click on `<button id="help">Need help?</button>` post `{walk:'miss', from:'signin', target:'button#help Need help?'}`; on a click inside `[data-state-btn]` post nothing; and with `window.parent === window` install no listener → `tests/mocks/walk-mode.test.js`
- **AC-20260910-02-5**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry, under `## Mocks: Authoring Rules`, the bold rule name `Every edge is a real control`, and under `## Mocks: Look and Serve` the literal `?walk`; `spec/commands/mocks.md` and `spec/templates/mocks-seed.md` SHALL each carry `data-to` → `tests/consistency/design-doctrine.test.js`
- **AC-20260910-02-6**: WHEN `writeWireframe(dir, 'signin', { to: 'invite' })` runs THE SYSTEM SHALL write a mock whose root contains `data-to="invite"` → `tests/mocks/mock-edges.test.js`
- **AC-20260910-02-7**: WHEN the fixtures' `advanceToJourneyApproved` runs over the default fixture journey THE SYSTEM SHALL CONTINUE TO accept `journey-drawn` and `journey-approved` → `tests/mocks/mock-edges.test.js`

## Assumptions (escalation triggers)

- A1: `lib/surfaces.js`'s `parseSeedJourneys` returns `edges` per journey (read at plan: `{persona, labels, edges}`), so the driver reads edges through it and `mocks-driver.js`'s own `parseJourneysSeed` stays labels-only — **if false:** extend `parseJourneysSeed` to collect edges in the same pass.
- A2: The seven test files in the File Plan are every non-fixture caller that marks `journey-drawn` or later over an inline mock and expects acceptance (grepped at plan: `journey-drawn`/`journey-approved` callers minus fixture users) — **if false** (an eighth surfaces at build): add `data-to` to that test's inline mock in the same batch; never weaken the gate.
- A3: `?clean` strips the notes layer by not injecting it, so the walk script needs no strip step — **if false:** add the walk script after `stripCleanArtifacts` runs.
- A4: The chrome harness is not needed: the served-HTML claims are string tests over `createRequestHandler`, and the script's behavior is a `vm` test with a stub DOM (the pattern `tests/design-atlas.test.js` uses for `review.browser.js`) — **if false:** the AC-4 test moves under the `[env: CHROME_BIN]` gate.

## Rationale

The edge lives in the mock, not the seed, because the seed is names and arrows and already
draws the edge; only the mock knows which control is the arrow. `data-to` is an attribute rather
than an `href` so a wireframe stays a wireframe — nothing navigates on disk, only a served
embedder interprets it. The check runs at `journey-drawn` and not at `check` because it needs
the seed's edges; `check` is file-scoped by design.

The refusal runs after the per-label checks so every test that pins an earlier refusal (a wrong
label, a missing wire link, an off-token color) is untouched; only tests that expect a drawn
journey to be accepted need the attribute, and the collision closure at lock listed them — they
are File Plan rows, not a waive. The records requirement and the two dense screens were split
out to specs/20260910/06 so each spec repairs one fixture family.

Collision closure at lock: the `executes` hits on `design-atlas.js` (serve-port, atlas, shell,
client-route, chrome-harness tests) observe routes this spec does not touch — `?walk` and
`/__walk/walk.js` are new — so nothing they assert changes; the `executes` hits on
`mocks-driver.js` are the inline-mock callers already entered as File Plan rows plus fixture users
covered by the fixtures row.

Rejected: putting the advancing control in the seed as an `advances-on: <selector>` line (the
candidate-flows draft's shape) — a selector in markdown drifts from the markup the moment a class
is renamed, and the mock is the thing being authored anyway.

## Canonical Delta

`docs/canonical/design.md` § Mocks gains: a mock's advancing control carries `data-to="<label>"`;
`journey-drawn` refuses a seed edge with no such control or a `data-to` naming an undeclared
screen (`lib/mock-seed-checks.js` `edgeGaps`). `GET /mocks/<label>.html?walk` injects
`/__walk/walk.js` (`lib/walk-mode.browser.js`), which reports `{walk:'to'|'miss'}` to the parent
frame and nothing when there is no parent.
