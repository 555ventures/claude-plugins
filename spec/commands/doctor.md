---
description: Read-only drift check of the grounding layer — verifies config, agents, rules, and cited references against the installed plugin and the current codebase; recommends targeted patches or a /spec:init refresh
argument-hint: [focus area, optional — e.g. "agents" or "design"]
---

# Spec Doctor: Grounding-Layer Drift Check

The grounding layer (`/spec:init`'s output) goes stale two ways: the **plugin updated**
(grounding-layer contracts changed under it) or the **codebase drifted** (cited paths,
commands, and conventions moved on). This command detects both — cheaply, without the deep
re-profile `/spec:init` runs. It is a **diagnosis, not a treatment**: report first; apply
only targeted patches the user approves; recommend a full `/spec:init` refresh for
structural drift. Never regenerate wholesale, and never touch files outside the grounding
layer.

**Intended model: Sonnet.** Run `spec-paths shared` and Read that file first. If
`.claude/spec.config.json` is missing entirely, STOP — the repo was never initialized;
the answer is `/spec:init`, not a drift report.

## Checks — deterministic first

Run these with Bash/Read/Glob; each produces pass / fail-with-evidence (`file:line`):

1. **Config integrity** — `.claude/spec.config.json` parses; required keys present per the
   contract file's § Required config keys; legacy keys (`storybook: true`,
   `storybookCommand`) flagged for migration to the `design` block.
2. **Contract stamp** — config `contractHash` equals `$(spec-paths contract-hash)`. A
   mismatch is a lead, not a verdict — checks 3–6 below test the *current* contract (Read
   `$(spec-paths contract)`) directly and decide whether the drift is real.
3. **Agent roster** — every non-`default` `agentMap` value has a matching
   `.claude/agents/*.md` whose frontmatter `name:` is exactly that value; no orphan agents
   claiming pipeline kinds. **Routing coverage:** every layer in `layerGroups` (plus `tests`
   and `other`) resolves to a batch kind via `routing`/`agentMap` or falls to `default` — a
   layer no kind claims is the drift that breaks `/spec:build` batch dispatch.
4. **Worker Contract text** — each generated agent's `## Worker Contract (spec pipeline)`
   section is byte-identical across agents (allowing only the sanctioned self-verify command
   substitution) and matches the contract file's § Worker Contract block; the `tests`-kind
   agent carries the § Tests-kind addendum.
5. **Pipeline rules shape** — the file at `pipelineRules` exists and has all six sections
   the contract file requires.
6. **Scripts & commands** — `patternsScript` exists, is executable, exits 0; `driftScript`
   (if declared) exists; each command referenced by `gateCommand` / `testCommand` /
   `setupCommand` / `design.command` / `design.screenshot` resolves (script names exist in
   `package.json` / `Makefile` / `pyproject.toml` — verify the *names*, don't run the gate).
7. **Cited references** — extract repo paths cited in the pipeline rules file and in each
   generated agent (Reference Material, exemplars, naming-table examples); verify each
   exists. Stale citations are the most common drift and are individually patchable.
8. **Design foundation** (only if the config has a `design` block) — `design.doctrine`
   exists and is ~one page; token files and the living-showcase entry it names exist.
9. **Genesis handoff** (only if `.claude/genesis/status.json` exists) — verify the consume-side
   contract is intact. If the config records `genesisStackDescriptor`, that path must exist and
   parse as JSON (a recorded pointer to a missing descriptor is broken, not stale). Then:
   - **Design-rules drift** — recompute the hash of `.claude/genesis/design-rules.json`; warn if it
     differs from the config's `designRulesHash` ("design rules changed but enforcement was not
     regenerated — re-run `/spec:enforce`").
   - **Category enum** — every design rule's `targetCategory` is one of the reserved design set
     (`color | typography | i18n | structure | a11y | density | layout`); an unknown category is broken.
   - **Encodable-dimension closure** (visual archetypes) — each baseline encodable dimension
     (color roles, type scale, spacing rhythm, radii/elevation, focus ring, min target size) is
     either materialized in the `tokensConsumed` surface as named roles **or** recorded
     DEFERRED-with-reason in the doctrine `## Dissents`. A dimension that is prose-only or absent
     from both — values described in doctrine with no backing token, or a baseline family simply
     missing — is the type-scale failure signature (the genesis canon that shipped without a
     `--text-*` scale); flag it and recommend the gap be tokenized (a `/spec:design` foundation
     spec, or a token + `/spec:enforce` pass). This is the backstop genesis couldn't run — it has
     the rendered tree genesis lacked.
   - **Dissents presence** — each `docs/adr/*.md` and the design doctrine contains a
     `## Dissents` section (a grep — presence only, never judge its content).

10. **Rule enforcement** (only if the config has an `enforcementManifest`) — verify the
    deterministic enforcement `/spec:enforce` generated is still live:
    - **Enforcement drift** — recompute the hash of `.claude/rules/enforcement.json`; warn if it
      differs from the config's `rulesEnforcementHash` ("enforcement manifest changed but the
      stamp is stale — re-run `/spec:enforce`").
    - **Category enum** — every manifest entry's `category` is one of the reserved taxonomy
      (`module-boundary | naming | forbidden-symbol | structural-pattern | datetime |
      schema-validation | format`); an unknown category is broken.
    - **Wiring resolves** — for each entry, the recorded enforcer's config/contract/checker path
      exists and the `gateCommand` (or the host hook orchestrator) still invokes it, OR the entry
      records a `sweep`/`review-check` fallback. An entry whose wiring no longer resolves is the
      early-detection signal — recommend re-running `/spec:enforce` (do **not** try to re-derive
      the enforcer here; tool selection is enforce's job, and naming a tool in the doctor would
      anchor it the same way the plugin prose deliberately avoids).

11. **Spec-dir hygiene** — sweep `specs/**`:
    - frontmatter `status` of every spec is one of `draft | hardened | implementing | done`;
    - an `implementing` spec whose `build_base:` branch no longer exists in the repo is stale
      (the build branch was merged or deleted without `/spec:review` closing the spec);
    - a `hardened`/`implementing`/`done` spec containing a live `[NEEDS CLARIFICATION:` marker
      (colon form — the open-marker sentinel; bracketed narration without the colon is fine)
      is broken (it should have been impossible to lock);
    - an orphaned design sidecar (`specs/**/*.design/` with no sibling spec mid-design — spec
      already `done`, or `designed:` set) is leftover transient state `/spec:design` Phase 4
      should have deleted; recommend removing it.

12. **Run ledger hygiene** (only if `.claude/spec-runs.jsonl` exists) — every line parses as
    JSON with a `stage` of `build | review`; any line over ~600 chars is a prose leak
    (the ledger holds counts/enums/paths only — build.md/review.md define the shape); the
    file is tracked by git (an ignored or untracked-and-stale ledger defeats its purpose).
    All checks are script passes (`jq`/`awk`) — never read the ledger into context. If the
    file somehow exceeds ~2 MB, that is years of entries or a leak: report it and suggest
    archiving whole years to `.claude/spec-runs-<year>.jsonl` (same shape, still committed).

## Semantic spot-check — small, bounded

For 2–3 agents (prioritize any with stale citations), read one cited exemplar each and
judge whether the conventions the agent describes (naming tables, layer constraints) still
match the real code. This is the only judgment call in the run; everything above is
mechanical. Do not expand into a full re-profile.

## Report & recommendation

Group findings as **clean / stale (with evidence) / broken**, then close with exactly one
recommendation:

- **Clean** — no action. If only check 2 failed (stamp trails the plugin but the current
  contract checks all pass), offer to re-stamp `contractHash` (+ `generatedBy`) — with
  `AskUserQuestion`, since it silences the hook's warning.
- **Targeted patches** — an enumerated list of small fixes (stale citation → current path,
  legacy design keys → `design` block, contract-text resync, re-stamp). Apply only after
  the user approves the list; re-run the affected checks after.
- **Enforcement drift** — checks 9–10 found design-rules/enforcement-manifest hash drift, an
  enforcer whose wiring no longer resolves, or a rule category with no enforcer: recommend
  `/spec:enforce` (not `/spec:init` — enforcement is its own command). Doctor never re-derives an
  enforcer itself.
- **Structural drift** — architecture reorganized, layers changed, toolchain swapped, or
  the semantic spot-check failed: recommend `/spec:init` and say which findings drove the
  call. Do not attempt the refresh yourself.

## Rules

- Read-only by default; every edit is user-approved, targeted, and inside the grounding
  layer (`spec.config.json`, pipeline rules, generated agents, `scripts/spec-patterns.sh`).
- Never run the host's `gateCommand`/`testCommand`/`setupCommand` — verify they resolve.
- Re-stamp `contractHash`/`generatedBy` only when every current-contract check passes (or
  after approved patches make them pass) — the stamp asserts "grounding matches this
  plugin's contract".
- `AskUserQuestion` dismissed → STOP.
