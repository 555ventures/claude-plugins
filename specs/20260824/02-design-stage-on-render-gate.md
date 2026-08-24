---
date: 2026-08-24
status: implementing
tier: critical           # removes spec-paths keys (key-set edit — critical trigger per .claude/rules/spec-pipeline.md § Risk Tiers, precedent specs/20260823/01) and retires spec-design-driver.js, the state machine behind a pipeline stage
area: design-stage
design: false
diff_base: 592e4728e4ae2251ffb144e62f7c719cbe001275
breaking: false
depends_on: [specs/20260824/01-render-gate.md]
depended_on_by: [specs/20260824/03-mock-states-hygiene.md]
brief: 08
open_markers: 0
---

# Design stage on the render gate — thin `/spec:design`, feed retired

## Goal

Rebuild `/spec:design`'s body on the render gate: transcription workers (one warm Sonnet per
surface, the mock HTML in context, the component manifest as canon) behind the host gate and
the render gate, your Storybook look kept as a blocking step after the gates, one reconcile,
the `designed:` stamp. The state-machine driver, the `wf-design` workflow, the skeleton binding
map and its checker, the `.design/` sidecar's driver-side lifecycle, the Haiku match pass, the
Fable retainer, the vision consult, and the `ITERATE` catalog loop go with it. Done means: a
fresh session runs `/spec:design` on a hardened UI spec in a host that declares `design.render`
and reaches `designed:` through gates it can observe, with every step re-derivable from disk.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The command body is six steps, in order: **preflight** → **author** (direct dispatch) → **host gate** → **render gate** → **your look** (blocking) → **reconcile + stamp**; step position is derived from disk on every invocation (Behavior), never from a state file or a driver [no-ac: prose contract; the deterministic pieces are the scripts pinned in spec 01 and the entrypoints guard] | Brief Scope 5; the driver's 561 lines existed to sequence extract/skeleton/workflow/iterate — none of which survives |
| D2 | `spec-design-driver.js`, `wf-design.js`, and `skeletons-check.js` are deleted with their tests; their `spec-paths` keys (`design-driver`, `wf-design`, `skeletons-check`) and `entrypoints.json` rows go with them (AC-20260824-02-1) | `skeletons-check`'s sole entrypoint is the driver; a key that resolves to nothing "breaks commands silently" (§ Risk Tiers) — keys of deleted scripts are not part of the frozen surface, which is the config keys and `designed:` |
| D3 | Preflight: `spec-paths shared-for design`; config + rules; `design.render` declared (else STOP printing the exact JSON to add — spec 01 Contracts); env-preflight (exit 1 → STOP, output verbatim); spec `hardened` (hook); `design_source` resolves to mock file(s) whose `data-status` is `ratified` or `approved` (else STOP: `/spec:sketch <brief>` for roadmap briefs, the preamble D10 for standalone specs); `node <atlas> check <mocks>` fail-closed; `components-check` advisory; derive surfaces (labels) and states (`data-state-btn` values, D11 of spec 01) (AC-20260824-02-2) | Every precondition is observable on disk; the STOP remedies are the exact next command |
| D4 | Author: one `Agent {model: "sonnet"}` per surface, sequential when surfaces share chrome (same mock family), else parallel; agent type = the host `agentMap` entry for the layer whose `routing` globs match the component directory the spec's UI section names, else `agentMap.default`; inputs are **paths only** — spec, mock file, `design/tokens.css`, the doctrine doc, `design/components.json`, `design/targets.json`, the states list, `design.storyFormat` — and the worker returns receipts: files touched, components bound vs authored (with the nearest-manifest justification per `author`), and one story id per state [no-ac: dispatch prose; receipts are consumed by D6] | The mock in context IS the binding map — the skeleton was a paraphrase hop; paths-not-prose per core § Model Placement |
| D5 | Story rule: the story bound to a state renders exactly the values the mock illustrates for that state (JJ ruling 2026-08-24 — the mock's values are the source); a story exercising extra branches is a separate, unbound story; the render gate is the drift detector and its `text-missing`/`text-extra` findings name the story to fix [no-ac: the finding is pinned by spec 01 AC-1; the rule is worker doctrine] | prax #4: fixture richer than the mock broke matching by construction; one rule, no fixture runtime |
| D6 | After a green author round the session writes the story ids into the coverage ledger claim (`stories`, spec 01 D10) and the claim's `spec`/`at`; the ledger is checkpoint-committed with the components [no-ac: ledger write is the session's git-owned duty; shape pinned by spec 01 AC-8/AC-10] | The gate reads bindings from the ledger; the session owns git |
| D7 | Host gate = `design.gateCommand` when declared, else the host `gateCommand` with `{testDirs}` substituted by the directories the author touched (the same substitution `/spec:build` applies); red → re-dispatch the surface's worker with the gate output path, at most 3 rounds, then STOP [no-ac: prose; both host gates were read 2026-08-24 — neither carries a placeholder] | The driver's leg-splitting derivation dies with it; build's substitution is the one shared rule |
| D8 | Render gate: `node "$(spec-paths render-gate)" --spec <spec>`; exit 1 → re-dispatch the failing surface's worker with the report path (findings are the instruction), at most 3 rounds, then STOP with the report; exit 2/3 → STOP printing the script's remedy verbatim, never a stamp [no-ac: the script's exits are pinned by spec 01 AC-7/10/11/12] | Fail-closed at the gate (brief Scope 1); a capture failure is never green |
| D9 | Your look is kept and blocking (JJ ruling 2026-08-24): after both gates are green the session prints the catalog command (`design.command`), the story ids, and the gate report path, then `AskUserQuestion` — approve (Recommended, the gates already measured what a human cannot overlay) / change (free-text notes) — a change round is one Sonnet edit dispatch per affected surface, then D7 + D8 again, then the question again; the session is cold between rounds (state on disk) [no-ac: question prose; the question-style hook gates its wording] | 38-spec measurement counted recorded rounds, not looks; JJ checks Storybook every time and the gate makes that look sharper, not redundant |
| D10 | No `design_source` (standalone spec, no brief): a five-line preamble — author `design/mocks/<label>.html` under the harness check (draft framing, then the expansion pass, `check --matrix`), stamp `data-status="approved"`, persist `design_source`, continue at preflight; roadmap specs never take this path (`/spec:sketch` owns their mocks) [no-ac: prose] | A standalone UI spec must not strand; the matrix stamp semantics follow spec 03's ratified≡approved rule |
| D11 | Reconcile: extend `design/components.json` with every component created or newly bound (`name`, `purpose`, `props`, `mockRefs`, `authorJustification` verbatim from the receipt); one Sonnet dispatch updates the spec's UI section to the final component APIs and states and folds every excused role line into a Decision row; then `designed: YYYY-MM-DD`; checkpoint commit (spec, ledger, manifest, components, stories) [no-ac: prose; `components-check` guards the manifest shape] | The manifest is the durable carrier now that no sidecar exists; the spec enters build with the design's authority |
| D12 | A mock region that needs an absent base primitive (Sheet/Dialog/Popover/Drawer/AppShell/Toast host) is a fork: the worker returns `blocked {kind: "design-fork"}`, the session asks (author as foundation, Recommended when no near-match / reuse the near-match), never a per-surface improvisation [no-ac: worker contract prose carried from design.md § Design Authoring Contracts] | Unchanged rule, restated in the thin command so workers see it |
| D13 | The `.design/` sidecar is not created by this command; existing host sidecars are inert (gitignored) and are deleted by the host's next `/spec:doctor --fix` run, not by this spec [no-ac: absence] | Never a mass delete inside a host's tree from a plugin command |
| D14 | `spec/doctrine/design.md` § Workflows Encode Shape, Not Judgment loses its `wf-design.js` naming and its "planned component authoring DOES enter the workflow" paragraph (design authoring is direct dispatch now — the inversion build/review got); the rest of the doctrine waits for spec 05 [no-ac: prose edit; spec 05 rewrites the file] | A doctrine sentence naming a deleted file is a stale reference doctor would flag |
| D15 | `spec/commands/design.md` names `env-preflight` before the author dispatch step with STOP-on-miss semantics (AC-20260824-02-3) | Carries AC-20260815-05-8's incident (unprovisioned environment entering a gate-repair loop) onto the new body |
| D16 | Regression pins: `spec-status.js` continues to route `hardened` + `design: true` without `designed:` to `/spec:design` and never back once stamped (AC-20260824-02-4); the state gate continues to require `hardened` for `/spec:design` (AC-20260824-02-5); the frontmatter routing sweep continues over the three surviving scripts (AC-20260824-02-6) | The frozen v7.0 surface must be observed unchanged by tests, not assumed |
| D17 | New-surface checklist: plugin.json bump to next free 7.32.x with changelog; `entrypoints.json` rows for `components-check.js`, `design-atlas.js`, `env-preflight.js`, `report-render.js` keep `spec/commands/design.md` as an entrypoint (the new body invokes each) [no-ac: entrypoints + plugin-version guards] | The guards fail the suite if any item is skipped |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/design.md | MODIFY | doctrine | Full rewrite: frontmatter kept (`description` updated, `argument-hint: <spec path>`), the six-step body (D1, D3–D12), disk-derived resume (Behavior), report slots |
| spec/doctrine/design.md | MODIFY | doctrine | § Workflows Encode Shape, Not Judgment: drop `wf-design.js` naming + the component-authoring-enters-the-workflow paragraph (D14) — no other section touched |
| spec/bin/spec-paths | MODIFY | scripts | Remove keys `design-driver`, `wf-design`, `skeletons-check` and their usage-line entries (D2) |
| spec/entrypoints.json | MODIFY | scripts | Drop rows for the three deleted files; update `components-check.js`/`dc-extract.js`/`fidelity-check.js` rows to drop the driver entrypoint (D2, D17) |
| spec/scripts/lib/host-config.js | MODIFY | scripts | Header comment: replace the `spec-design-driver.js` example with `render-gate.js` |
| spec/scripts/lib/frontmatter.js | MODIFY | scripts | Header comment: the incident history names the driver as a former reader — mark it retired (comment only) |
| spec/scripts/components-check.js | MODIFY | scripts | Header comment: callers are `/spec:genesis-design` (fail-closed) and `/spec:design` preflight (advisory); `wf-design grounding` → design workers (comment only) |
| spec/scripts/render-gate.js | MODIFY | scripts | AC-20260824-02-2 — the `design.render`-missing exit-2 remedy names `/spec:design` alongside the config keys, so the command's STOP and the script's STOP are one message (orchestrator scope addition at build, 2026-08-24: the AC demands a script-side change the File Plan had no row for) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.32.0, next-free rule) + changelog paragraph; the description's `the design-driver pattern` phrase → `driver-stepped` |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260824-02-1 (negative key pin) + remove the three keys from the resolve-all list |
| tests/env-preflight.test.js | MODIFY | tests | AC-20260824-02-3 — retag AC-20260815-05-8's design pin in place to the new body's step wording |
| tests/spec-status.test.js | MODIFY | tests | AC-20260824-02-4 — tag the existing `--next routes hardened+design` test (edit-only) |
| tests/state-gates.test.js | MODIFY | tests | AC-20260824-02-5 — tag the existing `/spec:design requires hardened` assertions (edit-only) |
| tests/frontmatter/frontmatter.test.js | MODIFY | tests | AC-20260824-02-6 — `FOUR_SCRIPTS` → the three survivors, test name retagged in place |
| tests/render/render-gate.test.js | MODIFY | tests | AC-20260824-02-2 — the precondition remedies the command prints are the script's own (one added assertion on the `design.render`-missing stderr naming `/spec:design`) |

Orchestrator duties outside the table (no worker touches these): `git rm`
`spec/scripts/spec-design-driver.js`, `spec/workflows/wf-design.js`,
`spec/scripts/skeletons-check.js`, `tests/design-driver.test.js`, `tests/skeletons-check.test.js`
before the scripts batch runs, so the entrypoints and spec-paths pins see the final tree.

## Contracts

`/spec:design <spec path>` — resume derivation (D1), evaluated top-down on every invocation:

| On disk | Step |
|---------|------|
| `designed:` set | DONE — report, `next: /spec:build <spec>` |
| ledger claim for every surface with `stories` for every state, both gates green this invocation | your look (D9) |
| ledger claim present, some state without a story id, or components absent | author (D4) |
| no ledger claim for a surface | preflight → author |

Report slots (rendered by `report-render`): `outcome` ✅ `designed — {N} components kept,
manifest extended, spec reconciled`; `bullets` one line per excused static→link role;
`warns` anything that changes the next step; `next` `{kind:'command', text:'/spec:build
<spec>'}`.

Worker dispatch envelope (paths only): `{spec, mock, tokens, doctrine, manifest, targets,
states: ["default"|…], storyFormat, componentDir}`; return
`{files: [...], components: [{name, decision: "bind"|"author", nearest, why}], stories:
{"<state>": "<story id>"}, blocked?: {kind, detail, options, recommendation}}`.

## Behavior

- Cold between rounds: every artifact the next step needs is on disk (components, stories,
  ledger, gate reports under the scratchpad or `.claude/spec-runs/render/`); a session that
  dies mid-round re-derives its step from the table above.
- A `blocked` return stops the dispatch wave; the session asks, records the ruling in the
  spec's Decisions, and re-dispatches that surface.
- `AskUserQuestion` dismissed → STOP; state is safely on disk.
- Non-UI specs never reach this command (`design: false`); `/spec:build` keeps asking whether
  to run design on a `design: true` spec without `designed:` (unchanged).

## Acceptance Criteria

- **AC-20260824-02-1**: WHEN `spec-paths design-driver`, `spec-paths wf-design`, or
  `spec-paths skeletons-check` is invoked THE SYSTEM SHALL exit non-zero with the usage line
  (the keys no longer exist), and `spec/scripts/spec-design-driver.js`,
  `spec/workflows/wf-design.js`, `spec/scripts/skeletons-check.js` SHALL not exist →
  `tests/spec-paths.test.js`
- **AC-20260824-02-2**: WHEN `render-gate.js --spec` exits 2 for a missing `design.render`
  THE SYSTEM SHALL name `/spec:design` in the same stderr remedy (so the command's STOP and the
  script's STOP are one message) → `tests/render/render-gate.test.js`
- **AC-20260824-02-3**: WHEN `spec/commands/design.md` is read THE SYSTEM SHALL name
  `env-preflight` within 400 characters before the first occurrence of the author dispatch
  step (`Agent {model: "sonnet"}` or the word `dispatch`) with STOP semantics →
  `tests/env-preflight.test.js` (retagged from AC-20260815-05-8, updated in place)
- **AC-20260824-02-4**: WHEN `spec-status.js --next` reads a `hardened` spec with `design:
  true` and no `designed:` THE SYSTEM SHALL CONTINUE TO route it to `/spec:design`, and WHEN
  `designed:` is set SHALL CONTINUE TO route it to `/spec:build` → `tests/spec-status.test.js`
  (existing test `--next routes hardened+design …`, tagged)
- **AC-20260824-02-5**: WHEN `/spec:design` is invoked against a `draft` spec THE SYSTEM
  SHALL CONTINUE TO block it (exit 2) and against a `hardened` spec SHALL CONTINUE TO admit it
  → `tests/state-gates.test.js` (existing assertions, tagged)
- **AC-20260824-02-6**: WHEN `spec-review-driver.js`, `spec-status.js`, and `replay.js` are
  read THE SYSTEM SHALL CONTINUE TO require `lib/frontmatter.js` with no local per-line
  frontmatter parsing → `tests/frontmatter/frontmatter.test.js` (AC-20260823-04-10's test,
  `FOUR_SCRIPTS` reduced to three, retagged in place)

## Assumptions (escalation triggers)

- A1: Both hosts' `gateCommand` carries no `{testDirs}` placeholder (read 2026-08-24:
  salon-os `pnpm check && … && pnpm gate:parity`, prax `pnpm gate`) — the substitution in D7
  is a no-op there — **if false** on another host: build's substitution applies verbatim.
- A2: Host `agentMap` entries exist for component layers (salon-os `components`/`stories`,
  prax `ui`/`stories`, read 2026-08-24) — **if false:** `agentMap.default`.
- A3: No live test other than the five listed in the File Plan asserts on the driver, the
  workflow, or `skeletons-check` by path or key (grep 2026-08-24: `tests/design-driver.test.js`,
  `tests/skeletons-check.test.js` deleted; comments in `dependency-free`, `review-driver`,
  `entrypoints` tests are narrative only) — **if false:** update the colliding pin in place and
  retag, never weaken (Gotcha: retired literals).
- A4: `docs/canonical/pipeline.md`'s frontmatter paragraph names the driver as a reader —
  handled in Canonical Delta, not a File Plan row.
- A5: No dependency-adjudicated claim is locked here beyond spec 01's spike; the prose
  contract runs on the scripts spec 01 pins.

## Rationale

The stage keeps its seat in the state machine (hook, `designed:`, `spec-status` routing —
frozen) and loses its interior. The driver was a state machine over artifacts that no longer
exist (`extract.json`, `skeletons.json`, `deltas.json`, marks); with three gates and a stamp,
disk state is a four-row table. Direct dispatch per surface is the inversion `/spec:build`
already made — the workflow held no judgment and its `args` channel was a measured corruption
source. The blocking look stays because JJ uses it (2026-08-24 ruling; the 38-spec count
measured recorded change rounds, which a look that approves never produces) and because the
render gate now runs first, so the look judges what a script cannot: whether the measured-true
screen is the right screen. Story-per-state with the mock's illustrated values is the whole
data contract — one rule enforced by the comparison, no fixture runtime, no mock re-authoring
on either host.

Rejected: keeping a slim driver (a 4-row table needs no script; re-entrancy is the table);
keeping `skeletons-check` as a dormant script (no entrypoint = the authored-not-activated
class); folding the stage into build's first wave (fenced by the brief). The tier is
critical because `spec-paths` loses keys and a pipeline stage's mechanism is replaced; the
pins in D16 are what make "frozen surface untouched" a test rather than a claim.

Collision-closure at lock (2026-08-24): `likely` = `tests/consistency/entrypoints.test.js`
against the entrypoints/spec-paths/design.md/host-config rows — the exhaustive live-file pin
class (no waive owed). Literals leg (`spec-design-driver`, `wf-design`, `skeletons-check`,
`design-driver`) hits outside the File Plan are all comment-only or assert-message narration
and are **waived**: `tests/consistency/dependency-free.test.js` (comment),
`tests/host-config/config-read.test.js:37` (assert message naming a former strict caller),
`tests/frontmatter.test.js:6` (incident comment), `tests/review/review-driver.test.js:12`
(history), `spec/scripts/spec-review-driver.js:10` (header history — "on the
spec-design-driver.js contract" is a dated provenance line and stays). `docs/canonical/*` are
Canonical Delta.

Watch: the `env-preflight` pin retag must keep its STOP semantics; the retired-literal sweep
(driver, `wf-design`, `skeletons`) was done by hand at lock — the closure leg does not sweep
retired names.

## Canonical Delta

`docs/canonical/design.md`: the **Exit fidelity review** section is replaced by **Design stage
(2026-08-24, specs/20260824/02)** — six steps (preflight, author by direct Sonnet dispatch per
surface with the mock in context, host gate, render gate, blocking user look, reconcile +
`designed:`), resume derived from disk, no driver, no sidecar, no workflow; story-per-state
renders the mock's illustrated values; the coverage ledger carries story ids. The **Atlas gap
sweep dispatch** section is unchanged. `docs/canonical/pipeline.md` § *Frontmatter has one
reader*: the reader list drops `spec-design-driver.js` (retired 2026-08-24).
