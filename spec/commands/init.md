---
description: One-time bootstrap — profile this repo and generate the spec pipeline's grounding layer (config, rules, implementer agents, pattern sweep)
argument-hint: [notes about the repo, optional]
---

# Spec Init: Bootstrap the Grounding Layer

The spec plugin ships the **process layer** (commands, workflows, state gate, reviewer,
template). This command generates the **grounding layer** — everything repo-specific — so the
pipeline can run here. It is a one-time deep session (re-runnable to refresh); budget real
exploration time. Everything you write must be verified against actual code in this repo:
real paths, real exports, real naming, real commands. An invented reference is worse than a
missing one — workers trust these files blindly.

**Intended model: Fable or Opus.** Run `spec-paths shared` and Read that file first to
understand what the process layer expects from the grounding layer.

## Deliverables (all in the host repo)

1. `.claude/spec.config.json` — machine-readable knobs
2. `.claude/rules/spec-pipeline.md` — prose grounding, six sections
3. `.claude/agents/*.md` — project-grounded implementer agents (one per batch kind)
4. `scripts/spec-patterns.sh` — mechanical shortcut sweep adapted to this repo
5. Design-capable hosts only: the **design foundation** — token files verified/landed, a
   one-page design doctrine doc, the living showcase catalog entry (Phase 6)
6. A short report: what was generated, what was verified, what needs the user's eyes

## Phase 1 — Profile the repo

Launch parallel Explore agents (`model: sonnet`) and read key files yourself:

- **Stack & toolchain:** language(s), framework, package manager, test runner, linter,
  typechecker, codegen tools. Extract the real commands from `package.json` scripts /
  `Makefile` / `pyproject.toml` — never guess (`make check`? `bun typecheck && bun lint &&
  bun test:run`? `uv run pytest`?).
- **Component catalog:** present? Storybook (web: `.storybook/` config, `storybook` script)
  or Widgetbook (Flutter: `widgetbook` in `pubspec.yaml`, a widgetbook entrypoint/sub-package).
  This decides the config `design` block and whether `/spec:design` ever runs here. If
  design-capable, also profile the **design language**: existing theme/token files, a base
  design system in the dependencies (shadcn/Radix, MUI, Material 3, Cupertino, …), and how
  consistently real screens follow it — input to Phase 6.
- **Architecture:** how is code organized (features? domains? modules?), what are the layer
  boundaries, which surfaces are generated/managed (codegen outputs, lockfile-like catalogs,
  translation files), what CI enforces (import linters, purity checks).
- **Conventions:** read 3–5 representative source files per layer; extract naming patterns,
  canonical exemplar files, the rules docs that already exist (`.claude/rules/`,
  `docs/standards/`, `docs/rules/`, `AGENTS.md`, `CLAUDE.md`).
- **High-risk surfaces:** money paths, auth, migrations, cross-area contracts — what here
  would be T3?

Interview the user via `AskUserQuestion` only for what the code cannot answer (e.g. "which
surfaces do you consider T3?", with informed options).

**Ensure `.claude/worktrees/` is gitignored** (idempotent): `/spec:build`'s worktree workspace
and the harness's own `EnterWorktree` both create trees there, and an un-ignored worktree path
makes the root tree read dirty — which trips `/spec:review`'s clean-root merge gate and makes
`merge-back.sh create` refuse. If `git check-ignore -q .claude/worktrees` fails, append
`.claude/worktrees/` to the repo's `.gitignore` and tell the user to commit it.

**Also gitignore the design-stage sidecar dirs** (idempotent, same routine): `/spec:design`
writes a per-spec sidecar dir `specs/YYYYMMDD/##-name.design/` (`extract.json`, `slice-*.html`,
`skeletons.json`) that is the within-run plan + resume cache, deleted at Phase 4 reconcile — but a
mid-run checkpoint-commit must not carry it. If `git check-ignore -q specs/00000000/00-x.design/x`
fails, append `specs/**/*.design/` to `.gitignore`. (Also clean up the retired digest-era patterns
`*.design-digest.json` / `*.design-digest.raw.html` if a prior init added them.) This does not
break resume (resume reads the working-tree files); the Phase 4 `rm` is what clears the tree.

**Set the union merge driver for the run ledger** (idempotent): `.claude/spec-runs.jsonl` is
append-only, and two specs building in parallel worktrees both append at EOF — a default merge
conflicts there on merge-back, when the only correct resolution is "keep both lines." If
`git check-attr merge -- .claude/spec-runs.jsonl` doesn't report `union`, append
`.claude/spec-runs.jsonl merge=union` to the repo's `.gitattributes` (create it if missing) and
commit it with the other init changes. Never gitignore the ledger itself.

## Phase 2 — Write `.claude/spec.config.json`

All keys consumed by the plugin's commands/workflows:

```jsonc
{
  // Drift stamps — both computed at init time, never hand-picked.
  // generatedBy: "spec@" + `spec-paths version` (human-readable provenance).
  // contractHash: `spec-paths contract-hash` — hash of the plugin's grounding-contract
  // file. The state-gate hook recomputes and compares it on every pipeline command and
  // warns on mismatch; any plugin contract change fires it automatically.
  "generatedBy": "spec@1.0.0",
  "contractHash": "<output of spec-paths contract-hash>",
  // Deterministic gate. {testDirs}/{scopeDirs} placeholders are substituted by
  // /spec:build and /spec:review from the spec's File Plan dirs (omit if not needed).
  "gateCommand": "bun typecheck && bun lint && bun test:run {testDirs}",
  // Test-runner prefix; file paths are appended (red check, scoped runs).
  "testCommand": "bun test:run",
  // Workspace bootstrap for worktrees/spikes.
  "setupCommand": "bun install",
  // OPTIONAL: default workspace for /spec:build ∈ "worktree" | "in-place" | "ask".
  // Omit (or "ask") to keep the per-run prompt. Set "worktree" for repos that always want
  // isolation (e.g. genesis-seeded greenfield), "in-place" for repos that never do.
  "build": { "workspace": "ask" },
  // Mechanical sweep script (generated in Phase 5); dirs appended, DIFF_BASE env honored.
  "patternsScript": "scripts/spec-patterns.sh",
  // OPTIONAL: AC-drift checker; spec path appended. Omit entirely if the repo has none —
  // then the reviewer's AC ↔ test coverage check is the drift gate.
  "driftScript": "uv run python scripts/spec_drift.py --spec",
  // OPTIONAL: component-catalog design stage (/spec:design). Omit entirely if the repo has
  // no catalog. tool: "storybook" (web) | "widgetbook" (Flutter) | any catalog; command
  // launches it; storyFormat is what stories-kind workers author.
  "design": {
    "tool": "storybook",
    "command": "bun storybook",
    "storyFormat": "CSF3 stories",
    // Written by Phase 6 — binding canon for /spec:design.
    "doctrine": "docs/design/doctrine.md",
    // OPTIONAL: renders catalog entries to image files — enables the designer's visual
    // self-review round. Omit if the host has no such command; never invent one.
    "screenshot": "bun storybook:screenshot",
    // REQUIRED when the repo routes copy through an i18n stack (Paraglide/inlang, i18next,
    // react-intl, next-intl, lingui, …): the source-language message catalog(s). The
    // /spec:design fidelity gate accepts mock copy as catalog VALUES — without this key the
    // gate would demand literals the host's i18n lint forbids. Detect the stack from the
    // dependency tree and point at the real catalog files; omit only when there is no i18n.
    "copyCatalogs": ["app/messages/en.json"]
  },
  // Ordered File Plan layer groups; layers inside one inner array run in parallel
  // (their file sets must be disjoint by construction of the repo's structure).
  "layerGroups": [["foundation"], ["ui", "data", "logic"], ["wiring"]],
  // Batch kind → agent name (the agents generated in Phase 4). 'tests' and 'default'
  // are required keys; the rest mirror this repo's layers/file kinds.
  "agentMap": {
    "tests": "testing",
    "types": "types",
    "queries": "data-layer",
    "forms": "forms",
    "mocks": "mock-data",
    "tables": "data-table",
    "components": "ui-components",
    "stories": "storybook",
    "default": "general-purpose"
  },
  // Routing hints: which File Plan rows map to which kind (prose, for the orchestrator).
  "routing": {
    "tests": "*.test.ts(x) rows",
    "types": "types.ts, constants.ts",
    "queries": "api.ts, queries.ts, data hooks"
  },
  "pipelineRules": ".claude/rules/spec-pipeline.md"
}
```

(Backend-flavored example: `"gateCommand": "make check"`, `"testCommand": "uv run pytest -q
--no-header --tb=line"`, `"setupCommand": "unset VIRTUAL_ENV && uv sync --frozen --extra
dev"`, no `design` block, `"layerGroups": [["foundation"], ["persistence"], ["logic"],
["orchestration"]]`, `"agentMap": {"tests": "domain-tests", "models": "domain-models",
"contracts": "domain-contracts", "persistence": "domain-persistence", "handlers":
"domain-handlers", "default": "general-purpose"}`. Flutter-flavored `design` block:
`{"tool": "widgetbook", "command": "flutter run -d chrome -t widgetbook/lib/main.dart",
"storyFormat": "Widgetbook @UseCase builders"}` — extract the real entrypoint path and run
target from the repo, never guess.)

## Phase 3 — Write `.claude/rules/spec-pipeline.md`

Six sections, all grounded in Phase 1 findings. This file is read by every pipeline command;
§ Worker Rules and § Test Rules are inlined verbatim into worker prompts by `/spec:build`.

- **`## Risk Tiers`** — the concrete T3 trigger list for THIS repo (e.g. "order/position/trade
  mutation paths or money math (`src/lib/decimal.ts` call sites)"; "anything touching the
  `billing` or `identity` domain's write paths; migrations beyond pure-additive"), and what
  T1-shaped work looks like here.
- **`## Planning`** — discovery surfaces (generated contract files to ground against),
  pre-emptive MCP/registry lookups to run at plan time (e.g. Shadcn registry for new UI
  surfaces, Context7 for the libraries this repo leans on), decomposition caps beyond the
  generic ≤15 rows (e.g. "at most one migration"), and the new-surface checklist: the
  requirements interview shape, data-shape design steps, cross-area contract mapping, and the
  registration/wiring File Plan rows this repo's structure demands (with real paths).
- **`## Build`** — orchestrator-only integration duties with exact commands (e.g. route
  codegen, translation fill via its script, Alembic migration generation + review steps, app
  boot check), host escalation triggers (e.g. divergent migration heads), and T3 checkpoint
  surfaces.
- **`## Worker Rules`** — repo-specific hard rules appended to every worker prompt: the
  read-only/generated surfaces and their sanctioned change routes, logging/number/i18n
  discipline, import-boundary rules, the scoped self-verify commands workers may run.
- **`## Test Rules`** — this repo's test conventions: file placement, naming, AC-ID reference
  style (docstring? test name? comment?), fixture rules, what is exempt from TDD (e.g. pure-UI
  rendering in repos with a design-stage catalog).
- **`## Review Checks`** — repo-specific severity calibrations for the reviewer (the plugin's
  generic `reviewer` reads this repo's `.claude/rules/` — this section is where checks
  like "runtime import from a feature barrel in `stores.ts` or `*.test.ts` is **hard**",
  "raw `parseFloat` on prices is **hard**", "user-facing strings not wrapped in i18n macros",
  or "imports from `other_domain.logic` targeting anything but `types.py` is **hard**" live,
  each with file:line-verifiable phrasing).

## Phase 4 — Generate implementer agents

One agent per `agentMap` kind (except `default`), written to the host's `.claude/agents/`.
**Study real code first**: for each kind, read the canonical files of that layer and extract
naming tables, exemplar paths, and constraints. Every path and export you cite must exist —
verify with Glob/Read before writing it down.

Frontmatter (host-repo agents — unlike plugin agents — MAY declare these):

```yaml
---
name: data-layer
description: "<what it owns + when to use, one sentence>"
model: sonnet            # haiku acceptable for narrow kinds (e.g. types)
permissionMode: acceptEdits
memory: project
---
```

Body skeleton — this is the structure both source ecosystems converged on; follow it exactly:

1. **Persona paragraph** (under an `# {Kind} Specialist` heading) — what this agent owns in
   THIS repo, in this repo's vocabulary; what it never does.
2. **`## Your Expertise`** — the concrete files/surfaces it owns, as bullets with real paths.
3. **`## Reference Material`** — verified pointers: the rule docs governing this layer, 1–3
   canonical exemplar files ("read this before writing"), generated files to grep rather than
   guess. Every path verified against the repo.
4. **`## Critical Constraints`** — the hard rules of this layer (the ones CI or review would
   catch), each stated imperatively with the sanctioned alternative. Naming-convention tables
   with **real examples from the repo** earn their keep here.
5. **`## Library Docs (MCP)`** — only if the layer leans on third-party APIs: the Context7 /
   registry queries to run when invoked interactively, followed by this carve-out line:
   > **Pipeline carve-out:** the lookups above apply to interactive invocations only. As a
   > spec-pipeline worker you never query MCPs — `/spec:plan` embeds the needed references
   > into the spec's UI/Contracts sections.
6. **`## Worker Contract (spec pipeline)`** — byte-identical across ALL generated agents.
   The canonical text lives in the plugin's grounding-contract file: Read
   `$(spec-paths contract)` and use its § Worker Contract block exactly, substituting only
   the parenthesized self-verify examples with this repo's scoped commands (from
   `gateCommand`/`testCommand`), the same way in every agent. The `tests`-kind agent
   additionally appends the contract file's § Tests-kind addendum, verbatim.

Examples of well-grounded agents to emulate (structure, not content): a frontend repo's
`data-layer` agent citing `src/features/catalog/queries.ts` as canonical and a naming table
verified against real hooks; a backend repo's `domain-models` agent citing the ORM rules doc
and the `lazy="raise"` constraint with its CI enforcement. Content like `src/features/...` or
`src/prax/domains/...` paths are examples for YOU — generate equivalents from THIS repo.

## Phase 5 — Generate `scripts/spec-patterns.sh`

A mechanical shortcut sweep: pure report, always exits 0, counts are leads not verdicts.
Reuse this harness verbatim and write repo-specific `sweep` calls grounded in the rules from
Phase 3 (suppression markers, deferred-work comments, discipline bypasses, boundary
violations, generated-surface edits vs `DIFF_BASE`):

```bash
#!/usr/bin/env bash
# Mechanical shortcut-pattern sweep — deterministic input to /spec:review.
# Usage: [DIFF_BASE=<ref>] scripts/spec-patterns.sh [dir ...]    (defaults to <repo source root>)
# Pure report: always exits 0. Sanctioned exceptions exist — the reviewer judges; this only counts.
set -u
DIRS=("$@")
[ ${#DIRS[@]} -eq 0 ] && DIRS=(<repo source root>)
echo "## Mechanical pattern sweep"; echo "Scope: ${DIRS[*]}"; echo
sweep() {
  local name="$1"; shift
  local out; out=$(rg -n "$@" "${DIRS[@]}" 2>/dev/null || true)
  local count=0
  [ -n "$out" ] && count=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
  echo "### ${name}: ${count}"
  if [ -n "$out" ]; then
    printf '%s\n' "$out" | head -15 | sed 's/^/    /'
    [ "$count" -gt 15 ] && echo "    ... (${count} total)"
  fi
  echo
}
# sweep "<name>" -e '<regex>' [-g '!<glob>' ...]   ← repo-specific calls go here
echo "Sweep complete. Counts are leads, not verdicts — sanctioned exceptions exist."
exit 0
```

End with a generated-surface section when the repo has one: `git diff --name-only
"${DIFF_BASE:-main}" -- <generated paths>` with a note naming the sanctioned tools.
`chmod +x` the result and run it once to confirm it executes cleanly.

## Phase 6 — Design foundation (design-capable hosts only)

Skip unless Phase 2 wrote a `design` block. Goal: a **design foundation, not a design
system** — the binding canon `/spec:design` reads (tokens + doctrine). The system itself
grows later by extraction through specs; do not invent components or tokens no planned
surface needs yet.

**Precedence — check for a genesis canon first.** If `.claude/genesis/status.json` exists
(the genesis stage seeded this repo), branch three ways on its `design` value:

- `rules-locked` or `skipped` → **consume, never re-prompt.** The canon already exists:
  `/spec:genesis-design` authored the doctrine + token files and `.claude/genesis/design-rules.json`.
  Do NOT run the adopt/craft `AskUserQuestion` below — extract from what's there (treat it like
  brownfield), and record `genesisStackDescriptor` + `design.rulesManifest` in the config
  (enforcement is generated later by `/spec:enforce`, Phase 8). On `skipped`
  (headless archetype) write no `design` block at all. Report mode `genesis` in Phase 7.
- `doctrine-drafted` / `tokens-landed` → **partial canon: STOP.** Tell the user to finish
  `/spec:genesis-design` (lock its rules) first; the state gate also blocks this. Do not
  half-adopt.
- (no `.claude/genesis/` at all) → the greenfield adopt/craft path below.

**Enforcement is generated by `/spec:enforce`, not here.** Init does NOT emit linters, contracts,
or hooks for the design rules (or any other rules). It records the consume-side keys
(`genesisStackDescriptor`, `design.rulesManifest`, `designRulesHash`) and leaves the actual
category→enforcer selection — discovered and verified at runtime, never from a hardcoded mapping —
to the dedicated command. Init **ends by invoking `/spec:enforce`** (Phase 8), which mechanizes
the design rules together with the rest of the host's rule set in one pass. This keeps a single
enforcement brain on its own cadence (rules/tooling drift, not repo re-profiling).

**Brownfield (the repo has real UI):** extract, don't invent. Locate the theme/token files;
read representative screens; write the doctrine doc as a description of what is **already
true** — type scale, spacing rhythm, color roles, density, dialog-vs-page habits,
empty-state tone. List the inconsistencies you found; do not resolve them. **Detect an existing
base dir / barrel** (a directory of overlay shells — Sheet/Dialog/Popover/Drawer — behind an
`index.*`); if one exists, **name it and the import-only rule in the doctrine** (the cross-session
memory `/spec:design` imports from). If none exists, **record the gap** — do not scaffold one here;
the set is seeded by genesis or grows by extraction through specs.

**Greenfield (no genesis canon, no real UI yet):** `AskUserQuestion` first — **adopt** a base design system
(recommended; offer the real candidates for this stack, e.g. shadcn/Radix or Material on
web, Material 3 / Cupertino on Flutter) or **craft** a custom direction.

- *Adopt:* doctrine = "«base system» defaults except …" plus the deviation list (brand
  palette, radius, density); land the matching minimal theme/token overrides.
- *Craft:* author 2–3 distinct directions, each as a north-star composition rendered as a
  catalog entry (type scale, color temperature, density, motion feel); the user picks with
  their eyes; land the chosen direction's token skeleton, delete the losers. Crafting is
  Fable work — taste is the product here.

Both modes also:

- Create the **living showcase** catalog entry (composes real surfaces; every later design
  run extends it — the visible cross-spec drift detector) and name its path in the doctrine
  doc, along with the token-file paths.
- Record the design rules (ban raw colors / magic values in UI files, etc.) as
  `targetCategory`-tagged entries so `/spec:enforce` can mechanize them; where no enforcer will
  fit, they fall to pipeline rules § Review Checks — `/spec:enforce` owns that decision, not init.
- Keep the doctrine doc to **one page**; record its path as `design.doctrine` in the config.

(A repo whose design foundation was seeded by `/spec:import-design` — a translated Claude Design
mockup — is indistinguishable from any brownfield repo with real UI: it writes plain tokens +
doctrine + components outside `.claude/genesis/`, so the extract path above handles it; do not
special-case it.)

## Phase 7 — Verify & report

1. Re-read every generated file; spot-check 10 cited paths/exports at random against the repo.
2. Confirm `agentMap` names exactly match the generated agent filenames' `name:` fields.
3. Run `scripts/spec-patterns.sh` once; confirm exit 0 and sane output.
4. Confirm the config's `generatedBy` equals `spec@$(spec-paths version)` and its
   `contractHash` equals `$(spec-paths contract-hash)`.
5. Report: files written, agents generated (kind → name), config summary, T3 triggers chosen,
   design foundation landed (mode: genesis / extracted / adopted / crafted, doctrine path);
   for `genesis` mode, the design-rules categories found and the stamped `designRulesHash`;
   anything you could not verify and flagged for the user.

## Phase 8 — Generate enforcement (invoke `/spec:enforce`)

The grounding layer is now in place but the rules are not yet mechanized. **End by invoking
`/spec:enforce`** so a fresh repo leaves init with its rule set deterministically enforced in one
shot. Enforcement is a separate command by design — different cadence (rules/tooling drift, not
repo re-profiling) and expensive, flaky work (live research + install-and-verify) — so init does
not inline it; it hands off. Tell the user enforce is running and that it is independently
re-runnable later when rules or tooling change.

## Rules

- Never write a reference you did not verify against this repo's actual code.
- Plugin agents cannot declare `permissionMode`/`memory`; the host agents you generate here
  CAN and DO (`permissionMode: acceptEdits`, `memory: project`).
- The Worker Contract section is byte-identical across all generated agents (one repo-wide
  substitution of the self-verify command examples).
- Re-running `/spec:init` refreshes the grounding layer: diff against existing files and
  preserve user hand-edits where they don't contradict fresh findings — surface conflicts,
  don't overwrite silently. A refresh always re-stamps `generatedBy` and `contractHash`.
  (To check for drift without regenerating, the user runs `/spec:doctor` — read-only, much
  cheaper.)
- `AskUserQuestion` dismissed → STOP.
