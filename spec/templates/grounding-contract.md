# Grounding-Layer Contract

This file IS the contract between the plugin's process layer and the grounding layer
`/spec:init` generates in each host repo. Drift detection is automatic: `/spec:init` stamps
this file's hash (`spec-paths contract-hash`) into the host's `.claude/spec.config.json` as
`contractHash`; the state-gate hook recomputes and compares on every pipeline command and
warns on mismatch. **Any edit to this file flags every host's grounding as stale** — edit it
only when the contract genuinely changes, and never edit it for wording alone.

## Required config keys (`.claude/spec.config.json`)

`generatedBy`, `contractHash`, `gateCommand`, `testCommand`, `setupCommand`,
`patternsScript`, `layerGroups`, `agentMap` (must include `tests` and `default`),
`pipelineRules`, `runtime` (see § Runtime verification). Optional: `driftScript`, `routing`,
`design`
(`tool`/`command`/`storyFormat`/`doctrine`, optional `screenshot`, optional `rulesManifest`),
`release` (see § Release), `capabilities` (see § Capabilities), the rule-enforcement keys
`enforcementManifest` and `rulesEnforcementHash` (see § Rule enforcement), and the
genesis-handoff keys `genesisStackDescriptor` and `designRulesHash` (see § Genesis handoff).
`design.copyCatalogs` is REQUIRED when the host routes copy through an i18n stack (`design`
block present and the repo has an i18n dependency) — the `/spec:design` fidelity gate accepts
mock copy only as catalog values, and without this key it would demand literals the host's
i18n lint forbids.

## Runtime verification (required)

Every verification claim the pipeline makes must be backed by an executed observation — a
verification stack composed entirely of static legs can pass a program that cannot start
(UpWell, 2026-07: 8/8 gate tasks green while `GET /` returned 500 on every commit). The
`runtime` config block is the contract for the executed leg:

- `runtime.bootCommand` — starts the app locally (e.g. the dev command).
- `runtime.readyCheck` — a command that exits 0 once the app observably serves (e.g.
  `curl -sf localhost:3000/api/health`).
- Optional: `runtime.seedCommand` (seeds an observable state), `runtime.readyTimeout`
  (seconds, default 120), `runtime.stopSignal` (default SIGTERM).
- Hosts with no bootable process (libraries, pure CLIs) declare
  `runtime: {"inert": "<reason>"}` — an explicit exemption, never a silent omission.

The plugin's `smoke.sh` (`spec-paths smoke`) executes this contract deterministically;
`/spec:review` runs it as a verdict leg (CLEAN requires it), and `/spec:init` proves it once
via the deliverable manifest before stamping.

## Deliverable manifest (required)

`/spec:init` writes `.claude/spec-manifest.json` — one entry per deliverable, each carrying
the activation it claims (`file` exists / `exec` runs / `smoke` boots / `remote` resolves /
`inert` with a stated reason). The plugin's `manifest-check.sh` (`spec-paths manifest-check`)
verifies every claim by existence or execution, fail-closed. **Init may not stamp
`generatedBy`/`contractHash` until it exits 0** — authored artifacts count only once their
activation is demonstrated. `/spec:doctor` re-runs it as the activation drift check.

## Session grounding (required)

Three deliverables serve **every** Claude session in the host — interactive or pipeline — not
only spec commands (adopted 2026-07 from the mid-2026 Claude Code baseline: path-scoped rules,
checked-in permissions, generated project skills):

- **Path-scoped rules.** The pipeline-rules file opens with `paths:` frontmatter scoping its
  ambient load to `specs/**` and `.claude/**` — pipeline commands Read it explicitly, so
  nothing changes for them; ordinary sessions stop paying its context cost. Layer conventions
  additionally live as small per-kind rule files in `.claude/rules/conventions/`, each with
  `paths:` globs derived from the same evidence as the config `routing` — a rule loads only
  when a session touches a matching file. A `paths:` glob matching zero tracked files is
  drift (`/spec:doctor` flags it: that rule silently never loads).
- **Permissions.** `.claude/settings.json` carries a generated `permissions` block: allow
  entries for the exact toolchain commands the config declares (gate / test / setup / boot /
  patterns), deny entries for destructive ops and secrets reads (`.env*`). Init merges into
  an existing block — never clobbers user entries, never emits a broad `Bash(*)` allow.
- **Run skill.** `.claude/skills/run/SKILL.md` — launch + observe for interactive sessions,
  generated from the same runtime profiling as `spec-verify`. Generated skills declare
  `allowed-tools` pre-authorizing exactly the commands their body instructs; any generated
  skill with side effects beyond local launch/seed declares `disable-model-invocation: true`.

## Release (optional — present when the host deploys)

`release` — the milestone release gate's grounding (`/spec:release`): `deployCommand`
(staging), `stagingUrl`, `e2eCommand` (takes the target URL via `BASE_URL`), optional
`promoteCommand` + `productionUrl` + `healthPath`. All host-declared at init/first-release
time — the plugin never invents deploy mechanics.

## Capabilities (optional — declares stack-shaped facts the pipeline would otherwise assume)

Several commands and scripts used to hardcode a stack shape — GitHub as the forge, a universal
skip-count format, pnpm-shaped monorepos, Storybook-shaped previews — and on a host where the
assumption missed, the consuming leg went inert *silently* (audit Class C). `capabilities` is
one closed block, written by `/spec:init`'s detection pass, read at the single points that
consume each fact:

```jsonc
"capabilities": {
  "forge": "github",              // or "none" — who runs CI/PRs; read by ci-query.js/observe-ci.js
  "skipReportPattern": "none",    // regex over test-runner output capturing the skip count (group 1;
                                  // optional group 2 = todos), or "none"
  "ciPoll": { "intervalSeconds": 30, "timeoutSeconds": 600 }
}
```

**Absent block = legacy mode** — today's dynamic probing (`ci-query.js`/`observe-ci.js` probe
`gh` at use time) plus `/spec:doctor` check 2's undeclared-capabilities nudge; nothing breaks on
a host that predates this block. A present block is authoritative: `forge:"none"` makes the CI
scripts print the canonical line `unavailable — no supported forge adapter` and exit cleanly
rather than probe; a `skipReportPattern` of `"none"` (or no match) makes a skip-capture leg
report `unavailable — host runner declares no skip format` instead of assuming zero;
`ciPoll` overrides `/spec:release`'s poll interval/timeout when present, otherwise the 30s/600s
defaults hold.

## Genesis handoff (optional — present when the genesis stage seeded the repo)

When `/spec:genesis-architect` + `/spec:genesis-design` ran first, `/spec:init` consumes their
on-disk artifacts instead of re-deciding:

- `genesisStackDescriptor` — path to `.claude/genesis/stack-descriptor.json` (archetype, stack,
  `designCatalog`, resolved `gateCommand`). Optional; absent in repos not seeded by the genesis stage.
- `design.rulesManifest` — path to `.claude/genesis/design-rules.json`.
- `designRulesHash` — hash of the rules manifest, stamped by `/spec:init`; `/spec:doctor`
  recomputes it and warns when the design rules changed but enforcement was not regenerated.

**Decide vs implement.** The manifest's rules carry a `targetCategory` **enum only** — a category,
never a tool name. `/spec:enforce` owns the single category→enforcer selection per detected stack
and is the sole enforcement generator (`/spec:init` ends by invoking it). The design enum
(`color | typography | i18n | structure | a11y | density | layout`) folds into the enforcement category taxonomy as a
pre-classified input. A category with no mechanical enforcer on the stack becomes a Review-Check
prose rule — never silently dropped.

## Rule enforcement (optional — present after `/spec:enforce` has run)

`/spec:enforce` mechanizes the host's full rule set into deterministic checks wired to the
`gateCommand`, and records its choices in a manifest. The contract:

- `enforcementManifest` — path to `.claude/rules/enforcement.json`: one entry per
  `(stack × category)` cell carrying the chosen enforcer (or fallback), the discovery citation,
  the verified run command, and the gate wiring — plus, for a ratchet category, a `baseline`
  field (`path`, `establishCmd`) recording the once-established quarantine snapshot. Provenance
  — never plugin prose.
- `rulesEnforcementHash` — hash of that manifest, stamped by `/spec:enforce`; `/spec:doctor`
  recomputes it and warns when rules changed but enforcement was not regenerated.
- The reserved, language-neutral category taxonomy is `module-boundary | naming | forbidden-symbol
  | structural-pattern | datetime | schema-validation | format | duplication | cycle`. Tool
  selection is **two-stage and runtime**: DISCOVER against live sources with citations (never
  training memory), then VERIFY the tool installs and runs against the repo before adoption.
  **No plugin file names a specific linter/formatter/arch-tool/hook-runner** — a named tool
  anchors the agent and goes stale faster than the rules. `duplication` and `cycle` are **ratchet
  categories**: enforcement quarantines the host's existing violations in a one-time baseline
  snapshot and the gate blocks only on violations not already in it, never on legacy debt.

## Required pipeline-rules sections (file at `pipelineRules`)

`Risk Tiers` · `Planning` · `Build` · `Worker Rules` · `Test Rules` · `Review Checks` ·
`Gotchas`

## Worker Contract (byte-identical across all generated agents)

Substituting only the parenthesized self-verify examples with the host's scoped commands —
the same way in every agent:

```markdown
## Worker Contract (spec pipeline)

When dispatched as a batch worker by the `wf-build` workflow:

- The spec's **Decisions** table is authoritative — apply it verbatim. An unlocked design fork or stale spec assumption is a `blocked` return (kind, detail, options, recommendation), never a guess.
- The rules file's `## Gotchas` section is hard context, not a suggestion — it is distilled from this repo's real failures.
- Do NOT query MCP servers — the spec's UI and Contracts sections embed the references you need. If an embedded reference is wrong against the installed version, return blocked `{kind: "stale-assumption"}`.
- Edit only files in your assigned batch. Return receipts — files touched + one-line summaries — not narration.
- NEVER run git commands (checkout/stash/restore/reset/clean/add/commit). Bash is for scoped self-verification only (`bun lint`, `bun test:run <your files>`, `bunx tsc --noEmit`). The orchestrator owns git; a repo-wide git op destroys sibling workers' uncommitted edits.
```

## Tests-kind addendum (appended after the contract bullets, identical wording)

```markdown
- As a TDD red-phase author: derive tests ONLY from the spec's Acceptance Criteria and Behavior sections, never from implementation code. Reference the AC-ID per this repo's convention.
- Every new test must FAIL on current code. If a test would already pass, the spec is wrong — return blocked `{kind: "stale-assumption"}`. Write NO implementation code; never weaken assertions to make tests pass.
```
