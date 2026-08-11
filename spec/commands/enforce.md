---
description: Generate deterministic, stack-appropriate enforcement for the host's full rule set — classify rules by category, discover+verify an enforcer per (stack × category), wire into the gate, record provenance
argument-hint: [focus — optional, e.g. a category or rule-doc path to re-enforce]
---

# Spec Enforce: Mechanize the Rule Set

Turn the host repo's rules into **deterministic checks that run in its gate command**. The
guiding principle does not rot: *consistency requires determinism.* For any rule a linter,
arch-tool, or text/structural matcher CAN check, an LLM checking it at runtime is a strict
downgrade — non-reproducible, brittle, false-confidence coverage. So enforcement is mechanical
and lives in the gate; the only sanctioned runtime LLM rule-check is `/spec:plan` reading a draft
spec (prose has no CI). This command neither depends on nor replicates a host's `/comply`.

This is a different cadence from `/spec:init`: enforcement regenerates when **rules or tooling**
change (frequent), not when the repo is re-profiled (rare), and the work is expensive and flaky
(live research + install-and-verify). So it is its own command, independently re-runnable.

**Intended model: Opus.** **Setup:** run `spec-paths shared-for enforce` and read its output (shared
invariants). Read the host's `.claude/spec.config.json` and its pipeline rules file
(`pipelineRules`). If either is missing, STOP: tell the user to run `/spec:init` first. Also run
`spec-paths wf-enforce` once and keep the printed absolute path — it is the `scriptPath` for
the research workflow below.

## Input

`$ARGUMENTS` — optional. Empty → enforce the whole rule set. A category name or a rule-doc path →
re-enforce just that slice (cheap, targeted re-run on a single rule/tool drift).

## The category taxonomy (stable — never name a tool in this file)

Classify every mechanizable clause into ONE language-neutral category. These are stable; the
*tools* are not, so they are discovered at runtime, never written into this prose:

`module-boundary` · `naming` · `forbidden-symbol` · `structural-pattern` · `datetime` ·
`schema-validation` · `format` · `duplication` · `cycle`.

This is the operational copy of the canonical taxonomy in the grounding contract (`spec-paths
contract`); they must stay in sync — the contract is the single source of truth, this file is the
executor's working list.

**Ratchet categories.** `duplication` and `cycle` are enforced as **ratchets**: a per-host
baseline snapshot quarantines existing violations at wiring time, and the gate blocks only on
violations not in that baseline. A candidate for either category must additionally support a
baseline / known-violations mode (Phase 3); a candidate without one fails verify for these
categories — the existing fallback order (sweep → review-check) applies.

Genesis-seeded repos also carry `.claude/genesis/design-rules.json` whose rules use a design enum
(`color | typography | i18n | structure | a11y | density | layout`). Fold these in as **pre-classified
inputs**: `structure → module-boundary`; `color | typography | i18n | density | layout → forbidden-symbol`
or `structural-pattern`; `a11y → structural-pattern` (or judgment residue if no AST check fits). No
design category folds into the ratchet categories (`duplication`, `cycle`) — they arrive only via a
written host rule or the Phase 5 propose flow.

## The judgment residue (do NOT mechanize — compose over, don't duplicate)

After mechanization, a small set genuinely resists a deterministic check and stays with the
reviewer (severity-calibration prose in pipeline rules § Review Checks), layered OVER the
deterministic coverage: **data-flow ordering** (event-emit vs commit), **semantic intent** of a
function's parameters, **naming tense** (imperative vs past), **sentinel usage** in control flow,
**cross-file N+1 / batch-variant** reasoning, and **"is this a sanctioned carve-out."**
**Pure-process** rules (review neutrality, agent model-routing) are not about source code at all.
Never emit a probabilistic LLM check for something a linter already covers — that is the
anti-pattern this command exists to kill.

## Phase 1 — Classify (interactive command, not the workflow)

Read the host's full rule surface — `pipelineRules`, everything under `.claude/rules/` and
`docs/rules|standards/`, `AGENTS.md` / `CLAUDE.md`, and `.claude/genesis/design-rules.json` if present.
For each clause decide one of:

- **mechanizable** → assign a category + the detected stack(s) it applies to, and the rule-doc
  path(s) carrying its text. (Detect stacks from the config + repo manifests; a polyglot repo has
  more than one.)
- **judgment residue / pure-process** → route to pipeline rules § Review Checks; it is NOT a
  research cell.

Build the **(stack × category) work list**: one cell per distinct pair that has at least one
mechanizable clause. Each cell is `{id, stack, category, ruleRefs}` — `ruleRefs` are PATHS/ids,
never the clause prose (prose lives in the rule docs the agent Reads; free text in `args` corrupts
its JSON — shared § Workflows Encode Shape).

If the work list is large, this is the workflow-shaped part (Phase 2). If it is tiny (a focused
`$ARGUMENTS` re-run, a handful of cells), skip the workflow and research inline — do not fan out
when N is small.

## Phase 2 — Research the enforcer per cell (DISCOVER — the workflow)

Invoke `Workflow {scriptPath: <spec-paths wf-enforce output>, args: {configPath,
pipelineRulesPath, stackDescriptorPath, enforcementManifestPath, cells}}`. Pass `args` as a real
JSON object (the script tolerates the harness's stringified delivery; never double-encode it).

**Invariant — no free text in `args`.** `args` carries only paths, ids, enums, booleans. The
clause text travels as `ruleRefs` paths the research agents Read; `stackDescriptorPath` is `''`
for brownfield repos with no genesis stage, `enforcementManifestPath` is `''` on first run.

The workflow fans out one web-enabled agent per cell that DISCOVERS a deterministic enforcer
against **live sources** (web search/fetch, the stack's package registry, library-docs MCP) **with
citations** — never from training memory — and returns ranked candidates with `installCmd` /
`runCmd` / `citations`, or an empty list + a recommended fallback (`sweep` / `review-check`). The
genesis `stack-descriptor` is passed only as a stack-identity **hint**; the workflow still
researches (this is why enforce works on brownfield repos the genesis stage never touched).

**Return shape:** `{stage: "researched", cells: [...], skipped: [{id, category, reason}],
tokens}`. `skipped` accounts for every cell that was NOT researched (`unknown-category` or
`agent-failed`) — reconcile it against the Phase 1 work list and re-research those cells (inline
for a handful) before Phase 3; a skipped cell is unfinished work, never a silent drop.

For a `duplication` or `cycle` cell, the extra candidate requirement applies: the discovered tool
must support a baseline / known-violations / ignore-file mode, and the citations must demonstrate
that capability specifically, not just the underlying check.

(If Phase 1's list was tiny, do this discovery inline with the same discipline: live citation
required, no tool from memory.)

## Phase 3 — Verify (VERIFY — interactive, in the command, serial)

Stage 2 of tool selection. For each top candidate, in the working tree:

1. **Install** via its `installCmd` (or confirm it is already present from the lockfile).
2. **Run** its `runCmd` against THIS repo. A tool that does not exist, does not install, or does
   not actually run against this codebase **fails verify** — drop it and try the next candidate.
3. On an **ambiguous choice** (two plausible verified candidates, or a tool that changes the
   repo's toolchain) → `AskUserQuestion` with the verified options + their citations.

Fall back, in order, only when every candidate fails verify: the host's existing **pattern-sweep
harness** (`patternsScript`, `scripts/spec-patterns.sh`) for structural/textual clauses; a
pipeline rules **§ Review Checks** prose entry ONLY for genuine-judgment clauses. Never silently
drop a category.

**Ratchet-category verify.** For a `duplication` or `cycle` cell, verify additionally requires the
candidate to support a baseline / known-violations mode: install → run → establish the baseline
via the tool's documented mode → re-run → the re-run must exit green over the established
baseline. A candidate that cannot go green over its own baseline fails verify for these
categories and falls back per the order above.

## Phase 4 — Generate & wire (into the gate)

For each verified enforcer, emit the machine-enforceable artifact and wire it so it runs in the
host's `gateCommand`:

- **Native linter / arch-tool / schema validator** → write its config/contract file; add its
  invocation to the gate (or to the host's existing hook orchestrator if it has one — discover
  which, do not assume one).
- **Structural-pattern with no off-the-shelf tool** → generate a small deterministic checker
  script (pure, non-zero exit on violation) and wire it into the gate.
- **Sweep fallback** → add a grounded `sweep` call to `scripts/spec-patterns.sh` (report-only,
  exits 0 — it is a lead surface for the reviewer, not a gate block).
- **Ratchet category (`duplication`, `cycle`)** → run the verified tool's baseline/known-violations
  mode ONCE against the current tree to establish the **ratchet baseline** — a quarantine snapshot
  of the host's existing violations. This is distinct from the ratchet baseline pass below
  (`baselineRun`): that pass edits application source once to make a check land green,
  while the ratchet baseline only snapshots what already exists and never touches source. Wire the
  gate invocation in **no-new-violations** form (the tool's baseline/ignore-file mode against the
  established snapshot), commit the baseline file alongside the enforcement config, and record
  `baseline: {path, establishCmd}` in the manifest entry (`establishCmd` is the command run once at
  wiring to produce the snapshot).

Reproduce what the repo already enforces (do not duplicate or fight an existing contract — detect
it and leave it, or fold it into the manifest as already-covered) and add the missing structural
enforcers. Generation MAY run as a worktree-isolated workflow stage if many artifacts are written
in parallel; inline is fine when N is small. **This command edits only the host's grounding/gate
layer — never application source** (sole exception: the deterministic baseline pass below).

**Deterministic baseline pass — the one sanctioned source edit** (distinct from the ratchet
baseline snapshot above — that one never touches source; this one does, under the three
conditions below). When a verified enforcer has a
write/fix mode and the tree carries pre-existing violations its new gate check would flag (the
common `format` case: formatter configured but unwired), run that tool's write mode ONCE over the
tree so the check lands green instead of handing the user a red gate only the tool itself can
clear. Conditions, all three: (a) the tool passed two-stage verify (Phases 2–3); (b) the
pre-existing gate is green before the pass and the full gate — including the new check — is green
after it; (c) the run is recorded as `baselineRun` in the cell's manifest entry. The danger the
no-edit rule guards against is semantic edits made by model judgment; a verified deterministic
tool's own output, gate-checked on both sides, is not that. Never hand-edit toward the same
result — if the tool cannot establish its own baseline, the category falls back per Phase 3.

## Phase 5 — Create missing rules (PROPOSE — never auto-author)

Where Phase 1 found a **gap** — a category the stack clearly has conventions for but no rule
exists, or a rule with no enforceable clause — `AskUserQuestion` PROPOSING candidate rules
(grounded in what the codebase already does), and write only what the user approves, into the
appropriate rule doc. Never auto-author rules; a dismissed question leaves the gap recorded, not
filled.

One gap class to hunt explicitly: **fail-silent reference-resolution layers** — any layer where
an invalid string reference degrades silently instead of erroring (an open-vocabulary
style-utility compiler, a styling variable with a silent fallback, a message-catalog key, a
dynamic asset lookup). These pass typecheck, lint, and string-fidelity gates while rendering
wrong output; for each such layer the stack has, propose a rule that every static reference must
resolve, so Phases 2–4 discover a resolution check for it.

Another gap class to hunt explicitly: **architecture-smell gaps** — a host typically has no
written `duplication` or `cycle` rule at all. Where the codebase's own shape (repeated blocks,
import cycles) makes the case, `AskUserQuestion` PROPOSING a duplication and/or cycle rule
grounded in that evidence; only on approval does the clause enter Phase 1 classification into
these ratchet categories. Never auto-author either rule.

## Phase 6 — Record provenance + stamp

Write `.claude/rules/enforcement.json` — the enforcement manifest (one entry per cell):

```jsonc
{
  "schemaVersion": 1,
  "generatedBy": "spec@<spec-paths version>",
  "entries": [
    {
      "id": "python:module-boundary",        // cell id (stack:category)
      "stack": "python",
      "category": "module-boundary",
      "ruleRefs": ["docs/rules/domain-boundaries.md"],
      "enforcer": {                            // null when fallback is used
        "tool": "<discovered tool>",           // recorded as discovered — provenance, not plugin prose
        "mechanism": "arch-tool",
        "configPath": "<written config/contract path>",
        "gateWiring": "<how it enters the gate / hook>",
        "citations": [{ "url": "...", "note": "..." }],
        "verifiedRun": "<runCmd that passed in Phase 3>",
        "baselineRun": "<write-mode cmd run once to establish the baseline>",  // optional — only when Phase 4's deterministic baseline pass ran
        "baseline": {                             // optional — ratchet categories only (duplication, cycle)
          "path": "<baseline/known-violations file as discovered — tool-native location>",
          "establishCmd": "<command run once at wiring to snapshot the ratchet baseline>"
        }
      },
      "fallback": "none"                       // "none" | "sweep" | "review-check"
    }
  ]
}
```

Then stamp the host config (`.claude/spec.config.json`): set `enforcementManifest`
(`".claude/rules/enforcement.json"`) and `rulesEnforcementHash` (hash of that manifest, the same
way `designRulesHash` hashes `design-rules.json`). `/spec:doctor` recomputes the hash and warns
when rules changed but enforcement was not regenerated — the early-detection signal.

## Phase 7 — Report

Print exactly this shape (rationale: shared § Console Output Style); fill the slots, drop
any line whose slot is empty, add nothing else:

```
✅ **enforcement wired — {N} categories mechanized, {M} as Review-Check prose**
   (or: ⚠️ **{what needs the user}**)
- {category}: {enforcer chosen, or fallback} — {verify result}, {newly added / already covered}
⚠️ Review-Check fallback: {category} — {one-phrase why}
🔒 ratchet baseline: {category} — {baseline path}, {quarantined-violation count}
📦 rulesEnforcementHash {hash}

Next: re-run the host gate once — confirms the new checks pass on a clean tree (or surfaces
the real violations they just caught)
```

Rules proposed vs accepted were already settled interactively in their own phase — don't
re-inventory them here.

## Rules

- **Never Read `wf-enforce.js`.** The complete `args` contract and the return shape are in
  Phase 2 (`{configPath, pipelineRulesPath, stackDescriptorPath, enforcementManifestPath, cells}`
  → `{stage, cells, skipped, tokens}`). Invoke it (by `scriptPath`) and act on its return — its
  source is never orchestrator context.
- **Never name a specific linter/formatter/arch-tool/hook-runner in any plugin file.** Encode the
  method + category here; discover the tool at runtime. A named tool anchors the agent and goes
  stale faster than the rules do.
- **Two-stage selection is mandatory:** DISCOVER against live sources with citations (never
  training memory), then VERIFY it installs and runs against THIS repo before adopting it.
- **Deterministic first.** A category goes to a Review-Check prose rule only when it is genuine
  judgment — never because research was skipped.
- **Propose, never auto-author** rules (Phase 5). A dismissed `AskUserQuestion` STOPS the run.
- **Edits stay in the host grounding/gate layer** — config, rule docs, gate/hook wiring, the
  pattern-sweep script, generated checker scripts. Never edit application source here — sole
  exception: Phase 4's deterministic baseline pass (the verified tool's own write mode, gate
  green on both sides, recorded as `baselineRun`) — distinct from the ratchet baseline snapshot
  (Phase 4, `duplication`/`cycle`), which never edits source.
- Compose over deterministic coverage; never duplicate a linter's check as an LLM check.
