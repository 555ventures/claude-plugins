---
description: Regenerate and serve the whole-product design atlas — journey view over every mock, gap-sweep for declared-but-unmocked surfaces, and the annotation→edit→regenerate change loop
argument-hint: "[sweep | change] (default: regenerate + serve + report)"
---

# Spec Atlas: The Whole Picture

The roadmap-level design view (shared § Design Atlas): every mock rendered at device size,
arranged by the roadmap's declared journeys, status-badged, with declared-but-unmocked surfaces
as explicit gap cards. Runs at any pipeline stage; owns no spec state. Generation is a
deterministic script — this command is the human loop around it.

**Intended model: the session model.** Regeneration and serving are zero-judgment. The **sweep**
dispatches Sonnet agents. **Change rounds that are direction-level** (new journey shape, a
surface's whole posture, cross-screen coherence rulings) are the roadmap-level taste seat —
recommend the user run them with Fable/Opus (shared § Model Placement); mechanical annotation
fixes (copy, spacing, a moved element) run on Sonnet dispatch regardless of session model.

**Setup:** run `spec-paths shared-for atlas` and read its output. Run `spec-paths design-atlas`
once and keep the path — `{atlas}` below. Read `.claude/spec.config.json` if present (optional
`design.atlasRoutes`). No genesis required: any repo with `design/mocks/` and/or roadmap
`surfaces` blocks gets an atlas.

## Default run — regenerate, serve, report

1. `node {atlas} build` (add `--root` if not at repo root). Report the summary line (counts by
   status) plus: every `gap` (declared, no mock — offer the sweep), every `orphan` (mock no
   brief declares — offer: declare it in the owning brief's `surfaces` block, or delete it),
   and any `bound`-but-drifted suspicion the user raises.
2. Serve it: `python3 -m http.server` (or the host's equivalent) from the repo root in the
   background, and give the user `http://localhost:<port>/design/atlas/index.html`. Serving
   (not `file://`) is what lets a local annotation MCP anchor to it — and what lets the page's
   matrix toolbar (present when `design/targets.json` exists) flip every frame across the
   declared viewports and themes; point the user at it for per-device / dark-mode review.
3. **Annotation loop (when the user annotates):** if a local annotation MCP is connected (e.g.
   Vibe Annotations / Agentation — discover via ToolSearch, never assume), poll/receive its
   anchored notes; otherwise take changes in chat against screen labels. **Triage every note by
   root cause first** (shared § Design Atlas): **mock-detail** (spacing, copy, emphasis) → edit
   the mock file; **product-understanding** (wrong surface set, missing journey edge, a flow
   that shouldn't exist) → fix the owning brief's `surfaces` block or a delta FIRST, then the
   mock follows — a pixel edit over a brief error leaves the brief lying to every future
   planning session. Then per mock edit: locate the file by `data-screen-label`, dispatch a
   Sonnet edit under the design harness (`{atlas} check` after every edit), rerun
   `node {atlas} build`, tell the user to refresh. Direction-level notes → record, and route per
   the model note above rather than silently absorbing them into a mechanical fix.

## `sweep` — fill the gaps at sketch tier

**The full sweep + the user's holistic review is a named pipeline stage on greenfield** (shared
§ Design Atlas; the genesis hand-off chain places it after genesis-design, before the first UI
brief is planned): sketches are the product-understanding contract, and this review is where
the user audits the model's grasp of the whole product at sketch-edit prices. Later invocations
are incremental gap-filling.

For each `gap` surface: one Sonnet agent authors `design/mocks/<label>.html` at **sketch tier**
(`data-status="sketch"`; structure, real copy register, token roles — no polish pass, no
screenshot loop) under the harness check, grounded in the owning brief + the research brief
(`docs/design/research-brief.md`, when present) + doctrine + `design/tokens.css`. Parallel
dispatch, paths not prose. Then rebuild and report — the whole picture should always exist;
polish arrives per-surface at `/spec:design`.

## `change` — a recorded change round

The explicit form of the annotation loop for bigger rounds: collect the user's notes (annotation
MCP or chat), group by surface, present the plan, apply via Sonnet dispatch (harness-checked),
rebuild. If a change contradicts the doctrine or a bound region (coverage ledger claim), that is
a **fork**: `AskUserQuestion` — mock-and-spec both change (route through `/spec:design`'s drift
handling for bound regions) or the note is withdrawn; never silently rewrite a bound mock.

## Rules

- **The atlas is derived — never hand-edit `design/atlas/`**; every change goes to mocks,
  briefs' `surfaces` blocks, or the coverage ledger, then regenerate.
- **Structure lives in the roadmap, pixels in mocks** — a journey-shape change edits the brief's
  `surfaces` block (and is a roadmap decision); a look change edits the mock. Never both homes
  for one fact.
- Sketches are honest sketches: `data-status="sketch"` until a human approves them
  (`approved` is set by a person's ruling, at `/spec:design` promotion or an explicit atlas
  approval — never by the sweep itself).
- Bound regions (coverage ledger) are contracts; changing their mocks without the fork ruling
  above is the drift the fidelity gate exists to catch.
- **Mock-vs-built divergence on `built` surfaces is informational, never a task** (shared §
  mock-authority lifecycle): report it when visible (atlasRoutes side-by-side), escalate it only
  when that surface enters a new spec's scope — where `/spec:design` re-syncs the mock first.
- `AskUserQuestion` dismissed → STOP.
