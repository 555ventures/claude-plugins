---
date: 2026-09-02
status: implementing
build_base: main
tier: standard
area: doctrine-governance
design: false
breaking: false
depends_on: ["specs/20260902/02-plugin-code-sweep.md"]
depended_on_by: ["specs/20260902/04-host-generators-owner-citations.md"]
brief: 21
open_markers: 0
diff_base: 3fe76c32694fae5e23a5801781a3acf7e6452c98
---

# Plugin prose sweep: commands, doctrine, agents, rules cite owners

## Goal

Every prose line of the plugin's commands, doctrine, agents, the spec template, the git
commands, and this repo's rules layer states a rule plus one owner id and never narrates
dates, people, hosts, versions, or prior behavior. The 64 narrated prose lines measured at
planning are rewritten or deleted; the 13 Gotchas entries in `.claude/rules/spec-pipeline.md`
collapse to tag + rule + one citation; the seven contract-phrased lines the scanner also
catches are reworded rather than exempted. Done means: the plugin scan reports zero
prose-group findings with the baseline reduced to the grounding contract alone (sibling 04
edits that file and deletes the baseline); every `§` citation still resolves; every
read-load budget and doctrine pin stays green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Worklist = the gate**, prose group: `node "$(spec-paths comment-narration)" --root . --hosts upwell,prax,salon-os,salon os,hearwell,hiwora,zubu,bwm,cctop,autopilot-hub --people JJ,founder --json` findings under `spec/commands`, `spec/doctrine`, `spec/agents`, `spec/templates/spec.md`, `git/commands`, `.claude/rules`, `.claude/agents`. `spec/templates/grounding-contract.md`'s findings are left in place and its baseline entry stays (sibling 04 owns that file's single edit and re-hash). (AC-20260902-03-1) | Host § Planning: at most one edit to the contract per spec, and 04's is the contract change. |
| D2 | **Rewrite grammar.** Each narrated line becomes the rule it was evidence for, plus one owner citation in parentheses — a spec path (`specs/20260823/08-derived-session-queue.md`), an AC-ID, a D-number with its spec, an ADR (`ADR-0005`), or a run id — or is deleted when the surrounding sentence already states the rule. Measurements survive only as the citation (the spec holds the numbers); named hosts become "a host"; JJ rulings become the spec/ADR that recorded them; version numbers are dropped or become the spec that shipped the change. (AC-20260902-03-1) | Brief § Result: one rule, stated once — a comment or rule note cites an owner id in one line. |
| D3 | **Gotchas entries collapse.** Every entry in `.claude/rules/spec-pipeline.md` § Gotchas becomes `- \`[host]\|[plugin]\` <rule, mechanism included, no narration class> (<one citation>)` — one bullet, continuation lines allowed, no dates, no version numbers, no "caught at review", no recurrence counts, no retraction stories. The two class-slug entries (`orchestrator-compensation-during-live-worker`, `synthetic-repro-presented-as-real`) keep their slug and grep-answerable reopen condition. Entry count is unchanged (13; `prose-cap.js` cap 15 stays green). The section's header comment gets sibling 04 D1's grammar sentence verbatim. (AC-20260902-03-1) | Brief § Scope 2; workers read this section as hard context — every loaded line costs context and the history is in the cited specs. |
| D4 | **Seven contract-phrased lines are reworded, not exempted**: `spec/commands/status.md` (`queue-orphan` → "points at a brief file that does not exist"), `git/commands/enter-worktree.md` ×2 ("the origin is no longer" → "the origin stops being"; "would no longer find" → "cannot find"), `git/commands/merge.md` ("no longer exists" → "is already gone"), `spec/commands/replay.md` ("the original review" → "the reviewed run"), `spec/commands/doctor.md` ("valid history, no longer written" → "valid history; v7 rows carry structured fields"), `spec/commands/release.md` (`v0.4.0` example → `milestone-4`). (AC-20260902-03-1) | Sibling 01 A2: an exemption grammar is a hole; seven rewordings cost nothing. |
| D5 | **Doctrine pins move with the prose.** Any test under `tests/` whose assertion quotes a sentence this sweep rewrites is updated in place and retagged `AC-20260902-03-2` (`SHALL CONTINUE TO`), never weakened, never deleted; the lock-time collision sweep (Rationale) lists the files. `§` citations are never edited (only surrounding narration), so `citations-check.js` stays at zero MISS. (AC-20260902-03-2, AC-20260902-03-3) | Host § Gotchas: a retired literal is asserted where the File Plan never looked. |
| D6 | **Read-load budgets shrink or hold.** No command file grows; `init.md` + `shared-for init` stays ≤ 970 (969 today) and every other command ≤ 500. (AC-20260902-03-4) | `tests/consistency/read-load.test.js` is the pin; a sweep that only deletes cannot break it, and the AC makes that a promise. |
| D7 | **Baseline shrinks** to exactly `{"spec/templates/grounding-contract.md": 2}` (the count observed at planning; the test author sets it at Phase 1 so the standing test goes red first). (AC-20260902-03-1) | 01 D6; 04 deletes the file. |
| D9 | **Baseline count follows the scan (A2):** the contract file scans at 3 prose findings at build (planning counted 2; sibling 02 committed the baseline at 3), so D7's target is `{"spec/templates/grounding-contract.md": 3}` — the scan is authoritative for the count, D1 still forbids this spec from touching that file. (AC-20260902-03-1) | A2: the real scan wins over the planning count; sibling 04 deletes the baseline anyway. |
| D8 | `spec/.claude-plugin/plugin.json`: version bump target 7.57.2 (next free if taken); changelog paragraph names the prose sweep and the Gotchas collapse (last-3 form). `[no-ac: manifest — pinned by tests/consistency/plugin-version.test.js]` | Host § Planning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/*.md | MODIFY | doctrine | D2/D4: narrated lines rewritten or deleted; `§` citations untouched |
| spec/doctrine/*.md | MODIFY | doctrine | D2: core.md (§ Tiers measurement, § Feedback Loop stories), genesis.md, design.md, replay-corpus.md lines |
| spec/agents/*.md | MODIFY | doctrine | D2: reviewer.md measured-example parenthetical |
| spec/templates/spec.md | MODIFY | doctrine | D2: Behavior section's ruling parenthetical |
| git/commands/*.md | MODIFY | doctrine | D2/D4: enter-worktree.md, merge.md |
| .claude/rules/spec-pipeline.md | MODIFY | other | D3: 13 Gotchas entries collapsed; header comment grammar |
| .claude/comment-narration.baseline.json | MODIFY | tests | D7/D9: reduced to the contract entry (test author, Phase 1 — a test fixture, so red-check exempts it from pre-image purity) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: 7.57.2 + changelog paragraph |
| tests/consistency/comment-narration-live.test.js | MODIFY | tests | AC-20260902-03-1 retag in place |
| tests/consistency/read-load.test.js | MODIFY | tests | AC-20260902-03-4 tag in place on the existing budget test |
| tests/consistency/citations-check.test.js | MODIFY | tests | AC-20260902-03-3 tag in place on the zero-MISS live pin |

Orchestrator duty (outside the table): after the lock-time collision sweep names the
doctrine-pin tests that quote rewritten sentences, add each as its own `tests/…` MODIFY row
(D5) before build; none were found at lock beyond the three above (Rationale).

## Behavior

- The doctrine worker's loop mirrors sibling 02: per file, read the finding lines, rewrite
  per D2, re-scan, move on at zero. Gotchas entries are rewritten one at a time against the
  spec they cite; the spec is the source for the rule's wording when the entry's own text is
  mostly story.
- `spec/templates/grounding-contract.md` is skipped even though the scan reports it — the
  baseline entry admits exactly its two lines.
- Frontmatter `description:` lines are prose and in scope (`queue.md`'s "JJ's intended work
  order" → "the user's intended work order").

## Acceptance Criteria

- **AC-20260902-03-1**: WHEN the suite runs THE SYSTEM SHALL observe the plugin scan exit 0 with the tracked baseline equal to `{"spec/templates/grounding-contract.md": 3}` (D9; every other prose-group path reports zero findings) → the standing test in tests/consistency/comment-narration-live.test.js, retagged
- **AC-20260902-03-2**: WHEN a doctrine-pin test quotes a sentence this sweep rewrites THE SYSTEM SHALL CONTINUE TO pass that test with its assertion updated in place to the rewritten sentence (tag in the affected test file; none identified at lock — see Rationale)
- **AC-20260902-03-3**: WHEN `citations-check.js` runs after the sweep THE SYSTEM SHALL CONTINUE TO report zero MISS lines (`node spec/scripts/citations-check.js --root .` → exit 0, no `MISS`) → the live pin in tests/consistency/citations-check.test.js, tagged
- **AC-20260902-03-4**: WHEN the read-load budget test runs after the sweep THE SYSTEM SHALL CONTINUE TO observe every command within its cap or ratchet (`init` ≤ 970, all others ≤ 500) → tests/consistency/read-load.test.js, tagged

## Assumptions (escalation triggers)

- A1: Sibling 02 is `done`; the baseline holds only prose-group paths. — **if false:** STOP; run sibling 02 first.
- A2: The 64 prose findings measured at planning (by file: spec-pipeline.md 37, replay.md 6, core.md 5, genesis.md 3, doctor.md 2, init.md 2, enter-worktree.md 3, replay-corpus.md 2, grounding-contract.md 2, one each in escape.md, plan.md, queue.md, release.md, status.md, design.md, reviewer.md, spec.md, merge.md) are the whole worklist. — **if false** (the real scan differs): the scan is authoritative; the worklist is whatever it prints.
- A3: No test quotes a rewritten narrated sentence as a string literal — the lock-time collision sweep over the narrated stems found only the three tests rows above. — **if false:** D5 applies; add the row and retag.
- A4: Every `§` citation survives because workers edit around it. — **if false:** AC-20260902-03-3 reddens at build; repair the citation, never the check.

## Rationale

The prose sweep is separate from the code sweep because its acceptance is different: there
is no byte-identity oracle for doctrine, so the pins are citation integrity, read-load, and
the doctrine-shape tests. The Gotchas collapse is the largest single change and the one most
likely to feel lossy: each entry today is a paragraph of evidence, and the rule says the
evidence lives in the cited spec. The mechanism survives (workers still learn *what* to do
and *why* in one sentence); what goes is the story of how it was discovered, which no worker
acts on. Reworded contract phrases (D4) are cheaper than an exemption list and keep the
scanner's grammar decidable. Version numbers in Gotchas (`6.50.0 was taken`) become the rule
("the spec's literal bump target is a target, not a pin") plus the citation.

Rejected: leaving `.claude/rules/spec-pipeline.md` for sibling 04 (it is this repo's rules
layer and the brief's sweep scope names `.claude/rules`); exempting doctrine measurements
(the number is in the spec; the doctrine sentence needs only the conclusion).

Regression pins: AC-2, AC-3, AC-4 are the `SHALL CONTINUE TO` pins on the three surfaces a
prose edit can break — doctrine-shape tests, citations, read load.

Collision closure at lock (literals `queue-orphan`, `no longer exists`, `JJ ruling`,
`UpWell`, `Aug 2026`, `the original review`, `v0.4.0`, `no longer written`, `2026-08-27`,
`JJ-confirmed`): 80 hits — 14 planned by the glob rows (status.md ×2, init.md, replay.md
×2, release.md, doctor.md, core.md ×2, genesis.md ×2, replay-corpus.md, merge.md, spec.md)
and 66 waived: 36 under `tests/` are assert messages and test names (executable strings,
never doctrine pins — verified by grep: none quotes a rewritten sentence), 15 under `docs/`
are records by design, 14 are code comments sibling 02 already swept, and
`spec/templates/grounding-contract.md` belongs to sibling 04. Every doctrine-pin test that
reads live doctrine (`design-doctrine`, `genesis-doctrine`, `citations-check`,
`doctrine-pins`, `release-legs/doctrine`) pins headings and rule sentences that carry no
narration class, so D5 expects zero in-place retags; the AC-2 pin exists for the case the
sweep finds one anyway.

## Canonical Delta

`docs/canonical/doctrine-governance.md` gains a bullet: **Doctrine cites owners, never
history** — command, doctrine, agent, template, and rules prose states the rule plus one
owner id (spec path, AC-ID, D-number, ADR, run id); dates, people, hosts, versions, and
prior-behavior narration belong to specs, ledgers, and ADRs, and `comment-narration.js`
refuses them in the suite.
