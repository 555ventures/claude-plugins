---
date: 2026-08-22
status: hardened
open_markers: 0
tier: standard           # additive spec-paths key follows 20260819/02 + 20260820/05 + 20260821/01 precedent; scope-reconcile.js (critical-named) gets one additive read-only flag, no behavioral edit to existing modes (pinned by AC-12); init runs only at bootstrap — worst failure is a broken bootstrap in a fresh host, recoverable by re-run
area: bootstrap
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 11
---

# Init generation script — the bootstrap's deterministic file generation becomes code

## Goal

`init.md` (604 lines) is the last big English program standing after v7: most of it is
deterministic file generation — config, rules, agents, skills, settings allowlist, manifest,
gitignore/gitattributes mechanics — described as prose for a model to re-perform each
bootstrap. This spec moves all of it into one script, `spec/scripts/init-gen.js` (the
`review-legs.js` inversion applied to init): the session profiles the repo, interviews the
user, authors judgment content as one structured profile, and invokes the script, which is
the sole writer of every grounding-layer deliverable and enforces the manifest-check→stamp
ordering in code. Init also gains the three probes brief 11 folds in: `frontend-design`
installed-check (ADR-0001), the `testCommand` no-match probe, and the at-risk-leg
applicability probe. Done = the generated tree passes `manifest-check.sh` executed (not
asserted) in tests, and `init.md` shrinks to profiling + interview + probe + one invocation.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | One new script `spec/scripts/init-gen.js` with two subcommands: `probe` (read-only findings JSON, exit 0 even on adverse findings) and `generate` (profile in → files out → `manifest-check.sh` → stamp) (AC-20260822-02-1, AC-20260822-02-8) | Same disease review-legs.js killed: a hand-performed deterministic phase drifts per session and per model; judgment stays prose, generation becomes exit codes |
| D2 | The script is the **sole writer** of the grounding-layer deliverables — `.claude/spec.config.json`, pipeline rules file, `.claude/rules/conventions/*.md`, `.claude/agents/*.md`, both skills, `.claude/settings.json` permissions merge, `scripts/spec-patterns.sh`, `.claude/spec-manifest.json`, gitignore/gitattributes entries. Judgment content travels as structured profile fields (JJ fork ruling 2026-08-22: "script writes everything"). Phase 1.5 substrate code (health route, seed script, compose files) and Phase 6 design-foundation artifacts stay session-authored; the profile's `manifestExtras` records them as manifest rows (AC-20260822-02-1, AC-20260822-02-14) | Byte-identical file shapes by construction across every host and model; the "performed the template slightly differently" drift class dies where workers trust files blindly |
| D3 | Stamp ordering enforced in code: `generatedBy`/`contractHash` are written into the config **only after** `manifest-check.sh` exits 0; a red manifest-check leaves the config unstamped and `generate` exits 1 (AC-20260822-02-2) | The contract's "may not stamp until it exits 0" rule was prose an interrupted session could violate; code cannot |
| D4 | Idempotency by executed probe, and the broken prose form is retired: ignore-entry detection probes a **child path** (`git check-ignore -q .claude/worktrees/x`), never the bare directory — the current init.md form `git check-ignore -q .claude/worktrees` exits 1 on a fresh host even when the entry exists (dir-only pattern, path not yet on disk; executed 2026-08-22, see A5), so it re-appends forever. gitattributes detection stays `git check-attr merge` (AC-20260822-02-3, AC-20260822-02-4) | A spike falsified the locked prose; the script carries the correct form and a test pins it |
| D5 | Refresh contract: any target file that exists with content differing from what the profile would produce → `generate` exits 3 listing the files and writes **nothing**; `--refresh` overwrites and prints one `changed:`/`unchanged:` line per file. `.claude/settings.json` is the exception: always merge-preserving (every existing entry kept; an existing deny covering a would-be allow is kept and reported, never overridden), both modes (AC-20260822-02-6, AC-20260822-02-7) | Re-running init must never silently clobber user hand-edits; the session folds edits into the profile first, then refreshes |
| D6 | The Worker Contract block is extracted at runtime from the plugin's own `templates/grounding-contract.md` (the fenced block under `## Worker Contract`, plugin root resolved from `__dirname` like sibling scripts), self-verify examples substituted from `profile.selfVerifyExamples`, tests-kind agent appending the `## Tests-kind addendum` fenced block verbatim. Unparseable contract → exit 2 naming the file (AC-20260822-02-5) | Byte-identity across agents by construction, and the contract file is already the hash-stamped single source — no second copy to drift |
| D7 | `frontend-design` (ADR-0001): `probe` reports `{installed, enabled, scope}` from `claude plugin list --json` (shape executed 2026-08-22, A1); `claude` CLI absent from PATH → `{"unavailable": "no-claude-cli"}`, never a probe failure. The install **offer** stays an init.md interview step on design-capable hosts only (ADR-0001 says "offers", and headless hosts author no design); the embedded install command is `claude plugin install frontend-design@claude-plugins-official --scope user -y` (flags executed, A2) (AC-20260822-02-9, AC-20260822-02-10) | Detection is deterministic and belongs in the script; consent is the user's and belongs in the interview |
| D8 | `testCommand` no-match probe: `probe --test-command "<cmd>"` executes `<cmd> <generated nonexistent path>` in the host root and reports `failsLoudOnNoMatch` (exit≠0 → true). False (the `cargo test <path>`-matches-nothing-exits-0 class) is surfaced to the user in the interview; the outcome lands in the manifest either as an `exec` row `bash -c "! <testCommand> <nonexistent path>"` (fails-loud, permanently re-verifiable by doctor check 6b; negation form executed, A4) or as an `inert` row carrying the user's accepted-risk reason. init.md's config comment states the full contract at the capture site: testCommand accepts appended file paths; a no-match must not read as pass (AC-20260822-02-8, AC-20260822-02-15) | The 2026-08-20 at-risk escape was vacuous green on exactly this class; init is the one moment the assumption is cheap to execute |
| D9 | At-risk applicability probe: `scope-reconcile.js` gains an **additive** `--probe-at-risk <file>` mode (file = newline-separated repo-relative source paths) reusing the existing stem derivation and test-file scan in place — never a second implementation (§ Risk Tiers: sole derivation). It takes `--test-globs <csv>` (config does not exist yet at probe time; default = the contract's default `testGlobs`), prints `{sampled, testFiles, refs}` JSON, exits 0. `init-gen probe` samples up to 20 tracked non-test source files and shells to it; `refs: 0` → the interview surfaces "the at-risk review leg will likely never fire here" and the profile records an `inert` manifest row (AC-20260822-02-11, AC-20260822-02-16) | Python-shaped imports contain no path substrings, so the leg is silently inert on such hosts today — indistinguishable from clean; init is where a host learns this |
| D10 | Existing scope-reconcile modes are untouched: `--json`/`--dirs` output stays byte-identical on the existing at-risk fixtures (AC-20260822-02-12, regression pin on the existing covering tests) | The critical-named script's live consumers (review legs, build final gate) must see zero behavior change |
| D11 | Wiring: `spec-paths` gains key `init-gen`; `spec/entrypoints.json` gains `spec/scripts/init-gen.js` → `["spec/commands/init.md"]` and records init-gen.js's quoted-literal invocations of `scope-reconcile.js` and `manifest-check.sh`; `tests/spec-paths.test.js`'s key list is updated IN PLACE (additive-collision class JJ-20260814-01, planned here so it never lands out-of-plan); plugin.json bumps (target 7.17.0 — a target, not a pin, per the semver-race gotcha) with the changelog paragraph (AC-20260822-02-13) | A missing key breaks commands silently; the collision-prone surfaces enter the File Plan up front |
| D12 | `tests/run-ledger.test.js`'s prose pin over init.md (`/\.claude\/spec-runs\.jsonl merge=union/`) is retargeted: the union-driver instruction moves from prose to init-gen.js, and the pin's job passes to AC-20260822-02-3's behavioral test (generate → `.gitattributes` contains the line); the run-ledger test drops its init.md clause, keeping its other asserts (AC-20260822-02-3) | Regexes over prose are not tests (§ Test Rules); the behavior is now executable |
| D13 | Exit codes for `generate`: 0 = generated, manifest-check green, stamped · 1 = manifest-check red, nothing stamped · 2 = usage error / invalid profile (missing required field named, remedy printed) / unparseable Worker Contract · 3 = existing targets differ and no `--refresh`, nothing written. `probe` exits 0 on findings (findings are data), 2 on usage (AC-20260822-02-2, AC-20260822-02-7, AC-20260822-02-17) | § Worker Rules: explicit exit-code alphabet in the header; adverse findings are observations, not failures |
| D14 | init.md is rewritten around the script: keeps Phase 1 profiling, Phase 1.5 substrate authoring, the interview, Phase 6 design foundation, the Phase 8 `/spec:enforce` handoff, and the report; everything the script now owns (the Phase 1 gitignore/gitattributes mechanics, Phase 2's config JSON body, Phase 2.5 merge mechanics, Phase 3/4 file-shape skeletons, the Phase 5 harness heredoc, Phase 7 manifest assembly/ordering) is replaced by the profile-schema reference and the two invocations [no-ac: prose thinning has no executable oracle; the moved literals are closed by AC-3/AC-5/AC-14's behavioral tests, the collision-closure sweep at lock, and review's diff] | The brief's ablation rule: keep only what the model must judge — profiling and the interview |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/init-gen.js | CREATE | scripts | D1–D8, D13: probe + generate subcommands, sole-writer generation, manifest-check→stamp ordering, header contract per § Worker Rules |
| spec/scripts/scope-reconcile.js | MODIFY | scripts | D9: additive `--probe-at-risk <file> [--test-globs <csv>]` mode reusing the in-place stem derivation; existing modes untouched (D10) |
| spec/bin/spec-paths | MODIFY | scripts | D11: `init-gen` key + usage string |
| spec/entrypoints.json | MODIFY | scripts | D11: init-gen.js entry (init.md) + its script→script invocations (scope-reconcile.js, manifest-check.sh) |
| spec/commands/init.md | MODIFY | doctrine | D7, D8, D14: shrink to profiling + interview + probes + profile authoring + generate invocation; testCommand contract stated at the capture site; frontend-design offer step |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11: version bump (target 7.17.0) + changelog description paragraph |
| tests/init-gen/generate.test.js | CREATE | tests | AC-20260822-02-1, AC-20260822-02-2, AC-20260822-02-3, AC-20260822-02-4, AC-20260822-02-5, AC-20260822-02-6, AC-20260822-02-7, AC-20260822-02-14, AC-20260822-02-15, AC-20260822-02-16, AC-20260822-02-17 |
| tests/init-gen/probes.test.js | CREATE | tests | AC-20260822-02-8, AC-20260822-02-9, AC-20260822-02-10 (PATH-shim `claude` fixtures; no real CLI dependency) |
| tests/scope-reconcile-probe.test.js | CREATE | tests | AC-20260822-02-11 |
| tests/scope-reconcile-at-risk.test.js | MODIFY | tests | AC-20260822-02-12: tag the existing covering tests with the pin AC-ID (never weakened) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260822-02-13: key list updated in place (JJ-20260814-01 class) |
| tests/run-ledger.test.js | MODIFY | tests | D12: drop the init.md prose clause; other asserts unchanged |
| .claude/spec-manifest.json | MODIFY | other | D4 applied to this dogfood host: the exec row's `git check-ignore -q .claude/worktrees` probe becomes the child-path form (found by the lock-time collision sweep; works locally only because the dir happens to exist) |

Orchestrator duty (outside the table): after the doctrine wave lands, run
`node --test 'tests/consistency/*.test.js'` — entrypoints and citations conformance sweep
both sides of the init.md rewrite.

## Contracts

`spec/scripts/init-gen.js` CLI:

```
init-gen.js probe --root <dir> [--test-command "<cmd>"] [--sample <n>]
init-gen.js generate --root <dir> --profile <path> [--refresh]
```

`probe` stdout (single JSON object; every adverse finding is data, exit 0):

```jsonc
{
  "frontendDesign": { "installed": true, "enabled": true, "scope": "user" },
  //   or { "installed": false } · or { "unavailable": "no-claude-cli" }
  //   or { "unavailable": "unparseable-plugin-list" }
  "testCommand": { "failsLoudOnNoMatch": true, "exit": 1 },   // only when --test-command given
  "atRisk": { "sampled": 20, "testFiles": 14, "refs": 3 }     // via scope-reconcile --probe-at-risk
}
```

`scope-reconcile.js --probe-at-risk <file> --root <dir> [--test-globs <csv>]` stdout:

```jsonc
{ "sampled": 20, "testFiles": 14, "refs": 3 }
// refs = count of (sampled file, test file) reference hits via the existing stem scan.
// --test-globs default: tests/**,test/**,**/*.test.*,**/*.spec.*,**/*_test.*
```

Profile JSON (`generate --profile`; authored by the init session in its scratchpad):

```jsonc
{
  "config": { /* the full spec.config.json object, judgment values filled;
                 generatedBy/contractHash MUST be absent — the script stamps them */ },
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

Script-owned emissions with no profile input: gitignore entries (`.claude/worktrees/`,
`specs/**/*.design/`, retired digest-pattern cleanup), the gitattributes union driver, the
rules file's empty `## Gotchas` section + contract header comment, the patterns-harness
skeleton (init.md's current verbatim block moves into the script), the settings deny
defaults (`Bash(rm -rf:*)`, `Read(.env*)`), config-derived settings allow entries (one exact
entry per declared config command), the minimum manifest row set (one row per written
deliverable + smoke + remote-or-inert + the D8 testCommand row + the D9 at-risk row when
declared inert), and the two probe-outcome manifest rows.

Exit codes: see D13. The script header carries usage, the dated incident (the 2026-08-20
at-risk escape and the v7 inversion precedent), an explicit "what this deliberately does NOT
do" list (no profiling, no interviewing, no substrate authoring, no design foundation, no
enforcement generation — `/spec:enforce` owns that), and the exit-code alphabet.

## Behavior

- **Init session flow after this spec:** Phase 1 profiling (unchanged) → Phase 1.5 substrate
  authoring (unchanged) → `init-gen probe` → interview (existing questions + two new
  probe-driven ones: the frontend-design install offer on design-capable hosts when
  `installed` is false; the testCommand vacuous-pass acceptance when `failsLoudOnNoMatch` is
  false; plus the at-risk inertness disclosure when `refs` is 0) → author the profile JSON in
  the session scratchpad → `init-gen generate` → Phase 6 design foundation (unchanged, files
  recorded via `manifestExtras` on a re-run or appended to the manifest by the session per
  the existing prose) → report → Phase 8 `/spec:enforce` handoff.
- **Ordering within `generate`:** validate profile → refuse-or-refresh scan (D5) → write all
  artifacts → assemble manifest → run `manifest-check.sh` → stamp on green. An interrupted
  run before the stamp leaves an unstamped config — the same "either no row or a complete
  one" property the ledger contract uses.
- **Probe never blocks:** all three probes report; the interview adjudicates. A host with no
  `claude` CLI, a vacuous-pass runner, and an inert at-risk leg still bootstraps — with
  every one of those facts recorded rather than silent.
- **Refresh flow:** the session diffs existing generated files, folds user hand-edits into
  the profile, then runs `generate --refresh`. The exit-3 refusal is the guard against
  skipping that step.

## Acceptance Criteria

- **AC-20260822-02-1**: WHEN `generate` runs against a synthetic host repo with a valid
  profile THE SYSTEM SHALL write the config, pipeline rules file, convention rules, agents,
  both skills, settings permissions, patterns script (executable, runs exit 0), and
  manifest, and exit 0 with the config stamped (e.g. `generatedBy` = `"spec@"` + the
  plugin's version and `contractHash` = the 12-hex output of `spec-paths contract-hash`,
  currently `7f3aa1a834ed`) → tests/init-gen/generate.test.js
- **AC-20260822-02-2**: WHEN the assembled manifest fails `manifest-check.sh` (e.g.
  `manifestExtras` carries `{"claim":"x","kind":"file","target":"missing.txt"}`) THE SYSTEM
  SHALL exit 1 and leave the written config WITHOUT `generatedBy` or `contractHash` keys →
  tests/init-gen/generate.test.js
- **AC-20260822-02-3**: WHEN `generate` runs twice (second run `--refresh`, identical
  profile) THE SYSTEM SHALL leave exactly one occurrence each of `.claude/worktrees/` and
  `specs/**/*.design/` in `.gitignore` and exactly one `.claude/spec-runs.jsonl merge=union`
  line in `.gitattributes` → tests/init-gen/generate.test.js
- **AC-20260822-02-4**: WHEN the ignore entries already exist but `.claude/worktrees` does
  not exist on disk THE SYSTEM SHALL append nothing (child-path probe: `git check-ignore -q
  .claude/worktrees/x` → exit 0 detects the entry; the bare-directory form exits 1 there —
  executed 2026-08-22) → tests/init-gen/generate.test.js
- **AC-20260822-02-5**: WHEN agents are generated THE SYSTEM SHALL emit a
  `## Worker Contract (spec pipeline)` section that is `strictEqual` across every agent,
  with `profile.selfVerifyExamples` (e.g. `` `node --test 'tests/x/*.test.js'` ``) appearing
  verbatim in each, and the tests-kind agent additionally carrying the two Tests-kind
  addendum bullets → tests/init-gen/generate.test.js
- **AC-20260822-02-6**: WHEN `.claude/settings.json` already exists with a user allow entry
  and a deny entry covering a config-derived would-be allow THE SYSTEM SHALL preserve both
  existing entries in the output and print a conflict line naming the deny — never remove or
  override it → tests/init-gen/generate.test.js
- **AC-20260822-02-7**: WHEN a target file exists with differing content (e.g. a
  pre-existing `.claude/rules/spec-pipeline.md` containing `USER EDIT`) and `--refresh` is
  absent THE SYSTEM SHALL exit 3 naming the file and leave every target byte-identical
  (`USER EDIT` still present, no sibling files written) → tests/init-gen/generate.test.js
- **AC-20260822-02-8**: WHEN `probe --test-command` names a runner that exits 0 on a
  nonexistent path (PATH-shim `exit 0`) THE SYSTEM SHALL report
  `"failsLoudOnNoMatch": false`, and WHEN the runner exits nonzero (shim `exit 1`) SHALL
  report `true` with the observed exit code → tests/init-gen/probes.test.js
- **AC-20260822-02-9**: WHEN no `claude` executable is on PATH THE SYSTEM SHALL report
  `"frontendDesign": {"unavailable": "no-claude-cli"}` and exit 0 →
  tests/init-gen/probes.test.js
- **AC-20260822-02-10**: WHEN a PATH-shim `claude` emits the plugin-list JSON shape
  (executed 2026-08-22: array rows `{"id": "frontend-design@claude-plugins-official",
  "scope": "user", "enabled": true, …}`) THE SYSTEM SHALL report
  `{"installed": true, "enabled": true, "scope": "user"}`; a row with `"enabled": false` →
  `{"installed": true, "enabled": false, …}` → tests/init-gen/probes.test.js
- **AC-20260822-02-11**: WHEN `--probe-at-risk` samples a source file that a test file
  references by path stem (fixture test containing `require('../src/lib/util.js')`, sample
  containing `src/lib/util.js`) THE SYSTEM SHALL report `refs ≥ 1`, and WHEN the fixture's
  test references only dotted module imports (`from app.services import x`, sample
  `app/services.py`) SHALL report `"refs": 0` — both exit 0 →
  tests/scope-reconcile-probe.test.js
- **AC-20260822-02-12**: WHEN `scope-reconcile.js` runs its existing `--json` mode on the
  existing at-risk fixtures THE SYSTEM SHALL CONTINUE TO emit the same `atRisk` rows and
  exit codes (existing covering tests in tests/scope-reconcile-at-risk.test.js tagged with
  this AC-ID, never weakened) → tests/scope-reconcile-at-risk.test.js
- **AC-20260822-02-13**: WHEN `spec-paths init-gen` runs THE SYSTEM SHALL print a path that
  exists (key list updated in place; pre-image exits 1 on the unknown key — executed
  2026-08-22) → tests/spec-paths.test.js
- **AC-20260822-02-14**: WHEN `generate` exits 0 THE SYSTEM SHALL have written one manifest
  row per generated deliverable (config, rules file, each convention rule, each agent, each
  skill, patterns `exec` row, settings `exec` row, `smoke` row, `remote`-or-`inert` row)
  plus every `manifestExtras` row verbatim → tests/init-gen/generate.test.js
- **AC-20260822-02-15**: WHEN `probeOutcomes.testCommand.failsLoud` is true THE SYSTEM SHALL
  write an `exec` manifest row whose target is `bash -c "! <testCommand> <nonexistent
  path>"` (negation form exits 0 for a fails-loud runner — executed 2026-08-22), and WHEN
  false with an `acceptedReason` SHALL write an `inert` row carrying that reason →
  tests/init-gen/generate.test.js
- **AC-20260822-02-16**: WHEN `probeOutcomes.atRisk.applicable` is false with a reason THE
  SYSTEM SHALL write an `inert` manifest row naming at-risk detection and that reason →
  tests/init-gen/generate.test.js
- **AC-20260822-02-17**: WHEN the profile is missing a required field (e.g.
  `config.gateCommand`) THE SYSTEM SHALL exit 2 naming the field and printing the remedy,
  writing nothing → tests/init-gen/generate.test.js

## Assumptions (escalation triggers)

- A1: `claude plugin list --json` emits an array of rows carrying `id`
  (`name@marketplace`), `scope`, `enabled` — executed 2026-08-22 on this machine
  (`frontend-design@claude-plugins-official`, `"scope": "user"`, `"enabled": true`
  observed). — **if false** (shape changes in a future CLI): probe reports
  `{"unavailable": "unparseable-plugin-list"}` and the interview falls back to asking the
  user directly; the typed-unavailable arm is part of D7's contract, not an afterthought.
- A2: `claude plugin install` accepts `-s/--scope user` and `-y` (non-TTY) — executed
  2026-08-22 (help output). — **if false:** the init.md-embedded command fails loud in the
  session; the user runs `/plugin install frontend-design` interactively; nothing in the
  script depends on it.
- A3: `node --test <nonexistent path>` exits 1 — executed 2026-08-22 (`exit=1`). Probe tests
  use PATH shims, so no per-runner claim is locked; the probe mechanism is the derivation
  and each host adjudicates its own runner at init time. — **if false:** n/a (no runner
  claim locked).
- A4: `bash -c "! <cmd> <path>"` exits 0 when the inner command fails — executed 2026-08-22
  (`negated-probe-exit=0`), so the D8 `exec` manifest row is valid under
  `manifest-check.sh`'s `bash -c "$TARGET"` execution. — **if false:** n/a (observed).
- A5: `git check-ignore -q .claude/worktrees` exits 1 when the entry exists but the
  directory does not; the child-path probe `.claude/worktrees/x` exits 0 — both executed
  2026-08-22 (`ignore-hit=1`, `child-probe=0`, `dir-exists=0`). This falsifies the current
  init.md prose form and is D4's basis. — **if false:** n/a (observed).
- A6: `git check-attr merge -- .claude/spec-runs.jsonl` prints `unspecified` without the
  attribute and `union` with it — executed 2026-08-22. — **if false:** n/a (observed).
- A7: `templates/grounding-contract.md`'s `## Worker Contract` and `## Tests-kind addendum`
  fenced blocks are extractable by heading + fence scan; the file is hash-stamped, so it
  cannot drift silently under the script. — **if false** (heading renamed in a future
  contract change): `generate` exits 2 naming the contract file and the heading it expected;
  the contract-hash mismatch warning fires on every host anyway.
- A8: The in-flight red-check spec (specs/20260821/01, `implementing`) owns
  `{testCommand} <file>` per-file semantics at build time; this spec's probe duty is
  init-time capture only and reads the config value as-is — no shared code, no ordering
  dependency. — **if false** (red-check lands a changed testCommand contract): the probe
  follows whatever the config captures; re-derive the probe string then.
- A9: `scope-reconcile.js`'s stem derivation (`stemsFor` + the content scan) is callable for
  a caller-supplied file list without touching the git-diff path — the functions are
  file-local and the probe mode wires them to `--probe-at-risk` input instead of the changed
  set. — **if false** (derivation entangled with git state): extract the two functions to
  `spec/scripts/lib/` used by both paths in the same file-set; the sole-derivation rule is
  satisfied either way; escalate to the user only if extraction would change existing-mode
  behavior (D10's pin decides).

## Rationale

The shape follows review-legs.js deliberately: a long-header script that IS the phase, a
command file that invokes it and adjudicates, and typed observations instead of narrated
ones. The architecture fork (who writes judgment-bearing files) went to JJ and came back
"script writes everything": the profile JSON carries judgment as structured data, and the
script is the single writer — chosen because file-shape drift across sessions/models is the
measured failure class v7 exists to kill, and because a single writer makes the manifest
complete by construction. The costs accepted: markdown-in-JSON authoring for rules/agents
bodies, and an explicit refresh step (D5) instead of freehand re-generation.

Three things a cold reader should not re-litigate: (1) the at-risk probe reuses
scope-reconcile.js in place via an additive flag — a second stem implementation anywhere is
a hard violation of this repo's sole-derivation rule, and a lib extraction is the sanctioned
fallback only if A9 fails; (2) the frontend-design *offer* is interview prose, not script
behavior — ADR-0001's word is "offers", and a script that installs software on its own
judgment is the wrong side of that line; (3) doctor stays prose — the brief's "doctor
executed" evidence bar is honored by `manifest-check.sh` executed in tests (doctor check 6b
re-runs exactly that) since no doctor script exists to execute.

Spike findings that reshaped the draft: the locked init.md idempotency check for
`.claude/worktrees` is broken on fresh hosts (A5) — D4 retires it; the negated-exec manifest
row (A4) turns the testCommand probe from a one-shot interview fact into a permanently
re-verifiable activation claim.

Collision-sweep waives (lock 2026-08-22): `tests/consistency/entrypoints.test.js` (paths-leg
`likely` hit for the spec-paths/entrypoints.json rows) needs no edit — the suite is
data-driven over `spec/entrypoints.json`, and the orchestrator duty line runs it; the
`.gitattributes` literals hit for `merge=union` is this repo's live configuration, not a
retired assertion — it stays. The `.claude/spec-manifest.json` literals hit entered the File
Plan as a fix row.

Defect-fix pinning: the only behavior that must survive is scope-reconcile's existing
derivation — AC-12 pins it (`SHALL CONTINUE TO`). No other neighbor changes behavior:
init-gen.js is wholly new, and init.md's consumers (state gates, genesis gate) key on
files/fields this spec does not move.

## Canonical Delta

`docs/canonical/bootstrap.md` (create if absent): `/spec:init` is a
profiling-and-interview session around `spec/scripts/init-gen.js` (`spec-paths init-gen`) —
`probe` reports frontend-design presence, testCommand no-match behavior, and at-risk-leg
applicability; `generate` is the sole writer of the grounding layer from a structured
profile and stamps `generatedBy`/`contractHash` only after `manifest-check.sh` passes.
Refresh runs are guarded by an exit-3 refusal unless `--refresh` is passed; user hand-edits
are folded into the profile, never preserved by freehand regeneration.
