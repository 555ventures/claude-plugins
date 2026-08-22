---
description: Drift check of the grounding layer — verifies config, agents, rules, activation, and cited references against the installed plugin and the current codebase; recommends targeted patches or a /spec:init refresh. --fix applies evidence-cited line-item repairs with per-patch approval
argument-hint: [focus area, optional — e.g. "agents" or "design"] [--fix]
---

# Spec Doctor: Grounding-Layer Drift Check

The grounding layer (`/spec:init`'s output) goes stale two ways: the **plugin updated**
(contracts changed under it) or the **codebase drifted** (cited paths, commands, and
conventions moved on). This command detects both, cheaply. It is a **diagnosis, not a
treatment**: report first; apply only targeted patches the user approves; recommend a full
`/spec:init` refresh for structural drift. Never regenerate wholesale, never touch files
outside the grounding layer. With `--fix`, the targeted-patch path extends to doctrine
repair (below) — still evidence-cited, still per-patch approved, never structural.

**Intended model: Sonnet.** Run `spec-paths shared-for doctor` and read its output. If
`.claude/spec.config.json` is missing entirely, STOP — the repo was never initialized; the
answer is `/spec:init`, not a drift report.

## Checks — deterministic first

Run with Bash/Read/Glob; each produces pass / fail-with-evidence (`file:line`):

1. **Config integrity** — `.claude/spec.config.json` parses; required keys present per the
   contract file's § Required config keys; legacy keys (`storybook: true`,
   `storybookCommand`) flagged for migration to the `design` block.
2. **Contract stamp** — config `contractHash` equals `$(spec-paths contract-hash)`. A
   mismatch is a lead, not a verdict — checks 3–6 test the *current* contract (Read
   `$(spec-paths contract)`) directly and decide whether the drift is real. Also flag an
   absent `capabilities` block ("CI observation and skip accounting run on assumptions —
   /spec:init refreshes"), and a declared `forge: "none"` when `git remote -v` shows GitHub
   and `gh` resolves.
3. **Agent roster** — every non-`default` `agentMap` value has a matching
   `.claude/agents/*.md` whose frontmatter `name:` is exactly that value; no orphan agents
   claiming pipeline kinds. **Routing coverage:** every layer in `layerGroups` (plus `tests`
   and `other`) resolves to a kind via `routing`/`agentMap` or falls to `default` — a layer
   no kind claims breaks `/spec:build` dispatch.
4. **Worker Contract text** — each generated agent's `## Worker Contract (spec pipeline)`
   section is byte-identical across agents (allowing only the sanctioned self-verify command
   substitution) and matches the contract file's § Worker Contract block; the `tests`-kind
   agent carries the § Tests-kind addendum.
5. **Pipeline rules shape & scoping** — the file at `pipelineRules` exists with all seven
   contract-required sections and opens with the `paths:` frontmatter § Session grounding
   requires. Sweep every `.claude/rules/**/*.md` carrying `paths:` frontmatter: each glob
   must match ≥1 tracked file — a zero-match glob is a rule that silently never loads.
6. **Scripts & commands** — `patternsScript` exists, is executable, exits 0; `driftScript`
   (if declared) exists; each command referenced by `gateCommand` / `testCommand` /
   `setupCommand` / `design.command` / `design.screenshot` resolves by name (never run the
   gate here). Session grounding: `.claude/settings.json` parses; its `permissions` allow
   entries still resolve; a *missing* deny on `.env*` reads is a flag;
   `.claude/skills/run/SKILL.md` exists and agrees with the config `runtime` block.

6b. **Activation (authored ⇒ activated)** — verification infrastructure must demonstrably
   execute, not merely exist (core § Runtime Verification):
   - `.claude/spec-manifest.json` exists and `bash $(spec-paths manifest-check)` exits 0 — a
     missing manifest means init predates the activation contract (recommend refresh); a
     failing one lists exactly which authored protections are inert.
   - config declares a `runtime` block (`bootCommand`+`readyCheck`, or explicit `inert` with
     reason) — without one every review's smoke leg is a hard finding.
   - if the repo carries CI config: `git remote -v` is non-empty OR the manifest has an
     `inert` row declaring CI local-only.
   - every suite-gating env var has a provisioning path: run
     `node "$(spec-paths env-preflight)" --root . --rules <pipelineRules>` (registry↔prose
     cross-check only); exit 3 flags each declared `testEnv` variable absent from § Test
     Rules. The reverse direction (§ Test Rules names variables, no `testEnv` registry) is a
     one-line legacy-drift note recommending refresh.
   - **enforcement claims in host docs resolve** — grep `docs/adr/` and `docs/canonical/`
     for enforcement-claim phrases (`CI-verified`, `enforced by`, `gated by`, `checked in
     CI`); each must map to a check that actually resolves in the `gateCommand`, CI config,
     or the enforcement manifest. Presence only — never judge whether the check is good.
7. **Cited references** — extract repo paths cited in the pipeline rules file, the
   convention rule files, and each generated agent; verify each exists. Extract **bare
   filenames too** (`scaffold-ledger.md`, `helpers.js` — a citation with no directory
   prefix), resolving each against the file set its sentence implies; a path-shaped regex
   alone silently passes every directory-less reference, which is how a rule citing a file
   deleted five days earlier survived a full sweep (2026-08-21). Stale citations are the
   most common drift and are individually patchable.
8. **Design foundation** (only if the config has a `design` block) — `design.doctrine`
   exists and is ~one page; token files and the living-showcase entry it names exist.
9. **Genesis handoff** (only if `.claude/genesis/status.json` exists) — the consume-side
   contract is intact: `genesisStackDescriptor` (when recorded) exists and parses;
   `design-rules.json` hash matches `designRulesHash` (mismatch → "re-run /spec:enforce");
   every design rule's `targetCategory` is in the reserved design set
   (`color | typography | i18n | structure | a11y | density | layout`); each encodable
   dimension is tokenized or recorded DEFERRED in the doctrine `## Dissents`; every
   `docs/adr/*.md` and the design doctrine has a `## Dissents` section (presence only).
10. **Rule enforcement** (only if the config has an `enforcementManifest`) — recompute the
    manifest hash vs `rulesEnforcementHash` (mismatch → "re-run /spec:enforce"); every
    entry's `category` is in the reserved taxonomy; each entry's enforcer wiring still
    resolves (config/checker path exists and the `gateCommand` or hook orchestrator invokes
    it) or the entry records a `sweep`/`review-check` fallback; a `duplication`/`cycle`
    entry whose `baseline.path` is missing fails the same way. Never re-derive an enforcer
    here — recommend `/spec:enforce`.
11. **Spec-dir hygiene** — sweep `specs/**`:
    - frontmatter `status` ∈ `draft | hardened | implementing | done | superseded`
      (`superseded` is terminal and silent by design — never flag one);
    - an `implementing` spec carrying `build_base:` is stale when its build branch — derived
      by `node $(spec-paths merge-back) branch-for <spec path>` — does not exist (in-place
      builds, `build_base` absent, are skipped);
    - a `hardened`/`implementing`/`done` spec containing a live `[NEEDS CLARIFICATION:`
      marker (colon form) is broken;
    - an orphaned design sidecar (`specs/**/*.design/` with no sibling spec mid-design) is
      leftover transient state — recommend removing it.
12. **Run ledger hygiene** (only if `.claude/spec-runs.jsonl` exists) — script passes
    (`jq`/`awk`), never read the ledger into context. Every line parses as JSON with `stage`
    ∈ `build | review | escape | observe | release` (`observe` rows are a retired v6 class —
    valid history, no longer written). Field expectations are per-class: v7 build and review
    rows carry no `runId` (older rows may; a `runId`-bearing row is history, never a flag);
    escape and release rows carry their own field sets. The file is tracked by git, and
    `git check-attr merge -- .claude/spec-runs.jsonl` reports `union` (without it, parallel
    worktree builds conflict at merge-back — init sets the `.gitattributes` entry). A line
    over ~1000 chars is an advisory tripwire ("long but well-formed — inspect for prose
    leak"), never a standalone broken finding. Year archives
    (`.claude/spec-runs-<year>.jsonl`) get the same checks; suggest archiving whole years
    past ~2 MB. **Tier distribution:** with ≥5 build rows, if ≥90% share one tier, flag it —
    a tier system that always answers `critical` (or always `standard`) has stopped
    discriminating. **Escapes** (`stage:"escape"` rows) — jq correlations, flag loudly:
    - an escape correlated to a review row with `verdict:"CLEAN"` (via `reviewRunId` on
      legacy rows, else same-spec latest prior review row) is a **contradicted CLEAN** —
      the review passed a real defect; report per-spec;
    - with ≥10 CLEAN review rows and zero escape rows, report that too — absence of escapes
      is only meaningful if escapes are being recorded; note when zero escape rows exist;
    - an escape with `"preventedBy":"doctrine"` whose named change has not landed is an
      **open repair** (`--fix` input); `preventedBy:"enforcer"` with no matching
      enforcement-manifest entry means `/spec:enforce` is due.
    **Plugin-defect roll-up:** collect `[plugin]`-tagged Gotchas entries into one "upstream
    bug report" block (entry + citation, verbatim) — offer to write them as a feedback brief
    (`docs/spec-feedback/<YYYYMMDD>-brief.md` from `spec-paths feedback-template`).
13. **Roadmap derivation** (only if `docs/roadmap/00-overview.md` exists) — run
    `node "$(spec-paths spec-status)" --root . --json` (the one derivation, shared with
    `/spec:status` and `/spec:plan`'s preflight). Report its derived table and surface every
    `anomalies` entry: `orphan-stamp` and `hand-tracked-status` as findings;
    `skipped-spec`/`skipped-brief`/`out-of-order`/`unknown-dependency` prominently as info —
    the roadmap may have been deliberately reordered.
14. **CI-gate parity** (deterministic, advisory) — run
    `node "$(spec-paths ci-gate-parity)" --root .`. It owns the whole algorithm and
    self-gates on `.github/workflows/` existing. A non-zero exit means the host's CI does
    not invoke the configured `gateCommand`; report each printed line as advisory — remedy =
    make one CI step run the `gateCommand` verbatim.
15. **Citation integrity** (deterministic, advisory) — run
    `node "$(spec-paths citations-check)"` against the repo. Each MISS line (file, line,
    cited heading, resolved doctrine file) is a stale-citation finding; the `--verbose` SKIP
    list is informational only.

## Semantic spot-check — small, bounded

For 2–3 agents (prioritize any with stale citations), read one cited exemplar each and judge
whether the conventions the agent describes still match the real code. The only judgment
call in the run; never expand into a full re-profile.

## Repair mode (`--fix`) — targeted doctrine repair at the pipeline's evidence bar

Without `--fix`, doctor stays read-only (targeted patches still require explicit approval).
With `--fix`, doctor may additionally repair **factually wrong doctrine** — a generated
grounding entry that teaches a verified bug. The bar, per patch — all three, no exceptions:

1. **Evidence at the pipeline's own standard:** a reproducing command or file:line citation
   proving the current text wrong ("seems outdated" does not qualify). For
   dependency-adjudicated claims, run the one falsifying line now.
2. **Batched `AskUserQuestion` approval, ≤4 patches per call** — each patch shows its exact
   before → after text and evidence; every patch needs its own explicit yes.
3. **Scope: line-item only, inside the grounding layer** (pipeline rules file, convention
   rules, generated agents, generated skills, the settings `permissions` block, config
   values, `scripts/spec-patterns.sh`). Structural drift is `/spec:init`'s job — `--fix`
   refuses it and says why.

After patching: re-run the affected checks, re-stamp `contractHash`/`generatedBy`, and
append the correction as a Gotchas entry citing the evidence.

## Report & recommendation

Assemble slots (core § Console Output Style) — per finding, one plain-language line stating
what's wrong and what it affects — and render via
`node "$(spec-paths report-render)" --slots <file>`, printing verbatim:

- `outcome`: ✅ `grounding healthy` / ⚠️ `{N} stale` / 🚫 `broken — {what}`.
- `warns`: one `stale: {what — what it affects}` line per stale finding.
- `blocks`: one `broken: {what — what it affects}` line per broken finding.
- `next`: the single recommendation below.

```report
⚠️ **2 stale**
⚠️ stale: review.md cites a deleted § heading — the citation silently drops at render time
⚠️ stale: an `agentMap` entry has no matching `.claude/agents/*.md` — batch dispatch for that kind fails silently

Next: apply the 2 targeted patches above (per-patch approval via AskUserQuestion)
```

Close with exactly one recommendation: **clean** (offer a re-stamp if only check 2 failed) ·
**targeted patches** (enumerated, user-approved, re-check after) · **enforcement drift**
(checks 9–10 → recommend `/spec:enforce`) · **structural drift** (→ recommend `/spec:init`,
naming the findings that drove the call).

## Rules

- Read-only by default; every edit is user-approved, targeted, and inside the grounding
  layer. `--fix` widens what may be patched, never who approves or where.
- Never run the host's `gateCommand`/`testCommand`/`setupCommand` — verify they resolve
  (exceptions: `manifest-check` in the activation check; a single falsifying line when
  `--fix` evidence demands it).
- Re-stamp `contractHash`/`generatedBy` only when every current-contract check passes.
- `AskUserQuestion` dismissed → STOP.
