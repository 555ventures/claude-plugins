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
  invariants with incident headers — weakening one is a doctrine change, not a fix);
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
- Every script starts with a header comment: usage line, why it exists (dated incident),
  what it deliberately does NOT do, and an explicit `Exit codes:` list.
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
- Tests reference incident ids / dated escapes in a header comment. Pipeline-authored tests
  for new specs reference AC-IDs in the test name (`AC-{YYYYMMDD-NN}-1`).
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

- `[plugin]` A conformance guard that decides what to inspect by **file name or extension** is
  evadable by the exact thing it guards: the entry-point guard's inventory allowlisted
  `''`/`.js`/`.mjs`/`.cjs`/`.sh`, so `spec/scripts/orphan-helper.py` with zero callers left the full
  437-test suite green. Classify by **location** (the directory walk) and admit everything inside it;
  any name-shape filter is a new hole, never a legitimate narrowing. Corollary for the reviewer: a
  break attempt aimed at a path the guard's own fixtures already cover confirms nothing — the three
  attempts that "passed" this guard were all inside its fixture envelope, and two independent
  evasions sat just outside it. (specs/20260820/04-entrypoint-conformance.md — found at review,
  fixed in the same session; executed repro in the deviations record.)
- `[plugin]` `red-check.js` derives carried-AC expectation from **AC-ID occurrence anywhere in the file**, comments included. An edit-only File Plan row that mentions another AC's new behavioral home in a comment (`// ... AC-20260822-02-3 now lives in ...`) forces a false red expectation onto a file whose only change is a deletion, and the build stops at `unsanctioned-green`. Name the file, not the ID — the removal fix, never an invented ID. (specs/20260822/02-init-generation-script.md — tests/run-ledger.test.js during build.)
<!-- One line per entry; every entry cites a ledger row (spec path + runId) or a dated
incident, and carries a provenance tag: [host] (this repo/stack) or [plugin] (traces to a
spec-plugin template/command/generated artifact). Writers: /spec:review close and
/spec:escape only. /spec:doctor prunes dead citations and rolls [plugin] entries up as an
upstream bug list. Entries are capped at 15, enforced by prose-cap.js at review close and in
this repo's suite; appending at cap requires an eviction (delete / merge / mechanize). -->
- `[host]` A spec Decision naming a literal version-bump target can be stale by build time —
  concurrent sessions in this repo race the same semver (specs/20260810/02 D11: 6.50.0 was
  already taken at HEAD before the batch ran; the worker bumped to 6.51.0 with the same
  changelog paragraph and logged the deviation). The build bumps to the next free version and
  records the deviation; the spec's literal number is a target, not a pin.
- `[host]` A locked Decision that retires or narrows a literal glyph, phrase, or claim from
  doctrine prose can leave a live assertion of the retired form **outside** the spec's File
  Plan, on two surfaces: test files (doctrine shape here is pinned by dense regex asserts, so
  the retired literal is asserted somewhere the File Plan never looked) and the doctrine corpus
  itself (the same claim restated in another command/doctrine file — often paraphrased, often
  hard-wrapped mid-phrase, so neither the literal nor the full phrase ever matches). Two
  mechanisms now catch it: `collision-closure` at plan lock lists both the paths and literals
  legs (advisory, never blocking — every hit enters the File Plan as fix or recorded waive);
  spec 03 D10's blocking whole-suite check at build Phase 4 catches the behavioral variant a
  naming closure cannot reach. Mid-build a colliding test pin is updated in place and retagged
  with the new AC-ID (never weakened, never left red).
  (specs/20260813/07-command-report-conformance.md D8 — the 🔍→📦 retirement broke
  `tests/review/smell-lens.test.js` AC-20260812-01-6 during build, the second such collision in
  one spec; specs/20260813/09-model-placement-mechanics.md D4 — the "uncorrelated model"
  narrowing enumerated both shared.md loci but missed the paraphrased restatement at
  spec/commands/review.md:14, caught at review time by corpus stem-grep; specs/20260814/01-ac-matrix-script.md
  — the `spec-paths` key-set collision landed out-of-plan and had to be waived at review, the
  third recurrence and this spec's own trigger.)
- `[plugin]` `ac-matrix.js` parses AC bullets as `^- \*\*(token)\*\*` and requires the token to
  fully match `AC-\d{8}-\d{2}[a-z]?-\d+`. A build-time amendment written the way the Decisions
  table writes one — a prime-suffixed successor (`AC-…-3′`) plus the superseded original left as
  a struck top-level `- ~~**AC-…-3**~~` bullet — yields TWO `malformed-ac` hard findings. Amend
  an AC by keeping the plain ID and demoting the superseded text to an indented sub-line; prime
  marks are for Decision IDs (unlinted) only. (specs/20260814/04-lock-signal-window.md — review
  2026-08-15 caught it on the spec's own load-bearing ordering pin. The second half of that
  incident — a malformed bullet silently dropped from the coverage denominator, so the amended
  AC's test could be deleted and review still report full coverage — was closed by
  specs/20260815/03: unparseable now counts as uncovered in both drift modes.)
- `[plugin]` A test worker editing a File Plan row that carries **no AC** still reaches for the
  spec template's AC-ID shape and writes the literal placeholder (`AC-<date>-NN-N`) into the test
  name and assert message. The token is not a valid AC-ID under `ac-matrix.js`'s grammar, so it
  is silently invisible to the coverage matrix rather than caught — a placeholder that looks like
  coverage and is not. Collision-sweep rows (an exhaustive key-set pin updated in place) are the
  usual carrier, since they are edit-only by construction. The fix is removal, never inventing an
  ID to fill it. (specs/20260815/05-env-preflight.md build 2026-08-16 —
  `tests/terminal-observable-acs.test.js`, caught by the orchestrator, logged in that spec's
  deviations sidecar.)
- `[plugin]` `diff_base` is written once at build Phase 0 and is documented as never rewritten,
  but a concurrent session committing between that capture and the build's own commit makes the
  recorded sha a stale pre-image — review then diffs the sibling's unrelated commit into this
  spec's panel. The build corrects `diff_base` to the true pre-image at close and records the
  departure; review inherits the corrected value with no special handling.
  (specs/20260816/03-file-plan-table-scoped-parsing.md — `c467bc3` corrected to `f85d07a` at
  build close 2026-08-17.)
- `[plugin]` **`orchestrator-compensation-during-live-worker`** (class stands at 1; grep this slug
  to count recurrences). The harness fired completion notifications for two `/spec:build` workers
  while they were still executing; the orchestrator read those as returns-with-no-work and began
  writing the same files itself, making the concurrency real in a tree build deliberately does not
  isolate. The workers' "a concurrent process already landed this" observations were CORRECT with
  WRONG attribution, and the orchestrator's own first account ("there was no concurrent process")
  was wrong — it WAS the concurrent process. The fix target is liveness/serialization (never write
  into a possibly-live worker's file set on a notification alone), not worker prompting; it is
  plausibly a harness defect to report upstream rather than a pipeline defect. Reopen/recurrence
  condition (grep-answerable): any agent memory or worker return attributing observed work to "a
  concurrent process" / "already implemented" WITHOUT naming the commit or worker that landed it.
  A guard candidate is pre-registered and deliberately unbuilt — Generality and Materiality are
  unfillable at count 1 (core § Incident Policy). (specs/20260821/02-replay-review-phase.md build
  2026-08-21 — two agent memories written from a half-applied orchestrator patch, one deleted as
  false-and-harmful, one corrected in place.)
- `[plugin]` The lock-time **collision-closure literals leg sweeps the literals a spec INHERITS,
  not the ones it RETIRES** — so the exact class the retired-literal entry above exists to catch
  walks straight past it. A spec retiring an export name has that name asserted somewhere outside
  its File Plan (a test pinning the old symbol), and the leg never looks for it because the name is
  not in the spec's inherited literal set. Until the leg sweeps retired names too, read every
  Decision that removes or renames a public symbol and grep that symbol across `tests/` by hand at
  lock. (specs/20260820/08-config-name-ban.md D14, build 2026-08-20 —
  `tests/fleet-reader/review-fixes.test.js` pinned `configPathFor` at both the source and export
  boundary while D7/D8 retired it; the leg had swept `d10-predicate-v1`, `DISPLAY_JOIN_EXEMPT`, and
  `display-join` instead. Updated in place and retagged to AC-20260820-08-8, never weakened.)
- `[plugin]` A script that derives two or more manifest leg exits by testing a finding's `class`
  against per-leg `Set`s of class names silently couples them the moment one class can be emitted
  from more than one code path: a single emission reddens BOTH legs, and the innocent leg reports
  `exit:1` having observed nothing. Partition by emission SITE — at each push site add the finding
  OBJECT (by reference) to a small per-leg `Set` and OR that membership into the exit derivation —
  never by widening class-set membership, and never by a provenance key on the finding itself (the
  emitted key set is AC-pinned and `--json` consumers must see zero delta). (specs/20260823/03-silent-drop-hardening.md
  D9, build 2026-08-23 — `rejected-trailing-tag` added to both `ACM_FINDING_CLASSES` and
  `SKIP_FINDING_CLASSES` wrote `{"leg":"skip-reconcile","exit":1,"observed":{"skipped":0,"sanctioned":0}}`
  for a spec with zero skip lines; executed repro in that spec's deviations record.)
