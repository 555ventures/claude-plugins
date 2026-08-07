---
date: 2026-08-07
status: implementing
open_markers: 0
risk: T3
area: doctrine-governance
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 01
---

# Claims registry: every blocking claim names its enforcement carrier

## Goal

End the prose-patch-before-mechanism pattern (measured: 5 patches/3 days on the dashboard
seam) by making the doctrine corpus's highest-stakes claims machine-auditable: every
blocking-consequence claim in `spec/commands/*.md` + `spec/doctrine/*.md` carries an inline
`enforcedBy:` pointer to a real carrier or an explicit `unenforced:` sanction, a deterministic
lint (`claims-lint.js`) gates version bumps on orphan claims and on the corpus line-count
ratchet, and `/spec:doctor` check 18 derives the full inventory on demand. Done = the lint is
green on a baseline it wrote, `review.md` is converted as the seed exemplar, the corpus is
strictly smaller than the 5,186 lines it started at, and a new orphan claim or unbudgeted
doctrine growth cannot ship without a visible, diffable baseline edit.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Pointers are inline HTML comments with a closed two-token vocabulary: `<!-- enforcedBy: <repo-path>[, <repo-path>…] -->` and `<!-- unenforced: <reason ≥20 chars> -->`, placed trailing on the claim's final line or as the immediately-following line | Pointer travels with the prose — rewording can't strand it; central registry rejected (a second copy of every claim = the drift disease one level up, violates shared.md § Doctrine Authoring one-binding-home) |
| D2 | The claim bar is a closed pattern list living as data in `claims-lint.js`: `**hard**`, `hard finding` (case-insensitive), and uppercase-only `\bSTOP\b`, `\bMUST\b`, `\bNEVER\b`, `\bALWAYS\b`. Lowercase normative prose is deliberately below the bar. Extending the list = a script edit with a pinning test, never a prompt clause | Blocking-consequence-only keeps the registry ~dozens of high-value entries (user-ruled); all-keywords rejected (99 lowercase "never"s in shared.md alone → sanction swamp + forbidden sweep); judgment-at-touch rejected (no floor — the honor system that failed 3-for-3) |
| D2a | Corpus = `spec/commands/*.md` + `spec/doctrine/*.md` + `spec/agents/*.md`. Explicitly excluded, each with its recorded reason: `spec/templates/` (copied into hosts; grounding-contract.md is hash-stamped T3 — a wording-only marker edit would flag every host's grounding stale), `git/commands/` (separate plugin, own version line — reopen as its own touched-file conversion if the git plugin gains a mechanism the registry should bind), `specs/` and `docs/` (artifacts, not doctrine) | Blind-spot pass found reviewer.md carrying 4 live `**hard**` claims (the canonical review floor) outside the brief's literal glob — including it is additive (one baseline row); the exclusions are decisions with reopen conditions, not oversights |
| D3 | `spec/scripts/claims-lint.js` is the sole derivation of the claims inventory and both ratchets; registered in `spec/bin/spec-paths` as `claims-lint`; modes `--check` (exit-code contract), `--json` (inventory for doctor), `--update-baseline` (sole baseline writer) | Mirrors the spec-status.js sole-derivation rule (v6.20.0); a second derivation of claim state anywhere recreates the freehand-drift incident class |
| D4 | One baseline file `spec/doctrine/claims-baseline.json` records per-file `{lines, orphans}` + corpus total; `--check` fails on ANY mismatch in either direction (growth = orphan/lines above baseline; stale baseline = actuals below it), each failure naming the direction and the remedy `node "$(spec-paths claims-lint)" --update-baseline` | Exact-match makes every line-count change a visible baseline hunk in the same commit — growth becomes a diffable act review sees, not a waivable File Plan estimate ("estimates, not contracts" is how 317→404 happened); one-direction-only would let deletions open silent regrow slack |
| D5 | Teeth are a repo test suite `tests/claims/claims-lint.test.js` (runs `claims-lint --check` against the live corpus + synthetic fixtures; part of `npm test`, which gates every version bump) plus doctor check 18 (script-driven: run `--json`, report orphans/stale pointers/baseline drift — recommendations only, never edits) | The intake-discipline pairing (spec 20260805/04) is the proven shape: deterministic test blocks new rot at the bump, doctor surfaces legacy rot on demand; doctor-only rejected (report-only cadence is what allowed 5 patches in 3 days) |
| D6 | Seed migration converts `spec/commands/review.md` ONLY: its 3 live bar-matching lines (refuter-verified against the D2 bar with fence exclusion: `STOP` at line 20, `**hard**`/`hard finding` at 67 and 108; line 292's "hard findings" sits inside an indented fence — example output, correctly excluded, no marker) each get a pointer or sanction, and prose restating what a named carrier already enforces shrinks to the pointer per shared.md § Doctrine Authoring — the dedup, not the marker count, is where review.md's net-lines value lives. All other files enter the baseline at their current orphan counts, converted only at touch-time | Touched-file-only is doctrine (never a sweep); the brief's intake-`mechanism()` seeding is dropped — zero live rows carry that value (2026-08-07 survey), so the real seeds are the scaffold-ledger's carriers and the ~14 existing doctrine-pin tests |
| D7 | The marker convention text (both tokens, placement rule, claim bar pointer) lives in shared.md § Doctrine Authoring as ~4 added sentences — the single binding home; doctor.md's check 18 and the lint's header cite it, never restate it. The convention's own governing claim carries the first live marker in shared.md (`<!-- enforcedBy: spec/scripts/claims-lint.js -->`) — self-referentially correct, and it makes AC-7's shared-for passthrough pin exercise a real marker instead of a hypothetical | One binding home per rule, applied to the rule about binding homes; without a live marker in shared.md the AC-7 tripwire tests nothing this spec produces (blind-spot finding) |
| D8 | The lint enters `spec/doctrine/scaffold-ledger.md` as a `gate` row the same run it enters the pipeline, with promote/retire conditions on both halves (claim markers, line ratchet) | Ledger contract: no mechanism ships without naming the measurement that retires it; a missing row is itself a hard review finding |
| D9 | Net-lines-down for THIS spec is an AC with literal numbers: corpus total after all edits < 5186 (the 2026-08-07 pre-spec `wc -l` total: 5,114 commands+doctrine + 72 agents) | The brief's hard constraint, made falsifiable for the spec that lands it — the third consecutive prose promise would be farce |
| D10 | `claims-baseline.json` is generated, not authored: the build orchestrator runs `--update-baseline` as the last integration step of the final batch, AFTER review.md's dedup and every doctrine edit. AC-4/AC-8's live-corpus tests are expected red until that step — the standard red-first state, not a defect | Batch order (tests → doctrine → scripts → other) lands the baseline last by construction; stamping it earlier records totals the dedup then invalidates (blind-spot finding) |
| D11 | `.claude/rules/spec-pipeline.md` § Review Checks gains one mechanical bullet: a diff hunk in `spec/commands/*.md`, `spec/doctrine/*.md`, or `spec/agents/*.md` that changes line counts, with no `claims-baseline.json` hunk in the same diff, is **hard** | Refuter-2 hole: other specs' scoped gates never run tests/claims/, and full `npm test` is already red with sanctioned INTAKE pins — without a review-visible check, ratchet drift accumulates silently between claims-scoped runs; same class as the existing version-bump bullet, NOT the frozen reviewer-quality surface (the brief freezes insight/panel/kill criteria, not mechanical diff checks) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/claims-lint.js | CREATE | scripts | Sole derivation: marker parse, claim-bar scan, dual ratchet; `--check`/`--json`/`--update-baseline`; header cites this spec + exit codes 0/1/2 |
| spec/doctrine/claims-baseline.json | CREATE | other | Generated per D10: orchestrator runs `--update-baseline` as the final integration step; never hand-authored |
| spec/bin/spec-paths | MODIFY | scripts | Add `claims-lint` key + usage-string entry |
| spec/doctrine/shared.md | MODIFY | doctrine | § Doctrine Authoring gains the marker convention (~4 sentences, D7) incl. the first live marker; no other section touched |
| spec/commands/doctor.md | MODIFY | doctrine | Check 18: run `node "$(spec-paths claims-lint)" --json`, report findings; cites § Doctrine Authoring for the convention |
| spec/commands/review.md | MODIFY | doctrine | Seed conversion (D6): pointers/sanctions on every bar-matching claim; touch-time dedup of prose restating named carriers |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D8 gate row with promote/retire conditions |
| tests/claims/claims-lint.test.js | CREATE | tests | AC-20260807-04-1 … AC-20260807-04-6, AC-20260807-04-8 |
| tests/claims/claims-doctrine.test.js | CREATE | tests | AC-20260807-04-9 — doctrine pins pairing the doctor.md + shared.md rows (§ Planning row-pair rule) |
| tests/spec-paths.test.js | MODIFY | tests | Tag existing shared-for extraction coverage with AC-20260807-04-7 (regression pin) |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | § Review Checks: the D11 baseline-hunk bullet; § Risk Tiers: claims-lint.js joins the sole-derivation T3 list |
| spec/.claude-plugin/plugin.json | MODIFY | other | Version bump + description changelog line |

## Contracts

```
claims-lint.js
  --root <dir>            corpus root (default .); corpus = spec/commands/*.md + spec/doctrine/*.md
                          + spec/agents/*.md (D2a; exclusions are decisions recorded there)
  --check                 exit 0 clean; exit 1 findings (orphan claim, unresolvable enforcedBy path,
                          unenforced reason <20 chars, baseline mismatch either direction);
                          exit 2 usage error / corpus or baseline unreadable
  --json                  single JSON object: { files: {path: {lines, claims, orphans, sanctions}},
                          totalLines, baseline: {stale: bool, deltas: [...]},
                          findings: [{file, line, kind, detail}] } — the only machine format
  --update-baseline       rewrite claims-baseline.json to actuals, exit 0; the ONLY writer

marker grammar (binding home: shared.md § Doctrine Authoring):
  <!-- enforcedBy: path[, path…] -->   every path must exist in the repo
  <!-- unenforced: reason -->          reason ≥ 20 chars
  association: same line as the claim, or the marker is the entire next non-blank line
    (binds to nearest preceding non-blank content line)

claim bar (data constant in claims-lint.js, D2):
  /\*\*hard\*\*/  ·  /hard finding/i  ·  /\bSTOP\b/  ·  /\bMUST\b/  ·  /\bNEVER\b/  ·  /\bALWAYS\b/
  (last four match uppercase only; fenced code blocks and HTML comments excluded from scanning;
   fence detection MUST tolerate indented delimiters — this corpus routinely indents ``` inside
   numbered-list items, e.g. review.md:291, init.md:182)
```

## Behavior

- **Orphan** = a line matching the claim bar with no associated marker, in excess of the
  file's baselined orphan count. Unconverted files therefore pass at their recorded counts;
  adding a NEW bar-matching line without a marker anywhere pushes actual > baseline → red.
- **Deleting or converting** claims pushes actual < baseline → also red (stale baseline),
  forcing the ratchet-down commit that makes shrinkage durable. Both failure messages name
  `--update-baseline` as the remedy.
- **Doctor check 18** (script-driven, like checks 14/16): runs `--json`, reports orphans per
  file, unresolvable pointers, sanction-reason violations, and baseline drift. Output is
  recommendations only. Stale-pointer repairs ride the existing `--fix` per-patch path.
- **Scanning exclusions**: fenced code blocks (``` … ```) and the markers themselves never
  count as claims — the lint must not flag its own vocabulary or quoted examples. Known,
  accepted limitation: a genuine claim living inside a code fence (e.g. init.md's generated-CI
  prose) is invisible to the lint — deterministic scanning cannot tell quoted from live prose
  inside fences; doctor's semantic spot-check and touch-time conversion are the route for
  those, never a heuristic in the scanner.
- The lint never edits any file under `--check`/`--json`; `--update-baseline` writes exactly
  one file.

## Acceptance Criteria

- **AC-20260807-04-1**: WHEN `--check` runs against a corpus containing
  `<!-- enforcedBy: spec/scripts/no-such-file.js -->` THE SYSTEM SHALL exit 1 with a finding
  naming the file, line, and missing path (`no-such-file.js` → `stale-pointer` finding) →
  tests/claims/claims-lint.test.js
- **AC-20260807-04-2**: WHEN a fixture file gains a new line `X is a **hard** finding.` with
  no marker while the baseline records that file at 0 orphans THE SYSTEM SHALL exit 1 with an
  `orphan-claim` finding citing that line → tests/claims/claims-lint.test.js
- **AC-20260807-04-3**: WHEN a marker reads `<!-- unenforced: too vague -->` (9 chars) THE
  SYSTEM SHALL exit 1 with a `sanction-reason` finding; `<!-- unenforced: model-judgment step,
  no deterministic carrier exists -->` (≥20 chars) SHALL pass → tests/claims/claims-lint.test.js
- **AC-20260807-04-4**: WHEN any file's actual `{lines, orphans}` differs from
  claims-baseline.json in EITHER direction THE SYSTEM SHALL exit 1 naming the file, both
  values, the direction, and the literal remedy string
  `node "$(spec-paths claims-lint)" --update-baseline` → tests/claims/claims-lint.test.js
- **AC-20260807-04-5**: WHEN `--json` runs THE SYSTEM SHALL emit exactly one parseable JSON
  object with keys `files`, `totalLines`, `baseline`, `findings` and no other stdout →
  tests/claims/claims-lint.test.js
- **AC-20260807-04-6**: WHEN `--check` scans a fenced code block containing `**hard**` — the
  fixture MUST include an INDENTED fence (three-space, inside a numbered-list item, the shape
  at review.md:291 and init.md:182) — or a line that is itself an `enforcedBy:` marker THE
  SYSTEM SHALL count zero claims for those lines → tests/claims/claims-lint.test.js
- **AC-20260807-04-7**: WHEN `spec-paths shared-for plan` runs after markers land in
  shared.md THE SYSTEM SHALL CONTINUE TO emit the same `## ` section set as before the
  markers (HTML-comment lines pass through section extraction unchanged) →
  tests/spec-paths.test.js (existing coverage tagged)
- **AC-20260807-04-8**: WHEN `--json` runs at this spec's review THE SYSTEM SHALL report
  `totalLines` < 5186 and `files["spec/commands/review.md"].orphans` = 0 →
  tests/claims/claims-lint.test.js (live-corpus assertion; expected red until D10's final
  baseline step)
- **AC-20260807-04-9**: WHEN tests read the landed doctrine THE SYSTEM SHALL find in
  `spec/commands/doctor.md` a check 18 invoking `spec-paths claims-lint` with `--json`, in
  `spec/doctrine/shared.md` § Doctrine Authoring both literal tokens `enforcedBy:` and
  `unenforced:` plus one live `<!-- enforcedBy: spec/scripts/claims-lint.js -->` marker, and
  in `.claude/rules/spec-pipeline.md` § Review Checks a bullet naming `claims-baseline.json`
  (the D11 pin) → tests/claims/claims-doctrine.test.js

## Assumptions (escalation triggers)

- A1: The D2 pattern list yields exactly 4 bar-matching lines in review.md as of 2026-08-07
  (refuter-executed grep; corpus-wide the bar stays in the dozens) with near-zero false
  positives — **if false** (patterns flag quoted examples or template prose en masse): the
  exclusion rules (fenced blocks, comments) are extended in the script with a pinning test;
  the bar itself never widens mid-build.
- A2: HTML-comment markers survive every existing consumer of these files — `spec-paths
  shared-for` awk extraction passes comment lines through, doctrine-pin tests match on
  substrings unaffected by trailing comments — **if false**: the marker moves to
  next-line-only placement (association rule already supports it); AC-7 is the tripwire.
- A3: review.md's touch-time dedup (prose restating what verdict.js, scope-reconcile.js, and
  the verifier contract already enforce) yields enough deletion to keep the D2a corpus under
  5,186 total despite ~4 added sentences in shared.md and check 18 in doctor.md — **if
  false**: STOP, ask the user whether to extend dedup to a second file or record a sanctioned
  baseline raise; never silently waive AC-8 (that waiver is the incident).
- A4: `npm test` red-pin baseline (sanctioned failing INTAKE pins) does not mask new
  tests/claims failures — pipeline-scoped gate runs use the glob form
  `node --test 'tests/claims/*.test.js'` per the Gotchas entry — **if false**: STOP (gate
  wiring defect, not a test defect).
- A5: No consumer parses claims-baseline.json except claims-lint.js — **if false**: the
  second consumer requires a lib/ extraction per the file-plan.js precedent; blocked until
  planned.

## Rationale

The 20260805 series proved two things at once: mechanisms work (scope-reconcile, verdict.js,
intake discipline all landed and bite) and prose promises don't — "net doctrine lines down"
was written into two File Plans and waived in both reviews, with spec 02 demoting the
promise class to "estimates, not contracts" and explicitly deeding "the general problem" to
this brief. This spec is that debt called in: the same three-layer shape as intake
discipline (convention text → deterministic script → repo test + doctor consumer), aimed at
the doctrine corpus itself.

The interview locked all four forks toward the recommended options: inline markers (locality
beats a central registry that would re-create drift one level up), a blocking-consequence-only
bar (the corpus survey killed all-keywords — normativity here is mostly casual lowercase
prose), the intake-discipline teeth pairing, and an exact-match dual ratchet (one-directional
ratchets leave regrow slack; the 317→404 growth happened in exactly that slack).

Two brief assumptions were corrected against live evidence: intake `mechanism()` pointers
cannot seed the registry (zero live rows use the value — it exists only in INTAKE.md's
explanatory prose), and there is no existing HTML-comment convention to extend (the corpus
has zero comments — the marker grammar is net-new and therefore gets one binding home in
§ Doctrine Authoring, D7). Fragile spots to watch during execution: the claim-bar scan's
exclusion rules (A1) and the AC-8 literal (A3) — the build must sequence review.md's dedup
before stamping the baseline, or `--update-baseline` records a total the dedup then
invalidates.

One scanning note the blind-spot pass surfaced: scaffold-ledger.md's table rows legitimately
contain bar phrases as *data about mechanisms* ("mechanical hard finding" in row 47's cell).
No special-casing — those files enter the baseline at their current orphan counts like every
other unconverted file, and their conversion happens at touch-time with everything else. The
baseline semantics absorb data-like hits by construction; a heuristic "this hard is data"
exemption in the scanner would be the taste-in-checker mistake the pipeline keeps rejecting.

Refuter dispositions (Phase 3, refuter 1 — all four findings FIXED, none rejected): (1) tier
upgraded T2→T3 — the `spec-paths` key addition is a listed T3 trigger this plan initially
missed; the mechanical rubric, not judgment, decides. (2) D6/A1's "16 hard hits" corrected to
the refuter-executed 4 bar-matching lines — the 16 came from a loose word-grep, not the D2
bar; review.md's net-lines value is the dedup, not marker volume. (3) Goal's 5,114 corrected
to the D2a-corpus 5,186. (4) doctor.md/shared.md doctrine edits gained their pinning-test
pair (AC-9, tests/claims/claims-doctrine.test.js) per pipeline rules § Planning.

Refuter dispositions (Phase 3, refuter 2 — both findings FIXED, risk flag adopted as D11):
(1) review.md's line 292 is inside an indented fence — example output, not a live claim; D6
corrected to 3 lines, fence detection pinned indentation-tolerant (AC-6 fixture extended;
init.md:182 shows the same corpus-wide shape). (2) A3's ceiling corrected 5,114 → 5,186 (was
comparing against the commands+doctrine subtotal, a spuriously stricter bar that could fire
a false STOP). (3) The flagged silent-drift hole — other specs' scoped gates never run
tests/claims/ and full npm test is already red with sanctioned pins — is closed in-spec by
D11's mechanical Review Checks bullet rather than deferred to a follow-up brief.

## Canonical Delta

docs/canonical/doctrine-governance.md (CREATE): the claims-registry contract — marker
grammar and its binding home (shared.md § Doctrine Authoring), the D2 claim bar, the sole
derivation (`claims-lint.js` via `spec-paths claims-lint`), the dual-ratchet baseline
semantics (exact-match, `--update-baseline` sole writer), the touched-file-only migration
rule, and the seed state (review.md converted 2026-08-07; all other files baselined at their
pre-conversion orphan counts).
