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

You profile the repo and interview the user; `spec/scripts/init-gen.js` (`spec-paths
init-gen`) is the **sole writer** of every grounding-layer deliverable it owns — it enforces
the manifest-check→stamp ordering in code, so a session interrupted mid-run can never leave a
stamped-but-unverified config. Session flow: Phase 1 profiling → Phase 1.5 substrate
authoring → `init-gen probe` → interview → author the profile JSON in your scratchpad →
`init-gen generate` → Phase 6 design foundation → report → Phase 8 `/spec:enforce` handoff.

**Intended model: Fable or Opus.** Run `spec-paths shared` and Read that file first to
understand what the process layer expects from the grounding layer.

## Deliverables (all in the host repo)

**Authoring rule (governs every phase below, including Phase 1's skill-content authoring):**
any generated file's prose about a **volatile enumerable fact** — routes, table lists, package
inventories, token homes — must name the derivation, the command or location that yields the
fact (e.g. "`ls apps/web/src/routes/` is the surface list"), never inline the enumeration
itself. A sentence that can go stale independently of the derivation it summarizes is a defect
at generation time (specs/20260813/04-plan-lock-obligation-carriers.md D4: a generated run
skill on a host named its routes inline and went stale the moment new ones shipped).

`init-gen generate` is the sole writer of 1–6, 8, and 10 below, from the judgment content you
author into the profile JSON (Phase 4); 7 and 9 stay session-authored (D2's boundary), and you
record them into the profile's `manifestExtras` so the manifest still carries a row for each.

1. `.claude/spec.config.json` — machine-readable knobs
2. `.claude/rules/spec-pipeline.md` — prose grounding, seven sections, `paths:`-scoped so it
   ambient-loads only for spec/pipeline work (commands Read it explicitly regardless)
3. `.claude/rules/conventions/*.md` — per-layer **path-scoped convention rules**: small rule
   files whose `paths:` globs mirror `routing`, so any session touching a matching file gets
   that layer's hard rules without pipeline machinery (Phase 3)
4. `.claude/agents/*.md` — project-grounded implementer agents (one per batch kind)
5. `scripts/spec-patterns.sh` — mechanical shortcut sweep adapted to this repo
6. `.claude/settings.json` `permissions` block — allow entries for the exact toolchain
   commands the config declares, deny entries for destructive ops and secrets reads; merged
   into any existing block, never clobbered
7. Design-capable hosts only: the **design foundation** — token files verified/landed, a
   one-page design doctrine doc, the living showcase catalog entry (Phase 6)
8. `.claude/skills/spec-verify/SKILL.md` and `.claude/skills/run/SKILL.md` — the per-host
   **verify** and **run** skills: how to launch, seed, and observe this app, both derived
   from Phase 1's profiling
9. The **runtime substrate** where the repo lacks it (Phase 1.5): health endpoint, seed entry
   point, local DB provisioning, quickstart — the things the verify skill and the smoke leg
   presuppose
10. `.claude/spec-manifest.json` — the **deliverable manifest**: every deliverable above plus
    the activation each claims, verified by `manifest-check.sh` **before** the config is
    stamped. Init is the one LLM in the pipeline whose output would otherwise ship
    unverified — this closes that recursion.
11. A short report: what was generated, what was verified, what needs the user's eyes

## Phase 1 — Profile the repo

Launch parallel Explore agents (`model: sonnet`) and read key files yourself:

- **Stack & toolchain:** language(s), framework, package manager, test runner, linter,
  typechecker, codegen tools. Extract the real commands from `package.json` scripts /
  `Makefile` / `pyproject.toml` — never guess (`make check`? `bun typecheck && bun lint &&
  bun test:run`? `uv run pytest`?).
- **Component catalog:** present? A component-preview host (e.g. Storybook — web: `.storybook/`
  config, `storybook` script — or Widgetbook — Flutter: `widgetbook` in `pubspec.yaml`, a
  widgetbook entrypoint/sub-package — or an equivalent like Ladle or Histoire).
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
  would be critical-tier?
- **Runtime & observability:** how to launch the app locally — dev command, ports, required
  env vars/secrets stubs; how to seed a testable state — test user/credentials, fixtures, seed
  script, db reset; how to observe behavior once it's running — URLs/routes, CLI invocations,
  log locations, and whether the observable surface is browser, API, or both. Derive every
  answer from `package.json` scripts, the README, `docker-compose.yml`, Playwright/Cypress
  config, seed scripts — never guess. This is the profiling input to the verify skill below.

Interview the user via `AskUserQuestion` only for what the code cannot answer — glossed in plain
English, recommended-first, with one line of consequence per option (e.g. "which surfaces should
get the extra critical-tier scrutiny — the ones where a bad change is expensive to fix after it ships?
(Recommended: money/auth/migration paths, if this repo has any — missing one lets a risky change
through at routine speed; naming too many slows every ordinary edit down with critical tier's extra
build/review overhead)", with the real candidate paths as informed options).

**Author the generated skills' content** from the runtime & observability findings above, for
`profile.skills` (Phase 4) — deliverables, not incidental notes; `init-gen generate` writes
both files from what you author here. Two skills, one profiling pass:

- **`profile.skills.specVerify`** (written to `.claude/skills/spec-verify/SKILL.md`) —
  `description` written as a trigger condition (e.g. "Use when exercising a spec-pipeline
  finding or an acceptance criterion against the running app instead of just reading code —
  launching it, seeding a test state, and observing real behavior"). `body`: how to launch the
  app locally (dev command, ports, env), how to seed a testable state (test user, fixtures, db
  reset — whatever this repo reveals), and how to observe behavior (URLs/routes, CLI
  invocations, log locations, browser vs API surfaces). Every instruction must trace to a real
  file in this repo — `package.json` scripts, the README, `docker-compose.yml`,
  Playwright/Cypress config, a seed script; where the repo is silent, write `[NEEDS
  CLARIFICATION: <question>]` rather than guess. State its consumers in the body:
  `/spec:review`'s verifiers use it to exercise findings; critical-tier builds may use it for
  advisory behavioral checks of acceptance criteria — advisory only, it gates nothing until the
  run ledger (`.claude/spec-runs.jsonl`) shows its verdicts track real escapes.
- **`profile.skills.run`** (written to `.claude/skills/run/SKILL.md`) — the session-facing
  sibling: `description` as a trigger ("Use when launching this app locally to see it working —
  dev server, ports, env, seed, and where to look once it serves"). `body`: the launch command,
  ready check, seed entry point, and observation URLs — a distilled subset of the same
  profiling, ≤30 lines, pointing at `spec-verify` for the deeper seeding/observability detail
  rather than duplicating it. This is the file the harness's built-in `/run` and `/verify`
  behaviors discover, so it pays off outside the pipeline too.
- **`allowedTools` (both):** pre-authorize exactly the Bash commands each body instructs (boot,
  ready check, seed) so invoking the skill doesn't burn permission prompts on its own
  documented commands.

## Phase 1.5 — Runtime substrate (generate what verification presupposes)

Session-authored, per the D2 boundary — `init-gen generate` does not write any of this; you
record each item as a `manifestExtras` row (Phase 4) so the manifest still claims it.

The verify skill, the smoke leg, and any DB-gated test suite all presuppose a runnable
substrate. Where Phase 1's profiling found gaps, **create the substrate — don't just record
the gap**: a host that skips this ships without knowing whether it can even run, and "can I
run this?" becomes a full investigation instead of a one-line answer. Each item is small,
and each is skippable only by an explicit `inert` manifest row with a reason:

- **Health endpoint** — if the app serves HTTP and has no cheap liveness route, add one
  (e.g. `/api/health` returning 200 + version). It is the `runtime.readyCheck` target, the
  deploy healthcheck, and the e2e webServer wait, all in one ~10-line file.
- **Local DB/service provisioning** — if `.env.example` points at databases nothing creates,
  add the missing compose file or provisioning script so `TEST_DATABASE_URL`-style gates can
  actually be satisfied locally. An env-gated test suite whose env costs "hand-provision two
  databases" never runs — and a skip is not a pass.
- **Seed entry point** — a script that produces an observable post-signup state (test
  tenant/user, minimal fixtures). Without it, "launch, seed, observe" fails at step two.
- **Worktree env manifest** — if gitignored runtime config exists (`.env*`, local override
  files), write `.worktreeinclude` at the repo root listing those patterns (gitignore
  syntax; Claude Code's native format). `merge-back.sh create` copies matching gitignored
  files into every build worktree — without it, worktree builds boot env-less and the
  smoke leg fails on a config artifact, not the code under review.
- **Quickstart** — a root README section (or file) answering "how do I run this?" in five
  lines, citing the real commands.
- **Git remote / CI activation** — check `git remote -v`. If empty, ask the user
  (`AskUserQuestion`, glossed in plain English with a consequence per option): "this repo has no
  git remote, so generated CI config would never run — connect one now (Recommended: CI then
  catches drift on every push, and it's a one-time setup cost) or declare CI inert for now
  (cheaper today, but nothing checks this repo until a remote exists)." Generated CI config with
  no remote executes zero times; the manifest records whichever the user chooses — never an
  undeclared limbo.

## Phase 2 — Probe the host (`init-gen probe`)

Run:

```
node "$(spec-paths init-gen)" probe --root . [--test-command "<config testCommand>"] [--sample <n>]
```

Read-only, deterministic, and it never blocks: every adverse finding is data, not a failure —
`probe` exits 0 on findings, 2 only on a usage error. Pass `--test-command` once Phase 1 has
extracted the real `testCommand` string, so the probe can execute it against a synthesized
nonexistent path (`--sample` bounds how many tracked source files the at-risk sub-probe
samples; default is up to 20).

stdout is a single JSON object:

```jsonc
{
  "frontendDesign": { "installed": true, "enabled": true, "scope": "user" },
  //   or { "installed": false } · or { "unavailable": "no-claude-cli" }
  //   or { "unavailable": "unparseable-plugin-list" }
  "testCommand": { "failsLoudOnNoMatch": true, "exit": 1 },   // only when --test-command given
  "atRisk": { "sampled": 20, "testFiles": 14, "refs": 3 }     // via scope-reconcile --probe-at-risk
}
```

Detection is the script's job; every finding here routes to Phase 3's interview — the probe
itself never installs, never asks, never fails on an adverse finding:

- `frontendDesign` — presence/enablement/scope only. The design-capable-host install **offer**
  is Phase 3's job, never the script's (ADR-0001's word is "offers", not installs). An
  `unavailable` value means detection itself couldn't run (no `claude` CLI, or an unparseable
  `claude plugin list --json` shape) — Phase 3 falls back to asking the user directly.
- `testCommand.failsLoudOnNoMatch: false` — this repo's test runner exits 0 on a path matching
  nothing, the exact vacuous-pass class an escaped defect rode in on (specs/20260822/02-init-generation-script.md
  D8); Phase 3 surfaces it.
- `atRisk.refs: 0` — the at-risk review leg's path-substring heuristic found no test
  references among the sampled files; Phase 3 discloses that the leg will likely never fire on
  this host.

## Phase 3 — Interview

Every question here — the ones above from Phase 1/1.5's profiling and the three below driven
by Phase 2's probe — follows shared § Question Style: plain language, product-behavior lens,
the ten-second cold test, recommended option first labeled "(Recommended)", consequences in
each option's `description`.

- **frontend-design install offer** — design-capable hosts only (a `design` block is coming
  out of Phase 1), shown when the probe reports `"frontendDesign": {"installed": false}`: offer
  to install it now, e.g. "the frontend-design plugin adds visual-design instruction Claude
  doesn't otherwise have; install it now (Recommended — a one-time command; design work
  proceeds without that extra instruction until you do) or skip for now?" On yes, run exactly:

  ```
  claude plugin install frontend-design@claude-plugins-official --scope user -y
  ```

  This is an offer, never a script decision — the script only detects, this session only asks,
  the user only consents (A2: if the install invocation itself fails loud, tell the user and
  point them at `/plugin install frontend-design` interactively; nothing else depends on it).
  When the probe instead reports `{"unavailable": "no-claude-cli"}` or `{"unavailable":
  "unparseable-plugin-list"}` (A1), detection couldn't run at all — fall back to asking the
  user directly whether frontend-design is already installed, then make the same offer either
  way.
- **testCommand vacuous-pass disclosure** — shown when the probe reports `"testCommand":
  {"failsLoudOnNoMatch": false, ...}`: tell the user their test-runner invocation exits 0 on a
  path matching nothing, and ask whether to accept that risk as-is or fix the invocation before
  continuing. Record the ruling either way — never silently accept a vacuous pass.
- **at-risk applicability disclosure** — shown when the probe reports `"atRisk": {"refs": 0,
  ...}`: tell the user the at-risk review leg will likely never fire on this host (its
  path-substring heuristic found zero references among the sampled files — the known failure
  mode on Python/Go-shaped import styles) and ask whether that's expected or worth a closer
  look before accepting it.

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
  design-capable hosts. Real paths, real commands, no invented references — the script
  validates keys and exits 2 naming the first missing one; a *wrong* value is never caught.
- **`rules.sections`** — the six judgment sections (Risk Tiers / Planning / Build / Worker
  Rules / Test Rules / Review Checks) as this repo's concrete grounding: the critical-tier
  trigger list with real paths, the new-surface checklist, orchestrator integration duties,
  worker/test conventions, reviewer severity calibrations — same content bar the pipeline
  rules file has always carried — rules state the current invariant plus one owner citation,
  never dates, people, hosts, versions, or prior behavior. `## Gotchas` is never authored
  here; the script emits it empty with its own contract header.
- **`conventionRules`** — one entry per routing kind with hard conventions worth ambient
  enforcement (skip kinds with nothing beyond generic style); each `paths` glob must match ≥1
  tracked file, each `body` ≤15 lines citing the matching agent and one exemplar file rather
  than duplicating its tables, and one owner citation per rule that needs one, never a dated
  story.
- **`agents`** — one entry per non-`default` `agentMap` kind. Study real code first: for each
  kind, read the canonical files of that layer and extract naming tables, exemplar paths, and
  constraints — every path and export you cite must exist. Per field: `persona` is a paragraph
  (the script renders it under an auto-generated `# {Kind} Specialist` heading) stating what
  this agent owns in THIS repo's vocabulary and what it never does; `expertise` is bullets of
  concrete files/surfaces it owns; `reference` is bullets of verified pointers — rule docs
  governing the layer, 1–3 canonical exemplar files, generated files to grep rather than guess;
  `constraints` is bullets of this layer's hard rules (the ones CI or review would catch), each
  imperative with the sanctioned alternative, naming-convention tables with real repo examples
  earning their keep; `mcp` is omitted unless the layer leans on third-party APIs, in which
  case it names the Context7/registry queries to run interactively and closes with: "**Pipeline
  carve-out:** the lookups above apply to interactive invocations only. As a spec-pipeline
  worker you never query MCPs — `/spec:plan` embeds the needed references into the spec's
  UI/Contracts sections." The `## Worker Contract (spec pipeline)` section (and, for the
  `tests` kind, the Tests-kind addendum) is never authored here — the script emits it
  byte-identical across every agent from `templates/grounding-contract.md`, substituting only
  `selfVerifyExamples`. Host-repo agents (unlike plugin agents) get `permissionMode:
  acceptEdits` and `memory: project` automatically; you don't declare either.
- **`skills`** — the content Phase 1 already authored, carried here verbatim.
- **`settings.extraAllow`/`extraDeny`** — beyond the allow set the script derives automatically
  from `gateCommand`/`testCommand`/`setupCommand`/`patternsScript`/`runtime.*` and the deny
  defaults (`Bash(rm -rf:*)`, `Read(.env*)`); add whatever this repo's toolchain or secrets
  shape additionally needs.
- **`patternSweeps`** — repo-specific `sweep "<name>" -e '<regex>' [-g '!<glob>' ...]` calls
  grounded in the Worker/Test/Review rules above (suppression markers, deferred-work comments,
  discipline bypasses, boundary violations, generated-surface edits vs `DIFF_BASE`) — spliced
  verbatim into the generated harness.
- **`sourceRoot`** — the patterns script's default scope and the at-risk probe's sampling root.
- **`manifestExtras`** — one row per deliverable the script does NOT itself write: every
  Phase 1.5 substrate item you created (or declared `inert`) and every Phase 6 design-foundation
  artifact (doctrine doc, token files, showcase catalog entry) — the D2 boundary line: those
  stay session-authored, but the manifest must still claim each of them.
- **`probeOutcomes`** — Phase 3's rulings, verbatim.

## Phase 5 — Generate (`init-gen generate`)

On a greenfield repo this phase already ran once, from genesis's own `HANDOFF` step — this
invocation is the brownfield first-run, or a refresh of a genesis-grounded repo. Run:

```
node "$(spec-paths init-gen)" generate --root . --profile <scratchpad profile path> [--refresh]
```

Ordering is enforced in code, not prose: validate the profile → refuse-or-refresh scan → write
every script-owned artifact → assemble the manifest (script rows plus your `manifestExtras`) →
run `manifest-check.sh` → stamp `generatedBy`/`contractHash` only on green. An interrupted run,
or one that exits non-zero, leaves the config exactly as it was before — the same "either no
row or a complete one" property the run ledger's own contract relies on.

Exit codes:

- **0** — generated, `manifest-check.sh` green, config stamped.
- **1** — `manifest-check.sh` red; nothing stamped. Fix the named row and re-run.
- **2** — usage error, an invalid profile (the first missing required field, named, with the
  remedy printed), or an unparseable Worker Contract (`templates/grounding-contract.md`'s
  expected heading not found).
- **3** — one or more existing target files differ from what the profile would produce and
  `--refresh` was not passed; nothing was written. Diff the named files yourself, fold whatever
  the user hand-edited back into the profile, then re-run with `--refresh` — it overwrites and
  prints one `changed:`/`unchanged:` line per file. `.claude/settings.json` is the one
  exception: it always merge-preserves in both modes (every existing entry kept; an existing
  deny covering a would-be allow stays, reported, never overridden).

## Phase 6 — Design foundation (design-capable hosts only)

Session-authored, per the D2 boundary (Phase 4's `manifestExtras` records these rows — the
script never sees this phase's output directly). Skip unless Phase 1's `config` wrote a
`design` block. Goal: a **design foundation, not a design system** — the binding canon
`/spec:design` reads (tokens + doctrine). The system itself grows later by extraction through
specs; do not invent components or tokens no planned surface needs yet.

**Precedence — check for a genesis canon first.** If `.claude/genesis/status.json` exists
(the genesis stage seeded this repo), branch four ways on its `design` value:

- `rules-locked` or `skipped` → **consume, never re-prompt.** The canon already exists: the
  genesis design state authored the doctrine + token files and
  `.claude/genesis/design-rules.json`. Do NOT run the adopt/craft `AskUserQuestion` below —
  extract from what's there (treat it like brownfield), and record `genesisStackDescriptor` +
  `design.rulesManifest` in `profile.config` (enforcement is generated later by
  `/spec:enforce`, Phase 8). On `skipped` (headless archetype) write no `design` block at all.
  Report mode `genesis` in Phase 7.
- `doctrine-drafted` / `tokens-landed` → **partial canon: STOP.** Tell the user to finish the
  genesis design state (re-run `/spec:genesis` to lock its rules) first; the state gate also
  blocks this. Do not half-adopt.
- `pending`, or any value outside the three arms above → **warn and proceed** — matching
  genesis.md's own gate for this state ("warned, proceeds"). Write **no** `design` block (the
  canon isn't ready to consume, and adopt/craft here would mint a second canon that the genesis
  design state later contradicts); name **re-run `/spec:genesis`** as the pending finisher in
  both the warning and the Phase 7 report. Never run the adopt/craft `AskUserQuestion` below for
  this arm.
- (no `.claude/genesis/` at all) → the greenfield adopt/craft path below.

**Enforcement is generated by `/spec:enforce`, not here.** This phase does NOT emit linters,
contracts, or hooks for the design rules (or any other rules). It records the consume-side keys
(`genesisStackDescriptor`, `design.rulesManifest`, `designRulesHash`) in `profile.config` and
leaves the actual category→enforcer selection — discovered and verified at runtime, never from
a hardcoded mapping — to the dedicated command. Init **ends by invoking `/spec:enforce`**
(Phase 8), which mechanizes the design rules together with the rest of the host's rule set in
one pass. This keeps a single enforcement brain on its own cadence (rules/tooling drift, not
repo re-profiling).

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
  fit, they fall to pipeline rules § Review Checks — `/spec:enforce` owns that decision, not
  this phase.
- Keep the doctrine doc to **one page**; record its path as `design.doctrine` in
  `profile.config`.
- Add a `manifestExtras` row (Phase 4) for every artifact this phase lands — the doctrine doc,
  each landed/overridden token file, the showcase catalog entry.

## Phase 7 — Report

1. Re-read `generate`'s own stdout for anything unresolved: a settings-merge conflict line (an
   existing deny kept over a would-be allow), the `changed:`/`unchanged:` lines from a
   `--refresh` run, or an accepted-risk `probeOutcomes` reason from Phase 3 — these become
   `warns`.
2. Assemble the slots below and write them to a scratch JSON file, then print
   `node "$(spec-paths report-render)" --slots <file>` verbatim (shared § Console Output
   Style — the script is the sole render authority; never hand-format the output):
   - `outcome`: ✅ anchor (⚠️ if something needs the user), text
     `initialized — {N} files, gate verified, stamped`
   - `bullets`: two plain-language lines, replacing the old `{kind → name}`/glob dumps with
     meaning (§ Console Output Style's "meaning over dumps") — (1) what was generated: agent
     count, the verify + run skills, convention-file count, the critical-tier triggers chosen, and the
     permissions entries landed; (2) runtime + design-foundation state: boot/ready commands
     or a declared-inert reason, and the design foundation status — genesis / extracted /
     adopted / crafted / pending (name **re-run `/spec:genesis`** as the finisher when pending) —
     with its doctrine path
   - `warns`: one line per unresolved item from step 1, plus anything Phase 1's citations
     couldn't be spot-checked against the repo
   - `next`: `{kind: 'status-verbatim', text: <captured output of
     node "$(spec-paths spec-status)" --next>}` — never a hand-written `Next: /spec:enforce`:
     Phase 8 auto-chains enforcement in this same run, so naming it as a next step would
     misleadingly suggest a manual action that is about to happen automatically

   ```report
   ✅ **initialized — 14 files, gate verified, stamped**
   - generated 6 implementer agents, the verify + run skills, 3 convention rule files, and the tier/permissions grounding this repo needs to run the pipeline safely
   - runtime ready (`bun dev`, health-checked) · design foundation adopted — docs/design/doctrine.md
   ⚠️ manifest-check found one unverified row — settings.json permissions merge kept an existing deny in place, surfaced for review
   {spec-status --next, verbatim}
   ```

## Phase 8 — Generate enforcement (invoke `/spec:enforce`)

The grounding layer is now in place but the rules are not yet mechanized. **End by invoking
`/spec:enforce`** so a fresh repo leaves init with its rule set deterministically enforced in one
shot. Enforcement is a separate command by design — different cadence (rules/tooling drift, not
repo re-profiling) and expensive, flaky work (live research + install-and-verify) — so init does
not inline it; it hands off. Tell the user enforce is running and that it is independently
re-runnable later when rules or tooling change.

## Rules

- Never write a reference you did not verify against this repo's actual code.
- Plugin agents cannot declare `permissionMode`/`memory`; the host agents `init-gen generate`
  writes CAN and DO (`permissionMode: acceptEdits`, `memory: project`) — the script emits this
  frontmatter automatically from each `profile.agents[]` entry; you never declare it yourself.
- The `## Worker Contract (spec pipeline)` section is byte-identical across all generated
  agents — the script extracts it from `templates/grounding-contract.md` at generate time and
  substitutes only `profile.selfVerifyExamples`; you never author it.
- Re-running `/spec:init` refreshes the grounding layer: `init-gen generate` refuses (exit 3)
  to overwrite any target file that already differs from what the profile would produce —
  re-profile, diff the named files, fold whatever the user hand-edited back into a re-authored
  profile, then re-run with `--refresh` (Phase 5, D5). `.claude/settings.json` always
  merge-preserves regardless of `--refresh`. A run that reaches exit 0 re-stamps `generatedBy`
  and `contractHash`. (To check for drift without regenerating, the user runs `/spec:doctor` —
  read-only, much cheaper.)
- `AskUserQuestion` dismissed → STOP.
