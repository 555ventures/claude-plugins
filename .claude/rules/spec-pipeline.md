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
  alphabet (3 = conflicts, 4 = CWD-inside-worktree refusal) is load-bearing for the review stage.
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
- Version bump discipline: every change under a plugin directory bumps that plugin's
  `.claude-plugin/plugin.json` semver via
  `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"` (derives the
  next minor, rotates the changelog to three entries). A spec's plugin.json File Plan row cites
  that command; Decisions name no version literal and no sibling claims —
  `node scripts/plugin-bump.js --check` in the gate is the oracle.
- **Every control the least-technical actor can press is specified three ways before lock**: the
  sentence they see on SUCCESS, the PATH BACK, and the farthest ARTIFACT the click reaches. A
  click with no path back that reaches a dated or contractual artifact is a plan defect, not a
  follow-up — and a control whose only success signal is the control disabling has no sentence,
  so say so deliberately or give it one. The surface the control lives on is asserted, never
  assumed: name the file that renders it and the caller that posts it, because a Decision can
  name note rows, a withdraw control or a list the product has never had, and no leg can see the
  absence — `promise-sweep` counts a Decision carried by AC-ID, so an AC asserting the route
  alone reports the whole Decision delivered.
  (specs/20260910/05-what-the-journey-does-not-do.md D3)

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
- Nothing here is exempt from TDD. The only sanctioned skip is an `[env: CHROME_BIN]`-tagged
  pin whose `t.skip` reason names `CHROME_BIN` — the pin carries its own owner citation in the
  test header, and this rule never enumerates the files (specs/20260905/06 D6; specs/20260909/03
  D9). Provision: set `CHROME_BIN` to a Chrome/Chromium binary, or install Google Chrome /
  `chromium` on PATH. No other skip is sanctioned.
- **Gates are plainly green** (v7): `npm test` exits 0 on untouched code; there is no
  sanctioned-failing baseline and no standing red pins. A red suite is a regression or an
  unfinished change, never a TODO.
- Scoped runs: `node --test 'tests/<scope>/*.test.js'` — the glob form; `node --test <dir>`
  does not run files on Node 26. Paths are repo-root-relative.

## Review Checks

- A doctrine/behavior change without a plugin.json version bump is **hard** — pinned
  mechanically by `scripts/plugin-bump.js --check` (gate, via `tests/consistency/plugin-bump.test.js`)
  against the merge base; the reviewer keeps only the residue a branch-level check cannot see
  (a second behavior change on a branch that already bumped once).
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
prior behavior (/spec:doctor check 16 scans this layer). Writers: the review stage close and
/spec:escape only. /spec:doctor prunes dead citations and rolls [plugin] entries up as an
upstream bug list. -->
- `[plugin]` A conformance guard that classifies what to inspect by **file name or extension**
  is evadable by the exact thing it guards — classify by **location** (the directory walk) and
  admit everything inside it; any name-shape filter is a new hole, never a legitimate
  narrowing. A break attempt confined to the guard's own fixture envelope confirms nothing
  about coverage outside it.
  Second and third triggers, both hand-rolled readers over a text format that never normalized
  the text first, and both shipped in one build. (i) A refusal spelled as one QUOTE FORM — an
  inline-`style=` sweep written `/\sstyle\s*=\s*"[^"]*"/` — is evaded by retyping one quote
  character, which is the exact thing the rule forbids; the AC's worked example is an example,
  never a narrowing of its Decision. (ii) A count DERIVED FROM A FILE that does not strip
  comments first reads that file's own prose as data: `wire.css`'s header comment made a cap
  computed from its class names read 29 instead of 23, silently widening the very limit the
  Decision existed to impose, and the same blindness recurred in the test's independent helper
  and again in the shared attribute reader written to fix (i). Normalize before you parse —
  strip comments, admit every quote form — and reuse the module that already does it rather
  than growing a second reader; anchor an attribute name on whitespace, never `\b`, which
  treats `-` as a boundary and so matches `data-style=` too.
  Fourth trigger, the same evadability from a code-structure mechanism rather than a naming or
  parsing one: a new branch inserted ABOVE an existing invariant guard in an if/else dispatch
  bypasses that guard entirely for every input that now reaches the new branch first — the
  guard's own tests still pass, because they still exercise the one path that still reaches it,
  so no leg sees the caller that no longer does. Restructure so the existing guard's own check
  runs first and the new branch's work happens as ADDITIONAL work on the same call, never a
  second, competing write ahead of it.
  Fifth trigger, the same reader blindness twice in one review, each fix reproducing the hole one
  token deeper: a pin extracting a script's emitted document-level CSS read only the FIRST
  single-quoted literal of `x.textContent = '…'`, so a second literal concatenated onto that
  assignment was invisible; the fix widened it to every quote form but bounded the capture with
  `[^\n;]+`, which stops at the first newline — and the offending source wrapped its `+` onto the
  next line, so the widened pin passed on the very defect it was written to catch. Point a
  widened reader at the pre-fix source and watch it go RED before believing the widening: a
  guard that only works because the fix happened to collapse the expression onto one line is
  still the original hole. A `+`-chain across newlines and comments cannot be bounded by any
  single regex without effectively parsing it, so the terminal fix is a token scanner that walks
  segments, skipping comments and admitting every quote form — and it states in its own comment
  which shapes (a literal reached through a variable, a non-`+` expression) it still cannot see.
  (specs/20260820/04-entrypoint-conformance.md;
  specs/20260912/09-a-mock-may-not-invent.md D3/D5;
  specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D1;
  specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md AC-20260913-02-14)
- `[plugin]` `red-check.js` derives carried-AC expectation from **AC-ID occurrence anywhere in
  the file**, comments included. An edit-only File Plan row that mentions another AC's new
  behavioral home in a comment forces a false red expectation onto a file whose only change is
  a deletion, and the build stops at `unsanctioned-green`. Name the file, not the ID — the
  removal fix, never an invented ID. Second trigger, in the test NAME rather than a comment: a
  fixture-CURRENCY retag, where a spec renames a state or enum value that the subject under test
  merely echoes back. Tagging that retag with the new AC promises a red the pre-image cannot
  produce — the refusal names whatever the fixture stamps, so the assertion passes before any code
  changes. Same removal fix: restore the file's original AC tags and keep the fixture edit. Check
  the AC's coverage survives first — `ac-matrix.js` greps the AC-ID across the union of the File
  Plan's tests rows, so the ID need only occur in one genuinely red sibling, not in every file the
  AC's `→` pointer names. Third trigger, the comment-line case again and at scale: a spec whose
  File Plan carries a dozen currency-only test rows draws an AC-ID into each one's explanatory
  comment, and every such file reports `unsanctioned-green` at once — the removal fix is the same,
  and the comment keeps naming the spec and the Decision, just not the ID.
  The same step's OTHER refusal is about the `→` pointer's own verb, and both directions bite.
  `rewrites <file> :: <name>` demands that named case be RED and `reuses` demands it GREEN, so an
  AC whose text says SHALL CONTINUE TO but whose pointer says `rewrites` is self-contradictory and
  hard-stops at `gutted-rewrite`; fix the verb at lock, and read every CONTINUE-TO AC's pointer as
  part of lock rather than trusting the text alone. Conversely, an authoring wave that puts an
  AC's genuinely-red assertions in a NEW sibling test while the pointer still names an existing
  green one gets the same `gutted-rewrite` — a failing sibling never satisfies the named case.
  Fold the assertions into the test the pointer names (usually their semantic home anyway) rather
  than renaming tests to match a pattern. Third direction, the AC TEXT rather than the pointer: a
  `SHALL CONTINUE TO` bullet is what SANCTIONS a file green, so an AC saying CONTINUE TO over a
  measurement the pre-image contradicts classifies its own file green-expected and hard-stops at
  `broken-pin` — the opposite refusal, same authoring error. It hides best where the measurement is
  indirect (a computed style, a derived count): the spec's own Decision exists to FIX the thing, and
  the AC still describes the fixed state as a continuation. Fix the verb, never the measurement —
  and where the file must also survive close-time expiry, split the clauses that already hold into
  their own CONTINUE-TO AC on the same file rather than keeping a false one.
  AC OWNERSHIP is the opposite: `expire-tests.js` and the live-repo expiry pin both read an AC's
  owner from DEFINING `## Acceptance Criteria` bullets only, so a spec that merely mentions a
  foreign AC-ID (a `rewrites <file> :: <title>` pointer at a done spec's test) is never its owner.
  Any new ownership reader keeps that definition — an occurrence-anywhere reader reddens the gate
  on every hardened spec that rewrites a done spec's test. Still name a foreign AC in a sidecar by
  spec and number (`spec 02 AC 10`), never by its literal ID, for red-check's sake.
  (specs/20260822/02-init-generation-script.md; specs/20260907/10-client-review.md D15;
  specs/20260912/03-run-isolates-and-owns-the-stages.md;
  specs/20260912/06-the-review-page-answers-to-a-design.md D9a;
  specs/20260914/01-the-mock-contract-and-the-driver.md)
- `[host]` A spec Decision naming a literal version-bump target can be stale by build time —
  concurrent sessions in this repo race the same semver. The build bumps to the next free
  version and records the deviation; the spec's literal number is a target, not a pin. Same class,
  second surface: a Decision naming the literal filename of an ADR it will CREATE races the same
  way — a sibling landing first claims that number, and the build ships the next free one. Take
  the next number, then amend the spec's own Decision, File Plan row and every `Amended by:`
  backlink to it in the same build, or scope-reconcile reports the created path out-of-plan.
  Third surface, same class: a Decision naming the literal ORDINAL of a numbered list item it
  will ADD — "`/spec:doctor` check 19" — races identically, because a sibling spec adding its own
  check claims that ordinal first. Take the next free ordinal and amend every mention of the
  number across the spec (Decisions, File Plan Summary, Behavior, ACs, Canonical Delta) in the
  same build; grep case-insensitively, since the File Plan spells it `Check NN` and the prose
  spells it `check NN`.
  Fourth surface, the one that is a File Plan gap rather than a race: a spec whose Decisions edit
  a file under a SECOND plugin directory owes that plugin its own bump, and `plugin-bump.js
  --check` reads the MERGE BASE — so while the second plugin's edit is still uncommitted the
  check is green, and the gap reddens only at the review gate, after the checkpoint commit and
  after the last green build run. At lock, list the plugin directories every File Plan row falls
  under and give each one a plugin.json row. Note also that `--bump` refuses a manifest whose
  description carries no `Changelog (last 3):` run; a plugin that has never had one is bumped by
  hand, seeding the run in the same edit so the next bump can use the script.
  (specs/20260810/02-terminal-observable-acs.md D11; specs/20260901/08-corpus-derivation-and-kill-match.md D10;
  specs/20260907/08-walk-critic.md D11; specs/20260909/08-next-carries-the-lanes.md D6;
  specs/20260912/03-run-isolates-and-owns-the-stages.md D17;
  specs/20260912/06-the-review-page-answers-to-a-design.md D7)
- `[host]` A locked Decision that retires or narrows a literal glyph, phrase, or claim from
  doctrine prose can leave a live assertion of the retired form **outside** the spec's File
  Plan — in test files (dense regex pins) or the doctrine corpus itself (paraphrased or
  hard-wrapped restatement, so neither the literal nor the full phrase ever matches).
  `collision-closure` at plan lock lists both the paths and literals legs (advisory, never
  blocking — every hit enters the File Plan as fix or recorded waive); spec 03 D10's blocking
  whole-suite check at build Phase 4 catches the behavioral variant a naming closure cannot
  reach. A colliding test pin is updated in place and retagged with the new AC-ID, never
  weakened, never left red. Third and widest trigger: the collision need not involve a *retired*
  literal at all — **adding** an attribute, a query token, or a config flag breaks any pin that
  spelled the old shape exactly. One spec broke four in one build: a new `id` on a section's
  `<h2>` (two dense `/<h2>j1/` pins), a new `screen=**` request token (a `screen=*` pin), and a
  new `--test-concurrency` flag (a literal `gateCommand` pin plus a `package.json` `scripts.test`
  byte-equality pin). Grep the literal you are about to change across `tests/` before the build
  starts, not after the gate reds; each hit enters the File Plan. Fourth trigger, the one a
  literal grep cannot reach: a **predecessor spec's CONTINUE-TO pin**. A staged pair where the
  first spec adds a replacement and deliberately leaves the old surface working writes a test
  asserting the old surface keeps working — so the spec that retires that surface inherits a
  live assertion whose whole subject it deletes, and no literal it retires appears in the pin's
  own File Plan. Read every predecessor named in `depends_on` for CONTINUE-TO pins on the
  surface being retired, and enter each one as a deletion row; a pin whose subject is gone is
  retired, never weakened into passing.
  Fifth trigger, the one that changes no words at all: a **line REFLOW**. A doctrine file under
  a read-load budget has no slack, so landing new prose forces condensing old prose, and the
  rewrap can push a multi-word literal across a line break — the text is byte-identical as
  prose and invisible in review, but a check that greps for that literal as one string stops
  matching. One squeeze here broke the entrypoints manifest by splitting `spec-paths
  worktree-include` over two lines: the declared entry point read as an overclaim with no call
  site, in a file whose diff showed only reflow. Before reflowing a passage, grep the literals
  inside it — and note that the phrases at risk are the ones a test greps whole, not the ones
  the spec names. A budget-capped file is also where this recurs, because every future addition
  forces another squeeze.
  Sixth trigger, the one where the diff changes no literal a test spells: a Decision that
  NARROWS THE MEANING of an existing enum value. Shared fixtures keep spelling the old value,
  which is still valid syntax, so no grep for a retired name finds them — and every
  out-of-batch consumer silently takes the new branch. One such narrowing (a severity level
  moved from blocking to advisory) stranded three shared review fixtures and reddened 25 tests
  across eight files, none in the File Plan. At lock, grep the VALUES a Decision re-scopes
  across `tests/`, not only the names it retires. Recurred as a changed DEFAULT rather than a
  narrowed meaning, which adds two hiding places worth greping separately: a SECOND pin of the
  old default inside a file the authoring wave already edited (the wave rewrote the pointer's
  named occurrence and never looked for siblings), and a byte-equality RECONSTRUCTION test that
  re-invokes the underlying script to rebuild the expected row — such a test never spells the
  value at all, it inherits the script's own untouched default, so it reddens with a diff that
  looks like the new code hand-assembled its output. Fix it by threading the observed row's own
  field into the re-invocation, never by hardcoding the new default, or the test stops proving
  anything about what the caller actually passed.
  Seventh trigger, the one no literal or value grep reaches at all: a Decision that ADDS A
  REFUSAL where the old behavior was permissive. Shared test setups that legally did nothing now
  trip it — one new empty-fix refusal reddened 13 tests across five files, none in the File Plan,
  and no name, value, or phrase changed anywhere. The only grep that finds them is for the CALL
  the refusal now guards: before landing a refusal, grep every call site of the guarded command
  across `tests/` and enter each stale setup as a fix row. Recurred with a new SIDE EFFECT rather
  than a new refusal, which widens the rule: a Decision that makes an existing step WRITE
  something (close-time test expiry now DELETES files before the close commit) strands every
  shared setup that rehearses that step, because an EXISTING refusal downstream — here the
  dirty-tree check at `--mark closed` — now fires on the new artifact first, and every assertion
  reads as a wrong-refusal-message failure rather than as anything to do with the new code. 23
  tests across six files, none in the File Plan. Grep for the call the DOWNSTREAM refusal guards,
  not only the one the Decision changes; and fix such setups by making them do what a real
  session does at that step (stage the deletion into the close commit), never by neutering the
  fixture so the new side effect cannot reach it — an untagged fixture would have left the
  fixture's own AC uncovered and reddened `ac-matrix` instead. The same side effect has a
  PLAN-TIME inverse that has now bitten twice on the same file: a File Plan row spelled MODIFY
  against a test file a previous close's expiry sweep already deleted, so the authoring wave finds
  nothing to modify. Recreate it fresh carrying only this spec's own pins — never restore the
  expired ones — and record the row's action as a deviation; at lock, stat every MODIFY row's path
  rather than assuming a file named in an older spec still exists. Recurred as a new non-zero
  EXIT on a path that used to exit 0: a lock-time inventory that read only the pins asserting a
  command's OUTPUT rows missed four that asserted its process STATUS (`r.status === 0`) or the
  plain word the new exit retires — grep a command's status and verdict-word assertions across
  `tests/`, not only its output shape (specs/20260913/08-silence-is-not-a-pass.md A2).
  Eighth trigger, the one where the grep itself was accurate and still missed: a lock-time
  assumption that grepped every caller matching a pattern and named the count (**seven** files
  calling `journey-drawn`/`journey-approved` over an inline mock, minus fixture users) is a
  prediction, not an inventory — an eighth caller matching the same pattern surfaced only once
  the new gate actually ran against it, mid-build. The count held at build time only because the
  assumption had named its own remedy at lock ("if false: add the attribute to that test's inline
  mock in the same batch; never weaken the gate"), so the miss cost one more fixture repair
  instead of a scope fight. Price a caller-count assumption as a prediction and write its remedy
  at lock, not just its confidence.
  Ninth trigger, the one that is not a grep failure at all: a lock-time closure that NAMES A
  SIBLING SPEC'S File Plan row as the remedy. One spec closed its own refusal collision with
  "covered by spec 04's fixture row (the series lands in order)"; that row was about theme
  composition, wrote none of the state the new refusal reads, and its spec was still `hardened`
  when this one built — so the collision arrived undefended and reddened 16 tests across eight
  files. A deferral to a sibling is only real when the sibling's row is read and shown to write
  the exact state the refusal checks; otherwise price it as unclosed and enter the fix rows here.
  Tenth trigger, the one where the collision is INSIDE one spec: a `zero occurrences of <literal>`
  retirement sweep is a bare substring by default, so it also bans every name that merely starts the
  same way — including a class the SAME spec's other Decision adds (`.rv-scope` banned,
  `.rv-scopeband` required). Two Decisions can be self-contradictory at lock and no leg sees it,
  because each is individually satisfiable. Fix the AC's boundary (`/\.rv-scope(?![\w-])/`), never
  the code: the wave's first instinct — selecting the element by `[class="exact-value"]` so the
  banned substring never appears — was rejected, since an exact-attribute selector breaks the moment
  the element gains a second class and makes a grep pin's spelling a live rendering constraint. At
  lock, run every ban literal's real regex against the spec's OWN new names, not just the pre-image.
  Eleventh trigger, the staged-pair shape the entrypoints manifest cannot hold: a spec that deletes
  the last doctrine or command CALLER of a script — while a later sibling owns deleting the script —
  leaves that script with zero entry points. `entrypoints.test.js` has no sanctioned orphan form, so
  the build cannot go green, and every repair either fabricates a caller or weakens the guard. The
  same removal also strands the in-plan doctrine files' old manifest rows and each predecessor
  CONTINUE-TO pin naming them. At lock, for every caller a Decision removes, check the script keeps
  another live caller in `spec/entrypoints.json`; if none, move the script's deletion (and every
  script only it calls) into the same spec.
  (specs/20260813/07-command-report-conformance.md D8; specs/20260813/09-model-placement-mechanics.md D4;
  specs/20260814/01-ac-matrix-script.md; specs/20260907/09-atlas-index-and-note-navigation.md;
  specs/20260907/07-mocks-retires-theme.md D12; specs/20260907/08-walk-critic.md D2/D6;
  specs/20260909/04-review-soft-floor.md D1/D5/D8;
  specs/20260909/05-fix-delta-reviewer-pass.md D2/D9;
  specs/20260910/02-click-to-advance-and-real-records.md A2;
  specs/20260912/02-an-answer-is-the-clients-until-sign-off.md;
  specs/20260912/03-run-isolates-and-owns-the-stages.md D10;
  specs/20260912/14-the-design-stage-prints-the-work-not-the-inventory.md D6;
  specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md D14)
- `[plugin]` `ac-matrix.js` parses AC bullets as `^- \*\*(token)\*\*` and requires the token to
  fully match `AC-\d{8}-\d{2}[a-z]?-\d+`. A build-time amendment written the way the Decisions
  table writes one — a prime-suffixed successor (`AC-…-3′`) plus the superseded original left as
  a struck top-level `- ~~**AC-…-3**~~` bullet — yields TWO `malformed-ac` hard findings. Amend
  an AC by keeping the plain ID and demoting the superseded text to an indented sub-line; prime
  marks are for Decision IDs (unlinted) only. An unparseable bullet counts as uncovered in both
  drift modes, so it cannot be silently dropped from the coverage denominator.
  The inverse failure is the one no leg can see: an AC that PARSES, is mapped, and goes green
  while covering only PART of the Decision it carries. `promise-sweep` counts a Decision carried
  by ID, never by clause, so a D-row promising a route AND the control that calls it is "carried"
  by an AC asserting the route alone — and the unbuilt half reaches review as a reviewer finding
  or not at all. Worse, the spec's own Contracts block and AC examples are what a worker follows
  when they contradict the Decision two lines above: one spec spelled a derived key as the TAG in
  its Contracts row and AC while D1 said the LINE, and the build shipped the collision with a test
  enshrining it, every leg green. At lock, read each multi-clause Decision against its cited ACs
  clause by clause, and diff the Contracts block against the Decision it illustrates — an example
  that contradicts its Decision is a defect in the example, never a licence to change the Decision.
  The cheapest instance of the same class is an AC's own WORKED PARENTHETICAL being arithmetically
  wrong about the fixture two lines above it (`2 open items` where the fixture's own predicate counts
  three, because an addressed item still counts as open). A worker either enshrines the wrong number
  or pins the true one and leaves the spec lying; do the arithmetic on every worked example at lock.
  A Decision written at a REVIEW-STAGE disposition step, rather than at lock, can cite an AC-ID
  that does not exist yet — the same carried-by-ID drift this entry opens with, one pass later:
  `promise-sweep` reports it as `orphan-decision`, not as anything the build's own legs could
  have seen. Write the AC in the same disposition round that writes the Decision, never after.
  (specs/20260814/04-lock-signal-window.md; specs/20260815/03-ac-matrix-fail-closed.md;
  specs/20260910/05-what-the-journey-does-not-do.md D1/D3;
  specs/20260912/06-the-review-page-answers-to-a-design.md AC-2;
  specs/20260912/14-the-design-stage-prints-the-work-not-the-inventory.md AC-9;
  specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D17/AC-22)
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
  unaffected. Third trigger, same class from the other direction: a sibling landing on `main`
  mid-build forces a **rebase** to get `red-check.js`'s pre-image purity check to pass, and the
  rebase silently makes the stamped base name a commit two ancestors back — review then judged
  15 files where the spec had changed 13, and the reconcile leg reported the sibling's two as
  out-of-plan. Correct the base to the rebase target (an exact sha narrows the range rather than
  emptying it) and record it; the leg finding is then a reject on executed evidence, not a waive.
  Fourth trigger, the same class one layer up the stack: a harness that identifies a commit by
  "the newest commit touching this path" is deriving a range the exact way `diff_base` used to,
  and drifts the same way — a later ledger sweep, doc sync, or sibling backlink edit silently
  becomes "the commit" the moment it lands. Write the two commits as refs at the moments the
  writer already holds them and read the refs, never re-derive; a history walk is a legitimate
  one-time backfill for rows that predate the refs, never a standing derivation.
  (specs/20260816/03-file-plan-table-scoped-parsing.md; specs/20260901/02-run-provenance.md D10;
  specs/20260907/09-atlas-index-and-note-navigation.md;
  specs/20260913/01-the-replay-tree-is-the-reviewed-tree.md)
- `[plugin]` **`orchestrator-compensation-during-live-worker`** (grep this
  slug to count recurrences). The harness fired completion notifications for build-stage
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
  Second trigger, the widest one: a spec that REINSTATES a state into a derived state machine
  retires every sibling pin asserting the machine's old shape — "never <STATE>", "<next> derived
  straight off <prev>", the narrowed `--reopen` enumeration, the marks-object key set — and those
  pins live in test files the spec's own File Plan never names, so neither the literals leg nor
  the File-Plan-scoped grep sees them. Fourteen tests across five sibling files reddened this way
  in one build. At lock, for any Decision that changes a state machine's shape, grep the retired
  shape's literals across all of `tests/` and add every hit's file to the File Plan.
  (specs/20260820/08-config-name-ban.md D14; specs/20260910/04-theme-before-the-client-walk.md D12)
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
  Second trap in the same family — shipping a new executable: **no script this repo ships may be
  named `test-*`**. `node --test`'s default discovery matches `**/test-*.js` anywhere under the
  root, so the post-gate's path-less run DISCOVERS AND EXECUTES the tool as a test file, and its
  own argv handling exiting non-zero surfaces as a spurious test failure. The scoped gate cannot
  see it — that run passes explicit paths — so only the whole-suite post-gate catches it, one
  repair round after the name has already spread through `spec-paths`, `entrypoints.json`, every
  call site and every test. This has now bitten twice (`count-tests.js`, which carries the rule
  in its own header; and a spec whose LOCKED Decision named `test-expiry.js`, renamed mid-build
  to `expire-tests.js`). Check a new executable's name against node's full default pattern set —
  `**/*.test.js`, `**/*-test.js`, `**/*_test.js`, `**/test-*.js`, `**/test.js`, `**/test/**` —
  at PLAN time, not at build time: a Decision that locks an illegal filename costs a Decisions
  amendment plus a sweep of every reference to it.
  (specs/20260823/08-derived-session-queue.md repair round;
  specs/20260911/03-tests-expire-at-close.md D4/D8)
- `[plugin]` A client-facing page that changes what it shows **before the server has accepted
  the change** turns every refusal into a silent success: the refused item disappears, its open
  count drops, and a gate counting open items unlocks. Act on the server's answer, never on the
  request — and where a page pre-checks locally to save a round trip, that pre-check must be the
  same predicate the server enforces, never a looser one.
  Second surface, the one no leg can reach: **a client-facing page's defects live in the render, not
  in the assertions.** One spec shipped three of them past a green 1093-test suite — a card wrapped
  in an `<a>` that nested the `+n more` tile's own anchor (invalid HTML; the card visibly shattered,
  but only on a journey with more screens than the rail holds), a composer wired to BOTH a click and
  a submit handler (one click, two POSTs), and every textarea the client types into hidden by
  `:focus-within`, so it vanished on blur with their words in it. Each passed every leg because the
  tests asserted attributes and counts, which were all correct. Three more of the same class survived
  to the reviewer: an `<a>` with no `href`, an "activated" row template that was an empty `<article>`,
  and a status line never rewritten on reopen. Render the page and look at it before marking a
  client-facing build DONE, populate the preview with realistic data (a synthetic fixture whose
  screens are 554 bytes cannot show a thumbnail rail), and restart the server after editing — a
  stale `require` cache served pre-fix markup and nearly banked a false verdict. Where markup and
  stylesheet have different owners, check the seam explicitly: two defects here were a CSS rule and a
  script each believing it owned one element's visibility.
  Related, and invisible at the default width: RAISING a selector's specificity to win one cascade
  fight strands every narrower-breakpoint override of that same selector, which was written to win by
  source order alone. Re-prefix the media-query rules in the same edit, or the defect reappears one
  viewport down where nobody renders.
  Third surface: a class or custom property defined only in the approved design mock's own
  `<style>` block never reaches the shipped stylesheet. Five instances in one spec (`.rv-pin`,
  `.rv-tabpin`, `.nl-card-count`, `.rv-pins`, `.rv-mark-area`) plus a sixth variant one file over:
  `.nl-region-badge{background:var(--c)}` carries no fallback, and `--c` was set only inline by
  the notes layer's own elements — invisible white-on-white the moment a second, server-rendered
  file emits the same class without also setting the variable. All six passed a fully green
  suite. Grep every `class="…"` literal a page emits against the shipped stylesheet before
  marking a class-adding spec done, and grep for the custom property too when a class's rule
  reads one instead of a literal value.
  Fourth surface: a test that asserts through an element the page itself hides (a bar label the
  code sets `display:none` on) passes while testing nothing about what the owner actually sees —
  the assertion named the AC without testing its visible-signal promise. Keep the hidden check as
  internal confirmation the underlying hook fired if useful, but make the load-bearing assertion
  the visible state change (an `aria-pressed` flip, a class toggle) and the visible path back,
  never text a real page never shows.
  Fifth surface: a single sample of async work — one read taken immediately after `navigate`
  returns, before the page's own fetch-and-render has had a chance to run — is a race, not an
  assertion; green on isolated runs and the whole suite, red once under the review stage's own
  scoped gate load. Replace the single sample with a bounded poll without weakening what it
  asserts (no click occurs anywhere in the poll window), rather than accepting the flake or
  loosening the check.
  Sixth surface, two at once past a green suite and both a render seam: a control whose success
  path is `post(...).then(refresh)` where `refresh` re-renders the LIST but never the open CARD the
  click came from (the reply landed, the card kept the stale thread and the typed words), and a
  server-rendered hidden box emitted INSIDE a `display:flex` actions row rather than as the mock's
  next sibling, so unhiding it squeezed the field beside a button. Compare the emitted nesting to
  the binding mock's, and after any post-then-refresh control, look at the surface that posted.
  The first fix then rebuilt the open card on EVERY refresh, wiping a draft typed in another card
  when an unrelated deferred POST landed — scope a rebuild to the note the POST touched.
  (specs/20260910/03-client-journey-player.md; specs/20260911/01-the-page-waits-for-the-server.md;
  specs/20260911/04-the-client-loop.md; specs/20260912/06-the-review-page-answers-to-a-design.md D9;
  specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D3/D4/D10/D11/AC-4/AC-17;
  specs/20260913/05-a-note-is-a-conversation.md D6)
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
