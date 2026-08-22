---
date: 2026-08-21
status: done
diff_base: 0496a4fe968b796d7448104ec84015e426b2f6f4
open_markers: 0
tier: standard           # additive spec-paths key follows 20260819/02 + 20260820/05 precedent; no critical-trigger file gets a behavioral edit; worst failure is a false exit 1 pausing a build
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260820/06-typed-evidence-manifest.md"]
depended_on_by: []
brief: n/a
---

# Mechanized red-check: `[pre-green:]` tags + `red-check.js` at build Phase 1

## Goal

Build's red-check — classify every tests-layer file's expected pre-image colour, execute
it, explain every mismatch — is hand-run from prose every build (build.md Phase 0 step 2 +
Phase 1), and its recurring failure class (acceptance criteria that cannot fail before
implementation) is recorded only in a thrice-amended Gotchas paragraph. This spec
mechanizes the seam: a closed-enum `[pre-green: <reason>]` AC tag declared at plan time, a
new `spec/scripts/red-check.js` executed at build Phase 1 that reconciles observed
per-file colour against the tag-derived expectation with exit codes, and a typed
`preGreen` count in ac-matrix's manifest row so the class rides into every review ledger
row and becomes fleet-countable. Done means: build.md's classification and red-check prose
are an invocation line, an unsanctioned green test file fails the build step naming its
AC-IDs, and the Gotchas paragraph is a one-line pointer at the mechanism.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | AC grammar gains `[pre-green: <reason>]`, reason ∈ closed enum `fallback-rejection` \| `absence-invariant` \| `predicate-in-test` — the three recorded sub-shapes. `lib/spec-sections.js` exports `PRE_GREEN_REASONS` (the single enum authority) and `parseAcBullets` returns `preGreen: <raw trimmed string \| null>` alongside `env`/`oracle`; validation against the enum lives in the consumers, both failing closed (AC-20260821-01-1, AC-20260821-01-2) | Sibling syntax to `[env:]`/`[oracle:]`, parsed by the one AC-grammar authority; an open-ended free-text reason would be unqueryable and invite drift |
| D2 | New `spec/scripts/red-check.js` (contract in Contracts): resolves tests-layer File Plan rows (`lib/file-plan.js` + `lib/glob-match.js`, DELETE rows skipped per ac-matrix D13), greps each file for carried AC-IDs (same literal grep as ac-matrix), derives per-file expectation — green iff the file carries ≥1 AC and EVERY carried AC is sanctioned (`SHALL CONTINUE TO` in the bullet's raw text, or a valid `[pre-green:]` tag), or the file is passed via `--expect-green`; otherwise red — then executes `{testCommand} <file>` once per file (plus `{typecheckCommand} <file>` when declared; red = fails either leg) and reads exit codes only, never runner output. Findings: `unsanctioned-green` (red-expected file passed; names the file and its carried AC-IDs), `broken-pin` (sanctioned-green file failed), `invalid-pre-green` (out-of-enum reason; the file stays red-expected — fail closed) (AC-20260821-01-3, AC-20260821-01-4, AC-20260821-01-5, AC-20260821-01-13) | The reconciliation table is the mechanization target; exit-code-only observation keeps it host-portable; per-file granularity means one observation per verdict (build.md's existing rule) |
| D3 | A file carrying zero AC-IDs is reported `unclassified` (warning) and never executed (AC-20260821-01-14); a non-DELETE tests row path absent from the tree is finding `missing-test-file`, probed by existence BEFORE any execution (AC-20260821-01-6) | Spike A: `node --test <missing-file>` exits 1 — running the runner on a missing path would fake a satisfied red expectation; zero-AC files (helpers, fixtures) are legitimately un-colourable, and their coverage enforcement is ac-matrix's job at review |
| D4 | Pre-image purity refusal: exit 2, naming the offending paths, when any non-tests File Plan path already differs from `--base` — derived as the union of `git diff --name-only <base>` (tracked edits) and untracked paths from `git status --porcelain --untracked-files=all` (spike B: plain diff is blind to untracked CREATE rows), intersected with the File Plan's non-tests paths (AC-20260821-01-7) | At the Phase 1 seam the working tree IS the pre-image, so no snapshot is taken and nothing is checked in (deliberately unlike the deleted suite-baseline.js); a post-image run proves nothing about vacuity and must refuse rather than mislead |
| D5 | Host config is read ONLY through `lib/host-config.js` `readConfig` (7.12.0 name-ban); absent `testCommand` → exit 2 with a remedy naming the config key and `/spec:init`; `typecheckCommand` optional — absent means the leg is skipped silently (AC-20260821-01-8) | The name-ban's sanctioned route; failing closed on a missing testCommand keeps an unconfigured host out of a meaningless run |
| D6 | `ac-matrix.js` counts valid `[pre-green:]` tags into its typed row — `{"uncovered":N,"oracle":N,"preGreen":N}`, extending spec 06's shape; an out-of-enum reason is hard finding `invalid-pre-green` (added to the ac-matrix finding-class set); `--json` mirrors the object; the tag NEVER sanctions a skip (only `[env:]` does) and a tagged AC with zero test hits still counts uncovered (AC-20260821-01-2, AC-20260821-01-10, AC-20260821-01-12) | Via 06 D11 the object rides `legs[]` verbatim into every review ledger row, making materiality and the kill condition jq-answerable fleet-wide; coverage-laundering and skip-laundering routes are explicitly closed |
| D7 | `verdict.js` is untouched: post-06 `countLegFinding` reads `observed.uncovered` by name and ignores extra keys, so `preGreen` rides without a verdict change — blocking happens at build (red-check exit 1 pauses the build); the review-side count is informational [no-ac: deliberate no-op — extra-key tolerance is A4, adjudicated at build against 06's landed verdict tests; a vacuous absence pin here would be this spec's own defect class] | Review is too late to redden a test; a second blocking site would double-adjudicate one class. 06's ac-matrix pins that assert the exact row object are updated in place + retagged in this spec's tests rows |
| D8 | `build.md` Phase 0 step 2's expected-colour classification prose and Phase 1's red-check paragraph are replaced by the `node "$(spec-paths red-check)"` invocation and its disposition rules: exit 1 `unsanctioned-green` = the spec is wrong somewhere — diagnose (stale assumption, wrong target, behavior already exists, mis-classified pin) and confirm with the user; `broken-pin` = diagnose the drift, never weaken the carrier; crash-vs-assert attribution on red files (stub the missing module inert, re-run, delete the stub) stays orchestrator prose — the script deliberately does not distinguish crash-red from assert-red [no-ac: the invocation line is enforced by the standing entry-point conformance suite once spec/entrypoints.json lists build.md as red-check.js's entry point — deleting the line reddens tests/consistency/entrypoints.test.js] | Same disease ac-matrix.js killed at review, one stage earlier: a hand-executed leg drifts per session and per model (procedural drift is the measured largest agent-failure class); judgment stays prose, reconciliation becomes exit codes |
| D9 | Authoring-side contract: `spec/templates/spec.md`'s AC comment documents `[pre-green:]` (tag at plan time any rejection criterion a pre-existing generic fallback already satisfies, any absence invariant an inert stub satisfies, and any predicate that IS the deliverable inside a test file — verify against the pre-image before tagging); `spec/commands/plan.md`'s Draft AC bullet names the tag beside `[env:]`/`[oracle:]` [no-ac: authoring guidance; the enforcement surfaces are D1's parser and D2/D6's consumers] | Plan is where the expectation is knowable; the tag records the plan-time judgment where machines can read it |
| D10 | The pipeline rules Gotchas' thrice-amended vacuous-red-pin entry shrinks to a one-line pointer at red-check.js and this spec (JJ approved 2026-08-21) [no-ac: prose deletion; the replacing mechanism is D2's script, pinned by this spec's ACs] | Never fix an incident by growing doctrine prose; the class history lives in the script's incident header and its test file |
| D11 | Wiring: `spec-paths` gains key `red-check`; `spec/entrypoints.json` gains `spec/scripts/red-check.js` → `["spec/commands/build.md"]`; `tests/spec-paths.test.js`'s key list is updated IN PLACE (known additive-collision class JJ-20260814-01 — planned here so it never lands out-of-plan); plugin.json bumps (target 7.13.0 — a target, not a pin, per the semver-race gotcha) with the changelog paragraph (AC-20260821-01-11) | A missing key breaks commands silently (§ Risk Tiers); the collision-prone surfaces enter the File Plan up front |
| D12 | REJECTED: a mandatory per-AC mutation/kill-check (deliberately break the implementation, confirm each pinned assertion reddens). The admission bar cannot be filled: the class it would guard — a pin that can never fail SHIPPED UNDETECTED — has zero recorded members across the run ledger, escape ledger, and replay ledger; generality and materiality are unfillable. Reopen condition (ledger-answerable): the first `escape` row, or `replay` row with outcome `missed`, attributing the miss to a pinned AC whose test could not fail; pre-staged escalation is a `--kill <patch> --file <test>` mode on this same script. The ratified redden-spike (patch+test+revert, 20260817/07) stays available as session practice, never a standing mandate [no-ac: rejection record per core § Incident Policy] | All 16 recorded instances are the OTHER class — vacuity noticed and recorded, every one a correct post-implementation assertion; replay.js already occupies the blind-mutation niche at a fraction of the cost, and crash-red vs assert-red separation would need per-host runner-output parsing (portability swamp) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/red-check.js | CREATE | scripts | D2/D3/D4/D5: expectation derivation, per-file execution, purity refusal, finding classes, `--json` |
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D1: `preGreen` field in parseAcBullets, `PRE_GREEN_REASONS` export |
| spec/scripts/ac-matrix.js | MODIFY | scripts | D6: `preGreen` in the typed row, `invalid-pre-green` finding class, `--json` mirror |
| spec/bin/spec-paths | MODIFY | scripts | D11: `red-check` key |
| spec/entrypoints.json | MODIFY | other | D11: red-check.js entry, entryPoints [spec/commands/build.md] |
| spec/commands/build.md | MODIFY | doctrine | D8: Phase 0 step 2 + Phase 1 prose → invocation + disposition rules |
| spec/commands/plan.md | MODIFY | doctrine | D9: `[pre-green:]` named in the Draft AC bullet |
| spec/templates/spec.md | MODIFY | doctrine | D9: AC-comment contract for the tag |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | D10: Gotchas vacuous-pin entry → one-line pointer (user-approved) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11: version bump + changelog paragraph |
| tests/red-check/red-check.test.js | CREATE | tests | AC-20260821-01-1, AC-20260821-01-3, AC-20260821-01-4, AC-20260821-01-5, AC-20260821-01-6, AC-20260821-01-7, AC-20260821-01-8, AC-20260821-01-9, AC-20260821-01-13, AC-20260821-01-14 |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20260821-01-2, AC-20260821-01-10, AC-20260821-01-12 (06's exact-row pins updated in place + retagged) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260821-01-11 (key list updated in place, JJ-20260814-01 class) |

## Contracts

```
# AC tag grammar (parsed by lib/spec-sections.js parseAcBullets, sibling to [env:]/[oracle:])
[pre-green: fallback-rejection | absence-invariant | predicate-in-test]
# parseAcBullets bullet shape gains:  preGreen: <raw trimmed string | null>   (no enum
# validation in the parser; PRE_GREEN_REASONS is exported for consumers, who fail closed)

# red-check.js CLI
red-check.js --spec <path> --root <dir> --base <sha-or-ref> [--expect-green <path>]... [--json]
# Exit codes: 0 = every tests-layer file matches its expected pre-image colour
#             1 = findings: unsanctioned-green | broken-pin | missing-test-file | invalid-pre-green
#             2 = usage error, unreadable --spec, no ## Acceptance Criteria section,
#                 missing testCommand in host config, or purity refusal (post-image tree)
# Observation: {testCommand} <file> exit code (+ {typecheckCommand} <file> when declared);
# runner OUTPUT is never parsed. --expect-green flips one file's expectation to green and
# prints a warning naming the flag and path (orchestrator-derived host sanction, e.g. a
# design-stage pre-landed component's test).

# red-check.js --json shape
{"files":[{"path":"tests/x/x.test.js","expected":"red|green|unclassified",
           "observed":"red|green|absent","carriedAcs":["AC-..."]}],
 "findings":[{"class":"unsanctioned-green","path":"...","acs":["AC-..."],"detail":"..."}],
 "warnings":["..."]}

# ac-matrix manifest row (extends specs/20260820/06 D2's typed shape; 06's pins updated in place)
{"leg":"ac-matrix","exit":E,"observed":{"uncovered":N,"oracle":N,"preGreen":N}}
# preGreen = count of well-formed AC bullets carrying a VALID [pre-green:] reason;
# an out-of-enum reason raises hard finding invalid-pre-green (ac-matrix finding-class set)
```

## Behavior

- Expectation table, applied per resolved tests-layer file at build Phase 1 (the tree at
  the Phase 1/Phase 2 seam IS the pre-image — tests authored, implementation absent):
  - expected green, runner exit 0 → match
  - expected green, runner exit ≠ 0 → `broken-pin`
  - expected red, runner exit ≠ 0 → match (crash-vs-assert attribution stays orchestrator prose)
  - expected red, runner exit 0 → `unsanctioned-green`, naming the file's carried AC-IDs —
    the mechanized vacuity catch
- A file mixing sanctioned and unsanctioned ACs is expected red (any unsanctioned AC ⇒
  red); per-file granularity means the sanctioned pins inside it are not individually
  verified — stated honestly in Rationale.
- The tag records plan-time judgment; the script proves the FILE'S colour, not that any
  assertion discriminates. That residual is reviewer territory (Rationale).

## Acceptance Criteria

- **AC-20260821-01-1**: WHEN an AC bullet's raw text contains `[pre-green: absence-invariant]` THE SYSTEM SHALL parse it with `preGreen: "absence-invariant"`, and a bullet with no tag SHALL parse `preGreen: null` (e.g. `- **AC-20260821-99-1**: WHEN x THE SYSTEM SHALL y [pre-green: absence-invariant]` → `{preGreen: "absence-invariant"}`) → tests/red-check/red-check.test.js
- **AC-20260821-01-2**: WHEN a spec's AC bullet carries `[pre-green: because-i-said-so]` (outside `PRE_GREEN_REASONS`) THE SYSTEM SHALL emit hard finding `invalid-pre-green` from ac-matrix.js and exit 1 → tests/ac-matrix/ac-matrix.test.js
- **AC-20260821-01-3**: WHEN a tests-layer file whose carried ACs include ≥1 unsanctioned AC passes its `{testCommand}` run against the pre-image THE SYSTEM SHALL exit 1 with finding `unsanctioned-green` naming the file and every carried AC-ID → tests/red-check/red-check.test.js
- **AC-20260821-01-4**: WHEN every resolved tests-layer file matches its expectation (a `SHALL CONTINUE TO` pin-carrier file passing AND an unsanctioned file failing, in one fixture spec) THE SYSTEM SHALL exit 0 → tests/red-check/red-check.test.js
- **AC-20260821-01-5**: WHEN a file whose every carried AC is sanctioned fails its run THE SYSTEM SHALL exit 1 with finding `broken-pin` naming the file → tests/red-check/red-check.test.js
- **AC-20260821-01-6**: WHEN a non-DELETE tests-layer File Plan path does not exist THE SYSTEM SHALL emit finding `missing-test-file` WITHOUT invoking the runner on that path (spike A: the runner exits 1 on a missing file, which would fake a satisfied red expectation) → tests/red-check/red-check.test.js
- **AC-20260821-01-7**: WHEN any non-tests File Plan path already differs from `--base` — including a path that exists only as an UNTRACKED file (spike B: `git diff --name-only` alone is blind to it) — THE SYSTEM SHALL exit 2 naming the offending path(s) and run zero test files → tests/red-check/red-check.test.js
- **AC-20260821-01-8**: WHEN the host config declares no `testCommand` THE SYSTEM SHALL exit 2 with a remedy naming the `testCommand` key and `/spec:init` → tests/red-check/red-check.test.js
- **AC-20260821-01-9**: WHEN a red-expected file is passed via `--expect-green` THE SYSTEM SHALL treat it green-expected and print a warning naming the flag and the path → tests/red-check/red-check.test.js
- **AC-20260821-01-10**: WHEN a spec carries exactly 2 valid `[pre-green:]` tags THE SYSTEM SHALL append the ac-matrix manifest row with `observed` = `{"uncovered":<n>,"oracle":<n>,"preGreen":2}` and mirror it under `--json` → tests/ac-matrix/ac-matrix.test.js
- **AC-20260821-01-11**: WHEN `spec-paths red-check` runs THE SYSTEM SHALL print a path that exists (key list updated in place) → tests/spec-paths.test.js
- **AC-20260821-01-12**: WHEN an AC carries `[pre-green:]` and has zero test hits THE SYSTEM SHALL CONTINUE TO count it `uncovered` in ac-matrix (the tag never launders coverage) → tests/ac-matrix/ac-matrix.test.js
- **AC-20260821-01-13**: WHEN invoked with `--json` THE SYSTEM SHALL print the Contracts shape — `files[]` rows carrying `path`/`expected`/`observed`/`carriedAcs`, `findings[]` rows carrying `class`/`path` (e.g. an unsanctioned-green run yields `{"class":"unsanctioned-green","path":"tests/t/v.test.js","acs":["AC-20260821-99-1"]}` in `findings`) → tests/red-check/red-check.test.js
- **AC-20260821-01-14**: WHEN a tests-row file carries zero AC-IDs THE SYSTEM SHALL report it `unclassified` and never execute it (a probe file that writes a marker file when loaded leaves no marker) → tests/red-check/red-check.test.js

## Assumptions

- **A1 (executed spike, 2026-08-21, Node v26.0.0):** per-file `node --test <file>` exits 0
  on pass, 1 on assertion failure, 1 on module-load crash, and **1 on a missing file** —
  observed: `pass-file exit: 0 · fail-file exit: 1 · crash-file exit: 1 · missing-file
  exit: 1`. Consequence locked into D3: existence is probed before execution.
- **A2 (executed spike, 2026-08-21):** `git diff --name-only <base>` lists tracked
  modifications only; an untracked new file is invisible to it (observed: `impl.js` listed,
  untracked `t2.test.js` absent). Consequence locked into D4: the purity probe unions
  `git status --porcelain --untracked-files=all`.
- **A3:** spec 20260820/06 builds before this spec (`depends_on` ordering) so the ac-matrix
  row is already a typed object when D6 extends it. If 06 is abandoned → fallback: extend
  the packed string as `preGreen=N` and amend D6.
- **A4:** post-06 `verdict.js` reads `observed` fields by name and ignores unknown keys, so
  `preGreen` rides with no verdict change. If false (06's build adds strict key-set
  validation) → this spec's tests rows update that validation in place.
- **A5:** `{testCommand} <file>` — appending one file path to the host's `testCommand` — is
  the established per-file convention (build.md Phase 1 already prescribes it; executed
  here as part of A1). If a host's `testCommand` cannot accept a trailing file path → that
  host declares a per-file-capable `testCommand`, or a placeholder form is added by a
  follow-up; red-check's error surface is the runner's own exit code either way.

## Rationale

**The defect being fixed** is not "some ACs can't go red" — that is a fact about the
world, and all 16 recorded instances were benign (correct post-implementation assertions).
The defect is that the red-check reconciliation is hand-executed from prose at build time,
and its findings accumulate in a hand-grown doctrine paragraph — the same disease
ac-matrix.js was created to kill at review, one stage earlier. Procedural drift on
hand-executed legs is the measured largest agent-failure class (38.5%, cited in spec
20260820/07's rationale); this spec moves the reconciliation into exit codes and leaves
only judgment (crash attribution, unsanctioned-green diagnosis) as prose.

**Materiality, derived from this repo's artifacts:** 16 AC instances across 5 specs
(AC-20260815-02-7; AC-20260817-07-12; AC-20260819-01-5; AC-20260820-05-10 and -11;
specs/20260820/08 AC-1/2/3/4/7/10/11/13/15/16 plus AC-9), against 26 builds recorded in
`.claude/spec-runs.jsonl` since 2026-08-15 (19% of builds) and 303 AC bullets authored in
specs/202608{15–20} (5.3% of criteria). Accelerating: 1 instance on 08-15, 1 on 08-17, 1
on 08-19, then 2 and 11 on 08-20 — because the roadmap's deliverables increasingly ARE
verifier predicates living in test files, where green-by-construction is the normal case.

**Admission bar (core § Incident Policy), five fields:**
- *Portability:* the tag lives in the host-stack-free AC grammar; the script executes the
  host's own `testCommand`/`typecheckCommand` and reads exit codes only.
- *Generality:* five ledger/doctrine-recorded members named above; four of the five
  spec-level events are not the trigger; all three sub-shapes represented.
- *Materiality:* the counts above. Fleet caveat, stated per core.md: the fleet reader scans
  11 repos but only this repo's artifacts can answer today — no ledger anywhere holds a
  vacuity field, which is itself half the defect and exactly what D6 fixes.
- *Falsifiability:* the guard for unreddenable ACs has fully reddenable ACs — AC-3's test
  runs red-check against a fixture spec carrying an untagged AC whose test passes against
  the fixture pre-image and asserts exit 1 naming the AC-ID.
- *Removability (kill condition, jq-answerable):* "across the trailing 30 review rows in
  every readable ledger, how many carry an ac-matrix leg with `observed.preGreen > 0`?" —
  zero ⇒ delete the tag, the script, and build.md's invocation line together.

**Recorded rejection** (D12): the mandatory per-AC kill-check, with its ledger-answerable
reopen condition. **Residual weakness, stated honestly:** the tag is a planner/worker
attestation — welded to execution it kills the obvious abuse (an unexecuted tag would be
pure attestation), but a worker who tags a genuinely red-expected AC to avoid writing a
red test still gets a passing check. The script proves the file's colour, never that the
assertion discriminates; that semantic honesty is reviewer residue. Likewise per-file
granularity: a mixed file's sanctioned pins are not individually verified.

**Sequencing:** after specs/20260820/06 (D6 extends its typed row; landing first would
churn 06's contract and add a consumer to the string grammar 06 deletes); orthogonal to
specs/20260820/07 (build-stage mechanism; the review-side count flows through
review-legs.js → ac-matrix.js, which 07's driver executes unchanged). 06's
`depended_on_by` frontmatter is deliberately not edited (brief 16's hardened specs stay
untouched — JJ 2026-08-20); this spec's `depends_on` alone carries the ordering.
red-check.js's 0/1/2 exit alphabet is shaped so a future build driver (07's named next
hub) absorbs it as an executed step.

**Collision closure (run at lock, 2026-08-21):** the `likely`-tier hits (on the
spec-paths, build.md, entrypoints.json, and ac-matrix.js rows) all converge on ONE file,
`tests/consistency/entrypoints.test.js` — WAIVED as a File Plan row: that suite is
data-driven over `spec/entrypoints.json` and the live command files, so D11's manifest
entry plus D8's invocation line are exactly what keep it green with no test edit; residual
redness at build is a wiring defect in this spec, never a reason to edit the checker. The
literals leg hit `tag-only AC` only inside the planned build.md row. `negative-invariant`
scored zero hits because build.md hard-wraps the phrase (`absence/negative-` + `invariant`)
across lines — the known hard-wrap blindness (Gotchas, 20260816/01); the phrase lives only
in build.md line 33, inside the planned D8 replacement, verified by hand-grep at lock.

**Design-capable hosts:** a design-stage pre-landed component's test is legitimately green
pre-implementation but unknowable at plan time (design runs after plan) — that is what
`--expect-green` carries: an orchestrator-derived, per-invocation, printed sanction,
following ac-matrix's `--skips` precedent (orchestrator-extracted inputs passed
explicitly), never a tag.


**Build deviation (folded at close, 2026-08-22):** D11 named 7.13.0 as the plugin.json
version-bump target, but a Decision's literal version is a target, not a pin — HEAD's installed
version at build time was already 7.16.0, so the build bumped to 7.17.0 (next free) keeping the
last-3-versions changelog form. This is the established remedy for the semver-race class already
recorded in `.claude/rules/spec-pipeline.md` Gotchas (`[host]`, citing specs/20260810/02 D11); a
one-off instance of a known class, so no new Gotchas line was added.

**Review close (2026-08-22):** two hard findings, both fixed, none waived. (1) `parseAcBullets`
extracted the three AC-grammar tags with unanchored substring matches over a bullet's whole raw
text, so AC-1 and AC-2 of this spec — whose requirement text illustrates the `[pre-green:]`
grammar by example — self-tagged and fired a fabricated `invalid-pre-green` against this spec's
own review. Fixed by anchoring extraction to the two real declaration positions. (2) That fix
matched only one tag per position, silently dropping both when sibling tags shared a slot —
a regression against the pre-fix behavior, and a live trap for the `[env:]`+`[pre-green:]`
combination `spec/templates/spec.md` sanctions. Fixed by matching a run of tag items per
position. Six `tests/ac-matrix/ac-matrix.test.js` fixtures encoded the retired mid-sentence
position and were retagged into the declaration slot with their assertions byte-identical; five
new pins cover both anchoring and multi-tag runs.
## Canonical Delta

docs/canonical/build-integrity.md: add — build Phase 1's red-check is mechanized by
`spec/scripts/red-check.js` (`spec-paths red-check`): expectation derives from `SHALL
CONTINUE TO` pins and closed-enum `[pre-green:]` tags (fallback-rejection |
absence-invariant | predicate-in-test), observation is per-file `{testCommand}` exit
codes against the pre-image (purity-refused when non-tests File Plan paths differ from
the diff base), and the plan-time tag count rides review's ac-matrix manifest row as
`observed.preGreen` into every ledger row. The kill condition and the rejected per-AC
mutation mandate (with reopen condition) are recorded in this spec's D12/Rationale.
