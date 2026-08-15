---
date: 2026-08-14
status: hardened
open_markers: 0
risk: T3
area: pipeline-mechanics
design: false
breaking: false
depends_on: ["specs/20260814/01-ac-matrix-script.md"]
depended_on_by: []
brief: 06
---

# Mechanize doctor, merge-back, and fidelity prose algorithms

## Goal

Four small prose-executed algorithms become deterministic mechanics: doctor check 19's
gate↔CI substring parity becomes `spec/scripts/ci-gate-parity.js`; the `spec/<stem>` build-
branch derivation gets one owner (`merge-back.sh branch-for`) called by both prose copies
(enter-worktree step 1, doctor check 11); doctor's legacy-migration flags (checks 16/17) gate
on the config's `generatedBy` version and check 12's ~1000-char threshold demotes to a
secondary tripwire behind the schema/shape check; and `fidelity-check.js` detects the
regionRef over-claim class so design.md's `<surface>-screen` incident paragraph collapses to
one class-level sentence. Done = the two scripts' exec pins run green, both prose copies of
the branch rule are invocations, and the retagged doctrine pins run green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | CREATE `spec/scripts/ci-gate-parity.js` (repo script conventions), key `spec-paths ci-gate-parity`. Contract: `node ci-gate-parity.js --root <dir>` — reads `.claude/spec.config.json`'s `gateCommand`, splits on `/\{[^}]*\}/g`, trims segments, keeps ≥10 chars (fallback: the whole placeholder-stripped trimmed command when nothing survives), and requires each kept segment as a substring of the concatenation of `.github/workflows/*.yml` + `*.yaml`. Exit 0 = parity (or the sentinel `inapplicable — no .github/workflows` / `inapplicable — no gateCommand`, printed, still exit 0: advisory check, absence is not a finding); 1 = missing segments, one linter-style line each naming the segment and the remedy ("make one CI step run the gateCommand verbatim"); 2 = usage / unreadable config. doctor.md check 19 shrinks to the invocation + one sentence on what a finding means. | C4: the algorithm is deterministic and was hand-executed; the test then pins behavior, not a paragraph. Advisory semantics preserved exactly. |
| D2 | `merge-back.sh` gains subcommand `branch-for <spec path>` (positional). **Parsing structure (refuter-executed):** the script's generic `while` loop dies on any bare positional (`unknown arg`) before subcommand dispatch — observed: `branch-for specs/…/07-per-sha-ci-legs.md` → `merge-back: unknown arg: …`, exit 2 — so `branch-for` is special-cased immediately after `SUB` capture, before the flag loop (the same early-exit position the `help` case occupies), never routed through it: prints `spec/<stem>` where `<stem>` is the spec filename sans directory and extension (e.g. `specs/20260810/07-per-sha-ci-legs.md` → `spec/07-per-sha-ci-legs`); exit 2 with remedy when no path given. It performs no git operations and requires no repo. enter-worktree.md step 1 derives `{source}` via `"$({mergeBack} branch-for {spec path})"` and doctor.md check 11 derives the stale-branch probe the same way — both prose restatements replaced by the invocation (one illustrative example each may remain, marked as an example). **A fourth copy exists (blind-spot, unflagged by audit C9): `git/commands/commit.md:61-62` reverse-parses the `spec/<slug>` pattern** — it keeps its inline match (a reverse parse can't call a forward-derivation subcommand) but gains one clause naming `merge-back.sh branch-for` as the pattern's owner, so a future rule change has a single grep target. `create` keeps taking `--source` pre-derived (its callers now derive via `branch-for`) — no behavior change to existing subcommands; `create`'s header comment gains one line deferring the derivation to `branch-for` (readers otherwise re-litigate "does create derive this"). | C9: two prose copies each claim the script owns the rule; after this it actually does. Positional style and print-only shape match `root`. |
| D3 | doctor.md check 16's legacy arm (ops-conventions ADR present without the `per-surface casing ownership` label → "pre-6.7 grounding") and check 17's legacy arm (non-empty `docs/roadmap/deltas/` → "predates spec@6.18.0") become conditional on config `generatedBy` (which check 15 already parses): the migration flag fires only when `generatedBy` predates the migration version (< 6.7.0 / < 6.18.0 respectively, `sort -V` semantics); on a grounding at/after that version the same observation reports as ordinary drift ("label missing on a current grounding — targeted patch" / "stray deltas/ dir on a current grounding — delete it"), never as a migration. Deletion of the arms was rejected: both target v6-era groundings still in the wild; reopen the delete when the one-major-version window closes (plugin major 7). **Untouched by construction (blind-spot):** the open INTAKE row PRAX-20260721-03 (check 16 manually scoped to the SQL plane pending a plane-grammar fix) is orthogonal — the gate wraps the *legacy-label arm*, never the parity invocation or its plane scoping; the row stays open and unedited. The check-17 gating keeps the literal `roadmap/deltas` text present (now conditional) — `tests/roadmap-amendments.test.js:100-104` pins it and must stay green. | C10: version-pinned migrations not gated on the version stamp fire forever on every host; gating is the reversible option, deletion is recorded as the reopen condition. |
| D4 | doctor.md check 12 reorders: the schema/shape checks (JSON parse, stage enum, per-row-class required-field expectations, git-tracked, union merge-attr) are the primary signal; the ~1000-char line-length check demotes to a secondary tripwire — reported only as advisory corroboration when a row also fails shape, or as a standalone advisory ("long but well-formed — inspect for prose leak") never as a broken finding on its own. The stage-enum and roll-up pins (tests/run-ledger.test.js:103, tests/feedback-loop.test.js:78) stay green — wording around them is preserved. | C12: the threshold was derived from this repo's path lengths; the next conforming leg crosses it. Shape is the real invariant; length is a smell. |
| D5 | `fidelity-check.js` gains over-claim detection: when a skeleton binds a surface's ROOT region (bare-surface ref / legacy sliceRef / id == surface id) and the run has unexcused findings in that surface, the script computes per-child-region coverage over **regions that carry ≥1 obligation** (a region with zero extracted obligations is excluded from the computation entirely — refuter-caught false-positive: an obligation-less structural region reads identically to an all-failed one); if ≥1 obligation-bearing child region is fully unreferenced by the pass while ≥1 other is fully satisfied, it prepends ONE diagnosis line to the surface's findings: `over-claim: skeleton '<id>' binds all of '<surface>' but only regions [<list>] are implemented — if this spec builds a subset, bind those regions and name the skeleton distinctly (e.g. <surface>-screen)`. Detection never changes the exit code by itself — it re-labels why the existing findings fired (the incident was a misdiagnosis: chrome copy named instead of the naming collision). design.md's taboo paragraph collapses to one class-level sentence: "Name a skeleton binding a SUBSET of a surface's regions distinctly (e.g. `<surface>-screen`) — a bare-surface ref claims every region including chrome, and the fidelity gate now names that over-claim directly." | C7: the incident-shaped prose rule survives as one sentence once the script detects the class and says the true cause at the moment it matters. |
| D6 | Test-pin retags (sanctioned, red-check reads as declared): `tests/review/ci-gate-parity.test.js` — the doctor.md paragraph pins (AC-20260810-07-11) become exec pins against `ci-gate-parity.js` (literal fixtures: this repo's own gateCommand — one kept segment, per AC-1's executed evidence — plus one synthetic two-placeholder command for the multi-segment path) plus one doctrine pin that check 19 invokes the script; `tests/consistency/conflict-fixes.test.js` AC-20260810-08-5 retags to check 11 citing `branch-for` (staleness-conditional-on-build_base substance preserved); `tests/skeleton-subset-binding.test.js` retags to the collapsed class sentence (the `<surface>-screen` literal survives in it) plus the script's diagnosis line. New exec pins live in `tests/merge-back.test.js` (branch-for) and `tests/fidelity-check.test.js` (over-claim). | Same locked gotcha as spec 01 D6; all colliding pins executed green at HEAD during planning. |
| D7 | Scaffold-ledger rows: one for `ci-gate-parity.js` (amends the existing CI-gate-parity row at scaffold-ledger.md:~75 — **that row restates the split/trim/≥10-char algorithm verbatim (blind-spot); it shrinks to a script pointer** so the algorithm lives once; promote/retire condition unchanged), one for the fidelity over-claim detection (advisory diagnosis; retire if regionRef binding is ever redesigned). `branch-for` amends the merge-back row (derivation now script-owned). Claims-baseline re-stamp; plugin.json bump target 6.74.0 (target, not a pin). | Doctor check 13; repo hard review checks. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ci-gate-parity.js | CREATE | scripts | D1: split/trim/floor/substring parity, sentinels, exit codes |
| spec/bin/spec-paths | MODIFY | scripts | D1: `ci-gate-parity` key |
| spec/scripts/merge-back.sh | MODIFY | scripts | D2: `branch-for` subcommand + header update |
| spec/scripts/fidelity-check.js | MODIFY | scripts | D5: root-binding over-claim diagnosis + header update |
| spec/commands/doctor.md | MODIFY | doctrine | D1 check 19 → invocation; D2 check 11 via branch-for; D3 checks 16/17 generatedBy gating; D4 check 12 reorder |
| git/commands/enter-worktree.md | MODIFY | doctrine | D2 step 1 derives {source} via branch-for |
| spec/commands/design.md | MODIFY | doctrine | D5 taboo paragraph → one class sentence |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7 row amendments + new row |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 bump + changelog |
| tests/review/ci-gate-parity.test.js | MODIFY | tests | AC-20260814-02-1, AC-20260814-02-2, AC-20260814-02-3 (D6 exec repin) |
| tests/merge-back.test.js | MODIFY | tests | AC-20260814-02-4, AC-20260814-02-5 |
| tests/consistency/conflict-fixes.test.js | MODIFY | tests | AC-20260814-02-6 (D6 retag) |
| tests/fidelity-check.test.js | MODIFY | tests | AC-20260814-02-7, AC-20260814-02-8 |
| tests/skeleton-subset-binding.test.js | MODIFY | tests | AC-20260814-02-9 (D6 retag — this suite WILL go red on the design.md collapse; rewritten, never deleted) |
| git/commands/commit.md | MODIFY | doctrine | D2: reverse-parse site cites branch-for as the pattern owner (one clause) |

## Contracts

```
# spec/scripts/ci-gate-parity.js
node ci-gate-parity.js --root <dir>
# Exit codes: 0 = parity or inapplicable (sentinel printed) · 1 = missing segments (one line
#   each) · 2 = usage / unreadable spec.config.json
# Sentinels: "inapplicable — no .github/workflows" · "inapplicable — no gateCommand"
# Algorithm (locked, from doctor.md check 19 at HEAD): split gateCommand on /\{[^}]*\}/g,
#   trim, keep segments ≥10 chars; none survive → the single required segment is the whole
#   trimmed gateCommand with placeholder tokens stripped; each kept segment must appear as a
#   substring of concat(.github/workflows/*.yml + *.yaml).

# merge-back.sh — new subcommand
merge-back.sh branch-for <spec path>   # prints spec/<stem>; no git ops; exit 2 on no path
# e.g. branch-for specs/20260810/07-per-sha-ci-legs.md → spec/07-per-sha-ci-legs

# fidelity-check.js — diagnosis line (prepended to a root-bound surface's findings; never
# alters the exit code by itself):
over-claim: skeleton '<id>' binds all of '<surface>' but only regions [<r1>, <r2>] are
implemented — if this spec builds a subset, bind those regions and name the skeleton
distinctly (e.g. <surface>-screen)
```

## Behavior

- `branch-for` needs no git repo: it is pure string derivation, so doctor check 11 can call
  it before any branch probe and enter-worktree can call it pre-create.
- Check 16/17 gating reads `generatedBy` with the `sort -V` comparison check 15 already
  performs — no new parsing convention; a config missing `generatedBy` entirely is treated as
  predating everything (both arms stay live), the conservative reading.
- The over-claim diagnosis uses schemaVersion-2 extracts' region tree; a flat legacy extract
  (single root region, no children) can never fire it — no false positives on old sidecars.
- ci-gate-parity's "inapplicable" exit-0 sentinels keep doctor's existing self-gating ("only
  when `.github/workflows/` exists") working when doctor calls the script unconditionally —
  doctor prose simplifies to one invocation with no existence pre-check of its own.

- File Plan size note: 16 rows brushes the ≤15 guideline — the sixteenth (commit.md, one
  clause) is a blind-spot fold-in that cannot land elsewhere without stranding a fourth copy
  of the branch rule; rows split cleanly into scripts / doctrine / tests batches.

## Acceptance Criteria

- **AC-20260814-02-1**: WHEN this repo's own `gateCommand` (`node spec/scripts/build-workflows.js --check && node --test {testDirs}`) is split THE SYSTEM SHALL keep exactly one segment — `node spec/scripts/build-workflows.js --check && node --test` (refuter-executed: the single `{testDirs}` placeholder sits at the string's end, so the split yields one ≥10-char segment) — exiting 0 when a workflow file contains it and 1 naming it when none does; WHEN a synthetic `gateCommand` with two placeholders (`lint {a} && test-suite-run {b}`) is checked against workflows containing only the first segment THE SYSTEM SHALL exit 1 naming the second → tests/review/ci-gate-parity.test.js
- **AC-20260814-02-2**: WHEN `gateCommand` is `npm test` (no segment ≥10 chars after split) THE SYSTEM SHALL require the whole placeholder-stripped command as the single segment (`npm test` present → exit 0; absent → exit 1) → tests/review/ci-gate-parity.test.js
- **AC-20260814-02-3**: WHEN `--root` has no `.github/workflows/` THE SYSTEM SHALL print `inapplicable — no .github/workflows` and exit 0; doctor.md check 19 SHALL invoke `spec-paths ci-gate-parity` and SHALL NOT restate the split/floor/substring algorithm; and WHEN `spec-paths ci-gate-parity` runs THE SYSTEM SHALL print the script's existing path (key-registration carrier) → tests/review/ci-gate-parity.test.js
- **AC-20260814-02-4**: WHEN `branch-for specs/20260810/07-per-sha-ci-legs.md` runs THE SYSTEM SHALL print exactly `spec/07-per-sha-ci-legs`; WHEN run with no path THE SYSTEM SHALL exit 2 naming the usage → tests/merge-back.test.js
- **AC-20260814-02-5**: WHEN enter-worktree.md and doctor.md check 11 are read THE SYSTEM SHALL derive the build branch via `branch-for` in both, with no free-standing restatement of the `spec/<stem>` rule outside marked examples → tests/merge-back.test.js
- **AC-20260814-02-6**: WHEN doctor.md check 11 is read THE SYSTEM SHALL CONTINUE TO key staleness on `build_base:` presence and skip in-place builds (retagged AC-20260810-08-5 substance) → tests/consistency/conflict-fixes.test.js
- **AC-20260814-02-7**: WHEN a root-bound skeleton's pass satisfies every obligation of region `form` and references nothing of region `chrome` (both children of the bound surface, unexcused findings present) THE SYSTEM SHALL prepend the over-claim diagnosis naming `form` as implemented and suggesting subset binding; WHEN findings are spread across all regions THE SYSTEM SHALL NOT emit the diagnosis → tests/fidelity-check.test.js
- **AC-20260814-02-8**: WHEN a run is clean or the extract is flat (schemaVersion-2 single root, no children) THE SYSTEM SHALL CONTINUE TO exit exactly as at HEAD with no diagnosis line (regression pin, green pre-change) → tests/fidelity-check.test.js
- **AC-20260814-02-9**: WHEN design.md is read THE SYSTEM SHALL state the subset-binding naming rule as one class-level sentence retaining the literal `<surface>-screen` remedy, without the multi-line chrome-misdiagnosis narration (retagged pins) → tests/skeleton-subset-binding.test.js
- **AC-20260814-02-10**: WHEN doctor.md checks 16/17 are read THE SYSTEM SHALL gate both legacy-migration arms on `generatedBy` predating 6.7.0 / 6.18.0 respectively (missing `generatedBy` = both arms live), and check 12 SHALL present the shape checks as primary with the ~1000-char threshold as an advisory tripwire, while THE SYSTEM SHALL CONTINUE TO pin the five-value stage enum and the check-12/15 feedback roll-up (existing pins stay green) → tests/consistency/conflict-fixes.test.js

## Assumptions (escalation triggers)

- A1: The colliding pins (ci-gate-parity 4 tests, conflict-fixes, skeleton-subset-binding,
  merge-back, fidelity-check suites) run green at HEAD — executed during planning
  (2026-08-14, 32 pass across the sampled set). **if false at build:** re-run the sweep and
  fold into D6 first.
- A1b (negative-claim micro-check, executed 2026-08-14): the proposed collapsed design.md
  sentence matches `/<surface>-screen/` (observed: `true`) but not `/name the chrome copy/`
  (observed: `false`) — confirming skeleton-subset-binding.test.js's second pin goes red on
  the collapse and D6's rewrite is mandatory; scratch file deleted, tree clean.
- A2: `fidelity-check.js`'s extract JSON exposes a per-surface region tree with child region
  ids and per-region obligation attribution sufficient to compute "region contributed ≥1
  satisfied obligation" (v2 region-scoped contract per its header). **if false (obligations
  aren't attributable per child region):** narrow D5 to the detectable subset — diagnosis
  fires when the root-bound surface's *failing* obligations all localize to regions absent
  from the pass — and record the narrowing in the deviations log; never invent attribution.
- A3: Spec 20260814/01 lands first (`depends_on`) — both bump plugin.json/claims-baseline/
  scaffold-ledger; serialization beats a merge-conflict lottery (repo precedent). **if
  false:** STOP; build 01 first.
- A4: `tests/consistency/conflict-fixes.test.js:167-186` pins check 12's threshold/exemption
  text inside the section boundary `12. **Run ledger hygiene**` → `13. **Scaffold audit**` —
  D4's reorder keeps every pinned phrase inside that boundary. **if false:** retag under
  D6's sanction; never weaken. `tests/consistency/stale-refs.test.js:45-49` is a negative
  pin (enter-worktree must not attribute the branch rule to /spec:build) — the branch-for
  replacement text must not reintroduce that phrase.
- A5: doctor.md's check 19 self-gate ("only when .github/workflows exists") can be replaced
  by the script's inapplicable sentinel without changing any doctor report semantics —
  advisory either way. **if false:** keep the prose pre-check and the sentinel both; they
  agree.

## Rationale

T3: `merge-back.sh` is a named T3 surface (destructive git ops; load-bearing exit alphabet)
and doctor/fidelity sit in every host's grounding and design gates. One planning session, two
specs: this one bundles the four small mechanizations because each is a one-script-one-pin
landing unit and none reaches review's verdict path (spec 01's territory).

Why `branch-for` is print-only string derivation (D2): both call sites need the rule before
any git state exists (doctor probes branches; enter-worktree derives pre-create), and the
duplication defect was in the *derivation*, not the git ops. Why gate-not-delete on checks
16/17 (D3): deletion is irreversible against v6-era hosts still in the wild; the reopen
condition (plugin major 7) is recorded — the cheapest-to-reverse option per the standing
conservative rule. 📌 auto-picked. Why the over-claim detection re-labels rather than gates
(D5): the incident was a *misdiagnosis* (fidelity refused correctly but named chrome copy);
a new blocking class would change gate semantics for a diagnostic problem — the fix is
saying the true cause where it fires. Rejected: a skeletons-check-time ban on bare-surface
bindings (legitimate full-screen bindings exist; the defect is subset-binding under a bare
name, only observable against the pass). Fragile: the fidelity attribution assumption (A2)
is the one spot where the extract contract may under-deliver — the fallback is pre-agreed.

Adversarial-check adjudications (2026-08-14, two blind refuters): ACCEPTED and folded — the
`branch-for` parsing structure (both refuters executed the live script: a bare positional
dies in the generic flag loop before dispatch — D2 now mandates the pre-loop special-case
and drops the false "matching create's style" characterization; create is flag-style); the
unsatisfiable AC-1 fixture (this repo's real gateCommand splits to exactly ONE kept segment
— refuter-executed; AC-1 rewritten around the observed single-segment behavior plus a
synthetic two-placeholder case, D6's fixture wording aligned); the over-claim false positive
on obligation-less regions (D5 now excludes zero-obligation regions from the coverage
computation). Refuter-verified clean: D3's version anchors (6.7.0/6.18.0 confirmed via git
log), the `roadmap/deltas` literal surviving conditionally (roadmap-amendments pin), check
12's boundary phrases, PRAX-20260721-03 orthogonality, fidelity per-region attribution
feasibility (`e.region` on every entry — A2's premise holds structurally), and the
exit-code-neutrality claim (diagnosis only fires when findings already exist).

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
