---
description: Open the whole-product design atlas — a derived journey view over every mock, regenerated on each run. Never required by the pipeline; run it to see or change the design. Detects gaps itself and offers the sketch sweep
argument-hint: "[sweep] (optional fast-path — bare invocation detects everything itself)"
---

# Spec Atlas: The Whole Picture

**Never required. Not part of plan → build → review → release.** No pipeline stage reads,
gates on, or waits for the atlas; `design/atlas/` is regenerated from scratch on every run, so
there is no staleness to maintain and nothing to "keep updated." Run this when you want to see
or change the product's design as a whole — the pipeline never asks for it. The one scheduled
appearance is greenfield: the full sweep + holistic review after `/spec:genesis`, before
the first UI-bearing brief is planned (shared § Design Atlas).

The roadmap-level design view: every mock rendered at device size, arranged by the roadmap's
declared journeys, status-badged, with declared-but-unmocked surfaces as explicit gap cards.
Owns no spec state. Generation is a deterministic script — this command is the human loop
around it. **The atlas is the map; `/spec:sketch <brief>` is the workbench** — a sustained
design-brainstorm on one brief's surfaces (mock + brief co-evolve, exit ratification) belongs
there; the atlas is for seeing the whole product and applying cross-cutting notes.

**Intended model: the session model.** Regeneration and serving are zero-judgment; the sweep
runs entirely in-session, every mock authored and edited by one hand (shared § Design Atlas's
authorship paragraph, core § Model Placement) — no `Agent` dispatch ever writes a mock.
**Change rounds that are direction-level** (new journey shape, a surface's whole posture,
cross-screen coherence rulings) are the roadmap-level taste seat — recommend the user run them
with Fable/Opus.

**Setup:** run `spec-paths shared-for atlas` and read its output. Run `spec-paths design-atlas`
once and keep the path — `{atlas}` below. Run `spec-paths mocks-driver` once and keep the path —
`{driver}` below (owns the `notes` subcommands the annotation loop reads). Read
`.claude/spec.config.json` if present (optional `design.atlasRoutes`). No genesis required: any
repo with `design/mocks/` and/or roadmap `surfaces` blocks gets an atlas.

## The run — build, serve, dispatch on what you find

There are no modes to choose. Bare invocation detects everything from the build report and the
user's input; `sweep` as an argument only skips the gap confirmation.

1. `node {atlas} build` (add `--root` if not at repo root). Assemble slots and render via
   `node "$(spec-paths report-render)" --slots <file>`, print the script's output verbatim
   (rationale: shared § Console Output Style) — this is the run's terminal report:
   - `outcome`: anchor `✅` text `atlas rebuilt — {N} surfaces ({M} bound, {K} gaps)`.
   - `bullets`: `- orphan: {mock path} — declare in {owning brief} or delete` (one per orphan);
     plus the `🎨 authored {N} in-session · {K} check-only dispatches` line (shared § Design
     Atlas) after a sweep authored any mocks.
   - `warns`: `{bound-but-drifted suspicion the user raised}`, when raised.
   - `artifacts`: `design/atlas/index.html`.
   - `next`: two arms (A5) — `{kind:'command', text:'/spec:atlas sweep — fill the {K} gap
     surfaces at sketch tier'}` when `K` (gaps) > 0, else `{kind:'status-verbatim', text:
     <this session's captured `spec-status --next` output>}`.

   ```report
   ✅ **atlas rebuilt — 12 surfaces (9 bound, 3 gaps)**
   - orphan: design/mocks/old-settings.html — declare in 04-settings-revamp or delete
   📦 design/atlas/index.html
   Next: /spec:atlas sweep — fill the 3 gap surfaces at sketch tier
   ```
2. **Gaps in the report → offer the sweep** ("N declared surfaces have no mock — fill them at
   sketch tier?" — the interactive confirmation behind the Next line above). Yes → run the
   sweep below. Invoked as `/spec:atlas sweep`, skip the question and run it directly.
3. Report the output path (`design/atlas/index.html`) — the user opens the file themselves
   (e.g. from VS Code); do **not** start a server or open a browser unprompted. Serve
   (`node "$(spec-paths design-atlas)" serve`) only when the user asks or when notes are the
   plan — serving (not `file://`) is what injects the notes layer, enables same-origin frame
   measurement, and the theme buttons of the matrix toolbar (present when `design/targets.json`
   exists — on `file://` it degrades gracefully to viewport-only); point the user at it for
   per-device / dark-mode review and for leaving notes.
4. **Annotation loop (when the user leaves notes):** notes are written on the served page (the
   injected notes layer, `?clean` skips it) and read back with `node {driver} notes open`,
   grouped project → journey → screen → state (spec/doctrine/mocks.md § Mocks: Page Notes owns
   the note shape and mark refusals). When several are open, present the grouped list before
   applying anything. **Triage every note by root cause first** (shared § Design Atlas) into one
   of four bins: **mock-detail** (spacing, copy, emphasis) → edit the mock file, then `notes
   address --id <id> --change "<what changed>"`; **product-understanding** (wrong surface set,
   missing journey edge, a flow that shouldn't exist) → fix the owning brief's `surfaces` block
   FIRST (cross-brief scope changes via an amendment ADR — adr.md template § Applies to), then
   the mock, then `notes address` with `--ledger <rowId>` — a pixel edit over a brief error
   leaves the brief lying to every future planning session; **question back** → `notes reply
   --id <id> --text "<question>"`, status stays open; **propose to decline** → never declined by
   this session, print it for the user. A note hitting a canon primitive edits canon.md first,
   every dependent screen after. If a note contradicts the doctrine or a bound region (coverage
   ledger claim), that is a **fork**: `AskUserQuestion`, glossed in plain English with a
   consequence per option, recommended-first from how concrete the note is — a specific,
   actionable note recommends "mock-and-spec both change" (route through `/spec:design`'s drift
   handling for bound regions — the real fix, but reopens a spec); a vague or contested note
   recommends "withdraw the note" (nothing changes, but the concern stays unaddressed until it's
   sharper); never silently rewrite a bound mock. Then per mock edit: locate the file by
   `data-screen-label`, edit it in-session under the design harness (`{atlas} check` after
   every edit), rerun `node {atlas} build`, tell the user to refresh. Resolve happens only on
   the page (the `Resolve` button) — this session never resolves a note. When the notes keep
   converging on ONE brief — a feature brainstorm, not a coherence pass — hand off: recommend
   `/spec:sketch <that brief>`, where the brief is a first-class write target and the session
   ends in ratification.

## The sweep — fill the gaps at sketch tier

**The full sweep + the user's holistic review is a named pipeline stage on greenfield** (shared
§ Design Atlas; the genesis hand-off chain places it after `/spec:genesis`, before the first UI
brief is planned): sketches are the product-understanding contract, and this review is where
the user audits the model's grasp of the whole product at sketch-edit prices. Later invocations
are incremental gap-filling.

Every `gap` surface is authored at **sketch tier** (`data-status="sketch"`; structure, real
copy register, token roles — no polish pass, no screenshot loop) under the harness check,
following the shared authorship + grounding rule **in full** (shared § Design Atlas's
authorship paragraph — one hand, in-session, no dispatch ever writes a mock; the
no-shell-canon bootstrap, and the grounding order); paths, not prose, are what a later mock
in the same pass cites. Run `shell sync` on the pass's mocks, then `{atlas} check`. Then
rebuild and report — same ```report template as step 1 above, fresh slots from the post-sweep
build, plus the `🎨 authored {N} in-session · {K} check-only dispatches` bullet (shared §
Design Atlas) — the whole picture should always exist; polish arrives per-surface at
`/spec:design`.

## Rules

- **The atlas is derived — never hand-edit `design/atlas/`**; every change goes to mocks,
  briefs' `surfaces` blocks, or the coverage ledger, then regenerate.
- **Structure lives in the roadmap, pixels in mocks** — a journey-shape change edits the brief's
  `surfaces` block (and is a roadmap decision); a look change edits the mock. Never both homes
  for one fact.
- Sketches are honest sketches: `data-status="sketch"` until a human's ruling promotes them —
  `ratified` at a `/spec:sketch` exit confirmation, `approved` at `/spec:design` promotion or
  an explicit atlas approval — never by the sweep itself.
- Bound regions (coverage ledger) are contracts; changing their mocks without the fork ruling
  above is the drift the fidelity gate exists to catch.
- **Mock-vs-built divergence on `built` surfaces is informational, never a task** (shared §
  mock-authority lifecycle): report it when visible (atlasRoutes side-by-side), escalate it only
  when that surface enters a new spec's scope — where `/spec:design` re-syncs the mock first.
- `AskUserQuestion` dismissed → STOP.
