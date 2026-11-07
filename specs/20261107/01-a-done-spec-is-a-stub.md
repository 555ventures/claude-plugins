---
date: 2026-11-07
status: hardened
area: run
depends_on: [specs/20261107/03-this-repos-size-check-counts-bytes.md, specs/20261107/04-the-gate-keeps-every-cited-criterion.md, specs/20261107/05-a-finished-brief-closes-itself.md]
brief: n/a
architecture: true
breaking: false
---

# A done spec is a stub; history holds its text

## Intent
- You asked: Do you really need to keep track of decisions all the time? Why do you keep them? Why can you not stop them from piling up — done and superseded specs become stubs at merge, the sweep is its own trunk commit, a fix hydrates the worktree copy from git, a one-time sweep removes the `[retired:]` tags, and the prose that sends the planner and the reviewer to old spec bodies goes.
- I will build:
  - One owner of the stub shape, `spec/scripts/lib/stub.js`: a done or superseded spec on disk is its frontmatter plus `text: <sha>` and `acs: [ids]`, its title and its `## Goal`; the rest is `git show <sha>:<path>`.
  - The sweep: `lib/land.js`, the one landing path for `/spec:run` and fanout lanes, stubs every finished spec right after the merge and commits only those paths as one `chore(spec): stub …` commit on trunk.
  - A fix on a stub reads the full text from `text:` for its builder and reviewer briefs; it still writes no spec file (20261107/02 D5).
  - Every machine reader keeps working on a stub: brief state, gates, queue, status, doctor, fanout, and `plan.js lock`'s pin coverage (which reads `acs:`).
  - The prose that sends `/spec:plan` step 1 to done specs and the reviewer to earlier specs' criteria goes; the contract docs describe the stub.
- I will not touch:
  - Draft, hardened and implementing specs, and the rule that a build edits no spec but its own status line.
  - Frontmatter semantics: every key keeps its meaning and a stub keeps all of them (ADR-0041 §3: a spec's state is its frontmatter).
  - What a build or merge commit holds, and the gated-tree rule (20261107/02 D1): the landed commit is the tree the gate passed; the stub commit follows it.
  - The queue, run sidecars, briefs, ADRs, `docs/canonical/` (v7 canon), `/spec:migrate` and in-place runs (they merge nothing, so they stub nothing).
- Users will notice: `specs/` shrinks from ~8.3 MB of spec text to frontmatter-and-goal stubs; a finished spec's Decisions, File Plan and ACs are one `git show` away; one `chore(spec): stub …` commit follows each merge that leaves a finished spec unstubbed.
- You lose: a finished spec's full text in the working tree (history keeps it).
- Architecture or behaviour change: yes — what a spec file holds after it is done changes from the whole record to a pointer into history; confirmed 2026-11-07, recorded as ADR-0046 (no accepted ADR is overturned)
- Client sign-off: when existing finished specs shrink — automatically at the next merge in every project; new ADR-0046 — yes; one doctrine sentence — yes; breaking — no

## Preparation

Readers of a done spec after the v8 rewrite (20261107/02): `lib/work.js` `readSpecs`/`readBriefs`/`gateWhy`, `fanout.js` `eligible` (status, `depends_on`, `prototype:`, title), `lib/queue.js` status reads, `lib/next.js`, `status.js`, `doctor.js`, `lib/state.js` `specsCiting` and `lib/land.js` — frontmatter only. Body readers: `plan.js` `pinCoverage` (the `(pin pN)` text of every citing spec's ACs) and a fix on a done spec, where `run.js` `docOf` builds `S.fixDoc(symptom, readSpec(spec))` from its Decisions and Assumptions and the `unmet` mark reads the same two sections. Sibling 04 D2 already accepts an `acs:` line as defining an AC. No test reads this repo's real `specs/`.

This repo: 322 specs, 305 done and 12 superseded, median 24 KB; 439 `[retired: …]` tags in 95 finished specs, nothing writes them any more. After `git.mergeBack`, the main checkout's HEAD (the landed sha under ff-only, merge-commit and squash) holds the full text of every finished spec not yet a stub, the landed one included. Tests that read trunk's head after a landing move by one commit: run.test.js `main^{tree}` against the gate tree, `main^2`, and fanout.test.js `landed as` against `rev-parse main` and the fix lane's `no spec file written` diff. `depends_on`: 03 lifts run.test.js's 500-line cap and run.js's 400-line cap (398 today), 04 edits run.js, plan.js, reviewer.md, plan.md and architecture.md too, and 05 adds its brief tick to the same spot in `land()` (its `readBriefs` reads only frontmatter, so it works on stubs).

## Goal

A finished spec stops being a 24 KB file nothing reads: at the merge it becomes a stub that keeps what the pipeline derives from (frontmatter, title, goal, AC ids) and a `text:` sha for the rest, in its own trunk commit. A fix on it reads the full text from history. The first sweep stubs this repo's 317 finished specs and with them the `[retired:]` tags; the planner and the reviewer are no longer sent to old spec bodies.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | New `spec/scripts/lib/stub.js` (no CLI): `isStub(frontmatter)` (a `text:` of 7–64 hex), `stubOf(text, sha)`, `fullText(cwd, rel, sha)`, `readFull(cwd, rel)` (the `readSpec` shape of the full text, stub or not), `sweep(root, {dry})`. A stub is the original frontmatter block verbatim with `text: <sha>` and `acs: [...]` set (replaced when present), a blank line, the `# ` title line, a blank line and the `## Goal` section verbatim (none when absent). `acs:` lists every `- **AC-…**` id in order with its `(pin pN)` cites (`AC-20261105-14-3 (pin p2)`), `[]` when none. | The frontmatter is what every reader derives state from (ADR-0041 §3); the Goal is the sentence a person needs; the ids keep `git grep AC-…` and 04's criteria check working; the cites keep `plan.js lock` honest without history. One owner, like `lib/queue.js` (ADR-0042). |
| D2 | `text:` is the main checkout's HEAD after the merge, read before the stub commit. `fullText` runs `git show <sha>:<rel>` in `cwd` (a worktree shares the object store); a sha the clone lacks is a refusal, exit 2: `<rel> names text <sha>, not in this clone — git fetch --unshallow, then re-run`. | The merge result holds the full text under every `mergeStrategy`; trunk history is never rewritten here. |
| D3 | `sweep(root)` walks `specs/**/*.md` (not `.run/`); each spec with `status` `done` or `superseded` that is not a stub, is tracked and has no uncommitted change gets `stubOf(text, HEAD)`; then `git add -- <paths>` and `git commit -q --no-verify -m <subject> -- <paths>`. Subject: `chore(spec): stub <id>` for one spec, `chore(spec): stub <n> specs` for more, never containing `done`. Nothing to stub commits nothing; a failed commit restores those paths and never fails the landing. `{dry: true}` returns the paths and their `[retired:` count and writes nothing. | Idempotent, and never folds a user's edit or an untracked draft into a machine commit; path-limited commits are how `plan.js lock` commits. fanout.test.js pins that a fix lane makes no commit ending in `done`. |
| D4 | `lib/land.js` `land()` calls `stub.sweep(main)` once `mergeBack` has merged, before the worktree is removed; an in-place run (`o.inPlace`) sweeps nothing. `landed` stays the merge sha; `run.js` and `fanout.js` gain no sweep code. The stub commit is not gated: the landed commit is the gated tree, the stub commit changes only finished spec text, and the next landing gates it. | `land()` is the one landing path (20261107/02 D1) and FINISH and `finalize` are gone. Gating it would miss the gate cache at every landing for spec text no test reads (A1); sweeping inside the branch would put every stubbed spec into the run's diff, which `specEdits` reverts. |
| D5 | The sweep covers every finished spec not yet a stub, so this repo's 317 are stubbed by the first merge after this spec lands and every host by its next merge, in one `chore(spec): stub N specs` commit; `/spec:migrate` gains no step. ADR-0046. [asked: existing specs shrink automatically at the next merge, in every project — not via /spec:migrate] | The one-time sweep is the first sweep: no command to remember (ADR-0045 §6), one shape everywhere, lossless through `git show`. |
| D6 | A fix on a stub: `run.js` `docOf` passes `stub.readFull(wt, state.spec)` to `S.fixDoc`, and the `unmet` mark reads Decisions and Assumptions through `docOf` instead of `st.readSpec`. Nothing writes the spec; `specEdits` compares a stub at the base with the same stub in the worktree, unchanged. Replaces the draft's hydrated copy, `state.hydrated`, `baseSpecText` and its reviewer line. | 20261107/02 D5 and D7 made a fix write no spec file, so "hydrate the worktree copy" is now an in-memory read: the briefs and the guard see the full Decisions and nothing lands in the fix diff. |
| D7 | `plan.js` `pinCoverage` cites `(pin pN)` from a citing spec's body ACs, or, when it is a stub, from its frontmatter `acs:` entries. `lib/spec.js` `fmScalar` already reads `[AC-x-1, AC-x-2 (pin p3)]` as a list. | The lock's coverage rule (ADR-0043) must see a done citing spec's pins without reading history. |
| D8 | Prose: `spec/commands/plan.md` step 1 reads "Read the brief and its specs that are not done yet (a finished spec's text is `git show <text>:<path>`), then `ls docs/adr` …". `spec/agents/reviewer.md`'s sentence ends at "is `blocking`." (", even when the criterion belongs to an earlier spec" goes). `spec/doctrine.md` § Files gains: "A done or superseded spec is a stub (frontmatter, title, goal, `text: <sha>`); `git show <sha>:<path>` prints its text." `docs/v8/interface-contract.md` §6 and `docs/v8/architecture.md` (§2 `specs/…` row, §4 MERGE row, §11 lib list) describe the stub, `text:`, `acs:` and the sweep commit. | A planner cannot read bodies that are gone; 04's GATE check (ADR-0048) now keeps an earlier spec's cited criterion, which a reviewer could only judge from that spec's text. The contract docs are what builders read (ADR-0037). |
| D9 | Readers that need no change are pinned on stub fixtures: `work.readSpecs`/`readBriefs`/`gateWhy`, fanout `eligible`, the queue's status reads, `status.js --json` (`filePlan` `[]`), `doctor.js`, `specsCiting`, `writeStatus`. | They read only the frontmatter and title, which the stub keeps; a test proves it. |
| D10 | Tests: new `tests/stub.test.js` (D1–D3, D7, D9); run.test.js and fanout.test.js read a landing as the landed sha (`landed as`, or `main~1` under a stub commit) where they read trunk's head, and assert the stub commit touches only finished spec paths. A changed test keeps every AC-ID it cites and adds this spec's. No test is deleted. | The behaviour those tests pin moved by one commit; keeping their cites keeps 04's check and the AC-20261107-02-2 guarantee whole. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/stub.js | CREATE | `isStub`, `stubOf`, `fullText`, `readFull`, `sweep` (D1–D3, D5) |
| spec/scripts/lib/land.js | MODIFY | sweep after the merge, none in place (D4) |
| spec/scripts/run.js | MODIFY | `docOf` and `unmet` read a stub's full text (D6) |
| spec/scripts/plan.js | MODIFY | `pinCoverage` cites from `acs:` on a stub (D7) |
| spec/commands/plan.md + spec/agents/reviewer.md + spec/doctrine.md | MODIFY | D8 |
| docs/v8/interface-contract.md + docs/v8/architecture.md | MODIFY | D8 |
| tests/stub.test.js | CREATE | AC-1 to AC-4, AC-8 |
| tests/run.test.js + tests/fanout.test.js | MODIFY | AC-5 to AC-7 (D10) |
| tests/plan.test.js | MODIFY | AC-10 |

## Acceptance Criteria

- **AC-20261107-01-1**: WHEN `stubOf` is given a done spec's text and a sha THE SYSTEM SHALL return its frontmatter verbatim plus `text: <sha>` and `acs: [<every AC id in order, each with its (pin pN) cites>]`, the title line and the `## Goal` section, and nothing else; and `stubOf(stubOf(t, s), s2)` SHALL equal `stubOf(t, s2)` except for `text:`.
- **AC-20261107-01-2**: WHEN `sweep(root)` runs in a repo holding a done spec, a superseded spec, a hardened spec, a done spec with an uncommitted edit and an untracked done spec THE SYSTEM SHALL rewrite only the first two, commit only those two paths as `chore(spec): stub 2 specs` with the pre-sweep HEAD as each `text:`, leave the others byte-identical and uncommitted, and a second `sweep(root)` SHALL commit nothing.
- **AC-20261107-01-3**: WHEN `fullText` or `readFull` reads a stub THE SYSTEM SHALL return the full text committed at its `text:` sha (from the main checkout and from a linked worktree); and WHEN the sha is not in the clone THE SYSTEM SHALL refuse (exit 2) naming the path and the sha.
- **AC-20261107-01-4**: WHEN a stubbed done spec is read by `work.readSpecs`, `readBriefs`, `gateWhy`, fanout `eligible`, `status.js --json`, `doctor.js` and `specsCiting` THE SYSTEM SHALL report the same status, brief state, dependencies, gate verdicts and `prototype:` as for its full text (`filePlan` `[]`); a brief whose members are all stubs SHALL read `done`.
- **AC-20261107-01-5**: WHEN `/spec:fix <stub> "<symptom>"` runs in place and as a fanout lane THE SYSTEM SHALL put the Decisions and Assumptions of the text at `text:` into the builder and reviewer briefs, accept `unmet --decision D1`, report no spec edit, and commit `fix(<id>): <symptom>` with no spec file in it; and WHEN `/spec:run` is given a done stub THE SYSTEM SHALL refuse `already done` as today.
- **AC-20261107-01-6**: WHEN `/spec:run` lands a spec under ff-only, merge-commit and squash THE SYSTEM SHALL leave the landed sha's tree equal to the tree the last gate passed, `HEAD` a `chore(spec): stub <id>` whose parent is the landed sha and whose diff touches only finished spec files, the spec a stub with `text:` that sha, and `git status --porcelain` empty; and WHEN the run is `--in-place` THE SYSTEM SHALL make no stub commit.
- **AC-20261107-01-7**: WHEN fanout lands a spec lane and then a bound fix lane on a done spec THE SYSTEM SHALL print `landed as <merge sha>` for each and follow it with a `chore(spec): stub …` commit naming that sha in `text:`, make no commit ending in `done` for the fix lane, and WHEN a rebased tree is red THE SYSTEM SHALL make no stub commit.
- **AC-20261107-01-8**: WHEN `sweep(root, {dry: true})` runs on this repo at build time THE SYSTEM SHALL list every done and superseded spec (317 at plan time) and count the `[retired:` tags they carry (439); the builder records both numbers in `specs/20261107/01-a-done-spec-is-a-stub.run/evidence.md`; and WHEN fixture specs carrying `[retired:` tags are swept THE SYSTEM SHALL leave `grep -rl "\[retired:" specs/` with zero hits.
- **AC-20261107-01-9**: WHEN `grep -rn "specs already marked" spec/commands/plan.md` and `grep -rn "belongs to an earlier spec" spec/agents/reviewer.md` run THE SYSTEM SHALL return zero hits, and `spec/doctrine.md`, `docs/v8/interface-contract.md` and `docs/v8/architecture.md` SHALL each name `text:` beside `git show`.
- **AC-20261107-01-10**: WHEN `plan.js lock` runs on a `prototype:` spec whose only cover for pin `p3` is an earlier done citing spec that is now a stub with `acs: [AC-X-01-2 (pin p3)]` THE SYSTEM SHALL lock, and WHEN that stub's `acs:` lacks the cite THE SYSTEM SHALL refuse naming `p3`.

## Assumptions

- A1: No host test reads `specs/**` text, so an ungated stub commit changes no gate result — if false: that host's next landing gate goes red on the stubs, which `/spec:fix` repairs; the landed commit itself was gated.
- A2: Every host's trunk history is complete where a fix on a stub runs — if false: D2's refusal names the fetch; nothing is read from a missing object.
- A3: `[retired:` tags appear only in finished specs here (95 files, all done or superseded) — if false: a tag in an unfinished spec stays until that spec is done and stubbed.
- A4: A fix is the only build that reads a done spec's body — if false (a later command that does): it reads through `stub.readFull`, never through `st.readSpec`.
