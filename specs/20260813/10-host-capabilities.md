---
date: 2026-08-13
status: done
diff_base: 08b5e48699c0de1f232a3e2a83e69c4c02dba2b1
open_markers: 0
risk: T3
area: host-grounding
design: false
breaking: false
depends_on: ["specs/20260813/09-model-placement-mechanics.md"]
depended_on_by: []
brief: n/a
---

# Host capabilities — declared capabilities replace hardcoded stack assumptions

## Goal

Close audit Class C's silent-failure family: commands currently assume GitHub as the forge,
universal skip-count reporting, pnpm-shaped monorepos, Storybook-shaped previews, and
shell/Node-shaped entry points — and on hosts where the assumption misses, whole organs go
inert *silently* (the exact UpWell skip-count failure, ledger row 34). This spec adds one
`capabilities` block to the host config contract, written by `/spec:init` and consumed at
single points (the CI scripts, the verdict derivation) wherever possible; a capability the
host lacks makes the consuming leg loudly `unavailable` — and the review verdict gains the
qualifier word to carry that honesty, which it currently lacks (release-profile-only today).
Done means: the same CLEAN verdict means the same thing on every host, and gaps announce
themselves.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec.config.json` gains `capabilities` (documented in `spec/templates/grounding-contract.md` — this spec's ONE edit to that file): `{ forge: "github"\|"none", skipReportPattern: "<regex>"\|"none", ciPoll: { intervalSeconds: 30, timeoutSeconds: 600 } }`. `/spec:init` writes it: forge from the origin remote URL + `gh` availability; `skipReportPattern` derived from the **detected runner's identity** (init already identifies the runner from manifests) as a candidate regex confirmed with the user (one recommended-first question), `"none"` only when no format is derivable or the user says so — NEVER inferred from a quiet probe run (many runners print skip lines only when skips are nonzero, so silence proves nothing). | One block, closed keys, detection at init where the evidence lives (C2/C3/C6). Refuter-corrected twice: init runs no test suite today (the original "probe run" recipe cited machinery that doesn't exist), and zero-skip probe output would have wrongly written `"none"` on capable hosts. |
| D2 | Forge gating lands at the single point both CI consumers share: `ci-query.js` and `observe-ci.js` read the host config's `capabilities.forge` — `"none"` ⇒ print the canonical line `unavailable — no supported forge adapter` (machine-parseable, sibling of their existing gh-missing handling) and exit cleanly; `"github"` or absent block ⇒ current dynamic behavior unchanged (absent = legacy mode: probe at use time). Command prose (review step 3, release Phase 2, status observe-ci) keeps consuming script output as today — no per-command gating prose. `/spec:doctor`: no new check — check 2's existing stamp-mismatch report gains one line when `capabilities` is absent ("capabilities undeclared — CI observation and skip accounting run on assumptions; /spec:init refreshes") and, when `forge:"none"` but a GitHub remote + `gh` are both detected live, names the staleness ("declared none, host looks GitHub-capable — re-run /spec:init"). | Gating in the two scripts is one edit instead of five near-identical prose blocks (the spec's own diff would otherwise trip the repo's ≥3-duplicates review rule); folding into check 2 avoids stacking a third near-duplicate nudge on hosts where checks 2+15 already fire (refuter-verified this repo trips both today). |
| D3 | Skip accounting drops the "every mainstream runner prints skip counts" claim at BOTH its sites: review.md's gate-leg capture and release.md's e2e-leg capture ("same rule as review's" — the parasitic copy). With a declared pattern, parse with it and emit the existing pinned observed format (`skips=<N> todos=<M>`, `todos=0` when the pattern captures only one group — the format verdict.js parses is unchanged); with `"none"` or no match, the leg's observed value is `unavailable — host runner declares no skip format`, never assumed-zero. | The claim is false (go test, cargo, pytest without `-rs`, Gradle) and silently records 0 — the shipped failure class (C2); the blind-spot pass found release.md inherits it verbatim. Emitting the unchanged `skips=`/`todos=` shape protects `deriveTestsSkipped`'s fixed regex (refuter-traced: any other shape silently degrades `total` to 0 for every host). |
| D4 | `verdict.js` review profile gains the qualifier word: when the disposition branch would return `CLEAN` and any declared observation leg is `unavailable` (ci; skip legs marked unavailable per D3), derive `CLEAN-with-qualifier` — same word, same CLEAN-family exit semantics spec 02 established for release. Plain CLEAN with all legs present is regression-pinned. | The spec's whole goal is "unavailable legs flow into the qualifier" — but `CLEAN-with-qualifier` exists ONLY in the release profile today (refuter-read `derive()`: review falls straight to plain CLEAN, swallowing `unavailable` even now). Without this row the wave's two new honest sources land silently — the exact information loss being fixed. |
| D5 | init.md's monorepo trigger generalizes from `pnpm-workspace.yaml` to "more than one test-collecting package/module" with filenames demoted to parenthetical examples — at BOTH its sites (the Phase 3 rule and the ## Test Rules doc-generation guidance; a file-wide AC scan enforces both) (C5); init's preview-host detection generalizes from Storybook/Widgetbook names to capability shape ("a component-preview host (e.g. Storybook, Widgetbook, Ladle, Histoire)") (C8); genesis-explore's screenshot-tool STOP **stays a hard STOP** (pinned by tests/model-placement.test.js AC-20260807-05-3 — the pin's substance survives) but its trigger becomes capability-shaped ("no scriptable browser-capture capability") with tool names moved to the remedy text; the pin's wording is updated in the same commit (retag, not weaken). | Same defect, multiple sites: enumerated names silently exclude equivalent tools. Refuter-corrected: atlas.md has NO hard STOP (it already degrades gracefully — row dropped), and the genesis-explore pin would break without the same-commit retag. |
| D6 | Workflow/driver stack-shaping (F9 + blind-spot): wf-review's verifier runner-discovery names the host's configured `testCommand` (delivered as args `reproCommand`) as the source of truth with `package.json` demoted to an example; wf-design's `jq` + "Storybook loop" phrasing becomes capability-shaped ("the host's component preview host"); `spec-design-driver.js`'s ITERATE step text generalizes its Storybook find/deep-link mechanics to "the preview host's search/deep-link affordances" with the Storybook shapes as an example (preserving the navigation guidance UPWELL-20260730-01 earned). | NOT_EXECUTABLE verifier kills weaken the evidence gate on non-Node hosts; a widgetbook host is told to look at Storybook. Refuter-corrected: the original `gate.testCommand` key doesn't exist (flat `testCommand` is the contract); wf-enforce's MCP mention is Context7 — a fixed cross-host plugin dependency, correctly named — so that row is REJECTED, not genericized. |
| D7 | release.md's CI poll reads `capabilities.ciPoll` (defaults = current constants 30s/600s when absent) (C6). | Hosts with longer CI permanently land in-progress noise today; defaults preserve current behavior everywhere else. |
| D8 | Dogfood: this repo's own `.claude/spec.config.json` gains the capabilities block in this spec (`forge:"github"` — origin is GitHub and `gh` resolves, refuter-executed; `skipReportPattern` for node:test's unconditional `ℹ skipped N` line; default ciPoll). | Replaces an untestable AC (nothing "regenerates config at build time" — init is an interactive command) with a real artifact a test can read; also the first host exercising the block. |
| D9 | Scaffold-ledger row for the capabilities block (retire: never while multi-host; each key retires when no consumer reads it). Contract-hash change is sanctioned by this spec (the stamp check is warn-only everywhere — refuter-verified state-gate exits 0 on drift). Version bump target 6.68.0. | Doctor check 13; the escalation trigger "edit changes contract-hash" is pre-answered here. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1 capabilities block (the spec's single sanctioned edit to this file) |
| spec/commands/init.md | MODIFY | doctrine | D1 detection recipe (runner-identity + confirm); D5 both monorepo sites + preview generalization |
| spec/scripts/ci-query.js | MODIFY | scripts | D2 forge gate + canonical unavailable line; header update |
| spec/scripts/observe-ci.js | MODIFY | scripts | D2 (same, shared canonical line) |
| spec/scripts/verdict.js | MODIFY | scripts | D4 review-profile CLEAN-with-qualifier on unavailable observation legs; header update |
| spec/commands/review.md | MODIFY | doctrine | D3 skip capture honesty (observed format unchanged); leg-unavailable wording |
| spec/commands/release.md | MODIFY | doctrine | D3 e2e-leg skip honesty; D7 ciPoll |
| spec/commands/status.md | MODIFY | doctrine | D2 consume script's unavailable line (wording only) |
| spec/commands/doctor.md | MODIFY | doctrine | D2 check-2 fold-in (undeclared nudge + staleness hint); no new check |
| spec/commands/genesis-explore.md | MODIFY | doctrine | D5 capability-shaped hard STOP (names → remedy text) |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | D6 ITERATE step preview-host generalization |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D6 runner discovery via configured testCommand / reproCommand |
| spec/workflows/src/wf-design.body.js | MODIFY | workflows | D6 preview-host phrasing |
| .claude/spec.config.json | MODIFY | other | D8 dogfood capabilities block |
| tests/capabilities/config-contract.test.js | CREATE | tests | AC-20260813-10-1, AC-20260813-10-2, AC-20260813-10-3 |
| tests/capabilities/consumer-alignment.test.js | CREATE | tests | AC-20260813-10-4, AC-20260813-10-5, AC-20260813-10-6, AC-20260813-10-7 |
| tests/capabilities/verdict-qualifier.test.js | CREATE | tests | AC-20260813-10-8, AC-20260813-10-9 |
| tests/model-placement.test.js | MODIFY | tests | AC-20260813-10-10 (retag AC-20260807-05-3's pin to the capability-shaped hard-STOP wording, same commit — substance preserved) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D9 row |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9 bump + changelog |

## Contracts

```jsonc
// spec.config.json delta (grounding-contract.md documents this shape):
"capabilities": {
  "forge": "github",              // or "none" — who runs CI/PRs; read by ci-query.js/observe-ci.js
  "skipReportPattern": "none",    // regex over test-runner output capturing the skip count (group 1;
                                  // optional group 2 = todos), or "none"
  "ciPoll": { "intervalSeconds": 30, "timeoutSeconds": 600 }
}
// Absent block = legacy mode (today's dynamic probing + doctor check-2 nudge). Present = authoritative.
// Canonical unavailable line (printed by the CI scripts, consumed verbatim by command legs):
//   unavailable — no supported forge adapter
// Skip legs: observed format stays `skips=<N> todos=<M>` (verdict.js's deriveTestsSkipped
//   regex is unchanged); the unavailable case writes the leg observed value
//   `unavailable — host runner declares no skip format`.
// verdict.js review profile: disposition-branch CLEAN + any unavailable observation leg
//   ⇒ 'CLEAN-with-qualifier' (same word/exit family as the release branch, spec 20260813/02).
```

## Behavior

- Detection at init: forge = `github` iff the origin remote is a GitHub URL AND `gh`
  resolves; else `none` (GitLab/Bitbucket hosts get honest inertness until an adapter
  exists — a real host materializing is the adapter's trigger, not speculation). Skip
  pattern: init names the runner it detected, proposes the known format as a recommended
  default, and the user confirms or overrides — silence in a probe run is never evidence.
- Verdict semantics: D4 *extends* spec 02's design rather than duplicating it — same word,
  same CLEAN-family exit check (already word-family-based since 02), new derivation site in
  the review branch. Release-profile behavior is untouched (regression-pinned).
- File Plan size note: 21 rows exceeds the guideline — the capability block and its
  consumers are one landing unit (a declared capability nobody reads, or a reader with no
  declaration, both ship dishonest states); rows split cleanly into three worker batches
  (scripts / doctrine / tests) along layer lines.
- File contention with specs 05–09 (review.md, wf bodies, driver) is serialized by the
  chain; this spec runs last.

## Acceptance Criteria

- **AC-20260813-10-1**: WHEN grounding-contract.md is read THE SYSTEM SHALL document the
  `capabilities` block with exactly the three keys `forge`, `skipReportPattern`, `ciPoll`
  and the absent-block legacy-mode sentence → tests/capabilities/config-contract.test.js
- **AC-20260813-10-2**: WHEN init.md is read THE SYSTEM SHALL contain the detection recipe
  (forge from remote + `gh`; skip pattern from runner identity + user confirm, with the
  literal caveat that probe silence is never evidence) and SHALL NOT contain
  `pnpm-workspace.yaml` outside parenthetical examples (file-wide scan — both known sites
  and any future ones) → tests/capabilities/config-contract.test.js
- **AC-20260813-10-3**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL
  carry `capabilities.forge: "github"` and a `skipReportPattern` matching node:test's
  skip line (literal: the pattern matches the sample `ℹ skipped 3` → captures `3`) →
  tests/capabilities/config-contract.test.js
- **AC-20260813-10-4**: WHEN `ci-query.js` (and `observe-ci.js`) run against a config with
  `capabilities.forge: "none"` THE SYSTEM SHALL print the canonical line `unavailable — no
  supported forge adapter` and exit cleanly; WHEN the block is absent THE SYSTEM SHALL
  CONTINUE TO probe dynamically (regression pin: current gh-missing handling unchanged) →
  tests/capabilities/consumer-alignment.test.js
- **AC-20260813-10-5**: WHEN review.md and release.md are read THE SYSTEM SHALL NOT contain
  the phrase `every mainstream runner` at either skip-capture site and SHALL contain the
  unavailable-leg sentence `unavailable — host runner declares no skip format` at both;
  doctor.md SHALL contain the check-2 fold-in (undeclared nudge + staleness hint) and no
  new numbered check → tests/capabilities/consumer-alignment.test.js
- **AC-20260813-10-6**: WHEN the D6 sites are read THE SYSTEM SHALL find wf-review's
  discovery naming the configured `testCommand`/`reproCommand` with `package.json` only as
  an example, `Storybook` in wf-design and spec-design-driver.js only inside example
  parentheticals, and genesis-explore.md's STOP capability-shaped with tool names only in
  remedy text → tests/capabilities/consumer-alignment.test.js
- **AC-20260813-10-7**: WHEN release.md's poll loop is read THE SYSTEM SHALL CONTINUE TO
  default to 30s interval / 600s timeout when `ciPoll` is absent (regression pin on the
  current constants, green pre-change) → tests/capabilities/consumer-alignment.test.js
- **AC-20260813-10-8**: WHEN `verdict.js` derives a review-profile verdict from a manifest
  whose disposition branch yields CLEAN but whose `ci` leg observed value is `unavailable`
  (literal fixture: all legs green, ci observed `unavailable — no supported forge adapter`)
  THE SYSTEM SHALL return `CLEAN-with-qualifier` with the CLEAN-family exit code →
  tests/capabilities/verdict-qualifier.test.js
- **AC-20260813-10-9**: WHEN every leg is present and green THE SYSTEM SHALL CONTINUE TO
  return plain `CLEAN` (review profile) and release-profile derivation SHALL CONTINUE TO
  behave per spec 20260813/02's pins (regression pins, green pre-change) →
  tests/capabilities/verdict-qualifier.test.js
- **AC-20260813-10-10**: WHEN genesis-explore.md's screenshot STOP is read THE SYSTEM SHALL
  CONTINUE TO be a hard STOP on absent capture capability (the retagged AC-20260807-05-3
  pin — capability-shaped wording, unchanged hardness) → tests/model-placement.test.js

## Assumptions (escalation triggers)

- The contract-hash mechanism is warn-only at every comparison site (refuter-verified:
  spec-state-gate.sh echoes and exits 0; doctor calls it "a lead, not a verdict"). If a
  hard-block site surfaces → downgrade it for this additive case in the same spec.
- `verdict.js`'s manifest rows carry leg observed values in a shape D4 can inspect for the
  `unavailable` prefix (they do for ci today — the release branch tests exactly that). If a
  skip leg's unavailable marker can't reach the manifest → the leg's row schema gains it in
  D4's same edit, never a sibling word.
- `observe-ci.js` and `ci-query.js` share (or can share) the config-read without a new
  dependency — both are dependency-free Node scripts reading the same JSON. If their config
  discovery diverges → extract the tiny reader into lib/ (existing lib/glob-match precedent).

## Rationale

Audit provenance: Class C (C2, C3, C5, C6, C8, C11 via D6's discovery fix, C13) + F9 +
blind-spot findings. The class rule (holistic-not-additive): one declared-capabilities
mechanism consumed at single points, never per-site tool-name patching.

Refuter-driven corrections (two seats + blind-spot, 2026-08-13): D1's detection recipe was
rebuilt twice — init runs no tests today (the "probe run" cited machinery that doesn't
exist) and probe silence would mis-derive `"none"` on zero-skip suites; D2 moved forge
gating into the two CI scripts (five near-identical prose blocks would have tripped the
repo's own duplication review rule) and folded the doctor nudge into check 2 (three
stacked "run /spec:init" lines on every stale host otherwise); D4 (verdict.js row) was
added because `CLEAN-with-qualifier` is release-profile-only at HEAD — the wave's honest
`unavailable` legs would have been silently swallowed into plain CLEAN, the exact defect
being fixed; D3 pins the unchanged `skips=/todos=` observed format (`deriveTestsSkipped`'s
fixed regex would otherwise zero every host's count); escape.md's row was dropped (its
`gh run view` step is unreachable without a working forge — gating dead code); doctor
check 19 is NOT forge-gated (static text comparison, self-gated on `.github/workflows/`
existing); wf-enforce's MCP row was REJECTED (the mention is Context7, a fixed cross-host
plugin dependency — genericizing it would break a correct citation); atlas.md's row was
dropped (no hard STOP exists there — it already degrades gracefully); genesis-explore's
STOP keeps its pinned hardness with a same-commit retag; AC-3 was replaced with the D8
dogfood row (the original "regenerated at build time" described no real mechanism).

Build deviation (absorbed, no new Gotcha — the class is already recorded in the host rules'
Gotchas): D9's literal version-bump target 6.68.0 was taken at build time (plugin.json was at
6.71.0), so the doctrine batch bumped to the next free version, 6.72.0, with the same changelog
paragraph. The spec's literal number is a target, not a pin.

Review disposition (2026-08-14, runIds wf_aa92b4e0-575 → wf_e1da0ea6-94c): one hard finding,
execution-demonstrated — AC-20260813-10-6 names four D6 sites but its covering test pinned only
three, leaving wf-review's runner-discovery generalization unpinned while the AC and File Plan
both claimed coverage. Fixed in a fix-delta iteration (one added test block in
tests/capabilities/consumer-alignment.test.js); re-review CLEAN. The advisory smell lens flagged
the byte-identical `readForge` in both CI scripts; recorded in docs/audit/advisory-findings.md
rather than extracted, because a Fable retainer brief found `lib/glob-match.js` already carries a
third config read — the correct paydown is one shared `readConfig(root)` across all three sites,
not a `readForge`-only lib.

Deliberately excluded and routed to the follow-up roadmap brief
(docs/roadmap/06-mechanized-prose-checks.md): C1 (ac-matrix.js), C4 (doctor check-19
script), C7 (fidelity regionRef detection), C9 (merge-back branch-for), C10/C12 (doctor
migration gating). A GitLab/Bitbucket forge adapter is also out: `forge:"none"` honesty is
the contract; an adapter lands when a real host needs one.

## Canonical Delta

None.
