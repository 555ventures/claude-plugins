---
description: Core invariants of the spec pipeline — reference doctrine read by every /spec command (located via `spec-paths shared`); design commands add design.md, genesis adds genesis.md
---

# Spec Pipeline: Core Invariants

The full lifecycle: an optional **genesis stage** for greenfield repos (`/spec:genesis`) decides
what to build with and how it should look, and its `HANDOFF` step grounds the repo itself;
`/spec:init` grounds brownfield repos the same way (config, rules, agents; it ends by invoking
`/spec:enforce`); then the per-feature pipeline: `/spec:plan` → `/spec:run` → `/spec:release`
(repeatable milestone gate).

## Host Grounding

The pipeline is process; the repo supplies grounding. Two host files, both created by
`/spec:init` (run once per repo before first use):

- **`.claude/spec.config.json`** — machine-readable knobs: `gateCommand`, `testCommand`,
  `setupCommand`, `patternsScript`, `layerGroups`, `agentMap`, `pipelineRules`, `runtime`,
  plus the optional blocks the grounding contract (`spec-paths contract`) enumerates.
- **The pipeline rules file** (`pipelineRules`'s path) — prose grounding by section:
  `Risk Tiers`, `Planning`, `Build`, `Worker Rules`, `Test Rules`, `Review Checks`, `Gotchas`.

Either missing → STOP: run `/spec:init`.

## Grounding Drift

Enforced by `spec-state-gate.sh` — its header comment is the contract; `/spec:doctor` check 2 sweeps the rest.

## Rule Enforcement

A host's rules are enforced **deterministically, in its `gateCommand`** — never by an LLM at
runtime. `/spec:enforce` owns this: it classifies rules into the contract's
language-neutral category taxonomy and mechanizes each; no plugin file ever names a specific
tool. Choices + provenance land in `.claude/rules/enforcement.json`, stamped as
`rulesEnforcementHash`.

## Pipeline Entry

The default is direct work gated by the host's `gateCommand` and standards docs. Enter only
when the work needs **delegation** (execution large enough that workers build while the session
only plans) or **durability** (scope spans sessions; the spec is the re-entrant state).

Changes travel one of three lanes, chosen by the shape of the ask. **Direct**: a one-sentence
change with no behaviour or data change is made on main through the host's `gateCommand` — no
spec, no branch; the commit-time escape offer still runs. **Behaviour**: running `/spec:prototype` is choosing this lane (a brief's `Lane:` is
advisory); the prototype's contract lands through a spec, its code never. **Structural**: a
schema or API change is planned first — a spec. At commit time a spec branch lands only through
the review stage's merge-back, a direct change has no branch, and a `proto/*` branch has a branch
and never lands — that is how the three are told apart.

## Tiers

`tier:` in spec frontmatter, applied at plan time. **`standard`** for almost everything.
**`critical`** when the work touches irreversible or high-blast-radius surfaces — the host's
pipeline rules § Risk Tiers lists its triggers — plus the universal
process-boundary trigger: boot-path code (process/plugin registration, env/config schema,
runtime wiring, signal handling). Critical tier means: literal examples on every AC,
spike-verified assumptions, and the user confirms the lock. Mid-build evidence of a critical
trigger upgrades the tier immediately (note it in the spec).

## Runtime Verification

**No verdict may rest on static legs alone.** The host config's required `runtime` block
(`bootCommand` + `readyCheck`, or an explicit `{"inert": "<reason>"}`) is the contract.
Enforced by `smoke.sh` — its header comment is the contract; `verdict.js` requires its leg.
**Skipped tests are not passes**: a skipped mapped test is a hard finding unless the AC
declares its environment gate. **Authored ≠ activated**: verification infrastructure counts only
once its execution is demonstrated or its inertness declared (`manifest-check.sh`). **A stub is
not its dependency**: a leg that passed only against a stub is reported unverified until re-run
for real.

## Release Stage

Grounding is the optional config `release` block (host-declared, never invented). Shape: derive
what shipped since the last release row → deploy to staging → executed checks against the
deployed URL → confirm-gated promotion → verify production → one ledger row. Production actions
are never autonomous.

## Feedback Loop

The pipeline improves on evidence, through artifacts — never through anyone's memory.
Carriers, all side effects of normal runs: the **run ledger** (`.claude/spec-runs.jsonl`),
its **retained evidence artifacts** (`.claude/spec-runs/<runId>.jsonl`), and **Gotchas** entries in
the host's pipeline rules (tagged `[host]` or `[plugin]` by provenance, folded from
deviations sidecars at review close). `/spec:escape` records a defect that got past a
review — one row pointing back at the review that passed it.

**Agent memory is not one of these carriers, and must never quietly become one.**
`.claude/agent-memory/` is written by dispatched workers and outlives the session that wrote
it. Every memory file a spec's diff touches is therefore disposed at review close, one stated
fate each — carry, correct, or delete.

The **escape ledger** and the **reviewer replay catch-rate** are the pipeline's only two
ground-truth signals.

**Replay cadence** is `replay.js --due` policy, never a session's memory: due every 5th
review and at minimum once per major pipeline version. Execution is `/spec:replay`, run on
demand. Dueness is seen on the dashboard footer's `replay due` clause instead, printed by
`/spec:status` every run. The blocking REPLAY state was retired by `docs/adr/0025`.

## Incident Policy

An incident (a pipeline defect, an escape, a costly wrong assumption) is fixed **in the same
session it is understood**: the fix plus a behavioral test of the fixed path. No ledger row
beyond the run ledger (a build-time incident is an `incidents` entry on its build row, never
its own row), no doctrine paragraph, no standing failing test, no intake queue. Only a
**third recurrence of the same class** (counted per Materiality below) earns a standing
guard — deterministic, a script with an exit code wired where the class occurs, never prose.

A guard so earned must also pass the **admission bar** — five separately answered tests,
derived from ledger evidence wherever a ledger can answer them, asserted only where it cannot:

- **Portability** — works for any host stack. Prose by design: a synthetic second-stack run
  would be fixture evidence, and fixture-fed proof is not terminal.
- **Generality** — names at least two ledger-recorded members of the class, at least one of
  which is not the triggering incident.
- **Materiality** — the class's recurrence count across every readable repo ledger, **escape
  rows joined with their `escape-class` amendments and build-row `incidents`** (as
  `fleet-reader --json`'s `escapes.byClass` derives it), cited as a number, never claimed.
- **Falsifiability** — deliberately tripped once; the proposal cites the red run.
- **Removability** — a kill condition phrased as a question a ledger query answers with a
  count.

A proposal that cannot fill all five fields is a rejection, and the rejection's reopen
condition must itself be ledger-answerable. Derived numbers come from the fleet evidence
reader where it exists, run as `node "$(spec-paths fleet-reader)" --json`.

## Decomposition

One brief → one spec by default: split only past ~12 source-layer File Plan rows
(`tests`/`other`/docs/ledger rows uncounted) or a second primary area (plus host-declared caps), into `##-`
siblings sliced by **landing unit** — each leaves the system green — never by layer;
order via `depends_on`.

## State Machine

`draft → hardened → implementing → done`. Transitions owned by exactly one driver state each:
`/spec:plan`'s lock → `hardened`; the build driver's preflight → `implementing`; the review
driver's close → `done`. `superseded` is the terminal retire state.
Enforced by `spec-state-gate.sh` — its header comment is the contract.

## Model Placement

**The expensive model authors the contract; cheap models execute it behind deterministic gates;
review independence comes from fresh-context, blind-to-author dispatch, executed evidence, and a
reviewer from a different model family than the builder.** Concretely: the planning session (Fable,
or the best available model) authors specs and holds the roadmap-level design seats (genesis position
briefs, and every mock, wireframe or themed, authored in-session
— design.md § Design Canon). **Sonnet** orchestrates build and review and is every worker. **The
reviewer seat is Fable at `effort: low`** (`agents/reviewer.md`), a different family from the Opus
session that builds. The disposer inherits the session model at
`effort: medium`. **Haiku** runs lookups and re-reads. Orchestrators pass paths, never raw file contents. `/spec:enforce` and genesis judgment seats run
Opus; `/spec:init` runs on the invoker; an unavailable `Agent {model: "fable"}` falls back to `opus`.

## Decisions

The spec's Decisions table is authoritative. Workers apply it verbatim, never invent entries,
never override. An unlocked fork is a `blocked` return, not a guess. A dismissed
`AskUserQuestion` STOPS the run — never invent the answer the user declined to give.

## Question Style (every `AskUserQuestion`, every stage)

Enforced by `question-style-gate.js` — its header comment is the contract.

- **Plain language.** Name behaviors and outcomes, not identifiers.
- **Options carry consequences** in the `description` field — what happens to me if I pick
  this. Recommended pick first, labeled "(Recommended)", its description saying why.
- **Derive before asking.** Everything the session, disk, or ledger can answer is derived
  and confirmed, never asked open-ended. Every derived decision prints one console line —
  `📌 Auto-picked <choice> — <one-line reason> (veto anytime)`.
- **Product facts are asked, never derived.** A citing document is never the user deciding
  it; the mocks/genesis product-stage exemption (`spec-paths shared-mocks`) is the mechanism.
- **The ten-second cold test.** Could a product owner with zero context on this repo answer
  correctly, in ten seconds, from the question text alone?

## Console Output Style (progress narration and end-of-run reports)

**`report-render.js`** (`spec-paths report-render`) is the sole render authority — commands assemble slots and print its output verbatim.

- **Close the loop** — every report ends with one recommended next action, never hand-mapped:
  "what next" is `node "$(spec-paths spec-status)" --next` verbatim, same-spec chains literal.
  Deferred work is queued via `spec-paths spec-queue` (`--top`/`--after-spec`/`--after-brief`) before the report renders, listed under `queued`, never prose.

## On-Disk Handoff

Every cross-stage handoff is a **file**, never conversation context. For the per-feature pipeline that file is the spec (Decisions,
File Plan, Contracts); genesis has its own artifact roster. Transient intermediates a single
invocation consumes go to the session scratchpad, never under `specs/`.

## Worker Git Ban

Implementation workers never run git — no checkout/stash/restore/reset/clean/add/commit. The
orchestrator owns all git and checkpoint-commits after each green phase.

## Read-Only Surfaces

Hosts declare generated/managed surfaces (and their sanctioned change routes) in pipeline
rules § Worker Rules. Nobody edits them by hand; changes go through the declared tool. The
pattern sweep and the reviewer treat hand-edits to them as hard findings.

## MCP Policy

Registry/library lookups run pre-emptively at plan/design time and their results are embedded into the spec — build workers never
query MCPs and return `blocked` if an embedded reference proves wrong against the installed
version. The prohibition is role-scoped: when a reference falsifies mid-build, the
orchestrator re-runs the declared lookup itself and records the correction in Decisions
before amending anything.

## Canonical Docs Loop

`/spec:plan` reads `docs/canonical/{area}.md` during discovery; the review stage applies the
spec's Canonical Delta on `done`.

## Session Execution

- **Edit, never rewrite.** When it will not change the result, surgically edit a file rather than rewriting it whole.
- **Act on enough information.** Never re-derive facts already established in the session or re-litigate a decision the user made.
- **No extras.** Only what the step or spec asks — no unrequested refactors, features, or tests.
- **Batch independent calls.** Before each tool turn, request every item that does not depend on another's result in that one response.
- **Load doctrine by section.** `spec-paths shared-for <cmd>` and the supplements' `--section`
  slices are the read surface; a whole doctrine file is read only when a step names it.

## Doctrine Authoring

One binding home per rule. When editing any plugin doctrine/command file, prose that restates
canon living elsewhere shrinks to a pointer at its canonical home — never grows another full
copy. Behavior is pinned by behavioral tests that execute it, never by regexes over prose;
a rule that matters enough to guard mechanically gets a script (§ Incident Policy).
