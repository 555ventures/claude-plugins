---
date: 2026-09-02
status: done
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: ["specs/20260902/01-comment-narration-gate.md"]
depended_on_by: ["specs/20260902/03-plugin-prose-sweep.md"]
brief: 21
open_markers: 0
build_base: main
diff_base: d63af56912c35f44c6c1763055185cf3456e2c2f
---

# Plugin code sweep: comments cite owners, code stays byte-identical

## Goal

Every whole-line comment under `spec/scripts`, `spec/bin`, `scripts`, and `tests` states the
current invariant plus one owner id and nothing else. The sweep is mechanical — driven by
the gate's own finding list — and safe only because `comment-narration.js --code-identical`
proves no executable line moved. Done means: the plugin scan reports zero findings for every
code-group file with no code path left in the baseline; the oracle reports every code file
identical to the pre-sweep base; the full suite is green; the four comments that describe
deleted machinery are corrected.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Worklist = the gate.** Workers run `node "$(spec-paths comment-narration)" --root . --hosts upwell,prax,salon-os,salon os,hearwell,hiwora,zubu,bwm,cctop,autopilot-hub --people JJ,founder --json` and treat every `findings` entry under a code-group path as a line to rewrite or delete; nothing outside that list is edited except the D4 duplicates and the D5 stale comments. (AC-20260902-02-1) | The gate is the explanation; a worker's own judgment of "narration" adds nothing the scan cannot re-check. |
| D2 | **Per-file header collapse.** Every script header becomes: usage line · one owner citation (the spec path, AC-ID, D-number, ADR, or run id that owns the current behavior) · what it deliberately does NOT do · `Exit codes:` list. Every test-file header becomes: the owner citation(s) the file pins, one line each, plus the file's residual non-goals when it has them. Restated facts (the same invariant explained twice in one file, or a header paragraph repeating a body comment) are deleted at the second occurrence. Mechanism explanations survive when they carry no narration class — the rule bans history, not reasons. (AC-20260902-02-1) | Brief § Result; `.claude/rules/conventions/scripts.md` and `tests.md` as rewritten by sibling 01 D11. |
| D3 | **Comment-only edits, whole-line only.** Workers edit or delete lines that are comments under sibling 01 D3 and blank lines; they never touch a trailing `//`, a `/* */` block, or any executable text — including test names and assert messages (string literals are code to the oracle). A finding whose text lives in a string literal is out of this spec's scope and left as-is. `[no-ac: enforced by D6's oracle run and AC-20260902-02-2's whole-suite pin]` | The oracle reads trailing comments as code by construction (01 D7); a sweep that respects the line discriminator is provably behavior-neutral. |
| D4 | **Cross-file duplicates reduce to one home.** Where the same mechanism is explained in several files (the 64 KiB `process.exit` truncation, the `spawnSync` in-process stub deadlock, the entry-point admit-by-location rule, the AC-ID grammar), the explanation stays in the file that owns the behavior (`docs/canonical/scripts.md` or `gate-integrity.md` when one already holds it) and every other site becomes one citation line. (AC-20260902-02-1) | Core § Doctrine Authoring: one binding home per rule, dedup at touch-time — the sweep is the touch. |
| D5 | **The four stale comments are corrected**, not merely de-narrated: `spec/scripts/citations-check.js` ("claims-lint.js owns that" — the script is deleted; the header says line-count content is unchecked), `spec/scripts/ci-gate-parity.js` ("doctor.md check 19" — the check is 14; cite doctor.md check 14), `spec/scripts/spec-review-driver.js` ("on the spec-design-driver.js contract" — the script is deleted; cite the driver-stepped contract by spec path), `spec/scripts/genesis-driver.js` (the `/spec:genesis-architect` choreography paragraph — cite specs/20260825/04-genesis-driver.md). Any further comment naming a script, key, command, or check number that does not exist is corrected the same way; the worker verifies every cited name exists before leaving it. (AC-20260902-02-1) | Brief § Current state names four; the planning grep found exactly these four. |
| D6 | **Oracle at close.** After the last worker returns, the orchestrator runs `node "$(spec-paths comment-narration)" --root . --code-identical <diff_base>` and requires `identical: N files` (exit 0); a `code-changed` file is routed back to its owning worker as a repair, never accepted. The reviewer re-runs the same command against the spec's `diff_base` and records the summary line in its findings. `[no-ac: executed at build close and at review against diff_base; not representable as a standing test post-merge (a merged tree is trivially identical to itself)]` | The brief's acceptance clause; the review is the honest oracle seat. |
| D7 | **Baseline shrinks.** Every code-group path is removed from `.claude/comment-narration.baseline.json`; prose-group entries stay for sibling 03. The test author performs this removal at Phase 1 so the standing test goes red before any sweep edit. (AC-20260902-02-1) | 01 D6: the baseline only shrinks; a code path left in it hides a regression. |
| D8 | **Tier stays standard, with one upgrade trigger.** Hook scripts and other host § Risk Tiers surfaces are touched comment-only; a `code-changed` oracle result on any of them upgrades the tier to critical immediately (note it in this spec) and stops the build for the user. `[no-ac: process rule — D6 is its mechanism]` | Brief: the sweep is only safe because a code-identical oracle proves no executable line moved. |
| D9 | `spec/.claude-plugin/plugin.json`: version bump target 7.57.1 (next free if taken); the changelog paragraph names the sweep and the oracle result (last-3 form). `[no-ac: manifest — pinned by tests/consistency/plugin-version.test.js]` | Host § Planning; comment-only, so a patch bump. |
| D10 | **The build driver expands a tests-layer File Plan glob** (JJ ruling at build): `handleTestsAuthored` checked each tests-layer path with a literal `fs.existsSync`, so the sanctioned glob row `tests/**/*.test.js` could never be marked and this build could not leave `TESTS`. Fixed in-session per core § Incident Policy — the row is expanded through `lib/glob-match.js` (a pattern is satisfied by at least one match, a literal path by its own existence), the same shared matcher `red-check.js` and `scope-reconcile.js` already use — plus one behavioral test in `tests/build/build-driver.test.js`. The identical literal-path assumption was then found in `verifyWaveRows`, which refused `--mark wave-done` for the same reason (`spec/scripts/*.js` is not a filename); the same expansion was applied there under this ruling — a DELETE pattern verifies when nothing matches, a CREATE/MODIFY pattern when at least one file does. Known consequence, accepted by JJ: `spec/scripts/spec-build-driver.js` and `tests/build/build-driver.test.js` are the second and third files D6’s oracle reports `code-changed`, alongside the spec-mandated retag of `tests/consistency/comment-narration-live.test.js`. `[no-ac: build-time ruling; the behavioral test is the pin]` | Two sibling gate scripts already glob-expand File Plan rows; one place not doing so is a defect that blocks every spec planning tests by pattern. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/*.js | MODIFY | scripts | D2/D4/D5: header collapse, restated-fact deletion, stale-citation fixes; comment lines only |
| spec/scripts/*.sh | MODIFY | scripts | D2: `#` header collapse; comment lines only |
| spec/scripts/lib/*.js | MODIFY | scripts | D2/D4: header collapse; comment lines only |
| spec/bin/spec-paths | MODIFY | scripts | D2: header comment only |
| scripts/spec-patterns.sh | MODIFY | scripts | D2: header comment only |
| tests/**/*.test.js | MODIFY | tests | D2/D4: header collapse to owner citations; comment lines only (test names and assert messages untouched) |
| tests/helpers.js | MODIFY | tests | D2: header comment only |
| .claude/comment-narration.baseline.json | MODIFY | other | D7: every code-group path removed (test author, Phase 1) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: 7.57.1 + changelog paragraph |

Orchestrator duties (outside the table): D6's oracle run before the checkpoint commit; the
test author retags `tests/consistency/comment-narration-live.test.js`'s standing test with
`AC-20260902-02-1` in place (never a second copy). Glob rows are sanctioned by
`scope-reconcile.js` (specs/20260813/03 D2); each worker expands its glob against the D1
finding list, not the directory.

## Behavior

- A worker's loop per file: read the finding lines; rewrite the header per D2; delete
  restated facts; for each remaining finding line either delete it (history) or rewrite it
  as an invariant plus citation (mechanism); re-run the scan on that file; move on at zero.
- Owner citations are chosen from what already exists: the spec path in the old comment
  (`specs/20260823/06-prose-debt-pruning.md`) survives as the citation; a dated incident
  with no spec becomes the escape/run id when the ledger names one, else the AC-ID the
  file's tests carry, else the citation is dropped with the sentence.
- Wave shape: `scripts` and `tests` are separate layers; the orchestrator may split either
  wave across several workers by directory (the `--workers` mark records the count).

## Acceptance Criteria

- **AC-20260902-02-1**: WHEN the suite runs THE SYSTEM SHALL observe the plugin scan exit 0 with the tracked baseline holding no code-group path (`node comment-narration.js --root . --hosts … --people … --baseline .claude/comment-narration.baseline.json` → exit 0; the tracked baseline holds no key matching `/^(spec\/scripts|spec\/bin|scripts|tests)\//`; `--json` → no finding names a code-group file, i.e. `findings.filter(f => /^(spec\/scripts|spec\/bin|scripts|tests)\//.test(f.file)).length === 0`) → the standing test in tests/consistency/comment-narration-live.test.js, retagged
  - Superseded at build: the original parenthetical asserted `Object.keys(files).filter(k => /^(spec\/scripts|spec\/bin|scripts|tests)\//.test(k)).length === 0`. `comment-narration.js` builds `files` from the directory walk — one key per scanned file, value = finding count — so the 14 code-group files already at zero findings keep their keys and the clause is unsatisfiable for any non-empty tree. The amended clauses pin what this spec’s Goal states: zero code-group findings, and no code path left in the baseline.
- **AC-20260902-02-2** `[oracle: gate]`: WHEN the final gate runs after the sweep THE SYSTEM SHALL CONTINUE TO pass the full suite — comment-only edits change no observed behavior (the gate leg is the honest pin; D6's oracle is the executed proof)

## Assumptions (escalation triggers)

- A1: Sibling 01 is `done` and the baseline lists every code path with findings (measured at planning: 759 code lines in ~120 code files). — **if false:** STOP; `/spec:run` sibling 01 first.
- A2: The finding list is complete for the sweep's purpose — a line with no class hit is not history. Known residual: narration phrased outside the six classes (e.g. "the old shape") survives; workers do not hunt it. — **if false** (review finds systematic misses): record the phrase; sibling 03 or an escape row adds the class, never this worker.
- A3: Test-file findings inside string literals (test names, assert messages: measured examples `tests/genesis-gate.test.js:70,74,149`, `tests/spec-status.test.js:202,249`) are not comment lines and are not scanned by 01 D3. — **if false** (the scan reports them): the discriminator is wrong; fix 01's script under an escape row, not here.
- A4: `git ls-files` at `--root .` inside the build worktree resolves the same 153 code files as at `main`. — **if false:** the oracle names the delta; the orchestrator inspects before accepting.

## Rationale

The sweep is deliberately dumb: the gate's finding list is the worklist, the whole-line
discriminator is the edit boundary, and the oracle is the acceptance. Anything cleverer — a
worker deciding a paragraph "reads as history" — reintroduces judgment the gate cannot
re-check. Header collapse loses nothing that matters: every dated story in a header already
has a home (the spec, the ledger row, the ADR) and the surviving citation points there;
mechanism explanations survive because they carry no narration class. The four stale
comments are the one place the sweep fixes content rather than form — a comment naming
deleted machinery misleads every future worker, and the brief's audit counted them.

Split from the prose sweep (sibling 03) by landing unit: this spec's acceptance is the
oracle plus a green suite; 03's is citation integrity, read-load, and doctrine pins — two
verification regimes, two specs. The `[oracle: gate]` AC is the honest pin for "nothing
changed": no test can assert byte-identity against a base that stops existing once the
branch merges, so D6 records the executed result at build close and at review instead.

Regression pins: AC-20260902-02-2 is the whole-suite `SHALL CONTINUE TO` pin; no narrower
neighbor needs pinning because the oracle bounds the edit to comment lines.

### What the run departed from, and why (deviations fold, review rv_c76e8d7cb3e9)

**The sweep itself was uneventful; the pipeline around it was not.** 768 comment lines across
157 code-group files went to zero, the final gate held at 953/953 with nothing skipped, and the
D6 oracle names exactly three `code-changed` files — the retag this spec's own Orchestrator
duties mandate, plus D10's driver fix and its test. No swept file moved an executable byte.
None of the three is a host § Risk Tiers surface, so D8's upgrade trigger never fired and the
tier stayed `standard`.

**Two amendments were forced mid-build.** AC-20260902-02-1's original `--json` clause filtered
`Object.keys(files)`, but `comment-narration.js` builds that map from the directory walk, so
every scanned code file keeps a key regardless of findings and the clause was unsatisfiable for
any non-empty tree. It was amended in place to the three clauses this spec's Goal already
stated, with the superseded formula demoted to an indented sub-line. D10 records the user's
ruling to fix `spec-build-driver.js`, which checked File Plan paths with a literal
`fs.existsSync` in two handlers — so a glob row, a form this spec's File Plan uses and
`scope-reconcile.js` sanctions, could satisfy neither `--mark tests-authored` nor
`--mark wave-done`. Both handlers now expand through the shared `lib/glob-match.js`, each with
its own behavioral test.

**Ordering yielded to red-check twice.** D7 asks the test author to shrink the baseline at
Phase 1, but `red-check.js` refuses to run while any non-tests File Plan path differs from the
base, and the baseline is an `other`-layer row; the shrink was reverted for the red-check run
and re-applied at the `other` wave, which the orchestrator applied directly (`--workers 0`)
since the artifact was already byte-verified. The pin was genuinely red either way. D9's
literal version target 7.57.1 was taken at HEAD, so the bump landed at 7.57.2 — the host's own
Gotchas already record that a spec's version number is a target, not a pin.

**Three sweep judgments are worth keeping.** Two test files open with an informal incident id
that also leads a protected test name, so the person check fires structurally no matter how the
prose is worded; the header's restatement was deleted under D2's own restated-fact rule rather
than reworded, since the id survives verbatim in the test name. One agent-doctrine header had no
citable owner anywhere — no spec, no AC, no ledger row — so the mechanism paragraph was kept
uncited rather than deleted with its citation, which a literal reading of the fallback would
have required. And a comment in `tests/merge-back.test.js` cited another repo's spec by a path
that reads as local once the host qualifier is stripped; with no sanctioned citation form
available for it, the incident sentence was dropped and the mechanism kept.

**Review cost three passes.** The first caught the broken cross-repo citation and a D4
consolidation that had reached two duplicate sites but not five; the second caught that D10's
second handler had shipped unpinned and that this record had claimed otherwise; the third was
clean. All eight sites of the 64 KiB truncation mechanism now cite `lib/driver-io.js`, each
keeping its own file-local detail.

## Canonical Delta

`docs/canonical/scripts.md` § Prose budgets gains: the plugin's code-group comments are at
zero narration; new comments state the invariant plus one owner id (spec path, AC-ID,
D-number, ADR, run id) and the standing scan refuses anything else.
