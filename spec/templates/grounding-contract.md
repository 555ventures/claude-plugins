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
`pipelineRules`. Optional: `driftScript`, `routing`, `design`
(`tool`/`command`/`storyFormat`/`doctrine`, optional `screenshot`, optional `rulesManifest`),
and the foundation-handoff keys `foundationStackDescriptor` and `designRulesHash` (see
§ Foundation handoff).

## Foundation handoff (optional — present when the `foundation` plugin seeded the repo)

When `/foundation:architect` + `/foundation:design` ran first, `/spec:init` consumes their
on-disk artifacts instead of re-deciding:

- `foundationStackDescriptor` — path to `foundation/stack-descriptor.json` (archetype, stack,
  `designCatalog`, resolved `gateCommand`). Optional; absent in repos not seeded by foundation.
- `design.rulesManifest` — path to `foundation/design-rules.json`.
- `designRulesHash` — hash of the rules manifest, stamped by `/spec:init`; `/spec:doctor`
  recomputes it and warns when the design rules changed but enforcement was not regenerated.

**Decide vs implement.** The manifest's rules carry a `targetCategory` **enum only** —
`color | i18n | structure | a11y | density` — never a tool name. `/spec:init` owns the single
category→tool mapping per detected stack and is the sole enforcement generator. A category with
no mechanical enforcer on the stack becomes a Review-Check prose rule — never silently dropped.

## Required pipeline-rules sections (file at `pipelineRules`)

`Risk Tiers` · `Planning` · `Build` · `Worker Rules` · `Test Rules` · `Review Checks`

## Worker Contract (byte-identical across all generated agents)

Substituting only the parenthesized self-verify examples with the host's scoped commands —
the same way in every agent:

```markdown
## Worker Contract (spec pipeline)

When dispatched as a batch worker by the `wf-spec-build` workflow:

- The spec's **Decisions** table is authoritative — apply it verbatim. An unlocked design fork or stale spec assumption is a `blocked` return (kind, detail, options, recommendation), never a guess.
- Do NOT query MCP servers — the spec's UI and Contracts sections embed the references you need. If an embedded reference is wrong against the installed version, return blocked `{kind: "stale-assumption"}`.
- Edit only files in your assigned batch. Return receipts — files touched + one-line summaries — not narration.
- NEVER run git commands (checkout/stash/restore/reset/clean/add/commit). Bash is for scoped self-verification only (`bun lint`, `bun test:run <your files>`, `bunx tsc --noEmit`). The orchestrator owns git; a repo-wide git op destroys sibling workers' uncommitted edits.
```

## Tests-kind addendum (appended after the contract bullets, identical wording)

```markdown
- As a TDD red-phase author: derive tests ONLY from the spec's Acceptance Criteria and Behavior sections, never from implementation code. Reference the AC-ID per this repo's convention.
- Every new test must FAIL on current code. If a test would already pass, the spec is wrong — return blocked `{kind: "stale-assumption"}`. Write NO implementation code; never weaken assertions to make tests pass.
```
