---
date: 2026-08-13
status: implementing
diff_base: c20e2ba93647fbc8d8f7435687bb4ee05ffa2e57
open_markers: 0
risk: T2
area: doctrine-plan
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Plan-Lock Obligation Carriers

## Goal

Plan lock stops passing specs whose Decisions state obligations nothing carries: one lock-time
obligation→carrier sweep in plan.md covers the four cross-host shapes (a Decision-named file
with no File Plan row; a persisted artifact with no Contracts/schema row; CREATE-d modules whose
factory signatures tests must invent; helper-computed AC expectations with no ground-truth
carrier), the File Plan row grammar forbids bundled second-file edits, the AC guidance splits
library-default requirements into mechanism pin + shipped-config echo, and init.md gains the
authoring rule that generated prose names the derivation of a volatile enumerable fact instead
of inlining the enumeration. Done = the seven open doctrine pins on plan.md/init.md run green
with the existing lock checks intact.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | plan.md Phase 4 step 2 gains ONE **obligation→carrier sweep** clause (a single check with four named shapes, not four separate gates): before lock, walk the Decisions table and confirm each obligation has a carrier — (i) a Decision that names a file by path owes a File Plan row for that file; (ii) a Decision that orders a persisted, later-rendered artifact (message, card, notice) owes a Contracts/schema row typing its shape; (iii) a spec whose tests import CREATE-d modules owes those modules' factory signatures (including injectable seams) pinned in Contracts; (iv) an AC whose expected value is computed by a helper (not a literal example) owes that helper's own ground-truth carrier listed or checked. A missing carrier blocks lock exactly as an uncovered Goal promise does. | 3 corroborating hosts, 4 incident shapes, one root cause: the existing lock trace stops at "an AC exists" and never asks whether the *thing the Decision named* has an owner. One sweep, four shapes — the class fix; four separate rules would be the additive bloat JJ's steer forbids. |
| D2 | plan.md's File Plan guidance (Phase 2 drafting bullets) gains the row grammar rule: every touched file gets its **own row** — a row that bundles an edit to a different file in its Summary hands the worker a file its batch contract forbids touching, so the bundled edit silently becomes an unrecorded orchestrator duty; bundled edits either get their own row or an explicit orchestrator-duty line outside the table. | UPWELL-20260725-01: "create cli.ts; add the npm scripts to app/package.json in this row" — the package.json edit was dropped. Grammar, not worker vigilance, prevents the drop. |
| D3 | plan.md's **AC shape** bullet gains the library-default split: when a requirement is satisfied by a library default, the AC splits — (i) pin the library mechanism behaviorally, and (ii) assert the **shipped config echo** (the key's presence/absence and surface flags in the shipped configuration); never assert the library's resolved internals. Placement: inside the AC-shape bullet, as a drafting instruction — refuter-corrected: the pin test's slice actually runs from `**AC shape:**` to EOF (no `- **` bullet follows it in the file), so placement is NOT test-enforced; the in-bullet placement is mandated here because the bullet is what test authors read, and the build reviewer checks it against this Decision, not against the pin. | PRAX-20260719-01: the behavioral AC needed its own rate-limit-enabled instance, so it passed before any implementation existed; `rateLimit:{enabled:false}` would disarm production abuse gating with every AC green. The config echo is the red-capable half. |
| D4 | init.md gains a generation-wide authoring rule, stated once in the **Deliverables section's preamble** — the section every generation phase descends from, so it governs Phase 1's skill generation (the founding incident's own artifact class — refuter finding: a Phase 3 placement sits *after* the `run` skill is authored in Phase 1 with no forward reference) as well as Phases 3–6's rules/conventions/agents: generated prose about a **volatile enumerable fact** (routes, table lists, package inventories, token homes) must **name the derivation** — the command or location that yields the fact (e.g. "`ls apps/web/src/routes/` is the surface list") — never inline the enumeration itself; a sentence that can go stale independently of the derivation it summarizes is a defect at generation time. | PRAX-20260813-06: a generated run skill said routes are "currently `/` and `/api/health`" while 37 existed. No checker can exist for arbitrary per-host sentences — the only fix that holds is true-by-construction authoring, placed where every generating phase inherits it. |
| D5 | Scaffold-ledger row for the D1 sweep (Kind: gate — the same script-free in-session-lock-check class as the registered "Goal→mechanism audit at lock" and "Terminal-observable ACs" rows): justification cites the 3-host/4-shape intake evidence; RETIRE if two consecutive quarters of intake/escape data across hosts show zero carrier-gap incidents (the sweep would be pure ceremony); the four anchor shapes are row data, widened only from intake evidence, never from taste. | A new lock-blocking mechanism without a ledger row is itself a hard review finding in this repo (refuter finding — pipeline rules § Review Checks; the in-session-check exemption I originally claimed does not exist: the ledger's own precedent rows are exactly this shape). |
| D6 | Version bump target 6.62.0 (target, not a pin). | Standing discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/plan.md | MODIFY | doctrine | D1 obligation→carrier sweep in Phase 4 step 2; D2 own-row grammar in the File Plan drafting guidance; D3 library-default split inside the AC-shape bullet |
| spec/commands/init.md | MODIFY | doctrine | D4 derivation-not-enumeration authoring rule in the Deliverables preamble (governs Phase 1 skills through Phase 6) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D5 row for the obligation→carrier sweep (gate; retire condition as stated) |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for the two files' line-count deltas (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6 version bump + changelog description |
| tests/plan-obligation-carrier.test.js | MODIFY | tests | AC-20260813-04-1 … AC-20260813-04-4 (tag existing red pins); widen the 01b regex to span line wraps (refuter-executed: without `[\s\S]`, the ~130-char shape-(ii) clause fails the pin at this file's 88–111-char wrap width — substance preserved, same commit) |
| tests/fileplan-bundled-edits.test.js | MODIFY | tests | AC-20260813-04-5 (tag existing red pin) |
| tests/ac-split-library-default.test.js | MODIFY | tests | AC-20260813-04-6 (tag existing red pins) |
| tests/init-derivation-not-enumeration.test.js | MODIFY | tests | AC-20260813-04-7 (tag existing red pin) |
| spec/INTAKE.md | MODIFY | doctrine | flip CROSS-20260813-01, PRAX-20260813-06, UPWELL-20260725-01, PRAX-20260719-01 to the fixing version with `mechanism(<path>)`/`prose(<reason>)` citations per the intake-discipline vocabulary |

## Behavior

- The D1 sweep is an in-session lock check like the Goal-promise trace it sits beside — no
  script, no new gate stage; a missing carrier is resolved by adding the row/Contracts entry or
  striking the obligation, before `status: hardened`. It is nonetheless a registered gate
  (D5's scaffold-ledger row) — script-free lock checks are exactly the class the ledger's
  Goal→mechanism-audit and Terminal-observable rows already register.
- D1's four shapes are illustrative anchors of one rule ("every stated obligation has a carrier
  someone can point to"), phrased so a fifth shape is judged by the rule, not left uncovered
  because it isn't on the list.
- D4 governs generation time; `/spec:doctor --fix` remains the repair path for already-generated
  stale sentences (no retroactive sweep — touch-time discipline, per standing doctrine-authoring
  rules).

## Acceptance Criteria

- **AC-20260813-04-1**: WHEN a Decision names a file by path THE SYSTEM SHALL require a File
  Plan row for that file at lock (e.g. "D6 orders an edit to `apps/web/vite.config.ts`" with no
  such row → lock blocked until the row or a struck obligation) → CROSS-20260813-01a in
  tests/plan-obligation-carrier.test.js
- **AC-20260813-04-2**: WHEN a Decision orders a persisted, later-rendered artifact THE SYSTEM
  SHALL require a Contracts/schema row typing it (e.g. a Decision promising a stored
  notification card with no Contracts shape → lock blocked) → CROSS-20260813-01b in
  tests/plan-obligation-carrier.test.js
- **AC-20260813-04-3**: WHEN a spec's tests import CREATE-d modules THE SYSTEM SHALL require
  those modules' factory signatures (including injectable seams) pinned in Contracts →
  CROSS-20260813-01c in tests/plan-obligation-carrier.test.js
- **AC-20260813-04-4**: WHEN an AC's expected value is computed by a helper rather than a
  literal example THE SYSTEM SHALL require the helper's own ground-truth carrier listed or
  checked → CROSS-20260813-01d in tests/plan-obligation-carrier.test.js
- **AC-20260813-04-5**: WHEN a File Plan row's Summary bundles an edit to a different file THE
  SYSTEM SHALL treat it as a drafting defect — every touched file its own row, or an explicit
  orchestrator-duty line → tests/fileplan-bundled-edits.test.js
- **AC-20260813-04-6**: WHEN a requirement rides a library default THE SYSTEM SHALL require the
  split AC pair — library-mechanism pin plus shipped-config echo (e.g. `rateLimit.enabled`
  absent from shipped config + the behavioral pin, never an assertion on the library's resolved
  internals) → tests/ac-split-library-default.test.js
- **AC-20260813-04-7**: WHEN init generates prose about a volatile enumerable fact THE SYSTEM
  SHALL name the derivation, never inline the enumeration (e.g. "`ls apps/web/src/routes/` is
  the surface list", never "routes are currently `/` and `/api/health`") →
  tests/init-derivation-not-enumeration.test.js
- **AC-20260813-04-8**: WHEN plan lock runs THE SYSTEM SHALL CONTINUE TO trace every Goal
  promise to a Decision plus a red-capable AC, and every Decision-level observable promise to a
  terminal-observable AC → tests/goal-mechanism-audit.test.js and
  tests/terminal-observable-acs.test.js (existing green pins on the same Phase 4 text)

## Assumptions (escalation triggers)

- A1: The pin tests' regexes are satisfiable by natural doctrine prose (they were authored from
  the fix contracts, matching phrases like "names a file by path … File Plan row",
  "factory signatures … Contracts", "shipped config", "name the derivation") — drafting to the
  contract satisfies them without keyword-stuffing. Known exception, refuter-executed: the 01b
  regex cannot span a line wrap and the shape-(ii) clause is longer than the file's wrap width
  — the File Plan's test row already carries the regex widening. **if false elsewhere (another
  regex forces unnatural wording):** adjust that test's regex in the same commit, preserving
  the assertion's substance — the test rows are already in the File Plan.
- A2: plan.md's Phase 4 step 2 anchor (`2. Confirm:`) and the `**AC shape:**` anchor survive
  the edit — additions slot inside existing blocks without renaming anchors other pins slice
  on (tests/negative-claim-microspike.test.js, tests/ac-terminal-observable.test.js,
  tests/consistency/conflict-fixes.test.js all pin plan.md text; refuter-verified all green
  today). Note the ac-split pin's slice actually runs `**AC shape:**` → EOF (no `- **` bullet
  follows), so insertions anywhere after the AC-shape bullet stay inside its slice — the
  in-bullet placement is D3's drafting mandate, not a slice constraint. Run those suites in
  the gate. **if false:** the breaking edit moves, not the pin.
- A3: The Deliverables section preamble is upstream of every generation phase (Phase 1 skills
  included — the founding incident's artifact class), so one rule placement governs all
  generated prose. **if false (a phase demonstrably doesn't inherit it):** restate the
  one-line rule in that phase's intro (still one rule, two anchors).
- A4: No live `/spec:init` or `/spec:plan` run depends on the exact current wording mid-wave.
  **if false:** STOP, ask the user.

## Rationale

T2: doctrine-only prose on two command files, no script or contract-surface change; pipeline
entry via durability (the wave spans sessions — four specs, sequential builds) and delegation
(doctrine-author executes; the spec is the re-entrant state). The central design call is D1's
single-sweep framing: the four corroborated shapes are anchors of one rule, so the fifth shape
that inevitably appears is judged by the rule instead of falling through a closed list — this
is the holistic disposition JJ ratified at intake, carried into the fix. Rejected alternatives:
a lock-time script parsing Decisions for file paths (path-shaped prose is a heuristic swamp;
the lock is already an in-session judgment point with the spec in hand — same placement as the
Goal-promise trace, which works); four separate numbered lock gates (additive bloat, and each
would need its own exemption ledger); a doctor check for stale generated enumerations
(PRAX-20260813-06's class is per-host free text — no checker can enumerate arbitrary sentences;
generation-time authoring is the only true-by-construction point, which is why the fix lands in
init.md, not doctor.md). Older debt burned here on the same surfaces: UPWELL-20260725-01 (row
grammar) and PRAX-20260719-01 (library-default split) — both plan.md AC/File-Plan guidance,
folded rather than left as their own micro-waves. Regression pin (AC-8) covers the adjacent
lock-check text the new sweep sits beside, since the edit point is the same step the
Goal-promise trace lives in.

Adversarial-check adjudications (2026-08-13, one refuter, executing repros): ACCEPTED and
folded — the missing scaffold-ledger row for D1's lock gate (my claimed in-session-check
exemption does not exist; the ledger's own Goal→mechanism-audit and Terminal-observable rows
are precisely this script-free shape — now D5); D4's Phase 3 placement failing to govern
Phase 1's skill generation, the founding incident's own artifact (moved to the Deliverables
preamble); D3's false claim that placement was test-enforced (the pin slices to EOF —
corrected to a drafting mandate); the wrap-fragile 01b regex (widening added to the test's
File Plan row). No findings rejected.

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
