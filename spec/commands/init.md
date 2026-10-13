---
description: One-time bootstrap — profile this repo and generate the spec pipeline's grounding layer (config, rules, implementer agents, pattern sweep)
argument-hint: [notes about the repo, optional]
---

# Spec Init: Bootstrap the Grounding Layer

The spec plugin ships the **process layer** (commands, workflows, state gate, reviewer,
template). This command generates the **grounding layer** — everything repo-specific — so the
pipeline can run here. Everything you write must be verified against actual code in this repo:
real paths, real exports, real naming, real commands. An invented reference is worse than a
missing one — workers trust these files blindly.

You profile the repo and interview the user; `spec/scripts/init-gen.js` (`spec-paths
init-gen`) is the **sole writer** of every grounding-layer deliverable it owns — it enforces
the manifest-check→stamp ordering in code. Session flow: Phase 1 profiling → Phase 1.5 substrate
authoring → `init-gen probe` → interview → author the profile JSON in your scratchpad →
`init-gen generate` → Phase 6 design contract → report → Phase 8 `/spec:enforce` handoff.

**Intended model: Fable or Opus.** Run `spec-paths shared-for init` and read its output —
the core sections the grounding layer must satisfy (never the whole doctrine file).

## Deliverables (all in the host repo)

`init-gen generate` is the sole writer of 1–6, 8, and 10 below, from the judgment content you
author into the profile JSON (Phase 4); 7 and 9 stay session-authored, and you record them
into the profile's `manifestExtras` so the manifest still carries a row for each.

1. `.claude/spec.config.json` — machine-readable knobs
2. `.claude/rules/spec-pipeline.md` — prose grounding, seven sections, `paths:`-scoped
3. `.claude/rules/conventions/*.md` — per-layer **path-scoped convention rules** (Phase 3)
4. `.claude/agents/*.md` — project-grounded implementer agents (one per batch kind)
5. `scripts/spec-patterns.sh` — mechanical shortcut sweep adapted to this repo
6. `.claude/settings.json` `permissions` block — merged into any existing block, never clobbered
7. UI-stack hosts only: the **design contract record** (Phase 6)
8. `.claude/skills/spec-verify/SKILL.md` and `.claude/skills/run/SKILL.md` — the per-host
   **verify** and **run** skills
9. The **runtime substrate** where the repo lacks it (Phase 1.5)
10. `.claude/spec-manifest.json` — the **deliverable manifest**, verified by `manifest-check.sh`
    **before** the config is stamped
11. A short report: what was generated, what was verified, what needs the user's eyes

## Phase 1 — Profile the repo

Launch parallel Explore agents (`model: sonnet`) and read key files yourself: stack and
toolchain (real commands from `package.json` scripts / `Makefile` / `pyproject.toml` — never
guess), UI stack, architecture, conventions, high-risk surfaces, runtime and observability.
Interview the user via `AskUserQuestion` only for what the code cannot answer.

**Author the generated skills' content** from the runtime & observability findings, for
`profile.skills` (Phase 4) — `init-gen generate` writes both files from what you author here:

- **`profile.skills.specVerify`** (`.claude/skills/spec-verify/SKILL.md`) — `description` as a
  trigger condition; `body`: how to launch the app locally, seed a testable state, and observe
  behavior. Every instruction must trace to a real file in this repo; where the repo is
  silent, write `[NEEDS CLARIFICATION: <question>]` rather than guess.
- **`profile.skills.run`** (`.claude/skills/run/SKILL.md`) — the session-facing sibling:
  `description` as a trigger; `body`: the launch command, ready check, seed entry point, and
  observation URLs, launched on a free `PORT` (never a fixed one), ≤30 lines, pointing at
  `spec-verify` for the deeper detail.
- **`allowedTools` (both):** pre-authorize exactly the Bash commands each body instructs.

## Phase 1.5 — Runtime substrate (generate what verification presupposes)

Session-authored: `init-gen generate` does not write any of this; you record each item as a
`manifestExtras` row (Phase 4). Where Phase 1's profiling found gaps, **create the substrate —
don't just record the gap**; each item is skippable only by an explicit `inert` manifest row
with a reason:

- **Health endpoint** — the `runtime.readyCheck` target, when the app serves HTTP.
- **Port** — the generated `bootCommand` serves on `$PORT` and `readyCheck` probes `$PORT`; a
  declared `prototype.url` carries `{port}`.
- **Local DB/service provisioning** — so `TEST_DATABASE_URL`-style gates can be satisfied.
- **Seed entry point** — a script that produces an observable post-signup state.
- **Worktree env manifest** — `.worktreeinclude` at the repo root listing gitignored runtime
  config patterns (gitignore syntax).
- **Quickstart** — a root README section answering "how do I run this?" in five lines.
- **Git remote / CI activation** — check `git remote -v`. If empty, ask the user
  (`AskUserQuestion`): connect one now (Recommended) or declare CI inert for now; the manifest
  records whichever the user chooses.

## Phase 2 — Probe the host (`init-gen probe`)

Run:

```
node "$(spec-paths init-gen)" probe --root . [--test-command "<config testCommand>"] [--sample <n>]
```

Read-only and it never blocks: `probe` exits 0 on findings, 2 only on a usage error. Pass
`--test-command` once Phase 1 has extracted the real `testCommand` string.

stdout is a single JSON object (`testCommand`, `atRisk`); every finding routes to Phase 3's interview:

- `testCommand.failsLoudOnNoMatch: false` — the test runner exits 0 on a path matching nothing;
  Phase 3 surfaces it.
- `atRisk.refs: 0` — the at-risk review leg's heuristic found no test references among the
  sampled files; Phase 3 discloses that the leg will likely never fire on this host.

## Phase 3 — Interview

Every question here follows shared § Question Style: plain language, product-behavior lens,
the ten-second cold test, recommended option first labeled "(Recommended)", consequences in
each option's `description`.

- **testCommand vacuous-pass disclosure** — shown when the probe reports `"testCommand":
  {"failsLoudOnNoMatch": false, ...}`: tell the user their test-runner invocation exits 0 on a
  path matching nothing, and ask whether to accept that risk as-is or fix the invocation before
  continuing. Record the ruling either way — never silently accept a vacuous pass.
- **at-risk applicability disclosure** — shown when the probe reports `"atRisk": {"refs": 0,
  ...}`: tell the user the at-risk review leg will likely never fire on this host and ask
  whether that's expected or worth a closer look before accepting it.

Both rulings land in the profile at `probeOutcomes.testCommand` / `probeOutcomes.atRisk`
(Phase 4) — never omitted, never inferred silently.

## Phase 4 — Author the profile JSON

In your session scratchpad (never in the host repo), assemble one JSON object carrying every
judgment call from Phase 1's profiling, Phase 1.5's substrate additions, and Phase 3's
interview rulings — `init-gen generate` reads this file and is the sole writer of what it
describes:

```jsonc
{
  "config": { /* the full .claude/spec.config.json object — required and optional keys per
                 the plugin's grounding contract ($(spec-paths contract) § Required config
                 keys, § Runtime verification, § Capabilities, § Release), judgment values
                 filled from Phase 1's findings. testCommand accepts appended file paths — a
                 no-match must not read as pass (D8's capture-site contract; Phase 3 disclosed
                 whether this repo's runner honors it). generatedBy/contractHash MUST be
                 absent — the script stamps them only after manifest-check.sh exits 0 */ },
  "rules": {
    "paths": ["specs/**", ".claude/**"],          // frontmatter scoping
    "sections": {                                  // six of seven; Gotchas is script-emitted
      "Risk Tiers": "<md>", "Planning": "<md>", "Build": "<md>",
      "Worker Rules": "<md>", "Test Rules": "<md>", "Review Checks": "<md>"
    }
  },
  "conventionRules": [ { "file": "queries.md", "paths": ["src/**/queries.ts"], "body": "<md>" } ],
  "agents": [ {
      "name": "data-layer", "kind": "queries", "description": "<one sentence>",
      "model": "sonnet", "persona": "<md>", "expertise": ["<bullet>"],
      "reference": ["<bullet>"], "constraints": ["<bullet>"], "mcp": "<md or omitted>"
  } ],
  "selfVerifyExamples": "`bun lint`, `bun test:run <your files>`",  // substituted into the Worker Contract
  "skills": {
    "specVerify": { "description": "<trigger>", "allowedTools": ["Bash(bun dev *)"], "body": "<md>" },
    "run":        { "description": "<trigger>", "allowedTools": ["Bash(bun dev *)"], "body": "<md>" }
  },
  "settings": { "extraAllow": ["Bash(bun x *)"], "extraDeny": [] },  // beyond the config-derived set
  "patternSweeps": [ "sweep \"as any\" -e ':\\s*any' -g '!*.test.ts'" ],  // spliced verbatim into the harness
  "sourceRoot": "src",                              // patterns default scope + probe sampling root
  "manifestExtras": [ { "claim": "<text>", "kind": "file|exec|smoke|remote|inert", "target": "<t>" } ],
  "probeOutcomes": {                                // interview rulings over probe findings
    "testCommand": { "failsLoud": true }            // or { "failsLoud": false, "acceptedReason": "<text>" }
    , "atRisk": { "applicable": true }              // or { "applicable": false, "reason": "<text>" }
  }
}
```

Field-by-field, tracing each back to the phase that grounds it:

- **`config`** — Phase 1's stack/toolchain/runtime findings; Phase 6's `design` block on
  design-capable hosts. The script validates keys and exits 2 naming the first missing one; a
  *wrong* value is never caught.
- **`rules.sections`** — the six judgment sections as this repo's concrete grounding. Rules
  state the current invariant plus one owner citation, never dates, people, hosts, versions, or
  prior behavior. `## Gotchas` is never authored here.
- **`conventionRules`** — one entry per routing kind with hard conventions worth ambient
  enforcement; each `paths` glob must match ≥1 tracked file, each `body` ≤15 lines.
- **`agents`** — one entry per non-`default` `agentMap` kind; every path and export you cite
  must exist. The `## Worker Contract (spec pipeline)` section is never authored here.
- **`skills`** — the content Phase 1 already authored, carried here verbatim.
- **`patternSweeps`** — repo-specific `sweep "<name>" -e '<regex>' [-g '!<glob>' ...]` calls
  grounded in the Worker/Test/Review rules above.
- **`manifestExtras`** — one row per deliverable the script does NOT itself write: every
  Phase 1.5 substrate item you created (or declared `inert`) and the Phase 6 rules-file seed copy
  (`.claude/rules/design.md`, when Phase 6 copied it from the template).
- **`probeOutcomes`** — Phase 3's rulings, verbatim.

## Phase 5 — Generate (`init-gen generate`)

On a greenfield repo this phase already ran once, from genesis's own `HANDOFF` step — this
invocation is the brownfield first-run, or a refresh of a genesis-grounded repo. Run:

```
node "$(spec-paths init-gen)" generate --root . --profile <scratchpad profile path> [--refresh]
```

Enforced by `init-gen.js` — its header comment is the contract (exit codes 0–3). On exit 3,
diff the named files yourself, fold whatever the user hand-edited back into the profile, then
re-run with `--refresh`.

## Phase 6 — Design contract (UI-stack hosts only)

Session-authored (Phase 4's `manifestExtras` records these rows). Skip unless Phase 1 found a
UI stack. Goal: **locate, seed, record, check** — init never authors a component or a token.

**Precedence — check for a genesis canon first.** If `.claude/genesis/status.json` exists
(the genesis stage seeded this repo), branch four ways on its `design` value:

- `ratified`, `rules-locked`, or `skipped` → **consume, never re-prompt.** Extract from what's
  there (treat it like brownfield below), and record `genesisStackDescriptor` in
  `profile.config`. On `skipped` (headless archetype) write no `design` block at all. Report
  mode `genesis` in Phase 7.
- `doctrine-drafted` / `tokens-landed` (legacy partial canon) → **STOP.** Tell the user to
  finish the genesis BRIEF state (re-run `/spec:genesis` to reach BRIEF and ratify it) first.
- `pending`, or any value outside the three arms above → **warn and proceed.** Write **no**
  `design` block; name **re-run `/spec:genesis`** as the pending finisher in both the warning
  and the Phase 7 report.
- (no `.claude/genesis/` at all) → the brownfield-or-greenfield path below.

**Enforcement is generated by `/spec:enforce`, not here.** This phase does NOT emit linters,
contracts, or hooks for the design rules. Init **ends by invoking `/spec:enforce`** (Phase 8).

**Brownfield (the repo has real UI, no genesis canon):** locate, don't invent.

1. **Locate** the token file and the kit directory — the directory holding intent-named
   composite components.
2. **Locate the rules file.** When one already exists, use it as-is. When none exists, copy
   `spec/templates/design-rules.md` (`$(spec-paths design-rules-template)`) to
   `.claude/rules/design.md` unchanged except its `paths:` frontmatter, which points at the
   located kit directory and the screen directory; record this copy as a `manifestExtras` row
   (Phase 4). Init never fills in the tables.
3. **Record** `design: {kit, tokens, rules}` (repo-relative paths) into `profile.config` (Phase 4).
   A host with no UI stack at all writes no `design` block — greenfield with nothing to record yet
   is told to run `/spec:genesis` instead of adopting or crafting here.
4. **Check.** After `init-gen generate` stamps the config, run
   `node "$(spec-paths design-contract-check)" --root .` and fold its findings into Phase 7's
   `warns`. Nothing here blocks.

## Phase 7 — Report

1. Re-read `generate`'s own stdout for anything unresolved: a settings-merge conflict line, the
   `changed:`/`unchanged:` lines from a `--refresh` run, or an accepted-risk `probeOutcomes`
   reason from Phase 3 — these become `warns`.
2. Assemble the slots below and write them to a scratch JSON file, then print
   `node "$(spec-paths report-render)" --slots <file>` verbatim (shared § Console Output
   Style):
   - `outcome`: ✅ anchor (⚠️ if something needs the user), text
     `initialized — {N} files, gate verified, stamped`
   - `bullets`: two plain-language lines — (1) what was generated: agent count, the verify + run
     skills, convention-file count, the critical-tier triggers chosen, and the permissions
     entries landed; (2) runtime + design-contract state: boot/ready commands or a
     declared-inert reason, and the design contract status — genesis / located / pending
     (name **re-run `/spec:genesis`** as the finisher when pending)
   - `warns`: one line per unresolved item from step 1, plus anything Phase 1's citations
     couldn't be spot-checked against the repo
   - `next`: `{kind: 'status-verbatim', text: <captured output of
     node "$(spec-paths spec-status)" --next>}` — never a hand-written `Next: /spec:enforce`:
     Phase 8 auto-chains enforcement in this same run

## Phase 8 — Generate enforcement (invoke `/spec:enforce`)

The grounding layer is now in place but the rules are not yet mechanized. **End by invoking
`/spec:enforce`** so a fresh repo leaves init with its rule set deterministically enforced in one
shot. Tell the user enforce is running and that it is independently re-runnable later when
rules or tooling change.

## Rules

- Never write a reference you did not verify against this repo's actual code.
- Plugin agents cannot declare `permissionMode`/`memory`; the host agents `init-gen generate`
  writes CAN and DO — the script emits this frontmatter automatically.
- Re-running `/spec:init` refreshes the grounding layer: `init-gen generate` refuses (exit 3)
  to overwrite any target file that already differs from what the profile would produce
  (Phase 5). To check for drift without regenerating, the user runs `/spec:doctor`.
- `AskUserQuestion` dismissed → STOP.
