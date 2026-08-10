---
date: 2026-08-10
status: done
open_markers: 0
risk: T2
area: design
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 02
---

# Design-path model placement: registry-weighted canon, registry-grounded workers, exit fidelity review, atlas sweep contract

## Goal

Land the genesis-design/design-stage half of the 2026-08-10 model-placement ruling (the
sketch half shipped in v6.48.0). Four capabilities: (1) genesis records the product's
**component vocabulary** — the building blocks it commits to, each with role and usage
boundaries — into the existing machine-readable registry `design/components.json`, kept
honest by a new deterministic shape check; (2) `wf-design` workers are **grounded in that
registry** the same way tokens ground them today, so they bind real building blocks instead
of inventing lookalikes; (3) `/spec:design` gets **one unified post-gate fidelity review**
(render vs ratified mock, judged by the expensive seat), replacing today's two overlapping
look-checks; (4) the `/spec:atlas` gap sweep **adopts the sequential-dispatch contract**
the sketch ruling established, recorded once in shared doctrine. Done = all four are
doctrine + code + pinned tests, plugin bumped.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The component vocabulary lives in `design/components.json` — the existing manifest, extended with an optional `boundaries: [string]` field per entry; genesis-seeded commitment entries carry `name`, `purpose`, `boundaries` and (before implementation) empty/absent `props`/`mockRefs`. No second registry file. | One binding home per fact; the manifest is already read at design preflight and verified by review — a standalone vocabulary file would drift from it (user-confirmed; rejected: new file, doctrine block). |
| D2 | Canonical manifest shape: a **top-level JSON array** of entries `{name, purpose, boundaries?, props?, mockRefs?, authorJustification?}`; `name`+`purpose` are required non-empty strings, `boundaries` when present is an array of non-empty strings, duplicate `name`s are an error. | The file has no deterministic consumer today, so this spec declares the canonical shape; the validator (D3) is the schema authority — no template file is added (a template would be a second home for the same schema). |
| D3 | New `spec/scripts/components-check.js` (spec-paths key `components-check`) validates the manifest per D2. It runs **fail-closed** in `/spec:genesis-design`'s commit step (Phase 4.5) and **advisory** (warn, never block) in the design driver's preflight; scaffold-ledger rows record both with promote/retire conditions. | New guards enter ADVISORY (ledger discipline); genesis validates a file it just wrote in a greenfield repo, so fail-closed is safe there; brownfield hosts may hold pre-D2 files, so the driver only warns. |
| D4 | `/spec:genesis-design` Phase 4.3 additionally seeds the vocabulary: alongside the base primitives, every building block the ratified direction / doctrine / winner mocks commit the product to gets a commitment entry (`name`, `purpose`, `boundaries`). Visual archetypes only, same as the rest of 4.3. | The registry-weighted canon of the brief: anything a worker must obey moves out of prose into the machine-readable artifact; sourced from the winner's material — genesis-explore artifacts carry no component inventory, so there is nothing upstream to seed from mechanically. |
| D5 | `wf-design` args gain `componentManifestPath: string` (`''` if none). When non-empty, the worker Design-canon block instructs: read the manifest; a block the vocabulary names is bound/imported or authored to fulfil its entry — never re-invented as a lookalike; a `boundaries` contradiction is a fork → `blocked`, same standing as a token-value contradiction. The driver's inline AUTHOR-step args template gains the same field. | The brief's registry-grounding half — the vocabulary joins the grounding set exactly the way `tokenPaths` do; the driver template is the contract the session actually copies from (sessions never Read `wf-design.js`). |
| D6 | The driver's `VISUAL` state (+ `visual-done` mark) and the advisory `vision-review` block (+ `vision-reviewed` mark) are **retired and replaced** by one post-gate state `FIDELITY_REVIEW` (mark `fidelity-reviewed`): fires after `author-green` whenever the host has any render path (`design.screenshot` OR `design.command`) — with a `design_source` the review is render-vs-mock (bound-region screenshots vs mock slices); without one it is the render critique against skeletons + doctrine that the no-mock `VISUAL` step performs today, so no-mock specs keep their visual review. The divergence list goes to the expensive seat (Fable retainer, Opus fallback) for judgment; findings become iteration-round rulings — never a fail-closed gate, never a script. Legacy sidecars: an existing `visual-done` mark satisfies `FIDELITY_REVIEW`. | User-confirmed unification ("frontier at the bookends"): one review moment the user can trust before approving, replacing two overlapping mechanisms of different strength; judgment-not-gate is the brief's explicit constraint; refuter finding — conditioning on `design_source` would have silently dropped the no-mock visual review `design.screenshot` hosts have today. |
| D7 | `/spec:review`'s component-manifest check treats commitment entries as first-class: near-duplicate comparison includes them (authoring a lookalike of a committed block is a finding), and an `author` decision that fulfils a commitment entry cites that entry as its justification. | Closes the loop D1 opens — without this, review compares only landed components and the vocabulary exerts no anti-duplication pressure. |
| D8 | The atlas gap sweep retires parallel per-surface dispatch: all gap surfaces are authored by **one sequential Sonnet dispatch** (chained sequential dispatches past ~10 surfaces, never parallel), with existing mocks — ratified/approved first, then this sweep's own earlier output — cited as exemplars. The dispatch ruling is recorded in shared § Design Atlas as the single doctrine home, **phrased to cover both contracts** — the sketch shape (session-authored, Sonnet overflow past 5) and the atlas shape (sequential Sonnet dispatch) are both instances of "one warm author per pass, exemplar-grounded, never parallel-blind per-surface" — so a future sketch.md touch can pointer to it; atlas.md cites it now, sketch.md is untouched (v6.48.0, brief Out of scope; its inline prose is sanctioned test-pinned redundancy until touch-time dedup). | User-confirmed: the greenfield full sweep is exactly where cross-surface coherence matters most; same drift fix as the sketch ruling, one doctrine home so the two commands stop drifting independently. |
| D9 | Doctrine cites the ruling date ("ruled 2026-08-10") only — the CHI 2026 DOI stays in the roadmap brief and is never re-verified or cited in doctrine. | Matches the shipped sketch-half pattern; the source was flagged low-confidence and doctrine grounds on rulings, not external citations. |
| D10 | Brownfield vocabulary derivation is out of scope: `/spec:init` is untouched; brownfield hosts grow the registry organically via `/spec:design` reconcile (the existing write path). No follow-up brief is written — speculative until a real host asks. | User-confirmed conservative pick; nothing to unwind if derivation proves wrong. |
| D11 | Version bump to **6.49.0** with the description (changelog) paragraph covering all four capabilities; `claims-baseline.json` regenerated via `claims-lint --update-baseline` in the same change. | Repo discipline: doctrine line-count ratchet fails review without the baseline hunk; behavior change requires the bump. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ doctrine | scripts | workflows | tests | other.
     wf-design.js is GENERATED — the workflows row is the .body.js source; the orchestrator
     runs `npm run build:workflows` after it and commits source + generated together. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/shared.md | MODIFY | doctrine | § Design Authoring Contracts: vocabulary + `boundaries` field + commitment-entry semantics (D1, D2, D7); § Design Binding Pipeline: unified exit fidelity review (D6); § Design Atlas: sequential-dispatch ruling, single home (D8) |
| spec/commands/genesis-design.md | MODIFY | doctrine | Phase 4.3 vocabulary seeding (D4); Phase 4.5 commit step runs components-check fail-closed (D3) |
| spec/commands/design.md | MODIFY | doctrine | Visual-gate framing rewritten to the unified post-gate review (D6); vocabulary named in the grounding/bind-vs-author prose (D5, D7) |
| spec/commands/atlas.md | MODIFY | doctrine | Sweep section: sequential dispatch + exemplar grounding, citing shared § Design Atlas (D8) |
| spec/commands/review.md | MODIFY | doctrine | Component-manifest check covers commitment entries + fulfilment citations (D7) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | Amend component-manifest row (vocabulary extension); mark the existing "Vision design review" advisory row RETIRED (replaced by D6 — follow the rows-24/25 retirement pattern); add components-check row (ADVISORY at driver / gate at genesis) and fidelity-review-mark row, each with promote/retire (D3, D6) |
| spec/scripts/components-check.js | CREATE | scripts | D2 validator; exit 0 valid / 1 findings / 2 usage-or-missing-file naming the remedy; header per script conventions |
| spec/bin/spec-paths | MODIFY | scripts | `components-check` key + usage line |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | FIDELITY_REVIEW state + `fidelity-reviewed` mark replacing VISUAL/`visual-done` and the advisory vision block; legacy-mark compat; preflight advisory components-check; AUTHOR-step args template gains `componentManifestPath` (D5, D6) |
| spec/workflows/src/wf-design.body.js | MODIFY | workflows | `componentManifestPath` arg + Design-canon manifest grounding + boundaries-contradiction fork rule (D5); regenerate wf-design.js |
| tests/components-check.test.js | CREATE | tests | AC-20260810-01-1, AC-20260810-01-2, AC-20260810-01-3 |
| tests/design-driver.test.js | MODIFY | tests | AC-20260810-01-4, AC-20260810-01-5, AC-20260810-01-6, AC-20260810-01-7 (regression pins re-tagged) |
| tests/design-vocabulary.test.js | CREATE | tests | AC-20260810-01-8, AC-20260810-01-9, AC-20260810-01-10 (wf-design body + doctrine pins) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | 6.49.0 + description changelog paragraph (D11) |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | `claims-lint --update-baseline` after all doctrine edits (D11) |

## Contracts

**`design/components.json` canonical shape (D2)** — schema authority is `components-check.js`:

```jsonc
[
  {
    "name": "StatusChip",              // required, non-empty, unique across the file
    "purpose": "one-line role",        // required, non-empty
    "boundaries": [                    // optional; when present: array of non-empty strings
      "status/state signaling only — never interactive, never navigation"
    ],
    "props": [ /* … */ ],              // optional; absent/empty on commitment entries
    "mockRefs": [ /* … */ ],           // optional; absent/empty on commitment entries
    "authorJustification": "…"         // optional (author-decision entries, as today)
  }
]
```

**`components-check.js`** — `node components-check.js <path-to-components.json>`:
exit 0 = valid; exit 1 = findings (one line each, naming the entry and the field); exit 2 =
usage error or file missing/unparseable, stderr names the remedy. No flags beyond the path.
Tolerates the legacy `{"components": [...]}` wrapper with a warning naming the canonical
array form (never an error — brownfield files predate D2).

**`wf-design` args delta (D5)** — one new field, closed-alphabet compliant (a path):

```
componentManifestPath: string   // path to design/components.json; '' if the host has none.
                                // Non-empty ⇒ workers read it as binding canon (see D5).
```

**Driver state/mark delta (D6)** — states: `VISUAL` → `FIDELITY_REVIEW` (fires when
`design.screenshot` OR `design.command` is configured, after `author-green`, before
`ITERATE`; `design_source` selects the comparison target, never gates the state); marks
alphabet: `visual-done` and `vision-reviewed` removed from the valid list,
`fidelity-reviewed` added; a legacy sidecar's existing `visual-done` mark satisfies
`FIDELITY_REVIEW` on state derivation (resume compat). The step text branches on
`design_source`: **mock-bound** — screenshot bound regions + mock slices, one expensive-seat
consult (Fable, Opus fallback), divergence list keyed by regionRef; **no-mock** — screenshot
catalog entries and critique against the skeletons + doctrine (today's no-mock `VISUAL`
behavior). Either way the output is iteration-round notes — never a fail-closed verdict,
never a `deltas.json` write by the consult itself.

## Behavior

- **Genesis (D4):** in ratification mode, vocabulary entries come from the winner's position
  brief, doctrine rulings, and signature screens; in legacy mode from the panel outcome +
  doctrine. Base primitives keep their existing seeding; vocabulary entries are additional
  rows in the same file. Phase 4.5 (commit) runs `components-check` and fixes findings
  before `rules-locked`.
- **Design stage (D5):** the session already reads the manifest at preflight (unchanged);
  the new grounding is worker-side — wf-design's Design-canon block names the manifest path
  and binds `boundaries` like token values (contradiction = `blocked {kind: "design-fork"}`).
- **Exit review (D6):** after the wf-design gate returns green and the driver marks
  `author-green`, the driver's next printed step is the fidelity review; its findings enter
  the same iteration loop as user notes (rulings, fixes, or evidence-gated `deltas.json`
  rows through the existing protocol). `--mark fidelity-reviewed` advances to `ITERATE`.
  With no render path configured at all (neither `design.screenshot` nor `design.command`),
  the state never derives and the flow goes straight to `ITERATE`, as today.
- **Atlas sweep (D8):** the sweep prompt cites exemplar mocks by path; each chained dispatch
  (past ~10 gaps) receives the previously-authored mock paths as exemplars so late surfaces
  match early chrome. Sketch-tier artifact contract (data-status, copy register, token
  roles, harness check) is unchanged.

## Acceptance Criteria

- **AC-20260810-01-1**: WHEN `components-check.js` runs on a valid top-level-array manifest
  (e.g. `[{"name":"Chip","purpose":"status"}]`) THE SYSTEM SHALL exit 0; WHEN an entry is
  missing `purpose`, duplicates a `name`, or has a non-array `boundaries` THE SYSTEM SHALL
  exit 1 with one finding line naming the entry and field (e.g. `[{"name":"Chip"}]` →
  exit 1, line contains `Chip` and `purpose`) → tests/components-check.test.js
- **AC-20260810-01-2**: WHEN the manifest path is missing or unparseable THE SYSTEM SHALL
  exit 2 with stderr naming the remedy; WHEN the file is the legacy `{"components": [...]}`
  wrapper THE SYSTEM SHALL warn naming the canonical array form and still validate the
  entries (valid legacy file → exit 0) → tests/components-check.test.js
- **AC-20260810-01-3**: WHEN `spec-paths components-check` runs THE SYSTEM SHALL print the
  script's absolute path (and the usage line lists the key) → tests/components-check.test.js
- **AC-20260810-01-4**: WHEN a spec has `author-green` marked and the host config declares
  `design.screenshot` or `design.command` THE SYSTEM SHALL derive state `FIDELITY_REVIEW`
  until `--mark fidelity-reviewed` — **with or without `design_source`** (a no-mock spec
  with `design.screenshot` configured derives `FIDELITY_REVIEW`, preserving today's no-mock
  visual review) — and the marks alphabet SHALL reject `visual-done`/`vision-reviewed` as
  new marks → tests/design-driver.test.js
- **AC-20260810-01-5**: WHEN a legacy sidecar already contains a `visual-done` mark THE
  SYSTEM SHALL treat `FIDELITY_REVIEW` as satisfied (state advances to `ITERATE`) →
  tests/design-driver.test.js
- **AC-20260810-01-6**: WHEN the AUTHOR step prints the wf-design invocation THE SYSTEM
  SHALL include `componentManifestPath` in the printed args template →
  tests/design-driver.test.js
- **AC-20260810-01-7**: WHEN a spec's status is not `hardened` THE SYSTEM SHALL CONTINUE TO
  derive `BLOCKED`, and WHEN `skeletons.json` is invalid THE SYSTEM SHALL CONTINUE TO derive
  `SKELETONS_INVALID` before any author step, and WHEN `--mark approved` lands THE SYSTEM
  SHALL CONTINUE TO write the coverage ledger → existing assertions in
  tests/design-driver.test.js re-tagged with this AC-ID (green pre-change)
- **AC-20260810-01-8**: WHEN `wf-design.body.js` is read as source THE SYSTEM SHALL carry
  `componentManifestPath` in the args contract comment AND a Design-canon line that makes a
  `boundaries` contradiction a fork (blocked), present only when the path is non-empty
  (source-shape pin via `extractFn`/regex) → tests/design-vocabulary.test.js
- **AC-20260810-01-9**: WHEN doctrine is read THE SYSTEM SHALL state: in
  genesis-design.md, vocabulary seeding in Phase 4.3 and the fail-closed check at commit; in
  shared.md § Design Atlas, the sequential-dispatch sweep ruling; in atlas.md, sequential
  dispatch with exemplar grounding and no parallel per-surface dispatch (regex pins; the
  atlas.md pin fails if `Parallel dispatch` reappears in the sweep section) →
  tests/design-vocabulary.test.js
- **AC-20260810-01-10**: WHEN shared.md § Design Authoring Contracts is read THE SYSTEM
  SHALL define the `boundaries` field and commitment entries, and review.md SHALL include
  commitment entries in the component-manifest near-duplicate comparison (regex pins) →
  tests/design-vocabulary.test.js

## Assumptions (escalation triggers)

- A1: No host file access happens at build time — components-check is verified against
  fixtures in `tmpdir()` only. **if false:** n/a (test mode 1 is the sanctioned pattern).
- A2: The only test pinning the driver's VISUAL state / `visual-done` mark is
  `tests/design-driver.test.js:71-85` (verified by grep at plan time). **if false:** update
  the additional pin in the same batch; the AC-7 regression pins bound what must survive.
- A3: No existing test pins wf-design's HARD_RULES text so tightly that adding the manifest
  line breaks it (grep found body pins only in workflow-guards.test.js/model-placement.test.js,
  neither on HARD_RULES content). **if false:** the pin is updated in the same change — this
  is a doctrine change to worker rules, sanctioned by this spec, not a weakening.
- A4: The v6.48.0 sketch half exists ONLY as uncommitted working-tree changes (committed
  plugin version is 6.47.0; the tree carries sketch.md, plugin.json 6.48.0,
  claims-baseline, roadmap overview). It must be committed before `/spec:build` enters a
  worktree. **if false (tree still dirty at build):** the worktree branches from 6.47.0
  without the sketch half and the claims-baseline conflicts — STOP and ask the user to
  commit v6.48.0 first.
- A5: `design/components.json` in existing hosts follows the prose contract (array-like
  entries with name/purpose); the legacy-wrapper tolerance in AC-2 covers the one plausible
  variant. **if false (some host wrote another shape):** the check's exit-2/exit-1 message
  names the canonical form; driver-side it is advisory, so nothing blocks.
- A6: `npm run build:workflows` + `node spec/scripts/build-workflows.js --check` is the
  regen/verify pair after the body edit (gate command covers `--check`). **if false:** STOP
  — the codegen seam is T3 surface; do not hand-edit `wf-*.js`.

## Rationale

The brief carries a four-agent research ruling; the sketch half already shipped, so this
spec deliberately mirrors its shapes (ruling-date citations, sequential dispatch with
exemplars) rather than inventing parallel ones. The central fork — where the vocabulary
lives — went to the user with "extend `design/components.json`" recommended and confirmed:
the repo's one-home-per-fact rule plus the manifest's existing read/verify seams (design
preflight, review's component-manifest check) made a second registry the clearly worse
option; the accepted cost, mixed committed/landed entries, is handled structurally (absence
of `props`/`mockRefs` marks a commitment entry) rather than with a status enum nobody
maintains. No template file for the manifest is added on purpose: `components-check.js` is
the single schema authority, and a template would be a second home (D2).

The exit-review unification (D6) replaces two mechanisms of different, both-weak strengths
(config-gated VISUAL step; silenceable advisory consult) with one always-offered post-gate
judgment moment — the user confirmed retiring both. It stays judgment-routed-into-iteration,
never a gate script, per the brief's explicit constraint; `fidelity-check.js` (strings) is
untouched. Legacy-mark compat keeps mid-flight sidecars resumable.

Atlas exemption was rejected by the user: the greenfield full sweep is the pass whose whole
point is cross-screen coherence, so it adopts the sketch contract, with the ruling recorded
once in shared § Design Atlas so atlas.md and future commands cite one home; sketch.md is
not re-opened (brief Out of scope). Brownfield derivation (D10) and the CHI DOI (D9) were
resolved conservatively as recorded.

Refuter findings (one Sonnet refuter, T2): (1) stale version claim in A4 — fixed (committed
is 6.47.0, tree carries 6.48.0 uncommitted); (2) conditioning `FIDELITY_REVIEW` on
`design_source` would have silently dropped the no-mock visual review that
`design.screenshot` hosts have today — fixed in D6/Contracts/AC-4: the render path gates the
state, the mock only selects the comparison target; (3) the retired advisory vision-review
mechanism has a live scaffold-ledger row that must be marked RETIRED — fixed in the File
Plan row; (4) "single doctrine home" only half-applies while sketch.md keeps its own inline
dispatch prose — **partially rejected**: editing sketch.md is fenced off by the brief's
binding Out of scope ("shipped in v6.48.0; do not re-open"); instead the shared ruling is
phrased to subsume both shapes and sketch's inline copy stands as sanctioned test-pinned
redundancy until a touch-time dedup (D8).

Fragile spots to watch during execution: the driver state derivation
order (AC-4/5/7 pin it), and the claims baseline — every doctrine row here changes line
counts, so the D11 regeneration must land in the same change.

## Canonical Delta

`docs/canonical/design.md` (create if absent): add a "Component vocabulary" section — the
product's committed building blocks live as commitment entries in `design/components.json`
(`name`, `purpose`, `boundaries`), seeded by `/spec:genesis-design` on visual-archetype
greenfield, validated by `components-check` (fail-closed at genesis, advisory at design
preflight), consumed as binding canon by `wf-design` workers via `componentManifestPath`,
and included in `/spec:review`'s near-duplicate comparison. Add an "Exit fidelity review"
paragraph: after the design gate passes, one expensive-seat render-vs-mock review
(`FIDELITY_REVIEW` state, `fidelity-reviewed` mark) routes findings into the iteration loop;
it replaced the VISUAL step and the advisory vision consult (ruled 2026-08-10). Add one
line: atlas gap sweeps author sequentially with exemplar grounding, never parallel
per-surface (same ruling).
