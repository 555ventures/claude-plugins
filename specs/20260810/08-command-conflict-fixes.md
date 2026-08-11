---
date: 2026-08-10
status: hardened
risk: T2                 # doctrine prose + pinned tests; no T3-trigger file touched (doctor/review/build/plan/release/init/genesis-design prose + spec template)
area: cross-cutting
design: false
breaking: false
depends_on: [20260810/07-per-sha-ci-legs]   # overlapping File Plan files: review.md, release.md, doctor.md
depended_on_by: [20260810/09-stale-reference-sweep]
brief: n/a               # audit-driven fix wave (command-surface audit 2026-08-10); no roadmap brief warranted
open_markers: 0
---

# Command conflict fixes: where two doctrine surfaces send an orchestrator two ways

## Goal

The 2026-08-10 command-surface audit (four blind auditors over all spec/git commands) found
twelve places where two doctrine passages, or doctrine and a script, give an orchestrator
contradictory instructions — including three that JJ ruled on in the planning interview
(T2 pipeline entry, release invocation, in-place diff base). After this spec: each of the
twelve has exactly one authoritative behavior, stated where it is consumed, pinned by a test.
Done means an orchestrator following any one passage cold cannot diverge from an orchestrator
following its counterpart.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | plan.md Phase 0 tier step: the T2/T3 branch splits. T3 → proceed (unchanged). T2 → apply shared.md § Pipeline Entry before proceeding: a spec is written only when the work needs **delegation** or **durability**; otherwise STOP with the direct-work message (mirror the existing T1 STOP wording, citing the host gateCommand). shared.md is the authority; plan.md aligns to it. | JJ ruling 2026-08-10: "delegation/durability only" — the pipeline is opt-in heavy machinery; a small direct-work T2 must not buy full pipeline spend. |
| D2 | review.md splits the symbol: `{root}` is bound at first use in Phase 0 — "the working tree under review — the session's current toplevel (`git rev-parse --show-toplevel`); for a worktree build that is the worktree itself" — and **Phase 4 introduces a second, distinctly named symbol `{mainRoot}`** = the last stdout line of `{mergeBack} root --worktree {worktree}` (the main project tree), resolved at the top of Phase 4 **before step 1**, because Phase 4's inspect and strategy steps run before the session relocates. Every Phase-4 consumer that structurally needs the main tree (`{mergeBack} inspect/merge/cleanup/verify --root …`, the `git -C … add` of the close commit, `observe-ci --root …`, the terminal `spec-status --root … --next`) switches to `{mainRoot}`; Phase 0–3 keep `{root}`. The old Phase-4 sentence defining `{root}` as the main tree is deleted. | Refuter-demonstrated: a single Phase-0 binding hands Phase 4's eleven main-tree consumers the worktree path (inspect/strategy run pre-relocation), breaking merge-back for exactly the worktree case; two senses need two names, each resolved where its consumers live. |
| D3 | In-place builds get a durable diff base: build.md Phase 0 step 4 replaces "record `git rev-parse HEAD` now" with **writing `diff_base: <that sha>` into the spec frontmatter** (before any build edit, same edit that flips status). spec/templates/spec.md gains the commented field (`# diff_base: <sha>  # set by /spec:build for in-place builds; read by /spec:review as the diff base when build_base is absent`). review.md step 1 recovery order becomes: `build_base` (worktree build, unchanged) → `diff_base` (in-place build: diff `{diff_base}..HEAD`; merge-back still no-ops) → current-branch-name fallback (legacy specs only, existing self-check wording kept). | JJ ruling 2026-08-10: spec-file recording — same disk-recovery pattern review already trusts for `build_base`; closes the empty-diff/false-CLEAN path (in-place builds checkpoint-commit, so post-build the branch-name fallback diffs HEAD against itself). |
| D4 | review.md's "recorded by /spec:build" attribution for `build_base` (Phase 4 region) is corrected to `/git:enter-worktree` — matching build.md's own "Build never writes build_base" and review.md's own step 1. | Same-file self-contradiction; single-writer facts must name the writer correctly everywhere. |
| D5 | doctor.md check 11's stale-implementing sub-check is re-keyed to the **build branch**: derive `spec/<spec-filename-stem>` (the literal rule enter-worktree.md step 1 and merge-back create apply — filename sans directory and extension). A spec is stale when `status: implementing` AND frontmatter has `build_base:` AND the derived `spec/<stem>` branch does not exist in the repo. In-place builds (no `build_base`) are skipped by this sub-check. The current test — "`build_base:` branch no longer exists" — is deleted, not kept alongside. | The audit showed the current check tests the *originating* branch, which nearly always exists, so the stale class it exists for can never fire; the build branch is derivable, so nothing new needs recording. |
| D6 | doctor.md check 11's status enum becomes `draft \| hardened \| implementing \| done \| superseded`, with `superseded` noted as terminal-and-silent (template + spec-status.js already sanction it). | Without it, every correctly retired spec is flagged and the recommended fix would un-retire it — the 2026-08-01 daily-nag incident class, one command over. |
| D7 | doctor.md check 12: (a) the prose-leak threshold moves from ~600 to **~1000 chars** with a note that review.md's mandated verbatim ledger row lands ~600–650 with ordinary values; (b) the required-field exemption enumerates all sanctioned classes, not just `observe`: `observe` rows (existing text), **fast-path build rows** (`"fastPath":true`, no `runId` — build.md's fast path), **escape rows** and **release rows** (their own field sets; no `runId`, release rows carry `milestone`/`briefs` instead). Parse/stage-enum/line-length/git-tracked hygiene stays universal. | A fully conforming review row must not be flagged by the hygiene check that exists to protect the format; three sanctioned row classes were flagged as violations by the literal text. |
| D8 | release.md gains one sentence at the top of its invocation/Phase 0 region: releasing is **deliberately user-invoked** — no command's Next pointer and no `spec-status --next` derivation ever suggests it; the human decides when a milestone ships. | JJ ruling 2026-08-10: the routing gap is by design; one line converts an audit anomaly into stated doctrine at zero behavior change. |
| D9 | init.md Phase 6 gains a fourth genesis branch: `.claude/genesis/status.json` present with `design` value `pending` (or any value outside the three existing arms) → **warn and proceed** (matching genesis.md's gate: "warned, proceeds"): write **no** `design` block, name `/spec:genesis-design` as the pending finisher in the warning and in the Phase 7 report, and never run the adopt/craft question. | The state the genesis gate explicitly waves through had no arm, so orchestrators improvised; adopt/craft there mints a second canon that genesis-design later contradicts. |
| D10 | genesis-design.md's header model seat reads **Opus** (drop "Fable or"), matching its own Phase 4, its Rules, and shared.md § Model Placement (genesis design-doctrine authoring stays an Opus seat). | Self-contradiction inside one file; shared.md is the placement authority. |
| D11 | genesis-design.md's terminal Next pointer inserts the atlas sweep stage: `Next: /spec:atlas (sweep + holistic review of the genesis mocks) → /spec:init`. Wording stays a pointer — atlas owns its own procedure. | The stage exists in architect's chain and shared.md but no local Next pointer reached it, so it silently dropped for users following the pointers. |
| D12 | spec plugin version bumps by one minor at build time — **expected 6.51.0 → 6.52.0**, but the binding rule is *then-current version + one minor*: hardened siblings 06 and 07 both claim 6.50.0 → 6.51.0 with no mutual ordering (refuter-found on sibling 10; pre-existing), so the literal number shifts with landing order. Description gains a "command-consistency fix wave (conflicts)" clause. | The bump is the discipline; a literal a sibling can invalidate is not executable verbatim. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/plan.md | MODIFY | doctrine | D1: T2 Pipeline-Entry gate in the tier step |
| spec/commands/review.md | MODIFY | doctrine | D2 `{root}` binding at first use; D3 `diff_base` recovery step; D4 build_base attribution |
| spec/commands/build.md | MODIFY | doctrine | D3: Phase 0 step 4 writes `diff_base:` frontmatter for in-place builds |
| spec/templates/spec.md | MODIFY | doctrine | D3: commented `diff_base:` field with writer/reader note |
| spec/commands/doctor.md | MODIFY | doctrine | D5/D6 check 11 re-key + enum; D7 check 12 threshold + exemption classes |
| spec/commands/release.md | MODIFY | doctrine | D8: user-invoked-by-design sentence |
| spec/commands/init.md | MODIFY | doctrine | D9: Phase 6 fourth genesis arm (`pending` → warn, no design block) |
| spec/commands/genesis-design.md | MODIFY | doctrine | D10 header seat → Opus; D11 Next pointer inserts atlas sweep |
| tests/consistency/conflict-fixes.test.js | CREATE | tests | AC-20260810-08-1 … AC-20260810-08-10 |
| spec/doctrine/claims-baseline.json | MODIFY | other | `node "$(spec-paths claims-lint)" --update-baseline` after doctrine edits (review-check requirement) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D12: bump 6.51.0 → 6.52.0 + description clause |

## Behavior

- **Claims registry:** every edited blocking-consequence line keeps/gains its
  `<!-- enforcedBy: ... -->` marker per shared.md § Doctrine Authoring; the baseline row in
  the File Plan is mandatory (doctrine line counts change).
- **D3 read path, spelled out for the test author:** a fresh review session on an in-place
  build reads frontmatter top-to-bottom: `build_base` absent → `diff_base` present → diff is
  `git diff {diff_base}..HEAD`; merge-back inspect is skipped exactly as today's absent-
  `build_base` path skips it. Only when both fields are absent does the branch-name fallback
  (and its loud merge-back self-check) apply.
- **D5 derivation example:** `specs/20260810/07-per-sha-ci-legs.md` → stem
  `07-per-sha-ci-legs` → build branch `spec/07-per-sha-ci-legs`.

## Acceptance Criteria

- **AC-20260810-08-1**: WHEN tests read plan.md's tier step THE SYSTEM SHALL find, in the T2
  branch, both the words "delegation" and "durability" and a `§ Pipeline Entry` citation, and
  SHALL find a STOP path for T2 work meeting neither criterion → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-2**: WHEN tests read review.md THE SYSTEM SHALL find a `{root}` binding in
  Phase 0 (before step 1's first `{root}` use) containing "working tree under review", SHALL
  find `{mainRoot}` resolved via `{mergeBack} root` at the top of Phase 4 before its step 1,
  SHALL find every `{mergeBack} inspect/merge/cleanup/verify` invocation in Phase 4 taking
  `--root {mainRoot}` (zero taking `--root {root}`), and SHALL find no sentence defining
  `{root}` as the main working tree → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-3**: WHEN tests read build.md Phase 0 and spec/templates/spec.md THE
  SYSTEM SHALL find `diff_base` written to spec frontmatter before any build edit (build.md)
  and a commented `diff_base:` template field naming `/spec:build` as writer and
  `/spec:review` as reader → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-4**: WHEN tests read review.md step 1 THE SYSTEM SHALL find the recovery
  order `build_base` → `diff_base` → branch-name fallback, with `diff_base` diffed as
  `{diff_base}..HEAD` → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-5**: WHEN tests read doctor.md check 11 THE SYSTEM SHALL find the stale-
  implementing rule keyed to a derived `spec/<stem>` build branch conditional on `build_base:`
  presence, SHALL find `superseded` in the status enum, and SHALL NOT find the old
  "`build_base:` branch no longer exists" test → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-6**: WHEN tests read doctor.md check 12 THE SYSTEM SHALL find the ~1000-char
  threshold and the exemption enumeration naming fast-path build rows, escape rows, and
  release rows alongside observe rows → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-7**: WHEN tests read release.md THE SYSTEM SHALL find one sentence stating
  release is user-invoked by design and never suggested by `--next`/Next pointers →
  tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-8**: WHEN tests read init.md Phase 6 THE SYSTEM SHALL find a genesis arm
  for `pending`/unrecognized `design` values that warns, writes no design block, names
  `/spec:genesis-design`, and never runs adopt/craft → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-9**: WHEN tests read genesis-design.md THE SYSTEM SHALL find no "Fable or
  Opus" seat claim in the header region and SHALL find `/spec:atlas` in the terminal Next
  pointer before `/spec:init` → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-10**: WHEN tests read review.md's Phase 4 region THE SYSTEM SHALL CONTINUE
  TO find merge-back driven by `build_base` as the merge target, now attributed to
  `/git:enter-worktree` (never `/spec:build`) → tests/consistency/conflict-fixes.test.js
- **AC-20260810-08-11**: WHEN tests read doctor.md check 12 THE SYSTEM SHALL CONTINUE TO flag
  oversize ledger lines as prose leaks and require the ledger to be git-tracked (the hygiene
  purpose survives the threshold move) → tests/consistency/conflict-fixes.test.js

## Assumptions (escalation triggers)

- A1: `spec-status.js` derives statuses without validating a frontmatter field allowlist, so
  the new `diff_base:` field is inert to it — **if false** (it rejects unknown fields):
  blocked; the field name is negotiable, the durable-recording decision is not.
- A2: The spec-state-gate hook greps frontmatter only for `status`/`open_markers`, so
  `diff_base` cannot trip it — **if false:** blocked, consult retainer before renaming.
- A3: No existing test pins doctor.md's ~600-char literal or check 11's `build_base`-branch
  wording (`grep -rn "600 chars\|build_base.*no longer exists" tests/` returned only doctor.md
  itself at plan time) — **if false:** the pinning test is updated in the same row pair; if it
  carries an incident header, that is a doctrine change requiring escalation per pipeline
  rules § Build.
- A4: Spec 07 lands first (`depends_on`), so this spec's review.md/release.md/doctor.md edits
  rebase onto 07's per-SHA CI text — **if false** (07 abandoned): drop the dependency; no edit
  here touches 07's regions.

## Rationale

Slice 1 of a three-spec fix wave from the 2026-08-10 command-surface audit (35 findings; the
consolidated report with file:line citations lived in the planning session's scratchpad —
findings are restated here in full, so no external artifact is load-bearing). This spec takes
the **behavior conflicts**: places where two surfaces disagree and an orchestrator must pick.
Sibling 09 takes dead references; sibling 10 takes drifted duplicates.

Three decisions were JJ interview rulings (D1, D3, D8), all landing on the recommended
option. D5's re-key was chosen over "record the build branch in frontmatter" because the
branch is already derivable from the filename rule enter-worktree and merge-back both apply —
recording it would add a second writer surface for a derivable fact. D7 raises a threshold
rather than exempting review rows by stage because the leak check's value is universality;
the audit's arithmetic (conforming row ≈ 600–650 chars) makes ~1000 a floor that still
catches real prose. D9 deliberately writes no design block rather than deferring to
adopt/craft: genesis.md's gate already promises "warned, proceeds", and a second canon is the
worse failure. The audit's finding that release.md Phase 2 promises an impossible `GATE_RED`
on early stop is **not here** — it was folded into locked spec 07's D4 (amended this session),
whose build edits that exact region.

Adversarial check (1 refuter, T2): one critical finding, accepted and folded — D2 as first
drafted bound `{root}` once, which would have handed Phase 4's eleven main-tree consumers
(merge-back inspect/merge/cleanup/verify, the close-commit add, observe-ci, the terminal
status call) the worktree path, since inspect and the strategy ask run before the session
relocates; fixed by introducing `{mainRoot}` (resolved via `{mergeBack} root --worktree`)
for Phase 4 and hardening AC-2 to assert the consumers, not just the binding sentences.
All other decisions were verified against live files with no defect (check-11 wording,
branch-rule derivation, diff_base non-collision with spec-status.js/spec-state-gate.sh,
plan.md tier region, genesis arms, atlas chain, version base 6.51.0). Nothing rejected.

## Canonical Delta

None — `docs/canonical/` does not exist in this repo; the plugin's doctrine files are the
canonical surface and are edited directly.
