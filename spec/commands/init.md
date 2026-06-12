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
5. A short report: what was generated, what was verified, what needs the user's eyes

## Phase 1 — Profile the repo

Launch parallel Explore agents (`model: sonnet`) and read key files yourself:

- **Stack & toolchain:** language(s), framework, package manager, test runner, linter,
  typechecker, codegen tools. Extract the real commands from `package.json` scripts /
  `Makefile` / `pyproject.toml` — never guess (`make check`? `bun typecheck && bun lint &&
  bun test:run`? `uv run pytest`?).
- **Storybook:** present? (config files, `storybook` script). This decides the config
  `storybook` flag and whether `/spec:design` ever runs here.
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

## Phase 2 — Write `.claude/spec.config.json`

All keys consumed by the plugin's commands/workflows:

```jsonc
{
  // Deterministic gate. {testDirs}/{scopeDirs} placeholders are substituted by
  // /spec:build and /spec:review from the spec's File Plan dirs (omit if not needed).
  "gateCommand": "bun typecheck && bun lint && bun test:run {testDirs}",
  // Test-runner prefix; file paths are appended (red check, scoped runs).
  "testCommand": "bun test:run",
  // Workspace bootstrap for worktrees/spikes.
  "setupCommand": "bun install",
  // Mechanical sweep script (generated in Phase 5); dirs appended, DIFF_BASE env honored.
  "patternsScript": "scripts/spec-patterns.sh",
  // OPTIONAL: AC-drift checker; spec path appended. Omit entirely if the repo has none —
  // then the reviewer's AC ↔ test coverage check is the drift gate.
  "driftScript": "uv run python scripts/spec_drift.py --spec",
  // Storybook design stage available in this repo?
  "storybook": true,
  "storybookCommand": "bun storybook",
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
dev"`, `"storybook": false`, `"layerGroups": [["foundation"], ["persistence"], ["logic"],
["orchestration"]]`, `"agentMap": {"tests": "domain-tests", "models": "domain-models",
"contracts": "domain-contracts", "persistence": "domain-persistence", "handlers":
"domain-handlers", "default": "general-purpose"}`.)

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
  rendering in Storybook repos).
- **`## Review Checks`** — repo-specific severity calibrations for the reviewer (the plugin's
  generic `spec-reviewer` reads this repo's `.claude/rules/` — this section is where checks
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
   Use exactly this text, substituting only the parenthesized self-verify examples with this
   repo's scoped commands (from `gateCommand`/`testCommand`), the same way in every agent:

```markdown
## Worker Contract (spec pipeline)

When dispatched as a batch worker by the `spec-build` workflow:

- The spec's **Decisions** table is authoritative — apply it verbatim. An unlocked design fork or stale spec assumption is a `blocked` return (kind, detail, options, recommendation), never a guess.
- Do NOT query MCP servers — the spec's UI and Contracts sections embed the references you need. If an embedded reference is wrong against the installed version, return blocked `{kind: "stale-assumption"}`.
- Edit only files in your assigned batch. Return receipts — files touched + one-line summaries — not narration.
- NEVER run git commands (checkout/stash/restore/reset/clean/add/commit). Bash is for scoped self-verification only (`bun lint`, `bun test:run <your files>`, `bunx tsc --noEmit`). The orchestrator owns git; a repo-wide git op destroys sibling workers' uncommitted edits.
```

   The `tests`-kind agent additionally appends (after the contract bullets, still identical
   wording wherever it appears):

```markdown
- As a TDD red-phase author: derive tests ONLY from the spec's Acceptance Criteria and Behavior sections, never from implementation code. Reference the AC-ID per this repo's convention.
- Every new test must FAIL on current code. If a test would already pass, the spec is wrong — return blocked `{kind: "stale-assumption"}`. Write NO implementation code; never weaken assertions to make tests pass.
```

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

## Phase 6 — Verify & report

1. Re-read every generated file; spot-check 10 cited paths/exports at random against the repo.
2. Confirm `agentMap` names exactly match the generated agent filenames' `name:` fields.
3. Run `scripts/spec-patterns.sh` once; confirm exit 0 and sane output.
4. Report: files written, agents generated (kind → name), config summary, T3 triggers chosen,
   anything you could not verify and flagged for the user.

## Rules

- Never write a reference you did not verify against this repo's actual code.
- Plugin agents cannot declare `permissionMode`/`memory`; the host agents you generate here
  CAN and DO (`permissionMode: acceptEdits`, `memory: project`).
- The Worker Contract section is byte-identical across all generated agents (one repo-wide
  substitution of the self-verify command examples).
- Re-running `/spec:init` refreshes the grounding layer: diff against existing files and
  preserve user hand-edits where they don't contradict fresh findings — surface conflicts,
  don't overwrite silently.
- `AskUserQuestion` dismissed → STOP.
