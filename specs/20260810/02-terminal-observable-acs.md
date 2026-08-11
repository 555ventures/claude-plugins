---
date: 2026-08-10
status: done
open_markers: 0
risk: T2
area: pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Terminal-observable ACs: executable liveness for promised surfaces

## Goal

Close the pipeline's dominant escape family — **dead surfaces**: code that typechecks, lints and
tests green but can never execute or renders nothing (~14 recorded instances across hosts; 4 in
a single UpWell build on 2026-08-10). The cause is not that specs lack a liveness document; it
is that the observable end of every promise was verified against **invented fixtures or nothing
at all** — the pure-UI TDD exemption hands rendering to the component catalog, and the catalog
is fed props the author typed by hand from the same mental model that wrote the wrong code. This
spec makes liveness executable rather than asserted: a Decision that promises a user-observable
surface owes a **terminal-observable AC** whose assertion is on the observable itself and whose
fixture is **produced by the spec's own producer chain, never invented**; the pure-UI exemption
is narrowed to appearance only; the lock audit and the mid-build ruling duty are extended to
match. Done = four doctrine edits, one ledger row, pinned tests, plugin bumped. **No new script,
no new section, no new review agent** — enforcement rides the AC↔test matrix, red-check and
skipped-test reconciliation, which are already gates.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Terminal-observable AC rule** (`plan.md` Phase 2, a bullet beside the existing AC-shape bullet at `plan.md:165–183`): every Decision that promises a user-observable surface carries at least one AC whose test asserts on **the observable itself** — rendered text/element, emitted row, fired event — reached through the spec's own in-repo route. | The AC is already the pipeline's executable unit and already gated three ways (matrix, red-check, skip-reconcile). The four escapes were not ACs that failed; they were promises that had no AC at all, because the promise lived in a Decision and the terminal lived in the TDD-exempt render layer. |
| D2 | **Fixture provenance is part of the rule, and its violation is named doctrine:** a terminal-observable AC's fixture is **produced** — derived by executing the spec's own producer chain (view-model, assembler, defer-derivation) on realistic wire data — never a hand-authored props object. The anti-pattern gets a name in doctrine, **invented-fixture liveness**: a terminal fed hand-typed props proves the component works, never that the product reaches it. | This is the actual root cause. All four 2026-08-10 escapes had a green catalog story or a green unit test at the terminal; every one of them was fed data the author invented. Without this clause the rule is satisfiable by exactly the tests that already lied. |
| D3 | **Narrow the pure-UI TDD exemption at all three of its homes**: `build.md:70–71`, the template's AC comment (`templates/spec.md:84–86`), and `shared.md:274–275` § Design Canon ("the catalog + the user's eyes gate UI rendering; TDD gates logic"). The exemption covers **appearance**, never **reachability**. A prop or field whose absence collapses a Decision's promised observable is behavior and owes an AC. | The exemption is correct for look and catastrophic for liveness — it exempted precisely the hop where liveness lives. The third home was found by refutation and is the most load-bearing of the three: `spec-paths`'s `shared-for` map serves § Design Canon to `/spec:design`, `atlas`, `sketch`, `genesis-explore` and `genesis-design` but **not** to `plan` or `build`, so leaving it unqualified would let the very command that authors the catalog keep grounding on the un-narrowed framing. |
| D4 | **Extend the lock audit** (`plan.md` Phase 4 step 2, the existing Goal→Decision→red-capable-AC trace at `plan.md:238–241`) from Goal promises to **Decision-level observable promises**: a Decision promising an observable with no AC that goes red in its absence blocks lock. Same in-session check, one widened clause — not a new gate, not an emitted table. | The audit already exists, already blocks lock, and already has a ledger row; its scope was Goal-level, which is why D13's "the card names it" — a Decision-level promise — passed through. Widening a live check beats minting a ninth mechanism (scaffold-ledger lifecycle rule). |
| D5 | **Mid-build ruling duty** (`build.md` Phase 2 `blocked` row): a ruling that adds or changes an observable promise adds or updates its terminal-observable AC **in the same spec edit** that records the ruling. | The Decisions that produced all the evidence (UpWell D13's addendum, D21, D22, D26) were added while `status: implementing` — they never revisit lock, so no plan-time gate can ever reach them. The actor writing the ruling is the only one who can cheaply attach its falsifier; the review AC-matrix then has teeth on mid-build amendments with zero new spend. |
| D6 | **One sentence in the Phase 3 refuter prompt** (`plan.md:209–219`): *for each Decision promising an observable, verify that an AC's test executes the real in-repo route to it — a mocked or stubbed in-repo hop between producer and terminal is a top-severity finding.* | The refuters already run (T2: 1, T3: 2) and demonstrably land real corrections; this is the only cheap adversarial check on fixture provenance, and it costs zero new dispatches and zero new spend. |
| D7 | **One `scaffold-ledger.md` row** — *Terminal-observable ACs (produced fixtures)*, kind **gate**, justified by the 2026-08-10 UpWell measurement (4 dead surfaces in one build, all with green terminals on invented fixtures), promote/retire: retire the fixture-provenance clause if two consecutive quarters of escape data show zero invented-fixture findings; retire the whole rule only if the dead-surface class stops appearing in escape data for two quarters. | Ledger discipline: no mechanism ships without naming what promotes or retires it. No ADVISORY-first exception is needed — nothing new blocks; the blocking carrier is the existing AC-matrix, which is already a gate. |
| D8 | **No new artifact, no new script, no new review leg, and `spec/bin/spec-paths` is untouched** — which is what keeps this spec T2 rather than T3. | Retainer ruling (2026-08-10, second consult): the superseded design added a document that verifies authoring *form* while the failure lives in *execution*, and no number of layers converts a document into an execution. Every enforcement hop here is a mechanism that already earned its ledger row. |
| D9 | The predecessor spec `specs/20260810/02-surface-path-obligation.md` (hardened, never built, committed at `777f7ef`) is **discarded**, not narrowed. Its surviving content is transplanted here: the path-property diagnosis (Rationale), its terminal ranking (D1's observable-first ordering), its build-edit discipline (D5), and its roadmap brief (D10). | Its core — the `## Surface Paths` section plus `path-lint.js` — is exactly the part that dies, so nothing coherent remains around a deleted centre. Deleting a hardened-but-unbuilt spec costs only the authoring session. |
| D10 | Mechanizing the deviations sidecar as a backstop stays out of scope; the roadmap brief `docs/roadmap/03-deviations-sidecar-mechanization.md` is written in this spec's File Plan. | User ruling (2026-08-10) carried over unchanged; per `plan.md` Phase 4 step 2, session-discovered follow-up work gets a durable brief, never a conversational promise. |
| D12 | **`/spec:init`'s Test Rules exemplar (`init.md:303`) carries the carve-out too**, so every host bootstrapped after this lands writes the narrowed form into its own generated `.claude/rules/spec-pipeline.md` § Test Rules. | Found by refutation: `init.md:303` is the text new hosts' Test Rules sections are drafted from ("what is exempt from TDD (e.g. pure-UI rendering in repos with a design-stage catalog)"), uncarved. Without this row D3 fixes this repo's specs and silently reseeds the defect into every future host — the Goal's "close the escape family" would not generalize past one repo. |
| D11 | Version bump to **6.50.0** with a description (changelog) paragraph; `claims-baseline.json` regenerated via `claims-lint --update-baseline` in the same change. | Repo discipline (pipeline rules § Planning, § Review Checks): behavior change ⇒ bump; any doctrine line-count change with no baseline hunk in the same diff is a hard finding at review. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ doctrine | scripts | workflows | tests | other. No script and no workflow rows —
     that is the point of D8. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/plan.md | MODIFY | doctrine | Phase 2 terminal-observable AC bullet + invented-fixture anti-pattern (D1, D2); Phase 3 refuter sentence (D6); Phase 4 lock audit widened to Decision-level observable promises (D4) |
| spec/commands/build.md | MODIFY | doctrine | Pure-UI exemption narrowed to appearance at `:70–71` (D3); Phase 2 `blocked` row gains the mid-build AC duty (D5) |
| spec/templates/spec.md | MODIFY | doctrine | AC-section comment: terminal-observable rule, produced-fixture requirement, narrowed exemption wording (D1, D2, D3) |
| spec/doctrine/shared.md | MODIFY | doctrine | § Design Canon `:274–275`: the catalog/eyes-gate-rendering sentence gains the reachability carve-out — third exemption home, the one served to /spec:design (D3) |
| spec/commands/init.md | MODIFY | doctrine | Test Rules exemplar `:303`: the pure-UI exemption example carries the reachability carve-out, so generated host rules ship narrowed (D12) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | One row with promote/retire (D7) |
| tests/terminal-observable-acs.test.js | CREATE | tests | AC-20260810-02-1 … AC-20260810-02-6 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | 6.50.0 + description changelog paragraph (D11) |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | `claims-lint --update-baseline` after every doctrine edit lands (D11) |
| docs/roadmap/03-deviations-sidecar-mechanization.md | CREATE | other | Follow-up brief for the sidecar backstop (D10) |

## Contracts

**Terminal-observable AC — the authoring shape** (documented in `templates/spec.md`'s AC comment
and `plan.md` Phase 2; this is prose doctrine, not a machine grammar):

> A Decision that promises a user-observable surface owes at least one AC whose test asserts on
> the observable itself, reached through the real in-repo route. The fixture feeding that
> assertion is **produced** — the test calls the spec's own producer chain on realistic wire
> data — never a hand-authored props object. Naming the anti-pattern: **invented-fixture
> liveness** — a terminal fed hand-typed props proves the component works, not that the product
> reaches it. Where the observable genuinely has no executable terminal in this host (an email,
> a cron side effect, a route the host writes no render tests for), say so on the AC line as a
> named residual and route it to the release stage's journey walks — never let it read as
> covered.

**Narrowed exemption wording** (applied at all four homes — `build.md:70–71`,
`templates/spec.md:84–86`, `shared.md:274–275`, `init.md:303` — adapted to each one's voice, with
the reachability carve-out present in every one):

> In design-capable hosts, pure-UI **appearance** gets no TDD tests — the component catalog
> covers it. **Reachability is never exempt**: a prop or field whose absence collapses a
> Decision's promised observable is behavior, and owes an AC per the terminal-observable rule.

## Behavior

- **Plan Phase 2:** terminal-observable ACs are authored with the Decisions that promise them,
  and each names its produced fixture's origin (which producer the test executes).
- **Plan Phase 3:** the refuter checks that each promised observable has an AC executing the
  real route; a mocked in-repo hop between producer and terminal is a top-severity finding.
- **Plan Phase 4:** the existing lock audit now walks Decision-level observable promises as well
  as Goal promises; an uncovered promise blocks lock (add the AC, or strike the promise).
- **Build Phase 0/1:** unchanged mechanically — the widened AC set simply produces more test
  rows, which the existing TDD red-check already governs.
- **Build Phase 2:** a `blocked` ruling that adds or changes an observable promise writes its
  AC into the spec in the same edit as the Decision prose. The AC's **test** is authored in the
  same run when the owning batch can still take it; otherwise the AC stands uncovered and the
  review AC-matrix's uncovered-AC hard finding forces a fix-delta. D5 guarantees the promise is
  never *unrecorded* — it does not guarantee build-time coverage, and must not be read that way.
- **Review:** unchanged — the AC↔test matrix, the skipped-test reconciliation and the reviewer's
  semantic backstop (`review.md:193–196`, "a test that names an AC-ID but doesn't actually test
  the behavior is still a hard finding") do the enforcing. No new leg, no new agent, no
  `verdict.js` change.

## Acceptance Criteria

- **AC-20260810-02-1**: WHEN `spec/commands/plan.md` Phase 2 is read THE SYSTEM SHALL state the
  terminal-observable AC rule — an AC asserting on the observable itself, reached through the
  real in-repo route — for every Decision promising a user-observable surface (regex pin on the
  Phase 2 AC-shape region) → tests/terminal-observable-acs.test.js
- **AC-20260810-02-2**: WHEN `spec/commands/plan.md` and `spec/templates/spec.md` are read THE
  SYSTEM SHALL name the produced-fixture requirement and the literal anti-pattern phrase
  `invented-fixture liveness` (regex pin, both files) → tests/terminal-observable-acs.test.js
- **AC-20260810-02-3**: WHEN each of the four exemption homes is read — `spec/commands/build.md`,
  `spec/templates/spec.md`'s AC comment, `spec/doctrine/shared.md` § Design Canon, and
  `spec/commands/init.md`'s Test Rules exemplar — THE SYSTEM SHALL scope the pure-UI TDD
  exemption to appearance and state that reachability is never exempt; the pin SHALL fail if an
  unconditional form reappears in **any** of the four (a proximity regex requiring the carve-out
  phrase within N lines of each exemption sentence, asserted per file so a single un-narrowed
  home fails the test by name) → tests/terminal-observable-acs.test.js
- **AC-20260810-02-4**: WHEN `spec/commands/plan.md` Phase 4's lock audit is read THE SYSTEM
  SHALL extend the red-capable-AC trace to Decision-level observable promises, AND SHALL
  CONTINUE TO require the existing Goal-promise trace and the `SHALL CONTINUE TO` regression-pin
  check in the same step (regex pins; the Goal-trace and pin clauses are green pre-change) →
  tests/terminal-observable-acs.test.js
- **AC-20260810-02-5**: WHEN `spec/commands/build.md`'s Phase 2 `blocked` row is read THE SYSTEM
  SHALL require a ruling that adds or changes an observable promise to add/update its
  terminal-observable AC in the same spec edit; and WHEN `spec/commands/plan.md` Phase 3's
  refuter prompt is read THE SYSTEM SHALL instruct the refuter to treat a mocked in-repo hop
  between producer and terminal as a top-severity finding (regex pins) →
  tests/terminal-observable-acs.test.js
- **AC-20260810-02-6**: WHEN `spec/doctrine/scaffold-ledger.md` is read THE SYSTEM SHALL carry a
  terminal-observable-ACs row whose Kind is `gate` and whose promote/retire cell names both the
  fixture-provenance retire condition and the whole-rule retire condition; AND
  `spec/scripts/verdict.js` SHALL CONTINUE TO expose `REVIEW_LEGS` unchanged and
  `spec/bin/spec-paths` SHALL CONTINUE TO resolve its existing key set with no additions (source
  pins; both green pre-change — this spec adds no mechanism) →
  tests/terminal-observable-acs.test.js

## Assumptions (escalation triggers)

- A1: The pure-UI TDD exemption has exactly **four** homes, all in this spec's File Plan:
  `spec/commands/build.md:70–71` (Phase 0 spec parse), `spec/templates/spec.md:84–86` (AC-section
  comment), `spec/doctrine/shared.md:274–275` (§ Design Canon, served to /spec:design), and
  `spec/commands/init.md:303` (the exemplar generated hosts inherit). The first two were found by
  grep at plan time; the second two only by refutation, because they restate the principle in
  different words — a literal-sentence grep misses them. **if false (a fifth home exists):**
  narrow it there too in the same change; an un-narrowed copy re-exempts the terminal and
  silently reverts D3. Search by *meaning* — "catalog covers rendering", "eyes gate UI",
  "TDD gates logic", "exempt from TDD" — never by the sentence.
- A2: `plan.md:238–241` is the sole home of the Goal→Decision→red-capable-AC lock audit and it is
  an in-session check with no script carrier (verified by reading Phase 4 step 2). **if false:**
  the widened clause must land in the carrier too — never two derivations of the same audit.
- A3: `tests/goal-mechanism-audit.test.js` locates the Phase 4 block by header string and applies
  loose regexes over its body rather than pinning step count or line position (verified at plan
  time by a refuter on the predecessor spec). **if false:** update that pin in the same change;
  this is a sanctioned doctrine change, not a weakening.
- A4: `claims-lint.js:32`'s corpus is `spec/commands`, `spec/doctrine`, `spec/agents` — NOT
  `spec/templates`. Every doctrine file this spec touches moves line counts, so
  `claims-lint --update-baseline` runs after the last doctrine edit and lands in the same diff;
  new prose containing `MUST`/`NEVER`/`ALWAYS`/`STOP`/`hard finding` carries an inline
  `<!-- enforcedBy: … -->` or `<!-- unenforced: … -->` marker or enters the baseline as an
  orphan. The natural `enforcedBy` carrier here is `spec/commands/review.md`'s AC matrix, not a
  script this spec ships (it ships none). **if false:** review's baseline-hunk check is a hard
  finding — re-run `--update-baseline`.
- A5: This repo's suite carries a deliberate red-pin baseline (pipeline rules § Test Rules), so
  the gate is scoped via `{testDirs}` and resolves to the glob form
  `node --test 'tests/<file>.test.js'` — `node --test <dir>` fails on Node 26 here. **if false:**
  see § Gotchas; never "fix" it by changing the gate command.
- A6: A concurrent Claude session is active in this repo and committed the predecessor spec
  (`777f7ef`) without this session's involvement. **if it commits again mid-build:** the build
  orchestrator owns all git here — re-check `git log` before each checkpoint commit, and
  consider `/git:enter-worktree` for isolation.

## Rationale

The predecessor spec (`02-surface-path-obligation`, hardened at `777f7ef`, never built) proposed
a per-Decision `## Surface Paths` section plus a `path-lint.js` blocking lock. Two blind refuters
and a second retainer consult killed it, and the reason is worth recording because it generalises:
**it verified authoring form while the failure lives in execution.** Concretely, the lint reached
1 of the 4 measured escapes — "owned" meant "listed in the File Plan", not "correct", and three
of the four defect sites were files the spec was itself creating; a hop the author never wrote
was invisible to a grammar checking only hops present; `(ro @file:line)` was a two-second copy
(the predecessor's own draft carried two off-by-one citations its lint would have passed); and
the blocking moment was lock, while every Decision that produced the evidence was added
mid-build, where lock never runs again. My response had been to add layers — a widened refuter
clause, a review agent, a carrier check, a render-condition marker. That is accretion around a
core that does not hold.

The diagnosis that survives is real and is kept: **liveness is a path property** (producer →
carrier → consumer → render condition) while the File Plan deliberately shreds paths into file
rows so batches can parallelize, so the hops between rows are owned by nobody. What the
predecessor got wrong was the remedy — it wrote the path down instead of executing it. The
predecessor's own Rationale confessed as much: *"the paper trace substitutes for the integration
test layer decomposition doesn't buy."* This repo's entire scaffold-ledger history is
asserted-liveness dying and executed-liveness earning gate status — the boot smoke leg (8/8
static tasks green on an app returning 500 on every request), skipped-test reconciliation,
execution-grounded verification, `verdict.js` replacing prose-asserted CLEAN — and its own
taxonomy states that doctrine is the weakest prevention tier. A hand-authored dataflow claim
checked by a grammar is a claims registry for dataflow; `claims-lint.js` exists because claims
without executable carriers rot.

The real root cause is one layer down and is named here for the first time: **fixture
provenance**. Every one of the four escapes had a green terminal — a catalog story or a unit
test — fed props the author typed by hand from the same mental model that wrote the wrong code.
The pure-UI TDD exemption handed the terminal to the catalog, and the catalog cannot fail. D2 and
D3 are the whole spec; D1, D4, D5 and D6 are the four places the pipeline already has jurisdiction
to enforce them.

Traced against the four measured escapes: **D13's refusal carrier** (defer-time write discarded
because settle rebuilds `fold_context` wholesale at `fold-advance.ts:455–468`) — caught in the
red phase, because a test author trying to make the disclosure render must execute
defer-derivation → settle → view-model and discovers the rebuild while failing to make it appear;
that discovery also drags `fold-advance.ts` into the File Plan at plan time, closing the
ownership gap as a side effect. **D21's always-false legend gate** (`comparison-section.tsx:163`)
— caught at the first gate run: the produced fixture is the caption-empty wire state, and the
gated implementation never goes green. **D22's `targetHitSummary: null`** (`view-model.tsx:310`)
— caught at *plan* time in the best case, because constructing the produced fixture forces the
author into "no value producer exists until spec 05", which is exactly the fork that instead
reached the user mid-build as D25; at worst it fails the render assertion at the first gate run.
**D24's narrow caller** (`thread.$threadId.tsx:1511–1520`) — caught only if the host writes
route-level render tests; without them it escapes to review. That last one is the honest ceiling
and is stated as such: three caught at build-or-earlier, one partial but **visible**, because D5
makes the mid-build ruling owe an AC and the matrix flags it uncovered rather than letting it
pass silently.

Ceiling, stated plainly so no downstream reader over-reads this: fixture realism remains a
judgment — a determined author can still hand-type props, and the guard is the named
anti-pattern plus the reviewer's existing semantic backstop, not a script. A promise nobody
writes down anywhere is invisible to this mechanism as it is to every other. Runtime-only
observables (email, cron side effects) stay release-stage journey-walk territory and must be
declared as residuals, never dressed as covered.

Refuter findings (one Sonnet refuter, T2). (1) **A1 was false** — a third exemption home exists
at `shared.md:274–275` ("the catalog + the user's eyes gate UI rendering; TDD gates logic"),
unconditional, and `shared-for` serves § Design Canon to `/spec:design` but not to `plan`/`build`,
so the command that authors the catalog would have kept the un-narrowed framing; fixed by adding
the row to D3 and the File Plan. (2) `init.md:303` reseeds the uncarved exemption into every
future host's generated Test Rules; fixed as D12 — without it the Goal's claim would not
generalize past this repo. (3) D5 read as a build-time coverage guarantee it does not make;
fixed with an explicit clause in Behavior. The refuter also *strengthened* two claims: D21 and
D22 are not merely likely to be caught but **structurally forced**, because `view-model.tsx:336`
hardcodes `caption: []` and the target-hit producer path currently yields only `null` — no
compliant produced-fixture test can avoid the failing state. It confirmed the enforceability
ceiling is stated accurately (the AC matrix is an ID-presence grep and cannot distinguish a
terminal-observable AC or detect an invented fixture — only the reviewer can), that T2 is
correct, and that the predecessor spec's deletion cannot trip review's scope gate
(`scope-reconcile.js:69` excludes `specs/**`).

Fragile spots during execution: the four exemption homes (A1 — an un-narrowed copy silently
reverts D3, which is why AC-3 pins each by name; search by meaning, never by sentence), the
claims baseline (every doctrine row moves line counts — regenerate last, same diff), and the
concurrent session in this repo (A6).

**Review dispositions (2026-08-11, iteration 2).** Iteration 1 hard-stopped GATE_RED: the
Phase 2 rewrite dropped the phrase "fixture-fed", breaking the previously-green pin
`tests/ac-terminal-observable.test.js` (UPWELL-20260810-01, fixed@6.50.0). User-ruled fix
(option a, Opus-seconded): the pin was re-aimed at the disqualification clause ("never a
hand-authored props object") with its incident header kept and a note added to the INTAKE row —
a sanctioned vocabulary realignment per A3's precedent, not a weakening. Scope-reconcile's
out-of-plan finding (423 files) was rejected: every listed file is either a concurrent
session's untracked working-tree artifact (the `setup/` payload tree, roadmap briefs 04/05,
agent-memory notes, the 00-overview edit — A6's predicted collision) or one of the two
user-sanctioned fix edits above; none are this build's diff. Build deviation absorbed: D11's
6.50.0 bump target was already taken at HEAD by a concurrent session, so the build bumped to
6.51.0 with the same changelog paragraph.

## Canonical Delta

`docs/canonical/pipeline.md` (create if absent): add a **Liveness is executed, not asserted**
section — surface liveness is a path property (producer → carrier → consumer → render condition)
while the File Plan deliberately shreds paths into file rows so batches can parallelize, so a
promise's terminal is the hop nobody owns. The pipeline closes this with an authoring rule rather
than a document: a Decision promising a user-observable surface owes a **terminal-observable AC**
— asserting on the observable itself, reached through the real in-repo route, fed by a fixture
**produced** by the spec's own producer chain rather than hand-authored. The anti-pattern is
named **invented-fixture liveness**: a terminal fed hand-typed props proves the component works,
not that the product reaches it. The pure-UI TDD exemption therefore covers appearance only —
reachability is never exempt. Enforcement rides mechanisms that already exist: `/spec:plan`'s
lock audit (widened from Goal promises to Decision-level observable promises), the Phase 3
refuters (a mocked in-repo hop between producer and terminal is top-severity), `/spec:build`'s
`blocked` ruling duty (a mid-build ruling adds its AC in the same edit), and `/spec:review`'s
AC↔test matrix, skipped-test reconciliation and semantic backstop. No new script, section, or
review leg exists for this — deliberately (ruled 2026-08-10, superseding the discarded
`## Surface Paths` design).
