---
description: Core invariants of the spec pipeline — reference doctrine read by every /spec command (located via `spec-paths shared`); design commands add design.md, genesis adds genesis.md
---

# Spec Pipeline: Core Invariants

The full lifecycle: an optional **genesis stage** for greenfield repos (`/spec:genesis`) decides
what to build with and how it should look, and its `HANDOFF` step grounds the repo itself;
`/spec:init` grounds brownfield repos the same way (config, rules, agents; it ends by invoking
`/spec:enforce`); then the per-feature pipeline: `/spec:plan` → `/spec:run` (design when due,
then build, then review — each stage also has its own direct entry: `/spec:design`,
`/spec:build`, `/spec:review`, the last the only one that flips `done`; on CLEAN it commits the
close and merges back) → `/spec:release` (repeatable milestone gate). `/spec:atlas` keeps the
whole-product design picture browsable at every stage.

This file carries the invariants every command shares. Design-stage doctrine lives in
`design.md` (via `spec-paths shared-for <design command>`); the genesis supplement is
`genesis.md`. Genesis is greenfield-only.

## Host Grounding

The pipeline is process; the repo supplies grounding. Two host files, both created by
`/spec:init` (run once per repo before first use):

- **`.claude/spec.config.json`** — machine-readable knobs: `gateCommand`, `testCommand`,
  `setupCommand`, `patternsScript`, `layerGroups`, `agentMap`, `pipelineRules`, `runtime`,
  plus the optional blocks the grounding contract (`spec-paths contract`) enumerates.
- **The pipeline rules file** (path in `pipelineRules`, conventionally
  `.claude/rules/spec-pipeline.md`) — prose grounding by section: `Risk Tiers`, `Planning`,
  `Build`, `Worker Rules`, `Test Rules`, `Review Checks`, `Gotchas`.

Every command reads both at start; repo differences live there, never as forks inside the
plugin's files. Either missing → STOP: run `/spec:init`.

**Regeneration ownership.** `/spec:init` bootstraps and regenerates the grounding layer;
`/spec:enforce` owns the deterministic rule-enforcement layer; `/spec:doctor` is the
read-only drift check — it diagnoses and patches line-items with approval (`--fix`) but never
regenerates wholesale.

## Grounding Drift

Detection is mechanical, response is judgment. The grounding contract is a file
(`spec-paths contract`); `/spec:init` stamps its hash into config as `contractHash` plus
`generatedBy: "spec@<version>"`. The state-gate hook recomputes the hash on every pipeline
command and warns on mismatch — a warning, never a block. Codebase drift (stale cited paths,
commands, conventions) surfaces as worker `blocked` returns at build time; `/spec:doctor`
catches it earlier with a read-only sweep.

## Rule Enforcement

A host's rules are enforced **deterministically, in its `gateCommand`** — never by an LLM at
runtime. For any rule a linter/arch-tool/matcher CAN check, a runtime LLM check is a strict
downgrade. `/spec:enforce` owns this: it classifies rules into the contract's
language-neutral category taxonomy and mechanizes each — tool selection is two-stage and
runtime (DISCOVER against live sources with citations, then VERIFY against this repo); no
plugin file ever names a specific tool. The judgment residue (semantic intent, cross-file
reasoning, sanctioned carve-outs) stays with the reviewer, layered over the mechanical
coverage. Choices + provenance land in `.claude/rules/enforcement.json`, stamped as
`rulesEnforcementHash`.

## Pipeline Entry

The pipeline is opt-in heavy machinery, not the default path. The default is direct work
gated by the host's `gateCommand` and standards docs. Enter only when the work needs
**delegation** (execution large enough that workers build while the session only plans) or
**durability** (scope spans sessions; the spec is the re-entrant state). A new product
surface is a normal spec (usually a `depends_on` series) — no separate pipeline.

## Tiers

`tier:` in spec frontmatter, applied at plan time. **`standard`** for almost everything.
**`critical`** when the work touches irreversible or high-blast-radius surfaces — the host's
pipeline rules § Risk Tiers lists its triggers (money paths, auth/permission logic,
non-additive data migrations, widely-consumed contract surfaces) — plus the universal
process-boundary trigger: boot-path code (process/plugin registration, env/config schema,
runtime wiring, signal handling), empirically the highest-severity surface on record and
exactly what static gates cannot see. Critical tier means: literal examples on every AC,
spike-verified assumptions, and the user confirms the lock. Mid-build evidence of a critical
trigger upgrades the tier immediately (note it in the spec).

Critical tier adds review capacity only as **narrowly-scoped, non-redundant legs registered
by name** (host pipeline rules § Review Checks; wired via `verdict.js --require`) — never a
second general reviewer: reviewer agreement is measurably not a correctness signal
(specs/20260817/07-promise-sweep-leg.md D7). `promise-sweep` is one such leg and runs at every tier, not only
critical; this ruling governs future capacity, not its admission.

## Runtime Verification

**No verdict may rest on static legs alone.** Typecheck, lint, mocked unit tests, pattern
sweeps, and citation-checked reviews can all pass on a program that cannot start (a host once
had every gate task green while its root route returned 500 on every commit, across two CLEAN
reviews). The host config's
required `runtime` block (`bootCommand` + `readyCheck`, or an explicit
`{"inert": "<reason>"}`) is the contract; the plugin's deterministic `smoke.sh` executes it —
boot to observed readiness AND a bounded clean stop on the declared signal (shutdown is where
a service's state-corrupting defects live). `/spec:review` runs it as a required blocking
verdict leg — CLEAN is unreachable without it; a host that gives review no way to boot is
itself a hard finding. **Skipped tests are not passes**: the AC↔test reconciliation counts
executed tests; a skipped mapped test is a hard finding unless the AC declares its
environment gate. **Authored ≠ activated**: verification infrastructure counts only once its
execution is demonstrated or its inertness declared — the deliverable manifest
(`manifest-check.sh`) and `/spec:doctor` enforce this.

## Release Stage

`/spec:release` extends executed observation past the repo boundary: review proves the diff
works on a dev boot; **release proves the milestone works as a deployed product**. Grounding
is the optional config `release` block (host-declared, never invented). Shape: derive what
shipped since the last release row → deploy to staging → executed checks against the deployed
URL (ready, e2e, the changed briefs' journeys plus one whole-product journey) →
confirm-gated promotion → verify production → one ledger row. Cross-spec seams are release's
territory — per-spec CLEANs do not compose. Production actions are never autonomous.

## Feedback Loop

The pipeline improves on evidence, through artifacts — never through anyone's memory.
Carriers, all side effects of normal runs: the **run ledger** (`.claude/spec-runs.jsonl` —
stage-tagged rows: `plan` records a lock's executed facts, `review` and `escape` as below),
its **retained evidence artifacts** (`.claude/spec-runs/<runId>.json` — a review row's
full-fidelity manifest legs and reviewer return, `runId`-keyed), and **Gotchas** entries in
the host's pipeline rules (tagged `[host]` or `[plugin]` by provenance, folded from
deviations sidecars at review close). `/spec:escape` records a defect that got past a
review — one row pointing back at the review that passed it, and (when the artifact
survives) `killedMatch` derived from that review's own retained claims rather than memory.

**Agent memory is not one of these carriers, and must never quietly become one.**
`.claude/agent-memory/` is written by dispatched workers, steers what the next worker does
before any gate can observe the effect, and outlives the session that wrote it — nothing
derives it and nothing reviews it. Every memory file a spec's diff touches is therefore
disposed at review close, one stated fate each — carry, correct, or delete — exactly as the
deviations sidecar is folded. Judge what it teaches, not that it was written: a memory
attributing observed work to an unnamed "concurrent process", or concluding an assignment
could be stood down from, is corrected or dropped, never carried
(specs/20260821/02-replay-review-phase.md build).

The **escape ledger** and the **reviewer replay catch-rate** (brief 14's harness, sibling
spec specs/20260819/02-mutation-replay.md) are the pipeline's only two ground-truth
signals — both measure what a review actually caught against what was actually there.
Self-reported review quality (a reviewer's own confidence, a clean-looking findings list) is
explicitly subordinate to both: it is evidence of nothing until one of the two ground-truth
signals corroborates it. This is what makes a CLEAN verdict falsifiable rather than argued.

**Replay cadence** is `replay.js --due` policy, never a session's memory: due every 5th
review and at minimum once per major pipeline version, sampling critical-tier targets first
when one is available in the window. Execution is review's own close, never a printed
reminder: the review driver's REPLAY state (between MERGE and DONE) runs the dueness and
selection checks itself and refuses to conclude the review until a `stage:"replay"` row for
the selected target exists. The printed-reminder form was tried and measured to fail — a
checklist line printing on every CLEAN report was skipped through 12+ reviews before being
replaced (specs/20260821/02-replay-review-phase.md D5). `/spec:replay` remains the manual surface and the retry path after a
non-measurement outcome. A sustained replay miss-rate is the evidence that reopens the
second-reviewer question core § Tiers currently rules against — not a hunch, not a single bad
run.

## Incident Policy

An incident (a pipeline defect, an escape, a wrong assumption that cost a session) is fixed
**in the same session it is understood**: the fix plus a behavioral test that executes the
fixed path. No ledger row beyond the run ledger, no doctrine paragraph, no standing failing
test, no intake queue. Only a **third recurrence of the same class** — counted across every
readable repo ledger on this machine — earns a standing guard, and that guard is
deterministic — a script with an exit code wired where the class occurs — never prose.
Doctrine text is for contracts and invariants, not for incident memories.

A guard so earned must also pass the **admission bar** — five separately answered tests,
derived from ledger evidence wherever a ledger can answer them, asserted only where it cannot:

- **Portability** — works for any host stack. Prose by design: a synthetic second-stack run
  would be fixture evidence, and fixture-fed proof is not terminal.
- **Generality** — names at least two ledger-recorded members of the class, at least one of
  which is not the triggering incident.
- **Materiality** — the class's recurrence count across every readable repo ledger, **the
  joined count of escape rows plus their `escape-class` amendments** (as `fleet-reader
  --json`'s `escapes.byClass` derives it), cited as a number, never claimed.
- **Falsifiability** — deliberately tripped once; the proposal cites the red run.
- **Removability** — a kill condition phrased as a question a ledger query answers with a
  count.

A proposal that cannot fill all five fields is a rejection, and the rejection's reopen
condition must itself be ledger-answerable. Derived numbers come from the fleet evidence
reader where it exists, run as `node "$(spec-paths fleet-reader)" --json`; a bar filled from
one repo's ledger says so.

## Decomposition

A spec must fit one `/spec:build` run: roughly ≤15 File Plan rows, one primary area (plus any
host-declared caps). Larger work splits into `##-` sibling specs sliced by **landing unit** —
each spec independently leaves the system green — never by layer. Order via `depends_on`;
build and review slices in dependency order.

## State Machine

`draft → hardened → implementing → done`. Transitions owned by exactly one driver state each:
`/spec:plan`'s lock → `hardened`; the build driver's preflight → `implementing`; the review
driver's close → `done`. `/spec:run` runs design (when due), then both drivers in sequence;
`/spec:build` and `/spec:review` remain each driver's direct entry; `superseded` is the
terminal retire state. `/spec:design`
never moves `status` — it sets the `designed:` date field only. Enforced by the plugin's
`spec-state-gate.sh` hook — invoking a stage against a spec in the wrong state is blocked
before the model sees it.

## Model Placement

**The expensive model authors the contract; cheap models execute it behind deterministic gates;
review independence comes from fresh-context, blind-to-author dispatch, executed evidence, and a
reviewer from a different model family than the builder.** Concretely: the planning session (Fable,
or the best available model) authors specs and holds the roadmap-level design seats (genesis position
briefs, atlas direction rounds, sketch brainstorms, and every mock, wireframe or themed, authored in-session
— design.md § Design Atlas). **Sonnet** orchestrates build and review and is every worker. **The
reviewer seat is Fable at `effort: low`** (`agents/reviewer.md`), a different family from the Opus
session that builds; low holds because every finding and kill needs an executed repro, so skipped
evidence is `REVIEWER_FAILED`, never a false `CLEAN`. The disposer inherits the session model at
`effort: medium`; every verdict seat declares its effort. **Haiku** runs lookups and re-reads. Build
surprises go to the user with the spec's own Rationale/Assumptions — no resident consultant seat;
orchestrators pass paths, never raw file contents. `/spec:enforce` and genesis judgment seats run
Opus; standalone `/spec:design` and `/spec:init` run on the invoker; an unavailable `Agent {model: "fable"}` falls back to `opus`.

## Decisions

The spec's Decisions table is authoritative. Workers apply it verbatim, never invent entries,
never override. An unlocked fork is a `blocked` return, not a guess. A dismissed
`AskUserQuestion` STOPS the run — never invent the answer the user declined to give.

## Question Style (every `AskUserQuestion`, every stage)

The person answering is busy and holds no implementation context. Author every question for
that reader:

- **Plain language.** Name behaviors and outcomes, not identifiers: "the check that boots the
  app before a release", not `runtime-leg`.
- **Product-behavior lens.** The question and every option state how the final product's
  behavior changes under that answer. Prefer a concrete scenario over an abstract
  description.
- **Delivery costs are AI-economics.** "More work to implement" is never a real cost. Honest
  stakes are the user's attention, correctness risk, and rework scope — never human effort
  or calendar time.
- **The two lenses are a filter.** A question that can't state a product or delivery
  consequence isn't worth asking — take the conservative option (the one cheapest to reverse
  later) and log it. If no option is clearly cheaper to reverse, ask.
- **The ten-second cold test.** Could a product owner with zero context on this repo answer
  correctly, in ten seconds, from the question text alone? The bar is context load, not
  vocabulary. Rewrite around what the user gains or loses, or derive the answer and don't
  ask.
- **Self-contained; ask the real decision.** Carry everything needed to answer cold; when
  several technical choices collapse into one trade-off, ask that trade-off once.
- **Options carry consequences** in the `description` field — what happens to me if I pick
  this. Recommended pick first, labeled "(Recommended)", its description saying why.
- **Derive before asking.** Everything the session, disk, or ledger can answer is derived
  and confirmed, never asked open-ended. Every derived decision prints one console line —
  `📌 Auto-picked <choice> — <one-line reason> (veto anytime)` — so a wrong derivation costs
  a five-second veto, not an archaeology dig.
- **Product facts are asked, never derived.** A citing document is never the user deciding
  it; the mocks/genesis product-stage exemption (`spec-paths shared-mocks`) is the mechanism.

The floor is enforced by the `question-style-gate.js` PreToolUse hook: tier 1 deterministic
(consequence-bearing descriptions, reasoned recommendations, identifier density), tier 2 a
fast-model judge against the cold test (fails open; `SPEC_QUESTION_JUDGE=off` disables).

## Console Output Style (progress narration and end-of-run reports)

Console output is read once, live, by a busy reader; specs, docs, and ledger rows keep their
rigorous style. **`report-render.js`** (`spec-paths report-render`) is the sole render
authority — commands assemble slots and print its output verbatim; restyling it is a defect.

- **Outcome first, bold, anchored** — one emoji-anchored bold line carrying outcome + stakes,
  then only what changes the user's next action. A pending decision outranks all progress.
- **Emoji as structure**: ✅ done / ⚠️ needs the user / 🚫 blocked / 📦 artifact — every status
  line opens with its anchor; fixed meanings, never decoration.
- **Meaning over dumps** — reframe results into their takeaway; print artifact paths, don't
  inline them; translate pipeline vocabulary into product consequence.
- **Close the loop** — every report ends with one recommended next action, never hand-mapped:
  "what next" is `node "$(spec-paths spec-status)" --next` verbatim, same-spec chains literal.
  Deferred work — due after this run, or judged to precede it — is queued via `spec-paths spec-queue`
  (`--top`/`--after-spec`/`--after-brief`) before the report renders, listed under `queued`, never prose.

## On-Disk Handoff

Every cross-stage handoff is a **file**, never conversation context — a later session Reads
files only. For the per-feature pipeline that file is the spec (Decisions, File Plan,
Contracts); genesis has its own artifact roster. Transient intermediates a single invocation
consumes go to the session scratchpad, never under `specs/` — location, not remembered
cleanup, is the leak guarantee.

## Worker Git Ban

Implementation workers never run git — no checkout/stash/restore/reset/clean/add/commit. The
orchestrator owns all git and checkpoint-commits after each green phase. A repo-wide git op
from one parallel worker destroys every sibling's uncommitted edits.

## Read-Only Surfaces

Hosts declare generated/managed surfaces (and their sanctioned change routes) in pipeline
rules § Worker Rules. Nobody edits them by hand; changes go through the declared tool. The
pattern sweep and the reviewer treat hand-edits to them as hard findings.

## MCP Policy

Registry/library lookups run pre-emptively at plan/design time (the host's pipeline rules
§ Planning names them) and their results are embedded into the spec — build workers never
query MCPs and return `blocked` if an embedded reference proves wrong against the installed
version. The prohibition is role-scoped: when a reference falsifies mid-build, the
orchestrator re-runs the declared lookup itself and records the correction in Decisions
before amending anything.

## Canonical Docs Loop

`/spec:plan` reads `docs/canonical/{area}.md` during discovery; `/spec:review` applies the
spec's Canonical Delta on `done`. Every landed spec makes more future work spec-free — this
loop is what shrinks pipeline spend over time.

## Doctrine Authoring

One binding home per rule. When editing any plugin doctrine/command file, prose that restates
canon living elsewhere shrinks to a pointer at its canonical home — never grows another full
copy. Behavior is pinned by behavioral tests that execute it, never by regexes over prose;
a rule that matters enough to guard mechanically gets a script (§ Incident Policy).
