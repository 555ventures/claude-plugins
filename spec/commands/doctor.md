---
description: Drift check of the grounding layer — verifies config, agents, rules, activation, and cited references against the installed plugin and the current codebase; recommends targeted patches or a /spec:init refresh. --fix applies evidence-cited line-item repairs with per-patch approval
argument-hint: [focus area, optional — e.g. "agents" or "design"] [--fix]
---

# Spec Doctor: Grounding-Layer Drift Check

The grounding layer (`/spec:init`'s output) goes stale two ways: the **plugin updated**
(contracts changed under it) or the **codebase drifted** (cited paths, commands, and
conventions moved on). This command is a **diagnosis, not a treatment**: report first; apply
only targeted patches the user approves; recommend a full `/spec:init` refresh for structural
drift. Never regenerate wholesale, never touch files outside the grounding layer.

**Intended model: Sonnet.** Run `spec-paths shared-for doctor` and read its output. If
`.claude/spec.config.json` is missing entirely, STOP — the repo was never initialized; the
answer is `/spec:init`, not a drift report.

## Checks — deterministic first

Run with Bash/Read/Glob; each produces pass / fail-with-evidence (`file:line`):

1. **Config integrity** — `.claude/spec.config.json` parses; required keys present per the
   contract file's § Required config keys.
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
   no kind claims breaks the build stage's dispatch.
4. **Worker Contract text** — each generated agent's `## Worker Contract (spec pipeline)`
   section is byte-identical across agents (allowing only the sanctioned self-verify command
   substitution) and matches the contract file's § Worker Contract block; the `tests`-kind
   agent carries the § Tests-kind addendum.
5. **Pipeline rules shape & scoping** — the file at `pipelineRules` exists with all seven
   contract-required sections and opens with the `paths:` frontmatter § Session grounding
   requires. Sweep every `.claude/rules/**/*.md` carrying `paths:` frontmatter: each glob
   must match ≥1 tracked file — a zero-match glob is a rule that silently never loads. Advisory: when § Worker Rules names
   surfaces workers must never edit and the config has no `orchestratorOnly`, or names one
   that no `orchestratorOnly` glob matches, flag it — "the build driver hands these files to
   workers; add them to orchestratorOnly".
6. **Scripts & commands** — `patternsScript` exists, is executable, exits 0; `driftScript`
   (if declared) exists; each command referenced by `gateCommand` / `testCommand` /
   `setupCommand` resolves by name (never run the gate here). Session grounding:
   `.claude/settings.json` parses; its `permissions` allow
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
   prefix), resolving each against the file set its sentence implies. Stale citations are the
   most common drift and are individually patchable.
8. **Design contract** (only if the config has a `design` block) — run
   `node "$(spec-paths design-contract-check)" --root . --json`. Each finding is a ⚠️ advisory
   naming the script's own remedy. Never re-derives an enforcer here — that's
   `/spec:enforce`'s job.
9. **Genesis handoff** (only if `.claude/genesis/status.json` exists) — the consume-side
   contract is intact: `genesisStackDescriptor` (when recorded) exists and parses;
   every `docs/adr/*.md` has a `## Dissents` section (presence only).
10. **Rule enforcement** (only if the config has an `enforcementManifest`) — recompute the
    manifest hash vs `rulesEnforcementHash` (mismatch → "re-run /spec:enforce"); every
    entry's `category` is in the reserved taxonomy; each entry's `workspace` directory
    resolves (missing → the same "re-run /spec:enforce" remedy) and, when the entry carries
    a `layer`, it is one of the four naming layers `code | schema | routes | wire` (any other
    value, or a `layer` on a non-`naming` entry, is flagged); each entry's enforcer wiring
    still resolves (config/checker path exists and the `gateCommand` or hook orchestrator
    invokes it, from that entry's own workspace root) or the entry records a
    `sweep`/`review-check` fallback; a `duplication`/`cycle` entry whose `baseline.path` is
    missing fails the same way. Never re-derive an enforcer here — recommend `/spec:enforce`.
11. **Spec-dir hygiene** — sweep `specs/**`:
    - frontmatter `status` ∈ `draft | hardened | implementing | done | superseded`
      (`superseded` is terminal and silent by design — never flag one);
    - an `implementing` spec carrying `build_base:` is stale when its build branch — derived
      by `node $(spec-paths merge-back) branch-for <spec path>` — does not exist (in-place
      builds, `build_base` absent, are skipped);
    - a `hardened`/`implementing`/`done` spec containing a live `[NEEDS CLARIFICATION:`
      marker (colon form) is broken.
12. **Run ledger hygiene** (only if `.claude/spec-runs.jsonl` exists) — script passes
    (`jq`/`awk`), never read the ledger into context. Every line parses as JSON with a known `stage`:
    this repo's `driftCensus.byRepo` entry in `node "$(spec-paths fleet-reader)" --json` reads
    `unparseable: 0` and carries no `drift["stage-unknown"]` — the stage set is that script's, never
    restated here. Field expectations are per-class: v7 build and review rows carry no `runId`
    (a `runId`-bearing row is history, never a flag). The file is tracked by git, and
    `git check-attr merge -- .claude/spec-runs.jsonl` reports `union` (without it, parallel
    worktree builds conflict at merge-back — init sets the `.gitattributes` entry). The
    pipeline's own ignore entries are audited the same way: `node "$(spec-paths init-gen)"
    ignore-check --root .` exits 0, else each printed line is a scratch path this host never
    received; the remedy is the same command with `--fix`, a line-item patch under Repair mode.
    A line over ~1000 chars is an advisory tripwire, never a standalone broken finding. Year
    archives (`.claude/spec-runs-<year>.jsonl`) get the same checks. **Tier distribution:**
    with ≥5 build rows, if ≥90% share one tier, flag it. **Escapes** (`stage:"escape"` rows) —
    jq correlations, flag loudly:
    - an escape correlated to a review row with `verdict:"CLEAN"` (via `reviewRunId` on
      legacy rows, else same-spec latest prior review row) is a **contradicted CLEAN** —
      the review passed a real defect; report per-spec;
    - with ≥10 CLEAN review rows and zero escape rows, report that too — absence of escapes
      is only meaningful if escapes are being recorded; note when zero escape rows exist.
    **Plugin-defect roll-up:** collect `[plugin]`-tagged Gotchas entries into one "upstream
    bug report" block (entry + citation, verbatim).
13. **Roadmap derivation** (only if `docs/roadmap/00-overview.md` exists) — run
    `node "$(spec-paths spec-status)" --root . --json`; report its derived table, `hygiene`
    anomalies as findings and `decide` anomalies as info.
14. **CI-gate parity** (advisory) — run `node "$(spec-paths ci-gate-parity)" --root .`; each
    printed line is advisory.
15. **Citation integrity** (deterministic, advisory) — run
    `node "$(spec-paths citations-check)"` against the repo; each MISS line is a stale-citation
    finding.
16. **Rules-layer narration** (advisory) — run
    `node "$(spec-paths comment-narration)" --rules-mode .`; under `--fix` each finding is a
    line-item patch.
17. **AC-pin drift** (deterministic, advisory) — run `node "$(spec-paths ac-drift)" --root .`;
    each printed row names its remedy.
18. **Spec-number collisions** (broken — never advisory) — run
    `node "$(spec-paths spec-number-check)" --root .`; remedy = renumber whichever spec has not
    yet built to the next free number in its directory, rewriting its AC-ids, every `depends_on`
    entry that names it and any run-ledger `spec` path with it.
19. **Fixed ports and host command shape** (advisory) — run
    `node "$(spec-paths port-check)" --root .`; each printed line is a fixed port literal under
    `tests/` or in `.claude/spec.config.json`, or a host-shape hint: `config-compound-boot` →
    move the line into a host script (e.g. a package.json script) and point `bootCommand` at it;
    `config-no-test-count` → add `capabilities.testCountPattern` matching the runner's executed-tests
    count line (advisory; zero tests stays sanctioned).
20. **Expiry readiness** (advisory) — run `node "$(spec-paths test-expiry)" --root . --all-done`
    (dry run) and `node "$(spec-paths coverage-scope)" --root .`, both every time; the only
    deletion path is the same `test-expiry` command with `--apply`, run only after one
    `AskUserQuestion` naming the count and the files — never under `--fix`'s line-item path
    and never silently.
21. **Catalog currency** (advisory) — only when `docs/design/catalog.md` exists, run
    `node "$(spec-paths catalog-inventory)" --root . --out docs/design/catalog.md --check`; exit 1
    → one ⚠️ line (spec/doctrine/genesis.md § Genesis: Design Stage).
22. **Prototype config** (advisory) — only when the config has a `prototype` block, run
    `node "$(spec-paths prototype-driver)" check --json`; each finding is one ⚠️ line.
23. **Walkthrough config** (advisory) — only when the config has a `walkthrough` block, run
    `node "$(spec-paths walkthrough)" check --json`; each finding is one ⚠️ line.

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
   values, `scripts/spec-patterns.sh`), plus check 18's renumber of the not-yet-built spec. Structural drift is `/spec:init`'s job — `--fix`
   refuses it and says why.

After patching: re-run the affected checks, re-stamp `contractHash`/`generatedBy`, and
append the correction as a Gotchas entry citing the evidence — check 18 patches the
spec directly and skips the re-stamp and the Gotchas append.

## Report & recommendation

Assemble slots (core § Console Output Style) — per finding, one plain-language line stating
what's wrong and what it affects — and render via
`node "$(spec-paths report-render)" --slots <file>`, printing verbatim:

- `outcome`: ✅ `grounding healthy` / ⚠️ `{N} stale` / 🚫 `broken — {what}`.
- `warns`: one `stale: {what — what it affects}` line per stale finding.
- `blocks`: one `broken: {what — what it affects}` line per broken finding.
- `next`: the single recommendation below.

Close with exactly one recommendation: **clean** (offer a re-stamp if only check 2 failed) ·
**targeted patches** (enumerated, user-approved, re-check after) · **enforcement drift**
(checks 9–10 → recommend `/spec:enforce`) · **structural drift** (→ recommend `/spec:init`,
naming the findings that drove the call).

## Rules

- Read-only by default; every edit is user-approved, targeted, and inside the grounding
  layer, plus the check 18 renumber. `--fix` widens what may
  be patched, never who approves or where.
- Never run the host's `gateCommand`/`testCommand`/`setupCommand` — verify they resolve
  (exceptions: `manifest-check` in the activation check; a single falsifying line when
  `--fix` evidence demands it).
- Re-stamp `contractHash`/`generatedBy` only when every current-contract check passes.
- `AskUserQuestion` dismissed → STOP.
