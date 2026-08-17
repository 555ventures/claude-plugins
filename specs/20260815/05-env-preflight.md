---
date: 2026-08-15
status: implementing
diff_base: 866ce9cc303429e1dab6c75e9f2449a3ea7cf0b2
open_markers: 0
risk: T3                 # edits spec/templates/grounding-contract.md (hash-stamped into every host) and spec/bin/spec-paths — both named T3 triggers in pipeline rules § Risk Tiers
area: gate-integrity
design: false
breaking: false
depends_on: ["specs/20260815/01-recurrence-carriers.md"]   # D2 requires readConfigStrict from lib/host-config.js, which spec 01 lands; spec 01's closure pin also forbids this spec's script from reading spec.config.json privately
depended_on_by: ["specs/20260815/06-redcheck-load-attribution.md"]
brief: n/a
---

# Env preflight: an unprovisioned environment is a provisioning STOP, never a repair round

## Goal

When a host's test suites are gated on environment variables (`DATABASE_URL`-shaped), an
unset variable currently reaches the gate as an ordinary red and is indistinguishable from
broken code — wf-build burns a full repair round it cannot possibly win (observed twice on
salon-os, runId `wf_e4778d03-81b`; INTAKE JJ-20260815-08). Done means: the gating variables a
host declares are checked deterministically **before** any gate, probe, or repair path is
reachable, a miss fails fast printing the host's own provisioning command, and the existing
prose obligation ("name each gating variable in § Test Rules") is enforced by a script
cross-check instead of model judgment. Hosts that declare nothing behave exactly as today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New optional `spec.config.json` key `testEnv`: an array of `{"var": "<NAME>", "provision": "<command>"}` rows, written by `/spec:init`. The write is **cross-phase and must be stated as such** (refuter finding, adopted): init's Phase 3 § Test Rules step is where the var+provision pairs are derived as prose — that step now ALSO writes the same pairs into `.claude/spec.config.json` `testEnv` (a later phase writing a config key has explicit precedent: Phase 6's `genesisStackDescriptor`/`design.rulesManifest` writes, init.md ~line 474 — cite it in the edit so the worker wires an actual config write, not a longer sentence). Absent key = legacy mode: no preflight, current behavior byte-for-byte. | Follows the `capabilities`-block pattern (declared-at-init, absent = legacy) rather than inventing a new declaration surface; rejected: parsing § Test Rules prose at gate time — prose has no grammar. |
| D2 | New script `spec/scripts/env-preflight.js` (registered in `spec-paths` as `env-preflight`). Config is read via `readConfigStrict` from `spec/scripts/lib/host-config.js` (landed by spec 20260815/01; a private read would trip that spec's closure pin, and the default `readConfig` swallows parse errors this contract must surface): parse failure → caught → exit 2 with the lib's message + remedy. Default mode: for each `testEnv` row, a variable that is unset **or empty-string** in `process.env` is a miss → exit 1, printing one line per miss: the variable name + its `provision` command + a remedy line citing pipeline rules § Test Rules. No misses, or no/absent/empty registry → exit 0. Malformed registry (`testEnv` not an array; a row missing `var` or `provision`) → exit 2 naming the offending row index. A `var` declared twice is deduplicated (first row wins, one miss line). `--rules <path>` mode (for doctor): checks registry↔prose agreement only (never reads `process.env`): a declared `var` absent as a substring from the rules file's `## Test Rules` section → exit 3 naming it; a rules file with **no** `## Test Rules` heading → exit 3 naming the absent heading (a section that doesn't exist documents nothing). Exit codes follow house convention (substantive findings on 1/3, usage/config errors on 2 — the suite-baseline/scope-reconcile pattern; refuter finding, adopted). | One script, two modes: the same registry serves the build-time STOP and the doctor-time drift check; empty-string-equals-unset is pinned because `VAR=` in a stale .env is the same failure with a worse error message. |
| D3 | Wiring, build: `spec/commands/build.md` Phase 0 step 3 ("Resolve the gate") gains the preflight as a deterministic sub-step run by the orchestrator immediately after resolving the gate command: exit 1 → STOP with the script's output verbatim; the run never enters Phase 1, the red-check probe, or any repair loop — an unprovisioned environment must never enter the repair loop; the remedy is the printed provisioning command, not a fix dispatch. This single wiring point covers both the fast path and the workflow path (both flow through Phase 0 step 3). | Phase 0 runs strictly before every gate/probe/repair path and the workflow's agents inherit the session environment (A1), so one deterministic checkpoint per command suffices; rejected: a preflight inside `gate-loop.js.frag` — the workflow script has no filesystem access, and duplicating the check inside both twins adds the exact hand-copy surface the fragment exists to remove. |
| D3a | Wiring, design (refuter finding, adopted): `wf-design` splices the **same** gate-repair loop (`runGateLoop`, repair rounds and all), so the incident class applies there verbatim. `spec/commands/design.md` § Rules (the session-binding list — the driver cannot enforce these) gains one rule: before executing the driver's `wf-design` invocation step, run the same preflight; exit 1 → STOP with its output — an unprovisioned environment never enters design's gate-repair loop either. | The initial build-only scoping rested on a false premise ("no repair loop on those paths") that this spec's own D3 rationale contradicted; `/spec:review` alone genuinely has no repair loop (gate leg runs once, hard-stops) and stays the named residual. |
| D4 | `spec/commands/doctor.md` check 6b's env clause ("every env var that gates a test suite has a provisioning path named in § Test Rules") is **replaced in place** by the script invocation: run `node "$(spec-paths env-preflight)" --root . --rules <pipelineRules>`; exit 3 = a declared variable lacks its § Test Rules provisioning mention (flag with the script's line); a host whose § Test Rules names gating variables while config has no `testEnv` key = legacy-drift flag recommending `/spec:init` refresh (this direction stays a model judgment — prose has no grammar to parse). | Converts a model-executed prose obligation into a deterministic check (the preferred fix order); the reverse direction is honestly left as judgment rather than pretending a prose grep is deterministic. |
| D5 | `spec/templates/grounding-contract.md` gains `testEnv` in its optional-keys list (one edit — the per-spec cap). This spec **deliberately changes the grounding contract hash**; the build-time escalation trigger "any edit that changes `spec-paths contract-hash` output" is pre-answered by this Decision — the worker proceeds, no consult needed. | The contract is the canonical statement of config keys; shipping a key the contract doesn't name recreates the undeclared-capability class the contract exists to prevent. |
| D6 | Scope covers the two commands with repair loops: build (D3) and design (D3a). `/spec:review` is the named residual: its gate leg runs exactly once and hard-stops on red with the gate output — no repair spend exists there (verified: `runGateLoop` is spliced only into the build/design twins); extending the preflight to review is future work, reopened if a review session is observed misdiagnosing an unprovisioned red. | The incident class is repair-loop spend on a cause no repair can touch; the one path without a repair loop doesn't bleed, so widening there now is additive scope without a measured wound. |
| D7 | ac-matrix's `[env:]` skip reconciliation is **not** touched. The registry could serve as a second sanction source for cross-spec `[env:]` skips (INTAKE JJ-20260815-02), but coupling the two mechanisms in one spec widens the blast radius of both; row -02 stays open with its own pin. | Landing-unit slicing: this spec is green and shippable without it; reopen when planning -02's own fix, where `testEnv` should be evaluated as the sanction source. |
| D8 | Version bump target `6.79.0` in `spec/.claude-plugin/plugin.json` (+ description changelog line). The literal number is a target, not a pin — concurrent sessions race semver; the build bumps to the next free version and logs the deviation (established gotcha). | Version-bump discipline per pipeline rules § Planning. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ doctrine | scripts | workflows | tests | other. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/env-preflight.js | CREATE | scripts | D2: default + `--rules` modes, header comment with usage/incident/exit codes (0/2/3/4), remedy-naming error lines, hand-rolled `--flag value` parsing, zero deps |
| spec/bin/spec-paths | MODIFY | scripts | Add `env-preflight` key resolving to the script + extend the usage line's key list |
| spec/commands/build.md | MODIFY | doctrine | D3: preflight sub-step in Phase 0 step 3 — deterministic STOP before Phase 1/probe/repair, wording must satisfy the carrier pins (see Behavior); must not mention suite-baseline inside step 3 (pinned span) |
| spec/commands/design.md | MODIFY | doctrine | D3a: one session-binding rule in § Rules — preflight before the wf-design invocation step, exit 1 → STOP |
| spec/commands/doctor.md | MODIFY | doctrine | D4: replace 6b's env clause with the `--rules` invocation + legacy-drift flag |
| spec/commands/init.md | MODIFY | doctrine | D1: the § Test Rules environment-gated-suites step also writes the `testEnv` registry into config (extend the existing sentence in place, no new section) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D5: `testEnv` added to the optional-keys list (the spec's single contract edit) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | New row: env preflight (see Behavior → Ledger row) |
| spec/doctrine/claims-baseline.json | MODIFY | other | Re-baseline for the doctrine line-count changes (review hard-check requires the hunk in the same diff) |
| tests/env-preflight.test.js | CREATE | tests | AC-20260815-05-1, AC-20260815-05-2, AC-20260815-05-3, AC-20260815-05-4, AC-20260815-05-7 |
| tests/terminal-observable-acs.test.js | MODIFY | tests | Colliding pin (refuter finding, fixed): the exhaustive `deepStrictEqual` over spec-paths keys (~line 219-237) gains `env-preflight` in its `expected` list — update in place, never weaken |
| tests/gate-env-preflight.test.js | MODIFY | tests | Tag the two existing intake-carrier tests with AC-20260815-05-5 / AC-20260815-05-6 (edit-only; the D3 build.md edit is what turns them green) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8: bump to next free version, description changelog line |
| .claude/suite-baseline.json | MODIFY | other | Regenerate via `suite-baseline.js --update` — the two carrier pins leave the sanctioned-red set |
| spec/INTAKE.md | MODIFY | doctrine | Row JJ-20260815-08: `Fixed in` = landed version, `Fix` = mechanism(spec/scripts/env-preflight.js), same commit as the fix |

## Contracts

```jsonc
// spec.config.json — new OPTIONAL key (absent = legacy, no preflight)
"testEnv": [
  { "var": "DATABASE_URL", "provision": "docker compose up -d db && npm run db:push" }
]
```

```
spec/scripts/env-preflight.js — CLI contract
  node env-preflight.js --root <dir>                  # default mode: process-env presence
  node env-preflight.js --root <dir> --rules <path>   # doctor mode: registry↔§ Test Rules cross-check only
Exit codes (house convention: findings on 1/3, usage-and-config errors on 2):
  0  all declared vars set and non-empty (default mode) / registry agrees with rules (--rules) /
     no, absent, or empty testEnv registry (both modes)
  1  default mode: ≥1 declared var unset or empty — one line per miss:
     "✗ <VAR> unset — provision: <command>" + a final remedy line citing pipeline rules § Test Rules
  2  config missing/unparseable (via readConfigStrict, caught), malformed testEnv (not an array,
     row missing var/provision — names the row), bad usage, or --rules path unreadable
  3  --rules mode: ≥1 declared var name absent from the rules file's ## Test Rules section, or
     the section heading itself is absent (named)
spec-paths key: env-preflight  ·  config read: lib/host-config.js readConfigStrict (spec 20260815/01)
```

## Behavior

- **Build flow (D3):** Phase 0 step 3 resolves the gate, then runs the preflight. On exit 1 the
  orchestrator STOPs via the shared report shape (`🚫` outcome + `Next:` = the provisioning
  command from the script's output). The build.md wording must state both halves the carrier
  pins assert: (i) the preflight of declared suite-gating environment variables happens before
  the gate runs, and (ii) a miss routes away from repair — e.g. "an unprovisioned environment
  must never enter the repair loop; the fix is the provisioning command § Test Rules declares,
  not a repair dispatch". (Carrier regexes: `(preflight|provision)` within 400 chars of
  `(environment variable|env var|suite-gating)`; and `(environment|env)` … `(never enter|instead
  of entering|not enter|skip)` … `repair`.)
- **Doctor flow (D4):** 6b invokes `--rules` mode; exit 3 lines are flagged verbatim. The
  legacy-drift direction (rules name vars, config has no registry) stays a one-line model check.
- **Ledger row (scaffold-ledger, all five columns):** Mechanism = env preflight
  (`env-preflight.js` at build Phase 0 step 3 + design § Rules pre-invocation + doctor 6b
  `--rules` cross-check); Kind = gate — entering directly as gate, not ADVISORY, on the
  measured-incident precedent (boot smoke leg, deliverable manifest check) and because it
  blocks only hosts that opted in by declaring; Justification/evidence = INTAKE JJ-20260815-08
  (salon-os ×2: repair rounds burned on correct code with `DATABASE_URL` unset); Earned under =
  Fable 5-era; Promote/retire condition = if two quarters of ledger data show zero exit-1 STOPs
  across all hosts while hosts carry `testEnv` registries, fold the check into the gate command
  itself and retire the standalone step.

## Acceptance Criteria

<!-- AC-IDs namespaced AC-20260815-05-N. Tests derive from this spec alone. -->

- **AC-20260815-05-1**: WHEN config declares `testEnv: [{"var":"DB_URL","provision":"docker compose up -d db"}]`
  and `DB_URL` is absent from the environment THE SYSTEM SHALL exit 1 and print both the literal
  string `DB_URL` and the literal string `docker compose up -d db` (miss → named remedy) →
  exec test in tests/env-preflight.test.js
- **AC-20260815-05-2**: WHEN every declared variable is set non-empty THE SYSTEM SHALL exit 0;
  AND WHEN a declared variable is set to the empty string (`DB_URL=""`) THE SYSTEM SHALL exit 1
  exactly as if unset (literal pin: empty = missing) → exec test in tests/env-preflight.test.js
- **AC-20260815-05-3**: WHEN config has no `testEnv` key (or an empty array) THE SYSTEM SHALL
  exit 0 with no miss lines — the legacy no-op that keeps undeclared hosts byte-identical to
  today → exec test in tests/env-preflight.test.js
- **AC-20260815-05-4**: WHEN `--rules <path>` is passed and a declared `var` (e.g. `DB_URL`)
  does not appear in that file's `## Test Rules` section THE SYSTEM SHALL exit 3 naming
  `DB_URL`; WHEN it does appear THE SYSTEM SHALL exit 0 → exec test (synthetic rules file in
  `tmpdir()`) in tests/env-preflight.test.js
- **AC-20260815-05-5**: WHEN build doctrine resolves the gate THE SYSTEM SHALL state the
  preflight of declared suite-gating environment variables before the gate runs → existing
  carrier test `JJ-20260815-08: build doctrine preflights…` in tests/gate-env-preflight.test.js
  (tag with this AC-ID)
- **AC-20260815-05-6**: WHEN the preflight misses THE SYSTEM SHALL route away from the repair
  loop and toward the host's provisioning path → existing carrier test `JJ-20260815-08: an
  unprovisioned environment is routed away…` in tests/gate-env-preflight.test.js (tag with this
  AC-ID)
- **AC-20260815-05-7**: WHEN doctor doctrine states check 6b THE SYSTEM SHALL invoke
  `spec-paths env-preflight` with `--rules` (regex pin over doctor.md) → doctrine pin in
  tests/env-preflight.test.js
- **AC-20260815-05-8**: WHEN design doctrine's § Rules is read THE SYSTEM SHALL name the
  preflight before the `wf-design` invocation step with STOP-on-miss semantics (regex pin:
  `/env-preflight[\s\S]{0,400}(wf-design|gate-repair)/` over design.md) → doctrine pin in
  tests/env-preflight.test.js
- **AC-20260815-05-9**: WHEN `testEnv` is not an array, or a row lacks `var` or `provision`
  (literal example: `testEnv: [{"var":"DB_URL"}]`) THE SYSTEM SHALL exit 2 naming the offending
  row — a malformed registry is a config defect, never a silent no-op → exec test in
  tests/env-preflight.test.js

## Assumptions (escalation triggers)

- A1: Workflow/gate agents inherit the invoking session's environment, so a Phase 0 preflight
  pass guarantees the gate's agents see the same variables — **if false:** the preflight must
  also run inside the gate leg; STOP and consult (this changes D3's single-wiring-point shape).
- A2: The declared variables are read by suites from the process environment (not exclusively
  from `.env` files loaded at app runtime) — **if false for some host:** the `provision`
  command is still the right remedy surface (it can write the .env), but the preflight can
  false-miss; the host records the variable's real loading path in § Test Rules and omits it
  from `testEnv`. Documented limitation, not a STOP.
- A3: `## Test Rules` names variables in plain text so D2's substring match is meaningful —
  **if false** (renamed var, wrapped mid-word): `--rules` exits 3 and doctor flags noise; the
  fix is the host's § Test Rules wording. Acceptable false-positive direction (fails loud,
  never silently green).
- A4: Version 6.79.0 is free at build time — **if false:** bump to next free, log deviation.

## Rationale

Adversarial round (2 refuters): five findings adopted into Decisions, each marked in place —
the spec-paths closed key-list collision (now a File Plan row), the design-twin repair loop
(D3a — the round's most consequential catch: the original build-only scope rested on a false
premise this spec's own D3 rationale contradicted), the exit-code house-style inversion (D2
remapped), the init.md cross-phase config write (D1 restated), the host-config strict-reader
dependency (depends_on spec 01; a private read would trip that spec's closure pin), plus the
malformed-registry/absent-heading edge cases (D2, AC-9) and the ledger row's missing
Earned-under column. No finding was rejected.

The generating defect is a category error: the gate cannot distinguish "the code under test is
wrong" from "the environment the test needs was never provisioned", and the repair loop is the
most expensive thing build runs *and* structurally cannot fix the second category. The fix
moves the distinction to the only place it is cheap: a deterministic presence check before any
expensive path is reachable. The registry (D1) is deliberately the machine twin of an
obligation init.md already imposes in prose — this is prose→enforcement conversion, not a new
obligation on hosts.

Rejected: wiring a second preflight into `gate-loop.js.frag` (Fable's initial sketch) — the
workflow script has no filesystem access, agents inherit the session env (A1), and the fragment
is shared verbatim by wf-build and wf-design, so a preflight there would ship to design's gate
loop untested and duplicate a check Phase 0 already guarantees. Rejected: extending
`ac-matrix.js` with the registry as a second `[env:]` sanction source (D7) — real value, wrong
landing unit; INTAKE JJ-20260815-02 keeps it. Rejected: a `SHALL CONTINUE TO` regression pin —
the legacy path is pinned red-first by AC-3 instead, because the pin marker would classify its
test as a sanctioned-green carrier while the test is necessarily red until the script exists;
no existing neighbor behavior changes when `testEnv` is absent (the preflight is additive-before
and exit-0-silent), which is the regression-pin waiver this Rationale records.

Fragile to watch: build.md's Phase 0 step 3 is dense — the preflight sub-step must not disturb
the `{testDirs}` glob-resolution wording that tests/testdirs-glob-resolution.test.js pins, and
tests/suite-baseline/doctrine.test.js pins the same step-3 span with a
`doesNotMatch(/suite-baseline/)` — the preflight sub-step must not mention suite-baseline
(refuter finding; trivially satisfiable, named here so no worker trips it).

Collision sweep (lock obligation, `collision-closure --literal provisioning --literal skipIf`):
the likely-tier hit on tests/terminal-observable-acs.test.js was a REAL collision — its
exhaustive `deepStrictEqual` over spec-paths keys breaks on any new key — and is now a File
Plan row (refuter-confirmed; the fourth recurrence of the key-list class, this time caught at
plan). The remaining likely-tier pins were verified not to close over the changed surface and
are **waived**: tests/capabilities/config-contract.test.js pins exactly the `capabilities`
block's key set (`testEnv` is a sibling top-level key, not inside it);
tests/enforce/taxonomy.test.js carries no 6b/env pin; tests/consistency/drift-reconcile.test.js
pins phrases D3/D4 don't touch; tests/claims-lint-baseline-path.test.js pins the baseline's
location, not its values. Literals hits outside the File Plan (shared.md, review.md:163's
`skipIf` incident narrative, roadmap and autopilot files) are unrelated domains or history, not
restatements of the replaced 6b clause — waived; the only test asserting the replaced clause's
vocabulary is this spec's own carrier. The build Phase 4 whole-suite check adjudicates any miss.

## Canonical Delta

docs/canonical/gate-integrity.md (create if absent): add a section "Environment preflight" —
suite-gating environment variables are declared in `spec.config.json` `testEnv` (written by
init, cross-checked by doctor 6b via `env-preflight.js --rules`), and build Phase 0 runs the
presence check before the gate; a miss is a provisioning STOP printing the declared provision
command, never a repair round. Absent registry = legacy no-op.
