---
description: Mocks-stage supplement to the spec pipeline's shared invariants — the provenance ledger grammar and gate, read by the mocks driver and question-style-gate.js, not a workflow entry point
---

# Spec Pipeline: Mocks-Stage Supplement

Mocks-stage supplement — read by the mocks driver (spec 07) in addition to `core.md`.

## Provenance Ledger

The ledger is one markdown file, `design/mocks/ledger.md`, two tables in fixed columns,
parsed and written by `spec/scripts/lib/mocks-ledger.js` (`parseLedger`, `gateVerdict`,
`countsLine`, `appendAssumption`, `appendCatch`, `setStatus`) — that library is the **one
writer**: a session (or a script outside it) hand-typing a row is the class that put malformed
rows into the escape ledger, and every row it writes leaves every other byte in the file
identical.

**Assumptions** table — `id · step · kind · claim · tag · status · rejected · dependents ·
note`:

- `id` — `^[A-Z]+\d+[a-z]?$`, unique across the table.
- `step` — `^[A-Z][A-Z-]*$` (`SEED`, `SHAPES`, `WIREFRAMES`, `THEME`, `SKIN`, `REVIEW`,
  `GENESIS`, …).
- `kind` — one fixed word: `product` or `process`.
- `claim` — free text; the assumption itself.
- `tag` — one fixed word: `said-by-user`, `ratified-doc`, `inferred`, or `invented`.
- `status` — one fixed word `open | confirmed | overridden | decided`, with an optional
  trailing ISO date (`confirmed YYYY-MM-DD`); `decided` is process-only — a `decided`
  `product` row does not parse.
- `rejected`, `dependents`, `note` — free text; `-` means empty.

**Misunderstandings** table — `id · what · step · cost · note`: `id` is `^M\d+$`, unique;
`note` names an originating note id or `-`.

Free text lives only in `claim`, `rejected`, and `note`. A literal pipe inside any cell is
written escaped (`\|`) and read back unescaped — every other cell is one fixed word, never
prose, so a script can gate on it without parsing English.

**Gate rule.** A ledger is **blocked** when any `product` row carries tag `invented` with
status other than `overridden`, or tag `inferred` with status `open`. `ratified-doc` rows and
every `process` row never block — a fact the user ratified as prose stays counted separately
and is re-tested on the screen that renders it, never re-asked as a question. A ledger that
fails to parse never opens a gate (parse errors are reported, not silently passed).

**Counts line.** Every mark prints one fixed line:

```
📒 ledger: {S} said-by-user · {R} ratified-doc · {I} inferred ({Io} open) · {V} invented ({Vo} open) · {P} process · {C} catches
```

counting product rows per tag, every process row in one bucket, and misunderstanding rows as
catches. The shape is fixed so a reader learns it once — change it only under the spec that
owns it.

## Mocks: State Machine

`mocks-driver.js` derives the current state on every invocation from
`design/mocks/status.json` plus the artifacts on disk — a recorded mark is never trusted
alone; if its artifact vanished (a journey's screen deleted, a direction's tokens file
removed) the derivation lands earlier and demands the mark again. The order is fixed: **SEED**
(the 13 facts, journeys, dense screen, research brief) → **SHAPES** (one shape kebab picked
from 2–3 candidates) → **WIREFRAMES** (canon written, then every seed journey drawn and
approved) → **THEME** (≥2 directions composed, one picked) → **SKIN** (every journey skinned
to the picked theme) → **REVIEW** (a named decider, every journey reviewed) → **APPROVED**
(terminal). WIREFRAMES, THEME, and SKIN each carry a sub-mark per journey or direction so no
single conversation ever has to hold more than one journey's state — a seed journey added
mid-WIREFRAMES reappears as `0/N drawn` and reopens the state rather than silently completing.

**The gate rides every advancing mark.** `seed-done`, `shape-picked`, `canon-written`,
`journey-approved`, `theme-picked`, `journey-skinned`, `journey-reviewed`, and `approved` each
run the provenance ledger's `gateVerdict` (§ Provenance Ledger) before recording; a blocked
gate refuses (exit 2) naming the offending rows and the remedy (`ledger set --id <id> --status
confirmed --tag said-by-user`, or `--status overridden`). `journey-drawn` and
`direction-composed` run no gate — drawing and composing are how open questions get found, not
resolved. Process rows never surface as something to resolve; they are counted, not asked.

**Reopening never deletes.** `--reopen journey:<j>` clears that journey's
approved/skinned/reviewed marks (and the terminal `approved`); `--reopen shapes` clears the
shape pick and every downstream mark; `--reopen theme` clears the theme pick, every
skinned/reviewed mark, and `approved`. Every reopen appends one row to `status.reopens` naming
what it invalidated and leaves every file on disk byte-identical — the next derivation lands on
the earliest state whose marks are now missing.

## Mocks: Seed

SEED is the one state where facts are established, not drawn — screens exist only after
`primary-surface` and `platforms-horizon` (the framework lesson: know the surface and the
device horizon before a pixel). The seed closes on 13 keys, each naming a `confirmed` product
row in the ledger: `primary-surface platforms-horizon tenancy offline realtime ai-in-loop
residency payer day-one-integrations scale-outage vendor-limits retention legal-floor`.
`retention` and `legal-floor` generalize the two facts that caught real misunderstandings in
the dry run (audio-retention limits; a regulation constraining a core mechanic) — every product
has some data lifetime and some regulatory floor worth naming even when the answer is "none".

`design/mocks/seed.md` (template `spec/templates/mocks-seed.md`) carries five sections in
order: `## Product` (three sentences — what it is, who it is for, the one job), `## Facts`
(one `- <key>: <ledger id>` line per key above, each id `confirmed`), `## References` (a path,
URL, or `- none`; anything under `design/mocks/references/` is picked up automatically),
`## Journeys` (one `### <journey-kebab>` per journey, a persona line, and one fenced
` ```surfaces ``` ` block in the roadmap-brief grammar — names and arrows only, one line per
edge, every label declared in exactly one journey), and `## Dense screen` (one label already
declared in a journey — the screen most representative of the product's real complexity, the
one theme directions must survive). `design/targets.json` must parse with non-empty
`themes`/`viewports`; `docs/design/research-brief.md` must exist and be non-empty (authored via
genesis.md § Genesis: Fresh UX Research — the method is fixed there, this command only names
the step). Journeys exist before the first screen because no roadmap exists yet to derive them
from; the same surfaces grammar lets the atlas render journeys today and a later spec derive
roadmap briefs from them.

## Mocks: Checkpoint contract

Every state opens with exactly one step, `Read only:` naming the files this step needs and
nothing else, and a `Doctrine:` line naming the `## ` section of this file governing the
judgment — the genesis checkpoint contract verbatim (specs/20260825/04 D9), because a driver
loop across many `/clear`s only survives if the session never has to hold more state in
context than the current step. An accepted `--mark` prints, as its last two non-blank lines,
the ledger's counts line (§ Provenance Ledger) and:

```
✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks
```

`<prev>`/`<next>` are the derived state names, identical when a sub-mark (a journey, a
direction) advances without changing the top-level state. This line is the sole signal that
disk, not chat context, is now the source of truth — a session may `/clear` immediately after
reading it and re-invoke `/spec:mocks` cold with nothing lost. `--state` is a read-only peek:
it prints only the derived state name, never writes `status.json` beyond first-run creation,
and never runs the look-reachability probe (§ Mocks: Look and Serve) — it exists so a session
recovering from a `/clear` can check where it left off before doing anything.

## Mocks: Look and Serve

Every mock is a static file; nothing requires a running app. `design-atlas.js serve [--root
<r>] [--port <n>]` serves `<root>/design/` read-only with no cache (`cache-control: no-store`,
path traversal outside the root answers 404) and its first stdout line is always the
port-forward instruction: `serving http://localhost:<port>/atlas/index.html — remote: ssh -L
<port>:localhost:<port> <host>` — the client's access path is the forwarded port only, never an
export or a hosted copy. The server exits cleanly on SIGINT/SIGTERM.

**The session's own look** is `mocks-driver.js look <label> [--state <s>] [--out <png>]`: it
writes a sibling `.look-<label>.html` (the mock plus an inline script that clicks
`[data-state-btn="<s>"]` on load when `--state` is given), captures it with the Playwright CLI
at the first declared viewport in `design/targets.json`, and deletes the sibling in a `finally`
— the repo never accumulates look scratch files. `look-probe` exits 0 exactly when `npx
--no-install playwright --version` exits 0; this is the reachability signal because
`require.resolve('playwright')` does not resolve from a host repo even when the CLI works.

**Reachability is a precondition, not an afterthought.** Before printing SHAPES, WIREFRAMES,
THEME, or SKIN — every state that asks the session to look at a screen — the driver runs the
look probe unless `status.look` is already `"browser"`; a failed probe refuses (exit 2) naming
`npx playwright install chromium` rather than silently proceeding into a state no one can
verify. `mocks-driver.js look-via <playwright|browser>` records the session's declared path:
`browser` means a browser MCP the command told the session to `ToolSearch` for, which cannot be
probed from a script and so is declared once and trusted thereafter.

## Mocks: Authoring Rules

The six rules the dry run converged on (LEDGER standing rules + M11/M13/M14 + A6/A7) — the
half the driver cannot check, carried here as contract prose the authoring session applies:

- **Wireframes are gray but carry every graphic that IS structure.** A state is shown as the
  product's map or a slice, never described in a caption; text is reserved for what someone
  actually said (copy, labels), never for narrating what a picture should be doing instead.
- **One honest wireframe or the full theme, never a half-styled middle.** A screen is either
  the flat gray register at full structural honesty or the themed register at production
  fidelity — a screen half-dressed in theme colors while its neighbors stay gray is neither
  register and misleads a reviewer about what has actually been judged.
- **Theme = recompose, never repaint.** A theme direction is composed to recompose each
  approved wireframe screen at production fidelity on that screen's own structure and facts,
  never freehand — across ≥3 screens per direction (the densest screen included) and
  ≥2 directions; every direction is judged on the dense screen first, because a direction that
  only survives on simple screens has not been tested.
- **AI-reworded text stays gray until confirmed.** Copy the model rewrote or invented reads as
  visibly provisional (the gray/unconfirmed treatment) until a human confirms it — a themed
  screen never launders invented copy into something that reads as final.
- **A persistent recording indicator on any capture surface.** Any screen whose product
  purpose includes recording (audio, video, screen) shows a persistent, undismissable
  indicator while active — never a state a wireframe or theme omits as an implementation
  detail.
- **Equal-weight verdict controls survive every theme.** Where a screen offers a binary or
  multi-way verdict (approve/reject, accept/decline), every theme direction keeps the options
  visually equal-weight — no direction may imply an outcome by making one option louder than
  its alternatives.
- **A new primitive names the nearest existing one and why it fails.** Before authoring a
  primitive not already in the component vocabulary, the authoring pass names the nearest
  existing entry and states specifically why it does not fit — silence is a gate failure, the
  same bar § Design Authoring Contracts sets for the built-code side.

## Product-Stage Exemption (question-style-gate.js)

While a mocks run is live (`design/mocks/status.json` exists with `state` other than
`APPROVED`) or a genesis run is live (`.claude/genesis/status.json` exists with `handoff`
null), the question-style gate's tier-2 judge cannot return `derive` — that verdict is treated
as `pass` instead. Every question inside those windows is a user decision by construction
(coverage keys, menu picks, product facts), so `derive` has no legitimate target there;
`rewrite` verdicts and every tier-1 check are unchanged. The judge's prompt states the rule
that makes this exemption necessary: a document that cites, discusses, or recommends a
subject is never the user deciding it, and a product fact (who, what, platform, payer,
tenancy, what a screen does) is never `"derive"` — ask it. The exemption reads both status
files on every hook invocation and fails open toward the pre-exemption behavior — a missing or
unparsable status file counts as absent, never as a reason to block.
