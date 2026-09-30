<!-- spec/templates/prototype-spec.md — specs/20260928/02-freeze-export-and-the-contract.md D6.

     Filled by spec/scripts/lib/freeze.js's `writeSpec` at the `tests-derived` mark, once per
     frozen prototype, into the reserved path `specs/<date>/<NN>-<brief name>.md`. Every
     `{{…}}` token below is substituted verbatim (no token survives into the written file);
     everything else — every heading, every fixed sentence in Assumptions/Rationale/Canonical
     Delta — is copied byte-for-byte. Token list, in the order they first appear:

       {{date}}                the freeze's own date (YYYY-MM-DD) — the spec's frontmatter date
       {{brief}}                the roadmap brief number (e.g. "28"), unquoted
       {{area}}                 the brief's stem with the leading "NN-" stripped (e.g.
                                 "functional-prototype") — frontmatter `area` and used to build
                                 {{title}} by the caller before substitution
       {{title}}                the spec's `# ` heading text — composed by the caller (not
                                 derived here), never left as the raw stem
       {{goal}}                 the brief's `## Result` section's first paragraph, verbatim
       {{base}}                 the base branch the prototype forked from (`status.base`,
                                 typically "main") — substituted into D1 and D2's backtick spans
       {{stem}}                 the brief's stem (e.g. "28-functional-prototype") —
                                 substituted into D1 and D2's backtick spans
       {{d1AcCitations}}        every reserved AC id for this freeze, comma-joined (e.g.
                                 "AC-20260929-01-1, AC-20260929-01-2") — appended to D1's own
                                 decision text so the carrier-contract lint (promise-sweep.js)
                                 sees D1 citing every AC it stands behind
       {{filePlanRows}}         the File Plan table's body rows (no header, no leading/trailing
                                 blank line) — one row per exported path (Action from its diff
                                 status: A→CREATE, M→MODIFY, D→DELETE, layer `other`), one row
                                 per proto/<stem> path changed outside both the export globs and
                                 the overlay files (Action from its own diff status, layer
                                 `other`), and the e2e file as a `tests`-layer row whose Summary
                                 lists every reserved AC id
       {{contractsBody}}        the routes × states table plus the `contract.json` pointer —
                                 whatever prose/table the caller composes from `contract.json`'s
                                 own `routes` object
       {{acceptanceCriteria}}   one AC bullet per behaviour pin (bullets only, no leading
                                 heading) — see the fixed bullet grammar this file pins beside
                                 the token, which the caller's per-pin text must match exactly
                                 apart from the id/pin/note/screen/state/e2eFile substitutions
-->
---
date: {{date}}
status: hardened
tier: standard
area: {{area}}
breaking: false
depends_on: []
depended_on_by: []
brief: {{brief}}
lane: behaviour
open_markers: 0
---

# {{title}}

## Goal

{{goal}}

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | the UI is rebuilt from `{{base}}` against `design/prototypes/{{stem}}/contract.json`, route by route, through the build driver's capture gate (spec 03) ({{d1AcCitations}}) | the frozen contract is the only surface the rebuild reads — never `proto/{{stem}}`, deleted before this spec existed |
| D2 | the data and API layer is merged from `harden/{{stem}}` and hardened in place through the host gate | `[no-ac: the gate is the oracle]` two independent surfaces, two Decisions rather than one conflated row |

## File Plan

<!-- Machine-consumed: the build stage parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other | baseline. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
{{filePlanRows}}

## Contracts

{{contractsBody}}

## Behavior

The build driver rebuilds every route named in `contract.json` from `{{base}}`, composite by
composite, and checks each capture through the same structural comparison this prototype was
frozen with (spec 03) — a route/state pair with no captured composite instance is a build-time
refusal, never a silent skip. In parallel, `harden/{{stem}}`'s diff is merged into the same base
and carried through the host's own gate before either surface is considered done. Every
behaviour pin below became exactly one derived end-to-end test, already authored and already
red on `main` — this spec's own Acceptance Criteria are met the moment each such test turns
green, never by a new assertion invented at build time.

## Acceptance Criteria

{{acceptanceCriteria}}

## Assumptions (escalation triggers)

- A1: the derived end-to-end tests, red on `main` today, turn green once the rebuild reproduces
  `contract.json`'s captured composite instances at the same ids — a test that stays red after
  the rebuild names a real captured-contract mismatch, never a flaky assertion to relax. —
  **if false:** STOP, ask the user; do not edit the derived test to make it pass.
- A2: `harden/{{stem}}`'s diff applies cleanly onto `{{base}}` with no further reconciliation
  beyond the host's own gate — this spec plans no manual conflict resolution because the export
  step (spec 02 D5) already produced a clean, gate-checked commit. — **if false:** the merge
  conflict is a blocking finding at build time, never silently resolved by a worker's own
  judgment.

## Rationale

This spec is generated, not authored: the freeze measured an approved, functional prototype
and reserved these AC ids before a single test was written, so every fact here is derived from
`contract.json` and the `harden/{{stem}}` export diff, never guessed at plan time the way a
hand-written spec's Decisions are. Two Decisions rather than one because the UI and the data/API
layer are independent surfaces with independent oracles — a structural capture gate for the
former, the host's own gate for the latter — and conflating them would hide which oracle a
build-time failure actually failed. Every AC line here follows an approved *behaviour* pin
one-to-one; a look-only pin never reaches this file, because a look-only pin has no derived test
to be red or green about (spec 02's `pins.look` array). The derived tests are red today by
construction, asserting against contract ids the current `main` tree does not yet reproduce, and
this spec never tags one pre-green — a generated spec inherits no exemption a hand-authored one
would not also need to earn. Nothing under `proto/{{stem}}` is read past this point: that branch
was deleted before this file was written, and `harden/{{stem}}` is the only survivor of the
prototype's own history.

## Canonical Delta

No further `docs/canonical/design.md` change is owed by this generated spec itself — the freeze
that wrote it already recorded the canonical delta for the freeze pipeline as a whole
(specs/20260928/02-freeze-export-and-the-contract.md); this file is one instance of that
already-documented pattern, not a second canonical source.
