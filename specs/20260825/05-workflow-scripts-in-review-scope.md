---
date: 2026-08-25
status: hardened
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# Workflow scripts return to review scope

## Goal

Remove `spec/workflows/wf-*.js` from this repo's `pipelineOwnedPaths` so the two frozen
workflow scripts (`wf-research.js`, `wf-enforce.js`) are ordinary review surface again: an
unplanned edit to one becomes a visible out-of-plan finding at review, and collision-closure's
literals leg can see inside them at plan lock. The entry was written for a code generator that
no longer exists; today it only hides. "Done" means the exclusion is gone, the four surfaces
that currently explain themselves by that exclusion say something true instead, and the repo's
own config is what the new tests exercise — not a synthetic stand-in.

## Decisions (locked — workers apply verbatim, never override)

<!-- Carrier contract (specs/20260817/07-promise-sweep-leg.md D8; enforced by promise-sweep.js
     at plan lock and in every review): every row cites ≥1 of this spec's own AC-IDs — the AC
     whose test goes red if the decision is unimplemented — or carries `[no-ac: <reason>]` for
     a row with no testable surface. An empty reason ([no-ac: ]) does not count as a sanction. -->

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete the `pipelineOwnedPaths` key from `.claude/spec.config.json` outright — not an empty array. The resolver's documented contract is "absent key → baseline only" (`lib/glob-match.js`), and `init-gen.js` never templates the key, so absence is the natural steady state. (AC-20260825-05-1, AC-20260825-05-2, AC-20260825-05-3) | The only entry was for `build-workflows.js`'s generated output; that generator, its gate step, and its build layer were all deleted in `61e2e5a` (2026-08-17) and the exclusion was left behind. An empty `[]` invites a reader to assume something belongs there. Rejected: narrowing the glob to one file — neither surviving file is generated, so no principled subset exists. |
| D2 | The new tests exercise the repo's REAL `.claude/spec.config.json` — copied byte-for-byte into a throwaway git repo — through the real entrypoints (`scope-reconcile.js --json`, `collision-closure.js --literal … --json`) and the real resolver (`pipelineOwnedGlobs(ROOT)`). Never a hand-written config. (AC-20260825-05-1, AC-20260825-05-2, AC-20260825-05-3) | Every existing test of this feature builds a synthetic config, which is exactly why a stale entry in the real one survived three weeks and a CLEAN review. A test that reads the tracked file is the only one that goes red if the entry comes back. |
| D3 | Host-declared `pipelineOwnedPaths` stays fully honored for hosts that declare it — no script changes. The existing synthetic-config tests are tagged with this spec's regression pin, never duplicated. (AC-20260825-05-4) | This spec changes THIS repo's grounding, not the plugin's mechanism; the knob remains the sanctioned exclusion route for hosts with genuine codegen. |
| D4 | `tests/consistency/genesis-doctrine.test.js` keeps its enumerated `wf-research.js` banned-literal sweep (AC-20260825-01-2) unchanged in behavior; only its justifying comment and assert-message text change — the block stays because the literal ban is a STANDING invariant run by every `npm test`, whereas collision-closure's literals leg runs only at plan lock for specs that retire a literal. The file must not mention any AC-ID of this spec. `[no-ac: comment and message prose only — no behavioral surface; the sweep's own assertions are unchanged and already pinned by AC-20260825-01-2]` | The current comment says "this enumerated-file test is the ONLY gate that can see it" and forbids simplifying the block away *because of the blind spot* — after D1 that reason is false and a future reader would delete the block on the wrong premise. |
| D5 | `docs/canonical/genesis.md`'s second bullet (the one beginning "A workflow script under a `pipelineOwnedPaths` glob…") is rewritten to record that the exclusion is retired by this spec and that workflow scripts are ordinary review surface; the retained-sweep sentence stays, re-justified per D4. `[no-ac: canonical prose; review's Canonical Delta below owns the review.md side]` | Canon that describes a blind spot as current fact, one day after it closes, is the exact drift the canonical loop exists to prevent. |
| D6 | The plugin-tests agent memory `.claude/agent-memory/plugin-tests/banned-literal-loop-dedup-and-blind-spot-sweep.md` (its "Second, independent pattern" paragraph) and the matching line in that directory's `MEMORY.md` are CORRECTED by the build orchestrator after the worker waves — it is a baseline pipeline-owned path (`.claude/agent-memory/**`), so it is structurally outside the File Plan and review CLOSE disposes it as `correct`. `[no-ac: agent memory — nothing derives it and no gate can see its effect; disposal is review CLOSE's per-file duty]` | An undisposed memory becomes standing worker guidance by default; this one would teach every future test worker that wf scripts are invisible to both sweeps. |
| D7 | `spec/.claude-plugin/plugin.json` bumps to `7.37.2` with a changelog paragraph for this spec; the `7.37.1` paragraph stays VERBATIM — the changelog is a record of what shipped, and the new leading entry supersedes it by naming it. `7.36.0` rolls off (last-3 form). `[no-ac: covered by the existing AC-20260820-08-14 manifest pins — leading changelog version equals the declared version, exactly three entries]` | Patch, not minor: no plugin script changes behavior; this repo's grounding does. Rewriting a shipped changelog line would make the record lie about what 7.37.1 was. |
| D8 | No edit to `.claude/rules/spec-pipeline.md`, `.claude/spec.config.json`'s `routing.scripts` line, `spec/templates/grounding-contract.md`, or any script under `spec/scripts/`. `[no-ac: absence of change]` | The Frozen-scripts rule ("edit them only under a spec that names them") already states the policy D1 mechanizes; the routing line already calls these files frozen hand-authored scripts; the contract never declared the key (specs/20260805/01 D5). |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other.
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| .claude/spec.config.json | MODIFY | other | D1: delete the `pipelineOwnedPaths` key (its only entry is `spec/workflows/wf-*.js`); no other key changes |
| tests/review/workflow-scripts-in-scope.test.js | CREATE | tests | AC-20260825-05-1, AC-20260825-05-2, AC-20260825-05-3 — D2: real config copied into a tmp git repo; real entrypoints |
| tests/collision-closure/collision-closure.test.js | MODIFY | tests | AC-20260825-05-4 — D3: append the pin ID to the existing AC-20260814-05-4 test name (`… / AC-20260825-05-4 (CONTINUE TO)`); assertions unchanged |
| tests/scope-reconcile-glob-rows.test.js | MODIFY | tests | AC-20260825-05-4 — D3: append the pin ID to the existing AC-20260813-03-5 excluded-overlap test name; assertions unchanged |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | D4: rewrite the comment block above `wfResearchBanned` and the `assertNoBannedLiterals` message for `wf-research.js` per Behavior § D4 text; no assertion changes; name NO AC of this spec |
| docs/canonical/genesis.md | MODIFY | doctrine | D5: replace the second bullet per Behavior § D5 text |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version `7.37.2`; prepend the changelog paragraph per Behavior § D7 text; `7.37.1` verbatim; drop `7.36.0` |

**Orchestrator duty (outside the table, D6):** after the worker waves and before the Final gate,
the build orchestrator edits `.claude/agent-memory/plugin-tests/banned-literal-loop-dedup-and-blind-spot-sweep.md`
and `.claude/agent-memory/plugin-tests/MEMORY.md` per Behavior § D6 text. These paths are
baseline pipeline-owned (`.claude/agent-memory/**`) and never appear in the File Plan; review
CLOSE disposes both as `correct`.

## Contracts

`.claude/spec.config.json` after D1 — the key is absent; every other key is byte-identical:

```json
  "patternsScript": "scripts/spec-patterns.sh",
  "layerGroups": [
    [
      "doctrine",
      "scripts"
    ]
  ],
```

Resolver contract (unchanged, `spec/scripts/lib/glob-match.js`):

```js
BASELINE_GLOBS = ['specs/**', '.claude/spec-runs.jsonl', '.claude/spec-runs/**', '.claude/agent-memory/**']
pipelineOwnedGlobs(root) === BASELINE_GLOBS ++ (config.pipelineOwnedPaths ?? [])
// after D1, pipelineOwnedGlobs(ROOT) deep-equals BASELINE_GLOBS
```

Test fixture contract (D2) — `tests/review/workflow-scripts-in-scope.test.js`:

```js
// helpers: ROOT, SPEC, read, tmpdir, runNode, gitRepo from tests/helpers.js
const dir = tmpdir('wf-in-scope')
const g = gitRepo(dir)
fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), read('.claude/spec.config.json')) // the REAL file, verbatim
fs.mkdirSync(path.join(dir, 'spec/workflows'), { recursive: true })
fs.writeFileSync(path.join(dir, 'spec/workflows/wf-probe.js'), "'use strict'\n// WF_PROBE_LITERAL_20260825\n")
// spec with a File Plan whose only row is tests/x.test.js (never the wf file)
g('add', '-A'); g('commit', '-q', '-m', 'base'); const base = g('rev-parse', 'HEAD').trim()
fs.appendFileSync(path.join(dir, 'spec/workflows/wf-probe.js'), '// touched\n')
g('add', '-A'); g('commit', '-q', '-m', 'touch')
runNode(path.join(SPEC, 'scripts/scope-reconcile.js'), ['--root', dir, '--base', base, '--spec', specRel, '--json'])
runNode(path.join(SPEC, 'scripts/collision-closure.js'), ['--spec', specRel, '--root', dir, '--literal', 'WF_PROBE_LITERAL_20260825', '--json'])
```

## Behavior

**What changes for future specs in this repo.** Until now a spec touching `wf-research.js` or
`wf-enforce.js` kept those files out of its File Plan because the exclusion made rows
unnecessary. After D1 they are planned like any other file: a spec that edits a workflow
script gives it a File Plan row (Layer `scripts`, agent `gate-scripts`, per `routing.scripts`),
and an edit without a row is an out-of-plan hard finding — exactly the Frozen-scripts rule,
now enforced by `scope-reconcile.js` instead of by worker diligence. Measured cost: four
commits touched `spec/workflows/` in the eight days since v7, every one under a spec or escape
that named the files — so this is roughly one File Plan row per wf-touching spec and zero
recurring waives.

**§ D4 text** — replace the comment block above `const wfResearchBanned` in
`tests/consistency/genesis-doctrine.test.js` with:

```js
  // spec/workflows/wf-research.js gets its own, stricter sweep than README/design.md above.
  // This block is a STANDING invariant — it runs on every `npm test` — whereas
  // collision-closure's literals leg runs only at plan lock, and only for the stems a
  // planner names. (Until specs/20260825/05, `.claude/spec.config.json` also excluded
  // `spec/workflows/wf-*.js` from both automatic sweeps, so this block was the only gate
  // that could see the file at all; that exclusion is gone, but the standing ban stays.)
  // The stricter list is deliberate: README/design.md legitimately keep "one proposer" as
  // the spec's new vocabulary; wf-research.js has no reason to say any of these.
```

and the `assertNoBannedLiterals` message for that file becomes:

```js
    'D8: spec/workflows/wf-research.js must not name "' + label + '" — a surviving ' +
    'panel/proposer/aggregator reference here would ship in every host as the ' +
    '`spec:wf-research` description; this standing sweep is the gate that sees it on every run'
```

**§ D5 text** — `docs/canonical/genesis.md`, replace the bullet beginning "A workflow script
under a `pipelineOwnedPaths` glob" with:

```
- Workflow scripts (`spec/workflows/wf-*.js`) are ordinary review surface: this repo's
  `pipelineOwnedPaths` entry for them — written for a code generator deleted in `61e2e5a`
  (2026-08-17) — is retired, so an unplanned edit is an out-of-plan finding at review and
  collision-closure's literals leg can see inside them at plan lock. A spec that edits one
  gives it a File Plan row. `wf-research.js` additionally keeps a standing banned-literal
  sweep in `tests/consistency/genesis-doctrine.test.js` with a stricter list than its
  doctrine siblings, because that sweep runs on every test run while the literals leg runs
  only at lock. (specs/20260825/05-workflow-scripts-in-review-scope.md)
```

**§ D6 text** — in `.claude/agent-memory/plugin-tests/banned-literal-loop-dedup-and-blind-spot-sweep.md`,
replace the paragraph beginning "Second, independent pattern in the same dispatch:" with:

```
Second pattern from the same dispatch, since CORRECTED (specs/20260825/05, 2026-08-25): at the
time, `.claude/spec.config.json`'s `pipelineOwnedPaths` excluded `spec/workflows/wf-*.js` from
both collision-closure's literals leg and scope-reconcile, so an enumerated-file doctrine test
was the only gate that could see a stale literal inside a workflow script. That exclusion is
retired — workflow scripts are ordinary review surface now. The durable lesson is narrower: an
enumerated-file banned-literal test is a STANDING gate (every `npm test`), while
collision-closure's literals leg runs only at plan lock for planner-named stems — so keep the
enumerated sweep for a file whose stale vocabulary is user-visible, give it a stricter list
than siblings that legitimately keep the new vocabulary, and say so in a comment.
```

and in `MEMORY.md` the index line's tail `pipelineOwnedPaths prunes wf-*.js from both sweeps, so
an enumerated-file test is its only gate.` becomes `wf-*.js exclusion retired 2026-08-25
(specs/20260825/05); keep enumerated sweeps as standing gates, stricter than doctrine siblings.`
The `metadata.reviewed` date is left for review CLOSE to stamp.

**§ D7 text** — new leading changelog paragraph (prepend inside "Changelog (last 3):"):

```
7.37.2 — workflow scripts return to review scope (specs/20260825/05-workflow-scripts-in-review-scope.md): this repo's `pipelineOwnedPaths` entry for `spec/workflows/wf-*.js` is deleted. It was written for `build-workflows.js`'s generated output; that generator, its gate step, and the workflows build layer were all removed in `61e2e5a` (2026-08-17) and the exclusion outlived them, hiding an unplanned edit to a frozen workflow script from scope-reconcile and pruning the file from collision-closure's literals leg — the blind spot 7.37.1 worked around with an enumerated-file test. Now an out-of-plan edit to `wf-research.js`/`wf-enforce.js` is a visible review finding and the literals leg can see inside them; the enumerated sweep stays as a standing gate. Three new tests exercise the repo's real config through the real entrypoints; the host-declared `pipelineOwnedPaths` mechanism is unchanged and remains fully honored.
```

## Acceptance Criteria

- **AC-20260825-05-1**: WHEN `pipelineOwnedGlobs(ROOT)` is called against this repo's real
  root THE SYSTEM SHALL return exactly `BASELINE_GLOBS` (deep-equal) and no returned glob
  SHALL `globMatch` `spec/workflows/wf-research.js` or `spec/workflows/wf-enforce.js`
  (`pipelineOwnedGlobs('.')` → `['specs/**', '.claude/spec-runs.jsonl', '.claude/spec-runs/**', '.claude/agent-memory/**']`;
  `.some(g => globMatch(g, 'spec/workflows/wf-research.js'))` → `false`)
  → test in `tests/review/workflow-scripts-in-scope.test.js`
- **AC-20260825-05-2**: WHEN `scope-reconcile.js --json` runs in a git repo whose
  `.claude/spec.config.json` is a verbatim copy of this repo's tracked file, and the changed
  set contains `spec/workflows/wf-probe.js` while the spec's File Plan does not name it
  THE SYSTEM SHALL list `spec/workflows/wf-probe.js` in `outOfPlan`, list it nowhere in
  `excluded`, and exit 3 (`{"outOfPlan":["spec/workflows/wf-probe.js"],…,"excluded":[]}`, exit `3`)
  → test in `tests/review/workflow-scripts-in-scope.test.js`
- **AC-20260825-05-3**: WHEN `collision-closure.js --literal WF_PROBE_LITERAL_20260825 --json`
  runs against the same fixture root and that literal occurs only inside
  `spec/workflows/wf-probe.js` THE SYSTEM SHALL report the stem's `hits` as
  `["spec/workflows/wf-probe.js"]`, list that path in `unplanned`, and exit 1
  → test in `tests/review/workflow-scripts-in-scope.test.js`
- **AC-20260825-05-4**: WHEN a host's `.claude/spec.config.json` declares a
  `pipelineOwnedPaths` glob THE SYSTEM SHALL CONTINUE TO exclude matching changed files from
  `scope-reconcile.js`'s `outOfPlan` (reporting them in `excluded`) and to prune them from
  `collision-closure.js`'s literals walk (`{"pipelineOwnedPaths":["spec/workflows/wf-*.js"]}`
  + a changed `spec/workflows/wf-x.js` → `excluded: ["spec/workflows/wf-x.js"]`, literal hits `[]`)
  → the existing AC-20260814-05-4 test in `tests/collision-closure/collision-closure.test.js`
  and the existing AC-20260813-03-5 excluded-overlap test in
  `tests/scope-reconcile-glob-rows.test.js`, each retagged with this ID

## Assumptions (escalation triggers)

<!-- Load-bearing assumptions. If one proves false mid-build, the worker returns
     blocked and adjudication starts HERE. Pair every assumption with its fallback. -->

- A1: Nothing in the repo generates or writes `spec/workflows/wf-*.js` — executed 2026-08-25:
  `grep -rln writeFileSync spec/scripts/ | xargs grep -ln workflows` → empty;
  `git log --oneline --all -- spec/scripts/build-workflows.js` → created `b002f35`, deleted
  `61e2e5a`; `spec/workflows/` holds exactly `wf-research.js` and `wf-enforce.js`.
  **if false:** STOP — a live generator means the exclusion is load-bearing and this spec is
  wrong; ask the user.
- A2: `init-gen.js` never templates the key — executed: `grep -n "pipelineOwned\|workflows"
  spec/scripts/init-gen.js` → empty; `spec/templates/grounding-contract.md` never names it
  (grep → empty), so no contract-hash change and no host regen is affected.
  **if false:** D1 becomes "set the key to `[]`" and A2's row gains the generator; do not touch
  the contract.
- A3: Every existing test of `pipelineOwnedPaths` builds its own synthetic config in `tmpdir()`
  and stays green under D1 — executed: the two consumers' tests write
  `JSON.stringify({ pipelineOwnedPaths: [...] })` themselves
  (`tests/collision-closure/collision-closure.test.js`, `tests/scope-reconcile-glob-rows.test.js`).
  **if false:** the affected test becomes a File Plan row, updated in place and retagged, never
  weakened.
- A4 (micro-spike, executed 2026-08-25, throwaway repos in the scratchpad): with the real
  config copied verbatim and `spec/workflows/wf-research.js` edited out-of-plan,
  `scope-reconcile.js --json` → `outOfPlan: []`, `excluded: ["spec/workflows/wf-research.js"]`,
  exit 0, and `collision-closure.js --literal dimensionKeys` → `hits: []`, exit 0 (the AC-2/AC-3
  tests are RED against the pre-image). With the key deleted via `jq 'del(.pipelineOwnedPaths)'`:
  `outOfPlan: ["spec/workflows/wf-research.js"]`, `excluded: []`, exit 3; literal
  `hits: ["spec/workflows/wf-research.js"]`, `unplanned: ["spec/workflows/wf-research.js"]`,
  exit 1. `pipelineOwnedGlobs('.')` on the live repo currently returns five globs, the fifth
  matching `wf-research.js` → AC-1 is red pre-change. **if false:** STOP — the resolver's
  contract has drifted from its header; ask the user.
- A5: `.claude/rules/spec-pipeline.md § Test Rules` scoped-run form holds — new test files run
  under `node --test 'tests/review/*.test.js'`, and `gateCommand` resolves `{testDirs}` to the
  glob form (`review-legs.js`). **if false:** run the file directly by path.

## Rationale

The exclusion was correct when written (specs/20260805/01 D4: "generated surface changes with
its source every run") and wrong from the moment `61e2e5a` deleted the generator alongside the
`build:workflows --check` gate step and the `workflows` build layer, relabeling the files
"frozen … plain checked-in scripts" without touching the config. Retention was visible, not
hidden — which is why this lands as a spec: `specs/20260825/01`'s CLEAN review explicitly
recorded widening or removing the glob as an open question for JJ rather than a finding, and JJ
ruled "spec it" on 2026-08-25 after a Fable consult that verified the staleness on the commit
record and refuted the one live counter-argument (that removal would create a recurring waive
on every `/spec:enforce` run — nothing writes these files; `/spec:enforce` only invokes
`wf-enforce.js` by path and its Rules forbid reading it).

**What the blind spot cost.** `wf-research.js`'s `meta.description` — served as the
`spec:wf-research` skill description in every host — still named the deleted `wf-panel` after
a full CLEAN review of the spec that deleted it, because neither sweep could see the file.
7.37.1 fixed that same-session with an enumerated-file test (the sanctioned Incident-Policy
fix). This spec is the structural follow-through, not a second fix for that incident: it
mechanizes the Frozen-scripts rule through `scope-reconcile.js` instead of relying on the
worker reading it.

**Why keep the enumerated sweep (D4).** The two gates differ in cadence, not just visibility:
the literals leg runs at plan lock, only for stems a planner names; the enumerated sweep runs
on every `npm test`. Deleting it because the blind spot closed would trade a standing gate for
an advisory one.

**Why delete the key rather than empty it (D1).** Absence is the resolver's documented steady
state and what `init-gen.js` produces; `[]` is a fossil that says "something used to be here".

**What is fragile.** The three new tests read the tracked config through `read()`; if a future
host-config regeneration reintroduces the key with a wf glob, AC-1..3 go red — that is the
intended tripwire. Also note the ordering of D6: the orchestrator's memory edit must land
after the plugin-tests worker returns, or that worker may re-read and reassert the stale
pattern.

**Fable consult 2026-08-25 (adversarial, read-only).** Verdict "spec it": substance confirmed;
NARROW rejected (no generated file to narrow to); LEAVE-with-test rejected (the enumerated
test bans four stems in one file forever and cannot see `wf-enforce.js` at all); process
objection — landing the config change directly would overturn a CLEAN review's recorded ruling
without the ruling-owner's yes — sustained and honored here.

**Collision-closure at lock (2026-08-25, stems `only gate`, `blind spot`, `blind-spot`,
`pipelineOwnedPaths`).** Every `only gate` hit is a File Plan row. Waived as unrelated
vocabulary (the generic phrase, not this blind spot): `blind spot` in
`.claude/commands/doctrine-review.md`, `docs/audit/render-gate-spike-prax-2026-08-24.md`,
`docs/roadmap/14-reviewer-measurement.md`, `tests/doctrine-review.test.js`; `blind-spot` in
`spec/doctrine/replay-corpus.md`, `tests/replay/replay.test.js`. Waived as generic mechanism
prose that makes no claim about this repo's entry: `pipelineOwnedPaths` in
`spec/scripts/lib/glob-match.js` and `spec/scripts/scope-reconcile.js` headers.
`docs/canonical/review.md` is covered by the Canonical Delta, not a row. The paths leg's four
`likely` hits on `.claude/spec.config.json` (`red-fixture-coverage`, `config-read`,
`host-config-api`, `review-legs` tests) contain no `pipelineOwned`/`workflows` reference
(grep-verified) and owe no waive line per § Gotchas (measured 3% precision, 2026-08-24).

## Canonical Delta

Append to `docs/canonical/review.md`, directly after the existing "Review scope is derived,
not predicted" bullet:

```
- `pipelineOwnedPaths` is for generated surfaces only. This repo's own entry for
  `spec/workflows/wf-*.js` outlived its generator (`build-workflows.js`, deleted in `61e2e5a`
  2026-08-17) and hid an unplanned edit to a frozen workflow script from scope-reconcile — and
  pruned the file from collision-closure's literals leg — through a CLEAN review; it is retired.
  A hand-authored file, frozen or not, is never pipeline-owned: the Frozen-scripts rule is
  enforced by scope-reconcile's out-of-plan finding, and a spec that edits a workflow script
  gives it a File Plan row. Three tests exercise this repo's real config through the real
  entrypoints so a reintroduced entry goes red. (specs/20260825/05-workflow-scripts-in-review-scope.md)
```
