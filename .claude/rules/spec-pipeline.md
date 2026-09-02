---
paths:
  - "specs/**"
  - ".claude/**"
---

# Spec pipeline grounding — claude-plugins

This repo is the **source of the spec plugin itself** (plus `git/`). The
pipeline dogfoods here: the grounding below describes the marketplace repo, not an app.
Everything is dependency-free Node + bash; the only external binary assumed is `jq`.

## Risk Tiers

Critical-tier triggers for THIS repo:

- **`spec/templates/grounding-contract.md`** — its hash is stamped into every host's
  `spec.config.json`; any edit flags every host's grounding as stale. Edit only when the
  contract genuinely changes, never for wording.
- **Hook surfaces** (process boundary): `spec/hooks/hooks.json`, `spec/scripts/spec-state-gate.sh`,
  `spec/scripts/genesis-state-gate.sh`, `spec/scripts/question-style-gate.js`,
  `spec/scripts/block-cross-worktree-writes.sh` — a broken hook blocks or pollutes every
  session's prompts in every host repo.
- **`spec/scripts/merge-back.sh`** — runs destructive git ops against host repos; exit-code
  alphabet (3 = conflicts, 4 = CWD-inside-worktree refusal) is load-bearing for /spec:review.
- **`spec/scripts/spec-status.js`** — the sole source of "what's next" across all hosts and a
  frozen API for external `--json` consumers (`--root/--next/--json` shape, the five action
  strings); never a second derivation of roadmap state anywhere.
- **`spec/scripts/scope-reconcile.js`** — the sole derivation of changed-set-vs-File-Plan
  reconciliation (incl. `atRisk`) behind review's reconcile/at-risk legs and build's Final-gate
  advisory.
- **`spec/scripts/verdict.js`** — the sole derivation of the review/release verdict word; a
  splice bug here corrupts every review and release verdict at once. Never a second place that
  computes or asserts CLEAN.
- **`spec/scripts/review-legs.js`** — runs every deterministic review leg and writes the
  evidence manifest verdict.js derives from; a bug here silently changes what every review
  observes.
- **`spec/bin/spec-paths`** — every command resolves scripts through it; a wrong key breaks
  commands silently.

Standard-tier-shaped direct work: doctrine prose edits, new sweeps in
`scripts/spec-patterns.sh`, additive template fields, README touch-ups.

## Planning

- Ground against the real surfaces: `spec/doctrine/core.md` + `spec/doctrine/design.md`
  (invariants; sections served via `spec-paths shared-for <command>` — the section lists in
  `spec/bin/spec-paths` are the canonical map) and `spec/templates/grounding-contract.md`
  (host contract).
- Decomposition caps: at most one edit to `grounding-contract.md` per spec; a behavior change
  and its behavioral test belong in the same File Plan row pair.
- New-surface checklist: a new command needs frontmatter (`description`, `argument-hint`),
  a `spec-paths` key if it ships a script, a `shared-for` section list if it reads the
  doctrine, and a plugin.json `description` update (the changelog surface, last-3-versions
  form). A new plugin needs `<plugin>/.claude-plugin/plugin.json` and a
  `.claude-plugin/marketplace.json` entry.
- Version bump discipline: every behavior change bumps the owning plugin's
  `.claude-plugin/plugin.json` semver.

## Build

- Host escalation triggers: any test that must be weakened to pass (tests here are pinned
  invariants with owner citations — weakening one is a doctrine change, not a fix);
  any edit that changes `spec-paths contract-hash` output.

## Worker Rules

- **Frozen scripts**: `spec/workflows/wf-*.js` (the design/enforce workflow scripts) are
  plain checked-in scripts carried as-is for the design family; edit them only under a spec
  that names them, never as a side effect.
- **Zero dependencies**: scripts and tests use only Node built-ins (`fs`, `path`,
  `child_process`, `os`, `assert`, `node:test`) and `jq` in bash. Never add a package. Any
  non-builtin import anywhere is a hard finding, no footnotes.
- Bash scripts open `#!/usr/bin/env bash` + `set -u` (never `set -e` — failures are explicit
  and carry remedies). JS scripts open `#!/usr/bin/env node` + `'use strict'`.
- Every script starts with a header comment: usage line, the one owner citation (spec path,
  AC-ID, D-number, ADR, run id, pin id) for why it exists, what it deliberately does NOT do,
  and an explicit `Exit codes:` list — never dates, people, hosts, versions, or prior behavior.
- Error messages name the remedy command. Machine contracts are sentinel lines
  (`__SMOKE_PASS__`-style) or `--json`; the human render is the only other format.
- Hand-rolled `--flag value` arg parsing only; no arg-parsing library, ever.

## Test Rules

- Framework: `node:test` + `node:assert`, flat `test('...')` — no `describe` blocks. Files
  are `tests/<topic>.test.js`; helpers from `tests/helpers.js`
  (`ROOT, SPEC, read, tmpdir, runNode, runBash, gitRepo`).
- Test names are full sentences stating the invariant. Every assert carries a third-arg
  message stating the **consequence of failure**, not the expectation.
- Tests are **behavioral**: exec-a-script against a synthetic host in `tmpdir()` via
  `runNode`/`runBash`, asserting on status + output. Fixtures (`tests/fixtures/`) only when
  the input must be a realistic multi-file artifact. Regexes over prose are not tests — a rule
  that matters gets a script (core § Incident Policy).
- Tests cite the owner id they pin in a header comment — spec path, AC-ID, or escape row id;
  pipeline-authored tests for new specs reference AC-IDs in the test name (`AC-{YYYYMMDD-NN}-1`).
- Nothing here is exempt from TDD. There are no sanctioned env-gated skips.
- **Gates are plainly green** (v7): `npm test` exits 0 on untouched code; there is no
  sanctioned-failing baseline and no standing red pins. A red suite is a regression or an
  unfinished change, never a TODO.
- Scoped runs: `node --test 'tests/<scope>/*.test.js'` — the glob form; `node --test <dir>`
  does not run files on Node 26. Paths are repo-root-relative.

## Review Checks

- A doctrine/behavior change without a plugin.json version bump is **hard**.
- A script or test importing a non-builtin package is **hard**. Any non-builtin import
  anywhere stays a hard finding, no exceptions.
- An error path that doesn't name its remedy command, or a new exit code not documented in
  the script's header, is **hard**.
- A `§ Section Name` citation that doesn't match a `## ` heading in the cited doctrine file
  byte-for-byte (prefix match tolerates parentheticals) is **hard** — `shared-for` filtering
  silently drops mismatches (`citations-check.js` is the deterministic sweep).
- A new test whose asserts lack consequence-of-failure messages is soft; a weakened existing
  assertion is **hard**.
- Duplication calibration: three or more near-identical blocks in one diff is a finding
  naming the extraction — batch-scoped workers never see the third repetition; the reviewer
  is the first eye that can.

## Gotchas (evidence-cited)

<!-- One line per entry: a provenance tag — [host] (this repo/stack) or [plugin] (traces to a
spec-plugin template/command/generated artifact) — the rule with its mechanism, and one owner
citation (spec path, AC-ID, D-number, ADR, run id). Never dates, people, hosts, versions, or
prior behavior (/spec:doctor check 16 scans this layer). Writers: /spec:review close and
/spec:escape only. /spec:doctor prunes dead citations and rolls [plugin] entries up as an
upstream bug list. -->
- `[plugin]` A conformance guard that classifies what to inspect by **file name or extension**
  is evadable by the exact thing it guards — classify by **location** (the directory walk) and
  admit everything inside it; any name-shape filter is a new hole, never a legitimate
  narrowing. A break attempt confined to the guard's own fixture envelope confirms nothing
  about coverage outside it. (specs/20260820/04-entrypoint-conformance.md)
- `[plugin]` `red-check.js` derives carried-AC expectation from **AC-ID occurrence anywhere in
  the file**, comments included. An edit-only File Plan row that mentions another AC's new
  behavioral home in a comment forces a false red expectation onto a file whose only change is
  a deletion, and the build stops at `unsanctioned-green`. Name the file, not the ID — the
  removal fix, never an invented ID. (specs/20260822/02-init-generation-script.md)
- `[host]` A spec Decision naming a literal version-bump target can be stale by build time —
  concurrent sessions in this repo race the same semver. The build bumps to the next free
  version and records the deviation; the spec's literal number is a target, not a pin.
  (specs/20260810/02-terminal-observable-acs.md D11; specs/20260901/08-corpus-derivation-and-kill-match.md D10)
- `[host]` A locked Decision that retires or narrows a literal glyph, phrase, or claim from
  doctrine prose can leave a live assertion of the retired form **outside** the spec's File
  Plan — in test files (dense regex pins) or the doctrine corpus itself (paraphrased or
  hard-wrapped restatement, so neither the literal nor the full phrase ever matches).
  `collision-closure` at plan lock lists both the paths and literals legs (advisory, never
  blocking — every hit enters the File Plan as fix or recorded waive); spec 03 D10's blocking
  whole-suite check at build Phase 4 catches the behavioral variant a naming closure cannot
  reach. A colliding test pin is updated in place and retagged with the new AC-ID, never
  weakened, never left red.
  (specs/20260813/07-command-report-conformance.md D8; specs/20260813/09-model-placement-mechanics.md D4;
  specs/20260814/01-ac-matrix-script.md)
- `[plugin]` `ac-matrix.js` parses AC bullets as `^- \*\*(token)\*\*` and requires the token to
  fully match `AC-\d{8}-\d{2}[a-z]?-\d+`. A build-time amendment written the way the Decisions
  table writes one — a prime-suffixed successor (`AC-…-3′`) plus the superseded original left as
  a struck top-level `- ~~**AC-…-3**~~` bullet — yields TWO `malformed-ac` hard findings. Amend
  an AC by keeping the plain ID and demoting the superseded text to an indented sub-line; prime
  marks are for Decision IDs (unlinted) only. An unparseable bullet counts as uncovered in both
  drift modes, so it cannot be silently dropped from the coverage denominator.
  (specs/20260814/04-lock-signal-window.md; specs/20260815/03-ac-matrix-fail-closed.md)
- `[plugin]` A test worker editing a File Plan row that carries **no AC** still reaches for the
  spec template's AC-ID shape and writes the literal placeholder (`AC-<date>-NN-N`) into the
  test name and assert message. The token is not a valid AC-ID under `ac-matrix.js`'s grammar,
  so it is silently invisible to the coverage matrix rather than caught — a placeholder that
  looks like coverage and is not. The fix is removal, never inventing an ID to fill it.
  (specs/20260815/05-env-preflight.md)
- `[plugin]` `diff_base` is written once at build Phase 0 and is documented as never rewritten,
  but a concurrent session committing between that capture and the build's own commit makes the
  recorded sha a stale pre-image — review then diffs the sibling's unrelated commit into this
  spec's panel. The build corrects `diff_base` to the true pre-image at close and records the
  departure; review inherits the corrected value with no special handling. Same class, second
  trigger: a spec **planned with a moving ref** as its `build_base` in a chained sibling series
  whose earlier sibling has already landed on the branch — `red-check.js` refuses with
  `pre-image is not pure` naming the sibling's files. Correct the base at build Phase 0 to the
  sibling's review-close commit (the true pre-image) and record the departure;
  `merge-back.sh branch-for` derives the merge target independently, so merge-back is
  unaffected. (specs/20260816/03-file-plan-table-scoped-parsing.md; specs/20260901/02-run-provenance.md D10)
- `[plugin]` **`orchestrator-compensation-during-live-worker`** (class stands at 1; grep this
  slug to count recurrences). The harness fired completion notifications for `/spec:build`
  workers still executing; the orchestrator read those as returns-with-no-work and began
  writing the same files itself, making the concurrency real in a tree build deliberately does
  not isolate. The fix target is liveness/serialization (never write into a possibly-live
  worker's file set on a notification alone), not worker prompting. Reopen/recurrence condition
  (grep-answerable): any agent memory or worker return attributing observed work to "a
  concurrent process" / "already implemented" WITHOUT naming the commit or worker that landed
  it. A guard candidate is pre-registered and deliberately unbuilt — Generality and Materiality
  are unfillable at count 1 (core § Incident Policy). (specs/20260821/02-replay-review-phase.md)
- `[plugin]` The lock-time **collision-closure literals leg sweeps the literals a spec
  INHERITS, not the ones it RETIRES** — so the exact class the retired-literal entry above
  exists to catch walks straight past it. A spec retiring an export name has that name asserted
  somewhere outside its File Plan, and the leg never looks for it because the name is not in
  the spec's inherited literal set. Until the leg sweeps retired names too, read every Decision
  that removes or renames a public symbol and grep that symbol across `tests/` by hand at lock.
  (specs/20260820/08-config-name-ban.md D14)
- `[plugin]` A script that derives two or more manifest leg exits by testing a finding's
  `class` against per-leg `Set`s of class names silently couples them the moment one class can
  be emitted from more than one code path: a single emission reddens BOTH legs, and the
  innocent leg reports `exit:1` having observed nothing. Partition by emission SITE — at each
  push site add the finding OBJECT (by reference) to a small per-leg `Set` and OR that
  membership into the exit derivation — never by widening class-set membership, and never by a
  provenance key on the finding itself (the emitted key set is AC-pinned and `--json` consumers
  must see zero delta). (specs/20260823/03-silent-drop-hardening.md D9)
- `[plugin]` A spec that **ADDS a member to an exhaustive live-file pin** (a test asserting the
  complete set of hooks.json script paths, spec-paths keys, or entrypoints rows) invalidates
  that pin by construction, and the row lands out-of-File-Plan at review. This is caught at
  build (spec 20260814/03 D10's whole-suite check) and costs one review waive line; a lock-time
  guard for it was measured and rejected — do not re-propose one (specs/20260814/05-collision-closure.md
  D6/D12's "advisory, never blocks" stands; a `likely` hit at lock owes no waive line). The pin
  set includes `tests/consistency/red-fixture-coverage.test.js`'s `HOOK_HANDLERS` guard, which
  fails closed on an unfixtured hook script rather than skipping it — a new hook arm owes a
  handler proving the hook ENGAGES on its own contract, which for a never-blocking hook is an
  observable side effect plus a discriminating non-triggering control, never a block assertion.
  (specs/20260823/08-derived-session-queue.md D8; specs/20260901/02-run-provenance.md D11/D12)
- `[plugin]` `console.log(...)` immediately followed by `process.exit(0)` **silently truncates
  at the 64 KiB pipe buffer while still exiting 0** — Node's stdout write to a pipe is async,
  and `process.exit` tears the process down mid-flush. Latent for as long as nothing consumes
  the output programmatically; the first `--json` consumer surfaces it as unparseable output,
  not as a crash. Any script that prints a payload and exits routes through a synchronous
  writer (`fs.writeSync` on fd 1, looped for partial writes, retried on EAGAIN).
  (specs/20260823/08-derived-session-queue.md repair round)
- `[plugin]` **`synthetic-repro-presented-as-real`** (class stands at 1; grep this slug to
  count recurrences). A review repro that exercises a SYNTHETIC stand-in rather than the real
  entrypoint, whose measured numbers are then transcribed into permanent code or test comments
  as if the real code path was observed failing. A review finding may still be true on
  contract reading alone — but the comment it leaves behind must cite the basis it actually
  has. Reopen/recurrence condition (grep-answerable): any code or test comment citing a repro's
  numbers where the repro did not invoke the real entrypoint under the conditions the finding
  claims. A guard is deliberately unbuilt — Generality and Materiality are unfillable at count 1
  (core § Incident Policy). (specs/20260823/08-derived-session-queue.md review)
- `[plugin]` `tests/helpers.js`'s `runNode` is `spawnSync`, which blocks the parent Node event
  loop for the child's whole lifetime — so a test that stands up an **in-process**
  `http.createServer` stub and then `runNode`s the script under test against it can never
  service the child's request: it hangs to the spawn timeout (ETIMEDOUT) instead of returning
  the stubbed response. Any exec-a-script test whose subject makes a network call to a fixture
  living in the same process needs a file-local `async child_process.spawn` runner (still the
  real script, still real argv — a harness-level swap, not a weakening of the test);
  alternatively bind the server, read its port, and close it *before* the run when the case
  only needs an unreachable port. (specs/20260825/03-genesis-currency-executed.md)
- `[host]` A spec that retires a command name must keep that name out of its own **Canonical
  Delta** prose too. `docs/canonical/` is live surface the repo-wide retired-name sweep walks,
  and the sweep's `waivedPrefixes` deliberately cover only `specs/`, `docs/roadmap/`,
  `docs/audit/`, `docs/adr/` — so applying a Delta paragraph that narrates the retirement
  byte-for-byte reddens the spec's own sweep at the close commit, after the last green run.
  Land the same substance with the retired name elided ("the command is deleted, its hook arm
  removed"): the Delta is a contract on content, not on bytes. Do **not** take the
  obvious-looking fix of adding `docs/canonical/` to `waivedPrefixes` — that blinds a live
  reference surface to every future regression of the name, permanently, to save one reworded
  sentence. (specs/20260827/03-genesis-design-state.md)
