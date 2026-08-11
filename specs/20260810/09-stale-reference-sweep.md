---
date: 2026-08-10
status: hardened
risk: T3                 # edits spec/templates/grounding-contract.md (hash-stamped into every host) and spec/bin/spec-paths (new key) — both T3 triggers per pipeline rules § Risk Tiers
area: cross-cutting
design: false
breaking: false
depends_on: [20260810/08-command-conflict-fixes]   # overlapping files: review.md, release.md, doctor.md, init.md, genesis-design.md
depended_on_by: [20260810/10-drift-duplicate-reconcile]
brief: n/a               # audit-driven fix wave (command-surface audit 2026-08-10), slice 2 of 3
open_markers: 0
---

# Stale-reference sweep: retired mechanisms, dead citations, and the checker that keeps them dead

## Goal

Slice 2 of the 2026-08-10 command-surface audit fix wave: twelve findings where doctrine
references mechanisms that were retired, scripts that behave differently, or `§` headings
that don't exist — each one misdirects a fresh session that takes the text at face value.
This spec deletes or corrects every one, and lands a small deterministic checker
(`citations-check.js`, advisory doctor check 20) so the `§`-citation class — six instances
in this audit alone — can never silently accumulate again. Done means a fresh session
following any corrected passage reaches a mechanism that actually exists.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | init.md stops generating the `"build": {"workspace": "ask"}` config knob and deletes its per-run-prompt semantics plus the companion prose ("/spec:build's worktree workspace", init.md Phase 2 region). enter-worktree.md's "the same branch rule `/spec:build` uses" is reattributed: the branch rule is owned **here and by `{mergeBack} create`** (build.md has no branch rule — it disowns all worktree mechanics). No migration for existing hosts: the knob is read by nothing, so stale configs are inert; doctor check 1 audits per the contract file, which never listed it. | ✕3-corroborated dead mechanism; every fresh host was being configured with a knob nothing consumes. |
| D2 | init.md's grounding checklist drops "T3 checkpoint surfaces" (mandatory checkpoints retired in v5 per shared.md § Model Placement and the scaffold ledger's RETIRED row). The host pipeline-rules *template regions* init generates drop the same item; already-generated host files are regenerated only by their own re-init (out of scope, by design). | Every new host was documenting a mechanism nothing consumes. |
| D3 | "Refutation filter" is renamed to the live mechanism's name — **execution-grounded verification** — in review.md, doctor.md (check 12's `killedMatch` gloss), and escape.md. The ledger field name `killedMatch` is wire-compatible and stays; prose describes it as "a verifier kill of a finding that later proved real". The automatic-hard path's "skips the refutation filter" wording becomes "skips verification", and review.md's companion "no refutation" fragment (the automatic-hard grep-matrix sentence) becomes "no verifier pass — it is a deterministic fact". Out of scope, adjudicated: `.claude/commands/doctrine-review.md`'s mention is historical evidence framing ("the refutation-filter retirements are measured evidence"), not a live-mechanism description — renaming it would falsify the history it cites. | Argument-based refutation was retired (shared.md § Risk Tiers); the stale name misdescribes what the strongest re-tuning signal in the ledger means. |
| D4 | grounding-contract.md gains the `design.copyCatalogs` key (REQUIRED for i18n hosts, matching init.md's generation and wf-design's consumption) — the **single sanctioned contract edit of this fix wave** (hash changes; every host's doctor check 2 will flag stale grounding until re-init, which is the mechanism working as designed). init.md's runtime example gains the `stopSignal` line the contract already defines. | Doctor check 1 audits "per the contract file"; a key the design stage depends on must exist in the audited authority. |
| D5 | The ledger `ts` templates change from `"ts":"<YYYY-MM-DD>"` to `"ts":"<ISO-8601>"` in **all four carriers**: review.md and release.md (written by verdict.js `toISOString()` — executed evidence), plus escape.md and build.md (hand-appended rows; the template steers sessions to the same format so one append-only ledger doesn't hold two timestamp shapes). | The pinned "exact printed shape" was falsified by the only script writer, and refuters found the same stale literal in two more templates — one in a file this spec already edits. |
| D6 | manifest-check.sh's summary gains one **machine sentinel line** printed after the existing human prose lines: `TOTAL=<n> FAILS=<n> INERT=<n>` (the sentinel-line convention pipeline rules § Worker Rules mandates for machine contracts; the prose summary sentences stay for humans). release.md's substrate paragraph consumes the sentinel's three counts verbatim instead of attributing an INERT count the script never printed. Exit codes unchanged (0/1 on FAILS); script header documents the sentinel. | The orchestrator was told to read a number that was never printed, and today's `$TOTAL` only exists inside prose sentences — hand-parsing prose corrupts the `substrate` field verdict.js parses; a sentinel line makes the counts a contract. |
| D7 | The build fixes **every MISS `citations-check.js` reports on its first run** — the checker is the complete enumerator; the audit's six read-verified instances are a subset. Each miss is repointed to the real `## ` heading or reworded to non-§ prose (a run-in bold paragraph is cited by quoting its bold lead, never with `§`). Known instances beyond the audit's six (refuter-executed pre-scan): genesis-design.md's `genesis.md § Hard-to-Reverse Dimensions` (real heading leads with "Genesis:"); the three `shared § Grounded vs taste` citations (target is run-in prose, not a heading); init.md's bare `§ Worker Rules and § Test Rules` (targets live in the generated pipeline-rules file — name the file, or reword). The audit's six: review.md's merge-back exit-alphabet citation (→ the merge-back script header, not "shared § Risk Tiers"); shared.md's retired "Model fork paragraph" name (→ the judgment-points list); shared.md's "(§ Base primitives)" and plan.md's `§ "Claude Design as a source"` run-in targets (reword); shared.md's "init § Design foundation" (→ the literal `## ` heading in init.md); plan.md's § Design Canon / § Design Binding Pipeline citations gain the same "not loaded by shared-for plan — full text in shared.md" note review.md already carries. Wrapped-but-valid citations are NOT reflowed (the checker's two-line window handles them). | The § grammar is machine-filtered (`shared-for` silently drops mismatches) and review treats miscitations as hard findings — and refuters found the live corpus holds more broken citations than any hand-list; only the checker's own output is a complete work-list. |
| D8 | Small dead references, one edit each: genesis-design.md's "architect Phase 3 wf-research / Phase 4 wf-panel" → the real homes (Phase 1 / Phase 3; architect has no Phase 4); the explore state enum in **spec/doctrine/genesis.md** (§ Genesis: State Machine — there is no spec/commands/genesis.md) gains `positions-authored` (the intermediate state that same file and genesis-explore.md both mandate writing); escape.md's claim that the red observe row carries branch/sha/url "in its `note`" → top-level fields (observe-ci.js writes them top-level; only the `--next` oracle entry uses `note`); review.md's un-namespaced "D1"/"D7" decision labels gain their owning spec ids (20260805/02's D-numbers); doctor.md + init.md's "/spec:design Phase 4" naming → the driver-stepped stage name. | Each is a one-line correction whose current text sends a reader to a mechanism or location that does not exist. |
| D9 | NEW `spec/scripts/citations-check.js` — deterministic, zero-dependency: scans `spec/commands/*.md`, `spec/doctrine/*.md`, `spec/agents/*.md`, `git/commands/*.md`. **Line handling:** hard-wrapped citations are real in the live corpus (refuter-executed: review.md, atlas.md, design.md, escape.md, plan.md, release.md all wrap a citation across a line break), so the scanner matches against each line **joined with its successor** (two-line window, matches deduplicated by file:line) — never single lines alone. **Resolution (lookback of up to two words before `§`):** `shared` / `shared.md` / `shared invariants` → spec/doctrine/shared.md; `genesis.md` / the genesis supplement idiom → spec/doctrine/genesis.md; a `<name>.md` token or scanned basename → that file; `pipeline rules` → skipped **by design** (host-generated file); any other file-word → skipped. Skips are loud, never silent: summary is `TOTAL=<n> CHECKED=<c> SKIP=<s> MISS=<m>`, and `--verbose` lists every skipped citation so coverage is inspectable. **Match rule:** the cited name prefix-matches a `## ` heading in the resolved file (prefix tolerates parentheticals, byte-for-byte otherwise — the identical rule review checks and conventions/doctrine.md state). One `MISS <file>:<line> § <Name> → <resolved file>` line per miss; exit 0 when the scan completes (advisory), 2 on usage error. Wired as **doctor check 20 (advisory)** via a new `citations-check` spec-paths key. One scaffold-ledger row: promote to blocking after two consecutive `MISS=0` releases; retire if `shared-for` filtering is ever replaced. | Six broken citations accumulated silently in one audit cycle; refuters demonstrated the naive line-local single-token grammar mis-handles the corpus's dominant idioms (71% of citations use `shared invariants §`-style two-word forms; wrapped citations produce false misses) — the grammar above is designed against the measured corpus, not an assumed one. |
| D10 | spec plugin version bumps by one minor at build time — **expected 6.52.0 → 6.53.0** assuming the 07→08→09 landing order; binding rule is *then-current + one minor* (the 06/07 dual claim on 6.51.0 shifts the chain — see sibling 08 D12). Description gains the sweep + check-20 clause. | The bump is the discipline; the number is derived at build. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/init.md | MODIFY | doctrine | D1 workspace knob out; D2 checkpoint grounding out; D4 stopSignal example; D8 design-stage naming |
| git/commands/enter-worktree.md | MODIFY | doctrine | D1: branch-rule attribution |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D4: `design.copyCatalogs` key (the wave's single contract edit) |
| spec/commands/review.md | MODIFY | doctrine | D3 rename; D5 ts template; D7 merge-back citation; D8 namespaced D-labels |
| spec/commands/release.md | MODIFY | doctrine | D5 ts template; D6 consume INERT= |
| spec/commands/doctor.md | MODIFY | doctrine | D3 killedMatch gloss; D8 design-stage naming; D9 check 20 |
| spec/commands/escape.md | MODIFY | doctrine | D3 rename; D8 observe-row field placement |
| spec/doctrine/shared.md | MODIFY | doctrine | D7: Model-fork-paragraph name, run-in targets, init § Design foundation |
| spec/commands/plan.md | MODIFY | doctrine | D7: out-of-scope note on § Design Canon / § Design Binding Pipeline citations |
| spec/doctrine/genesis.md | MODIFY | doctrine | D8: `positions-authored` in the explore enum (§ Genesis: State Machine) |
| spec/commands/build.md | MODIFY | doctrine | D5: ledger `ts` template → ISO-8601 |
| .claude/rules/spec-pipeline.md | MODIFY | other | D2 companion: delete this repo's own stale "T3 checkpoint surfaces" line (dogfood grounding; regeneration untouched) |
| spec/commands/genesis-design.md | MODIFY | doctrine | D8: architect phase references |
| spec/scripts/citations-check.js | CREATE | scripts | D9: the § citation checker (header + exit codes per Worker Rules) |
| spec/scripts/manifest-check.sh | MODIFY | scripts | D6: INERT= summary count |
| spec/bin/spec-paths | MODIFY | scripts | D9: additive `citations-check` key |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D9: check-20 row with promote/retire conditions |
| tests/consistency/citations-check.test.js | CREATE | tests | AC-20260810-09-1 … AC-20260810-09-6 |
| tests/consistency/stale-refs.test.js | CREATE | tests | AC-20260810-09-7 … AC-20260810-09-12 |
| spec/doctrine/claims-baseline.json | MODIFY | other | claims ratchet after doctrine edits |
| spec/.claude-plugin/plugin.json | MODIFY | other | D10: bump 6.52.0 → 6.53.0 + description clause |

## Contracts

```text
citations-check.js CLI (new):
  usage: citations-check.js [--root <dir>] [--verbose]
  scans: spec/commands, spec/doctrine, spec/agents, git/commands (*.md under --root, default .)
  matching window: each line JOINED with its successor (wrapped citations are live in the
    corpus); matches deduplicated by file:line so the overlap never double-counts
  grammar: §-anchored; up to TWO words of lookback before § form the file reference; the
    heading name runs to the first . , ; : ) or end-of-window
  resolution: "shared" | "shared.md" | "shared invariants" → spec/doctrine/shared.md;
    "genesis.md" → spec/doctrine/genesis.md; "<name>.md" or a scanned basename → that file;
    "pipeline rules" → SKIP by design (host-generated); bare § → the citing file itself;
    any other file reference → SKIP
  match: cited name must prefix-match a "## " heading in the resolved file (prefix
    tolerates parentheticals, byte-for-byte otherwise)
  stdout: MISS <file>:<line> § <Name> → <resolved file>  (one per miss)
          final sentinel: TOTAL=<n> CHECKED=<c> SKIP=<s> MISS=<m>
          --verbose additionally lists every SKIP with its reason
  Exit codes: 0 = scan completed (regardless of misses — advisory) · 2 = usage error

manifest-check.sh (changed): prose summary unchanged; one machine sentinel line added:
  TOTAL=<n> FAILS=<n> INERT=<n>   · exit codes unchanged (0/1 on FAILS)

spec-paths (changed): new key `citations-check` → spec/scripts/citations-check.js

grounding-contract.md (changed): design.copyCatalogs key added (REQUIRED for i18n hosts);
  contract hash changes — every host flags stale until re-init (sanctioned)
```

## Behavior

- **Claims registry:** doctrine line counts change across many files — the claims-baseline
  row is mandatory; run `node "$(spec-paths claims-lint)" --update-baseline` in the same
  batch as the doctrine edits.
- **Checker self-application:** after D7's repointing, `citations-check.js` run against this
  repo must report `MISS=0` — the checker's first clean run is the executed proof that D7
  actually closed every instance (and the smoke evidence for check 20's ledger row).
- **D9 scope boundary:** the checker validates `§` citations only — never file paths (doctor
  check 7 owns those) and never claims content (claims-lint owns that).

## Acceptance Criteria

- **AC-20260810-09-1**: WHEN `citations-check.js` runs against a fixture tree where `a.md`
  cites `b.md § Real Heading` (exists) and `b.md § Ghost` (doesn't) THE SYSTEM SHALL print
  exactly one MISS line naming `a.md`, the line number, `Ghost`, and `b.md`, plus the
  sentinel `TOTAL=2 CHECKED=2 SKIP=0 MISS=1`, and exit 0 → tests/consistency/citations-check.test.js
- **AC-20260810-09-2**: WHEN a citation names a heading that prefix-matches with a trailing
  parenthetical (`§ Escalation Contract` vs `## Escalation Contract (build)`) THE SYSTEM
  SHALL count it a match; WHEN a fixture wraps a citation across a line break (`…shared\n§
  Real Heading…`) THE SYSTEM SHALL resolve it via the two-line window exactly as unwrapped;
  WHEN the two-word idiom `shared invariants § Real Heading` appears THE SYSTEM SHALL
  resolve it to shared.md; and WHEN the file reference is unresolvable (`gh § Something`)
  or is `pipeline rules § X` THE SYSTEM SHALL count a SKIP, never a MISS →
  tests/consistency/citations-check.test.js
- **AC-20260810-09-3**: WHEN `citations-check.js` runs against this repo after this spec's
  doctrine edits THE SYSTEM SHALL print `MISS=0` → tests/consistency/citations-check.test.js
  (executed against the live tree — this is D7's proof)
- **AC-20260810-09-4**: WHEN `citations-check.js` is invoked with an unknown flag THE SYSTEM
  SHALL print the usage line to stderr and exit 2 → tests/consistency/citations-check.test.js
- **AC-20260810-09-5**: WHEN `spec-paths citations-check` runs THE SYSTEM SHALL print the
  script's absolute path, and doctor.md SHALL contain check 20 (advisory) invoking it with a
  scaffold-ledger row carrying promote/retire conditions → tests/consistency/citations-check.test.js
- **AC-20260810-09-6**: WHEN `manifest-check.sh` runs against a manifest with 2 passing, 1
  failing, 1 inert row THE SYSTEM SHALL print the machine sentinel line
  `TOTAL=4 FAILS=1 INERT=1` and SHALL CONTINUE TO exit 1 on the failing row and print the
  existing prose summary sentence → tests/consistency/citations-check.test.js
- **AC-20260810-09-7**: WHEN tests read init.md THE SYSTEM SHALL find no `"workspace"` knob
  generation and no "T3 checkpoint surfaces" grounding item, and enter-worktree.md SHALL
  attribute the branch rule to itself/merge-back create (no "rule `/spec:build` uses") →
  tests/consistency/stale-refs.test.js
- **AC-20260810-09-8**: WHEN tests read review.md, doctor.md, and escape.md THE SYSTEM SHALL
  find zero occurrences of "refutation filter" and at least one "execution-grounded"
  description alongside `killedMatch` → tests/consistency/stale-refs.test.js
- **AC-20260810-09-9**: WHEN tests read grounding-contract.md THE SYSTEM SHALL find
  `design.copyCatalogs` documented as REQUIRED for i18n hosts, and init.md's runtime example
  SHALL mention `stopSignal` → tests/consistency/stale-refs.test.js
- **AC-20260810-09-10**: WHEN tests read the ledger templates in review.md, release.md,
  escape.md, and build.md THE SYSTEM SHALL find zero `"ts":"<YYYY-MM-DD>"` literals across
  all four (the ISO-8601 form replaces each) → tests/consistency/stale-refs.test.js
- **AC-20260810-09-11**: WHEN tests read spec/doctrine/genesis.md THE SYSTEM SHALL find
  `positions-authored` in the explore state enum, and escape.md SHALL describe the observe
  row's branch/sha/url as top-level fields → tests/consistency/stale-refs.test.js
- **AC-20260810-09-12**: WHEN tests read the observe-row exemption in doctor.md check 12 THE
  SYSTEM SHALL CONTINUE TO exempt observe rows from tier/runId expectations (D3's rename
  must not disturb spec 08's check-12 text) → tests/consistency/stale-refs.test.js

## Assumptions (escalation triggers)

- A1: ~~The § grammar in live doctrine is line-local~~ — **refuter-falsified 2026-08-10**
  (live wrapped citations in review.md, atlas.md, design.md, escape.md, plan.md,
  release.md); the two-line matching window is therefore designed into D9's Contracts, not
  held as a fallback. Residual assumption: no citation spans **three** physical lines.
  **if false:** widen the window to three lines; the dedup rule is window-size-independent.
- A2: No test pins the exact `"ts":"<YYYY-MM-DD>"` literal or the phrase "refutation filter"
  (plan-time grep over tests/ found neither). **if false:** update the pinning test in the
  same row pair; an incident-headered pin escalates per pipeline rules § Build.
- A3: `design.copyCatalogs` is consumed by wf-design under exactly that key (init.md and the
  workflow agree at plan time). **if false:** blocked — the contract must document the key
  the consumer actually reads; verify against wf-design source before writing.
- A4: Adding a spec-paths key is additive-only (a new case arm; existing keys untouched).
  **if false:** STOP — spec-paths is a T3 surface; any non-additive change needs its own
  spec.
- A5: Spec 08 lands first (`depends_on`) so this spec's doctor.md check-12 edits (D3 rename)
  apply on top of 08's threshold/exemption text — **if false:** rebase the wording; the two
  edits touch different sentences of the same check.

## Rationale

Slice 2 of the three-spec fix wave (see 08's Rationale for the wave's shape). Everything here
shares one failure mode: text that misdirects a cold reader toward a mechanism that no longer
exists — worse than absence, because it reads as authority. Fixes are deletions and
one-line corrections; the one mechanism added (D9) exists because this class demonstrably
regrows (six § miscitations accumulated since the grammar was hardened) and is exactly
checkable by the rule review already enforces on diffs — doctor check 20 extends it repo-wide
at advisory severity, entering through the scaffold ledger like every guard.

D6 chose extending manifest-check.sh over correcting release.md's prose to "count the lines
yourself" — the count feeds `substrate` in the ledger row verdict.js parses, so a script must
own it (same reasoning as the verdict derivation itself). D4 is the wave's single
grounding-contract edit, honoring the one-edit-per-spec cap; the hash change is the contract
working, not collateral. The File Plan runs 21 rows against the ~15 guideline: every row is a
one-to-three-line edit, and splitting further would spend two more pipeline runs re-touching
the same files for no isolation gain — recorded here as a deliberate cap overrun.

Adversarial check (2 refuters, T3): eight findings, seven accepted and folded, one
adjudicated out of scope. Accepted: the checker's original line-local single-token grammar
was executed against the live corpus and failed its own self-application proof (25 misses
none of which were D7's six; 71% of citations silently skipped because the dominant idiom
is two-word forms like "shared invariants § X"; live wrapped citations in six files
falsified A1 outright) — D9's grammar was redesigned against the measured corpus (two-line
window, two-word lookback, loud SKIP accounting) and D7 was broadened from a six-item
hand-list to "every MISS the first run reports"; the File Plan's genesis path was wrong
(spec/doctrine/genesis.md, not spec/commands/); AC-6's `TOTAL=4` demanded a token no
Decision authorized — D6 now specifies the full machine sentinel line; the stale `ts`
literal also lives in escape.md and build.md (both now in D5); this repo's own generated
pipeline-rules file carries the retired checkpoint line D2 deletes from the template — now
a File Plan row rather than an untracked "someday re-init"; review.md's bare "no
refutation" fragment would have survived the rename (now in D3); the Rationale's own row
count was wrong (corrected). Adjudicated out: `.claude/commands/doctrine-review.md`'s
"refutation-filter retirements" mention is historical evidence, not live-mechanism
description — renaming it would falsify the history it cites (recorded in D3).

## Canonical Delta

None — the plugin's doctrine files are the canonical surface and are edited directly.
